
function sanitizePositiveCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function sanitizeDurationSeconds(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.max(1, Math.round(numeric));
}

function normalizeTrackKind(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "beat") {
    return "beat";
  }
  return "song";
}

function sanitizeBeatBpm(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const bpm = Number(String(value).trim());
  if (!Number.isFinite(bpm)) {
    return null;
  }
  const rounded = Math.round(bpm);
  if (rounded < 1 || rounded > 400) {
    return null;
  }
  return rounded;
}

function sanitizeBeatRootNote(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim().slice(0, 12);
}

function normalizeBeatLicenses(input) {
  let items = [];
  if (input === undefined || input === null || input === "") {
    return [];
  }

  if (typeof input === "string") {
    try {
      items = JSON.parse(input);
    } catch {
      throw new HttpError(400, "Некорректный формат лицензий бита");
    }
  } else if (Array.isArray(input)) {
    items = input;
  } else {
    throw new HttpError(400, "Некорректный формат лицензий бита");
  }

  if (!Array.isArray(items)) {
    throw new HttpError(400, "Лицензии бита должны быть массивом");
  }

  const allowedTypes = new Set(["mp3", "wav", "trackout", "exclusive"]);
  const seen = new Set();
  const result = [];

  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const type = String(raw.type || "").trim().toLowerCase();
    if (!allowedTypes.has(type) || seen.has(type)) {
      continue;
    }
    const currency = String(raw.currency || "RUB").trim().toUpperCase() === "USD" ? "USD" : "RUB";
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000000) {
      throw new HttpError(400, `Некорректная цена лицензии ${type}`);
    }
    seen.add(type);
    result.push({
      type,
      price: Math.round(price),
      currency
    });
  }

  return result;
}

function ensureListenStatsStructure(track) {
  if (!track.listenStats || typeof track.listenStats !== "object") {
    track.listenStats = buildEmptyListenStats();
  }

  if (!track.listenStats.retention || typeof track.listenStats.retention !== "object") {
    track.listenStats.retention = { "25": 0, "50": 0, "100": 0 };
  }

  for (const milestone of LISTEN_MILESTONES) {
    const key = String(milestone);
    track.listenStats.retention[key] = sanitizePositiveCounter(track.listenStats.retention[key]);
  }

  if (!track.listenStats.dailyListens || typeof track.listenStats.dailyListens !== "object") {
    track.listenStats.dailyListens = {};
  } else {
    const normalizedDaily = {};
    for (const [day, count] of Object.entries(track.listenStats.dailyListens)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        continue;
      }
      normalizedDaily[day] = sanitizePositiveCounter(count);
    }
    track.listenStats.dailyListens = normalizedDaily;
  }

  if (!track.listenStats.sources || typeof track.listenStats.sources !== "object") {
    track.listenStats.sources = {};
  } else {
    const normalizedSources = {};
    for (const [source, count] of Object.entries(track.listenStats.sources)) {
      const key = sanitizeListenSource(source);
      normalizedSources[key] = (normalizedSources[key] || 0) + sanitizePositiveCounter(count);
    }
    track.listenStats.sources = normalizedSources;
  }
}

function incrementCounterRecord(record, key, amount = 1) {
  const normalizedAmount = sanitizePositiveCounter(amount);
  if (normalizedAmount <= 0) {
    return;
  }
  record[key] = sanitizePositiveCounter(record[key]) + normalizedAmount;
}

function getUtcDateKey(inputDate = new Date()) {
  const date = inputDate instanceof Date ? inputDate : new Date(inputDate);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

function normalizeListenMilestone(body) {
  const explicitMilestone = Number(body.milestone);
  if (LISTEN_MILESTONES.includes(explicitMilestone)) {
    return explicitMilestone;
  }

  const progress = Number(body.progress);
  if (!Number.isFinite(progress) || progress < 0.25 || progress > 1.2) {
    throw new HttpError(400, "Прослушивание засчитывается после 25% трека");
  }

  if (progress >= 1) {
    return 100;
  }
  if (progress >= 0.5) {
    return 50;
  }
  return 25;
}

function upsertUserListenHistory(user, trackId, milestone, progress = null) {
  if (!Array.isArray(user.listenHistory)) {
    user.listenHistory = [];
  }

  const nowIso = new Date().toISOString();
  const normalizedProgress = Number.isFinite(Number(progress))
    ? Math.max(0, Math.min(1.2, Number(progress)))
    : milestone / 100;

  const nextEntry = {
    trackId,
    listenedAt: nowIso,
    milestone,
    progress: normalizedProgress
  };

  const existingIndex = user.listenHistory.findIndex((entry) => entry && entry.trackId === trackId);
  if (existingIndex >= 0) {
    const existing = user.listenHistory[existingIndex] || {};
    const previousProgress = Number(existing.progress);
    const previousMilestone = Number(existing.milestone);
    if (Number.isFinite(previousProgress)) {
      nextEntry.progress = Math.max(nextEntry.progress, previousProgress);
    }
    if (Number.isFinite(previousMilestone)) {
      nextEntry.milestone = Math.max(nextEntry.milestone, previousMilestone);
    }
    user.listenHistory.splice(existingIndex, 1);
  }

  user.listenHistory.unshift(nextEntry);
  if (user.listenHistory.length > LISTEN_HISTORY_LIMIT) {
    user.listenHistory.length = LISTEN_HISTORY_LIMIT;
  }
}

function isPremiereLive(track) {
  if (track.publishMode !== "premiere") {
    return true;
  }

  const timestamp = Date.parse(track.premiereAt || "");
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return Date.now() >= timestamp;
}

function canViewTrack(track, currentUserId, { direct = false } = {}) {
  ensureTrackStructure(track);

  if (currentUserId && track.userId === currentUserId) {
    return true;
  }

  switch (track.publishMode) {
    case "draft":
    case "private":
      return false;
    case "link":
      return Boolean(direct);
    case "premiere":
      return isPremiereLive(track);
    case "public":
    default:
      return true;
  }
}

function canListTrack(track, currentUserId) {
  ensureTrackStructure(track);

  if (currentUserId && track.userId === currentUserId) {
    return true;
  }

  if (!canViewTrack(track, currentUserId, { direct: false })) {
    return false;
  }

  return track.publishMode !== "link";
}

function validateTrackPayload(body, { isUpdate = false } = {}) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const payload = {
    kind: undefined,
    title: undefined,
    description: undefined,
    genre: undefined,
    authors: undefined,
    producers: undefined,
    hashtags: undefined,
    publishMode: undefined,
    premiereAt: undefined,
    durationSec: undefined,
    bpm: undefined,
    rootNote: undefined,
    beatLicenses: undefined,
    audio: null,
    cover: null
  };

  if (!isUpdate || hasOwn("kind")) {
    payload.kind = normalizeTrackKind(body.kind);
  }

  if (!isUpdate || hasOwn("title")) {
    const title = String(body.title || "").trim();
    if (title.length < 1 || title.length > 120) {
      throw new HttpError(400, "Название трека должно быть от 1 до 120 символов");
    }
    payload.title = title;
  }

  if (!isUpdate || hasOwn("description")) {
    const description = String(body.description || "").trim();
    if (description.length > 1000) {
      throw new HttpError(400, "Описание трека не должно превышать 1000 символов");
    }
    payload.description = description;
  }

  if (!isUpdate || hasOwn("genre")) {
    const genre = String(body.genre || "").trim();
    if (genre.length < 1 || genre.length > 60) {
      throw new HttpError(400, "Жанр должен быть от 1 до 60 символов");
    }
    payload.genre = genre;
  }

  if (!isUpdate || hasOwn("authors")) {
    payload.authors = parseListInput(body.authors, {
      fieldName: "Авторы",
      maxItems: 10,
      maxLength: 60,
      required: false
    });
  }

  if (!isUpdate || hasOwn("producers")) {
    payload.producers = parseListInput(body.producers, {
      fieldName: "Продюсеры",
      maxItems: 10,
      maxLength: 60,
      required: false
    });
  }

  if (!isUpdate || hasOwn("hashtags")) {
    payload.hashtags = parseListInput(body.hashtags, {
      fieldName: "Хештеги",
      maxItems: 5,
      maxLength: 30,
      required: false,
      normalize: normalizeTag,
      validator: (value) => /^[a-zа-яё0-9_]+$/i.test(value)
    });
  }

  if (!isUpdate || hasOwn("publishMode")) {
    payload.publishMode = normalizePublishMode(body.publishMode);
  }

  if (!isUpdate || hasOwn("premiereAt")) {
    payload.premiereAt = parsePremiereAt(body.premiereAt);
  }

  if (!isUpdate || hasOwn("durationSec")) {
    if (body.durationSec === undefined || body.durationSec === null || String(body.durationSec).trim() === "") {
      payload.durationSec = isUpdate ? undefined : null;
    } else {
      payload.durationSec = sanitizeDurationSeconds(body.durationSec);
      if (!payload.durationSec) {
        throw new HttpError(400, "Некорректная длительность трека");
      }
    }
  }

  if (!isUpdate || hasOwn("bpm")) {
    const bpm = sanitizeBeatBpm(body.bpm);
    if (body.bpm !== undefined && body.bpm !== null && String(body.bpm).trim() !== "" && bpm === null) {
      throw new HttpError(400, "BPM должен быть от 1 до 400");
    }
    payload.bpm = bpm;
  }

  if (!isUpdate || hasOwn("rootNote")) {
    const rootNote = sanitizeBeatRootNote(body.rootNote);
    if (String(body.rootNote || "").length > 0 && !rootNote) {
      throw new HttpError(400, "Некорректная корневая нота");
    }
    payload.rootNote = rootNote;
  }

  if (!isUpdate || hasOwn("beatLicenses")) {
    payload.beatLicenses = normalizeBeatLicenses(body.beatLicenses);
  }

  const hasAudioFields = hasOwn("fileBase64") || hasOwn("fileName") || hasOwn("mimeType");
  if (!isUpdate || hasAudioFields) {
    const fileBase64 = String(body.fileBase64 || "").trim();
    const fileName = sanitizeBaseName(body.fileName);
    const mimeType = String(body.mimeType || "").toLowerCase();

    if (!isUpdate && (!fileBase64 || !fileName || !mimeType)) {
      throw new HttpError(400, "Аудиофайл обязателен");
    }

    if (fileBase64 || fileName || mimeType) {
      if (!fileBase64 || !fileName || !mimeType) {
        throw new HttpError(400, "Для обновления аудио передайте fileBase64, fileName и mimeType");
      }

      payload.audio = { fileBase64, fileName, mimeType };
    }
  }

  const hasCoverFields = hasOwn("coverBase64") || hasOwn("coverFileName") || hasOwn("coverMimeType");
  if (!isUpdate || hasCoverFields) {
    const fileBase64 = String(body.coverBase64 || "").trim();
    const fileName = sanitizeBaseName(body.coverFileName);
    const mimeType = String(body.coverMimeType || "").toLowerCase();

    if (!isUpdate && (!fileBase64 || !fileName || !mimeType)) {
      throw new HttpError(400, "Обложка обязательна");
    }

    if (fileBase64 || fileName || mimeType) {
      if (!fileBase64 || !fileName || !mimeType) {
        throw new HttpError(400, "Для обновления обложки передайте coverBase64, coverFileName и coverMimeType");
      }

      payload.cover = { fileBase64, fileName, mimeType };
    }
  }

  if (!isUpdate && payload.publishMode === "premiere" && !payload.premiereAt) {
    throw new HttpError(400, "Для премьеры укажите дату и время");
  }

  if (!isUpdate && payload.premiereAt !== null && payload.publishMode !== "premiere") {
    throw new HttpError(400, "Дата премьеры доступна только для режима «Премьера по времени»");
  }

  const trackKind = payload.kind !== undefined ? payload.kind : "song";
  if (trackKind === "beat") {
    if (!isUpdate && !payload.bpm) {
      throw new HttpError(400, "Для бита укажите BPM");
    }
    if (!isUpdate && !sanitizeBeatRootNote(payload.rootNote)) {
      throw new HttpError(400, "Для бита укажите корневую ноту");
    }
  }

  return payload;
}

function hasOwnField(fields, name) {
  return Object.prototype.hasOwnProperty.call(fields, name);
}

function getSingleFieldValue(fields, name) {
  if (!hasOwnField(fields, name)) {
    return undefined;
  }

  const raw = fields[name];
  if (Array.isArray(raw)) {
    return String(raw[raw.length - 1] || "");
  }

  return String(raw || "");
}

function getSingleMultipartFile(files, fieldName) {
  const matched = files.filter((entry) => entry.fieldName === fieldName);

  if (matched.length > 1) {
    throw new HttpError(400, `Поле ${fieldName} должно содержать только один файл`);
  }

  return matched[0] || null;
}

function parseTrackMultipartPayload(multipart, { isUpdate = false } = {}) {
  const { fields, files } = multipart;
  const payload = {
    kind: undefined,
    title: undefined,
    description: undefined,
    genre: undefined,
    authors: undefined,
    producers: undefined,
    hashtags: undefined,
    publishMode: undefined,
    premiereAt: undefined,
    durationSec: undefined,
    bpm: undefined,
    rootNote: undefined,
    beatLicenses: undefined,
    audio: null,
    cover: null
  };

  if (!isUpdate || hasOwnField(fields, "kind")) {
    payload.kind = normalizeTrackKind(getSingleFieldValue(fields, "kind"));
  }

  if (!isUpdate || hasOwnField(fields, "title")) {
    const title = String(getSingleFieldValue(fields, "title") || "").trim();
    if (title.length < 1 || title.length > 120) {
      throw new HttpError(400, "Название трека должно быть от 1 до 120 символов");
    }
    payload.title = title;
  }

  if (!isUpdate || hasOwnField(fields, "description")) {
    const description = String(getSingleFieldValue(fields, "description") || "").trim();
    if (description.length > 1000) {
      throw new HttpError(400, "Описание трека не должно превышать 1000 символов");
    }
    payload.description = description;
  }

  if (!isUpdate || hasOwnField(fields, "genre")) {
    const genre = String(getSingleFieldValue(fields, "genre") || "").trim();
    if (genre.length < 1 || genre.length > 60) {
      throw new HttpError(400, "Жанр должен быть от 1 до 60 символов");
    }
    payload.genre = genre;
  }

  if (!isUpdate || hasOwnField(fields, "authors")) {
    payload.authors = parseListInput(getSingleFieldValue(fields, "authors"), {
      fieldName: "Авторы",
      maxItems: 10,
      maxLength: 60,
      required: false
    });
  }

  if (!isUpdate || hasOwnField(fields, "producers")) {
    payload.producers = parseListInput(getSingleFieldValue(fields, "producers"), {
      fieldName: "Продюсеры",
      maxItems: 10,
      maxLength: 60,
      required: false
    });
  }

  if (!isUpdate || hasOwnField(fields, "hashtags")) {
    payload.hashtags = parseListInput(getSingleFieldValue(fields, "hashtags"), {
      fieldName: "Хештеги",
      maxItems: 5,
      maxLength: 30,
      required: false,
      normalize: normalizeTag,
      validator: (value) => /^[a-zа-яё0-9_]+$/i.test(value)
    });
  }

  if (!isUpdate || hasOwnField(fields, "publishMode")) {
    payload.publishMode = normalizePublishMode(getSingleFieldValue(fields, "publishMode"));
  }

  if (!isUpdate || hasOwnField(fields, "premiereAt")) {
    payload.premiereAt = parsePremiereAt(getSingleFieldValue(fields, "premiereAt"));
  }

  if (!isUpdate || hasOwnField(fields, "durationSec")) {
    const rawDuration = String(getSingleFieldValue(fields, "durationSec") || "").trim();
    if (!rawDuration) {
      payload.durationSec = isUpdate ? undefined : null;
    } else {
      payload.durationSec = sanitizeDurationSeconds(rawDuration);
      if (!payload.durationSec) {
        throw new HttpError(400, "Некорректная длительность трека");
      }
    }
  }

  if (!isUpdate || hasOwnField(fields, "bpm")) {
    const rawBpm = getSingleFieldValue(fields, "bpm");
    const bpm = sanitizeBeatBpm(rawBpm);
    if (String(rawBpm || "").trim() && bpm === null) {
      throw new HttpError(400, "BPM должен быть от 1 до 400");
    }
    payload.bpm = bpm;
  }

  if (!isUpdate || hasOwnField(fields, "rootNote")) {
    payload.rootNote = sanitizeBeatRootNote(getSingleFieldValue(fields, "rootNote"));
  }

  if (!isUpdate || hasOwnField(fields, "beatLicenses")) {
    payload.beatLicenses = normalizeBeatLicenses(getSingleFieldValue(fields, "beatLicenses"));
  }

  payload.audio = getSingleMultipartFile(files, "audio");
  payload.cover = getSingleMultipartFile(files, "cover");

  if (!isUpdate && !payload.audio) {
    throw new HttpError(400, "Аудиофайл обязателен");
  }

  if (!isUpdate && !payload.cover) {
    throw new HttpError(400, "Обложка обязательна");
  }

  if (!isUpdate && payload.publishMode === "premiere" && !payload.premiereAt) {
    throw new HttpError(400, "Для премьеры укажите дату и время");
  }

  if (!isUpdate && payload.premiereAt !== null && payload.publishMode !== "premiere") {
    throw new HttpError(400, "Дата премьеры доступна только для режима «Премьера по времени»");
  }

  const trackKind = payload.kind !== undefined ? payload.kind : "song";
  if (trackKind === "beat") {
    if (!isUpdate && !payload.bpm) {
      throw new HttpError(400, "Для бита укажите BPM");
    }
    if (!isUpdate && !sanitizeBeatRootNote(payload.rootNote)) {
      throw new HttpError(400, "Для бита укажите корневую ноту");
    }
  }

  return payload;
}

function parseAlbumPayloadFromBody(body) {
  const title = String(body.title || "").trim();
  if (title.length < 1 || title.length > 120) {
    throw new HttpError(400, "Название альбома должно быть от 1 до 120 символов");
  }

  const description = String(body.description || "").trim();
  if (description.length > 1000) {
    throw new HttpError(400, "Описание альбома не должно превышать 1000 символов");
  }

  const genre = String(body.genre || "").trim();
  if (genre.length < 1 || genre.length > 60) {
    throw new HttpError(400, "Жанр должен быть от 1 до 60 символов");
  }

  const authors = parseListInput(body.authors, {
    fieldName: "Авторы",
    maxItems: 10,
    maxLength: 60,
    required: false
  });

  const producers = parseListInput(body.producers, {
    fieldName: "Продюсеры",
    maxItems: 10,
    maxLength: 60,
    required: false
  });

  const hashtags = parseListInput(body.hashtags, {
    fieldName: "Хештеги",
    maxItems: 5,
    maxLength: 30,
    required: false,
    normalize: normalizeTag,
    validator: (value) => /^[a-zа-яё0-9_]+$/i.test(value)
  });

  const trackIds = parseListInput(body.trackIds, {
    fieldName: "Треки альбома",
    maxLength: 64,
    required: true
  });

  let cover = null;
  const hasCoverFields =
    Object.prototype.hasOwnProperty.call(body, "coverBase64") ||
    Object.prototype.hasOwnProperty.call(body, "coverFileName") ||
    Object.prototype.hasOwnProperty.call(body, "coverMimeType");
  if (hasCoverFields) {
    const fileBase64 = String(body.coverBase64 || "").trim();
    const fileName = sanitizeBaseName(body.coverFileName);
    const mimeType = String(body.coverMimeType || "").toLowerCase();

    if (!fileBase64 || !fileName || !mimeType) {
      throw new HttpError(400, "Для обложки альбома передайте coverBase64, coverFileName и coverMimeType");
    }
    cover = { fileBase64, fileName, mimeType };
  }

  return {
    title,
    description,
    genre,
    authors,
    producers,
    hashtags,
    trackIds,
    cover
  };
}

function parseAlbumPayloadFromMultipart(multipart) {
  const { fields, files } = multipart;
  const payload = parseAlbumPayloadFromBody({
    title: getSingleFieldValue(fields, "title"),
    description: getSingleFieldValue(fields, "description"),
    genre: getSingleFieldValue(fields, "genre"),
    authors: getSingleFieldValue(fields, "authors"),
    producers: getSingleFieldValue(fields, "producers"),
    hashtags: getSingleFieldValue(fields, "hashtags"),
    trackIds: getSingleFieldValue(fields, "trackIds")
  });

  payload.cover = getSingleMultipartFile(files, "cover");
  return payload;
}

function isMultipartRequest(req) {
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  return contentType.startsWith("multipart/form-data");
}

async function writeTempBinaryFile(binaryData, extension = ".bin") {
  const safeExtension = /^(\.[a-z0-9]+)$/i.test(extension) ? extension : ".bin";
  const tempPath = path.join(TEMP_UPLOAD_DIR, `${crypto.randomUUID()}${safeExtension}`);
  await fsp.writeFile(tempPath, binaryData);
  return tempPath;
}

async function toAudioFileEntry(upload, cleanupPaths) {
  if (!upload) {
    return null;
  }

  if (typeof upload === "object" && upload.tempPath) {
    return upload;
  }

  const fileName = sanitizeBaseName(upload.fileName);
  const mimeType = String(upload.mimeType || "").toLowerCase();
  const normalizedAudioMime = normalizeAudioMime(mimeType, fileName);

  if (!normalizedAudioMime) {
    throw new HttpError(400, "Можно загружать только MP3 или WAV");
  }

  if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType) && !ALLOWED_AUDIO_EXTENSIONS.has(path.extname(fileName).toLowerCase())) {
    throw new HttpError(400, "Можно загружать только MP3 или WAV");
  }

  const uploadLimit = normalizedAudioMime === "audio/wav" ? MAX_WAV_UPLOAD_SIZE : MAX_MP3_UPLOAD_SIZE;
  const binary = decodeBase64File(upload.fileBase64, uploadLimit, "Аудио");
  const extension = inferAudioExtension(fileName, normalizedAudioMime);
  const tempPath = await writeTempBinaryFile(binary, extension);

  cleanupPaths.push(tempPath);

  return {
    fieldName: "audio",
    originalName: fileName,
    mimeType,
    size: binary.length,
    tempPath
  };
}

async function toCoverFileEntry(upload, cleanupPaths) {
  if (!upload) {
    return null;
  }

  if (typeof upload === "object" && upload.tempPath) {
    return upload;
  }

  const fileName = sanitizeBaseName(upload.fileName);
  const mimeType = String(upload.mimeType || "").toLowerCase();

  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    throw new HttpError(400, "Обложка должна быть PNG или JPG");
  }

  const binary = decodeBase64File(upload.fileBase64, MAX_IMAGE_SIZE, "Обложка");
  const extension = inferImageExtension(fileName, mimeType);
  const tempPath = await writeTempBinaryFile(binary, extension);

  cleanupPaths.push(tempPath);

  return {
    fieldName: "cover",
    originalName: fileName,
    mimeType,
    size: binary.length,
    tempPath
  };
}

async function cleanupTempFiles(paths) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));
  await Promise.all(uniquePaths.map((filePath) => deleteFileSafe(filePath)));
}

async function prepareImageFile(fileBase64, fileName, mimeType, maxSize = MAX_IMAGE_SIZE) {
  const cleanFileName = sanitizeBaseName(fileName);
  const normalizedMime = String(mimeType || "").toLowerCase();

  if (!IMAGE_MIME_TYPES.has(normalizedMime)) {
    throw new HttpError(400, "Изображение должно быть PNG или JPG");
  }

  const binary = decodeBase64File(fileBase64, maxSize, "Изображение");
  const extension = inferImageExtension(cleanFileName, normalizedMime);
  const finalFileName = `${crypto.randomUUID()}${extension}`;
  const buffer = Buffer.from(binary);

  return {
    fileName: finalFileName,
    buffer,
    mimeType: normalizedMime,
    size: binary.length
  };
}

async function saveImage(fileName, buffer, targetDir = PROFILES_DIR) {
  const filePath = path.join(targetDir, fileName);
  await fsp.writeFile(filePath, buffer);
  return filePath;
}

async function ensureValidAudioUpload(fileEntry) {
  if (!fileEntry) {
    throw new HttpError(400, "Аудиофайл обязателен");
  }

  let normalizedAudioMime = normalizeAudioMime(fileEntry.mimeType, fileEntry.originalName);
  if (!normalizedAudioMime) {
    throw new HttpError(400, "Можно загружать только MP3 или WAV");
  }

  if (
    !ALLOWED_AUDIO_MIME_TYPES.has(fileEntry.mimeType) &&
    !ALLOWED_AUDIO_EXTENSIONS.has(path.extname(fileEntry.originalName).toLowerCase())
  ) {
    throw new HttpError(400, "Можно загружать только MP3 или WAV");
  }

  const uploadLimit = normalizedAudioMime === "audio/wav" ? MAX_WAV_UPLOAD_SIZE : MAX_MP3_UPLOAD_SIZE;
  const sourceSize = await getFileSize(fileEntry.tempPath);
  if (sourceSize > uploadLimit) {
    throw new HttpError(413, "Аудиофайл превышает разрешенный размер");
  }

  return {
    ...fileEntry,
    mimeType: normalizedAudioMime,
    size: sourceSize
  };
}
