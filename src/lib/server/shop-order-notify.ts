import { getShopAdminTelegramIds } from "@/lib/shop-admin";
import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { sendTelegramMessage, type TelegramInlineButton } from "@/lib/server/telegram-bot";
import type { ShopOrder, ShopOrderStatus } from "@/types/shop";

const STARS_EMOJI_ID = "6028338546736107668";
const OPEN_BUTTON_EMOJI_ID = "5920332557466997677";

const SUCCESS_STATUSES = new Set<ShopOrderStatus>(["paid", "delivered", "completed"]);
const NEGATIVE_STATUSES = new Set<ShopOrderStatus>([
  "cancel_requested",
  "cancelled_by_user",
  "cancelled_by_admin",
  "refund_requested",
  "refunded",
  "payment_failed",
  "failed",
]);

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

const getOrderButtonStyle = (status: ShopOrderStatus): TelegramInlineButton["style"] => {
  if (NEGATIVE_STATUSES.has(status)) {
    return "destructive";
  }

  if (SUCCESS_STATUSES.has(status)) {
    return "success";
  }

  return "primary";
};

const orderUrl = (miniAppBaseUrl: string | null, orderId: string, admin = false): string | undefined => {
  if (!miniAppBaseUrl) {
    return undefined;
  }

  const suffix = admin ? "?admin=1" : "";
  return `${miniAppBaseUrl}/orders/${encodeURIComponent(orderId)}${suffix}`;
};

const profileOrdersUrl = (miniAppBaseUrl: string | null, orderId?: string): string | undefined => {
  if (!miniAppBaseUrl) {
    return undefined;
  }

  const search = orderId ? `?section=orders&order=${encodeURIComponent(orderId)}` : "?section=orders";
  return `${miniAppBaseUrl}/profile${search}`;
};

const shopUrl = (miniAppBaseUrl: string | null): string | undefined => {
  if (!miniAppBaseUrl) {
    return undefined;
  }

  return `${miniAppBaseUrl}/shop`;
};

export const notifyAdminsAboutNewOrder = async (order: ShopOrder, miniAppBaseUrl: string | null): Promise<void> => {
  const adminIds = getShopAdminTelegramIds();
  const openOrderUrl = orderUrl(miniAppBaseUrl, order.id, true);
  const openShopUrl = shopUrl(miniAppBaseUrl);

  const text =
    `<b>Новый заказ № ${escapeHtml(order.id)}</b>\n` +
    `Покупатель: ${escapeHtml(order.customerName || "Без имени")} (${order.telegramUserId})\n` +
    `Статус: ${SHOP_ORDER_STATUS_LABELS[order.status]}\n\n` +
    `${orderItemsList(order)}\n\n` +
    `${formatStarsCents(order.totalStarsCents)} <tg-emoji emoji-id="${STARS_EMOJI_ID}">⭐</tg-emoji>`;

  const buttons: TelegramInlineButton[][] = [];

  if (openOrderUrl) {
    buttons.push([
      {
        text: "Открыть заказ",
        web_app: { url: openOrderUrl },
        style: "primary",
        icon_custom_emoji_id: OPEN_BUTTON_EMOJI_ID,
      },
    ]);
  }

  if (openShopUrl) {
    buttons.push([{ text: "Магазин", web_app: { url: openShopUrl }, style: "default" }]);
  }

  await Promise.all(
    adminIds.map((adminId) =>
      sendTelegramMessage(adminId, text, {
        parseMode: "HTML",
        buttons: buttons.length > 0 ? buttons : undefined,
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
  const openOrderUrl = orderUrl(miniAppBaseUrl, order.id);
  const openOrdersUrl = profileOrdersUrl(miniAppBaseUrl, order.id);
  const openShopUrl = shopUrl(miniAppBaseUrl);
  const noteLine = note?.trim() ? `\nКомментарий: ${escapeHtml(note.trim())}` : "";

  const text =
    `<b>Заказ № ${escapeHtml(order.id)}</b>\n` +
    `Статус: ${SHOP_ORDER_STATUS_LABELS[previousStatus]} → ${SHOP_ORDER_STATUS_LABELS[order.status]}` +
    `${noteLine}`;

  const buttons: TelegramInlineButton[][] = [];

  if (openOrderUrl) {
    buttons.push([
      {
        text: "Открыть заказ",
        web_app: { url: openOrderUrl },
        style: getOrderButtonStyle(order.status),
      },
    ]);
  }

  const secondRow: TelegramInlineButton[] = [];

  if (openOrdersUrl) {
    secondRow.push({ text: "Мои заказы", web_app: { url: openOrdersUrl }, style: "default" });
  }

  if (openShopUrl) {
    secondRow.push({ text: "Магазин", web_app: { url: openShopUrl }, style: "primary" });
  }

  if (secondRow.length > 0) {
    buttons.push(secondRow);
  }

  await sendTelegramMessage(order.telegramUserId, text, {
    parseMode: "HTML",
    buttons: buttons.length > 0 ? buttons : undefined,
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

