declare global {
  interface Window {
    Telegram?: {
      WebApp?: import("@/types/telegram").TelegramWebApp;
      Login?: {
        auth: (
          options: {
            client_id: number;
            request_access?: Array<"phone" | "write">;
            lang?: string;
          },
          callback: (payload: {
            id_token?: string;
            user?: {
              id?: number;
              name?: string;
              preferred_username?: string;
              picture?: string;
              phone_number?: string;
            };
            error?: string;
          }) => void,
        ) => void;
      };
    };
    c3kDesktop?: {
      ping?: () => Promise<{ ok: boolean }>;
      runtime?: () => Promise<unknown>;
      setTheme?: (theme: import("@/lib/app-theme").AppTheme) => Promise<{ ok: boolean }>;
      startTelegramAuth?: () => Promise<{ ok: boolean; authUrl?: string }>;
    };
  }
}

export {};
