(() => {
  "use strict";

    function createAppProfileUi(deps) {
        const {
      state,
      elements,
      t,
      formatDate,
      formatDuration,
      setImageWithFallback,
      buildTrackHref,
      isBeatTrack,
      renderProfileSectionTabs,
      renderAlbumCardsList,
      renderTracksList,
      api,
      setStatus,
      refreshMe,
      renderAll
    } = deps;
    let profileSectionBindingsReady = false;

    async function updateProfileBio(bio) {
      try {
        setStatus("Сохраняю описание профиля...");
        await api("/api/profile", {
          method: "PUT",
          body: { bio }
        });
        await refreshMe();
        renderAll();
        setStatus("Описание профиля обновлено", "success");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    function renderProfileSectionToggleLabels() {
      if (elements.togglePinnedReleaseBtn) {
        elements.togglePinnedReleaseBtn.textContent = state.profileSectionsCollapsed?.pinnedRelease
          ? t("profileTogglePinnedShow")
          : t("profileTogglePinnedHide");
      }
      if (elements.toggleAuthorStatsBtn) {
        elements.toggleAuthorStatsBtn.textContent = state.profileSectionsCollapsed?.authorStats
          ? t("profileToggleStatsShow")
          : t("profileToggleStatsHide");
      }
    }

    function applyProfileSectionVisibility() {
      if (elements.profilePinnedReleaseContent) {
        elements.profilePinnedReleaseContent.classList.toggle("hidden", Boolean(state.profileSectionsCollapsed?.pinnedRelease));
      }
      if (elements.authorStatsWrap) {
        elements.authorStatsWrap.classList.toggle("hidden", Boolean(state.profileSectionsCollapsed?.authorStats));
      }
      renderProfileSectionToggleLabels();
    }

    function ensureProfileSectionBindings() {
      if (profileSectionBindingsReady) {
        return;
      }
      profileSectionBindingsReady = true;

      if (!state.profileSectionsCollapsed) {
        state.profileSectionsCollapsed = {
          pinnedRelease: false,
          authorStats: false
        };
      }

      elements.togglePinnedReleaseBtn?.addEventListener("click", () => {
        state.profileSectionsCollapsed.pinnedRelease = !Boolean(state.profileSectionsCollapsed.pinnedRelease);
        applyProfileSectionVisibility();
      });

      elements.toggleAuthorStatsBtn?.addEventListener("click", () => {
        state.profileSectionsCollapsed.authorStats = !Boolean(state.profileSectionsCollapsed.authorStats);
        applyProfileSectionVisibility();
      });

      applyProfileSectionVisibility();
    }

    function parseCreatedAtTs(value) {
      const parsed = Date.parse(String(value || ""));
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatDateOnly(iso) {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) {
        return t("unknownDate");
      }
      const lang = String(document.documentElement.lang || "ru").toLowerCase();
      const locale = lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "ru-RU";
      return date.toLocaleDateString(locale, { dateStyle: "medium" });
    }

    function renderPinnedRelease(mySongTracks) {
      if (!elements.profilePinnedReleaseContent || !elements.profilePinnedReleaseTitle) {
        return;
      }

      elements.profilePinnedReleaseTitle.textContent = t("profilePinnedReleaseTitle");
      elements.profilePinnedReleaseContent.innerHTML = "";
      const pinnedTrackIds = Array.isArray(state.user?.pinnedTrackIds)
        ? state.user.pinnedTrackIds.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 3)
        : [];
      const tracksById = new Map(mySongTracks.map((track) => [String(track.id), track]));
      const pinnedTracks = pinnedTrackIds
        .map((trackId) => tracksById.get(trackId))
        .filter(Boolean)
        .sort((left, right) => parseCreatedAtTs(right?.createdAt) - parseCreatedAtTs(left?.createdAt));

      if (pinnedTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("profilePinnedReleaseEmpty");
        elements.profilePinnedReleaseContent.appendChild(empty);
        return;
      }

      const list = document.createDocumentFragment();
      for (const track of pinnedTracks) {
        const fallbackTrackHref = typeof buildTrackHref === "function"
          ? buildTrackHref(track.id, track)
          : `/t/${encodeURIComponent(String(track.id || ""))}`;
        const href = track.sharePath || fallbackTrackHref;

        const card = document.createElement("article");
        card.className = "profile-pinned-release-item";

        const coverLink = document.createElement("a");
        coverLink.className = "profile-pinned-release-cover-link";
        coverLink.href = href;

        const cover = document.createElement("img");
        cover.className = "profile-pinned-release-cover";
        cover.alt = track.title || t("trackFallbackTitle");
        setImageWithFallback(cover, track.coverUrl);
        coverLink.appendChild(cover);

        const body = document.createElement("div");
        body.className = "profile-pinned-release-body";

        const typeChip = document.createElement("span");
        typeChip.className = "track-privacy-chip";
        typeChip.textContent = t("profileTabTracks");

        const title = document.createElement("a");
        title.className = "track-title-link";
        title.href = href;
        title.textContent = track.title || t("trackFallbackTitle");

        const meta = document.createElement("p");
        meta.className = "muted";
        const metaParts = [
          `${t("labelPublished")}: ${formatDate(track.createdAt)}`,
          `${t("labelGenre")}: ${track.genre || t("unknownGenre")}`,
          `${t("labelListens")}: ${Number(track.listensCount || 0)}`
        ];
        if (Number(track.durationSec || 0) > 0) {
          metaParts.push(formatDuration(Number(track.durationSec || 0)));
        }
        meta.textContent = metaParts.join(" • ");

        const openLink = document.createElement("a");
        openLink.className = "ghost profile-pinned-release-open";
        openLink.href = href;
        openLink.textContent = t("btnOpen");

        body.append(typeChip, title, meta, openLink);
        card.append(coverLink, body);
        list.appendChild(card);
      }
      elements.profilePinnedReleaseContent.appendChild(list);
    }

    function renderProfile() {
      ensureProfileSectionBindings();
      if (!state.user) {
        applyProfileSectionVisibility();
        return;
      }

      elements.profileUsername.textContent = `@${state.user.username}`;
      elements.profileBio.textContent = state.user.bio || "Описание профиля не заполнено";
      elements.profileBio.style.cursor = "pointer";
      elements.profileBio.title = "Нажми, чтобы редактировать";
      elements.profileBio.addEventListener("click", () => {
        if (!state.user) return;
        const currentBio = state.user.bio || "";
        const newBio = window.prompt("Редактировать описание профиля:", currentBio);
        if (newBio === null) return;
        const trimmedBio = newBio.trim().slice(0, 500);
        if (trimmedBio === currentBio) return;
        updateProfileBio(trimmedBio);
      });
      elements.profileCreated.textContent = `${t("profileCreatedPrefix")} ${formatDateOnly(state.user.createdAt)}`;

      if (state.user.headerUrl) {
        elements.profileHeader.style.backgroundImage = `linear-gradient(to top, rgba(4,11,14,0.5), transparent), url(${state.user.headerUrl})`;
        elements.profileHeader.style.backgroundSize = "cover";
        elements.profileHeader.style.backgroundPosition = "center";
      } else {
        elements.profileHeader.style.backgroundImage = "linear-gradient(135deg, #1a0d2a, #4a1b69)";
        elements.profileHeader.style.backgroundSize = "auto";
      }

      setImageWithFallback(elements.profileAvatar, state.user.avatarUrl);

      const myContentTracks = state.tracks.filter((track) => track.userId === state.user.id);
      const mySongTracks = myContentTracks.filter((track) => !isBeatTrack(track));
      const myBeatTracks = myContentTracks.filter(isBeatTrack);
      const repostSet = new Set(state.user.reposts || []);
      const repostTracks = state.tracks.filter((track) => repostSet.has(track.id));
      const likedTracks = state.tracks.filter((track) => track.liked);
      const myAlbums = state.albums.filter((album) => album.userId === state.user.id);

      renderPinnedRelease(mySongTracks);
      renderTracksList(elements.profileTracksList, mySongTracks, "profile-tracks");
      renderTracksList(elements.profileBeatsList, myBeatTracks, "profile-beats");
      renderTracksList(elements.profileRepostsList, repostTracks, "profile-reposts");
      renderTracksList(elements.profileLikesList, likedTracks, "profile-likes");
      renderAlbumCardsList(elements.profileAlbumsList, myAlbums, "Вы еще не публиковали альбомы");
      renderProfileSectionTabs();

      elements.statTracks.textContent = String(mySongTracks.length);
      elements.statReposts.textContent = String(repostTracks.length);
      if (elements.statFollowers) {
        elements.statFollowers.textContent = String((state.follows.followers || []).length);
      }
      if (elements.statFollowing) {
        elements.statFollowing.textContent = String((state.follows.following || []).length);
      }
      applyProfileSectionVisibility();
    }


    function renderAuthorAnalytics() {
      const ANALYTICS_I18N = {
        ru: {
          loginHint: "Войди в аккаунт, чтобы видеть статистику автора.",
          notReady: "Статистика пока не готова.",
          summaryTracks: "Треков",
          summaryListens: "Прослушиваний",
          summaryLikes: "Лайков",
          summaryDislikes: "Дизлайков",
          summaryComments: "Комментариев",
          summaryReposts: "Репостов",
          summaryAvgListens: "Среднее прослушиваний/трек",
          summaryAvgDuration: "Средняя длина трека",
          summaryTotalDuration: "Суммарная длительность",
          summaryActiveDays: "Активных дней (30)",
          summaryPeakDay: "Пиковый день",
          summaryEngagement: "ER / listen",
          retentionTitle: "Удержание (дослушивания)",
          retention25: "Дошли до 25%",
          retention50: "Дошли до 50%",
          retention100: "Дошли до 100%",
          dailyTitle: "Прослушивания по дням (30 дней)",
          sourcesTitle: "Источники переходов",
          sourcesEmpty: "Пока нет данных по источникам.",
          sourceUnknown: "unknown",
          publishModesTitle: "Режимы публикации",
          publishModesEmpty: "Нет данных по режимам публикации.",
          publishModePublic: "Публичный",
          publishModeDraft: "Черновик",
          publishModePrivate: "Приватный",
          publishModeLink: "По ссылке",
          publishModePremiere: "Премьера",
          genresTitle: "Топ жанры",
          genresEmpty: "Пока жанры не указаны.",
          genreFallback: "Без жанра",
          topTracksTitle: "Топ треки автора",
          topTracksEmpty: "Пока нет треков для статистики.",
          trackUntitled: "Без названия",
          metricPlays: "plays",
          metricLikes: "likes",
          metricComments: "comments",
          metricReposts: "reposts"
        },
        en: {
          loginHint: "Sign in to view author analytics.",
          notReady: "Analytics is not ready yet.",
          summaryTracks: "Tracks",
          summaryListens: "Listens",
          summaryLikes: "Likes",
          summaryDislikes: "Dislikes",
          summaryComments: "Comments",
          summaryReposts: "Reposts",
          summaryAvgListens: "Avg listens/track",
          summaryAvgDuration: "Avg track length",
          summaryTotalDuration: "Total duration",
          summaryActiveDays: "Active days (30)",
          summaryPeakDay: "Peak day",
          summaryEngagement: "ER / listen",
          retentionTitle: "Retention (completion)",
          retention25: "Reached 25%",
          retention50: "Reached 50%",
          retention100: "Reached 100%",
          dailyTitle: "Listens by day (30 days)",
          sourcesTitle: "Traffic sources",
          sourcesEmpty: "No source data yet.",
          sourceUnknown: "unknown",
          publishModesTitle: "Publishing modes",
          publishModesEmpty: "No publishing mode data.",
          publishModePublic: "Public",
          publishModeDraft: "Draft",
          publishModePrivate: "Private",
          publishModeLink: "Link only",
          publishModePremiere: "Premiere",
          genresTitle: "Top genres",
          genresEmpty: "No genres yet.",
          genreFallback: "No genre",
          topTracksTitle: "Top tracks",
          topTracksEmpty: "No tracks for analytics yet.",
          trackUntitled: "Untitled",
          metricPlays: "plays",
          metricLikes: "likes",
          metricComments: "comments",
          metricReposts: "reposts"
        },
        zh: {
          loginHint: "登录后可查看作者统计。",
          notReady: "统计暂不可用。",
          summaryTracks: "歌曲数",
          summaryListens: "播放量",
          summaryLikes: "点赞",
          summaryDislikes: "点踩",
          summaryComments: "评论",
          summaryReposts: "转发",
          summaryAvgListens: "单曲平均播放",
          summaryAvgDuration: "平均时长",
          summaryTotalDuration: "总时长",
          summaryActiveDays: "活跃天数 (30)",
          summaryPeakDay: "峰值日期",
          summaryEngagement: "互动率 / 播放",
          retentionTitle: "留存（听完率）",
          retention25: "听到 25%",
          retention50: "听到 50%",
          retention100: "听到 100%",
          dailyTitle: "每日播放（30天）",
          sourcesTitle: "流量来源",
          sourcesEmpty: "暂无来源数据。",
          sourceUnknown: "unknown",
          publishModesTitle: "发布模式",
          publishModesEmpty: "暂无发布模式数据。",
          publishModePublic: "公开",
          publishModeDraft: "草稿",
          publishModePrivate: "私密",
          publishModeLink: "链接可见",
          publishModePremiere: "定时首发",
          genresTitle: "热门风格",
          genresEmpty: "暂无风格数据。",
          genreFallback: "未填写风格",
          topTracksTitle: "热门歌曲",
          topTracksEmpty: "暂无可统计歌曲。",
          trackUntitled: "未命名",
          metricPlays: "播放",
          metricLikes: "赞",
          metricComments: "评论",
          metricReposts: "转发"
        }
      };
      const statsLang = String(state.uiLanguage || "ru");
      const statsDict = ANALYTICS_I18N[statsLang] || ANALYTICS_I18N.ru;
      const statsText = (key) => statsDict[key] || ANALYTICS_I18N.ru[key] || key;

      if (!elements.authorStatsWrap) {
        return;
      }

      elements.authorStatsWrap.innerHTML = "";

      if (!state.user) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = statsText("loginHint");
        elements.authorStatsWrap.appendChild(hint);
        return;
      }

      const data = state.authorAnalytics;
      if (!data) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = statsText("notReady");
        elements.authorStatsWrap.appendChild(hint);
        return;
      }

      function createStatBox(label, value) {
        const box = document.createElement("div");
        box.className = "stats-box";

        const title = document.createElement("span");
        title.textContent = label;

        const strong = document.createElement("strong");
        strong.textContent = value;

        box.append(title, strong);
        return box;
      }

      function createListSection(titleText, entries, getLabel, getValue, emptyText) {
        const wrap = document.createElement("div");
        wrap.className = "stats-list";

        const title = document.createElement("strong");
        title.textContent = titleText;
        wrap.appendChild(title);

        if (!Array.isArray(entries) || entries.length === 0) {
          const empty = document.createElement("p");
          empty.className = "muted";
          empty.textContent = emptyText;
          wrap.appendChild(empty);
          return wrap;
        }

        for (const entry of entries) {
          const item = document.createElement("div");
          item.className = "stats-list-item";

          const left = document.createElement("span");
          left.textContent = getLabel(entry);

          const right = document.createElement("strong");
          right.textContent = getValue(entry);

          item.append(left, right);
          wrap.appendChild(item);
        }

        return wrap;
      }

      const peakDayData = data.peakDay && typeof data.peakDay === "object" ? data.peakDay : null;
      const peakDayIso = String(peakDayData?.date || "");
      const [peakY, peakM, peakD] = peakDayIso.split("-");
      const peakDayLabel = peakY && peakM && peakD ? `${peakD}.${peakM}` : "—";
      const avgDuration = Number(data.averageTrackDurationSec || 0);

      const summary = document.createElement("div");
      summary.className = "stats-grid";
      summary.append(
        createStatBox(statsText("summaryTracks"), String(Number(data.tracksCount || 0))),
        createStatBox(statsText("summaryListens"), String(Number(data.totalListens || 0))),
        createStatBox(statsText("summaryLikes"), String(Number(data.totalLikes || 0))),
        createStatBox(statsText("summaryDislikes"), String(Number(data.totalDislikes || 0))),
        createStatBox(statsText("summaryComments"), String(Number(data.totalComments || 0))),
        createStatBox(statsText("summaryReposts"), String(Number(data.totalReposts || 0))),
        createStatBox(statsText("summaryAvgListens"), String(Number(data.averageListensPerTrack || 0))),
        createStatBox(statsText("summaryAvgDuration"), avgDuration > 0 ? formatDuration(avgDuration) : "—"),
        createStatBox(statsText("summaryTotalDuration"), Number(data.totalDurationSec || 0) > 0 ? formatDuration(Number(data.totalDurationSec || 0)) : "—"),
        createStatBox(statsText("summaryActiveDays"), String(Number(data.activeDays || 0))),
        createStatBox(statsText("summaryPeakDay"), `${peakDayLabel}${Number(peakDayData?.listens || 0) > 0 ? ` • ${Number(peakDayData?.listens || 0)}` : ""}`),
        createStatBox(statsText("summaryEngagement"), String(Number(data.engagementRatePerListen || 0)))
      );

      const retentionWrap = document.createElement("div");
      retentionWrap.className = "stats-list";
      const retentionTitle = document.createElement("strong");
      retentionTitle.textContent = statsText("retentionTitle");
      retentionWrap.appendChild(retentionTitle);

      const retentionRows = [
        {
          label: statsText("retention25"),
          count: Number(data.retention?.count25 || 0),
          percent: Number(data.retention?.percent25 || 0)
        },
        {
          label: statsText("retention50"),
          count: Number(data.retention?.count50 || 0),
          percent: Number(data.retention?.percent50 || 0)
        },
        {
          label: statsText("retention100"),
          count: Number(data.retention?.count100 || 0),
          percent: Number(data.retention?.percent100 || 0)
        }
      ];
      for (const rowData of retentionRows) {
        const item = document.createElement("div");
        item.className = "stats-list-item";
        const left = document.createElement("span");
        left.textContent = rowData.label;
        const right = document.createElement("strong");
        right.textContent = `${rowData.count} (${rowData.percent}%)`;
        item.append(left, right);
        retentionWrap.appendChild(item);
      }

      const dailyWrap = document.createElement("div");
      dailyWrap.className = "stats-bars";

      const dailyTitle = document.createElement("strong");
      dailyTitle.textContent = statsText("dailyTitle");
      dailyWrap.appendChild(dailyTitle);

      const daySeries = Array.isArray(data.listensByDay) ? data.listensByDay : [];
      const maxDaily = daySeries.reduce((acc, item) => Math.max(acc, Number(item?.listens || 0)), 0) || 1;

      for (const day of daySeries) {
        const row = document.createElement("div");
        row.className = "stats-bar-row";

        const date = document.createElement("span");
        const iso = String(day?.date || "");
        const [year, month, dayPart] = iso.split("-");
        date.textContent = year && month && dayPart ? `${dayPart}.${month}` : iso;

        const track = document.createElement("div");
        track.className = "stats-bar-track";

        const fill = document.createElement("div");
        fill.className = "stats-bar-fill";
        const count = Number(day?.listens || 0);
        fill.style.width = `${Math.max(0, Math.min(100, Math.round((count / maxDaily) * 100)))}%`;
        track.appendChild(fill);

        const value = document.createElement("span");
        value.textContent = String(count);

        row.append(date, track, value);
        dailyWrap.appendChild(row);
      }

      const sourcesWrap = createListSection(
        statsText("sourcesTitle"),
        (Array.isArray(data.sources) ? data.sources : []).slice(0, 10),
        (entry) => String(entry.source || statsText("sourceUnknown")),
        (entry) => String(Number(entry.count || 0)),
        statsText("sourcesEmpty")
      );

      const publishModesWrap = createListSection(
        statsText("publishModesTitle"),
        Array.isArray(data.publishModes) ? data.publishModes : [],
        (entry) => {
          const mode = String(entry.mode || "public");
          if (mode === "draft") return statsText("publishModeDraft");
          if (mode === "private") return statsText("publishModePrivate");
          if (mode === "link") return statsText("publishModeLink");
          if (mode === "premiere") return statsText("publishModePremiere");
          return statsText("publishModePublic");
        },
        (entry) => String(Number(entry.count || 0)),
        statsText("publishModesEmpty")
      );

      const genresWrap = createListSection(
        statsText("genresTitle"),
        (Array.isArray(data.genres) ? data.genres : []).slice(0, 8),
        (entry) => String(entry.genre || statsText("genreFallback")),
        (entry) => String(Number(entry.count || 0)),
        statsText("genresEmpty")
      );

      const topTracksWrap = document.createElement("div");
      topTracksWrap.className = "stats-list";
      const topTracksTitle = document.createElement("strong");
      topTracksTitle.textContent = statsText("topTracksTitle");
      topTracksWrap.appendChild(topTracksTitle);

      const topTracks = Array.isArray(data.topTracks) ? data.topTracks : [];
      if (topTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = statsText("topTracksEmpty");
        topTracksWrap.appendChild(empty);
      } else {
        for (const track of topTracks) {
          const item = document.createElement("div");
          item.className = "stats-list-item";

          const left = document.createElement("span");
          left.textContent = String(track.title || statsText("trackUntitled"));

          const right = document.createElement("strong");
          const durationText = Number(track.durationSec || 0) > 0 ? ` • ${formatDuration(Number(track.durationSec || 0))}` : "";
          right.textContent = `${statsText("metricPlays")} ${Number(track.listensCount || 0)} • ${statsText("metricLikes")} ${Number(track.likesCount || 0)} • ${statsText("metricComments")} ${Number(track.commentsCount || 0)} • ${statsText("metricReposts")} ${Number(track.repostsCount || 0)}${durationText}`;

          item.append(left, right);
          topTracksWrap.appendChild(item);
        }
      }

      elements.authorStatsWrap.append(
        summary,
        retentionWrap,
        dailyWrap,
        sourcesWrap,
        publishModesWrap,
        genresWrap,
        topTracksWrap
      );
      applyProfileSectionVisibility();
    }


    return {
      renderProfile,
      renderAuthorAnalytics,
      applyProfileSectionVisibility,
      renderProfileSectionToggleLabels,
      ensureProfileSectionBindings
    };
  }

  window.SferaProfileUi = { createAppProfileUi };
})();
