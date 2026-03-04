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

const stripHtmlToPlainText = (value: string): string => {
  const normalized = value
    .replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");

  return normalized.replace(/\n{3,}/g, "\n\n").trim();
};

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

  try {
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
  } catch {
    return { ok: false, description: "Network error" };
  }
};

const telegramBotMultipartRequest = async <T = unknown>(
  method: string,
  formData: FormData,
): Promise<TelegramApiResponse<T>> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return { ok: false, description: "Missing TELEGRAM_BOT_TOKEN" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      body: formData,
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, description: `HTTP ${response.status}` };
    }

    return (await response.json()) as TelegramApiResponse<T>;
  } catch {
    return { ok: false, description: "Network error" };
  }
};

export const sendTelegramMessage = async (
  chatId: number,
  text: string,
  options?: TelegramMessageOptions,
): Promise<boolean> => {
  const buttons = options?.buttons && options.buttons.length > 0 ? options.buttons : undefined;
  const plainText =
    options?.parseMode === "HTML"
      ? stripHtmlToPlainText(text) || "Статус заказа обновлён."
      : text || "Статус заказа обновлён.";

  const buildPayload = (params: {
    useParseMode: boolean;
    useEffect: boolean;
    useButtons: boolean;
    useEnhancedButtons: boolean;
    usePlainText: boolean;
  }): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: params.usePlainText ? plainText : text,
    };

    if (params.useParseMode && options?.parseMode) {
      payload.parse_mode = options.parseMode;
    }

    if (typeof options?.disableWebPagePreview === "boolean") {
      payload.disable_web_page_preview = options.disableWebPagePreview;
    }

    if (params.useEffect && options?.messageEffectId?.trim()) {
      payload.message_effect_id = options.messageEffectId.trim();
    }

    if (params.useButtons && buttons) {
      payload.reply_markup = {
        inline_keyboard: toInlineKeyboard(buttons, params.useEnhancedButtons),
      };
    }

    return payload;
  };

  const variants: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  const pushVariant = (payload: Record<string, unknown>) => {
    const key = JSON.stringify(payload);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    variants.push(payload);
  };

  if (buttons) {
    pushVariant(
      buildPayload({
        useParseMode: true,
        useEffect: true,
        useButtons: true,
        useEnhancedButtons: true,
        usePlainText: false,
      }),
    );
    pushVariant(
      buildPayload({
        useParseMode: true,
        useEffect: true,
        useButtons: true,
        useEnhancedButtons: false,
        usePlainText: false,
      }),
    );
    pushVariant(
      buildPayload({
        useParseMode: true,
        useEffect: false,
        useButtons: true,
        useEnhancedButtons: false,
        usePlainText: false,
      }),
    );
    pushVariant(
      buildPayload({
        useParseMode: false,
        useEffect: false,
        useButtons: true,
        useEnhancedButtons: false,
        usePlainText: true,
      }),
    );
    pushVariant(
      buildPayload({
        useParseMode: false,
        useEffect: false,
        useButtons: false,
        useEnhancedButtons: false,
        usePlainText: true,
      }),
    );
  } else {
    pushVariant(
      buildPayload({
        useParseMode: true,
        useEffect: true,
        useButtons: false,
        useEnhancedButtons: false,
        usePlainText: false,
      }),
    );
    pushVariant(
      buildPayload({
        useParseMode: true,
        useEffect: false,
        useButtons: false,
        useEnhancedButtons: false,
        usePlainText: false,
      }),
    );
    pushVariant(
      buildPayload({
        useParseMode: false,
        useEffect: false,
        useButtons: false,
        useEnhancedButtons: false,
        usePlainText: true,
      }),
    );
  }

  for (const payload of variants) {
    const result = await telegramBotRequest("sendMessage", payload);

    if (result.ok) {
      return true;
    }
  }

  return false;
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

  const captionPlain =
    options?.parseMode === "HTML" && options.caption ? stripHtmlToPlainText(options.caption) : options?.caption;

  const buildForm = (params: {
    withEnhancements: boolean;
    useParseMode: boolean;
    useButtons: boolean;
    usePlainCaption: boolean;
  }): FormData => {
    const formData = new FormData();
    formData.append("chat_id", String(chatId));

    const caption = params.usePlainCaption ? captionPlain : options?.caption;

    if (caption) {
      formData.append("caption", caption);
    }

    if (params.useParseMode && options?.parseMode) {
      formData.append("parse_mode", options.parseMode);
    }

    if (params.useButtons && options?.buttons && options.buttons.length > 0) {
      formData.append(
        "reply_markup",
        JSON.stringify({
          inline_keyboard: toInlineKeyboard(options.buttons, params.withEnhancements),
        }),
      );
    }

    formData.append("document", new Blob([bytes.buffer], { type: mimeType }), fileName);
    return formData;
  };

  const variants: FormData[] = [];
  const buttons = options?.buttons && options.buttons.length > 0;

  if (buttons) {
    variants.push(
      buildForm({
        withEnhancements: true,
        useParseMode: true,
        useButtons: true,
        usePlainCaption: false,
      }),
    );
    variants.push(
      buildForm({
        withEnhancements: false,
        useParseMode: true,
        useButtons: true,
        usePlainCaption: false,
      }),
    );
    variants.push(
      buildForm({
        withEnhancements: false,
        useParseMode: false,
        useButtons: true,
        usePlainCaption: true,
      }),
    );
    variants.push(
      buildForm({
        withEnhancements: false,
        useParseMode: false,
        useButtons: false,
        usePlainCaption: true,
      }),
    );
  } else {
    variants.push(
      buildForm({
        withEnhancements: false,
        useParseMode: true,
        useButtons: false,
        usePlainCaption: false,
      }),
    );
    variants.push(
      buildForm({
        withEnhancements: false,
        useParseMode: false,
        useButtons: false,
        usePlainCaption: true,
      }),
    );
  }

  for (const formData of variants) {
    const result = await telegramBotMultipartRequest("sendDocument", formData);

    if (result.ok) {
      return true;
    }
  }

  return false;
};
