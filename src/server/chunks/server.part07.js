
async function requestHandler(req, res) {
  if (!req.url) {
    sendText(res, 400, "Bad request");
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    let handled = await handleApi(req, res, pathname);

    if (!handled && pathname !== "/api" && !pathname.startsWith("/api/")) {
      const prefixedApiPath = pathname === "/" ? "/api" : `/api${pathname}`;
      handled = await handleApi(req, res, prefixedApiPath);
    }

    if (handled) {
      return;
    }

    await handleStatic(req, res, pathname);
  } catch (error) {
    if (error instanceof HttpError) {
      const headers = {};
      if (Number(error.retryAfterSec) > 0) {
        headers["Retry-After"] = String(Math.ceil(Number(error.retryAfterSec)));
      }
      sendJson(res, error.status, { error: error.message }, headers);
      return;
    }

    console.error(error);
    sendJson(res, 500, { error: "Внутренняя ошибка сервера" });
  }
}

async function bootstrap() {
  await ensureStorage();
  const server = http.createServer(requestHandler);

  server.on("upgrade", (req, socket, head) => {
    handleWebSocketUpgrade(req, socket, head);
  });

  server.on("error", (error) => {
    console.error("Server error:", error);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    console.log(`Server started on http://${HOST}:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
