(() => {
  "use strict";

  function createAppPublishHelpers(ctx) {
    const { elements, constants = {}, deps = {} } = ctx || {};
    const { MAX_MP3_BYTES, MAX_WAV_BYTES, MAX_IMAGE_BYTES, COVER_SIZE } = constants;
    const { getAudioDurationFromFile, setStatus } = deps;
    const trackLyricsSyncElements = {
      plainInput: document.getElementById("trackLyricsPlain"),
      output: document.getElementById("trackLyricsSyncText"),
      player: document.getElementById("trackLyricsSyncPlayer"),
      audio: document.getElementById("trackLyricsSyncAudio"),
      playBtn: document.getElementById("trackLyricsSyncPlayBtn"),
      restartBtn: document.getElementById("trackLyricsSyncRestartBtn"),
      seekRange: document.getElementById("trackLyricsSyncSeek"),
      meta: document.getElementById("trackLyricsSyncMeta"),
      currentTime: document.getElementById("trackLyricsSyncCurrentTime"),
      duration: document.getElementById("trackLyricsSyncDuration"),
      status: document.getElementById("trackLyricsSyncStatus"),
      current: document.getElementById("trackLyricsSyncCurrent"),
      volumeRange: document.getElementById("trackLyricsSyncVolume"),
      volumeValue: document.getElementById("trackLyricsSyncVolumeValue"),
      startBtn: document.getElementById("trackLyricsSyncStartBtn"),
      nextBtn: document.getElementById("trackLyricsSyncNextBtn"),
      undoBtn: document.getElementById("trackLyricsSyncUndoBtn"),
      clearBtn: document.getElementById("trackLyricsSyncClearBtn")
    };
    const trackLyricsSyncState = {
      objectUrl: "",
      audioFileSignature: "",
      entries: [],
      active: false,
      cursor: 0,
      lastGeneratedText: ""
    };
    let trackLyricsSyncComposerBound = false;

    function extractBase64(dataUrl) {
      const index = String(dataUrl || "").indexOf(",");
      return index >= 0 ? dataUrl.slice(index + 1) : String(dataUrl || "");
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
        reader.readAsDataURL(file);
      });
    }

    function loadImage(src) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Не удалось обработать изображение"));
        image.src = src;
      });
    }

    function canvasToBlob(canvas, mimeType, quality) {
      return new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Не удалось получить изображение"));
              return;
            }
            resolve(blob);
          },
          mimeType,
          quality
        );
      });
    }

    function ensureImageFile(file) {
      if (!file) {
        throw new Error("Изображение не выбрано");
      }

      const normalizedMime = normalizeImageMime(file);
      if (!normalizedMime) {
        throw new Error("Допускаются только PNG, JPG или GIF");
      }

      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error("Изображение больше 5 МБ");
      }

      return normalizedMime;
    }

    function normalizeImageMime(file) {
      const name = String(file?.name || "").toLowerCase();
      const type = String(file?.type || "").toLowerCase();

      if (type === "image/png") {
        return "image/png";
      }

      if (type === "image/jpeg" || type === "image/jpg") {
        return "image/jpeg";
      }

      if (type === "image/gif") {
        return "image/gif";
      }

      if (name.endsWith(".png")) {
        return "image/png";
      }

      if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
        return "image/jpeg";
      }

      if (name.endsWith(".gif")) {
        return "image/gif";
      }

      return null;
    }

    function normalizeAudioMime(file) {
      const name = String(file?.name || "").toLowerCase();
      const type = String(file?.type || "").toLowerCase();

      if (type === "audio/mpeg" || type === "audio/mp3") {
        return "audio/mpeg";
      }

      if (type === "audio/wav" || type === "audio/x-wav") {
        return "audio/wav";
      }

      if (name.endsWith(".mp3")) {
        return "audio/mpeg";
      }

      if (name.endsWith(".wav")) {
        return "audio/wav";
      }

      return null;
    }

    async function prepareAudio(file) {
      if (!file) {
        throw new Error("Аудиофайл не выбран");
      }

      const normalizedMime = normalizeAudioMime(file);

      if (!normalizedMime) {
        throw new Error("Можно загрузить только MP3 или WAV");
      }

      const sizeLimit = normalizedMime === "audio/wav" ? MAX_WAV_BYTES : MAX_MP3_BYTES;
      if (file.size > sizeLimit) {
        if (normalizedMime === "audio/wav") {
          throw new Error("WAV-файл больше 30 МБ");
        }
        throw new Error("MP3-файл больше 15 МБ");
      }

      let durationSec = null;
      try {
        durationSec = await getAudioDurationFromFile(file);
      } catch (error) {
        console.warn("Не удалось определить длительность аудио, продолжаю без durationSec", error);
      }

      return {
        file,
        fileName: file.name,
        mimeType: normalizedMime,
        durationSec: Number.isFinite(durationSec) && durationSec > 0 ? Math.max(1, Math.round(durationSec)) : null
      };
    }

    async function prepareImage(file) {
      const mimeType = ensureImageFile(file);

      return {
        fileBase64: extractBase64(await readFileAsDataUrl(file)),
        fileName: file.name,
        mimeType
      };
    }

    async function prepareCover(file) {
      const mimeType = ensureImageFile(file);

      if (mimeType === "image/gif") {
        return {
          file,
          fileName: file.name,
          mimeType
        };
      }

      const sourceData = await readFileAsDataUrl(file);
      const image = await loadImage(sourceData);

      const side = Math.min(image.width, image.height);
      const startX = Math.floor((image.width - side) / 2);
      const startY = Math.floor((image.height - side) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = COVER_SIZE;
      canvas.height = COVER_SIZE;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Не удалось обработать обложку");
      }

      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, startX, startY, side, side, 0, 0, COVER_SIZE, COVER_SIZE);

      const outputMimeType = mimeType === "image/png" ? "image/png" : "image/jpeg";
      const blob = await canvasToBlob(canvas, outputMimeType, outputMimeType === "image/jpeg" ? 0.92 : undefined);
      const extension = outputMimeType === "image/png" ? ".png" : ".jpg";

      const baseName = String(file.name || "cover").replace(/\.[^/.]+$/, "") || "cover";

      const fileName = `${baseName}-square${extension}`;
      const squareFile = new File([blob], fileName, { type: outputMimeType });

      return {
        file: squareFile,
        fileName,
        mimeType: outputMimeType
      };
    }

    async function createGeneratedCover(text = "sfera") {
      const canvas = document.createElement("canvas");
      canvas.width = COVER_SIZE;
      canvas.height = COVER_SIZE;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Не удалось создать обложку");
      }

      const gradient = ctx.createLinearGradient(0, 0, COVER_SIZE, COVER_SIZE);
      gradient.addColorStop(0, "#120a24");
      gradient.addColorStop(0.55, "#3b1f73");
      gradient.addColorStop(1, "#8b5cf6");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, COVER_SIZE, COVER_SIZE);

      ctx.fillStyle = "rgba(255,255,255,0.06)";
      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath();
        ctx.arc(
          Math.random() * COVER_SIZE,
          Math.random() * COVER_SIZE,
          18 + Math.random() * 44,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.font = "700 34px 'Space Grotesk', sans-serif";
      const title = String(text || "sfera").trim().slice(0, 18) || "sfera";
      ctx.fillText("SFERA", COVER_SIZE / 2, 210);
      ctx.font = "600 26px 'Space Grotesk', sans-serif";
      ctx.fillText(title.toUpperCase(), COVER_SIZE / 2, 265);
      ctx.font = "500 16px 'Space Grotesk', sans-serif";
      ctx.fillStyle = "rgba(235,225,255,0.85)";
      ctx.fillText("album upload", COVER_SIZE / 2, 305);

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const fileName = "sfera-auto-cover.jpg";
      return {
        file: new File([blob], fileName, { type: "image/jpeg" }),
        fileName,
        mimeType: "image/jpeg"
      };
    }

    function parseCommaList(value, maxItems, normalize = (item) => item) {
      const entries = String(value || "")
        .split(",")
        .map((entry) => normalize(entry.trim()))
        .filter(Boolean);

      const unique = [];
      const seen = new Set();

      for (const entry of entries) {
        const key = entry.toLowerCase();
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        unique.push(entry);
      }

      if (unique.length > maxItems) {
        throw new Error(`Максимум ${maxItems} значений`);
      }

      return unique;
    }

    function normalizeTag(tag) {
      return String(tag || "").replace(/^#+/, "").toLowerCase();
    }

    function revokeTrackLyricsSyncObjectUrl() {
      if (trackLyricsSyncState.objectUrl) {
        URL.revokeObjectURL(trackLyricsSyncState.objectUrl);
        trackLyricsSyncState.objectUrl = "";
      }
    }

    function clearTrackLyricsSyncGeneratedValueIfOwned() {
      if (!trackLyricsSyncElements.output) {
        trackLyricsSyncState.lastGeneratedText = "";
        return;
      }
      const current = String(trackLyricsSyncElements.output.value || "").trim();
      const generated = String(trackLyricsSyncState.lastGeneratedText || "").trim();
      if (generated && current === generated) {
        trackLyricsSyncElements.output.value = "";
      }
      trackLyricsSyncState.lastGeneratedText = "";
    }

    function formatTrackLyricsSyncTimestamp(ms) {
      const centisecondsTotal = Math.max(0, Math.round(Number(ms || 0) / 10));
      const minutes = Math.floor(centisecondsTotal / 6000);
      const seconds = Math.floor((centisecondsTotal % 6000) / 100);
      const centiseconds = centisecondsTotal % 100;
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
    }

    function formatTrackLyricsSyncClock(totalSeconds) {
      const safeSeconds = Math.max(0, Number(totalSeconds || 0));
      const minutes = Math.floor(safeSeconds / 60);
      const seconds = Math.floor(safeSeconds % 60);
      return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function setTrackLyricsSyncRangeProgress(ratio) {
      if (!trackLyricsSyncElements.seekRange) {
        return;
      }
      const safeRatio = Math.max(0, Math.min(1, Number(ratio || 0)));
      trackLyricsSyncElements.seekRange.style.setProperty("--range-progress", `${Math.round(safeRatio * 100)}%`);
    }

    function stripTrackLyricsTimingMarkup(line) {
      return String(line || "")
        .replace(/\[[0-9]{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g, "")
        .replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function extractTrackLyricsSyncLines() {
      const plainLines = String(trackLyricsSyncElements.plainInput?.value || "")
        .split(/\r?\n/)
        .map((line) => String(line || "").trim())
        .filter(Boolean);
      if (plainLines.length > 0) {
        return plainLines;
      }

      return String(trackLyricsSyncElements.output?.value || "")
        .split(/\r?\n/)
        .map(stripTrackLyricsTimingMarkup)
        .filter(Boolean);
    }

    function getTrackLyricsSyncSignature(lines) {
      const safeLines = Array.isArray(lines) ? lines : [];
      return safeLines.map((line) => String(line || "").trim()).filter(Boolean).join("\n");
    }

    function getTrackLyricsSyncRecordedCount() {
      return trackLyricsSyncState.entries.filter((entry) => Number.isFinite(entry?.timeMs)).length;
    }

    function buildTrackLyricsSyncLrc() {
      return trackLyricsSyncState.entries
        .filter((entry) => Number.isFinite(entry?.timeMs))
        .map((entry) => `[${formatTrackLyricsSyncTimestamp(entry.timeMs)}]${entry.text}`)
        .join("\n");
    }

    function getTrackLyricsSyncAudioFileSignature(file) {
      if (!file) {
        return "";
      }
      return [
        String(file.name || ""),
        String(file.size || 0),
        String(file.lastModified || 0)
      ].join(":");
    }

    function applyTrackLyricsSyncGeneratedValue() {
      if (!trackLyricsSyncElements.output) {
        return;
      }
      const nextValue = buildTrackLyricsSyncLrc();
      trackLyricsSyncElements.output.value = nextValue;
      trackLyricsSyncState.lastGeneratedText = nextValue;
    }

    function syncTrackLyricsAudioPreviewFromFile() {
      if (!trackLyricsSyncElements.audio) {
        return false;
      }

      const file = elements.trackFile?.files?.[0] || null;
      if (!file || !normalizeAudioMime(file)) {
        revokeTrackLyricsSyncObjectUrl();
        trackLyricsSyncState.audioFileSignature = "";
        trackLyricsSyncElements.audio.pause();
        trackLyricsSyncElements.audio.removeAttribute("src");
        trackLyricsSyncElements.audio.load();
        updateTrackLyricsSyncPlayerUi();
        return false;
      }

      const nextSignature = getTrackLyricsSyncAudioFileSignature(file);
      if (
        trackLyricsSyncElements.audio.src
        && trackLyricsSyncState.audioFileSignature
        && trackLyricsSyncState.audioFileSignature === nextSignature
      ) {
        updateTrackLyricsSyncVolumeUi();
        updateTrackLyricsSyncPlayerUi();
        return true;
      }

      revokeTrackLyricsSyncObjectUrl();
      trackLyricsSyncState.objectUrl = URL.createObjectURL(file);
      trackLyricsSyncState.audioFileSignature = nextSignature;
      trackLyricsSyncElements.audio.src = trackLyricsSyncState.objectUrl;
      trackLyricsSyncElements.audio.playbackRate = 1;
      trackLyricsSyncElements.audio.defaultPlaybackRate = 1;
      trackLyricsSyncElements.audio.load();
      updateTrackLyricsSyncVolumeUi();
      updateTrackLyricsSyncPlayerUi();
      return true;
    }

    function findLastMarkedTrackLyricsSyncIndex() {
      for (let index = trackLyricsSyncState.entries.length - 1; index >= 0; index -= 1) {
        if (Number.isFinite(trackLyricsSyncState.entries[index]?.timeMs)) {
          return index;
        }
      }
      return -1;
    }

    function updateTrackLyricsSyncVolumeUi() {
      if (!trackLyricsSyncElements.volumeRange || !trackLyricsSyncElements.volumeValue || !trackLyricsSyncElements.audio) {
        return;
      }
      const volume = Math.max(0, Math.min(1, Number(trackLyricsSyncElements.audio.muted ? 0 : trackLyricsSyncElements.audio.volume)));
      const percent = String(Math.round(volume * 100));
      trackLyricsSyncElements.volumeRange.value = percent;
      trackLyricsSyncElements.volumeValue.textContent = `${percent}%`;
    }

    function updateTrackLyricsSyncPlayerUi() {
      const { audio, player, playBtn, restartBtn, seekRange, meta, currentTime, duration } = trackLyricsSyncElements;
      if (!audio || !player) {
        return;
      }

      const hasAudio = Boolean(audio.getAttribute("src"));
      const isPlaying = hasAudio && !audio.paused;
      const safeDuration = Number(audio.duration);
      const safeCurrentTime = Number(audio.currentTime);
      const hasDuration = Number.isFinite(safeDuration) && safeDuration > 0;
      const ratio = hasDuration ? Math.max(0, Math.min(1, safeCurrentTime / safeDuration)) : 0;
      const currentFile = elements.trackFile?.files?.[0] || null;

      player.classList.toggle("is-ready", hasAudio);
      player.classList.toggle("is-playing", isPlaying);

      if (meta) {
        if (!hasAudio) {
          meta.textContent = "Выбери аудиофайл трека";
        } else if (currentFile?.name) {
          meta.textContent = currentFile.name;
        } else {
          meta.textContent = "Предпрослушивание готово";
        }
      }

      if (currentTime) {
        currentTime.textContent = formatTrackLyricsSyncClock(hasAudio ? safeCurrentTime : 0);
      }
      if (duration) {
        duration.textContent = formatTrackLyricsSyncClock(hasDuration ? safeDuration : 0);
      }

      if (seekRange) {
        seekRange.disabled = !hasAudio || !hasDuration;
        seekRange.value = hasDuration ? String(Math.round(ratio * 1000)) : "0";
      }
      setTrackLyricsSyncRangeProgress(ratio);

      if (playBtn) {
        playBtn.disabled = !hasAudio;
        if (window.SferaIconKit?.setButtonIcon) {
          window.SferaIconKit.setButtonIcon(playBtn, isPlaying ? "pause" : "play", {
            iconClassName: "sf-icon--sm"
          });
        }
        playBtn.setAttribute("aria-label", isPlaying ? "Пауза предпрослушивания" : "Воспроизвести предпрослушивание");
        playBtn.title = isPlaying ? "Пауза предпрослушивания" : "Воспроизвести предпрослушивание";
      }

      if (restartBtn) {
        restartBtn.disabled = !hasAudio;
        if (window.SferaIconKit?.setButtonIcon) {
          window.SferaIconKit.setButtonIcon(restartBtn, "rewind", {
            iconClassName: "sf-icon--sm"
          });
        }
      }
    }

    function renderTrackLyricsSyncState() {
      const totalLines = trackLyricsSyncState.entries.length;
      const recordedLines = getTrackLyricsSyncRecordedCount();
      const isCompleted = totalLines > 0 && recordedLines >= totalLines;
      const currentLineIndex = totalLines > 0
        ? Math.max(0, Math.min(totalLines - 1, recordedLines === 0 ? 0 : recordedLines - 1))
        : -1;
      const nextLineIndex = totalLines > 0 && currentLineIndex + 1 < totalLines ? currentLineIndex + 1 : -1;
      const currentLine = currentLineIndex >= 0 ? trackLyricsSyncState.entries[currentLineIndex]?.text || "" : "";
      const nextLine = nextLineIndex >= 0 ? trackLyricsSyncState.entries[nextLineIndex]?.text || "" : "";

      if (trackLyricsSyncElements.status) {
        trackLyricsSyncElements.status.classList.toggle("recording", trackLyricsSyncState.active);
        if (trackLyricsSyncState.active) {
          trackLyricsSyncElements.status.textContent = `Запись: ${recordedLines} из ${totalLines}`;
        } else if (isCompleted) {
          trackLyricsSyncElements.status.textContent = `Готово: ${recordedLines} из ${totalLines}`;
        } else if (totalLines > 0) {
          trackLyricsSyncElements.status.textContent = `Готово к записи: ${recordedLines} из ${totalLines}`;
        } else {
          trackLyricsSyncElements.status.textContent = "Строки будут взяты из поля «Основной текст песни».";
        }
      }

      if (trackLyricsSyncElements.current) {
        trackLyricsSyncElements.current.replaceChildren();

        const title = document.createElement("strong");
        title.textContent = isCompleted
          ? "Tap sync завершён"
          : totalLines > 0
            ? "Очередь строк"
            : "Что будет синхронизироваться";
        trackLyricsSyncElements.current.appendChild(title);

        const currentWrap = document.createElement("div");
        currentWrap.className = "publish-tap-sync-line is-current";
        const currentLabel = document.createElement("span");
        currentLabel.className = "publish-tap-sync-line-label";
        currentLabel.textContent = isCompleted ? "Последняя строка" : "Сейчас";
        const currentText = document.createElement("span");
        currentText.textContent = isCompleted
          ? "Все строки уже записаны. Можно перепроверить LRC ниже или начать запись заново."
          : currentLine || "Добавь текст песни по строкам, затем нажми «Начать по Enter».";
        currentWrap.append(currentLabel, currentText);
        trackLyricsSyncElements.current.appendChild(currentWrap);

        if (!isCompleted && nextLine) {
          const nextWrap = document.createElement("div");
          nextWrap.className = "publish-tap-sync-line is-next";
          const nextLabel = document.createElement("span");
          nextLabel.className = "publish-tap-sync-line-label";
          nextLabel.textContent = "Следующая строка";
          const nextText = document.createElement("span");
          nextText.textContent = nextLine;
          nextWrap.append(nextLabel, nextText);
          trackLyricsSyncElements.current.appendChild(nextWrap);
        }
      }

      if (trackLyricsSyncElements.nextBtn) {
        trackLyricsSyncElements.nextBtn.disabled = !trackLyricsSyncState.active || totalLines === 0 || isCompleted;
      }
      if (trackLyricsSyncElements.undoBtn) {
        trackLyricsSyncElements.undoBtn.disabled = recordedLines === 0;
      }
      if (trackLyricsSyncElements.startBtn) {
        trackLyricsSyncElements.startBtn.textContent = trackLyricsSyncState.active
          ? "Пауза записи"
          : isCompleted
            ? "Записать заново"
            : recordedLines > 0
              ? "Продолжить по Enter"
              : "Начать по Enter";
      }
    }

    function resetTrackLyricsSyncComposer(options = {}) {
      const { clearGeneratedValue = true, preserveAudio = false } = options;

      if (clearGeneratedValue) {
        clearTrackLyricsSyncGeneratedValueIfOwned();
      }

      trackLyricsSyncState.active = false;
      trackLyricsSyncState.entries = [];
      trackLyricsSyncState.cursor = 0;

      if (trackLyricsSyncElements.audio) {
        trackLyricsSyncElements.audio.pause();
        trackLyricsSyncElements.audio.currentTime = 0;
        if (!preserveAudio) {
          revokeTrackLyricsSyncObjectUrl();
          trackLyricsSyncState.audioFileSignature = "";
          trackLyricsSyncElements.audio.removeAttribute("src");
          trackLyricsSyncElements.audio.load();
        }
      }

      renderTrackLyricsSyncState();
      updateTrackLyricsSyncVolumeUi();
      updateTrackLyricsSyncPlayerUi();
    }

    function ensureTrackLyricsSyncComposerPrepared() {
      const lyricsLines = extractTrackLyricsSyncLines();
      if (lyricsLines.length === 0) {
        throw new Error("Сначала вставь обычный текст песни построчно");
      }

      const hasPreviewAudio = syncTrackLyricsAudioPreviewFromFile();
      if (!hasPreviewAudio) {
        throw new Error("Сначала выбери аудиофайл трека");
      }

      const nextSignature = getTrackLyricsSyncSignature(lyricsLines);
      const currentSignature = getTrackLyricsSyncSignature(trackLyricsSyncState.entries.map((entry) => entry.text));
      const shouldReset = trackLyricsSyncState.entries.length === 0
        || trackLyricsSyncState.cursor >= trackLyricsSyncState.entries.length
        || nextSignature !== currentSignature;

      if (shouldReset) {
        trackLyricsSyncState.entries = lyricsLines.map((text) => ({
          text,
          timeMs: null
        }));
        trackLyricsSyncState.cursor = 0;
        applyTrackLyricsSyncGeneratedValue();
        try {
          trackLyricsSyncElements.audio.currentTime = 0;
        } catch {
          // ignore currentTime errors
        }
      }

      renderTrackLyricsSyncState();
      updateTrackLyricsSyncPlayerUi();
    }

    async function toggleTrackLyricsSyncRecording() {
      if (!trackLyricsSyncElements.audio) {
        return;
      }

      if (trackLyricsSyncState.active) {
        trackLyricsSyncState.active = false;
        trackLyricsSyncElements.audio.pause();
        renderTrackLyricsSyncState();
        updateTrackLyricsSyncPlayerUi();
        setStatus?.("Tap sync поставлен на паузу", "success");
        return;
      }

      ensureTrackLyricsSyncComposerPrepared();
      trackLyricsSyncState.active = true;
      try {
        await trackLyricsSyncElements.audio.play();
      } catch {
        // ignore playback errors inside user gesture
      }
      renderTrackLyricsSyncState();
      updateTrackLyricsSyncPlayerUi();
      setStatus?.("Tap sync активирован. Жми Enter или кнопку «Следующая строка» в момент начала строки.", "success");
    }

    async function toggleTrackLyricsSyncPreviewPlayback() {
      if (!trackLyricsSyncElements.audio || !trackLyricsSyncElements.audio.getAttribute("src")) {
        return;
      }

      if (trackLyricsSyncElements.audio.paused) {
        try {
          await trackLyricsSyncElements.audio.play();
        } catch {
          // ignore playback errors inside user gesture
        }
      } else {
        trackLyricsSyncElements.audio.pause();
        if (trackLyricsSyncState.active) {
          trackLyricsSyncState.active = false;
          renderTrackLyricsSyncState();
          setStatus?.("Tap sync поставлен на паузу", "success");
        }
      }

      updateTrackLyricsSyncPlayerUi();
    }

    function restartTrackLyricsSyncPreview() {
      if (!trackLyricsSyncElements.audio || !trackLyricsSyncElements.audio.getAttribute("src")) {
        return;
      }

      try {
        trackLyricsSyncElements.audio.currentTime = 0;
      } catch {
        // ignore currentTime errors
      }

      updateTrackLyricsSyncPlayerUi();
    }

    function captureTrackLyricsSyncTimestamp() {
      if (!trackLyricsSyncState.active) {
        return;
      }

      const currentEntry = trackLyricsSyncState.entries[trackLyricsSyncState.cursor];
      if (!currentEntry || !trackLyricsSyncElements.audio) {
        trackLyricsSyncState.active = false;
        renderTrackLyricsSyncState();
        return;
      }

      const rawTimestamp = Math.max(0, Math.round(Number(trackLyricsSyncElements.audio.currentTime || 0) * 1000));
      const lastMarkedIndex = findLastMarkedTrackLyricsSyncIndex();
      const previousTimestamp = lastMarkedIndex >= 0 ? Number(trackLyricsSyncState.entries[lastMarkedIndex]?.timeMs) : NaN;
      currentEntry.timeMs = Number.isFinite(previousTimestamp)
        ? Math.max(previousTimestamp + 10, rawTimestamp)
        : rawTimestamp;
      trackLyricsSyncState.cursor = Math.min(trackLyricsSyncState.entries.length, trackLyricsSyncState.cursor + 1);
      applyTrackLyricsSyncGeneratedValue();

      if (trackLyricsSyncState.cursor >= trackLyricsSyncState.entries.length) {
        trackLyricsSyncState.active = false;
        setStatus?.("Tap sync завершён. Проверь тайминги и публикуй трек.", "success");
      }

      renderTrackLyricsSyncState();
    }

    function undoTrackLyricsSyncLine() {
      const lastMarkedIndex = findLastMarkedTrackLyricsSyncIndex();
      if (lastMarkedIndex < 0) {
        return;
      }

      trackLyricsSyncState.entries[lastMarkedIndex].timeMs = null;
      trackLyricsSyncState.cursor = lastMarkedIndex;
      applyTrackLyricsSyncGeneratedValue();
      renderTrackLyricsSyncState();
    }

    function bindTrackLyricsSyncComposer() {
      if (trackLyricsSyncComposerBound) {
        return;
      }
      if (!trackLyricsSyncElements.startBtn || !trackLyricsSyncElements.nextBtn || !trackLyricsSyncElements.clearBtn) {
        return;
      }
      trackLyricsSyncComposerBound = true;

      trackLyricsSyncElements.startBtn.addEventListener("click", async () => {
        try {
          await toggleTrackLyricsSyncRecording();
        } catch (error) {
          setStatus?.(error.message || String(error || "Ошибка"), "error");
        }
      });

      trackLyricsSyncElements.nextBtn.addEventListener("click", () => {
        captureTrackLyricsSyncTimestamp();
      });

      trackLyricsSyncElements.undoBtn?.addEventListener("click", () => {
        undoTrackLyricsSyncLine();
      });

      trackLyricsSyncElements.clearBtn.addEventListener("click", () => {
        resetTrackLyricsSyncComposer({ clearGeneratedValue: true, preserveAudio: true });
        syncTrackLyricsAudioPreviewFromFile();
      });

      trackLyricsSyncElements.playBtn?.addEventListener("click", async () => {
        await toggleTrackLyricsSyncPreviewPlayback();
      });

      trackLyricsSyncElements.restartBtn?.addEventListener("click", () => {
        restartTrackLyricsSyncPreview();
      });

      trackLyricsSyncElements.seekRange?.addEventListener("input", () => {
        const safeRange = Math.max(0, Math.min(1000, Number(trackLyricsSyncElements.seekRange?.value || 0)));
        setTrackLyricsSyncRangeProgress(safeRange / 1000);
      });

      trackLyricsSyncElements.seekRange?.addEventListener("change", () => {
        if (!trackLyricsSyncElements.audio) {
          return;
        }
        const safeDuration = Number(trackLyricsSyncElements.audio.duration);
        if (!Number.isFinite(safeDuration) || safeDuration <= 0) {
          return;
        }
        const safeRange = Math.max(0, Math.min(1000, Number(trackLyricsSyncElements.seekRange?.value || 0)));
        trackLyricsSyncElements.audio.currentTime = (safeRange / 1000) * safeDuration;
        updateTrackLyricsSyncPlayerUi();
      });

      elements.trackFile?.addEventListener("change", () => {
        resetTrackLyricsSyncComposer({ clearGeneratedValue: true, preserveAudio: false });
        syncTrackLyricsAudioPreviewFromFile();
      });

      trackLyricsSyncElements.volumeRange?.addEventListener("input", () => {
        if (!trackLyricsSyncElements.audio) {
          return;
        }
        const nextVolume = Math.max(0, Math.min(1, Number(trackLyricsSyncElements.volumeRange.value || 0) / 100));
        trackLyricsSyncElements.audio.volume = nextVolume;
        trackLyricsSyncElements.audio.muted = nextVolume <= 0.001;
        updateTrackLyricsSyncVolumeUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("volumechange", () => {
        updateTrackLyricsSyncVolumeUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("play", () => {
        updateTrackLyricsSyncPlayerUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("pause", () => {
        updateTrackLyricsSyncPlayerUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("timeupdate", () => {
        updateTrackLyricsSyncPlayerUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("loadedmetadata", () => {
        updateTrackLyricsSyncPlayerUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("durationchange", () => {
        updateTrackLyricsSyncPlayerUi();
      });

      trackLyricsSyncElements.audio?.addEventListener("ended", () => {
        if (trackLyricsSyncState.active) {
          trackLyricsSyncState.active = false;
          renderTrackLyricsSyncState();
        }
        updateTrackLyricsSyncPlayerUi();
      });

      document.addEventListener("keydown", (event) => {
        if (!trackLyricsSyncState.active) {
          return;
        }
        const target = event.target;
        if (target instanceof HTMLElement && target.closest("input, textarea, select, button, a")) {
          return;
        }

        if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        event.preventDefault();
        captureTrackLyricsSyncTimestamp();
      });

      renderTrackLyricsSyncState();
      updateTrackLyricsSyncVolumeUi();
      updateTrackLyricsSyncPlayerUi();
    }

    function updatePremiereFieldVisibility() {
      if (!elements.trackPublishMode || !elements.trackPremiereAtWrap || !elements.trackPremiereAt) {
        return;
      }

      const isPremiere = elements.trackPublishMode.value === "premiere";
      elements.trackPremiereAtWrap.classList.toggle("hidden", !isPremiere);
      elements.trackPremiereAt.required = isPremiere;

      if (!isPremiere) {
        elements.trackPremiereAt.value = "";
      }
    }

    bindTrackLyricsSyncComposer();

    return {
      extractBase64,
      readFileAsDataUrl,
      loadImage,
      canvasToBlob,
      ensureImageFile,
      normalizeAudioMime,
      prepareAudio,
      prepareImage,
      prepareCover,
      createGeneratedCover,
      parseCommaList,
      normalizeTag,
      updatePremiereFieldVisibility,
      resetTrackLyricsSyncComposer
    };
  }

  window.SferaPublishHelpers = { createAppPublishHelpers };
})();
