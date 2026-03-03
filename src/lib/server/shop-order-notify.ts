import { getShopAdminTelegramIds } from "@/lib/shop-admin";
import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { sendTelegramMessage } from "@/lib/server/telegram-bot";
import type { ShopOrder, ShopOrderStatus } from "@/types/shop";

const STARS_EMOJI_ID = "6028338546736107668";

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

const orderItemsList = (order: ShopOrder): string => {
  const items = order.items.slice(0, 6).map((item) => `∙ ${escapeHtml(item.title)} × ${item.quantity}`);

  if (order.items.length > 6) {
    items.push(`∙ И ещё ${order.items.length - 6} товар(ов)`);
  }

  return items.join("\n");
};

export const notifyAdminsAboutNewOrder = async (order: ShopOrder, miniAppBaseUrl: string | null): Promise<void> => {
  const adminIds = getShopAdminTelegramIds();
  const shopUrl = miniAppBaseUrl ? `${miniAppBaseUrl}/profile?section=orders&admin=1` : undefined;

  const text =
    `<b>Новый заказ № ${escapeHtml(order.id)}</b>\n` +
    `Покупатель: ${escapeHtml(order.customerName || "Без имени")} (${order.telegramUserId})\n` +
    `Статус: ${SHOP_ORDER_STATUS_LABELS[order.status]}\n\n` +
    `${orderItemsList(order)}\n\n` +
    `${formatStarsCents(order.totalStarsCents)} <tg-emoji emoji-id="${STARS_EMOJI_ID}">⭐</tg-emoji>`;

  await Promise.all(
    adminIds.map((adminId) =>
      sendTelegramMessage(adminId, text, {
        parseMode: "HTML",
        buttons: shopUrl
          ? [[{ text: "Открыть админку", web_app: { url: shopUrl }, style: "primary", icon_custom_emoji_id: STARS_EMOJI_ID }]]
          : undefined,
      }),
    ),
  );
};

export const notifyUserAboutStatusChange = async (
  order: ShopOrder,
  previousStatus: ShopOrderStatus,
  miniAppBaseUrl: string | null,
  note?: string,
): Promise<void> => {
  const profileUrl = miniAppBaseUrl ? `${miniAppBaseUrl}/profile?section=orders&order=${encodeURIComponent(order.id)}` : undefined;
  const noteLine = note?.trim() ? `\nКомментарий: ${escapeHtml(note.trim())}` : "";

  const text =
    `<b>Заказ № ${escapeHtml(order.id)}</b>\n` +
    `Статус: ${SHOP_ORDER_STATUS_LABELS[previousStatus]} → ${SHOP_ORDER_STATUS_LABELS[order.status]}` +
    `${noteLine}`;

  await sendTelegramMessage(order.telegramUserId, text, {
    parseMode: "HTML",
    buttons: profileUrl ? [[{ text: "Профиль", web_app: { url: profileUrl }, style: "primary" }]] : undefined,
  });
};

export const notifyAdminsAboutStatusChange = async (
  order: ShopOrder,
  previousStatus: ShopOrderStatus,
  changedByTelegramId: number,
  note?: string,
): Promise<void> => {
  const adminIds = getShopAdminTelegramIds();
  const noteLine = note?.trim() ? `\nКомментарий: ${escapeHtml(note.trim())}` : "";
  const text =
    `<b>Обновлён заказ № ${escapeHtml(order.id)}</b>\n` +
    `Статус: ${SHOP_ORDER_STATUS_LABELS[previousStatus]} → ${SHOP_ORDER_STATUS_LABELS[order.status]}\n` +
    `Админ: ${changedByTelegramId}` +
    `${noteLine}`;

  await Promise.all(
    adminIds.map((adminId) =>
      sendTelegramMessage(adminId, text, {
        parseMode: "HTML",
      }),
    ),
  );
};
