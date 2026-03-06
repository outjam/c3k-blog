import { getTelegramWebApp, hapticNotification } from "@/lib/telegram";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";

export interface PaymentRequest {
  amountStars: number;
  orderId: string;
  title: string;
  description: string;
  productIds: string[];
}

export interface WalletTopupRequest {
  amountStars: number;
  title?: string;
  description?: string;
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
  productIds,
}: Pick<PaymentRequest, "amountStars" | "orderId" | "title" | "description" | "productIds">): Promise<{ link: string | null; error?: string }> => {
  try {
    const idempotencyKey = `stars-invoice:${orderId.trim().toUpperCase()}`;

    const response = await fetch("/api/telegram/stars-invoice", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({
        amountStars,
        orderId,
        title,
        description,
        productIds,
      }),
    });

    const payload = (await response.json()) as { invoiceLink?: string; error?: string };

    if (!response.ok) {
      return { link: null, error: payload.error ?? "Ошибка запроса к серверу оплаты." };
    }

    return {
      link: typeof payload.invoiceLink === "string" ? payload.invoiceLink : null,
      error: payload.error,
    };
  } catch {
    return { link: null, error: "Сетевая ошибка при создании invoice." };
  }
};

const requestWalletTopupInvoiceLink = async ({
  amountStars,
  title,
  description,
}: WalletTopupRequest): Promise<{ link: string | null; error?: string }> => {
  try {
    const idempotencyKey = `stars-wallet-topup:${Math.max(1, Math.round(amountStars))}:${Date.now()}`;

    const response = await fetch("/api/wallet/topup/invoice", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({
        amountStars,
        title,
        description,
      }),
    });

    const payload = (await response.json()) as { invoiceLink?: string; error?: string };

    if (!response.ok) {
      return { link: null, error: payload.error ?? "Ошибка запроса к серверу оплаты." };
    }

    return {
      link: typeof payload.invoiceLink === "string" ? payload.invoiceLink : null,
      error: payload.error,
    };
  } catch {
    return { link: null, error: "Сетевая ошибка при создании invoice." };
  }
};

export const payWithTelegramStars = async ({
  amountStars,
  orderId,
  title,
  description,
  productIds,
}: PaymentRequest): Promise<PaymentResult> => {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    return { ok: false, status: "error", message: "Оплата доступна только в Telegram." };
  }

  if (!webApp.openInvoice) {
    webApp.showAlert?.("Обновите Telegram, чтобы открыть оплату Telegram Stars.");
    return { ok: false, status: "error", message: "Текущая версия Telegram не поддерживает оплату." };
  }

  const invoice = await requestInvoiceLink({ amountStars, orderId, title, description, productIds });
  const invoiceLink = invoice.link;

  if (!invoiceLink) {
    webApp.showPopup?.(
      {
        title: "Ошибка оплаты",
        message: invoice.error ?? "Не удалось создать счет Telegram Stars. Проверьте серверные ключи оплаты.",
        buttons: [{ id: "ok", type: "ok", text: "Понятно" }],
      },
    );
    return { ok: false, status: "error", message: invoice.error ?? "Не удалось создать счет оплаты." };
  }

  return new Promise((resolve) => {
    try {
      webApp.openInvoice?.(invoiceLink, (status) => {
        const success = status === "paid" || status === "pending";
        hapticNotification(success ? "success" : "warning");
        resolve({
          ok: success,
          status,
          message: success ? "Платеж отправлен, ожидаем подтверждение." : "Платеж не завершен.",
        });
      });
    } catch {
      webApp.showAlert?.("Не удалось открыть окно оплаты.");
      hapticNotification("warning");
      resolve({ ok: false, status: "error", message: "Не удалось открыть окно оплаты." });
    }
  });
};

export const topUpWalletWithTelegramStars = async ({
  amountStars,
  title = "Пополнение внутреннего баланса",
  description = "Пополнение баланса для покупки релизов и донатов внутри приложения.",
}: WalletTopupRequest): Promise<PaymentResult> => {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    return { ok: false, status: "error", message: "Пополнение доступно только внутри Telegram Mini App." };
  }

  if (!webApp.openInvoice) {
    webApp.showAlert?.("Обновите Telegram, чтобы открыть оплату Telegram Stars.");
    return { ok: false, status: "error", message: "Текущая версия Telegram не поддерживает оплату." };
  }

  const invoice = await requestWalletTopupInvoiceLink({
    amountStars: Math.max(1, Math.round(amountStars)),
    title,
    description,
  });
  const invoiceLink = invoice.link;

  if (!invoiceLink) {
    webApp.showPopup?.({
      title: "Ошибка пополнения",
      message: invoice.error ?? "Не удалось создать счет Telegram Stars для пополнения баланса.",
      buttons: [{ id: "ok", type: "ok", text: "Понятно" }],
    });

    return { ok: false, status: "error", message: invoice.error ?? "Не удалось создать счет пополнения." };
  }

  return new Promise((resolve) => {
    try {
      webApp.openInvoice?.(invoiceLink, (status) => {
        const success = status === "paid" || status === "pending";
        hapticNotification(success ? "success" : "warning");
        resolve({
          ok: success,
          status,
          message: success ? "Пополнение отправлено, ожидаем подтверждение." : "Пополнение не завершено.",
        });
      });
    } catch {
      webApp.showAlert?.("Не удалось открыть окно оплаты.");
      hapticNotification("warning");
      resolve({ ok: false, status: "error", message: "Не удалось открыть окно оплаты." });
    }
  });
};
