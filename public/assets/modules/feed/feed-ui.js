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

    function promptDialog(options) {
      return window.SferaDialogs.prompt(options);
    }

    function confirmDialog(options) {
      return window.SferaDialogs.confirm(options);
    }

    function copyDialog(options) {
      return window.SferaDialogs.copy(options);
    }

    function createInlineStat(iconName, text) {
      if (window.SferaIconKit?.createStat) {
        return window.SferaIconKit.createStat(iconName, text, {
          className: "muted"
        });
      }
      const node = document.createElement("span");
      node.className = "muted";
      node.textContent = text;
      return node;
    }

    function createTrackMetricButton({ iconName, count = 0, active = false, label = "", disabled = false, onClick }) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ghost action-btn track-metric-btn sf-icon-btn${active ? " active" : ""}`;
      button.disabled = Boolean(disabled);
      if (window.SferaIconKit?.createIcon) {
        button.appendChild(window.SferaIconKit.createIcon(iconName, { className: "sf-icon--sm" }));
      } else {
        const icon = document.createElement("span");
        icon.className = "sf-icon sf-icon--sm";
        icon.dataset.icon = iconName;
        button.appendChild(icon);
      }
      const countNode = document.createElement("span");
      countNode.className = "track-metric-btn-count";
      countNode.textContent = String(Number(count || 0));
      button.appendChild(countNode);
      button.setAttribute("aria-label", label ? `${label}: ${Number(count || 0)}` : String(Number(count || 0)));
      if (typeof onClick === "function") {
        button.addEventListener("click", onClick);
      }
      return button;
    }

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
          const nextTitle = await promptDialog({
            title: "Новое название плейлиста",
            value: playlist.title || "",
            placeholder: "Название плейлиста",
            confirmText: "Сохранить"
          });
          if (nextTitle === null) {
            return;
          }
          const nextDescription = await promptDialog({
            title: "Новое описание плейлиста",
            value: playlist.description || "",
            placeholder: "Описание плейлиста",
            multiline: true,
            confirmText: "Сохранить"
          });
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
          const confirmDelete = await confirmDialog({
            title: "Удалить плейлист?",
            message: `Плейлист "${playlist.title}" будет удалён без возможности восстановления.`,
            confirmText: "Удалить",
            cancelText: "Отмена",
            danger: true
          });
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
      info.append(
        document.createTextNode(" • "),
        createInlineStat("like", String(track.likesCount)),
        document.createTextNode(" • "),
        createInlineStat("listen", String(track.listensCount || 0)),
        document.createTextNode(` • ${t("labelGenre").toLowerCase()}: ${track.genre || "-"}`)
      );
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
      const confirmed = await confirmDialog({
        title: "Удалить трек?",
        message: `Трек "${track.title}" будет удалён без возможности восстановления.`,
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true
      });
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

    async function reportTrack(track) {
      if (!state.user) {
        setStatus("Войди в аккаунт, чтобы отправить жалобу.", "error");
        return;
      }

      const itemLabel = track.kind === "beat" ? "бит" : "трек";
      const reasonInput = await promptDialog({
        title: `Жалоба на ${itemLabel}`,
        message: "Кратко укажи причину обращения.",
        value: "Спам / нарушение правил",
        placeholder: "Причина жалобы",
        confirmText: "Отправить"
      });
      if (reasonInput === null) {
        return;
      }

      const reason = String(reasonInput || "").trim();
      if (reason.length < 3) {
        setStatus("Укажи причину жалобы хотя бы в нескольких словах.", "error");
        return;
      }

      const detailsInput = await promptDialog({
        title: "Дополнительные детали",
        message: "Если нужно, добавь контекст для администраторов.",
        value: "",
        placeholder: "Подробности жалобы",
        multiline: true,
        confirmText: "Продолжить"
      });
      const details = detailsInput === null ? "" : String(detailsInput || "").trim();

      try {
        setStatus(`Отправляю жалобу на ${itemLabel}...`);
        await api("/api/reports", {
          method: "POST",
          body: {
            targetType: "track",
            targetId: track.id,
            reason,
            details
          }
        });
        setStatus(`Жалоба на ${itemLabel} отправлена администраторам.`, "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    function buildTrackEditForm(track) {
      const wrapper = document.createElement("div");
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ghost";
      const adminMode = Boolean(state.user?.isAdmin) && !track.isOwner;
      const isBeat = isBeatTrack(track);
      const itemLabel = isBeat ? "бит" : "трек";
      toggle.textContent = adminMode ? `Админ: редактировать ${itemLabel}` : `Редактировать ${itemLabel}`;
      const form = document.createElement("form");
      form.className = "edit-form hidden";
      const sharePath = track.sharePath || `/${isBeat ? "b" : "t"}/${encodeURIComponent(track.id)}`;
      const shareLink = `${window.location.origin}${sharePath}`;
      const premiereValue = toLocalDateTimeInputValue(track.premiereAt);
      const beatLicenses = isBeat ? normalizeBeatLicenses(track.beatLicenses) : [];
      const beatLicenseMap = new Map(beatLicenses.map((license) => [license.type, license]));
      const beatCurrency = String(beatLicenses[0]?.currency || "RUB").toUpperCase() === "USD" ? "USD" : "RUB";
      const buildBeatLicenseRow = (type, label) => {
        const existing = beatLicenseMap.get(type);
        const checked = existing ? " checked" : "";
        const priceValue = existing ? ` value="${escapeHtml(String(existing.price))}"` : "";
        return `
          <label class="beat-license-row">
            <input name="beatLicense${type}Enabled" type="checkbox"${checked} />
            <span>${label}</span>
            <input name="beatLicense${type}Price" type="number" min="0" step="1" placeholder="${escapeHtml(t("beatPricePlaceholder"))}"${priceValue} />
          </label>
        `;
      };
      const beatMetaFields = isBeat ? `
        <div class="sub-grid">
          <label>
            BPM
            <input name="bpm" type="number" min="1" max="400" step="1" required value="${escapeHtml(String(track.beatBpm || ""))}" />
          </label>
          <label>
            Корневая нота
            <input name="rootNote" type="text" maxlength="12" required value="${escapeHtml(String(track.beatRootNote || ""))}" />
          </label>
        </div>
      ` : "";
      const beatLicensesMarkup = isBeat ? `
        <div class="beat-license-block">
          <div class="beat-license-head">
            <strong>${escapeHtml(t("beatLicensesTitle"))}</strong>
            <label class="beat-currency-inline">
              ${escapeHtml(t("beatLicenseCurrency"))}
              <select name="beatLicenseCurrency">
                <option value="RUB"${beatCurrency === "RUB" ? " selected" : ""}>RUB ₽</option>
                <option value="USD"${beatCurrency === "USD" ? " selected" : ""}>USD $</option>
              </select>
            </label>
          </div>
          ${buildBeatLicenseRow("mp3", "MP3 Lease")}
          ${buildBeatLicenseRow("wav", "WAV Lease")}
          ${buildBeatLicenseRow("trackout", "Trackout")}
          ${buildBeatLicenseRow("exclusive", "Exclusive")}
        </div>
      ` : "";
      const adminNote = adminMode
        ? `<p class="muted">Администратор редактирует чужой ${itemLabel}. Доступны название, описание, обложка, аудио и остальные основные поля.</p>`
        : "";
      form.innerHTML = `
        ${adminNote}
        <label>
          Название
          <input name="title" type="text" maxlength="120" required value="${escapeHtml(track.title)}" />
        </label>
        <label>
          Жанр
          <input name="genre" type="text" maxlength="60" required value="${escapeHtml(track.genre || "")}" />
        </label>
        ${beatMetaFields}
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
        ${isBeat ? "" : `
        <label class="admin-filter-field">
          <span>
            <input name="isExplicit" type="checkbox" ${track.isExplicit ? "checked" : ""} />
            Метка E: в треке есть нецензурная лексика
          </span>
        </label>
        `}
        ${beatLicensesMarkup}
        <label>
          Новая обложка (PNG/JPG/GIF)
          <input name="cover" type="file" accept=".png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif" />
        </label>
        <label>
          Новый аудиофайл (MP3 до 15 МБ, WAV до 30 МБ)
          <input name="audio" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" />
        </label>
        <p class="muted">Ссылка на ${itemLabel}: <a class="user-link" href="${escapeHtml(sharePath)}" target="_blank" rel="noopener">${escapeHtml(shareLink)}</a></p>
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
        const authors = parseCommaList(rawFormData.get("authors"), 100);
        const producers = parseCommaList(rawFormData.get("producers"), 100);
        const hashtags = parseCommaList(rawFormData.get("hashtags"), 5, normalizeTag);
        const collectBeatLicensesFromEditForm = () => {
          const currency = String(form.querySelector("[name='beatLicenseCurrency']")?.value || "RUB").toUpperCase() === "USD" ? "USD" : "RUB";
          const candidates = [
            {
              type: "mp3",
              enabled: form.querySelector("[name='beatLicensemp3Enabled']")?.checked,
              price: form.querySelector("[name='beatLicensemp3Price']")?.value
            },
            {
              type: "wav",
              enabled: form.querySelector("[name='beatLicensewavEnabled']")?.checked,
              price: form.querySelector("[name='beatLicensewavPrice']")?.value
            },
            {
              type: "trackout",
              enabled: form.querySelector("[name='beatLicensetrackoutEnabled']")?.checked,
              price: form.querySelector("[name='beatLicensetrackoutPrice']")?.value
            },
            {
              type: "exclusive",
              enabled: form.querySelector("[name='beatLicenseexclusiveEnabled']")?.checked,
              price: form.querySelector("[name='beatLicenseexclusivePrice']")?.value
            }
          ];
          const result = [];
          for (const item of candidates) {
            if (!item.enabled) {
              continue;
            }
            const price = Number(item.price);
            if (!Number.isFinite(price) || price < 0) {
              throw new Error(`Укажи корректную цену для лицензии ${getBeatLicenseTypeLabel(item.type)}`);
            }
            result.push({
              type: item.type,
              price: Math.round(price),
              currency
            });
          }
          if (result.length === 0) {
            throw new Error("Выбери хотя бы одну лицензию для бита");
          }
          return result;
        };
        const premiereAtIso = publishMode === "premiere"
          ? parseLocalDateTimeToIso(String(rawFormData.get("premiereAt") || ""))
          : null;
        const requestData = new FormData();
        requestData.append("title", title);
        requestData.append("description", description);
        requestData.append("genre", genre);
        requestData.append("publishMode", publishMode);
        requestData.append("premiereAt", premiereAtIso || "");
        requestData.append("isExplicit", !isBeat && rawFormData.get("isExplicit") ? "true" : "false");
        requestData.append("authors", authors.join(", "));
        requestData.append("producers", producers.join(", "));
        requestData.append("hashtags", hashtags.join(", "));
        if (isBeat) {
          const bpm = Number(rawFormData.get("bpm"));
          const rootNote = String(rawFormData.get("rootNote") || "").trim();
          if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 400) {
            throw new Error("BPM должен быть от 1 до 400");
          }
          if (!rootNote) {
            throw new Error("Укажи корневую ноту бита");
          }
          const licenses = collectBeatLicensesFromEditForm();
          requestData.append("bpm", String(Math.round(bpm)));
          requestData.append("rootNote", rootNote);
          requestData.append("beatLicenses", JSON.stringify(licenses));
        }
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
          setStatus(`Сохраняю изменения ${itemLabel}...`);
          await api(`/api/tracks/${track.id}`, {
            method: "PUT",
            body: requestData
          });
          await refreshTracks();
          await refreshAlbums();
          await refreshPlaylists();
          renderAll();
          setStatus(`${itemLabel === "бит" ? "Бит" : "Трек"} обновлен`, "success");
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
        await copyDialog({
          title: t("promptCopyLink"),
          message: "Скопируй ссылку вручную, если браузер не дал доступ к буферу.",
          value: url
        });
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
        <span><a class="user-link" href="${escapeHtml(buildUserHref(track.username))}" target="_blank" rel="noopener noreferrer">@${escapeHtml(track.username)}</a></span>
        <span>BPM: ${escapeHtml(String(track.beatBpm || "-"))}</span>
        <span>${escapeHtml(t("labelBeatRootNote"))}: ${escapeHtml(String(track.beatRootNote || "-"))}</span>
        <span>${escapeHtml(t("labelStyle"))}: ${escapeHtml(track.genre || "Beat")}</span>
        <span data-listens-track-id="${escapeHtml(track.id)}">${escapeHtml(t("labelListens"))}: ${escapeHtml(String(track.listensCount || 0))}</span>
        <span>${escapeHtml(t("labelPublished"))}: ${escapeHtml(formatDate(track.createdAt))}</span>
      `;
      const audioPlayer = buildAudioPlayer(track, source);
      const adminCanManageTrack = Boolean(state.user?.isAdmin) && !track.isOwner;
      const editFormWrap = track.isOwner
        ? buildTrackEditForm(track)
        : (adminCanManageTrack ? buildTrackEditForm(track) : null);
      const toggleEditForm = () => {
        const form = editFormWrap?.querySelector("form");
        if (form) {
          form.classList.toggle("hidden");
        }
      };
      const actionItems = [
        {
          label: t("btnCopyLink"),
          onSelect: async () => {
            await copyTrackShareLink(track, `/b/${encodeURIComponent(track.id)}`);
          }
        }
      ];
      if (!track.isOwner) {
        actionItems.push({
          label: "Пожаловаться",
          disabled: !state.user,
          onSelect: () => reportTrack(track)
        });
      }
      if (track.isOwner || adminCanManageTrack) {
        actionItems.push({
          label: track.isOwner ? t("actionEditBeat") : "Админ: редактировать бит",
          onSelect: toggleEditForm
        });
        actionItems.push({
          label: track.isOwner ? t("btnDeleteBeat") : "Админ: удалить бит",
          danger: true,
          onSelect: () => deleteTrack(track)
        });
      }
      const actions = createActionMenu(actionItems);
      const quickActions = document.createElement("div");
      quickActions.className = "track-actions beat-primary-actions";

      const likeMetricBtn = createTrackMetricButton({
        iconName: "like",
        count: track.likesCount,
        active: Boolean(track.liked),
        label: t("actionLike"),
        disabled: !state.user,
        onClick: async () => {
          await toggleTrackReaction(track.id, "like");
        }
      });
      quickActions.appendChild(likeMetricBtn);

      const dislikeMetricBtn = createTrackMetricButton({
        iconName: "dislike",
        count: track.dislikesCount,
        active: Boolean(track.disliked),
        label: t("actionDislike"),
        disabled: !state.user,
        onClick: async () => {
          await toggleTrackReaction(track.id, "dislike");
        }
      });
      quickActions.appendChild(dislikeMetricBtn);

      const repostMetricBtn = createTrackMetricButton({
        iconName: "repost",
        count: track.repostsCount,
        active: Boolean(track.reposted),
        label: t("actionRepost"),
        disabled: !state.user,
        onClick: async () => {
          await toggleTrackRepost(track.id);
        }
      });
      quickActions.appendChild(repostMetricBtn);

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
        quickEditBtn.textContent = t("actionEditBeat");
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

      const quickCommentsBtn = createTrackMetricButton({
        iconName: "comment",
        count: track.commentsCount,
        label: t("commentsTitle"),
        onClick: () => {
          toggleComments();
        }
      });
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
        <span><a class="user-link" href="${escapeHtml(buildUserHref(track.username))}" target="_blank" rel="noopener noreferrer">@${escapeHtml(track.username)}</a></span>
        <span>${escapeHtml(t("labelGenre"))}: ${escapeHtml(track.genre || "-")}</span>
        <span>${escapeHtml(t("labelAuthors"))}: ${escapeHtml((track.authors || []).join(", ") || "-")}</span>
        <span>${escapeHtml(t("labelProducers"))}: ${escapeHtml((track.producers || []).join(", ") || "-")}</span>
        <span data-listens-track-id="${escapeHtml(track.id)}">${escapeHtml(t("labelListens"))}: ${escapeHtml(String(track.listensCount || 0))}</span>
        <span>${escapeHtml(t("labelPublished"))}: ${escapeHtml(formatDate(track.createdAt))}</span>
      `;
      const audioPlayer = buildAudioPlayer(track, source);
      const adminCanManageTrack = Boolean(state.user?.isAdmin) && !track.isOwner;
      const editFormWrap = track.isOwner
        ? buildTrackEditForm(track)
        : (adminCanManageTrack ? buildTrackEditForm(track) : null);
      const actionItems = [
        {
          label: t("btnCopyLink"),
          onSelect: async () => {
            await copyTrackShareLink(track, `/t/${encodeURIComponent(track.id)}`);
          }
        }
      ];
      if (!track.isOwner) {
        actionItems.push({
          label: "Пожаловаться",
          disabled: !state.user,
          onSelect: () => reportTrack(track)
        });
      }
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
      } else if (adminCanManageTrack) {
        actionItems.push({
          label: "Админ: редактировать трек",
          onSelect: () => {
            const form = editFormWrap?.querySelector("form");
            if (form) {
              form.classList.toggle("hidden");
            }
          }
        });
        actionItems.push({
          label: "Админ: удалить трек",
          danger: true,
          onSelect: () => deleteTrack(track)
        });
      }
      const actions = createActionMenu(actionItems);
      const quickActions = document.createElement("div");
      quickActions.className = "track-actions track-primary-actions";

      quickActions.appendChild(createTrackMetricButton({
        iconName: "like",
        count: track.likesCount,
        active: Boolean(track.liked),
        label: t("actionLike"),
        disabled: !state.user,
        onClick: async () => {
          await toggleTrackReaction(track.id, "like");
        }
      }));

      quickActions.appendChild(createTrackMetricButton({
        iconName: "dislike",
        count: track.dislikesCount,
        active: Boolean(track.disliked),
        label: t("actionDislike"),
        disabled: !state.user,
        onClick: async () => {
          await toggleTrackReaction(track.id, "dislike");
        }
      }));

      quickActions.appendChild(createTrackMetricButton({
        iconName: "repost",
        count: track.repostsCount,
        active: Boolean(track.reposted),
        label: t("actionRepost"),
        disabled: !state.user,
        onClick: async () => {
          await toggleTrackRepost(track.id);
        }
      }));

      const quickCommentsBtn = createTrackMetricButton({
        iconName: "comment",
        count: track.commentsCount,
        label: t("commentsTitle")
      });
      quickActions.appendChild(quickCommentsBtn);

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
      quickCommentsBtn.addEventListener("click", () => {
        if (!state.commentsCollapsedMap) {
          state.commentsCollapsedMap = {};
        }
        const nextCollapsed = !Boolean(state.commentsCollapsedMap[track.id]);
        state.commentsCollapsedMap[track.id] = nextCollapsed;
        commentsBody.classList.toggle("hidden", nextCollapsed);
        commentsToggleBtn.textContent = nextCollapsed ? t("commentsToggleShow") : t("commentsToggleHide");
      });
      main.append(title, privacyChip, audioPlayer, quickActions, actions, detailsBtn, detailsWrap);
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
