
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

function validateOptionalUrlField(value, { fieldName, maxLength = 1000, allowedHosts = null } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (raw.length > maxLength) {
    throw new HttpError(400, `${fieldName} слишком длинный`);
  }

  let url = null;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `${fieldName}: некорректный URL`);
  }

  const protocol = String(url.protocol || "").toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw new HttpError(400, `${fieldName}: поддерживаются только http/https`);
  }

  if (allowedHosts && allowedHosts.size > 0) {
    const host = String(url.hostname || "").toLowerCase();
    if (!allowedHosts.has(host)) {
      throw new HttpError(400, `${fieldName}: разрешены только ссылки ${Array.from(allowedHosts).join(", ")}`);
    }
  }

  return url.toString();
}

function parseLyricsTimestampToMs(minutesRaw, secondsRaw, fractionRaw = "") {
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);
  if (!Number.isFinite(minutes) || minutes < 0 || !Number.isFinite(seconds) || seconds < 0 || seconds >= 60) {
    return null;
  }

  let milliseconds = 0;
  const fraction = String(fractionRaw || "").trim();
  if (fraction) {
    if (!/^\d{1,3}$/.test(fraction)) {
      return null;
    }
    if (fraction.length === 1) {
      milliseconds = Number(fraction) * 100;
    } else if (fraction.length === 2) {
      milliseconds = Number(fraction) * 10;
    } else {
      milliseconds = Number(fraction);
    }
  }

  return Math.max(0, Math.round(minutes * 60 * 1000 + seconds * 1000 + milliseconds));
}

function parseLyricsTimeToken(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?$/);
  if (!match) {
    return null;
  }
  return parseLyricsTimestampToMs(match[1], match[2], match[3] || "");
}

function estimateLyricsSegmentDurationMs(text) {
  const wordsCount = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.min(8000, Math.max(1, wordsCount) * 420));
}

function normalizeLyricsWords(rawWords) {
  if (!Array.isArray(rawWords)) {
    return [];
  }

  const words = [];
  for (const rawWord of rawWords) {
    if (!rawWord || typeof rawWord !== "object") {
      continue;
    }

    const text = String(rawWord.text ?? rawWord.word ?? rawWord.value ?? "").trim();
    const startCandidate = rawWord.startMs ?? rawWord.start ?? rawWord.time ?? rawWord.offsetMs;
    const endCandidate = rawWord.endMs ?? rawWord.end ?? rawWord.timeEnd ?? rawWord.durationEndMs;
    const startMs = Number(startCandidate);
    const endMs = endCandidate === undefined || endCandidate === null || String(endCandidate).trim?.() === ""
      ? null
      : Number(endCandidate);

    if (!text || !Number.isFinite(startMs) || startMs < 0) {
      continue;
    }

    words.push({
      text,
      startMs: Math.round(startMs),
      endMs: Number.isFinite(endMs) && endMs >= startMs ? Math.round(endMs) : null
    });
  }

  words.sort((left, right) => left.startMs - right.startMs);
  return words;
}

function finalizeLyricsSegments(segments) {
  const prepared = Array.isArray(segments) ? segments.filter(Boolean) : [];
  prepared.sort((left, right) => left.startMs - right.startMs);

  const result = [];
  for (let index = 0; index < prepared.length; index += 1) {
    const rawSegment = prepared[index];
    const nextSegment = prepared[index + 1] || null;
    const words = normalizeLyricsWords(rawSegment.words);
    let text = String(rawSegment.text || "").trim();
    let startMs = Number(rawSegment.startMs);
    let endMs = Number(rawSegment.endMs);

    if ((!text || !Number.isFinite(startMs)) && words.length > 0) {
      if (!text) {
        text = words.map((word) => word.text).join(" ");
      }
      if (!Number.isFinite(startMs)) {
        startMs = words[0].startMs;
      }
    }

    if (!text || !Number.isFinite(startMs) || startMs < 0) {
      continue;
    }

    const nextStartMs = nextSegment && Number.isFinite(nextSegment.startMs) ? Number(nextSegment.startMs) : null;
    for (let wordIndex = 0; wordIndex < words.length; wordIndex += 1) {
      const word = words[wordIndex];
      const nextWord = words[wordIndex + 1] || null;
      let wordEndMs = Number(word.endMs);
      if (!Number.isFinite(wordEndMs) || wordEndMs <= word.startMs) {
        if (nextWord && nextWord.startMs > word.startMs) {
          wordEndMs = nextWord.startMs;
        } else if (Number.isFinite(endMs) && endMs > word.startMs) {
          wordEndMs = endMs;
        } else if (Number.isFinite(nextStartMs) && nextStartMs > word.startMs) {
          wordEndMs = nextStartMs;
        } else {
          wordEndMs = word.startMs + 380;
        }
      }
      word.endMs = Math.max(word.startMs + 1, Math.round(wordEndMs));
    }

    if (!Number.isFinite(endMs) || endMs <= startMs) {
      if (words.length > 0) {
        endMs = words[words.length - 1].endMs;
      }
      if ((!Number.isFinite(endMs) || endMs <= startMs) && Number.isFinite(nextStartMs) && nextStartMs > startMs) {
        endMs = nextStartMs;
      }
      if (!Number.isFinite(endMs) || endMs <= startMs) {
        endMs = startMs + estimateLyricsSegmentDurationMs(text);
      }
    }

    result.push({
      text,
      startMs: Math.round(startMs),
      endMs: Math.max(Math.round(startMs) + 1, Math.round(endMs)),
      words
    });
  }

  return result;
}

function parseEnhancedLyricsWords(content) {
  const words = [];
  const wordTagPattern = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;
  let currentStartMs = null;
  let cursor = 0;

  for (const match of content.matchAll(wordTagPattern)) {
    if (currentStartMs !== null) {
      const tokenText = content.slice(cursor, match.index).replace(/\s+/g, " ").trim();
      if (tokenText) {
        words.push({
          text: tokenText,
          startMs: currentStartMs,
          endMs: null
        });
      }
    }

    currentStartMs = parseLyricsTimestampToMs(match[1], match[2], match[3] || "");
    cursor = match.index + match[0].length;
  }

  if (currentStartMs !== null) {
    const tailText = content.slice(cursor).replace(/\s+/g, " ").trim();
    if (tailText) {
      words.push({
        text: tailText,
        startMs: currentStartMs,
        endMs: null
      });
    }
  }

  return words;
}

function parseLyricsSegmentsFromJson(input) {
  let parsed = null;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new HttpError(400, "Синхронизация текста: JSON невалиден");
  }

  const rawSegments = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.segments)
      ? parsed.segments
      : [];

  return finalizeLyricsSegments(rawSegments.map((segment) => {
    if (!segment || typeof segment !== "object") {
      return null;
    }

    const text = String(segment.text ?? segment.line ?? segment.lyrics ?? "").trim();
    const startCandidate = segment.startMs ?? segment.start ?? segment.time ?? segment.offsetMs;
    const endCandidate = segment.endMs ?? segment.end ?? segment.timeEnd ?? segment.durationEndMs;
    const startMs = Number(startCandidate);
    const endMs = Number(endCandidate);

    return {
      text,
      startMs: Number.isFinite(startMs) && startMs >= 0 ? Math.round(startMs) : null,
      endMs: Number.isFinite(endMs) && endMs >= 0 ? Math.round(endMs) : null,
      words: Array.isArray(segment.words) ? segment.words : []
    };
  }));
}

function parseLyricsSegmentsFromText(input) {
  const lineTagPattern = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const segments = [];
  const lines = String(input || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = String(rawLine || "");
    const lineMatches = Array.from(line.matchAll(lineTagPattern));
    if (lineMatches.length === 0) {
      continue;
    }

    const content = line.replace(lineTagPattern, "").trim();
    const words = parseEnhancedLyricsWords(content);
    const segmentText = content.replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, "").replace(/\s+/g, " ").trim();

    for (const match of lineMatches) {
      const startMs = parseLyricsTimestampToMs(match[1], match[2], match[3] || "");
      if (startMs === null) {
        continue;
      }

      segments.push({
        text: segmentText,
        startMs,
        endMs: null,
        words: words.map((word) => ({
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs
        }))
      });
    }
  }

  return finalizeLyricsSegments(segments);
}

function normalizeTrackLyricsInput(input) {
  const plain = String(input?.plain || "").trim().slice(0, MAX_LYRICS_PLAIN_LENGTH);
  const syncText = String(input?.syncText || "").trim();

  if (syncText.length > MAX_LYRICS_SYNC_LENGTH) {
    throw new HttpError(400, "Синхронизация текста слишком длинная");
  }

  let segments = [];
  if (syncText) {
    const looksLikeJson = syncText.startsWith("{") || /^\[\s*(\{|\[|\])/.test(syncText);
    segments = looksLikeJson
      ? parseLyricsSegmentsFromJson(syncText)
      : parseLyricsSegmentsFromText(syncText);
  }

  const hasWordTimings = segments.some((segment) => Array.isArray(segment.words) && segment.words.length > 0);
  return {
    plain: plain || (segments.length > 0 ? segments.map((segment) => segment.text).join("\n") : ""),
    syncText,
    segments,
    hasWordTimings
  };
}

function normalizeTrackGeniusInput(input) {
  const allowedHosts = new Set(["genius.com", "www.genius.com"]);
  const songId = String(input?.songId || "").trim().slice(0, 64);
  const title = String(input?.title || "").trim().slice(0, 200);
  const artist = String(input?.artist || "").trim().slice(0, 200);
  const url = validateOptionalUrlField(input?.url, {
    fieldName: "Ссылка Genius",
    maxLength: 1000,
    allowedHosts
  });
  const imageUrl = validateOptionalUrlField(input?.imageUrl, {
    fieldName: "Картинка Genius",
    maxLength: 1500
  });

  return {
    songId,
    url,
    title,
    artist,
    imageUrl
  };
}

function validateTrackPayload(body, { isUpdate = false } = {}) {
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(body, key);

  const payload = {
    kind: undefined,
    isExplicit: undefined,
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
    lyrics: undefined,
    genius: undefined,
    audio: null,
    cover: null
  };

  if (!isUpdate || hasOwn("kind")) {
    payload.kind = normalizeTrackKind(body.kind);
  }

  if (!isUpdate || hasOwn("isExplicit")) {
    payload.isExplicit = parseExplicitTrackFlag(body.isExplicit);
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
      maxItems: 100,
      maxLength: 60,
      required: false
    });
  }

  if (!isUpdate || hasOwn("producers")) {
    payload.producers = parseListInput(body.producers, {
      fieldName: "Продюсеры",
      maxItems: 100,
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

  if (!isUpdate || hasOwn("lyricsPlain") || hasOwn("lyricsSyncText")) {
    payload.lyrics = normalizeTrackLyricsInput({
      plain: body.lyricsPlain,
      syncText: body.lyricsSyncText
    });
  }

  if (
    !isUpdate ||
    hasOwn("geniusSongId") ||
    hasOwn("geniusUrl") ||
    hasOwn("geniusTitle") ||
    hasOwn("geniusArtist") ||
    hasOwn("geniusImageUrl")
  ) {
    payload.genius = normalizeTrackGeniusInput({
      songId: body.geniusSongId,
      url: body.geniusUrl,
      title: body.geniusTitle,
      artist: body.geniusArtist,
      imageUrl: body.geniusImageUrl
    });
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
    isExplicit: undefined,
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
    lyrics: undefined,
    genius: undefined,
    audio: null,
    cover: null
  };

  if (!isUpdate || hasOwnField(fields, "kind")) {
    payload.kind = normalizeTrackKind(getSingleFieldValue(fields, "kind"));
  }

  if (!isUpdate || hasOwnField(fields, "isExplicit")) {
    payload.isExplicit = parseExplicitTrackFlag(getSingleFieldValue(fields, "isExplicit"));
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
      maxItems: 100,
      maxLength: 60,
      required: false
    });
  }

  if (!isUpdate || hasOwnField(fields, "producers")) {
    payload.producers = parseListInput(getSingleFieldValue(fields, "producers"), {
      fieldName: "Продюсеры",
      maxItems: 100,
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

  if (!isUpdate || hasOwnField(fields, "lyricsPlain") || hasOwnField(fields, "lyricsSyncText")) {
    payload.lyrics = normalizeTrackLyricsInput({
      plain: getSingleFieldValue(fields, "lyricsPlain"),
      syncText: getSingleFieldValue(fields, "lyricsSyncText")
    });
  }

  if (
    !isUpdate ||
    hasOwnField(fields, "geniusSongId") ||
    hasOwnField(fields, "geniusUrl") ||
    hasOwnField(fields, "geniusTitle") ||
    hasOwnField(fields, "geniusArtist") ||
    hasOwnField(fields, "geniusImageUrl")
  ) {
    payload.genius = normalizeTrackGeniusInput({
      songId: getSingleFieldValue(fields, "geniusSongId"),
      url: getSingleFieldValue(fields, "geniusUrl"),
      title: getSingleFieldValue(fields, "geniusTitle"),
      artist: getSingleFieldValue(fields, "geniusArtist"),
      imageUrl: getSingleFieldValue(fields, "geniusImageUrl")
    });
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

function parseExplicitTrackFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new HttpError(400, "Некорректное значение метки E");
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
    maxItems: 100,
    maxLength: 60,
    required: false
  });

  const producers = parseListInput(body.producers, {
    fieldName: "Продюсеры",
    maxItems: 100,
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
    maxItems: 1000,
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

  if (!COVER_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new HttpError(400, "Обложка должна быть PNG, JPG или GIF");
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

  const processedAudio = await processAudioFile({
    ...fileEntry,
    mimeType: normalizedAudioMime
  });

  return {
    ...fileEntry,
    size: sourceSize,
    ...processedAudio
  };
}
