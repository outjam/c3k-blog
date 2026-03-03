export interface TelegramInlineButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
  style?: "default" | "primary" | "success" | "destructive";
  icon_custom_emoji_id?: string;
}

export interface TelegramMessageOptions {
  parseMode?: "HTML" | "MarkdownV2";
  buttons?: TelegramInlineButton[][];
  disableWebPagePreview?: boolean;
  messageEffectId?: string;
}

export interface TelegramDocumentOptions {
  caption?: string;
  parseMode?: "HTML" | "MarkdownV2";
  buttons?: TelegramInlineButton[][];
  fileName?: string;
  mimeType?: string;
}

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

const toInlineKeyboard = (
  buttons: TelegramInlineButton[][],
  withEnhancements: boolean,
): Array<Array<Record<string, unknown>>> => {
  return buttons.map((row) =>
    row.map((button) => {
      const normalized: Record<string, unknown> = {
        text: button.text,
      };

      if (button.url) {
        normalized.url = button.url;
      }

      if (button.web_app) {
        normalized.web_app = button.web_app;
      }

      if (button.callback_data) {
        normalized.callback_data = button.callback_data;
      }

      if (withEnhancements && button.style) {
        normalized.style = button.style;
      }

      if (withEnhancements && button.icon_custom_emoji_id) {
        normalized.icon_custom_emoji_id = button.icon_custom_emoji_id;
      }

      return normalized;
    }),
  );
};

export const telegramBotRequest = async <T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return { ok: false, description: "Missing TELEGRAM_BOT_TOKEN" };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, description: `HTTP ${response.status}` };
  }

  return (await response.json()) as TelegramApiResponse<T>;
};

const telegramBotMultipartRequest = async <T = unknown>(
  method: string,
  formData: FormData,
): Promise<TelegramApiResponse<T>> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return { ok: false, description: "Missing TELEGRAM_BOT_TOKEN" };
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, description: `HTTP ${response.status}` };
  }

  return (await response.json()) as TelegramApiResponse<T>;
};

export const sendTelegramMessage = async (
  chatId: number,
  text: string,
  options?: TelegramMessageOptions,
): Promise<boolean> => {
  const basePayload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (options?.parseMode) {
    basePayload.parse_mode = options.parseMode;
  }

  if (typeof options?.disableWebPagePreview === "boolean") {
    basePayload.disable_web_page_preview = options.disableWebPagePreview;
  }

  if (options?.messageEffectId?.trim()) {
    basePayload.message_effect_id = options.messageEffectId.trim();
  }

  if (options?.buttons && options.buttons.length > 0) {
    const richPayload = {
      ...basePayload,
      reply_markup: {
        inline_keyboard: toInlineKeyboard(options.buttons, true),
      },
    };

    const richResult = await telegramBotRequest("sendMessage", richPayload);

    if (richResult.ok) {
      return true;
    }

    const fallbackPayload = {
      ...basePayload,
      reply_markup: {
        inline_keyboard: toInlineKeyboard(options.buttons, false),
      },
    };
    const fallbackResult = await telegramBotRequest("sendMessage", fallbackPayload);
    return fallbackResult.ok;
  }

  const result = await telegramBotRequest("sendMessage", basePayload);
  return result.ok;
};

export const sendTelegramDocument = async (
  chatId: number,
  content: string | Uint8Array,
  options?: TelegramDocumentOptions,
): Promise<boolean> => {
  const encoded = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const bytes = new Uint8Array(encoded.byteLength);
  bytes.set(encoded);
  const mimeType = options?.mimeType ?? "image/svg+xml";
  const fileName = options?.fileName ?? "attachment.svg";

  const buildForm = (withEnhancements: boolean): FormData => {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));

    if (options?.caption) {
      formData.append("caption", options.caption);
    }

    if (options?.parseMode) {
      formData.append("parse_mode", options.parseMode);
    }

    if (options?.buttons && options.buttons.length > 0) {
      formData.append(
        "reply_markup",
        JSON.stringify({
          inline_keyboard: toInlineKeyboard(options.buttons, withEnhancements),
        }),
      );
    }

    formData.append("document", new Blob([bytes.buffer], { type: mimeType }), fileName);
    return formData;
  };

  if (options?.buttons && options.buttons.length > 0) {
    const richResult = await telegramBotMultipartRequest("sendDocument", buildForm(true));

    if (richResult.ok) {
      return true;
    }

    const fallbackResult = await telegramBotMultipartRequest("sendDocument", buildForm(false));
    return fallbackResult.ok;
  }

  const result = await telegramBotMultipartRequest("sendDocument", buildForm(false));
  return result.ok;
};
