(() => {
  "use strict";

  function createAppSettingsUi(deps) {
        const {
      state,
      elements,
      DEFAULT_UI_LANGUAGE,
      normalizeUiLanguage,
      normalizeUiDensity,
      t,
      setStatus,
      applyUiLanguage,
      applyUiDensity,
      loadSavedUiDensity,
      formatDate,
      api,
      buildTrackHref,
      switchTab,
      setImageWithFallback,
      normalizeSearchQuery,
      goToTrackFromSearch,
      escapeHtml,
      renderAll,
      refreshMe,
      refreshTracks,
      refreshPlaylists,
      refreshAlbums,
      refreshUsers,
      refreshFollows,
      loadConversation,
      toggleFollow
    } = deps;

    function buildPublicProfileHref(user) {
      const username = String(user?.username || "").trim();
      const userId = String(user?.id || "").trim();
      const profileUrl = new URL("/public-profile.html", window.location.origin);
      profileUrl.searchParams.set("username", username);
      if (userId) {
        profileUrl.searchParams.set("uid", userId);
      }
      return `${profileUrl.pathname}${profileUrl.search}`;
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

    function createSettingsProfileLink(user, className = "user-link") {
      const link = document.createElement("a");
      const username = String(user?.username || "").trim();
      const href = buildPublicProfileHref(user);

      link.className = className;
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `@${username}`;
      link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      });

      return link;
    }

    function navigateToPublicProfile(user) {
      const href = buildPublicProfileHref(user);
      if (!href) {
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    }

    function bindSettingsProfileNavigation(target, user) {
      if (!target) {
        return;
      }

      const navigate = (event) => {
        if (event) {
          const interactiveTarget = event.target instanceof Element ? event.target.closest("button, input, select, textarea") : null;
          if (interactiveTarget) {
            return;
          }
          if ("button" in event && Number(event.button) !== 0) {
            return;
          }
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }
          event.preventDefault();
        }
        navigateToPublicProfile(user);
      };

      target.addEventListener("click", navigate);
      target.addEventListener("touchend", navigate, { passive: false });
    }

    const MESSAGE_LINK_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+/gi;

    function trimLinkSuffix(value) {
      return String(value || "").replace(/[.,!?;:]+$/u, "");
    }

    function normalizeExternalLinkHref(value) {
      let href = String(value || "").trim();
      if (!href) {
        return "";
      }
      if (/^www\./i.test(href)) {
        href = `https://${href}`;
      }
      try {
        const url = new URL(href);
        const protocol = String(url.protocol || "").toLowerCase();
        if (protocol !== "http:" && protocol !== "https:") {
          return "";
        }
        return url.href;
      } catch {
        return "";
      }
    }

    function renderLinkifiedText(container, value) {
      if (!container) {
        return;
      }

      const sourceText = String(value || "");
      container.textContent = "";
      if (!sourceText) {
        return;
      }

      const fragment = document.createDocumentFragment();
      let cursor = 0;
      MESSAGE_LINK_PATTERN.lastIndex = 0;

      for (const match of sourceText.matchAll(MESSAGE_LINK_PATTERN)) {
        const rawMatch = String(match[0] || "");
        const startIndex = Number(match.index);

        if (startIndex > cursor) {
          fragment.appendChild(document.createTextNode(sourceText.slice(cursor, startIndex)));
        }

        const displayText = trimLinkSuffix(rawMatch);
        const suffixText = rawMatch.slice(displayText.length);
        const href = normalizeExternalLinkHref(displayText);

        if (href) {
          const link = document.createElement("a");
          link.className = "user-link";
          link.href = href;
          link.target = "_blank";
          link.rel = "noopener noreferrer nofollow";
          link.textContent = displayText;
          fragment.appendChild(link);
        } else {
          fragment.appendChild(document.createTextNode(rawMatch));
        }

        if (suffixText) {
          fragment.appendChild(document.createTextNode(suffixText));
        }

        cursor = startIndex + rawMatch.length;
      }

      if (cursor < sourceText.length) {
        fragment.appendChild(document.createTextNode(sourceText.slice(cursor)));
      }

      if (!fragment.childNodes.length) {
        container.textContent = sourceText;
        return;
      }

      container.appendChild(fragment);
    }

    function createSimpleUserRow(user, controls) {
      const row = document.createElement("div");
      row.className = "simple-item simple-user-item";

      const avatar = document.createElement("img");
      avatar.className = "simple-user-avatar";
      avatar.alt = `@${user.username}`;
      setImageWithFallback(avatar, user.avatarUrl);

      const content = document.createElement("div");
      content.className = "simple-user-main";
      content.style.cursor = "pointer";

      const name = document.createElement("strong");
      name.appendChild(createSettingsProfileLink(user, "user-link compact-link"));

      const info = document.createElement("p");
      info.className = "muted";
      info.textContent = user.bio || t("userBioFallback");

      content.append(name, info);
      row.append(avatar, content);

      if (controls) {
        row.appendChild(controls);
      }

      bindSettingsProfileNavigation(avatar, user);
      bindSettingsProfileNavigation(content, user);

      return row;
    }

    let messagesModalBound = false;
    let supportBindingsReady = false;
    let adminCenterBindingsReady = false;

    function ensureSupportState() {
      if (!Array.isArray(state.supportMessages)) {
        state.supportMessages = [];
      }
      if (!Array.isArray(state.supportThreads)) {
        state.supportThreads = [];
      }
      if (!Array.isArray(state.currentSupportMessages)) {
        state.currentSupportMessages = [];
      }
      if (typeof state.currentSupportUserId !== "string") {
        state.currentSupportUserId = "";
      }
      if (!("currentSupportUser" in state)) {
        state.currentSupportUser = null;
      }
    }

    function getMessagesModalElements() {
      return {
        root: document.getElementById("messagesModal"),
        closeBtn: document.getElementById("messagesModalCloseBtn"),
        title: document.getElementById("messagesModalTitle"),
        subtitle: document.getElementById("messagesModalSubtitle"),
        list: document.getElementById("messagesModalChatList"),
        form: document.getElementById("messagesModalSendForm"),
        input: document.getElementById("messagesModalInput")
      };
    }

    function getSupportElements() {
      return {
        guest: document.getElementById("supportGuest"),
        userPanel: document.getElementById("supportUserPanel"),
        userChatList: document.getElementById("supportUserChatList"),
        userForm: document.getElementById("supportUserForm"),
        userInput: document.getElementById("supportUserInput"),
        adminPanel: document.getElementById("supportAdminPanel"),
        threadsList: document.getElementById("supportThreadsList"),
        adminThreadTitle: document.getElementById("supportAdminThreadTitle"),
        adminChatList: document.getElementById("supportAdminChatList"),
        adminForm: document.getElementById("supportAdminForm"),
        adminInput: document.getElementById("supportAdminInput")
      };
    }

    function closeMessagesModal() {
      const modal = getMessagesModalElements();
      if (!modal.root) {
        return;
      }
      modal.root.classList.add("hidden");
      document.body.classList.remove("modal-open");
    }

    function renderMessagesModal() {
      const modal = getMessagesModalElements();
      if (!modal.root || !modal.list || !modal.title) {
        return;
      }

      const currentUser = state.currentChatUser
        || state.users.find((user) => user.id === state.currentChatUserId)
        || null;

      modal.title.textContent = currentUser ? `@${currentUser.username}` : t("messagesChooseDialog");
      if (modal.subtitle) {
        modal.subtitle.textContent = currentUser
          ? "Личная переписка"
          : "Выберите пользователя для диалога";
      }

      modal.list.innerHTML = "";

      if (!state.currentChatUserId) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = t("messagesChooseDialog");
        modal.list.appendChild(hint);
      } else if (!Array.isArray(state.chatMessages) || state.chatMessages.length === 0) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = t("messagesDialogEmpty");
        modal.list.appendChild(hint);
      } else {
        renderLazyChatMessages(modal.list, state.chatMessages);
      }

      if (modal.form) {
        modal.form.classList.toggle("hidden", !state.user);
      }
      if (modal.input) {
        modal.input.disabled = !state.currentChatUserId;
      }

      modal.list.scrollTop = modal.list.scrollHeight;
    }

    function createChatMessageNode(message) {
      const row = document.createElement("div");
      row.className = `chat-message ${message.mine ? "mine" : ""}`;

      const head = document.createElement("strong");
      head.textContent = `${message.mine ? t("messagesYou") : "@" + message.fromUsername} • ${formatDate(message.createdAt)}`;

      const text = document.createElement("p");
      renderLinkifiedText(text, message.text);

      row.append(head, text);
      return row;
    }

    function renderLazyChatMessages(container, messages) {
      if (!container) {
        return;
      }

      const list = Array.isArray(messages) ? messages : [];
      const batchSize = 60;
      const total = list.length;
      let startIndex = Math.max(0, total - batchSize);

      const render = () => {
        container.innerHTML = "";
        if (startIndex > 0) {
          const olderBtn = document.createElement("button");
          olderBtn.type = "button";
          olderBtn.className = "ghost virtual-load-more";
          olderBtn.textContent = `${t("listShowOlder")} (${startIndex})`;
          olderBtn.addEventListener("click", () => {
            startIndex = Math.max(0, startIndex - batchSize);
            render();
          });
          container.appendChild(olderBtn);
        }
        for (let index = startIndex; index < total; index += 1) {
          container.appendChild(createChatMessageNode(list[index]));
        }
      };

      render();
    }

    function renderLazyThreads(container, threads) {
      if (!container) {
        return;
      }

      const list = Array.isArray(threads) ? threads : [];
      const batchSize = 24;
      let rendered = 0;
      container.innerHTML = "";

      const renderNext = () => {
        const end = Math.min(list.length, rendered + batchSize);
        for (let index = rendered; index < end; index += 1) {
          const thread = list[index];
          const row = document.createElement("div");
          row.className = "simple-item";

          const name = document.createElement("strong");
          name.textContent = `@${thread.user.username}`;

          const preview = document.createElement("p");
          preview.className = "muted";
          preview.textContent = `${thread.message.text} • ${formatDate(thread.message.createdAt)}`;

          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "ghost";
          openBtn.textContent = t("btnOpen");
          openBtn.addEventListener("click", async () => {
            await openMessagesModalForUser(thread.user.id);
          });

          row.append(name, preview, openBtn);
          container.appendChild(row);
        }
        rendered = end;
      };

      renderNext();
      if (rendered >= list.length) {
        return;
      }

      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.type = "button";
      loadMoreBtn.className = "ghost virtual-load-more";
      const syncText = () => {
        loadMoreBtn.textContent = `${t("listShowMore")} (${list.length - rendered})`;
      };
      syncText();
      loadMoreBtn.addEventListener("click", () => {
        renderNext();
        if (rendered >= list.length) {
          loadMoreBtn.remove();
          return;
        }
        syncText();
      });
      container.appendChild(loadMoreBtn);
    }

    function ensureMessagesModalBindings() {
      if (messagesModalBound) {
        return;
      }

      const modal = getMessagesModalElements();
      if (!modal.root) {
        return;
      }

      messagesModalBound = true;

      modal.closeBtn?.addEventListener("click", closeMessagesModal);

      modal.root.addEventListener("click", (event) => {
        if (event.target === modal.root || event.target.dataset.modalBackdrop === "1") {
          closeMessagesModal();
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.root.classList.contains("hidden")) {
          closeMessagesModal();
        }
      });

      modal.form?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!state.user) {
          setStatus("Войди в аккаунт, чтобы писать сообщения", "error");
          return;
        }

        const targetUserId = state.currentChatUserId;
        const text = modal.input?.value.trim() || "";

        if (!targetUserId) {
          setStatus(t("messagesChooseDialog"), "error");
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
          if (modal.input) {
            modal.input.value = "";
          }
          await loadConversation(targetUserId);
          setStatus("Сообщение отправлено", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });
    }

    async function openMessagesModalForUser(userId) {
      if (!state.user) {
        setStatus("Войди в аккаунт, чтобы писать сообщения", "error");
        return;
      }

      const targetUserId = String(userId || "").trim();
      if (!targetUserId) {
        setStatus(t("messagesChooseDialog"), "error");
        return;
      }

      ensureMessagesModalBindings();
      const modal = getMessagesModalElements();
      if (!modal.root) {
        throw new Error("Окно сообщений недоступно");
      }

      state.currentChatUserId = targetUserId;
      await loadConversation(targetUserId);

      modal.root.classList.remove("hidden");
      document.body.classList.add("modal-open");
      renderMessagesModal();
      modal.input?.focus();
    }

    function buildUserControls(user) {
      if (!state.user || user.isSelf) {
        return null;
      }

      const wrap = document.createElement("div");
      wrap.className = "track-actions";

      const followBtn = document.createElement("button");

      followBtn.type = "button";
      followBtn.className = user.isFollowing ? "ghost" : "";
      followBtn.textContent = user.isFollowing ? t("btnUnfollow") : t("btnFollow");
      followBtn.addEventListener("click", () => toggleFollow(user.id));

      const msgBtn = document.createElement("button");
      msgBtn.type = "button";
      msgBtn.className = "ghost";
      msgBtn.textContent = t("btnMessageShort");
      msgBtn.addEventListener("click", async () => {
        await openMessagesModalForUser(user.id);
      });

      wrap.append(followBtn, msgBtn);
      return wrap;
    }

    function renderFriends() {
      if (!state.user) {
        return;
      }

      if (elements.usersListSearchInput) {
        elements.usersListSearchInput.value = String(state.usersDirectorySearchQuery || "");
      }

      elements.incomingRequestsList.innerHTML = "";
      elements.friendsList.innerHTML = "";
      elements.usersList.innerHTML = "";

      const followers = state.follows.followers || [];
      const following = state.follows.following || [];
      if (elements.followersHeading) {
        elements.followersHeading.textContent = `${t("subsFollowers")} (${followers.length})`;
      }
      if (elements.followingHeading) {
        elements.followingHeading.textContent = `${t("subsFollowing")} (${following.length})`;
      }

      if (followers.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("subsNoFollowers");
        elements.incomingRequestsList.appendChild(empty);
      } else {
        for (const user of followers) {
          elements.incomingRequestsList.appendChild(createSimpleUserRow(user, buildUserControls(user)));
        }
      }

      if (following.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("subsNoFollowing");
        elements.friendsList.appendChild(empty);
      } else {
        for (const user of following) {
          elements.friendsList.appendChild(createSimpleUserRow(user, buildUserControls(user)));
        }
      }

      const query = normalizeSearchQuery(state.usersDirectorySearchQuery);
      const filteredUsers = state.users.filter((user) => {
        if (!query) {
          return true;
        }
        return `${user.username} ${user.bio || ""}`.toLowerCase().includes(query);
      });
      if (elements.allUsersHeading) {
        elements.allUsersHeading.textContent = `${t("subsAllUsers")} (${filteredUsers.length})`;
      }

      for (const user of filteredUsers) {
        elements.usersList.appendChild(createSimpleUserRow(user, buildUserControls(user)));
      }
    }

    function openSettingsSubscriptionsSection(target = "followers") {
      switchTab("settings");
      const section = target === "following" ? elements.followingSection : elements.followersSection;
      if (!section) {
        return;
      }
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      section.classList.add("search-hit");
      window.setTimeout(() => section.classList.remove("search-hit"), 1400);
    }

    function renderMessages() {
      if (!state.user) {
        renderMessagesModal();
        return;
      }

      ensureMessagesModalBindings();

      elements.chatUserSelect.innerHTML = "";

      const candidates = state.users.filter((user) => !user.isSelf);

      if (candidates.length === 0) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = t("messagesNoUsers");
        elements.chatUserSelect.appendChild(option);
      } else {
        for (const user of candidates) {
          const option = document.createElement("option");
          option.value = user.id;
          option.textContent = `@${user.username}${user.isFollower ? ` (${t("messagesFollowerSuffix")})` : ""}`;
          elements.chatUserSelect.appendChild(option);
        }

        if (state.currentChatUserId && candidates.some((user) => user.id === state.currentChatUserId)) {
          elements.chatUserSelect.value = state.currentChatUserId;
        }
      }

      elements.chatList.innerHTML = "";

      if (!state.currentChatUserId) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = t("messagesChooseDialog");
        elements.chatList.appendChild(hint);
      } else if (state.chatMessages.length === 0) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = t("messagesDialogEmpty");
        elements.chatList.appendChild(hint);
      } else {
        renderLazyChatMessages(elements.chatList, state.chatMessages);
        elements.chatList.scrollTop = elements.chatList.scrollHeight;
      }

      elements.threadsList.innerHTML = "";

      if (!Array.isArray(state.threads) || state.threads.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("messagesNoThreads");
        elements.threadsList.appendChild(empty);
      } else {
        renderLazyThreads(elements.threadsList, state.threads);
      }

      renderMessagesModal();
    }

    function createSupportThreadItem(thread) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `ghost support-thread-item${state.currentSupportUserId === thread?.user?.id ? " active" : ""}`;

      const user = thread?.user || {};
      const header = document.createElement("div");
      header.className = "support-thread-head";

      const name = document.createElement("strong");
      name.textContent = `@${user.username || "unknown"}`;

      const meta = document.createElement("span");
      meta.className = "muted support-thread-meta";
      meta.textContent = formatDate(thread?.message?.createdAt);

      const preview = document.createElement("p");
      preview.className = "muted support-thread-preview";
      preview.textContent = String(thread?.message?.text || "Без текста").slice(0, 180);

      header.append(name, meta);
      item.append(header, preview);
      item.addEventListener("click", async () => {
        await loadAdminSupportConversation(user.id);
      });
      return item;
    }

    function renderUserSupportPanel() {
      ensureSupportState();
      const support = getSupportElements();
      if (!support.userPanel || !support.userChatList || !support.userForm) {
        return;
      }

      support.userChatList.innerHTML = "";
      support.userForm.classList.toggle("hidden", !state.user || Boolean(state.user?.isAdmin));

      if (!state.user || state.user.isAdmin) {
        return;
      }

      if (!Array.isArray(state.supportMessages) || state.supportMessages.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Пока нет сообщений с поддержкой.";
        support.userChatList.appendChild(empty);
        return;
      }

      renderLazyChatMessages(support.userChatList, state.supportMessages);
      support.userChatList.scrollTop = support.userChatList.scrollHeight;
    }

    function renderAdminSupportPanel() {
      ensureSupportState();
      const support = getSupportElements();
      if (!support.adminPanel || !support.threadsList || !support.adminChatList || !support.adminForm || !support.adminThreadTitle) {
        return;
      }

      support.threadsList.innerHTML = "";
      support.adminChatList.innerHTML = "";
      support.adminForm.classList.toggle("hidden", !state.user?.isAdmin || !state.currentSupportUserId);

      if (!state.user?.isAdmin) {
        return;
      }

      if (!Array.isArray(state.supportThreads) || state.supportThreads.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Пока нет обращений в поддержку.";
        support.threadsList.appendChild(empty);
        support.adminThreadTitle.textContent = "Выберите обращение слева.";
        return;
      }

      for (const thread of state.supportThreads) {
        support.threadsList.appendChild(createSupportThreadItem(thread));
      }

      if (!state.currentSupportUserId) {
        support.adminThreadTitle.textContent = "Выберите обращение слева.";
        return;
      }

      const currentUser = state.currentSupportUser
        || state.supportThreads.find((entry) => entry?.user?.id === state.currentSupportUserId)?.user
        || null;

      support.adminThreadTitle.textContent = currentUser
        ? `Диалог с @${currentUser.username}`
        : "Диалог с пользователем";

      if (!Array.isArray(state.currentSupportMessages) || state.currentSupportMessages.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "В этом обращении пока нет сообщений.";
        support.adminChatList.appendChild(empty);
        return;
      }

      renderLazyChatMessages(support.adminChatList, state.currentSupportMessages);
      support.adminChatList.scrollTop = support.adminChatList.scrollHeight;
    }

    function renderSupportSection() {
      ensureSupportState();
      const support = getSupportElements();
      if (!support.guest || !support.userPanel || !support.adminPanel) {
        return;
      }

      const isLogged = Boolean(state.user);
      const isAdmin = Boolean(state.user?.isAdmin);

      support.guest.classList.toggle("hidden", isLogged);
      support.userPanel.classList.toggle("hidden", !isLogged || isAdmin);
      support.adminPanel.classList.toggle("hidden", !isAdmin);

      renderUserSupportPanel();
      renderAdminSupportPanel();
    }

    async function refreshUserSupportThread() {
      ensureSupportState();

      if (!state.user || state.user.isAdmin) {
        state.supportMessages = [];
        renderSupportSection();
        return;
      }

      const data = await api("/api/support/thread");
      state.supportMessages = Array.isArray(data.messages) ? data.messages : [];
      renderSupportSection();
    }

    async function refreshAdminSupportInbox() {
      ensureSupportState();

      if (!state.user?.isAdmin) {
        state.supportThreads = [];
        state.currentSupportUserId = "";
        state.currentSupportUser = null;
        state.currentSupportMessages = [];
        renderSupportSection();
        return;
      }

      const data = await api("/api/support/inbox");
      state.supportThreads = Array.isArray(data.threads) ? data.threads : [];

      if (!state.supportThreads.some((entry) => entry?.user?.id === state.currentSupportUserId)) {
        state.currentSupportUserId = "";
        state.currentSupportUser = null;
        state.currentSupportMessages = [];
      }

      renderSupportSection();
    }

    async function loadAdminSupportConversation(userId) {
      ensureSupportState();
      if (!state.user?.isAdmin || !userId) {
        return;
      }

      const data = await api(`/api/support/messages/${userId}`);
      state.currentSupportUserId = userId;
      state.currentSupportUser = data.withUser || null;
      state.currentSupportMessages = Array.isArray(data.messages) ? data.messages : [];
      renderSupportSection();
    }

    async function refreshSupportSectionData() {
      ensureSupportState();
      if (!state.user) {
        renderSupportSection();
        return;
      }

      if (state.user.isAdmin) {
        await refreshAdminSupportInbox();
        if (!state.currentSupportUserId && state.supportThreads[0]?.user?.id) {
          await loadAdminSupportConversation(state.supportThreads[0].user.id);
          return;
        }
        if (state.currentSupportUserId) {
          await loadAdminSupportConversation(state.currentSupportUserId);
          return;
        }
        renderSupportSection();
        return;
      }

      await refreshUserSupportThread();
    }

    function ensureSupportBindings() {
      if (supportBindingsReady) {
        return;
      }
      supportBindingsReady = true;

      const support = getSupportElements();

      support.userForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.user || state.user.isAdmin) {
          setStatus("Форма поддержки доступна только обычным пользователям.", "error");
          return;
        }

        const text = String(support.userInput?.value || "").trim();
        if (!text) {
          setStatus("Введите сообщение для поддержки.", "error");
          return;
        }

        try {
          setStatus("Отправляю сообщение в поддержку...");
          await api("/api/support/thread", {
            method: "POST",
            body: { text }
          });
          if (support.userInput) {
            support.userInput.value = "";
          }
          await refreshUserSupportThread();
          setStatus("Сообщение в поддержку отправлено.", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      support.adminForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!state.user?.isAdmin) {
          setStatus("Отвечать в поддержку могут только администраторы.", "error");
          return;
        }
        if (!state.currentSupportUserId) {
          setStatus("Сначала выберите обращение.", "error");
          return;
        }

        const text = String(support.adminInput?.value || "").trim();
        if (!text) {
          setStatus("Введите ответ пользователю.", "error");
          return;
        }

        try {
          setStatus("Отправляю ответ пользователю...");
          await api(`/api/support/messages/${state.currentSupportUserId}`, {
            method: "POST",
            body: { text }
          });
          if (support.adminInput) {
            support.adminInput.value = "";
          }
          await refreshAdminSupportInbox();
          await loadAdminSupportConversation(state.currentSupportUserId);
          setStatus("Ответ отправлен.", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      elements.contactToggleBtn?.addEventListener("click", () => {
        window.setTimeout(() => {
          if (elements.contactPanel?.classList.contains("hidden")) {
            return;
          }
          refreshSupportSectionData().catch((error) => {
            setStatus(error.message, "error");
          });
        }, 0);
      });
    }

    function ensureAdminCenterState() {
      if (!state.adminCenter || typeof state.adminCenter !== "object") {
        state.adminCenter = {};
      }
      if (typeof state.adminCenter.section !== "string") {
        state.adminCenter.section = "overview";
      }
      if (!state.adminCenter.dashboard || typeof state.adminCenter.dashboard !== "object") {
        state.adminCenter.dashboard = {
          stats: null,
          recentReports: [],
          recentSupportThreads: [],
          recentBannedUsers: [],
          recentTracks: []
        };
      }
      if (!state.adminCenter.storage || typeof state.adminCenter.storage !== "object") {
        state.adminCenter.storage = {
          snapshot: null,
          lastAction: null,
          runningAction: ""
        };
      }
      if (!Array.isArray(state.adminCenter.reports)) {
        state.adminCenter.reports = [];
      }
      if (!Array.isArray(state.adminCenter.users)) {
        state.adminCenter.users = [];
      }
      if (!Array.isArray(state.adminCenter.tracks)) {
        state.adminCenter.tracks = [];
      }
      if (typeof state.adminCenter.reportQuery !== "string") {
        state.adminCenter.reportQuery = "";
      }
      if (typeof state.adminCenter.reportStatus !== "string") {
        state.adminCenter.reportStatus = "open";
      }
      if (typeof state.adminCenter.userQuery !== "string") {
        state.adminCenter.userQuery = "";
      }
      if (typeof state.adminCenter.userFilter !== "string") {
        state.adminCenter.userFilter = "all";
      }
      if (typeof state.adminCenter.trackQuery !== "string") {
        state.adminCenter.trackQuery = "";
      }
      if (typeof state.adminCenter.trackFilter !== "string") {
        state.adminCenter.trackFilter = "all";
      }
      if (!Number.isFinite(state.adminCenter.loadedAt)) {
        state.adminCenter.loadedAt = 0;
      }
      if (!("loading" in state.adminCenter)) {
        state.adminCenter.loading = false;
      }
    }

    function getAdminCenterElements() {
      return {
        card: document.getElementById("settingsAdminCard"),
        stats: document.getElementById("adminCenterStats"),
        overviewGrid: document.getElementById("adminOverviewGrid"),
        storagePanel: document.getElementById("adminStoragePanel"),
        reportsList: document.getElementById("adminReportsList"),
        usersList: document.getElementById("adminUsersList"),
        tracksList: document.getElementById("adminTracksList"),
        supportList: document.getElementById("adminSupportPreviewList"),
        refreshBtn: document.getElementById("adminCenterRefreshBtn"),
        openSupportBtn: document.getElementById("adminCenterOpenSupportBtn"),
        openSupportInlineBtn: document.getElementById("adminCenterOpenSupportInlineBtn"),
        reportStatusFilter: document.getElementById("adminReportsStatusFilter"),
        reportSearchForm: document.getElementById("adminReportsSearchForm"),
        reportSearchInput: document.getElementById("adminReportsSearchInput"),
        userFilter: document.getElementById("adminUsersFilter"),
        userSearchForm: document.getElementById("adminUsersSearchForm"),
        userSearchInput: document.getElementById("adminUsersSearchInput"),
        trackFilter: document.getElementById("adminTracksFilter"),
        trackSearchForm: document.getElementById("adminTracksSearchForm"),
        trackSearchInput: document.getElementById("adminTracksSearchInput"),
        tabButtons: Array.from(document.querySelectorAll("[data-admin-center-section]")),
        panels: Array.from(document.querySelectorAll("[data-admin-center-panel]"))
      };
    }

    function createAdminEmptyState(text) {
      const node = document.createElement("div");
      node.className = "admin-empty-state";
      node.textContent = text;
      return node;
    }

    function createAdminBadge(text, className = "") {
      const badge = document.createElement("span");
      badge.className = `admin-badge${className ? ` ${className}` : ""}`;
      badge.textContent = text;
      return badge;
    }

    function createAdminMeta(values) {
      const wrap = document.createElement("div");
      wrap.className = "admin-result-meta";
      for (const value of values) {
        if (!value) {
          continue;
        }
        const item = document.createElement("span");
        item.textContent = value;
        wrap.appendChild(item);
      }
      return wrap;
    }

    function parseAdminCommaList(value, limit = 100) {
      return String(value || "")
        .split(",")
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, limit);
    }

    async function refreshAdminManagedData() {
      const tasks = [];
      if (typeof refreshUsers === "function") {
        tasks.push(refreshUsers());
      }
      if (typeof refreshFollows === "function") {
        tasks.push(refreshFollows());
      }
      if (typeof refreshTracks === "function") {
        tasks.push(refreshTracks());
      }
      if (typeof refreshAlbums === "function") {
        tasks.push(refreshAlbums());
      }
      if (typeof refreshPlaylists === "function") {
        tasks.push(refreshPlaylists());
      }
      if (typeof refreshMe === "function") {
        tasks.push(refreshMe());
      }
      await Promise.all(tasks);
    }

    async function openSupportWorkspaceFromAdmin(userId = "") {
      if (elements.contactPanel) {
        elements.contactPanel.classList.remove("hidden");
      }
      if (elements.contactToggleBtn) {
        const lang = state.user?.uiLanguage || state.uiLanguage || DEFAULT_UI_LANGUAGE;
        elements.contactToggleBtn.textContent = t("contactHide", lang);
      }

      await refreshAdminSupportInbox();

      const targetUserId = String(userId || state.currentSupportUserId || state.supportThreads[0]?.user?.id || "").trim();
      if (targetUserId) {
        await loadAdminSupportConversation(targetUserId);
      }

      document.getElementById("settingsContactCard")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    async function openSupportWorkspace(userId = "") {
      switchTab("settings");

      if (elements.contactPanel) {
        elements.contactPanel.classList.remove("hidden");
      }
      if (elements.contactToggleBtn) {
        const lang = state.user?.uiLanguage || state.uiLanguage || DEFAULT_UI_LANGUAGE;
        elements.contactToggleBtn.textContent = t("contactHide", lang);
      }

      if (state.user?.isAdmin) {
        await openSupportWorkspaceFromAdmin(userId);
        return;
      }

      await refreshSupportSectionData();
      document.getElementById("settingsContactCard")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }

    function setAdminCenterSection(section) {
      ensureAdminCenterState();
      state.adminCenter.section = ["overview", "storage", "reports", "users", "tracks", "support"].includes(section)
        ? section
        : "overview";
      renderAdminCenter();
    }

    async function loadAdminDashboard() {
      ensureAdminCenterState();
      const data = await api("/api/admin/dashboard");
      state.adminCenter.dashboard = {
        stats: data?.stats || null,
        recentReports: Array.isArray(data?.recentReports) ? data.recentReports : [],
        recentSupportThreads: Array.isArray(data?.recentSupportThreads) ? data.recentSupportThreads : [],
        recentBannedUsers: Array.isArray(data?.recentBannedUsers) ? data.recentBannedUsers : [],
        recentTracks: Array.isArray(data?.recentTracks) ? data.recentTracks : []
      };
      renderAdminCenter();
    }

    async function loadAdminStorage() {
      ensureAdminCenterState();
      const data = await api("/api/admin/storage");
      state.adminCenter.storage.snapshot = data?.storage || null;
      renderAdminCenter();
    }

    async function loadAdminReports() {
      ensureAdminCenterState();
      const params = new URLSearchParams();
      if (state.adminCenter.reportQuery.trim()) {
        params.set("q", state.adminCenter.reportQuery.trim());
      }
      params.set("status", state.adminCenter.reportStatus || "open");
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const data = await api(`/api/admin/reports${suffix}`);
      state.adminCenter.reports = Array.isArray(data?.reports) ? data.reports : [];
      renderAdminCenter();
    }

    async function loadAdminUsersSearch() {
      ensureAdminCenterState();
      const params = new URLSearchParams();
      if (state.adminCenter.userQuery.trim()) {
        params.set("q", state.adminCenter.userQuery.trim());
      }
      params.set("filter", state.adminCenter.userFilter || "all");
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const data = await api(`/api/admin/users${suffix}`);
      state.adminCenter.users = Array.isArray(data?.users) ? data.users : [];
      renderAdminCenter();
    }

    async function loadAdminTracksSearch() {
      ensureAdminCenterState();
      const params = new URLSearchParams();
      if (state.adminCenter.trackQuery.trim()) {
        params.set("q", state.adminCenter.trackQuery.trim());
      }
      params.set("filter", state.adminCenter.trackFilter || "all");
      const suffix = params.toString() ? `?${params.toString()}` : "";
      const data = await api(`/api/admin/tracks${suffix}`);
      state.adminCenter.tracks = Array.isArray(data?.tracks) ? data.tracks : [];
      renderAdminCenter();
    }

    async function refreshAdminCenterData({ force = false } = {}) {
      ensureAdminCenterState();
      if (!state.user?.isAdmin) {
        return;
      }
      if (!force && state.adminCenter.loading) {
        return;
      }

      state.adminCenter.loading = true;
      try {
        await Promise.all([
          loadAdminDashboard(),
          loadAdminStorage(),
          loadAdminReports(),
          loadAdminUsersSearch(),
          loadAdminTracksSearch(),
          refreshAdminSupportInbox()
        ]);
        state.adminCenter.loadedAt = Date.now();
        renderAdminCenter();
      } finally {
        state.adminCenter.loading = false;
      }
    }

    async function submitAdminUserUpdate(userId, payload) {
      await api(`/api/admin/users/${userId}`, {
        method: "PUT",
        body: payload
      });
      await refreshAdminManagedData();
      await refreshAdminCenterData({ force: true });
      renderAll();
    }

    async function deleteAdminUser(user) {
      const confirmed = await confirmDialog({
        title: "Удалить аккаунт?",
        message: `Аккаунт @${user.username} будет удалён без возможности восстановления.`,
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true
      });
      if (!confirmed) {
        return;
      }

      setStatus(`Удаляю аккаунт @${user.username}...`);
      await api(`/api/admin/users/${user.id}`, { method: "DELETE" });
      await refreshAdminManagedData();
      await refreshAdminCenterData({ force: true });
      renderAll();
      setStatus(`Аккаунт @${user.username} удалён`, "success");
    }

    async function updateAdminTrack(trackId, payload) {
      await api(`/api/tracks/${trackId}`, {
        method: "PUT",
        body: payload
      });
      await refreshAdminManagedData();
      await refreshAdminCenterData({ force: true });
      renderAll();
    }

    async function deleteAdminTrack(track) {
      const itemLabel = track.kind === "beat" ? "бит" : "трек";
      const confirmed = await confirmDialog({
        title: `Удалить ${itemLabel}?`,
        message: `${itemLabel === "бит" ? "Бит" : "Трек"} "${track.title}" будет удалён без возможности восстановления.`,
        confirmText: "Удалить",
        cancelText: "Отмена",
        danger: true
      });
      if (!confirmed) {
        return;
      }

      setStatus(`Удаляю ${itemLabel}...`);
      await api(`/api/tracks/${track.id}`, { method: "DELETE" });
      await refreshAdminManagedData();
      await refreshAdminCenterData({ force: true });
      renderAll();
      setStatus(`${itemLabel === "бит" ? "Бит" : "Трек"} удалён`, "success");
    }

    async function updateAdminReportStatus(reportId, status, resolutionNote = "") {
      await api(`/api/admin/reports/${reportId}`, {
        method: "PUT",
        body: {
          status,
          resolutionNote
        }
      });
      await refreshAdminCenterData({ force: true });
    }

    function createAdminStatCard(label, value, hint) {
      const card = document.createElement("div");
      card.className = "admin-stat-card";
      const amount = document.createElement("strong");
      amount.textContent = String(value ?? 0);
      const title = document.createElement("span");
      title.textContent = label;
      card.append(amount, title);
      if (hint) {
        const muted = document.createElement("span");
        muted.className = "muted";
        muted.textContent = hint;
        card.appendChild(muted);
      }
      return card;
    }

    function formatStorageBytes(bytes) {
      const numeric = Number(bytes);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return "0 Б";
      }
      const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
      let value = numeric;
      let unitIndex = 0;
      while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
      }
      const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
      return `${value.toFixed(digits)} ${units[unitIndex]}`;
    }

    function formatStoragePercent(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return "0%";
      }
      const rounded = Math.max(0, Math.min(100, Math.round(numeric * 10) / 10));
      return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
    }

    function createAdminStorageMetric(title, usage, detailText = "") {
      const card = document.createElement("section");
      card.className = "admin-storage-metric";

      const head = document.createElement("div");
      head.className = "admin-storage-metric-head";

      const titleNode = document.createElement("strong");
      titleNode.textContent = title;

      const valueNode = document.createElement("span");
      valueNode.className = "admin-storage-metric-value";
      valueNode.textContent = usage
        ? `${formatStorageBytes(usage.usedBytes)} / ${formatStorageBytes(usage.totalBytes)}`
        : "Недоступно";

      head.append(titleNode, valueNode);

      const bar = document.createElement("div");
      bar.className = "admin-storage-bar";

      const fill = document.createElement("span");
      fill.className = "admin-storage-bar-fill";
      fill.style.width = `${Math.max(0, Math.min(100, Number(usage?.percent || 0)))}%`;
      bar.appendChild(fill);

      const meta = document.createElement("div");
      meta.className = "admin-storage-metric-meta muted";
      meta.textContent = usage
        ? `Свободно ${formatStorageBytes(usage.freeBytes)} • занято ${formatStoragePercent(usage.percent)}${detailText ? ` • ${detailText}` : ""}`
        : detailText || "Не удалось получить данные";

      card.append(head, bar, meta);
      return card;
    }

    function createAdminStorageActionCard(options) {
      const {
        title,
        description,
        reclaimText,
        buttonText,
        actionName,
        confirmTitle,
        confirmMessage,
        running,
        onRun
      } = options;

      const card = document.createElement("section");
      card.className = "admin-storage-action-card";

      const titleNode = document.createElement("h4");
      titleNode.textContent = title;

      const descriptionNode = document.createElement("p");
      descriptionNode.className = "muted";
      descriptionNode.textContent = description;

      const reclaimNode = document.createElement("div");
      reclaimNode.className = "admin-storage-action-meta";
      reclaimNode.textContent = reclaimText;

      const button = document.createElement("button");
      button.type = "button";
      button.className = running ? "" : "ghost";
      button.disabled = Boolean(running);
      button.textContent = running ? "Выполняется..." : buttonText;
      button.addEventListener("click", async () => {
        const confirmed = await confirmDialog({
          title: confirmTitle,
          message: confirmMessage,
          confirmText: buttonText,
          cancelText: "Отмена"
        });
        if (!confirmed) {
          return;
        }
        onRun(actionName).catch((error) => {
          setStatus(error.message, "error");
        });
      });

      card.append(titleNode, descriptionNode, reclaimNode, button);
      return card;
    }

    async function runAdminStorageAction(actionName) {
      ensureAdminCenterState();
      state.adminCenter.storage.runningAction = actionName;
      renderAdminCenter();

      const actionLabels = {
        smart_cleanup: "Запускаю комплексную очистку...",
        cleanup_temp: "Удаляю временные файлы...",
        cleanup_orphan_media: "Проверяю и удаляю сиротские файлы...",
        compact_storage: "Сжимаю хранилище и очищаю служебные хвосты..."
      };

      try {
        setStatus(actionLabels[actionName] || "Выполняю обслуживание хранилища...");
        const result = await api("/api/admin/storage/actions", {
          method: "POST",
          body: { action: actionName }
        });
        state.adminCenter.storage.snapshot = result?.storage || state.adminCenter.storage.snapshot;
        state.adminCenter.storage.lastAction = {
          action: actionName,
          freedBytes: Number(result?.freedBytes || 0),
          removedFilesCount: Number(result?.removedFilesCount || 0),
          details: result?.details || {},
          completedAt: new Date().toISOString(),
          message: String(result?.message || "")
        };
        await loadAdminDashboard();
        renderAdminCenter();
        const freedText = result?.freedBytes ? ` Освобождено ${formatStorageBytes(result.freedBytes)}.` : "";
        setStatus(`${result?.message || "Очистка завершена."}${freedText}`, "success");
      } finally {
        state.adminCenter.storage.runningAction = "";
        renderAdminCenter();
      }
    }

    function createAdminUserQuickActions(user) {
      const actions = document.createElement("div");
      actions.className = "admin-result-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "ghost";
      openBtn.textContent = "Открыть профиль";
      openBtn.addEventListener("click", () => {
        window.open(user.profilePath, "_blank", "noopener,noreferrer");
      });

      const toggleVerifiedBtn = document.createElement("button");
      toggleVerifiedBtn.type = "button";
      toggleVerifiedBtn.className = "ghost";
      toggleVerifiedBtn.textContent = user.isVerifiedArtist ? "Снять галочку" : "Выдать галочку";
      toggleVerifiedBtn.addEventListener("click", async () => {
        try {
          const nextIsVerifiedArtist = !user.isVerifiedArtist;
          setStatus(
            nextIsVerifiedArtist
              ? `Подтверждаю @${user.username} как автора...`
              : `Снимаю галочку с @${user.username}...`
          );
          await submitAdminUserUpdate(user.id, {
            isVerifiedArtist: nextIsVerifiedArtist
          });
          setStatus(
            nextIsVerifiedArtist
              ? `Галочка выдана аккаунту @${user.username}`
              : `Галочка снята с аккаунта @${user.username}`,
            "success"
          );
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const toggleBanBtn = document.createElement("button");
      toggleBanBtn.type = "button";
      toggleBanBtn.className = "ghost";
      toggleBanBtn.textContent = user.isBanned ? "Разбанить" : "Забанить";
      toggleBanBtn.addEventListener("click", async () => {
        try {
          const nextIsBanned = !user.isBanned;
          const defaultReason = user.banReason || "Нарушение правил платформы";
          let banReason = "";
          if (nextIsBanned) {
            const entered = await promptDialog({
              title: "Причина блокировки",
              value: defaultReason,
              placeholder: "Укажи причину блокировки",
              confirmText: "Заблокировать"
            });
            if (entered === null) {
              return;
            }
            banReason = String(entered || "").trim() || defaultReason;
          }
          setStatus(nextIsBanned ? `Блокирую @${user.username}...` : `Снимаю блокировку с @${user.username}...`);
          await submitAdminUserUpdate(user.id, {
            isBanned: nextIsBanned,
            banReason
          });
          setStatus(nextIsBanned ? `Аккаунт @${user.username} заблокирован` : `Аккаунт @${user.username} разблокирован`, "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const resetPasswordBtn = document.createElement("button");
      resetPasswordBtn.type = "button";
      resetPasswordBtn.className = "ghost";
      resetPasswordBtn.textContent = "Сбросить пароль";
      resetPasswordBtn.addEventListener("click", async () => {
        try {
          const confirmed = await confirmDialog({
            title: "Сгенерировать временный пароль?",
            message: `Для @${user.username} будет создан новый временный пароль.\n\nСтарые сессии пользователя завершатся автоматически.`,
            confirmText: "Сгенерировать",
            cancelText: "Отмена"
          });
          if (!confirmed) {
            return;
          }
          setStatus(`Генерирую временный пароль для @${user.username}...`);
          const result = await api(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
            method: "POST"
          });
          const temporaryPassword = String(result?.temporaryPassword || "").trim();
          if (!temporaryPassword) {
            throw new Error("Сервер не вернул временный пароль");
          }
          if (navigator.clipboard?.writeText) {
            try {
              await navigator.clipboard.writeText(temporaryPassword);
            } catch {
              // ignore clipboard failures
            }
          }
          await copyDialog({
            title: `Временный пароль для @${user.username}`,
            message: `Пароль показан только один раз.${navigator.clipboard?.writeText ? "\n\nЯ уже попытался скопировать его в буфер обмена." : ""}`,
            value: temporaryPassword
          });
          setStatus(`Временный пароль для @${user.username} готов`, "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "ghost";
      deleteBtn.textContent = "Удалить аккаунт";
      deleteBtn.addEventListener("click", () => {
        deleteAdminUser(user).catch((error) => {
          setStatus(error.message, "error");
        });
      });

      actions.append(openBtn, toggleVerifiedBtn, toggleBanBtn, resetPasswordBtn, deleteBtn);
      return actions;
    }

    function createAdminUserForm(user) {
      const details = document.createElement("details");
      details.className = "admin-inline-form";

      const summary = document.createElement("summary");
      summary.className = "ghost";
      summary.textContent = "Быстрое редактирование";
      details.appendChild(summary);

      const form = document.createElement("form");
      form.className = "admin-inline-form";
      form.innerHTML = `
        <div class="admin-inline-grid">
          <label>
            <span>Никнейм</span>
            <input name="username" type="text" minlength="3" maxlength="24" required value="${escapeHtml(user.username || "")}" />
          </label>
          <label>
            <span>Причина бана</span>
            <input name="banReason" type="text" maxlength="500" value="${escapeHtml(user.banReason || "")}" />
          </label>
        </div>
        <label>
          <span>Описание профиля</span>
          <textarea name="bio" rows="4" maxlength="500">${escapeHtml(user.bio || "")}</textarea>
        </label>
        <label class="admin-filter-field">
          <span>
            <input name="isVerifiedArtist" type="checkbox" ${user.isVerifiedArtist ? "checked" : ""} />
            Подтверждённый автор
          </span>
        </label>
        <label class="admin-filter-field">
          <span>
            <input name="isBanned" type="checkbox" ${user.isBanned ? "checked" : ""} />
            Заблокировать аккаунт
          </span>
        </label>
        <div class="inline-actions">
          <button type="submit">Сохранить профиль</button>
        </div>
      `;

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const raw = new FormData(form);
        try {
          setStatus(`Сохраняю изменения профиля @${user.username}...`);
          await submitAdminUserUpdate(user.id, {
            username: String(raw.get("username") || "").trim(),
            bio: String(raw.get("bio") || "").trim(),
            isVerifiedArtist: Boolean(raw.get("isVerifiedArtist")),
            isBanned: Boolean(raw.get("isBanned")),
            banReason: String(raw.get("banReason") || "").trim()
          });
          setStatus(`Профиль @${user.username} обновлён`, "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      details.appendChild(form);
      return details;
    }

    function createAdminUserCard(user) {
      const card = document.createElement("article");
      card.className = "admin-result-card";

      const main = document.createElement("div");
      main.className = "admin-result-main";

      const avatar = document.createElement("img");
      avatar.className = "admin-result-avatar";
      avatar.alt = `@${user.username}`;
      setImageWithFallback(avatar, user.avatarUrl);

      const copy = document.createElement("div");
      copy.className = "admin-result-copy";

      const titleLine = document.createElement("div");
      titleLine.className = "admin-result-titleline";
      const title = document.createElement("h4");
      title.className = "admin-result-title";
      title.textContent = `@${user.username}`;
      titleLine.appendChild(title);
      if (user.isAdmin) {
        titleLine.appendChild(createAdminBadge("ADMIN", "is-accent"));
      }
      if (user.isVerifiedArtist) {
        titleLine.appendChild(createAdminBadge("AUTHOR", "is-verified"));
      }
      if (user.isBanned) {
        titleLine.appendChild(createAdminBadge("BAN", "is-danger"));
      }

      const subtitle = document.createElement("p");
      subtitle.className = "admin-result-subtitle muted";
      subtitle.textContent = user.email || "Email не указан";

      const meta = createAdminMeta([
        `Треки: ${user.tracksCount || 0}`,
        `Биты: ${user.beatsCount || 0}`,
        `Альбомы: ${user.albumsCount || 0}`,
        `Подписчики: ${user.followersCount || 0}`,
        `Подписки: ${user.followingCount || 0}`,
        `Создан: ${formatDate(user.createdAt)}`
      ]);

      copy.append(titleLine, subtitle, meta);
      if (user.bio) {
        const note = document.createElement("p");
        note.className = "admin-result-note muted";
        note.textContent = user.bio;
        copy.appendChild(note);
      }
      if (user.isBanned && user.banReason) {
        const banNote = document.createElement("p");
        banNote.className = "admin-result-note muted";
        banNote.textContent = `Причина бана: ${user.banReason}`;
        copy.appendChild(banNote);
      }

      main.append(avatar, copy);
      card.append(main, createAdminUserQuickActions(user), createAdminUserForm(user));
      return card;
    }

    function createAdminTrackActions(track) {
      const actions = document.createElement("div");
      actions.className = "admin-result-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "ghost";
      openBtn.textContent = "Открыть трек";
      openBtn.addEventListener("click", () => {
        const href = track.sharePath || buildTrackHref(track);
        window.open(href, "_blank", "noopener,noreferrer");
      });

      const authorBtn = document.createElement("button");
      authorBtn.type = "button";
      authorBtn.className = "ghost";
      authorBtn.textContent = `Профиль @${track.username}`;
      authorBtn.addEventListener("click", () => {
        if (track.ownerProfilePath) {
          window.open(track.ownerProfilePath, "_blank", "noopener,noreferrer");
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "ghost";
      deleteBtn.textContent = track.kind === "beat" ? "Удалить бит" : "Удалить трек";
      deleteBtn.addEventListener("click", () => {
        deleteAdminTrack(track).catch((error) => {
          setStatus(error.message, "error");
        });
      });

      actions.append(openBtn, authorBtn, deleteBtn);
      return actions;
    }

    function createAdminTrackForm(track) {
      const details = document.createElement("details");
      details.className = "admin-inline-form";

      const summary = document.createElement("summary");
      summary.className = "ghost";
      summary.textContent = "Быстрое редактирование";
      details.appendChild(summary);

      const form = document.createElement("form");
      form.className = "admin-inline-form";
      form.innerHTML = `
        <div class="admin-inline-grid">
          <label>
            <span>Название</span>
            <input name="title" type="text" maxlength="120" required value="${escapeHtml(track.title || "")}" />
          </label>
          <label>
            <span>Жанр</span>
            <input name="genre" type="text" maxlength="60" value="${escapeHtml(track.genre || "")}" />
          </label>
        </div>
        <div class="admin-inline-grid">
          <label>
            <span>Авторы</span>
            <input name="authors" type="text" value="${escapeHtml((track.authors || []).join(", "))}" />
          </label>
          <label>
            <span>Продюсеры</span>
            <input name="producers" type="text" value="${escapeHtml((track.producers || []).join(", "))}" />
          </label>
        </div>
        <label>
          <span>Хештеги</span>
          <input name="hashtags" type="text" value="${escapeHtml((track.hashtags || []).join(", "))}" />
        </label>
        <label>
          <span>Режим публикации</span>
          <select name="publishMode">
            <option value="public"${track.publishMode === "public" ? " selected" : ""}>Публичный</option>
            <option value="draft"${track.publishMode === "draft" ? " selected" : ""}>Черновик</option>
            <option value="private"${track.publishMode === "private" ? " selected" : ""}>Приватный</option>
            <option value="link"${track.publishMode === "link" ? " selected" : ""}>Доступ по ссылке</option>
            <option value="premiere"${track.publishMode === "premiere" ? " selected" : ""}>Премьера</option>
          </select>
        </label>
        <label>
          <span>Описание</span>
          <textarea name="description" rows="4" maxlength="1000">${escapeHtml(track.description || "")}</textarea>
        </label>
        ${track.kind === "beat" ? "" : `
        <label class="admin-filter-field">
          <span>
            <input name="isExplicit" type="checkbox" ${track.isExplicit ? "checked" : ""} />
            Метка E: в треке есть нецензурная лексика
          </span>
        </label>
        `}
        <div class="inline-actions">
          <button type="submit">Сохранить трек</button>
        </div>
      `;

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const raw = new FormData(form);
        try {
          setStatus(`Сохраняю трек "${track.title}"...`);
          await updateAdminTrack(track.id, {
            title: String(raw.get("title") || "").trim(),
            genre: String(raw.get("genre") || "").trim(),
            description: String(raw.get("description") || "").trim(),
            publishMode: String(raw.get("publishMode") || "public").trim().toLowerCase(),
            isExplicit: track.kind === "beat" ? false : Boolean(raw.get("isExplicit")),
            authors: parseAdminCommaList(raw.get("authors"), 100),
            producers: parseAdminCommaList(raw.get("producers"), 100),
            hashtags: parseAdminCommaList(raw.get("hashtags"), 5)
          });
          setStatus(`Трек "${track.title}" обновлён`, "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      details.appendChild(form);
      return details;
    }

    function createAdminTrackCard(track) {
      const card = document.createElement("article");
      card.className = "admin-result-card";

      const main = document.createElement("div");
      main.className = "admin-result-main";

      const cover = document.createElement("img");
      cover.className = "admin-result-cover";
      cover.alt = track.title || "Обложка трека";
      setImageWithFallback(cover, track.coverUrl);

      const copy = document.createElement("div");
      copy.className = "admin-result-copy";

      const titleLine = document.createElement("div");
      titleLine.className = "admin-result-titleline";
      const title = document.createElement("h4");
      title.className = "admin-result-title";
      title.textContent = track.title || "Без названия";
      titleLine.append(title);
      if (track.isExplicit) {
        const explicitBadge = document.createElement("span");
        explicitBadge.className = "track-explicit-badge is-compact";
        explicitBadge.textContent = "E";
        explicitBadge.setAttribute("aria-label", "В треке присутствует нецензурная лексика");
        explicitBadge.setAttribute("data-tooltip", "В треке присутствует нецензурная лексика");
        explicitBadge.tabIndex = 0;
        titleLine.appendChild(explicitBadge);
      }
      titleLine.appendChild(createAdminBadge(track.kind === "beat" ? "бит" : "трек"));

      const subtitle = document.createElement("p");
      subtitle.className = "admin-result-subtitle muted";
      subtitle.textContent = `@${track.username} • ${track.genre || "Без жанра"}`;

      const meta = createAdminMeta([
        `Режим: ${track.publishMode || "public"}`,
        `Лайки: ${track.likesCount || 0}`,
        `Дизлайки: ${track.dislikesCount || 0}`,
        `Комментарии: ${track.commentsCount || 0}`,
        `Прослушивания: ${track.listensCount || 0}`,
        `Обновлён: ${formatDate(track.updatedAt || track.createdAt)}`
      ]);

      copy.append(titleLine, subtitle, meta);
      if (track.description) {
        const note = document.createElement("p");
        note.className = "admin-result-note muted";
        note.textContent = track.description;
        copy.appendChild(note);
      }

      main.append(cover, copy);
      card.append(main, createAdminTrackActions(track), createAdminTrackForm(track));
      return card;
    }

    function createAdminReportCard(report) {
      const card = document.createElement("article");
      card.className = "admin-result-card";

      const copy = document.createElement("div");
      copy.className = "admin-result-copy";

      const titleLine = document.createElement("div");
      titleLine.className = "admin-result-titleline";
      const title = document.createElement("h4");
      title.className = "admin-result-title";
      const targetLabel = report.target?.type === "user"
        ? `Профиль @${report.target?.username || "unknown"}`
        : report.target?.type === "comment"
          ? `Комментарий @${report.target?.username || "unknown"}`
          : `${report.target?.kind === "beat" ? "Бит" : "Трек"} ${report.target?.title || "без названия"}`;
      title.textContent = targetLabel;
      titleLine.appendChild(title);
      titleLine.appendChild(createAdminBadge(
        report.status === "open" ? "open" : report.status === "resolved" ? "resolved" : "dismissed",
        report.status === "open" ? "is-danger" : ""
      ));

      const subtitle = document.createElement("p");
      subtitle.className = "admin-result-subtitle muted";
      subtitle.textContent = `Репортёр: @${report.reporter?.username || "unknown"} • ${formatDate(report.createdAt)}`;

      const meta = createAdminMeta([
        `Причина: ${report.reason || "без причины"}`,
        report.target?.type === "comment" && report.target?.trackTitle
          ? `Трек: ${report.target.trackTitle}`
          : null,
        report.target?.exists === false ? "Объект уже удалён" : null
      ]);

      copy.append(titleLine, subtitle, meta);
      if (report.target?.type === "comment" && report.target?.text) {
        const targetNote = document.createElement("p");
        targetNote.className = "admin-result-note muted";
        targetNote.textContent = `Комментарий: ${report.target.text}`;
        copy.appendChild(targetNote);
      }
      if (report.details) {
        const note = document.createElement("p");
        note.className = "admin-result-note muted";
        note.textContent = report.details;
        copy.appendChild(note);
      }
      if (report.resolvedAt) {
        const resolved = document.createElement("p");
        resolved.className = "admin-result-note muted";
        resolved.textContent = `Статус обновил @${report.resolvedBy?.username || "admin"} • ${formatDate(report.resolvedAt)}${report.resolutionNote ? ` • ${report.resolutionNote}` : ""}`;
        copy.appendChild(resolved);
      }

      const actions = document.createElement("div");
      actions.className = "admin-result-actions";
      const targetHref = report.target?.type === "user" ? report.target?.profilePath : report.target?.sharePath;

      if (targetHref) {
        const openTargetBtn = document.createElement("button");
        openTargetBtn.type = "button";
        openTargetBtn.className = "ghost";
        openTargetBtn.textContent = report.target.type === "user"
          ? "Открыть профиль"
          : report.target.type === "comment"
            ? "Открыть трек"
            : "Открыть трек";
        openTargetBtn.addEventListener("click", () => {
          window.open(targetHref, "_blank", "noopener,noreferrer");
        });
        actions.appendChild(openTargetBtn);
      }

      const resolveBtn = document.createElement("button");
      resolveBtn.type = "button";
      resolveBtn.className = "ghost";
      resolveBtn.textContent = "Решено";
      resolveBtn.addEventListener("click", async () => {
        try {
          const note = await promptDialog({
            title: "Комментарий к решению",
            message: "Это поле необязательно.",
            value: report.resolutionNote || "",
            placeholder: "Комментарий администратора",
            multiline: true,
            confirmText: "Отметить решённой"
          });
          if (note === null) {
            return;
          }
          setStatus("Обновляю статус жалобы...");
          await updateAdminReportStatus(report.id, "resolved", note);
          setStatus("Жалоба отмечена как решённая", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const dismissBtn = document.createElement("button");
      dismissBtn.type = "button";
      dismissBtn.className = "ghost";
      dismissBtn.textContent = "Отклонить";
      dismissBtn.addEventListener("click", async () => {
        try {
          const note = await promptDialog({
            title: "Почему жалоба отклонена?",
            value: report.resolutionNote || "",
            placeholder: "Причина отклонения",
            multiline: true,
            confirmText: "Отклонить"
          });
          if (note === null) {
            return;
          }
          setStatus("Отклоняю жалобу...");
          await updateAdminReportStatus(report.id, "dismissed", note);
          setStatus("Жалоба отклонена", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      const reopenBtn = document.createElement("button");
      reopenBtn.type = "button";
      reopenBtn.className = "ghost";
      reopenBtn.textContent = "Переоткрыть";
      reopenBtn.addEventListener("click", async () => {
        try {
          setStatus("Переоткрываю жалобу...");
          await updateAdminReportStatus(report.id, "open", "");
          setStatus("Жалоба снова открыта", "success");
        } catch (error) {
          setStatus(error.message, "error");
        }
      });

      if (report.status === "open") {
        actions.append(resolveBtn, dismissBtn);
      } else {
        actions.appendChild(reopenBtn);
      }

      card.append(copy, actions);
      return card;
    }

    function createAdminSupportPreviewCard(thread) {
      const card = document.createElement("article");
      card.className = "admin-result-card";

      const copy = document.createElement("div");
      copy.className = "admin-result-copy";

      const titleLine = document.createElement("div");
      titleLine.className = "admin-result-titleline";
      const title = document.createElement("h4");
      title.className = "admin-result-title";
      title.textContent = `@${thread?.user?.username || "unknown"}`;
      titleLine.appendChild(title);
      if (thread?.user?.isBanned) {
        titleLine.appendChild(createAdminBadge("ban", "is-danger"));
      }

      const subtitle = document.createElement("p");
      subtitle.className = "admin-result-subtitle muted";
      subtitle.textContent = formatDate(thread?.message?.createdAt);

      const note = document.createElement("p");
      note.className = "admin-result-note muted";
      note.textContent = String(thread?.message?.text || "").slice(0, 220) || "Без текста";

      const actions = document.createElement("div");
      actions.className = "admin-result-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "ghost";
      openBtn.textContent = "Открыть диалог";
      openBtn.addEventListener("click", () => {
        openSupportWorkspaceFromAdmin(thread?.user?.id).catch((error) => {
          setStatus(error.message, "error");
        });
      });

      if (thread?.user?.profilePath) {
        const profileBtn = document.createElement("button");
        profileBtn.type = "button";
        profileBtn.className = "ghost";
        profileBtn.textContent = "Профиль";
        profileBtn.addEventListener("click", () => {
          window.open(thread.user.profilePath, "_blank", "noopener,noreferrer");
        });
        actions.appendChild(profileBtn);
      }

      actions.appendChild(openBtn);
      copy.append(titleLine, subtitle, note);
      card.append(copy, actions);
      return card;
    }

    function createAdminOverviewCard(titleText, items, emptyText, action) {
      const card = document.createElement("section");
      card.className = "admin-overview-card";

      const title = document.createElement("h4");
      title.textContent = titleText;
      card.appendChild(title);

      if (!Array.isArray(items) || items.length === 0) {
        card.appendChild(createAdminEmptyState(emptyText));
      } else {
        const list = document.createElement("div");
        list.className = "admin-results-list";
        for (const item of items) {
          list.appendChild(item);
        }
        card.appendChild(list);
      }

      if (action) {
        const actions = document.createElement("div");
        actions.className = "admin-overview-actions";
        actions.appendChild(action);
        card.appendChild(actions);
      }

      return card;
    }

    function renderAdminCenter() {
      ensureAdminCenterState();
      const admin = getAdminCenterElements();
      if (!admin.card) {
        return;
      }

      const isAdmin = Boolean(state.user?.isAdmin);
      admin.card.classList.toggle("hidden", !isAdmin);
      if (!isAdmin) {
        return;
      }

      const stats = state.adminCenter.dashboard?.stats || null;
      const storageSnapshot = state.adminCenter.storage?.snapshot || null;
      if (admin.stats) {
        admin.stats.innerHTML = "";
        admin.stats.append(
          createAdminStatCard("Пользователи", stats?.usersCount || 0),
          createAdminStatCard("Забанено", stats?.bannedUsersCount || 0),
          createAdminStatCard("Админы", stats?.adminsCount || 0),
          createAdminStatCard("Треки", stats?.tracksCount || 0),
          createAdminStatCard("Биты", stats?.beatsCount || 0),
          createAdminStatCard("Альбомы", stats?.albumsCount || 0),
          createAdminStatCard("Жалобы", stats?.reportsOpenCount || 0, "Открытые"),
          createAdminStatCard("Поддержка", stats?.supportThreadsCount || 0, "Активные диалоги"),
          createAdminStatCard(
            "RAM свободно",
            storageSnapshot?.ram ? formatStorageBytes(storageSnapshot.ram.freeBytes) : "—",
            storageSnapshot?.ram ? `${formatStoragePercent(storageSnapshot.ram.percent)} занято` : "Системная память"
          ),
          createAdminStatCard(
            "Диск свободно",
            storageSnapshot?.disk ? formatStorageBytes(storageSnapshot.disk.freeBytes) : "—",
            storageSnapshot?.disk ? `${formatStoragePercent(storageSnapshot.disk.percent)} занято` : "Файловое хранилище"
          )
        );
      }

      for (const button of admin.tabButtons) {
        button.classList.toggle("active", button.dataset.adminCenterSection === state.adminCenter.section);
      }
      for (const panel of admin.panels) {
        panel.classList.toggle("hidden", panel.dataset.adminCenterPanel !== state.adminCenter.section);
      }

      if (admin.reportStatusFilter) {
        admin.reportStatusFilter.value = state.adminCenter.reportStatus || "open";
      }
      if (admin.reportSearchInput) {
        admin.reportSearchInput.value = state.adminCenter.reportQuery || "";
      }
      if (admin.userFilter) {
        admin.userFilter.value = state.adminCenter.userFilter || "all";
      }
      if (admin.userSearchInput) {
        admin.userSearchInput.value = state.adminCenter.userQuery || "";
      }
      if (admin.trackFilter) {
        admin.trackFilter.value = state.adminCenter.trackFilter || "all";
      }
      if (admin.trackSearchInput) {
        admin.trackSearchInput.value = state.adminCenter.trackQuery || "";
      }

      if (admin.overviewGrid) {
        admin.overviewGrid.innerHTML = "";

        const reportsAction = document.createElement("button");
        reportsAction.type = "button";
        reportsAction.className = "ghost";
        reportsAction.textContent = "Перейти к жалобам";
        reportsAction.addEventListener("click", () => setAdminCenterSection("reports"));

        const supportAction = document.createElement("button");
        supportAction.type = "button";
        supportAction.className = "ghost";
        supportAction.textContent = "Открыть поддержку";
        supportAction.addEventListener("click", () => setAdminCenterSection("support"));

        const usersAction = document.createElement("button");
        usersAction.type = "button";
        usersAction.className = "ghost";
        usersAction.textContent = "Открыть поиск пользователей";
        usersAction.addEventListener("click", () => setAdminCenterSection("users"));

        const tracksAction = document.createElement("button");
        tracksAction.type = "button";
        tracksAction.className = "ghost";
        tracksAction.textContent = "Открыть поиск треков";
        tracksAction.addEventListener("click", () => setAdminCenterSection("tracks"));

        const storageAction = document.createElement("button");
        storageAction.type = "button";
        storageAction.className = "ghost";
        storageAction.textContent = "Открыть память сервера";
        storageAction.addEventListener("click", () => setAdminCenterSection("storage"));

        admin.overviewGrid.append(
          createAdminOverviewCard(
            "Память и место на диске",
            storageSnapshot
              ? [
                  createAdminStatCard(
                    "RAM свободно",
                    formatStorageBytes(storageSnapshot.ram?.freeBytes || 0),
                    `${formatStoragePercent(storageSnapshot.ram?.percent || 0)} занято`
                  ),
                  createAdminStatCard(
                    "Диск свободно",
                    formatStorageBytes(storageSnapshot.disk?.freeBytes || 0),
                    `${formatStoragePercent(storageSnapshot.disk?.percent || 0)} занято`
                  ),
                  createAdminStatCard(
                    "Можно освободить",
                    formatStorageBytes(storageSnapshot.reclaimable?.totalBytes || 0),
                    "tmp, сиротские файлы, компактность JSON"
                  )
                ]
              : [],
            "Данные по памяти и диску пока не загрузились.",
            storageAction
          ),
          createAdminOverviewCard(
            "Свежие жалобы",
            (state.adminCenter.dashboard?.recentReports || []).slice(0, 3).map(createAdminReportCard),
            "Открытых жалоб пока нет.",
            reportsAction
          ),
          createAdminOverviewCard(
            "Последние обращения в поддержку",
            (state.supportThreads || []).slice(0, 3).map(createAdminSupportPreviewCard),
            "В поддержку пока никто не писал.",
            supportAction
          ),
          createAdminOverviewCard(
            "Недавно заблокированные аккаунты",
            (state.adminCenter.dashboard?.recentBannedUsers || []).slice(0, 3).map(createAdminUserCard),
            "Заблокированных аккаунтов сейчас нет.",
            usersAction
          ),
          createAdminOverviewCard(
            "Свежий контент",
            (state.adminCenter.dashboard?.recentTracks || []).slice(0, 3).map(createAdminTrackCard),
            "Новых треков пока нет.",
            tracksAction
          )
        );
      }

      if (admin.storagePanel) {
        admin.storagePanel.innerHTML = "";
        if (!storageSnapshot) {
          admin.storagePanel.appendChild(createAdminEmptyState("Не удалось загрузить данные по памяти и файловому хранилищу."));
        } else {
          const storageRoot = document.createElement("section");
          storageRoot.className = "admin-storage-root";

          const hero = document.createElement("section");
          hero.className = "admin-storage-hero";

          const heroCopy = document.createElement("div");
          heroCopy.className = "admin-storage-hero-copy";

          const heroTitle = document.createElement("h4");
          heroTitle.textContent = "Память сервера и очистка хранилища";

          const heroText = document.createElement("p");
          heroText.className = "muted";
          heroText.textContent = "Здесь мы следим за RAM и диском VDS. Управление затрагивает только файлы и JSON-хранилище Sfera: временные загрузки, сиротские медиа и компактность данных.";

          heroCopy.append(heroTitle, heroText);

          const health = document.createElement("div");
          health.className = "admin-storage-health";

          const diskStatus = document.createElement("span");
          diskStatus.className = `admin-storage-health-pill${storageSnapshot.health?.diskLow ? " is-warning" : ""}`;
          diskStatus.textContent = storageSnapshot.health?.diskLow
            ? "Диск почти заполнен"
            : "Диск под контролем";

          const ramStatus = document.createElement("span");
          ramStatus.className = `admin-storage-health-pill${storageSnapshot.health?.ramLow ? " is-warning" : ""}`;
          ramStatus.textContent = storageSnapshot.health?.ramLow
            ? "RAM на исходе"
            : "RAM стабильна";

          const generated = document.createElement("span");
          generated.className = "admin-storage-health-pill";
          generated.textContent = `Обновлено ${formatDate(storageSnapshot.generatedAt)}`;

          health.append(diskStatus, ramStatus, generated);
          hero.append(heroCopy, health);

          const metrics = document.createElement("div");
          metrics.className = "admin-storage-metrics";
          metrics.append(
            createAdminStorageMetric(
              "Оперативная память VDS",
              storageSnapshot.ram,
              `Node RSS ${formatStorageBytes(storageSnapshot.ram?.processRssBytes || 0)}`
            ),
            createAdminStorageMetric(
              "Диск с хранилищем Sfera",
              storageSnapshot.disk,
              storageSnapshot.disk?.path ? `Путь ${storageSnapshot.disk.path}` : "Путь хранилища"
            )
          );

          const breakdown = document.createElement("div");
          breakdown.className = "admin-storage-breakdown-grid";

          const foldersCard = document.createElement("section");
          foldersCard.className = "admin-storage-card";
          foldersCard.innerHTML = `
            <h4>Разбивка по папкам</h4>
            <div class="admin-storage-kv">
              <span>Данные JSON</span>
              <strong>${formatStorageBytes(storageSnapshot.directories?.dataBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Все uploads</span>
              <strong>${formatStorageBytes(storageSnapshot.directories?.uploadsBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Аудио</span>
              <strong>${formatStorageBytes(storageSnapshot.directories?.audioBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Обложки</span>
              <strong>${formatStorageBytes(storageSnapshot.directories?.coversBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Профили</span>
              <strong>${formatStorageBytes(storageSnapshot.directories?.profilesBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>tmp</span>
              <strong>${formatStorageBytes(storageSnapshot.directories?.tempBytes || 0)}</strong>
            </div>
          `;

          const reclaimCard = document.createElement("section");
          reclaimCard.className = "admin-storage-card";
          reclaimCard.innerHTML = `
            <h4>Можно освободить</h4>
            <div class="admin-storage-kv">
              <span>Временные файлы</span>
              <strong>${formatStorageBytes(storageSnapshot.reclaimable?.tempBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Сиротские медиа</span>
              <strong>${formatStorageBytes(storageSnapshot.reclaimable?.orphanMediaBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Сжатие JSON-хранилища</span>
              <strong>${formatStorageBytes(storageSnapshot.reclaimable?.compactableBytes || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Просроченные сессии</span>
              <strong>${storageSnapshot.reclaimable?.expiredSessionsCount || 0}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Просроченные email-токены</span>
              <strong>${storageSnapshot.reclaimable?.expiredEmailTokensCount || 0}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Итого потенциально</span>
              <strong>${formatStorageBytes(storageSnapshot.reclaimable?.totalBytes || 0)}</strong>
            </div>
          `;

          breakdown.append(foldersCard, reclaimCard);

          const actions = document.createElement("div");
          actions.className = "admin-storage-actions-grid";

          const runningAction = String(state.adminCenter.storage?.runningAction || "");
          actions.append(
            createAdminStorageActionCard({
              title: "Комплексная очистка",
              description: "Сразу проходит по tmp, удаляет старые сиротские файлы и сжимает JSON-хранилище. Это самый полезный режим, когда место на диске быстро заканчивается.",
              reclaimText: `Потенциально освободится до ${formatStorageBytes(storageSnapshot.reclaimable?.totalBytes || 0)}`,
              buttonText: "Очистить всё безопасно",
              actionName: "smart_cleanup",
              confirmTitle: "Запустить комплексную очистку?",
              confirmMessage: "Мы почистим старые временные файлы, удалим сиротские медиа и перепишем JSON-хранилище в более компактном виде. Живой контент затрагиваться не будет.",
              running: runningAction === "smart_cleanup",
              onRun: runAdminStorageAction
            }),
            createAdminStorageActionCard({
              title: "Удалить tmp",
              description: `Убирает временные файлы старше ${storageSnapshot.thresholds?.tempAgeMinutes || 30} минут: остатки загрузок и старые *.tmp рядом с JSON-файлами.`,
              reclaimText: `Сейчас в tmp можно убрать ${formatStorageBytes(storageSnapshot.reclaimable?.tempBytes || 0)}`,
              buttonText: "Очистить tmp",
              actionName: "cleanup_temp",
              confirmTitle: "Очистить временные файлы?",
              confirmMessage: "Будут удалены только временные файлы, которые достаточно старые и не должны участвовать в текущих загрузках.",
              running: runningAction === "cleanup_temp",
              onRun: runAdminStorageAction
            }),
            createAdminStorageActionCard({
              title: "Удалить сиротские файлы",
              description: "Проверяет audio, covers и profiles. Если файл давно не привязан ни к одному пользователю, треку или альбому, его можно безопасно убрать.",
              reclaimText: `Сейчас сиротскими считаются файлы на ${formatStorageBytes(storageSnapshot.reclaimable?.orphanMediaBytes || 0)}`,
              buttonText: "Почистить сироты",
              actionName: "cleanup_orphan_media",
              confirmTitle: "Удалить сиротские файлы?",
              confirmMessage: "Мы удалим только те медиафайлы, которые не используются ни одним пользователем, треком или альбомом и не выглядят как свежая загрузка.",
              running: runningAction === "cleanup_orphan_media",
              onRun: runAdminStorageAction
            }),
            createAdminStorageActionCard({
              title: "Сжать хранилище",
              description: "Переписывает JSON-файлы без лишних отступов, удаляет просроченные сессии, email-токены и старый mail outbox. Это ближайший аналог мягкого VACUUM для текущей архитектуры.",
              reclaimText: `Оценка экономии: ${formatStorageBytes(storageSnapshot.reclaimable?.compactableBytes || 0)}`,
              buttonText: "Сжать JSON-хранилище",
              actionName: "compact_storage",
              confirmTitle: "Сжать хранилище?",
              confirmMessage: "Мы не трогаем живой контент, только технически оптимизируем JSON-хранилище и очищаем просроченные служебные данные.",
              running: runningAction === "compact_storage",
              onRun: runAdminStorageAction
            })
          );

          const detailsCard = document.createElement("section");
          detailsCard.className = "admin-storage-card";
          detailsCard.innerHTML = `
            <h4>Технические детали</h4>
            <div class="admin-storage-kv">
              <span>Просроченные сессии</span>
              <strong>${storageSnapshot.maintenance?.expiredSessionsCount || 0}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Просроченные email-токены</span>
              <strong>${storageSnapshot.maintenance?.expiredEmailTokensCount || 0}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Старые письма в outbox</span>
              <strong>${(storageSnapshot.maintenance?.oldOutboxCount || 0) + (storageSnapshot.maintenance?.overflowOutboxCount || 0)}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Старые tmp-файлы</span>
              <strong>${storageSnapshot.maintenance?.staleTempFilesCount || 0}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Сиротские файлы</span>
              <strong>${storageSnapshot.maintenance?.orphanFilesCount || 0}</strong>
            </div>
            <div class="admin-storage-kv">
              <span>Недавно изменённые файлы мы не трогаем</span>
              <strong>${storageSnapshot.maintenance?.ignoredRecentOrphanCandidatesCount || 0}</strong>
            </div>
          `;

          const lastAction = state.adminCenter.storage?.lastAction || null;
          if (lastAction) {
            const lastActionCard = document.createElement("section");
            lastActionCard.className = "admin-storage-card admin-storage-last-action";
            lastActionCard.innerHTML = `
              <h4>Последнее действие</h4>
              <div class="admin-storage-kv">
                <span>Статус</span>
                <strong>${lastAction.message || "Готово"}</strong>
              </div>
              <div class="admin-storage-kv">
                <span>Освобождено</span>
                <strong>${formatStorageBytes(lastAction.freedBytes || 0)}</strong>
              </div>
              <div class="admin-storage-kv">
                <span>Удалено файлов</span>
                <strong>${lastAction.removedFilesCount || 0}</strong>
              </div>
              <div class="admin-storage-kv">
                <span>Когда</span>
                <strong>${formatDate(lastAction.completedAt)}</strong>
              </div>
            `;
            storageRoot.append(hero, metrics, breakdown, actions, detailsCard, lastActionCard);
          } else {
            storageRoot.append(hero, metrics, breakdown, actions, detailsCard);
          }
          admin.storagePanel.appendChild(storageRoot);
        }
      }

      if (admin.reportsList) {
        admin.reportsList.innerHTML = "";
        if (!state.adminCenter.reports.length) {
          admin.reportsList.appendChild(createAdminEmptyState("Жалоб по текущему фильтру пока нет."));
        } else {
          for (const report of state.adminCenter.reports) {
            admin.reportsList.appendChild(createAdminReportCard(report));
          }
        }
      }

      if (admin.usersList) {
        admin.usersList.innerHTML = "";
        if (!state.adminCenter.users.length) {
          admin.usersList.appendChild(createAdminEmptyState("Пользователи по текущему запросу не найдены."));
        } else {
          for (const user of state.adminCenter.users) {
            admin.usersList.appendChild(createAdminUserCard(user));
          }
        }
      }

      if (admin.tracksList) {
        admin.tracksList.innerHTML = "";
        if (!state.adminCenter.tracks.length) {
          admin.tracksList.appendChild(createAdminEmptyState("Треки по текущему запросу не найдены."));
        } else {
          for (const track of state.adminCenter.tracks) {
            admin.tracksList.appendChild(createAdminTrackCard(track));
          }
        }
      }

      if (admin.supportList) {
        admin.supportList.innerHTML = "";
        if (!state.supportThreads.length) {
          admin.supportList.appendChild(createAdminEmptyState("Активных обращений в поддержку сейчас нет."));
        } else {
          for (const thread of state.supportThreads) {
            admin.supportList.appendChild(createAdminSupportPreviewCard(thread));
          }
        }
      }
    }

    function ensureAdminCenterBindings() {
      if (adminCenterBindingsReady) {
        return;
      }
      adminCenterBindingsReady = true;

      const admin = getAdminCenterElements();

      admin.refreshBtn?.addEventListener("click", () => {
        refreshAdminCenterData({ force: true }).catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.openSupportBtn?.addEventListener("click", () => {
        openSupportWorkspaceFromAdmin().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.openSupportInlineBtn?.addEventListener("click", () => {
        openSupportWorkspaceFromAdmin().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      for (const button of admin.tabButtons) {
        button.addEventListener("click", () => {
          setAdminCenterSection(button.dataset.adminCenterSection || "overview");
        });
      }

      admin.reportStatusFilter?.addEventListener("change", () => {
        ensureAdminCenterState();
        state.adminCenter.reportStatus = admin.reportStatusFilter.value || "open";
        loadAdminReports().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.reportSearchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        ensureAdminCenterState();
        state.adminCenter.reportQuery = String(admin.reportSearchInput?.value || "").trim();
        loadAdminReports().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.userFilter?.addEventListener("change", () => {
        ensureAdminCenterState();
        state.adminCenter.userFilter = admin.userFilter.value || "all";
        loadAdminUsersSearch().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.userSearchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        ensureAdminCenterState();
        state.adminCenter.userQuery = String(admin.userSearchInput?.value || "").trim();
        loadAdminUsersSearch().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.trackFilter?.addEventListener("change", () => {
        ensureAdminCenterState();
        state.adminCenter.trackFilter = admin.trackFilter.value || "all";
        loadAdminTracksSearch().catch((error) => {
          setStatus(error.message, "error");
        });
      });

      admin.trackSearchForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        ensureAdminCenterState();
        state.adminCenter.trackQuery = String(admin.trackSearchInput?.value || "").trim();
        loadAdminTracksSearch().catch((error) => {
          setStatus(error.message, "error");
        });
      });
    }


    function renderListenHistory() {
      if (!elements.listenHistoryList) {
        return;
      }

      elements.listenHistoryList.innerHTML = "";

      if (!state.user) {
        const hint = document.createElement("p");
        hint.className = "muted";
        hint.textContent = t("historyNeedLogin");
        elements.listenHistoryList.appendChild(hint);
        return;
      }

      if (!Array.isArray(state.listenHistory) || state.listenHistory.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = t("historyEmpty");
        elements.listenHistoryList.appendChild(empty);
        return;
      }

      for (const item of state.listenHistory.slice(0, 5)) {
        const row = document.createElement("div");
        row.className = "history-item";

        const title = document.createElement("strong");
        title.textContent = `${item.title || t("trackFallbackTitle")} • @${item.username || "unknown"}`;

        const meta = document.createElement("p");
        const milestone = Number(item.milestone || 0);
        meta.className = "muted";
        meta.textContent = `${formatDate(item.listenedAt)} • ${t("historyMilestonePrefix")} ${milestone}%`;

        const actions = document.createElement("div");
        actions.className = "track-actions";

        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "ghost";
        openBtn.textContent = t("historyOpenTrack");
        openBtn.addEventListener("click", () => {
          goToTrackFromSearch(item.trackId, { autoplay: false, source: "history" });
        });

        actions.appendChild(openBtn);
        row.append(title, meta, actions);
        elements.listenHistoryList.appendChild(row);
      }
    }

    function renderSettings() {
      const promoCodeStatusInfo = document.getElementById("promoCodeStatusInfo");
      if (promoCodeStatusInfo) {
        if (state.user?.isAdmin) {
          const activatedAt = state.user.adminGrantedAt ? ` с ${formatDate(state.user.adminGrantedAt)}` : "";
          promoCodeStatusInfo.textContent = `Режим администратора активирован${activatedAt}`;
          promoCodeStatusInfo.classList.add("is-active");
        } else {
          promoCodeStatusInfo.textContent = "Некоторые промокоды открывают особые режимы аккаунта.";
          promoCodeStatusInfo.classList.remove("is-active");
        }
      }
      if (elements.siteLanguageSelect) {
        elements.siteLanguageSelect.value = normalizeUiLanguage(state.uiLanguage, DEFAULT_UI_LANGUAGE);
      }
      if (elements.uiDensitySelect) {
        elements.uiDensitySelect.value = normalizeUiDensity(state.uiDensity || loadSavedUiDensity());
      }
      renderFriends();
      renderMessages();
      ensureSupportBindings();
      renderSupportSection();
      ensureAdminCenterBindings();
      renderAdminCenter();
      if (state.user?.isAdmin && (!state.adminCenter?.loadedAt || Date.now() - state.adminCenter.loadedAt > 30 * 1000)) {
        refreshAdminCenterData({ force: true }).catch((error) => {
          setStatus(error.message, "error");
        });
      }
      if (!elements.contactPanel?.classList.contains("hidden")) {
        refreshSupportSectionData().catch((error) => {
          setStatus(error.message, "error");
        });
      }
      renderListenHistory();
    }


    async function saveLanguagePreference() {
      const selected = normalizeUiLanguage(elements.siteLanguageSelect?.value, DEFAULT_UI_LANGUAGE);
      applyUiLanguage(selected);

      if (!state.user) {
        setStatus(t("languageSaved"), "success");
        return;
      }

      await api("/api/profile/language", {
        method: "PUT",
        body: { language: selected }
      });
      await refreshMe();
      renderAll();
      setStatus(t("languageSaved"), "success");
    }

    function saveUiDensityPreference() {
      const selected = normalizeUiDensity(elements.uiDensitySelect?.value || "comfortable");
      applyUiDensity(selected);
      renderAll();
      setStatus(t("uiDensitySaved"), "success");
    }


    window.SferaMessagesModal = {
      openForUserId: openMessagesModalForUser,
      close: closeMessagesModal
    };

    return {
      createSimpleUserRow,
      buildUserControls,
      renderFriends,
      openSettingsSubscriptionsSection,
      openSupportWorkspace,
      renderMessages,
      openMessagesModalForUser,
      closeMessagesModal,
      renderListenHistory,
      renderSettings,
      saveLanguagePreference,
      saveUiDensityPreference
    };
  }

  window.SferaSettingsUi = { createAppSettingsUi };
})();
