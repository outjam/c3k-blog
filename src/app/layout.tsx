import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";

import { AppFrame } from "@/components/app-frame";
import { GlobalPlayerProvider } from "@/components/player/global-player-provider";
import { ScrollPositionManager } from "@/components/scroll-position-manager";
import { TelegramMiniAppProvider } from "@/components/telegram-mini-app-provider";

import "./globals.scss";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "Culture3k Social Music",
  description: "Социальная сеть для артистов и покупателей релизов в формате Telegram Mini App",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={manrope.variable}>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramMiniAppProvider>
          <ScrollPositionManager />
          <GlobalPlayerProvider>
            <AppFrame>{children}</AppFrame>
          </GlobalPlayerProvider>
        </TelegramMiniAppProvider>
      </body>
    </html>
  );
}
