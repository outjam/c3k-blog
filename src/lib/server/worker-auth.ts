const resolveBearerToken = (authorizationHeader: string | null): string => {
  const value = String(authorizationHeader ?? "").trim();

  if (!value.startsWith("Bearer ")) {
    return "";
  }

  return value.slice("Bearer ".length).trim();
};

export const isAuthorizedWorkerRequest = (
  request: Request,
  options?: {
    workerSecretEnv?: string;
    cronSecretEnv?: string;
  },
): boolean => {
  const workerSecret = String(
    process.env[options?.workerSecretEnv ?? "TELEGRAM_WORKER_SECRET"] ?? "",
  ).trim();
  const cronSecret = String(process.env[options?.cronSecretEnv ?? "CRON_SECRET"] ?? "").trim();

  const url = new URL(request.url);
  const fromHeader = String(request.headers.get("x-worker-key") ?? "").trim();
  const fromQuery = String(url.searchParams.get("key") ?? "").trim();
  const bearer = resolveBearerToken(request.headers.get("authorization"));

  if (workerSecret && (fromHeader === workerSecret || fromQuery === workerSecret)) {
    return true;
  }

  if (cronSecret && bearer === cronSecret) {
    return true;
  }

  return false;
};

export const parseWorkerQueueLimit = (
  request: Request,
  fallback = 25,
  max = 100,
): number => {
  const queryValue = Number(new URL(request.url).searchParams.get("limit"));

  if (!Number.isFinite(queryValue)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.round(queryValue)));
};
