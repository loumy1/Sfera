(() => {
  "use strict";

  function createAppPublishAlbum(ctx) {
    const { state, elements, deps = {} } = ctx || {};
    const {
      api,
      t,
      formatDate,
      formatDuration,
      getAudioDurationFromUrl,
      getTrackAuthorsLabel,
      getBeatLicenseTypeLabel,
      isBeatTrack
    } = deps;

    function getAlbumLocalFiles() {
      return Array.from(elements.albumTrackFiles?.files || []);
    }

    function updateAlbumTrackFilesSummary() {
      if (!elements.albumTrackFilesSummary) {
        return;
      }

      const files = getAlbumLocalFiles();
      if (files.length === 0) {
        elements.albumTrackFilesSummary.textContent = t("albumFilesNone");
        return;
      }

      const totalMb = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0) / (1024 * 1024);
      elements.albumTrackFilesSummary.textContent = `${t("albumFilesSelected")}: ${files.length} • ${t("albumFilesSize")}: ${totalMb.toFixed(1)} МБ`;
    }

    async function resolveTrackDurationForAlbum(track) {
      if (!track || !track.id) {
        return 0;
      }

      const dtoDuration = Number(track.durationSec);
      if (Number.isFinite(dtoDuration) && dtoDuration > 0) {
        return dtoDuration;
      }

      const cached = Number(state.albumDurationCache[track.id]);
      if (Number.isFinite(cached) && cached > 0) {
        return cached;
      }

      if (!track.audioUrl) {
        return 0;
      }

      const duration = Math.max(1, Math.round(await getAudioDurationFromUrl(track.audioUrl)));
      state.albumDurationCache[track.id] = duration;
      return duration;
    }

    function getFileBaseTitle(fileName, fallback = "Track") {
      const base = String(fileName || "").replace(/\.[^/.]+$/, "").trim();

      return (base || fallback).slice(0, 120);
    }

    function collectBeatLicensesFromForm() {
      const currency = String(elements.beatLicenseCurrency?.value || "RUB").toUpperCase() === "USD" ? "USD" : "RUB";
      const candidates = [
        { type: "mp3", enabled: elements.beatLicenseMp3Enabled?.checked, price: elements.beatLicenseMp3Price?.value },
        { type: "wav", enabled: elements.beatLicenseWavEnabled?.checked, price: elements.beatLicenseWavPrice?.value },
        { type: "trackout", enabled: elements.beatLicenseTrackoutEnabled?.checked, price: elements.beatLicenseTrackoutPrice?.value },
        { type: "exclusive", enabled: elements.beatLicenseExclusiveEnabled?.checked, price: elements.beatLicenseExclusivePrice?.value }
      ];

      const licenses = [];
      for (const item of candidates) {
        if (!item.enabled) {
          continue;
        }
        const price = Number(item.price);
        if (!Number.isFinite(price) || price < 0) {
          throw new Error(`Укажи корректную цену для лицензии ${getBeatLicenseTypeLabel(item.type)}`);
        }
        licenses.push({
          type: item.type,
          price: Math.round(price),
          currency
        });
      }

      if (licenses.length === 0) {
        throw new Error("Выбери хотя бы одну лицензию для бита");
      }

      return licenses;
    }

    async function uploadAlbumLocalTrack(localTrack, albumMeta) {
      const requestData = new FormData();
      requestData.append("title", localTrack.title);
      requestData.append("description", albumMeta.description || "");
      requestData.append("genre", albumMeta.genre);
      requestData.append("publishMode", "public");
      requestData.append("premiereAt", "");
      requestData.append("authors", albumMeta.authors.join(", "));
      requestData.append("producers", albumMeta.producers.join(", "));
      requestData.append("hashtags", albumMeta.hashtags.join(", "));
      if (Number.isFinite(Number(localTrack.durationSec)) && Number(localTrack.durationSec) > 0) {
        requestData.append("durationSec", String(Math.round(Number(localTrack.durationSec))));
      }
      requestData.append("audio", localTrack.audio.file, localTrack.audio.fileName);
      requestData.append("cover", albumMeta.trackCover.file, albumMeta.trackCover.fileName);

      const result = await api("/api/tracks", {
        method: "POST",
        body: requestData
      });

      if (!result?.track?.id) {
        throw new Error("Не удалось загрузить трек для альбома");
      }

      return result.track;
    }

    function syncAlbumTrackPickerSelectionFromDom() {
      if (!elements.albumTracksList) {
        return;
      }

      const selected = new Set(
        Array.isArray(state.albumTrackPicker?.selectedTrackIds) ? state.albumTrackPicker.selectedTrackIds : []
      );

      for (const input of elements.albumTracksList.querySelectorAll("input[name='albumTrack']")) {
        if (!(input instanceof HTMLInputElement)) {
          continue;
        }
        if (input.checked) {
          selected.add(input.value);
        } else {
          selected.delete(input.value);
        }
      }

      state.albumTrackPicker.selectedTrackIds = Array.from(selected);
    }

    function getAlbumTrackPickerSelectedIds() {
      syncAlbumTrackPickerSelectionFromDom();
      return Array.isArray(state.albumTrackPicker?.selectedTrackIds) ? [...state.albumTrackPicker.selectedTrackIds] : [];
    }

    function setAlbumTrackPickerFilterMode(mode) {
      const normalized = mode === "selected" ? "selected" : "all";
      state.albumTrackPicker.filterMode = normalized;

      if (elements.albumTracksFilterAllBtn) {
        elements.albumTracksFilterAllBtn.classList.toggle("active", normalized === "all");
      }
      if (elements.albumTracksFilterSelectedBtn) {
        elements.albumTracksFilterSelectedBtn.classList.toggle("active", normalized === "selected");
      }
    }

    function getAlbumTrackSearchHaystack(track) {
      const parts = [
        track?.title || "",
        track?.genre || "",
        Array.isArray(track?.authors) ? track.authors.join(" ") : "",
        Array.isArray(track?.producers) ? track.producers.join(" ") : "",
        track?.description || ""
      ];
      return parts.join(" ").toLowerCase();
    }

    function compareAlbumPickerTracks(a, b, sortKey) {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      const aTitle = String(a?.title || "").toLocaleLowerCase("ru-RU");
      const bTitle = String(b?.title || "").toLocaleLowerCase("ru-RU");

      if (sortKey === "oldest") {
        return aTime - bTime;
      }
      if (sortKey === "title_asc") {
        return aTitle.localeCompare(bTitle, "ru-RU");
      }
      if (sortKey === "title_desc") {
        return bTitle.localeCompare(aTitle, "ru-RU");
      }
      return bTime - aTime;
    }

    function renderAlbumTrackOptions() {
      if (!elements.albumTracksList) {
        return;
      }

      syncAlbumTrackPickerSelectionFromDom();

      elements.albumTracksList.innerHTML = "";
      updateAlbumTrackFilesSummary();

      if (elements.albumTracksSearchInput) {
        elements.albumTracksSearchInput.value = String(state.albumTrackPicker.searchQuery || "");
      }
      if (elements.albumTracksSortSelect) {
        elements.albumTracksSortSelect.value = String(state.albumTrackPicker.sort || "newest");
      }
      setAlbumTrackPickerFilterMode(state.albumTrackPicker.filterMode);

      if (!state.user) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("albumPickerNeedLogin");
        elements.albumTracksList.appendChild(empty);
        if (elements.albumTracksInfo) {
          elements.albumTracksInfo.textContent = t("albumPickerNeedLoginShort");
        }
        return;
      }

      const ownTracks = state.tracks.filter((track) => track.userId === state.user.id && !isBeatTrack(track));
      const ownTrackIds = new Set(ownTracks.map((track) => track.id));
      const selectedSet = new Set(
        (Array.isArray(state.albumTrackPicker.selectedTrackIds) ? state.albumTrackPicker.selectedTrackIds : [])
          .filter((trackId) => ownTrackIds.has(trackId))
      );
      state.albumTrackPicker.selectedTrackIds = Array.from(selectedSet);

      if (ownTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("albumPickerNoOwnTracks");
        elements.albumTracksList.appendChild(empty);
        if (elements.albumTracksInfo) {
          elements.albumTracksInfo.textContent = t("albumPickerNoOwnTracksShort");
        }
        return;
      }

      const searchQuery = String(state.albumTrackPicker.searchQuery || "").trim().toLowerCase();
      const sortKey = String(state.albumTrackPicker.sort || "newest");
      const filterMode = state.albumTrackPicker.filterMode === "selected" ? "selected" : "all";

      const filteredTracks = ownTracks
        .filter((track) => {
          if (filterMode === "selected" && !selectedSet.has(track.id)) {
            return false;
          }
          if (!searchQuery) {
            return true;
          }
          return getAlbumTrackSearchHaystack(track).includes(searchQuery);
        })
        .sort((a, b) => compareAlbumPickerTracks(a, b, sortKey));

      if (elements.albumTracksInfo) {
        const selectedCount = selectedSet.size;
        elements.albumTracksInfo.textContent =

          `${t("albumPickerFound")}: ${filteredTracks.length} ${t("albumPickerTotal")} ${ownTracks.length} • ${t("albumPickerSelectedCount")}: ${selectedCount}`;
      }

      if (filteredTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = filterMode === "selected"
          ? t("albumPickerEmptySelected")
          : t("albumPickerEmptySearch");
        elements.albumTracksList.appendChild(empty);
        return;
      }

      for (const track of filteredTracks) {
        const label = document.createElement("label");
        label.className = "album-track-option";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.name = "albumTrack";
        checkbox.value = track.id;
        checkbox.checked = selectedSet.has(track.id);

        const content = document.createElement("div");
        content.className = "album-track-option-main";

        const title = document.createElement("strong");
        title.className = "album-track-option-title";
        const durationLabel = Number.isFinite(Number(track.durationSec)) && Number(track.durationSec) > 0
          ? ` • ${formatDuration(Number(track.durationSec))}`
          : "";
        title.textContent = `${track.title}${durationLabel}`;

        const meta = document.createElement("span");
        meta.className = "album-track-option-meta";
        const authorsLabel = getTrackAuthorsLabel(track);
        meta.textContent = `${authorsLabel} • ${track.genre || "Без жанра"} • ${formatDate(track.createdAt)}`;

        content.append(title, meta);
        label.append(checkbox, content);

        checkbox.addEventListener("change", () => {
          const nextSelected = new Set(
            Array.isArray(state.albumTrackPicker.selectedTrackIds) ? state.albumTrackPicker.selectedTrackIds : []
          );
          if (checkbox.checked) {
            nextSelected.add(track.id);
          } else {
            nextSelected.delete(track.id);
          }
          state.albumTrackPicker.selectedTrackIds = Array.from(nextSelected);
          renderAlbumTrackOptions();
        });

        elements.albumTracksList.appendChild(label);
      }
    }

    return {
      getAlbumLocalFiles,
      updateAlbumTrackFilesSummary,
      resolveTrackDurationForAlbum,
      getFileBaseTitle,
      collectBeatLicensesFromForm,
      uploadAlbumLocalTrack,
      syncAlbumTrackPickerSelectionFromDom,
      getAlbumTrackPickerSelectedIds,
      setAlbumTrackPickerFilterMode,
      getAlbumTrackSearchHaystack,
      compareAlbumPickerTracks,
      renderAlbumTrackOptions
    };
  }

  window.SferaPublishAlbum = { createAppPublishAlbum };
})();
