(() => {
  "use strict";

  function createAppPlayerCore(ctx) {
    const { state, elements, audioEngine, constants = {}, deps = {} } = ctx || {};
    const { EQUALIZER_BANDS = [] } = constants;
    const {
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
    } = deps;

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
          filter.gain.value = 0;
          return filter;
        });

        let previousNode = audioEngine.sourceNode;
        for (const filter of audioEngine.filters) {
          previousNode.connect(filter);
          previousNode = filter;
        }
        previousNode.connect(audioEngine.gainNode);
        audioEngine.gainNode.connect(audioEngine.context.destination);
        applyEqualizerToEngine();
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

    function setRangeProgress(slider, ratio) {
      if (!slider) {
        return;
      }
      const normalized = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
      slider.style.setProperty("--range-progress-pct", `${Math.round(normalized * 100)}%`);
    }

    function applyVolumeToGlobalPlayer(volume) {
      const normalized = clampVolume(volume);
      state.playbackVolume = normalized;
      if (state.player && typeof state.player === "object") {
        if (!Number.isFinite(Number(state.player.lastVolumeBeforeMute))) {
          state.player.lastVolumeBeforeMute = 0.5;
        }
        if (normalized > 0) {
          state.player.lastVolumeBeforeMute = normalized;
          state.player.isMuted = false;
        } else {
          state.player.isMuted = true;
        }
      }
      saveVolume(normalized);

      if (elements.globalPlayerAudio) {
        elements.globalPlayerAudio.volume = normalized;
      }

      if (audioEngine.gainNode && audioEngine.context) {
        audioEngine.gainNode.gain.setValueAtTime(normalized, audioEngine.context.currentTime);
      }

      if (elements.playerVolumeSlider) {
        elements.playerVolumeSlider.value = String(Math.round(normalized * 100));
        setRangeProgress(elements.playerVolumeSlider, normalized);
      }
    }

    async function reportTrackListen(trackId, progress) {
      if (!trackId) {
        return null;
      }

      const milestone = Number(progress?.milestone);
      const ratio = Number(progress?.ratio);
      const source = String(progress?.source || "unknown");

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
        const track = state.tracks.find((entry) => entry.id === trackId);
        if (track) {
          track.listensCount = count;
        }
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

    function updateTrackListenCounters(trackId, listensCount) {
      for (const node of document.querySelectorAll(`[data-listens-track-id='${trackId}']`)) {
        node.textContent = `${t("labelListens")}: ${listensCount}`;
      }
    }

    function getTrackById(trackId) {
      return state.tracks.find((track) => track.id === trackId) || null;
    }

    function getCurrentTrackId() {
      const index = state.player.currentIndex;
      if (index < 0 || index >= state.player.queue.length) {
        return null;
      }
      return state.player.queue[index];
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
        button.textContent = isCurrent && isPlaying ? t("btnPause") : t("btnListen");
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
      if (elements.playerCloseBtn) {
        elements.playerCloseBtn.disabled = !hasTrack;
      }
      elements.playerShuffleBtn.classList.toggle("active", state.player.shuffle);
      elements.playerRepeatAllBtn.classList.toggle("active", state.player.repeatMode === "all");
      elements.playerRepeatOneBtn.classList.toggle("active", state.player.repeatMode === "one");
    }

    function syncPlayerExpandedUi() {
      if (!elements.globalPlayer || !elements.playerExpandBtn) {
        return;
      }
      const isExpanded = Boolean(state.player?.isExpanded);
      elements.globalPlayer.classList.toggle("is-mini", !isExpanded);
      elements.playerExpandBtn.textContent = isExpanded ? "▴" : "▾";
      const label = isExpanded ? t("playerCollapse") : t("playerExpand");
      elements.playerExpandBtn.setAttribute("aria-label", label);
      elements.playerExpandBtn.title = label;
    }

    function setPlayerExpanded(expanded) {
      if (!state.player) {
        return;
      }
      state.player.isExpanded = Boolean(expanded);
      syncPlayerExpandedUi();
    }

    function togglePlayerExpanded() {
      setPlayerExpanded(!Boolean(state.player?.isExpanded));
    }

    function showGlobalPlayer(track) {
      if (!elements.globalPlayer || !track) {
        return;
      }

      elements.globalPlayer.classList.remove("hidden");
      elements.globalPlayer.classList.add("visible");
      syncPlayerExpandedUi();
      if (elements.playerTrackCover) {
        setImageWithFallback(elements.playerTrackCover, track.coverUrl);
      }
      elements.playerTrackTitle.textContent = track.title;
      if (elements.playerTrackAuthors) {
        elements.playerTrackAuthors.textContent = `${t("playerAuthorsPrefix")}: ${getTrackAuthorsLabel(track)}`;
      }
      if (elements.playerTrackMeta) {
        elements.playerTrackMeta.innerHTML = "";
        if (track.username) {
          elements.playerTrackMeta.appendChild(createUserLinkNode(track.username, "user-link compact-link"));
          const sep = document.createElement("span");
          sep.textContent = " • ";
          elements.playerTrackMeta.appendChild(sep);
        }
        const genre = document.createElement("span");
        genre.textContent = track.genre || t("unknownGenre");
        elements.playerTrackMeta.appendChild(genre);
      }
    }

    function clearGlobalPlayerInfo() {
      if (!elements.globalPlayer) {
        return;
      }

      if (elements.playerTrackCover) {
        setImageWithFallback(elements.playerTrackCover, null);
      }
      elements.playerTrackTitle.textContent = t("playerNoTrack");
      if (elements.playerTrackAuthors) {
        elements.playerTrackAuthors.textContent = t("playerAuthorsFallback");
      }
      if (elements.playerTrackMeta) {
        elements.playerTrackMeta.textContent = t("playerHint");
      }
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

    function closeGlobalPlayer() {
      if (!elements.globalPlayer || !elements.globalPlayerAudio) {
        return;
      }

      elements.globalPlayerAudio.pause();
      elements.globalPlayerAudio.currentTime = 0;
      elements.globalPlayerAudio.removeAttribute("src");
      elements.globalPlayerAudio.load();

      state.player.queue = [];
      state.player.currentIndex = -1;
      state.player.activeTrackId = null;
      state.player.currentSource = "feed";
      state.player.isExpanded = false;
      resetPlaybackMilestones();

      elements.globalPlayer.classList.remove("visible");
      elements.globalPlayer.classList.add("hidden");
      syncPlayerExpandedUi();
      clearGlobalPlayerInfo();
      updateTrackPlayButtons();
      updateGlobalPlayerButtons();
    }

    function getQueueFromCard(card, trackId) {
      const fallback = state.tracks.map((track) => track.id);
      if (!card) {
        return fallback;
      }

      const container = card.parentElement;
      if (!container) {
        return fallback;
      }

      const ids = Array.from(container.querySelectorAll(".track-card[data-track-id], .playlist-item[data-track-id]"))
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
      const availableIds = new Set(state.tracks.map((track) => track.id));
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

    async function startTrackPlayback(trackId, queue, card, source = null) {
      const fallbackQueue = queue && queue.length > 0 ? queue : getQueueFromCard(card, trackId);
      setPlaybackQueue(fallbackQueue, trackId);
      state.player.currentSource = source || card?.dataset.playSource || "feed";
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
      const source = state.player.currentSource || "unknown";

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
            if (milestone === 25 && state.user) {
              refreshListenHistory()
                .then(() => renderListenHistory())
                .catch(() => {});
            }
            if (milestone === 50 && state.user) {
              refreshAuthorAnalytics()
                .then(() => renderAuthorAnalytics())
                .catch(() => {});
            }
          })
          .catch(() => {
            // ignore listen-reporting errors
          });
      }
    }

    function buildAudioPlayer(track, source = "feed") {
      const wrap = document.createElement("div");
      wrap.className = "audio-player";
      wrap.dataset.playSource = source;

      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "ghost";
      playButton.dataset.trackPlayButton = "1";
      playButton.dataset.trackId = track.id;
      playButton.textContent = t("btnListen");

      playButton.addEventListener("click", async () => {
        const currentTrackId = getCurrentTrackId();
        const isCurrentPlaying = currentTrackId === track.id && elements.globalPlayerAudio && !elements.globalPlayerAudio.paused;

        if (isCurrentPlaying) {
          pauseCurrentTrack();
          return;
        }

        await startTrackPlayback(track.id, null, playButton.closest(".track-card, .playlist-item"), source);
      });

      wrap.append(playButton);
      return wrap;
    }

    function reconcilePlayerQueue() {
      const availableIds = new Set(state.tracks.map((track) => track.id));
      state.player.queue = state.player.queue.filter((id) => availableIds.has(id));

      if (state.player.queue.length === 0) {
        state.player.currentIndex = -1;
        state.player.activeTrackId = null;
        state.player.currentSource = "feed";
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


    return {
      initAudioEngine,
      resumeAudioEngine,
      applyVolumeToGlobalPlayer,
      reportTrackListen,
      createEmptyMilestoneState,
      resetPlaybackMilestones,
      updateTrackListenCounters,
      getTrackById,
      getCurrentTrackId,
      updateSeekUi,
      previewSeekFromSlider,
      commitSeekFromSlider,
      updateTrackPlayButtons,
      updateGlobalPlayerButtons,
      showGlobalPlayer,
      clearGlobalPlayerInfo,
      closeGlobalPlayer,
      getQueueFromCard,
      setPlaybackQueue,
      setCurrentTrack,
      playCurrentTrack,
      pauseCurrentTrack,
      stopCurrentTrack,
      pickNextIndex,
      pickPreviousIndex,
      playNextTrack,
      playPreviousTrack,
      startTrackPlayback,
      reportListenMilestonesIfNeeded,
      buildAudioPlayer,
      reconcilePlayerQueue,
      syncPlayerExpandedUi,
      setPlayerExpanded,
      togglePlayerExpanded
    };
  }

  window.SferaPlayerCore = { createAppPlayerCore };
})();
