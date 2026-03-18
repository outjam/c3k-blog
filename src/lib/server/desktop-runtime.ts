import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildDesktopStorageOpenUrl,
  buildDesktopTonSiteOpenUrl,
  getDefaultDesktopAppScheme,
  getDefaultDesktopGatewayConfig,
} from "@/lib/desktop-runtime";
import { getC3kStorageConfig } from "@/lib/storage-config";
import type { C3kDesktopRuntimeContract } from "@/types/desktop";

const readAppVersion = (): string => {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim()
      ? parsed.version.trim()
      : "0.1.0";
  } catch {
    return "0.1.0";
  }
};

const stripTrailingSlash = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
};

export const getC3kDesktopRuntimeContract = (options?: {
  webAppOrigin?: string | null;
}): C3kDesktopRuntimeContract => {
  const features = getC3kStorageConfig();
  const gateway = getDefaultDesktopGatewayConfig();
  const appScheme = getDefaultDesktopAppScheme();
  const webAppOrigin = stripTrailingSlash(options?.webAppOrigin ?? null);
  const startUrl =
    stripTrailingSlash(process.env.C3K_DESKTOP_START_URL ?? null) ??
    (webAppOrigin ? `${webAppOrigin}/storage/desktop` : null);
  const storageProgramUrl = webAppOrigin ? `${webAppOrigin}/storage` : null;
  const downloadsUrl = webAppOrigin ? `${webAppOrigin}/downloads` : null;
  const runtimeUrl = webAppOrigin ? `${webAppOrigin}/api/desktop/runtime` : null;

  return {
    appId: "culture3k.desktop",
    appName: "C3K Desktop Client",
    appScheme,
    version: readAppVersion(),
    webAppOrigin,
    startUrl,
    storageProgramUrl,
    downloadsUrl,
    runtimeUrl,
    features: {
      storageProgramEnabled: features.enabled,
      desktopClientEnabled: features.desktopClientEnabled,
      tonSiteDesktopGatewayEnabled: features.tonSiteDesktopGatewayEnabled,
      telegramBotDeliveryEnabled: features.telegramBotDeliveryEnabled,
      testModeIngestEnabled: features.testModeIngestEnabled,
    },
    gateway,
    onboarding: {
      minRecommendedDiskGb: 20,
      targetDiskGb: 50,
      supportedPlatforms: ["macOS", "Windows", "Linux"],
      steps: [
        {
          id: "install",
          title: "Установить C3K Desktop",
          description: "Desktop-клиент даёт локальный runtime для node mode и открытия c3k.ton.",
        },
        {
          id: "sign-in",
          title: "Войти тем же аккаунтом",
          description: "Desktop должен использовать тот же C3K account и TON wallet identity, что и web.",
        },
        {
          id: "disk",
          title: "Выделить место под storage",
          description: "На beta-этапе достаточно 20-50 GB для bags, cache и future replication.",
        },
        {
          id: "gateway",
          title: "Включить gateway для c3k.ton",
          description: "Локальный gateway открывает TON Site без стороннего browser и ручного proxy.",
        },
      ],
    },
    deepLinks: {
      openTonSite: buildDesktopTonSiteOpenUrl({ gateway, appScheme }).deepLink,
      openStorageExample: buildDesktopStorageOpenUrl(
        {
          requestId: "example",
          releaseSlug: "example-release",
          storagePointer: "tonstorage://example",
        },
        { gateway, appScheme },
      ).deepLink,
    },
  };
};
