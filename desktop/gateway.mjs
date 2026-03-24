import http from "node:http";

const writeJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
};

const writeHtml = (response, statusCode, html) => {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
};

export const createGatewayServer = ({
  host = "127.0.0.1",
  port = 3467,
  tonSiteHost = "c3k.ton",
  runtime = {},
  onStorageOpen,
  onSiteOpen,
  onTelegramAuthBridge,
} = {}) => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);

    if (url.pathname === "/health") {
      writeJson(response, 200, {
        ok: true,
        host,
        port,
        tonSiteHost,
        runtime,
      });
      return;
    }

    if (url.pathname === "/runtime") {
      writeJson(response, 200, {
        ok: true,
        runtime,
      });
      return;
    }

    if (url.pathname === "/site/open") {
      const payload = {
        host: url.searchParams.get("host") || tonSiteHost,
      };
      onSiteOpen?.(payload);
      writeJson(response, 200, {
        ok: true,
        mode: "site_open_stub",
        ...payload,
      });
      return;
    }

    if (url.pathname === "/storage/open") {
      const payload = {
        requestId: url.searchParams.get("requestId") || "",
        releaseSlug: url.searchParams.get("releaseSlug") || "",
        trackId: url.searchParams.get("trackId") || "",
        storagePointer: url.searchParams.get("storagePointer") || "",
        deliveryUrl: url.searchParams.get("deliveryUrl") || "",
        fileName: url.searchParams.get("fileName") || "",
      };
      Promise.resolve(onStorageOpen?.(payload))
        .then((result) => {
          writeJson(response, 200, {
            ok: true,
            mode: "storage_open",
            ...payload,
            ...(result && typeof result === "object" ? result : {}),
          });
        })
        .catch((error) => {
          writeJson(response, 500, {
            ok: false,
            mode: "storage_open",
            ...payload,
            error: String(error?.message || error || "Unknown desktop storage open error"),
          });
        });
      return;
    }

    if (url.pathname === "/auth/telegram/callback") {
      const bridgeToken = url.searchParams.get("bridge") || "";

      if (!bridgeToken.trim()) {
        writeHtml(
          response,
          400,
          `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;background:#0d1017;color:#f3f6fb"><h1>Не удалось завершить вход</h1><p>Desktop bridge token не был передан обратно в локальную ноду.</p></body></html>`,
        );
        return;
      }

      Promise.resolve(onTelegramAuthBridge?.({ bridgeToken: bridgeToken.trim() }))
        .then(() => {
          writeHtml(
            response,
            200,
            `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;background:#0d1017;color:#f3f6fb"><h1>Вход передан в C3K Desktop</h1><p>Можно закрыть это окно и вернуться в приложение.</p><script>window.setTimeout(()=>window.close(),700)</script></body></html>`,
          );
        })
        .catch((error) => {
          writeHtml(
            response,
            500,
            `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;background:#0d1017;color:#f3f6fb"><h1>Вход не применился</h1><p>${String(error?.message || error || "Unknown desktop auth error")}</p></body></html>`,
          );
        });
      return;
    }

    writeJson(response, 404, {
      ok: false,
      error: "Not found",
      path: url.pathname,
    });
  });

  return {
    start: () =>
      new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve({
            host,
            port,
            tonSiteHost,
            baseUrl: `http://${host}:${port}`,
          });
        });
      }),
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const host = process.env.C3K_DESKTOP_GATEWAY_HOST || "127.0.0.1";
  const port = Number(process.env.C3K_DESKTOP_GATEWAY_PORT || "3467");
  const tonSiteHost = process.env.C3K_DESKTOP_TON_SITE_HOST || "c3k.ton";

  const gateway = createGatewayServer({ host, port, tonSiteHost });
  gateway
    .start()
    .then((info) => {
      console.log(`[c3k-desktop] gateway listening on ${info.baseUrl}`);
    })
    .catch((error) => {
      console.error("[c3k-desktop] gateway failed", error);
      process.exitCode = 1;
    });
}
