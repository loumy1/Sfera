"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const Busboy = require("busboy");
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const ROOT_DIR = __dirname;
const STORAGE_ROOT_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : ROOT_DIR;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(STORAGE_ROOT_DIR, "data");
const UPLOADS_DIR = path.join(STORAGE_ROOT_DIR, "uploads");
const AUDIO_DIR = path.join(UPLOADS_DIR, "audio");
const COVERS_DIR = path.join(UPLOADS_DIR, "covers");
const PROFILES_DIR = path.join(UPLOADS_DIR, "profiles");
const TEMP_UPLOAD_DIR = path.join(STORAGE_ROOT_DIR, "tmp");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const TRACKS_FILE = path.join(DATA_DIR, "tracks.json");
const PLAYLISTS_FILE = path.join(DATA_DIR, "playlists.json");
const ALBUMS_FILE = path.join(DATA_DIR, "albums.json");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");
const NOTIFICATIONS_FILE = path.join(DATA_DIR, "notifications.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const PROMO_CODES_FILE = path.join(DATA_DIR, "promocodes.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const EMAIL_TOKENS_FILE = path.join(DATA_DIR, "email_tokens.json");
const MAIL_OUTBOX_FILE = path.join(DATA_DIR, "mail_outbox.json");

const MAX_JSON_SIZE = Number(process.env.MAX_JSON_SIZE_MB || 60) * 1024 * 1024;
const MAX_MP3_UPLOAD_SIZE = Number(process.env.MAX_MP3_UPLOAD_SIZE_MB || 15) * 1024 * 1024;
const MAX_WAV_UPLOAD_SIZE = Number(process.env.MAX_WAV_UPLOAD_SIZE_MB || 30) * 1024 * 1024;
const MAX_STORED_AUDIO_SIZE = Number(process.env.MAX_STORED_AUDIO_SIZE_MB || 15) * 1024 * 1024;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const AUTO_CONVERT_WAV_TO_MP3 = process.env.AUTO_CONVERT_WAV_TO_MP3 !== "false";
const TARGET_MP3_BITRATE = process.env.TARGET_MP3_BITRATE || "128k";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav"
]);

const ALLOWED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav"]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const COVER_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif"]);
const TRACK_PUBLISH_MODES = new Set(["public", "draft", "private", "link", "premiere"]);
const LISTEN_MILESTONES = [25, 50, 100];
const LISTEN_HISTORY_LIMIT = 100;
const NOTIFICATIONS_PER_USER_LIMIT = 200;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_TOKEN_HASH_ALGO = "sha256";
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 0) || 0;
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "").trim();
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim()
  ? String(process.env.SMTP_SECURE).trim().toLowerCase() === "true"
  : SMTP_PORT === 465;
const SMTP_REQUIRE_TLS = String(process.env.SMTP_REQUIRE_TLS || "").trim().toLowerCase() === "true";
const SMTP_TLS_REJECT_UNAUTHORIZED = String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "").trim()
  ? String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED).trim().toLowerCase() !== "false"
  : true;
const SMTP_CONNECTION_TIMEOUT_MS = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000);
const SMTP_GREETING_TIMEOUT_MS = Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000);
const SMTP_SOCKET_TIMEOUT_MS = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000);
const MAIL_WRITE_OUTBOX_COPY = String(process.env.MAIL_WRITE_OUTBOX_COPY || "").trim().toLowerCase() === "true";
const SMTP_IS_CONFIGURED = Boolean(SMTP_HOST && SMTP_PORT && SMTP_FROM);
const GENIUS_ACCESS_TOKEN = String(process.env.GENIUS_ACCESS_TOKEN || "").trim();
const MAX_EXTERNAL_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_LYRICS_PLAIN_LENGTH = 50000;
const MAX_LYRICS_SYNC_LENGTH = 120000;
const MAX_GENIUS_QUERY_LENGTH = 200;
const MAX_REPORT_REASON_LENGTH = 120;
const MAX_REPORT_DETAILS_LENGTH = 1000;
const REPORT_TARGET_TYPES = new Set(["track", "user", "comment"]);
const REPORT_STATUSES = new Set(["open", "resolved", "dismissed"]);

const AUTH_RATE_LIMITS = {
  register: { windowMs: 15 * 60 * 1000, max: 5 },
  login: { windowMs: 10 * 60 * 1000, max: 12 },
  passwordResetRequest: { windowMs: 15 * 60 * 1000, max: 8 }
};

const SPAM_RULES = {
  comment: {
    cooldownMs: 6 * 1000,
    windowMs: 60 * 1000,
    maxPerWindow: 8,
    duplicateWindowMs: 60 * 1000
  },
  message: {
    cooldownMs: 2 * 1000,
    windowMs: 60 * 1000,
    maxPerWindow: 20,
    duplicateWindowMs: 30 * 1000
  }
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let writeQueue = Promise.resolve();
let ffmpegQueue = Promise.resolve();
const WS_PATH = "/ws";
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const wsClientsByUserId = new Map();
const authRateLimitBuckets = new Map();
const spamGuardBuckets = new Map();
let smtpTransporter = null;

function withWriteLock(task) {
  const next = writeQueue.then(task, task);
  writeQueue = next.catch(() => {});
  return next;
}

function withFfmpegQueue(task) {
  const next = ffmpegQueue.then(task, task);
  ffmpegQueue = next.catch(() => {});
  return next;
}

function isSubPath(parentPath, targetPath) {
  const relative = path.relative(parentPath, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function ensureStorage() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(AUDIO_DIR, { recursive: true });
  await fsp.mkdir(COVERS_DIR, { recursive: true });
  await fsp.mkdir(PROFILES_DIR, { recursive: true });
  await fsp.mkdir(TEMP_UPLOAD_DIR, { recursive: true });

  await ensureJsonFile(USERS_FILE, []);
  await ensureJsonFile(TRACKS_FILE, []);
  await ensureJsonFile(PLAYLISTS_FILE, []);
  await ensureJsonFile(ALBUMS_FILE, []);
  await ensureJsonFile(MESSAGES_FILE, []);
  await ensureJsonFile(NOTIFICATIONS_FILE, []);
  await ensureJsonFile(SESSIONS_FILE, {});
  await ensureJsonFile(PROMO_CODES_FILE, { codes: [] });
  await ensureJsonFile(REPORTS_FILE, []);
  await ensureJsonFile(EMAIL_TOKENS_FILE, { tokens: [] });
  await ensureJsonFile(MAIL_OUTBOX_FILE, []);

  // Инициализация системных промокодов
  await withWriteLock(async () => {
    const promoStore = await readJson(PROMO_CODES_FILE, { codes: [] });
    const { store: updatedStore, changed } = ensureSystemPromoCodes(promoStore);
    if (changed) {
      await writeJson(PROMO_CODES_FILE, updatedStore);
    }
  });
}

async function ensureJsonFile(filePath, fallbackData) {
  try {
    await fsp.access(filePath, fs.constants.F_OK);
  } catch {
    await writeJson(filePath, fallbackData);
  }
}

async function readJson(filePath, fallbackData) {
  try {
    const content = await fsp.readFile(filePath, "utf8");
    if (!content.trim()) {
      return fallbackData;
    }
    return JSON.parse(content);
  } catch {
    return fallbackData;
  }
}

async function writeJson(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tempPath, filePath);
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  const body = String(message || "");
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function requestJsonFromUrl(urlString, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const timeoutMs = Number(options.timeoutMs || 15000);
  const maxBytes = Number(options.maxBytes || MAX_EXTERNAL_RESPONSE_BYTES);
  let targetUrl = null;

  try {
    targetUrl = new URL(urlString);
  } catch {
    return Promise.reject(new Error("Некорректный внешний URL"));
  }

  const transport = targetUrl.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = transport.request(targetUrl, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": "sfera/1.0 (+https://sfera.fun)",
        ...(options.headers || {})
      }
    }, (response) => {
      const chunks = [];
      let totalBytes = 0;

      response.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          request.destroy(new Error("Ответ внешнего сервиса слишком большой"));
          return;
        }
        chunks.push(chunk);
      });

      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let data = null;

        try {
          data = body ? JSON.parse(body) : {};
        } catch {
          reject(new Error("Внешний сервис вернул невалидный JSON"));
          return;
        }

        resolve({
          statusCode: Number(response.statusCode || 0),
          headers: response.headers || {},
          data
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Таймаут внешнего сервиса"));
    });

    request.on("error", reject);
    request.end(options.body || undefined);
  });
}

function parseCookieHeader(header) {
  if (!header) {
    return {};
  }

  const cookies = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }
    cookies[rawKey] = decodeURIComponent(rest.join("=") || "");
  }

  return cookies;
}

function parseCookies(req) {
  return parseCookieHeader(req.headers.cookie);
}

function setSessionCookie(res, sessionId) {
  const cookie = [
    `sid=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`
  ].join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function createSession(sessionStore, userId) {
  const sid = crypto.randomBytes(32).toString("hex");
  const now = Date.now();

  sessionStore[sid] = {
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_SECONDS * 1000
  };

  return sid;
}

function cleanupExpiredSessions(sessionStore) {
  const now = Date.now();
  let changed = false;

  for (const sid of Object.keys(sessionStore)) {
    if (!sessionStore[sid] || sessionStore[sid].expiresAt <= now) {
      delete sessionStore[sid];
      changed = true;
    }
  }

  return changed;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const computed = hashPassword(password, salt).hash;
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(computed, "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, actual);
}

function generateTemporaryPassword(length = 14) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  const bytes = crypto.randomBytes(Math.max(length, 12) * 2);
  let password = "";

  for (let i = 0; i < bytes.length && password.length < length; i += 1) {
    password += alphabet[bytes[i] % alphabet.length];
  }

  return password;
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (normalized.length < 5 || normalized.length > 254) {
    throw new HttpError(400, "Email должен быть от 5 до 254 символов");
  }
  // Pragmatic validation: enough for user input, no exotic parser complexity.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new HttpError(400, "Введите корректный email");
  }
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 6 || password.length > 100) {
    throw new HttpError(400, "Пароль должен быть от 6 до 100 символов");
  }
}

function validateUsername(username) {
  if (username.length < 3 || username.length > 24) {
    throw new HttpError(400, "Никнейм должен быть от 3 до 24 символов");
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new HttpError(400, "Никнейм может содержать только буквы, цифры и _");
  }
}

function validateCredentials(username, password) {
  validateUsername(username);

  validatePassword(password);
}

function normalizeUserLanguage(value, fallback = "ru") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "ru" || normalized === "en" || normalized === "zh" || normalized === "uk") {
    return normalized;
  }
  return fallback;
}

function getClientIp(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").trim();
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = String(req?.headers?.["x-real-ip"] || "").trim();
  if (realIp) {
    return realIp;
  }
  return String(req?.socket?.remoteAddress || "unknown");
}

function pruneTimestampBucket(bucket, windowMs, now) {
  if (!Array.isArray(bucket.events)) {
    bucket.events = [];
  }
  bucket.events = bucket.events.filter((ts) => now - ts <= windowMs);
}

function enforceAuthRateLimit(req, action, options = {}) {
  const rule = AUTH_RATE_LIMITS[action];
  if (!rule) {
    return;
  }
  const now = Date.now();
  const ip = getClientIp(req);
  const extraKey = options.extraKey ? `:${String(options.extraKey)}` : "";
  const key = `${action}:${ip}${extraKey}`;
  const bucket = authRateLimitBuckets.get(key) || { events: [] };
  pruneTimestampBucket(bucket, rule.windowMs, now);

  if (bucket.events.length >= rule.max) {
    const retryAfterSec = Math.max(1, Math.ceil(rule.windowMs / 1000));
    const error = new HttpError(429, "Слишком много попыток. Попробуйте позже");
    error.retryAfterSec = retryAfterSec;
    throw error;
  }

  bucket.events.push(now);
  authRateLimitBuckets.set(key, bucket);
}

function hashTextFingerprint(text) {
  return crypto.createHash("sha1").update(String(text || ""), "utf8").digest("hex");
}

function enforceSpamGuard(kind, userId, text, scope = "") {
  const rule = SPAM_RULES[kind];
  if (!rule || !userId) {
    return;
  }

  const now = Date.now();
  const key = `${kind}:${userId}:${scope}`;
  const bucket = spamGuardBuckets.get(key) || {
    events: [],
    lastTextHash: "",
    lastTextAt: 0,
    lastAt: 0
  };

  pruneTimestampBucket(bucket, rule.windowMs, now);

  if (bucket.lastAt && now - bucket.lastAt < rule.cooldownMs) {
    const seconds = Math.ceil((rule.cooldownMs - (now - bucket.lastAt)) / 1000);
    throw new HttpError(429, `Слишком часто. Подождите ${Math.max(1, seconds)} сек.`);
  }

  if (bucket.events.length >= rule.maxPerWindow) {
    throw new HttpError(429, "Слишком много сообщений за короткое время. Подождите немного");
  }

  const textHash = hashTextFingerprint(String(text || "").trim().toLowerCase());
  if (
    bucket.lastTextHash &&
    textHash &&
    bucket.lastTextHash === textHash &&
    bucket.lastTextAt &&
    now - bucket.lastTextAt <= rule.duplicateWindowMs
  ) {
    throw new HttpError(429, "Похоже на повтор. Измени текст или подожди немного");
  }

  bucket.events.push(now);
  bucket.lastAt = now;
  bucket.lastTextHash = textHash;
  bucket.lastTextAt = now;
  spamGuardBuckets.set(key, bucket);
}

function createActionTokenPlain() {
  return crypto.randomBytes(24).toString("hex");
}

function hashActionToken(token) {
  return crypto
    .createHash(EMAIL_TOKEN_HASH_ALGO)
    .update(String(token || ""), "utf8")
    .digest("hex");
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_SIZE) {
        reject(new HttpError(413, "Слишком большой запрос"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new HttpError(400, "Невалидный JSON"));
      }
    });

    req.on("error", () => {
      reject(new HttpError(400, "Ошибка чтения тела запроса"));
    });
  });
}

function sanitizeBaseName(fileName) {
  return path.basename(String(fileName || "").trim());
}

function decodeBase64File(fileBase64, maxSize, fieldName) {
  if (typeof fileBase64 !== "string" || fileBase64.trim() === "") {
    throw new HttpError(400, `${fieldName}: пустой файл`);
  }

  let buffer;
  try {
    buffer = Buffer.from(fileBase64, "base64");
  } catch {
    throw new HttpError(400, `${fieldName}: неверный base64`);
  }

  if (!buffer.length) {
    throw new HttpError(400, `${fieldName}: файл пустой`);
  }

  if (buffer.length > maxSize) {
    throw new HttpError(413, `${fieldName}: слишком большой файл`);
  }

  return buffer;
}

function normalizeAudioMime(mimeType, fileName) {
  const mime = String(mimeType || "").toLowerCase();
  const ext = path.extname(String(fileName || "")).toLowerCase();

  if (mime === "audio/mp3" || mime === "audio/mpeg") {
    return "audio/mpeg";
  }

  if (mime === "audio/wav" || mime === "audio/x-wav") {
    return "audio/wav";
  }

  if (ext === ".mp3") {
    return "audio/mpeg";
  }

  if (ext === ".wav") {
    return "audio/wav";
  }

  return null;
}

function inferAudioExtension(fileName, mimeType) {
  const ext = path.extname(String(fileName || "")).toLowerCase();

  if (mimeType === "audio/wav") {
    return ".wav";
  }

  if (mimeType === "audio/mpeg") {
    return ".mp3";
  }

  if (ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
    return ext;
  }

  return ".mp3";
}

function inferImageExtension(fileName, mimeType) {
  const ext = path.extname(String(fileName || "")).toLowerCase();

  if (ext === ".gif") {
    return ".gif";
  }

  if (ext === ".png") {
    return ".png";
  }

  if (ext === ".jpg" || ext === ".jpeg") {
    return ".jpg";
  }

  if (mimeType === "image/gif") {
    return ".gif";
  }

  return mimeType === "image/png" ? ".png" : ".jpg";
}

async function storeBinaryFile(targetDir, extension, binaryData) {
  const fileName = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(targetDir, fileName);
  await fsp.writeFile(fullPath, binaryData);
  return fileName;
}

async function storeFileFromPath(sourcePath, targetDir, extension) {
  const fileName = `${crypto.randomUUID()}${extension}`;
  const fullPath = path.join(targetDir, fileName);
  await fsp.copyFile(sourcePath, fullPath);
  return fileName;
}

async function deleteFileSafe(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch {
    // ignore
  }
}

async function deleteDirectorySafe(dirPath) {
  if (!dirPath) {
    return;
  }

  try {
    await fsp.rm(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

async function parseMultipartForm(req, options = {}) {
  const {
    maxFiles = 8,
    maxFields = 64,
    maxFieldSize = 256 * 1024,
    maxFileSize = 80 * 1024 * 1024,
    maxTotalFileSize = 80 * 1024 * 1024
  } = options;

  return new Promise((resolve, reject) => {
    let aborted = false;
    const fields = {};
    const files = [];
    let totalFileSize = 0;
    const writeTasks = [];
    const tempPaths = [];

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: maxFiles,
        fields: maxFields,
        fieldSize: maxFieldSize,
        fileSize: maxFileSize
      }
    });

    const cleanupAndReject = async (error) => {
      if (aborted) {
        return;
      }
      aborted = true;
      req.unpipe(busboy);
      req.resume();
      await Promise.all(tempPaths.map((tempPath) => deleteFileSafe(tempPath)));
      reject(error);
    };

    busboy.on("field", (name, value) => {
      if (aborted) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(fields, name)) {
        if (Array.isArray(fields[name])) {
          fields[name].push(value);
        } else {
          fields[name] = [fields[name], value];
        }
      } else {
        fields[name] = value;
      }
    });

    busboy.on("file", (fieldName, fileStream, info) => {
      if (aborted) {
        fileStream.resume();
        return;
      }

      const originalName = sanitizeBaseName(info.filename || "");
      const mimeType = String(info.mimeType || "").toLowerCase();

      if (!originalName) {
        fileStream.resume();
        return;
      }

      const tempPath = path.join(TEMP_UPLOAD_DIR, `${crypto.randomUUID()}.part`);
      tempPaths.push(tempPath);

      let fileSize = 0;
      let finished = false;

      const writeStream = fs.createWriteStream(tempPath, { flags: "wx" });

      const task = new Promise((resolveTask, rejectTask) => {
        writeStream.on("finish", () => {
          finished = true;
          totalFileSize += fileSize;
          if (totalFileSize > maxTotalFileSize) {
            rejectTask(new HttpError(413, "Слишком большой общий размер файлов"));
            return;
          }
          files.push({
            fieldName,
            originalName,
            mimeType,
            size: fileSize,
            tempPath
          });
          resolveTask();
        });
        writeStream.on("error", (error) => {
          rejectTask(error);
        });
      });

      writeTasks.push(task);

      fileStream.on("data", (chunk) => {
        fileSize += chunk.length;
      });

      fileStream.on("limit", () => {
        if (!aborted) {
          cleanupAndReject(new HttpError(413, `Файл ${originalName} слишком большой`));
        }
      });

      fileStream.on("error", (error) => {
        if (!aborted) {
          cleanupAndReject(error);
        }
      });

      fileStream.pipe(writeStream);

      fileStream.on("end", () => {
        if (!finished) {
          writeStream.end();
        }
      });
    });

    busboy.on("filesLimit", () => {
      cleanupAndReject(new HttpError(413, "Слишком много файлов"));
    });

    busboy.on("fieldsLimit", () => {
      cleanupAndReject(new HttpError(413, "Слишком много полей формы"));
    });

    busboy.on("error", (error) => {
      cleanupAndReject(error);
    });

    busboy.on("finish", async () => {
      if (aborted) {
        return;
      }

      try {
        await Promise.all(writeTasks);
        resolve({ fields, files });
      } catch (error) {
        await cleanupAndReject(error instanceof HttpError ? error : new HttpError(400, "Ошибка обработки файла"));
      }
    });

    req.pipe(busboy);
  });
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        code: Number(code || 0),
        stdout,
        stderr
      });
    });
  });
}

async function getFileSize(filePath) {
  const stats = await fsp.stat(filePath);
  return stats.size;
}

async function convertWavFileToMp3(sourceWavPath) {
  const outputPath = path.join(TEMP_UPLOAD_DIR, `${crypto.randomUUID()}.mp3`);

  try {
    const result = await runProcess("ffmpeg", [
      "-y",
      "-i",
      sourceWavPath,
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      TARGET_MP3_BITRATE,
      "-ac",
      "2",
      "-ar",
      "44100",
      outputPath
    ]);

    if (result.code !== 0) {
      throw new Error(result.stderr || "ffmpeg exited with non-zero code");
    }

    return outputPath;
  } catch (error) {
    await deleteFileSafe(outputPath);

    if (error && error.code === "ENOENT") {
      throw new HttpError(
        500,
        "На сервере не установлен ffmpeg. Установите ffmpeg для конвертации WAV -> MP3."
      );
    }

    throw new HttpError(500, "Не удалось конвертировать WAV в MP3");
  }
}

async function probeAudioDurationSeconds(audioFilePath) {
  try {
    const result = await runProcess("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioFilePath
    ]);

    if (result.code !== 0) {
      return null;
    }

    const numeric = Number(String(result.stdout || "").trim());
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }

    return Math.max(1, Math.round(numeric));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

function uniqueStringArray(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(value);
  }

  return result;
}

function parseListInput(input, options) {
  const {
    fieldName,
    maxItems,
    maxLength,
    normalize = (value) => value,
    validator = () => true,
    required = false
  } = options;

  let values = [];

  if (Array.isArray(input)) {
    values = input.map((item) => String(item || "").trim());
  } else if (typeof input === "string") {
    values = input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  } else if (input === undefined || input === null) {
    values = [];
  } else {
    throw new HttpError(400, `${fieldName}: неверный формат`);
  }

  values = values.filter(Boolean).map(normalize);
  values = uniqueStringArray(values);

  if (required && values.length === 0) {
    throw new HttpError(400, `${fieldName}: поле обязательно`);
  }

  if (Number.isFinite(maxItems) && maxItems > 0 && values.length > maxItems) {
    throw new HttpError(400, `${fieldName}: максимум ${maxItems} значений`);
  }

  for (const value of values) {
    if (value.length < 1 || value.length > maxLength) {
      throw new HttpError(400, `${fieldName}: каждый элемент должен быть от 1 до ${maxLength} символов`);
    }

    if (!validator(value)) {
      throw new HttpError(400, `${fieldName}: недопустимое значение`);
    }
  }

  return values;
}

function normalizeTag(tag) {
  return String(tag || "").trim().replace(/^#+/, "").toLowerCase();
}

function normalizePublishMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (!mode) {
    return "public";
  }
  if (!TRACK_PUBLISH_MODES.has(mode)) {
    throw new HttpError(400, "Режим публикации недопустим");
  }
  return mode;
}

function parsePremiereAt(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, "Дата премьеры указана неверно");
  }

  return parsed.toISOString();
}

function sanitizeListenSource(source) {
  const normalized = String(source || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .slice(0, 40);

  return normalized || "unknown";
}

function buildEmptyListenStats() {
  return {
    retention: {
      "25": 0,
      "50": 0,
      "100": 0
    },
    dailyListens: {},
    sources: {}
  };
}
