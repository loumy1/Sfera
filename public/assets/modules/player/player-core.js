(() => {
  "use strict";

  function createAppPlayerCore(ctx) {
    const { state, elements, audioEngine, constants = {}, deps = {} } = ctx || {};
    const KARAOKE_MODE_STORAGE_KEY = "sfera_karaoke_enabled_v1";
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
      buildTrackHref,
      setStatus,
      renderCommentNode,
      createComment,
      toggleTrackReaction,
      toggleTrackRepost,
      toggleFollow,
      ensureAuthenticatedAction,
      refreshListenHistory,
      renderListenHistory,
      refreshAuthorAnalytics,
      renderAuthorAnalytics
    } = deps;
    const playerOverlayState = {
      cleanupLyricsSync: null,
      renderedLyricsSegments: []
    };

    function loadKaraokeEnabled() {
      try {
        const raw = String(window.localStorage.getItem(KARAOKE_MODE_STORAGE_KEY) || "").trim().toLowerCase();
        if (raw === "0" || raw === "false" || raw === "off") return false;
        if (raw === "1" || raw === "true" || raw === "on") return true;
      } catch {
        // ignore
      }
      return true;
    }

    function saveKaraokeEnabled(value) {
      try {
        window.localStorage.setItem(KARAOKE_MODE_STORAGE_KEY, value ? "1" : "0");
      } catch {
        // ignore
      }
    }

    function ensurePlayerOverlayState() {
      if (!state.player || typeof state.player !== "object") {
        state.player = {};
      }
      if (typeof state.player.isExpanded !== "boolean") {
        state.player.isExpanded = false;
      }
      if (typeof state.player.lyricsHidden !== "boolean") {
        state.player.lyricsHidden = false;
      }
      if (typeof state.player.karaokeEnabled !== "boolean") {
        state.player.karaokeEnabled = loadKaraokeEnabled();
      }
      if (!Array.isArray(state.player.shuffleHistory)) {
        state.player.shuffleHistory = [];
      }
      if (!Number.isInteger(state.player.shuffleCursor)) {
        state.player.shuffleCursor = -1;
      }
      if (!Array.isArray(state.player.shuffleRemaining)) {
        state.player.shuffleRemaining = [];
      }
    }

    ensurePlayerOverlayState();

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

    function clearPlayerOverlayLyricsSync() {
      if (typeof playerOverlayState.cleanupLyricsSync === "function") {
        playerOverlayState.cleanupLyricsSync();
      }
      playerOverlayState.cleanupLyricsSync = null;
      playerOverlayState.renderedLyricsSegments = [];
    }

    function getCurrentTrack() {
      const trackId = getCurrentTrackId();
      return trackId ? getTrackById(trackId) : null;
    }

    function clearShufflePlaybackState() {
      state.player.shuffleHistory = [];
      state.player.shuffleCursor = -1;
      state.player.shuffleRemaining = [];
    }

    function resetShufflePlaybackState(trackId = getCurrentTrackId()) {
      const queue = Array.isArray(state.player.queue) ? state.player.queue.filter(Boolean) : [];
      if (queue.length === 0) {
        clearShufflePlaybackState();
        return;
      }

      const currentTrackId = queue.includes(trackId) ? trackId : queue[0];
      state.player.shuffleHistory = currentTrackId ? [currentTrackId] : [];
      state.player.shuffleCursor = currentTrackId ? 0 : -1;
      state.player.shuffleRemaining = queue.filter((id) => id !== currentTrackId);
    }

    function syncShufflePlaybackState() {
      const queue = Array.isArray(state.player.queue) ? state.player.queue.filter(Boolean) : [];
      if (queue.length === 0) {
        clearShufflePlaybackState();
        return;
      }

      const queueSet = new Set(queue);
      state.player.shuffleHistory = state.player.shuffleHistory.filter((id) => queueSet.has(id));
      if (state.player.shuffleCursor >= state.player.shuffleHistory.length) {
        state.player.shuffleCursor = state.player.shuffleHistory.length - 1;
      }

      const currentTrackId = getCurrentTrackId();
      if (!currentTrackId || !queueSet.has(currentTrackId)) {
        clearShufflePlaybackState();
        return;
      }

      const currentAtCursor = state.player.shuffleHistory[state.player.shuffleCursor] || null;
      if (currentAtCursor !== currentTrackId) {
        const existingIndex = state.player.shuffleHistory.lastIndexOf(currentTrackId);
        if (existingIndex >= 0) {
          state.player.shuffleHistory = state.player.shuffleHistory.slice(0, existingIndex + 1);
          state.player.shuffleCursor = existingIndex;
        } else {
          const safeCursor = Math.max(-1, state.player.shuffleCursor);
          const baseHistory = state.player.shuffleHistory.slice(0, safeCursor + 1);
          baseHistory.push(currentTrackId);
          state.player.shuffleHistory = baseHistory;
          state.player.shuffleCursor = baseHistory.length - 1;
        }
      }

      const playedSet = new Set(state.player.shuffleHistory);
      state.player.shuffleRemaining = state.player.shuffleRemaining.filter((id) => queueSet.has(id) && !playedSet.has(id));
      const trackedSet = new Set([...state.player.shuffleHistory, ...state.player.shuffleRemaining]);
      for (const id of queue) {
        if (!trackedSet.has(id)) {
          state.player.shuffleRemaining.push(id);
        }
      }
      state.player.shuffleRemaining = state.player.shuffleRemaining.filter((id) => id !== currentTrackId);
    }

    function refillShuffleRemaining() {
      const currentTrackId = getCurrentTrackId();
      const queue = Array.isArray(state.player.queue) ? state.player.queue.filter(Boolean) : [];
      state.player.shuffleRemaining = queue.filter((id) => id && id !== currentTrackId);
    }

    function normalizeTrackLyrics(track) {
      const lyrics = track && track.lyrics && typeof track.lyrics === "object" ? track.lyrics : {};
      const genius = track && track.genius && typeof track.genius === "object" ? track.genius : null;

      const buildAutoWords = (text, startMs, endMs) => {
        const cleanText = String(text || "").trim();
        const safeStart = Number(startMs);
        const safeEnd = Number(endMs);
        if (!cleanText || !Number.isFinite(safeStart) || !Number.isFinite(safeEnd) || safeEnd <= safeStart) {
          return [];
        }
        const tokens = cleanText.split(/\s+/).map((token) => String(token || "").trim()).filter(Boolean);
        if (tokens.length === 0) {
          return [];
        }
        const totalDuration = safeEnd - safeStart;
        const weights = tokens.map((token) => Math.max(2, token.replace(/[^\p{L}\p{N}]+/gu, "").length || token.length || 1));
        const totalWeight = weights.reduce((sum, value) => sum + value, 0) || tokens.length;
        let cursor = safeStart;
        return tokens.map((token, index) => {
          const isLast = index === tokens.length - 1;
          const slice = totalDuration * (weights[index] / totalWeight);
          const wordStartMs = cursor;
          const wordEndMs = isLast
            ? safeEnd
            : Math.max(wordStartMs + 40, Math.min(safeEnd, Math.round(cursor + slice)));
          cursor = wordEndMs;
          return {
            text: token,
            startMs: wordStartMs,
            endMs: wordEndMs
          };
        }).filter((word) => word.text && word.endMs > word.startMs);
      };

      const segments = Array.isArray(lyrics.segments)
        ? lyrics.segments
          .map((segment) => {
            const startMs = Number(segment?.startMs);
            const endMs = Number(segment?.endMs);
            let words = Array.isArray(segment?.words)
              ? segment.words
                .map((word) => ({
                  text: String(word?.text || "").trim(),
                  startMs: Number(word?.startMs),
                  endMs: Number(word?.endMs)
                }))
                .filter((word) => word.text && Number.isFinite(word.startMs) && Number.isFinite(word.endMs) && word.endMs > word.startMs)
              : [];
            const text = String(segment?.text || "").trim() || (words.length > 0 ? words.map((word) => word.text).join(" ") : "");
            if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
              return null;
            }
            if (words.length === 0) {
              words = buildAutoWords(text, startMs, endMs);
            }
            return {
              text,
              startMs,
              endMs,
              words
            };
          })
          .filter(Boolean)
        : [];

      return {
        plain: String(lyrics.plain || "").trim(),
        syncText: String(lyrics.syncText || "").trim(),
        segments,
        hasWordTimings: segments.some((segment) => segment.words.length > 0),
        genius: genius && (genius.url || genius.title || genius.artist)
          ? {
              songId: String(genius.songId || "").trim(),
              url: String(genius.url || "").trim(),
              title: String(genius.title || "").trim(),
              artist: String(genius.artist || "").trim(),
              imageUrl: String(genius.imageUrl || "").trim()
            }
          : null
      };
    }

    function bindPlayerOverlayLyricsToAudio(audio, viewer, renderedSegments) {
      clearPlayerOverlayLyricsSync();
      if (!audio || !Array.isArray(renderedSegments) || renderedSegments.length === 0) {
        return;
      }

      playerOverlayState.renderedLyricsSegments = renderedSegments;
      let rafId = 0;

      const getWordProgress = (word, currentMs) => {
        const startMs = Number(word?.startMs);
        const endMs = Number(word?.endMs);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          return 0;
        }
        if (currentMs < startMs) {
          return 0;
        }
        if (currentMs >= endMs) {
          return 1;
        }
        const ratio = (currentMs - startMs) / (endMs - startMs);
        return Math.max(0, Math.min(1, ratio));
      };

      const update = () => {
        const currentMs = Math.max(0, Math.round(Number(audio.currentTime || 0) * 1000));
        let activeIndex = -1;
        let nextIndex = -1;
        let endingIndex = -1;
        let finalOutroIndex = -1;

        for (let index = 0; index < renderedSegments.length; index += 1) {
          const segment = renderedSegments[index];
          if (currentMs >= segment.startMs && currentMs < segment.endMs) {
            activeIndex = index;
            break;
          }
          if (nextIndex === -1 && currentMs < segment.startMs) {
            nextIndex = index;
          }
        }

        const lastIndex = renderedSegments.length - 1;
        if (activeIndex === lastIndex && lastIndex >= 0) {
          const lastSegment = renderedSegments[lastIndex];
          const segmentDuration = Math.max(1, lastSegment.endMs - lastSegment.startMs);
          const remainingMs = Math.max(0, lastSegment.endMs - currentMs);
          const outroThresholdMs = Math.min(1600, Math.max(650, Math.round(segmentDuration * 0.32)));
          if (remainingMs <= outroThresholdMs) {
            endingIndex = lastIndex;
          }
        }

        let previousIndex = activeIndex > 0 ? activeIndex - 1 : -1;
        const resolvedNextIndex = activeIndex >= 0 ? activeIndex + 1 : nextIndex;

        if (activeIndex === -1 && nextIndex === -1 && renderedSegments.length > 0) {
          previousIndex = -1;
          finalOutroIndex = lastIndex;
        }

        if (viewer) {
          viewer.dataset.mode = finalOutroIndex >= 0
            ? "ended"
            : endingIndex >= 0
              ? "ending"
              : activeIndex >= 0
                ? "playing"
                : nextIndex >= 0
                  ? "waiting"
                  : "ended";
        }

        const karaokeEnabled = state.player.karaokeEnabled !== false;
        for (let index = 0; index < renderedSegments.length; index += 1) {
          const segment = renderedSegments[index];
          const isActive = index === activeIndex;
          const isPrevious = index === previousIndex;
          const isNext = index === resolvedNextIndex;
          const isEnding = index === endingIndex;
          const isFinalOutro = index === finalOutroIndex;
          segment.lineEl.classList.toggle("active", isActive);
          segment.lineEl.classList.toggle("is-previous", isPrevious);
          segment.lineEl.classList.toggle("is-next", isNext);
          segment.lineEl.classList.toggle("is-ending", isEnding);
          segment.lineEl.classList.toggle("is-final-outro", isFinalOutro);
          segment.lineEl.classList.toggle("is-visible", isActive || isPrevious || isNext || isFinalOutro);

          if (isActive && karaokeEnabled) {
            for (let wordIndex = 0; wordIndex < segment.wordEls.length; wordIndex += 1) {
              const word = segment.words[wordIndex];
              const progress = getWordProgress(word, currentMs);
              const isCurrentWord = progress > 0 && progress < 1;
              const isSungWord = progress >= 1;
              const wordEl = segment.wordEls[wordIndex];
              wordEl.style.setProperty("--karaoke-fill", `${Math.round(progress * 100)}%`);
              wordEl.classList.toggle("active", isCurrentWord);
              wordEl.classList.toggle("is-sung", isSungWord);
            }
          } else if (isFinalOutro && karaokeEnabled) {
            for (let wordIndex = 0; wordIndex < segment.wordEls.length; wordIndex += 1) {
              const wordEl = segment.wordEls[wordIndex];
              wordEl.style.setProperty("--karaoke-fill", "100%");
              wordEl.classList.remove("active");
              wordEl.classList.add("is-sung");
            }
          } else {
            for (let wordIndex = 0; wordIndex < segment.wordEls.length; wordIndex += 1) {
              const wordEl = segment.wordEls[wordIndex];
              wordEl.style.setProperty("--karaoke-fill", "0%");
              wordEl.classList.remove("active", "is-sung");
            }
          }
        }
      };

      const stopLoop = () => {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      };

      const tick = () => {
        update();
        if (!audio.paused && !audio.ended) {
          rafId = window.requestAnimationFrame(tick);
        } else {
          rafId = 0;
        }
      };

      const startLoop = () => {
        if (rafId) {
          return;
        }
        rafId = window.requestAnimationFrame(tick);
      };

      const handlePlay = () => {
        update();
        startLoop();
      };

      const handlePause = () => {
        stopLoop();
        update();
      };

      const passiveEvents = ["timeupdate", "seeked", "loadedmetadata"];
      for (const eventName of passiveEvents) {
        audio.addEventListener(eventName, update);
      }
      audio.addEventListener("play", handlePlay);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("ended", handlePause);

      playerOverlayState.cleanupLyricsSync = () => {
        stopLoop();
        for (const eventName of passiveEvents) {
          audio.removeEventListener(eventName, update);
        }
        audio.removeEventListener("play", handlePlay);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("ended", handlePause);
      };

      update();
      if (!audio.paused && !audio.ended) {
        startLoop();
      }
    }

    function buildPlayerLyricsViewer(track) {
      const lyrics = normalizeTrackLyrics(track);
      const viewer = document.createElement("div");
      viewer.className = "player-lyrics-viewer";
      viewer.classList.toggle("karaoke-disabled", !state.player.karaokeEnabled);
      const renderedSegments = [];

      if (Array.isArray(lyrics.segments) && lyrics.segments.length > 0) {
        viewer.classList.add("is-synced");
        for (const segment of lyrics.segments) {
          const line = document.createElement("div");
          line.className = "player-lyrics-line";

          const wordEls = [];
          if (Array.isArray(segment.words) && segment.words.length > 0) {
            segment.words.forEach((word, index) => {
              const span = document.createElement("span");
              span.className = "player-lyrics-word";
              span.textContent = word.text;
              line.appendChild(span);
              wordEls.push(span);
              if (index < segment.words.length - 1) {
                line.appendChild(document.createTextNode(" "));
              }
            });
          } else {
            line.textContent = segment.text;
          }

          viewer.appendChild(line);
          renderedSegments.push({
            startMs: segment.startMs,
            endMs: segment.endMs,
            words: Array.isArray(segment.words) ? segment.words : [],
            lineEl: line,
            wordEls
          });
        }
      } else if (lyrics.plain) {
        const plain = document.createElement("div");
        plain.className = "player-lyrics-plain";
        plain.textContent = lyrics.plain;
        viewer.appendChild(plain);
      } else {
        const empty = document.createElement("p");
        empty.className = "muted player-lyrics-empty";
        empty.textContent = "Текст отсутствует на данный момент.";
        viewer.appendChild(empty);
      }

      return {
        lyrics,
        viewer,
        renderedSegments
      };
    }

    function findTrackOwner(track) {
      if (!track?.userId) {
        return null;
      }
      return state.users.find((user) => user.id === track.userId) || null;
    }

    function isFollowingTrackOwner(track) {
      if (!state.user || !track?.userId || track.userId === state.user.id) {
        return false;
      }
      return Boolean((state.follows?.following || []).some((entry) => entry && entry.id === track.userId));
    }

    function buildQueueTracks() {
      const result = [];
      for (let index = 0; index < state.player.queue.length; index += 1) {
        const trackId = state.player.queue[index];
        const track = getTrackById(trackId);
        if (!track) {
          continue;
        }
        result.push({
          track,
          index,
          isCurrent: index === state.player.currentIndex,
          isNext: index > state.player.currentIndex
        });
      }
      return result;
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
      const playButtonLabel = isPlaying ? t("btnPause") : t("btnListen");
      const playButtonAriaLabel = isPlaying ? "Пауза" : "Воспроизвести";

      elements.playerPlayBtn.disabled = !hasTrack;
      elements.playerPlayBtn.classList.toggle("active", Boolean(hasTrack && isPlaying));
      elements.playerPlayBtn.setAttribute("aria-label", playButtonAriaLabel);
      elements.playerPlayBtn.title = playButtonAriaLabel;
      const playIconName = isPlaying ? "pause" : "play";
      if (window.SferaIconKit?.setButtonIcon) {
        window.SferaIconKit.setButtonIcon(elements.playerPlayBtn, playIconName);
      } else {
        const iconNode = elements.playerPlayBtn.querySelector("[data-icon]");
        if (iconNode) {
          iconNode.setAttribute("data-icon", playIconName);
        }
      }
      elements.playerPlayBtn.dataset.state = isPlaying ? "pause" : "play";
      elements.playerPlayBtn.dataset.label = playButtonLabel;
      elements.playerStopBtn.disabled = !hasTrack;
      elements.playerPrevBtn.disabled = !hasTrack;
      elements.playerNextBtn.disabled = !hasTrack;
      if (elements.playerCloseBtn) {
        elements.playerCloseBtn.disabled = !hasTrack;
      }
      if (elements.playerLyricsBtn) {
        elements.playerLyricsBtn.disabled = !hasTrack;
        elements.playerLyricsBtn.classList.toggle("active", Boolean(hasTrack && state.player.isExpanded));
      }
      elements.playerShuffleBtn.classList.toggle("active", state.player.shuffle);
      elements.playerRepeatAllBtn.classList.toggle("active", state.player.repeatMode === "all");
      elements.playerRepeatOneBtn.classList.toggle("active", state.player.repeatMode === "one");
    }

    function createPlayerOverlayAction(label, onClick, options = {}) {
      const button = document.createElement(options.href ? "a" : "button");
      if (options.href) {
        button.href = options.href;
      } else {
        button.type = "button";
      }
      button.className = `ghost${options.className ? ` ${options.className}` : ""}`.trim();
      button.textContent = label;
      if (options.active) {
        button.classList.add("active");
      }
      if (options.disabled) {
        button.disabled = true;
      }
      if (typeof onClick === "function") {
        button.addEventListener("click", onClick);
      }
      return button;
    }

    function buildOverlayCommentSection(track) {
      const section = document.createElement("section");
      section.className = "player-overlay-panel player-comments-panel";

      const head = document.createElement("div");
      head.className = "player-overlay-panel-head";
      const title = document.createElement("h3");
      title.textContent = `Комментарии (${Number(track.commentsCount || 0)})`;
      head.appendChild(title);
      section.appendChild(head);

      if (state.user) {
        const form = document.createElement("form");
        form.className = "player-comment-form";
        const input = document.createElement("input");
        input.type = "text";
        input.maxLength = 400;
        input.placeholder = "Напиши комментарий...";
        input.required = true;
        const submit = document.createElement("button");
        submit.type = "submit";
        submit.textContent = "Отправить";
        form.append(input, submit);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          const text = String(input.value || "").trim();
          if (!text) {
            return;
          }
          await createComment(track.id, text);
        });
        section.appendChild(form);
      } else {
        const guestHint = document.createElement("p");
        guestHint.className = "muted";
        guestHint.textContent = "Войди в аккаунт, чтобы оставить комментарий.";
        section.appendChild(guestHint);
      }

      const list = document.createElement("div");
      list.className = "player-comments-list";
      const comments = Array.isArray(track.comments) ? track.comments : [];
      if (comments.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Пока комментариев нет.";
        list.appendChild(empty);
      } else {
        for (const comment of comments) {
          if (typeof renderCommentNode === "function") {
            list.appendChild(renderCommentNode(comment, track.id));
          }
        }
      }
      section.appendChild(list);
      return section;
    }

    function buildOverlayQueueSection() {
      const section = document.createElement("section");
      section.className = "player-overlay-panel player-queue-panel";
      const head = document.createElement("div");
      head.className = "player-overlay-panel-head";
      const title = document.createElement("h3");
      title.textContent = "Очередь";
      const meta = document.createElement("span");
      meta.className = "muted";
      meta.textContent = `${Math.max(0, state.player.queue.length)} треков`;
      head.append(title, meta);
      section.appendChild(head);

      const list = document.createElement("div");
      list.className = "player-queue-list";
      const queueEntries = buildQueueTracks();
      if (queueEntries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Очередь пока пуста.";
        list.appendChild(empty);
      } else {
        for (const entry of queueEntries) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = `player-queue-item${entry.isCurrent ? " active" : ""}`;
          item.addEventListener("click", async () => {
            state.player.currentIndex = entry.index;
            if (state.player.shuffle) {
              syncShufflePlaybackState();
            }
            await playCurrentTrack();
          });

          const cover = document.createElement("img");
          cover.className = "player-queue-cover";
          cover.alt = entry.track.title || "Трек";
          setImageWithFallback(cover, entry.track.coverUrl);

          const textWrap = document.createElement("div");
          textWrap.className = "player-queue-text";
          const itemTitle = document.createElement("strong");
          itemTitle.className = "track-title-heading";
          appendTrackTitleWithExplicit(itemTitle, entry.track, "Трек", { compact: true });
          const itemMeta = document.createElement("span");
          itemMeta.className = "muted";
          const prefix = entry.isCurrent ? "Сейчас" : entry.isNext ? "Далее" : "В очереди";
          itemMeta.textContent = `${prefix} • @${entry.track.username}${entry.track.durationSec ? ` • ${formatDuration(entry.track.durationSec)}` : ""}`;
          textWrap.append(itemTitle, itemMeta);

          item.append(cover, textWrap);
          list.appendChild(item);
        }
      }

      section.appendChild(list);
      return section;
    }

    function createTrackExplicitBadgeNode({ compact = false } = {}) {
      const badge = document.createElement("span");
      const tooltip = t("trackExplicitTooltip");
      badge.className = `track-explicit-badge${compact ? " is-compact" : ""}`;
      badge.textContent = "E";
      badge.setAttribute("aria-label", tooltip);
      badge.setAttribute("data-tooltip", tooltip);
      badge.tabIndex = 0;
      return badge;
    }

    function appendTrackTitleWithExplicit(target, track, fallback = "Трек", { compact = false } = {}) {
      if (!target) {
        return;
      }
      target.textContent = "";
      const text = document.createElement("span");
      text.className = "track-title-text";
      text.textContent = track?.title || fallback;
      target.appendChild(text);
      if (track?.isExplicit) {
        target.appendChild(createTrackExplicitBadgeNode({ compact }));
      }
    }

    function renderExpandedPlayerContent() {
      if (!elements.playerExpandedContent) {
        return;
      }

      ensurePlayerOverlayState();
      const track = getCurrentTrack();
      if (!track) {
        clearPlayerOverlayLyricsSync();
        elements.playerExpandedContent.replaceChildren();
        elements.playerExpandedContent.classList.add("hidden");
        return;
      }

      elements.playerExpandedContent.classList.toggle("hidden", !state.player.isExpanded);
      if (!state.player.isExpanded) {
        clearPlayerOverlayLyricsSync();
        return;
      }

      const owner = findTrackOwner(track);
      const overlayLyrics = normalizeTrackLyrics(track);
      const hasSyncedLyrics = Array.isArray(overlayLyrics.segments) && overlayLyrics.segments.length > 0;
      const isFollowing = isFollowingTrackOwner(track);
      const isPlaying = Boolean(elements.globalPlayerAudio && !elements.globalPlayerAudio.paused);
      const href = typeof buildTrackHref === "function" ? buildTrackHref(track) : "#";
      const runAuthenticatedAction = (action) => async () => {
        if (!ensureAuthenticatedAction()) {
          return;
        }
        await action();
      };
      const wrapper = document.createElement("div");
      wrapper.className = "player-overlay-layout";

      const main = document.createElement("div");
      main.className = "player-overlay-main";

      const hero = document.createElement("section");
      hero.className = "player-overlay-panel player-overlay-hero";
      if (track.coverUrl) {
        hero.style.setProperty("--player-overlay-hero-image", `url('${String(track.coverUrl).replace(/'/g, "%27")}')`);
      }

      const heroTop = document.createElement("div");
      heroTop.className = "player-overlay-hero-top";

      const heroCover = document.createElement("img");
      heroCover.className = "player-overlay-cover";
      heroCover.alt = track.title || "Обложка";
      setImageWithFallback(heroCover, track.coverUrl);

      const heroInfo = document.createElement("div");
      heroInfo.className = "player-overlay-info";
      const heroKicker = document.createElement("span");
      heroKicker.className = "player-overlay-kicker";
      heroKicker.textContent = "режим прослушивания";
      const heroTitle = document.createElement("h2");
      heroTitle.className = "track-title-heading";
      appendTrackTitleWithExplicit(heroTitle, track, "Трек");
      const heroAuthors = document.createElement("p");
      heroAuthors.className = "player-overlay-authors";
      heroAuthors.textContent = getTrackAuthorsLabel(track);
      const heroMeta = document.createElement("div");
      heroMeta.className = "player-overlay-meta";
      if (track.username) {
        heroMeta.appendChild(createUserLinkNode(track.username, "user-link compact-link"));
      }
      const metaParts = [
        track.genre || t("unknownGenre"),
        track.durationSec ? formatDuration(track.durationSec) : "",
        `👍 ${Number(track.likesCount || 0)}`,
        `💬 ${Number(track.commentsCount || 0)}`,
        `🔁 ${Number(track.repostsCount || 0)}`
      ].filter(Boolean);
      for (const part of metaParts) {
        const chip = document.createElement("span");
        chip.className = "player-overlay-chip";
        chip.textContent = part;
        heroMeta.appendChild(chip);
      }
      heroInfo.append(heroKicker, heroTitle, heroAuthors, heroMeta);
      heroTop.append(heroCover, heroInfo);

      const transportRow = document.createElement("div");
      transportRow.className = "player-overlay-transport";

      const transportMeta = document.createElement("div");
      transportMeta.className = "player-overlay-transport-meta";
      const transportLabel = document.createElement("span");
      transportLabel.className = "player-overlay-transport-label";
      transportLabel.textContent = "сейчас играет";
      const transportPosition = document.createElement("strong");
      transportPosition.className = "player-overlay-transport-position";
      transportPosition.textContent = state.player.queue.length > 0
        ? `${state.player.currentIndex + 1} из ${state.player.queue.length} в очереди`
        : "Одиночное воспроизведение";
      transportMeta.append(transportLabel, transportPosition);

      const transportControls = document.createElement("div");
      transportControls.className = "player-overlay-transport-controls";
      transportControls.append(
        createPlayerOverlayAction("Назад", () => {
          playPreviousTrack();
        }, { className: "player-overlay-transport-btn" }),
        createPlayerOverlayAction(isPlaying ? "Пауза" : "Слушать", () => {
          if (isPlaying) {
            pauseCurrentTrack();
          } else {
            playCurrentTrack();
          }
        }, {
          className: "player-overlay-transport-btn is-primary",
          active: isPlaying
        }),
        createPlayerOverlayAction("Дальше", () => {
          playNextTrack();
        }, { className: "player-overlay-transport-btn" })
      );
      transportRow.append(transportMeta, transportControls);

      const actionRow = document.createElement("div");
      actionRow.className = "player-overlay-actions";
      actionRow.append(
        createPlayerOverlayAction(`👍 ${Number(track.likesCount || 0)}`, runAuthenticatedAction(() => toggleTrackReaction(track.id, "like")), {
          active: Boolean(track.liked)
        }),
        createPlayerOverlayAction(`👎 ${Number(track.dislikesCount || 0)}`, runAuthenticatedAction(() => toggleTrackReaction(track.id, "dislike")), {
          active: Boolean(track.disliked)
        }),
        createPlayerOverlayAction(`🔁 ${Number(track.repostsCount || 0)}`, runAuthenticatedAction(() => toggleTrackRepost(track.id)), {
          active: Boolean(track.reposted)
        }),
        createPlayerOverlayAction("Открыть страницу", (event) => {
          event.preventDefault();
          window.location.assign(href);
        }, { href })
      );

      if (track.userId && (!state.user || track.userId !== state.user.id)) {
        actionRow.appendChild(createPlayerOverlayAction(
          isFollowing ? "Отписаться" : "Подписаться",
          runAuthenticatedAction(() => toggleFollow(track.userId)),
          { active: isFollowing }
        ));
      }

      actionRow.appendChild(createPlayerOverlayAction(
        state.player.lyricsHidden ? "Показать текст" : "Скрыть текст",
        () => {
          state.player.lyricsHidden = !state.player.lyricsHidden;
          renderExpandedPlayerContent();
        }
      ));

      if (hasSyncedLyrics) {
        actionRow.appendChild(createPlayerOverlayAction(
          state.player.karaokeEnabled ? "Караоке: вкл" : "Караоке: выкл",
          () => {
            state.player.karaokeEnabled = !state.player.karaokeEnabled;
            saveKaraokeEnabled(state.player.karaokeEnabled);
            renderExpandedPlayerContent();
          },
          { active: state.player.karaokeEnabled }
        ));
      }

      actionRow.appendChild(createPlayerOverlayAction("Свернуть плеер", () => {
        setPlayerExpanded(false);
      }));

      hero.append(heroTop, transportRow, actionRow);
      if (owner?.bio) {
        const heroBio = document.createElement("p");
        heroBio.className = "player-overlay-bio muted";
        heroBio.textContent = owner.bio;
        hero.appendChild(heroBio);
      }
      main.appendChild(hero);

      const lyricsSection = document.createElement("section");
      lyricsSection.className = "player-overlay-panel player-lyrics-panel";
      const lyricsHead = document.createElement("div");
      lyricsHead.className = "player-overlay-panel-head";
      const lyricsTitle = document.createElement("h3");
      lyricsTitle.textContent = "Текст трека";
      lyricsHead.appendChild(lyricsTitle);

      const lyricsState = document.createElement("span");
      lyricsState.className = "muted";

      if (state.player.lyricsHidden) {
        lyricsState.textContent = "Текст скрыт";
        lyricsHead.appendChild(lyricsState);
        const hiddenNote = document.createElement("p");
        hiddenNote.className = "muted";
        hiddenNote.textContent = "Текст скрыт. Нажми «Показать текст», чтобы вернуть синхронизацию.";
        lyricsSection.append(lyricsHead, hiddenNote);
        clearPlayerOverlayLyricsSync();
      } else {
        const { lyrics, viewer, renderedSegments } = buildPlayerLyricsViewer(track);
        if (renderedSegments.length > 0) {
          lyricsSection.classList.add("is-synced-lyrics");
          lyricsState.textContent = lyrics.hasWordTimings ? "word sync" : "line sync";
          bindPlayerOverlayLyricsToAudio(elements.globalPlayerAudio, viewer, renderedSegments);
        } else {
          clearPlayerOverlayLyricsSync();
          lyricsState.textContent = lyrics.plain ? "Обычный текст" : "Текст отсутствует";
        }
        lyricsHead.appendChild(lyricsState);

        if (lyrics.genius?.url) {
          const geniusLink = document.createElement("a");
          geniusLink.className = "user-link compact-link";
          geniusLink.href = lyrics.genius.url;
          geniusLink.target = "_blank";
          geniusLink.rel = "noopener noreferrer";
          geniusLink.textContent = "Genius";
          lyricsHead.appendChild(geniusLink);
        }

        lyricsSection.append(lyricsHead, viewer);
      }
      main.appendChild(lyricsSection);

      const side = document.createElement("div");
      side.className = "player-overlay-side";
      side.append(buildOverlayQueueSection(), buildOverlayCommentSection(track));

      wrapper.append(main, side);
      elements.playerExpandedContent.replaceChildren(wrapper);
    }

    function syncPlayerExpandedUi() {
      if (!elements.globalPlayer || !elements.playerExpandBtn) {
        return;
      }
      const isExpanded = Boolean(state.player?.isExpanded);
      elements.globalPlayer.classList.toggle("is-mini", !isExpanded);
      document.body.classList.toggle("player-overlay-open", isExpanded);
      elements.playerExpandBtn.textContent = isExpanded ? "▴" : "▾";
      const label = isExpanded ? t("playerCollapse") : t("playerExpand");
      elements.playerExpandBtn.setAttribute("aria-label", label);
      elements.playerExpandBtn.title = label;
      renderExpandedPlayerContent();
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

    function openLyricsOverlay() {
      if (!getCurrentTrackId()) {
        return;
      }
      state.player.lyricsHidden = false;
      setPlayerExpanded(true);
    }

    function showGlobalPlayer(track) {
      if (!elements.globalPlayer || !track) {
        return;
      }

      elements.globalPlayer.classList.remove("hidden");
      elements.globalPlayer.classList.add("visible");
      syncPlayerExpandedUi();
      if (track.coverUrl) {
        elements.globalPlayer.style.setProperty("--player-backdrop-image", `url('${String(track.coverUrl).replace(/'/g, "%27")}')`);
      } else {
        elements.globalPlayer.style.removeProperty("--player-backdrop-image");
      }
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
      renderExpandedPlayerContent();
    }

    function clearGlobalPlayerInfo() {
      if (!elements.globalPlayer) {
        return;
      }

      if (elements.playerTrackCover) {
        setImageWithFallback(elements.playerTrackCover, null);
      }
      elements.globalPlayer.style.removeProperty("--player-backdrop-image");
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
      clearPlayerOverlayLyricsSync();
      if (elements.playerExpandedContent) {
        elements.playerExpandedContent.replaceChildren();
        elements.playerExpandedContent.classList.add("hidden");
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
      clearShufflePlaybackState();
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

    function isBeatQueueTrack(track) {
      return String(track?.kind || "").trim().toLowerCase() === "beat";
    }

    function buildStateBackedQueue(source, trackId, fallbackQueue) {
      const sourceKey = String(source || "").trim().toLowerCase();
      const fallback = Array.isArray(fallbackQueue) && fallbackQueue.length > 0
        ? fallbackQueue
        : state.tracks.map((track) => track.id);

      if (!state.user) {
        return fallback;
      }

      if (sourceKey === "liked" || sourceKey === "liked-feed" || sourceKey === "profile-likes") {
        return state.tracks.filter((track) => track.liked).map((track) => track.id);
      }

      if (sourceKey === "profile-tracks") {
        return state.tracks
          .filter((track) => track.userId === state.user.id && !isBeatQueueTrack(track))
          .map((track) => track.id);
      }

      if (sourceKey === "profile-beats") {
        return state.tracks
          .filter((track) => track.userId === state.user.id && isBeatQueueTrack(track))
          .map((track) => track.id);
      }

      if (sourceKey === "profile-reposts") {
        const repostSet = new Set(Array.isArray(state.user.reposts) ? state.user.reposts : []);
        return state.tracks.filter((track) => repostSet.has(track.id)).map((track) => track.id);
      }

      return fallback;
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
      resetShufflePlaybackState(normalizedQueue[state.player.currentIndex] || null);
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
        syncShufflePlaybackState();
        if (total === 1) {
          return state.player.repeatMode === "all" ? state.player.currentIndex : -1;
        }

        const historyForwardTrackId = state.player.shuffleHistory[state.player.shuffleCursor + 1];
        if (historyForwardTrackId) {
          state.player.shuffleCursor += 1;
          return state.player.queue.indexOf(historyForwardTrackId);
        }

        if (state.player.shuffleRemaining.length === 0 && state.player.repeatMode === "all") {
          refillShuffleRemaining();
        }

        if (state.player.shuffleRemaining.length === 0) {
          return -1;
        }

        const randomRemainingIndex = Math.floor(Math.random() * state.player.shuffleRemaining.length);
        const [nextTrackId] = state.player.shuffleRemaining.splice(randomRemainingIndex, 1);
        if (!nextTrackId) {
          return -1;
        }

        const baseHistory = state.player.shuffleHistory.slice(0, Math.max(0, state.player.shuffleCursor + 1));
        baseHistory.push(nextTrackId);
        state.player.shuffleHistory = baseHistory;
        state.player.shuffleCursor = baseHistory.length - 1;
        return state.player.queue.indexOf(nextTrackId);
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
        syncShufflePlaybackState();
        if (state.player.shuffleCursor > 0) {
          state.player.shuffleCursor -= 1;
          return state.player.queue.indexOf(state.player.shuffleHistory[state.player.shuffleCursor]);
        }
        return -1;
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
      const sourceKey = source || card?.dataset.playSource || "feed";
      const fallbackQueue = queue && queue.length > 0 ? queue : getQueueFromCard(card, trackId);
      const resolvedQueue = buildStateBackedQueue(sourceKey, trackId, fallbackQueue);
      setPlaybackQueue(resolvedQueue, trackId);
      state.player.currentSource = sourceKey;
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
        resetShufflePlaybackState(state.player.queue[0] || null);
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
      clearShufflePlaybackState,
      resetShufflePlaybackState,
      syncShufflePlaybackState,
      syncPlayerExpandedUi,
      setPlayerExpanded,
      togglePlayerExpanded,
      openLyricsOverlay,
      renderExpandedPlayerContent
    };
  }

  window.SferaPlayerCore = { createAppPlayerCore };
})();
