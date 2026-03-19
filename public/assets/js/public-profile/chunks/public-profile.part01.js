const state = {
  profileData: null,
  profileUsername: "",
  onlineUsers: 0,
  publicSection: "tracks",
  publicChatUserId: "",
  publicChatUser: null,
  publicChatMessages: [],
  playbackVolume: 0.5,
  player: {
    queue: [],
    currentIndex: -1,
    activeTrackId: null,
    shuffle: false,
    repeatMode: "off",
    listenReported: false,
    reportedMilestones: { 25: false, 50: false, 100: false },
    currentSource: "public-profile",
    seekDragging: false,
    seekPreviewTime: 0
  },
  equalizer: {}
};

const elements = {
  publicStatus: document.getElementById("publicStatus"),
  onlineCounter: document.getElementById("onlineCounter"),
  publicProfileCard: document.getElementById("publicProfileCard"),
  publicNotFound: document.getElementById("publicNotFound"),
  publicHeader: document.getElementById("publicHeader"),
  publicAvatar: document.getElementById("publicAvatar"),
  publicUsername: document.getElementById("publicUsername"),
  publicBio: document.getElementById("publicBio"),
  publicCreated: document.getElementById("publicCreated"),
  publicProfileActions: document.getElementById("publicProfileActions"),
  publicAdminPanel: document.getElementById("publicAdminPanel"),
  publicTracksCount: document.getElementById("publicTracksCount"),
  publicRepostsCount: document.getElementById("publicRepostsCount"),
  publicLikesCount: document.getElementById("publicLikesCount"),
  publicPlaylistsCount: document.getElementById("publicPlaylistsCount"),
  publicFollowersCount: document.getElementById("publicFollowersCount"),
  publicTracksList: document.getElementById("publicTracksList"),
  publicBeatsList: document.getElementById("publicBeatsList"),
  publicRepostsList: document.getElementById("publicRepostsList"),
  publicLikesList: document.getElementById("publicLikesList"),
  publicAlbumsList: document.getElementById("publicAlbumsList"),
  publicPlaylistsList: document.getElementById("publicPlaylistsList"),
  publicSectionTabs: Array.from(document.querySelectorAll("[data-public-section]")),
  publicPanels: Array.from(document.querySelectorAll("[data-public-panel]")),
  publicMessagesModal: document.getElementById("publicMessagesModal"),
  publicMessagesModalCloseBtn: document.getElementById("publicMessagesModalCloseBtn"),
  publicMessagesModalTitle: document.getElementById("publicMessagesModalTitle"),
  publicMessagesModalSubtitle: document.getElementById("publicMessagesModalSubtitle"),
  publicMessagesModalChatList: document.getElementById("publicMessagesModalChatList"),
  publicMessagesModalSendForm: document.getElementById("publicMessagesModalSendForm"),
  publicMessagesModalInput: document.getElementById("publicMessagesModalInput"),

  globalPlayer: document.getElementById("globalPlayer"),
  globalPlayerAudio: document.getElementById("globalPlayerAudio"),
  playerTrackCover: document.getElementById("playerTrackCover"),
  playerTrackTitle: document.getElementById("playerTrackTitle"),
  playerTrackAuthors: document.getElementById("playerTrackAuthors"),
  playerTrackMeta: document.getElementById("playerTrackMeta"),
  playerPrevBtn: document.getElementById("playerPrevBtn"),
  playerPlayBtn: document.getElementById("playerPlayBtn"),
  playerPauseBtn: document.getElementById("playerPauseBtn"),
  playerStopBtn: document.getElementById("playerStopBtn"),
  playerNextBtn: document.getElementById("playerNextBtn"),
  playerShuffleBtn: document.getElementById("playerShuffleBtn"),
  playerRepeatAllBtn: document.getElementById("playerRepeatAllBtn"),
  playerRepeatOneBtn: document.getElementById("playerRepeatOneBtn"),
  playerVolumeSlider: document.getElementById("playerVolumeSlider"),
  playerSeekSlider: document.getElementById("playerSeekSlider"),
  playerCurrentTime: document.getElementById("playerCurrentTime"),
  playerDuration: document.getElementById("playerDuration")
};

const audioEngine = {
  context: null,
  sourceNode: null,
  gainNode: null,
  filters: []
};

const realtime = {
  socket: null,
  reconnectTimer: null,
  keepaliveTimer: null,
  manualClose: false
};

const VOLUME_STORAGE_KEY = "beatoon_volume";
const EQUALIZER_STORAGE_KEY = "beatoon_equalizer_v1";
const EQUALIZER_BANDS = [60, 230, 910, 3600, 14000];
const ONLINE_POLL_INTERVAL_MS = 15000;
const REALTIME_KEEPALIVE_INTERVAL_MS = 25000;
const PUBLIC_UI_LANGUAGE_STORAGE_KEY = "trapdom_ui_language_v1";

const PUBLIC_UI_MESSAGES = {
  ru: { onlinePrefix: "Онлайн", brandBeta: "бета-тест" },
  en: { onlinePrefix: "Online", brandBeta: "beta-test" },
  zh: { onlinePrefix: "在线", brandBeta: "测试版" },
  uk: { onlinePrefix: "Онлайн", brandBeta: "бета-тест" }
};

let publicStatusFadeTimer = null;
let publicStatusClearTimer = null;
let publicStatusSeq = 0;

function normalizePublicUiLanguage(value) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "en" || key === "zh" || key === "ru" || key === "uk") {
    return key;
  }
  return "ru";
}

function getPublicUiLanguage() {
  if (state.profileData?.viewer?.language) {
    return normalizePublicUiLanguage(state.profileData.viewer.language);
  }
  try {
    return normalizePublicUiLanguage(window.localStorage.getItem(PUBLIC_UI_LANGUAGE_STORAGE_KEY));
  } catch {
    return "ru";
  }
}

function publicT(key) {
  const lang = getPublicUiLanguage();
  return PUBLIC_UI_MESSAGES[lang]?.[key] || PUBLIC_UI_MESSAGES.ru[key] || key;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyPublicChromeLanguage() {
  document.documentElement.lang = getPublicUiLanguage();
  const beta = document.querySelector("header .brand-wrap > .brand-beta");
  if (beta) {
    beta.textContent = publicT("brandBeta");
  }
  renderOnlineCounter();
}

function setStatus(text, type = "info") {
  if (!elements.publicStatus) {
    return;
  }

  publicStatusSeq += 1;
  const seq = publicStatusSeq;
  if (publicStatusFadeTimer) {
    clearTimeout(publicStatusFadeTimer);
    publicStatusFadeTimer = null;
  }
  if (publicStatusClearTimer) {
    clearTimeout(publicStatusClearTimer);
    publicStatusClearTimer = null;
  }

  elements.publicStatus.textContent = text || "";
  elements.publicStatus.classList.remove("error", "success", "is-fading");

  if (type === "error") {
    elements.publicStatus.classList.add("error");
  }

  if (type === "success") {
    elements.publicStatus.classList.add("success");
  }

  if (!text) {
    elements.publicStatus.classList.remove("is-visible");
    return;
  }

  elements.publicStatus.classList.add("is-visible");
  publicStatusFadeTimer = setTimeout(() => {
    if (seq !== publicStatusSeq) return;
    elements.publicStatus.classList.add("is-fading");
  }, 5000);
  publicStatusClearTimer = setTimeout(() => {
    if (seq !== publicStatusSeq) return;
    elements.publicStatus.textContent = "";
    elements.publicStatus.classList.remove("error", "success", "is-visible", "is-fading");
  }, 5600);
}

function renderOnlineCounter() {
  if (!elements.onlineCounter) {
    return;
  }

  elements.onlineCounter.textContent = `${publicT("onlinePrefix")}: ${state.onlineUsers}`;
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "дата неизвестна";
  }

  const lang = getPublicUiLanguage();
  const locale = lang === "uk" ? "uk-UA" : lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "ru-RU";
  return date.toLocaleDateString(locale, { dateStyle: "medium" });
}

function toLocalDateTimeInputValue(iso) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function parseLocalDateTimeToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Укажи корректную дату и время");
  }

  return date.toISOString();
}

function formatDuration(totalSeconds) {
  const numeric = Number(totalSeconds);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "0:00";
  }

  const seconds = Math.floor(numeric);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function renderPublicSectionTabs() {
  const active = state.publicSection;

  for (const button of elements.publicSectionTabs) {
    button.classList.toggle("active", button.dataset.publicSection === active);
  }

  for (const panel of elements.publicPanels) {
    panel.classList.toggle("active", panel.dataset.publicPanel === active);
  }
}

function setPublicSection(section) {
  const allowed = new Set(["tracks", "beats", "reposts", "likes", "albums", "playlists"]);
  if (!allowed.has(section)) {
    return;
  }
  state.publicSection = section;
  renderPublicSectionTabs();
}

function createPublicSkeletonCardNode() {
  const card = document.createElement("div");
  card.className = "skeleton-card";

  const title = document.createElement("div");
  title.className = "skeleton-line title";
  const meta = document.createElement("div");
  meta.className = "skeleton-line meta";
  const short = document.createElement("div");
  short.className = "skeleton-line short";

  card.append(title, meta, short);
  return card;
}

function renderPublicSkeletonCards(container, count = 3) {
  if (!container) return;
  container.innerHTML = "";
  container.classList.add("skeleton-list");
  for (let i = 0; i < count; i += 1) {
    container.appendChild(createPublicSkeletonCardNode());
  }
}

function clearPublicSkeletonMode(container) {
  if (!container) return;
  container.classList.remove("skeleton-list");
}

function showPublicLoadingSkeletons() {
  const targets = [
    elements.publicTracksList,
    elements.publicBeatsList,
    elements.publicRepostsList,
    elements.publicLikesList,
    elements.publicAlbumsList,
    elements.publicPlaylistsList
  ];
  for (const target of targets) {
    renderPublicSkeletonCards(target, 2);
  }
}

function getDefaultAvatar() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%2311111b'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' font-size='54' font-family='sans-serif'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";
}

function getTrackAuthorsLabel(track) {
  const authors = Array.isArray(track?.authors) ? track.authors.filter(Boolean) : [];
  if (authors.length > 0) {
    return authors.join(", ");
  }
  if (track?.username) {
    return `@${track.username}`;
  }
  return "-";
}

function setImageWithFallback(imageElement, src, fallback = getDefaultAvatar()) {
  imageElement.onerror = () => {
    imageElement.onerror = null;
    imageElement.src = fallback;
  };
  imageElement.src = src || fallback;
}

function clampVolume(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0.5;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 1) {
    return 1;
  }
  return numeric;
}

function loadSavedVolume() {
  try {
    return clampVolume(window.localStorage.getItem(VOLUME_STORAGE_KEY));
  } catch {
    return 0.5;
  }
}

function saveVolume(value) {
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(clampVolume(value)));
  } catch {
    // ignore
  }
}

function createDefaultEqualizer() {
  const next = {};
  for (const freq of EQUALIZER_BANDS) {
    next[freq] = 0;
  }
  return next;
}

function normalizeEqualizer(rawValue) {
  const normalized = createDefaultEqualizer();
  if (!rawValue || typeof rawValue !== "object") {
    return normalized;
  }

  for (const freq of EQUALIZER_BANDS) {
    const value = Number(rawValue[freq]);
    if (Number.isFinite(value)) {
      normalized[freq] = Math.max(-12, Math.min(12, value));
    }
  }

  return normalized;
}

function loadSavedEqualizer() {
  try {
    const raw = window.localStorage.getItem(EQUALIZER_STORAGE_KEY);
    if (!raw) {
      return createDefaultEqualizer();
    }
    return normalizeEqualizer(JSON.parse(raw));
  } catch {
    return createDefaultEqualizer();
  }
}

function setRangeProgress(slider, ratio) {
  if (!slider) {
    return;
  }
  const normalized = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  slider.style.setProperty("--range-progress-pct", `${Math.round(normalized * 100)}%`);
}

function applyVolumeToGlobalPlayer(volume) {
  state.playbackVolume = clampVolume(volume);
  saveVolume(state.playbackVolume);

  if (elements.globalPlayerAudio) {
    elements.globalPlayerAudio.volume = state.playbackVolume;
  }

  if (audioEngine.gainNode && audioEngine.context) {
    audioEngine.gainNode.gain.setValueAtTime(state.playbackVolume, audioEngine.context.currentTime);
  }

  if (elements.playerVolumeSlider) {
    elements.playerVolumeSlider.value = String(Math.round(state.playbackVolume * 100));
    setRangeProgress(elements.playerVolumeSlider, state.playbackVolume);
  }
}

function initAudioEngine() {
  if (!elements.globalPlayerAudio || audioEngine.sourceNode) {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  try {
    audioEngine.context = new AudioContextClass();
    audioEngine.sourceNode = audioEngine.context.createMediaElementSource(elements.globalPlayerAudio);
    audioEngine.gainNode = audioEngine.context.createGain();
    audioEngine.gainNode.gain.value = clampVolume(state.playbackVolume);
    audioEngine.filters = EQUALIZER_BANDS.map((freq) => {
      const filter = audioEngine.context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = Number(state.equalizer[freq] || 0);
      return filter;
    });

    let previousNode = audioEngine.sourceNode;
    for (const filter of audioEngine.filters) {
      previousNode.connect(filter);
      previousNode = filter;
    }
    previousNode.connect(audioEngine.gainNode);
    audioEngine.gainNode.connect(audioEngine.context.destination);
  } catch {
    audioEngine.context = null;
    audioEngine.sourceNode = null;
    audioEngine.gainNode = null;
    audioEngine.filters = [];
  }
}

async function resumeAudioEngine() {
  if (!audioEngine.context) {
    return;
  }

  if (audioEngine.context.state === "suspended") {
    try {
      await audioEngine.context.resume();
    } catch {
      // ignore
    }
  }
}

async function fetchJsonWithInit(path, init) {
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function apiCompatPaths(path) {
  const paths = [path];

  if (path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
    paths.push(`/api/auth/${path.slice("/api/".length)}`);
  }

  return paths;
}

async function api(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: {}
  };

  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      init.body = options.body;
    } else {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
  }

  const candidatePaths = apiCompatPaths(path);
  const lastCandidatePath = candidatePaths[candidatePaths.length - 1];
  let lastError = null;

  for (const candidatePath of candidatePaths) {
    const { response, data } = await fetchJsonWithInit(candidatePath, init);

    if (response.ok) {
      return data;
    }

    const error = new Error(data.error || `Ошибка ${response.status} (${candidatePath})`);
    error.status = response.status;
    error.path = candidatePath;
    lastError = error;

    if (response.status === 404 && candidatePath !== lastCandidatePath) {
      continue;
    }

    throw error;
  }

  throw lastError || new Error(`Ошибка запроса (${path})`);
}

async function refreshOnlineUsers() {
  const data = await api("/api/online");
  const nextCount = Number.isFinite(Number(data.onlineUsers)) ? Math.max(0, Number(data.onlineUsers)) : 0;
  if (
    nextCount === 0 &&
    state.onlineUsers > 0 &&
    realtime.socket &&
    realtime.socket.readyState === WebSocket.OPEN
  ) {
    return;
  }
  state.onlineUsers = nextCount;
  renderOnlineCounter();
}

function clearPublicRealtimeReconnectTimer() {
  if (realtime.reconnectTimer) {
    clearTimeout(realtime.reconnectTimer);
    realtime.reconnectTimer = null;
  }
}

function clearPublicRealtimeKeepaliveTimer() {
  if (realtime.keepaliveTimer) {
    clearInterval(realtime.keepaliveTimer);
    realtime.keepaliveTimer = null;
  }
}

function getPublicWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function sendPublicRealtimeKeepalive(socket = realtime.socket) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  try {
    socket.send("{\"event\":\"client:ping\"}");
  } catch {
    // ignore
  }
}

function startPublicRealtimeKeepalive(socket = realtime.socket) {
  clearPublicRealtimeKeepaliveTimer();
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  sendPublicRealtimeKeepalive(socket);
  realtime.keepaliveTimer = setInterval(() => {
    sendPublicRealtimeKeepalive(socket);
  }, REALTIME_KEEPALIVE_INTERVAL_MS);
}

function schedulePublicRealtimeReconnect() {
  clearPublicRealtimeReconnectTimer();
  if (realtime.manualClose || !state.profileData?.viewer) {
    return;
  }
  realtime.reconnectTimer = setTimeout(() => {
    connectPublicRealtimeSocket();
  }, 2000);
}

function disconnectPublicRealtimeSocket(manual = true) {
  realtime.manualClose = manual;
  clearPublicRealtimeReconnectTimer();
  clearPublicRealtimeKeepaliveTimer();

  if (!realtime.socket) {
    return;
  }

  const socket = realtime.socket;
  realtime.socket = null;

  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    try {
      socket.close();
    } catch {
      // ignore
    }
  }
}

function handlePublicRealtimeEvent(message) {
  if (!message || typeof message.event !== "string") {
    return;
  }

  if (message.event === "ws:ready" || message.event === "online:count") {
    const onlineUsers = Number(message.payload?.onlineUsers);
    if (Number.isFinite(onlineUsers)) {
      state.onlineUsers = Math.max(0, onlineUsers);
      renderOnlineCounter();
    }
  }
}

function connectPublicRealtimeSocket() {
  if (!state.profileData?.viewer) {
    return;
  }

  if (
    realtime.socket &&
    (realtime.socket.readyState === WebSocket.OPEN || realtime.socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  clearPublicRealtimeReconnectTimer();
  realtime.manualClose = false;
  const socket = new WebSocket(getPublicWebSocketUrl());
  realtime.socket = socket;

  socket.addEventListener("open", () => {
    if (realtime.socket !== socket) return;
    startPublicRealtimeKeepalive(socket);
  });

  socket.addEventListener("message", (event) => {
    try {
      handlePublicRealtimeEvent(JSON.parse(String(event.data || "")));
    } catch {
      // ignore bad payloads
    }
  });

  socket.addEventListener("close", () => {
    clearPublicRealtimeKeepaliveTimer();
    if (realtime.socket === socket) {
      realtime.socket = null;
    }
    schedulePublicRealtimeReconnect();
  });

  socket.addEventListener("error", () => {
    clearPublicRealtimeKeepaliveTimer();
    try {
      socket.close();
    } catch {
      // ignore
    }
  });
}

async function reportTrackListen(trackId, payload) {
  if (!trackId) {
    return null;
  }

  const milestone = Number(payload?.milestone);
  const ratio = Number(payload?.ratio);
  const source = String(payload?.source || "public-profile");

  const data = await api(`/api/tracks/${trackId}/listen`, {
    method: "POST",
    body: {
      milestone,
      progress: ratio,
      source
    }
  });

  const count = Number(data.listensCount);
  if (Number.isFinite(count)) {
    updateTrackInProfileData(trackId, (track) => {
      track.listensCount = count;
    });
    return count;
  }

  return null;
}

function createEmptyMilestoneState() {
  return { 25: false, 50: false, 100: false };
}

function resetPlaybackMilestones() {
  state.player.listenReported = false;
  state.player.reportedMilestones = createEmptyMilestoneState();
}

function getAllProfileTracks() {
  if (!state.profileData) {
    return [];
  }

  const map = new Map();
  const buckets = [state.profileData.tracks, state.profileData.reposts, state.profileData.likes];

  for (const list of buckets) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const track of list) {
      if (!track || !track.id || map.has(track.id)) {
        continue;
      }
      map.set(track.id, track);
    }
  }

  return Array.from(map.values());
}

function updateTrackInProfileData(trackId, updater) {
  if (!state.profileData || typeof updater !== "function") {
    return;
  }

  const buckets = [state.profileData.tracks, state.profileData.reposts, state.profileData.likes];
  for (const list of buckets) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const track of list) {
      if (track && track.id === trackId) {
        updater(track);
      }
    }
  }
}

function getTrackById(trackId) {
  return getAllProfileTracks().find((track) => track.id === trackId) || null;
}

function getCurrentTrackId() {
  const index = state.player.currentIndex;
  if (index < 0 || index >= state.player.queue.length) {
    return null;
  }
  return state.player.queue[index];
}

function updateTrackListenCounters(trackId, listensCount) {
  for (const node of document.querySelectorAll(`[data-listens-track-id='${trackId}']`)) {
    node.textContent = `Прослушивания: ${listensCount}`;
  }
}

function updateSeekUi() {
  if (
    !elements.globalPlayerAudio ||
    !elements.playerSeekSlider ||
    !elements.playerCurrentTime ||
    !elements.playerDuration
  ) {
    return;
  }

  const duration = Number(elements.globalPlayerAudio.duration);
  const currentTime = Number(elements.globalPlayerAudio.currentTime);
  const hasDuration = Number.isFinite(duration) && duration > 0;

  if (!hasDuration) {
    elements.playerSeekSlider.value = "0";
    setRangeProgress(elements.playerSeekSlider, 0);
    elements.playerCurrentTime.textContent = "0:00";
    elements.playerDuration.textContent = "0:00";
    return;
  }

  elements.playerDuration.textContent = formatDuration(duration);

  if (state.player.seekDragging) {
    const previewRatio = duration > 0 ? state.player.seekPreviewTime / duration : 0;
    setRangeProgress(elements.playerSeekSlider, previewRatio);
    elements.playerCurrentTime.textContent = formatDuration(state.player.seekPreviewTime);
    return;
  }

  const ratio = Number.isFinite(currentTime) && currentTime > 0 ? currentTime / duration : 0;
  elements.playerSeekSlider.value = String(Math.max(0, Math.min(1000, Math.round(ratio * 1000))));
  setRangeProgress(elements.playerSeekSlider, ratio);
  elements.playerCurrentTime.textContent = formatDuration(currentTime);
}

function previewSeekFromSlider() {
  if (!elements.playerSeekSlider || !elements.globalPlayerAudio) {
    return;
  }

  const duration = Number(elements.globalPlayerAudio.duration);
  const ratio = Number(elements.playerSeekSlider.value) / 1000;
  state.player.seekDragging = true;
  state.player.seekPreviewTime = Number.isFinite(duration) && duration > 0 ? Math.max(0, Math.min(duration, ratio * duration)) : 0;
  setRangeProgress(elements.playerSeekSlider, ratio);
  updateSeekUi();
}

function commitSeekFromSlider() {
  if (!elements.playerSeekSlider || !elements.globalPlayerAudio) {
    return;
  }

  const duration = Number(elements.globalPlayerAudio.duration);
  if (Number.isFinite(duration) && duration > 0) {
    const ratio = Number(elements.playerSeekSlider.value) / 1000;
    elements.globalPlayerAudio.currentTime = Math.max(0, Math.min(duration, ratio * duration));
  }

  state.player.seekDragging = false;
  state.player.seekPreviewTime = 0;
  updateSeekUi();
}

function updateTrackPlayButtons() {
  const currentTrackId = getCurrentTrackId();
  const isPlaying = Boolean(elements.globalPlayerAudio && !elements.globalPlayerAudio.paused);

  for (const button of document.querySelectorAll("button[data-track-play-button='1']")) {
    const isCurrent = currentTrackId && button.dataset.trackId === currentTrackId;
    button.classList.toggle("player-playing", Boolean(isCurrent && isPlaying));
    button.dataset.playing = isCurrent && isPlaying ? "1" : "0";
    button.textContent = isCurrent && isPlaying ? "⏸ Пауза" : "▶ Слушать";
  }

  for (const card of document.querySelectorAll(".track-card[data-track-id], .playlist-item[data-track-id]")) {
    const isCurrent = currentTrackId && card.dataset.trackId === currentTrackId;
    card.classList.toggle("is-active-track", Boolean(isCurrent));
    card.classList.toggle("is-playing-track", Boolean(isCurrent && isPlaying));
  }
}

function updateGlobalPlayerButtons() {
  if (!elements.globalPlayerAudio) {
    return;
  }

  const hasTrack = Boolean(getCurrentTrackId());
  const isPlaying = hasTrack && !elements.globalPlayerAudio.paused;

  elements.playerPlayBtn.disabled = !hasTrack || isPlaying;
  elements.playerPauseBtn.disabled = !hasTrack || !isPlaying;
  elements.playerStopBtn.disabled = !hasTrack;
  elements.playerPrevBtn.disabled = !hasTrack;
  elements.playerNextBtn.disabled = !hasTrack;
  elements.playerShuffleBtn.classList.toggle("active", state.player.shuffle);
  elements.playerRepeatAllBtn.classList.toggle("active", state.player.repeatMode === "all");
  elements.playerRepeatOneBtn.classList.toggle("active", state.player.repeatMode === "one");
}

function showGlobalPlayer(track) {
  if (!elements.globalPlayer || !track) {
    return;
  }

  elements.globalPlayer.classList.remove("hidden");
  elements.globalPlayer.classList.add("visible");
  if (elements.playerTrackCover) {
    setImageWithFallback(elements.playerTrackCover, track.coverUrl);
  }
  elements.playerTrackTitle.textContent = track.title;
  if (elements.playerTrackAuthors) {
    elements.playerTrackAuthors.textContent = `Авторы: ${getTrackAuthorsLabel(track)}`;
  }
  elements.playerTrackMeta.textContent = `@${track.username} • ${track.genre || "Без жанра"}`;
}

function clearGlobalPlayerInfo() {
  if (elements.playerTrackCover) {
    setImageWithFallback(elements.playerTrackCover, null);
  }
  elements.playerTrackTitle.textContent = "Трек не выбран";
  if (elements.playerTrackAuthors) {
    elements.playerTrackAuthors.textContent = "Авторы: -";
  }
  elements.playerTrackMeta.textContent = "Нажми «Слушать» на любом треке";
  state.player.seekDragging = false;
  state.player.seekPreviewTime = 0;
  if (elements.playerSeekSlider) {
    elements.playerSeekSlider.value = "0";
  }
  if (elements.playerCurrentTime) {
    elements.playerCurrentTime.textContent = "0:00";
  }
  if (elements.playerDuration) {
    elements.playerDuration.textContent = "0:00";
  }
}

function getQueueFromCard(card, trackId) {
  const fallback = getAllProfileTracks().map((track) => track.id);
  if (!card || !card.parentElement) {
    return fallback;
  }

  const ids = Array.from(card.parentElement.querySelectorAll(".track-card[data-track-id]"))
    .map((node) => node.dataset.trackId)
    .filter(Boolean);

  const unique = [];
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    unique.push(id);
  }

  if (!unique.includes(trackId)) {
    unique.unshift(trackId);
  }

  return unique.length > 0 ? unique : fallback;
}

function setPlaybackQueue(queue, trackId) {
  const availableIds = new Set(getAllProfileTracks().map((track) => track.id));
  const normalizedQueue = [];

  for (const item of queue || []) {
    if (!availableIds.has(item)) {
      continue;
    }
    if (!normalizedQueue.includes(item)) {
      normalizedQueue.push(item);
    }
  }

  if (trackId && availableIds.has(trackId) && !normalizedQueue.includes(trackId)) {
    normalizedQueue.unshift(trackId);
  }

  state.player.queue = normalizedQueue;
  state.player.currentIndex = normalizedQueue.indexOf(trackId);
  if (state.player.currentIndex < 0 && normalizedQueue.length > 0) {
    state.player.currentIndex = 0;
  }
}

function setCurrentTrack(trackId) {
  const track = getTrackById(trackId);
  if (!track || !elements.globalPlayerAudio) {
    return false;
  }

  const currentSrc = elements.globalPlayerAudio.getAttribute("src") || "";
  const trackChanged = state.player.activeTrackId !== track.id;
  if (currentSrc !== track.audioUrl) {
    elements.globalPlayerAudio.src = track.audioUrl;
    elements.globalPlayerAudio.load();
  }

  elements.globalPlayerAudio.playbackRate = 1;
  state.player.activeTrackId = track.id;
  if (trackChanged) {
    resetPlaybackMilestones();
  }
  showGlobalPlayer(track);
  updateSeekUi();
  updateTrackPlayButtons();
  updateGlobalPlayerButtons();
  return true;
}

async function playCurrentTrack() {
  const trackId = getCurrentTrackId();
  if (!trackId || !setCurrentTrack(trackId)) {
    return;
  }

  await resumeAudioEngine();
  try {
    await elements.globalPlayerAudio.play();
  } catch {
    // ignore autoplay rejection
  }

  updateTrackPlayButtons();
  updateGlobalPlayerButtons();
}

function pauseCurrentTrack() {
  if (!elements.globalPlayerAudio) {
    return;
  }
  elements.globalPlayerAudio.pause();
  updateTrackPlayButtons();
  updateGlobalPlayerButtons();
}

function stopCurrentTrack() {
  if (!elements.globalPlayerAudio) {
    return;
  }
