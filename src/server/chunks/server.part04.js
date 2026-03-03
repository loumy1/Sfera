"use strict";

function requireAuth(currentUser) {
  if (!currentUser) {
    throw new HttpError(401, "Нужно войти в аккаунт");
  }
}

function requireAdmin(currentUser) {
  if (!currentUser) {
    throw new HttpError(401, "Нужно войти в аккаунт");
  }
  if (!currentUser.isAdmin) {
    throw new HttpError(403, "Требуется режим администратора");
  }
}

async function handleWebSocketUpgrade(req, socket, head) {
  try {
    if (!req.url) {
      rejectWebSocketUpgrade(socket, 400, "Bad Request");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== WS_PATH) {
      rejectWebSocketUpgrade(socket, 404, "Not Found");
      return;
    }

    const wsKey = req.headers["sec-websocket-key"];
    const wsVersion = req.headers["sec-websocket-version"];

    if (typeof wsKey !== "string" || wsVersion !== "13") {
      rejectWebSocketUpgrade(socket, 400, "Bad Request");
      return;
    }

    const sid = parseCookieHeader(req.headers.cookie).sid;
    const user = await getUserBySessionId(sid);

    if (!user) {
      rejectWebSocketUpgrade(socket, 401, "Unauthorized");
      return;
    }

    const acceptKey = crypto
      .createHash("sha1")
      .update(`${wsKey}${WS_MAGIC}`)
      .digest("base64");

    socket.write(
      [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${acceptKey}`,
        "\r\n"
      ].join("\r\n")
    );

    if (head && head.length > 0) {
      socket.unshift(head);
    }

    registerWsClient(user.id, socket);
    setupWebSocketSocket(socket, user.id);
    sendWsJson(socket, {
      event: "ws:ready",
      payload: {
        userId: user.id,
        username: user.username,
        onlineUsers: getOnlineUsersCount()
      }
    });
  } catch (error) {
    console.error("WebSocket upgrade failed:", error);
    rejectWebSocketUpgrade(socket, 500, "Internal Server Error");
  }
}

async function serveFile(req, res, filePath, contentType) {
  let stats;

  try {
    stats = await fsp.stat(filePath);
    if (!stats.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
  } catch {
    sendText(res, 404, "Not found");
    return;
  }

  const range = req.headers.range;

  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [startRaw, endRaw] = range.replace("bytes=", "").split("-");
    let start = startRaw ? Number(startRaw) : 0;
    let end = endRaw ? Number(endRaw) : stats.size - 1;

    if (!Number.isFinite(start) || start < 0) {
      start = 0;
    }

    if (!Number.isFinite(end) || end >= stats.size) {
      end = stats.size - 1;
    }

    if (start > end) {
      res.writeHead(416, {
        "Content-Range": `bytes */${stats.size}`
      });
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache"
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stats.size,
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-cache"
  });

  fs.createReadStream(filePath).pipe(res);
}

async function handleStatic(req, res, pathname) {
  if (/^\/u\/[a-zA-Z0-9_]+\/?$/.test(pathname)) {
    const publicProfilePage = path.resolve(PUBLIC_DIR, "public-profile.html");
    await serveFile(req, res, publicProfilePage, MIME_TYPES[".html"]);
    return;
  }

  if (/^\/(?:t|b)\/[a-zA-Z0-9-]+\/?$/.test(pathname) || /^\/a\/[a-zA-Z0-9-]+\/?$/.test(pathname)) {
    const itemPage = path.resolve(PUBLIC_DIR, "item-page.html");
    await serveFile(req, res, itemPage, MIME_TYPES[".html"]);
    return;
  }

  if (pathname.startsWith("/uploads/")) {
    const relative = pathname.replace(/^\/uploads\//, "");
    const requested = path.resolve(UPLOADS_DIR, relative);

    if (!isSubPath(UPLOADS_DIR, requested)) {
      sendText(res, 403, "Forbidden");
      return;
    }

    const ext = path.extname(requested).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    await serveFile(req, res, requested, mimeType);
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const resolved = path.resolve(PUBLIC_DIR, relativePath);

  if (!isSubPath(PUBLIC_DIR, resolved)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const stats = await fsp.stat(resolved);
    if (!stats.isFile()) {
      sendText(res, 404, "Not found");
      return;
    }
  } catch {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";
  await serveFile(req, res, resolved, mimeType);
}

// handleApi будет определена в server.part05.js
