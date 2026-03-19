  getTrackAuthorsLabel,
  setImageWithFallback,
  loadAudioDurationFromSource,
  getAudioDurationFromFile,
  getAudioDurationFromUrl,
  clampVolume,
  loadSavedVolume,
  saveVolume,
  createDefaultEqualizer,
  normalizeEqualizer,
  loadSavedEqualizer,
  saveEqualizerSettings,
  updateEqualizerLabels,
  applyEqualizerToEngine,
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
  renderEqualizerControls,
  detectEqualizerPresetKey,
  syncEqualizerPresetSelect,
  applyEqualizerPreset,
  setupEqualizerControls,
  setupGlobalPlayer,
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
  isBeatTrack,
  normalizeBeatLicenses,
  getBeatLicenseTypeLabel,
  formatBeatLicensePrice,
  getOwnPlaylists,
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
  getSharedTrackIdFromLocation,
  openTrackFromSharedLinkIfNeeded,
  renderFeedSearchResults,
  createSelectionItem,
  renderSelections,
  renderProfile,
  renderFeed,
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
  renderAlbumTrackOptions,
  createSimpleUserRow,
  buildUserControls,
  renderFriends,
  openSettingsSubscriptionsSection,
  renderMessages,
  renderAuthorAnalytics,
  renderListenHistory,
  renderSettings,
  renderAll,
  refreshMe,
  refreshOnlineUsers,
  refreshUsers,
  refreshTracks,
  refreshAuthorAnalytics,
  refreshListenHistory,
  refreshPlaylists,
  refreshAlbums,
  refreshFollows,
  refreshThreads,
  loadConversation,
  fullRefresh,
  toggleFollow,
  handleAuthSubmit,
  saveLanguagePreference,
  init
});
function createPlaylistCard(...args) {
  return __sferaFeedUi.createPlaylistCard(...args);
}

function renderPlaylists(...args) {
  return __sferaFeedUi.renderPlaylists(...args);
}

function createAlbumCard(...args) {
  return __sferaFeedUi.createAlbumCard(...args);
}

function renderAlbums(...args) {
  return __sferaFeedUi.renderAlbums(...args);
}

function renderAlbumCardsList(...args) {
  return __sferaFeedUi.renderAlbumCardsList(...args);
}

function createLikedTrackItem(...args) {
  return __sferaFeedUi.createLikedTrackItem(...args);
}

function renderLikedTracks(...args) {
  return __sferaFeedUi.renderLikedTracks(...args);
}

function buildPlaylistAdder(...args) {
  return __sferaFeedUi.buildPlaylistAdder(...args);
}

function createTagWrap(...args) {
  return __sferaFeedUi.createTagWrap(...args);
}

function toggleTrackReaction(...args) {
  return __sferaFeedUi.toggleTrackReaction(...args);
}

function toggleTrackRepost(...args) {
  return __sferaFeedUi.toggleTrackRepost(...args);
}

function deleteTrack(...args) {
  return __sferaFeedUi.deleteTrack(...args);
}

function createComment(...args) {
  return __sferaFeedUi.createComment(...args);
}

function deleteComment(...args) {
  return __sferaFeedUi.deleteComment(...args);
}

function toggleCommentReaction(...args) {
  return __sferaFeedUi.toggleCommentReaction(...args);
}

function buildAuthorBadge(...args) {
  return __sferaFeedUi.buildAuthorBadge(...args);
}

function renderCommentNode(...args) {
  return __sferaFeedUi.renderCommentNode(...args);
}

function buildTrackEditForm(...args) {
  return __sferaFeedUi.buildTrackEditForm(...args);
}

function openMessageToUser(...args) {
  return __sferaFeedUi.openMessageToUser(...args);
}

function createBeatCard(...args) {
  return __sferaFeedUi.createBeatCard(...args);
}

function createTrackCard(...args) {
  return __sferaFeedUi.createTrackCard(...args);
}

function renderTracksList(...args) {
  return __sferaFeedUi.renderTracksList(...args);
}

const __sferaProfileUi = window.SferaProfileUi.createAppProfileUi({
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
  normalizeUiDensity,
  getUiMessages,
  t,
  loadGuestUiLanguage,
  saveGuestUiLanguage,
  resolvePreferredUiLanguage,
  setStatus,
  setTextBySelector,
  setLabelTextForControl,
  applyUiLanguage,
  applyUiDensity,
  loadSavedUiDensity,
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
  getTrackAuthorsLabel,
  setImageWithFallback,
  loadAudioDurationFromSource,
  getAudioDurationFromFile,
  getAudioDurationFromUrl,
  clampVolume,
  loadSavedVolume,
  saveVolume,
  createDefaultEqualizer,
  normalizeEqualizer,
  loadSavedEqualizer,
  saveEqualizerSettings,
  updateEqualizerLabels,
  applyEqualizerToEngine,
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
  renderEqualizerControls,
  detectEqualizerPresetKey,
  syncEqualizerPresetSelect,
  applyEqualizerPreset,
  setupEqualizerControls,
  setupGlobalPlayer,
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
  isBeatTrack,
  normalizeBeatLicenses,
  getBeatLicenseTypeLabel,
  formatBeatLicensePrice,
  getOwnPlaylists,
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
  getSharedTrackIdFromLocation,
  openTrackFromSharedLinkIfNeeded,
  renderFeedSearchResults,
  createSelectionItem,
  renderSelections,
  createPlaylistCard,
  renderPlaylists,
  createAlbumCard,
  renderAlbums,
  renderAlbumCardsList,
  createLikedTrackItem,
  renderLikedTracks,
  buildPlaylistAdder,
  createTagWrap,
  toggleTrackReaction,
  toggleTrackRepost,
  deleteTrack,
  createComment,
  deleteComment,
  toggleCommentReaction,
  buildAuthorBadge,
  renderCommentNode,
  buildTrackEditForm,
  openMessageToUser,
  createBeatCard,
  createTrackCard,
  renderTracksList,
  renderFeed,
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
  renderAlbumTrackOptions,
  createSimpleUserRow,
  buildUserControls,
  renderFriends,
  openSettingsSubscriptionsSection,
  renderMessages,
  renderListenHistory,
  renderSettings,
  renderAll,
  refreshMe,
  refreshOnlineUsers,
  refreshUsers,
  refreshTracks,
  refreshAuthorAnalytics,
  refreshListenHistory,
  refreshPlaylists,
  refreshAlbums,
  refreshFollows,
  refreshThreads,
  loadConversation,
  fullRefresh,
  toggleFollow,
  handleAuthSubmit,
  saveLanguagePreference,
  init
});
function renderProfile(...args) {
  return __sferaProfileUi.renderProfile(...args);
}

function renderAuthorAnalytics(...args) {
  return __sferaProfileUi.renderAuthorAnalytics(...args);
}

function ensureFeedQuickFiltersState() {
  if (!state.feedQuickFilters || typeof state.feedQuickFilters !== "object") {
    state.feedQuickFilters = {
      genre: "",
      bpm: "all",
      privacy: "all",
      onlyBeats: false,
      onlyAlbums: false
    };
  }
  const normalized = {
    genre: String(state.feedQuickFilters.genre || "").trim(),
    bpm: String(state.feedQuickFilters.bpm || "all").trim().toLowerCase(),
    privacy: String(state.feedQuickFilters.privacy || "all").trim().toLowerCase(),
    onlyBeats: Boolean(state.feedQuickFilters.onlyBeats),
    onlyAlbums: Boolean(state.feedQuickFilters.onlyAlbums)
  };
  if (!["all", "lt90", "90_120", "121_140", "gt140"].includes(normalized.bpm)) {
    normalized.bpm = "all";
  }
  if (!["all", "public", "draft", "private", "link", "premiere"].includes(normalized.privacy)) {
    normalized.privacy = "all";
  }
  if (normalized.onlyAlbums && normalized.onlyBeats) {
    normalized.onlyBeats = false;
  }
  state.feedQuickFilters = normalized;
  return normalized;
}

function normalizeFeedGenre(value) {
  return String(value || "").trim().toLowerCase();
}

function renderFeedQuickFilterControls() {
  const quick = ensureFeedQuickFiltersState();
  if (elements.quickOnlyBeatsBtn) {
    elements.quickOnlyBeatsBtn.classList.toggle("active", quick.onlyBeats);
    elements.quickOnlyBeatsBtn.setAttribute("aria-pressed", quick.onlyBeats ? "true" : "false");
  }
  if (elements.quickOnlyAlbumsBtn) {
    elements.quickOnlyAlbumsBtn.classList.toggle("active", quick.onlyAlbums);
    elements.quickOnlyAlbumsBtn.setAttribute("aria-pressed", quick.onlyAlbums ? "true" : "false");
  }

  if (elements.quickBpmSelect) {
    elements.quickBpmSelect.value = quick.bpm;
  }
  if (elements.quickPrivacySelect) {
    elements.quickPrivacySelect.value = quick.privacy;
  }

  if (elements.quickGenreSelect) {
    const selected = quick.genre;
    const genres = new Set();
    for (const track of state.tracks || []) {
      const genre = String(track?.genre || "").trim();
      if (genre) {
        genres.add(genre);
      }
    }
    for (const album of state.albums || []) {
      const genre = String(album?.genre || "").trim();
      if (genre) {
        genres.add(genre);
      }
    }

    const sortedGenres = Array.from(genres).sort((a, b) => a.localeCompare(b, getUiDateLocale(), { sensitivity: "base" }));
    elements.quickGenreSelect.innerHTML = "";

    const anyOption = document.createElement("option");
    anyOption.value = "";
    anyOption.textContent = t("feedQuickAny");
    elements.quickGenreSelect.appendChild(anyOption);

    for (const genre of sortedGenres) {
      const option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      elements.quickGenreSelect.appendChild(option);
    }

    const exists = sortedGenres.some((genre) => normalizeFeedGenre(genre) === normalizeFeedGenre(selected));
    if (selected && exists) {
      const match = sortedGenres.find((genre) => normalizeFeedGenre(genre) === normalizeFeedGenre(selected));
      elements.quickGenreSelect.value = match || "";
      state.feedQuickFilters.genre = match || "";
    } else {
      elements.quickGenreSelect.value = "";
      state.feedQuickFilters.genre = "";
    }
  }
}

function getFeedAlbumsByQuickFilters() {
  const quick = ensureFeedQuickFiltersState();
  const albums = Array.isArray(state.albums) ? state.albums.slice() : [];
  let filtered = albums;

  if (state.user) {
    if (state.feedFilter === "others") {
      filtered = filtered.filter((album) => album.userId !== state.user.id);
    } else if (state.feedFilter === "mine") {
      filtered = filtered.filter((album) => album.userId === state.user.id);
    }
  }

  if (quick.genre) {
    const target = normalizeFeedGenre(quick.genre);
    filtered = filtered.filter((album) => normalizeFeedGenre(album?.genre) === target);
  }

  if (quick.privacy !== "all") {
    filtered = filtered.filter((album) => {
      const mode = String(album?.publishMode || "public").trim().toLowerCase();
      return mode === quick.privacy;
    });
  }

  if (quick.bpm !== "all") {
    return [];
  }

  return filtered;
}

function renderFeed() {
  ensureFeedUiBindings();
  const quickFilters = ensureFeedQuickFiltersState();
  const albumsOnlyMode = quickFilters.onlyAlbums;
  const beatMode = !albumsOnlyMode && (state.feedFilter === "beats" || quickFilters.onlyBeats);
  renderFeedQuickFilterControls();
  if (elements.feedMainListTitle) {
    if (albumsOnlyMode) {
      elements.feedMainListTitle.textContent = t("feedMainTitleAlbums");
    } else if (beatMode) {
      elements.feedMainListTitle.textContent = t("feedMainTitleBeats");
    } else {
      elements.feedMainListTitle.textContent = t("feedMainTitleTracks");
    }
  }
  if (elements.feedSearchInput) {
    elements.feedSearchInput.placeholder = beatMode
      ? t("feedSearchPlaceholderBeats")
      : t("feedSearchPlaceholderDefault");
  }
  renderFeedFilterButtons();
  if (!albumsOnlyMode) {
    renderSelections();
  }
  if (!beatMode && !albumsOnlyMode) {
    renderPlaylists();
    renderAlbums();
    renderLikedTracks();
  }

  if (albumsOnlyMode) {
    if (elements.feedSelectionsWrap) {
      elements.feedSelectionsWrap.classList.add("hidden");
    }
    if (elements.feedLibraryWrap) {
      elements.feedLibraryWrap.classList.add("hidden");
    }
    if (elements.toggleFeedSelectionsBtn) {
      elements.toggleFeedSelectionsBtn.disabled = true;
      elements.toggleFeedSelectionsBtn.textContent = t("feedToggleSelectionsShow");
    }
    if (elements.toggleFeedLibraryBtn) {
      elements.toggleFeedLibraryBtn.disabled = true;
      elements.toggleFeedLibraryBtn.textContent = t("feedToggleLibraryShow");
    }
    renderAlbumCardsList(elements.feedTracksList, getFeedAlbumsByQuickFilters(), t("emptyNoAlbums"));
  } else {
    applyFeedSectionVisibility();
    if (elements.feedLibraryWrap) {
      const libraryCards = Array.from(elements.feedLibraryWrap.children || [])
        .filter((node) => node && node.classList && node.classList.contains("card"));
      const collectionsCard = libraryCards[0] || null;
      const tracksCard = libraryCards[1] || null;
      if (collectionsCard) {
        collectionsCard.classList.toggle("hidden", beatMode);
      }
      if (tracksCard) {
        tracksCard.classList.remove("hidden");
      }
    }
    renderTracksList(elements.feedTracksList, getFeedTracks(), "feed");
  }

  renderFeedSearchResults(state.feedSearchQuery, { keepActiveIndex: true });
}

function getNotificationUiText(key) {
  const lang = normalizeUiLanguage(state.uiLanguage, DEFAULT_UI_LANGUAGE);
  const dict = {
    ru: {
      btn: "Уведомления",
      title: "Уведомления",
      subtitle: "События по твоему аккаунту и релизам",
      readAll: "Прочитать все",
      filterAll: "Все",
      filterComments: "Комменты",
      filterMessages: "Сообщения",
      filterFollows: "Подписки",
      empty: "Пока уведомлений нет",
      emptyFiltered: "Нет уведомлений по выбранному фильтру",
      open: "Открыть",
      openDialog: "Диалог",
      openSupport: "Поддержка",
      nowRead: "Уведомления отмечены как прочитанные",
      justNow: "только что"
    },
    en: {
      btn: "Notifications",
      title: "Notifications",
      subtitle: "Account and release activity",
      readAll: "Mark all as read",
      filterAll: "All",
      filterComments: "Comments",
      filterMessages: "Messages",
      filterFollows: "Follows",
      empty: "No notifications yet",
      emptyFiltered: "No notifications for this filter",
      open: "Open",
      openDialog: "Dialog",
      openSupport: "Support",
      nowRead: "Notifications marked as read",
      justNow: "just now"
    },
    zh: {
      btn: "通知",
      title: "通知",
      subtitle: "账号与作品动态",
      readAll: "全部已读",
      filterAll: "全部",
      filterComments: "评论",
      filterMessages: "消息",
      filterFollows: "关注",
      empty: "暂无通知",
      emptyFiltered: "该筛选下暂无通知",
      open: "打开",
      openDialog: "对话",
      openSupport: "支持",
      nowRead: "通知已标记为已读",
      justNow: "刚刚"
    }
  };
  return (dict[lang] && dict[lang][key]) || dict.ru[key] || key;
}

function getNotificationFilterKey(notification) {
  const type = String(notification?.type || "");
  if (
    type === "message_new" ||
    type === "support_reply" ||
    (type === "mention" && (notification?.action === "support" || notification?.action === "message"))
  ) {
    return "messages";
  }
  if (type === "follow_new") {
    return "follows";
  }
  if (
    type === "comment_new" ||
    type === "comment_reply" ||
    type === "track_comment" ||
    type === "track_comment_reply" ||
    type === "comment_reaction" ||
    (type === "mention" && (!notification?.action || notification?.action === "comment"))
  ) {
    return "comments";
  }
  return "all";
}

function matchesNotificationFilter(notification, filter) {
  if (!notification) return false;
  if (filter === "all") return true;
  return getNotificationFilterKey(notification) === filter;
}

function formatNotificationPrimaryText(notification) {
  const lang = normalizeUiLanguage(state.uiLanguage, DEFAULT_UI_LANGUAGE);
  const actor = notification?.actorUsername ? `@${notification.actorUsername}` : "@user";
  const trackTitle = notification?.trackTitle ? `«${notification.trackTitle}»` : (lang === "en" ? "your release" : lang === "zh" ? "你的作品" : "твой релиз");
  const playlistTitle = notification?.messagePreview
    ? `«${notification.messagePreview}»`
    : (lang === "en" ? "your collection" : lang === "zh" ? "你的歌单" : "твою подборку");

  const map = {
    ru: {
      message_new: `${actor} отправил сообщение`,
      support_reply: `${actor} ответил в поддержке`,
      follow_new: `${actor} подписался на тебя`,
      track_reaction_like: `${actor} лайкнул ${trackTitle}`,
      track_reaction_dislike: `${actor} дизлайкнул ${trackTitle}`,
      track_like: `${actor} лайкнул ${trackTitle}`,
      track_dislike: `${actor} дизлайкнул ${trackTitle}`,
      track_repost: `${actor} сделал репост ${trackTitle}`,
      playlist_add: `${actor} добавил ${trackTitle} в подборку ${playlistTitle}`,
      track_comment: `${actor} оставил комментарий к ${trackTitle}`,
      track_comment_reply: `${actor} ответил в комментариях к ${trackTitle}`,
      comment_new: `${actor} оставил комментарий к ${trackTitle}`,
      comment_reply: `${actor} ответил на твой комментарий`,
      mention_comment: `${actor} упомянул тебя в комментариях к ${trackTitle}`,
      comment_reaction_like: `${actor} лайкнул твой комментарий`,
      comment_reaction_dislike: `${actor} дизлайкнул твой комментарий`,
      generic: "Новое уведомление"
    },
    en: {
      message_new: `${actor} sent a message`,
      support_reply: `${actor} replied in support`,
      follow_new: `${actor} followed you`,
      track_reaction_like: `${actor} liked ${trackTitle}`,
      track_reaction_dislike: `${actor} disliked ${trackTitle}`,
      track_like: `${actor} liked ${trackTitle}`,
      track_dislike: `${actor} disliked ${trackTitle}`,
      track_repost: `${actor} reposted ${trackTitle}`,
      playlist_add: `${actor} added ${trackTitle} to ${playlistTitle}`,
      track_comment: `${actor} commented on ${trackTitle}`,
      track_comment_reply: `${actor} replied in comments on ${trackTitle}`,
      comment_new: `${actor} commented on ${trackTitle}`,
      comment_reply: `${actor} replied to your comment`,
      mention_comment: `${actor} mentioned you in comments on ${trackTitle}`,
      comment_reaction_like: `${actor} liked your comment`,
      comment_reaction_dislike: `${actor} disliked your comment`,
      generic: "New notification"
    },
    zh: {
      message_new: `${actor} 给你发了消息`,
      support_reply: `${actor} 在支持中回复了你`,
      follow_new: `${actor} 关注了你`,
      track_reaction_like: `${actor} 点赞了${trackTitle}`,
      track_reaction_dislike: `${actor} 点踩了${trackTitle}`,
      track_like: `${actor} 点赞了${trackTitle}`,
      track_dislike: `${actor} 点踩了${trackTitle}`,
      track_repost: `${actor} 转发了${trackTitle}`,
      playlist_add: `${actor} 把${trackTitle}加入了${playlistTitle}`,
      track_comment: `${actor} 评论了${trackTitle}`,
      track_comment_reply: `${actor} 回复了${trackTitle}下的评论`,
      comment_new: `${actor} 评论了${trackTitle}`,
      comment_reply: `${actor} 回复了你的评论`,
      mention_comment: `${actor} 在${trackTitle}的评论中提到了你`,
      comment_reaction_like: `${actor} 点赞了你的评论`,
      comment_reaction_dislike: `${actor} 点踩了你的评论`,
      generic: "新通知"
    }
  };

  const actionKey = notification?.action ? `${notification.type}_${notification.action}` : notification?.type;
  const table = map[lang] || map.ru;
  return table[actionKey] || table[notification?.type] || table.generic;
}

function getNotificationIcon(notification) {
  const type = String(notification?.type || "");
  if (type === "message_new") return "✉️";
  if (type === "support_reply") return "🛟";
  if (type === "follow_new") return "👤";
  if (type === "track_repost") return "🔁";
  if (type === "playlist_add") return "📁";
  if (type === "comment_new" || type === "comment_reply" || type === "track_comment" || type === "track_comment_reply") return "💬";
  if (type === "mention") return "@";
  if (type === "track_like") return "👍";
  if (type === "track_dislike") return "👎";
  if (type === "track_reaction") {
    return notification?.action === "dislike" ? "👎" : "👍";
  }
  if (type === "comment_reaction") {
    return notification?.action === "dislike" ? "👎" : "👍";
  }
  return "🔔";
}

function renderNotifications() {
  if (!elements.notificationsBtn || !elements.notificationsList) {
    return;
  }

  const logged = Boolean(state.user);
  const notifications = Array.isArray(state.notifications) ? state.notifications : [];
  const unreadCount = notifications.reduce((sum, item) => sum + (item && !item.isRead ? 1 : 0), 0);

  elements.notificationsBtn.classList.toggle("hidden", !logged);
  elements.notificationsBtn.disabled = !logged;
  if (elements.notificationsBtnText) {
    elements.notificationsBtnText.textContent = getNotificationUiText("btn");
  }
  if (elements.notificationsBadge) {
    elements.notificationsBadge.textContent = String(unreadCount);
    elements.notificationsBadge.classList.toggle("hidden", unreadCount <= 0);
  }

  if (elements.notificationsModalTitle) {
    elements.notificationsModalTitle.textContent = getNotificationUiText("title");
  }
  if (elements.notificationsModalSubtitle) {
    elements.notificationsModalSubtitle.textContent = getNotificationUiText("subtitle");
  }
  if (elements.notificationsReadAllBtn) {
    elements.notificationsReadAllBtn.textContent = getNotificationUiText("readAll");
    elements.notificationsReadAllBtn.disabled = !logged || unreadCount <= 0;
  }
  if (elements.notificationsFilterAllBtn) {
    elements.notificationsFilterAllBtn.textContent = getNotificationUiText("filterAll");
  }
  if (elements.notificationsFilterCommentsBtn) {
    elements.notificationsFilterCommentsBtn.textContent = getNotificationUiText("filterComments");
  }
  if (elements.notificationsFilterMessagesBtn) {
    elements.notificationsFilterMessagesBtn.textContent = getNotificationUiText("filterMessages");
  }
  if (elements.notificationsFilterFollowsBtn) {
    elements.notificationsFilterFollowsBtn.textContent = getNotificationUiText("filterFollows");
  }
  for (const button of (elements.notificationsFilterButtons || [])) {
    const filter = String(button.dataset.notificationsFilter || "all");
    button.classList.toggle("active", filter === state.notificationsFilter);
    button.setAttribute("aria-pressed", filter === state.notificationsFilter ? "true" : "false");
  }

  if (elements.notificationsModal) {
    if (!logged) {
      state.notificationsModalOpen = false;
    }
    elements.notificationsModal.classList.toggle("hidden", !logged || !state.notificationsModalOpen);
    elements.notificationsModal.setAttribute("aria-hidden", (!logged || !state.notificationsModalOpen) ? "true" : "false");
  }

  elements.notificationsList.innerHTML = "";

  if (!logged) {
    return;
  }

  const currentFilter = String(state.notificationsFilter || "all");
  const filteredNotifications = notifications.filter((item) => matchesNotificationFilter(item, currentFilter));

  if (filteredNotifications.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = notifications.length === 0
      ? getNotificationUiText("empty")
      : getNotificationUiText("emptyFiltered");
    elements.notificationsList.appendChild(empty);
    return;
  }

  for (const notification of filteredNotifications) {
    const row = document.createElement("div");
    row.className = `notification-item${notification.isRead ? "" : " unread"}`;
    row.dataset.notificationId = notification.id;

    const icon = document.createElement("div");
    icon.className = "notification-item-icon";
    icon.textContent = getNotificationIcon(notification);

    const body = document.createElement("div");
    body.className = "notification-item-body";

    const title = document.createElement("p");
    title.className = "notification-item-title";
    title.textContent = formatNotificationPrimaryText(notification);

    const meta = document.createElement("p");
    meta.className = "notification-item-meta";
    meta.textContent = notification.createdAt ? formatDate(notification.createdAt) : getNotificationUiText("justNow");

    body.append(title, meta);

    const preview = String(notification.messagePreview || notification.commentPreview || "").trim();
    if (preview && notification.type !== "playlist_add") {
      const previewNode = document.createElement("p");
      previewNode.className = "notification-item-preview";
      previewNode.textContent = preview;
      body.appendChild(previewNode);
    }

    const actions = document.createElement("div");
    actions.className = "notification-item-actions";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "ghost notification-item-open";
    openBtn.textContent = notification.type === "message_new"
      ? getNotificationUiText("openDialog")
      : notification.type === "support_reply"
        ? getNotificationUiText("openSupport")
        : getNotificationUiText("open");
    openBtn.addEventListener("click", async () => {
      if (notification.type === "message_new" && notification.peerUserId && window.SferaMessagesModal) {
        try {
          state.notificationsModalOpen = false;
          renderNotifications();
          await window.SferaMessagesModal.openForUserId(notification.peerUserId);
          return;
        } catch (error) {
          setStatus(error.message || String(error || "Ошибка"), "error");
          return;
        }
      }
      if (notification.type === "support_reply" && typeof __sferaSettingsUi.openSupportWorkspace === "function") {
        try {
          state.notificationsModalOpen = false;
          renderNotifications();
          await __sferaSettingsUi.openSupportWorkspace();
          return;
        } catch (error) {
          setStatus(error.message || String(error || "Ошибка"), "error");
          return;
        }
      }
      if (notification.href) {
        const href = String(notification.href || "").trim();
        if (!href) {
          return;
        }
        if (notification.type === "follow_new" || href.startsWith("/public-profile.html") || href.startsWith("/u/")) {
          window.open(href, "_blank", "noopener,noreferrer");
          return;
        }
        window.location.href = href;
      }
    });
    actions.appendChild(openBtn);

    if (!notification.isRead) {
      const dot = document.createElement("span");
      dot.className = "notification-item-dot";
      dot.setAttribute("aria-hidden", "true");
      actions.appendChild(dot);
    }

    row.append(icon, body, actions);
    elements.notificationsList.appendChild(row);
  }
}

const __sferaSettingsUi = window.SferaSettingsUi.createAppSettingsUi({
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
  normalizeUiDensity,
  getUiMessages,
  t,
  loadGuestUiLanguage,
  saveGuestUiLanguage,
  resolvePreferredUiLanguage,
  setStatus,
  setTextBySelector,
  setLabelTextForControl,
  applyUiLanguage,
  applyUiDensity,
  loadSavedUiDensity,
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
  getTrackAuthorsLabel,
  setImageWithFallback,
  loadAudioDurationFromSource,
  getAudioDurationFromFile,
  getAudioDurationFromUrl,
  clampVolume,
  loadSavedVolume,
  saveVolume,
  createDefaultEqualizer,
  normalizeEqualizer,
  loadSavedEqualizer,
  saveEqualizerSettings,
  updateEqualizerLabels,
  applyEqualizerToEngine,
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
  renderEqualizerControls,
  detectEqualizerPresetKey,
  syncEqualizerPresetSelect,
  applyEqualizerPreset,
  setupEqualizerControls,
  setupGlobalPlayer,
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
  isBeatTrack,
  normalizeBeatLicenses,
  getBeatLicenseTypeLabel,
  formatBeatLicensePrice,
  getOwnPlaylists,
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
  getSharedTrackIdFromLocation,
  openTrackFromSharedLinkIfNeeded,
  renderFeedSearchResults,
  createSelectionItem,
  renderSelections,
  createPlaylistCard,
  renderPlaylists,
  createAlbumCard,
  renderAlbums,
  renderAlbumCardsList,
  createLikedTrackItem,
  renderLikedTracks,
  buildPlaylistAdder,
  createTagWrap,
  toggleTrackReaction,
  toggleTrackRepost,
  deleteTrack,
  createComment,
  deleteComment,
  toggleCommentReaction,
  buildAuthorBadge,
  renderCommentNode,
  buildTrackEditForm,
  openMessageToUser,
  createBeatCard,
  createTrackCard,
  renderTracksList,
  renderProfile,
  renderFeed,
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
  renderAlbumTrackOptions,
  renderAuthorAnalytics,
  renderAll,
  refreshMe,
  refreshOnlineUsers,
  refreshUsers,
  refreshTracks,
  refreshAuthorAnalytics,
  refreshListenHistory,
  refreshPlaylists,
  refreshAlbums,
  refreshFollows,
  refreshThreads,
  loadConversation,
  fullRefresh,
  toggleFollow,
  handleAuthSubmit,
  init
});
function createSimpleUserRow(...args) {
  return __sferaSettingsUi.createSimpleUserRow(...args);
}

function buildUserControls(...args) {
  return __sferaSettingsUi.buildUserControls(...args);
}

function renderFriends(...args) {
  return __sferaSettingsUi.renderFriends(...args);
}

function openSettingsSubscriptionsSection(...args) {
  return __sferaSettingsUi.openSettingsSubscriptionsSection(...args);
}

function renderMessages(...args) {
  return __sferaSettingsUi.renderMessages(...args);
}

function renderListenHistory(...args) {
  return __sferaSettingsUi.renderListenHistory(...args);
}

function renderSettings(...args) {
  return __sferaSettingsUi.renderSettings(...args);
}

function saveLanguagePreference(...args) {
  return __sferaSettingsUi.saveLanguagePreference(...args);
}

function saveUiDensityPreference(...args) {
  return __sferaSettingsUi.saveUiDensityPreference(...args);
}

function createSkeletonCardNode() {
  const card = document.createElement("div");
  card.className = "skeleton-card";

  const title = document.createElement("div");
  title.className = "skeleton-line title";

  const meta = document.createElement("div");
  meta.className = "skeleton-line meta";

  const short = document.createElement("div");
  short.className = "skeleton-line short";

  card.append(title, meta, short);
  return card;
}

function createSkeletonCommentNode() {
  const comment = document.createElement("div");
  comment.className = "skeleton-comment";

  const lineA = document.createElement("div");
  lineA.className = "skeleton-line title";
  const lineB = document.createElement("div");
  lineB.className = "skeleton-line meta";
  const lineC = document.createElement("div");
  lineC.className = "skeleton-line short";

  comment.append(lineA, lineB, lineC);
  return comment;
}

function createSkeletonStatsCardNode() {
  const card = document.createElement("div");
  card.className = "skeleton-stats-card";
  const title = document.createElement("div");
  title.className = "skeleton-line short";
  const value = document.createElement("div");
  value.className = "skeleton-line title";
  card.append(title, value);
  return card;
}

function renderSkeletonCards(container, count = 3, options = {}) {
  if (!container) {
    return;
  }
  const variant = String(options?.variant || "default");
  container.innerHTML = "";
  container.classList.add("skeleton-list");
  for (let i = 0; i < count; i += 1) {
    const card = createSkeletonCardNode();
    if (variant === "track") {
      const commentsWrap = document.createElement("div");
      commentsWrap.className = "comments-wrap";
      commentsWrap.append(createSkeletonCommentNode(), createSkeletonCommentNode());
      card.appendChild(commentsWrap);
    }
    container.appendChild(card);
  }
}

function clearSkeletonMode(container) {
  if (!container) {
    return;
  }
  container.classList.remove("skeleton-list");
}

function renderStatsSkeleton(container, count = 8) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  container.classList.add("skeleton-stats-grid");
  for (let i = 0; i < count; i += 1) {
    container.appendChild(createSkeletonStatsCardNode());
  }
}

function clearStatsSkeleton(container) {
  if (!container) {
    return;
  }
  container.classList.remove("skeleton-stats-grid");
}

function showLoadingSkeletons() {
  renderSkeletonCards(elements.selectionPopular, 3);
  renderSkeletonCards(elements.selectionFresh, 3);
  renderSkeletonCards(elements.selectionCharts, 3);
  renderSkeletonCards(elements.feedTracksList, 3, { variant: "track" });
  renderSkeletonCards(elements.playlistsList, 3);
  renderSkeletonCards(elements.albumsList, 3);
  renderSkeletonCards(elements.likedTracksList, 3);
  renderStatsSkeleton(elements.authorStatsWrap, 8);

  const profileTargets = [
    elements.profileTracksList,
    elements.profileBeatsList,
    elements.profileRepostsList,
    elements.profileLikesList,
    elements.profileAlbumsList
  ];
  for (const target of profileTargets) {
    const isTrackContainer = target !== elements.profileAlbumsList;
    renderSkeletonCards(target, 2, { variant: isTrackContainer ? "track" : "default" });
  }
}

function renderAll() {
  const targets = [
    elements.selectionPopular,
    elements.selectionFresh,
    elements.selectionCharts,
    elements.feedTracksList,
    elements.playlistsList,
    elements.albumsList,
    elements.likedTracksList,
    elements.profileTracksList,
    elements.profileBeatsList,
    elements.profileRepostsList,
    elements.profileLikesList,
    elements.profileAlbumsList,
    elements.authorStatsWrap
  ];
  for (const target of targets) {
    clearSkeletonMode(target);
    clearStatsSkeleton(target);
  }

  reconcilePlayerQueue();
  renderAccessBlocks();
  renderFeed();
  renderProfile();
  renderAuthorAnalytics();
  renderAlbumTrackOptions();
  renderSettings();
  renderNotifications();
  renderAuthGate();
  renderExpandedPlayerContent();
  updateTrackPlayButtons();
  updateGlobalPlayerButtons();
  updateSeekUi();
}

async function refreshMe() {
  try {
    const data = await api("/api/me");
    state.user = data.user || null;
    if (state.user) {
      setGuestMode(false);
    }
    applyUiLanguage(resolvePreferredUiLanguage());
  } catch (error) {
    if (isNotFoundError(error)) {
      state.user = null;
      applyUiLanguage(resolvePreferredUiLanguage());
      return;
    }
    throw error;
  }
}

async function refreshOnlineUsers() {
  const data = await api("/api/online");
  state.onlineUsers = Number.isFinite(Number(data.onlineUsers)) ? Math.max(0, Number(data.onlineUsers)) : 0;
  renderOnlineCounter();
}

async function refreshUsers() {
  try {
    const data = await api("/api/users");
    state.users = Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.users = [];
      return;
    }
    throw error;
  }
}

async function refreshTracks() {
  try {
    const data = await api("/api/tracks");
    state.tracks = Array.isArray(data.tracks) ? data.tracks : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.tracks = [];
      return;
    }
    throw error;
  }
}

async function refreshAuthorAnalytics() {
  if (!state.user) {
    state.authorAnalytics = null;
    return;
  }

  try {
    const data = await api("/api/profile/analytics");
    state.authorAnalytics = data.analytics || null;
  } catch (error) {
    if (isNotFoundError(error)) {
      state.authorAnalytics = null;
      return;
    }
    throw error;
  }
}

async function refreshListenHistory() {
  if (!state.user) {
    state.listenHistory = [];
    return;
  }

  try {
    const data = await api("/api/listen-history");
    state.listenHistory = Array.isArray(data.history) ? data.history : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.listenHistory = [];
      return;
    }
    throw error;
  }
}

async function refreshPlaylists() {
  try {
    const data = await api("/api/playlists");
    state.playlists = Array.isArray(data.playlists) ? data.playlists : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.playlists = [];
      return;
    }
    throw error;
  }
}

async function refreshAlbums() {
  try {
    const data = await api("/api/albums");
    state.albums = Array.isArray(data.albums) ? data.albums : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.albums = [];
      return;
    }
    throw error;
  }
}

async function refreshNotifications() {
  if (!state.user) {
    state.notifications = [];
    return;
  }

  try {
    const data = await api("/api/notifications");
    state.notifications = Array.isArray(data.notifications) ? data.notifications : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.notifications = [];
      return;
    }
    throw error;
  }
}

async function refreshFollows() {
  if (!state.user) {
    state.follows = { following: [], followers: [] };
    return;
  }

  try {
