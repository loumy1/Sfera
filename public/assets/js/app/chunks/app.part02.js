function setImageWithFallback(imageElement, src, fallback = getDefaultAvatar()) {
  imageElement.onerror = () => {
    imageElement.onerror = null;
    imageElement.src = fallback;
  };
  imageElement.src = src || fallback;
}

function loadAudioDurationFromSource(source) {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    let settled = false;

    const cleanup = () => {
      audio.removeAttribute("src");
      audio.load();
    };

    const finish = (handler) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      handler(value);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = finish(() => {
      const duration = Number(audio.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Не удалось определить длительность аудио"));
        return;
      }
      resolve(duration);
    });
    audio.onerror = finish(() => reject(new Error("Не удалось прочитать длительность аудио")));
    audio.src = source;
  });
}

async function getAudioDurationFromFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await loadAudioDurationFromSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function getAudioDurationFromUrl(url) {
  return loadAudioDurationFromSource(url);
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

function saveEqualizerSettings() {
  try {
    window.localStorage.setItem(EQUALIZER_STORAGE_KEY, JSON.stringify(normalizeEqualizer(state.equalizer)));
  } catch {
    // ignore
  }
}

function updateEqualizerLabels() {
  for (const input of elements.equalizerInputs) {
    const freq = input.dataset.eqBand;
    const output = document.querySelector(`[data-eq-value='${freq}']`);
    if (!output) {
      continue;
    }
    const value = Number(input.value);
    output.textContent = `${value > 0 ? "+" : ""}${value} dB`;
  }
}

function applyEqualizerToEngine() {
  if (!audioEngine.filters.length) {
    return;
  }

  for (const filter of audioEngine.filters) {
    const value = Number(state.equalizer[filter.frequency.value] || 0);
    filter.gain.value = Number.isFinite(value) ? value : 0;
  }
}

const __sferaPlayerCore = window.SferaPlayerCore.createAppPlayerCore({
  state,
  elements,
  audioEngine,
  constants: { EQUALIZER_BANDS },
  deps: {
    clampVolume,
    saveVolume,
    applyEqualizerToEngine,
    api,
    t,
    formatDuration,
    setImageWithFallback,
    getTrackAuthorsLabel,
    createUserLinkNode,
    refreshListenHistory,
    renderListenHistory,
    refreshAuthorAnalytics,
    renderAuthorAnalytics
  }
});
function initAudioEngine(...args) {
  return __sferaPlayerCore.initAudioEngine(...args);
}

function resumeAudioEngine(...args) {
  return __sferaPlayerCore.resumeAudioEngine(...args);
}

function applyVolumeToGlobalPlayer(...args) {
  return __sferaPlayerCore.applyVolumeToGlobalPlayer(...args);
}

function reportTrackListen(...args) {
  return __sferaPlayerCore.reportTrackListen(...args);
}

function createEmptyMilestoneState(...args) {
  return __sferaPlayerCore.createEmptyMilestoneState(...args);
}

function resetPlaybackMilestones(...args) {
  return __sferaPlayerCore.resetPlaybackMilestones(...args);
}

function updateTrackListenCounters(...args) {
  return __sferaPlayerCore.updateTrackListenCounters(...args);
}

function getTrackById(...args) {
  return __sferaPlayerCore.getTrackById(...args);
}

function getCurrentTrackId(...args) {
  return __sferaPlayerCore.getCurrentTrackId(...args);
}

function updateSeekUi(...args) {
  return __sferaPlayerCore.updateSeekUi(...args);
}

function previewSeekFromSlider(...args) {
  return __sferaPlayerCore.previewSeekFromSlider(...args);
}

function commitSeekFromSlider(...args) {
  return __sferaPlayerCore.commitSeekFromSlider(...args);
}

function updateTrackPlayButtons(...args) {
  return __sferaPlayerCore.updateTrackPlayButtons(...args);
}

function updateGlobalPlayerButtons(...args) {
  return __sferaPlayerCore.updateGlobalPlayerButtons(...args);
}

function showGlobalPlayer(...args) {
  return __sferaPlayerCore.showGlobalPlayer(...args);
}

function clearGlobalPlayerInfo(...args) {
  return __sferaPlayerCore.clearGlobalPlayerInfo(...args);
}

function closeGlobalPlayer(...args) {
  return __sferaPlayerCore.closeGlobalPlayer(...args);
}

function getQueueFromCard(...args) {
  return __sferaPlayerCore.getQueueFromCard(...args);
}

function setPlaybackQueue(...args) {
  return __sferaPlayerCore.setPlaybackQueue(...args);
}

function setCurrentTrack(...args) {
  return __sferaPlayerCore.setCurrentTrack(...args);
}

function playCurrentTrack(...args) {
  return __sferaPlayerCore.playCurrentTrack(...args);
}

function pauseCurrentTrack(...args) {
  return __sferaPlayerCore.pauseCurrentTrack(...args);
}

function stopCurrentTrack(...args) {
  return __sferaPlayerCore.stopCurrentTrack(...args);
}

function pickNextIndex(...args) {
  return __sferaPlayerCore.pickNextIndex(...args);
}

function pickPreviousIndex(...args) {
  return __sferaPlayerCore.pickPreviousIndex(...args);
}

function playNextTrack(...args) {
  return __sferaPlayerCore.playNextTrack(...args);
}

function playPreviousTrack(...args) {
  return __sferaPlayerCore.playPreviousTrack(...args);
}

function startTrackPlayback(...args) {
  return __sferaPlayerCore.startTrackPlayback(...args);
}

function reportListenMilestonesIfNeeded(...args) {
  return __sferaPlayerCore.reportListenMilestonesIfNeeded(...args);
}

function buildAudioPlayer(...args) {
  return __sferaPlayerCore.buildAudioPlayer(...args);
}

function reconcilePlayerQueue(...args) {
  return __sferaPlayerCore.reconcilePlayerQueue(...args);
}

function syncPlayerExpandedUi(...args) {
  return __sferaPlayerCore.syncPlayerExpandedUi(...args);
}

function setPlayerExpanded(...args) {
  return __sferaPlayerCore.setPlayerExpanded(...args);
}

function togglePlayerExpanded(...args) {
  return __sferaPlayerCore.togglePlayerExpanded(...args);
}

function renderEqualizerControls() {
  for (const input of elements.equalizerInputs) {
    const freq = input.dataset.eqBand;
    const value = Number(state.equalizer[freq] || 0);
    input.value = String(value);

  }
  syncEqualizerPresetSelect();
  updateEqualizerLabels();
}

function detectEqualizerPresetKey(equalizerState) {
  for (const [presetKey, presetValue] of Object.entries(EQUALIZER_PRESETS)) {
    if (!presetValue) {
      continue;
    }

    let matches = true;
    for (const freq of EQUALIZER_BANDS) {
      if (Number(equalizerState?.[freq] || 0) !== Number(presetValue[freq] || 0)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return presetKey;
    }
  }

  return "custom";
}

function syncEqualizerPresetSelect() {
  if (!elements.equalizerPresetSelect) {
    return;
  }

  elements.equalizerPresetSelect.value = detectEqualizerPresetKey(state.equalizer);
}

function applyEqualizerPreset(presetKey, { silent = false } = {}) {
  const preset = EQUALIZER_PRESETS[presetKey];
  if (!preset) {
    if (presetKey === "custom") {
      syncEqualizerPresetSelect();
      return;
    }
    throw new Error("Неизвестный пресет эквалайзера");
  }

  const next = createDefaultEqualizer();
  for (const freq of EQUALIZER_BANDS) {
    next[freq] = Math.max(-12, Math.min(12, Number(preset[freq] || 0)));
  }

  state.equalizer = next;
  renderEqualizerControls();
  saveEqualizerSettings();
  applyEqualizerToEngine();

  if (!silent) {
    setStatus(`Пресет эквалайзера: ${elements.equalizerPresetSelect?.selectedOptions?.[0]?.textContent || presetKey}`, "success");
  }
}

function setupEqualizerControls() {
  state.equalizer = loadSavedEqualizer();
  renderEqualizerControls();

  for (const input of elements.equalizerInputs) {
    input.addEventListener("input", () => {
      const freq = input.dataset.eqBand;
      if (!freq) {
        return;
      }
      state.equalizer[freq] = Math.max(-12, Math.min(12, Number(input.value) || 0));
      updateEqualizerLabels();
      syncEqualizerPresetSelect();
      saveEqualizerSettings();
      applyEqualizerToEngine();
    });
  }

  if (elements.equalizerPresetApplyBtn && elements.equalizerPresetSelect) {
    elements.equalizerPresetApplyBtn.addEventListener("click", () => {
      const presetKey = String(elements.equalizerPresetSelect.value || "custom");
      if (presetKey === "custom") {
        setStatus("Выбран режим Custom", "success");
        return;
      }
      applyEqualizerPreset(presetKey);
    });

    elements.equalizerPresetSelect.addEventListener("change", () => {
      const presetKey = String(elements.equalizerPresetSelect.value || "custom");
      if (presetKey === "custom") {
        return;
      }
      applyEqualizerPreset(presetKey, { silent: true });
    });
  }

  if (elements.equalizerResetBtn) {
    elements.equalizerResetBtn.addEventListener("click", () => {
      state.equalizer = createDefaultEqualizer();
      renderEqualizerControls();
      saveEqualizerSettings();
      applyEqualizerToEngine();
      setStatus("Эквалайзер сброшен", "success");
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
    !elements.playerRepeatOneBtn ||
    !elements.playerCloseBtn
  ) {
    return;
  }

  initAudioEngine();
  state.player.isExpanded = false;
  syncPlayerExpandedUi();
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

  elements.playerExpandBtn?.addEventListener("click", () => {
    togglePlayerExpanded();
  });

  const expandByInfoClick = () => {
    if (!elements.globalPlayer || !elements.globalPlayer.classList.contains("visible")) {
      return;
    }
    if (!state.player.isExpanded) {
      setPlayerExpanded(true);
    }
  };
  elements.playerTrackInfoWrap?.addEventListener("click", expandByInfoClick);
  elements.playerTrackCover?.addEventListener("click", expandByInfoClick);

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

  elements.playerCloseBtn.addEventListener("click", () => {
    closeGlobalPlayer();
  });

  clearGlobalPlayerInfo();
  syncPlayerExpandedUi();
  updateGlobalPlayerButtons();
}

const __sferaPublishUi = window.SferaPublishUi.createAppPublishUi({
  state,
  elements,
  constants: {
    MAX_MP3_BYTES,
    MAX_WAV_BYTES,
    MAX_IMAGE_BYTES,
    COVER_SIZE,
    MAX_ALBUM_TRACKS,
    MAX_ALBUM_DURATION_SECONDS
  },
  deps: {
    api,
    t,
    setStatus,
    formatDate,
    formatDuration,
    getAudioDurationFromFile,
    getAudioDurationFromUrl,
    parseLocalDateTimeToIso,
    getBeatLicenseTypeLabel,
    getTrackAuthorsLabel,
    isBeatTrack,
    refreshTracks,
    refreshAlbums,
    refreshPlaylists,
    refreshMe,
    renderAll
  }
});
function extractBase64(...args) { return __sferaPublishUi.extractBase64(...args); }
function readFileAsDataUrl(...args) { return __sferaPublishUi.readFileAsDataUrl(...args); }
function loadImage(...args) { return __sferaPublishUi.loadImage(...args); }
function canvasToBlob(...args) { return __sferaPublishUi.canvasToBlob(...args); }
function ensureImageFile(...args) { return __sferaPublishUi.ensureImageFile(...args); }
function normalizeAudioMime(...args) { return __sferaPublishUi.normalizeAudioMime(...args); }
function prepareAudio(...args) { return __sferaPublishUi.prepareAudio(...args); }
function prepareImage(...args) { return __sferaPublishUi.prepareImage(...args); }
function prepareCover(...args) { return __sferaPublishUi.prepareCover(...args); }
function createGeneratedCover(...args) { return __sferaPublishUi.createGeneratedCover(...args); }
function parseCommaList(...args) { return __sferaPublishUi.parseCommaList(...args); }
function normalizeTag(...args) { return __sferaPublishUi.normalizeTag(...args); }
function updatePremiereFieldVisibility(...args) { return __sferaPublishUi.updatePremiereFieldVisibility(...args); }
function getAlbumLocalFiles(...args) { return __sferaPublishUi.getAlbumLocalFiles(...args); }
function updateAlbumTrackFilesSummary(...args) { return __sferaPublishUi.updateAlbumTrackFilesSummary(...args); }
function resolveTrackDurationForAlbum(...args) { return __sferaPublishUi.resolveTrackDurationForAlbum(...args); }
function getFileBaseTitle(...args) { return __sferaPublishUi.getFileBaseTitle(...args); }
function collectBeatLicensesFromForm(...args) { return __sferaPublishUi.collectBeatLicensesFromForm(...args); }
function uploadAlbumLocalTrack(...args) { return __sferaPublishUi.uploadAlbumLocalTrack(...args); }
function syncAlbumTrackPickerSelectionFromDom(...args) { return __sferaPublishUi.syncAlbumTrackPickerSelectionFromDom(...args); }
function getAlbumTrackPickerSelectedIds(...args) { return __sferaPublishUi.getAlbumTrackPickerSelectedIds(...args); }
function setAlbumTrackPickerFilterMode(...args) { return __sferaPublishUi.setAlbumTrackPickerFilterMode(...args); }
function getAlbumTrackSearchHaystack(...args) { return __sferaPublishUi.getAlbumTrackSearchHaystack(...args); }
function compareAlbumPickerTracks(...args) { return __sferaPublishUi.compareAlbumPickerTracks(...args); }
function renderAlbumTrackOptions(...args) { return __sferaPublishUi.renderAlbumTrackOptions(...args); }
function bindPublishUiHandlers(...args) { return __sferaPublishUi.bindPublishUiHandlers(...args); }

function isBeatTrack(track) {
  return String(track?.kind || "song") === "beat";
}

function normalizeBeatLicenses(licenses) {
  if (!Array.isArray(licenses)) {
    return [];
  }

  const allowed = new Set(["mp3", "wav", "trackout", "exclusive"]);
  const seen = new Set();
  const result = [];

  for (const raw of licenses) {
    if (!raw || typeof raw !== "object") {
      continue;
    }

    const type = String(raw.type || "").trim().toLowerCase();
    if (!allowed.has(type) || seen.has(type)) {
      continue;
    }

    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) {
      continue;
    }

    const currency = String(raw.currency || "RUB").trim().toUpperCase() === "USD" ? "USD" : "RUB";
    seen.add(type);
    result.push({
      type,
      price: Math.round(price),
      currency
    });
  }

  return result;
}

function getBeatLicenseTypeLabel(type) {
  const key = String(type || "").toLowerCase();
  if (key === "mp3") return "MP3";
  if (key === "wav") return "WAV";
  if (key === "trackout") return "Trackout";
  if (key === "exclusive") return "Exclusive";
  return type || "Лицензия";
}

function formatBeatLicensePrice(license) {
  const price = Number(license?.price || 0);
  const currency = String(license?.currency || "RUB").toUpperCase() === "USD" ? "USD" : "RUB";
  if (currency === "USD") {
    return `$${price}`;
  }
  return `${price} ₽`;
}

function getOwnPlaylists() {
  if (!state.user) {
    return [];
  }

  return state.playlists.filter((playlist) => playlist.userId === state.user.id);
}

const __sferaFeedCore = window.SferaFeedCore.createAppFeedCore({
  state,
  elements,
  deps: {
    isBeatTrack,
    updatePremiereFieldVisibility,
    switchTab,
    t,
    api,
    getTrackById,
    startTrackPlayback,
    setStatus,
    createTrackLink,
    createUserLinkNode,
    renderFeed
  }
});
function getFeedTracks(...args) {
  return __sferaFeedCore.getFeedTracks(...args);
}

function renderAccessBlocks(...args) {
  return __sferaFeedCore.renderAccessBlocks(...args);
}

function renderFeedFilterButtons(...args) {
  return __sferaFeedCore.renderFeedFilterButtons(...args);
}

function renderProfileSectionTabs(...args) {
  return __sferaFeedCore.renderProfileSectionTabs(...args);
}

function setProfileSection(...args) {
  return __sferaFeedCore.setProfileSection(...args);
}

function normalizeSearchQuery(...args) {
  return __sferaFeedCore.normalizeSearchQuery(...args);
}

function buildFeedSearchMatches(...args) {
  return __sferaFeedCore.buildFeedSearchMatches(...args);
}

function highlightSearchTarget(...args) {
  return __sferaFeedCore.highlightSearchTarget(...args);
}

function upsertTrack(...args) {
  return __sferaFeedCore.upsertTrack(...args);
}

function ensureTrackLoaded(...args) {
  return __sferaFeedCore.ensureTrackLoaded(...args);
}

function goToTrackFromSearch(...args) {
  return __sferaFeedCore.goToTrackFromSearch(...args);
}

function goToAlbumFromSearch(...args) {
  return __sferaFeedCore.goToAlbumFromSearch(...args);
}

function openFeedSearchMatch(...args) {
  return __sferaFeedCore.openFeedSearchMatch(...args);
}

function getSharedTrackIdFromLocation(...args) {
  return __sferaFeedCore.getSharedTrackIdFromLocation(...args);
}

function openTrackFromSharedLinkIfNeeded(...args) {
  return __sferaFeedCore.openTrackFromSharedLinkIfNeeded(...args);
}

function setFeedSearchActiveIndex(...args) {
  return __sferaFeedCore.setFeedSearchActiveIndex(...args);
}

function moveFeedSearchActiveIndex(...args) {
  return __sferaFeedCore.moveFeedSearchActiveIndex(...args);
}

function openActiveFeedSearchResult(...args) {
  return __sferaFeedCore.openActiveFeedSearchResult(...args);
}

function renderFeedSearchResults(...args) {
  return __sferaFeedCore.renderFeedSearchResults(...args);
}

function createSelectionItem(...args) {
  return __sferaFeedCore.createSelectionItem(...args);
}

function renderSelections(...args) {
  return __sferaFeedCore.renderSelections(...args);
}

function updateFeedStickyOffset(...args) {
  return __sferaFeedCore.updateFeedStickyOffset(...args);
}

function renderFeedSectionToggleLabels(...args) {
  return __sferaFeedCore.renderFeedSectionToggleLabels(...args);
}

function applyFeedSectionVisibility(...args) {
  return __sferaFeedCore.applyFeedSectionVisibility(...args);
}

function toggleFeedSection(...args) {
  return __sferaFeedCore.toggleFeedSection(...args);
}

function ensureFeedUiBindings(...args) {
  return __sferaFeedCore.ensureFeedUiBindings(...args);
}

const __sferaFeedUi = window.SferaFeedUi.createAppFeedUi({
  state,
  realtime,
  audioEngine,
  elements,
  MAX_MP3_BYTES,
  MAX_WAV_BYTES,
  MAX_IMAGE_BYTES,
  COVER_SIZE,
  MAX_ALBUM_TRACKS,
  MAX_ALBUM_DURATION_SECONDS,
  VOLUME_STORAGE_KEY,
  EQUALIZER_STORAGE_KEY,
  GUEST_LANGUAGE_STORAGE_KEY,
  DEFAULT_UI_LANGUAGE,
  EQUALIZER_BANDS,
  ONLINE_POLL_INTERVAL_MS,
  EQUALIZER_PRESETS,
  __sferaPlayerCore,
  __sferaFeedCore,
  normalizeUiLanguage,
  getUiMessages,
  t,
  loadGuestUiLanguage,
  saveGuestUiLanguage,
  resolvePreferredUiLanguage,
  setStatus,
  setTextBySelector,
  setLabelTextForControl,
  applyUiLanguage,
  renderOnlineCounter,
  getUiDateLocale,
  formatDate,
  formatDuration,
  buildTrackHref,
  buildUserHref,
  createTrackLink,
  createUserLinkNode,
  toLocalDateTimeInputValue,
  parseLocalDateTimeToIso,
  getTrackVisibilityLabel,
  isNotFoundError,
  api,
  clearRealtimeReconnectTimer,
  getWebSocketUrl,
  disconnectRealtimeSocket,
  scheduleRealtimeReconnect,
  handleRealtimeEvent,
  connectRealtimeSocket,
  escapeHtml,
  switchTab,
  getDefaultAvatar,
