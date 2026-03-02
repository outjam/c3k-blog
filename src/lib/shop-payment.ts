import { getTelegramWebApp, hapticNotification } from "@/lib/telegram";

export interface PaymentRequest {
  amountStars: number;
  amountRub: number;
  orderId: string;
}

export const payWithTelegramStars = async ({ amountStars, orderId }: PaymentRequest): Promise<boolean> => {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    hapticNotification("success");
    return true;
  }

  return new Promise((resolve) => {
    if (webApp.openInvoice) {
      const mockInvoiceUrl = `https://t.me/invoice/${encodeURIComponent(orderId)}?stars=${amountStars}`;
      try {
        webApp.openInvoice(mockInvoiceUrl, (status) => {
          const success = status === "paid" || status === "pending";
          hapticNotification(success ? "success" : "warning");
          resolve(success);
        });
        return;
      } catch {
        // Fallback below.
      }
    }

    webApp.showPopup?.(
      {
        title: "Оплата Telegram Stars",
        message: `Симуляция оплаты ${amountStars} ⭐ за заказ ${orderId}.`,
        buttons: [
          { id: "paid", type: "default", text: "Оплачено" },
          { id: "cancel", type: "cancel", text: "Отмена" },
        ],
      },
      (buttonId) => {
        const success = buttonId === "paid";
        hapticNotification(success ? "success" : "warning");
        resolve(success);
      },
    );

    if (!webApp.showPopup) {
      webApp.showAlert?.(`Симуляция оплаты ${amountStars} ⭐ за заказ ${orderId}`);
      hapticNotification("success");
      resolve(true);
    }
  });
};
