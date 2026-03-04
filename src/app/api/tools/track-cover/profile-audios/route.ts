import { NextResponse } from "next/server";

import { getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { telegramBotRequest } from "@/lib/server/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TelegramBotApiAudio {
  file_id: string;
  file_unique_id: string;
  duration?: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

interface UserProfileAudiosResult {
  total_count?: number;
  audios?: TelegramBotApiAudio[];
}

const normalizeTrackTitle = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Math.round(Number(url.searchParams.get("limit") ?? 50))));
  const offset = Math.max(0, Math.round(Number(url.searchParams.get("offset") ?? 0)));

  const response = await telegramBotRequest<UserProfileAudiosResult>("getUserProfileAudios", {
    user_id: auth.telegramUserId,
    offset,
    limit,
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error: response.description ?? "Telegram Bot API getUserProfileAudios failed",
      },
      { status: 502 },
    );
  }

  const payload = response.result;
  const audios = Array.isArray(payload?.audios) ? payload.audios : [];

  const items = audios.map((audio, index) => {
    const artist = normalizeTrackTitle(audio.performer ?? "", "Unknown artist");
    const title = normalizeTrackTitle(audio.title ?? "", audio.file_name ?? "Untitled track");

    return {
      id: `${audio.file_unique_id || audio.file_id || "audio"}-${index}`,
      fileId: audio.file_id,
      title,
      artist,
      durationSec: Math.max(0, Math.round(Number(audio.duration ?? 0))),
      fileName: audio.file_name ?? "",
      mimeType: audio.mime_type ?? "",
      fileSize: Math.max(0, Math.round(Number(audio.file_size ?? 0))),
      searchQuery: `${artist} ${title}`.trim(),
    };
  });

  return NextResponse.json({
    totalCount: Math.max(Number(payload?.total_count ?? items.length), items.length),
    items,
  });
}
