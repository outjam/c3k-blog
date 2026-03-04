import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { telegramBotRequest } from "@/lib/server/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendToChatPayload {
  audioFileId?: string;
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

  const buildAudioForm = (withThumbnail: boolean): FormData => {
    const formData = new FormData();
    formData.append("chat_id", String(auth.telegramUserId));
    formData.append("audio", audioFileId);
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

    if (withThumbnail && coverThumb) {
      const thumbnailBuffer = new Uint8Array(coverThumb).buffer;
      formData.append("thumbnail", new Blob([thumbnailBuffer], { type: "image/jpeg" }), "cover.jpg");
    }

    return formData;
  };

  let coverApplied = false;
  let sendAudio = await sendAudioViaMultipart(botToken, buildAudioForm(true));

  if (sendAudio.ok) {
    coverApplied = Boolean(coverThumb);
  } else {
    sendAudio = await sendAudioViaMultipart(botToken, buildAudioForm(false));
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
    text: coverApplied
      ? "Трек отправлен с выбранной обложкой. Добавьте его в профиль вручную."
      : "Трек отправлен. Telegram не применил обложку к аудио, поэтому обложка отправлена отдельно.",
  });

  return NextResponse.json({
    ok: true,
    coverApplied,
    sentCover: Boolean(sendCover.ok),
    sentAudio: true,
    query,
  });
}
