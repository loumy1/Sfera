const state = {
  activeTab: "profile",
  user: null,
  isGuest: false,
  users: [],
  tracks: [],
  albums: [],
  playlists: [],
  follows: {
    following: [],
    followers: []
  },
  threads: [],
  currentChatUserId: null,
  currentChatUser: null,
  chatMessages: [],
  feedFilter: "all",
  feedQuickFilters: {
    genre: "",
    bpm: "all"
  },
  feedSearchQuery: "",
  feedSearchMatches: [],
  feedSearchActiveIndex: -1,
  profileSection: "tracks",
  playbackVolume: 0.5,
  onlineUsers: 0,
  authorAnalytics: null,
  listenHistory: [],
  notifications: [],
  notificationsModalOpen: false,
  notificationsFilter: "all",
  uiLanguage: "ru",
  uiDensity: "comfortable",
  feedSectionsCollapsed: {
    selections: false,
    library: false
  },
  profileSectionsCollapsed: {
    pinnedRelease: false,
    authorStats: false
  },
  commentsCollapsedMap: {},
  trackDetailsExpandedMap: {},
  usersDirectorySearchQuery: "",
  albumDurationCache: {},
  albumTrackPicker: {
    searchQuery: "",
    sort: "newest",
    filterMode: "all",
    selectedTrackIds: []
  },
  player: {
    queue: [],
    currentIndex: -1,
    activeTrackId: null,
    shuffle: false,
    repeatMode: "off",
    listenReported: false,
    reportedMilestones: { 25: false, 50: false, 100: false },
    currentSource: "feed",
    seekDragging: false,
    seekPreviewTime: 0,
    isExpanded: false,
    isMuted: false,
    lastVolumeBeforeMute: 0.5
  },
  equalizer: {}
};

const realtime = {
  socket: null,
  reconnectTimer: null,
  manualClose: false
};

const audioEngine = {
  context: null,
  sourceNode: null,
  gainNode: null,
  filters: []
};

const elements = {
  globalStatus: document.getElementById("globalStatus"),
  onlineCounter: document.getElementById("onlineCounter"),
  notificationsBtn: document.getElementById("notificationsBtn"),
  notificationsBtnText: document.getElementById("notificationsBtnText"),
  notificationsBadge: document.getElementById("notificationsBadge"),
  notificationsModal: document.getElementById("notificationsModal"),
  notificationsModalCloseBtn: document.getElementById("notificationsModalCloseBtn"),
  notificationsModalTitle: document.getElementById("notificationsModalTitle"),
  notificationsModalSubtitle: document.getElementById("notificationsModalSubtitle"),
  notificationsReadAllBtn: document.getElementById("notificationsReadAllBtn"),
  notificationsFilters: document.getElementById("notificationsFilters"),
  notificationsFilterAllBtn: document.getElementById("notificationsFilterAllBtn"),
  notificationsFilterCommentsBtn: document.getElementById("notificationsFilterCommentsBtn"),
  notificationsFilterMessagesBtn: document.getElementById("notificationsFilterMessagesBtn"),
  notificationsFilterFollowsBtn: document.getElementById("notificationsFilterFollowsBtn"),
  notificationsFilterButtons: Array.from(document.querySelectorAll("[data-notifications-filter]")),
  notificationsList: document.getElementById("notificationsList"),
  brandFeedLink: document.getElementById("brandFeedLink"),

  tabButtons: Array.from(document.querySelectorAll(".tabs-nav .tab-btn[data-tab]")),
  tabPanels: {
    profile: document.getElementById("tab-profile"),
    publish: document.getElementById("tab-publish"),
    feed: document.getElementById("tab-feed"),
    settings: document.getElementById("tab-settings")
  },

  profileGuest: document.getElementById("profileGuest"),
  profileContent: document.getElementById("profileContent"),
  profileHeader: document.getElementById("profileHeader"),
  profileAvatar: document.getElementById("profileAvatar"),
  profileUsername: document.getElementById("profileUsername"),
  profileBio: document.getElementById("profileBio"),
  profileCreated: document.getElementById("profileCreated"),
  profileTracksList: document.getElementById("profileTracksList"),
  profileBeatsList: document.getElementById("profileBeatsList"),
  profileRepostsList: document.getElementById("profileRepostsList"),
  profileLikesList: document.getElementById("profileLikesList"),
  profileAlbumsList: document.getElementById("profileAlbumsList"),
  profilePinnedRelease: document.getElementById("profilePinnedRelease"),
  profilePinnedReleaseTitle: document.getElementById("profilePinnedReleaseTitle"),
  profilePinnedReleaseContent: document.getElementById("profilePinnedReleaseContent"),
  togglePinnedReleaseBtn: document.getElementById("togglePinnedReleaseBtn"),
  authorStatsWrap: document.getElementById("authorStatsWrap"),
  toggleAuthorStatsBtn: document.getElementById("toggleAuthorStatsBtn"),
  statTracks: document.getElementById("statTracks"),
  statReposts: document.getElementById("statReposts"),
  statFollowers: document.getElementById("statFollowers"),
  statFollowing: document.getElementById("statFollowing"),
  profileFollowersStatBtn: document.getElementById("profileFollowersStatBtn"),
  profileFollowingStatBtn: document.getElementById("profileFollowingStatBtn"),
  profileShareBtn: document.getElementById("profileShareBtn"),
  profileOpenPublicBtn: document.getElementById("profileOpenPublicBtn"),
  profileTabButtons: Array.from(document.querySelectorAll("[data-profile-section]")),
  profilePanels: Array.from(document.querySelectorAll("[data-profile-panel]")),

  publishGuest: document.getElementById("publishGuest"),
  uploadForm: document.getElementById("uploadForm"),
  trackTitle: document.getElementById("trackTitle"),
  trackGenre: document.getElementById("trackGenre"),
  trackPublishMode: document.getElementById("trackPublishMode"),
  trackPremiereAtWrap: document.getElementById("trackPremiereAtWrap"),
  trackPremiereAt: document.getElementById("trackPremiereAt"),
  trackAuthors: document.getElementById("trackAuthors"),
  trackProducers: document.getElementById("trackProducers"),
  trackHashtags: document.getElementById("trackHashtags"),
  trackDescription: document.getElementById("trackDescription"),
  trackCover: document.getElementById("trackCover"),
  trackFile: document.getElementById("trackFile"),
  uploadBtn: document.getElementById("uploadBtn"),
  albumForm: document.getElementById("albumForm"),
  albumTitle: document.getElementById("albumTitle"),
  albumGenre: document.getElementById("albumGenre"),
  albumAuthors: document.getElementById("albumAuthors"),
  albumProducers: document.getElementById("albumProducers"),
  albumHashtags: document.getElementById("albumHashtags"),
  albumDescription: document.getElementById("albumDescription"),
  albumCover: document.getElementById("albumCover"),
  albumTrackFiles: document.getElementById("albumTrackFiles"),
  albumTrackFilesSummary: document.getElementById("albumTrackFilesSummary"),
  albumTracksInfo: document.getElementById("albumTracksInfo"),
  albumTracksSearchInput: document.getElementById("albumTracksSearchInput"),
  albumTracksSortSelect: document.getElementById("albumTracksSortSelect"),
  albumTracksFilterAllBtn: document.getElementById("albumTracksFilterAllBtn"),
  albumTracksFilterSelectedBtn: document.getElementById("albumTracksFilterSelectedBtn"),
  albumTracksList: document.getElementById("albumTracksList"),
  albumPublishBtn: document.getElementById("albumPublishBtn"),
  beatForm: document.getElementById("beatForm"),
  beatTitle: document.getElementById("beatTitle"),
  beatGenre: document.getElementById("beatGenre"),
  beatBpm: document.getElementById("beatBpm"),
  beatRootNote: document.getElementById("beatRootNote"),
  beatHashtags: document.getElementById("beatHashtags"),
  beatDescription: document.getElementById("beatDescription"),
  beatCover: document.getElementById("beatCover"),
  beatFile: document.getElementById("beatFile"),
  beatLicenseCurrency: document.getElementById("beatLicenseCurrency"),
  beatLicenseMp3Enabled: document.getElementById("beatLicenseMp3Enabled"),
  beatLicenseMp3Price: document.getElementById("beatLicenseMp3Price"),
  beatLicenseWavEnabled: document.getElementById("beatLicenseWavEnabled"),
  beatLicenseWavPrice: document.getElementById("beatLicenseWavPrice"),
  beatLicenseTrackoutEnabled: document.getElementById("beatLicenseTrackoutEnabled"),
  beatLicenseTrackoutPrice: document.getElementById("beatLicenseTrackoutPrice"),
  beatLicenseExclusiveEnabled: document.getElementById("beatLicenseExclusiveEnabled"),
  beatLicenseExclusivePrice: document.getElementById("beatLicenseExclusivePrice"),
  beatPublishBtn: document.getElementById("beatPublishBtn"),

  feedFilters: Array.from(document.querySelectorAll(".feed-filter")),
  refreshBtn: document.getElementById("refreshBtn"),
  feedSearchForm: document.getElementById("feedSearchForm"),
  feedSearchInput: document.getElementById("feedSearchInput"),
  feedSearchBtn: document.getElementById("feedSearchBtn"),
  feedSearchResults: document.getElementById("feedSearchResults"),
  feedQuickFilters: document.getElementById("feedQuickFilters"),
  quickGenreLabel: document.getElementById("quickGenreLabel"),
  quickGenreSelect: document.getElementById("quickGenreSelect"),
  quickBpmLabel: document.getElementById("quickBpmLabel"),
  quickBpmSelect: document.getElementById("quickBpmSelect"),
  quickFiltersResetBtn: document.getElementById("quickFiltersResetBtn"),
  feedStickyBar: document.getElementById("feedStickyBar"),
  toggleFeedSelectionsBtn: document.getElementById("toggleFeedSelectionsBtn"),
  toggleFeedLibraryBtn: document.getElementById("toggleFeedLibraryBtn"),
  feedSelectionsWrap: document.getElementById("feedSelectionsWrap"),
  feedLibraryWrap: document.getElementById("feedLibraryWrap"),
  feedMainListTitle: document.getElementById("feedMainListTitle"),
  selectionPopular: document.getElementById("selectionPopular"),
  selectionPopularTitle: document.getElementById("selectionPopularTitle"),
  selectionFresh: document.getElementById("selectionFresh"),
  selectionFreshTitle: document.getElementById("selectionFreshTitle"),
  selectionCharts: document.getElementById("selectionCharts"),
  selectionChartsTitle: document.getElementById("selectionChartsTitle"),
  playlistsList: document.getElementById("playlistsList"),
  albumsList: document.getElementById("albumsList"),
  likedTracksList: document.getElementById("likedTracksList"),
  feedTracksList: document.getElementById("feedTracksList"),
  createPlaylistForm: document.getElementById("createPlaylistForm"),
  playlistTitle: document.getElementById("playlistTitle"),
  playlistDescription: document.getElementById("playlistDescription"),
  playlistGuestHint: document.getElementById("playlistGuestHint"),

  authGuest: document.getElementById("authGuest"),
  authLogged: document.getElementById("authLogged"),
  loggedInfo: document.getElementById("loggedInfo"),
  registerForm: document.getElementById("registerForm"),
  loginForm: document.getElementById("loginForm"),
  passwordResetRequestForm: document.getElementById("passwordResetRequestForm"),
  authGateModal: document.getElementById("authGateModal"),
  authGateStatus: document.getElementById("authGateStatus"),
  authGateRegisterForm: document.getElementById("authGateRegisterForm"),
  authGateLoginForm: document.getElementById("authGateLoginForm"),
  authGatePasswordResetRequestForm: document.getElementById("authGatePasswordResetRequestForm"),
  authGateLanguageSelect: document.getElementById("authGateLanguageSelect"),
  authGateLanguageLabel: document.getElementById("authGateLanguageLabel"),
  authGateGuestBtn: document.getElementById("authGateGuestBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  emailStatusInfo: document.getElementById("emailStatusInfo"),
  emailProfileForm: document.getElementById("emailProfileForm"),
  emailProfileInput: document.getElementById("emailProfileInput"),
  sendVerificationEmailBtn: document.getElementById("sendVerificationEmailBtn"),
  passwordForm: document.getElementById("passwordForm"),
  currentPasswordInput: document.getElementById("currentPasswordInput"),
  newPasswordInput: document.getElementById("newPasswordInput"),
  promoCodeForm: document.getElementById("promoCodeForm"),
  promoCodeInput: document.getElementById("promoCodeInput"),

  friendsGuest: document.getElementById("friendsGuest"),
  friendsAuth: document.getElementById("friendsAuth"),
  incomingRequestsList: document.getElementById("incomingRequestsList"),
  friendsList: document.getElementById("friendsList"),
  usersList: document.getElementById("usersList"),
  usersListSearchInput: document.getElementById("usersListSearchInput"),
  followersSection: document.getElementById("followersSection"),
  followingSection: document.getElementById("followingSection"),
  allUsersHeading: document.getElementById("allUsersHeading"),
  followersHeading: document.getElementById("followersHeading"),
  followingHeading: document.getElementById("followingHeading"),

  messagesGuest: document.getElementById("messagesGuest"),
  messagesAuth: document.getElementById("messagesAuth"),
  chatUserSelect: document.getElementById("chatUserSelect"),
  openChatBtn: document.getElementById("openChatBtn"),
  chatList: document.getElementById("chatList"),
  sendMessageForm: document.getElementById("sendMessageForm"),
  chatInput: document.getElementById("chatInput"),
  threadsList: document.getElementById("threadsList"),
  listenHistoryList: document.getElementById("listenHistoryList"),
  contactToggleBtn: document.getElementById("contactToggleBtn"),
  contactPanel: document.getElementById("contactPanel"),
  contactTelegramBtn: document.getElementById("contactTelegramBtn"),
  siteLanguageSelect: document.getElementById("siteLanguageSelect"),
  saveLanguageBtn: document.getElementById("saveLanguageBtn"),
  uiDensityTitle: document.getElementById("uiDensityTitle"),
  uiDensityHint: document.getElementById("uiDensityHint"),
  uiDensityLabel: document.getElementById("uiDensityLabel"),
  uiDensitySelect: document.getElementById("uiDensitySelect"),
  saveUiDensityBtn: document.getElementById("saveUiDensityBtn"),

  equalizerResetBtn: document.getElementById("equalizerResetBtn"),
  equalizerPresetSelect: document.getElementById("equalizerPresetSelect"),
  equalizerPresetApplyBtn: document.getElementById("equalizerPresetApplyBtn"),
  equalizerInputs: Array.from(document.querySelectorAll("input[data-eq-band]")),

  globalPlayer: document.getElementById("globalPlayer"),
  globalPlayerAudio: document.getElementById("globalPlayerAudio"),
  playerTrackCover: document.getElementById("playerTrackCover"),
  playerTrackTitle: document.getElementById("playerTrackTitle"),
  playerTrackAuthors: document.getElementById("playerTrackAuthors"),
  playerTrackMeta: document.getElementById("playerTrackMeta"),
  playerTrackInfoWrap: document.getElementById("playerTrackInfoWrap"),
  playerPrevBtn: document.getElementById("playerPrevBtn"),
  playerPlayBtn: document.getElementById("playerPlayBtn"),
  playerPauseBtn: document.getElementById("playerPauseBtn"),
  playerStopBtn: document.getElementById("playerStopBtn"),
  playerNextBtn: document.getElementById("playerNextBtn"),
  playerExpandBtn: document.getElementById("playerExpandBtn"),
  playerShuffleBtn: document.getElementById("playerShuffleBtn"),
  playerRepeatAllBtn: document.getElementById("playerRepeatAllBtn"),
  playerRepeatOneBtn: document.getElementById("playerRepeatOneBtn"),
  playerCloseBtn: document.getElementById("playerCloseBtn"),
  playerVolumeSlider: document.getElementById("playerVolumeSlider"),
  playerSeekSlider: document.getElementById("playerSeekSlider"),
  playerCurrentTime: document.getElementById("playerCurrentTime"),
  playerDuration: document.getElementById("playerDuration")
};

const MAX_MP3_BYTES = 15 * 1024 * 1024;
const MAX_WAV_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const COVER_SIZE = 500;
const MAX_ALBUM_TRACKS = 100;
const MAX_ALBUM_DURATION_SECONDS = 120 * 60;
const VOLUME_STORAGE_KEY = "beatoon_volume";
const EQUALIZER_STORAGE_KEY = "beatoon_equalizer_v1";
const GUEST_LANGUAGE_STORAGE_KEY = "trapdom_ui_language_v1";
const GUEST_MODE_STORAGE_KEY = "sfera_guest_mode_v1";
const UI_DENSITY_STORAGE_KEY = "sfera_ui_density_v1";
const DEFAULT_UI_LANGUAGE = "ru";
const EQUALIZER_BANDS = [60, 230, 910, 3600, 14000];
const ONLINE_POLL_INTERVAL_MS = 15000;
const EQUALIZER_PRESETS = {
  custom: null,
  flat: { 60: 0, 230: 0, 910: 0, 3600: 0, 14000: 0 },
  bass_boost: { 60: 7, 230: 4, 910: 1, 3600: -1, 14000: -2 },
  vocal_clarity: { 60: -2, 230: -1, 910: 3, 3600: 5, 14000: 2 },
  treble_shine: { 60: -3, 230: -1, 910: 1, 3600: 4, 14000: 6 },
  club: { 60: 4, 230: 2, 910: -2, 3600: 2, 14000: 4 },
  lofi: { 60: 3, 230: 1, 910: -2, 3600: -4, 14000: -6 }
};
const { SUPPORTED_UI_LANGUAGES, UI_MESSAGES } = window.SferaUiI18n || {};

function normalizeUiLanguage(value, fallback = DEFAULT_UI_LANGUAGE) {
  return window.SferaUiI18n.normalizeUiLanguage(value, fallback);
}

function getUiMessages(lang = state.uiLanguage) {
  return window.SferaUiI18n.getUiMessages(lang, DEFAULT_UI_LANGUAGE);
}

function t(key, lang = state.uiLanguage) {
  return window.SferaUiI18n.t(key, lang, DEFAULT_UI_LANGUAGE);
}

function loadGuestUiLanguage() {
  return window.SferaUiI18n.loadGuestUiLanguage(GUEST_LANGUAGE_STORAGE_KEY, DEFAULT_UI_LANGUAGE);
}

function saveGuestUiLanguage(lang) {
  return window.SferaUiI18n.saveGuestUiLanguage(GUEST_LANGUAGE_STORAGE_KEY, lang, DEFAULT_UI_LANGUAGE);
}

function loadGuestMode() {
  try {
    const raw = String(window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) || "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes";
  } catch {
    return false;
  }
}

function saveGuestMode(enabled) {
  try {
    window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore storage errors
  }
}

function setGuestMode(enabled) {
  state.isGuest = Boolean(enabled) && !state.user;
  saveGuestMode(state.isGuest);
}

function resolvePreferredUiLanguage() {
  return window.SferaUiI18n.resolvePreferredUiLanguage({
    userLanguage: state.user?.language,
    storageKey: GUEST_LANGUAGE_STORAGE_KEY,
    fallback: DEFAULT_UI_LANGUAGE
  });
}

let statusFadeTimer = null;
let statusClearTimer = null;
let statusMessageSeq = 0;

function setStatus(text, type = "info") {
  if (!elements.globalStatus) {
    return;
  }

  statusMessageSeq += 1;
  const seq = statusMessageSeq;
  if (statusFadeTimer) {
    clearTimeout(statusFadeTimer);
    statusFadeTimer = null;
  }
  if (statusClearTimer) {
    clearTimeout(statusClearTimer);
    statusClearTimer = null;
  }

  elements.globalStatus.textContent = text || "";
  elements.globalStatus.classList.remove("error", "success", "is-fading");

  if (type === "error") {
    elements.globalStatus.classList.add("error");
  }

  if (type === "success") {
    elements.globalStatus.classList.add("success");
  }

  if (!text) {
    elements.globalStatus.classList.remove("is-visible");
    return;
  }

  elements.globalStatus.classList.add("is-visible");

  statusFadeTimer = setTimeout(() => {
    if (seq !== statusMessageSeq) return;
    elements.globalStatus.classList.add("is-fading");
  }, 5000);

  statusClearTimer = setTimeout(() => {
    if (seq !== statusMessageSeq) return;
    elements.globalStatus.textContent = "";
    elements.globalStatus.classList.remove("error", "success", "is-visible", "is-fading");
  }, 5600);
}

function setTextBySelector(selector, value) {
  const node = document.querySelector(selector);
  if (node && typeof value === "string") {
    node.textContent = value;
  }
}

function setLabelTextForControl(control, text) {
  if (!control || typeof text !== "string") {
    return;
  }
  const label = control.closest("label");
  if (!label) {
    return;
  }
  for (const child of label.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      child.textContent = `\n                  ${text}\n                  `;
      return;
    }
  }
}

function normalizeUiDensity(value) {
  return String(value || "").trim().toLowerCase() === "compact" ? "compact" : "comfortable";
}

function loadSavedUiDensity() {
  try {
    return normalizeUiDensity(window.localStorage.getItem(UI_DENSITY_STORAGE_KEY));
  } catch {
    return "comfortable";
  }
}

function saveUiDensity(value) {
  const normalized = normalizeUiDensity(value);
  try {
    window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, normalized);
  } catch {
    // ignore storage errors
  }
  return normalized;
}

function applyUiDensity(value) {
  const normalized = saveUiDensity(value);
  state.uiDensity = normalized;
  document.body.dataset.uiDensity = normalized;
  if (elements.uiDensitySelect) {
    elements.uiDensitySelect.value = normalized;
  }
}

function applyUiLanguage(lang) {
  const nextLang = normalizeUiLanguage(lang, DEFAULT_UI_LANGUAGE);
  state.uiLanguage = nextLang;
  document.documentElement.lang = nextLang;
  saveGuestUiLanguage(nextLang);

  if (elements.siteLanguageSelect) {
    elements.siteLanguageSelect.value = nextLang;
  }
  if (elements.authGateLanguageSelect) {
    elements.authGateLanguageSelect.value = nextLang;
  }

  setTextBySelector(".tabs-nav .tab-btn[data-tab='profile']", t("navProfile", nextLang));
  setTextBySelector(".tabs-nav .tab-btn[data-tab='publish']", t("navPublish", nextLang));
  setTextBySelector(".tabs-nav .tab-btn[data-tab='feed']", t("navFeed", nextLang));
  setTextBySelector(".tabs-nav .tab-btn[data-tab='settings']", t("navSettings", nextLang));
  setTextBySelector("header .brand-wrap > .brand-beta", t("brandBeta", nextLang));
  setTextBySelector("#profileGuest h2", t("guestProfileTitle", nextLang));
  setTextBySelector("#profileGuest p", t("guestProfileText", nextLang));
  setTextBySelector("#publishGuest h2", t("guestPublishTitle", nextLang));
  setTextBySelector("#publishGuest p", t("guestPublishText", nextLang));
  setTextBySelector("#uploadForm h2", t("publishTrackTitle", nextLang));
  setTextBySelector("#albumForm h2", t("publishAlbumTitle", nextLang));
  setTextBySelector("#beatForm h2", t("publishBeatTitle", nextLang));

  setTextBySelector(".profile-tab[data-profile-section='tracks']", t("profileTabTracks", nextLang));
  setTextBySelector(".profile-tab[data-profile-section='beats']", t("profileTabBeats", nextLang));
  setTextBySelector(".profile-tab[data-profile-section='reposts']", t("profileTabReposts", nextLang));
  setTextBySelector(".profile-tab[data-profile-section='likes']", t("profileTabLikes", nextLang));
  setTextBySelector(".profile-tab[data-profile-section='albums']", t("profileTabAlbums", nextLang));
  setTextBySelector(".profile-tab[data-profile-section='stats']", t("profileTabStats", nextLang));
  setTextBySelector("#statTracksLabel", t("profileStatTracks", nextLang));
  setTextBySelector("#statRepostsLabel", t("profileStatReposts", nextLang));
  setTextBySelector("#statFollowersLabel", t("profileStatFollowers", nextLang));
  setTextBySelector("#statFollowingLabel", t("profileStatFollowing", nextLang));

  setTextBySelector("[data-profile-panel='tracks'] > h3", t("profilePanelTracks", nextLang));
  setTextBySelector("[data-profile-panel='beats'] > h3", t("profilePanelBeats", nextLang));
  setTextBySelector("[data-profile-panel='reposts'] > h3", t("profilePanelReposts", nextLang));
  setTextBySelector("[data-profile-panel='likes'] > h3", t("profilePanelLikes", nextLang));
  setTextBySelector("[data-profile-panel='albums'] > h3", t("profilePanelAlbums", nextLang));
  setTextBySelector("[data-profile-panel='stats'] > h3", t("profilePanelStats", nextLang));
  setTextBySelector("#profilePinnedReleaseTitle", t("profilePinnedReleaseTitle", nextLang));

  setTextBySelector(".window-feed .feed-top h2", t("feedTitle", nextLang));
  setTextBySelector(".feed-filter[data-filter='others']", t("feedFilterOthers", nextLang));
  setTextBySelector(".feed-filter[data-filter='all']", t("feedFilterAll", nextLang));
  setTextBySelector(".feed-filter[data-filter='mine']", t("feedFilterMine", nextLang));
  setTextBySelector(".feed-filter[data-filter='beats']", t("feedFilterBeats", nextLang));
  if (elements.refreshBtn) {
    elements.refreshBtn.textContent = t("feedRefresh", nextLang);
  }
  if (elements.feedSearchBtn) {
    elements.feedSearchBtn.textContent = t("feedSearchBtn", nextLang);
  }
  if (elements.quickOnlyBeatsBtn) {
    elements.quickOnlyBeatsBtn.textContent = t("feedQuickOnlyBeats", nextLang);
  }
  if (elements.quickOnlyAlbumsBtn) {
    elements.quickOnlyAlbumsBtn.textContent = t("feedQuickOnlyAlbums", nextLang);
  }
  if (elements.quickGenreLabel) {
    elements.quickGenreLabel.textContent = t("feedQuickGenreLabel", nextLang);
  }
  if (elements.quickBpmLabel) {
    elements.quickBpmLabel.textContent = t("feedQuickBpmLabel", nextLang);
  }
  if (elements.quickPrivacyLabel) {
    elements.quickPrivacyLabel.textContent = t("feedQuickPrivacyLabel", nextLang);
  }
  if (elements.quickFiltersResetBtn) {
    elements.quickFiltersResetBtn.textContent = t("feedQuickReset", nextLang);
  }
  if (elements.quickBpmSelect) {
    const options = elements.quickBpmSelect.options;
    if (options[0]) options[0].textContent = t("feedQuickAny", nextLang);
    if (options[1]) options[1].textContent = t("feedQuickBpmLt90", nextLang);
    if (options[2]) options[2].textContent = t("feedQuickBpm90_120", nextLang);
    if (options[3]) options[3].textContent = t("feedQuickBpm121_140", nextLang);
    if (options[4]) options[4].textContent = t("feedQuickBpmGt140", nextLang);
  }
  if (elements.quickPrivacySelect) {
    const options = elements.quickPrivacySelect.options;
    if (options[0]) options[0].textContent = t("feedQuickAll", nextLang);
    if (options[1]) options[1].textContent = t("publishModePublic", nextLang);
    if (options[2]) options[2].textContent = t("publishModeDraft", nextLang);
    if (options[3]) options[3].textContent = t("publishModePrivate", nextLang);
    if (options[4]) options[4].textContent = t("publishModeLink", nextLang);
    if (options[5]) options[5].textContent = t("publishModePremiere", nextLang);
  }
  setTextBySelector("#feedLibraryWrap .card:first-child h3:nth-of-type(1)", t("feedLibraryPlaylists", nextLang));
  setTextBySelector("#feedLibraryWrap .card:first-child h3:nth-of-type(2)", t("feedLibraryAlbums", nextLang));
  setTextBySelector("#feedLibraryWrap .card:first-child h3:nth-of-type(3)", t("feedLibraryLikedTracks", nextLang));

  setTextBySelector("#tab-settings .window-settings > h2", t("settingsTitle", nextLang));
  setTextBySelector("#tab-settings .sub-grid .card:nth-child(1) > h3", t("settingsCardAccount", nextLang));
  setTextBySelector("#tab-settings .sub-grid .card:nth-child(2) > h3", t("settingsCardProfileDesign", nextLang));
  setTextBySelector("#tab-settings .sub-grid .card:nth-child(3) > h3", t("settingsCardEqualizer", nextLang));
  setTextBySelector("#tab-settings .sub-grid:nth-of-type(2) .card:nth-child(1) > h3", t("settingsCardSubscriptions", nextLang));
  setTextBySelector("#tab-settings .sub-grid:nth-of-type(2) .card:nth-child(2) > h3", t("settingsCardMessages", nextLang));
  setTextBySelector("#tab-settings .sub-grid:nth-of-type(2) .card:nth-child(3) > h3", t("settingsCardRecent", nextLang));
  setTextBySelector("#registerForm h4", t("authRegisterTitle", nextLang));
  setTextBySelector("#registerForm button", t("authRegisterBtn", nextLang));
  setTextBySelector("#loginForm h4", t("authLoginTitle", nextLang));
  setTextBySelector("#loginForm button", t("authLoginBtn", nextLang));
  setTextBySelector("#authGateTitle", "sfera");
  setTextBySelector("#authGateHint", t("authGateHint", nextLang));
  setTextBySelector("#authGateLanguageLabel", t("authGateLanguageLabel", nextLang));
  setTextBySelector("#authGateRegisterForm h4", t("authRegisterTitle", nextLang));
  setTextBySelector("#authGateRegisterForm button", t("authRegisterBtn", nextLang));
  setTextBySelector("#authGateLoginForm h4", t("authLoginTitle", nextLang));
  setTextBySelector("#authGateLoginForm button", t("authLoginBtn", nextLang));
  setTextBySelector("#authGateGuestBtn", t("authGateGuestBtn", nextLang));
  setTextBySelector("#logoutBtn", t("authLogoutBtn", nextLang));
  setTextBySelector("#authLogged > p.muted", t("authNicknameFixed", nextLang));
  setTextBySelector("#passwordForm h4", t("authPasswordTitle", nextLang));
  setTextBySelector("#passwordForm button", t("authPasswordBtn", nextLang));
  setTextBySelector("#promoCodeForm h4", t("authPromoTitle", nextLang));
  setTextBySelector("#promoCodeForm button", t("authPromoBtn", nextLang));
  setTextBySelector("#bioForm button", t("profileBioSaveBtn", nextLang));
  setTextBySelector("#avatarForm button[type='submit']", t("profileAvatarUpdateBtn", nextLang));
  setTextBySelector("#avatarRemoveBtn", t("profileAvatarRemoveBtn", nextLang));
  setTextBySelector("#headerForm button[type='submit']", t("profileHeaderUpdateBtn", nextLang));
  setTextBySelector("#headerRemoveBtn", t("profileHeaderRemoveBtn", nextLang));
  setTextBySelector("#equalizerPresetApplyBtn", t("eqApplyPresetBtn", nextLang));
  setTextBySelector("#equalizerResetBtn", t("eqResetBtn", nextLang));
  if (elements.usersListSearchInput) {
    elements.usersListSearchInput.placeholder = t("subsSearchPlaceholder", nextLang);
  }
  setLabelTextForControl(elements.chatUserSelect, t("messagesToWhom", nextLang));
  setTextBySelector("#openChatBtn", t("messagesOpenDialog", nextLang));
  setTextBySelector("#messagesAuth p.muted", t("messagesHintTextOnly", nextLang));
  setTextBySelector("#messagesAuth h4", t("messagesRecentDialogs", nextLang));
  setTextBySelector("#sendMessageForm button", t("messagesSendBtn", nextLang));
  if (elements.chatInput) {
    elements.chatInput.placeholder = nextLang === "ru"
      ? "Текст сообщения"
      : nextLang === "uk"
        ? "Текст повідомлення"
        : nextLang === "zh"
          ? "消息内容"
          : "Message text";
  }
  if (elements.contactToggleBtn) {
    elements.contactToggleBtn.textContent = t("contactToggle", nextLang);
  }
  setTextBySelector("#contactToggleBtn", t("contactToggle", nextLang));
  if (elements.contactToggleBtn?.closest(".card")) {
    const titleNode = elements.contactToggleBtn.closest(".card").querySelector("h3");
    if (titleNode) {
      titleNode.textContent = t("contactTitle", nextLang);
    }
  }
  if (document.getElementById("languageCardTitle")) {
    document.getElementById("languageCardTitle").textContent = t("languageCardTitle", nextLang);
  }
  if (document.getElementById("languageCardHint")) {
    document.getElementById("languageCardHint").textContent = t("languageCardHint", nextLang);
  }
  if (document.getElementById("languageSelectLabel")) {
    document.getElementById("languageSelectLabel").textContent = t("languageSelectLabel", nextLang);
  }
  if (elements.saveLanguageBtn) {
    elements.saveLanguageBtn.textContent = t("languageSaveBtn", nextLang);
  }
  if (elements.uiDensityTitle) {
    elements.uiDensityTitle.textContent = t("uiDensityTitle", nextLang);
  }
  if (elements.uiDensityHint) {
    elements.uiDensityHint.textContent = t("uiDensityHint", nextLang);
  }
  if (elements.uiDensityLabel) {
    elements.uiDensityLabel.textContent = t("uiDensityLabel", nextLang);
  }
  if (elements.saveUiDensityBtn) {
    elements.saveUiDensityBtn.textContent = t("uiDensitySaveBtn", nextLang);
  }
  if (elements.uiDensitySelect) {
    const options = elements.uiDensitySelect.options;
    if (options[0]) options[0].textContent = t("uiDensityComfortable", nextLang);
    if (options[1]) options[1].textContent = t("uiDensityCompact", nextLang);
  }
  if (elements.toggleFeedSelectionsBtn) {
    elements.toggleFeedSelectionsBtn.textContent = state.feedSectionsCollapsed.selections
      ? t("feedToggleSelectionsShow", nextLang)
      : t("feedToggleSelectionsHide", nextLang);
  }
  if (elements.toggleFeedLibraryBtn) {
    elements.toggleFeedLibraryBtn.textContent = state.feedSectionsCollapsed.library
      ? t("feedToggleLibraryShow", nextLang)
      : t("feedToggleLibraryHide", nextLang);
  }
  if (elements.togglePinnedReleaseBtn) {
    elements.togglePinnedReleaseBtn.textContent = state.profileSectionsCollapsed.pinnedRelease
      ? t("profileTogglePinnedShow", nextLang)
      : t("profileTogglePinnedHide", nextLang);
  }
  if (elements.toggleAuthorStatsBtn) {
    elements.toggleAuthorStatsBtn.textContent = state.profileSectionsCollapsed.authorStats
      ? t("profileToggleStatsShow", nextLang)
      : t("profileToggleStatsHide", nextLang);
  }
  if (elements.playerExpandBtn) {
    const expanded = Boolean(state.player?.isExpanded);
    elements.playerExpandBtn.textContent = expanded ? "▴" : "▾";
    elements.playerExpandBtn.setAttribute("aria-label", expanded ? t("playerCollapse", nextLang) : t("playerExpand", nextLang));
    elements.playerExpandBtn.title = expanded ? t("playerCollapse", nextLang) : t("playerExpand", nextLang);
  }

  if (elements.feedSearchInput) {
    const quickFilters = state.feedQuickFilters || {};
    elements.feedSearchInput.placeholder = state.feedFilter === "beats" || quickFilters.onlyBeats
      ? t("feedSearchPlaceholderBeats", nextLang)
      : t("feedSearchPlaceholderDefault", nextLang);
  }
  if (elements.profileShareBtn) {
    elements.profileShareBtn.textContent = t("profileShareBtn", nextLang);
  }
  if (elements.profileOpenPublicBtn) {
    elements.profileOpenPublicBtn.textContent = t("profilePublicBtn", nextLang);
  }

  setLabelTextForControl(elements.trackTitle, t("publishFieldTrackTitle", nextLang));
  setLabelTextForControl(elements.trackGenre, t("publishFieldGenre", nextLang));
  setLabelTextForControl(elements.trackPublishMode, t("publishFieldPublishMode", nextLang));
  setLabelTextForControl(elements.trackPremiereAt, t("publishFieldPremiereAt", nextLang));
  setLabelTextForControl(elements.trackAuthors, t("publishFieldAuthors", nextLang));
  setLabelTextForControl(elements.trackProducers, t("publishFieldProducers", nextLang));
  setLabelTextForControl(elements.trackHashtags, t("publishFieldHashtags", nextLang));
  setLabelTextForControl(elements.trackDescription, t("publishFieldTrackDescription", nextLang));
  setLabelTextForControl(elements.trackCover, t("publishFieldTrackCover", nextLang));
  setLabelTextForControl(elements.trackFile, t("publishFieldTrackAudio", nextLang));
  setLabelTextForControl(elements.albumTitle, t("publishFieldAlbumTitle", nextLang));
  setLabelTextForControl(elements.albumGenre, t("publishFieldGenre", nextLang));
  setLabelTextForControl(elements.albumAuthors, t("publishFieldAuthors", nextLang));
  setLabelTextForControl(elements.albumProducers, t("publishFieldProducers", nextLang));
  setLabelTextForControl(elements.albumHashtags, t("publishFieldHashtags", nextLang));
  setLabelTextForControl(elements.albumDescription, t("publishFieldAlbumDescription", nextLang));
  setLabelTextForControl(elements.albumCover, t("publishFieldAlbumCover", nextLang));
  setLabelTextForControl(elements.albumTrackFiles, t("publishFieldAlbumFiles", nextLang));
  setLabelTextForControl(elements.beatTitle, t("publishFieldBeatTitle", nextLang));
  setLabelTextForControl(elements.beatGenre, t("publishFieldBeatGenre", nextLang));
  setLabelTextForControl(elements.beatBpm, t("publishFieldBeatBpm", nextLang));
  setLabelTextForControl(elements.beatRootNote, t("publishFieldBeatRootNote", nextLang));
  setLabelTextForControl(elements.beatHashtags, t("publishFieldHashtags", nextLang));
  setLabelTextForControl(elements.beatDescription, t("publishFieldBeatDescription", nextLang));
  setLabelTextForControl(elements.beatCover, t("publishFieldBeatCover", nextLang));
  setLabelTextForControl(elements.beatFile, t("publishFieldBeatAudio", nextLang));

  if (elements.trackAuthors) elements.trackAuthors.placeholder = t("publishTrackAuthorsPlaceholder", nextLang);
  if (elements.albumAuthors) elements.albumAuthors.placeholder = t("publishAlbumAuthorsPlaceholder", nextLang);
  if (elements.trackProducers) elements.trackProducers.placeholder = t("publishTrackProducersPlaceholder", nextLang);
  if (elements.albumProducers) elements.albumProducers.placeholder = t("publishAlbumProducersPlaceholder", nextLang);
  if (elements.trackHashtags) elements.trackHashtags.placeholder = t("publishTrackHashtagsPlaceholder", nextLang);
  if (elements.albumHashtags) elements.albumHashtags.placeholder = t("publishAlbumHashtagsPlaceholder", nextLang);
  if (elements.beatHashtags) elements.beatHashtags.placeholder = t("publishBeatHashtagsPlaceholder", nextLang);
  if (elements.beatGenre) elements.beatGenre.placeholder = t("publishBeatGenrePlaceholder", nextLang);
  if (elements.beatRootNote) elements.beatRootNote.placeholder = t("publishBeatRootNotePlaceholder", nextLang);

  setTextBySelector("#uploadBtn", t("publishBtnTrack", nextLang));
  setTextBySelector("#albumPublishBtn", t("publishBtnAlbum", nextLang));
  setTextBySelector("#beatPublishBtn", t("publishBtnBeat", nextLang));

  setTextBySelector("#trackCover + small", t("publishTrackCoverHint", nextLang));
  setTextBySelector("#trackFile + small", t("publishTrackAudioHint", nextLang));
  setTextBySelector("#albumCover + small", t("publishAlbumCoverHint", nextLang));
  setTextBySelector("#albumTrackFiles + small", t("publishAlbumFilesHint", nextLang));
  setTextBySelector(".album-track-picker-head > strong", t("albumPickerTitle", nextLang));
  if (elements.albumTracksInfo && !elements.albumTracksInfo.textContent.trim()) {
    elements.albumTracksInfo.textContent = t("albumPickerLoading", nextLang);
  }
  if (elements.albumTracksSearchInput) {
    elements.albumTracksSearchInput.placeholder = t("albumPickerSearchPlaceholder", nextLang);
  }
  if (elements.albumTracksSortSelect) {
    const opts = elements.albumTracksSortSelect.options;
    if (opts[0]) opts[0].textContent = t("albumPickerSortNewest", nextLang);
    if (opts[1]) opts[1].textContent = t("albumPickerSortOldest", nextLang);
    if (opts[2]) opts[2].textContent = t("albumPickerSortTitleAsc", nextLang);
    if (opts[3]) opts[3].textContent = t("albumPickerSortTitleDesc", nextLang);
  }
  setTextBySelector("#albumTracksFilterAllBtn", t("albumPickerFilterAll", nextLang));
  setTextBySelector("#albumTracksFilterSelectedBtn", t("albumPickerFilterSelected", nextLang));
  setTextBySelector(".beat-license-head > strong", t("beatLicensesTitle", nextLang));
  setLabelTextForControl(elements.beatLicenseCurrency, t("beatLicenseCurrency", nextLang));
  if (elements.beatLicenseMp3Price) elements.beatLicenseMp3Price.placeholder = t("beatPricePlaceholder", nextLang);
  if (elements.beatLicenseWavPrice) elements.beatLicenseWavPrice.placeholder = t("beatPricePlaceholder", nextLang);
  if (elements.beatLicenseTrackoutPrice) elements.beatLicenseTrackoutPrice.placeholder = t("beatPricePlaceholder", nextLang);
  if (elements.beatLicenseExclusivePrice) elements.beatLicenseExclusivePrice.placeholder = t("beatPricePlaceholder", nextLang);

  if (elements.trackPublishMode) {
    const modeOptions = elements.trackPublishMode.options;
    if (modeOptions[0]) modeOptions[0].textContent = t("publishModePublic", nextLang);
    if (modeOptions[1]) modeOptions[1].textContent = t("publishModeDraft", nextLang);
    if (modeOptions[2]) modeOptions[2].textContent = t("publishModePrivate", nextLang);
    if (modeOptions[3]) modeOptions[3].textContent = t("publishModeLink", nextLang);
    if (modeOptions[4]) modeOptions[4].textContent = t("publishModePremiere", nextLang);
  }
  const volumeLabel = document.querySelector(".player-volume > span");
  if (volumeLabel) {
    volumeLabel.textContent = t("playerVolumeLabel", nextLang);
  }
  if (!getCurrentTrackId()) {
    if (elements.playerTrackTitle) {
      elements.playerTrackTitle.textContent = t("playerNoTrack", nextLang);
    }
    if (elements.playerTrackAuthors) {
      elements.playerTrackAuthors.textContent = t("playerAuthorsFallback", nextLang);
    }
    if (elements.playerTrackMeta) {
      elements.playerTrackMeta.textContent = t("playerHint", nextLang);
    }
  }
  if (elements.feedMainListTitle) {
    const quickFilters = state.feedQuickFilters || {};
    if (quickFilters.onlyAlbums) {
      elements.feedMainListTitle.textContent = t("feedMainTitleAlbums", nextLang);
    } else if (state.feedFilter === "beats" || quickFilters.onlyBeats) {
      elements.feedMainListTitle.textContent = t("feedMainTitleBeats", nextLang);
    } else {
      elements.feedMainListTitle.textContent = t("feedMainTitleTracks", nextLang);
    }
  }
  if (elements.selectionPopularTitle) {
    const quickFilters = state.feedQuickFilters || {};
    elements.selectionPopularTitle.textContent = state.feedFilter === "beats" || quickFilters.onlyBeats
      ? t("feedSelectionPopularBeats", nextLang)
      : t("feedSelectionPopularSongs", nextLang);
  }
  if (elements.selectionFreshTitle) {
    const quickFilters = state.feedQuickFilters || {};
    elements.selectionFreshTitle.textContent = state.feedFilter === "beats" || quickFilters.onlyBeats
      ? t("feedSelectionFreshBeats", nextLang)
      : t("feedSelectionFreshSongs", nextLang);
  }
  if (elements.selectionChartsTitle) {
    const quickFilters = state.feedQuickFilters || {};
    elements.selectionChartsTitle.textContent = state.feedFilter === "beats" || quickFilters.onlyBeats
      ? t("feedSelectionChartsBeats", nextLang)
      : t("feedSelectionChartsSongs", nextLang);
  }

  updateTrackPlayButtons();
  const currentTrackId = getCurrentTrackId();
  if (currentTrackId) {
    const activeTrack = getTrackById(currentTrackId);
    if (activeTrack) {
      showGlobalPlayer(activeTrack);
    }
  }
  try {
    renderFeed();
    renderProfile();
    renderAuthorAnalytics();
    renderAlbumTrackOptions();
    updateAlbumTrackFilesSummary();
    renderSettings();
  } catch {
    // ignore early-render errors during bootstrap
  }
}

function renderOnlineCounter() {
  if (!elements.onlineCounter) {
    return;
  }

  elements.onlineCounter.textContent = `${t("onlinePrefix")}: ${state.onlineUsers}`;
}

function getUiDateLocale() {
  const lang = normalizeUiLanguage(state.uiLanguage, DEFAULT_UI_LANGUAGE);
  if (lang === "ru") return "ru-RU";
  if (lang === "uk") return "uk-UA";
  if (lang === "zh") return "zh-CN";
  return "en-US";
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("unknownDate");
  }

  return date.toLocaleString(getUiDateLocale(), {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDuration(totalSeconds) {
  const numeric = Number(totalSeconds);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "0:00";
  }

  const seconds = Math.floor(numeric);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function buildTrackHref(trackId) {
  if (trackId && typeof trackId === "object") {
    const track = trackId;
    if (typeof track.sharePath === "string" && track.sharePath) {
      return track.sharePath;
    }
    const prefix = String(track.kind || "").toLowerCase() === "beat" ? "/b/" : "/t/";
    return `${prefix}${encodeURIComponent(String(track.id || ""))}`;
  }
  return `/t/${encodeURIComponent(String(trackId || ""))}`;
}

function buildUserHref(username) {
  return `/u/${encodeURIComponent(String(username || ""))}`;
}

function buildAlbumHref(albumId) {
  if (albumId && typeof albumId === "object") {
    const album = albumId;
    if (typeof album.sharePath === "string" && album.sharePath) {
      return album.sharePath;
    }
    return `/a/${encodeURIComponent(String(album.id || ""))}`;
  }
  return `/a/${encodeURIComponent(String(albumId || ""))}`;
}

function createTrackLink(track, { source = "feed", className = "track-title-link", text } = {}) {
  const link = document.createElement("a");
  link.className = className;
  link.href = (track && typeof track.sharePath === "string" && track.sharePath) ? track.sharePath : buildTrackHref(track);
  link.textContent = text ?? String(track.title || "");
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    goToTrackFromSearch(track.id, { autoplay: false, source });
  });
  return link;
}

function createUserLinkNode(username, className = "user-link") {
  const link = document.createElement("a");
  link.className = className;
  link.href = buildUserHref(username);
  link.textContent = `@${username}`;
  return link;
}

function toLocalDateTimeInputValue(iso) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseLocalDateTimeToIso(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Некорректная дата премьеры");
  }

  return parsed.toISOString();
}

function getTrackVisibilityLabel(track) {
  if (!track || !track.publishMode) {
    return "";
  }

  if (track.publishMode === "draft") {
    return "Черновик";
  }

  if (track.publishMode === "private") {
    return "Приватный";
  }

  if (track.publishMode === "link") {
    return "По ссылке";
  }

  if (track.publishMode === "premiere") {
    if (track.isPremiereLive) {
      return "Премьера вышла";
    }
    return track.premiereAt ? `Премьера: ${formatDate(track.premiereAt)}` : "Премьера";
  }

  return "";
}

function isNotFoundError(...args) {
  return window.SferaApiClient.isNotFoundError(...args);
}

function api(...args) {
  const path = String(args[0] || "");
  const options = args[1] && typeof args[1] === "object" ? args[1] : {};
  const method = String(options.method || "GET").trim().toUpperCase();

  if (state.isGuest && !state.user && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const allowedGuestWriteEndpoints = new Set([
      "/api/login",
      "/api/register",
      "/api/password-reset/request",
      "/api/password-reset/confirm",
      "/api/email/verify"
    ]);
    const isListenReportEndpoint = /^\/api\/tracks\/[^/]+\/listen$/i.test(path);
    if (!allowedGuestWriteEndpoints.has(path) && !isListenReportEndpoint) {
      throw new Error(t("guestModeNotice"));
    }
  }

  return window.SferaApiClient.api(...args);
}

const __sferaRealtimeCore = window.SferaRealtimeCore.createAppRealtimeCore({
  state,
  realtime,
  deps: {
    renderOnlineCounter,
    refreshThreads,
    loadConversation,
    renderMessages,
    setStatus,
    refreshMe,
    refreshUsers,
    refreshFollows,
    refreshNotifications,
    renderProfile,
    renderSettings,
    renderNotifications
  }
});
function clearRealtimeReconnectTimer(...args) {
  return __sferaRealtimeCore.clearRealtimeReconnectTimer(...args);
}

function getWebSocketUrl(...args) {
  return __sferaRealtimeCore.getWebSocketUrl(...args);
}

function disconnectRealtimeSocket(...args) {
  return __sferaRealtimeCore.disconnectRealtimeSocket(...args);
}

function scheduleRealtimeReconnect(...args) {
  return __sferaRealtimeCore.scheduleRealtimeReconnect(...args);
}

function handleRealtimeEvent(...args) {
  return __sferaRealtimeCore.handleRealtimeEvent(...args);
}

function connectRealtimeSocket(...args) {
  return __sferaRealtimeCore.connectRealtimeSocket(...args);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function switchTab(tabName) {
  if (state.isGuest && !state.user && tabName !== "feed") {
    setStatus(t("guestModeNotice"), "error");
    setGuestMode(false);
    renderAuthGate();
    return;
  }

  state.activeTab = tabName;

  for (const button of elements.tabButtons) {
    button.classList.toggle("active", button.dataset.tab === tabName);
  }

  for (const [name, panel] of Object.entries(elements.tabPanels)) {
    panel.classList.toggle("active", name === tabName);
  }
}

function getDefaultAvatar() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%2311111b'/%3E%3Ctext x='50%25' y='54%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' font-size='54' font-family='sans-serif'%3E%F0%9F%8E%B5%3C/text%3E%3C/svg%3E";

}

function getTrackAuthorsLabel(track) {
  const authors = Array.isArray(track?.authors) ? track.authors.filter(Boolean) : [];
  if (authors.length > 0) {
    return authors.join(", ");
  }
  if (track?.username) {
    return `@${track.username}`;
  }
  return "-";
}
