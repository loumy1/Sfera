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
  title.textContent = track.title;

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

  main.append(title, meta, description, tags, audioPlayer);
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
      text.textContent = message.text;

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
      window.prompt("Скопируй ссылку на профиль", profileUrl);
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

  elements.publicProfileActions.append(followBtn, messageBtn, shareBtn);
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
  elements.publicUsername.textContent = `@${user.username}`;
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
  const data = await api(`/api/public/users/${encodeURIComponent(username)}`);
  state.profileData = data;
  applyPublicChromeLanguage();
  if (state.profileData?.viewer) {
    connectPublicRealtimeSocket();
  } else {
    disconnectPublicRealtimeSocket(true);
  }
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

  state.profileUsername = decodeURIComponent(
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
    await refreshOnlineUsers().catch(() => {
      // ignore transient online-counter errors
    });
    setStatus("Профиль загружен", "success");
  } catch (error) {
    elements.publicProfileCard.classList.add("hidden");
    elements.publicNotFound.classList.remove("hidden");
    setStatus(error.message, "error");
  }

  setInterval(() => {
    refreshOnlineUsers().catch(() => {
      // ignore transient polling errors
    });
  }, ONLINE_POLL_INTERVAL_MS);

  window.addEventListener("beforeunload", () => {
    disconnectPublicRealtimeSocket(true);
  });
}

init();
