"use strict";

async function handleApi(req, res, pathname, currentUser) {
  const method = req.method;

  if (method === "POST" && pathname === "/api/profile/email") {
    await withWriteLock(async () => {
      const users = await readJson(USERS_FILE, []);
      const user = users.find((entry) => entry.id === currentUser.id);

      if (!user) {
        throw new HttpError(404, "Пользователь не найден");
      }

      ensureUserStructure(user);
      if (pathname === "/api/profile/avatar") {
        oldFileName = user.avatarFileName;
        user.avatarFileName = null;
      } else {
        oldFileName = user.headerFileName;
        user.headerFileName = null;
      }

      updated = user;
      await writeJson(USERS_FILE, users);
    });

    if (oldFileName) {
      await deleteFileSafe(path.join(PROFILES_DIR, oldFileName));
    }

    sendJson(res, 200, { user: exposeUser(updated) });
    return true;
  }

  const publicUserMatch = pathname.match(/^\/api\/public\/users\/([a-zA-Z0-9_]+)$/);
  if (publicUserMatch && method === "GET") {
    const targetUsername = publicUserMatch[1];
    const users = await readJson(USERS_FILE, []);

    for (const user of users) {
      ensureUserStructure(user);
    }

    const profileUser = users.find(
      (entry) => String(entry.username || "").toLowerCase() === targetUsername.toLowerCase()
    );

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
      viewer: current ? { id: current.id, username: current.username } : null,
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
      sendJson(res, 401, { error: "Требуется авторизация" });
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
          (message.fromUserId === currentUser.id && message.toUserId === otherUserId) ||
          (message.fromUserId === otherUserId && message.toUserId === currentUser.id)
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
        title: payload.title,
        description: payload.description,
        genre: payload.genre,
        authors: payload.authors || [],
        producers: payload.producers || [],
        hashtags: payload.hashtags || [],
        beatBpm: payload.bpm ?? null,
        beatRootNote: payload.rootNote || "",
        beatLicenses: payload.beatLicenses || [],
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

          if (track.userId !== currentUser.id) {
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

      if (track.userId !== currentUser.id) {
        throw new HttpError(403, "Удалить трек может только автор");
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
