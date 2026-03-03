import type { ShopOrderStatus } from "@/types/shop";

export const SHOP_ORDER_STATUS_LABELS: Record<ShopOrderStatus, string> = {
  awaiting_payment: "Ожидает оплату",
  payment_pending: "Оплата подтверждается",
  paid: "Оплачен",
  processing: "В обработке",
  confirmed: "Подтверждён",
  packed: "Упакован",
  ready_to_ship: "Готов к отправке",
  shipped: "Отправлен",
  in_transit: "В пути",
  out_for_delivery: "Передан в доставку",
  delivered: "Доставлен",
  completed: "Завершён",
  cancel_requested: "Запрошена отмена",
  cancelled_by_user: "Отменён пользователем",
  cancelled_by_admin: "Отменён администратором",
  refund_requested: "Запрошен возврат",
  refunded: "Возврат выполнен",
  payment_failed: "Ошибка оплаты",
  failed: "Ошибка заказа",
};

export const SHOP_ORDER_STATUS_TRANSITIONS: Record<ShopOrderStatus, ShopOrderStatus[]> = {
  awaiting_payment: ["payment_pending", "paid", "payment_failed", "failed", "cancelled_by_user", "cancelled_by_admin"],
  payment_pending: ["paid", "payment_failed", "failed", "cancelled_by_admin"],
  paid: ["processing", "confirmed", "refund_requested", "cancel_requested", "cancelled_by_admin"],
  processing: ["confirmed", "packed", "cancel_requested", "refund_requested", "cancelled_by_admin", "failed"],
  confirmed: ["packed", "ready_to_ship", "cancel_requested", "refund_requested", "cancelled_by_admin", "failed"],
  packed: ["ready_to_ship", "shipped", "cancel_requested", "refund_requested", "cancelled_by_admin", "failed"],
  ready_to_ship: ["shipped", "cancel_requested", "refund_requested", "cancelled_by_admin", "failed"],
  shipped: ["in_transit", "out_for_delivery", "delivered", "refund_requested", "failed"],
  in_transit: ["out_for_delivery", "delivered", "refund_requested", "failed"],
  out_for_delivery: ["delivered", "refund_requested", "failed"],
  delivered: ["completed", "refund_requested", "failed"],
  completed: ["refund_requested"],
  cancel_requested: ["cancelled_by_user", "cancelled_by_admin", "processing", "confirmed", "failed"],
  cancelled_by_user: ["refund_requested", "refunded"],
  cancelled_by_admin: ["refund_requested", "refunded"],
  refund_requested: ["refunded", "failed"],
  refunded: [],
  payment_failed: ["awaiting_payment", "failed"],
  failed: ["processing", "confirmed", "cancelled_by_admin", "refund_requested"],
};

export const FINAL_ORDER_STATUSES = new Set<ShopOrderStatus>([
  "completed",
  "cancelled_by_user",
  "cancelled_by_admin",
  "refunded",
  "failed",
  "payment_failed",
]);

export const canTransitionShopOrderStatus = (from: ShopOrderStatus, to: ShopOrderStatus): boolean => {
  if (from === to) {
    return true;
  }

  return (SHOP_ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);
};
