import { app, BrowserWindow, ipcMain, nativeTheme, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createGatewayServer } from "./gateway.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const runtimeUrl =
  process.env.C3K_DESKTOP_RUNTIME_URL || "http://127.0.0.1:3000/api/desktop/runtime";

const fetchRuntimeContract = async () => {
  const response = await fetch(runtimeUrl, {
    method: "GET",
    headers: {
      "cache-control": "no-store",
    },
  });

  if (!response.ok) {
    throw new Error(`Desktop runtime fetch failed: HTTP ${response.status}`);
  }

  const payload = await response.json();
  return payload.runtime;
};

let cachedRuntime = null;
let gateway = null;
let mainWindow = null;

const resolveWindowBackgroundColor = (theme) => {
  if (theme === "light") {
    return "#f2f2f7";
  }

  if (theme === "dark") {
    return "#000000";
  }

  return nativeTheme.shouldUseDarkColors ? "#000000" : "#f2f2f7";
};

const applyDesktopTheme = (theme) => {
  const normalized = theme === "light" || theme === "dark" ? theme : "system";
  nativeTheme.themeSource = normalized;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(resolveWindowBackgroundColor(normalized));
  }

  return {
    ok: true,
    theme: normalized,
  };
};

const createMainWindow = async () => {
  const runtime = cachedRuntime ?? (await fetchRuntimeContract());
  cachedRuntime = runtime;

  gateway = createGatewayServer({
    host: runtime.gateway?.host,
    port: runtime.gateway?.port,
    tonSiteHost: runtime.gateway?.tonSiteHost,
    runtime,
    onSiteOpen: (payload) => {
      console.log("[c3k-desktop] open site", payload);
    },
    onStorageOpen: (payload) => {
      console.log("[c3k-desktop] open storage payload", payload);
    },
  });
  await gateway.start();

  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    show: false,
    backgroundColor: resolveWindowBackgroundColor(nativeTheme.themeSource),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
      return { action: "allow" };
    }

    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  mainWindow = window;
  await window.loadURL(runtime.startUrl || runtime.webAppOrigin || "http://127.0.0.1:3000/storage/desktop");
};

app.whenReady().then(async () => {
  ipcMain.handle("desktop:ping", () => ({ ok: true }));
  ipcMain.handle("desktop:get-runtime", async () => {
    cachedRuntime = cachedRuntime ?? (await fetchRuntimeContract());
    return cachedRuntime;
  });
  ipcMain.handle("desktop:set-theme", (_event, theme) => {
    return applyDesktopTheme(theme);
  });

  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    if (gateway) {
      await gateway.stop().catch(() => undefined);
    }

    app.quit();
  }
});
