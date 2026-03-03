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
      createUserLinkNode,
      api,
      switchTab,
      setImageWithFallback,
      normalizeSearchQuery,
      goToTrackFromSearch,
      renderAll,
      refreshMe,
      loadConversation,
      toggleFollow
    } = deps;
    function createSimpleUserRow(user, controls) {
      const row = document.createElement("div");
      row.className = "simple-item simple-user-item";

      const avatar = document.createElement("img");
      avatar.className = "simple-user-avatar";
      avatar.alt = `@${user.username}`;
      setImageWithFallback(avatar, user.avatarUrl);

      const content = document.createElement("div");
      content.className = "simple-user-main";

      const name = document.createElement("strong");
      name.appendChild(createUserLinkNode(user.username, "user-link compact-link"));

      const info = document.createElement("p");
      info.className = "muted";
      info.textContent = user.bio || t("userBioFallback");

      content.append(name, info);
      row.append(avatar, content);

      if (controls) {
        row.appendChild(controls);
      }

      return row;
    }

    let messagesModalBound = false;

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
      text.textContent = message.text;

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
      if (elements.siteLanguageSelect) {
        elements.siteLanguageSelect.value = normalizeUiLanguage(state.uiLanguage, DEFAULT_UI_LANGUAGE);
      }
      if (elements.uiDensitySelect) {
        elements.uiDensitySelect.value = normalizeUiDensity(state.uiDensity || loadSavedUiDensity());
      }
      renderFriends();
      renderMessages();
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
