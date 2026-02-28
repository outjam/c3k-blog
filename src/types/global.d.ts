declare global {
  interface Window {
    Telegram?: {
      WebApp?: import("@/types/telegram").TelegramWebApp;
    };
  }
}

export {};
