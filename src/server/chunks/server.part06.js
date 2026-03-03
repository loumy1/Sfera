"use strict";

async function handleApiRequest(req, res, pathname, currentUser) {
  const method = req.method;

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
