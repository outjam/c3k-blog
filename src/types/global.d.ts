declare global {
  interface Window {
    Telegram?: {
      WebApp?: import("@/types/telegram").TelegramWebApp;
    };
    c3kDesktop?: {
      ping?: () => Promise<{ ok: boolean }>;
      runtime?: () => Promise<unknown>;
      setTheme?: (theme: import("@/lib/app-theme").AppTheme) => Promise<{ ok: boolean }>;
    };
  }
}

export {};
