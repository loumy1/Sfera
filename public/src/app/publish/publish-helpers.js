(() => {
  "use strict";

  function createAppPublishHelpers(ctx) {
    const { elements, constants = {}, deps = {} } = ctx || {};
    const { MAX_MP3_BYTES, MAX_WAV_BYTES, MAX_IMAGE_BYTES, COVER_SIZE } = constants;
    const { getAudioDurationFromFile } = deps;

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

      if (!["image/png", "image/jpeg"].includes(file.type)) {
        throw new Error("Допускаются только PNG или JPG");
      }

      if (file.size > MAX_IMAGE_BYTES) {
        throw new Error("Изображение больше 5 МБ");
      }
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
      ensureImageFile(file);

      return {
        fileBase64: extractBase64(await readFileAsDataUrl(file)),
        fileName: file.name,
        mimeType: file.type
      };
    }

    async function prepareCover(file) {
      ensureImageFile(file);

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

      const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const blob = await canvasToBlob(canvas, mimeType, mimeType === "image/jpeg" ? 0.92 : undefined);
      const extension = mimeType === "image/png" ? ".png" : ".jpg";

      const baseName = String(file.name || "cover").replace(/\.[^/.]+$/, "") || "cover";

      const fileName = `${baseName}-square${extension}`;
      const squareFile = new File([blob], fileName, { type: mimeType });

      return {
        file: squareFile,
        fileName,
        mimeType
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
      updatePremiereFieldVisibility
    };
  }

  window.SferaPublishHelpers = { createAppPublishHelpers };
})();
