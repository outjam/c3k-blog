import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { telegramBotRequest } from "@/lib/server/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendToChatPayload {
  audioFileId?: string;
  audioFileName?: string;
  audioMimeType?: string;
  title?: string;
  artist?: string;
  coverUrl?: string;
  query?: string;
}

const toSafeText = (value: string, max = 120): string => {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .slice(0, max);
};

const isValidCoverUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const toThumbCandidateUrl = (value: string, size: number): string => {
  return value
    .replace(/\/\d+x\d+bb\.(jpg|png)/i, `/${size}x${size}bb.jpg`)
    .replace(/\.png(\?|$)/i, ".jpg$1");
};

const downloadCoverThumbnail = async (coverUrl: string): Promise<Uint8Array | null> => {
  const sizes = [320, 300, 240, 200, 120];

  for (const size of sizes) {
    const url = toThumbCandidateUrl(coverUrl, size);

    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (bytes.byteLength === 0 || bytes.byteLength > 190 * 1024) {
        continue;
      }

      return bytes;
    } catch {
      continue;
    }
  }

  return null;
};

interface TelegramMethodResponse {
  ok: boolean;
  description?: string;
}

interface TelegramFileInfo {
  file_path?: string;
  file_size?: number;
}

const decodeSyncSafeInt = (bytes: Uint8Array, offset: number): number => {
  return (
    ((bytes[offset] ?? 0) & 0x7f) * 0x200000 +
    ((bytes[offset + 1] ?? 0) & 0x7f) * 0x4000 +
    ((bytes[offset + 2] ?? 0) & 0x7f) * 0x80 +
    ((bytes[offset + 3] ?? 0) & 0x7f)
  );
};

const encodeSyncSafeInt = (value: number): Uint8Array => {
  const safe = Math.max(0, Math.min(0x0fffffff, Math.floor(value)));
  return new Uint8Array([
    (safe >> 21) & 0x7f,
    (safe >> 14) & 0x7f,
    (safe >> 7) & 0x7f,
    safe & 0x7f,
  ]);
};

const encodeUint32BE = (value: number): Uint8Array => {
  const safe = Math.max(0, Math.min(0xffffffff, Math.floor(value)));
  return new Uint8Array([(safe >> 24) & 0xff, (safe >> 16) & 0xff, (safe >> 8) & 0xff, safe & 0xff]);
};

const concatBytes = (...chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};

const stripId3v2 = (audioBytes: Uint8Array): Uint8Array => {
  if (
    audioBytes.byteLength >= 10 &&
    audioBytes[0] === 0x49 &&
    audioBytes[1] === 0x44 &&
    audioBytes[2] === 0x33
  ) {
    const tagSize = decodeSyncSafeInt(audioBytes, 6);
    const totalTagSize = 10 + tagSize;

    if (totalTagSize > 10 && totalTagSize < audioBytes.byteLength) {
      return audioBytes.subarray(totalTagSize);
    }
  }

  return audioBytes;
};

const isLikelyMp3 = (audioBytes: Uint8Array, filePath = ""): boolean => {
  const normalizedPath = filePath.toLowerCase();

  if (normalizedPath.endsWith(".mp3")) {
    return true;
  }

  if (
    audioBytes.byteLength >= 3 &&
    audioBytes[0] === 0x49 &&
    audioBytes[1] === 0x44 &&
    audioBytes[2] === 0x33
  ) {
    return true;
  }

  const limit = Math.min(audioBytes.byteLength - 1, 4096);

  for (let i = 0; i < limit; i += 1) {
    if (audioBytes[i] === 0xff && (audioBytes[i + 1] & 0xe0) === 0xe0) {
      return true;
    }
  }

  return false;
};

const embedCoverIntoMp3 = (audioBytes: Uint8Array, jpegBytes: Uint8Array): Uint8Array => {
  const cleanAudio = stripId3v2(audioBytes);
  const encoder = new TextEncoder();

  const apicPayload = concatBytes(
    new Uint8Array([0x00]),
    encoder.encode("image/jpeg"),
    new Uint8Array([0x00, 0x03, 0x00]),
    jpegBytes,
  );

  const frameHeader = concatBytes(encoder.encode("APIC"), encodeUint32BE(apicPayload.byteLength), new Uint8Array([0x00, 0x00]));
  const frames = concatBytes(frameHeader, apicPayload);
  const tagHeader = concatBytes(
    encoder.encode("ID3"),
    new Uint8Array([0x03, 0x00, 0x00]),
    encodeSyncSafeInt(frames.byteLength),
  );

  return concatBytes(tagHeader, frames, cleanAudio);
};

const sanitizeAudioFileName = (input: string): string => {
  const normalized = input
    .trim()
    .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 80);

  if (!normalized) {
    return "track.mp3";
  }

  if (/\.(mp3|m4a|aac|ogg|flac|wav)$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}.mp3`;
};

const sendAudioViaMultipart = async (botToken: string, formData: FormData): Promise<TelegramMethodResponse> => {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, description: `HTTP ${response.status}` };
    }

    return (await response.json()) as TelegramMethodResponse;
  } catch {
    return { ok: false, description: "Network error" };
  }
};

const downloadTelegramFileBytes = async (botToken: string, filePath: string): Promise<Uint8Array | null> => {
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`, {
    method: "GET",
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > 0 ? bytes : null;
};

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);

  if (contentTypeError) {
    return contentTypeError;
  }

  const rate = await checkRateLimit({
    scope: "tools_track_cover_send_to_chat",
    identifier: auth.telegramUserId,
    limit: 16,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: SendToChatPayload;

  try {
    payload = (await request.json()) as SendToChatPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const audioFileId = String(payload.audioFileId ?? "").trim();
  const audioFileName = sanitizeAudioFileName(String(payload.audioFileName ?? ""));
  const audioMimeType = toSafeText(String(payload.audioMimeType ?? ""), 64).toLowerCase();
  const title = toSafeText(String(payload.title ?? ""), 120) || "Untitled track";
  const artist = toSafeText(String(payload.artist ?? ""), 120) || "Unknown artist";
  const coverUrl = String(payload.coverUrl ?? "").trim();
  const query = toSafeText(String(payload.query ?? ""), 140);

  if (!audioFileId) {
    return NextResponse.json({ error: "Missing audioFileId" }, { status: 400 });
  }

  if (!coverUrl || !isValidCoverUrl(coverUrl)) {
    return NextResponse.json({ error: "Invalid coverUrl" }, { status: 400 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const baseUrl = resolvePublicBaseUrl(request);
  const toolsUrl = baseUrl ? `${baseUrl}/tools/track-cover` : undefined;
  const coverThumb = await downloadCoverThumbnail(coverUrl);

  const coverCaption = [`Выбранная обложка`, `${artist} — ${title}`].join("\n");

  const buildAudioForm = (params: { withThumbnail: boolean; uploadedAudio?: Uint8Array }): FormData => {
    const formData = new FormData();
    formData.append("chat_id", String(auth.telegramUserId));
    if (params.uploadedAudio) {
      const uploadedBytes = new Uint8Array(params.uploadedAudio.byteLength);
      uploadedBytes.set(params.uploadedAudio);
      formData.append("audio", new Blob([uploadedBytes.buffer], { type: "audio/mpeg" }), audioFileName);
    } else {
      formData.append("audio", audioFileId);
    }
    formData.append("title", title);
    formData.append("performer", artist);
    formData.append("caption", "Готово. Этот трек можно добавить в профиль вручную.");

    if (toolsUrl) {
      formData.append(
        "reply_markup",
        JSON.stringify({
          inline_keyboard: [[{ text: "Открыть инструмент", web_app: { url: toolsUrl } }]],
        }),
      );
    }

    if (params.withThumbnail && coverThumb) {
      const thumbnailBuffer = new Uint8Array(coverThumb).buffer;
      formData.append("thumbnail", new Blob([thumbnailBuffer], { type: "image/jpeg" }), "cover.jpg");
    }

    return formData;
  };

  let coverApplied = false;
  let sendAudio: TelegramMethodResponse | null = null;
  let reuploadedAudio = false;

  const mp3FromMime = audioMimeType.includes("mpeg") || audioMimeType.includes("mp3");
  const canTryEmbed = Boolean(coverThumb) && (mp3FromMime || audioFileName.toLowerCase().endsWith(".mp3"));

  if (canTryEmbed && coverThumb) {
    const fileInfo = await telegramBotRequest<TelegramFileInfo>("getFile", { file_id: audioFileId });
    const filePath = fileInfo.result?.file_path ?? "";
    const downloadable = Boolean(fileInfo.ok && filePath);

    if (downloadable) {
      const sourceBytes = await downloadTelegramFileBytes(botToken, filePath);

      if (sourceBytes && isLikelyMp3(sourceBytes, filePath)) {
        const embeddedBytes = embedCoverIntoMp3(sourceBytes, coverThumb);
        sendAudio = await sendAudioViaMultipart(botToken, buildAudioForm({ withThumbnail: false, uploadedAudio: embeddedBytes }));

        if (sendAudio.ok) {
          coverApplied = true;
          reuploadedAudio = true;
        }
      }
    }
  }

  if (!sendAudio?.ok) {
    sendAudio = await sendAudioViaMultipart(botToken, buildAudioForm({ withThumbnail: true }));
  }

  if (sendAudio.ok) {
    coverApplied = coverApplied || (Boolean(coverThumb) && !reuploadedAudio);
  } else {
    sendAudio = await sendAudioViaMultipart(botToken, buildAudioForm({ withThumbnail: false }));
  }

  if (!sendAudio.ok) {
    return NextResponse.json(
      { error: sendAudio.description ?? "Failed to send audio to Telegram chat" },
      { status: 502 },
    );
  }

  const sendCover = await telegramBotRequest("sendPhoto", {
    chat_id: auth.telegramUserId,
    photo: coverUrl,
    caption: coverCaption,
  });

  await telegramBotRequest("sendMessage", {
    chat_id: auth.telegramUserId,
    text: reuploadedAudio
      ? "Трек пересобран и отправлен с новой обложкой. Добавьте его в профиль вручную."
      : coverApplied
        ? "Трек отправлен с выбранной обложкой. Добавьте его в профиль вручную."
        : "Трек отправлен. Telegram не применил обложку к аудио, поэтому обложка отправлена отдельно.",
  });

  return NextResponse.json({
    ok: true,
    coverApplied,
    reuploadedAudio,
    sentCover: Boolean(sendCover.ok),
    sentAudio: true,
    query,
  });
}
