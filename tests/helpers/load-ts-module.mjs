import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

export const importTsModule = async (absolutePath) => {
  const source = await fs.readFile(absolutePath, "utf8");

  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      isolatedModules: true,
      esModuleInterop: true,
      strict: false,
    },
    fileName: absolutePath,
  });

  const tmpFile = path.join(
    os.tmpdir(),
    `c3k-test-${path.basename(absolutePath).replace(/[^a-z0-9_.-]/gi, "_")}-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`,
  );

  await fs.writeFile(tmpFile, transpiled.outputText, "utf8");

  try {
    return await import(`${pathToFileURL(tmpFile).href}?v=${Date.now()}`);
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
  }
};
