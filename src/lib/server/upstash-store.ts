interface UpstashPipelineEntry {
  result?: unknown;
  error?: string;
}

export const getUpstashConfig = (): { url: string; token: string } | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
};

export const executeUpstashPipeline = async (
  commands: Array<Array<string>>,
): Promise<UpstashPipelineEntry[] | null> => {
  const config = getUpstashConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as UpstashPipelineEntry[];
    return Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
};

