    const data = await api("/api/follows");
    state.follows = {
      following: Array.isArray(data.following) ? data.following : [],
      followers: Array.isArray(data.followers) ? data.followers : []
    };
  } catch (error) {
    if (isNotFoundError(error)) {
      state.follows = { following: [], followers: [] };
      return;
    }
    throw error;
  }
}

async function refreshThreads() {
  if (!state.user) {
    state.threads = [];
    return;
  }

  try {
    const data = await api("/api/messages/inbox");
    state.threads = Array.isArray(data.threads) ? data.threads : [];
  } catch (error) {
    if (isNotFoundError(error)) {
      state.threads = [];
      return;
    }
    throw error;
  }
}

async function markAllNotificationsRead({ silent = false } = {}) {
  if (!state.user) {
    state.notifications = [];
    renderNotifications();
    return;
  }

  try {
    const result = await api("/api/notifications/read-all", { method: "POST" });
    if (Array.isArray(state.notifications) && state.notifications.length > 0) {
      const nowIso = new Date().toISOString();
      state.notifications = state.notifications.map((item) => (
        item && !item.isRead ? { ...item, isRead: true, readAt: item.readAt || nowIso } : item
      ));
    }
    renderNotifications();
    if (!silent && (Number(result?.updatedCount) || 0) > 0) {
      setStatus(getNotificationUiText("nowRead"), "success");
    }
  } catch (error) {
    if (!silent) {
      setStatus(error.message, "error");
    }
  }
}

async function loadConversation(userId) {
  if (!state.user || !userId) {
    return;
  }

  try {

    const data = await api(`/api/messages/${userId}`);
    state.currentChatUserId = userId;
    state.currentChatUser = data.withUser || null;
    state.chatMessages = Array.isArray(data.messages) ? data.messages : [];
    renderMessages();
  } catch (error) {
    if (isNotFoundError(error)) {
      state.currentChatUserId = userId;
      state.currentChatUser = null;
      state.chatMessages = [];
      renderMessages();
      return;
    }
    throw error;
  }
}

async function fullRefresh() {
  await refreshMe();

  if (state.user) {
    connectRealtimeSocket();
  } else {
    disconnectRealtimeSocket(true);
  }

  await Promise.all([
    refreshTracks(),
    refreshAlbums(),
    refreshPlaylists(),
    refreshUsers()
  ]);

  if (state.user) {
    await Promise.all([
      refreshFollows(),
      refreshThreads(),
      refreshNotifications(),
      refreshAuthorAnalytics(),
      refreshListenHistory()
    ]);

    if (state.currentChatUserId) {
      const exists = state.users.some((user) => user.id === state.currentChatUserId);
      if (exists) {
        await loadConversation(state.currentChatUserId);
      } else {
        state.currentChatUserId = null;
        state.currentChatUser = null;
        state.chatMessages = [];
      }
    }
  } else {
    state.currentChatUserId = null;
    state.currentChatUser = null;
    state.chatMessages = [];
    state.follows = { following: [], followers: [] };

    state.threads = [];
    state.notifications = [];
    state.notificationsModalOpen = false;
    state.authorAnalytics = null;
    state.listenHistory = [];
  }
}

async function toggleFollow(targetUserId) {
  if (!ensureAuthenticatedAction()) {
    return;
  }

  try {
    setStatus("Обновляю подписку...");
    const result = await api("/api/follows/toggle", {
      method: "POST",
      body: { targetUserId }
    });
    await fullRefresh();
    renderAll();
    setStatus(result.following ? "Подписка оформлена" : "Подписка отменена", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function handleAuthSubmit(form, endpoint) {
  const formData = new FormData(form);
  const preferredLanguage = normalizeUiLanguage(
    elements.authGateLanguageSelect?.value || resolvePreferredUiLanguage(),
    DEFAULT_UI_LANGUAGE
  );
  applyUiLanguage(preferredLanguage);

  const payload = {
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || ""),
    language: preferredLanguage
  };
  const email = String(formData.get("email") || "").trim();
  if (email) {
    payload.email = email;
  }

  await api(endpoint, {
    method: "POST",
    body: payload
  });

  setGuestMode(false);
  form.reset();
  await fullRefresh();
  renderAll();
}

async function requestPasswordResetFromForm(form) {
  const formData = new FormData(form);
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    throw new Error("Введите email");
  }
  await api("/api/password-reset/request", {
    method: "POST",
    body: { email }
  });
}

let passwordToggleUid = 0;

function getPasswordToggleLabel(isVisible) {
  return isVisible ? t("passwordHide") : t("passwordShow");
}

function syncPasswordToggleButton(input, button) {
  if (!input || !button) {
    return;
  }

  const isVisible = input.type === "text";
  const label = getPasswordToggleLabel(isVisible);
  button.dataset.visible = isVisible ? "1" : "0";
  button.setAttribute("aria-pressed", isVisible ? "true" : "false");
  button.setAttribute("aria-label", `${label} пароль`);
  button.title = `${label} пароль`;

  if (window.SferaIconKit?.setButtonIcon) {
    window.SferaIconKit.setButtonIcon(button, isVisible ? "eye-off" : "eye", {
      label,
      labelClassName: "password-toggle-btn-label",
      iconClassName: "sf-icon--sm"
    });
  } else {
    button.textContent = label;
  }
}

function resetPasswordVisibility(root = document) {
  const inputs = Array.from(root.querySelectorAll("input[data-password-toggle-ready='1']"));
  for (const input of inputs) {
    if (input.type !== "password") {
      input.type = "password";
    }
    const button = input.parentElement?.querySelector?.("button[data-password-toggle-btn='1']");
    syncPasswordToggleButton(input, button);
  }
}

function refreshPasswordVisibilityToggles(root = document) {
  const inputs = Array.from(root.querySelectorAll("input[data-password-toggle-ready='1']"));
  for (const input of inputs) {
    const button = input.parentElement?.querySelector?.("button[data-password-toggle-btn='1']");
    syncPasswordToggleButton(input, button);
  }
}

function setupPasswordVisibilityToggles(root = document) {
  const passwordInputs = Array.from(root.querySelectorAll("input[type='password'], input[data-password-toggle-ready='1']"));

  for (const input of passwordInputs) {
    if (!(input instanceof HTMLInputElement)) {
      continue;
    }

    if (input.dataset.passwordToggleReady === "1") {
      const existingButton = input.parentElement?.querySelector?.("button[data-password-toggle-btn='1']");
      syncPasswordToggleButton(input, existingButton);
      continue;
    }

    input.dataset.passwordToggleReady = "1";
    if (!input.id) {
      passwordToggleUid += 1;
      input.id = `password-toggle-input-${passwordToggleUid}`;
    }

    let wrap = input.parentElement;
    if (!wrap || !wrap.classList.contains("password-field-wrap")) {
      wrap = document.createElement("div");
      wrap.className = "password-field-wrap";
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "password-toggle-btn";
    button.dataset.passwordToggleBtn = "1";
    button.setAttribute("aria-controls", input.id);
    button.addEventListener("click", () => {
      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      syncPasswordToggleButton(input, button);
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      const length = String(input.value || "").length;
      if (typeof input.setSelectionRange === "function") {
        input.setSelectionRange(length, length);
      }
    });
    wrap.appendChild(button);
    syncPasswordToggleButton(input, button);

    if (input.form && input.form.dataset.passwordToggleResetBound !== "1") {
      input.form.dataset.passwordToggleResetBound = "1";
      input.form.addEventListener("reset", () => {
        const scheduler = typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame.bind(window)
          : (cb) => window.setTimeout(cb, 0);
        scheduler(() => {
          resetPasswordVisibility(input.form);
        });
      });
    }
  }
}

window.SferaPasswordToggles = {
  setup: setupPasswordVisibilityToggles,
  refresh: refreshPasswordVisibilityToggles,
  reset: resetPasswordVisibility
};

function removeQueryParam(paramName) {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(paramName)) {
    return;
  }
  url.searchParams.delete(paramName);
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, "", next || "/");
}

async function processEmailActionTokensFromUrl() {
  const url = new URL(window.location.href);
  const verifyToken = String(url.searchParams.get("verifyEmailToken") || "").trim();
  const resetToken = String(url.searchParams.get("resetPasswordToken") || "").trim();

  if (verifyToken) {
    try {
      setStatus("Подтверждаю email...");
      await api("/api/email/verify", {
        method: "POST",
        body: { token: verifyToken }
      });
      await fullRefresh();
      renderAll();
      setStatus("Email подтвержден", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      removeQueryParam("verifyEmailToken");
    }
  }

  if (resetToken) {
    try {
      const newPassword = await window.SferaDialogs.prompt({
        title: "Сброс пароля",
        message: "Введите новый пароль длиной минимум 6 символов.",
        value: "",
        placeholder: "Новый пароль",
        inputType: "password",
        confirmText: "Сменить пароль"
      });
      if (newPassword === null) {
        setStatus("Сброс пароля отменен", "error");
      } else {
        setStatus("Сбрасываю пароль...");
        await api("/api/password-reset/confirm", {
          method: "POST",
          body: {
            token: resetToken,
            newPassword: String(newPassword || "")
          }
        });
        setStatus("Пароль обновлен. Теперь войди с новым паролем", "success");
      }
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      removeQueryParam("resetPasswordToken");
    }
  }
}

function setAuthGateStatus(text, type = "info") {
  if (!elements.authGateStatus) {
    return;
  }

  setAuthGateStatus.seq = (setAuthGateStatus.seq || 0) + 1;
  const seq = setAuthGateStatus.seq;
  if (setAuthGateStatus.fadeTimer) {
    clearTimeout(setAuthGateStatus.fadeTimer);
    setAuthGateStatus.fadeTimer = null;
  }
  if (setAuthGateStatus.clearTimer) {
    clearTimeout(setAuthGateStatus.clearTimer);
    setAuthGateStatus.clearTimer = null;
  }

  elements.authGateStatus.textContent = text || "";
  elements.authGateStatus.classList.remove("error", "success", "is-fading");
  if (type === "error") {
    elements.authGateStatus.classList.add("error");
  }
  if (type === "success") {
    elements.authGateStatus.classList.add("success");
  }

  if (!text) {
    elements.authGateStatus.classList.remove("is-visible");
    return;
  }

  elements.authGateStatus.classList.add("is-visible");
  setAuthGateStatus.fadeTimer = setTimeout(() => {
    if (seq !== setAuthGateStatus.seq) return;
    elements.authGateStatus.classList.add("is-fading");
  }, 5000);
  setAuthGateStatus.clearTimer = setTimeout(() => {
    if (seq !== setAuthGateStatus.seq) return;
    elements.authGateStatus.textContent = "";
    elements.authGateStatus.classList.remove("error", "success", "is-visible", "is-fading");
  }, 5600);
}

function renderAuthGate() {
  if (!elements.authGateModal) {
    return;
  }

  const shouldShow = !state.user && !state.isGuest;
  const wasHidden = elements.authGateModal.classList.contains("hidden");

  elements.authGateModal.classList.toggle("hidden", !shouldShow);
  elements.authGateModal.setAttribute("aria-hidden", shouldShow ? "false" : "true");
  document.body.classList.toggle("auth-gate-active", shouldShow);

  if (!shouldShow) {
    setAuthGateStatus("");
    return;
  }

  if (wasHidden) {
    if (elements.authGateRegisterForm) {
      elements.authGateRegisterForm.reset();
    }
    if (elements.authGateLoginForm) {
      elements.authGateLoginForm.reset();
    }
    if (elements.authGateLanguageSelect) {
      elements.authGateLanguageSelect.value = normalizeUiLanguage(state.uiLanguage, DEFAULT_UI_LANGUAGE);
    }
    setAuthGatePanel("login");
    setAuthGateStatus("");
    focusActiveAuthGatePanel();
  }
}

let authGateActivePanel = "login";

function getAuthGatePanelButtons() {
  return Array.from(document.querySelectorAll("[data-auth-gate-tab]"));
}

function getAuthGatePanels() {
  return Array.from(document.querySelectorAll(".auth-gate-form-panel[data-auth-gate-panel]"));
}

function focusActiveAuthGatePanel() {
  const activePanel = document.querySelector(`.auth-gate-form-panel[data-auth-gate-panel='${authGateActivePanel}']`);
  const firstInput = activePanel?.querySelector("input, textarea, select, button");
  firstInput?.focus();
}

function setAuthGatePanel(nextPanel = "login") {
  const allowed = new Set(["login", "register", "reset"]);
  authGateActivePanel = allowed.has(nextPanel) ? nextPanel : "login";

  for (const button of getAuthGatePanelButtons()) {
    const isActive = String(button.dataset.authGateTab || "") === authGateActivePanel;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  for (const panel of getAuthGatePanels()) {
    const isActive = String(panel.dataset.authGatePanel || "") === authGateActivePanel;
    panel.classList.toggle("is-active", isActive);
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
  }
}

function ensureAuthenticatedAction() {
  if (state.user) {
    return true;
  }

  if (state.isGuest) {
    const message = t("guestModeNotice");
    setStatus(message, "error");
    setAuthGateStatus(message, "error");
    setGuestMode(false);
    renderAuthGate();
    return false;
  }

  setStatus(t("authGateHint"), "error");
  renderAuthGate();
  return false;
}

// moved to SferaSettingsUi module: saveLanguagePreference

elements.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setStatus("Регистрация...");
    await handleAuthSubmit(elements.registerForm, "/api/register");
    setStatus("Аккаунт создан", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setStatus("Вход...");
    await handleAuthSubmit(elements.loginForm, "/api/login");
    setStatus("Вы вошли в аккаунт", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

if (elements.authGateRegisterForm) {
  elements.authGateRegisterForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      setStatus("Регистрация...");
      setAuthGateStatus("Регистрация...");
      await handleAuthSubmit(elements.authGateRegisterForm, "/api/register");
      setStatus("Аккаунт создан", "success");
      setAuthGateStatus("Аккаунт создан", "success");
    } catch (error) {
      setStatus(error.message, "error");
      setAuthGateStatus(error.message, "error");
    }
  });
}

if (elements.authGateLoginForm) {
  elements.authGateLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      setStatus("Вход...");
      setAuthGateStatus("Вход...");
      await handleAuthSubmit(elements.authGateLoginForm, "/api/login");
      setStatus("Вы вошли в аккаунт", "success");
      setAuthGateStatus("Вы вошли в аккаунт", "success");
    } catch (error) {
      setStatus(error.message, "error");
      setAuthGateStatus(error.message, "error");
    }
  });
}

if (elements.passwordResetRequestForm) {
  elements.passwordResetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setStatus("Отправляю ссылку для сброса...");
      await requestPasswordResetFromForm(elements.passwordResetRequestForm);
      elements.passwordResetRequestForm.reset();
      setStatus("Если такой email существует, письмо со ссылкой отправлено", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

if (elements.authGatePasswordResetRequestForm) {
  elements.authGatePasswordResetRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setStatus("Отправляю ссылку для сброса...");
      setAuthGateStatus("Отправляю ссылку для сброса...");
      await requestPasswordResetFromForm(elements.authGatePasswordResetRequestForm);
      elements.authGatePasswordResetRequestForm.reset();
      setStatus("Если такой email существует, письмо со ссылкой отправлено", "success");
      setAuthGateStatus("Если такой email существует, письмо со ссылкой отправлено", "success");
    } catch (error) {
      setStatus(error.message, "error");
      setAuthGateStatus(error.message, "error");
    }
  });
}

for (const button of getAuthGatePanelButtons()) {
  button.addEventListener("click", () => {
    setAuthGatePanel(String(button.dataset.authGateTab || "login"));
    focusActiveAuthGatePanel();
  });
}

setAuthGatePanel(authGateActivePanel);

elements.logoutBtn.addEventListener("click", async () => {
  try {
    setStatus("Выход...");
    await api("/api/logout", { method: "POST" });
    await fullRefresh();
    renderAll();
    setStatus("Вы вышли из аккаунта", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

if (elements.emailProfileForm) {
  elements.emailProfileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureAuthenticatedAction()) {
      return;
    }
    try {
      setStatus("Сохраняю email...");
      const email = String(elements.emailProfileInput?.value || "").trim();
      const result = await api("/api/profile/email", {
        method: "PUT",
        body: { email }
      });
      if (result?.user) {
        state.user = result.user;
      }
      await refreshMe();
      renderAll();
      setStatus("Email сохранен. Отправили письмо для подтверждения", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

if (elements.sendVerificationEmailBtn) {
  elements.sendVerificationEmailBtn.addEventListener("click", async () => {
    if (!ensureAuthenticatedAction()) {
      return;
    }
    try {
      setStatus("Отправляю письмо подтверждения...");
      await api("/api/email/verification/request", {
        method: "POST"
      });
      setStatus("Письмо подтверждения отправлено", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

elements.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureAuthenticatedAction()) {
    return;
  }

  try {
    setStatus("Обновляю пароль...");
    await api("/api/profile/password", {
      method: "PUT",
      body: {
        currentPassword: String(elements.currentPasswordInput.value || ""),
        newPassword: String(elements.newPasswordInput.value || "")
      }
    });
    elements.passwordForm.reset();
    await refreshMe();
    renderAll();
    setStatus("Пароль обновлен", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

elements.promoCodeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureAuthenticatedAction()) {
    return;
  }

  try {
    const code = String(elements.promoCodeInput.value || "").trim();
    if (!code) {
      throw new Error("Введите промокод");
    }

    setStatus("Активирую промокод...");
    const result = await api("/api/promocodes/activate", {
      method: "POST",
      body: { code }
    });
    elements.promoCodeForm.reset();
    await refreshMe();
    renderAll();
    const activatedCode = result.promoCode?.code ? ` (${result.promoCode.code})` : "";
    setStatus(`Промокод активирован${activatedCode}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

bindPublishUiHandlers();

elements.createPlaylistForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureAuthenticatedAction()) {
    return;
  }

  try {
    const title = elements.playlistTitle.value.trim();
    const description = elements.playlistDescription.value.trim();

    setStatus("Создаю плейлист...");
    await api("/api/playlists", {
      method: "POST",
      body: {
        title,
        description
      }
    });

    elements.createPlaylistForm.reset();
    await refreshPlaylists();
    renderAll();
    setStatus("Плейлист создан", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

elements.openChatBtn.addEventListener("click", async () => {
  if (!ensureAuthenticatedAction()) {
    return;
  }

  const targetUserId = elements.chatUserSelect.value;
  if (!targetUserId) {
    setStatus("Выбери пользователя", "error");
    return;
  }

  try {
    setStatus("Открываю диалог...");
    if (window.SferaMessagesModal && typeof window.SferaMessagesModal.openForUserId === "function") {
      await window.SferaMessagesModal.openForUserId(targetUserId);
    } else {
      await loadConversation(targetUserId);
    }
    setStatus("Диалог открыт", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

elements.sendMessageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!ensureAuthenticatedAction()) {
    return;
  }

  const targetUserId = state.currentChatUserId || elements.chatUserSelect.value;
  const text = elements.chatInput.value.trim();

  if (!targetUserId) {
    setStatus("Сначала выбери диалог", "error");
    return;
  }

  if (!text) {
    return;
  }

  try {
    setStatus("Отправляю сообщение...");
    await api(`/api/messages/${targetUserId}`, {
      method: "POST",
      body: { text }
    });

    elements.chatInput.value = "";
    await Promise.all([
      loadConversation(targetUserId),
      refreshThreads()
    ]);
    renderMessages();
    setStatus("Сообщение отправлено", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

for (const button of elements.tabButtons) {
  button.addEventListener("click", () => {
    if (!button.dataset.tab) {
      return;
    }
    switchTab(button.dataset.tab);
  });
}

if (elements.brandFeedLink) {
  elements.brandFeedLink.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab("feed");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

for (const button of elements.profileTabButtons) {
  button.addEventListener("click", () => {
    setProfileSection(button.dataset.profileSection);
  });
}

if (elements.usersListSearchInput) {
  elements.usersListSearchInput.addEventListener("input", () => {
    state.usersDirectorySearchQuery = String(elements.usersListSearchInput.value || "");
    renderFriends();
  });
}

if (elements.contactToggleBtn && elements.contactPanel) {
  const syncContactToggleText = () => {
    const lang = state.user?.uiLanguage || state.uiLanguage || "ru";
    const isHidden = elements.contactPanel.classList.contains("hidden");
    elements.contactToggleBtn.textContent = t(isHidden ? "contactOpen" : "contactHide", lang);
  };

  syncContactToggleText();
  elements.contactToggleBtn.addEventListener("click", () => {
    elements.contactPanel.classList.toggle("hidden");
    syncContactToggleText();
  });
}

if (elements.contactTelegramBtn) {
  elements.contactTelegramBtn.addEventListener("click", () => {
    const url = String(elements.contactTelegramBtn.dataset.url || "https://t.me/sferaoff");
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

if (elements.notificationsBtn) {
  elements.notificationsBtn.addEventListener("click", async () => {
    if (!ensureAuthenticatedAction()) {
      return;
    }
    state.notificationsModalOpen = !state.notificationsModalOpen;
    renderNotifications();
    if (state.notificationsModalOpen) {
      await markAllNotificationsRead({ silent: true });
    } else {
      document.body.classList.remove("modal-open");
    }
    if (state.notificationsModalOpen) {
      document.body.classList.add("modal-open");
    }
  });
}

if (elements.notificationsModalCloseBtn) {
  elements.notificationsModalCloseBtn.addEventListener("click", () => {
    state.notificationsModalOpen = false;
    document.body.classList.remove("modal-open");
    renderNotifications();
  });
}

if (elements.notificationsModal) {
  elements.notificationsModal.addEventListener("click", (event) => {
    if (event.target === elements.notificationsModal || event.target?.dataset?.modalBackdrop === "1") {
      state.notificationsModalOpen = false;
      document.body.classList.remove("modal-open");
      renderNotifications();
    }
  });
}

if (elements.notificationsReadAllBtn) {
  elements.notificationsReadAllBtn.addEventListener("click", async () => {
    await markAllNotificationsRead();
  });
}

for (const button of (elements.notificationsFilterButtons || [])) {
  button.addEventListener("click", () => {
    const nextFilter = String(button.dataset.notificationsFilter || "all");
    if (state.notificationsFilter === nextFilter) {
      return;
    }
    state.notificationsFilter = nextFilter;
    renderNotifications();
  });
}

if (elements.siteLanguageSelect) {
  elements.siteLanguageSelect.addEventListener("change", () => {
    const selected = normalizeUiLanguage(elements.siteLanguageSelect.value, DEFAULT_UI_LANGUAGE);
    applyUiLanguage(selected);
  });
}

if (elements.authGateLanguageSelect) {
  elements.authGateLanguageSelect.addEventListener("change", () => {
    const selected = normalizeUiLanguage(elements.authGateLanguageSelect.value, DEFAULT_UI_LANGUAGE);
    applyUiLanguage(selected);
  });
}

if (elements.authGateGuestBtn) {
  elements.authGateGuestBtn.addEventListener("click", () => {
    const selected = normalizeUiLanguage(elements.authGateLanguageSelect?.value, DEFAULT_UI_LANGUAGE);
    applyUiLanguage(selected);
    setGuestMode(true);
    state.activeTab = "feed";
    switchTab("feed");
    renderAll();
    const message = t("guestModeActivated");
    setStatus(message, "success");
    setAuthGateStatus(message, "success");
  });
}

if (elements.saveLanguageBtn) {
  elements.saveLanguageBtn.addEventListener("click", async () => {
    try {
      setStatus("Saving language...");
      await saveLanguagePreference();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

if (elements.uiDensitySelect) {
  elements.uiDensitySelect.addEventListener("change", () => {
    applyUiDensity(normalizeUiDensity(elements.uiDensitySelect.value));
  });
}

if (elements.saveUiDensityBtn) {
  elements.saveUiDensityBtn.addEventListener("click", () => {
    try {
      saveUiDensityPreference();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });
}

for (const button of elements.feedFilters) {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    if (!state.user && filter === "mine") {
      ensureAuthenticatedAction();
      return;
    }

    state.feedFilter = filter;
    if (filter === "beats") {
      const quick = ensureFeedQuickFiltersRuntime();
      quick.genre = "";
      quick.bpm = "all";
      if (elements.quickGenreSelect) {
        elements.quickGenreSelect.value = "";
      }
      if (elements.quickBpmSelect) {
        elements.quickBpmSelect.value = "all";
      }
    }
    renderFeed();
  });
}

function getDefaultFeedQuickFilters() {
  return {
    genre: "",
    bpm: "all"
  };
}

function ensureFeedQuickFiltersRuntime() {
  if (!state.feedQuickFilters || typeof state.feedQuickFilters !== "object") {
    state.feedQuickFilters = getDefaultFeedQuickFilters();
  }
  state.feedQuickFilters.genre = String(state.feedQuickFilters.genre || "").trim();
  state.feedQuickFilters.bpm = String(state.feedQuickFilters.bpm || "all").trim().toLowerCase();
  return state.feedQuickFilters;
}

function resetFeedQuickFiltersRuntime() {
  state.feedQuickFilters = getDefaultFeedQuickFilters();
}

if (elements.quickGenreSelect) {
  elements.quickGenreSelect.addEventListener("change", () => {
    const quick = ensureFeedQuickFiltersRuntime();
    quick.genre = String(elements.quickGenreSelect.value || "").trim();
    renderFeed();
  });
}

if (elements.quickBpmSelect) {
  elements.quickBpmSelect.addEventListener("change", () => {
    const quick = ensureFeedQuickFiltersRuntime();
    quick.bpm = String(elements.quickBpmSelect.value || "all").trim().toLowerCase();
    renderFeed();
  });
}

if (elements.quickFiltersResetBtn) {
  elements.quickFiltersResetBtn.addEventListener("click", () => {
    resetFeedQuickFiltersRuntime();
    renderFeed();
  });
}

if (elements.feedSearchInput) {
  elements.feedSearchInput.addEventListener("input", () => {
    state.feedSearchQuery = String(elements.feedSearchInput.value || "");
    renderFeedSearchResults(state.feedSearchQuery);
  });

  elements.feedSearchInput.addEventListener("focus", () => {
    const query = String(elements.feedSearchInput.value || "");
    if (!query.trim()) {
      return;
    }
    state.feedSearchQuery = query;
    renderFeedSearchResults(state.feedSearchQuery, { keepActiveIndex: true });
  });

  elements.feedSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (elements.feedSearchResults?.classList.contains("hidden")) {
        renderFeedSearchResults(state.feedSearchQuery, { keepActiveIndex: true });
      }
      moveFeedSearchActiveIndex(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (elements.feedSearchResults?.classList.contains("hidden")) {
        renderFeedSearchResults(state.feedSearchQuery, { keepActiveIndex: true });
      }
      moveFeedSearchActiveIndex(-1);
      return;
    }
    if (event.key === "Enter") {
      if (!String(elements.feedSearchInput.value || "").trim()) {
        return;
      }
      event.preventDefault();
      const opened = openActiveFeedSearchResult();
      if (opened && elements.feedSearchResults) {
        elements.feedSearchResults.classList.add("hidden");
      }
      return;
    }
    if (event.key === "Escape") {
      if (elements.feedSearchResults) {
        elements.feedSearchResults.classList.add("hidden");
      }
      state.feedSearchActiveIndex = -1;
    }
  });
}

if (elements.feedSearchForm) {
  elements.feedSearchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.feedSearchQuery = String(elements.feedSearchInput?.value || "");
    renderFeedSearchResults(state.feedSearchQuery, { keepActiveIndex: true });
    const opened = openActiveFeedSearchResult();
    if (opened && elements.feedSearchResults) {
      elements.feedSearchResults.classList.add("hidden");
    }
  });
}

if (elements.feedSearchResults) {
  elements.feedSearchResults.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
}

document.addEventListener("click", (event) => {
  if (!elements.feedSearchResults) {
    return;
  }
  const target = event.target;
  if (
    elements.feedSearchForm?.contains(target) ||
    elements.feedSearchResults.contains(target)
  ) {
    return;
  }
  elements.feedSearchResults.classList.add("hidden");
});

if (elements.profileShareBtn) {
  elements.profileShareBtn.addEventListener("click", async () => {
    if (!ensureAuthenticatedAction()) {
      return;
    }

    const publicUrl = `${window.location.origin}/u/${encodeURIComponent(state.user.username)}`;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setStatus("Ссылка на профиль скопирована", "success");
    } catch {
      await window.SferaDialogs.copy({
        title: "Ссылка на профиль",
        message: "Скопируй ссылку вручную, если браузер не дал доступ к буферу.",
        value: publicUrl
      });
    }
  });
}

if (elements.profileOpenPublicBtn) {
  elements.profileOpenPublicBtn.addEventListener("click", () => {
    if (!ensureAuthenticatedAction()) {
      return;
    }
    window.location.href = `/u/${encodeURIComponent(state.user.username)}`;
  });
}

if (elements.profileFollowersStatBtn) {
  elements.profileFollowersStatBtn.addEventListener("click", () => {
    openSettingsSubscriptionsSection("followers");
  });
}

if (elements.profileFollowingStatBtn) {
  elements.profileFollowingStatBtn.addEventListener("click", () => {
    openSettingsSubscriptionsSection("following");
  });
}

elements.refreshBtn.addEventListener("click", async () => {

  try {
    setStatus("Обновляю данные...");
    showLoadingSkeletons();
    await fullRefresh();
    renderAll();
    setStatus("Данные обновлены", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

window.addEventListener("beforeunload", () => {
  disconnectRealtimeSocket(true);
});

function isTypingContext(target) {
  if (!target) {
    return false;
  }
  const tagName = String(target.tagName || "").toLowerCase();
  return target.isContentEditable
    || tagName === "input"
    || tagName === "textarea"
    || tagName === "select";
}

function hasOpenBlockingModal() {
  const notificationsOpen = Boolean(state.notificationsModalOpen);
  const messagesModalOpen = !document.getElementById("messagesModal")?.classList.contains("hidden");
  const authGateOpen = !document.getElementById("authGateModal")?.classList.contains("hidden");
  return notificationsOpen || messagesModalOpen || authGateOpen;
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.notificationsModalOpen) {
    state.notificationsModalOpen = false;
    document.body.classList.remove("modal-open");
    renderNotifications();
    return;
  }

  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  if (event.key === "/" && !isTypingContext(event.target)) {
    event.preventDefault();
    switchTab("feed");
    elements.feedSearchInput?.focus();
    elements.feedSearchInput?.select();
    return;
  }

  if (hasOpenBlockingModal()) {
    return;
  }

  if ((event.key === " " || event.code === "Space") && !isTypingContext(event.target)) {
    event.preventDefault();
    if (!elements.globalPlayerAudio || !getCurrentTrackId()) {
      return;
    }
    if (elements.globalPlayerAudio.paused) {
      playCurrentTrack();
    } else {
      pauseCurrentTrack();
    }
    return;
  }

  if ((event.key === "j" || event.key === "J") && !isTypingContext(event.target)) {
    event.preventDefault();
    playNextTrack();
    return;
  }

  if ((event.key === "k" || event.key === "K") && !isTypingContext(event.target)) {
    event.preventDefault();
    playPreviousTrack();
    return;
  }

  if ((event.key === "m" || event.key === "M") && !isTypingContext(event.target)) {
    event.preventDefault();
    if (!elements.playerVolumeSlider) {
      return;
    }
    const currentVolume = Number(state.playbackVolume || 0);
    if (currentVolume <= 0 || state.player?.isMuted) {
      const restoreValue = Number(state.player?.lastVolumeBeforeMute);
      const volume = Number.isFinite(restoreValue) && restoreValue > 0 ? restoreValue : 0.5;
      applyVolumeToGlobalPlayer(volume);
    } else {
      if (state.player) {
        state.player.lastVolumeBeforeMute = currentVolume;
      }
      applyVolumeToGlobalPlayer(0);
    }
  }
});

async function init() {
  try {
    applyUiDensity(loadSavedUiDensity());
    setGuestMode(loadGuestMode());
    applyUiLanguage(resolvePreferredUiLanguage());
    setupPasswordVisibilityToggles();
    setStatus("Загрузка...");
    showLoadingSkeletons();
    await processEmailActionTokensFromUrl();
    state.playbackVolume = loadSavedVolume();
    setupEqualizerControls();
    setupGlobalPlayer();
    applyVolumeToGlobalPlayer(state.playbackVolume);
    await fullRefresh();
    if (!state.user && state.isGuest) {
      state.activeTab = "feed";
    }
    switchTab(state.activeTab);
    renderAll();
    let sharedTrackError = null;
    await openTrackFromSharedLinkIfNeeded().catch((error) => {
      sharedTrackError = error;
    });
    if (sharedTrackError) {
      setStatus(sharedTrackError.message, "error");
    } else {
      setStatus("Готово", "success");
    }
  } catch (error) {
    setStatus(error.message, "error");
  }

}

init();
