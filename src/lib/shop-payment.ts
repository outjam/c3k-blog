import { getTelegramWebApp, hapticNotification } from "@/lib/telegram";

export interface PaymentRequest {
  amountStars: number;
  orderId: string;
  title: string;
  description: string;
}

export interface PaymentResult {
  ok: boolean;
  status: "paid" | "cancelled" | "failed" | "pending" | "error";
  message?: string;
}

const requestInvoiceLink = async ({
  amountStars,
  orderId,
  title,
  description,
}: Pick<PaymentRequest, "amountStars" | "orderId" | "title" | "description">): Promise<string | null> => {
  try {
    const response = await fetch("/api/telegram/stars-invoice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amountStars,
        orderId,
        title,
        description,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { invoiceLink?: string };
    return typeof payload.invoiceLink === "string" ? payload.invoiceLink : null;
  } catch {
    return null;
  }
};

export const payWithTelegramStars = async ({
  amountStars,
  orderId,
  title,
  description,
}: PaymentRequest): Promise<PaymentResult> => {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    return { ok: false, status: "error", message: "Оплата доступна только в Telegram." };
  }

  if (!webApp.openInvoice) {
    webApp.showAlert?.("Обновите Telegram, чтобы открыть оплату Telegram Stars.");
    return { ok: false, status: "error", message: "Текущая версия Telegram не поддерживает оплату." };
  }

  const invoiceLink = await requestInvoiceLink({ amountStars, orderId, title, description });

  if (!invoiceLink) {
    webApp.showPopup?.(
      {
        title: "Ошибка оплаты",
        message: "Не удалось создать счет Telegram Stars. Проверьте серверные ключи оплаты.",
        buttons: [{ id: "ok", type: "ok", text: "Понятно" }],
      },
    );
    return { ok: false, status: "error", message: "Не удалось создать счет оплаты." };
  }

  return new Promise((resolve) => {
    try {
      webApp.openInvoice?.(invoiceLink, (status) => {
        const success = status === "paid" || status === "pending";
        hapticNotification(success ? "success" : "warning");
        resolve({
          ok: success,
          status,
          message: success ? "Оплата принята." : "Платеж не завершен.",
        });
      });
    } catch {
      webApp.showAlert?.("Не удалось открыть окно оплаты.");
      hapticNotification("warning");
      resolve({ ok: false, status: "error", message: "Не удалось открыть окно оплаты." });
    }
  });
};
