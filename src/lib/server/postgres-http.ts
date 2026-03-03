interface PostgresHttpConfig {
  baseUrl: string;
  serviceRoleKey: string;
}

const getSupabaseUrl = (): string | null => {
  const direct = process.env.SUPABASE_URL?.trim();

  if (direct) {
    return direct.replace(/\/+$/, "");
  }

  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();

  if (projectRef) {
    return `https://${projectRef}.supabase.co`;
  }

  return null;
};

export const getPostgresHttpConfig = (): PostgresHttpConfig | null => {
  const baseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!baseUrl || !serviceRoleKey) {
    return null;
  }

  return { baseUrl, serviceRoleKey };
};

const buildUrl = (path: string, query?: URLSearchParams): string => {
  const config = getPostgresHttpConfig();

  if (!config) {
    return "";
  }

  const url = `${config.baseUrl}/rest/v1${path}`;
  const suffix = query && query.toString() ? `?${query.toString()}` : "";
  return `${url}${suffix}`;
};

const buildHeaders = (contentType = true): HeadersInit => {
  const config = getPostgresHttpConfig();

  if (!config) {
    return {};
  }

  return {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    ...(contentType ? { "content-type": "application/json" } : {}),
  };
};

export const postgresTableRequest = async <T,>(options: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: URLSearchParams;
  body?: unknown;
  prefer?: string;
}): Promise<T | null> => {
  const config = getPostgresHttpConfig();

  if (!config) {
    return null;
  }

  try {
    const headers = buildHeaders(options.method !== "GET");

    if (options.prefer) {
      (headers as Record<string, string>).prefer = options.prefer;
    }

    const response = await fetch(buildUrl(options.path, options.query), {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    if (response.status === 204) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export const postgresRpc = async <T,>(functionName: string, args?: Record<string, unknown>): Promise<T | null> => {
  return postgresTableRequest<T>({
    method: "POST",
    path: `/rpc/${functionName}`,
    body: args ?? {},
  });
};

