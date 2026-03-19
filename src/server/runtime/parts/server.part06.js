"use strict";

async function handleApiRequest(req, res, pathname, currentUser) {
  const method = req.method;

  function parseTrackIdsInput(value) {
    if (value === undefined || value === null) {
      return [];
    }
    if (Array.isArray(value)) {
      return uniqueStringArray(
        value
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      );
    }
    return uniqueStringArray(
      String(value)
        .split(",")
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    );
  }

  function parseRequiredTrackId(value) {
    const trackId = String(value || "").trim();
    if (!trackId) {
      throw new HttpError(400, "trackId обязателен");
    }
    return trackId;
  }

  function queuePlaylistAddNotifications(trackEntries, playlistTitle) {
    const normalizedTitle = String(playlistTitle || "").trim();
    if (!Array.isArray(trackEntries) || trackEntries.length === 0) {
      return;
    }

    const notified = new Set();
    for (const entry of trackEntries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const trackUserId = String(entry.userId || "").trim();
      const trackId = String(entry.id || "").trim();
      if (!trackUserId || !trackId || trackUserId === currentUser.id) {
        continue;
      }

      const dedupeKey = `${trackUserId}:${trackId}`;
      if (notified.has(dedupeKey)) {
        continue;
      }
      notified.add(dedupeKey);

      queueUserNotification({
        userId: trackUserId,
        type: "playlist_add",
        actorUserId: currentUser.id,
        actorUsername: currentUser.username,
        trackId,
        trackKind: entry.kind,
        trackTitle: typeof entry.title === "string" ? entry.title : "",
        messagePreview: normalizedTitle,
        href: buildTrackSharePath(entry)
      });
    }
  }

  function buildAnalyticsLastDaysSeries(dailyTotals, days = 30) {
    const result = [];
    const now = new Date();
    for (let index = days - 1; index >= 0; index -= 1) {
      const dayDate = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
      const key = getUtcDateKey(dayDate);
      result.push({
        date: key,
        listens: sanitizePositiveCounter(dailyTotals[key] || 0)
      });
    }
    return result;
  }

  function buildListFromCounterObject(counter, keyName) {
    return Object.entries(counter || {})
      .map(([key, count]) => ({
        [keyName]: key,
        count: sanitizePositiveCounter(count)
      }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  if (method === "GET" && pathname === "/api/playlists") {
    const playlists = await listPlaylists(currentUser);
    sendJson(res, 200, { playlists });
    return true;
  }

  if (method === "POST" && pathname === "/api/playlists") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const requestedTrackIds = parseTrackIdsInput(body.trackIds);

    if (title.length < 1 || title.length > 120) {
      throw new HttpError(400, "Название плейлиста должно быть от 1 до 120 символов");
    }

    if (description.length > 1000) {
      throw new HttpError(400, "Описание плейлиста не должно превышать 1000 символов");
    }

    let createdPlaylistId = null;
    let createdPlaylistTrackSnapshots = [];

    await withWriteLock(async () => {
      const [playlists, tracks] = await Promise.all([
        readJson(PLAYLISTS_FILE, []),
        readJson(TRACKS_FILE, [])
      ]);

      const tracksById = new Map();
      for (const track of tracks) {
        ensureTrackStructure(track);
        tracksById.set(track.id, track);
      }

      for (const trackId of requestedTrackIds) {
        if (!tracksById.has(trackId)) {
          throw new HttpError(404, "Один из треков для плейлиста не найден");
        }
      }

      createdPlaylistTrackSnapshots = requestedTrackIds
        .map((trackId) => tracksById.get(trackId))
        .filter(Boolean)
        .map((track) => ({
          id: track.id,
          userId: track.userId,
          kind: track.kind,
          title: track.title
        }));

      const nowIso = new Date().toISOString();
      const playlist = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        username: currentUser.username,
        title,
        description,
        trackIds: requestedTrackIds,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      playlists.push(playlist);
      await writeJson(PLAYLISTS_FILE, playlists);
      createdPlaylistId = playlist.id;
    });

    const playlists = await listPlaylists(currentUser);
    const created = playlists.find((entry) => entry.id === createdPlaylistId) || null;
    queuePlaylistAddNotifications(createdPlaylistTrackSnapshots, title);
    sendJson(res, 201, { playlist: created });
    return true;
  }

  const playlistMatch = pathname.match(/^\/api\/playlists\/([^/]+)$/);
  if (playlistMatch && method === "GET") {
    const playlistId = playlistMatch[1];
    const playlists = await listPlaylists(currentUser);
    const playlist = playlists.find((entry) => entry.id === playlistId);
    if (!playlist) {
      throw new HttpError(404, "Плейлист не найден");
    }
    sendJson(res, 200, { playlist });
    return true;
  }

  if (playlistMatch && method === "PUT") {
    requireAuth(currentUser);

    const playlistId = playlistMatch[1];
    const body = await parseJsonBody(req);
    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasDescription = Object.prototype.hasOwnProperty.call(body, "description");
    const hasTrackIds = Object.prototype.hasOwnProperty.call(body, "trackIds");

    if (!hasTitle && !hasDescription && !hasTrackIds) {
      throw new HttpError(400, "Нет данных для обновления плейлиста");
    }

    let playlistTitleForNotifications = "";
    let addedTrackSnapshots = [];

    await withWriteLock(async () => {
      const [playlists, tracks] = await Promise.all([
        readJson(PLAYLISTS_FILE, []),
        readJson(TRACKS_FILE, [])
      ]);

      const playlist = playlists.find((entry) => entry.id === playlistId);
      if (!playlist) {
        throw new HttpError(404, "Плейлист не найден");
      }
      ensurePlaylistStructure(playlist);

      if (playlist.userId !== currentUser.id) {
        throw new HttpError(403, "Редактировать плейлист может только автор");
      }

      if (hasTitle) {
        const title = String(body.title || "").trim();
        if (title.length < 1 || title.length > 120) {
          throw new HttpError(400, "Название плейлиста должно быть от 1 до 120 символов");
        }
        playlist.title = title;
      }

      if (hasDescription) {
        const description = String(body.description || "").trim();
        if (description.length > 1000) {
          throw new HttpError(400, "Описание плейлиста не должно превышать 1000 символов");
        }
        playlist.description = description;
      }

      if (hasTrackIds) {
        const nextTrackIds = parseTrackIdsInput(body.trackIds);
        const tracksById = new Map();
        for (const track of tracks) {
          ensureTrackStructure(track);
          tracksById.set(track.id, track);
        }

        for (const trackId of nextTrackIds) {
          if (!tracksById.has(trackId)) {
            throw new HttpError(404, "Один из треков для плейлиста не найден");
          }
        }

        const previousTrackIds = new Set(
          Array.isArray(playlist.trackIds)
            ? playlist.trackIds.map((trackId) => String(trackId || "").trim()).filter(Boolean)
            : []
        );
        addedTrackSnapshots = nextTrackIds
          .filter((trackId) => !previousTrackIds.has(trackId))
          .map((trackId) => tracksById.get(trackId))
          .filter(Boolean)
          .map((track) => ({
            id: track.id,
            userId: track.userId,
            kind: track.kind,
            title: track.title
          }));
        playlist.trackIds = nextTrackIds;
      }

      playlist.updatedAt = new Date().toISOString();
      playlistTitleForNotifications = playlist.title;
      await writeJson(PLAYLISTS_FILE, playlists);
    });

    const playlists = await listPlaylists(currentUser);
    const updated = playlists.find((entry) => entry.id === playlistId) || null;
    queuePlaylistAddNotifications(addedTrackSnapshots, playlistTitleForNotifications);
    sendJson(res, 200, { playlist: updated });
    return true;
  }

  if (playlistMatch && method === "DELETE") {
    requireAuth(currentUser);

    const playlistId = playlistMatch[1];
    await withWriteLock(async () => {
      const playlists = await readJson(PLAYLISTS_FILE, []);
      const index = playlists.findIndex((entry) => entry.id === playlistId);
      if (index < 0) {
        throw new HttpError(404, "Плейлист не найден");
      }
      const playlist = playlists[index];
      ensurePlaylistStructure(playlist);
      if (playlist.userId !== currentUser.id) {
        throw new HttpError(403, "Удалить плейлист может только автор");
      }
      playlists.splice(index, 1);
      await writeJson(PLAYLISTS_FILE, playlists);
    });

    sendJson(res, 200, { ok: true });
    return true;
  }

  const playlistTracksMatch = pathname.match(/^\/api\/playlists\/([^/]+)\/tracks$/);
  if (playlistTracksMatch && method === "POST") {
    requireAuth(currentUser);

    const playlistId = playlistTracksMatch[1];
    const body = await parseJsonBody(req);
    const trackId = parseRequiredTrackId(body.trackId);

    let added = false;
    let playlistSnapshot = null;
    let addedTrackSnapshot = null;

    await withWriteLock(async () => {
      const [playlists, tracks] = await Promise.all([
        readJson(PLAYLISTS_FILE, []),
        readJson(TRACKS_FILE, [])
      ]);

      const playlist = playlists.find((entry) => entry.id === playlistId);
      if (!playlist) {
        throw new HttpError(404, "Плейлист не найден");
      }
      ensurePlaylistStructure(playlist);

      if (playlist.userId !== currentUser.id) {
        throw new HttpError(403, "Изменять плейлист может только автор");
      }

      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      if (playlist.trackIds.includes(trackId)) {
        playlist.trackIds = playlist.trackIds.filter((id) => id !== trackId);
        added = false;
      } else {
        playlist.trackIds.push(trackId);
        playlist.trackIds = uniqueStringArray(playlist.trackIds);
        added = true;
        addedTrackSnapshot = {
          id: track.id,
          userId: track.userId,
          kind: track.kind,
          title: track.title
        };
      }

      playlist.updatedAt = new Date().toISOString();
      playlistSnapshot = { ...playlist };
      await writeJson(PLAYLISTS_FILE, playlists);
    });

    const tracks = await readJson(TRACKS_FILE, []);
    for (const track of tracks) {
      ensureTrackStructure(track);
    }
    const context = {
      currentUserId: currentUser.id,
      tracksById: buildTrackMap(tracks)
    };

    sendJson(res, 200, {
      ok: true,
      added,
      playlist: playlistSnapshot ? toPlaylistDto(playlistSnapshot, context) : null
    });
    if (added && addedTrackSnapshot && playlistSnapshot?.title) {
      queuePlaylistAddNotifications([addedTrackSnapshot], playlistSnapshot.title);
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/albums") {
    const albums = await listAlbums(currentUser);
    sendJson(res, 200, { albums });
    return true;
  }

  if (method === "POST" && pathname === "/api/albums") {
    requireAuth(currentUser);

    const tempCleanupPaths = [];
    let storedCoverFileName = null;
    let storedCoverMimeType = null;
    let createdAlbumId = null;

    try {
      let payload;
      if (isMultipartRequest(req)) {
        const multipart = await parseMultipartForm(req, {
          maxFiles: 1,
          maxFields: 48,
          maxFieldSize: 512 * 1024,
          maxFileSize: MAX_IMAGE_SIZE,
          maxTotalFileSize: MAX_IMAGE_SIZE
        });
        payload = parseAlbumPayloadFromMultipart(multipart);
        for (const file of multipart.files) {
          tempCleanupPaths.push(file.tempPath);
        }
      } else {
        const body = await parseJsonBody(req);
        payload = parseAlbumPayloadFromBody(body);
      }

      const requestedTrackIds = uniqueStringArray(
        (Array.isArray(payload.trackIds) ? payload.trackIds : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      );

      if (requestedTrackIds.length === 0) {
        throw new HttpError(400, "В альбоме должен быть хотя бы один трек");
      }

      if (payload.cover) {
        const coverEntry = await toCoverFileEntry(payload.cover, tempCleanupPaths);
        const coverUpload = await ensureValidCoverUpload(coverEntry);
        storedCoverFileName = await storeFileFromPath(coverUpload.sourcePath, COVERS_DIR, coverUpload.extension);
        storedCoverMimeType = coverUpload.mimeType;
      }

      try {
        await withWriteLock(async () => {
          const [albums, tracks] = await Promise.all([
            readJson(ALBUMS_FILE, []),
            readJson(TRACKS_FILE, [])
          ]);

          const tracksById = new Map();
          for (const track of tracks) {
            ensureTrackStructure(track);
            tracksById.set(track.id, track);
          }

          const resolvedTrackIds = [];
          for (const trackId of requestedTrackIds) {
            const track = tracksById.get(trackId);
            if (!track) {
              throw new HttpError(404, "Один из треков для альбома не найден");
            }
            if (track.userId !== currentUser.id) {
              throw new HttpError(403, "В альбом можно добавлять только свои треки");
            }
            resolvedTrackIds.push(trackId);
          }

          if (!storedCoverFileName) {
            const fallbackCoverTrack = resolvedTrackIds
              .map((trackId) => tracksById.get(trackId))
              .find((track) => track && track.coverFileName);
            if (fallbackCoverTrack) {
              storedCoverFileName = fallbackCoverTrack.coverFileName || null;
              storedCoverMimeType = fallbackCoverTrack.coverMimeType || null;
            }
          }

          const nowIso = new Date().toISOString();
          const album = {
            id: crypto.randomUUID(),
            userId: currentUser.id,
            username: currentUser.username,
            title: payload.title,
            description: payload.description,
            genre: payload.genre,
            authors: payload.authors || [],
            producers: payload.producers || [],
            hashtags: payload.hashtags || [],
            trackIds: resolvedTrackIds,
            coverFileName: storedCoverFileName || null,
            coverMimeType: storedCoverMimeType || null,
            createdAt: nowIso,
            updatedAt: nowIso
          };

          albums.push(album);
          await writeJson(ALBUMS_FILE, albums);
          createdAlbumId = album.id;
        });
      } catch (error) {
        if (storedCoverFileName && payload.cover) {
          await deleteFileSafe(path.join(COVERS_DIR, storedCoverFileName));
        }
        throw error;
      }
    } finally {
      await cleanupTempFiles(tempCleanupPaths);
    }

    const albums = await listAlbums(currentUser);
    const created = albums.find((entry) => entry.id === createdAlbumId) || null;
    sendJson(res, 201, { album: created });
    return true;
  }

  const albumMatch = pathname.match(/^\/api\/albums\/([^/]+)$/);
  if (albumMatch && method === "GET") {
    const albumId = albumMatch[1];
    const albums = await listAlbums(currentUser);
    const album = albums.find((entry) => entry.id === albumId);
    if (!album) {
      throw new HttpError(404, "Альбом не найден");
    }
    sendJson(res, 200, { album });
    return true;
  }

  if (method === "GET" && pathname === "/api/profile/analytics") {
    requireAuth(currentUser);

    const [tracks, users] = await Promise.all([
      readJson(TRACKS_FILE, []),
      readJson(USERS_FILE, [])
    ]);

    for (const track of tracks) {
      ensureTrackStructure(track);
    }
    for (const user of users) {
      ensureUserStructure(user);
    }

    const myTracks = tracks.filter((track) => track.userId === currentUser.id);
    const repostMap = buildRepostMap(users);

    let totalListens = 0;
    let totalLikes = 0;
    let totalDislikes = 0;
    let totalComments = 0;
    let totalReposts = 0;
    let totalDurationSec = 0;

    const retentionTotals = { 25: 0, 50: 0, 100: 0 };
    const dailyTotals = {};
    const sourceTotals = {};
    const publishModeTotals = {};
    const genreTotals = {};
    const topTracks = [];

    for (const track of myTracks) {
      const listensCount = sanitizePositiveCounter(track.listensCount);
      const likesCount = Array.isArray(track.likes) ? track.likes.length : 0;
      const dislikesCount = Array.isArray(track.dislikes) ? track.dislikes.length : 0;
      const commentsCount = Array.isArray(track.comments) ? track.comments.length : 0;
      const repostsCount = sanitizePositiveCounter(repostMap.get(track.id) || 0);
      const durationSec = sanitizeDurationSeconds(track.durationSec);

      totalListens += listensCount;
      totalLikes += likesCount;
      totalDislikes += dislikesCount;
      totalComments += commentsCount;
      totalReposts += repostsCount;
      totalDurationSec += durationSec;

      const mode = String(track.publishMode || "public");
      publishModeTotals[mode] = sanitizePositiveCounter(publishModeTotals[mode]) + 1;

      const genre = String(track.genre || "").trim().toLowerCase() || "";
      if (genre) {
        genreTotals[genre] = sanitizePositiveCounter(genreTotals[genre]) + 1;
      }

      for (const milestone of LISTEN_MILESTONES) {
        const key = String(milestone);
        retentionTotals[milestone] += sanitizePositiveCounter(track.listenStats?.retention?.[key] || 0);
      }

      for (const [day, count] of Object.entries(track.listenStats?.dailyListens || {})) {
        const dayKey = String(day || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
          continue;
        }
        dailyTotals[dayKey] = sanitizePositiveCounter(dailyTotals[dayKey]) + sanitizePositiveCounter(count);
      }

      for (const [source, count] of Object.entries(track.listenStats?.sources || {})) {
        const normalizedSource = sanitizeListenSource(source);
        sourceTotals[normalizedSource] =
          sanitizePositiveCounter(sourceTotals[normalizedSource]) + sanitizePositiveCounter(count);
      }

      topTracks.push({
        id: track.id,
        title: track.title,
        listensCount,
        likesCount,
        commentsCount,
        repostsCount,
        durationSec
      });
    }

    const tracksCount = myTracks.length;
    const averageListensPerTrack = tracksCount > 0 ? Math.round(totalListens / tracksCount) : 0;
    const averageTrackDurationSec = tracksCount > 0 ? Math.round(totalDurationSec / tracksCount) : 0;
    const engagementRatePerListen = totalListens > 0
      ? Math.round(((totalLikes + totalComments + totalReposts) / totalListens) * 100) / 100
      : 0;

    const listensByDay = buildAnalyticsLastDaysSeries(dailyTotals, 30);
    const activeDays = listensByDay.filter((item) => Number(item.listens) > 0).length;
    const peakDay = listensByDay.reduce(
      (best, current) => (Number(current.listens) > Number(best.listens) ? current : best),
      { date: "", listens: 0 }
    );

    const sources = buildListFromCounterObject(sourceTotals, "source").slice(0, 20);
    const publishModes = buildListFromCounterObject(publishModeTotals, "mode");
    const genres = buildListFromCounterObject(genreTotals, "genre").slice(0, 20);

    topTracks.sort((a, b) => {
      if (b.listensCount !== a.listensCount) {
        return b.listensCount - a.listensCount;
      }
      if (b.likesCount !== a.likesCount) {
        return b.likesCount - a.likesCount;
      }
      return b.commentsCount - a.commentsCount;
    });

    const retention = {
      count25: retentionTotals[25],
      count50: retentionTotals[50],
      count100: retentionTotals[100],
      percent25: totalListens > 0 ? Math.round((retentionTotals[25] / totalListens) * 100) : 0,
      percent50: totalListens > 0 ? Math.round((retentionTotals[50] / totalListens) * 100) : 0,
      percent100: totalListens > 0 ? Math.round((retentionTotals[100] / totalListens) * 100) : 0
    };

    sendJson(res, 200, {
      analytics: {
        tracksCount,
        totalListens,
        totalLikes,
        totalDislikes,
        totalComments,
        totalReposts,
        totalDurationSec,
        averageListensPerTrack,
        averageTrackDurationSec,
        engagementRatePerListen,
        activeDays,
        peakDay,
        retention,
        listensByDay,
        sources,
        publishModes,
        genres,
        topTracks: topTracks.slice(0, 10)
      }
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/listen-history") {
    requireAuth(currentUser);

    const [users, tracks] = await Promise.all([
      readJson(USERS_FILE, []),
      readJson(TRACKS_FILE, [])
    ]);

    const user = users.find((entry) => entry.id === currentUser.id);
    if (!user) {
      throw new HttpError(404, "Пользователь не найден");
    }
    ensureUserStructure(user);

    const tracksById = new Map();
    for (const track of tracks) {
      ensureTrackStructure(track);
      tracksById.set(track.id, track);
    }

    const history = [];
    for (const entry of user.listenHistory) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const trackId = String(entry.trackId || "").trim();
      if (!trackId) {
        continue;
      }
      const track = tracksById.get(trackId);
      if (!track) {
        continue;
      }
      if (!canViewTrack(track, currentUser.id, { direct: true })) {
        continue;
      }

      history.push({
        trackId,
        title: track.title,
        username: track.username,
        kind: track.kind,
        coverUrl: track.coverFileName ? buildMediaUrl("covers", track.coverFileName) : null,
        sharePath: buildTrackSharePath(track),
        milestone: Number(entry.milestone) || 25,
        progress: Number.isFinite(Number(entry.progress)) ? Number(entry.progress) : null,
        listenedAt: entry.listenedAt
      });
    }

    sendJson(res, 200, { history });
    return true;
  }

  if ((method === "PUT" || method === "POST") && pathname === "/api/profile/email") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const rawEmail = String(body.email || "").trim();
    const nextEmail = rawEmail ? validateEmail(rawEmail) : null;

    let updatedUser = null;

    await withWriteLock(async () => {
      const users = await readJson(USERS_FILE, []);
      const user = users.find((entry) => entry.id === currentUser.id);
      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }
      ensureUserStructure(user);

      if (nextEmail) {
        const emailTaken = users.some(
          (entry) =>
            entry.id !== user.id &&
            typeof entry.email === "string" &&
            normalizeEmail(entry.email) === nextEmail
        );
        if (emailTaken) {
          throw new HttpError(409, "Этот email уже используется другим аккаунтом");
        }
      }

      user.email = nextEmail;
      user.emailVerifiedAt = null;
      updatedUser = user;
      await writeJson(USERS_FILE, users);
    });

    if (updatedUser && updatedUser.email) {
      await sendEmailVerificationForUser(updatedUser, req);
    }

    sendJson(res, 200, { ok: true, user: exposeUser(updatedUser) });
    return true;
  }

  if (method === "POST" && pathname === "/api/email/verification/request") {
    requireAuth(currentUser);

    const users = await readJson(USERS_FILE, []);
    const user = users.find((entry) => entry.id === currentUser.id);
    if (!user) {
      throw new HttpError(404, "Пользователь не найден");
    }
    ensureUserStructure(user);

    await sendEmailVerificationForUser(user, req);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "POST" && pathname === "/api/email/verify") {
    const body = await parseJsonBody(req);
    const token = String(body.token || "").trim();
    const result = await confirmEmailVerificationToken(token);
    sendJson(res, 200, result);
    return true;
  }

  if (method === "PUT" && pathname === "/api/profile/password") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    validatePassword(newPassword);

    await withWriteLock(async () => {
      const [users, sessions] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(SESSIONS_FILE, {})
      ]);

      const user = users.find((entry) => entry.id === currentUser.id);
      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }
      ensureUserStructure(user);

      if (!user.salt || !user.passwordHash || !verifyPassword(currentPassword, user.salt, user.passwordHash)) {
        throw new HttpError(401, "Неверный текущий пароль");
      }

      const { salt, hash } = hashPassword(newPassword);
      user.salt = salt;
      user.passwordHash = hash;

      const currentSid = parseCookies(req).sid;
      for (const sid of Object.keys(sessions)) {
        if (sid !== currentSid && sessions[sid]?.userId === user.id) {
          delete sessions[sid];
        }
      }

      await Promise.all([
        writeJson(USERS_FILE, users),
        writeJson(SESSIONS_FILE, sessions)
      ]);
    });

    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "POST" && pathname === "/api/password-reset/request") {
    const body = await parseJsonBody(req);
    const email = String(body.email || "").trim();
    if (!email) {
      throw new HttpError(400, "Введите email");
    }

    enforceAuthRateLimit(req, "passwordResetRequest", {
      extraKey: normalizeEmail(email)
    });

    await requestPasswordResetByEmail(email, req);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (method === "POST" && pathname === "/api/password-reset/confirm") {
    const body = await parseJsonBody(req);
    const token = String(body.token || "").trim();
    const newPassword = String(body.newPassword || "");
    const result = await confirmPasswordResetToken(token, newPassword);
    sendJson(res, 200, result);
    return true;
  }

  const trackListenMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/listen$/);
  if (trackListenMatch && method === "POST") {
    const trackId = trackListenMatch[1];
    const body = await parseJsonBody(req);
    const milestone = normalizeListenMilestone(body || {});
    const progress = Number(body?.progress);
    const source = sanitizeListenSource(body?.source);

    let listensCount = 0;

    await withWriteLock(async () => {
      const [tracks, users] = await Promise.all([
        readJson(TRACKS_FILE, []),
        readJson(USERS_FILE, [])
      ]);

      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      const currentUserId = currentUser ? currentUser.id : null;
      if (!canViewTrack(track, currentUserId, { direct: true })) {
        throw new HttpError(404, "Трек не найден");
      }

      incrementCounterRecord(track.listenStats.retention, String(milestone), 1);
      incrementCounterRecord(track.listenStats.dailyListens, getUtcDateKey(), 1);
      incrementCounterRecord(track.listenStats.sources, source, 1);

      if (milestone === 50) {
        track.listensCount = sanitizePositiveCounter(track.listensCount) + 1;
      }
      listensCount = sanitizePositiveCounter(track.listensCount);
      track.updatedAt = new Date().toISOString();

      if (currentUserId) {
        const user = users.find((entry) => entry.id === currentUserId);
        if (user) {
          ensureUserStructure(user);
          upsertUserListenHistory(user, track.id, milestone, Number.isFinite(progress) ? progress : null);
          await Promise.all([
            writeJson(TRACKS_FILE, tracks),
            writeJson(USERS_FILE, users)
          ]);
          return;
        }
      }

      await writeJson(TRACKS_FILE, tracks);
    });

    sendJson(res, 200, {
      ok: true,
      milestone,
      listensCount
    });
    return true;
  }

  const trackReactionMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/(like|dislike|repost)$/);
  if (trackReactionMatch && method === "POST") {
    requireAuth(currentUser);

    const trackId = trackReactionMatch[1];
    const reaction = trackReactionMatch[2];

    let responsePayload = { ok: true };
    let notificationPayload = null;

    await withWriteLock(async () => {
      const [tracks, users] = await Promise.all([
        readJson(TRACKS_FILE, []),
        readJson(USERS_FILE, [])
      ]);

      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      if (!canViewTrack(track, currentUser.id, { direct: true })) {
        throw new HttpError(404, "Трек не найден");
      }

      if (reaction === "repost") {
        const user = users.find((entry) => entry.id === currentUser.id);
        if (!user) {
          throw new HttpError(404, "Пользователь не найден");
        }
        ensureUserStructure(user);

        let reposted = false;
        if (user.reposts.includes(track.id)) {
          user.reposts = user.reposts.filter((id) => id !== track.id);
          reposted = false;
        } else {
          user.reposts.push(track.id);
          user.reposts = uniqueStringArray(user.reposts);
          reposted = true;
        }

        await writeJson(USERS_FILE, users);
        responsePayload = { ok: true, reposted };

        if (reposted && track.userId !== currentUser.id) {
          notificationPayload = {
            userId: track.userId,
            type: "track_repost",
            actorUserId: currentUser.id,
            actorUsername: currentUser.username,
            trackId: track.id,
            trackKind: track.kind,
            trackTitle: track.title,
            href: buildTrackSharePath(track)
          };
        }
        return;
      }

      const currentUserId = currentUser.id;
      let active = false;

      if (reaction === "like") {
        if (track.likes.includes(currentUserId)) {
          track.likes = track.likes.filter((id) => id !== currentUserId);
          active = false;
        } else {
          track.likes.push(currentUserId);
          track.likes = uniqueStringArray(track.likes);
          track.dislikes = track.dislikes.filter((id) => id !== currentUserId);
          active = true;
        }
      }

      if (reaction === "dislike") {
        if (track.dislikes.includes(currentUserId)) {
          track.dislikes = track.dislikes.filter((id) => id !== currentUserId);
          active = false;
        } else {
          track.dislikes.push(currentUserId);
          track.dislikes = uniqueStringArray(track.dislikes);
          track.likes = track.likes.filter((id) => id !== currentUserId);
          active = true;
        }
      }

      track.updatedAt = new Date().toISOString();
      await writeJson(TRACKS_FILE, tracks);

      responsePayload = {
        ok: true,
        reaction,
        active,
        likesCount: track.likes.length,
        dislikesCount: track.dislikes.length
      };

      if (active && track.userId !== currentUser.id) {
        notificationPayload = {
          userId: track.userId,
          type: reaction === "like" ? "track_like" : "track_dislike",
          actorUserId: currentUser.id,
          actorUsername: currentUser.username,
          trackId: track.id,
          trackKind: track.kind,
          trackTitle: track.title,
          href: buildTrackSharePath(track)
        };
      }
    });

    if (notificationPayload) {
      queueUserNotification(notificationPayload);
    }

    sendJson(res, 200, responsePayload);
    return true;
  }

  const trackCommentsCollectionMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/comments$/);
  if (trackCommentsCollectionMatch && method === "POST") {
    requireAuth(currentUser);

    const trackId = trackCommentsCollectionMatch[1];
    const body = await parseJsonBody(req);
    const text = String(body.text || "").trim();
    const parentCommentIdRaw = body.parentCommentId;
    const parentCommentId = parentCommentIdRaw ? String(parentCommentIdRaw).trim() : null;

    if (text.length < 1 || text.length > 400) {
      throw new HttpError(400, "Комментарий должен быть от 1 до 400 символов");
    }

    enforceSpamGuard("comment", currentUser.id, text, trackId);

    let createdComment = null;
    let trackSnapshot = null;
    let parentComment = null;

    await withWriteLock(async () => {
      const tracks = await readJson(TRACKS_FILE, []);
      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      if (!canViewTrack(track, currentUser.id, { direct: true })) {
        throw new HttpError(404, "Трек не найден");
      }

      if (parentCommentId) {
        parentComment = track.comments.find((entry) => entry.id === parentCommentId) || null;
        if (!parentComment) {
          throw new HttpError(404, "Комментарий для ответа не найден");
        }
      }

      createdComment = {
        id: crypto.randomUUID(),
        parentCommentId: parentCommentId || null,
        userId: currentUser.id,
        username: currentUser.username,
        text,
        likes: [],
        dislikes: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      track.comments.push(createdComment);
      track.updatedAt = new Date().toISOString();
      trackSnapshot = {
        id: track.id,
        userId: track.userId,
        kind: track.kind,
        title: track.title,
        username: track.username
      };

      await writeJson(TRACKS_FILE, tracks);
    });

    sendJson(res, 201, { ok: true, comment: createdComment });

    if (trackSnapshot && trackSnapshot.userId !== currentUser.id) {
      queueUserNotification({
        userId: trackSnapshot.userId,
        type: "comment_new",
        actorUserId: currentUser.id,
        actorUsername: currentUser.username,
        trackId: trackSnapshot.id,
        trackKind: trackSnapshot.kind,
        trackTitle: trackSnapshot.title,
        commentId: createdComment?.id || null,
        commentPreview: text.slice(0, 200),
        href: buildTrackSharePath(trackSnapshot)
      });
    }

    if (
      parentComment &&
      parentComment.userId &&
      parentComment.userId !== currentUser.id &&
      (!trackSnapshot || parentComment.userId !== trackSnapshot.userId)
    ) {
      queueUserNotification({
        userId: parentComment.userId,
        type: "comment_reply",
        actorUserId: currentUser.id,
        actorUsername: currentUser.username,
        trackId: trackSnapshot?.id || null,
        trackKind: trackSnapshot?.kind || null,
        trackTitle: trackSnapshot?.title || "",
        commentId: createdComment?.id || null,
        commentPreview: text.slice(0, 200),
        href: trackSnapshot ? buildTrackSharePath(trackSnapshot) : "/"
      });
    }

    queueMentionNotifications({
      text,
      type: "mention",
      action: "comment",
      actorUserId: currentUser.id,
      actorUsername: currentUser.username,
      trackId: trackSnapshot?.id || null,
      trackKind: trackSnapshot?.kind || null,
      trackTitle: trackSnapshot?.title || "",
      commentId: createdComment?.id || null,
      commentPreview: text.slice(0, 200),
      href: trackSnapshot ? buildTrackSharePath(trackSnapshot) : "/",
      excludeUserIds: [
        currentUser.id,
        trackSnapshot?.userId || null,
        parentComment?.userId || null
      ]
    });

    return true;
  }

  const trackCommentReactionMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/comments\/([^/]+)\/(like|dislike)$/);
  if (trackCommentReactionMatch && method === "POST") {
    requireAuth(currentUser);

    const trackId = trackCommentReactionMatch[1];
    const commentId = trackCommentReactionMatch[2];
    const reaction = trackCommentReactionMatch[3];

    let resultPayload = null;

    await withWriteLock(async () => {
      const tracks = await readJson(TRACKS_FILE, []);
      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      if (!canViewTrack(track, currentUser.id, { direct: true })) {
        throw new HttpError(404, "Трек не найден");
      }

      const comment = track.comments.find((entry) => entry.id === commentId);
      if (!comment) {
        throw new HttpError(404, "Комментарий не найден");
      }
      ensureCommentStructure(comment);

      const currentUserId = currentUser.id;
      let active = false;

      if (reaction === "like") {
        if (comment.likes.includes(currentUserId)) {
          comment.likes = comment.likes.filter((id) => id !== currentUserId);
          active = false;
        } else {
          comment.likes.push(currentUserId);
          comment.likes = uniqueStringArray(comment.likes);
          comment.dislikes = comment.dislikes.filter((id) => id !== currentUserId);
          active = true;
        }
      } else {
        if (comment.dislikes.includes(currentUserId)) {
          comment.dislikes = comment.dislikes.filter((id) => id !== currentUserId);
          active = false;
        } else {
          comment.dislikes.push(currentUserId);
          comment.dislikes = uniqueStringArray(comment.dislikes);
          comment.likes = comment.likes.filter((id) => id !== currentUserId);
          active = true;
        }
      }

      comment.updatedAt = new Date().toISOString();
      track.updatedAt = new Date().toISOString();
      await writeJson(TRACKS_FILE, tracks);

      resultPayload = {
        ok: true,
        reaction,
        active,
        likesCount: comment.likes.length,
        dislikesCount: comment.dislikes.length,
        likedByAuthor: comment.likes.includes(track.userId)
      };
    });

    sendJson(res, 200, resultPayload || { ok: true });
    return true;
  }

  const trackCommentMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/comments\/([^/]+)$/);
  if (trackCommentMatch && method === "DELETE") {
    requireAuth(currentUser);

    const trackId = trackCommentMatch[1];
    const commentId = trackCommentMatch[2];
    let removedCount = 0;

    await withWriteLock(async () => {
      const tracks = await readJson(TRACKS_FILE, []);
      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      const targetComment = track.comments.find((entry) => entry.id === commentId);
      if (!targetComment) {
        throw new HttpError(404, "Комментарий не найден");
      }
      ensureCommentStructure(targetComment);

      const canDelete = Boolean(
        currentUser &&
        (currentUser.isAdmin || targetComment.userId === currentUser.id || track.userId === currentUser.id)
      );
      if (!canDelete) {
        throw new HttpError(403, "Удалить комментарий может автор комментария, автор трека или администратор");
      }

      const removeIds = new Set([commentId]);
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const comment of track.comments) {
          ensureCommentStructure(comment);
          if (comment.parentCommentId && removeIds.has(comment.parentCommentId) && !removeIds.has(comment.id)) {
            removeIds.add(comment.id);
            expanded = true;
          }
        }
      }

      const beforeCount = track.comments.length;
      track.comments = track.comments.filter((entry) => !removeIds.has(entry.id));
      removedCount = beforeCount - track.comments.length;
      track.updatedAt = new Date().toISOString();

      await writeJson(TRACKS_FILE, tracks);
    });

    sendJson(res, 200, { ok: true, removedCount });
    return true;
  }

  if (method === "POST" && pathname === "/api/profile/pinned-tracks") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const trackId = parseRequiredTrackId(body.trackId);

    let pinned = false;
    let updatedUser = null;

    await withWriteLock(async () => {
      const [users, tracks] = await Promise.all([
        readJson(USERS_FILE, []),
        readJson(TRACKS_FILE, [])
      ]);

      const user = users.find((entry) => entry.id === currentUser.id);
      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }
      ensureUserStructure(user);

      const track = tracks.find((entry) => entry.id === trackId);
      if (!track) {
        throw new HttpError(404, "Трек не найден");
      }
      ensureTrackStructure(track);

      if (track.userId !== user.id) {
        throw new HttpError(403, "Закреплять можно только свои треки");
      }

      if (user.pinnedTrackIds.includes(trackId)) {
        user.pinnedTrackIds = user.pinnedTrackIds.filter((id) => id !== trackId);
        pinned = false;
      } else {
        if (user.pinnedTrackIds.length >= 3) {
          throw new HttpError(400, "Можно закрепить максимум 3 трека");
        }
        user.pinnedTrackIds.push(trackId);
        user.pinnedTrackIds = uniqueStringArray(user.pinnedTrackIds).slice(0, 3);
        pinned = true;
      }

      updatedUser = user;
      await writeJson(USERS_FILE, users);
    });

    sendJson(res, 200, {
      ok: true,
      pinned,
      user: exposeUser(updatedUser)
    });
    return true;
  }

  if (method === "PUT" && pathname === "/api/tracks") {
    requireAuth(currentUser);

    const body = await parseJsonBody(req);
    const trackId = String(body.id || "").trim();

    if (!trackId) {
      throw new HttpError(400, "id обязателен");
    }

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

      if (track.userId !== currentUser.id) {
        throw new HttpError(403, "Редактировать трек может только автор");
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

  return false;
}
