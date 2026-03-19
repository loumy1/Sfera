  elements.globalPlayerAudio.pause();
  elements.globalPlayerAudio.currentTime = 0;
  resetPlaybackMilestones();
  state.player.seekDragging = false;
  state.player.seekPreviewTime = 0;
  updateSeekUi();
  updateTrackPlayButtons();
  updateGlobalPlayerButtons();
}

function pickNextIndex() {
  const total = state.player.queue.length;
  if (total === 0) {
    return -1;
  }

  if (state.player.repeatMode === "one") {
    return state.player.currentIndex;
  }

  if (state.player.shuffle) {
    if (total === 1) {
      return state.player.currentIndex;
    }
    let nextIndex = state.player.currentIndex;
    while (nextIndex === state.player.currentIndex) {
      nextIndex = Math.floor(Math.random() * total);
    }
    return nextIndex;
  }

  const nextIndex = state.player.currentIndex + 1;
  if (nextIndex < total) {
    return nextIndex;
  }

  if (state.player.repeatMode === "all") {
    return 0;
  }

  return -1;
}

function pickPreviousIndex() {
  const total = state.player.queue.length;
  if (total === 0) {
    return -1;
  }

  if (state.player.shuffle) {
    if (total === 1) {
      return state.player.currentIndex;
    }
    let prevIndex = state.player.currentIndex;
    while (prevIndex === state.player.currentIndex) {
      prevIndex = Math.floor(Math.random() * total);
    }
    return prevIndex;
  }

  const prevIndex = state.player.currentIndex - 1;
  if (prevIndex >= 0) {
    return prevIndex;
  }

  if (state.player.repeatMode === "all") {
    return total - 1;
  }

  return 0;
}

async function playNextTrack() {
  const nextIndex = pickNextIndex();
  if (nextIndex < 0) {
    pauseCurrentTrack();
    return;
  }

  state.player.currentIndex = nextIndex;
  await playCurrentTrack();
}

async function playPreviousTrack() {
  if (elements.globalPlayerAudio && elements.globalPlayerAudio.currentTime > 3) {
    elements.globalPlayerAudio.currentTime = 0;
    updateSeekUi();
    return;
  }

  const prevIndex = pickPreviousIndex();
  if (prevIndex < 0) {
    return;
  }

  state.player.currentIndex = prevIndex;
  await playCurrentTrack();
}

async function startTrackPlayback(trackId, queue, card, source = "public-profile") {
  const fallbackQueue = queue && queue.length > 0 ? queue : getQueueFromCard(card, trackId);
  setPlaybackQueue(fallbackQueue, trackId);
  state.player.currentSource = source;
  await playCurrentTrack();
}

function promptDialog(options) {
  return window.SferaDialogs.prompt(options);
}

function confirmDialog(options) {
  return window.SferaDialogs.confirm(options);
}

function copyDialog(options) {
  return window.SferaDialogs.copy(options);
}

function reportListenMilestonesIfNeeded() {
  const trackId = getCurrentTrackId();
  if (!trackId || !elements.globalPlayerAudio) {
    return;
  }

  const duration = Number(elements.globalPlayerAudio.duration);
  const currentTime = Number(elements.globalPlayerAudio.currentTime);

  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) {
    return;
  }

  const progress = Math.max(0, Math.min(1.2, currentTime / duration));
  const source = state.player.currentSource || "public-profile";

  const milestones = [25, 50, 100];
  for (const milestone of milestones) {
    const threshold = milestone / 100;
    if (progress < threshold || state.player.reportedMilestones[milestone]) {
      continue;
    }

    state.player.reportedMilestones[milestone] = true;
    if (milestone >= 50) {
      state.player.listenReported = true;
    }

    reportTrackListen(trackId, {
      milestone,
      ratio: progress,
      source
    })
      .then((listensCount) => {
        if (listensCount !== null) {
          updateTrackListenCounters(trackId, listensCount);
        }
      })
      .catch(() => {
        // ignore listen-reporting errors
      });
  }
}

function setupGlobalPlayer() {
  if (
    !elements.globalPlayerAudio ||
    !elements.playerVolumeSlider ||
    !elements.playerSeekSlider ||
    !elements.playerCurrentTime ||
    !elements.playerDuration ||
    !elements.playerPlayBtn ||
    !elements.playerPauseBtn ||
    !elements.playerStopBtn ||
    !elements.playerNextBtn ||
    !elements.playerPrevBtn ||
    !elements.playerShuffleBtn ||
    !elements.playerRepeatAllBtn ||
    !elements.playerRepeatOneBtn
  ) {
    return;
  }

  initAudioEngine();
  applyVolumeToGlobalPlayer(state.playbackVolume);
  updateSeekUi();

  elements.globalPlayerAudio.addEventListener("play", () => {
    updateSeekUi();
    updateTrackPlayButtons();
    updateGlobalPlayerButtons();
  });

  elements.globalPlayerAudio.addEventListener("pause", () => {
    updateSeekUi();
    updateTrackPlayButtons();
    updateGlobalPlayerButtons();
  });

  elements.globalPlayerAudio.addEventListener("timeupdate", () => {
    updateSeekUi();
    reportListenMilestonesIfNeeded();
  });

  elements.globalPlayerAudio.addEventListener("ended", async () => {
    if (state.player.repeatMode === "one") {
      elements.globalPlayerAudio.currentTime = 0;
      resetPlaybackMilestones();
      updateSeekUi();
      await playCurrentTrack();
      return;
    }
    updateSeekUi();
    await playNextTrack();
  });

  elements.globalPlayerAudio.addEventListener("loadedmetadata", () => {
    updateSeekUi();
  });

  elements.globalPlayerAudio.addEventListener("durationchange", () => {
    updateSeekUi();
  });

  elements.globalPlayerAudio.addEventListener("error", async () => {
    const currentTrackId = getCurrentTrackId();
    const track = currentTrackId ? getTrackById(currentTrackId) : null;
    const title = track && track.title ? `: ${track.title}` : "";
    setStatus(`Аудиофайл недоступен${title}`, "error");
    updateSeekUi();
    updateTrackPlayButtons();
    updateGlobalPlayerButtons();

    if (Array.isArray(state.player.queue) && state.player.queue.length > 1) {
      await playNextTrack();
    }
  });

  elements.globalPlayerAudio.addEventListener("ratechange", () => {
    if (elements.globalPlayerAudio.playbackRate !== 1) {
      elements.globalPlayerAudio.playbackRate = 1;
    }
  });

  elements.playerVolumeSlider.addEventListener("input", () => {
    applyVolumeToGlobalPlayer(Number(elements.playerVolumeSlider.value) / 100);
  });

  elements.playerSeekSlider.addEventListener("input", () => {
    previewSeekFromSlider();
  });

  elements.playerSeekSlider.addEventListener("change", () => {
    commitSeekFromSlider();
  });

  elements.playerSeekSlider.addEventListener("pointerdown", () => {
    state.player.seekDragging = true;
  });

  elements.playerSeekSlider.addEventListener("pointerup", () => {
    commitSeekFromSlider();
  });

  elements.playerPlayBtn.addEventListener("click", () => {
    playCurrentTrack();
  });

  elements.playerPauseBtn.addEventListener("click", () => {
    pauseCurrentTrack();
  });

  elements.playerStopBtn.addEventListener("click", () => {
    stopCurrentTrack();
  });

  elements.playerNextBtn.addEventListener("click", () => {
    playNextTrack();
  });

  elements.playerPrevBtn.addEventListener("click", () => {
    playPreviousTrack();
  });

  elements.playerShuffleBtn.addEventListener("click", () => {
    state.player.shuffle = !state.player.shuffle;
    updateGlobalPlayerButtons();
  });

  elements.playerRepeatAllBtn.addEventListener("click", () => {
    state.player.repeatMode = state.player.repeatMode === "all" ? "off" : "all";
    updateGlobalPlayerButtons();
  });

  elements.playerRepeatOneBtn.addEventListener("click", () => {
    state.player.repeatMode = state.player.repeatMode === "one" ? "off" : "one";
    updateGlobalPlayerButtons();
  });

  clearGlobalPlayerInfo();
  updateGlobalPlayerButtons();
}

function reconcilePlayerQueue() {
  const availableIds = new Set(getAllProfileTracks().map((track) => track.id));
  state.player.queue = state.player.queue.filter((id) => availableIds.has(id));

  if (state.player.queue.length === 0) {
    state.player.currentIndex = -1;
    state.player.activeTrackId = null;
    state.player.currentSource = "public-profile";
    resetPlaybackMilestones();
    if (elements.globalPlayerAudio) {
      elements.globalPlayerAudio.pause();
      elements.globalPlayerAudio.removeAttribute("src");
      elements.globalPlayerAudio.load();
    }
    clearGlobalPlayerInfo();
    updateGlobalPlayerButtons();
    updateTrackPlayButtons();
    return;
  }

  if (state.player.currentIndex < 0 || state.player.currentIndex >= state.player.queue.length) {
    state.player.currentIndex = 0;
  }
}

function buildAudioPlayer(track, source = "public-profile") {
  const wrap = document.createElement("div");
  wrap.className = "audio-player";

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "ghost";
  playButton.dataset.trackPlayButton = "1";
  playButton.dataset.trackId = track.id;
  playButton.textContent = "▶ Слушать";

  playButton.addEventListener("click", async () => {
    const currentTrackId = getCurrentTrackId();
    const isCurrentPlaying = currentTrackId === track.id && elements.globalPlayerAudio && !elements.globalPlayerAudio.paused;

    if (isCurrentPlaying) {
      pauseCurrentTrack();
      return;
    }

    await startTrackPlayback(track.id, null, playButton.closest(".track-card"), source);
  });

  const hint = document.createElement("p");
  hint.className = "muted";
  hint.textContent = "";

  wrap.append(playButton);
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

function isBeatTrack(track) {
  return String(track?.kind || "song") === "beat";
}

function parseAdminCommaList(value, maxItems = 100, normalize = (item) => item) {
  const normalized = String(value || "")
    .split(",")
    .map((item) => normalize(String(item || "").trim()))
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, maxItems);
}

function normalizeAdminTag(tag) {
  return String(tag || "").trim().replace(/^#+/, "").toLowerCase();
}

function createAdminTrackEditor(track) {
  const wrap = document.createElement("div");
  wrap.className = "public-track-admin-actions";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "ghost";
  toggleBtn.textContent = isBeatTrack(track) ? "Админ: редактировать бит" : "Админ: редактировать трек";

  const form = document.createElement("form");
  form.className = "edit-form hidden";

  const premiereValue = toLocalDateTimeInputValue(track.premiereAt);
  const adminNote = document.createElement("p");
  adminNote.className = "muted";
  adminNote.textContent = "Администратор может менять название, описание, публикацию, обложку и аудиофайл чужого трека.";

  form.innerHTML = `
    <label>
      Название
      <input name="title" type="text" maxlength="120" required value="${escapeHtml(track.title || "")}" />
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
    <label data-public-edit-premiere-wrap class="${track.publishMode === "premiere" ? "" : "hidden"}">
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
      Хештеги
      <input name="hashtags" type="text" value="${escapeHtml((track.hashtags || []).join(", "))}" />
    </label>
    <label>
      Описание
      <textarea name="description" rows="4" maxlength="1000">${escapeHtml(track.description || "")}</textarea>
    </label>
    ${isBeatTrack(track) ? "" : `
    <label class="public-admin-checkbox">
      <input name="isExplicit" type="checkbox" ${track.isExplicit ? "checked" : ""} />
      <span>Метка E: в треке есть нецензурная лексика</span>
    </label>
    `}
    <label>
      Новая обложка (PNG/JPG)
      <input name="cover" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" />
    </label>
    <label>
      Новый аудиофайл (MP3/WAV)
      <input name="audio" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" />
    </label>
  `;

  const beatMetaWrap = document.createElement("div");
  beatMetaWrap.className = `inline-actions${isBeatTrack(track) ? "" : " hidden"}`;
  beatMetaWrap.innerHTML = `
    <label>
      BPM
      <input name="bpm" type="number" min="1" max="400" step="1" value="${escapeHtml(String(track.beatBpm || ""))}" />
    </label>
    <label>
      Тональность
      <input name="rootNote" type="text" maxlength="20" value="${escapeHtml(String(track.beatRootNote || ""))}" />
    </label>
  `;
  form.appendChild(beatMetaWrap);

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.textContent = "Сохранить изменения";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost public-admin-danger";
  deleteBtn.textContent = isBeatTrack(track) ? "Админ: удалить бит" : "Админ: удалить трек";

  form.prepend(adminNote);
  form.append(saveBtn, deleteBtn);

  const publishModeSelect = form.querySelector("select[name='publishMode']");
  const premiereWrap = form.querySelector("[data-public-edit-premiere-wrap]");
  const premiereInput = form.querySelector("input[name='premiereAt']");

  const updatePremiereVisibility = () => {
    const isPremiere = publishModeSelect?.value === "premiere";
    if (premiereWrap) {
      premiereWrap.classList.toggle("hidden", !isPremiere);
    }
    if (premiereInput) {
      premiereInput.required = isPremiere;
      if (!isPremiere) {
        premiereInput.value = "";
      }
    }
  };

  publishModeSelect?.addEventListener("change", updatePremiereVisibility);
  updatePremiereVisibility();

  toggleBtn.addEventListener("click", () => {
    form.classList.toggle("hidden");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = new FormData(form);
    const requestData = new FormData();
    const publishMode = String(raw.get("publishMode") || "public").trim().toLowerCase();
    const premiereAtIso = publishMode === "premiere"
      ? parseLocalDateTimeToIso(String(raw.get("premiereAt") || ""))
      : null;

    requestData.append("title", String(raw.get("title") || "").trim());
    requestData.append("description", String(raw.get("description") || "").trim());
    requestData.append("genre", String(raw.get("genre") || "").trim());
    requestData.append("publishMode", publishMode);
    requestData.append("premiereAt", premiereAtIso || "");
    requestData.append("isExplicit", !isBeatTrack(track) && raw.get("isExplicit") ? "true" : "false");
    requestData.append("authors", parseAdminCommaList(raw.get("authors"), 100).join(", "));
    requestData.append("producers", parseAdminCommaList(raw.get("producers"), 100).join(", "));
    requestData.append("hashtags", parseAdminCommaList(raw.get("hashtags"), 5, normalizeAdminTag).join(", "));

    if (isBeatTrack(track)) {
      requestData.append("bpm", String(raw.get("bpm") || "").trim());
      requestData.append("rootNote", String(raw.get("rootNote") || "").trim());
    }

    const coverFile = raw.get("cover");
    const audioFile = raw.get("audio");
    if (coverFile instanceof File && coverFile.size > 0) {
      requestData.append("cover", coverFile, coverFile.name || "cover.jpg");
    }
    if (audioFile instanceof File && audioFile.size > 0) {
      requestData.append("audio", audioFile, audioFile.name || "track.mp3");
    }

    try {
      setStatus("Сохраняю изменения трека...");
      await api(`/api/tracks/${track.id}`, {
        method: "PUT",
        body: requestData
      });
      await loadProfile(state.profileUsername);
      setStatus("Трек обновлён", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: `Удалить ${isBeatTrack(track) ? "бит" : "трек"}?`,
      message: `${isBeatTrack(track) ? "Бит" : "Трек"} "${track.title}" будет удалён без возможности восстановления.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true
    });
    if (!confirmed) {
      return;
    }

    try {
      setStatus(`Удаляю ${isBeatTrack(track) ? "бит" : "трек"}...`);
      await api(`/api/tracks/${track.id}`, {
        method: "DELETE"
      });
      await loadProfile(state.profileUsername);
      setStatus(isBeatTrack(track) ? "Бит удалён" : "Трек удалён", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  wrap.append(toggleBtn, form);
  return wrap;
}

function createTrackExplicitBadge() {
  const badge = document.createElement("span");
  badge.className = "track-explicit-badge";
  badge.textContent = "E";
  badge.setAttribute("aria-label", "В треке присутствует нецензурная лексика");
  badge.setAttribute("data-tooltip", "В треке присутствует нецензурная лексика");
  badge.tabIndex = 0;
  return badge;
}

function createTrackCard(track) {
  const card = document.createElement("article");
  card.className = "track-card";
  card.dataset.trackId = track.id;
  card.dataset.playSource = "public-profile";

  const coverWrap = document.createElement("div");
  coverWrap.className = "track-cover";

  const cover = document.createElement("img");
  setImageWithFallback(cover, track.coverUrl);
  cover.alt = `Обложка ${track.title}`;
  coverWrap.appendChild(cover);

  const main = document.createElement("div");
  main.className = "track-main";

  const title = document.createElement("h4");
  title.className = "track-title-heading";
  const titleText = document.createElement("span");
  titleText.textContent = track.title;
  title.appendChild(titleText);
  if (track.isExplicit) {
    title.appendChild(createTrackExplicitBadge());
  }

  const meta = document.createElement("div");
  meta.className = "track-meta";
  meta.innerHTML = `
    <span>@${track.username}</span>
    <span>Жанр: ${track.genre || "-"}</span>
    <span>👍 ${track.likesCount} • 👎 ${track.dislikesCount} • 💬 ${track.commentsCount} • 🔁 ${track.repostsCount}</span>
    <span data-listens-track-id="${track.id}">Прослушивания: ${track.listensCount || 0}</span>
    <span>Опубликовано: ${formatDate(track.createdAt)}</span>
  `;

  const description = document.createElement("p");
  description.className = "track-desc";
  description.textContent = track.description || "Без описания";

  const tags = createTagWrap(track.hashtags || []);
  const audioPlayer = buildAudioPlayer(track, "public-profile");
  const adminEditor = state.profileData?.viewer?.isAdmin && !track.isOwner
    ? createAdminTrackEditor(track)
    : null;

  main.append(title, meta, description, tags, audioPlayer);
  if (adminEditor) {
    main.appendChild(adminEditor);
  }
  card.append(coverWrap, main);
  return card;
}

function createPlaylistCard(playlist) {
  const card = document.createElement("div");
  card.className = "playlist-item";

  const title = document.createElement("strong");
  title.textContent = playlist.title;

  const info = document.createElement("p");
  info.className = "muted";
  info.textContent = `Треков: ${playlist.tracksCount}`;

  const description = document.createElement("p");
  description.textContent = playlist.description || "Без описания";

  card.append(title, info, description);

  if (Array.isArray(playlist.tracks) && playlist.tracks.length > 0) {
    const list = document.createElement("p");
    list.className = "muted";
    list.textContent = `Состав: ${playlist.tracks.map((track) => track.title).join(", ")}`;
    card.appendChild(list);
  }

  return card;
}

function createAlbumCard(album) {
  const card = document.createElement("div");
  card.className = "playlist-item";
  card.dataset.albumId = album.id;

  const title = document.createElement("strong");
  title.textContent = album.title;

  const info = document.createElement("p");
  info.className = "muted";
  info.textContent = `Треков: ${album.tracksCount} • Жанр: ${album.genre || "-"}`;

  const description = document.createElement("p");
  description.textContent = album.description || "Без описания";

  card.append(title, info, description);

  if (album.coverUrl) {
    const cover = document.createElement("img");
    cover.className = "album-cover-preview";
    cover.alt = `Обложка альбома ${album.title}`;
    setImageWithFallback(cover, album.coverUrl);
    card.appendChild(cover);
  }

  if (Array.isArray(album.tracks) && album.tracks.length > 0) {
    const list = document.createElement("p");
    list.className = "muted";
    list.textContent = `Состав: ${album.tracks.map((track) => track.title).join(", ")}`;
    card.appendChild(list);
  }

  return card;
}

function renderList(container, items, renderer, emptyText) {
  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = emptyText;
    container.appendChild(empty);
    updateTrackPlayButtons();
    return;
  }

  for (const item of items) {
    container.appendChild(renderer(item));
  }

  updateTrackPlayButtons();
}

async function toggleFollow(targetUserId) {
  try {
    setStatus("Обновляю подписку...");
    const result = await api("/api/follows/toggle", {
      method: "POST",
      body: { targetUserId }
    });
    await loadProfile(state.profileUsername);
    setStatus(result.following ? "Подписка оформлена" : "Подписка отменена", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

let publicMessagesModalBound = false;
const MESSAGE_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+/gi;

function trimLinkSuffix(value) {
  return String(value || "").replace(/[.,!?;:]+$/u, "");
}

function normalizeExternalLinkHref(value) {
  let href = String(value || "").trim();
  if (!href) {
    return "";
  }
  if (/^www\./i.test(href)) {
    href = `https://${href}`;
  }
  try {
    const url = new URL(href);
    const protocol = String(url.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function renderLinkifiedText(container, value) {
  if (!container) {
    return;
  }

  const sourceText = String(value || "");
  container.textContent = "";
  if (!sourceText) {
    return;
  }

  const fragment = document.createDocumentFragment();
  let cursor = 0;
  MESSAGE_LINK_PATTERN.lastIndex = 0;

  for (const match of sourceText.matchAll(MESSAGE_LINK_PATTERN)) {
    const rawMatch = String(match[0] || "");
    const startIndex = Number(match.index);

    if (startIndex > cursor) {
      fragment.appendChild(document.createTextNode(sourceText.slice(cursor, startIndex)));
    }

    const displayText = trimLinkSuffix(rawMatch);
    const suffixText = rawMatch.slice(displayText.length);
    const href = normalizeExternalLinkHref(displayText);

    if (href) {
      const link = document.createElement("a");
      link.className = "user-link";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer nofollow";
      link.textContent = displayText;
      fragment.appendChild(link);
    } else {
      fragment.appendChild(document.createTextNode(rawMatch));
    }

    if (suffixText) {
      fragment.appendChild(document.createTextNode(suffixText));
    }

    cursor = startIndex + rawMatch.length;
  }

  if (cursor < sourceText.length) {
    fragment.appendChild(document.createTextNode(sourceText.slice(cursor)));
  }

  if (!fragment.childNodes.length) {
    container.textContent = sourceText;
    return;
  }

  container.appendChild(fragment);
}

function closePublicMessagesModal() {
  if (!elements.publicMessagesModal) {
    return;
  }
  elements.publicMessagesModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function renderPublicMessagesModal() {
  if (!elements.publicMessagesModalChatList || !elements.publicMessagesModalTitle) {
    return;
  }

  elements.publicMessagesModalTitle.textContent = state.publicChatUser
    ? `@${state.publicChatUser.username}`
    : "Диалог";

  if (elements.publicMessagesModalSubtitle) {
    elements.publicMessagesModalSubtitle.textContent = state.publicChatUser
      ? "Личная переписка"
      : "Выберите пользователя для диалога";
  }

  elements.publicMessagesModalChatList.innerHTML = "";

  if (!state.publicChatUserId) {
    const hint = document.createElement("p");
    hint.className = "muted";
    hint.textContent = "Диалог не выбран";
    elements.publicMessagesModalChatList.appendChild(hint);
  } else if (!Array.isArray(state.publicChatMessages) || state.publicChatMessages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Диалог пуст";
    elements.publicMessagesModalChatList.appendChild(empty);
  } else {
    for (const message of state.publicChatMessages) {
      const row = document.createElement("div");
      row.className = `chat-message ${message.mine ? "mine" : ""}`;

      const head = document.createElement("strong");
      head.textContent = `${message.mine ? "Вы" : "@" + message.fromUsername} • ${formatDate(message.createdAt)}`;

      const text = document.createElement("p");
      renderLinkifiedText(text, message.text);

      row.append(head, text);
      elements.publicMessagesModalChatList.appendChild(row);
    }
  }

  if (elements.publicMessagesModalSendForm) {
    elements.publicMessagesModalSendForm.classList.toggle("hidden", !state.profileData?.viewer);
  }
  if (elements.publicMessagesModalInput) {
    elements.publicMessagesModalInput.disabled = !state.publicChatUserId;
  }

  elements.publicMessagesModalChatList.scrollTop = elements.publicMessagesModalChatList.scrollHeight;
}

function ensurePublicMessagesModalBindings() {
  if (publicMessagesModalBound || !elements.publicMessagesModal) {
    return;
  }
  publicMessagesModalBound = true;

  elements.publicMessagesModalCloseBtn?.addEventListener("click", closePublicMessagesModal);
  elements.publicMessagesModal.addEventListener("click", (event) => {
    if (event.target === elements.publicMessagesModal || event.target.dataset.modalBackdrop === "1") {
      closePublicMessagesModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.publicMessagesModal && !elements.publicMessagesModal.classList.contains("hidden")) {
      closePublicMessagesModal();
    }
  });
  elements.publicMessagesModalSendForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.profileData?.viewer) {
      setStatus("Войди в аккаунт, чтобы писать сообщения", "error");
      return;
    }

    if (!state.publicChatUserId) {
      setStatus("Диалог не выбран", "error");
      return;
    }

    const normalizedText = String(elements.publicMessagesModalInput?.value || "").trim();
    if (!normalizedText) {
      return;
    }

    try {
      setStatus("Отправляю сообщение...");
      await api(`/api/messages/${state.publicChatUserId}`, {
        method: "POST",
        body: { text: normalizedText }
      });
      if (elements.publicMessagesModalInput) {
        elements.publicMessagesModalInput.value = "";
      }
      const payload = await api(`/api/messages/${state.publicChatUserId}`);
      state.publicChatUser = payload.user || state.publicChatUser;
      state.publicChatMessages = Array.isArray(payload.messages) ? payload.messages : [];
      renderPublicMessagesModal();
      setStatus("Сообщение отправлено", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

async function sendMessageToProfile(user) {
  if (!state.profileData?.viewer) {
    setStatus("Войди в аккаунт, чтобы писать сообщения", "error");
    return;
  }

  ensurePublicMessagesModalBindings();

  if (!elements.publicMessagesModal) {
    setStatus("Окно сообщений недоступно", "error");
    return;
  }

  try {
    setStatus("Открываю диалог...");
    state.publicChatUserId = user.id;
    const payload = await api(`/api/messages/${user.id}`);
    state.publicChatUser = payload.user || { id: user.id, username: user.username };
    state.publicChatMessages = Array.isArray(payload.messages) ? payload.messages : [];
    renderPublicMessagesModal();
    elements.publicMessagesModal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    elements.publicMessagesModalInput?.focus();
    setStatus("Диалог открыт", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function renderProfileActions(data) {
  elements.publicProfileActions.innerHTML = "";

  const user = data.user;
  const viewer = data.viewer;

  if (!user) {
    return;
  }

  const shareBtn = document.createElement("button");
  shareBtn.type = "button";
  shareBtn.className = "ghost";
  shareBtn.textContent = "Поделиться";
  shareBtn.addEventListener("click", async () => {
    const profileUrl = `${window.location.origin}/u/${encodeURIComponent(user.username)}`;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setStatus("Ссылка на профиль скопирована", "success");
    } catch {
      await copyDialog({
        title: "Ссылка на профиль",
        message: "Скопируй ссылку вручную, если браузер не дал доступ к буферу.",
        value: profileUrl
      });
    }
  });

  if (user.isSelf) {
    const homeBtn = document.createElement("a");
    homeBtn.className = "tab-btn";
    homeBtn.href = "/";
    homeBtn.textContent = "На главную";
    elements.publicProfileActions.append(shareBtn, homeBtn);
    return;
  }

  if (!viewer) {
    const loginLink = document.createElement("a");
    loginLink.className = "tab-btn";
    loginLink.href = "/#tab-settings";
    loginLink.textContent = "Войти для подписки";
    elements.publicProfileActions.append(loginLink, shareBtn);
    return;
  }

  const followBtn = document.createElement("button");
  followBtn.type = "button";
  followBtn.className = user.isFollowing ? "ghost" : "";
  followBtn.textContent = user.isFollowing ? "Отписаться" : "Подписаться";
  followBtn.addEventListener("click", () => {
    toggleFollow(user.id);
  });

  const messageBtn = document.createElement("button");
  messageBtn.type = "button";
  messageBtn.className = "ghost";
  messageBtn.textContent = "Написать сообщение";
  messageBtn.addEventListener("click", () => {
    sendMessageToProfile(user);
  });

  const reportBtn = document.createElement("button");
  reportBtn.type = "button";
  reportBtn.className = "ghost";
  reportBtn.textContent = "Пожаловаться";
  reportBtn.addEventListener("click", async () => {
    const reasonInput = await promptDialog({
      title: "Жалоба на профиль",
      message: "Кратко укажи причину жалобы.",
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
      setStatus("Отправляю жалобу на профиль...");
      await api("/api/reports", {
        method: "POST",
        body: {
          targetType: "user",
          targetId: user.id,
          reason,
          details
        }
      });
      setStatus("Жалоба на профиль отправлена администраторам.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  const actionNodes = [followBtn, messageBtn, reportBtn, shareBtn];
  if (viewer.isAdmin) {
    const adminBtn = document.createElement("button");
    adminBtn.type = "button";
    adminBtn.className = "ghost";
    adminBtn.textContent = "Админ-панель";
    adminBtn.addEventListener("click", () => {
      elements.publicAdminPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    actionNodes.push(adminBtn);
  }

  elements.publicProfileActions.append(...actionNodes);
}

function updatePublicProfileUrl(user) {
  if (!user?.username) {
    return;
  }

  const profileUrl = new URL("/public-profile.html", window.location.origin);
  profileUrl.searchParams.set("username", user.username);
  if (user.id) {
    profileUrl.searchParams.set("uid", user.id);
  }
  window.history.replaceState({}, "", `${profileUrl.pathname}${profileUrl.search}`);
}

function renderAdminPanel(data) {
  if (!elements.publicAdminPanel) {
    return;
  }

  const user = data?.user || null;
  const viewer = data?.viewer || null;
  elements.publicAdminPanel.innerHTML = "";

  if (!user || !viewer?.isAdmin || user.isSelf) {
    elements.publicAdminPanel.classList.add("hidden");
    return;
  }

  elements.publicAdminPanel.classList.remove("hidden");

  const title = document.createElement("h3");
  title.textContent = "Админ-панель профиля";

  const note = document.createElement("p");
  note.className = "muted";
  note.textContent = user.isBanned
    ? `Аккаунт сейчас заблокирован${user.banReason ? `: ${user.banReason}` : ""}`
    : user.isVerifiedArtist
      ? "У этого аккаунта уже есть галочка подтверждённого автора. Здесь её тоже можно снять или выдать заново."
      : "Здесь можно менять ник, био, аватар, шапку, банить, выдавать галочку автора и удалять аккаунт.";

  const form = document.createElement("form");
  form.className = "mini-form";
  form.innerHTML = `
    <label>
      Никнейм
      <input name="username" type="text" minlength="3" maxlength="24" required value="${escapeHtml(user.username || "")}" />
    </label>
    <label>
      Описание профиля
      <textarea name="bio" rows="4" maxlength="500">${escapeHtml(user.bio || "")}</textarea>
    </label>
    <label class="public-admin-checkbox">
      <input name="isVerifiedArtist" type="checkbox" ${user.isVerifiedArtist ? "checked" : ""} />
      <span>Подтверждённый автор</span>
    </label>
    <label class="public-admin-checkbox">
      <input name="isBanned" type="checkbox" ${user.isBanned ? "checked" : ""} />
      <span>Заблокировать аккаунт</span>
    </label>
    <label>
      Причина блокировки
      <input name="banReason" type="text" maxlength="500" value="${escapeHtml(user.banReason || "")}" />
    </label>
    <label>
      Новый аватар (PNG/JPG/GIF)
      <input name="avatar" type="file" accept=".png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif" />
    </label>
    <label class="public-admin-checkbox">
      <input name="removeAvatar" type="checkbox" />
      <span>Удалить текущий аватар</span>
    </label>
    <label>
      Новая шапка (PNG/JPG)
      <input name="header" type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" />
    </label>
    <label class="public-admin-checkbox">
      <input name="removeHeader" type="checkbox" />
      <span>Удалить текущую шапку</span>
    </label>
  `;

  const actions = document.createElement("div");
  actions.className = "inline-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.textContent = "Сохранить профиль";

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "ghost public-admin-danger";
  deleteBtn.textContent = "Удалить аккаунт";

  actions.append(saveBtn, deleteBtn);
  form.appendChild(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = new FormData(form);
    const requestData = new FormData();
    requestData.append("username", String(raw.get("username") || "").trim());
    requestData.append("bio", String(raw.get("bio") || "").trim());
    requestData.append("isVerifiedArtist", raw.get("isVerifiedArtist") ? "true" : "false");
    requestData.append("isBanned", raw.get("isBanned") ? "true" : "false");
    requestData.append("banReason", String(raw.get("banReason") || "").trim());
    requestData.append("removeAvatar", raw.get("removeAvatar") ? "true" : "false");
    requestData.append("removeHeader", raw.get("removeHeader") ? "true" : "false");

    const avatarFile = raw.get("avatar");
    const headerFile = raw.get("header");
    if (avatarFile instanceof File && avatarFile.size > 0) {
      const avatarFallbackName = String(avatarFile.type || "").toLowerCase() === "image/gif" ? "avatar.gif" : "avatar.jpg";
      requestData.append("avatar", avatarFile, avatarFile.name || avatarFallbackName);
    }
    if (headerFile instanceof File && headerFile.size > 0) {
      requestData.append("header", headerFile, headerFile.name || "header.jpg");
    }

    try {
      setStatus("Сохраняю профиль пользователя...");
      const result = await api(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: requestData
      });
      if (result?.user?.username) {
        state.profileUsername = result.user.username;
        updatePublicProfileUrl({ id: user.id, username: result.user.username });
      }
      await loadProfile(state.profileUsername);
      setStatus("Профиль пользователя обновлён", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  deleteBtn.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "Удалить аккаунт?",
      message: `Аккаунт @${user.username} будет удалён без возможности восстановления.`,
      confirmText: "Удалить",
      cancelText: "Отмена",
      danger: true
    });
    if (!confirmed) {
      return;
    }

    try {
      setStatus("Удаляю аккаунт...");
      await api(`/api/admin/users/${user.id}`, {
        method: "DELETE"
      });
      setStatus("Аккаунт удалён", "success");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 250);
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  elements.publicAdminPanel.append(title, note, form);
}

function renderProfile(data) {
  const user = data.user;

  elements.publicProfileCard.classList.remove("hidden");
  elements.publicNotFound.classList.add("hidden");

  if (user.headerUrl) {
    elements.publicHeader.style.backgroundImage = `linear-gradient(to top, rgba(5,5,8,0.5), transparent), url(${user.headerUrl})`;
    elements.publicHeader.style.backgroundSize = "cover";
    elements.publicHeader.style.backgroundPosition = "center";
  } else {
    elements.publicHeader.style.backgroundImage = "linear-gradient(135deg, #17172a, #311f53)";
    elements.publicHeader.style.backgroundSize = "auto";
  }

  setImageWithFallback(elements.publicAvatar, user.avatarUrl);
  elements.publicUsername.textContent = "";
  const usernameText = document.createElement("span");
  usernameText.textContent = `@${user.username}`;
  elements.publicUsername.appendChild(usernameText);
  if (user.isVerifiedArtist) {
    const verifiedBadge = document.createElement("span");
    verifiedBadge.className = "profile-role-badge is-verified";
    verifiedBadge.textContent = "✓";
    verifiedBadge.setAttribute("aria-label", "Этот пользователь подтверждён как автор песен");
    verifiedBadge.setAttribute("data-tooltip", "Этот пользователь подтверждён как автор песен");
    verifiedBadge.tabIndex = 0;
    elements.publicUsername.appendChild(verifiedBadge);
  }
  elements.publicBio.textContent = user.bio || "Описание профиля не заполнено";
  elements.publicCreated.textContent = `В sfera с ${formatDate(user.createdAt)}`;

  if (elements.publicTracksCount) {
    elements.publicTracksCount.textContent = String(data.stats?.tracksCount || 0);
  }
  if (elements.publicRepostsCount) {
    elements.publicRepostsCount.textContent = String(data.stats?.repostsCount || 0);
  }
  if (elements.publicLikesCount) {
    elements.publicLikesCount.textContent = String(data.stats?.likesCount || 0);
  }
  if (elements.publicPlaylistsCount) {
    elements.publicPlaylistsCount.textContent = String(data.stats?.playlistsCount || 0);
  }
  if (elements.publicFollowersCount) {
    elements.publicFollowersCount.textContent = String(data.stats?.followersCount || 0);
  }

  renderProfileActions(data);
  renderAdminPanel(data);

  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  const songTracks = tracks.filter((track) => !isBeatTrack(track));
  const beatTracks = tracks.filter((track) => isBeatTrack(track));

  clearPublicSkeletonMode(elements.publicTracksList);
  clearPublicSkeletonMode(elements.publicBeatsList);
  clearPublicSkeletonMode(elements.publicRepostsList);
  clearPublicSkeletonMode(elements.publicLikesList);
  clearPublicSkeletonMode(elements.publicAlbumsList);
  clearPublicSkeletonMode(elements.publicPlaylistsList);

  renderList(elements.publicTracksList, songTracks, createTrackCard, "У пользователя пока нет треков");
  renderList(elements.publicBeatsList, beatTracks, createTrackCard, "У пользователя пока нет битов");
  renderList(elements.publicRepostsList, data.reposts, createTrackCard, "У пользователя пока нет репостов");
  renderList(elements.publicLikesList, data.likes, createTrackCard, "У пользователя пока нет лайков");
  renderList(elements.publicAlbumsList, data.albums, createAlbumCard, "У пользователя пока нет альбомов");
  renderList(elements.publicPlaylistsList, data.playlists, createPlaylistCard, "У пользователя пока нет плейлистов");
  renderPublicSectionTabs();
}

async function loadProfile(username) {
  const requestedUserId = String(new URLSearchParams(window.location.search).get("uid") || "").trim();
  const profilePath = `/api/public/users/${encodeURIComponent(username)}`;
  const requestPath = requestedUserId
    ? `${profilePath}?uid=${encodeURIComponent(requestedUserId)}`
    : profilePath;
  const data = await api(requestPath);
  state.profileData = data;
  applyPublicChromeLanguage();
  reconcilePlayerQueue();
  renderProfile(data);
}

for (const button of elements.publicSectionTabs) {
  button.addEventListener("click", () => {
    setPublicSection(button.dataset.publicSection);
  });
}

async function init() {
  applyPublicChromeLanguage();
  state.playbackVolume = loadSavedVolume();
  state.equalizer = loadSavedEqualizer();
  setupGlobalPlayer();
  applyVolumeToGlobalPlayer(state.playbackVolume);

  const currentUrl = new URL(window.location.href);
  const queryUsername = String(currentUrl.searchParams.get("username") || "").trim();
  state.profileUsername = queryUsername || decodeURIComponent(
    window.location.pathname.replace(/^\/u\//, "").replace(/\/+$/, "")
  ).trim();

  if (!state.profileUsername) {
    elements.publicProfileCard.classList.add("hidden");
    elements.publicNotFound.classList.remove("hidden");
    setStatus("Некорректный адрес профиля", "error");
    return;
  }

  try {
    setStatus("Загрузка профиля...");
    showPublicLoadingSkeletons();
    await loadProfile(state.profileUsername);
    setStatus("Профиль загружен", "success");
  } catch (error) {
    elements.publicProfileCard.classList.add("hidden");
    elements.publicNotFound.classList.remove("hidden");
    setStatus(error.message, "error");
  }
}

init();
