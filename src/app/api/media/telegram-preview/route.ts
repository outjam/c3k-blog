import { NextResponse } from "next/server";

import { telegramBotRequest } from "@/lib/server/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TelegramFileInfo {
  file_path?: string;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const sanitizeInlineFileName = (value: string): string => {
  return (
    value
      .trim()
      .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "demo-preview.mp3"
  );
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fileId = normalizeText(url.searchParams.get("fileId"), 1024);
  const format = normalizeText(url.searchParams.get("format"), 16).toLowerCase();
  const fileName = sanitizeInlineFileName(normalizeText(url.searchParams.get("name"), 180));
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!fileId || !botToken) {
    return NextResponse.json({ error: "Preview source is unavailable." }, { status: 400 });
  }

  if (format && format !== "mp3") {
    return NextResponse.json({ error: "Only MP3 demo previews are supported." }, { status: 400 });
  }

  const fileInfo = await telegramBotRequest<TelegramFileInfo>("getFile", { file_id: fileId });
  const filePath = normalizeText(fileInfo.result?.file_path, 2048);

  if (!fileInfo.ok || !filePath) {
    return NextResponse.json({ error: "Preview file not found." }, { status: 404 });
  }

  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
    method: "GET",
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ error: "Preview file download failed." }, { status: 502 });
  }

  const bytes = await response.arrayBuffer();

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "content-disposition": `inline; filename="${fileName.endsWith(".mp3") ? fileName : `${fileName}.mp3`}"`,
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
