import { getPostgresHttpConfig } from "@/lib/server/postgres-http";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { readAdminTonEnvironmentStatus } from "@/lib/server/admin-ton-environment-status";
import type { AdminDeploymentCheck, AdminDeploymentReadinessSnapshot } from "@/types/admin";

const envText = (value: unknown): string => String(value ?? "").trim();

const resolveOverallState = (
  checks: AdminDeploymentCheck[],
): AdminDeploymentReadinessSnapshot["overallState"] => {
  if (checks.some((check) => check.status === "missing")) {
    return "missing";
  }

  if (checks.some((check) => check.status === "warning")) {
    return "warning";
  }

  return "ready";
};

export const readAdminDeploymentReadiness = async (
  request: Request,
): Promise<AdminDeploymentReadinessSnapshot> => {
  const updatedAt = new Date().toISOString();
  const explicitPublicUrl = envText(process.env.NEXT_PUBLIC_APP_URL);
  const explicitWebhookBaseUrl = envText(process.env.TELEGRAM_WEBHOOK_BASE_URL);
  const resolvedPublicBaseUrl = resolvePublicBaseUrl(request);
  const telegramBotToken = envText(process.env.TELEGRAM_BOT_TOKEN);
  const telegramWebhookSecret = envText(process.env.TELEGRAM_WEBHOOK_SECRET);
  const adminIds = envText(process.env.SHOP_ADMIN_TELEGRAM_IDS);
  const sessionSecret = envText(process.env.SHOP_AUTH_SESSION_SECRET);
  const workerSecret = envText(process.env.TELEGRAM_WORKER_SECRET);
  const cronSecret = envText(process.env.CRON_SECRET);
  const storageEnabled = envText(process.env.C3K_STORAGE_ENABLED) === "1";
  const desktopEnabled = envText(process.env.C3K_STORAGE_DESKTOP_CLIENT_ENABLED) === "1";
  const tonStatus = await readAdminTonEnvironmentStatus(request);

  const checks: AdminDeploymentCheck[] = [
    explicitPublicUrl && explicitWebhookBaseUrl
      ? {
          id: "public_urls",
          label: "Публичные URL",
          status: "ready",
          summary: "Явно заданы public app URL и webhook base URL.",
          hint: "Этот контур нужен для login, metadata, webhook и deploy flow.",
        }
      : resolvedPublicBaseUrl
        ? {
            id: "public_urls",
            label: "Публичные URL",
            status: "warning",
            summary: "Base URL определяется из текущего запроса, но не все публичные URL закреплены в env.",
            hint: "Лучше явно задать NEXT_PUBLIC_APP_URL и TELEGRAM_WEBHOOK_BASE_URL перед стабильным rollout.",
          }
        : {
            id: "public_urls",
            label: "Публичные URL",
            status: "missing",
            summary: "Публичный base URL не определяется.",
            hint: "Задайте NEXT_PUBLIC_APP_URL и TELEGRAM_WEBHOOK_BASE_URL.",
          },
    telegramBotToken && telegramWebhookSecret
      ? {
          id: "telegram_core",
          label: "Telegram core",
          status: "ready",
          summary: "Bot token и webhook secret настроены.",
          hint: "Этого достаточно для webhook-based Telegram контура.",
        }
      : {
          id: "telegram_core",
          label: "Telegram core",
          status: "missing",
          summary: "Telegram bot env настроен не полностью.",
          hint: "Проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET.",
        },
    adminIds && sessionSecret
      ? {
          id: "auth_session",
          label: "Admin auth и session",
          status: "ready",
          summary: "Admin IDs и session secret присутствуют.",
          hint: "Сессии и admin access готовы к стабильному режиму.",
        }
      : {
          id: "auth_session",
          label: "Admin auth и session",
          status: "missing",
          summary: "Admin/session контур настроен не полностью.",
          hint: "Проверьте SHOP_ADMIN_TELEGRAM_IDS и SHOP_AUTH_SESSION_SECRET.",
        },
    getPostgresHttpConfig()
      ? {
          id: "postgres",
          label: "Postgres",
          status: "ready",
          summary: "Postgres HTTP config доступен.",
          hint: "Нормализованные домены, runtime config и worker history смогут работать без fallback.",
        }
      : {
          id: "postgres",
          label: "Postgres",
          status: "missing",
          summary: "Postgres не настроен.",
          hint: "Проверьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.",
        },
    workerSecret && cronSecret
      ? {
          id: "worker_auth",
          label: "Worker auth",
          status: "ready",
          summary: "Есть отдельные ключи для worker/cron запуска.",
          hint: "Queue workers можно безопасно вызывать из cron или защищённых routes.",
        }
      : workerSecret || cronSecret
        ? {
            id: "worker_auth",
            label: "Worker auth",
            status: "warning",
            summary: "Настроен только один из worker auth secrets.",
            hint: "Лучше держать и TELEGRAM_WORKER_SECRET, и CRON_SECRET.",
          }
        : {
            id: "worker_auth",
            label: "Worker auth",
            status: "missing",
            summary: "Worker auth secrets не заданы.",
            hint: "Проверьте TELEGRAM_WORKER_SECRET и CRON_SECRET.",
          },
    tonStatus.onchainMintEnabled
      ? tonStatus.relayReady && tonStatus.activeCollectionAddress
        ? {
            id: "ton_runtime",
            label: "TON runtime",
            status: tonStatus.warnings.length > 0 ? "warning" : "ready",
            summary:
              tonStatus.warnings.length > 0
                ? "TON contour активен, но есть предупреждения по сети или source."
                : "TON contour выглядит согласованным для активной сети.",
            hint: "Следите за active network, relay readiness и source collection перед mint/deploy.",
          }
        : {
            id: "ton_runtime",
            label: "TON runtime",
            status: "missing",
            summary: "On-chain mint включён, но TON contour настроен не полностью.",
            hint: "Проверьте active collection, sponsor wallet и relay env.",
          }
      : {
          id: "ton_runtime",
          label: "TON runtime",
          status: "warning",
          summary: "On-chain mint сейчас выключен.",
          hint: "Это нормально для test-only режима, но mainnet contour ещё не активирован.",
        },
    storageEnabled && desktopEnabled
      ? {
          id: "storage_desktop",
          label: "Storage/Desktop",
          status: "ready",
          summary: "Storage program и desktop contour включены.",
          hint: "Можно двигаться дальше к runtime и desktop retrieval.",
        }
      : storageEnabled || desktopEnabled
        ? {
            id: "storage_desktop",
            label: "Storage/Desktop",
            status: "warning",
            summary: "Включён только один из storage/desktop флагов.",
            hint: "Проверьте C3K_STORAGE_ENABLED и C3K_STORAGE_DESKTOP_CLIENT_ENABLED.",
          }
        : {
            id: "storage_desktop",
            label: "Storage/Desktop",
            status: "warning",
            summary: "Storage/Desktop контур пока в выключенном режиме.",
            hint: "Это нормально для текущего тестового режима, пока не начат реальный runtime.",
          },
  ];

  return {
    updatedAt,
    overallState: resolveOverallState(checks),
    readyChecks: checks.filter((check) => check.status === "ready").length,
    warningChecks: checks.filter((check) => check.status === "warning").length,
    missingChecks: checks.filter((check) => check.status === "missing").length,
    checks,
  };
};
