export interface TelegramInlineButton {
  text: string;
  url?: string;
  web_app?: { url: string };
  callback_data?: string;
  style?: "default" | "primary" | "success" | "destructive";
  icon_custom_emoji_id?: string;
}

interface TelegramMessageOptions {
  parseMode?: "HTML" | "MarkdownV2";
  buttons?: TelegramInlineButton[][];
  disableWebPagePreview?: boolean;
}

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

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

export const sendTelegramMessage = async (
  chatId: number,
  text: string,
  options?: TelegramMessageOptions,
): Promise<boolean> => {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (options?.parseMode) {
    payload.parse_mode = options.parseMode;
  }

  if (options?.buttons && options.buttons.length > 0) {
    payload.reply_markup = { inline_keyboard: options.buttons };
  }

  if (typeof options?.disableWebPagePreview === "boolean") {
    payload.disable_web_page_preview = options.disableWebPagePreview;
  }

  const result = await telegramBotRequest("sendMessage", payload);
  return result.ok;
};
