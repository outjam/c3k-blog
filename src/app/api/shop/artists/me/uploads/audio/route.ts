import { NextResponse } from "next/server";

import { getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import type { ArtistAudioFormat } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UploadKind = "master" | "preview";

interface TelegramMultipartResponse {
  ok: boolean;
  description?: string;
  result?: {
    document?: {
      file_id?: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
    };
  };
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const sanitizeFileName = (value: string, fallback: string): string => {
  const normalized = value
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);

  return normalized || fallback;
};

const inferAudioFormat = (fileName: string, mimeType: string): ArtistAudioFormat | null => {
  const normalizedName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (normalizedName.endsWith(".mp3") || normalizedMime.includes("mpeg")) {
    return "mp3";
  }

  if (normalizedName.endsWith(".ogg") || normalizedName.endsWith(".oga") || normalizedMime.includes("ogg")) {
    return "ogg";
  }

  if (normalizedName.endsWith(".wav") || normalizedName.endsWith(".wave") || normalizedMime.includes("wav")) {
    return "wav";
  }

  if (normalizedName.endsWith(".flac") || normalizedMime.includes("flac")) {
    return "flac";
  }

  if (
    normalizedName.endsWith(".aac") ||
    normalizedName.endsWith(".m4a") ||
    normalizedMime.includes("aac") ||
    normalizedMime.includes("mp4")
  ) {
    return "aac";
  }

  if (normalizedName.endsWith(".alac")) {
    return "alac";
  }

  return null;
};

const sendTelegramDocumentMultipart = async (formData: FormData): Promise<TelegramMultipartResponse> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    return { ok: false, description: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, description: `HTTP ${response.status}` };
    }

    return (await response.json()) as TelegramMultipartResponse;
  } catch {
    return { ok: false, description: "Network error" };
  }
};

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const kind = normalizeText(formData.get("kind"), 16) as UploadKind;
  const file = formData.get("file");

  if (kind !== "master" && kind !== "preview") {
    return NextResponse.json({ error: "kind must be master or preview" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const fileName = sanitizeFileName(file.name || "", kind === "preview" ? "demo-preview.mp3" : "release-master");
  const mimeType = normalizeText(file.type, 160) || "application/octet-stream";
  const detectedFormat = inferAudioFormat(fileName, mimeType);

  if (!detectedFormat) {
    return NextResponse.json(
      { error: "Поддерживаются только mp3, ogg, wav, flac, aac/m4a и alac." },
      { status: 400 },
    );
  }

  if (kind === "preview" && detectedFormat !== "mp3") {
    return NextResponse.json(
      { error: "Демо-файл для релиза должен быть только в MP3." },
      { status: 400 },
    );
  }

  const telegramForm = new FormData();
  telegramForm.append("chat_id", String(auth.telegramUserId));
  telegramForm.append("disable_notification", "true");
  telegramForm.append("caption", kind === "preview" ? "C3K demo preview upload" : "C3K release master upload");
  telegramForm.append("document", file, fileName);

  const uploaded = await sendTelegramDocumentMultipart(telegramForm);

  if (!uploaded.ok) {
    return NextResponse.json(
      { error: uploaded.description ?? "Failed to upload file to Telegram." },
      { status: 502 },
    );
  }

  const fileId = normalizeText(uploaded.result?.document?.file_id, 1024);
  if (!fileId) {
    return NextResponse.json({ error: "Telegram did not return a file_id." }, { status: 502 });
  }

  const previewUrl =
    kind === "preview"
      ? `/api/media/telegram-preview?fileId=${encodeURIComponent(fileId)}&format=mp3&name=${encodeURIComponent(fileName)}`
      : undefined;

  return NextResponse.json({
    ok: true,
    upload: {
      kind,
      fileId,
      fileName,
      mimeType,
      detectedFormat,
      sizeBytes: file.size,
      previewUrl,
    },
  });
}
