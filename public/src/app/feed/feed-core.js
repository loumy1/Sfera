(() => {
  "use strict";

  function createAppFeedCore(ctx) {
    const { state, elements, deps = {} } = ctx || {};
    const {
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
    } = deps;
    let feedUiBindingsReady = false;

    function updateFeedStickyOffset() {
      const topbar = document.querySelector(".topbar");
      const topbarHeight = Math.max(72, Math.round(Number(topbar?.getBoundingClientRect?.().height || 96)));
      document.documentElement.style.setProperty("--feed-sticky-top", `${topbarHeight + 8}px`);
    }

    function renderFeedSectionToggleLabels() {
      if (elements.toggleFeedSelectionsBtn) {
        const selectionsHidden = Boolean(state.feedSectionsCollapsed?.selections);
        elements.toggleFeedSelectionsBtn.textContent = selectionsHidden
          ? t("feedToggleSelectionsShow")
          : t("feedToggleSelectionsHide");
        elements.toggleFeedSelectionsBtn.disabled = false;
      }
      if (elements.toggleFeedLibraryBtn) {
        const isHidden = Boolean(state.feedSectionsCollapsed?.library);
        elements.toggleFeedLibraryBtn.textContent = isHidden
          ? t("feedToggleLibraryShow")
          : t("feedToggleLibraryHide");
        elements.toggleFeedLibraryBtn.disabled = false;
      }
    }

    function applyFeedSectionVisibility() {
      if (elements.feedSelectionsWrap) {
        const hidden = Boolean(state.feedSectionsCollapsed?.selections);
        elements.feedSelectionsWrap.classList.toggle("hidden", hidden);
      }
      if (elements.feedLibraryWrap) {
        const hidden = Boolean(state.feedSectionsCollapsed?.library);
        elements.feedLibraryWrap.classList.toggle("hidden", hidden);
      }
      renderFeedSectionToggleLabels();
    }

    function toggleFeedSection(section) {
      if (!state.feedSectionsCollapsed) {
        state.feedSectionsCollapsed = { selections: false, library: false };
      }
      if (section !== "selections" && section !== "library") {
        return;
      }
      state.feedSectionsCollapsed[section] = !Boolean(state.feedSectionsCollapsed[section]);
      applyFeedSectionVisibility();
    }

    function ensureFeedUiBindings() {
      if (feedUiBindingsReady) {
        return;
      }
      feedUiBindingsReady = true;

      elements.toggleFeedSelectionsBtn?.addEventListener("click", () => {
        toggleFeedSection("selections");
      });
      elements.toggleFeedLibraryBtn?.addEventListener("click", () => {
        toggleFeedSection("library");
      });

      window.addEventListener("resize", updateFeedStickyOffset);
      window.addEventListener("orientationchange", updateFeedStickyOffset);
      updateFeedStickyOffset();
      applyFeedSectionVisibility();
    }

    function ensureFeedQuickFilters() {
      if (!state.feedQuickFilters || typeof state.feedQuickFilters !== "object") {
        state.feedQuickFilters = {
          genre: "",
          bpm: "all"
        };
      }

      const normalized = {
        genre: String(state.feedQuickFilters.genre || "").trim(),
        bpm: String(state.feedQuickFilters.bpm || "all").trim().toLowerCase()
      };

      if (!["all", "lt90", "90_120", "121_140", "gt140"].includes(normalized.bpm)) {
        normalized.bpm = "all";
      }

      state.feedQuickFilters = normalized;
      return normalized;
    }

    function normalizeGenreValue(value) {
      return String(value || "").trim().toLowerCase();
    }

    function matchesBpmFilter(track, bpmFilter) {
      if (!bpmFilter || bpmFilter === "all") {
        return true;
      }

      const bpm = Number(track?.beatBpm);
      if (!Number.isFinite(bpm) || bpm <= 0) {
        return false;
      }

      if (bpmFilter === "lt90") {
        return bpm < 90;
      }
      if (bpmFilter === "90_120") {
        return bpm >= 90 && bpm <= 120;
      }
      if (bpmFilter === "121_140") {
        return bpm >= 121 && bpm <= 140;
      }
      if (bpmFilter === "gt140") {
        return bpm > 140;
      }
      return true;
    }

    function matchesTrackQuickFilters(track, quickFilters) {
      if (!track) {
        return false;
      }
      if (quickFilters.privacy !== "all") {
        const publishMode = String(track.publishMode || "public").trim().toLowerCase();
        if (publishMode !== quickFilters.privacy) {
          return false;
        }
      }
      if (quickFilters.genre) {
        if (normalizeGenreValue(track.genre) !== normalizeGenreValue(quickFilters.genre)) {
          return false;
        }
      }
      if (!matchesBpmFilter(track, quickFilters.bpm)) {
        return false;
      }
      return true;
    }

    function getFeedTracks() {
      const quickFilters = ensureFeedQuickFilters();

      const allTracks = state.tracks.slice();
      const isBeatMode = state.feedFilter === "beats";
      const tracks = isBeatMode ? allTracks.filter(isBeatTrack) : allTracks.filter((track) => !isBeatTrack(track));
      const quickFilteredTracks = tracks.filter((track) => matchesTrackQuickFilters(track, quickFilters));
      
      if (isBeatMode) {
        quickFilteredTracks.sort((left, right) => {
          const rightCreated = new Date(right?.createdAt || 0).getTime();
          const leftCreated = new Date(left?.createdAt || 0).getTime();
          return rightCreated - leftCreated;
        });
      }

      if (!state.user) {
        return quickFilteredTracks;
      }

      if (state.feedFilter === "mine") {
        return quickFilteredTracks.filter((track) => track.userId === state.user.id);
      }

      // При "all" показываем все треки, при "beats" тоже все биты
      if (state.feedFilter === "all" || state.feedFilter === "beats") {
        return quickFilteredTracks;
      }

      // По умолчанию показываем треки других пользователей
      return quickFilteredTracks.filter((track) => track.userId !== state.user.id);
    }

    function renderAccessBlocks() {
      const logged = Boolean(state.user);

      elements.profileGuest.classList.toggle("hidden", logged);
      elements.profileContent.classList.toggle("hidden", !logged);

      elements.publishGuest.classList.toggle("hidden", logged);
      elements.uploadForm.classList.toggle("hidden", !logged);
      elements.albumForm.classList.toggle("hidden", !logged);
      if (elements.beatForm) {
        elements.beatForm.classList.toggle("hidden", !logged);
      }

      elements.createPlaylistForm.classList.toggle("hidden", !logged);
      elements.playlistGuestHint.classList.toggle("hidden", logged);

      elements.authGuest.classList.toggle("hidden", logged);
      elements.authLogged.classList.toggle("hidden", !logged);

      elements.friendsGuest.classList.toggle("hidden", logged);
      elements.friendsAuth.classList.toggle("hidden", !logged);

      elements.messagesGuest.classList.toggle("hidden", logged);
      elements.messagesAuth.classList.toggle("hidden", !logged);

      if (logged) {
        elements.loggedInfo.textContent = `Вы вошли как @${state.user.username}`;
        if (elements.emailProfileInput) {
          elements.emailProfileInput.value = state.user.email || "";
        }
        if (elements.emailStatusInfo) {
          if (!state.user.email) {
            elements.emailStatusInfo.textContent = "Email не указан. Добавь email для восстановления пароля.";
          } else if (state.user.emailVerified) {
            elements.emailStatusInfo.textContent = `Email: ${state.user.email} • подтвержден`;
          } else {
            elements.emailStatusInfo.textContent = `Email: ${state.user.email} • не подтвержден`;
          }
        }
      } else {
        elements.loggedInfo.textContent = "";
        if (elements.emailProfileInput) {
          elements.emailProfileInput.value = "";
        }
        if (elements.emailStatusInfo) {
          elements.emailStatusInfo.textContent = "";
        }
        elements.passwordForm.reset();
        elements.promoCodeForm.reset();
        elements.emailProfileForm?.reset();
      }

      updatePremiereFieldVisibility();
    }

    function renderFeedFilterButtons() {
      for (const button of elements.feedFilters) {
        const filter = button.dataset.filter;
        button.classList.toggle("active", filter === state.feedFilter);

        if (!state.user && filter === "mine") {
          button.disabled = true;
        } else {
          button.disabled = false;
        }
      }

      if (!state.user && state.feedFilter === "mine") {
        state.feedFilter = "all";
      }
    }

    function renderProfileSectionTabs() {
      const active = state.profileSection;
      for (const button of elements.profileTabButtons) {
        button.classList.toggle("active", button.dataset.profileSection === active);
      }

      for (const panel of elements.profilePanels) {
        panel.classList.toggle("active", panel.dataset.profilePanel === active);
      }
    }

    function setProfileSection(section) {
      const allowed = new Set(["tracks", "beats", "reposts", "likes", "albums", "stats"]);
      if (!allowed.has(section)) {
        return;
      }
      state.profileSection = section;
      renderProfileSectionTabs();
    }


    function normalizeSearchQuery(value) {
      return String(value || "").trim().toLowerCase();
    }

    function buildFeedSearchMatches(query) {
      const normalized = normalizeSearchQuery(query);
      if (!normalized) {
        return [];
      }

      const results = [];
      const beatMode = state.feedFilter === "beats";

      if (beatMode) {
        for (const track of state.tracks) {
          if (!isBeatTrack(track)) {
            continue;
          }
          const hay = [
            track.title,
            track.username,
            track.genre || "",
            track.beatRootNote || "",
            String(track.beatBpm || ""),
            (track.hashtags || []).join(" "),
            (track.producers || []).join(" ")
          ].join(" ").toLowerCase();
          if (!hay.includes(normalized)) {
            continue;
          }
          results.push({
            type: "beat",
            id: track.id,
            title: track.title,
            subtitle: `Бит • @${track.username}`,
            trackId: track.id
          });
        }
        return results.slice(0, 20);
      }

      for (const user of state.users) {
        const hay = `${user.username} ${user.bio || ""}`.toLowerCase();
        if (hay.includes(normalized)) {
          results.push({
            type: "user",
            id: user.id,
            title: `@${user.username}`,
            subtitle: "Профиль артиста",
            username: user.username
          });
        }
      }

      for (const track of state.tracks) {
        if (isBeatTrack(track)) {
          continue;
        }
        const hay = `${track.title} ${track.username} ${(track.authors || []).join(" ")} ${(track.producers || []).join(" ")} ${(track.hashtags || []).join(" ")}`.toLowerCase();
        if (hay.includes(normalized)) {
          results.push({
            type: "track",
            id: track.id,
            title: track.title,
            subtitle: `Трек • @${track.username}`,
            trackId: track.id
          });
        }
      }

      for (const album of state.albums) {
        const hay = `${album.title} ${album.username} ${(album.authors || []).join(" ")} ${(album.producers || []).join(" ")} ${(album.hashtags || []).join(" ")}`.toLowerCase();
        if (hay.includes(normalized)) {
          results.push({
            type: "album",
            id: album.id,
            title: album.title,
            subtitle: `Альбом • @${album.username}`,
            albumId: album.id
          });
        }
      }

      return results.slice(0, 20);
    }

    function highlightSearchTarget(node) {
      if (!node) {
        return;
      }
      node.classList.add("search-hit");
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => {
        node.classList.remove("search-hit");
      }, 1800);
    }

    function upsertTrack(track) {
      if (!track || !track.id) {
        return;
      }

      const index = state.tracks.findIndex((entry) => entry.id === track.id);
      if (index >= 0) {
        state.tracks[index] = track;
      } else {
        state.tracks.unshift(track);
      }
    }

    async function ensureTrackLoaded(trackId) {
      const existing = getTrackById(trackId);
      if (existing) {
        return existing;
      }

      const data = await api(`/api/tracks/${trackId}`);
      if (!data?.track) {
        return null;
      }

      upsertTrack(data.track);
      return data.track;
    }

    async function goToTrackFromSearch(trackId, options = {}) {
      const { autoplay = false, source = "search" } = options;
      let track = null;
      try {
        track = await ensureTrackLoaded(trackId);
      } catch {
        // ignore lookup errors, fallback to existing feed tracks
      }

      state.feedFilter = track && isBeatTrack(track) ? "beats" : "all";
      switchTab("feed");
      renderFeed();
      const feedScope = elements.tabPanels.feed || document;
      const target = feedScope.querySelector(`.track-card[data-track-id='${trackId}']`);
      highlightSearchTarget(target);

      if (autoplay && (track || getTrackById(trackId))) {
        await startTrackPlayback(trackId, null, target, source);
      }
    }

    function goToAlbumFromSearch(albumId) {
      switchTab("feed");
      renderFeed();
      const feedScope = elements.tabPanels.feed || document;
      const target = feedScope.querySelector(`.playlist-item[data-album-id='${albumId}']`);
      highlightSearchTarget(target);
      const albumLink = target?.querySelector(".track-title-link");
      if (albumLink) {
        albumLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      }
    }

    function openFeedSearchMatch(match) {
      if (!match) {
        return;
      }
      if (elements.feedSearchResults) {
        elements.feedSearchResults.classList.add("hidden");
      }
      if (match.type === "user" && match.username) {
        window.location.href = `/u/${encodeURIComponent(match.username)}`;
        return;
      }
      if (match.type === "track" && match.trackId) {
        goToTrackFromSearch(match.trackId, { autoplay: false, source: "search" });
        return;
      }
      if (match.type === "beat" && match.trackId) {
        goToTrackFromSearch(match.trackId, { autoplay: false, source: "search-beat" });
        return;
      }
      if (match.type === "album" && match.albumId) {
        goToAlbumFromSearch(match.albumId);
      }
    }


    function getSharedTrackIdFromLocation() {
      const match = window.location.pathname.match(/^\/(?:t|b)\/([a-zA-Z0-9-]+)\/?$/);
      if (!match) {
        return "";
      }

      try {
        return decodeURIComponent(match[1]);
      } catch {
        return "";
      }
    }

    async function openTrackFromSharedLinkIfNeeded() {
      const trackId = getSharedTrackIdFromLocation();
      if (!trackId) {
        return;
      }

      const track = await ensureTrackLoaded(trackId);
      if (!track) {
        throw new Error("Трек по ссылке не найден");
      }

      await goToTrackFromSearch(trackId, { autoplay: false, source: "direct-link" });
      setStatus("Открыт трек по ссылке", "success");
    }

    function setFeedSearchActiveIndex(nextIndex) {
      const matches = Array.isArray(state.feedSearchMatches) ? state.feedSearchMatches : [];
      if (matches.length === 0) {
        state.feedSearchActiveIndex = -1;
      } else {
        const normalizedIndex = Math.max(0, Math.min(matches.length - 1, Number(nextIndex) || 0));
        state.feedSearchActiveIndex = normalizedIndex;
      }

      if (!elements.feedSearchResults) {
        return;
      }
      const nodes = Array.from(elements.feedSearchResults.querySelectorAll(".search-result-item[data-search-index]"));
      for (const node of nodes) {
        const index = Number(node.dataset.searchIndex);
        const isActive = Number.isFinite(index) && index === state.feedSearchActiveIndex;
        node.classList.toggle("active", isActive);
        node.setAttribute("aria-selected", isActive ? "true" : "false");
      }
    }

    function moveFeedSearchActiveIndex(direction = 1) {
      const matches = Array.isArray(state.feedSearchMatches) ? state.feedSearchMatches : [];
      if (matches.length === 0) {
        return;
      }
      const step = direction >= 0 ? 1 : -1;
      const current = Number(state.feedSearchActiveIndex);
      const start = Number.isFinite(current) ? current : (step > 0 ? -1 : 0);
      let next = start + step;
      if (next < 0) {
        next = matches.length - 1;
      } else if (next >= matches.length) {
        next = 0;
      }
      setFeedSearchActiveIndex(next);
      const activeNode = elements.feedSearchResults?.querySelector(`.search-result-item[data-search-index='${next}']`);
      activeNode?.scrollIntoView({ block: "nearest" });
    }

    function openActiveFeedSearchResult() {
      const matches = Array.isArray(state.feedSearchMatches) ? state.feedSearchMatches : [];
      if (matches.length === 0) {
        return false;
      }
      const current = Number(state.feedSearchActiveIndex);
      const index = Number.isFinite(current) && current >= 0 && current < matches.length ? current : 0;
      openFeedSearchMatch(matches[index]);
      return true;
    }

    function renderFeedSearchResults(query, options = {}) {
      if (!elements.feedSearchResults) {
        return;
      }

      const keepActive = Boolean(options?.keepActiveIndex);
      const previousActiveIndex = Number(state.feedSearchActiveIndex);
      const normalized = normalizeSearchQuery(query);
      elements.feedSearchResults.innerHTML = "";
      state.feedSearchMatches = [];
      state.feedSearchActiveIndex = -1;

      if (!normalized) {
        elements.feedSearchResults.classList.add("hidden");
        return;
      }

      const matches = buildFeedSearchMatches(normalized);
      elements.feedSearchResults.classList.remove("hidden");
      elements.feedSearchResults.setAttribute("role", "listbox");
      state.feedSearchMatches = matches.slice();

      if (matches.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("feedSearchNoResults");
        elements.feedSearchResults.appendChild(empty);
        return;
      }

      const nextIndex = keepActive
        ? Math.max(0, Math.min(matches.length - 1, Number.isFinite(previousActiveIndex) ? previousActiveIndex : 0))
        : 0;
      state.feedSearchActiveIndex = nextIndex;

      for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        const item = document.createElement("button");
        item.type = "button";
        item.className = "search-result-item";
        item.dataset.searchIndex = String(index);
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", index === state.feedSearchActiveIndex ? "true" : "false");
        if (index === state.feedSearchActiveIndex) {
          item.classList.add("active");
        }

        const title = document.createElement("span");
        title.textContent = match.title;

        const subtitle = document.createElement("span");
        subtitle.className = "search-result-meta";
        subtitle.textContent = match.subtitle;

        item.append(title, subtitle);

        item.addEventListener("mouseenter", () => {
          setFeedSearchActiveIndex(index);
        });
        item.addEventListener("click", () => {
          setFeedSearchActiveIndex(index);
          openFeedSearchMatch(match);
        });

        elements.feedSearchResults.appendChild(item);
      }
    }

    function createSelectionItem(track) {
      const item = document.createElement("div");
      item.className = "selection-item";
      item.dataset.trackId = track.id;
      item.dataset.playSource = state.feedFilter === "beats" ? "selection-beat" : "selection";

      const title = document.createElement("strong");
      title.appendChild(createTrackLink(track, { source: item.dataset.playSource, className: "track-title-link compact-link" }));

      const text = document.createElement("p");
      text.className = "muted";
      text.appendChild(createUserLinkNode(track.username, "user-link compact-link"));
      text.append(` • 👂 ${Number(track.listensCount || 0)} • 👍 ${track.likesCount} • 💬 ${track.commentsCount}`);

      const actions = document.createElement("div");
      actions.className = "track-actions";

      const playBtn = document.createElement("button");
      playBtn.type = "button";
      playBtn.className = "ghost";
      playBtn.textContent = t("btnListen");
      playBtn.addEventListener("click", async () => {
        const queue = Array.from(item.parentElement?.querySelectorAll(".selection-item[data-track-id]") || [])
          .map((node) => node.dataset.trackId)
          .filter(Boolean);
        await startTrackPlayback(track.id, queue, item, item.dataset.playSource);
      });

      actions.appendChild(playBtn);
      item.append(title, text, actions);
      return item;
    }

    function renderSelections() {
      elements.selectionPopular.innerHTML = "";
      elements.selectionFresh.innerHTML = "";
      if (elements.selectionCharts) {
        elements.selectionCharts.innerHTML = "";
      }
      const quickFilters = ensureFeedQuickFilters();
      const beatMode = state.feedFilter === "beats" || quickFilters.onlyBeats;
      if (beatMode) {
        if (elements.feedSelectionsWrap) {
          elements.feedSelectionsWrap.classList.add("hidden");
        }
        return;
      }
      const list = state.tracks.filter((track) => beatMode ? isBeatTrack(track) : !isBeatTrack(track));
      const popular = list
        .slice()
        .sort((a, b) => {
          const listensDiff = (Number(b.listensCount) || 0) - (Number(a.listensCount) || 0);
          if (listensDiff !== 0) {
            return listensDiff;
          }
          const likesDiff = (Number(b.likesCount) || 0) - (Number(a.likesCount) || 0);
          if (likesDiff !== 0) {
            return likesDiff;
          }
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        })
        .slice(0, 5);

      const fresh = list.slice(0, 5);
      const nowMs = Date.now();
      const trending = list
        .slice()
        .sort((a, b) => {
          const score = (track) => {
            const listens = Number(track?.listensCount) || 0;
            const likes = Number(track?.likesCount) || 0;
            const comments = Number(track?.commentsCount) || 0;
            const reposts = Number(track?.repostsCount) || 0;
            const createdMs = new Date(track?.createdAt || 0).getTime();
            const ageDays = Number.isFinite(createdMs) ? Math.max(0, (nowMs - createdMs) / (24 * 60 * 60 * 1000)) : 9999;
            const recencyBoost = Math.max(0, 14 - ageDays) * 4;
            return listens + likes * 3 + comments * 2 + reposts * 2 + recencyBoost;
          };
          const diff = score(b) - score(a);
          if (diff !== 0) {
            return diff;
          }
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        })
        .slice(0, 5);

      if (elements.selectionPopularTitle) {
        elements.selectionPopularTitle.textContent = beatMode
          ? t("feedSelectionPopularBeats")
          : t("feedSelectionPopularSongs");
      }
      if (elements.selectionFreshTitle) {
        elements.selectionFreshTitle.textContent = beatMode
          ? t("feedSelectionFreshBeats")
          : t("feedSelectionFreshSongs");
      }
      if (elements.selectionChartsTitle) {
        elements.selectionChartsTitle.textContent = beatMode
          ? t("feedSelectionChartsBeats")
          : t("feedSelectionChartsSongs");
      }

      if (popular.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = beatMode ? t("emptyNoBeats") : t("emptyNoTracks");
        elements.selectionPopular.appendChild(empty);
      } else {
        for (const track of popular) {
          elements.selectionPopular.appendChild(createSelectionItem(track));
        }
      }

      if (fresh.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = beatMode ? t("emptyNoBeats") : t("emptyNoTracks");
        elements.selectionFresh.appendChild(empty);
      } else {
        for (const track of fresh) {
          elements.selectionFresh.appendChild(createSelectionItem(track));
        }
      }

      if (elements.selectionCharts) {
        if (trending.length === 0) {
          const empty = document.createElement("p");
          empty.className = "muted";
          empty.textContent = beatMode ? t("emptyNoBeats") : t("emptyNoTracks");
          elements.selectionCharts.appendChild(empty);
        } else {
          for (const track of trending) {
            elements.selectionCharts.appendChild(createSelectionItem(track));
          }
        }
      }
    }


    return {
      getFeedTracks,
      renderAccessBlocks,
      renderFeedFilterButtons,
      renderProfileSectionTabs,
      setProfileSection,
      normalizeSearchQuery,
      buildFeedSearchMatches,
      highlightSearchTarget,
      upsertTrack,
      ensureTrackLoaded,
      goToTrackFromSearch,
      goToAlbumFromSearch,
      openFeedSearchMatch,
      getSharedTrackIdFromLocation,
      openTrackFromSharedLinkIfNeeded,
      setFeedSearchActiveIndex,
      moveFeedSearchActiveIndex,
      openActiveFeedSearchResult,
      renderFeedSearchResults,
      createSelectionItem,
      renderSelections,
      updateFeedStickyOffset,
      renderFeedSectionToggleLabels,
      applyFeedSectionVisibility,
      toggleFeedSection,
      ensureFeedUiBindings
    };
  }

  window.SferaFeedCore = { createAppFeedCore };
})();
