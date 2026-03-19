(() => {
  "use strict";

  const root = document.getElementById("itemPageRoot");
  const statusEl = document.getElementById("itemPageStatus");
  const brandBetaEl = document.querySelector("header .brand-wrap > .brand-beta");
  const UI_LANGUAGE_STORAGE_KEY = "sfera_ui_language_v1";
  const LEGACY_UI_LANGUAGE_STORAGE_KEY = "trapdom_ui_language_v1";
  const KARAOKE_MODE_STORAGE_KEY = "sfera_karaoke_enabled_v1";
  const BRAND_BETA_I18N = {
    ru: "бета-тест",
    en: "beta-test",
    zh: "测试版",
    uk: "бета-тест"
  };
  let statusFadeTimer = null;
  let statusClearTimer = null;
  let statusSeq = 0;

  const pageState = {
    pathInfo: null,
    currentUser: null,
    track: null,
    album: null,
    loading: false,
    karaokeEnabled: true
  };
  const lyricsSyncState = {
    cleanup: null,
    renderedSegments: []
  };
  const tapSyncEditorState = {
    cleanup: null
  };
  let activeStandaloneAudio = null;

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

  pageState.karaokeEnabled = loadKaraokeEnabled();

  function getStoredUiLanguage() {
    try {
      const value = String(
        window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
          || window.localStorage.getItem(LEGACY_UI_LANGUAGE_STORAGE_KEY)
          || ""
      ).trim().toLowerCase();
      if (value === "en" || value === "zh" || value === "ru" || value === "uk") return value;
    } catch {
      // ignore
    }
    return "ru";
  }

  function applyItemChromeLanguage() {
    const lang = getStoredUiLanguage();
    document.documentElement.lang = lang;
    if (brandBetaEl) {
      brandBetaEl.textContent = BRAND_BETA_I18N[lang] || BRAND_BETA_I18N.ru;
    }
  }

  function setStatus(text, type = "info") {
    if (!statusEl) return;
    statusSeq += 1;
    const seq = statusSeq;
    if (statusFadeTimer) {
      clearTimeout(statusFadeTimer);
      statusFadeTimer = null;
    }
    if (statusClearTimer) {
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }
    statusEl.textContent = text || "";
    statusEl.classList.remove("error", "success", "is-fading");
    if (type === "error") statusEl.classList.add("error");
    if (type === "success") statusEl.classList.add("success");
    if (!text) {
      statusEl.classList.remove("is-visible");
      return;
    }
    statusEl.classList.add("is-visible");
    statusFadeTimer = setTimeout(() => {
      if (seq !== statusSeq) return;
      statusEl.classList.add("is-fading");
    }, 5000);
    statusClearTimer = setTimeout(() => {
      if (seq !== statusSeq) return;
      statusEl.textContent = "";
      statusEl.classList.remove("error", "success", "is-visible", "is-fading");
    }, 5600);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "дата неизвестна";
    }
    const lang = getStoredUiLanguage();
    const locale = lang === "uk" ? "uk-UA" : lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "ru-RU";
    return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  }

  function formatDuration(totalSeconds) {
    const numeric = Number(totalSeconds);
    if (!Number.isFinite(numeric) || numeric < 0) return "0:00";
    const seconds = Math.floor(numeric);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatLyricsTimestamp(totalMs) {
    const numeric = Math.max(0, Math.round(Number(totalMs) || 0));
    const minutes = Math.floor(numeric / 60000);
    const seconds = Math.floor((numeric % 60000) / 1000);
    const centiseconds = Math.floor((numeric % 1000) / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
  }

  function getDefaultCover() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23131b2b'/%3E%3Cstop offset='1' stop-color='%23070b17'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='600' height='600' rx='84' fill='url(%23g)'/%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='.86' stroke-width='22' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M250 163v190.5a57.5 57.5 0 1 1-36-53.3V219l145-37v123.5a57.5 57.5 0 1 1-36-53.3V163Z'/%3E%3C/g%3E%3C/svg%3E";
  }

  function setImage(img, url) {
    img.src = url || getDefaultCover();
    img.addEventListener("error", () => {
      img.src = getDefaultCover();
    }, { once: true });
  }

  function trackSharePath(track) {
    if (track && typeof track.sharePath === "string" && track.sharePath) return track.sharePath;
    const section = String(track?.kind || "").toLowerCase() === "beat" ? "b" : "t";
    return `/item-page.html?section=${section}&id=${encodeURIComponent(String(track?.id || ""))}`;
  }

  function apiErrorMessage(response, payload) {
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
    return `HTTP ${response.status}`;
  }

  async function api(pathname, options = {}) {
    const response = await fetch(pathname, {
      credentials: "same-origin",
      method: options.method || "GET",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json().catch(() => ({})) : null;

    if (!response.ok) {
      const error = new Error(apiErrorMessage(response, payload));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
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

  function createLinkButton(href, text) {
    const link = document.createElement("a");
    link.className = "ghost";
    link.href = href;
    link.textContent = text;
    return link;
  }

  function createTrackExplicitBadge({ compact = false } = {}) {
    const badge = document.createElement("span");
    badge.className = `track-explicit-badge${compact ? " is-compact" : ""}`;
    badge.textContent = "E";
    badge.setAttribute("aria-label", "В треке присутствует нецензурная лексика");
    badge.setAttribute("data-tooltip", "В треке присутствует нецензурная лексика");
    badge.tabIndex = 0;
    return badge;
  }

  function createGhostButton(text, onClick, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ghost${opts.className ? ` ${opts.className}` : ""}`;
    btn.textContent = text;
    if (opts.disabled) btn.disabled = true;
    if (typeof onClick === "function") {
      btn.addEventListener("click", onClick);
    }
    return btn;
  }

  function setStandaloneSliderProgress(slider, ratio) {
    if (!slider) {
      return;
    }
    const normalized = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    slider.style.setProperty("--item-audio-progress-pct", `${Math.round(normalized * 100)}%`);
  }

  function setStandaloneButtonIcon(button, iconName, label = "") {
    if (!button) {
      return;
    }
    if (window.SferaIconKit?.setButtonIcon) {
      window.SferaIconKit.setButtonIcon(button, iconName, {
        label,
        iconClassName: "sf-icon--sm"
      });
      return;
    }
    button.textContent = label || iconName;
  }

  function createStandaloneAudioButton(iconName, ariaLabel, onClick, opts = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `ghost item-page-audio-btn${opts.className ? ` ${opts.className}` : ""}`;
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
    setStandaloneButtonIcon(button, iconName, opts.label || "");
    if (typeof onClick === "function") {
      button.addEventListener("click", onClick);
    }
    return button;
  }

  function buildStandaloneAudioPlayer(audio, options = {}) {
    if (!audio) {
      return document.createElement("div");
    }

    const compact = Boolean(options.compact);
    audio.classList.add("item-page-native-audio");
    audio.controls = false;
    audio.preload = options.preload || audio.preload || "metadata";
    audio.playbackRate = 1;
    audio.defaultPlaybackRate = 1;
    if (!Number.isFinite(Number(audio.volume))) {
      audio.volume = 0.78;
    }
    audio.dataset.lastVolume = String(Math.max(0.1, Number(audio.volume) || 0.78));

    const wrap = document.createElement("div");
    wrap.className = `item-page-audio-player${compact ? " compact" : ""}`;

    const hero = document.createElement("div");
    hero.className = "item-page-audio-hero";

    const mainBtn = createStandaloneAudioButton("play", "Воспроизвести", async () => {
      if (audio.paused) {
        if (activeStandaloneAudio && activeStandaloneAudio !== audio) {
          activeStandaloneAudio.pause();
        }
        try {
          await audio.play();
        } catch (error) {
          setStatus(error?.message || "Не удалось запустить аудио", "error");
        }
      } else {
        audio.pause();
      }
    }, { className: " item-page-audio-main-btn" });

    const bars = document.createElement("div");
    bars.className = "item-page-audio-bars";
    for (let index = 0; index < 24; index += 1) {
      const bar = document.createElement("span");
      const baseHeight = 24 + ((index * 17) % 58);
      bar.style.setProperty("--item-audio-bar-height", `${baseHeight}%`);
      bar.style.setProperty("--item-audio-bar-delay", `${(index % 8) * 0.14}s`);
      bars.appendChild(bar);
    }

    const timeInfo = document.createElement("div");
    timeInfo.className = "item-page-audio-times";
    const currentTime = document.createElement("strong");
    currentTime.textContent = "0:00";
    const durationTime = document.createElement("span");
    durationTime.className = "muted";
    durationTime.textContent = "0:00";
    timeInfo.append(currentTime, durationTime);

    hero.append(mainBtn, bars, timeInfo);

    const seekRow = document.createElement("div");
    seekRow.className = "item-page-audio-seek";
    const seekCurrent = document.createElement("span");
    seekCurrent.className = "item-page-audio-timecode";
    seekCurrent.textContent = "0:00";
    const seekSlider = document.createElement("input");
    seekSlider.type = "range";
    seekSlider.min = "0";
    seekSlider.max = "1000";
    seekSlider.step = "1";
    seekSlider.value = "0";
    const seekDuration = document.createElement("span");
    seekDuration.className = "item-page-audio-timecode";
    seekDuration.textContent = "0:00";
    seekRow.append(seekCurrent, seekSlider, seekDuration);

    const controls = document.createElement("div");
    controls.className = "item-page-audio-controls";

    const rewindBtn = createStandaloneAudioButton("rewind", "Назад на 10 секунд", () => {
      audio.currentTime = Math.max(0, Number(audio.currentTime || 0) - 10);
    }, { className: " item-page-audio-side-btn" });

    const forwardBtn = createStandaloneAudioButton("forward", "Вперёд на 10 секунд", () => {
      const duration = Number(audio.duration);
      const nextTime = Number(audio.currentTime || 0) + 10;
      audio.currentTime = Number.isFinite(duration) && duration > 0 ? Math.min(duration, nextTime) : nextTime;
    }, { className: " item-page-audio-side-btn" });

    const volumeWrap = document.createElement("label");
    volumeWrap.className = "item-page-audio-volume";
    const muteBtn = createStandaloneAudioButton("volume", "Выключить звук", () => {
      const currentVolume = Math.max(0, Number(audio.muted ? 0 : audio.volume));
      if (audio.muted || currentVolume <= 0.001) {
        const restoreVolume = Math.max(0.1, Math.min(1, Number(audio.dataset.lastVolume || 0.78)));
        audio.muted = false;
        audio.volume = restoreVolume;
      } else {
        audio.dataset.lastVolume = String(currentVolume);
        audio.muted = true;
      }
      sync();
    }, { className: " item-page-audio-side-btn" });
    const volumeSlider = document.createElement("input");
    volumeSlider.type = "range";
    volumeSlider.min = "0";
    volumeSlider.max = "100";
    volumeSlider.step = "1";
    volumeSlider.value = String(Math.round((Number(audio.volume) || 0.78) * 100));
    const volumeValue = document.createElement("span");
    volumeValue.className = "item-page-audio-volume-value";
    volumeWrap.append(muteBtn, volumeSlider, volumeValue);

    controls.append(rewindBtn, forwardBtn, volumeWrap);

    function sync() {
      const duration = Number(audio.duration);
      const current = Number(audio.currentTime);
      const hasDuration = Number.isFinite(duration) && duration > 0;
      const safeCurrent = Number.isFinite(current) && current > 0 ? current : 0;
      const ratio = hasDuration ? safeCurrent / duration : 0;
      currentTime.textContent = formatDuration(safeCurrent);
      durationTime.textContent = formatDuration(hasDuration ? duration : 0);
      seekCurrent.textContent = formatDuration(safeCurrent);
      seekDuration.textContent = formatDuration(hasDuration ? duration : 0);
      seekSlider.value = String(Math.max(0, Math.min(1000, Math.round(ratio * 1000))));
      setStandaloneSliderProgress(seekSlider, ratio);

      const volume = Math.max(0, Math.min(1, Number(audio.muted ? 0 : audio.volume)));
      volumeSlider.value = String(Math.round(volume * 100));
      volumeValue.textContent = `${Math.round(volume * 100)}%`;
      setStandaloneSliderProgress(volumeSlider, volume);

      const isPlaying = !audio.paused;
      wrap.classList.toggle("is-playing", isPlaying);
      setStandaloneButtonIcon(mainBtn, isPlaying ? "pause" : "play");
      const volumeIcon = volume <= 0.001 ? "mute" : "volume";
      setStandaloneButtonIcon(muteBtn, volumeIcon);
      muteBtn.setAttribute("aria-label", volume <= 0.001 ? "Включить звук" : "Выключить звук");
      muteBtn.title = volume <= 0.001 ? "Включить звук" : "Выключить звук";
    }

    seekSlider.addEventListener("input", () => {
      const duration = Number(audio.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        return;
      }
      const ratio = Number(seekSlider.value) / 1000;
      audio.currentTime = Math.max(0, Math.min(duration, ratio * duration));
    });

    volumeSlider.addEventListener("input", () => {
      const nextVolume = Math.max(0, Math.min(1, Number(volumeSlider.value || 0) / 100));
      audio.volume = nextVolume;
      audio.muted = nextVolume <= 0.001;
      if (nextVolume > 0.001) {
        audio.dataset.lastVolume = String(nextVolume);
      }
      sync();
    });

    audio.addEventListener("play", () => {
      if (activeStandaloneAudio && activeStandaloneAudio !== audio) {
        activeStandaloneAudio.pause();
      }
      activeStandaloneAudio = audio;
      sync();
    });
    audio.addEventListener("pause", () => {
      if (activeStandaloneAudio === audio) {
        activeStandaloneAudio = null;
      }
      sync();
    });
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("durationchange", sync);
    audio.addEventListener("volumechange", sync);
    audio.addEventListener("ended", sync);
    audio.addEventListener("ratechange", () => {
      if (audio.playbackRate !== 1) {
        audio.playbackRate = 1;
      }
      if (audio.defaultPlaybackRate !== 1) {
        audio.defaultPlaybackRate = 1;
      }
    });

    wrap.append(audio, hero, seekRow, controls);
    sync();
    return wrap;
  }

  function clearLyricsSyncBinding() {
    if (typeof lyricsSyncState.cleanup === "function") {
      lyricsSyncState.cleanup();
    }
    lyricsSyncState.cleanup = null;
    lyricsSyncState.renderedSegments = [];
  }

  function clearTapSyncEditorBinding() {
    if (typeof tapSyncEditorState.cleanup === "function") {
      tapSyncEditorState.cleanup();
    }
    tapSyncEditorState.cleanup = null;
  }

  function stripLyricsTimingMarkup(line) {
    return String(line || "")
      .replace(/\[[0-9]{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, "")
      .replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractTapSyncLines(plainText, syncText) {
    const plainLines = String(plainText || "")
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    if (plainLines.length > 0) {
      return plainLines;
    }

    return String(syncText || "")
      .split(/\r?\n/)
      .map(stripLyricsTimingMarkup)
      .filter(Boolean);
  }

  function buildTapSyncText(lines, timestamps) {
    const safeLines = Array.isArray(lines) ? lines : [];
    const safeTimestamps = Array.isArray(timestamps) ? timestamps : [];
    const result = [];

    for (let index = 0; index < safeLines.length && index < safeTimestamps.length; index += 1) {
      const line = String(safeLines[index] || "").trim();
      const timestamp = Number(safeTimestamps[index]);
      if (!line || !Number.isFinite(timestamp) || timestamp < 0) {
        continue;
      }
      result.push(`[${formatLyricsTimestamp(timestamp)}]${line}`);
    }

    return result.join("\n");
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

  function bindLyricsSyncToAudio(audio, renderedSegments) {
    clearLyricsSyncBinding();
    if (!audio || !Array.isArray(renderedSegments) || renderedSegments.length === 0) {
      return;
    }

    lyricsSyncState.renderedSegments = renderedSegments;
    let lastActiveIndex = -1;
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
      let endingIndex = -1;
      let finalOutroIndex = -1;

      for (let index = 0; index < renderedSegments.length; index += 1) {
        const segment = renderedSegments[index];
        if (currentMs >= segment.startMs && currentMs < segment.endMs) {
          activeIndex = index;
          break;
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
      } else if (activeIndex === -1 && lastIndex >= 0 && currentMs >= renderedSegments[lastIndex].endMs) {
        finalOutroIndex = lastIndex;
      }

      const karaokeEnabled = pageState.karaokeEnabled !== false;
      for (let index = 0; index < renderedSegments.length; index += 1) {
        const segment = renderedSegments[index];
        const isActive = index === activeIndex;
        const isEnding = index === endingIndex;
        const isFinalOutro = index === finalOutroIndex;
        segment.lineEl.classList.toggle("active", isActive);
        segment.lineEl.classList.toggle("is-ending", isEnding);
        segment.lineEl.classList.toggle("is-final-outro", isFinalOutro);

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

      if (activeIndex !== lastActiveIndex && activeIndex >= 0) {
        renderedSegments[activeIndex].lineEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      lastActiveIndex = activeIndex;
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

    lyricsSyncState.cleanup = () => {
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

  function buildLyricsViewer(lyrics) {
    const viewer = document.createElement("div");
    viewer.className = "item-page-lyrics-viewer";
    viewer.classList.toggle("karaoke-disabled", !pageState.karaokeEnabled);
    const renderedSegments = [];

    if (Array.isArray(lyrics.segments) && lyrics.segments.length > 0) {
      for (const segment of lyrics.segments) {
        const line = document.createElement("div");
        line.className = "item-page-lyrics-line";

        const wordEls = [];
        if (Array.isArray(segment.words) && segment.words.length > 0) {
          segment.words.forEach((word, index) => {
            const span = document.createElement("span");
            span.className = "item-page-lyrics-word";
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
      plain.className = "item-page-lyrics-plain";
      plain.textContent = lyrics.plain;
      viewer.appendChild(plain);
    } else {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Текст пока не добавлен.";
      viewer.appendChild(empty);
    }

    return { viewer, renderedSegments };
  }

  function buildTrackLyricsEditor(track, lyrics, audio) {
    clearTapSyncEditorBinding();

    const wrapper = document.createElement("div");
    wrapper.className = "item-page-lyrics-editor-wrap";

    const toggle = createGhostButton(
      lyrics.plain || lyrics.syncText || lyrics.genius ? "Редактировать текст и Genius" : "Добавить текст и Genius",
      () => {
        form.classList.toggle("hidden");
      }
    );

    const form = document.createElement("form");
    form.className = "item-page-lyrics-editor hidden";

    const geniusSearchQuery = document.createElement("input");
    geniusSearchQuery.type = "text";
    geniusSearchQuery.value = `${track.username || ""} ${track.title || ""}`.trim();
    geniusSearchQuery.placeholder = "Поиск песни на Genius";

    const geniusUrlInput = document.createElement("input");
    geniusUrlInput.type = "url";
    geniusUrlInput.placeholder = "https://genius.com/...";
    geniusUrlInput.value = lyrics.genius?.url || "";

    const geniusTitleInput = document.createElement("input");
    geniusTitleInput.type = "text";
    geniusTitleInput.maxLength = 200;
    geniusTitleInput.placeholder = "Название на Genius";
    geniusTitleInput.value = lyrics.genius?.title || "";

    const geniusArtistInput = document.createElement("input");
    geniusArtistInput.type = "text";
    geniusArtistInput.maxLength = 200;
    geniusArtistInput.placeholder = "Исполнитель на Genius";
    geniusArtistInput.value = lyrics.genius?.artist || "";

    let selectedGeniusSongId = lyrics.genius?.songId || "";
    let selectedGeniusImageUrl = lyrics.genius?.imageUrl || "";

    const geniusMeta = document.createElement("div");
    geniusMeta.className = "item-page-lyrics-source item-page-lyrics-source-edit";

    const geniusResults = document.createElement("div");
    geniusResults.className = "item-page-lyrics-results";

    const renderGeniusMeta = () => {
      geniusMeta.innerHTML = "";
      const title = String(geniusTitleInput.value || "").trim();
      const artist = String(geniusArtistInput.value || "").trim();
      const url = String(geniusUrlInput.value || "").trim();

      if (!title && !artist && !url) {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = "Привязка Genius не выбрана.";
        geniusMeta.appendChild(empty);
        return;
      }

      const label = document.createElement("strong");
      label.textContent = "Genius";
      const value = document.createElement("span");
      value.textContent = [title, artist].filter(Boolean).join(" • ") || url;
      geniusMeta.append(label, value);

      if (url) {
        const link = document.createElement("a");
        link.className = "user-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Открыть";
        geniusMeta.appendChild(link);
      }
    };

    const renderGeniusResults = (results) => {
      geniusResults.innerHTML = "";
      const list = Array.isArray(results) ? results : [];
      if (list.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Ничего не найдено.";
        geniusResults.appendChild(empty);
        return;
      }

      for (const result of list) {
        const row = document.createElement("div");
        row.className = "item-page-lyrics-result";

        const info = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = result.fullTitle || result.title || "Без названия";
        const meta = document.createElement("p");
        meta.className = "muted";
        meta.textContent = result.url || "";
        info.append(title, meta);

        const selectBtn = createGhostButton("Выбрать", () => {
          selectedGeniusSongId = String(result.songId || "").trim();
          selectedGeniusImageUrl = String(result.imageUrl || "").trim();
          geniusUrlInput.value = String(result.url || "").trim();
          geniusTitleInput.value = String(result.title || "").trim();
          geniusArtistInput.value = String(result.artist || "").trim();
          renderGeniusMeta();
        });

        row.append(info, selectBtn);
        geniusResults.appendChild(row);
      }
    };

    const geniusActions = document.createElement("div");
    geniusActions.className = "item-page-lyrics-actions";
    const searchBtn = createGhostButton("Искать в Genius", async () => {
      const query = String(geniusSearchQuery.value || "").trim();
      if (query.length < 2) {
        setStatus("Введи запрос для поиска в Genius", "error");
        return;
      }

      try {
        setStatus("Ищу в Genius...");
        const payload = await api(`/api/integrations/genius/search?q=${encodeURIComponent(query)}`);
        renderGeniusResults(payload.results);
        setStatus("Результаты Genius обновлены", "success");
      } catch (error) {
        setStatus(error.message || "Не удалось выполнить поиск в Genius", "error");
      }
    });
    const clearBtn = createGhostButton("Очистить Genius", () => {
      selectedGeniusSongId = "";
      selectedGeniusImageUrl = "";
      geniusUrlInput.value = "";
      geniusTitleInput.value = "";
      geniusArtistInput.value = "";
      geniusResults.innerHTML = "";
      renderGeniusMeta();
    });
    geniusActions.append(searchBtn, clearBtn);

    const lyricsPlain = document.createElement("textarea");
    lyricsPlain.name = "lyricsPlain";
    lyricsPlain.rows = 8;
    lyricsPlain.maxLength = 50000;
    lyricsPlain.placeholder = "Обычный текст песни";
    lyricsPlain.value = lyrics.plain || "";

    const lyricsSync = document.createElement("textarea");
    lyricsSync.name = "lyricsSyncText";
    lyricsSync.rows = 10;
    lyricsSync.placeholder = "[00:12.00]Первая строка\n[00:15.40]Вторая строка\n\nили\n[00:12.00]<00:12.00>Я <00:12.35>иду <00:12.70>домой";
    lyricsSync.value = lyrics.syncText || "";

    const tapSyncState = {
      active: false,
      lines: [],
      timestamps: []
    };

    const tapSyncPanel = document.createElement("div");
    tapSyncPanel.className = "item-page-lyrics-tap-sync";

    const tapSyncTitle = document.createElement("strong");
    tapSyncTitle.className = "item-page-lyrics-tap-sync-title";
    tapSyncTitle.textContent = "Tap sync";

    const tapSyncStatus = document.createElement("div");
    tapSyncStatus.className = "item-page-lyrics-tap-sync-status";

    const tapSyncCurrent = document.createElement("div");
    tapSyncCurrent.className = "item-page-lyrics-tap-sync-current";

    const tapSyncHint = document.createElement("p");
    tapSyncHint.className = "muted item-page-lyrics-help";
    tapSyncHint.textContent = "Разбей текст песни по строкам, включи трек и жми Enter или кнопку «Следующая строка» в момент начала каждой строки.";

    const tapSyncAudioTools = document.createElement("div");
    tapSyncAudioTools.className = "item-page-lyrics-tap-sync-tools";

    const volumeWrap = document.createElement("label");
    volumeWrap.className = "item-page-lyrics-tap-sync-volume";
    const volumeLabel = document.createElement("span");
    volumeLabel.className = "item-page-lyrics-tap-sync-line-label";
    volumeLabel.textContent = "Громкость";
    const volumeRange = document.createElement("input");
    volumeRange.type = "range";
    volumeRange.min = "0";
    volumeRange.max = "100";
    volumeRange.step = "1";
    volumeRange.value = String(Math.round((Number.isFinite(Number(audio?.volume)) ? Number(audio.volume) : 1) * 100));
    const volumeValue = document.createElement("strong");
    volumeValue.textContent = `${volumeRange.value}%`;
    volumeWrap.append(volumeLabel, volumeRange, volumeValue);

    const speedNote = document.createElement("div");
    speedNote.className = "item-page-lyrics-tap-sync-speed-note";
    speedNote.textContent = "Скорость фиксирована: 1x";

    tapSyncAudioTools.append(volumeWrap, speedNote);

    const tapSyncActions = document.createElement("div");
    tapSyncActions.className = "item-page-lyrics-actions";

    const tapSyncStartBtn = createGhostButton("Начать по Enter", async () => {
      if (!audio || !track.audioUrl) {
        setStatus("На странице нет аудио для tap sync", "error");
        return;
      }

      if (tapSyncState.active) {
        tapSyncState.active = false;
        if (typeof audio.pause === "function") {
          audio.pause();
        }
        renderTapSyncState();
        setStatus("Tap sync поставлен на паузу", "success");
        return;
      }

      const nextLines = extractTapSyncLines(lyricsPlain.value, lyricsSync.value);
      if (nextLines.length === 0) {
        setStatus("Сначала добавь текст песни по строкам", "error");
        return;
      }

      const nextSignature = nextLines.join("\n");
      const currentSignature = tapSyncState.lines.join("\n");
      const shouldReset = tapSyncState.timestamps.length === 0
        || tapSyncState.timestamps.length >= tapSyncState.lines.length
        || nextSignature !== currentSignature;

      if (shouldReset) {
        tapSyncState.lines = nextLines;
        tapSyncState.timestamps = [];
        lyricsSync.value = "";
        try {
          audio.currentTime = 0;
        } catch {
          // ignore currentTime errors
        }
      }

      tapSyncState.active = true;
      try {
        await audio.play();
      } catch {
        // Safari should normally allow play() here because it's inside a click handler.
      }
      renderTapSyncState();
      setStatus("Tap sync активирован. Трек запущен, жми Enter на начале каждой строки.", "success");
    });

    const tapSyncNextBtn = createGhostButton("Следующая строка", () => {
      captureTapSyncTimestamp();
    }, { disabled: true });

    const tapSyncUndoBtn = createGhostButton("Отменить", () => {
      if (tapSyncState.timestamps.length === 0) {
        return;
      }
      tapSyncState.timestamps.pop();
      lyricsSync.value = buildTapSyncText(tapSyncState.lines, tapSyncState.timestamps);
      renderTapSyncState();
    }, { disabled: true });

    const tapSyncClearBtn = createGhostButton("Очистить", () => {
      tapSyncState.active = false;
      tapSyncState.lines = [];
      tapSyncState.timestamps = [];
      lyricsSync.value = "";
      renderTapSyncState();
    });

    tapSyncActions.append(tapSyncStartBtn, tapSyncNextBtn, tapSyncUndoBtn, tapSyncClearBtn);
    tapSyncPanel.append(tapSyncTitle, tapSyncStatus, tapSyncCurrent, tapSyncAudioTools, tapSyncActions, tapSyncHint);

    const help = document.createElement("p");
    help.className = "muted item-page-lyrics-help";
    help.textContent = "Поддерживаются обычный LRC, Enhanced LRC с таймкодом перед словом и JSON-массив сегментов/слов. Tap sync автоматически создаёт обычный LRC по строкам.";

    function renderTapSyncState() {
      const totalLines = tapSyncState.lines.length;
      const recordedLines = tapSyncState.timestamps.length;
      const isCompleted = totalLines > 0 && recordedLines >= totalLines;
      const currentLineIndex = totalLines > 0
        ? Math.max(0, Math.min(totalLines - 1, recordedLines === 0 ? 0 : recordedLines - 1))
        : -1;
      const nextLineIndex = totalLines > 0 && currentLineIndex + 1 < totalLines ? currentLineIndex + 1 : -1;
      const currentLine = currentLineIndex >= 0 ? tapSyncState.lines[currentLineIndex] : "";
      const nextLine = nextLineIndex >= 0 ? tapSyncState.lines[nextLineIndex] : "";

      tapSyncStatus.classList.toggle("recording", tapSyncState.active);
      if (tapSyncState.active) {
        tapSyncStatus.textContent = `Запись: ${recordedLines} из ${totalLines}`;
      } else if (isCompleted) {
        tapSyncStatus.textContent = `Готово: ${recordedLines} из ${totalLines}`;
      } else if (totalLines > 0) {
        tapSyncStatus.textContent = `Готово к записи: ${recordedLines} из ${totalLines}`;
      } else {
        tapSyncStatus.textContent = "Строки будут взяты из поля «Текст песни».";
      }

      tapSyncCurrent.replaceChildren();
      const currentLabel = document.createElement("strong");
      currentLabel.textContent = isCompleted
        ? "Tap sync завершён"
        : totalLines > 0
          ? "Очередь строк"
          : "Что будет синхронизироваться";
      tapSyncCurrent.appendChild(currentLabel);

      const currentWrap = document.createElement("div");
      currentWrap.className = "item-page-lyrics-tap-sync-line is-current";
      const currentLineLabel = document.createElement("span");
      currentLineLabel.className = "item-page-lyrics-tap-sync-line-label";
      currentLineLabel.textContent = isCompleted ? "Последняя строка" : "Сейчас";
      const currentLineText = document.createElement("span");
      currentLineText.textContent = isCompleted
        ? "Все строки уже записаны. Можно сохранить текст или начать запись заново."
        : currentLine || "Добавь текст песни по строкам, затем нажми «Начать по Enter».";
      currentWrap.append(currentLineLabel, currentLineText);
      tapSyncCurrent.appendChild(currentWrap);

      if (!isCompleted && nextLine) {
        const nextWrap = document.createElement("div");
        nextWrap.className = "item-page-lyrics-tap-sync-line is-next";
        const nextLabel = document.createElement("span");
        nextLabel.className = "item-page-lyrics-tap-sync-line-label";
        nextLabel.textContent = "Следующая строка";
        const nextText = document.createElement("span");
        nextText.textContent = nextLine;
        nextWrap.append(nextLabel, nextText);
        tapSyncCurrent.appendChild(nextWrap);
      }

      tapSyncNextBtn.disabled = !tapSyncState.active || totalLines === 0 || isCompleted;
      tapSyncUndoBtn.disabled = recordedLines === 0;
      tapSyncStartBtn.textContent = tapSyncState.active
        ? "Пауза записи"
        : isCompleted
          ? "Записать заново"
          : recordedLines > 0
            ? "Продолжить по Enter"
            : "Начать по Enter";
    }

    function syncVolumeUi() {
      const currentVolume = Math.max(0, Math.min(1, Number(audio?.muted ? 0 : audio?.volume)));
      const percent = String(Math.round(currentVolume * 100));
      volumeRange.value = percent;
      volumeValue.textContent = `${percent}%`;
    }

    function captureTapSyncTimestamp() {
      if (!tapSyncState.active) {
        return;
      }
      if (!audio || !track.audioUrl) {
        setStatus("На странице нет аудио для tap sync", "error");
        return;
      }
      if (tapSyncState.lines.length === 0) {
        setStatus("Сначала добавь текст песни по строкам", "error");
        tapSyncState.active = false;
        renderTapSyncState();
        return;
      }
      if (tapSyncState.timestamps.length >= tapSyncState.lines.length) {
        tapSyncState.active = false;
        renderTapSyncState();
        return;
      }

      const rawTimestamp = Math.max(0, Math.round(Number(audio.currentTime || 0) * 1000));
      const previousTimestamp = tapSyncState.timestamps[tapSyncState.timestamps.length - 1];
      const timestamp = Number.isFinite(previousTimestamp)
        ? Math.max(previousTimestamp + 10, rawTimestamp)
        : rawTimestamp;

      tapSyncState.timestamps.push(timestamp);
      lyricsSync.value = buildTapSyncText(tapSyncState.lines, tapSyncState.timestamps);

      if (tapSyncState.timestamps.length >= tapSyncState.lines.length) {
        tapSyncState.active = false;
        setStatus("Tap sync завершён. Проверь и сохрани текст.", "success");
      }

      renderTapSyncState();
    }

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = "Сохранить текст";

    const createLabeledField = (labelText, control) => {
      const label = document.createElement("label");
      label.className = "item-page-lyrics-field";
      const title = document.createElement("span");
      title.textContent = labelText;
      label.append(title, control);
      return label;
    };

    form.append(
      createLabeledField("Поиск Genius", geniusSearchQuery),
      geniusActions,
      geniusMeta,
      geniusResults,
      createLabeledField("Genius URL", geniusUrlInput),
      createLabeledField("Название на Genius", geniusTitleInput),
      createLabeledField("Исполнитель на Genius", geniusArtistInput),
      createLabeledField("Текст песни", lyricsPlain),
      tapSyncPanel,
      createLabeledField("Синхронизация", lyricsSync),
      help,
      submitBtn
    );

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      try {
        setStatus("Сохраняю текст трека...");
        await api(`/api/tracks/${encodeURIComponent(track.id)}`, {
          method: "PUT",
          body: {
            lyricsPlain: String(lyricsPlain.value || ""),
            lyricsSyncText: String(lyricsSync.value || ""),
            geniusSongId: selectedGeniusSongId,
            geniusUrl: String(geniusUrlInput.value || ""),
            geniusTitle: String(geniusTitleInput.value || ""),
            geniusArtist: String(geniusArtistInput.value || ""),
            geniusImageUrl: selectedGeniusImageUrl
          }
        });
        await loadTrackById(track.id, { silent: true });
        setStatus("Текст трека обновлен", "success");
      } catch (error) {
        setStatus(error.message || "Не удалось сохранить текст трека", "error");
      }
    });

    geniusUrlInput.addEventListener("input", renderGeniusMeta);
    geniusTitleInput.addEventListener("input", renderGeniusMeta);
    geniusArtistInput.addEventListener("input", renderGeniusMeta);

    const handleVolumeInput = () => {
      if (!audio) {
        return;
      }
      const nextVolume = Math.max(0, Math.min(1, Number(volumeRange.value || 0) / 100));
      audio.volume = nextVolume;
      audio.muted = nextVolume <= 0;
      syncVolumeUi();
    };

    const handleAudioVolumeChange = () => {
      syncVolumeUi();
    };

    const handleAudioRateChange = () => {
      if (!audio) {
        return;
      }
      if (Number(audio.playbackRate) !== 1) {
        audio.playbackRate = 1;
      }
      if (Number(audio.defaultPlaybackRate) !== 1) {
        audio.defaultPlaybackRate = 1;
      }
    };

    if (audio) {
      audio.playbackRate = 1;
      audio.defaultPlaybackRate = 1;
      audio.addEventListener("volumechange", handleAudioVolumeChange);
      audio.addEventListener("ratechange", handleAudioRateChange);
    }
    volumeRange.addEventListener("input", handleVolumeInput);

    const handleTapSyncKeydown = (event) => {
      if (!tapSyncState.active) {
        return;
      }
      if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      event.preventDefault();
      captureTapSyncTimestamp();
    };

    document.addEventListener("keydown", handleTapSyncKeydown);
    tapSyncEditorState.cleanup = () => {
      tapSyncState.active = false;
      document.removeEventListener("keydown", handleTapSyncKeydown);
      volumeRange.removeEventListener("input", handleVolumeInput);
      if (audio) {
        audio.removeEventListener("volumechange", handleAudioVolumeChange);
        audio.removeEventListener("ratechange", handleAudioRateChange);
      }
    };

    renderGeniusMeta();
    syncVolumeUi();
    renderTapSyncState();
    wrapper.append(toggle, form);
    return wrapper;
  }

  function buildTrackLyricsCard(track, audio) {
    const lyrics = normalizeTrackLyrics(track);
    const hasVisibleContent = Boolean(
      lyrics.plain ||
      (Array.isArray(lyrics.segments) && lyrics.segments.length > 0) ||
      lyrics.genius
    );

    if (!hasVisibleContent && !(pageState.currentUser && track.isOwner)) {
      clearLyricsSyncBinding();
      return null;
    }

    const card = document.createElement("div");
    card.className = "card item-page-lyrics-card";

    const head = document.createElement("div");
    head.className = "item-page-lyrics-head";
    const title = document.createElement("h3");
    title.textContent = "Текст трека";
    head.appendChild(title);

    if (lyrics.hasWordTimings) {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = "word sync";
      head.appendChild(badge);
    } else if (lyrics.segments.length > 0) {
      const badge = document.createElement("span");
      badge.className = "tag";
      badge.textContent = "line sync";
      head.appendChild(badge);
    }

    if (Array.isArray(lyrics.segments) && lyrics.segments.length > 0) {
      head.appendChild(createGhostButton(
        pageState.karaokeEnabled ? "Караоке: вкл" : "Караоке: выкл",
        () => {
          pageState.karaokeEnabled = !pageState.karaokeEnabled;
          saveKaraokeEnabled(pageState.karaokeEnabled);
          if (pageState.track) {
            renderTrackPage(pageState.track);
          }
        },
        { className: pageState.karaokeEnabled ? "active" : "" }
      ));
    }

    card.appendChild(head);

    if (lyrics.genius) {
      const source = document.createElement("div");
      source.className = "item-page-lyrics-source";
      const label = document.createElement("strong");
      label.textContent = "Genius";
      const meta = document.createElement("span");
      meta.textContent = [lyrics.genius.title, lyrics.genius.artist].filter(Boolean).join(" • ") || lyrics.genius.url;
      source.append(label, meta);
      if (lyrics.genius.url) {
        const link = document.createElement("a");
        link.className = "user-link";
        link.href = lyrics.genius.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Открыть на Genius";
        source.appendChild(link);
      }
      card.appendChild(source);
    }

    const rendered = buildLyricsViewer(lyrics);
    card.appendChild(rendered.viewer);
    if (rendered.renderedSegments.length > 0) {
      bindLyricsSyncToAudio(audio, rendered.renderedSegments);
    } else {
      clearLyricsSyncBinding();
    }

    if (pageState.currentUser && track.isOwner) {
      card.appendChild(buildTrackLyricsEditor(track, lyrics, audio));
    }

    return card;
  }

  function renderTags(tags) {
    const wrap = document.createElement("div");
    wrap.className = "tag-wrap";
    if (!Array.isArray(tags)) return wrap;
    for (const tag of tags) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = `#${tag}`;
      wrap.appendChild(span);
    }
    return wrap;
  }

  function createMetaChip(label, value) {
    const chip = document.createElement("div");
    chip.className = "meta-chip";
    chip.innerHTML = `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value ?? "-")}`;
    return chip;
  }

  function createSkeletonLine(className = "meta") {
    const node = document.createElement("div");
    node.className = `skeleton-line ${className}`.trim();
    return node;
  }

  function createItemPageSkeletonComment() {
    const comment = document.createElement("div");
    comment.className = "skeleton-comment";
    comment.append(
      createSkeletonLine("title"),
      createSkeletonLine("meta"),
      createSkeletonLine("short")
    );
    return comment;
  }

  function renderItemPageSkeleton(section = "t") {
    if (!root) return;
    const isAlbum = section === "a";

    const head = document.createElement("div");
    head.className = "item-page-head";
    const headLeft = document.createElement("div");
    headLeft.className = "skeleton-list";
    headLeft.append(createSkeletonLine("title"), createSkeletonLine("meta"));
    const headRight = document.createElement("div");
    headRight.className = "skeleton-list";
    headRight.append(createSkeletonLine("short"), createSkeletonLine("short"));
    head.append(headLeft, headRight);

    const mainCard = document.createElement("div");
    mainCard.className = "card";
    const mainGrid = document.createElement("div");
    mainGrid.className = "item-page-grid";
    const cover = document.createElement("div");
    cover.className = "skeleton-card";
    cover.style.aspectRatio = "1 / 1";
    const content = document.createElement("div");
    content.className = "skeleton-list";
    content.append(
      createSkeletonLine("title"),
      createSkeletonLine("meta"),
      createSkeletonLine("meta"),
      createSkeletonLine("short")
    );
    mainGrid.append(cover, content);
    mainCard.appendChild(mainGrid);

    const cards = [head, mainCard];

    if (!isAlbum) {
      const actionsCard = document.createElement("div");
      actionsCard.className = "card";
      const actionsList = document.createElement("div");
      actionsList.className = "skeleton-list";
      actionsList.append(
        createSkeletonLine("title"),
        createSkeletonLine("meta")
      );
      actionsCard.appendChild(actionsList);
      cards.push(actionsCard);
    }

    const commentsCard = document.createElement("div");
    commentsCard.className = "card";
    const commentsTitle = createSkeletonLine("title");
    commentsTitle.style.width = "44%";
    commentsCard.appendChild(commentsTitle);
    const commentsList = document.createElement("div");
    commentsList.className = "item-page-comments-list";
    commentsList.append(
      createItemPageSkeletonComment(),
      createItemPageSkeletonComment(),
      createItemPageSkeletonComment()
    );
    commentsCard.appendChild(commentsList);
    cards.push(commentsCard);

    root.replaceChildren(...cards);
  }

  function parsePath() {
    const pathMatch = window.location.pathname.replace(/\/+$/, "").match(/^\/(t|b|a)\/([a-zA-Z0-9-]+)$/);
    if (pathMatch) {
      return { section: pathMatch[1], id: decodeURIComponent(pathMatch[2]) };
    }

    const currentUrl = new URL(window.location.href);
    const section = String(currentUrl.searchParams.get("section") || "").trim().toLowerCase();
    const id = String(currentUrl.searchParams.get("id") || "").trim();
    if ((section === "t" || section === "b" || section === "a") && id) {
      return { section, id };
    }

    return null;
  }

  function isAuthRequiredError(error) {
    return Number(error?.status) === 401;
  }

  async function loadCurrentUser() {
    try {
      const data = await api("/api/me");
      pageState.currentUser = data && data.user ? data.user : null;
    } catch (_error) {
      pageState.currentUser = null;
    }
  }

  async function loadTrackById(trackId, { silent = false } = {}) {
    if (!silent) setStatus("Загрузка...");
    const data = await api(`/api/tracks/${encodeURIComponent(trackId)}`);
    if (!data || !data.track) {
      throw new Error("Трек не найден");
    }
    pageState.track = data.track;
    pageState.album = null;
    renderTrackPage(data.track);
    if (!silent) setStatus("Готово", "success");
  }

  async function loadAlbumById(albumId, { silent = false } = {}) {
    if (!silent) setStatus("Загрузка...");
    const data = await api(`/api/albums/${encodeURIComponent(albumId)}`);
    if (!data || !data.album) {
      throw new Error("Альбом не найден");
    }
    pageState.album = data.album;
    pageState.track = null;
    renderAlbumPage(data.album);
    if (!silent) setStatus("Готово", "success");
  }

  async function reloadCurrentTrack({ silent = true } = {}) {
    if (!pageState.pathInfo || (pageState.pathInfo.section !== "t" && pageState.pathInfo.section !== "b")) {
      return;
    }
    await loadTrackById(pageState.pathInfo.id, { silent });
  }

  async function withAction(action, successMessage) {
    if (pageState.loading) return;
    pageState.loading = true;
    try {
      await action();
      if (successMessage) {
        setStatus(successMessage, "success");
      }
    } catch (error) {
      setStatus(error?.message || "Ошибка", "error");
      if (isAuthRequiredError(error)) {
        setStatus("Войди в аккаунт на главной странице, чтобы выполнить это действие", "error");
      }
    } finally {
      pageState.loading = false;
    }
  }

  async function handleTrackReaction(trackId, reaction) {
    await withAction(async () => {
      await api(`/api/tracks/${encodeURIComponent(trackId)}/${reaction}`, { method: "POST" });
      await reloadCurrentTrack({ silent: true });
    });
  }

  async function handleCommentReaction(trackId, commentId, reaction) {
    await withAction(async () => {
      await api(`/api/tracks/${encodeURIComponent(trackId)}/comments/${encodeURIComponent(commentId)}/${reaction}`, {
        method: "POST"
      });
      await reloadCurrentTrack({ silent: true });
    });
  }

  async function handleCommentCreate(trackId, text, parentCommentId = null) {
    const normalized = String(text || "").trim();
    if (normalized.length < 1 || normalized.length > 400) {
      throw new Error("Комментарий должен быть от 1 до 400 символов");
    }
    await api(`/api/tracks/${encodeURIComponent(trackId)}/comments`, {
      method: "POST",
      body: {
        text: normalized,
        ...(parentCommentId ? { parentCommentId } : {})
      }
    });
    await reloadCurrentTrack({ silent: true });
  }

  async function handleCommentDelete(trackId, commentId) {
    await withAction(async () => {
      await api(`/api/tracks/${encodeURIComponent(trackId)}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE"
      });
      await reloadCurrentTrack({ silent: true });
    });
  }

  async function handleCommentReport(trackId, comment) {
    if (!pageState.currentUser) {
      setStatus("Войди в аккаунт, чтобы отправить жалобу.", "error");
      return;
    }
    if (!comment || !comment.id) {
      setStatus("Комментарий не найден", "error");
      return;
    }

    const reasonInput = await promptDialog({
      title: "Жалоба на комментарий",
      message: "Кратко укажи причину жалобы.",
      value: "Оскорбление / спам / нарушение правил",
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

    await withAction(async () => {
      await api("/api/reports", {
        method: "POST",
        body: {
          targetType: "comment",
          targetId: comment.id,
          trackId,
          reason,
          details
        }
      });
    }, "Жалоба на комментарий отправлена");
  }

  function buildTrackHeader(track, isBeat) {
    const head = document.createElement("div");
    head.className = "item-page-head";

    const titleWrap = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.className = "track-title-heading";
    const titleText = document.createElement("span");
    titleText.textContent = track.title || (isBeat ? "Бит" : "Трек");
    h2.appendChild(titleText);
    if (track.isExplicit) {
      h2.appendChild(createTrackExplicitBadge());
    }

    const sub = document.createElement("p");
    sub.className = "muted";
    sub.innerHTML = `${isBeat ? "Бит" : "Трек"} • <a class="user-link" href="/u/${encodeURIComponent(track.username)}">@${escapeHtml(track.username)}</a>`;

    titleWrap.append(h2, sub);

    const links = document.createElement("div");
    links.className = "item-page-links";
    links.append(
      createLinkButton("/", "На главную"),
      createLinkButton(`/u/${encodeURIComponent(track.username)}`, "Профиль автора")
    );

    head.append(titleWrap, links);
    return head;
  }

  function buildTrackMainCard(track) {
    const isBeat = String(track.kind || "") === "beat";
    const card = document.createElement("div");
    card.className = "card";

    const grid = document.createElement("div");
    grid.className = "item-page-grid";

    const cover = document.createElement("img");
    cover.className = "item-page-cover";
    cover.alt = `Обложка ${track.title || "релиза"}`;
    setImage(cover, track.coverUrl);

    const content = document.createElement("div");

    const metaGrid = document.createElement("div");
    metaGrid.className = "item-page-meta";
    metaGrid.append(
      createMetaChip("Жанр", track.genre || "-"),
      createMetaChip("Прослушивания", String(track.listensCount || 0)),
      createMetaChip("Лайки", String(track.likesCount || 0)),
      createMetaChip("Дизлайки", String(track.dislikesCount || 0)),
      createMetaChip("Комментарии", String(track.commentsCount || 0)),
      createMetaChip("Репосты", String(track.repostsCount || 0)),
      createMetaChip("Опубликовано", formatDate(track.createdAt))
    );

    if (isBeat) {
      metaGrid.append(
        createMetaChip("BPM", String(track.beatBpm || "-")),
        createMetaChip("Корневая нота", track.beatRootNote || "-")
      );
    } else {
      const authors = Array.isArray(track.authors) && track.authors.length > 0 ? track.authors.join(", ") : `@${track.username}`;
      const producers = Array.isArray(track.producers) && track.producers.length > 0 ? track.producers.join(", ") : "-";
      metaGrid.append(
        createMetaChip("Авторы", authors),
        createMetaChip("Продюсеры", producers)
      );
    }

    const audio = document.createElement("audio");
    audio.className = "item-page-audio";
    audio.preload = "metadata";
    audio.src = track.audioUrl;
    const audioPlayer = buildStandaloneAudioPlayer(audio, {
      preload: "metadata"
    });

    const desc = document.createElement("p");
    desc.className = "item-page-desc";
    desc.textContent = track.description || "Без описания";

    content.append(metaGrid, audioPlayer, desc, renderTags(track.hashtags || []));

    if (isBeat) {
      const licensesTitle = document.createElement("p");
      licensesTitle.className = "muted";
      licensesTitle.style.marginTop = "0.6rem";
      licensesTitle.textContent = "Лицензии и цены";
      content.appendChild(licensesTitle);

      const licensesWrap = document.createElement("div");
      licensesWrap.className = "item-page-license-list";
      const licenses = Array.isArray(track.beatLicenses) ? track.beatLicenses : [];

      if (licenses.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Лицензии не указаны. Напиши владельцу в личные сообщения.";
        licensesWrap.appendChild(empty);
      } else {
        for (const license of licenses) {
          const row = document.createElement("div");
          row.className = "item-page-license-chip";
          const type = document.createElement("span");
          type.textContent = String(license.type || "license");
          const price = document.createElement("strong");
          const amount = Number.isFinite(Number(license.price)) ? Number(license.price) : 0;
          const currency = String(license.currency || "RUB").toUpperCase();
          price.textContent = `${amount} ${currency === "USD" ? "$" : "₽"}`;
          row.append(type, price);
          licensesWrap.appendChild(row);
        }
      }

      const hint = document.createElement("p");
      hint.className = "muted";
      hint.style.marginTop = "0.5rem";
      hint.textContent = "Для покупки/получения бита напиши владельцу в личные сообщения в основном приложении.";
      content.append(licensesWrap, hint);
    }

    grid.append(cover, content);
    card.appendChild(grid);
    card._itemPageAudio = audio;
    return card;
  }

  function buildTrackActionsCard(track) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "Реакции";
    card.appendChild(title);

    const bar = document.createElement("div");
    bar.className = "item-page-actions-bar";

    const likeBtn = createGhostButton(`👍 ${track.likesCount || 0}`, () => {
      handleTrackReaction(track.id, "like");
    }, {
      className: `item-page-action-btn${track.liked ? " active" : ""}`
    });

    const dislikeBtn = createGhostButton(`👎 ${track.dislikesCount || 0}`, () => {
      handleTrackReaction(track.id, "dislike");
    }, {
      className: `item-page-action-btn${track.disliked ? " active" : ""}`
    });

    const commentsInfo = document.createElement("span");
    commentsInfo.className = "muted";
    commentsInfo.textContent = `💬 ${track.commentsCount || 0}`;

    const repostsInfo = document.createElement("span");
    repostsInfo.className = "muted";
    repostsInfo.textContent = `🔁 ${track.repostsCount || 0}`;

    const listensInfo = document.createElement("span");
    listensInfo.className = "muted";
    listensInfo.textContent = `▶ ${track.listensCount || 0}`;

    const copyLinkBtn = createGhostButton("Скопировать ссылку", async () => {
      const sharePath = trackSharePath(track);
      const url = `${window.location.origin}${sharePath}`;
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Ссылка скопирована", "success");
      } catch {
        await copyDialog({
          title: "Ссылка на релиз",
          message: "Скопируй ссылку вручную, если браузер не дал доступ к буферу.",
          value: url
        });
      }
    });
    const shareBtn = createGhostButton("Поделиться ссылкой", async () => {
      const sharePath = trackSharePath(track);
      const url = `${window.location.origin}${sharePath}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: String(track?.title || "Трек"),
            text: track?.username ? `@${track.username}` : "",
            url
          });
          setStatus("Ссылка готова для отправки", "success");
          return;
        } catch (error) {
          if (error && String(error.name || "") === "AbortError") {
            return;
          }
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Ссылка скопирована", "success");
      } catch {
        await copyDialog({
          title: "Ссылка на релиз",
          message: "Скопируй ссылку вручную, если браузер не дал доступ к буферу.",
          value: url
        });
      }
    });

    bar.append(likeBtn, dislikeBtn, copyLinkBtn, shareBtn, commentsInfo, repostsInfo, listensInfo);
    card.appendChild(bar);

    if (!pageState.currentUser) {
      const hint = document.createElement("p");
      hint.className = "muted";
      hint.style.marginTop = "0.55rem";
      hint.textContent = "Для лайков и комментариев войди в аккаунт на главной странице.";
      card.appendChild(hint);
    }

    return card;
  }

  function createCommentForm({ trackId, parentCommentId = null, placeholder, submitLabel, onCancel = null }) {
    const form = document.createElement("form");
    form.className = "item-page-comment-form";

    const textarea = document.createElement("textarea");
    textarea.maxLength = 400;
    textarea.placeholder = placeholder || "Напиши комментарий...";
    textarea.required = true;

    const actions = document.createElement("div");
    actions.className = "item-page-comment-form-actions";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = submitLabel || "Отправить";

    actions.appendChild(submitBtn);

    if (typeof onCancel === "function") {
      const cancelBtn = createGhostButton("Отмена", (event) => {
        event.preventDefault();
        onCancel();
      });
      actions.appendChild(cancelBtn);
    }

    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = "До 400 символов";
    actions.appendChild(hint);

    form.append(textarea, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = String(textarea.value || "").trim();
      await withAction(async () => {
        await handleCommentCreate(trackId, text, parentCommentId);
      }, "Комментарий добавлен");
    });

    return form;
  }

  function renderCommentNode(comment, trackId, depth = 0) {
    const node = document.createElement("div");
    node.className = `item-page-comment${depth > 0 ? " reply" : ""}`;

    const head = document.createElement("div");
    head.className = "item-page-comment-head";

    const meta = document.createElement("div");
    meta.className = "item-page-comment-meta";

    const userLink = document.createElement("a");
    userLink.className = "user-link";
    userLink.href = `/u/${encodeURIComponent(comment.username)}`;
    userLink.textContent = `@${comment.username}`;

    const dateNode = document.createElement("span");
    dateNode.className = "muted";
    dateNode.textContent = formatDate(comment.createdAt);

    meta.append(userLink, dateNode);

    if (comment.likedByAuthor) {
      const authorBadge = document.createElement("span");
      authorBadge.className = "item-page-comment-author-like";
      if (comment.authorBadgeAvatarUrl) {
        const avatar = document.createElement("img");
        avatar.alt = "Автор";
        setImage(avatar, comment.authorBadgeAvatarUrl);
        authorBadge.appendChild(avatar);
      }
      const heart = document.createElement("span");
      heart.textContent = "❤ от автора";
      authorBadge.appendChild(heart);
      meta.appendChild(authorBadge);
    }

    head.appendChild(meta);
    node.appendChild(head);

    const textNode = document.createElement("p");
    textNode.className = "item-page-comment-text";
    textNode.textContent = comment.text || "";
    node.appendChild(textNode);

    const actions = document.createElement("div");
    actions.className = "item-page-comment-actions";

    const likeBtn = createGhostButton(`👍 ${comment.likesCount || 0}`, () => {
      handleCommentReaction(trackId, comment.id, "like");
    }, {
      className: comment.liked ? "item-page-action-btn active" : "item-page-action-btn"
    });

    const dislikeBtn = createGhostButton(`👎 ${comment.dislikesCount || 0}`, () => {
      handleCommentReaction(trackId, comment.id, "dislike");
    }, {
      className: comment.disliked ? "item-page-action-btn active" : "item-page-action-btn"
    });

    actions.append(likeBtn, dislikeBtn);

    if (pageState.currentUser && pageState.currentUser.id !== comment.userId) {
      const reportBtn = createGhostButton("Пожаловаться", () => {
        handleCommentReport(trackId, comment);
      });
      actions.appendChild(reportBtn);
    }

    let replyWrap = null;
    if (pageState.currentUser) {
      replyWrap = document.createElement("div");
      replyWrap.className = "hidden";

      const replyBtn = createGhostButton("Ответить", () => {
        replyWrap.classList.toggle("hidden");
      });
      actions.appendChild(replyBtn);

      replyWrap.appendChild(createCommentForm({
        trackId,
        parentCommentId: comment.id,
        placeholder: `Ответ для @${comment.username}`,
        submitLabel: "Отправить ответ",
        onCancel: () => replyWrap.classList.add("hidden")
      }));
      node.appendChild(replyWrap);
    }

    if (comment.canDelete) {
      const delBtn = createGhostButton("Удалить", async () => {
        const confirmed = await confirmDialog({
          title: "Удалить комментарий?",
          message: "Комментарий будет удалён без возможности восстановления.",
          confirmText: "Удалить",
          cancelText: "Отмена",
          danger: true
        });
        if (!confirmed) return;
        await handleCommentDelete(trackId, comment.id);
      });
      actions.appendChild(delBtn);
    }

    node.appendChild(actions);

    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    if (replies.length > 0) {
      const repliesWrap = document.createElement("div");
      repliesWrap.className = "item-page-replies";
      for (const reply of replies) {
        repliesWrap.appendChild(renderCommentNode(reply, trackId, depth + 1));
      }
      node.appendChild(repliesWrap);
    }

    return node;
  }

  function buildCommentsCard(track) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = `Комментарии (${track.commentsCount || 0})`;
    card.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "item-page-comments-wrap";

    if (pageState.currentUser) {
      wrap.appendChild(createCommentForm({
        trackId: track.id,
        placeholder: "Напиши комментарий...",
        submitLabel: "Отправить"
      }));
    } else {
      const guestHint = document.createElement("p");
      guestHint.className = "muted";
      guestHint.textContent = "Чтобы оставить комментарий, войди в аккаунт на главной странице.";
      wrap.appendChild(guestHint);
    }

    const list = document.createElement("div");
    list.className = "item-page-comments-list";
    const comments = Array.isArray(track.comments) ? track.comments : [];

    if (comments.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Пока комментариев нет.";
      list.appendChild(empty);
    } else {
      for (const comment of comments) {
        list.appendChild(renderCommentNode(comment, track.id, 0));
      }
    }

    wrap.appendChild(list);
    card.appendChild(wrap);
    return card;
  }

  function renderTrackPage(track) {
    clearLyricsSyncBinding();
    clearTapSyncEditorBinding();
    document.title = `sfera • ${track.title}`;
    const isBeat = String(track.kind || "") === "beat";

    const head = buildTrackHeader(track, isBeat);
    const mainCard = buildTrackMainCard(track);
    const lyricsCard = buildTrackLyricsCard(track, mainCard._itemPageAudio || null);
    const actionsCard = buildTrackActionsCard(track);
    const commentsCard = buildCommentsCard(track);

    const nodes = [head, mainCard];
    if (lyricsCard) {
      nodes.push(lyricsCard);
    }
    nodes.push(actionsCard, commentsCard);
    root.replaceChildren(...nodes);
  }

  function renderAlbumPage(album) {
    clearLyricsSyncBinding();
    clearTapSyncEditorBinding();
    document.title = `sfera • Альбом • ${album.title}`;

    const head = document.createElement("div");
    head.className = "item-page-head";
    const titleWrap = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = album.title || "Альбом";
    const sub = document.createElement("p");
    sub.className = "muted";
    sub.innerHTML = `Альбом • <a class="user-link" href="/u/${encodeURIComponent(album.username)}">@${escapeHtml(album.username)}</a>`;
    titleWrap.append(h2, sub);

    const links = document.createElement("div");
    links.className = "item-page-links";
    links.append(
      createLinkButton("/", "На главную"),
      createLinkButton(`/u/${encodeURIComponent(album.username)}`, "Профиль автора")
    );
    head.append(titleWrap, links);

    const card = document.createElement("div");
    card.className = "card";

    const grid = document.createElement("div");
    grid.className = "item-page-grid";

    const cover = document.createElement("img");
    cover.className = "item-page-cover";
    cover.alt = `Обложка альбома ${album.title || ""}`;
    setImage(cover, album.coverUrl);

    const content = document.createElement("div");
    const metaGrid = document.createElement("div");
    metaGrid.className = "item-page-meta";
    metaGrid.append(
      createMetaChip("Жанр", album.genre || "-"),
      createMetaChip("Треков", String(album.tracksCount || (Array.isArray(album.tracks) ? album.tracks.length : 0))),
      createMetaChip("Опубликовано", formatDate(album.createdAt))
    );

    const desc = document.createElement("p");
    desc.className = "item-page-desc";
    desc.textContent = album.description || "Без описания";

    const authorsInfo = document.createElement("p");
    authorsInfo.className = "muted";
    const authors = Array.isArray(album.authors) && album.authors.length > 0 ? album.authors.join(", ") : `@${album.username}`;
    const producers = Array.isArray(album.producers) && album.producers.length > 0 ? album.producers.join(", ") : "-";
    authorsInfo.textContent = `Авторы: ${authors} • Продюсеры: ${producers}`;

    content.append(metaGrid, desc, authorsInfo, renderTags(album.hashtags || []));

    grid.append(cover, content);
    card.appendChild(grid);

    const trackListCard = document.createElement("div");
    trackListCard.className = "card";
    const listTitle = document.createElement("h3");
    listTitle.textContent = "Треклист";
    trackListCard.appendChild(listTitle);

    const listWrap = document.createElement("div");
    listWrap.className = "item-page-tracklist";

    const tracks = Array.isArray(album.tracks) ? album.tracks : [];
    if (tracks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "В этом альбоме пока нет доступных треков.";
      listWrap.appendChild(empty);
    } else {
      for (const track of tracks) {
        const row = document.createElement("div");
        row.className = "item-page-track-row";

        const rowHead = document.createElement("div");
        rowHead.className = "item-page-track-row-head";

        const title = document.createElement("strong");
        const link = document.createElement("a");
        link.className = "track-title-link compact-link";
        link.href = track.sharePath || trackSharePath(track);
        const linkText = document.createElement("span");
        linkText.className = "track-title-text";
        linkText.textContent = track.title || "Трек";
        link.appendChild(linkText);
        if (track.isExplicit) {
          link.appendChild(createTrackExplicitBadge({ compact: true }));
        }
        title.appendChild(link);

        const meta = document.createElement("span");
        meta.className = "muted";
        meta.textContent = `@${track.username || album.username}${track.durationSec ? ` • ${formatDuration(track.durationSec)}` : ""}`;

        rowHead.append(title, meta);
        row.appendChild(rowHead);

        if (track.audioUrl) {
          const audio = document.createElement("audio");
          audio.preload = "none";
          audio.src = track.audioUrl;
          row.appendChild(buildStandaloneAudioPlayer(audio, {
            compact: true,
            preload: "none"
          }));
        }

        listWrap.appendChild(row);
      }
    }

    trackListCard.appendChild(listWrap);
    root.replaceChildren(head, card, trackListCard);
  }

  async function init() {
    if (!root) return;
    applyItemChromeLanguage();
    pageState.pathInfo = parsePath();

    if (!pageState.pathInfo) {
      setStatus("Неверный адрес страницы", "error");
      root.innerHTML = "<p class='muted'>Неверный адрес страницы.</p>";
      return;
    }

    try {
      setStatus("Загрузка...");
      renderItemPageSkeleton(pageState.pathInfo.section);
      await loadCurrentUser();

      if (pageState.pathInfo.section === "a") {
        await loadAlbumById(pageState.pathInfo.id, { silent: true });
      } else {
        await loadTrackById(pageState.pathInfo.id, { silent: true });
      }

      setStatus("Готово", "success");
    } catch (error) {
      setStatus(error.message || "Ошибка загрузки", "error");
      root.innerHTML = `<p class="muted">${escapeHtml(error.message || "Ошибка загрузки")}</p>`;
    }
  }

  const bootPromise = init();
  window.__sferaItemPageBootPromise = bootPromise;
})();
