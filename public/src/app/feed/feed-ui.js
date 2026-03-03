(() => {
  "use strict";
  function createAppFeedUi(deps) {
        const {
      state,
      elements,
      t,
      setStatus,
      formatDate,
      buildUserHref,
      createTrackLink,
      createUserLinkNode,
      toLocalDateTimeInputValue,
      parseLocalDateTimeToIso,
      getTrackVisibilityLabel,
      api,
      escapeHtml,
      switchTab,
      setImageWithFallback,
      updateTrackPlayButtons,
      buildAudioPlayer,
      startTrackPlayback,
      prepareAudio,
      prepareCover,
      parseCommaList,
      normalizeTag,
      isBeatTrack,
      normalizeBeatLicenses,
      getBeatLicenseTypeLabel,
      formatBeatLicensePrice,
      getOwnPlaylists,
      renderAll,
      refreshMe,
      refreshTracks,
      refreshPlaylists,
      refreshAlbums,
      loadConversation
    } = deps;
    const albumModalElements = {
      root: document.getElementById("albumModal"),
      closeBtn: document.getElementById("albumModalCloseBtn"),
      title: document.getElementById("albumModalTitle"),
      meta: document.getElementById("albumModalMeta"),
      cover: document.getElementById("albumModalCover"),
      description: document.getElementById("albumModalDescription"),
      tags: document.getElementById("albumModalTags"),
      tracks: document.getElementById("albumModalTracks")
    };
    let albumModalBindingsReady = false;

    function hasBlockingModalOpen() {
      if (albumModalElements.root && !albumModalElements.root.classList.contains("hidden")) {
        return true;
      }
      const notificationsOpen = Boolean(document.getElementById("notificationsModal") && !document.getElementById("notificationsModal").classList.contains("hidden"));
      const messagesOpen = Boolean(document.getElementById("messagesModal") && !document.getElementById("messagesModal").classList.contains("hidden"));
      return notificationsOpen || messagesOpen;
    }

    function syncBodyModalState() {
      if (hasBlockingModalOpen()) {
        document.body.classList.add("modal-open");
      } else {
        document.body.classList.remove("modal-open");
      }
    }

    function closeAlbumModal() {
      if (!albumModalElements.root) {
        return;
      }
      albumModalElements.root.classList.add("hidden");
      albumModalElements.root.setAttribute("aria-hidden", "true");
      syncBodyModalState();
    }

    function ensureAlbumModalBindings() {
      if (albumModalBindingsReady || !albumModalElements.root) {
        return;
      }
      albumModalBindingsReady = true;

      albumModalElements.closeBtn?.addEventListener("click", () => {
        closeAlbumModal();
      });

      albumModalElements.root.addEventListener("click", (event) => {
        if (event.target === albumModalElements.root || event.target?.dataset?.modalBackdrop === "1") {
          closeAlbumModal();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeAlbumModal();
        }
      });
    }

    function openAlbumModal(album) {
      if (!albumModalElements.root || !album || !album.id) {
        window.location.href = album?.sharePath || `/a/${encodeURIComponent(String(album?.id || ""))}`;
        return;
      }

      ensureAlbumModalBindings();

      if (albumModalElements.title) {
        albumModalElements.title.textContent = album.title || t("feedMainTitleAlbums");
      }
      if (albumModalElements.meta) {
        const metaParts = [
          `@${album.username || "unknown"}`,
          `${t("labelTracksCount")}: ${Number(album.tracksCount || (Array.isArray(album.tracks) ? album.tracks.length : 0))}`,
          `${t("labelGenre")}: ${album.genre || "-"}`
        ];
        albumModalElements.meta.textContent = metaParts.join(" • ");
      }
      if (albumModalElements.cover) {
        setImageWithFallback(albumModalElements.cover, album.coverUrl);
        albumModalElements.cover.alt = `${t("feedMainTitleAlbums")}: ${album.title || ""}`;
      }
      if (albumModalElements.description) {
        albumModalElements.description.textContent = album.description || t("textNoDescription");
      }
      if (albumModalElements.tags) {
        albumModalElements.tags.innerHTML = "";
        const tags = Array.isArray(album.hashtags) ? album.hashtags : [];
        for (const tag of tags) {
          const chip = document.createElement("span");
          chip.className = "tag";
          chip.textContent = `#${tag}`;
          albumModalElements.tags.appendChild(chip);
        }
      }
      if (albumModalElements.tracks) {
        albumModalElements.tracks.innerHTML = "";
        const tracks = Array.isArray(album.tracks) ? album.tracks : [];
        if (tracks.length === 0) {
          const empty = document.createElement("p");
          empty.className = "muted";
          empty.textContent = t("emptyNoTracks");
          albumModalElements.tracks.appendChild(empty);
        } else {
          for (let index = 0; index < tracks.length; index += 1) {
            const albumTrack = tracks[index];
            const fullTrack = state.tracks.find((entry) => entry.id === albumTrack.id) || albumTrack;
            const row = document.createElement("article");
            row.className = "album-modal-track";
            row.dataset.trackId = fullTrack.id || "";
            row.dataset.playSource = "album-modal";

            const order = document.createElement("span");
            order.className = "album-modal-track-order";
            order.textContent = `${index + 1}.`;

            const body = document.createElement("div");
            body.className = "album-modal-track-body";

            const title = document.createElement("h4");
            title.appendChild(createTrackLink(fullTrack, { source: "album-modal", className: "track-title-link compact-link" }));

            const info = document.createElement("p");
            info.className = "muted";
            info.appendChild(createUserLinkNode(fullTrack.username || album.username || "unknown", "user-link compact-link"));

            const authors = Array.isArray(fullTrack.authors) && fullTrack.authors.length > 0
              ? fullTrack.authors.join(", ")
              : null;
            const producers = Array.isArray(fullTrack.producers) && fullTrack.producers.length > 0
              ? fullTrack.producers.join(", ")
              : null;

            if (authors || producers) {
              const credits = document.createElement("p");
              credits.className = "album-modal-track-credits muted";
              const creditsParts = [];
              if (authors) {
                creditsParts.push(`Авторы: ${authors}`);
              }
              if (producers) {
                creditsParts.push(`Продюсеры: ${producers}`);
              }
              credits.textContent = creditsParts.join(" • ");
              body.appendChild(credits);
            }

            body.append(title, info, buildAudioPlayer(fullTrack, "album-modal"));
            row.append(order, body);
            albumModalElements.tracks.appendChild(row);
          }
        }
        albumModalElements.tracks.scrollTop = 0;
      }

      albumModalElements.root.classList.remove("hidden");
      albumModalElements.root.setAttribute("aria-hidden", "false");
      syncBodyModalState();
      updateTrackPlayButtons();
    }
    function createPlaylistCard(playlist) {
      const card = document.createElement("div");
      card.className = "playlist-item";
      const title = document.createElement("strong");
      title.textContent = playlist.title;
      const info = document.createElement("p");
      info.className = "muted";
      info.textContent = `@${playlist.username} • треков: ${playlist.tracksCount}`;
      const description = document.createElement("p");
      description.textContent = playlist.description || "Без описания";
      const tracksPreview = document.createElement("p");
      tracksPreview.className = "muted";
      tracksPreview.textContent = playlist.tracks.length
        ? `Состав: ${playlist.tracks.map((track) => track.title).join(", ")}`
        : "Плейлист пока пуст";
      card.append(title, info, description, tracksPreview);
      if (playlist.isOwner) {
        const controls = document.createElement("div");
        controls.className = "track-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "ghost";
        editBtn.textContent = "Редактировать";
        editBtn.addEventListener("click", async () => {
          const nextTitle = window.prompt("Новое название плейлиста", playlist.title);
          if (nextTitle === null) {
            return;
          }
          const nextDescription = window.prompt("Новое описание плейлиста", playlist.description || "");
          if (nextDescription === null) {
            return;
          }
          try {
            setStatus("Обновляю плейлист...");
            await api(`/api/playlists/${playlist.id}`, {
              method: "PUT",
              body: {
                title: nextTitle.trim(),
                description: nextDescription.trim()
              }
            });
            await refreshPlaylists();
            setStatus("Плейлист обновлен", "success");
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "ghost";
        deleteBtn.textContent = "Удалить";
        deleteBtn.addEventListener("click", async () => {
          const confirmDelete = window.confirm(`Удалить плейлист "${playlist.title}"?`);
          if (!confirmDelete) {
            return;
          }
          try {
            setStatus("Удаляю плейлист...");
            await api(`/api/playlists/${playlist.id}`, { method: "DELETE" });
            await refreshPlaylists();
            setStatus("Плейлист удален", "success");
          } catch (error) {
            setStatus(error.message, "error");
          }
        });
        controls.append(editBtn, deleteBtn);
        card.appendChild(controls);
      }
      return card;
    }
    function renderPlaylists() {
      elements.playlistsList.innerHTML = "";
      if (state.playlists.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Пока нет плейлистов";
        elements.playlistsList.appendChild(empty);
        return;
      }
      for (const playlist of state.playlists) {
        elements.playlistsList.appendChild(createPlaylistCard(playlist));
      }
    }
    function createAlbumCard(album) {
      const card = document.createElement("div");
      card.className = "playlist-item";
      card.dataset.albumId = album.id;
      const title = document.createElement("strong");
      const albumLink = document.createElement("a");
      albumLink.className = "track-title-link compact-link";
      albumLink.href = album.sharePath || `/a/${encodeURIComponent(String(album.id || ""))}`;
      albumLink.textContent = album.title;
      albumLink.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        openAlbumModal(album);
      });
      title.appendChild(albumLink);
      const info = document.createElement("p");
      info.className = "muted";
      info.appendChild(createUserLinkNode(album.username, "user-link compact-link"));
      info.append(` • ${t("labelTracksCount")}: ${album.tracksCount} • ${t("labelGenre")}: ${album.genre || "-"}`);
      const description = document.createElement("p");
      description.textContent = album.description || t("textNoDescription");
      card.append(title, info, description, createTagWrap(album.hashtags || []));
      if (album.coverUrl) {
        const preview = document.createElement("img");
        preview.className = "album-cover-preview";
        preview.alt = `Обложка альбома ${album.title}`;
        setImageWithFallback(preview, album.coverUrl);
        card.appendChild(preview);
      }
      if (Array.isArray(album.tracks) && album.tracks.length > 0) {
        const tracksPreviewWrap = document.createElement("div");
        tracksPreviewWrap.className = "album-tracklist-preview";
        const tracksCaption = document.createElement("p");
        tracksCaption.className = "muted";
        tracksCaption.textContent = `${t("labelComposition")}:`;
        tracksPreviewWrap.appendChild(tracksCaption);
        const tracksList = document.createElement("div");
        tracksList.className = "album-tracklist-preview-items";
        for (const albumTrack of album.tracks) {
          tracksList.appendChild(
            createTrackLink(albumTrack, {
              source: "album-tracklist",
              className: "ghost album-tracklist-link",
              text: albumTrack.title
            })
          );
        }
        tracksPreviewWrap.appendChild(tracksList);
        card.appendChild(tracksPreviewWrap);
      }
      return card;
    }
    function renderAlbums() {
      renderAlbumCardsList(elements.albumsList, state.albums, "Пока нет альбомов");
    }
    function renderAlbumCardsList(container, albums, emptyText) {
      container.innerHTML = "";
      if (!Array.isArray(albums) || albums.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = emptyText;
        container.appendChild(empty);
        return;
      }
      for (const album of albums) {
        container.appendChild(createAlbumCard(album));
      }
    }
    function createLikedTrackItem(track, source = "liked") {
      const card = document.createElement("div");
      card.className = "playlist-item";
      card.dataset.trackId = track.id;
      card.dataset.playSource = source;
      const title = document.createElement("strong");
      title.appendChild(createTrackLink(track, { source, className: "track-title-link compact-link" }));
      const info = document.createElement("p");
      info.className = "muted";
      info.appendChild(createUserLinkNode(track.username, "user-link compact-link"));
      info.append(` • 👍 ${track.likesCount} • 👂 ${track.listensCount || 0} • ${t("labelGenre").toLowerCase()}: ${track.genre || "-"}`);
      const player = buildAudioPlayer(track, source);
      card.append(title, info, player);
      return card;
    }
    function renderLikedTracks() {
      elements.likedTracksList.innerHTML = "";
      if (!state.user) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Войди в аккаунт, чтобы видеть понравившиеся треки.";
        elements.likedTracksList.appendChild(empty);
        updateTrackPlayButtons();
        return;
      }
      const likedTracks = state.tracks.filter((track) => track.liked);
      if (likedTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Вы еще не лайкали треки.";
        elements.likedTracksList.appendChild(empty);
        updateTrackPlayButtons();
        return;
      }
      for (const track of likedTracks) {
        elements.likedTracksList.appendChild(createLikedTrackItem(track, "liked-feed"));
      }
      updateTrackPlayButtons();
    }
    function buildPlaylistAdder(track) {
      const ownPlaylists = getOwnPlaylists();
      if (!state.user || ownPlaylists.length === 0) {
        return null;
      }
      const wrap = document.createElement("div");
      wrap.className = "playlist-adder";
      const select = document.createElement("select");
      for (const playlist of ownPlaylists) {
        const option = document.createElement("option");
        option.value = playlist.id;
        const hasTrack = playlist.trackIds.includes(track.id);
        option.textContent = `${hasTrack ? "✓ " : ""}${playlist.title}`;
        select.appendChild(option);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost";
      button.textContent = "Добавить/убрать в плейлисте";
      button.addEventListener("click", async () => {
        const playlistId = select.value;
        if (!playlistId) {
          return;
        }
        try {
          setStatus("Обновляю плейлист...");
          await api(`/api/playlists/${playlistId}/tracks`, {
            method: "POST",
            body: {
              trackId: track.id
            }
          });
          await refreshPlaylists();
          renderAll();
          setStatus("Плейлист обновлен", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      wrap.append(select, button);
      return wrap;
    }
    function createTagWrap(tags) {
      const wrap = document.createElement("div");
      wrap.className = "tag-wrap";
      if (!Array.isArray(tags)) {
        return wrap;
      }
      for (const tag of tags) {
        const item = document.createElement("span");
        item.className = "tag";
        item.textContent = `#${tag}`;
        wrap.appendChild(item);
      }
      return wrap;
    }
    const __sferaCommentsUi = window.SferaCommentsUi.createAppCommentsUi({
      state,
      deps: {
        setStatus,
        api,
        refreshTracks,
        renderAll,
        formatDate,
        setImageWithFallback
      }
    });
    const {
      createComment,
      deleteComment,
      toggleCommentReaction,
      buildAuthorBadge,
      renderCommentNode
    } = __sferaCommentsUi;
    const openActionMenus = new Set();
    let actionMenuGlobalBindingsReady = false;

    async function toggleTrackReaction(trackId, reaction) {
      try {
        setStatus("Обновляю реакцию...");
        await api(`/api/tracks/${trackId}/${reaction}`, { method: "POST" });
        await refreshTracks();
        renderAll();
        setStatus("Реакция обновлена", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
    async function toggleTrackRepost(trackId) {
      try {
        setStatus("Обновляю репост...");
        await api(`/api/tracks/${trackId}/repost`, { method: "POST" });
        await Promise.all([refreshMe(), refreshTracks()]);
        renderAll();
        setStatus("Репост обновлен", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
    async function togglePinnedTrack(track) {
      if (!track?.id || !state.user) {
        return;
      }
      try {
        setStatus(t("statusUpdating"));
        const data = await api("/api/profile/pinned-tracks", {
          method: "POST",
          body: {
            trackId: track.id
          }
        });
        if (data?.user) {
          state.user = data.user;
        }
        await refreshTracks();
        renderAll();
        if (data?.pinned) {
          setStatus(t("statusTrackPinned"), "success");
        } else {
          setStatus(t("statusTrackUnpinned"), "success");
        }
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
    async function deleteTrack(track) {
      const confirmed = window.confirm(`Удалить трек "${track.title}"? Это действие нельзя отменить.`);
      if (!confirmed) {
        return;
      }
      try {
        setStatus("Удаляю трек...");
        await api(`/api/tracks/${track.id}`, { method: "DELETE" });
        await Promise.all([
          refreshTracks(),
          refreshAlbums(),
          refreshPlaylists(),
          refreshMe()
        ]);
        renderAll();
        setStatus("Трек удален", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
    function buildTrackEditForm(track) {
      const wrapper = document.createElement("div");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ghost";
      toggle.textContent = "Редактировать трек";
      const form = document.createElement("form");
      form.className = "edit-form hidden";
      const sharePath = track.sharePath || `/t/${encodeURIComponent(track.id)}`;
      const shareLink = `${window.location.origin}${sharePath}`;
      const premiereValue = toLocalDateTimeInputValue(track.premiereAt);
      form.innerHTML = `
        <label>
          Название
          <input name="title" type="text" maxlength="120" required value="${escapeHtml(track.title)}" />
        </label>
        <label>
          Жанр
          <input name="genre" type="text" maxlength="60" required value="${escapeHtml(track.genre || "")}" />
        </label>
        <label>
          Режим публикации
          <select name="publishMode" required>
            <option value="public"${track.publishMode === "public" ? " selected" : ""}>Публичный</option>
            <option value="draft"${track.publishMode === "draft" ? " selected" : ""}>Черновик</option>
            <option value="private"${track.publishMode === "private" ? " selected" : ""}>Приватный</option>
            <option value="link"${track.publishMode === "link" ? " selected" : ""}>Доступ по ссылке</option>
            <option value="premiere"${track.publishMode === "premiere" ? " selected" : ""}>Премьера по времени</option>
          </select>
        </label>
        <label data-edit-premiere-wrap class="${track.publishMode === "premiere" ? "" : "hidden"}">
          Дата и время премьеры
          <input name="premiereAt" type="datetime-local" value="${escapeHtml(premiereValue)}" />
        </label>
        <label>
          Авторы (через запятую)
          <input name="authors" type="text" value="${escapeHtml((track.authors || []).join(", "))}" />
        </label>
        <label>
          Продюсеры (через запятую)
          <input name="producers" type="text" value="${escapeHtml((track.producers || []).join(", "))}" />
        </label>
        <label>
          Хештеги (до 5)
          <input name="hashtags" type="text" value="${escapeHtml((track.hashtags || []).join(", "))}" />
        </label>
        <label>
          Описание
          <textarea name="description" rows="4" maxlength="1000">${escapeHtml(track.description || "")}</textarea>
        </label>
        <label>
          Новая обложка (PNG/JPG)
          <input name="cover" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" />
        </label>
        <label>
          Новый аудиофайл (MP3 до 15 МБ, WAV до 30 МБ)
          <input name="audio" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" />
        </label>
        <p class="muted">Ссылка на трек: <a class="user-link" href="${escapeHtml(sharePath)}" target="_blank" rel="noopener">${escapeHtml(shareLink)}</a></p>
        <button type="submit">Сохранить изменения</button>
      `;
      const publishModeSelect = form.querySelector("select[name='publishMode']");
      const premiereWrap = form.querySelector("[data-edit-premiere-wrap]");
      const premiereInput = form.querySelector("input[name='premiereAt']");
      const updateEditPremiereVisibility = () => {
        if (!publishModeSelect || !premiereWrap || !premiereInput) {
          return;
        }
        const isPremiere = publishModeSelect.value === "premiere";
        premiereWrap.classList.toggle("hidden", !isPremiere);
        premiereInput.required = isPremiere;
        if (!isPremiere) {
          premiereInput.value = "";
        }
      };
      if (publishModeSelect) {
        publishModeSelect.addEventListener("change", updateEditPremiereVisibility);
      }
      updateEditPremiereVisibility();
      toggle.addEventListener("click", () => {
        form.classList.toggle("hidden");
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const rawFormData = new FormData(form);
        const title = String(rawFormData.get("title") || "").trim();
        const description = String(rawFormData.get("description") || "").trim();
        const genre = String(rawFormData.get("genre") || "").trim();
        const publishMode = String(rawFormData.get("publishMode") || "public").trim().toLowerCase();
        const authors = parseCommaList(rawFormData.get("authors"), 10);
        const producers = parseCommaList(rawFormData.get("producers"), 10);
        const hashtags = parseCommaList(rawFormData.get("hashtags"), 5, normalizeTag);
        const premiereAtIso = publishMode === "premiere"
          ? parseLocalDateTimeToIso(String(rawFormData.get("premiereAt") || ""))
          : null;
        const requestData = new FormData();
        requestData.append("title", title);
        requestData.append("description", description);
        requestData.append("genre", genre);
        requestData.append("publishMode", publishMode);
        requestData.append("premiereAt", premiereAtIso || "");
        requestData.append("authors", authors.join(", "));
        requestData.append("producers", producers.join(", "));
        requestData.append("hashtags", hashtags.join(", "));
        const coverFile = rawFormData.get("cover");
        const audioFile = rawFormData.get("audio");
        if (coverFile instanceof File && coverFile.size > 0) {
          const preparedCover = await prepareCover(coverFile);
          requestData.append("cover", preparedCover.file, preparedCover.fileName);
        }
        if (audioFile instanceof File && audioFile.size > 0) {
          const preparedAudio = await prepareAudio(audioFile);
          if (Number.isFinite(preparedAudio.durationSec) && preparedAudio.durationSec > 0) {
            requestData.append("durationSec", String(preparedAudio.durationSec));
          }
          requestData.append("audio", preparedAudio.file, preparedAudio.fileName);
        }
        try {
          setStatus("Сохраняю изменения трека...");
          await api(`/api/tracks/${track.id}`, {
            method: "PUT",
            body: requestData
          });
          await refreshTracks();
          await refreshAlbums();
          await refreshPlaylists();
          renderAll();
          setStatus("Трек обновлен", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
      wrapper.append(toggle, form);
      return wrapper;
    }
    async function openMessageToUser(userId) {
      if (!state.user) {
        setStatus("Войди в аккаунт, чтобы написать владельцу бита", "error");
        return;
      }
      if (!userId) {
        setStatus("Не удалось определить владельца бита", "error");
        return;
      }
      try {
        if (window.SferaMessagesModal && typeof window.SferaMessagesModal.openForUserId === "function") {
          await window.SferaMessagesModal.openForUserId(userId);
        } else {
          switchTab("settings");
          state.currentChatUserId = userId;
          await loadConversation(userId);
        }
        setStatus("Открыт диалог с владельцем бита", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }
    function resolveTrackShare(track, fallbackPath) {
      const sharePath = String(track?.sharePath || fallbackPath || "").trim();
      const safePath = sharePath || "/";
      return {
        sharePath: safePath,
        url: `${window.location.origin}${safePath}`
      };
    }
    async function copyTrackShareLink(track, fallbackPath) {
      const { url } = resolveTrackShare(track, fallbackPath);
      try {
        await navigator.clipboard.writeText(url);
        setStatus(t("statusLinkCopied"), "success");
      } catch {
        window.prompt(t("promptCopyLink"), url);
      }
    }
    async function shareTrackLink(track, fallbackPath) {
      const { url } = resolveTrackShare(track, fallbackPath);
      if (navigator.share) {
        try {
          await navigator.share({
            title: String(track?.title || t("trackFallbackTitle")),
            text: track?.username ? `@${track.username}` : "",
            url
          });
          setStatus(t("statusLinkShared"), "success");
          return;
        } catch (error) {
          if (error && String(error.name || "") === "AbortError") {
            return;
          }
        }
      }
      await copyTrackShareLink(track, fallbackPath);
    }
    function closeActionMenu(wrapper) {
      if (!wrapper) {
        return;
      }
      wrapper.classList.remove("open");
      const trigger = wrapper.querySelector(".action-menu-trigger");
      trigger?.setAttribute("aria-expanded", "false");
      const panel = wrapper.querySelector(".action-menu-panel");
      panel?.classList.add("hidden");
      openActionMenus.delete(wrapper);
    }
    function closeAllActionMenus(except = null) {
      for (const wrapper of Array.from(openActionMenus)) {
        if (except && wrapper === except) {
          continue;
        }
        closeActionMenu(wrapper);
      }
    }
    function ensureActionMenuGlobalBindings() {
      if (actionMenuGlobalBindingsReady) {
        return;
      }
      actionMenuGlobalBindingsReady = true;

      document.addEventListener("click", (event) => {
        const target = event.target;
        for (const wrapper of Array.from(openActionMenus)) {
          if (wrapper.contains(target)) {
            return;
          }
        }
        closeAllActionMenus();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeAllActionMenus();
        }
      });
    }
    function createActionMenu(items = []) {
      ensureActionMenuGlobalBindings();
      const wrapper = document.createElement("div");
      wrapper.className = "action-menu";

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "ghost action-menu-trigger";
      trigger.textContent = "⋯";
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", t("actionMenuAria"));
      trigger.title = t("actionMenuOpen");

      const panel = document.createElement("div");
      panel.className = "action-menu-panel hidden";
      panel.setAttribute("role", "menu");

      for (const item of items) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ghost action-menu-item";
        if (item.danger) {
          btn.classList.add("danger");
        }
        btn.setAttribute("role", "menuitem");
        btn.textContent = item.label;
        btn.disabled = Boolean(item.disabled);
        btn.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeActionMenu(wrapper);
          if (typeof item.onSelect === "function") {
            await item.onSelect();
          }
        });
        panel.appendChild(btn);
      }

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const willOpen = panel.classList.contains("hidden");
        closeAllActionMenus(wrapper);
        if (!willOpen) {
          closeActionMenu(wrapper);
          return;
        }
        wrapper.classList.add("open");
        panel.classList.remove("hidden");
        openActionMenus.add(wrapper);
        trigger.setAttribute("aria-expanded", "true");
      });

      panel.addEventListener("click", (event) => {
        event.stopPropagation();
      });

      wrapper.append(trigger, panel);
      return wrapper;
    }
    function ensureTrackDetailsState() {
      if (!state.trackDetailsExpandedMap || typeof state.trackDetailsExpandedMap !== "object") {
        state.trackDetailsExpandedMap = {};
      }
      return state.trackDetailsExpandedMap;
    }

    function isTrackDetailsExpanded(trackId) {
      const map = ensureTrackDetailsState();
      return Boolean(map[String(trackId || "")]);
    }

    function createTrackDetailsToggle(trackId, detailsWrap) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ghost track-details-toggle";

      const sync = () => {
        const expanded = isTrackDetailsExpanded(trackId);
        button.textContent = expanded ? t("detailsHide") : t("detailsShow");
        button.setAttribute("aria-expanded", expanded ? "true" : "false");
        detailsWrap.classList.toggle("hidden", !expanded);
      };

      button.addEventListener("click", () => {
        const map = ensureTrackDetailsState();
        map[String(trackId || "")] = !Boolean(map[String(trackId || "")]);
        sync();
      });

      sync();
      return button;
    }

    function renderCommentsVirtualized(commentsBody, comments, trackId) {
      const list = document.createElement("div");
      list.className = "comments-list";
      commentsBody.appendChild(list);

      if (!Array.isArray(comments) || comments.length === 0) {
        const emptyComment = document.createElement("p");
        emptyComment.className = "muted";
        emptyComment.textContent = t("commentsEmpty");
        list.appendChild(emptyComment);
        return;
      }

      const batchSize = 8;
      let rendered = 0;
      const renderNextBatch = () => {
        const end = Math.min(comments.length, rendered + batchSize);
        for (let index = rendered; index < end; index += 1) {
          list.appendChild(renderCommentNode(comments[index], trackId));
        }
        rendered = end;
      };

      renderNextBatch();
      if (rendered >= comments.length) {
        return;
      }

      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "ghost comments-more-btn";
      const syncText = () => {
        const remaining = comments.length - rendered;
        moreBtn.textContent = `${t("commentsShowMore")} (${remaining})`;
      };
      syncText();
      moreBtn.addEventListener("click", () => {
        renderNextBatch();
        if (rendered >= comments.length) {
          moreBtn.remove();
          return;
        }
        syncText();
      });
      commentsBody.appendChild(moreBtn);
    }

    function renderVirtualTrackCards(container, tracks, source) {
      const list = Array.isArray(tracks) ? tracks : [];
      const batchSize = 12;
      let rendered = 0;

      const appendBatch = () => {
        const end = Math.min(list.length, rendered + batchSize);
        const fragment = document.createDocumentFragment();
        for (let index = rendered; index < end; index += 1) {
          fragment.appendChild(createTrackCard(list[index], source));
        }
        container.appendChild(fragment);
        rendered = end;
        updateTrackPlayButtons();
      };

      appendBatch();
      if (rendered >= list.length) {
        return;
      }

      const sentinel = document.createElement("div");
      sentinel.className = "virtual-sentinel";

      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.type = "button";
      loadMoreBtn.className = "ghost virtual-load-more";
      loadMoreBtn.textContent = t("listShowMore");
      loadMoreBtn.addEventListener("click", () => {
        appendBatch();
        if (rendered >= list.length) {
          sentinel.remove();
        }
      });
      sentinel.appendChild(loadMoreBtn);
      container.appendChild(sentinel);

      if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) {
              continue;
            }
            appendBatch();
            if (rendered >= list.length) {
              observer.disconnect();
              sentinel.remove();
              return;
            }
          }
        }, { rootMargin: "220px 0px 220px 0px" });
        observer.observe(sentinel);
      }
    }

    function createBeatCard(track, source = "feed") {
      const card = document.createElement("article");
      card.className = "track-card beat-card";
      card.dataset.trackId = track.id;
      card.dataset.playSource = source;
      const coverWrap = document.createElement("div");
      coverWrap.className = "track-cover";
      const cover = document.createElement("img");
      setImageWithFallback(cover, track.coverUrl);
      cover.alt = `Обложка бита ${track.title}`;
      coverWrap.appendChild(cover);
      const main = document.createElement("div");
      main.className = "track-main";
      const title = document.createElement("h4");
      title.appendChild(createTrackLink(track, { source, className: "track-title-link" }));
      const meta = document.createElement("div");
      meta.className = "track-meta";
      meta.innerHTML = `
        <span><a class="user-link" href="${escapeHtml(buildUserHref(track.username))}">@${escapeHtml(track.username)}</a></span>
        <span>BPM: ${escapeHtml(String(track.beatBpm || "-"))}</span>
        <span>${escapeHtml(t("labelBeatRootNote"))}: ${escapeHtml(String(track.beatRootNote || "-"))}</span>
        <span>${escapeHtml(t("labelStyle"))}: ${escapeHtml(track.genre || "Beat")}</span>
        <span data-listens-track-id="${escapeHtml(track.id)}">${escapeHtml(t("labelListens"))}: ${escapeHtml(String(track.listensCount || 0))}</span>
        <span>${escapeHtml(t("labelPublished"))}: ${escapeHtml(formatDate(track.createdAt))}</span>
      `;
      const audioPlayer = buildAudioPlayer(track, source);
      const editFormWrap = track.isOwner ? buildTrackEditForm(track) : null;
      const toggleEditForm = () => {
        const form = editFormWrap?.querySelector("form");
        if (form) {
          form.classList.toggle("hidden");
        }
      };
      const actionItems = [
        {
          label: t("btnOpen"),
          onSelect: () => {
            window.location.href = track.sharePath || `/b/${encodeURIComponent(track.id)}`;
          }
        },
        {
          label: `${t("actionLike")} (${track.likesCount})`,
          disabled: !state.user,
          onSelect: () => toggleTrackReaction(track.id, "like")
        },
        {
          label: `${t("actionDislike")} (${track.dislikesCount})`,
          disabled: !state.user,
          onSelect: () => toggleTrackReaction(track.id, "dislike")
        },
        {
          label: t("btnCopyLink"),
          onSelect: async () => {
            await copyTrackShareLink(track, `/b/${encodeURIComponent(track.id)}`);
          }
        },
        {
          label: t("btnShareLink"),
          onSelect: async () => {
            await shareTrackLink(track, `/b/${encodeURIComponent(track.id)}`);
          }
        }
      ];
      if (track.isOwner) {
        actionItems.push({
          label: t("actionEditTrack"),
          onSelect: toggleEditForm
        });
        actionItems.push({
          label: t("btnDeleteBeat"),
          danger: true,
          onSelect: () => deleteTrack(track)
        });
      }
      const actions = createActionMenu(actionItems);
      const quickActions = document.createElement("div");
      quickActions.className = "track-actions beat-primary-actions";

      const quickPlayBtn = document.createElement("button");
      quickPlayBtn.type = "button";
      quickPlayBtn.className = "ghost";
      quickPlayBtn.textContent = t("btnListen");
      quickPlayBtn.addEventListener("click", async () => {
        const queue = Array.from(card.parentElement?.querySelectorAll(".track-card[data-track-id]") || [])
          .map((node) => node.dataset.trackId)
          .filter(Boolean);
        await startTrackPlayback(track.id, queue, card, source);
      });
      quickActions.appendChild(quickPlayBtn);

      const quickLikeBtn = document.createElement("button");
      quickLikeBtn.type = "button";
      quickLikeBtn.className = "ghost";
      quickLikeBtn.textContent = `👍 ${track.likesCount}`;
      quickLikeBtn.disabled = !state.user;
      quickLikeBtn.addEventListener("click", async () => {
        await toggleTrackReaction(track.id, "like");
      });
      quickActions.appendChild(quickLikeBtn);

      const quickDislikeBtn = document.createElement("button");
      quickDislikeBtn.type = "button";
      quickDislikeBtn.className = "ghost";
      quickDislikeBtn.textContent = `👎 ${track.dislikesCount}`;
      quickDislikeBtn.disabled = !state.user;
      quickDislikeBtn.addEventListener("click", async () => {
        await toggleTrackReaction(track.id, "dislike");
      });
      quickActions.appendChild(quickDislikeBtn);

      const quickMessageBtn = document.createElement("button");
      quickMessageBtn.type = "button";
      quickMessageBtn.className = "ghost";
      quickMessageBtn.textContent = track.isOwner ? t("beatOwnBtn") : t("actionMessageOwner");
      quickMessageBtn.disabled = track.isOwner;
      quickMessageBtn.addEventListener("click", async () => {
        await openMessageToUser(track.userId);
      });
      quickActions.appendChild(quickMessageBtn);

      if (track.isOwner) {
        const quickEditBtn = document.createElement("button");
        quickEditBtn.type = "button";
        quickEditBtn.className = "ghost";
        quickEditBtn.textContent = t("actionEditTrack");
        quickEditBtn.addEventListener("click", toggleEditForm);
        quickActions.appendChild(quickEditBtn);
      }

      const licensesWrap = document.createElement("div");
      licensesWrap.className = "beat-license-list";
      const licensesTitle = document.createElement("p");
      licensesTitle.className = "muted";
      licensesTitle.textContent = t("beatLicensesAvailable");
      licensesWrap.appendChild(licensesTitle);
      const licenses = normalizeBeatLicenses(track.beatLicenses);
      if (licenses.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("beatLicensesEmpty");
        licensesWrap.appendChild(empty);
      } else {
        for (const license of licenses) {
          const chip = document.createElement("div");
          chip.className = "beat-license-chip";
          const name = document.createElement("span");
          name.textContent = getBeatLicenseTypeLabel(license.type);
          const price = document.createElement("strong");
          price.textContent = formatBeatLicensePrice(license);
          chip.append(name, price);
          licensesWrap.appendChild(chip);
        }
      }
      const detailsWrap = document.createElement("div");
      detailsWrap.className = "track-secondary";
      const description = document.createElement("p");
      description.className = "track-desc";
      description.textContent = track.description || t("textNoDescription");
      const tags = createTagWrap(track.hashtags || []);
      const purchaseHint = document.createElement("p");
      purchaseHint.className = "muted";
      purchaseHint.textContent = t("beatPurchaseHint");
      detailsWrap.append(description, tags, purchaseHint);

      if (!state.commentsCollapsedMap || typeof state.commentsCollapsedMap !== "object") {
        state.commentsCollapsedMap = {};
      }
      if (typeof state.commentsCollapsedMap[track.id] !== "boolean") {
        state.commentsCollapsedMap[track.id] = true;
      }

      const commentsWrap = document.createElement("div");
      commentsWrap.className = "comments-wrap";
      const commentsHeader = document.createElement("div");
      commentsHeader.className = "section-head comments-head";
      const commentsTitle = document.createElement("p");
      commentsTitle.className = "muted";
      commentsTitle.textContent = `${t("commentsTitle")} (${track.commentsCount})`;
      const commentsToggleBtn = document.createElement("button");
      commentsToggleBtn.type = "button";
      commentsToggleBtn.className = "ghost section-toggle-btn";
      commentsHeader.append(commentsTitle, commentsToggleBtn);
      commentsWrap.appendChild(commentsHeader);

      const commentsBody = document.createElement("div");
      commentsBody.className = "comments-body";
      commentsWrap.appendChild(commentsBody);

      const comments = Array.isArray(track.comments) ? track.comments : [];
      renderCommentsVirtualized(commentsBody, comments, track.id);
      if (state.user) {
        const commentForm = document.createElement("form");
        commentForm.className = "comment-form";
        const commentInput = document.createElement("input");
        commentInput.type = "text";
        commentInput.maxLength = 400;
        commentInput.placeholder = t("commentsPlaceholder");
        commentInput.required = true;
        const commentButton = document.createElement("button");
        commentButton.type = "submit";
        commentButton.textContent = t("messagesSendBtn");
        commentForm.append(commentInput, commentButton);
        commentForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const text = commentInput.value.trim();
          if (!text) {
            return;
          }
          setStatus("Публикую комментарий...");
          await createComment(track.id, text, null);
        });
        commentsBody.appendChild(commentForm);
      }

      const quickCommentsBtn = document.createElement("button");
      quickCommentsBtn.type = "button";
      quickCommentsBtn.className = "ghost";
      quickCommentsBtn.textContent = `💬 ${track.commentsCount}`;
      quickActions.appendChild(quickCommentsBtn);

      const syncCommentsVisibility = () => {
        const isCollapsed = Boolean(state.commentsCollapsedMap?.[track.id]);
        commentsBody.classList.toggle("hidden", isCollapsed);
        commentsToggleBtn.textContent = isCollapsed ? t("commentsToggleShow") : t("commentsToggleHide");
      };
      const toggleComments = () => {
        state.commentsCollapsedMap[track.id] = !Boolean(state.commentsCollapsedMap?.[track.id]);
        syncCommentsVisibility();
      };
      commentsToggleBtn.addEventListener("click", toggleComments);
      quickCommentsBtn.addEventListener("click", toggleComments);
      syncCommentsVisibility();

      main.append(title, audioPlayer, meta, licensesWrap, quickActions, actions, detailsWrap, commentsWrap);
      if (track.isOwner && editFormWrap) {
        const editToggleBtn = editFormWrap.querySelector("button");
        if (editToggleBtn) {
          editToggleBtn.classList.add("hidden");
        }
        main.appendChild(editFormWrap);
      }
      card.append(coverWrap, main);
      return card;
    }
    function createTrackCard(track, source = "feed") {
      if (isBeatTrack(track)) {
        return createBeatCard(track, source);
      }
      const card = document.createElement("article");
      card.className = "track-card";
      card.dataset.trackId = track.id;
      card.dataset.playSource = source;
      const coverWrap = document.createElement("div");
      coverWrap.className = "track-cover";
      const cover = document.createElement("img");
      setImageWithFallback(cover, track.coverUrl);
      cover.alt = `Обложка ${track.title}`;
      coverWrap.appendChild(cover);
      const main = document.createElement("div");
      main.className = "track-main";
      const title = document.createElement("h4");
      title.appendChild(createTrackLink(track, { source, className: "track-title-link" }));
      const visibilityLabel = getTrackVisibilityLabel(track);
      const privacyChip = document.createElement("span");
      privacyChip.className = "track-privacy-chip";
      privacyChip.textContent = visibilityLabel;
      if (!visibilityLabel) {
        privacyChip.classList.add("hidden");
      }
      const meta = document.createElement("div");
      meta.className = "track-meta";
      meta.innerHTML = `
        <span><a class="user-link" href="${escapeHtml(buildUserHref(track.username))}">@${escapeHtml(track.username)}</a></span>
        <span>${escapeHtml(t("labelGenre"))}: ${escapeHtml(track.genre || "-")}</span>
        <span>${escapeHtml(t("labelAuthors"))}: ${escapeHtml((track.authors || []).join(", ") || "-")}</span>
        <span>${escapeHtml(t("labelProducers"))}: ${escapeHtml((track.producers || []).join(", ") || "-")}</span>
        <span data-listens-track-id="${escapeHtml(track.id)}">${escapeHtml(t("labelListens"))}: ${escapeHtml(String(track.listensCount || 0))}</span>
        <span>${escapeHtml(t("labelPublished"))}: ${escapeHtml(formatDate(track.createdAt))}</span>
      `;
      const audioPlayer = buildAudioPlayer(track, source);
      const editFormWrap = track.isOwner ? buildTrackEditForm(track) : null;
      const actionItems = [
        {
          label: t("btnOpen"),
          onSelect: () => {
            window.location.href = track.sharePath || `/t/${encodeURIComponent(track.id)}`;
          }
        },
        {
          label: `${t("actionLike")} (${track.likesCount})`,
          disabled: !state.user,
          onSelect: () => toggleTrackReaction(track.id, "like")
        },
        {
          label: `${t("actionDislike")} (${track.dislikesCount})`,
          disabled: !state.user,
          onSelect: () => toggleTrackReaction(track.id, "dislike")
        },
        {
          label: `${t("actionRepost")} (${track.repostsCount})`,
          disabled: !state.user,
          onSelect: () => toggleTrackRepost(track.id)
        },
        {
          label: t("btnCopyLink"),
          onSelect: async () => {
            await copyTrackShareLink(track, `/t/${encodeURIComponent(track.id)}`);
          }
        },
        {
          label: t("btnShareLink"),
          onSelect: async () => {
            await shareTrackLink(track, `/t/${encodeURIComponent(track.id)}`);
          }
        }
      ];
      if (track.isOwner) {
        if (!isBeatTrack(track)) {
          actionItems.push({
            label: track.pinnedInProfile ? t("actionUnpinTrack") : t("actionPinTrack"),
            onSelect: () => togglePinnedTrack(track)
          });
        }
        actionItems.push({
          label: t("actionEditTrack"),
          onSelect: () => {
            const form = editFormWrap?.querySelector("form");
            if (form) {
              form.classList.toggle("hidden");
            }
          }
        });
        actionItems.push({
          label: t("btnDeleteTrack"),
          danger: true,
          onSelect: () => deleteTrack(track)
        });
      }
      const actions = createActionMenu(actionItems);
      const playlistAdder = buildPlaylistAdder(track);
      const detailsWrap = document.createElement("div");
      detailsWrap.className = "track-secondary";
      const detailsBtn = createTrackDetailsToggle(track.id, detailsWrap);
      const description = document.createElement("p");
      description.className = "track-desc";
      description.textContent = track.description || t("textNoDescription");
      const tags = createTagWrap(track.hashtags || []);
      detailsWrap.append(meta, description, tags);
      const commentsWrap = document.createElement("div");
      commentsWrap.className = "comments-wrap";
      const commentsHeader = document.createElement("div");
      commentsHeader.className = "section-head comments-head";
      const commentsTitle = document.createElement("p");
      commentsTitle.className = "muted";
      commentsTitle.textContent = `${t("commentsTitle")} (${track.commentsCount})`;
      const commentsToggleBtn = document.createElement("button");
      commentsToggleBtn.type = "button";
      commentsToggleBtn.className = "ghost section-toggle-btn";
      const isCommentsCollapsed = Boolean(state.commentsCollapsedMap?.[track.id]);
      commentsToggleBtn.textContent = isCommentsCollapsed ? t("commentsToggleShow") : t("commentsToggleHide");
      commentsHeader.append(commentsTitle, commentsToggleBtn);
      commentsWrap.appendChild(commentsHeader);
      const commentsBody = document.createElement("div");
      commentsBody.className = "comments-body";
      commentsBody.classList.toggle("hidden", isCommentsCollapsed);
      commentsToggleBtn.addEventListener("click", () => {
        if (!state.commentsCollapsedMap) {
          state.commentsCollapsedMap = {};
        }
        const nextCollapsed = !Boolean(state.commentsCollapsedMap[track.id]);
        state.commentsCollapsedMap[track.id] = nextCollapsed;
        commentsBody.classList.toggle("hidden", nextCollapsed);
        commentsToggleBtn.textContent = nextCollapsed ? t("commentsToggleShow") : t("commentsToggleHide");
      });
      const comments = Array.isArray(track.comments) ? track.comments : [];
      renderCommentsVirtualized(commentsBody, comments, track.id);
      if (state.user) {
        const commentForm = document.createElement("form");
        commentForm.className = "comment-form";
        const commentInput = document.createElement("input");
        commentInput.type = "text";
        commentInput.maxLength = 400;
        commentInput.placeholder = t("commentsPlaceholder");
        commentInput.required = true;
        const commentButton = document.createElement("button");
        commentButton.type = "submit";
        commentButton.textContent = t("messagesSendBtn");
        commentForm.append(commentInput, commentButton);
        commentForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const text = commentInput.value.trim();
          if (!text) {
            return;
          }
          setStatus("Публикую комментарий...");
          await createComment(track.id, text, null);
        });
        commentsBody.appendChild(commentForm);
      }
      commentsWrap.appendChild(commentsBody);
      main.append(title, privacyChip, audioPlayer, actions, detailsBtn, detailsWrap);
      if (playlistAdder) {
        main.appendChild(playlistAdder);
      }
      main.appendChild(commentsWrap);
      if (track.isOwner && editFormWrap) {
        const editToggleBtn = editFormWrap.querySelector("button");
        if (editToggleBtn) {
          editToggleBtn.classList.add("hidden");
        }
        main.appendChild(editFormWrap);
      }
      card.append(coverWrap, main);
      return card;
    }
    function renderTracksList(container, tracks, source = "feed") {
      if (!container) {
        return;
      }
      container.innerHTML = "";
      if (tracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        if (source === "feed" && state.feedFilter === "beats") {
          empty.textContent = t("emptyNoBeats");
        } else {
          empty.textContent = t("emptyNoData");
        }
        container.appendChild(empty);
        updateTrackPlayButtons();
        return;
      }
      renderVirtualTrackCards(container, tracks, source);
    }
    return {
      createPlaylistCard,
      renderPlaylists,
      createAlbumCard,
      renderAlbums,
      renderAlbumCardsList,
      createLikedTrackItem,
      renderLikedTracks,
      buildPlaylistAdder,
      createTagWrap,
      toggleTrackReaction,
      toggleTrackRepost,
      deleteTrack,
      createComment,
      deleteComment,
      toggleCommentReaction,
      buildAuthorBadge,
      renderCommentNode,
      buildTrackEditForm,
      openMessageToUser,
      openAlbumModal,
      createBeatCard,
      createTrackCard,
      renderTracksList
    };
  }
  window.SferaFeedUi = { createAppFeedUi };
})();
