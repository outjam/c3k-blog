import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const STORAGE_DAEMON_CLI_BIN = String(process.env.C3K_STORAGE_TON_DAEMON_CLI_BIN || "storage-daemon-cli").trim();

const parseCliArgs = (): string[] => {
  const raw = String(process.env.C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON || "").trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
};

const STORAGE_DAEMON_CLI_ARGS = parseCliArgs();

interface TonStorageDaemonFileInfo {
  name: string;
  size?: string;
  priority?: number;
  downloaded_size?: string;
}

interface TonStorageDaemonGetResponse {
  torrent?: {
    root_dir?: string;
    description?: string;
  };
  files?: TonStorageDaemonFileInfo[];
}

export interface TonStorageLocalGatewayResolveResult {
  ok: boolean;
  bagId: string;
  filePath?: string;
  absolutePath?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const extractJsonPayload = (value: string): TonStorageDaemonGetResponse | null => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start < 0 || end < start) {
    return null;
  }

  try {
    return JSON.parse(value.slice(start, end + 1)) as TonStorageDaemonGetResponse;
  } catch {
    return null;
  }
};

const runDaemonCliCommand = async (command: string): Promise<string> => {
  const { stdout, stderr } = await execFileAsync(
    STORAGE_DAEMON_CLI_BIN,
    [...STORAGE_DAEMON_CLI_ARGS, "-c", command],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return [stdout, stderr].filter(Boolean).join("\n").trim();
};

const detectMimeType = (filePath: string | undefined): string => {
  const lower = String(filePath || "").toLowerCase();

  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.endsWith(".wav")) {
    return "audio/wav";
  }
  if (lower.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (lower.endsWith(".flac")) {
    return "audio/flac";
  }
  if (lower.endsWith(".aac")) {
    return "audio/aac";
  }
  if (lower.endsWith(".m4a") || lower.endsWith(".alac")) {
    return "audio/mp4";
  }
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".json")) {
    return "application/json";
  }
  if (lower.endsWith(".zip")) {
    return "application/zip";
  }
  if (lower.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  return "application/octet-stream";
};

const resolveBagFilePath = (input: {
  rootDir: string;
  explicitFilePath?: string;
  files: TonStorageDaemonFileInfo[];
}): { filePath?: string; absolutePath?: string; fileName?: string } => {
  const fallbackPath = input.files[0]?.name;
  const filePath = normalizeText(input.explicitFilePath || fallbackPath);

  if (!filePath) {
    return {};
  }

  const normalizedRoot = resolve(input.rootDir);
  const resolvedAbsolutePath = resolve(normalizedRoot, filePath);

  if (resolvedAbsolutePath !== normalizedRoot && !resolvedAbsolutePath.startsWith(`${normalizedRoot}${sep}`)) {
    return {};
  }

  return {
    filePath,
    absolutePath: resolvedAbsolutePath,
    fileName: basename(resolvedAbsolutePath),
  };
};

export const resolveTonStorageLocalGatewayFile = async (input: {
  bagId: string;
  filePath?: string;
}): Promise<TonStorageLocalGatewayResolveResult> => {
  const bagId = normalizeText(input.bagId).toUpperCase();

  if (!bagId) {
    return {
      ok: false,
      bagId,
      error: "Missing bag id.",
    };
  }

  if (!STORAGE_DAEMON_CLI_ARGS.length) {
    return {
      ok: false,
      bagId,
      error: "Missing C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON for local runtime gateway.",
    };
  }

  let payload: TonStorageDaemonGetResponse | null = null;

  try {
    const output = await runDaemonCliCommand(`get ${bagId} --json`);
    payload = extractJsonPayload(output);
  } catch (error) {
    return {
      ok: false,
      bagId,
      error: error instanceof Error ? error.message : "storage-daemon-cli get failed.",
    };
  }

  if (!payload?.torrent?.root_dir) {
    return {
      ok: false,
      bagId,
      error: "storage-daemon-cli did not return root_dir for this bag.",
    };
  }

  const resolvedPath = resolveBagFilePath({
    rootDir: payload.torrent.root_dir,
    explicitFilePath: input.filePath,
    files: payload.files ?? [],
  });

  if (!resolvedPath.absolutePath || !resolvedPath.filePath) {
    return {
      ok: false,
      bagId,
      error: "Could not resolve a safe file path inside the bag.",
    };
  }

  try {
    const fileStat = await stat(resolvedPath.absolutePath);
    return {
      ok: true,
      bagId,
      filePath: resolvedPath.filePath,
      absolutePath: resolvedPath.absolutePath,
      fileName: resolvedPath.fileName,
      mimeType: detectMimeType(resolvedPath.filePath),
      sizeBytes: fileStat.size,
    };
  } catch (error) {
    return {
      ok: false,
      bagId,
      filePath: resolvedPath.filePath,
      absolutePath: resolvedPath.absolutePath,
      error: error instanceof Error ? error.message : "Bag file is not readable.",
    };
  }
};

export const readTonStorageLocalGatewayFile = async (input: {
  bagId: string;
  filePath?: string;
}): Promise<
  TonStorageLocalGatewayResolveResult & {
    bytes?: Uint8Array;
  }
> => {
  const resolved = await resolveTonStorageLocalGatewayFile(input);

  if (!resolved.ok || !resolved.absolutePath) {
    return resolved;
  }

  try {
    const bytes = new Uint8Array(await readFile(resolved.absolutePath));
    return {
      ...resolved,
      ok: true,
      bytes,
    };
  } catch (error) {
    return {
      ...resolved,
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read bag file.",
    };
  }
};
