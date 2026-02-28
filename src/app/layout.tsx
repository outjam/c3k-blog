import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";

import { AppFrame } from "@/components/app-frame";
import { TelegramMiniAppProvider } from "@/components/telegram-mini-app-provider";

import "./globals.scss";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "C3K Blog Mini App",
  description: "Персональный блог в формате Telegram Mini App на Next.js",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={manrope.variable}>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramMiniAppProvider>
          <AppFrame>{children}</AppFrame>
        </TelegramMiniAppProvider>
      </body>
    </html>
  );
}
