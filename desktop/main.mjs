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
const TELEGRAM_BROWSER_AUTH_COOKIE = "c3k_tg_auth";
const TONSTORAGE_BAG_ID_PATTERN = /^[a-f0-9]{64}$/i;

const normalizeOrigin = (value) => {
  try {
    return new URL(String(value)).origin;
  } catch {
    return null;
  }
};

const isTrustedDesktopPopupUrl = (targetUrl, runtime) => {
  try {
    const parsed = new URL(targetUrl);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    const runtimeOrigin = normalizeOrigin(runtime?.webAppOrigin);

    if (protocol === "http:" || protocol === "https:") {
      if (host === "127.0.0.1" || host === "localhost") {
        return true;
      }

      if (parsed.origin === runtimeOrigin) {
        return true;
      }

      if (parsed.origin === "https://oauth.telegram.org") {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
};

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

const normalizeText = (value) => String(value ?? "").trim();

const encodePath = (value) =>
  normalizeText(value)
    .split("/")
    .filter(Boolean)
    .map((entry) => encodeURIComponent(entry))
    .join("/");

const parseTonStoragePointer = (pointer) => {
  const normalized = normalizeText(pointer);
  if (!normalized.toLowerCase().startsWith("tonstorage://")) {
    return null;
  }

  const withoutScheme = normalized.slice("tonstorage://".length).replace(/^\/+/, "");
  const parts = withoutScheme.split("/").filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if ((parts[0] === "testnet" || parts[0] === "mainnet") && parts.length >= 2) {
    const bagId = parts[1];
    return {
      bagId: TONSTORAGE_BAG_ID_PATTERN.test(bagId) ? bagId : undefined,
      filePath: parts.slice(2).join("/") || undefined,
    };
  }

  return {
    bagId: TONSTORAGE_BAG_ID_PATTERN.test(parts[0]) ? parts[0] : undefined,
    filePath: parts.slice(1).join("/") || undefined,
  };
};

const emitDesktopRendererEvent = async (window, eventName, detail) => {
  if (!window || window.isDestroyed()) {
    return;
  }

  const serializedName = JSON.stringify(eventName);
  const serializedDetail = JSON.stringify(detail ?? null);
  await window.webContents
    .executeJavaScript(
      `window.dispatchEvent(new CustomEvent(${serializedName}, { detail: ${serializedDetail} }));`,
      true,
    )
    .catch(() => undefined);
};

const buildDesktopStorageContextUrl = (runtime, payload, sourceMode) => {
  const runtimeOrigin = normalizeOrigin(runtime?.webAppOrigin);
  const startUrl = normalizeText(runtime?.startUrl) || (runtimeOrigin ? `${runtimeOrigin}/storage/desktop` : "");

  if (!startUrl) {
    return null;
  }

  const url = new URL(startUrl);
  [
    ["desktopRequestId", payload.requestId],
    ["desktopReleaseSlug", payload.releaseSlug],
    ["desktopTrackId", payload.trackId],
    ["desktopStoragePointer", payload.storagePointer],
    ["desktopFileName", payload.fileName],
    ["desktopDeliveryUrl", payload.deliveryUrl],
    ["desktopSourceMode", sourceMode],
  ].forEach(([key, value]) => {
    const normalized = normalizeText(value);
    if (normalized) {
      url.searchParams.set(key, normalized);
    }
  });

  return url.toString();
};

const buildLocalNodeStorageFetchUrl = (payload, runtime) => {
  if (!runtime?.localNode?.overallReady) {
    return null;
  }

  const gatewayBase = normalizeText(runtime?.localNode?.gatewayUrl).replace(/\/+$/, "");
  const parsedPointer = parseTonStoragePointer(payload.storagePointer);
  const bagId = normalizeText(parsedPointer?.bagId);

  if (!gatewayBase || !bagId || !TONSTORAGE_BAG_ID_PATTERN.test(bagId)) {
    return null;
  }

  const filePath = normalizeText(parsedPointer?.filePath || payload.fileName);
  return filePath ? `${gatewayBase}/${bagId}/${encodePath(filePath)}` : `${gatewayBase}/${bagId}`;
};

const buildRemoteStorageFetchUrl = (payload, runtime) => {
  const runtimeOrigin = normalizeOrigin(runtime?.webAppOrigin);

  if (payload.requestId && runtimeOrigin) {
    return new URL(`/api/storage/downloads/${encodeURIComponent(payload.requestId)}/file`, runtimeOrigin).toString();
  }

  const deliveryUrl = normalizeText(payload.deliveryUrl);
  if (/^https?:\/\//i.test(deliveryUrl)) {
    return deliveryUrl;
  }

  return null;
};

const hasDesktopTelegramSession = async (runtime, window) => {
  const runtimeOrigin = normalizeOrigin(runtime?.webAppOrigin);
  if (!runtimeOrigin) {
    return false;
  }

  const cookies = await window.webContents.session.cookies.get({
    url: runtimeOrigin,
    name: TELEGRAM_BROWSER_AUTH_COOKIE,
  });

  return cookies.length > 0;
};

const startDesktopStorageDownload = async (payload, runtime, window) => {
  const localTargetUrl = buildLocalNodeStorageFetchUrl(payload, runtime);
  const remoteTargetUrl = buildRemoteStorageFetchUrl(payload, runtime);
  const targetUrl = localTargetUrl || remoteTargetUrl;
  const sourceMode = localTargetUrl ? "local_node" : remoteTargetUrl ? "remote_fallback" : "unresolved";
  const contextUrl = buildDesktopStorageContextUrl(runtime, payload, sourceMode);

  if (contextUrl) {
    await window.loadURL(contextUrl);
  }

  await emitDesktopRendererEvent(window, "c3k-desktop-storage-open", {
    payload,
    sourceMode,
    targetUrl,
    openedAt: new Date().toISOString(),
  });

  if (!targetUrl) {
    throw new Error("Desktop runtime could not resolve a fetch target for this storage request.");
  }

  if (!localTargetUrl && remoteTargetUrl) {
    const hasSession = await hasDesktopTelegramSession(runtime, window);
    if (!hasSession) {
      throw new Error("Desktop fallback requires Telegram login inside Electron first.");
    }
  }

  window.focus();
  await window.webContents.downloadURL(targetUrl);

  return {
    sourceMode,
    targetUrl,
    contextUrl,
  };
};

const buildDesktopTelegramAuthUrl = (runtime) => {
  const origin = normalizeOrigin(runtime?.webAppOrigin);
  if (!origin) {
    throw new Error("Desktop runtime does not expose webAppOrigin");
  }

  const returnTo = `${runtime.gateway?.baseUrl || "http://127.0.0.1:3467"}/auth/telegram/callback`;
  const url = new URL("/auth/desktop-telegram", origin);
  url.searchParams.set("return_to", returnTo);
  return url.toString();
};

const exchangeDesktopBridgeToken = async (bridgeToken, runtime) => {
  const origin = normalizeOrigin(runtime?.webAppOrigin);
  if (!origin) {
    throw new Error("Desktop runtime does not expose webAppOrigin");
  }

  const response = await fetch(`${origin}/api/auth/telegram/desktop/exchange`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify({ bridgeToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Desktop auth exchange failed: HTTP ${response.status}`);
  }

  const sessionToken = String(payload?.sessionToken || "").trim();
  if (!sessionToken) {
    throw new Error("Desktop auth exchange did not return sessionToken");
  }

  return sessionToken;
};

const applyDesktopTelegramSession = async (sessionToken, runtime, window) => {
  const origin = normalizeOrigin(runtime?.webAppOrigin);
  if (!origin) {
    throw new Error("Desktop runtime does not expose webAppOrigin");
  }

  await window.webContents.session.cookies.set({
    url: origin,
    name: TELEGRAM_BROWSER_AUTH_COOKIE,
    value: sessionToken,
    path: "/",
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
  });

  if (!window.isDestroyed()) {
    await window.webContents.reload();
    window.focus();
  }
};

const createMainWindow = async () => {
  const runtime = cachedRuntime ?? (await fetchRuntimeContract());
  cachedRuntime = runtime;

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

  window.webContents.session.on("will-download", (_event, item) => {
    const detailBase = {
      url: item.getURL(),
      fileName: item.getFilename(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: item.getReceivedBytes(),
    };

    void emitDesktopRendererEvent(window, "c3k-desktop-download-state", {
      ...detailBase,
      state: "started",
      at: new Date().toISOString(),
    });

    item.on("updated", (_downloadEvent, state) => {
      void emitDesktopRendererEvent(window, "c3k-desktop-download-state", {
        ...detailBase,
        state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        at: new Date().toISOString(),
      });
    });

    item.once("done", (_downloadEvent, state) => {
      void emitDesktopRendererEvent(window, "c3k-desktop-download-state", {
        ...detailBase,
        state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        at: new Date().toISOString(),
      });
    });
  });

  gateway = createGatewayServer({
    host: runtime.gateway?.host,
    port: runtime.gateway?.port,
    tonSiteHost: runtime.gateway?.tonSiteHost,
    runtime,
    onSiteOpen: (payload) => {
      console.log("[c3k-desktop] open site", payload);
    },
    onStorageOpen: async (payload) => {
      console.log("[c3k-desktop] open storage payload", payload);
      return startDesktopStorageDownload(payload, runtime, window);
    },
    onTelegramAuthBridge: async ({ bridgeToken }) => {
      const sessionToken = await exchangeDesktopBridgeToken(bridgeToken, runtime);
      await applyDesktopTelegramSession(sessionToken, runtime, window);
      console.log("[c3k-desktop] telegram auth session applied");
    },
  });
  await gateway.start();

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedDesktopPopupUrl(url, runtime)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: window,
          modal: url.startsWith("https://oauth.telegram.org"),
          show: true,
          width: 520,
          height: 760,
          minWidth: 420,
          minHeight: 640,
          autoHideMenuBar: true,
          backgroundColor: resolveWindowBackgroundColor(nativeTheme.themeSource),
          webPreferences: {
            preload: path.join(__dirname, "preload.mjs"),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      };
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
  ipcMain.handle("desktop:start-telegram-auth", async () => {
    cachedRuntime = cachedRuntime ?? (await fetchRuntimeContract());
    const authUrl = buildDesktopTelegramAuthUrl(cachedRuntime);
    await shell.openExternal(authUrl);
    return {
      ok: true,
      authUrl,
    };
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
