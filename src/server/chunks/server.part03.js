"use strict";

async function processAudioFile(fileEntry) {
  let normalizedAudioMime = fileEntry.mimeType;
  let sourcePath = fileEntry.tempPath;
  let additionalTempPath = null;
  let usedWavFallback = false;

  if (AUTO_CONVERT_WAV_TO_MP3 && normalizedAudioMime === "audio/wav") {
    try {
      sourcePath = await withFfmpegQueue(() => convertWavFileToMp3(fileEntry.tempPath));
      additionalTempPath = sourcePath;
      normalizedAudioMime = "audio/mpeg";
    } catch (error) {
      const missingFfmpeg = error instanceof HttpError && /ffmpeg/i.test(String(error.message || ""));
      if (!missingFfmpeg) {
        throw error;
      }
      usedWavFallback = true;
      sourcePath = fileEntry.tempPath;
      normalizedAudioMime = "audio/wav";
      additionalTempPath = null;
    }
  }

  const finalSize = await getFileSize(sourcePath);
  if (finalSize > MAX_STORED_AUDIO_SIZE) {
    if (additionalTempPath) {
      await deleteFileSafe(additionalTempPath);
    }
    if (usedWavFallback) {
      throw new HttpError(
        413,
        "WAV-файл слишком большой для сохранения без ffmpeg. Установите ffmpeg или загрузите MP3."
      );
    }
    throw new HttpError(
      413,
      "Финальный размер аудио слишком большой. Попробуйте короче трек или меньший битрейт."
    );
  }

  return {
    sourcePath,
    normalizedAudioMime,
    extension: inferAudioExtension(fileEntry.originalName, normalizedAudioMime),
    additionalTempPath
  };
}

async function ensureValidCoverUpload(fileEntry) {  if (!COVER_IMAGE_MIME_TYPES.has(fileEntry.mimeType)) {
    throw new HttpError(400, "Обложка должна быть PNG, JPG или GIF");
  }

  const coverSize = await getFileSize(fileEntry.tempPath);
  if (coverSize > MAX_IMAGE_SIZE) {
    throw new HttpError(413, "Обложка слишком большая");
  }

  return {
    sourcePath: fileEntry.tempPath,
    extension: inferImageExtension(fileEntry.originalName, fileEntry.mimeType),
    mimeType: fileEntry.mimeType
  };
}

function buildMediaUrl(kind, fileName) {
  const safeKind = String(kind || "").trim();
  const safeFileName = String(fileName || "").trim();
  if (!safeKind || !safeFileName) {
    return null;
  }
  return `/api/media/${encodeURIComponent(safeKind)}?file=${encodeURIComponent(safeFileName)}`;
}

function ensureUserStructure(user) {
  if (typeof user.bio !== "string") {
    user.bio = "";
  }

  if (!Array.isArray(user.reposts)) {
    user.reposts = [];
  }

  if (!Array.isArray(user.friends)) {
    user.friends = [];
  }

  if (!Array.isArray(user.incomingFriendRequests)) {
    user.incomingFriendRequests = [];
  }

  if (!Array.isArray(user.outgoingFriendRequests)) {
    user.outgoingFriendRequests = [];
  }

  if (!Array.isArray(user.followers)) {
    user.followers = [];
  }

  if (!Array.isArray(user.following)) {
    user.following = [];
  }

  if (!Array.isArray(user.usedPromoCodes)) {
    user.usedPromoCodes = [];
  }

  user.isAdmin = Boolean(user.isAdmin);
  user.isVerifiedArtist = Boolean(user.isVerifiedArtist);
  user.isBanned = Boolean(user.isBanned);

  if (typeof user.banReason !== "string" && user.banReason !== null) {
    user.banReason = null;
  }
  if (typeof user.banReason === "string") {
    const trimmed = user.banReason.trim();
    user.banReason = trimmed || null;
  }

  if (typeof user.bannedAt !== "string" && user.bannedAt !== null) {
    user.bannedAt = null;
  }

  if (typeof user.adminGrantedAt !== "string" && user.adminGrantedAt !== null) {
    user.adminGrantedAt = null;
  }

  if (typeof user.verifiedArtistGrantedAt !== "string" && user.verifiedArtistGrantedAt !== null) {
    user.verifiedArtistGrantedAt = null;
  }

  if (!Array.isArray(user.warnings)) {
    user.warnings = [];
  } else {
    const normalizedWarnings = [];
    for (const warning of user.warnings) {
      if (!warning || typeof warning !== "object") {
        continue;
      }
      const text = String(warning.text || "").trim();
      if (!text) {
        continue;
      }
      const createdAt = typeof warning.createdAt === "string" ? warning.createdAt : new Date().toISOString();
      normalizedWarnings.push({
        id: String(warning.id || crypto.randomUUID()),
        text: text.slice(0, 500),
        createdAt,
        actorUserId: warning.actorUserId ? String(warning.actorUserId) : null,
        actorUsername: warning.actorUsername ? String(warning.actorUsername) : null
      });
    }
    user.warnings = normalizedWarnings
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 100);
  }

  if (!Array.isArray(user.listenHistory)) {
    user.listenHistory = [];
  } else {
    const normalizedHistory = [];

    for (const rawEntry of user.listenHistory) {
      if (!rawEntry || typeof rawEntry !== "object") {
        continue;
      }

      const trackId = String(rawEntry.trackId || "").trim();
      if (!trackId) {
        continue;
      }

      const listenedAt = typeof rawEntry.listenedAt === "string" ? rawEntry.listenedAt : new Date().toISOString();
      const milestoneRaw = Number(rawEntry.milestone);
      const milestone = LISTEN_MILESTONES.includes(milestoneRaw)
        ? milestoneRaw
        : (Number(rawEntry.progress) >= 1 ? 100 : Number(rawEntry.progress) >= 0.5 ? 50 : 25);

      let progress = Number(rawEntry.progress);
      if (!Number.isFinite(progress)) {
        progress = milestone / 100;
      }
      progress = Math.max(0, Math.min(1.2, progress));

      normalizedHistory.push({
        trackId,
        listenedAt,
        milestone,
        progress
      });
    }

    user.listenHistory = normalizedHistory
      .sort((a, b) => new Date(b.listenedAt).getTime() - new Date(a.listenedAt).getTime())
      .slice(0, LISTEN_HISTORY_LIMIT);
  }

  if (!Array.isArray(user.pinnedTrackIds)) {
    user.pinnedTrackIds = [];
  } else {
    user.pinnedTrackIds = uniqueStringArray(
      user.pinnedTrackIds
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    ).slice(0, 3);
  }

  // Backward-compatibility migration from the legacy "friends" model.
  if (user.followers.length === 0 && user.following.length === 0 && user.friends.length > 0) {
    user.followers = uniqueStringArray(user.friends.map((id) => String(id || "").trim()).filter(Boolean));
    user.following = uniqueStringArray(user.friends.map((id) => String(id || "").trim()).filter(Boolean));
  }

  if (typeof user.avatarFileName !== "string" && user.avatarFileName !== null) {
    user.avatarFileName = null;
  }

  if (typeof user.headerFileName !== "string" && user.headerFileName !== null) {
    user.headerFileName = null;
  }

  if (typeof user.email !== "string" && user.email !== null) {
    user.email = null;
  }
  if (typeof user.email === "string") {
    user.email = normalizeEmail(user.email);
    if (!user.email) {
      user.email = null;
    }
  }

  if (typeof user.emailVerifiedAt !== "string" && user.emailVerifiedAt !== null) {
    user.emailVerifiedAt = null;
  }

  user.language = normalizeUserLanguage(user.language, "ru");
}

function ensureCommentStructure(comment) {
  if (!Array.isArray(comment.likes)) {
    comment.likes = [];
  }

  if (!Array.isArray(comment.dislikes)) {
    comment.dislikes = [];
  }

  if (typeof comment.parentCommentId !== "string") {
    comment.parentCommentId = null;
  }

  if (typeof comment.updatedAt !== "string") {
    comment.updatedAt = comment.createdAt;
  }
}

function ensureTrackStructure(track) {
  if (!Array.isArray(track.likes)) {
    track.likes = [];
  }

  if (!Array.isArray(track.dislikes)) {
    track.dislikes = [];
  }

  if (!Array.isArray(track.comments)) {
    track.comments = [];
  }

  if (!Array.isArray(track.authors)) {
    track.authors = [];
  }

  if (!Array.isArray(track.producers)) {
    track.producers = [];
  }

  if (!Array.isArray(track.hashtags)) {
    track.hashtags = [];
  }

  track.isExplicit = Boolean(track.isExplicit);

  let normalizedLyrics = null;
  try {
    normalizedLyrics = normalizeTrackLyricsInput({
      plain: track.lyricsPlain,
      syncText: track.lyricsSyncText
    });
  } catch {
    normalizedLyrics = {
      plain: String(track.lyricsPlain || "").trim().slice(0, MAX_LYRICS_PLAIN_LENGTH),
      syncText: "",
      segments: [],
      hasWordTimings: false
    };
  }
  track.lyricsPlain = normalizedLyrics.plain;
  track.lyricsSyncText = normalizedLyrics.syncText;
  track.lyricsSegments = normalizedLyrics.segments;
  track.lyricsHasWordTimings = normalizedLyrics.hasWordTimings;

  let normalizedGenius = null;
  try {
    normalizedGenius = normalizeTrackGeniusInput({
      songId: track.geniusSongId,
      url: track.geniusUrl,
      title: track.geniusTitle,
      artist: track.geniusArtist,
      imageUrl: track.geniusImageUrl
    });
  } catch {
    normalizedGenius = {
      songId: "",
      url: "",
      title: "",
      artist: "",
      imageUrl: ""
    };
  }
  track.geniusSongId = normalizedGenius.songId;
  track.geniusUrl = normalizedGenius.url;
  track.geniusTitle = normalizedGenius.title;
  track.geniusArtist = normalizedGenius.artist;
  track.geniusImageUrl = normalizedGenius.imageUrl;

  track.kind = normalizeTrackKind(track.kind);
  track.beatBpm = sanitizeBeatBpm(track.beatBpm);
  track.beatRootNote = sanitizeBeatRootNote(track.beatRootNote);
  try {
    track.beatLicenses = normalizeBeatLicenses(track.beatLicenses);
  } catch {
    track.beatLicenses = [];
  }

  try {
    track.publishMode = normalizePublishMode(track.publishMode);
  } catch {
    track.publishMode = "public";
  }

  if (typeof track.premiereAt !== "string" && track.premiereAt !== null) {
    track.premiereAt = null;
  }

  if (track.premiereAt) {
    try {
      track.premiereAt = parsePremiereAt(track.premiereAt);
    } catch {
      track.premiereAt = null;
    }
  }

  if (track.publishMode !== "premiere") {
    track.premiereAt = null;
  }

  if (!Number.isFinite(track.listensCount) || track.listensCount < 0) {
    track.listensCount = 0;
  }

  track.durationSec = sanitizeDurationSeconds(track.durationSec);

  ensureListenStatsStructure(track);

  if (typeof track.updatedAt !== "string") {
    track.updatedAt = track.createdAt;
  }

  for (const comment of track.comments) {
    ensureCommentStructure(comment);
  }
}

function ensurePlaylistStructure(playlist) {
  if (!Array.isArray(playlist.trackIds)) {
    playlist.trackIds = [];
  }

  if (typeof playlist.updatedAt !== "string") {
    playlist.updatedAt = playlist.createdAt;
  }
}

function ensureAlbumStructure(album) {
  if (!Array.isArray(album.trackIds)) {
    album.trackIds = [];
  }

  if (!Array.isArray(album.authors)) {
    album.authors = [];
  }

  if (!Array.isArray(album.producers)) {
    album.producers = [];
  }

  if (!Array.isArray(album.hashtags)) {
    album.hashtags = [];
  }

  if (typeof album.genre !== "string") {
    album.genre = "";
  }

  if (typeof album.description !== "string") {
    album.description = "";
  }

  if (typeof album.coverFileName !== "string" && album.coverFileName !== null) {
    album.coverFileName = null;
  }

  if (typeof album.coverMimeType !== "string" && album.coverMimeType !== null) {
    album.coverMimeType = null;
  }

  if (typeof album.updatedAt !== "string") {
    album.updatedAt = album.createdAt;
  }
}

function ensureMessageStructure(message) {
  if (typeof message.createdAt !== "string") {
    message.createdAt = new Date().toISOString();
  }

  message.isSupport = Boolean(message.isSupport);

  if (typeof message.supportUserId !== "string" && message.supportUserId !== null) {
    message.supportUserId = null;
  }

  if (message.isSupport) {
    const normalizedSupportUserId = String(
      message.supportUserId || message.fromUserId || message.toUserId || ""
    ).trim();
    message.supportUserId = normalizedSupportUserId || null;
  } else {
    message.supportUserId = null;
  }
}

function syncUsernameAcrossResources(input) {
  if (!input || typeof input !== "object") {
    return false;
  }

  const userId = String(input.userId || "").trim();
  const nextUsername = String(input.username || "").trim();
  if (!userId || !nextUsername) {
    return false;
  }

  let changed = false;

  for (const track of Array.isArray(input.tracks) ? input.tracks : []) {
    ensureTrackStructure(track);
    if (track.userId === userId && track.username !== nextUsername) {
      track.username = nextUsername;
      changed = true;
    }
    for (const comment of Array.isArray(track.comments) ? track.comments : []) {
      ensureCommentStructure(comment);
      if (comment.userId === userId && comment.username !== nextUsername) {
        comment.username = nextUsername;
        changed = true;
      }
    }
  }

  for (const playlist of Array.isArray(input.playlists) ? input.playlists : []) {
    ensurePlaylistStructure(playlist);
    if (playlist.userId === userId && playlist.username !== nextUsername) {
      playlist.username = nextUsername;
      changed = true;
    }
  }

  for (const album of Array.isArray(input.albums) ? input.albums : []) {
    ensureAlbumStructure(album);
    if (album.userId === userId && album.username !== nextUsername) {
      album.username = nextUsername;
      changed = true;
    }
  }

  for (const notification of Array.isArray(input.notifications) ? input.notifications : []) {
    if (!ensureNotificationStructure(notification)) {
      continue;
    }
    if (notification.actorUserId === userId && notification.actorUsername !== nextUsername) {
      notification.actorUsername = nextUsername;
      changed = true;
    }
    if (notification.peerUserId === userId && notification.peerUsername !== nextUsername) {
      notification.peerUsername = nextUsername;
      changed = true;
    }
  }

  for (const warningTarget of Array.isArray(input.users) ? input.users : []) {
    ensureUserStructure(warningTarget);
    for (const warning of Array.isArray(warningTarget.warnings) ? warningTarget.warnings : []) {
      if (warning?.actorUserId === userId && warning.actorUsername !== nextUsername) {
        warning.actorUsername = nextUsername;
        changed = true;
      }
    }
  }

  return changed;
}

function removeUserInteractionsFromTrack(track, userId) {
  ensureTrackStructure(track);

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return false;
  }

  let changed = false;

  const nextLikes = track.likes.filter((id) => id !== normalizedUserId);
  if (nextLikes.length !== track.likes.length) {
    track.likes = nextLikes;
    changed = true;
  }

  const nextDislikes = track.dislikes.filter((id) => id !== normalizedUserId);
  if (nextDislikes.length !== track.dislikes.length) {
    track.dislikes = nextDislikes;
    changed = true;
  }

  const removedCommentIds = new Set();
  for (const comment of track.comments) {
    ensureCommentStructure(comment);
    if (comment.userId === normalizedUserId) {
      removedCommentIds.add(comment.id);
      changed = true;
      continue;
    }

    const nextCommentLikes = comment.likes.filter((id) => id !== normalizedUserId);
    if (nextCommentLikes.length !== comment.likes.length) {
      comment.likes = nextCommentLikes;
      changed = true;
    }

    const nextCommentDislikes = comment.dislikes.filter((id) => id !== normalizedUserId);
    if (nextCommentDislikes.length !== comment.dislikes.length) {
      comment.dislikes = nextCommentDislikes;
      changed = true;
    }
  }

  if (removedCommentIds.size > 0) {
    track.comments = track.comments.filter((comment) => !removedCommentIds.has(comment.id));
  }

  if (changed) {
    track.updatedAt = new Date().toISOString();
  }

  return changed;
}

function deleteSessionsForUser(sessionStore, userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!sessionStore || typeof sessionStore !== "object" || !normalizedUserId) {
    return false;
  }

  let changed = false;
  for (const sid of Object.keys(sessionStore)) {
    if (sessionStore[sid]?.userId === normalizedUserId) {
      delete sessionStore[sid];
      changed = true;
    }
  }
  return changed;
}

function ensureNotificationStructure(notification) {
  if (!notification || typeof notification !== "object") {
    return false;
  }

  notification.id = String(notification.id || "").trim() || crypto.randomUUID();
  notification.userId = String(notification.userId || "").trim();
  notification.type = String(notification.type || "generic").trim() || "generic";
  notification.action = typeof notification.action === "string" ? notification.action : null;
  notification.actorUserId = typeof notification.actorUserId === "string" ? notification.actorUserId : null;
  notification.actorUsername = typeof notification.actorUsername === "string" ? notification.actorUsername : null;
  notification.targetUserId = typeof notification.targetUserId === "string" ? notification.targetUserId : null;
  notification.peerUserId = typeof notification.peerUserId === "string" ? notification.peerUserId : null;
  notification.peerUsername = typeof notification.peerUsername === "string" ? notification.peerUsername : null;
  notification.trackId = typeof notification.trackId === "string" ? notification.trackId : null;
  notification.trackKind = typeof notification.trackKind === "string" ? normalizeTrackKind(notification.trackKind) : null;
  notification.trackTitle = typeof notification.trackTitle === "string" ? notification.trackTitle : "";
  notification.albumId = typeof notification.albumId === "string" ? notification.albumId : null;
  notification.albumTitle = typeof notification.albumTitle === "string" ? notification.albumTitle : "";
  notification.commentId = typeof notification.commentId === "string" ? notification.commentId : null;
  notification.commentPreview = typeof notification.commentPreview === "string" ? notification.commentPreview : "";
  notification.messagePreview = typeof notification.messagePreview === "string" ? notification.messagePreview : "";
  notification.href = typeof notification.href === "string" ? notification.href : "";
  notification.createdAt = typeof notification.createdAt === "string" ? notification.createdAt : new Date().toISOString();
  notification.readAt = typeof notification.readAt === "string" ? notification.readAt : null;

  if (!notification.userId) {
    return false;
  }

  if (!notification.href) {
    if (notification.trackId) {
      notification.href = buildTrackSharePath({
        id: notification.trackId,
        kind: notification.trackKind === "beat" ? "beat" : "song"
      });
    } else if (notification.albumId) {
      notification.href = buildAlbumSharePath({ id: notification.albumId });
    } else if (notification.actorUsername) {
      notification.href = `/u/${encodeURIComponent(notification.actorUsername)}`;
    } else {
      notification.href = "/";
    }
  }

  return true;
}

function toNotificationDto(notification) {
  ensureNotificationStructure(notification);
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    action: notification.action,
    actorUserId: notification.actorUserId,
    actorUsername: notification.actorUsername,
    targetUserId: notification.targetUserId,
    peerUserId: notification.peerUserId,
    peerUsername: notification.peerUsername,
    trackId: notification.trackId,
    trackKind: notification.trackKind,
    trackTitle: notification.trackTitle,
    albumId: notification.albumId,
    albumTitle: notification.albumTitle,
    commentId: notification.commentId,
    commentPreview: notification.commentPreview,
    messagePreview: notification.messagePreview,
    href: notification.href,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    isRead: Boolean(notification.readAt)
  };
}

function trimNotificationsForUser(store, userId, limit = NOTIFICATIONS_PER_USER_LIMIT) {
  const entries = Array.isArray(store) ? store : [];
  const userEntries = entries
    .filter((entry) => entry && entry.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (userEntries.length <= limit) {
    return entries;
  }

  const keepIds = new Set(userEntries.slice(0, limit).map((entry) => entry.id));
  return entries.filter((entry) => entry.userId !== userId || keepIds.has(entry.id));
}

async function listNotifications(currentUser) {
  requireAuth(currentUser);
  const notifications = await readJson(NOTIFICATIONS_FILE, []);
  const normalized = [];

  for (const raw of notifications) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const copy = { ...raw };
    if (!ensureNotificationStructure(copy)) {
      continue;
    }
    normalized.push(copy);
  }

  return normalized
    .filter((item) => item.userId === currentUser.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100)
    .map(toNotificationDto);
}

async function markAllNotificationsRead(userId) {
  let updatedCount = 0;

  await withWriteLock(async () => {
    const notifications = await readJson(NOTIFICATIONS_FILE, []);
    const now = new Date().toISOString();
    let changed = false;

    for (const item of notifications) {
      if (!item || typeof item !== "object") {
        continue;
      }
      if (!ensureNotificationStructure(item)) {
        continue;
      }
      if (item.userId !== userId || item.readAt) {
        continue;
      }
      item.readAt = now;
      updatedCount += 1;
      changed = true;
    }

    if (changed) {
      await writeJson(NOTIFICATIONS_FILE, notifications);
    }
  });

  return { ok: true, updatedCount };
}

async function createUserNotification(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const userId = String(input.userId || "").trim();
  if (!userId) {
    return null;
  }

  const actorUserId = input.actorUserId ? String(input.actorUserId).trim() : null;
  if (actorUserId && actorUserId === userId) {
    return null;
  }

  let created = null;

  await withWriteLock(async () => {
    const notifications = await readJson(NOTIFICATIONS_FILE, []);
    const entry = {
      id: crypto.randomUUID(),
      userId,
      type: String(input.type || "generic"),
      action: typeof input.action === "string" ? input.action : null,
      actorUserId,
      actorUsername: typeof input.actorUsername === "string" ? input.actorUsername : null,
      targetUserId: typeof input.targetUserId === "string" ? input.targetUserId : null,
      peerUserId: typeof input.peerUserId === "string" ? input.peerUserId : null,
      peerUsername: typeof input.peerUsername === "string" ? input.peerUsername : null,
      trackId: typeof input.trackId === "string" ? input.trackId : null,
      trackKind: typeof input.trackKind === "string" ? input.trackKind : null,
      trackTitle: typeof input.trackTitle === "string" ? input.trackTitle : "",
      albumId: typeof input.albumId === "string" ? input.albumId : null,
      albumTitle: typeof input.albumTitle === "string" ? input.albumTitle : "",
      commentId: typeof input.commentId === "string" ? input.commentId : null,
      commentPreview: typeof input.commentPreview === "string" ? input.commentPreview : "",
      messagePreview: typeof input.messagePreview === "string" ? input.messagePreview : "",
      href: typeof input.href === "string" ? input.href : "",
      createdAt: new Date().toISOString(),
      readAt: null
    };

    if (!ensureNotificationStructure(entry)) {
      return;
    }

    notifications.push(entry);
    const trimmed = trimNotificationsForUser(notifications, userId);
    await writeJson(NOTIFICATIONS_FILE, trimmed);
    created = toNotificationDto(entry);
  });

  if (created) {
    notifyUserRealtime(userId, "notification:new", {
      notification: created
    });
  }

  return created;
}

function queueUserNotification(input) {
  createUserNotification(input).catch((error) => {
    console.error("Notification enqueue failed:", error);
  });
}

function extractMentionedUsernames(text) {
  const source = String(text || "");
  if (!source) {
    return [];
  }

  const result = [];
  const seen = new Set();
  const pattern = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,24})(?=$|[^a-zA-Z0-9_])/g;

  for (const match of source.matchAll(pattern)) {
    const username = String(match[2] || "").trim().toLowerCase();
    if (!username || seen.has(username)) {
      continue;
    }
    seen.add(username);
    result.push(username);
  }

  return result;
}

async function createMentionNotifications(input) {
  if (!input || typeof input !== "object") {
    return [];
  }

  const mentionedUsernames = extractMentionedUsernames(input.text);
  if (mentionedUsernames.length === 0) {
    return [];
  }

  const users = await readJson(USERS_FILE, []);
  const usersByUsername = new Map();

  for (const user of users) {
    ensureUserStructure(user);
    const key = String(user.username || "").trim().toLowerCase();
    if (key && !usersByUsername.has(key)) {
      usersByUsername.set(key, user);
    }
  }

  const excludedUserIds = new Set(
    [
      input.actorUserId,
      ...(Array.isArray(input.excludeUserIds) ? input.excludeUserIds : [])
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );

  const created = [];
  for (const usernameKey of mentionedUsernames) {
    const mentionedUser = usersByUsername.get(usernameKey);
    if (!mentionedUser || excludedUserIds.has(mentionedUser.id)) {
      continue;
    }
    excludedUserIds.add(mentionedUser.id);

    const createdNotification = await createUserNotification({
      userId: mentionedUser.id,
      type: typeof input.type === "string" && input.type ? input.type : "mention",
      action: typeof input.action === "string" ? input.action : null,
      actorUserId: typeof input.actorUserId === "string" ? input.actorUserId : null,
      actorUsername: typeof input.actorUsername === "string" ? input.actorUsername : null,
      targetUserId: typeof input.targetUserId === "string" ? input.targetUserId : null,
      peerUserId: typeof input.peerUserId === "string" ? input.peerUserId : null,
      peerUsername: typeof input.peerUsername === "string" ? input.peerUsername : null,
      trackId: typeof input.trackId === "string" ? input.trackId : null,
      trackKind: typeof input.trackKind === "string" ? input.trackKind : null,
      trackTitle: typeof input.trackTitle === "string" ? input.trackTitle : "",
      albumId: typeof input.albumId === "string" ? input.albumId : null,
      albumTitle: typeof input.albumTitle === "string" ? input.albumTitle : "",
      commentId: typeof input.commentId === "string" ? input.commentId : null,
      commentPreview: typeof input.commentPreview === "string" ? input.commentPreview : "",
      messagePreview: typeof input.messagePreview === "string" ? input.messagePreview : "",
      href: typeof input.href === "string" ? input.href : ""
    });

    if (createdNotification) {
      created.push(createdNotification);
    }
  }

  return created;
}

function queueMentionNotifications(input) {
  createMentionNotifications(input).catch((error) => {
    console.error("Mention notification enqueue failed:", error);
  });
}

function buildTrackSharePath(track) {
  ensureTrackStructure(track);
  const section = track.kind === "beat" ? "b" : "t";
  return `/item-page.html?section=${section}&id=${encodeURIComponent(String(track.id || ""))}`;
}

function buildAlbumSharePath(album) {
  return `/item-page.html?section=a&id=${encodeURIComponent(String(album?.id || ""))}`;
}

function ensureEmailTokenStoreStructure(store) {
  if (!store || typeof store !== "object") {
    return { tokens: [] };
  }
  if (!Array.isArray(store.tokens)) {
    store.tokens = [];
  }

  const normalized = [];
  for (const raw of store.tokens) {
    if (!raw || typeof raw !== "object") continue;
    const tokenType = String(raw.type || "").trim();
    const tokenHash = String(raw.tokenHash || "").trim();
    const userId = raw.userId ? String(raw.userId).trim() : null;
    const email = raw.email ? normalizeEmail(raw.email) : null;
    if (!tokenType || !tokenHash) continue;
    normalized.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      type: tokenType,
      tokenHash,
      userId,
      email,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
      expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : new Date(Date.now() + 3600000).toISOString(),
      usedAt: typeof raw.usedAt === "string" ? raw.usedAt : null
    });
  }
  store.tokens = normalized;
  return store;
}

function pruneEmailTokens(store) {
  ensureEmailTokenStoreStructure(store);
  const now = Date.now();
  store.tokens = store.tokens.filter((entry) => {
    const expiresAt = new Date(entry.expiresAt).getTime();
    if (entry.usedAt) return false;
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  return store;
}

async function appendMailOutboxEntry(entry) {
  await withWriteLock(async () => {
    const outbox = await readJson(MAIL_OUTBOX_FILE, []);
    const list = Array.isArray(outbox) ? outbox : [];
    list.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...entry
    });
    while (list.length > 500) {
      list.shift();
    }
    await writeJson(MAIL_OUTBOX_FILE, list);
  });
}

function escapeHtmlForEmail(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSmtpTransporter() {
  if (!SMTP_IS_CONFIGURED) {
    return null;
  }
  if (!nodemailer) {
    return null;
  }
  if (smtpTransporter) {
    return smtpTransporter;
  }

  const transportOptions = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: SMTP_REQUIRE_TLS,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
    tls: {
      rejectUnauthorized: SMTP_TLS_REJECT_UNAUTHORIZED
    }
  };

  if (SMTP_USER && SMTP_PASS) {
    transportOptions.auth = {
      user: SMTP_USER,
      pass: SMTP_PASS
    };
  }

  smtpTransporter = nodemailer.createTransport(transportOptions);
  return smtpTransporter;
}

async function sendPlatformEmail({ to, subject, text }) {
  const normalizedTo = normalizeEmail(to);
  const safeSubject = String(subject || "sfera");
  const safeText = String(text || "");
  const transporter = getSmtpTransporter();

  if (transporter) {
    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to: normalizedTo,
        subject: safeSubject,
        text: safeText,
        html: `<pre style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;white-space:pre-wrap;line-height:1.45">${escapeHtmlForEmail(safeText)}</pre>`
      });

      if (MAIL_WRITE_OUTBOX_COPY) {
        await appendMailOutboxEntry({
          to: normalizedTo,
          subject: safeSubject,
          text: safeText,
          deliveredVia: "smtp-copy"
        });
      }

      console.log("[mail-smtp]", {
        to: normalizedTo,
        subject: safeSubject
      });
      return { ok: true, delivery: "smtp" };
    } catch (error) {
      console.error("[mail-smtp] send failed, fallback to outbox:", error);
    }
  }

  await appendMailOutboxEntry({
    to: normalizedTo,
    subject: safeSubject,
    text: safeText,
    deliveredVia: "outbox"
  });

  console.log("[mail-outbox]", {
    to: normalizedTo,
    subject: safeSubject,
    preview: safeText
  });

  return { ok: true, delivery: "outbox" };
}

function getPublicBaseUrl(req) {
  const explicit = String(process.env.PUBLIC_BASE_URL || "").trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }
  const host = String(req?.headers?.host || "").trim();
  const proto = String(req?.headers?.["x-forwarded-proto"] || "").trim() || "http";
  if (!host) {
    return "http://localhost:3000";
  }
  return `${proto}://${host}`;
}

async function createEmailToken({ type, userId = null, email = null, ttlMs }) {
  const plainToken = createActionTokenPlain();
  const tokenHash = hashActionToken(plainToken);
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  await withWriteLock(async () => {
    const rawStore = await readJson(EMAIL_TOKENS_FILE, { tokens: [] });
    const store = ensureEmailTokenStoreStructure(rawStore);
    pruneEmailTokens(store);

    // Only one active token of same type per user/email.
    store.tokens = store.tokens.filter((entry) => {
      if (entry.type !== type) return true;
      if (userId && entry.userId && entry.userId === userId) return false;
      if (email && entry.email && entry.email === normalizeEmail(email)) return false;
      return true;
    });

    store.tokens.push({
      id: crypto.randomUUID(),
      type,
      tokenHash,
      userId: userId ? String(userId) : null,
      email: email ? normalizeEmail(email) : null,
      createdAt: nowIso,
      expiresAt,
      usedAt: null
    });

    await writeJson(EMAIL_TOKENS_FILE, store);
  });

  return {
    token: plainToken,
    expiresAt
  };
}

async function consumeEmailToken(type, plainToken) {
  const tokenHash = hashActionToken(plainToken);
  let matched = null;

  await withWriteLock(async () => {
    const rawStore = await readJson(EMAIL_TOKENS_FILE, { tokens: [] });
    const store = ensureEmailTokenStoreStructure(rawStore);
    const now = Date.now();
    let changed = false;

    for (const entry of store.tokens) {
      const expiresAtMs = new Date(entry.expiresAt).getTime();
      const expired = !Number.isFinite(expiresAtMs) || expiresAtMs <= now;
      if (expired || entry.usedAt) {
        changed = true;
        continue;
      }
      if (entry.type === type && entry.tokenHash === tokenHash && !matched) {
        entry.usedAt = new Date().toISOString();
        matched = { ...entry };
        changed = true;
      }
    }

    store.tokens = store.tokens.filter((entry) => {
      const expiresAtMs = new Date(entry.expiresAt).getTime();
      return !entry.usedAt && Number.isFinite(expiresAtMs) && expiresAtMs > now;
    });

    if (changed) {
      await writeJson(EMAIL_TOKENS_FILE, store);
    }
  });

  return matched;
}

async function sendEmailVerificationForUser(user, req) {
  ensureUserStructure(user);
  if (!user.email) {
    throw new HttpError(400, "Сначала укажите email в настройках аккаунта");
  }

  const { token, expiresAt } = await createEmailToken({
    type: "email_verify",
    userId: user.id,
    email: user.email,
    ttlMs: EMAIL_VERIFICATION_TTL_MS
  });

  const link = `${getPublicBaseUrl(req)}/?verifyEmailToken=${encodeURIComponent(token)}`;
  await sendPlatformEmail({
    to: user.email,
    subject: "sfera • Подтверждение email",
    text: [
      `Привет, @${user.username}!`,
      "",
      "Подтверди email для аккаунта sfera:",
      link,
      "",
      `Ссылка действует до: ${expiresAt}`
    ].join("\n")
  });

  return { ok: true, expiresAt };
}

async function confirmEmailVerificationToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new HttpError(400, "Токен подтверждения не передан");
  }

  const entry = await consumeEmailToken("email_verify", normalizedToken);
  if (!entry || !entry.userId || !entry.email) {
    throw new HttpError(400, "Ссылка подтверждения недействительна или истекла");
  }

  let updatedUser = null;

  await withWriteLock(async () => {
    const users = await readJson(USERS_FILE, []);
    const user = users.find((item) => item.id === entry.userId);
    if (!user) {
      throw new HttpError(404, "Пользователь не найден");
    }
    ensureUserStructure(user);
    if (!user.email || normalizeEmail(user.email) !== normalizeEmail(entry.email)) {
      throw new HttpError(400, "Email аккаунта изменился, запроси новое подтверждение");
    }
    user.emailVerifiedAt = new Date().toISOString();
    updatedUser = user;
    await writeJson(USERS_FILE, users);
  });

  return { ok: true, user: exposeUser(updatedUser) };
}

async function requestPasswordResetByEmail(email, req) {
  const normalizedEmail = validateEmail(email);
  let targetUser = null;

  const users = await readJson(USERS_FILE, []);
  for (const user of users) {
    ensureUserStructure(user);
    if (user.email && normalizeEmail(user.email) === normalizedEmail) {
      targetUser = user;
      break;
    }
  }

  // Always return generic success to prevent email enumeration.
  if (!targetUser) {
    return { ok: true };
  }

  const { token, expiresAt } = await createEmailToken({
    type: "password_reset",
    userId: targetUser.id,
    email: normalizedEmail,
    ttlMs: PASSWORD_RESET_TTL_MS
  });
  const link = `${getPublicBaseUrl(req)}/?resetPasswordToken=${encodeURIComponent(token)}`;
  await sendPlatformEmail({
    to: normalizedEmail,
    subject: "sfera • Сброс пароля",
    text: [
      `Привет, @${targetUser.username}!`,
      "",
      "Чтобы сбросить пароль в sfera, открой ссылку:",
      link,
      "",
      `Ссылка действует до: ${expiresAt}`
    ].join("\n")
  });

  return { ok: true };
}

async function confirmPasswordResetToken(token, newPassword) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new HttpError(400, "Токен сброса не передан");
  }
  validatePassword(newPassword);

  const entry = await consumeEmailToken("password_reset", normalizedToken);
  if (!entry || !entry.userId) {
    throw new HttpError(400, "Ссылка сброса недействительна или истекла");
  }

  await withWriteLock(async () => {
    const [users, sessions] = await Promise.all([
      readJson(USERS_FILE, []),
      readJson(SESSIONS_FILE, {})
    ]);
    const user = users.find((item) => item.id === entry.userId);
    if (!user) {
      throw new HttpError(404, "Пользователь не найден");
    }
    ensureUserStructure(user);
    if (!user.email || (entry.email && normalizeEmail(user.email) !== normalizeEmail(entry.email))) {
      throw new HttpError(400, "Email аккаунта изменился, запроси новый сброс");
    }

    const { salt, hash } = hashPassword(newPassword);
    user.salt = salt;
    user.passwordHash = hash;

    for (const sid of Object.keys(sessions)) {
      if (sessions[sid]?.userId === user.id) {
        delete sessions[sid];
      }
    }

    await Promise.all([
      writeJson(USERS_FILE, users),
      writeJson(SESSIONS_FILE, sessions)
    ]);
  });

  return { ok: true };
}

function normalizePromoCode(code) {
  return String(code || "").trim().toUpperCase();
}

const SYSTEM_PROMO_CODES = Object.freeze([
  {
    code: "ADMIN67GODBOSS",
    description: "Выдает режим администратора",
    active: true
  }
]);

function ensurePromoCodeStoreStructure(store) {
  if (!store || typeof store !== "object") {
    return { codes: [] };
  }

  if (!Array.isArray(store.codes)) {
    store.codes = [];
  }

  const normalizedCodes = [];

  for (const rawCode of store.codes) {
    if (!rawCode || typeof rawCode !== "object") {
      continue;
    }

    const code = normalizePromoCode(rawCode.code);
    if (!code) {
      continue;
    }

    normalizedCodes.push({
      code,
      description: String(rawCode.description || ""),
      active: rawCode.active !== false,
      usedBy: Array.isArray(rawCode.usedBy)
        ? uniqueStringArray(rawCode.usedBy.map((id) => String(id || "").trim()).filter(Boolean))
        : [],
      createdAt: typeof rawCode.createdAt === "string" ? rawCode.createdAt : new Date().toISOString(),
      updatedAt: typeof rawCode.updatedAt === "string" ? rawCode.updatedAt : new Date().toISOString()
    });
  }

  store.codes = normalizedCodes;
  return store;
}

function ensureSystemPromoCodes(store) {
  const normalized = ensurePromoCodeStoreStructure(store);
  let changed = false;

  for (const template of SYSTEM_PROMO_CODES) {
    const code = normalizePromoCode(template.code);
    if (!code) {
      continue;
    }
    let entry = normalized.codes.find((item) => item.code === code);
    if (!entry) {
      entry = {
        code,
        description: String(template.description || ""),
        active: template.active !== false,
        usedBy: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      normalized.codes.push(entry);
      changed = true;
    } else {
      const nextDescription = String(template.description || "");
      const nextActive = template.active !== false;
      if (entry.description !== nextDescription) {
        entry.description = nextDescription;
        changed = true;
      }
      if (entry.active !== nextActive) {
        entry.active = nextActive;
        changed = true;
      }
    }
  }

  if (changed) {
    const nowIso = new Date().toISOString();
    for (const code of normalized.codes) {
      code.updatedAt = nowIso;
    }
  }

  return { store: normalized, changed };
}

function exposeUser(user) {
  return {
    id: user.id,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarFileName ? buildMediaUrl("profiles", user.avatarFileName) : null,
    headerUrl: user.headerFileName ? buildMediaUrl("profiles", user.headerFileName) : null,
    reposts: user.reposts,
    followers: user.followers,
    following: user.following,
    pinnedTrackIds: user.pinnedTrackIds,
    usedPromoCodes: user.usedPromoCodes,
    isAdmin: Boolean(user.isAdmin),
    adminGrantedAt: user.adminGrantedAt || null,
    isVerifiedArtist: Boolean(user.isVerifiedArtist),
    verifiedArtistGrantedAt: user.verifiedArtistGrantedAt || null,
    isBanned: Boolean(user.isBanned),
    banReason: user.banReason || null,
    bannedAt: user.bannedAt || null,
    warnings: Array.isArray(user.warnings) ? user.warnings : [],
    warningsCount: Array.isArray(user.warnings) ? user.warnings.length : 0,
    email: user.email || null,
    emailVerified: Boolean(user.email && user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt || null,
    language: normalizeUserLanguage(user.language, "ru"),
    createdAt: user.createdAt
  };
}

function toPublicUser(user, currentUser) {
  const isCurrent = currentUser ? user.id === currentUser.id : false;
  const viewerIsAdmin = Boolean(currentUser && currentUser.isAdmin);
  const warnings = Array.isArray(user.warnings) ? user.warnings : [];

  return {
    id: user.id,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarFileName ? buildMediaUrl("profiles", user.avatarFileName) : null,
    headerUrl: user.headerFileName ? buildMediaUrl("profiles", user.headerFileName) : null,
    createdAt: user.createdAt,
    isSelf: isCurrent,
    isFollowing: Boolean(currentUser && currentUser.following.includes(user.id)),
    isFollower: Boolean(currentUser && currentUser.followers.includes(user.id)),
    isVerifiedArtist: Boolean(user.isVerifiedArtist),
    verifiedArtistGrantedAt: user.verifiedArtistGrantedAt || null,
    isBanned: Boolean(user.isBanned),
    banReason: viewerIsAdmin || isCurrent ? user.banReason || null : null,
    bannedAt: user.bannedAt || null,
    warningsCount: warnings.length
  };
}

function buildRepostMap(users) {
  const repostMap = new Map();

  for (const user of users) {
    ensureUserStructure(user);
    for (const trackId of user.reposts) {
      repostMap.set(trackId, (repostMap.get(trackId) || 0) + 1);
    }
  }

  return repostMap;
}

function buildTrackMap(tracks) {
  const map = new Map();
  for (const track of tracks) {
    ensureTrackStructure(track);
    map.set(track.id, track);
  }
  return map;
}

function toCommentDto(comment, context) {
  const {
    currentUserId,
    trackAuthorId,
    trackAuthorAvatarUrl,
    currentUserIsAdmin
  } = context;

  const likedByAuthor = comment.likes.includes(trackAuthorId);

  return {
    id: comment.id,
    parentCommentId: comment.parentCommentId,
    userId: comment.userId,
    username: comment.username,
    text: comment.text,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    likesCount: comment.likes.length,
    dislikesCount: comment.dislikes.length,
    liked: Boolean(currentUserId && comment.likes.includes(currentUserId)),
    disliked: Boolean(currentUserId && comment.dislikes.includes(currentUserId)),
    canDelete: Boolean(
      currentUserId &&
      (currentUserId === trackAuthorId || currentUserId === comment.userId || currentUserIsAdmin)
    ),
    likedByAuthor,
    authorBadgeAvatarUrl: likedByAuthor ? trackAuthorAvatarUrl : null,
    replies: []
  };
}

function buildCommentsTree(comments, context) {
  const sorted = comments
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const dtoMap = new Map();

  for (const comment of sorted) {
    dtoMap.set(comment.id, toCommentDto(comment, context));
  }

  const roots = [];

  for (const comment of sorted) {
    const dto = dtoMap.get(comment.id);
    if (comment.parentCommentId && dtoMap.has(comment.parentCommentId)) {
      dtoMap.get(comment.parentCommentId).replies.push(dto);
    } else {
      roots.push(dto);
    }
  }

  return roots;
}

function toTrackDto(track, context) {
  ensureTrackStructure(track);

  const {
    currentUserId,
    currentUserReposts,
    repostMap,
    usersById
  } = context;

  const trackOwner = usersById.get(track.userId);
  const trackAuthorAvatarUrl = trackOwner && trackOwner.avatarFileName
    ? buildMediaUrl("profiles", trackOwner.avatarFileName)
    : null;

  const commentsTree = buildCommentsTree(track.comments, {
    currentUserId,
    trackAuthorId: track.userId,
    trackAuthorAvatarUrl,
    currentUserIsAdmin: Boolean(
      currentUserId &&
      usersById.get(currentUserId) &&
      usersById.get(currentUserId).isAdmin
    )
  });

  return {
    id: track.id,
    kind: track.kind,
    userId: track.userId,
    username: track.username,
    title: track.title,
    isExplicit: Boolean(track.isExplicit),
    description: track.description,
    genre: track.genre,
    authors: track.authors,
    producers: track.producers,
    hashtags: track.hashtags,
    beatBpm: track.beatBpm,
    beatRootNote: track.beatRootNote,
    beatLicenses: track.beatLicenses,
    audioUrl: buildMediaUrl("audio", track.audioFileName),
    audioFileName: track.audioFileName,
    audioMimeType: track.audioMimeType,
    durationSec: track.durationSec,
    coverUrl: track.coverFileName ? buildMediaUrl("covers", track.coverFileName) : null,
    coverFileName: track.coverFileName,
    coverMimeType: track.coverMimeType,
    likesCount: track.likes.length,
    dislikesCount: track.dislikes.length,
    listensCount: track.listensCount,
    commentsCount: track.comments.length,
    repostsCount: repostMap.get(track.id) || 0,
    liked: Boolean(currentUserId && track.likes.includes(currentUserId)),
    disliked: Boolean(currentUserId && track.dislikes.includes(currentUserId)),
    reposted: Boolean(currentUserId && currentUserReposts.includes(track.id)),
    pinnedInProfile: Boolean(
      currentUserId &&
      currentUserId === track.userId &&
      trackOwner &&
      Array.isArray(trackOwner.pinnedTrackIds) &&
      trackOwner.pinnedTrackIds.includes(track.id)
    ),
    comments: commentsTree,
    publishMode: track.publishMode,
    premiereAt: track.premiereAt,
    isPremiereLive: isPremiereLive(track),
    sharePath: buildTrackSharePath(track),
    lyrics: {
      plain: track.lyricsPlain,
      syncText: track.lyricsSyncText,
      segments: track.lyricsSegments,
      hasWordTimings: Boolean(track.lyricsHasWordTimings)
    },
    genius: track.geniusSongId || track.geniusUrl || track.geniusTitle || track.geniusArtist || track.geniusImageUrl
      ? {
          songId: track.geniusSongId || "",
          url: track.geniusUrl || "",
          title: track.geniusTitle || "",
          artist: track.geniusArtist || "",
          imageUrl: track.geniusImageUrl || ""
        }
      : null,
    createdAt: track.createdAt,
    updatedAt: track.updatedAt,
    isOwner: Boolean(currentUserId && track.userId === currentUserId)
  };
}

function toPlaylistDto(playlist, context) {
  ensurePlaylistStructure(playlist);

  const { currentUserId, tracksById } = context;

  const tracks = playlist.trackIds
    .map((trackId) => tracksById.get(trackId))
    .filter(Boolean)
    .filter((track) => canViewTrack(track, currentUserId, { direct: false }))
    .map((track) => ({
      id: track.id,
      title: track.title,
      username: track.username,
      coverUrl: track.coverFileName ? buildMediaUrl("covers", track.coverFileName) : null,
      audioUrl: buildMediaUrl("audio", track.audioFileName),
      kind: track.kind,
      sharePath: buildTrackSharePath(track)
    }));

  const visibleTrackIds = tracks.map((track) => track.id);

  return {
    id: playlist.id,
    userId: playlist.userId,
    username: playlist.username,
    title: playlist.title,
    description: playlist.description,
    trackIds: visibleTrackIds,
    tracks,
    tracksCount: tracks.length,
    createdAt: playlist.createdAt,
    updatedAt: playlist.updatedAt,
    isOwner: Boolean(currentUserId && playlist.userId === currentUserId)
  };
}

function toAlbumDto(album, context) {
  ensureAlbumStructure(album);

  const { currentUserId, tracksById } = context;

  const tracks = album.trackIds
    .map((trackId) => tracksById.get(trackId))
    .filter(Boolean)
    .filter((track) => canViewTrack(track, currentUserId, { direct: false }))
    .map((track) => ({
      id: track.id,
      title: track.title,
      username: track.username,
      authors: Array.isArray(track.authors) ? track.authors : [],
      producers: Array.isArray(track.producers) ? track.producers : [],
      coverUrl: track.coverFileName ? buildMediaUrl("covers", track.coverFileName) : null,
      audioUrl: buildMediaUrl("audio", track.audioFileName),
      kind: track.kind,
      sharePath: buildTrackSharePath(track)
    }));

  const visibleTrackIds = tracks.map((track) => track.id);

  return {
    id: album.id,
    userId: album.userId,
    username: album.username,
    title: album.title,
    description: album.description,
    genre: album.genre,
    authors: album.authors,
    producers: album.producers,
    hashtags: album.hashtags,
    trackIds: visibleTrackIds,
    tracks,
    tracksCount: tracks.length,
    coverUrl: album.coverFileName ? buildMediaUrl("covers", album.coverFileName) : null,
    coverFileName: album.coverFileName,
    coverMimeType: album.coverMimeType,
    sharePath: buildAlbumSharePath(album),
    createdAt: album.createdAt,
    updatedAt: album.updatedAt,
    isOwner: Boolean(currentUserId && album.userId === currentUserId)
  };
}

function toMessageDto(message, usersById, currentUserId) {
  const fromUser = usersById.get(message.fromUserId);
  const toUser = usersById.get(message.toUserId);

  return {
    id: message.id,
    fromUserId: message.fromUserId,
    toUserId: message.toUserId,
    fromUsername: fromUser ? fromUser.username : "unknown",
    toUsername: toUser ? toUser.username : "unknown",
    fromAvatarUrl: fromUser && fromUser.avatarFileName ? buildMediaUrl("profiles", fromUser.avatarFileName) : null,
    toAvatarUrl: toUser && toUser.avatarFileName ? buildMediaUrl("profiles", toUser.avatarFileName) : null,
    text: message.text,
    createdAt: message.createdAt,
    mine: message.fromUserId === currentUserId,
    isSupport: Boolean(message.isSupport),
    supportUserId: message.supportUserId || null
  };
}

function createTrackDtoContext(users, currentUserId = null) {
  const usersById = new Map();
  let currentUser = null;

  for (const user of users) {
    ensureUserStructure(user);
    usersById.set(user.id, user);
    if (currentUserId && user.id === currentUserId) {
      currentUser = user;
    }
  }

  const currentUserReposts = currentUser && Array.isArray(currentUser.reposts)
    ? currentUser.reposts.map((id) => String(id || "").trim()).filter(Boolean)
    : [];

  return {
    currentUserId,
    currentUser,
    currentUserReposts,
    repostMap: buildRepostMap(users),
    usersById
  };
}

async function listTracks(currentUser) {
  const currentUserId = currentUser ? currentUser.id : null;
  const [tracks, users] = await Promise.all([
    readJson(TRACKS_FILE, []),
    readJson(USERS_FILE, [])
  ]);

  for (const track of tracks) {
    ensureTrackStructure(track);
  }

  const context = createTrackDtoContext(users, currentUserId);

  return tracks
    .filter((track) => canListTrack(track, currentUserId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((track) => toTrackDto(track, context));
}

async function listPlaylists(currentUser) {
  const currentUserId = currentUser ? currentUser.id : null;
  const [playlists, tracks] = await Promise.all([
    readJson(PLAYLISTS_FILE, []),
    readJson(TRACKS_FILE, [])
  ]);

  for (const playlist of playlists) {
    ensurePlaylistStructure(playlist);
  }

  for (const track of tracks) {
    ensureTrackStructure(track);
  }

  const tracksById = buildTrackMap(tracks);
  const context = { currentUserId, tracksById };

  return playlists
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .map((playlist) => toPlaylistDto(playlist, context));
}

async function listAlbums(currentUser) {
  const currentUserId = currentUser ? currentUser.id : null;
  const [albums, tracks] = await Promise.all([
    readJson(ALBUMS_FILE, []),
    readJson(TRACKS_FILE, [])
  ]);

  for (const album of albums) {
    ensureAlbumStructure(album);
  }

  for (const track of tracks) {
    ensureTrackStructure(track);
  }

  const tracksById = buildTrackMap(tracks);
  const context = { currentUserId, tracksById };

  return albums
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .map((album) => toAlbumDto(album, context));
}

async function getUserBySessionId(sid) {
  if (!sid) {
    return null;
  }

  const sessions = await readJson(SESSIONS_FILE, {});
  const session = sessions[sid];

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    await withWriteLock(async () => {
      const latestSessions = await readJson(SESSIONS_FILE, {});
      if (latestSessions[sid]) {
        delete latestSessions[sid];
        await writeJson(SESSIONS_FILE, latestSessions);
      }
    });
    return null;
  }

  const users = await readJson(USERS_FILE, []);
  const user = users.find((entry) => entry.id === session.userId);

  if (!user) {
    return null;
  }

  ensureUserStructure(user);
  return user;
}

async function getCurrentUser(req) {
  const sid = parseCookies(req).sid;
  return getUserBySessionId(sid);
}

function getUserSockets(userId) {
  let sockets = wsClientsByUserId.get(userId);
  if (!sockets) {
    sockets = new Set();
    wsClientsByUserId.set(userId, sockets);
  }
  return sockets;
}

function getOnlineUsersCount() {
  return wsClientsByUserId.size;
}

function registerWsClient(userId, socket) {
  const sockets = getUserSockets(userId);
  sockets.add(socket);
  broadcastOnlineCount();
}

function unregisterWsClient(userId, socket) {
  const sockets = wsClientsByUserId.get(userId);
  if (!sockets) {
    return;
  }

  sockets.delete(socket);
  if (sockets.size === 0) {
    wsClientsByUserId.delete(userId);
  }

  broadcastOnlineCount();
}

function encodeWebSocketFrame(opcode, payload = Buffer.alloc(0)) {
  const payloadLength = payload.length;

  if (payloadLength < 126) {
    const frame = Buffer.alloc(2 + payloadLength);
    frame[0] = 0x80 | (opcode & 0x0f);
    frame[1] = payloadLength;
    payload.copy(frame, 2);
    return frame;
  }

  if (payloadLength < 65536) {
    const frame = Buffer.alloc(4 + payloadLength);
    frame[0] = 0x80 | (opcode & 0x0f);
    frame[1] = 126;
    frame.writeUInt16BE(payloadLength, 2);
    payload.copy(frame, 4);
    return frame;
  }

  const frame = Buffer.alloc(10 + payloadLength);
  frame[0] = 0x80 | (opcode & 0x0f);
  frame[1] = 127;
  frame.writeBigUInt64BE(BigInt(payloadLength), 2);
  payload.copy(frame, 10);
  return frame;
}

function sendWsJson(socket, payload) {
  const serialized = JSON.stringify(payload);
  const frame = encodeWebSocketFrame(0x1, Buffer.from(serialized, "utf8"));
  socket.write(frame);
}

function notifyUserRealtime(userId, event, payload = {}) {
  const sockets = wsClientsByUserId.get(userId);
  if (!sockets || sockets.size === 0) {
    return;
  }

  const message = {
    event,
    payload,
    at: new Date().toISOString()
  };

  for (const socket of Array.from(sockets)) {
    if (socket.destroyed || socket.writableEnded) {
      sockets.delete(socket);
      continue;
    }

    try {
      sendWsJson(socket, message);
    } catch {
      sockets.delete(socket);
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    }
  }

  if (sockets.size === 0) {
    wsClientsByUserId.delete(userId);
  }
}

function notifyAllRealtime(event, payload = {}) {
  for (const [userId, sockets] of Array.from(wsClientsByUserId.entries())) {
    for (const socket of Array.from(sockets)) {
      if (socket.destroyed || socket.writableEnded) {
        sockets.delete(socket);
        continue;
      }

      try {
        sendWsJson(socket, {
          event,
          payload,
          at: new Date().toISOString()
        });
      } catch {
        sockets.delete(socket);
        try {
          socket.destroy();
        } catch {
          // ignore
        }
      }
    }

    if (sockets.size === 0) {
      wsClientsByUserId.delete(userId);
    }
  }
}

function broadcastOnlineCount() {
  notifyAllRealtime("online:count", {
    onlineUsers: getOnlineUsersCount()
  });
}

function handleRealtimeMessage(socket, userId, message) {
  if (typeof message !== "string") {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(message);
  } catch {
    return;
  }

  if (!payload || typeof payload !== "object") {
    return;
  }

  const event = String(payload.event || payload.type || "").trim().toLowerCase();
  if (event === "ping" || event === "ws:ping") {
    sendWsJson(socket, {
      event: "ws:pong",
      payload: {
        userId
      },
      at: new Date().toISOString()
    });
  }
}

function rejectWebSocketUpgrade(socket, statusCode, statusText) {
  if (!socket.destroyed) {
    socket.write(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\n\r\n`);
  }
  socket.destroy();
}

function setupWebSocketSocket(socket, userId) {
  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      if (buffer.length < 2) {
        return;
      }

      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const masked = (secondByte & 0x80) !== 0;

      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < offset + 2) {
          return;
        }
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        if (buffer.length < offset + 8) {
          return;
        }
        const rawLength = buffer.readBigUInt64BE(offset);
        if (rawLength > BigInt(1024 * 1024)) {
          socket.end(encodeWebSocketFrame(0x8));
          return;
        }
        payloadLength = Number(rawLength);
        offset += 8;
      }

      if (!masked) {
        socket.end(encodeWebSocketFrame(0x8));
        return;
      }

      if (buffer.length < offset + 4 + payloadLength) {
        return;
      }

      const mask = buffer.subarray(offset, offset + 4);
      offset += 4;

      const payload = buffer.subarray(offset, offset + payloadLength);
      buffer = buffer.subarray(offset + payloadLength);

      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= mask[i % 4];
      }

      if (opcode === 0x8) {
        socket.end(encodeWebSocketFrame(0x8));
        return;
      }

      if (opcode === 0x9) {
        socket.write(encodeWebSocketFrame(0xA, payload));
        return;
      }

      if (opcode === 0xA) {
        return;
      }

      if (opcode === 0x1 || opcode === 0x2) {
        const isText = opcode === 0x1;
        const message = isText ? payload.toString("utf8") : payload;
        handleRealtimeMessage(socket, userId, message);
        return;
      }

      socket.end(encodeWebSocketFrame(0x8));
    }
  });

  socket.on("end", () => {
    unregisterWsClient(userId, socket);
  });

  socket.on("close", () => {
    unregisterWsClient(userId, socket);
  });

  socket.on("error", () => {
    unregisterWsClient(userId, socket);
  });

  registerWsClient(userId, socket);
  broadcastOnlineCount();
}
