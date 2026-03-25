import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

const sanitizeBaseName = (value: string): string => {
  return (
    String(value || "track")
      .trim()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^\p{L}\p{N}._ -]+/gu, "_")
      .replace(/\s+/g, "-")
      .slice(0, 120) || "track"
  );
};

const resolveInputExtension = (value: string): string => {
  const extension = extname(String(value || "").trim()).toLowerCase();
  return extension && extension.length <= 10 ? extension : ".bin";
};

export interface GeneratedDemoPreview {
  bytes: Uint8Array;
  fileName: string;
  mimeType: "audio/mpeg";
  durationSec: 30;
}

export const generateDemoPreviewMp3 = async (input: {
  bytes: Uint8Array;
  fileName: string;
}): Promise<GeneratedDemoPreview> => {
  const sourceBytes = input.bytes;

  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) {
    throw new Error("empty_source_audio");
  }

  if (!ffmpegPath) {
    throw new Error("ffmpeg_unavailable");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "c3k-demo-preview-"));
  const baseName = sanitizeBaseName(input.fileName);
  const sourcePath = join(tempDir, `${baseName}${resolveInputExtension(input.fileName)}`);
  const outputPath = join(tempDir, `${baseName}-demo-30s.mp3`);

  try {
    await writeFile(sourcePath, Buffer.from(sourceBytes));

    await execFileAsync(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourcePath,
        "-vn",
        "-t",
        "30",
        "-ac",
        "2",
        "-ar",
        "44100",
        "-b:a",
        "192k",
        outputPath,
      ],
      {
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    const previewBytes = new Uint8Array(await readFile(outputPath));

    if (previewBytes.byteLength === 0) {
      throw new Error("ffmpeg_empty_output");
    }

    return {
      bytes: previewBytes,
      fileName: `${baseName}-demo-30s.mp3`,
      mimeType: "audio/mpeg",
      durationSec: 30,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
};
