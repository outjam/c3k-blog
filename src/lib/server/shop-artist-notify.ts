import { getShopAdminTelegramIds } from "@/lib/shop-admin";
import { enqueueTelegramMessageNotification } from "@/lib/server/telegram-notification-queue";
import type { ArtistApplication, ArtistPayoutRequest, ArtistProfile } from "@/types/shop";

const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

const formatStarsCents = (value: number): string => {
  const normalized = Math.max(0, Math.round(value));
  const major = Math.floor(normalized / 100);
  const minor = normalized % 100;

  if (minor === 0) {
    return new Intl.NumberFormat("ru-RU").format(major);
  }

  return `${new Intl.NumberFormat("ru-RU").format(major)}.${String(minor).padStart(2, "0")}`;
};

const adminArtistsUrl = (miniAppBaseUrl: string | null): string | undefined => {
  if (!miniAppBaseUrl) {
    return undefined;
  }

  return `${miniAppBaseUrl}/admin/artists`;
};

const studioUrl = (miniAppBaseUrl: string | null): string | undefined => {
  if (!miniAppBaseUrl) {
    return undefined;
  }

  return `${miniAppBaseUrl}/studio`;
};

export const notifyAdminsAboutArtistApplication = async (
  application: ArtistApplication,
  miniAppBaseUrl: string | null,
): Promise<void> => {
  const adminIds = getShopAdminTelegramIds();
  const openUrl = adminArtistsUrl(miniAppBaseUrl);
  const text =
    `<b>Новая заявка на артиста</b>\n` +
    `Пользователь: ${application.telegramUserId}\n` +
    `Имя артиста: ${escapeHtml(application.displayName)}\n` +
    `TON: ${escapeHtml(application.tonWalletAddress || "не указан")}\n` +
    `Статус: ${escapeHtml(application.status)}`;

  await Promise.all(
    adminIds.map((adminId) =>
      enqueueTelegramMessageNotification({
        chatId: adminId,
        text,
        options: {
          parseMode: "HTML",
          buttons: openUrl
            ? [[{ text: "Открыть модерацию", web_app: { url: openUrl }, style: "primary" }]]
            : undefined,
        },
        dedupeKey: `artist-application:${application.id}:${adminId}:${application.updatedAt}`,
      }),
    ),
  );
};

export const notifyUserAboutArtistApplicationStatus = async (
  application: ArtistApplication,
  profile: ArtistProfile | null,
  miniAppBaseUrl: string | null,
): Promise<void> => {
  const statusLabel =
    application.status === "approved"
      ? "одобрена"
      : application.status === "rejected"
        ? "отклонена"
        : application.status === "needs_info"
          ? "требует уточнений"
          : "принята в обработку";

  const noteLine = application.moderationNote?.trim()
    ? `\nКомментарий: ${escapeHtml(application.moderationNote.trim())}`
    : "";
  const text =
    `<b>Заявка артиста ${statusLabel}</b>\n` +
    `Имя артиста: ${escapeHtml(application.displayName)}` +
    noteLine;

  await enqueueTelegramMessageNotification({
    chatId: application.telegramUserId,
    text,
    options: {
      parseMode: "HTML",
      buttons:
        application.status === "approved" && profile && miniAppBaseUrl
          ? [[{ text: "Открыть студию", web_app: { url: studioUrl(miniAppBaseUrl)! }, style: "primary" }]]
          : undefined,
    },
    dedupeKey: `artist-application-user:${application.id}:${application.status}:${application.updatedAt}`,
  });
};

export const notifyAdminsAboutArtistPayoutRequest = async (
  request: ArtistPayoutRequest,
  artist: ArtistProfile | null,
  miniAppBaseUrl: string | null,
): Promise<void> => {
  const adminIds = getShopAdminTelegramIds();
  const openUrl = adminArtistsUrl(miniAppBaseUrl);
  const text =
    `<b>Новый запрос на вывод</b>\n` +
    `Артист: ${escapeHtml(artist?.displayName || `#${request.artistTelegramUserId}`)}\n` +
    `Сумма: ${escapeHtml(formatStarsCents(request.amountStarsCents))} STARS\n` +
    `TON: ${escapeHtml(request.tonWalletAddress)}`;

  await Promise.all(
    adminIds.map((adminId) =>
      enqueueTelegramMessageNotification({
        chatId: adminId,
        text,
        options: {
          parseMode: "HTML",
          buttons: openUrl
            ? [[{ text: "Открыть выплаты", web_app: { url: openUrl }, style: "primary" }]]
            : undefined,
        },
        dedupeKey: `artist-payout:${request.id}:${adminId}:${request.updatedAt}`,
      }),
    ),
  );
};

export const notifyUserAboutArtistPayoutStatus = async (
  request: ArtistPayoutRequest,
  miniAppBaseUrl: string | null,
): Promise<void> => {
  const statusLabel =
    request.status === "approved"
      ? "одобрена"
      : request.status === "rejected"
        ? "отклонена"
        : request.status === "paid"
          ? "отмечена как выплаченная"
          : "создана";
  const noteLine = request.adminNote?.trim()
    ? `\nКомментарий: ${escapeHtml(request.adminNote.trim())}`
    : "";
  const text =
    `<b>Заявка на вывод ${statusLabel}</b>\n` +
    `Сумма: ${escapeHtml(formatStarsCents(request.amountStarsCents))} STARS` +
    noteLine;

  await enqueueTelegramMessageNotification({
    chatId: request.artistTelegramUserId,
    text,
    options: {
      parseMode: "HTML",
      buttons: miniAppBaseUrl
        ? [[{ text: "Открыть студию", web_app: { url: studioUrl(miniAppBaseUrl)! }, style: "primary" }]]
        : undefined,
    },
    dedupeKey: `artist-payout-user:${request.id}:${request.status}:${request.updatedAt}`,
  });
};
