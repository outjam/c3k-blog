import { NextResponse } from "next/server";

import { getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { telegramBotRequest } from "@/lib/server/telegram-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramBotApiAudio {
  file_id: string;
  file_unique_id: string;
  duration?: number;
  performer?: string;
  title?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
}

interface UserProfileAudiosResult {
  total_count?: number;
  audios?: TelegramBotApiAudio[];
  first_profile_audio?: TelegramBotApiAudio;
}

interface TelegramFileInfo {
  file_path?: string;
}

const normalizeTrackTitle = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const isSameAudio = (a: TelegramBotApiAudio, b: TelegramBotApiAudio): boolean => {
  return (
    (a.file_unique_id || a.file_id) === (b.file_unique_id || b.file_id) &&
    (a.title ?? "") === (b.title ?? "") &&
    (a.performer ?? "") === (b.performer ?? "") &&
    Number(a.duration ?? 0) === Number(b.duration ?? 0)
  );
};

const detectImageMime = (bytes: Uint8Array): string => {
  if (bytes.byteLength >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }

  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.byteLength >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return "image/jpeg";
};

const fetchTelegramFileBytes = async (botToken: string, filePath: string): Promise<Uint8Array | null> => {
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

const getThumbnailDataUrl = async (botToken: string, fileId: string): Promise<string | undefined> => {
  const fileInfo = await telegramBotRequest<TelegramFileInfo>("getFile", { file_id: fileId });

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    return undefined;
  }

  const bytes = await fetchTelegramFileBytes(botToken, fileInfo.result.file_path);

  if (!bytes || bytes.byteLength > 220 * 1024) {
    return undefined;
  }

  const mimeType = detectImageMime(bytes);
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${mimeType};base64,${base64}`;
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!botToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const url = new URL(request.url);
  const clientLimit = Math.max(1, Math.min(120, Math.round(Number(url.searchParams.get("limit") ?? 50))));
  let offset = Math.max(0, Math.round(Number(url.searchParams.get("offset") ?? 0)));
  const pageLimit = Math.max(1, Math.min(100, clientLimit));

  const accumulated: TelegramBotApiAudio[] = [];
  let firstProfileAudio: TelegramBotApiAudio | undefined;
  let totalCount = 0;

  for (let page = 0; page < 8; page += 1) {
    const response = await telegramBotRequest<UserProfileAudiosResult>("getUserProfileAudios", {
      user_id: auth.telegramUserId,
      offset,
      limit: pageLimit,
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
    if (!firstProfileAudio && payload?.first_profile_audio) {
      firstProfileAudio = payload.first_profile_audio;
    }

    totalCount = Math.max(totalCount, Number(payload?.total_count ?? 0));

    const pageAudios = Array.isArray(payload?.audios) ? payload.audios : [];
    if (pageAudios.length === 0) {
      break;
    }

    accumulated.push(...pageAudios);
    offset += pageAudios.length;

    if (accumulated.length >= clientLimit) {
      break;
    }

    if (totalCount > 0 && accumulated.length >= totalCount) {
      break;
    }
  }

  const mergedAudios = firstProfileAudio ? [firstProfileAudio, ...accumulated] : accumulated;
  const uniqueAudios: TelegramBotApiAudio[] = [];

  for (const audio of mergedAudios) {
    const exists = uniqueAudios.some((existing) => isSameAudio(existing, audio));
    if (!exists) {
      uniqueAudios.push(audio);
    }
  }

  const targetAudios = uniqueAudios.slice(0, clientLimit);

  const items = await Promise.all(
    targetAudios.map(async (audio, index) => {
      const artist = normalizeTrackTitle(audio.performer ?? "", "Unknown artist");
      const title = normalizeTrackTitle(audio.title ?? "", audio.file_name ?? "Untitled track");
      const stableIdBase = audio.file_unique_id || audio.file_id || "audio";
      const artworkDataUrl =
        audio.thumbnail?.file_id ? await getThumbnailDataUrl(botToken, audio.thumbnail.file_id) : undefined;

      return {
        id: `${stableIdBase}-${index}`,
        fileId: audio.file_id,
        title,
        artist,
        durationSec: Math.max(0, Math.round(Number(audio.duration ?? 0))),
        fileName: audio.file_name ?? "",
        mimeType: audio.mime_type ?? "",
        fileSize: Math.max(0, Math.round(Number(audio.file_size ?? 0))),
        searchQuery: `${artist} ${title}`.trim(),
        artworkDataUrl,
      };
    }),
  );

  return NextResponse.json({
    totalCount: Math.max(Number(totalCount || items.length), items.length),
    items,
  });
}
