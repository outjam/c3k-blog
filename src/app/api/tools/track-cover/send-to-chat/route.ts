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

  const baseUrl = resolvePublicBaseUrl(request);
  const toolsUrl = baseUrl ? `${baseUrl}/tools/track-cover` : undefined;

  const coverCaption = [`Выбранная обложка`, `${artist} — ${title}`].join("\n");

  const sendCover = await telegramBotRequest("sendPhoto", {
    chat_id: auth.telegramUserId,
    photo: coverUrl,
    caption: coverCaption,
  });

  const sendAudio = await telegramBotRequest("sendAudio", {
    chat_id: auth.telegramUserId,
    audio: audioFileId,
    title,
    performer: artist,
    caption: "Готово. Этот трек можно добавить в профиль вручную.",
    ...(toolsUrl
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: "Открыть инструмент", web_app: { url: toolsUrl } }]],
          },
        }
      : {}),
  });

  if (!sendAudio.ok) {
    return NextResponse.json(
      { error: sendAudio.description ?? "Failed to send audio to Telegram chat" },
      { status: 502 },
    );
  }

  await telegramBotRequest("sendMessage", {
    chat_id: auth.telegramUserId,
    text:
      "Трек отправлен. Чтобы добавить в профиль: откройте трек в чате бота, затем выберите добавление в профиль.",
  });

  return NextResponse.json({
    ok: true,
    sentCover: Boolean(sendCover.ok),
    sentAudio: true,
    query,
  });
}
