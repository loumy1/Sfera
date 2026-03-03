(() => {
  "use strict";

  const root = document.getElementById("itemPageRoot");
  const statusEl = document.getElementById("itemPageStatus");
  const brandBetaEl = document.querySelector("header .brand-wrap > .brand-beta");
  const UI_LANGUAGE_STORAGE_KEY = "sfera_ui_language_v1";
  const LEGACY_UI_LANGUAGE_STORAGE_KEY = "trapdom_ui_language_v1";
  const BRAND_BETA_I18N = {
    ru: "бета-тест",
    en: "beta-test",
    zh: "测试版",
    uk: "бета-тест"
  };
  let statusFadeTimer = null;
  let statusClearTimer = null;
  let statusSeq = 0;

  const pageState = {
    pathInfo: null,
    currentUser: null,
    track: null,
    album: null,
    loading: false
  };

  function getStoredUiLanguage() {
    try {
      const value = String(
        window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)
          || window.localStorage.getItem(LEGACY_UI_LANGUAGE_STORAGE_KEY)
          || ""
      ).trim().toLowerCase();
      if (value === "en" || value === "zh" || value === "ru" || value === "uk") return value;
    } catch {
      // ignore
    }
    return "ru";
  }

  function applyItemChromeLanguage() {
    const lang = getStoredUiLanguage();
    document.documentElement.lang = lang;
    if (brandBetaEl) {
      brandBetaEl.textContent = BRAND_BETA_I18N[lang] || BRAND_BETA_I18N.ru;
    }
  }

  function setStatus(text, type = "info") {
    if (!statusEl) return;
    statusSeq += 1;
    const seq = statusSeq;
    if (statusFadeTimer) {
      clearTimeout(statusFadeTimer);
      statusFadeTimer = null;
    }
    if (statusClearTimer) {
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }
    statusEl.textContent = text || "";
    statusEl.classList.remove("error", "success", "is-fading");
    if (type === "error") statusEl.classList.add("error");
    if (type === "success") statusEl.classList.add("success");
    if (!text) {
      statusEl.classList.remove("is-visible");
      return;
    }
    statusEl.classList.add("is-visible");
    statusFadeTimer = setTimeout(() => {
      if (seq !== statusSeq) return;
      statusEl.classList.add("is-fading");
    }, 5000);
    statusClearTimer = setTimeout(() => {
      if (seq !== statusSeq) return;
      statusEl.textContent = "";
      statusEl.classList.remove("error", "success", "is-visible", "is-fading");
    }, 5600);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "дата неизвестна";
    }
    const lang = getStoredUiLanguage();
    const locale = lang === "uk" ? "uk-UA" : lang === "zh" ? "zh-CN" : lang === "en" ? "en-US" : "ru-RU";
    return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  }

  function formatDuration(totalSeconds) {
    const numeric = Number(totalSeconds);
    if (!Number.isFinite(numeric) || numeric < 0) return "0:00";
    const seconds = Math.floor(numeric);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  }

  function getDefaultCover() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600'%3E%3Crect width='600' height='600' fill='%23070b17'/%3E%3Ctext x='50%25' y='52%25' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' opacity='0.8' font-size='120' font-family='sans-serif'%3E🎵%3C/text%3E%3C/svg%3E";
  }

  function setImage(img, url) {
    img.src = url || getDefaultCover();
    img.addEventListener("error", () => {
      img.src = getDefaultCover();
    }, { once: true });
  }

  function trackSharePath(track) {
    if (track && typeof track.sharePath === "string" && track.sharePath) return track.sharePath;
    const prefix = String(track?.kind || "").toLowerCase() === "beat" ? "/b" : "/t";
    return `${prefix}/${encodeURIComponent(String(track?.id || ""))}`;
  }

  function apiErrorMessage(response, payload) {
    if (payload && typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
    return `HTTP ${response.status}`;
  }

  async function api(pathname, options = {}) {
    const response = await fetch(pathname, {
      credentials: "same-origin",
      method: options.method || "GET",
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const payload = isJson ? await response.json().catch(() => ({})) : null;

    if (!response.ok) {
      const error = new Error(apiErrorMessage(response, payload));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  }

  function createLinkButton(href, text) {
    const link = document.createElement("a");
    link.className = "ghost";
    link.href = href;
    link.textContent = text;
    return link;
  }

  function createGhostButton(text, onClick, opts = {}) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `ghost${opts.className ? ` ${opts.className}` : ""}`;
    btn.textContent = text;
    if (opts.disabled) btn.disabled = true;
    if (typeof onClick === "function") {
      btn.addEventListener("click", onClick);
    }
    return btn;
  }

  function renderTags(tags) {
    const wrap = document.createElement("div");
    wrap.className = "tag-wrap";
    if (!Array.isArray(tags)) return wrap;
    for (const tag of tags) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = `#${tag}`;
      wrap.appendChild(span);
    }
    return wrap;
  }

  function createMetaChip(label, value) {
    const chip = document.createElement("div");
    chip.className = "meta-chip";
    chip.innerHTML = `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value ?? "-")}`;
    return chip;
  }

  function createSkeletonLine(className = "meta") {
    const node = document.createElement("div");
    node.className = `skeleton-line ${className}`.trim();
    return node;
  }

  function createItemPageSkeletonComment() {
    const comment = document.createElement("div");
    comment.className = "skeleton-comment";
    comment.append(
      createSkeletonLine("title"),
      createSkeletonLine("meta"),
      createSkeletonLine("short")
    );
    return comment;
  }

  function renderItemPageSkeleton(section = "t") {
    if (!root) return;
    const isAlbum = section === "a";

    const head = document.createElement("div");
    head.className = "item-page-head";
    const headLeft = document.createElement("div");
    headLeft.className = "skeleton-list";
    headLeft.append(createSkeletonLine("title"), createSkeletonLine("meta"));
    const headRight = document.createElement("div");
    headRight.className = "skeleton-list";
    headRight.append(createSkeletonLine("short"), createSkeletonLine("short"));
    head.append(headLeft, headRight);

    const mainCard = document.createElement("div");
    mainCard.className = "card";
    const mainGrid = document.createElement("div");
    mainGrid.className = "item-page-grid";
    const cover = document.createElement("div");
    cover.className = "skeleton-card";
    cover.style.aspectRatio = "1 / 1";
    const content = document.createElement("div");
    content.className = "skeleton-list";
    content.append(
      createSkeletonLine("title"),
      createSkeletonLine("meta"),
      createSkeletonLine("meta"),
      createSkeletonLine("short")
    );
    mainGrid.append(cover, content);
    mainCard.appendChild(mainGrid);

    const cards = [head, mainCard];

    if (!isAlbum) {
      const actionsCard = document.createElement("div");
      actionsCard.className = "card";
      const actionsList = document.createElement("div");
      actionsList.className = "skeleton-list";
      actionsList.append(
        createSkeletonLine("title"),
        createSkeletonLine("meta")
      );
      actionsCard.appendChild(actionsList);
      cards.push(actionsCard);
    }

    const commentsCard = document.createElement("div");
    commentsCard.className = "card";
    const commentsTitle = createSkeletonLine("title");
    commentsTitle.style.width = "44%";
    commentsCard.appendChild(commentsTitle);
    const commentsList = document.createElement("div");
    commentsList.className = "item-page-comments-list";
    commentsList.append(
      createItemPageSkeletonComment(),
      createItemPageSkeletonComment(),
      createItemPageSkeletonComment()
    );
    commentsCard.appendChild(commentsList);
    cards.push(commentsCard);

    root.replaceChildren(...cards);
  }

  function parsePath() {
    const match = window.location.pathname.replace(/\/+$/, "").match(/^\/(t|b|a)\/([a-zA-Z0-9-]+)$/);
    if (!match) return null;
    return { section: match[1], id: decodeURIComponent(match[2]) };
  }

  function isAuthRequiredError(error) {
    return Number(error?.status) === 401;
  }

  async function loadCurrentUser() {
    try {
      const data = await api("/api/me");
      pageState.currentUser = data && data.user ? data.user : null;
    } catch (_error) {
      pageState.currentUser = null;
    }
  }

  async function loadTrackById(trackId, { silent = false } = {}) {
    if (!silent) setStatus("Загрузка...");
    const data = await api(`/api/tracks/${encodeURIComponent(trackId)}`);
    if (!data || !data.track) {
      throw new Error("Трек не найден");
    }
    pageState.track = data.track;
    pageState.album = null;
    renderTrackPage(data.track);
    if (!silent) setStatus("Готово", "success");
  }

  async function loadAlbumById(albumId, { silent = false } = {}) {
    if (!silent) setStatus("Загрузка...");
    const data = await api(`/api/albums/${encodeURIComponent(albumId)}`);
    if (!data || !data.album) {
      throw new Error("Альбом не найден");
    }
    pageState.album = data.album;
    pageState.track = null;
    renderAlbumPage(data.album);
    if (!silent) setStatus("Готово", "success");
  }

  async function reloadCurrentTrack({ silent = true } = {}) {
    if (!pageState.pathInfo || (pageState.pathInfo.section !== "t" && pageState.pathInfo.section !== "b")) {
      return;
    }
    await loadTrackById(pageState.pathInfo.id, { silent });
  }

  async function withAction(action, successMessage) {
    if (pageState.loading) return;
    pageState.loading = true;
    try {
      await action();
      if (successMessage) {
        setStatus(successMessage, "success");
      }
    } catch (error) {
      setStatus(error?.message || "Ошибка", "error");
      if (isAuthRequiredError(error)) {
        setStatus("Войди в аккаунт на главной странице, чтобы выполнить это действие", "error");
      }
    } finally {
      pageState.loading = false;
    }
  }

  async function handleTrackReaction(trackId, reaction) {
    await withAction(async () => {
      await api(`/api/tracks/${encodeURIComponent(trackId)}/${reaction}`, { method: "POST" });
      await reloadCurrentTrack({ silent: true });
    });
  }

  async function handleCommentReaction(trackId, commentId, reaction) {
    await withAction(async () => {
      await api(`/api/tracks/${encodeURIComponent(trackId)}/comments/${encodeURIComponent(commentId)}/${reaction}`, {
        method: "POST"
      });
      await reloadCurrentTrack({ silent: true });
    });
  }

  async function handleCommentCreate(trackId, text, parentCommentId = null) {
    const normalized = String(text || "").trim();
    if (normalized.length < 1 || normalized.length > 400) {
      throw new Error("Комментарий должен быть от 1 до 400 символов");
    }
    await api(`/api/tracks/${encodeURIComponent(trackId)}/comments`, {
      method: "POST",
      body: {
        text: normalized,
        ...(parentCommentId ? { parentCommentId } : {})
      }
    });
    await reloadCurrentTrack({ silent: true });
  }

  async function handleCommentDelete(trackId, commentId) {
    await withAction(async () => {
      await api(`/api/tracks/${encodeURIComponent(trackId)}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE"
      });
      await reloadCurrentTrack({ silent: true });
    });
  }

  function buildTrackHeader(track, isBeat) {
    const head = document.createElement("div");
    head.className = "item-page-head";

    const titleWrap = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = track.title || (isBeat ? "Бит" : "Трек");

    const sub = document.createElement("p");
    sub.className = "muted";
    sub.innerHTML = `${isBeat ? "Бит" : "Трек"} • <a class="user-link" href="/u/${encodeURIComponent(track.username)}">@${escapeHtml(track.username)}</a>`;

    titleWrap.append(h2, sub);

    const links = document.createElement("div");
    links.className = "item-page-links";
    links.append(
      createLinkButton("/", "На главную"),
      createLinkButton(`/u/${encodeURIComponent(track.username)}`, "Профиль автора")
    );

    head.append(titleWrap, links);
    return head;
  }

  function buildTrackMainCard(track) {
    const isBeat = String(track.kind || "") === "beat";
    const card = document.createElement("div");
    card.className = "card";

    const grid = document.createElement("div");
    grid.className = "item-page-grid";

    const cover = document.createElement("img");
    cover.className = "item-page-cover";
    cover.alt = `Обложка ${track.title || "релиза"}`;
    setImage(cover, track.coverUrl);

    const content = document.createElement("div");

    const metaGrid = document.createElement("div");
    metaGrid.className = "item-page-meta";
    metaGrid.append(
      createMetaChip("Жанр", track.genre || "-"),
      createMetaChip("Прослушивания", String(track.listensCount || 0)),
      createMetaChip("Лайки", String(track.likesCount || 0)),
      createMetaChip("Дизлайки", String(track.dislikesCount || 0)),
      createMetaChip("Комментарии", String(track.commentsCount || 0)),
      createMetaChip("Репосты", String(track.repostsCount || 0)),
      createMetaChip("Опубликовано", formatDate(track.createdAt))
    );

    if (isBeat) {
      metaGrid.append(
        createMetaChip("BPM", String(track.beatBpm || "-")),
        createMetaChip("Корневая нота", track.beatRootNote || "-")
      );
    } else {
      const authors = Array.isArray(track.authors) && track.authors.length > 0 ? track.authors.join(", ") : `@${track.username}`;
      const producers = Array.isArray(track.producers) && track.producers.length > 0 ? track.producers.join(", ") : "-";
      metaGrid.append(
        createMetaChip("Авторы", authors),
        createMetaChip("Продюсеры", producers)
      );
    }

    const audio = document.createElement("audio");
    audio.className = "item-page-audio";
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = track.audioUrl;

    const desc = document.createElement("p");
    desc.className = "item-page-desc";
    desc.textContent = track.description || "Без описания";

    content.append(metaGrid, audio, desc, renderTags(track.hashtags || []));

    if (isBeat) {
      const licensesTitle = document.createElement("p");
      licensesTitle.className = "muted";
      licensesTitle.style.marginTop = "0.6rem";
      licensesTitle.textContent = "Лицензии и цены";
      content.appendChild(licensesTitle);

      const licensesWrap = document.createElement("div");
      licensesWrap.className = "item-page-license-list";
      const licenses = Array.isArray(track.beatLicenses) ? track.beatLicenses : [];

      if (licenses.length === 0) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "Лицензии не указаны. Напиши владельцу в личные сообщения.";
        licensesWrap.appendChild(empty);
      } else {
        for (const license of licenses) {
          const row = document.createElement("div");
          row.className = "item-page-license-chip";
          const type = document.createElement("span");
          type.textContent = String(license.type || "license");
          const price = document.createElement("strong");
          const amount = Number.isFinite(Number(license.price)) ? Number(license.price) : 0;
          const currency = String(license.currency || "RUB").toUpperCase();
          price.textContent = `${amount} ${currency === "USD" ? "$" : "₽"}`;
          row.append(type, price);
          licensesWrap.appendChild(row);
        }
      }

      const hint = document.createElement("p");
      hint.className = "muted";
      hint.style.marginTop = "0.5rem";
      hint.textContent = "Для покупки/получения бита напиши владельцу в личные сообщения в основном приложении.";
      content.append(licensesWrap, hint);
    }

    grid.append(cover, content);
    card.appendChild(grid);
    return card;
  }

  function buildTrackActionsCard(track) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = "Реакции";
    card.appendChild(title);

    const bar = document.createElement("div");
    bar.className = "item-page-actions-bar";

    const likeBtn = createGhostButton(`👍 ${track.likesCount || 0}`, () => {
      handleTrackReaction(track.id, "like");
    }, {
      className: `item-page-action-btn${track.liked ? " active" : ""}`
    });

    const dislikeBtn = createGhostButton(`👎 ${track.dislikesCount || 0}`, () => {
      handleTrackReaction(track.id, "dislike");
    }, {
      className: `item-page-action-btn${track.disliked ? " active" : ""}`
    });

    const commentsInfo = document.createElement("span");
    commentsInfo.className = "muted";
    commentsInfo.textContent = `💬 ${track.commentsCount || 0}`;

    const repostsInfo = document.createElement("span");
    repostsInfo.className = "muted";
    repostsInfo.textContent = `🔁 ${track.repostsCount || 0}`;

    const listensInfo = document.createElement("span");
    listensInfo.className = "muted";
    listensInfo.textContent = `▶ ${track.listensCount || 0}`;

    const copyLinkBtn = createGhostButton("Скопировать ссылку", async () => {
      const sharePath = trackSharePath(track);
      const url = `${window.location.origin}${sharePath}`;
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Ссылка скопирована", "success");
      } catch {
        window.prompt("Скопируй ссылку", url);
      }
    });
    const shareBtn = createGhostButton("Поделиться ссылкой", async () => {
      const sharePath = trackSharePath(track);
      const url = `${window.location.origin}${sharePath}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: String(track?.title || "Трек"),
            text: track?.username ? `@${track.username}` : "",
            url
          });
          setStatus("Ссылка готова для отправки", "success");
          return;
        } catch (error) {
          if (error && String(error.name || "") === "AbortError") {
            return;
          }
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Ссылка скопирована", "success");
      } catch {
        window.prompt("Скопируй ссылку", url);
      }
    });

    bar.append(likeBtn, dislikeBtn, copyLinkBtn, shareBtn, commentsInfo, repostsInfo, listensInfo);
    card.appendChild(bar);

    if (!pageState.currentUser) {
      const hint = document.createElement("p");
      hint.className = "muted";
      hint.style.marginTop = "0.55rem";
      hint.textContent = "Для лайков и комментариев войди в аккаунт на главной странице.";
      card.appendChild(hint);
    }

    return card;
  }

  function createCommentForm({ trackId, parentCommentId = null, placeholder, submitLabel, onCancel = null }) {
    const form = document.createElement("form");
    form.className = "item-page-comment-form";

    const textarea = document.createElement("textarea");
    textarea.maxLength = 400;
    textarea.placeholder = placeholder || "Напиши комментарий...";
    textarea.required = true;

    const actions = document.createElement("div");
    actions.className = "item-page-comment-form-actions";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.textContent = submitLabel || "Отправить";

    actions.appendChild(submitBtn);

    if (typeof onCancel === "function") {
      const cancelBtn = createGhostButton("Отмена", (event) => {
        event.preventDefault();
        onCancel();
      });
      actions.appendChild(cancelBtn);
    }

    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = "До 400 символов";
    actions.appendChild(hint);

    form.append(textarea, actions);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = String(textarea.value || "").trim();
      await withAction(async () => {
        await handleCommentCreate(trackId, text, parentCommentId);
      }, "Комментарий добавлен");
    });

    return form;
  }

  function renderCommentNode(comment, trackId, depth = 0) {
    const node = document.createElement("div");
    node.className = `item-page-comment${depth > 0 ? " reply" : ""}`;

    const head = document.createElement("div");
    head.className = "item-page-comment-head";

    const meta = document.createElement("div");
    meta.className = "item-page-comment-meta";

    const userLink = document.createElement("a");
    userLink.className = "user-link";
    userLink.href = `/u/${encodeURIComponent(comment.username)}`;
    userLink.textContent = `@${comment.username}`;

    const dateNode = document.createElement("span");
    dateNode.className = "muted";
    dateNode.textContent = formatDate(comment.createdAt);

    meta.append(userLink, dateNode);

    if (comment.likedByAuthor) {
      const authorBadge = document.createElement("span");
      authorBadge.className = "item-page-comment-author-like";
      if (comment.authorBadgeAvatarUrl) {
        const avatar = document.createElement("img");
        avatar.alt = "Автор";
        setImage(avatar, comment.authorBadgeAvatarUrl);
        authorBadge.appendChild(avatar);
      }
      const heart = document.createElement("span");
      heart.textContent = "❤ от автора";
      authorBadge.appendChild(heart);
      meta.appendChild(authorBadge);
    }

    head.appendChild(meta);
    node.appendChild(head);

    const textNode = document.createElement("p");
    textNode.className = "item-page-comment-text";
    textNode.textContent = comment.text || "";
    node.appendChild(textNode);

    const actions = document.createElement("div");
    actions.className = "item-page-comment-actions";

    const likeBtn = createGhostButton(`👍 ${comment.likesCount || 0}`, () => {
      handleCommentReaction(trackId, comment.id, "like");
    }, {
      className: comment.liked ? "item-page-action-btn active" : "item-page-action-btn"
    });

    const dislikeBtn = createGhostButton(`👎 ${comment.dislikesCount || 0}`, () => {
      handleCommentReaction(trackId, comment.id, "dislike");
    }, {
      className: comment.disliked ? "item-page-action-btn active" : "item-page-action-btn"
    });

    actions.append(likeBtn, dislikeBtn);

    let replyWrap = null;
    if (pageState.currentUser) {
      replyWrap = document.createElement("div");
      replyWrap.className = "hidden";

      const replyBtn = createGhostButton("Ответить", () => {
        replyWrap.classList.toggle("hidden");
      });
      actions.appendChild(replyBtn);

      replyWrap.appendChild(createCommentForm({
        trackId,
        parentCommentId: comment.id,
        placeholder: `Ответ для @${comment.username}`,
        submitLabel: "Отправить ответ",
        onCancel: () => replyWrap.classList.add("hidden")
      }));
      node.appendChild(replyWrap);
    }

    if (comment.canDelete) {
      const delBtn = createGhostButton("Удалить", async () => {
        const confirmed = window.confirm("Удалить комментарий?");
        if (!confirmed) return;
        await handleCommentDelete(trackId, comment.id);
      });
      actions.appendChild(delBtn);
    }

    node.appendChild(actions);

    const replies = Array.isArray(comment.replies) ? comment.replies : [];
    if (replies.length > 0) {
      const repliesWrap = document.createElement("div");
      repliesWrap.className = "item-page-replies";
      for (const reply of replies) {
        repliesWrap.appendChild(renderCommentNode(reply, trackId, depth + 1));
      }
      node.appendChild(repliesWrap);
    }

    return node;
  }

  function buildCommentsCard(track) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = `Комментарии (${track.commentsCount || 0})`;
    card.appendChild(title);

    const wrap = document.createElement("div");
    wrap.className = "item-page-comments-wrap";

    if (pageState.currentUser) {
      wrap.appendChild(createCommentForm({
        trackId: track.id,
        placeholder: "Напиши комментарий...",
        submitLabel: "Отправить"
      }));
    } else {
      const guestHint = document.createElement("p");
      guestHint.className = "muted";
      guestHint.textContent = "Чтобы оставить комментарий, войди в аккаунт на главной странице.";
      wrap.appendChild(guestHint);
    }

    const list = document.createElement("div");
    list.className = "item-page-comments-list";
    const comments = Array.isArray(track.comments) ? track.comments : [];

    if (comments.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "Пока комментариев нет.";
      list.appendChild(empty);
    } else {
      for (const comment of comments) {
        list.appendChild(renderCommentNode(comment, track.id, 0));
      }
    }

    wrap.appendChild(list);
    card.appendChild(wrap);
    return card;
  }

  function renderTrackPage(track) {
    document.title = `sfera • ${track.title}`;
    const isBeat = String(track.kind || "") === "beat";

    const head = buildTrackHeader(track, isBeat);
    const mainCard = buildTrackMainCard(track);
    const actionsCard = buildTrackActionsCard(track);
    const commentsCard = buildCommentsCard(track);

    root.replaceChildren(head, mainCard, actionsCard, commentsCard);
  }

  function renderAlbumPage(album) {
    document.title = `sfera • Альбом • ${album.title}`;

    const head = document.createElement("div");
    head.className = "item-page-head";
    const titleWrap = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = album.title || "Альбом";
    const sub = document.createElement("p");
    sub.className = "muted";
    sub.innerHTML = `Альбом • <a class="user-link" href="/u/${encodeURIComponent(album.username)}">@${escapeHtml(album.username)}</a>`;
    titleWrap.append(h2, sub);

    const links = document.createElement("div");
    links.className = "item-page-links";
    links.append(
      createLinkButton("/", "На главную"),
      createLinkButton(`/u/${encodeURIComponent(album.username)}`, "Профиль автора")
    );
    head.append(titleWrap, links);

    const card = document.createElement("div");
    card.className = "card";

    const grid = document.createElement("div");
    grid.className = "item-page-grid";

    const cover = document.createElement("img");
    cover.className = "item-page-cover";
    cover.alt = `Обложка альбома ${album.title || ""}`;
    setImage(cover, album.coverUrl);

    const content = document.createElement("div");
    const metaGrid = document.createElement("div");
    metaGrid.className = "item-page-meta";
    metaGrid.append(
      createMetaChip("Жанр", album.genre || "-"),
      createMetaChip("Треков", String(album.tracksCount || (Array.isArray(album.tracks) ? album.tracks.length : 0))),
      createMetaChip("Опубликовано", formatDate(album.createdAt))
    );

    const desc = document.createElement("p");
    desc.className = "item-page-desc";
    desc.textContent = album.description || "Без описания";

    const authorsInfo = document.createElement("p");
    authorsInfo.className = "muted";
    const authors = Array.isArray(album.authors) && album.authors.length > 0 ? album.authors.join(", ") : `@${album.username}`;
    const producers = Array.isArray(album.producers) && album.producers.length > 0 ? album.producers.join(", ") : "-";
    authorsInfo.textContent = `Авторы: ${authors} • Продюсеры: ${producers}`;

    content.append(metaGrid, desc, authorsInfo, renderTags(album.hashtags || []));

    grid.append(cover, content);
    card.appendChild(grid);

    const trackListCard = document.createElement("div");
    trackListCard.className = "card";
    const listTitle = document.createElement("h3");
    listTitle.textContent = "Треклист";
    trackListCard.appendChild(listTitle);

    const listWrap = document.createElement("div");
    listWrap.className = "item-page-tracklist";

    const tracks = Array.isArray(album.tracks) ? album.tracks : [];
    if (tracks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "В этом альбоме пока нет доступных треков.";
      listWrap.appendChild(empty);
    } else {
      for (const track of tracks) {
        const row = document.createElement("div");
        row.className = "item-page-track-row";

        const rowHead = document.createElement("div");
        rowHead.className = "item-page-track-row-head";

        const title = document.createElement("strong");
        const link = document.createElement("a");
        link.className = "track-title-link compact-link";
        link.href = track.sharePath || trackSharePath(track);
        link.textContent = track.title || "Трек";
        title.appendChild(link);

        const meta = document.createElement("span");
        meta.className = "muted";
        meta.textContent = `@${track.username || album.username}${track.durationSec ? ` • ${formatDuration(track.durationSec)}` : ""}`;

        rowHead.append(title, meta);
        row.appendChild(rowHead);

        if (track.audioUrl) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "none";
          audio.src = track.audioUrl;
          row.appendChild(audio);
        }

        listWrap.appendChild(row);
      }
    }

    trackListCard.appendChild(listWrap);
    root.replaceChildren(head, card, trackListCard);
  }

  async function init() {
    if (!root) return;
    applyItemChromeLanguage();
    pageState.pathInfo = parsePath();

    if (!pageState.pathInfo) {
      setStatus("Неверный адрес страницы", "error");
      root.innerHTML = "<p class='muted'>Неверный адрес страницы.</p>";
      return;
    }

    try {
      setStatus("Загрузка...");
      renderItemPageSkeleton(pageState.pathInfo.section);
      await loadCurrentUser();

      if (pageState.pathInfo.section === "a") {
        await loadAlbumById(pageState.pathInfo.id, { silent: true });
      } else {
        await loadTrackById(pageState.pathInfo.id, { silent: true });
      }

      setStatus("Готово", "success");
    } catch (error) {
      setStatus(error.message || "Ошибка загрузки", "error");
      root.innerHTML = `<p class="muted">${escapeHtml(error.message || "Ошибка загрузки")}</p>`;
    }
  }

  init();
})();
