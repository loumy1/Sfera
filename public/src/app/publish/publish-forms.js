(() => {
  "use strict";

  function createAppPublishForms(ctx) {
    const { state, elements, deps = {} } = ctx || {};
    const {
      api,
      setStatus,
      parseLocalDateTimeToIso,
      refreshTracks,
      refreshAlbums,
      refreshPlaylists,
      renderAll,
      prepareAudio,
      prepareCover,
      parseCommaList,
      normalizeTag,
      getAlbumTrackPickerSelectedIds,
      getAlbumLocalFiles,
      getFileBaseTitle,
      createGeneratedCover,
      uploadAlbumLocalTrack,
      updateAlbumTrackFilesSummary,
      collectBeatLicensesFromForm,
      renderAlbumTrackOptions,
      setAlbumTrackPickerFilterMode,
      updatePremiereFieldVisibility
    } = deps;

    let publishHandlersBound = false;

    function bindPublishUiHandlers() {
      if (publishHandlersBound) {
        return;
      }
      publishHandlersBound = true;

      elements.uploadForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!state.user) {
          return;
        }

        try {
          const title = elements.trackTitle.value.trim();
          const description = elements.trackDescription.value.trim();
          const genre = elements.trackGenre.value.trim();
          const publishMode = String(elements.trackPublishMode?.value || "public").trim().toLowerCase();
          const premiereAtIso = publishMode === "premiere"
            ? parseLocalDateTimeToIso(String(elements.trackPremiereAt?.value || ""))
            : null;
          const authors = parseCommaList(elements.trackAuthors.value, 10);
          const producers = parseCommaList(elements.trackProducers.value, 10);
          const hashtags = parseCommaList(elements.trackHashtags.value, 5, normalizeTag);

          const audioFile = elements.trackFile.files?.[0];
          const coverFile = elements.trackCover.files?.[0];

          elements.uploadBtn.disabled = true;
          setStatus("Подготавливаю файлы...");

          const [audio, cover] = await Promise.all([
            prepareAudio(audioFile),
            prepareCover(coverFile)
          ]);

          const requestData = new FormData();
          requestData.append("title", title);
          requestData.append("description", description);
          requestData.append("genre", genre);
          requestData.append("publishMode", publishMode);
          requestData.append("premiereAt", premiereAtIso || "");
          requestData.append("authors", authors.join(", "));
          requestData.append("producers", producers.join(", "));
          requestData.append("hashtags", hashtags.join(", "));
          if (Number.isFinite(audio.durationSec) && audio.durationSec > 0) {
            requestData.append("durationSec", String(audio.durationSec));
          }
          requestData.append("audio", audio.file, audio.fileName);
          requestData.append("cover", cover.file, cover.fileName);

          setStatus("Публикую трек...");
          await api("/api/tracks", {
            method: "POST",
            body: requestData
          });

          elements.uploadForm.reset();
          await refreshTracks();
          await refreshAlbums();
          await refreshPlaylists();
          renderAll();
          setStatus("Трек опубликован", "success");
        } catch (error) {
          setStatus(error.message, "error");
        } finally {
          elements.uploadBtn.disabled = false;
        }
      });

      elements.albumForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!state.user) {
          return;
        }

        try {
          const title = elements.albumTitle.value.trim();
          const description = elements.albumDescription.value.trim();
          const genre = elements.albumGenre.value.trim();
          const authors = parseCommaList(elements.albumAuthors.value, 10);
          const producers = parseCommaList(elements.albumProducers.value, 10);
          const hashtags = parseCommaList(elements.albumHashtags.value, 5, normalizeTag);
          const selectedTrackIds = getAlbumTrackPickerSelectedIds();
          const localAlbumFiles = getAlbumLocalFiles();

          const coverFile = elements.albumCover.files?.[0];

          elements.albumPublishBtn.disabled = true;
          setStatus("Подготавливаю альбом...");

          if (selectedTrackIds.length === 0 && localAlbumFiles.length === 0) {
            throw new Error("Выбери хотя бы один трек или загрузи файлы для альбома");
          }

          const selectedTracks = selectedTrackIds
            .map((trackId) => state.tracks.find((track) => track.id === trackId))
            .filter(Boolean);

          if (selectedTracks.length !== selectedTrackIds.length) {
            throw new Error("Часть выбранных треков не найдена. Обнови страницу и попробуй снова");
          }

          const preparedLocalTracks = [];
          if (localAlbumFiles.length > 0) {
            let fileIndex = 0;
            for (const file of localAlbumFiles) {
              fileIndex += 1;
              setStatus(`Подготавливаю файл ${fileIndex}/${localAlbumFiles.length}...`);
              const preparedAudio = await prepareAudio(file);
              const localDurationSec = Number(preparedAudio.durationSec);
              preparedLocalTracks.push({
                title: getFileBaseTitle(file.name, `Track ${fileIndex}`),
                durationSec: Number.isFinite(localDurationSec) && localDurationSec > 0 ? Math.round(localDurationSec) : null,
                audio: preparedAudio
              });
            }
          }

          let preparedAlbumCover = null;
          if (coverFile) {
            preparedAlbumCover = await prepareCover(coverFile);
          } else if (preparedLocalTracks.length > 0) {
            preparedAlbumCover = await createGeneratedCover(title || "sfera");
          }

          const uploadedTrackIds = [];
          if (preparedLocalTracks.length > 0) {
            const albumMeta = {
              description,
              genre,
              authors,
              producers,
              hashtags,
              trackCover: preparedAlbumCover || await createGeneratedCover(title || "sfera")
            };

            let uploadIndex = 0;
            for (const localTrack of preparedLocalTracks) {
              uploadIndex += 1;
              setStatus(`Загружаю трек ${uploadIndex}/${preparedLocalTracks.length} для альбома...`);
              const createdTrack = await uploadAlbumLocalTrack(localTrack, albumMeta);
              uploadedTrackIds.push(createdTrack.id);
            }
          }

          const requestData = new FormData();
          requestData.append("title", title);
          requestData.append("description", description);
          requestData.append("genre", genre);
          requestData.append("authors", authors.join(", "));
          requestData.append("producers", producers.join(", "));
          requestData.append("hashtags", hashtags.join(", "));
          requestData.append("trackIds", [...selectedTrackIds, ...uploadedTrackIds].join(", "));

          if (preparedAlbumCover) {
            requestData.append("cover", preparedAlbumCover.file, preparedAlbumCover.fileName);
          }

          setStatus("Публикую альбом...");
          await api("/api/albums", {
            method: "POST",
            body: requestData
          });

          elements.albumForm.reset();
          state.albumTrackPicker.selectedTrackIds = [];
          state.albumTrackPicker.searchQuery = "";
          state.albumTrackPicker.sort = "newest";
          state.albumTrackPicker.filterMode = "all";
          updateAlbumTrackFilesSummary();
          await refreshTracks();
          await refreshAlbums();
          renderAll();
          setStatus("Альбом опубликован", "success");
        } catch (error) {
          setStatus(error.message, "error");
        } finally {
          elements.albumPublishBtn.disabled = false;
        }
      });

      if (elements.beatForm) {
        elements.beatForm.addEventListener("submit", async (event) => {
          event.preventDefault();

          if (!state.user) {
            return;
          }

          try {
            const title = String(elements.beatTitle?.value || "").trim();
            const genre = String(elements.beatGenre?.value || "").trim() || "Beat";
            const rootNote = String(elements.beatRootNote?.value || "").trim();
            const bpm = Number(elements.beatBpm?.value);
            const hashtags = parseCommaList(String(elements.beatHashtags?.value || ""), 5, normalizeTag);
            const description = String(elements.beatDescription?.value || "").trim();
            const licenses = collectBeatLicensesFromForm();

            if (!Number.isFinite(bpm) || bpm <= 0 || bpm > 400) {
              throw new Error("BPM должен быть от 1 до 400");
            }

            if (!rootNote) {
              throw new Error("Укажи корневую ноту бита");
            }

            const audioFile = elements.beatFile?.files?.[0];
            const coverFile = elements.beatCover?.files?.[0];

            if (!audioFile || !coverFile) {
              throw new Error("Для бита нужны аудиофайл и обложка");
            }

            elements.beatPublishBtn.disabled = true;
            setStatus("Подготавливаю бит...");

            const [audio, cover] = await Promise.all([
              prepareAudio(audioFile),
              prepareCover(coverFile)
            ]);

            const requestData = new FormData();
            requestData.append("kind", "beat");
            requestData.append("title", title);
            requestData.append("genre", genre);
            requestData.append("description", description);
            requestData.append("publishMode", "public");
            requestData.append("premiereAt", "");
            requestData.append("authors", "");
            requestData.append("producers", "");
            requestData.append("hashtags", hashtags.join(", "));
            requestData.append("bpm", String(Math.round(bpm)));
            requestData.append("rootNote", rootNote);
            requestData.append("beatLicenses", JSON.stringify(licenses));
            if (Number.isFinite(audio.durationSec) && audio.durationSec > 0) {
              requestData.append("durationSec", String(audio.durationSec));
            }
            requestData.append("audio", audio.file, audio.fileName);
            requestData.append("cover", cover.file, cover.fileName);

            setStatus("Публикую бит...");
            await api("/api/tracks", {
              method: "POST",
              body: requestData
            });

            elements.beatForm.reset();
            await refreshTracks();
            renderAll();
            setStatus("Бит опубликован", "success");
          } catch (error) {
            setStatus(error.message, "error");
          } finally {
            if (elements.beatPublishBtn) {
              elements.beatPublishBtn.disabled = false;
            }
          }
        });
      }

      if (elements.albumTrackFiles) {
        elements.albumTrackFiles.addEventListener("change", () => {
          updateAlbumTrackFilesSummary();
        });
      }

      if (elements.albumTracksSearchInput) {
        elements.albumTracksSearchInput.addEventListener("input", () => {
          state.albumTrackPicker.searchQuery = String(elements.albumTracksSearchInput.value || "");
          renderAlbumTrackOptions();
        });
        elements.albumTracksSearchInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
        });
      }

      if (elements.albumTracksSortSelect) {
        elements.albumTracksSortSelect.addEventListener("change", () => {
          state.albumTrackPicker.sort = String(elements.albumTracksSortSelect.value || "newest");
          renderAlbumTrackOptions();
        });
      }

      if (elements.albumTracksFilterAllBtn) {
        elements.albumTracksFilterAllBtn.addEventListener("click", () => {
          setAlbumTrackPickerFilterMode("all");
          renderAlbumTrackOptions();
        });
      }

      if (elements.albumTracksFilterSelectedBtn) {
        elements.albumTracksFilterSelectedBtn.addEventListener("click", () => {
          setAlbumTrackPickerFilterMode("selected");
          renderAlbumTrackOptions();
        });
      }

      if (elements.trackPublishMode) {
        elements.trackPublishMode.addEventListener("change", () => {
          updatePremiereFieldVisibility();
        });
      }
    }

    return { bindPublishUiHandlers };
  }

  window.SferaPublishForms = { createAppPublishForms };
})();
