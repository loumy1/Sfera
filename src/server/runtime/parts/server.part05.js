"use strict";

const os = require("os");

async function handleApi(req, res, pathname, currentUser) {
  const method = req.method;
  let normalizedPathname = String(pathname || "");

  // Backward compatibility for old frontend that may call /api/auth/*
  if (normalizedPathname.startsWith("/api/auth/")) {
    normalizedPathname = `/api/${normalizedPathname.slice("/api/auth/".length)}`;
  }

  pathname = normalizedPathname;

  if (!currentUser) {
    currentUser = await getCurrentUser(req);
  }

  let requestUrl = null;
  try {
    requestUrl = req.url
      ? new URL(req.url, `http://${req.headers.host || "localhost"}`)
      : null;
  } catch {
    requestUrl = null;
  }

  const getQueryParam = (key, fallback = "") => {
    if (!requestUrl) {
      return fallback;
    }
    return String(requestUrl.searchParams.get(key) || fallback);
  };

  const normalizeAdminQuery = (value) => String(value || "").trim().toLowerCase();

  const scoreSearchMatch = (values, query) => {
    const normalizedQuery = normalizeAdminQuery(query);
    if (!normalizedQuery) {
      return 1;
    }

    const list = Array.isArray(values) ? values : [values];
    let bestScore = 0;

    for (const candidateValue of list) {
      const candidate = normalizeAdminQuery(candidateValue);
      if (!candidate) {
        continue;
      }
      if (candidate === normalizedQuery) {
        bestScore = Math.max(bestScore, 500);
        continue;
      }
      if (candidate.startsWith(normalizedQuery)) {
        bestScore = Math.max(bestScore, 320);
        continue;
      }
      if (candidate.includes(normalizedQuery)) {
        bestScore = Math.max(bestScore, 180);
        continue;
      }
      const words = candidate.split(/[\s,./:_-]+/).filter(Boolean);
      if (words.some((word) => word.startsWith(normalizedQuery))) {
        bestScore = Math.max(bestScore, 120);
      }
    }

    return bestScore;
  };

  const ensureReportRecord = (raw) => {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const targetId = String(raw.targetId || "").trim();
    const reporterUserId = String(raw.reporterUserId || "").trim();
    if (!targetId || !reporterUserId) {
      return null;
    }

    const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString();
    const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt;
    const status = REPORT_STATUSES.has(String(raw.status || "").trim())
      ? String(raw.status || "").trim()
      : "open";
    const targetType = REPORT_TARGET_TYPES.has(String(raw.targetType || "").trim())
      ? String(raw.targetType || "").trim()
      : "track";

    return {
      id: String(raw.id || crypto.randomUUID()),
      targetType,
      targetId,
      targetTrackId: String(raw.targetTrackId || "").trim(),
      targetTrackTitle: String(raw.targetTrackTitle || "").trim().slice(0, 160),
      reporterUserId,
      reporterUsername: String(raw.reporterUsername || "").trim().slice(0, 80),
      reason: String(raw.reason || "").trim().slice(0, MAX_REPORT_REASON_LENGTH),
      details: String(raw.details || "").trim().slice(0, MAX_REPORT_DETAILS_LENGTH),
      targetTitle: String(raw.targetTitle || "").trim().slice(0, 160),
      targetUsername: String(raw.targetUsername || "").trim().slice(0, 80),
      targetKind: String(raw.targetKind || "").trim().slice(0, 24),
      status,
      createdAt,
      updatedAt,
      resolvedAt: typeof raw.resolvedAt === "string" ? raw.resolvedAt : null,
      resolvedByUserId: raw.resolvedByUserId ? String(raw.resolvedByUserId).trim() : null,
      resolvedByUsername: raw.resolvedByUsername ? String(raw.resolvedByUsername).trim().slice(0, 80) : null,
      resolutionNote: String(raw.resolutionNote || "").trim().slice(0, 500)
    };
  };

  const buildAdminUserPath = (user) => {
    const username = String(user?.username || "").trim();
    const userId = String(user?.id || "").trim();
    const params = new URLSearchParams();
    params.set("username", username);
    if (userId) {
      params.set("uid", userId);
    }
    return `/public-profile.html?${params.toString()}`;
  };

  const buildSupportThreads = (messages, usersById) => {
    const threads = new Map();

    for (const rawMessage of Array.isArray(messages) ? messages : []) {
      ensureMessageStructure(rawMessage);
      if (!rawMessage.isSupport || !rawMessage.supportUserId) {
        continue;
      }
      const existing = threads.get(rawMessage.supportUserId);
      if (!existing || new Date(rawMessage.createdAt).getTime() > new Date(existing.message.createdAt).getTime()) {
        const user = usersById.get(rawMessage.supportUserId) || null;
        threads.set(rawMessage.supportUserId, {
          user: user
            ? {
                id: user.id,
                username: user.username,
                avatarUrl: user.avatarFileName ? buildMediaUrl("profiles", user.avatarFileName) : null,
                profilePath: buildAdminUserPath(user),
                isBanned: Boolean(user.isBanned)
              }
            : {
                id: rawMessage.supportUserId,
                username: rawMessage.supportUserId,
                avatarUrl: null,
                profilePath: "",
                isBanned: false
              },
          message: {
            id: rawMessage.id,
            text: String(rawMessage.text || ""),
            createdAt: rawMessage.createdAt
          }
        });
      }
    }

    return Array.from(threads.values())
      .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime());
  };

  const buildUserAdminStatsMap = (users, tracks, albums) => {
    const stats = new Map();

    for (const user of Array.isArray(users) ? users : []) {
      ensureUserStructure(user);
      stats.set(user.id, {
        tracksCount: 0,
        beatsCount: 0,
        albumsCount: 0
      });
    }

    for (const track of Array.isArray(tracks) ? tracks : []) {
      ensureTrackStructure(track);
      const bucket = stats.get(track.userId) || { tracksCount: 0, beatsCount: 0, albumsCount: 0 };
      if (track.kind === "beat") {
        bucket.beatsCount += 1;
      } else {
        bucket.tracksCount += 1;
      }
      stats.set(track.userId, bucket);
    }

    for (const album of Array.isArray(albums) ? albums : []) {
      ensureAlbumStructure(album);
      const bucket = stats.get(album.userId) || { tracksCount: 0, beatsCount: 0, albumsCount: 0 };
      bucket.albumsCount += 1;
      stats.set(album.userId, bucket);
    }

    return stats;
  };

  const toAdminUserDto = (user, statsMap) => {
    ensureUserStructure(user);
    const stats = statsMap.get(user.id) || { tracksCount: 0, beatsCount: 0, albumsCount: 0 };
    return {
      id: user.id,
      username: user.username,
      bio: user.bio || "",
      email: user.email || "",
      avatarUrl: user.avatarFileName ? buildMediaUrl("profiles", user.avatarFileName) : null,
      profilePath: buildAdminUserPath(user),
      isAdmin: Boolean(user.isAdmin),
      isVerifiedArtist: Boolean(user.isVerifiedArtist),
      isBanned: Boolean(user.isBanned),
      banReason: user.banReason || null,
      followersCount: Array.isArray(user.followers) ? user.followers.length : 0,
      followingCount: Array.isArray(user.following) ? user.following.length : 0,
      warningsCount: Array.isArray(user.warnings) ? user.warnings.length : 0,
      createdAt: user.createdAt,
      adminGrantedAt: user.adminGrantedAt || null,
      verifiedArtistGrantedAt: user.verifiedArtistGrantedAt || null,
      bannedAt: user.bannedAt || null,
      ...stats
    };
  };

  const toAdminTrackDto = (track, usersById) => {
    ensureTrackStructure(track);
    const owner = usersById.get(track.userId) || null;
    return {
      id: track.id,
      title: track.title,
      kind: track.kind,
      description: track.description || "",
      genre: track.genre || "",
      authors: Array.isArray(track.authors) ? track.authors : [],
      producers: Array.isArray(track.producers) ? track.producers : [],
      hashtags: Array.isArray(track.hashtags) ? track.hashtags : [],
      username: track.username,
      userId: track.userId,
      ownerProfilePath: owner ? buildAdminUserPath(owner) : "",
      sharePath: buildTrackSharePath(track),
      coverUrl: track.coverFileName ? buildMediaUrl("covers", track.coverFileName) : null,
      publishMode: track.publishMode,
      likesCount: Array.isArray(track.likes) ? track.likes.length : 0,
      dislikesCount: Array.isArray(track.dislikes) ? track.dislikes.length : 0,
      commentsCount: Array.isArray(track.comments) ? track.comments.length : 0,
      listensCount: Number(track.listensCount || 0),
      createdAt: track.createdAt,
      updatedAt: track.updatedAt
    };
  };

  const ADMIN_STORAGE_TEMP_MAX_AGE_MS = 30 * 60 * 1000;
  const ADMIN_STORAGE_ORPHAN_MAX_AGE_MS = 60 * 60 * 1000;
  const ADMIN_STORAGE_OUTBOX_TTL_MS = 45 * 24 * 60 * 60 * 1000;
  const ADMIN_STORAGE_OUTBOX_LIMIT = 200;

  const getAdminStorageFiles = () => [
    { key: "users", label: "users.json", path: USERS_FILE, fallback: [] },
    { key: "tracks", label: "tracks.json", path: TRACKS_FILE, fallback: [] },
    { key: "playlists", label: "playlists.json", path: PLAYLISTS_FILE, fallback: [] },
    { key: "albums", label: "albums.json", path: ALBUMS_FILE, fallback: [] },
    { key: "messages", label: "messages.json", path: MESSAGES_FILE, fallback: [] },
    { key: "notifications", label: "notifications.json", path: NOTIFICATIONS_FILE, fallback: [] },
    { key: "sessions", label: "sessions.json", path: SESSIONS_FILE, fallback: {} },
    { key: "promocodes", label: "promocodes.json", path: PROMO_CODES_FILE, fallback: { codes: [] } },
    { key: "reports", label: "reports.json", path: REPORTS_FILE, fallback: [] },
    { key: "emailTokens", label: "email_tokens.json", path: EMAIL_TOKENS_FILE, fallback: { tokens: [] } },
    { key: "mailOutbox", label: "mail_outbox.json", path: MAIL_OUTBOX_FILE, fallback: [] }
  ];

  const toSafeBytes = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  };

  const buildUsageInfo = (usedBytes, totalBytes, extra = {}) => {
    const safeTotal = toSafeBytes(totalBytes);
    const safeUsed = Math.max(0, Math.min(toSafeBytes(usedBytes), safeTotal || Number.MAX_SAFE_INTEGER));
    const freeBytes = Math.max(0, safeTotal - safeUsed);
    const percent = safeTotal > 0
      ? Math.max(0, Math.min(100, Math.round((safeUsed / safeTotal) * 1000) / 10))
      : 0;
    return {
      totalBytes: safeTotal,
      usedBytes: safeUsed,
      freeBytes,
      percent,
      ...extra
    };
  };

  const sumEntryBytes = (entries) => (Array.isArray(entries) ? entries : []).reduce(
    (total, entry) => total + toSafeBytes(entry?.size),
    0
  );

  const listFilesWithStats = async (dirPath) => {
    try {
      const dirents = await fsp.readdir(dirPath, { withFileTypes: true });
      const files = [];

      for (const dirent of dirents) {
        if (!dirent.isFile()) {
          continue;
        }
        const filePath = path.join(dirPath, dirent.name);
        try {
          const stat = await fsp.stat(filePath);
          files.push({
            name: dirent.name,
            path: filePath,
            size: toSafeBytes(stat.size),
            mtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0
          });
        } catch {
          // ignore file that disappeared mid-scan
        }
      }

      return files;
    } catch {
      return [];
    }
  };

  const getDirectorySize = async (dirPath) => {
    try {
      const dirents = await fsp.readdir(dirPath, { withFileTypes: true });
      let total = 0;

      for (const dirent of dirents) {
        const entryPath = path.join(dirPath, dirent.name);
        if (dirent.isDirectory()) {
          total += await getDirectorySize(entryPath);
          continue;
        }
        if (!dirent.isFile()) {
          continue;
        }
        try {
          const stat = await fsp.stat(entryPath);
          total += toSafeBytes(stat.size);
        } catch {
          // ignore file that disappeared mid-scan
        }
      }

      return total;
    } catch {
      return 0;
    }
  };

  const getFileSizeSafe = async (filePath) => {
    try {
      const stat = await fsp.stat(filePath);
      return stat.isFile() ? toSafeBytes(stat.size) : 0;
    } catch {
      return 0;
    }
  };

  const getFilesystemUsage = async (targetPath) => {
    if (typeof fsp.statfs !== "function") {
      return null;
    }
    try {
      const statfs = await fsp.statfs(targetPath);
      const blockSize = toSafeBytes(statfs.bsize || statfs.frsize || 4096);
      const totalBytes = toSafeBytes(statfs.blocks) * blockSize;
      const freeBlocks = toSafeBytes(statfs.bavail || statfs.bfree);
      const freeBytes = freeBlocks * blockSize;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      return buildUsageInfo(usedBytes, totalBytes, {
        path: targetPath
      });
    } catch {
      return null;
    }
  };

  const buildReferencedMediaSets = (users, tracks, albums) => {
    const references = {
      audio: new Set(),
      covers: new Set(),
      profiles: new Set()
    };

    for (const user of Array.isArray(users) ? users : []) {
      ensureUserStructure(user);
      if (user.avatarFileName) {
        references.profiles.add(user.avatarFileName);
      }
      if (user.headerFileName) {
        references.profiles.add(user.headerFileName);
      }
    }

    for (const track of Array.isArray(tracks) ? tracks : []) {
      ensureTrackStructure(track);
      if (track.audioFileName) {
        references.audio.add(track.audioFileName);
      }
      if (track.coverFileName) {
        references.covers.add(track.coverFileName);
      }
    }

    for (const album of Array.isArray(albums) ? albums : []) {
      ensureAlbumStructure(album);
      if (album.coverFileName) {
        references.covers.add(album.coverFileName);
      }
    }

    return references;
  };

  const collectTempStorageCandidates = async () => {
    const threshold = Date.now() - ADMIN_STORAGE_TEMP_MAX_AGE_MS;
    const [tmpFiles, dataFiles] = await Promise.all([
      listFilesWithStats(TEMP_UPLOAD_DIR),
      listFilesWithStats(DATA_DIR)
    ]);
    const staleTempFiles = tmpFiles.filter((entry) => entry.mtimeMs <= threshold);
    const staleJsonTemps = dataFiles.filter((entry) => entry.name.endsWith(".tmp") && entry.mtimeMs <= threshold);
    const files = [...staleTempFiles, ...staleJsonTemps];

    return {
      files,
      bytes: sumEntryBytes(files),
      staleTempFilesCount: staleTempFiles.length,
      staleJsonTempsCount: staleJsonTemps.length,
      freshTempFilesCount: Math.max(0, tmpFiles.length - staleTempFiles.length)
    };
  };

  const collectOrphanMediaCandidates = async (users, tracks, albums) => {
    const references = buildReferencedMediaSets(users, tracks, albums);
    const threshold = Date.now() - ADMIN_STORAGE_ORPHAN_MAX_AGE_MS;
    const [audioFiles, coverFiles, profileFiles] = await Promise.all([
      listFilesWithStats(AUDIO_DIR),
      listFilesWithStats(COVERS_DIR),
      listFilesWithStats(PROFILES_DIR)
    ]);

    const audio = audioFiles.filter((entry) => !references.audio.has(entry.name) && entry.mtimeMs <= threshold);
    const covers = coverFiles.filter((entry) => !references.covers.has(entry.name) && entry.mtimeMs <= threshold);
    const profiles = profileFiles.filter((entry) => !references.profiles.has(entry.name) && entry.mtimeMs <= threshold);
    const files = [...audio, ...covers, ...profiles];
    const ignoredRecentFilesCount =
      (audioFiles.length - audio.length - references.audio.size)
      + (coverFiles.length - covers.length - references.covers.size)
      + (profileFiles.length - profiles.length - references.profiles.size);

    return {
      files,
      bytes: sumEntryBytes(files),
      audioCount: audio.length,
      coversCount: covers.length,
      profilesCount: profiles.length,
      ignoredRecentFilesCount: Math.max(0, ignoredRecentFilesCount)
    };
  };

  const collectCompactStorageCandidates = async () => {
    const dataFiles = getAdminStorageFiles();
    const [sessionsRaw, emailTokensRaw, mailOutboxRaw] = await Promise.all([
      readJson(SESSIONS_FILE, {}),
      readJson(EMAIL_TOKENS_FILE, { tokens: [] }),
      readJson(MAIL_OUTBOX_FILE, [])
    ]);

    const sessions = sessionsRaw && typeof sessionsRaw === "object" ? sessionsRaw : {};
    const now = Date.now();
    const expiredSessionsCount = Object.keys(sessions).filter((sid) => {
      const expiresAt = Number(sessions[sid]?.expiresAt);
      return !Number.isFinite(expiresAt) || expiresAt <= now;
    }).length;

    const tokenStore = ensureEmailTokenStoreStructure(emailTokensRaw);
    const tokenCountBefore = tokenStore.tokens.length;
    pruneEmailTokens(tokenStore);
    const expiredEmailTokensCount = Math.max(0, tokenCountBefore - tokenStore.tokens.length);

    const outboxList = Array.isArray(mailOutboxRaw) ? mailOutboxRaw : [];
    const outboxCutoff = now - ADMIN_STORAGE_OUTBOX_TTL_MS;
    const oldOutboxCount = outboxList.filter((entry) => {
      const createdAt = new Date(entry?.createdAt || 0).getTime();
      return !Number.isFinite(createdAt) || createdAt < outboxCutoff;
    }).length;
    const overflowOutboxCount = Math.max(0, outboxList.length - ADMIN_STORAGE_OUTBOX_LIMIT);

    let compactableBytes = 0;
    const fileStats = [];

    for (const entry of dataFiles) {
      let rawContent = "";
      try {
        rawContent = await fsp.readFile(entry.path, "utf8");
      } catch {
        rawContent = "";
      }
      const currentBytes = Buffer.byteLength(rawContent || "", "utf8");
      const parsedValue = await readJson(entry.path, entry.fallback);
      const compactBytes = Buffer.byteLength(JSON.stringify(parsedValue), "utf8");
      const savingsBytes = Math.max(0, currentBytes - compactBytes);
      compactableBytes += savingsBytes;
      fileStats.push({
        key: entry.key,
        label: entry.label,
        currentBytes,
        compactBytes,
        savingsBytes
      });
    }

    return {
      bytes: compactableBytes,
      expiredSessionsCount,
      expiredEmailTokensCount,
      oldOutboxCount,
      overflowOutboxCount,
      files: fileStats
    };
  };

  const collectAdminStorageSnapshot = async () => {
    const [users, tracks, albums, disk, dataBytes, uploadsBytes, tempFiles, orphanMedia, compactCandidates, dataFiles, audioFiles, coverFiles, profileFiles] = await Promise.all([
      readJson(USERS_FILE, []),
      readJson(TRACKS_FILE, []),
      readJson(ALBUMS_FILE, []),
      getFilesystemUsage(STORAGE_ROOT_DIR),
      getDirectorySize(DATA_DIR),
      getDirectorySize(UPLOADS_DIR),
      listFilesWithStats(TEMP_UPLOAD_DIR),
      Promise.resolve(null),
      Promise.resolve(null),
      Promise.all(getAdminStorageFiles().map(async (entry) => ({
        key: entry.key,
        label: entry.label,
        bytes: await getFileSizeSafe(entry.path)
      }))),
      listFilesWithStats(AUDIO_DIR),
      listFilesWithStats(COVERS_DIR),
      listFilesWithStats(PROFILES_DIR)
    ]);

    for (const user of users) {
      ensureUserStructure(user);
    }
    for (const track of tracks) {
      ensureTrackStructure(track);
    }
    for (const album of albums) {
      ensureAlbumStructure(album);
    }

    const [tempCandidates, orphanCandidates, compactInfo] = await Promise.all([
      collectTempStorageCandidates(),
      collectOrphanMediaCandidates(users, tracks, albums),
      collectCompactStorageCandidates()
    ]);

    const ramTotalBytes = toSafeBytes(os.totalmem());
    const ramFreeBytes = toSafeBytes(os.freemem());
    const ramUsedBytes = Math.max(0, ramTotalBytes - ramFreeBytes);
    const processMemory = process.memoryUsage();

    return {
      generatedAt: new Date().toISOString(),
      ram: buildUsageInfo(ramUsedBytes, ramTotalBytes, {
        processRssBytes: toSafeBytes(processMemory.rss),
        processHeapUsedBytes: toSafeBytes(processMemory.heapUsed),
        processHeapTotalBytes: toSafeBytes(processMemory.heapTotal),
        processExternalBytes: toSafeBytes(processMemory.external),
        processArrayBuffersBytes: toSafeBytes(processMemory.arrayBuffers)
      }),
      disk,
      directories: {
        dataBytes,
        uploadsBytes,
        audioBytes: sumEntryBytes(audioFiles),
        coversBytes: sumEntryBytes(coverFiles),
        profilesBytes: sumEntryBytes(profileFiles),
        tempBytes: sumEntryBytes(tempFiles)
      },
      dataFiles,
      reclaimable: {
        tempBytes: tempCandidates.bytes,
        orphanMediaBytes: orphanCandidates.bytes,
        compactableBytes: compactInfo.bytes,
        totalBytes: tempCandidates.bytes + orphanCandidates.bytes + compactInfo.bytes,
        expiredSessionsCount: compactInfo.expiredSessionsCount,
        expiredEmailTokensCount: compactInfo.expiredEmailTokensCount,
        staleOutboxCount: compactInfo.oldOutboxCount + compactInfo.overflowOutboxCount
      },
      maintenance: {
        staleTempFilesCount: tempCandidates.staleTempFilesCount + tempCandidates.staleJsonTempsCount,
        staleTempUploadsCount: tempCandidates.staleTempFilesCount,
        staleJsonTempsCount: tempCandidates.staleJsonTempsCount,
        freshTempFilesCount: tempCandidates.freshTempFilesCount,
        orphanFilesCount: orphanCandidates.files.length,
        orphanAudioCount: orphanCandidates.audioCount,
        orphanCoversCount: orphanCandidates.coversCount,
        orphanProfilesCount: orphanCandidates.profilesCount,
        ignoredRecentOrphanCandidatesCount: orphanCandidates.ignoredRecentFilesCount,
        expiredSessionsCount: compactInfo.expiredSessionsCount,
        expiredEmailTokensCount: compactInfo.expiredEmailTokensCount,
        oldOutboxCount: compactInfo.oldOutboxCount,
        overflowOutboxCount: compactInfo.overflowOutboxCount,
        compactFiles: compactInfo.files
      },
      thresholds: {
        tempAgeMinutes: Math.round(ADMIN_STORAGE_TEMP_MAX_AGE_MS / 60000),
        orphanAgeMinutes: Math.round(ADMIN_STORAGE_ORPHAN_MAX_AGE_MS / 60000)
      },
      health: {
        diskLow: Boolean(disk && (disk.freeBytes < 2 * 1024 * 1024 * 1024 || disk.percent >= 90)),
        ramLow: ramTotalBytes > 0 ? (ramFreeBytes / ramTotalBytes) < 0.12 : false
      }
    };
  };

  const removeEntriesAndMeasure = async (entries) => {
    let freedBytes = 0;
    let removedFilesCount = 0;

    for (const entry of Array.isArray(entries) ? entries : []) {
      const filePath = String(entry?.path || "").trim();
      if (!filePath) {
        continue;
      }
      const fileBytes = await getFileSizeSafe(filePath);
      try {
        await deleteFileSafe(filePath);
        freedBytes += fileBytes;
        removedFilesCount += 1;
      } catch {
        // ignore individual file removal errors
      }
    }

    return { freedBytes, removedFilesCount };
  };

  const writeJsonCompactFile = async (filePath, value) => {
    const tempPath = `${filePath}.tmp`;
    await fsp.writeFile(tempPath, JSON.stringify(value), "utf8");
    await fsp.rename(tempPath, filePath);
  };

  const runAdminStorageAction = async (action) => {
    const normalizedAction = String(action || "").trim();

    if (normalizedAction === "cleanup_temp") {
      const tempCandidates = await collectTempStorageCandidates();
      const result = await removeEntriesAndMeasure(tempCandidates.files);
      return {
        action: normalizedAction,
        freedBytes: result.freedBytes,
        removedFilesCount: result.removedFilesCount,
        details: {
          staleTempFilesCount: tempCandidates.staleTempFilesCount + tempCandidates.staleJsonTempsCount,
          staleTempUploadsCount: tempCandidates.staleTempFilesCount,
          staleJsonTempsCount: tempCandidates.staleJsonTempsCount
        },
        message: result.removedFilesCount
          ? `Удалил ${result.removedFilesCount} временных файлов`
          : "Временных файлов для очистки не нашлось"
      };
    }

    if (normalizedAction === "cleanup_orphan_media") {
      const [users, tracks, albums] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(TRACKS_FILE, []),
        readJson(ALBUMS_FILE, [])
      ]);
      const orphanCandidates = await collectOrphanMediaCandidates(users, tracks, albums);
      const result = await removeEntriesAndMeasure(orphanCandidates.files);
      return {
        action: normalizedAction,
        freedBytes: result.freedBytes,
        removedFilesCount: result.removedFilesCount,
        details: {
          orphanAudioCount: orphanCandidates.audioCount,
          orphanCoversCount: orphanCandidates.coversCount,
          orphanProfilesCount: orphanCandidates.profilesCount
        },
        message: result.removedFilesCount
          ? `Удалил ${result.removedFilesCount} сиротских файлов`
          : "Сиротских файлов не найдено"
      };
    }

    if (normalizedAction === "compact_storage") {
      let freedBytes = 0;
      let prunedSessionsCount = 0;
      let prunedEmailTokensCount = 0;
      let prunedOutboxCount = 0;

      await withWriteLock(async () => {
        const dataFiles = getAdminStorageFiles();
        const beforeSizes = new Map();
        const valuesByKey = new Map();

        for (const entry of dataFiles) {
          beforeSizes.set(entry.key, await getFileSizeSafe(entry.path));
          valuesByKey.set(entry.key, await readJson(entry.path, entry.fallback));
        }

        const sessions = valuesByKey.get("sessions");
        if (sessions && typeof sessions === "object") {
          prunedSessionsCount = Object.keys(sessions).filter((sid) => {
            const expiresAt = Number(sessions[sid]?.expiresAt);
            return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
          }).length;
          cleanupExpiredSessions(sessions);
        }

        const emailTokenStore = ensureEmailTokenStoreStructure(valuesByKey.get("emailTokens"));
        const emailTokensBefore = emailTokenStore.tokens.length;
        pruneEmailTokens(emailTokenStore);
        prunedEmailTokensCount = Math.max(0, emailTokensBefore - emailTokenStore.tokens.length);
        valuesByKey.set("emailTokens", emailTokenStore);

        const outbox = Array.isArray(valuesByKey.get("mailOutbox")) ? valuesByKey.get("mailOutbox") : [];
        const cutoff = Date.now() - ADMIN_STORAGE_OUTBOX_TTL_MS;
        const filteredOutbox = outbox.filter((entry) => {
          const createdAt = new Date(entry?.createdAt || 0).getTime();
          return Number.isFinite(createdAt) && createdAt >= cutoff;
        });
        const trimmedOutbox = filteredOutbox.slice(-ADMIN_STORAGE_OUTBOX_LIMIT);
        prunedOutboxCount = Math.max(0, outbox.length - trimmedOutbox.length);
        valuesByKey.set("mailOutbox", trimmedOutbox);

        for (const entry of dataFiles) {
          await writeJsonCompactFile(entry.path, valuesByKey.get(entry.key));
        }

        for (const entry of dataFiles) {
          const afterBytes = await getFileSizeSafe(entry.path);
          const beforeBytes = beforeSizes.get(entry.key) || 0;
          freedBytes += Math.max(0, beforeBytes - afterBytes);
        }
      });

      return {
        action: normalizedAction,
        freedBytes,
        removedFilesCount: 0,
        details: {
          prunedSessionsCount,
          prunedEmailTokensCount,
          prunedOutboxCount
        },
        message: "Хранилище оптимизировано"
      };
    }

    if (normalizedAction === "smart_cleanup") {
      const tempResult = await runAdminStorageAction("cleanup_temp");
      const orphanResult = await runAdminStorageAction("cleanup_orphan_media");
      const compactResult = await runAdminStorageAction("compact_storage");
      return {
        action: normalizedAction,
        freedBytes: toSafeBytes(tempResult.freedBytes) + toSafeBytes(orphanResult.freedBytes) + toSafeBytes(compactResult.freedBytes),
        removedFilesCount: toSafeBytes(tempResult.removedFilesCount) + toSafeBytes(orphanResult.removedFilesCount),
        details: {
          temp: tempResult.details || {},
          orphanMedia: orphanResult.details || {},
          compact: compactResult.details || {}
        },
        message: "Комплексная очистка завершена"
      };
    }

    throw new HttpError(400, "Неизвестное действие очистки");
  };

  const findCommentTarget = (tracksById, commentId) => {
    const normalizedCommentId = String(commentId || "").trim();
    if (!normalizedCommentId) {
      return null;
    }

    for (const track of tracksById.values()) {
      ensureTrackStructure(track);
      for (const comment of Array.isArray(track.comments) ? track.comments : []) {
        ensureCommentStructure(comment);
        if (comment.id === normalizedCommentId) {
          return { track, comment };
        }
      }
    }

    return null;
  };

  const toAdminReportDto = (report, context) => {
    const usersById = context.usersById;
    const tracksById = context.tracksById;
    const reporter = usersById.get(report.reporterUserId) || null;
    const resolvedBy = report.resolvedByUserId ? usersById.get(report.resolvedByUserId) || null : null;

    let target = {
      type: report.targetType,
      id: report.targetId,
      exists: false
    };

    if (report.targetType === "user") {
      const user = usersById.get(report.targetId) || null;
      target = user
        ? {
            type: "user",
            id: user.id,
            exists: true,
            username: user.username,
            isBanned: Boolean(user.isBanned),
            avatarUrl: user.avatarFileName ? buildMediaUrl("profiles", user.avatarFileName) : null,
            profilePath: buildAdminUserPath(user)
          }
        : {
            type: "user",
            id: report.targetId,
            exists: false,
            username: report.targetUsername || report.targetTitle || "Удалённый пользователь",
            profilePath: ""
          };
    } else if (report.targetType === "comment") {
      const matchedComment = findCommentTarget(tracksById, report.targetId);
      target = matchedComment
        ? {
            type: "comment",
            id: matchedComment.comment.id,
            exists: true,
            text: matchedComment.comment.text || report.targetTitle || "",
            username: matchedComment.comment.username || report.targetUsername || "",
            trackId: matchedComment.track.id,
            trackTitle: matchedComment.track.title,
            kind: matchedComment.track.kind,
            coverUrl: matchedComment.track.coverFileName ? buildMediaUrl("covers", matchedComment.track.coverFileName) : null,
            sharePath: buildTrackSharePath(matchedComment.track)
          }
        : {
            type: "comment",
            id: report.targetId,
            exists: false,
            text: report.targetTitle || "Удалённый комментарий",
            username: report.targetUsername || "",
            trackId: report.targetTrackId || "",
            trackTitle: report.targetTrackTitle || "",
            kind: report.targetKind || "track",
            sharePath: report.targetTrackId
              ? buildTrackSharePath({
                  id: report.targetTrackId,
                  kind: report.targetKind === "beat" ? "beat" : "song"
                })
              : ""
          };
    } else {
      const track = tracksById.get(report.targetId) || null;
      target = track
        ? {
            type: "track",
            id: track.id,
            exists: true,
            title: track.title,
            kind: track.kind,
            username: track.username,
            coverUrl: track.coverFileName ? buildMediaUrl("covers", track.coverFileName) : null,
            sharePath: buildTrackSharePath(track)
          }
        : {
            type: "track",
            id: report.targetId,
            exists: false,
            title: report.targetTitle || "Удалённый трек",
            kind: report.targetKind || "track",
            username: report.targetUsername || ""
          };
    }

    return {
      id: report.id,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      resolvedAt: report.resolvedAt,
      resolutionNote: report.resolutionNote || "",
      reporter: {
        id: report.reporterUserId,
        username: reporter?.username || report.reporterUsername || "unknown",
        avatarUrl: reporter?.avatarFileName ? buildMediaUrl("profiles", reporter.avatarFileName) : null,
        profilePath: reporter ? buildAdminUserPath(reporter) : ""
      },
      resolvedBy: report.resolvedByUserId
        ? {
            id: report.resolvedByUserId,
            username: resolvedBy?.username || report.resolvedByUsername || "admin"
          }
        : null,
      target
    };
  };

  if (method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      service: "sfera-api",
      timestamp: new Date().toISOString()
    });
    return true;
  }

  const mediaMatch = pathname.match(/^\/api\/media\/(audio|covers|profiles)(?:\/([^/]+))?$/);
  if (method === "GET" && mediaMatch) {
    const mediaKind = mediaMatch[1];
    let fileName = String(mediaMatch[2] || "").trim();

    if (!fileName && req.url) {
      try {
        const mediaUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        fileName = String(mediaUrl.searchParams.get("file") || "").trim();
      } catch {
        // ignore malformed URL and fall through to 404
      }
    }

    if (!fileName) {
      sendText(res, 404, "Not found");
      return true;
    }

    let baseDir = null;
    if (mediaKind === "audio") {
      baseDir = AUDIO_DIR;
    } else if (mediaKind === "covers") {
      baseDir = COVERS_DIR;
    } else if (mediaKind === "profiles") {
      baseDir = PROFILES_DIR;
    }

    if (!baseDir) {
      sendText(res, 404, "Not found");
      return true;
    }

    const requested = path.resolve(baseDir, fileName);
    if (!isSubPath(baseDir, requested)) {
      sendText(res, 403, "Forbidden");
      return true;
    }

    const ext = path.extname(requested).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    try {
      const stats = await fsp.stat(requested);
      if (!stats.isFile()) {
        throw new Error("Not a file");
      }
    } catch {
      if (mediaKind !== "audio" && mimeType.startsWith("image/")) {
        sendMissingUploadImagePlaceholder(res);
        return true;
      }
      sendText(res, 404, "Not found");
      return true;
    }

    await serveFile(req, res, requested, mimeType);
    return true;
  }

  if (method === "GET" && pathname === "/api/online") {
    sendJson(res, 200, { onlineUsers: getOnlineUsersCount() });
    return true;
  }

  if (method === "POST" && pathname === "/api/register") {
    const body = await parseJsonBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");
    const emailRaw = String(body.email || "").trim();
    const language = normalizeUserLanguage(body.language, "ru");

    enforceAuthRateLimit(req, "register", { extraKey: username.toLowerCase() });
    validateCredentials(username, password);

    const email = emailRaw ? validateEmail(emailRaw) : null;
    let createdUser = null;
    let sid = null;

    await withWriteLock(async () => {
      const [users, sessions] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(SESSIONS_FILE, {})
      ]);

      const usernameTaken = users.some(
        (entry) => String(entry.username || "").toLowerCase() === username.toLowerCase()
      );
      if (usernameTaken) {
        throw new HttpError(409, "Этот никнейм уже занят, выберите другой");
      }

      const { salt, hash } = hashPassword(password);
      const nowIso = new Date().toISOString();

      const user = {
        id: crypto.randomUUID(),
        username,
        passwordHash: hash,
        salt,
        bio: "",
        avatarFileName: null,
        headerFileName: null,
        friends: [],
        incomingFriendRequests: [],
        outgoingFriendRequests: [],
        followers: [],
        following: [],
        reposts: [],
        pinnedTrackIds: [],
        usedPromoCodes: [],
        warnings: [],
        isAdmin: false,
        adminGrantedAt: null,
        isVerifiedArtist: false,
        verifiedArtistGrantedAt: null,
        isBanned: false,
        banReason: null,
        bannedAt: null,
        email,
        emailVerifiedAt: null,
        language,
        listenHistory: [],
        createdAt: nowIso
      };
      ensureUserStructure(user);

      users.push(user);
      cleanupExpiredSessions(sessions);
      sid = createSession(sessions, user.id);

      await Promise.all([
        writeJson(USERS_FILE, users),
        writeJson(SESSIONS_FILE, sessions)
      ]);

      createdUser = user;
    });

    setSessionCookie(res, sid);
    sendJson(res, 201, { user: exposeUser(createdUser) });
    return true;
  }

  if (method === "POST" && pathname === "/api/login") {
    const body = await parseJsonBody(req);
    const username = normalizeUsername(body.username);
    const password = String(body.password || "");

    enforceAuthRateLimit(req, "login", { extraKey: username.toLowerCase() });

    if (!username || !password) {
      throw new HttpError(400, "Укажите никнейм и пароль");
    }

    let authUser = null;
    let sid = null;

    await withWriteLock(async () => {
      const [users, sessions] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(SESSIONS_FILE, {})
      ]);

      const user = users.find(
        (entry) => String(entry.username || "").toLowerCase() === username.toLowerCase()
      );
      if (!user) {
        throw new HttpError(401, "Неверный никнейм или пароль");
      }

      ensureUserStructure(user);

      if (user.isBanned) {
        throw new HttpError(403, user.banReason ? `Аккаунт заблокирован: ${user.banReason}` : "Аккаунт заблокирован");
      }

      if (!user.salt || !user.passwordHash || !verifyPassword(password, user.salt, user.passwordHash)) {
        throw new HttpError(401, "Неверный никнейм или пароль");
      }

      cleanupExpiredSessions(sessions);
      sid = createSession(sessions, user.id);
      authUser = user;

      await Promise.all([
        writeJson(SESSIONS_FILE, sessions),
        writeJson(USERS_FILE, users)
      ]);
    });

    setSessionCookie(res, sid);
    sendJson(res, 200, { user: exposeUser(authUser) });
    return true;
  }

  if (method === "POST" && pathname === "/api/logout") {
    const sid = parseCookies(req).sid;

    await withWriteLock(async () => {
      if (!sid) {
        return;
      }
      const sessions = await readJson(SESSIONS_FILE, {});
      if (sessions[sid]) {
        delete sessions[sid];
        await writeJson(SESSIONS_FILE, sessions);
      }
    });

    clearSessionCookie(res);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "PUT" && pathname === "/api/profile") {
    requireAuth(currentUser);

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    const isMultipart = contentType.includes("multipart/form-data");
    const tempCleanupPaths = [];
    const staleFilesToDelete = [];

    let shouldUpdateBio = false;
    let bio = "";
    let removeAvatar = false;
    let removeHeader = false;
    let avatarUpload = null;
    let headerUpload = null;

    const parseBooleanField = (value) => {
      const raw = Array.isArray(value) ? value[value.length - 1] : value;
      const normalized = String(raw || "").trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    };

    try {
      if (isMultipart) {
        const multipart = await parseMultipartForm(req, {
          maxFiles: 2,
          maxFields: 8,
          maxFieldSize: 128 * 1024,
          maxFileSize: MAX_IMAGE_SIZE,
          maxTotalFileSize: MAX_IMAGE_SIZE * 2
        });
        const fields = multipart.fields || {};
        const files = Array.isArray(multipart.files) ? multipart.files : [];

        if (Object.prototype.hasOwnProperty.call(fields, "bio")) {
          shouldUpdateBio = true;
          bio = String(fields.bio || "").trim().slice(0, 500);
        }

        removeAvatar = parseBooleanField(fields.removeAvatar);
        removeHeader = parseBooleanField(fields.removeHeader);

        const avatarFile = files.find((entry) => entry && entry.fieldName === "avatar") || null;
        const headerFile = files.find((entry) => entry && entry.fieldName === "header") || null;

        if (avatarFile) {
          tempCleanupPaths.push(avatarFile.tempPath);
          avatarUpload = await ensureValidCoverUpload(avatarFile);
        }
        if (headerFile) {
          tempCleanupPaths.push(headerFile.tempPath);
          headerUpload = await ensureValidCoverUpload(headerFile);
        }
      } else {
        const body = await parseJsonBody(req);
        if (Object.prototype.hasOwnProperty.call(body, "bio")) {
          shouldUpdateBio = true;
          bio = String(body.bio || "").trim().slice(0, 500);
        }
        removeAvatar = Boolean(body.removeAvatar);
        removeHeader = Boolean(body.removeHeader);
      }
    } catch (error) {
      await cleanupTempFiles(tempCleanupPaths);
      throw error;
    }

    let updatedUser = null;

    try {
      await withWriteLock(async () => {
        const users = await readJson(USERS_FILE, []);
        const user = users.find((entry) => entry.id === currentUser.id);
        if (!user) {
          throw new HttpError(404, "Пользователь не найден");
        }
        ensureUserStructure(user);

        if (shouldUpdateBio) {
          user.bio = bio;
        }

        if (removeAvatar && user.avatarFileName) {
          staleFilesToDelete.push(path.join(PROFILES_DIR, user.avatarFileName));
          user.avatarFileName = null;
        }
        if (removeHeader && user.headerFileName) {
          staleFilesToDelete.push(path.join(PROFILES_DIR, user.headerFileName));
          user.headerFileName = null;
        }

        if (avatarUpload) {
          const nextAvatarFileName = await storeFileFromPath(avatarUpload.sourcePath, PROFILES_DIR, avatarUpload.extension);
          if (user.avatarFileName && user.avatarFileName !== nextAvatarFileName) {
            staleFilesToDelete.push(path.join(PROFILES_DIR, user.avatarFileName));
          }
          user.avatarFileName = nextAvatarFileName;
        }

        if (headerUpload) {
          const nextHeaderFileName = await storeFileFromPath(headerUpload.sourcePath, PROFILES_DIR, headerUpload.extension);
          if (user.headerFileName && user.headerFileName !== nextHeaderFileName) {
            staleFilesToDelete.push(path.join(PROFILES_DIR, user.headerFileName));
          }
          user.headerFileName = nextHeaderFileName;
        }

        updatedUser = user;
        await writeJson(USERS_FILE, users);
      });

      const staleUnique = Array.from(new Set(staleFilesToDelete.filter(Boolean)));
      await Promise.all(staleUnique.map((filePath) => deleteFileSafe(filePath)));
    } finally {
      await cleanupTempFiles(tempCleanupPaths);
    }

    sendJson(res, 200, { user: exposeUser(updatedUser) });
    return true;
  }

  if (method === "PUT" && pathname === "/api/profile/language") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const language = normalizeUserLanguage(body.language, "ru");
    let updatedUser = null;

    await withWriteLock(async () => {
      const users = await readJson(USERS_FILE, []);
      const user = users.find((entry) => entry.id === currentUser.id);
      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }
      ensureUserStructure(user);
      user.language = language;
      updatedUser = user;
      await writeJson(USERS_FILE, users);
    });

    sendJson(res, 200, { user: exposeUser(updatedUser) });
    return true;
  }

  const adminUserMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  const adminUserPasswordResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
  if (adminUserPasswordResetMatch && method === "POST") {
    requireAdmin(currentUser);

    const targetUserId = String(adminUserPasswordResetMatch[1] || "").trim();
    if (!targetUserId) {
      throw new HttpError(400, "Пользователь не указан");
    }
    if (targetUserId === currentUser.id) {
      throw new HttpError(400, "Свой пароль меняется через обычные настройки профиля");
    }

    let temporaryPassword = "";

    await withWriteLock(async () => {
      const [users, sessions] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(SESSIONS_FILE, {})
      ]);

      const user = users.find((entry) => entry.id === targetUserId);
      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }
      ensureUserStructure(user);

      temporaryPassword = generateTemporaryPassword();
      const { salt, hash } = hashPassword(temporaryPassword);
      user.salt = salt;
      user.passwordHash = hash;
      user.passwordResetAt = new Date().toISOString();
      deleteSessionsForUser(sessions, user.id);

      await Promise.all([
        writeJson(USERS_FILE, users),
        writeJson(SESSIONS_FILE, sessions)
      ]);
    });

    sendJson(res, 200, {
      ok: true,
      temporaryPassword
    });
    return true;
  }

  if (adminUserMatch && method === "PUT") {
    requireAdmin(currentUser);

    const targetUserId = String(adminUserMatch[1] || "").trim();
    if (!targetUserId) {
      throw new HttpError(400, "Пользователь не указан");
    }

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    const isMultipart = contentType.includes("multipart/form-data");
    const tempCleanupPaths = [];
    const staleFilesToDelete = [];

    let shouldUpdateUsername = false;
    let nextUsername = "";
    let shouldUpdateBio = false;
    let nextBio = "";
    let shouldUpdateVerifiedArtist = false;
    let nextIsVerifiedArtist = false;
    let shouldUpdateBan = false;
    let nextIsBanned = false;
    let nextBanReason = "";
    let removeAvatar = false;
    let removeHeader = false;
    let avatarUpload = null;
    let headerUpload = null;

    const parseBooleanField = (value) => {
      const raw = Array.isArray(value) ? value[value.length - 1] : value;
      const normalized = String(raw || "").trim().toLowerCase();
      return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
    };

    try {
      if (isMultipart) {
        const multipart = await parseMultipartForm(req, {
          maxFiles: 2,
          maxFields: 16,
          maxFieldSize: 256 * 1024,
          maxFileSize: MAX_IMAGE_SIZE,
          maxTotalFileSize: MAX_IMAGE_SIZE * 2
        });
        const fields = multipart.fields || {};
        const files = Array.isArray(multipart.files) ? multipart.files : [];

        if (Object.prototype.hasOwnProperty.call(fields, "username")) {
          shouldUpdateUsername = true;
          nextUsername = normalizeUsername(fields.username);
        }
        if (Object.prototype.hasOwnProperty.call(fields, "bio")) {
          shouldUpdateBio = true;
          nextBio = String(fields.bio || "").trim().slice(0, 500);
        }
        if (Object.prototype.hasOwnProperty.call(fields, "isBanned")) {
          shouldUpdateBan = true;
          nextIsBanned = parseBooleanField(fields.isBanned);
        }
        if (Object.prototype.hasOwnProperty.call(fields, "isVerifiedArtist")) {
          shouldUpdateVerifiedArtist = true;
          nextIsVerifiedArtist = parseBooleanField(fields.isVerifiedArtist);
        }
        if (Object.prototype.hasOwnProperty.call(fields, "banReason")) {
          nextBanReason = String(fields.banReason || "").trim().slice(0, 500);
        }

        removeAvatar = parseBooleanField(fields.removeAvatar);
        removeHeader = parseBooleanField(fields.removeHeader);

        const avatarFile = files.find((entry) => entry && entry.fieldName === "avatar") || null;
        const headerFile = files.find((entry) => entry && entry.fieldName === "header") || null;

        if (avatarFile) {
          tempCleanupPaths.push(avatarFile.tempPath);
          avatarUpload = await ensureValidCoverUpload(avatarFile);
        }
        if (headerFile) {
          tempCleanupPaths.push(headerFile.tempPath);
          headerUpload = await ensureValidCoverUpload(headerFile);
        }
      } else {
        const body = await parseJsonBody(req);
        if (Object.prototype.hasOwnProperty.call(body, "username")) {
          shouldUpdateUsername = true;
          nextUsername = normalizeUsername(body.username);
        }
        if (Object.prototype.hasOwnProperty.call(body, "bio")) {
          shouldUpdateBio = true;
          nextBio = String(body.bio || "").trim().slice(0, 500);
        }
        if (Object.prototype.hasOwnProperty.call(body, "isBanned")) {
          shouldUpdateBan = true;
          nextIsBanned = Boolean(body.isBanned);
        }
        if (Object.prototype.hasOwnProperty.call(body, "isVerifiedArtist")) {
          shouldUpdateVerifiedArtist = true;
          nextIsVerifiedArtist = Boolean(body.isVerifiedArtist);
        }
        if (Object.prototype.hasOwnProperty.call(body, "banReason")) {
          nextBanReason = String(body.banReason || "").trim().slice(0, 500);
        }
        removeAvatar = Boolean(body.removeAvatar);
        removeHeader = Boolean(body.removeHeader);
      }
    } catch (error) {
      await cleanupTempFiles(tempCleanupPaths);
      throw error;
    }

    let updatedUser = null;

    try {
      await withWriteLock(async () => {
        const [users, tracks, playlists, albums, notifications, sessions] = await Promise.all([
          readJson(USERS_FILE, []),
          readJson(TRACKS_FILE, []),
          readJson(PLAYLISTS_FILE, []),
          readJson(ALBUMS_FILE, []),
          readJson(NOTIFICATIONS_FILE, []),
          readJson(SESSIONS_FILE, {})
        ]);

        const user = users.find((entry) => entry.id === targetUserId);
        if (!user) {
          throw new HttpError(404, "Пользователь не найден");
        }
        ensureUserStructure(user);

        if (shouldUpdateUsername) {
          validateUsername(nextUsername);
          const usernameTaken = users.some(
            (entry) =>
              entry.id !== user.id &&
              String(entry.username || "").toLowerCase() === nextUsername.toLowerCase()
          );
          if (usernameTaken) {
            throw new HttpError(409, "Этот никнейм уже занят");
          }
          if (nextUsername && nextUsername !== user.username) {
            user.username = nextUsername;
            syncUsernameAcrossResources({
              userId: user.id,
              username: nextUsername,
              users,
              tracks,
              playlists,
              albums,
              notifications
            });
          }
        }

        if (shouldUpdateBio) {
          user.bio = nextBio;
        }

        if (shouldUpdateVerifiedArtist) {
          user.isVerifiedArtist = nextIsVerifiedArtist;
          user.verifiedArtistGrantedAt = nextIsVerifiedArtist
            ? (user.verifiedArtistGrantedAt || new Date().toISOString())
            : null;
        }

        if (shouldUpdateBan) {
          user.isBanned = nextIsBanned;
          if (nextIsBanned) {
            user.bannedAt = user.bannedAt || new Date().toISOString();
            user.banReason = nextBanReason || "Нарушение правил платформы";
            deleteSessionsForUser(sessions, user.id);
          } else {
            user.bannedAt = null;
            user.banReason = null;
          }
        }

        if (removeAvatar && user.avatarFileName) {
          staleFilesToDelete.push(path.join(PROFILES_DIR, user.avatarFileName));
          user.avatarFileName = null;
        }
        if (removeHeader && user.headerFileName) {
          staleFilesToDelete.push(path.join(PROFILES_DIR, user.headerFileName));
          user.headerFileName = null;
        }

        if (avatarUpload) {
          const nextAvatarFileName = await storeFileFromPath(avatarUpload.sourcePath, PROFILES_DIR, avatarUpload.extension);
          if (user.avatarFileName && user.avatarFileName !== nextAvatarFileName) {
            staleFilesToDelete.push(path.join(PROFILES_DIR, user.avatarFileName));
          }
          user.avatarFileName = nextAvatarFileName;
        }

        if (headerUpload) {
          const nextHeaderFileName = await storeFileFromPath(headerUpload.sourcePath, PROFILES_DIR, headerUpload.extension);
          if (user.headerFileName && user.headerFileName !== nextHeaderFileName) {
            staleFilesToDelete.push(path.join(PROFILES_DIR, user.headerFileName));
          }
          user.headerFileName = nextHeaderFileName;
        }

        updatedUser = user;
        await Promise.all([
          writeJson(USERS_FILE, users),
          writeJson(TRACKS_FILE, tracks),
          writeJson(PLAYLISTS_FILE, playlists),
          writeJson(ALBUMS_FILE, albums),
          writeJson(NOTIFICATIONS_FILE, notifications),
          writeJson(SESSIONS_FILE, sessions)
        ]);
      });

      const staleUnique = Array.from(new Set(staleFilesToDelete.filter(Boolean)));
      await Promise.all(staleUnique.map((filePath) => deleteFileSafe(filePath)));
    } finally {
      await cleanupTempFiles(tempCleanupPaths);
    }

    sendJson(res, 200, { user: exposeUser(updatedUser) });
    return true;
  }

  if (adminUserMatch && method === "DELETE") {
    requireAdmin(currentUser);

    const targetUserId = String(adminUserMatch[1] || "").trim();
    if (!targetUserId) {
      throw new HttpError(400, "Пользователь не указан");
    }
    if (targetUserId === currentUser.id) {
      throw new HttpError(400, "Нельзя удалить свой собственный аккаунт через админ-панель");
    }

    const staleFilesToDelete = new Set();
    let removedUserId = null;

    await withWriteLock(async () => {
      let [users, tracks, playlists, albums, messages, notifications, sessions] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(TRACKS_FILE, []),
        readJson(PLAYLISTS_FILE, []),
        readJson(ALBUMS_FILE, []),
        readJson(MESSAGES_FILE, []),
        readJson(NOTIFICATIONS_FILE, []),
        readJson(SESSIONS_FILE, {})
      ]);

      const targetUser = users.find((entry) => entry.id === targetUserId);
      if (!targetUser) {
        throw new HttpError(404, "Пользователь не найден");
      }
      ensureUserStructure(targetUser);
      removedUserId = targetUser.id;

      if (targetUser.avatarFileName) {
        staleFilesToDelete.add(path.join(PROFILES_DIR, targetUser.avatarFileName));
      }
      if (targetUser.headerFileName) {
        staleFilesToDelete.add(path.join(PROFILES_DIR, targetUser.headerFileName));
      }

      const removedTrackIds = new Set();
      const removedAlbumIds = new Set();
      const nextTracks = [];
      for (const track of tracks) {
        ensureTrackStructure(track);
        if (track.userId === targetUser.id) {
          removedTrackIds.add(track.id);
          if (track.audioFileName) {
            staleFilesToDelete.add(path.join(AUDIO_DIR, track.audioFileName));
          }
          if (track.coverFileName) {
            staleFilesToDelete.add(path.join(COVERS_DIR, track.coverFileName));
          }
          continue;
        }

        removeUserInteractionsFromTrack(track, targetUser.id);
        nextTracks.push(track);
      }
      tracks = nextTracks;

      const nextUsers = [];
      for (const user of users) {
        ensureUserStructure(user);
        if (user.id === targetUser.id) {
          continue;
        }

        user.followers = user.followers.filter((id) => id !== targetUser.id);
        user.following = user.following.filter((id) => id !== targetUser.id);
        user.reposts = user.reposts.filter((trackId) => !removedTrackIds.has(trackId));
        user.pinnedTrackIds = user.pinnedTrackIds.filter((trackId) => !removedTrackIds.has(trackId));
        nextUsers.push(user);
      }
      users = nextUsers;

      const nextPlaylists = [];
      for (const playlist of playlists) {
        ensurePlaylistStructure(playlist);
        if (playlist.userId === targetUser.id) {
          continue;
        }
        const filteredTrackIds = playlist.trackIds.filter((trackId) => !removedTrackIds.has(trackId));
        if (filteredTrackIds.length !== playlist.trackIds.length) {
          playlist.trackIds = filteredTrackIds;
          playlist.updatedAt = new Date().toISOString();
        }
        nextPlaylists.push(playlist);
      }
      playlists = nextPlaylists;

      const nextAlbums = [];
      for (const album of albums) {
        ensureAlbumStructure(album);
        if (album.userId === targetUser.id) {
          removedAlbumIds.add(album.id);
          if (album.coverFileName) {
            staleFilesToDelete.add(path.join(COVERS_DIR, album.coverFileName));
          }
          continue;
        }
        const filteredTrackIds = album.trackIds.filter((trackId) => !removedTrackIds.has(trackId));
        if (filteredTrackIds.length !== album.trackIds.length) {
          album.trackIds = filteredTrackIds;
          album.updatedAt = new Date().toISOString();
        }
        nextAlbums.push(album);
      }
      albums = nextAlbums;

      messages = messages.filter((message) => {
        ensureMessageStructure(message);
        return message.fromUserId !== targetUser.id && message.toUserId !== targetUser.id;
      });

      notifications = notifications.filter((notification) => {
        if (!ensureNotificationStructure(notification)) {
          return false;
        }
        if (notification.userId === targetUser.id) return false;
        if (notification.actorUserId === targetUser.id) return false;
        if (notification.targetUserId === targetUser.id) return false;
        if (notification.peerUserId === targetUser.id) return false;
        if (notification.trackId && removedTrackIds.has(notification.trackId)) return false;
        if (notification.albumId && removedAlbumIds.has(notification.albumId)) return false;
        return true;
      });

      deleteSessionsForUser(sessions, targetUser.id);

      await Promise.all([
        writeJson(USERS_FILE, users),
        writeJson(TRACKS_FILE, tracks),
        writeJson(PLAYLISTS_FILE, playlists),
        writeJson(ALBUMS_FILE, albums),
        writeJson(MESSAGES_FILE, messages),
        writeJson(NOTIFICATIONS_FILE, notifications),
        writeJson(SESSIONS_FILE, sessions)
      ]);
    });

    await Promise.all(Array.from(staleFilesToDelete).map((filePath) => deleteFileSafe(filePath)));

    sendJson(res, 200, { ok: true, deletedUserId: removedUserId });
    return true;
  }

  const adminReportMatch = pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);

  if (method === "GET" && pathname === "/api/admin/dashboard") {
    requireAdmin(currentUser);

    const [users, tracks, albums, messages, reportsRaw] = await Promise.all([
      readJson(USERS_FILE, []),
      readJson(TRACKS_FILE, []),
      readJson(ALBUMS_FILE, []),
      readJson(MESSAGES_FILE, []),
      readJson(REPORTS_FILE, [])
    ]);

    const usersById = new Map();
    for (const user of users) {
      ensureUserStructure(user);
      usersById.set(user.id, user);
    }

    const tracksById = new Map();
    let tracksCount = 0;
    let beatsCount = 0;
    for (const track of tracks) {
      ensureTrackStructure(track);
      tracksById.set(track.id, track);
      if (track.kind === "beat") {
        beatsCount += 1;
      } else {
        tracksCount += 1;
      }
    }

    for (const album of albums) {
      ensureAlbumStructure(album);
    }

    const reports = Array.isArray(reportsRaw)
      ? reportsRaw.map(ensureReportRecord).filter(Boolean)
      : [];
    const openReports = reports.filter((report) => report.status === "open");
    const supportThreads = buildSupportThreads(messages, usersById);
    const userStatsMap = buildUserAdminStatsMap(users, tracks, albums);

    const recentBannedUsers = users
      .filter((user) => user.isBanned)
      .sort((a, b) => new Date(b.bannedAt || b.createdAt).getTime() - new Date(a.bannedAt || a.createdAt).getTime())
      .slice(0, 6)
      .map((user) => toAdminUserDto(user, userStatsMap));

    const recentTracks = tracks
      .slice()
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 8)
      .map((track) => toAdminTrackDto(track, usersById));

    sendJson(res, 200, {
      stats: {
        usersCount: users.length,
        bannedUsersCount: users.filter((user) => user.isBanned).length,
        adminsCount: users.filter((user) => user.isAdmin).length,
        tracksCount,
        beatsCount,
        albumsCount: albums.length,
        reportsOpenCount: openReports.length,
        supportThreadsCount: supportThreads.length
      },
      recentReports: openReports
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6)
        .map((report) => toAdminReportDto(report, { usersById, tracksById })),
      recentSupportThreads: supportThreads.slice(0, 6),
      recentBannedUsers,
      recentTracks
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/storage") {
    requireAdmin(currentUser);
    const storage = await collectAdminStorageSnapshot();
    sendJson(res, 200, { storage });
    return true;
  }

  if (method === "POST" && pathname === "/api/admin/storage/actions") {
    requireAdmin(currentUser);
    const body = await parseJsonBody(req);
    const action = String(body?.action || "").trim();
    const allowedActions = new Set(["cleanup_temp", "cleanup_orphan_media", "compact_storage", "smart_cleanup"]);
    if (!allowedActions.has(action)) {
      throw new HttpError(400, "Неизвестное действие очистки");
    }
    const result = await runAdminStorageAction(action);
    const storage = await collectAdminStorageSnapshot();
    sendJson(res, 200, {
      ok: true,
      ...result,
      storage
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/users") {
    requireAdmin(currentUser);

    const query = getQueryParam("q", "");
    const filter = String(getQueryParam("filter", "all") || "all").trim().toLowerCase();
    const [users, tracks, albums] = await Promise.all([
      readJson(USERS_FILE, []),
      readJson(TRACKS_FILE, []),
      readJson(ALBUMS_FILE, [])
    ]);

    const statsMap = buildUserAdminStatsMap(users, tracks, albums);

    const filtered = users
      .map((user) => {
        ensureUserStructure(user);
        const rank = scoreSearchMatch(
          [user.username, user.bio, user.email, user.id],
          query
        );
        return { user, rank };
      })
      .filter(({ user, rank }) => {
        if (query && rank <= 0) {
          return false;
        }
        if (filter === "banned" && !user.isBanned) {
          return false;
        }
        if (filter === "admins" && !user.isAdmin) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.rank !== a.rank) {
          return b.rank - a.rank;
        }
        return new Date(b.user.createdAt).getTime() - new Date(a.user.createdAt).getTime();
      })
      .slice(0, 40)
      .map(({ user }) => toAdminUserDto(user, statsMap));

    sendJson(res, 200, { users: filtered });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/tracks") {
    requireAdmin(currentUser);

    const query = getQueryParam("q", "");
    const filter = String(getQueryParam("filter", "all") || "all").trim().toLowerCase();
    const [tracks, users] = await Promise.all([
      readJson(TRACKS_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    const usersById = new Map();
    for (const user of users) {
      ensureUserStructure(user);
      usersById.set(user.id, user);
    }

    const filtered = tracks
      .map((track) => {
        ensureTrackStructure(track);
        const rank = scoreSearchMatch(
          [
            track.title,
            track.username,
            track.genre,
            track.description,
            Array.isArray(track.authors) ? track.authors.join(", ") : "",
            Array.isArray(track.producers) ? track.producers.join(", ") : "",
            track.id
          ],
          query
        );
        return { track, rank };
      })
      .filter(({ track, rank }) => {
        if (query && rank <= 0) {
          return false;
        }
        if (filter === "beats" && track.kind !== "beat") {
          return false;
        }
        if (filter === "tracks" && track.kind === "beat") {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.rank !== a.rank) {
          return b.rank - a.rank;
        }
        return new Date(b.track.updatedAt || b.track.createdAt).getTime() - new Date(a.track.updatedAt || a.track.createdAt).getTime();
      })
      .slice(0, 60)
      .map(({ track }) => toAdminTrackDto(track, usersById));

    sendJson(res, 200, { tracks: filtered });
    return true;
  }

  if (method === "GET" && pathname === "/api/admin/reports") {
    requireAdmin(currentUser);

    const query = getQueryParam("q", "");
    const statusFilter = String(getQueryParam("status", "open") || "open").trim().toLowerCase();
    const [reportsRaw, users, tracks] = await Promise.all([
      readJson(REPORTS_FILE, []),
      readJson(USERS_FILE, []),
      readJson(TRACKS_FILE, [])
    ]);

    const usersById = new Map();
    for (const user of users) {
      ensureUserStructure(user);
      usersById.set(user.id, user);
    }

    const tracksById = new Map();
    for (const track of tracks) {
      ensureTrackStructure(track);
      tracksById.set(track.id, track);
    }

    const reports = (Array.isArray(reportsRaw) ? reportsRaw : [])
      .map(ensureReportRecord)
      .filter(Boolean)
      .map((report) => ({
        report,
        rank: scoreSearchMatch(
          [
            report.reason,
            report.details,
            report.reporterUsername,
            report.targetTitle,
            report.targetTrackTitle,
            report.targetUsername,
            report.targetId
          ],
          query
        )
      }))
      .filter(({ report, rank }) => {
        if (statusFilter !== "all" && report.status !== statusFilter) {
          return false;
        }
        if (query && rank <= 0) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (b.rank !== a.rank) {
          return b.rank - a.rank;
        }
        if (a.report.status !== b.report.status) {
          return a.report.status === "open" ? -1 : 1;
        }
        return new Date(b.report.updatedAt || b.report.createdAt).getTime() - new Date(a.report.updatedAt || a.report.createdAt).getTime();
      })
      .slice(0, 60)
      .map(({ report }) => toAdminReportDto(report, { usersById, tracksById }));

    sendJson(res, 200, { reports });
    return true;
  }

  if (adminReportMatch && method === "PUT") {
    requireAdmin(currentUser);

    const reportId = String(adminReportMatch[1] || "").trim();
    const body = await parseJsonBody(req);
    const nextStatus = REPORT_STATUSES.has(String(body.status || "").trim())
      ? String(body.status || "").trim()
      : "";
    const resolutionNote = String(body.resolutionNote || "").trim().slice(0, 500);

    if (!reportId) {
      throw new HttpError(400, "Жалоба не указана");
    }
    if (!nextStatus) {
      throw new HttpError(400, "Укажите новый статус жалобы");
    }

    let updatedReport = null;

    await withWriteLock(async () => {
      const reportsRaw = await readJson(REPORTS_FILE, []);
      const reports = (Array.isArray(reportsRaw) ? reportsRaw : [])
        .map(ensureReportRecord)
        .filter(Boolean);

      const targetReport = reports.find((report) => report.id === reportId);
      if (!targetReport) {
        throw new HttpError(404, "Жалоба не найдена");
      }

      const nowIso = new Date().toISOString();
      targetReport.status = nextStatus;
      targetReport.updatedAt = nowIso;

      if (nextStatus === "open") {
        targetReport.resolvedAt = null;
        targetReport.resolvedByUserId = null;
        targetReport.resolvedByUsername = null;
        targetReport.resolutionNote = "";
      } else {
        targetReport.resolvedAt = nowIso;
        targetReport.resolvedByUserId = currentUser.id;
        targetReport.resolvedByUsername = currentUser.username;
        targetReport.resolutionNote = resolutionNote;
      }

      updatedReport = targetReport;
      await writeJson(REPORTS_FILE, reports);
    });

    sendJson(res, 200, { ok: true, report: updatedReport });
    return true;
  }

  if (method === "POST" && pathname === "/api/reports") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const targetType = REPORT_TARGET_TYPES.has(String(body.targetType || "").trim())
      ? String(body.targetType || "").trim()
      : "";
    const targetId = String(body.targetId || "").trim();
    const reason = String(body.reason || "").trim().slice(0, MAX_REPORT_REASON_LENGTH);
    const details = String(body.details || "").trim().slice(0, MAX_REPORT_DETAILS_LENGTH);

    if (!targetType || !targetId) {
      throw new HttpError(400, "Укажи объект жалобы");
    }
    if (reason.length < 3) {
      throw new HttpError(400, "Кратко укажи причину жалобы");
    }

    enforceSpamGuard("message", currentUser.id, `${targetType}:${targetId}:${reason}`, `report:${currentUser.id}`);

    let createdReport = null;

    await withWriteLock(async () => {
      const [reportsRaw, users, tracks] = await Promise.all([
        readJson(REPORTS_FILE, []),
        readJson(USERS_FILE, []),
        readJson(TRACKS_FILE, [])
      ]);

      const reports = (Array.isArray(reportsRaw) ? reportsRaw : [])
        .map(ensureReportRecord)
        .filter(Boolean);

      let targetTitle = "";
      let targetUsername = "";
      let targetKind = "";
      let targetTrackId = "";
      let targetTrackTitle = "";

      if (targetType === "user") {
        const targetUser = users.find((entry) => String(entry.id || "").trim() === targetId);
        if (!targetUser) {
          throw new HttpError(404, "Пользователь не найден");
        }
        ensureUserStructure(targetUser);
        if (targetUser.id === currentUser.id) {
          throw new HttpError(400, "Нельзя отправить жалобу на свой аккаунт");
        }
        targetTitle = targetUser.username;
        targetUsername = targetUser.username;
      } else if (targetType === "comment") {
        let targetTrack = null;
        let targetComment = null;

        for (const track of tracks) {
          ensureTrackStructure(track);
          for (const comment of Array.isArray(track.comments) ? track.comments : []) {
            ensureCommentStructure(comment);
            if (comment.id === targetId) {
              targetTrack = track;
              targetComment = comment;
              break;
            }
          }
          if (targetComment) {
            break;
          }
        }

        if (!targetTrack || !targetComment) {
          throw new HttpError(404, "Комментарий не найден");
        }
        if (targetComment.userId === currentUser.id) {
          throw new HttpError(400, "Нельзя отправить жалобу на свой комментарий");
        }

        targetTitle = String(targetComment.text || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 160);
        if (!targetTitle) {
          targetTitle = `Комментарий @${targetComment.username || "unknown"}`;
        }
        targetUsername = String(targetComment.username || "").trim().slice(0, 80);
        targetKind = targetTrack.kind;
        targetTrackId = targetTrack.id;
        targetTrackTitle = String(targetTrack.title || "").trim().slice(0, 160);
      } else {
        const targetTrack = tracks.find((entry) => String(entry.id || "").trim() === targetId);
        if (!targetTrack) {
          throw new HttpError(404, "Трек не найден");
        }
        ensureTrackStructure(targetTrack);
        if (targetTrack.userId === currentUser.id) {
          throw new HttpError(400, "Нельзя отправить жалобу на свой трек");
        }
        targetTitle = targetTrack.title;
        targetUsername = targetTrack.username;
        targetKind = targetTrack.kind;
      }

      const duplicate = reports.find((report) =>
        report.status === "open"
        && report.targetType === targetType
        && report.targetId === targetId
        && report.reporterUserId === currentUser.id
      );
      if (duplicate) {
        throw new HttpError(409, "Жалоба на этот объект уже отправлена");
      }

      createdReport = ensureReportRecord({
        id: crypto.randomUUID(),
        targetType,
        targetId,
        reporterUserId: currentUser.id,
        reporterUsername: currentUser.username,
        reason,
        details,
        targetTitle,
        targetUsername,
        targetTrackId,
        targetTrackTitle,
        targetKind,
        status: "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      reports.push(createdReport);
      await writeJson(REPORTS_FILE, reports);
    });

    sendJson(res, 201, {
      ok: true,
      report: {
        id: createdReport.id,
        status: createdReport.status
      }
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/integrations/genius/search") {
    requireAuth(currentUser);

    if (!GENIUS_ACCESS_TOKEN) {
      throw new HttpError(503, "На сервере не настроен GENIUS_ACCESS_TOKEN");
    }

    let query = "";
    if (req.url) {
      try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        query = String(requestUrl.searchParams.get("q") || "").trim();
      } catch {
        query = "";
      }
    }

    if (query.length < 2 || query.length > MAX_GENIUS_QUERY_LENGTH) {
      throw new HttpError(400, "Поисковый запрос Genius должен быть от 2 до 200 символов");
    }

    const geniusResponse = await requestJsonFromUrl(
      `https://api.genius.com/search?q=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`
        }
      }
    );

    if (geniusResponse.statusCode < 200 || geniusResponse.statusCode >= 300) {
      const upstreamMessage = String(
        geniusResponse.data?.meta?.message ||
        geniusResponse.data?.error ||
        ""
      ).trim();
      throw new HttpError(502, upstreamMessage || "Genius временно недоступен");
    }

    const hits = Array.isArray(geniusResponse.data?.response?.hits)
      ? geniusResponse.data.response.hits
      : [];

    const results = hits
      .map((hit) => hit?.result || null)
      .filter(Boolean)
      .map((result) => ({
        songId: String(result.id || "").trim(),
        title: String(result.title || result.full_title || "").trim(),
        fullTitle: String(result.full_title || "").trim(),
        artist: String(result.primary_artist?.name || result.artist_names || "").trim(),
        url: String(result.url || "").trim(),
        imageUrl: String(
          result.song_art_image_thumbnail_url ||
          result.header_image_thumbnail_url ||
          result.song_art_image_url ||
          result.header_image_url ||
          ""
        ).trim()
      }))
      .filter((entry) => entry.songId && entry.url)
      .slice(0, 10);

    sendJson(res, 200, { results });
    return true;
  }

  const publicUserMatch = pathname.match(/^\/api\/public\/users\/([a-zA-Z0-9_]+)$/);
  if (publicUserMatch && method === "GET") {
    const targetUsername = publicUserMatch[1];
    const users = await readJson(USERS_FILE, []);
    let requestedUserId = "";

    if (req.url) {
      try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        requestedUserId = String(requestUrl.searchParams.get("uid") || "").trim();
      } catch {
        requestedUserId = "";
      }
    }

    for (const user of users) {
      ensureUserStructure(user);
    }

    let profileUser = null;
    if (requestedUserId) {
      const byId = users.find((entry) => entry.id === requestedUserId) || null;
      if (
        byId
        && String(byId.username || "").toLowerCase() === targetUsername.toLowerCase()
      ) {
        profileUser = byId;
      }
    }

    if (!profileUser) {
      profileUser = users.find(
        (entry) => String(entry.username || "").toLowerCase() === targetUsername.toLowerCase()
      ) || null;
    }

    if (!profileUser) {
      throw new HttpError(404, "Профиль не найден");
    }

    let current = null;
    if (currentUser) {
      current = users.find((entry) => entry.id === currentUser.id) || null;
      if (current) {
        ensureUserStructure(current);
      }
    }

    const [tracks, playlists, albums, rawTracks] = await Promise.all([
      listTracks(currentUser),
      listPlaylists(currentUser),
      listAlbums(currentUser),
      readJson(TRACKS_FILE, [])
    ]);

    for (const track of rawTracks) {
      ensureTrackStructure(track);
    }

    const userTracks = tracks.filter((track) => track.userId === profileUser.id);
    const userPlaylists = playlists.filter((playlist) => playlist.userId === profileUser.id);
    const userAlbums = albums.filter((album) => album.userId === profileUser.id);
    const repostTrackIds = new Set(profileUser.reposts || []);
    const likedTrackIds = new Set(
      rawTracks
        .filter((track) => track.likes.includes(profileUser.id))
        .map((track) => track.id)
    );
    const userReposts = tracks.filter((track) => repostTrackIds.has(track.id));
    const userLikes = tracks.filter((track) => likedTrackIds.has(track.id));

    sendJson(res, 200, {
      user: toPublicUser(profileUser, current),
      viewer: current
        ? {
            id: current.id,
            username: current.username,
            isAdmin: Boolean(current.isAdmin),
            language: current.language || "ru"
          }
        : null,
      tracks: userTracks,
      reposts: userReposts,
      likes: userLikes,
      playlists: userPlaylists,
      albums: userAlbums,
      stats: {
        tracksCount: userTracks.length,
        playlistsCount: userPlaylists.length,
        albumsCount: userAlbums.length,
        followersCount: profileUser.followers.length,
        followingCount: profileUser.following.length,
        repostsCount: userReposts.length,
        likesCount: userLikes.length
      }
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/users") {
    const users = await readJson(USERS_FILE, []);
    for (const user of users) {
      ensureUserStructure(user);
    }

    let current = null;
    if (currentUser) {
      current = users.find((entry) => entry.id === currentUser.id) || null;
      if (current) {
        ensureUserStructure(current);
      }
    }

    const response = users
      .slice()
      .sort((a, b) => String(a.username).localeCompare(String(b.username), "ru"))
      .map((user) => toPublicUser(user, current));

    sendJson(res, 200, { users: response });
    return true;
  }

  if (method === "GET" && pathname === "/api/me") {
    if (!currentUser) {
      // Guest mode: do not treat /api/me as an error on first page load.
      sendJson(res, 200, { user: null });
      return true;
    }

    const users = await readJson(USERS_FILE, []);
    const user = users.find((entry) => entry.id === currentUser.id);

    if (!user) {
      throw new HttpError(404, "Пользователь не найден");
    }

    ensureUserStructure(user);
    sendJson(res, 200, { user: exposeUser(user) });
    return true;
  }

  if (method === "POST" && pathname === "/api/promocodes/activate") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const requestedCode = normalizePromoCode(body.code);

    if (!requestedCode) {
      throw new HttpError(400, "Введите промокод");
    }

    let activatedCode;

    await withWriteLock(async () => {
      const [promoStoreRaw, users] = await Promise.all([
        readJson(PROMO_CODES_FILE, { codes: [] }),
        readJson(USERS_FILE, [])
      ]);

      const promoStore = ensurePromoCodeStoreStructure(promoStoreRaw);
      const user = users.find((entry) => entry.id === currentUser.id);
      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }

      ensureUserStructure(user);

      const promoCode = promoStore.codes.find((entry) => entry.code === requestedCode);
      if (!promoCode || promoCode.active === false) {
        throw new HttpError(404, "Промокод не найден или неактивен");
      }

      if (promoCode.usedBy.includes(user.id)) {
        throw new HttpError(409, "Этот промокод уже использован на вашем аккаунте");
      }

      promoCode.usedBy.push(user.id);
      promoCode.usedBy = uniqueStringArray(promoCode.usedBy.map((id) => String(id || "").trim()).filter(Boolean));
      promoCode.updatedAt = new Date().toISOString();

      if (!user.usedPromoCodes.includes(promoCode.code)) {
        user.usedPromoCodes.push(promoCode.code);
      }
      user.usedPromoCodes = uniqueStringArray(user.usedPromoCodes.map((value) => normalizePromoCode(value)).filter(Boolean));

      if (promoCode.code === "ADMIN67GODBOSS") {
        user.isAdmin = true;
        user.adminGrantedAt = new Date().toISOString();
      }

      await Promise.all([
        writeJson(PROMO_CODES_FILE, promoStore),
        writeJson(USERS_FILE, users)
      ]);

      activatedCode = {
        code: promoCode.code,
        description: promoCode.description
      };
    });

    sendJson(res, 200, { ok: true, promoCode: activatedCode });
    return true;
  }

  if (method === "GET" && pathname === "/api/follows") {
    requireAuth(currentUser);

    const users = await readJson(USERS_FILE, []);
    const current = users.find((entry) => entry.id === currentUser.id);

    if (!current) {
      throw new HttpError(404, "Пользователь не найден");
    }

    ensureUserStructure(current);

    const usersById = new Map(users.map((user) => [user.id, user]));

    const mapUser = (id) => {
      const user = usersById.get(id);
      if (!user) {
        return null;
      }
      ensureUserStructure(user);
      return toPublicUser(user, current);
    };

    const following = current.following.map(mapUser).filter(Boolean);
    const followers = current.followers.map(mapUser).filter(Boolean);

    sendJson(res, 200, { following, followers });
    return true;
  }

  if (method === "GET" && pathname === "/api/notifications") {
    requireAuth(currentUser);
    const notifications = await listNotifications(currentUser);
    sendJson(res, 200, { notifications });
    return true;
  }

  if (method === "POST" && pathname === "/api/notifications/read-all") {
    requireAuth(currentUser);
    const result = await markAllNotificationsRead(currentUser.id);
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && pathname === "/api/follows/toggle") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const targetUserId = String(body.targetUserId || "").trim();

    if (!targetUserId) {
      throw new HttpError(400, "targetUserId обязателен");
    }

    if (targetUserId === currentUser.id) {
      throw new HttpError(400, "Нельзя подписаться на самого себя");
    }

    let following = false;
    let action = "followed";
    let targetSnapshot = null;

    await withWriteLock(async () => {
      const users = await readJson(USERS_FILE, []);
      const user = users.find((entry) => entry.id === currentUser.id);
      const target = users.find((entry) => entry.id === targetUserId);

      if (!user || !target) {
        throw new HttpError(404, "Пользователь не найден");
      }

      ensureUserStructure(user);
      ensureUserStructure(target);
      targetSnapshot = {
        id: target.id,
        username: target.username
      };

      if (user.following.includes(target.id)) {
        user.following = user.following.filter((id) => id !== target.id);
        target.followers = target.followers.filter((id) => id !== user.id);
        following = false;
        action = "unfollowed";
      } else {
        user.following.push(target.id);
        target.followers.push(user.id);
        user.following = uniqueStringArray(user.following);
        target.followers = uniqueStringArray(target.followers);
        following = true;
        action = "followed";
      }

      await writeJson(USERS_FILE, users);
    });

    sendJson(res, 200, { following, action });

    if (targetSnapshot) {
      notifyUserRealtime(targetSnapshot.id, "follow:update", {
        action,
        userId: currentUser.id,
        username: currentUser.username
      });
      notifyUserRealtime(currentUser.id, "follow:update", {
        action,
        userId: targetSnapshot.id,
        username: targetSnapshot.username,
        echo: true
      });
      if (action === "followed") {
        queueUserNotification({
          userId: targetSnapshot.id,
          type: "follow_new",
          actorUserId: currentUser.id,
          actorUsername: currentUser.username,
          href: `/u/${encodeURIComponent(currentUser.username)}`
        });
      }
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/messages/inbox") {
    requireAuth(currentUser);

    const [messages, users] = await Promise.all([
      readJson(MESSAGES_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    for (const message of messages) {
      ensureMessageStructure(message);
    }

    for (const user of users) {
      ensureUserStructure(user);
    }

    const usersById = new Map(users.map((user) => [user.id, user]));

    const threads = new Map();

    for (const message of messages) {
      if (message.isSupport) {
        continue;
      }
      if (message.fromUserId !== currentUser.id && message.toUserId !== currentUser.id) {
        continue;
      }

      const peerId = message.fromUserId === currentUser.id ? message.toUserId : message.fromUserId;
      const existing = threads.get(peerId);

      if (!existing || new Date(message.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
        threads.set(peerId, message);
      }
    }

    const result = Array.from(threads.entries())
      .map(([peerId, message]) => {
        const peer = usersById.get(peerId);
        return {
          user: peer ? toPublicUser(peer, currentUser) : null,
          message: toMessageDto(message, usersById, currentUser.id)
        };
      })
      .filter((entry) => entry.user)
      .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime());

    sendJson(res, 200, { threads: result });
    return true;
  }

  const messagesWithUserMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
  const supportMessagesMatch = pathname.match(/^\/api\/support\/messages\/([^/]+)$/);
  if (method === "GET" && pathname === "/api/support/thread") {
    requireAuth(currentUser);

    const [messages, users] = await Promise.all([
      readJson(MESSAGES_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    for (const message of messages) {
      ensureMessageStructure(message);
    }

    for (const user of users) {
      ensureUserStructure(user);
    }

    const usersById = new Map(users.map((user) => [user.id, user]));

    const conversation = messages
      .filter((message) => message.isSupport && message.supportUserId === currentUser.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((message) => toMessageDto(message, usersById, currentUser.id));

    sendJson(res, 200, { messages: conversation });
    return true;
  }

  if (method === "POST" && pathname === "/api/support/thread") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const text = String(body.text || "").trim();

    if (text.length < 1 || text.length > 2000) {
      throw new HttpError(400, "Сообщение в поддержку должно быть от 1 до 2000 символов");
    }

    enforceSpamGuard("message", currentUser.id, text, `support:${currentUser.id}`);

    let createdMessage = null;
    let assignedAdminId = null;

    await withWriteLock(async () => {
      const [messages, users] = await Promise.all([
        readJson(MESSAGES_FILE, []),
        readJson(USERS_FILE, [])
      ]);

      for (const user of users) {
        ensureUserStructure(user);
      }

      const assignedAdmin = users.find((user) => user.isAdmin && user.id !== currentUser.id)
        || users.find((user) => user.isAdmin)
        || null;

      if (!assignedAdmin) {
        throw new HttpError(503, "Поддержка сейчас недоступна");
      }

      assignedAdminId = assignedAdmin.id;
      createdMessage = {
        id: crypto.randomUUID(),
        fromUserId: currentUser.id,
        toUserId: assignedAdmin.id,
        text,
        createdAt: new Date().toISOString(),
        isSupport: true,
        supportUserId: currentUser.id
      };

      messages.push(createdMessage);
      await writeJson(MESSAGES_FILE, messages);
    });

    const users = await readJson(USERS_FILE, []);
    for (const user of users) {
      ensureUserStructure(user);
    }
    const usersById = new Map(users.map((user) => [user.id, user]));
    const messageDto = toMessageDto(createdMessage, usersById, currentUser.id);

    sendJson(res, 201, {
      message: messageDto,
      assignedAdminId
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/support/inbox") {
    requireAuth(currentUser);
    requireAdmin(currentUser);

    const [messages, users] = await Promise.all([
      readJson(MESSAGES_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    for (const message of messages) {
      ensureMessageStructure(message);
    }

    for (const user of users) {
      ensureUserStructure(user);
    }

    const usersById = new Map(users.map((user) => [user.id, user]));
    const threads = new Map();

    for (const message of messages) {
      if (!message.isSupport || !message.supportUserId) {
        continue;
      }

      const peer = usersById.get(message.supportUserId);
      if (!peer) {
        continue;
      }

      const existing = threads.get(message.supportUserId);
      if (!existing) {
        threads.set(message.supportUserId, {
          userId: message.supportUserId,
          lastMessage: message,
          messagesCount: 1
        });
        continue;
      }

      existing.messagesCount += 1;
      if (new Date(message.createdAt).getTime() > new Date(existing.lastMessage.createdAt).getTime()) {
        existing.lastMessage = message;
      }
    }

    const result = Array.from(threads.values())
      .map((entry) => {
        const peer = usersById.get(entry.userId);
        return {
          user: peer ? toPublicUser(peer, currentUser) : null,
          message: toMessageDto(entry.lastMessage, usersById, currentUser.id),
          messagesCount: entry.messagesCount
        };
      })
      .filter((entry) => entry.user)
      .sort((a, b) => new Date(b.message.createdAt).getTime() - new Date(a.message.createdAt).getTime());

    sendJson(res, 200, { threads: result });
    return true;
  }

  if (supportMessagesMatch && method === "GET") {
    requireAuth(currentUser);
    requireAdmin(currentUser);

    const targetUserId = String(supportMessagesMatch[1] || "").trim();

    const [messages, users] = await Promise.all([
      readJson(MESSAGES_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    for (const message of messages) {
      ensureMessageStructure(message);
    }

    for (const user of users) {
      ensureUserStructure(user);
    }

    const targetUser = users.find((entry) => entry.id === targetUserId);
    if (!targetUser) {
      throw new HttpError(404, "Пользователь не найден");
    }

    const usersById = new Map(users.map((user) => [user.id, user]));
    const conversation = messages
      .filter((message) => message.isSupport && message.supportUserId === targetUserId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((message) => toMessageDto(message, usersById, currentUser.id));

    sendJson(res, 200, {
      withUser: toPublicUser(targetUser, currentUser),
      messages: conversation
    });
    return true;
  }

  if (supportMessagesMatch && method === "POST") {
    requireAuth(currentUser);
    requireAdmin(currentUser);

    const targetUserId = String(supportMessagesMatch[1] || "").trim();
    const body = await parseJsonBody(req);
    const text = String(body.text || "").trim();

    if (text.length < 1 || text.length > 2000) {
      throw new HttpError(400, "Ответ поддержки должен быть от 1 до 2000 символов");
    }

    enforceSpamGuard("message", currentUser.id, text, `support-reply:${targetUserId}`);

    let createdMessage = null;

    await withWriteLock(async () => {
      const [messages, users] = await Promise.all([
        readJson(MESSAGES_FILE, []),
        readJson(USERS_FILE, [])
      ]);

      for (const user of users) {
        ensureUserStructure(user);
      }

      const targetUser = users.find((entry) => entry.id === targetUserId);
      if (!targetUser) {
        throw new HttpError(404, "Пользователь не найден");
      }

      createdMessage = {
        id: crypto.randomUUID(),
        fromUserId: currentUser.id,
        toUserId: targetUserId,
        text,
        createdAt: new Date().toISOString(),
        isSupport: true,
        supportUserId: targetUserId
      };

      messages.push(createdMessage);
      await writeJson(MESSAGES_FILE, messages);
    });

    const users = await readJson(USERS_FILE, []);
    for (const user of users) {
      ensureUserStructure(user);
    }
    const usersById = new Map(users.map((user) => [user.id, user]));
    const messageDto = toMessageDto(createdMessage, usersById, currentUser.id);

    sendJson(res, 201, { message: messageDto });
    queueUserNotification({
      userId: targetUserId,
      type: "support_reply",
      actorUserId: currentUser.id,
      actorUsername: currentUser.username,
      peerUserId: currentUser.id,
      peerUsername: currentUser.username,
      messagePreview: text.slice(0, 200),
      href: "/"
    });
    return true;
  }

  if (messagesWithUserMatch && method === "GET") {
    requireAuth(currentUser);

    const otherUserId = messagesWithUserMatch[1];

    const [messages, users] = await Promise.all([
      readJson(MESSAGES_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    const otherUser = users.find((entry) => entry.id === otherUserId);
    if (!otherUser) {
      throw new HttpError(404, "Пользователь не найден");
    }

    for (const message of messages) {
      ensureMessageStructure(message);
    }

    for (const user of users) {
      ensureUserStructure(user);
    }

    const usersById = new Map(users.map((user) => [user.id, user]));

    const conversation = messages
      .filter(
        (message) =>
          !message.isSupport && (
            (message.fromUserId === currentUser.id && message.toUserId === otherUserId) ||
            (message.fromUserId === otherUserId && message.toUserId === currentUser.id)
          )
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((message) => toMessageDto(message, usersById, currentUser.id));

    sendJson(res, 200, {
      withUser: toPublicUser(otherUser, currentUser),
      messages: conversation
    });
    return true;
  }

  if (messagesWithUserMatch && method === "POST") {
    requireAuth(currentUser);

    const otherUserId = messagesWithUserMatch[1];

    if (otherUserId === currentUser.id) {
      throw new HttpError(400, "Нельзя писать самому себе");
    }

    const body = await parseJsonBody(req);
    const forbiddenMediaFields = [
      "attachments",
      "fileBase64",
      "fileName",
      "mimeType",
      "image",
      "video",
      "audio"
    ];

    for (const key of forbiddenMediaFields) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        throw new HttpError(400, "В личных сообщениях разрешен только текст");
      }
    }

    const text = String(body.text || "").trim();

    if (text.length < 1 || text.length > 2000) {
      throw new HttpError(400, "Сообщение должно быть от 1 до 2000 символов");
    }

    enforceSpamGuard("message", currentUser.id, text, otherUserId);

    let createdMessage;

    await withWriteLock(async () => {
      const [messages, users] = await Promise.all([
        readJson(MESSAGES_FILE, []),
        readJson(USERS_FILE, [])
      ]);

      const otherUser = users.find((entry) => entry.id === otherUserId);
      if (!otherUser) {
        throw new HttpError(404, "Пользователь не найден");
      }

      createdMessage = {
        id: crypto.randomUUID(),
        fromUserId: currentUser.id,
        toUserId: otherUserId,
        text,
        createdAt: new Date().toISOString()
      };

      messages.push(createdMessage);
      await writeJson(MESSAGES_FILE, messages);
    });

    const users = await readJson(USERS_FILE, []);
    const usersById = new Map(users.map((user) => [user.id, user]));

    const messageForSender = toMessageDto(createdMessage, usersById, currentUser.id);
    const messageForRecipient = toMessageDto(createdMessage, usersById, otherUserId);

    sendJson(res, 201, { message: messageForSender });

    notifyUserRealtime(otherUserId, "message:new", {
      message: messageForRecipient
    });
    notifyUserRealtime(currentUser.id, "message:new", {
      message: messageForSender,
      echo: true
    });
    queueUserNotification({
      userId: otherUserId,
      type: "message_new",
      actorUserId: currentUser.id,
      actorUsername: currentUser.username,
      peerUserId: currentUser.id,
      peerUsername: currentUser.username,
      messagePreview: text.slice(0, 200),
      href: "/"
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/tracks") {
    const tracks = await listTracks(currentUser);
    sendJson(res, 200, { tracks });
    return true;
  }

  if (method === "POST" && pathname === "/api/tracks") {
    requireAuth(currentUser);

    const tempCleanupPaths = [];
    let audioFileName = null;
    let coverFileName = null;

    try {
      let payload;

      if (isMultipartRequest(req)) {
        const multipart = await parseMultipartForm(req, {
          maxFiles: 2,
          maxFields: 32,
          maxFieldSize: 256 * 1024,
          maxFileSize: MAX_WAV_UPLOAD_SIZE,
          maxTotalFileSize: MAX_WAV_UPLOAD_SIZE + MAX_IMAGE_SIZE
        });
        payload = parseTrackMultipartPayload(multipart, { isUpdate: false });

        for (const file of multipart.files) {
          tempCleanupPaths.push(file.tempPath);
        }
      } else {
        const body = await parseJsonBody(req);
        payload = validateTrackPayload(body, { isUpdate: false });
      }

      if (!payload.audio || !payload.cover) {
        throw new HttpError(400, "Аудиофайл и обложка обязательны");
      }

      const audioEntry = await toAudioFileEntry(payload.audio, tempCleanupPaths);
      const coverEntry = await toCoverFileEntry(payload.cover, tempCleanupPaths);
      const audioUpload = await ensureValidAudioUpload(audioEntry);
      const coverUpload = await ensureValidCoverUpload(coverEntry);

      if (audioUpload.additionalTempPath) {
        tempCleanupPaths.push(audioUpload.additionalTempPath);
      }

      audioFileName = await storeFileFromPath(audioUpload.sourcePath, AUDIO_DIR, audioUpload.extension);
      coverFileName = await storeFileFromPath(coverUpload.sourcePath, COVERS_DIR, coverUpload.extension);

      const nowIso = new Date().toISOString();

      const track = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        username: currentUser.username,
        kind: payload.kind || "song",
        isExplicit: Boolean(payload.isExplicit),
        title: payload.title,
        description: payload.description,
        genre: payload.genre,
        authors: payload.authors || [],
        producers: payload.producers || [],
        hashtags: payload.hashtags || [],
        beatBpm: payload.bpm ?? null,
        beatRootNote: payload.rootNote || "",
        beatLicenses: payload.beatLicenses || [],
        lyricsPlain: payload.lyrics?.plain || "",
        lyricsSyncText: payload.lyrics?.syncText || "",
        lyricsSegments: payload.lyrics?.segments || [],
        lyricsHasWordTimings: Boolean(payload.lyrics?.hasWordTimings),
        geniusSongId: payload.genius?.songId || "",
        geniusUrl: payload.genius?.url || "",
        geniusTitle: payload.genius?.title || "",
        geniusArtist: payload.genius?.artist || "",
        geniusImageUrl: payload.genius?.imageUrl || "",
        publishMode: payload.publishMode || "public",
        premiereAt: payload.publishMode === "premiere" ? payload.premiereAt : null,
        audioFileName,
        audioMimeType: audioUpload.normalizedAudioMime,
        durationSec: payload.durationSec ?? null,
        coverFileName,
        coverMimeType: coverUpload.mimeType,
        likes: [],
        dislikes: [],
        listensCount: 0,
        listenStats: buildEmptyListenStats(),
        comments: [],
        createdAt: nowIso,
        updatedAt: nowIso
      };

      try {
        await withWriteLock(async () => {
          const tracks = await readJson(TRACKS_FILE, []);
          tracks.push(track);
          await writeJson(TRACKS_FILE, tracks);
        });
      } catch (error) {
        await deleteFileSafe(path.join(AUDIO_DIR, audioFileName));
        await deleteFileSafe(path.join(COVERS_DIR, coverFileName));
        throw error;
      }

      const tracks = await listTracks(currentUser);
      const dto = tracks.find((entry) => entry.id === track.id);
      sendJson(res, 201, { track: dto });
      return true;
    } finally {
      await cleanupTempFiles(tempCleanupPaths);
    }
  }

  const trackEditMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
  if (trackEditMatch && method === "GET") {
    const trackId = trackEditMatch[1];
    const [tracks, users] = await Promise.all([
      readJson(TRACKS_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    for (const track of tracks) {
      ensureTrackStructure(track);
    }

    const track = tracks.find((entry) => entry.id === trackId);
    if (!track) {
      throw new HttpError(404, "Трек не найден");
    }

    const currentUserId = currentUser ? currentUser.id : null;
    if (!canViewTrack(track, currentUserId, { direct: true })) {
      throw new HttpError(404, "Трек не найден");
    }

    const context = createTrackDtoContext(users, currentUserId);
    const dto = toTrackDto(track, context);
    sendJson(res, 200, { track: dto });
    return true;
  }

  if (trackEditMatch && method === "PUT") {
    requireAuth(currentUser);

    const trackId = trackEditMatch[1];
    const tempCleanupPaths = [];
    let oldAudioFileName = null;
    let oldCoverFileName = null;
    let newAudioFileName = null;
    let newAudioMimeType = null;
    let newCoverFileName = null;
    let newCoverMimeType = null;

    try {
      let payload;

      if (isMultipartRequest(req)) {
        const multipart = await parseMultipartForm(req, {
          maxFiles: 2,
          maxFields: 32,
          maxFieldSize: 256 * 1024,
          maxFileSize: MAX_WAV_UPLOAD_SIZE,
          maxTotalFileSize: MAX_WAV_UPLOAD_SIZE + MAX_IMAGE_SIZE
        });
        payload = parseTrackMultipartPayload(multipart, { isUpdate: true });

        for (const file of multipart.files) {
          tempCleanupPaths.push(file.tempPath);
        }
      } else {
        const body = await parseJsonBody(req);
        payload = validateTrackPayload(body, { isUpdate: true });
      }

      const hasUpdates =
        payload.title !== undefined ||
        payload.description !== undefined ||
        payload.genre !== undefined ||
        payload.authors !== undefined ||
        payload.producers !== undefined ||
        payload.hashtags !== undefined ||
        payload.publishMode !== undefined ||
        payload.premiereAt !== undefined ||
        payload.kind !== undefined ||
        payload.bpm !== undefined ||
        payload.rootNote !== undefined ||
        payload.beatLicenses !== undefined ||
        payload.lyrics !== undefined ||
        payload.genius !== undefined ||
        payload.audio ||
        payload.cover;

      if (!hasUpdates) {
        throw new HttpError(400, "Нет данных для обновления");
      }

      if (payload.audio) {
        const audioEntry = await toAudioFileEntry(payload.audio, tempCleanupPaths);
        const audioUpload = await ensureValidAudioUpload(audioEntry);
        if (audioUpload.additionalTempPath) {
          tempCleanupPaths.push(audioUpload.additionalTempPath);
        }

        newAudioFileName = await storeFileFromPath(audioUpload.sourcePath, AUDIO_DIR, audioUpload.extension);
        newAudioMimeType = audioUpload.normalizedAudioMime;
      }

      if (payload.cover) {
        const coverEntry = await toCoverFileEntry(payload.cover, tempCleanupPaths);
        const coverUpload = await ensureValidCoverUpload(coverEntry);

        newCoverFileName = await storeFileFromPath(coverUpload.sourcePath, COVERS_DIR, coverUpload.extension);
        newCoverMimeType = coverUpload.mimeType;
      }

      try {
        await withWriteLock(async () => {
          const tracks = await readJson(TRACKS_FILE, []);
          const track = tracks.find((entry) => entry.id === trackId);

          if (!track) {
            throw new HttpError(404, "Трек не найден");
          }

          ensureTrackStructure(track);

          const isOwner = track.userId === currentUser.id;
          const isAdmin = Boolean(currentUser.isAdmin);
          if (!isOwner && !isAdmin) {
            throw new HttpError(403, "Редактировать трек может только автор");
          }

          if (payload.title !== undefined) {
            track.title = payload.title;
          }

          if (payload.description !== undefined) {
            track.description = payload.description;
          }

          if (payload.genre !== undefined) {
            track.genre = payload.genre;
          }

          if (payload.kind !== undefined) {
            track.kind = payload.kind;
          }

          if (payload.isExplicit !== undefined) {
            track.isExplicit = Boolean(payload.isExplicit);
          }

          if (payload.authors !== undefined) {
            track.authors = payload.authors;
          }

          if (payload.producers !== undefined) {
            track.producers = payload.producers;
          }

          if (payload.hashtags !== undefined) {
            track.hashtags = payload.hashtags;
          }

          if (payload.bpm !== undefined) {
            track.beatBpm = payload.bpm;
          }

          if (payload.rootNote !== undefined) {
            track.beatRootNote = payload.rootNote;
          }

          if (payload.beatLicenses !== undefined) {
            track.beatLicenses = payload.beatLicenses;
          }

          if (payload.lyrics !== undefined) {
            track.lyricsPlain = payload.lyrics.plain;
            track.lyricsSyncText = payload.lyrics.syncText;
            track.lyricsSegments = payload.lyrics.segments;
            track.lyricsHasWordTimings = payload.lyrics.hasWordTimings;
          }

          if (payload.genius !== undefined) {
            track.geniusSongId = payload.genius.songId;
            track.geniusUrl = payload.genius.url;
            track.geniusTitle = payload.genius.title;
            track.geniusArtist = payload.genius.artist;
            track.geniusImageUrl = payload.genius.imageUrl;
          }

          const nextPublishMode = payload.publishMode !== undefined ? payload.publishMode : track.publishMode;
          const nextPremiereAt = payload.premiereAt !== undefined ? payload.premiereAt : track.premiereAt;

          if (payload.premiereAt !== undefined && nextPublishMode !== "premiere" && payload.premiereAt !== null) {
            throw new HttpError(400, "Дата премьеры доступна только для режима «Премьера по времени»");
          }

          if (nextPublishMode === "premiere" && !nextPremiereAt) {
            throw new HttpError(400, "Для премьеры укажите дату и время");
          }

          track.publishMode = nextPublishMode;
          track.premiereAt = nextPublishMode === "premiere" ? nextPremiereAt : null;

          if (newAudioFileName) {
            oldAudioFileName = track.audioFileName;
            track.audioFileName = newAudioFileName;
            track.audioMimeType = newAudioMimeType;
          }

          if (payload.durationSec !== undefined) {
            track.durationSec = payload.durationSec;
          }

          if (newCoverFileName) {
            oldCoverFileName = track.coverFileName;
            track.coverFileName = newCoverFileName;
            track.coverMimeType = newCoverMimeType;
          }

          track.updatedAt = new Date().toISOString();

          await writeJson(TRACKS_FILE, tracks);
        });
      } catch (error) {
        if (newAudioFileName) {
          await deleteFileSafe(path.join(AUDIO_DIR, newAudioFileName));
        }

        if (newCoverFileName) {
          await deleteFileSafe(path.join(COVERS_DIR, newCoverFileName));
        }

        throw error;
      }

      if (oldAudioFileName) {
        await deleteFileSafe(path.join(AUDIO_DIR, oldAudioFileName));
      }

      if (oldCoverFileName) {
        await deleteFileSafe(path.join(COVERS_DIR, oldCoverFileName));
      }

      const tracks = await listTracks(currentUser);
      const dto = tracks.find((entry) => entry.id === trackId);
      sendJson(res, 200, { track: dto });
      return true;
    } finally {
      await cleanupTempFiles(tempCleanupPaths);
    }
  }

  if (trackEditMatch && method === "DELETE") {
    requireAuth(currentUser);

    const trackId = trackEditMatch[1];
    let removedAudioFileName = null;
    let removedCoverFileName = null;

    await withWriteLock(async () => {
      const [tracks, users, playlists, albums] = await Promise.all([
        readJson(TRACKS_FILE, []),
        readJson(USERS_FILE, []),
        readJson(PLAYLISTS_FILE, []),
        readJson(ALBUMS_FILE, [])
      ]);

      const trackIndex = tracks.findIndex((entry) => entry.id === trackId);
      if (trackIndex < 0) {
        throw new HttpError(404, "Трек не найден");
      }

      const track = tracks[trackIndex];
      ensureTrackStructure(track);

      if (track.userId !== currentUser.id && !currentUser.isAdmin) {
        throw new HttpError(403, "Удалить трек может только автор или администратор");
      }

      removedAudioFileName = track.audioFileName;
      removedCoverFileName = track.coverFileName;
      tracks.splice(trackIndex, 1);

      for (const user of users) {
        ensureUserStructure(user);
        if (Array.isArray(user.reposts) && user.reposts.includes(trackId)) {
          user.reposts = user.reposts.filter((id) => id !== trackId);
        }
        if (Array.isArray(user.pinnedTrackIds) && user.pinnedTrackIds.includes(trackId)) {
          user.pinnedTrackIds = user.pinnedTrackIds.filter((id) => id !== trackId);
        }
        if (Array.isArray(user.likedTrackIds) && user.likedTrackIds.includes(trackId)) {
          user.likedTrackIds = user.likedTrackIds.filter((id) => id !== trackId);
        }
      }

      for (const playlist of playlists) {
        ensurePlaylistStructure(playlist);
        if (playlist.trackIds.includes(trackId)) {
          playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
          playlist.updatedAt = new Date().toISOString();
        }
      }

      for (const album of albums) {
        ensureAlbumStructure(album);
        if (album.trackIds.includes(trackId)) {
          album.trackIds = album.trackIds.filter((id) => id !== trackId);
          album.updatedAt = new Date().toISOString();
        }
      }

      await Promise.all([
        writeJson(TRACKS_FILE, tracks),
        writeJson(USERS_FILE, users),
        writeJson(PLAYLISTS_FILE, playlists),
        writeJson(ALBUMS_FILE, albums)
      ]);
    });

    if (removedAudioFileName) {
      await deleteFileSafe(path.join(AUDIO_DIR, removedAudioFileName));
    }
    if (removedCoverFileName) {
      await deleteFileSafe(path.join(COVERS_DIR, removedCoverFileName));
    }

    sendJson(res, 200, { ok: true });
    return true;
  }

  return handleApiRequest(req, res, pathname, currentUser);
}
