(() => {
  "use strict";

  const state = {
    queue: Promise.resolve(),
    root: null,
    backdrop: null,
    shell: null,
    panel: null,
    closeCurrent: null
  };

  function ensureRoot() {
    if (state.root) {
      return;
    }

    const root = document.createElement("div");
    root.id = "sferaDialogOverlay";
    root.className = "sfera-dialog-overlay hidden";
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = `
      <div class="sfera-dialog-backdrop" data-dialog-close="backdrop"></div>
      <div class="sfera-dialog-shell card" role="dialog" aria-modal="true" aria-labelledby="sferaDialogTitle">
        <div id="sferaDialogPanel" class="sfera-dialog-panel"></div>
      </div>
    `;

    document.body.appendChild(root);
    state.root = root;
    state.backdrop = root.querySelector(".sfera-dialog-backdrop");
    state.shell = root.querySelector(".sfera-dialog-shell");
    state.panel = root.querySelector("#sferaDialogPanel");

    root.addEventListener("click", (event) => {
      if (event.target === state.root || event.target === state.backdrop) {
        state.closeCurrent?.("cancel");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (!state.closeCurrent || state.root?.classList.contains("hidden")) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        state.closeCurrent("cancel");
      }
    });
  }

  function createIcon(name, className = "sf-icon--sm") {
    if (window.SferaIconKit?.createIcon) {
      return window.SferaIconKit.createIcon(name, { className });
    }
    const fallback = document.createElement("span");
    fallback.className = `sf-icon ${className}`;
    fallback.textContent = name === "close" ? "×" : "";
    return fallback;
  }

  function shouldKeepBodyLocked() {
    return Boolean(document.querySelector(
      "#authGateModal:not(.hidden), .messages-modal:not(.hidden), .notifications-modal:not(.hidden), .album-modal:not(.hidden), .sfera-dialog-overlay:not(.hidden)"
    ));
  }

  function syncBodyLock() {
    document.body.classList.toggle("modal-open", shouldKeepBodyLocked());
  }

  function queueDialog(factory) {
    const job = state.queue.then(() => factory(), () => factory());
    state.queue = job.catch(() => {});
    return job;
  }

  function openDialog(config) {
    return queueDialog(() => new Promise((resolve) => {
      ensureRoot();

      const {
        mode = "confirm",
        title = "Подтверждение",
        message = "",
        value = "",
        placeholder = "",
        confirmText = mode === "prompt" ? "Сохранить" : "ОК",
        cancelText = "Отмена",
        inputType = "text",
        multiline = false,
        danger = false,
        readOnly = false,
        selectValue = false
      } = config || {};

      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      state.panel.replaceChildren();
      state.shell.classList.toggle("is-danger", Boolean(danger));
      state.shell.classList.toggle("is-copy", mode === "copy");

      const head = document.createElement("div");
      head.className = "sfera-dialog-head";

      const titleWrap = document.createElement("div");
      titleWrap.className = "sfera-dialog-title-wrap";

      const kicker = document.createElement("span");
      kicker.className = "sfera-dialog-kicker";
      kicker.textContent = "SFERA";

      const titleNode = document.createElement("h3");
      titleNode.id = "sferaDialogTitle";
      titleNode.className = "sfera-dialog-title";
      titleNode.textContent = title;

      titleWrap.append(kicker, titleNode);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "ghost sfera-dialog-close sf-icon-btn sf-icon-btn--icon-only";
      closeBtn.setAttribute("aria-label", "Закрыть окно");
      closeBtn.appendChild(createIcon("close"));
      head.append(titleWrap, closeBtn);

      const body = document.createElement("div");
      body.className = "sfera-dialog-body";

      let inputNode = null;
      const messageNode = document.createElement("p");
      messageNode.className = "sfera-dialog-message";
      messageNode.textContent = message || "";
      messageNode.classList.toggle("hidden", !message);
      body.appendChild(messageNode);

      if (mode === "prompt" || mode === "copy") {
        if (multiline || mode === "copy") {
          inputNode = document.createElement("textarea");
          inputNode.rows = mode === "copy" ? 4 : 5;
        } else {
          inputNode = document.createElement("input");
          inputNode.type = inputType || "text";
        }
        inputNode.className = "sfera-dialog-field";
        inputNode.value = String(value || "");
        inputNode.placeholder = placeholder || "";
        inputNode.readOnly = Boolean(readOnly || mode === "copy");
        if (mode === "copy") {
          inputNode.setAttribute("aria-label", title);
          inputNode.spellcheck = false;
        }
        body.appendChild(inputNode);
      }

      const noteNode = document.createElement("p");
      noteNode.className = "sfera-dialog-note muted hidden";
      body.appendChild(noteNode);

      const actions = document.createElement("div");
      actions.className = "sfera-dialog-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "ghost";
      cancelBtn.textContent = cancelText;

      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = `sfera-dialog-confirm${danger ? " danger" : ""}`;
      confirmBtn.textContent = confirmText;

      let copyBtn = null;
      if (mode === "copy") {
        copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "ghost";
        copyBtn.textContent = "Скопировать";
        actions.append(copyBtn, confirmBtn);
      } else if (mode === "alert") {
        actions.append(confirmBtn);
      } else {
        actions.append(cancelBtn, confirmBtn);
      }

      state.panel.append(head, body, actions);

      let settled = false;
      const close = (kind) => {
        if (settled) {
          return;
        }
        settled = true;
        state.closeCurrent = null;
        state.root.classList.add("hidden");
        state.root.setAttribute("aria-hidden", "true");
        syncBodyLock();
        if (previousFocus && typeof previousFocus.focus === "function") {
          window.setTimeout(() => previousFocus.focus(), 0);
        }
        if (kind === "confirm") {
          if (mode === "prompt") {
            resolve(inputNode ? inputNode.value : "");
          } else {
            resolve(true);
          }
        } else if (mode === "prompt") {
          resolve(null);
        } else if (mode === "confirm") {
          resolve(false);
        } else {
          resolve(undefined);
        }
      };

      state.closeCurrent = close;

      closeBtn.addEventListener("click", () => close("cancel"));
      cancelBtn.addEventListener("click", () => close("cancel"));
      confirmBtn.addEventListener("click", () => close("confirm"));

      if (copyBtn) {
        copyBtn.addEventListener("click", async () => {
          const currentValue = String(inputNode?.value || "");
          if (!currentValue) {
            return;
          }
          if (navigator.clipboard?.writeText) {
            try {
              await navigator.clipboard.writeText(currentValue);
              noteNode.textContent = "Ссылка скопирована. Можно закрывать окно.";
              noteNode.classList.remove("hidden");
              if (typeof inputNode.focus === "function") {
                inputNode.focus();
                inputNode.select?.();
              }
              return;
            } catch {
              // manual copy fallback
            }
          }
          noteNode.textContent = "Браузер не дал скопировать автоматически. Текст выделен, скопируй его вручную.";
          noteNode.classList.remove("hidden");
          inputNode?.focus();
          inputNode?.select?.();
        });
      }

      if (inputNode && mode === "prompt") {
        inputNode.addEventListener("keydown", (event) => {
          const wantsSubmit = multiline
            ? (event.key === "Enter" && (event.metaKey || event.ctrlKey))
            : event.key === "Enter";
          if (wantsSubmit) {
            event.preventDefault();
            close("confirm");
          }
        });
      }

      state.root.classList.remove("hidden");
      state.root.setAttribute("aria-hidden", "false");
      syncBodyLock();

      window.requestAnimationFrame(() => {
        if (inputNode) {
          inputNode.focus();
          if (selectValue || mode === "copy" || readOnly) {
            inputNode.select?.();
          } else if (typeof inputNode.setSelectionRange === "function" && typeof inputNode.value === "string") {
            const end = inputNode.value.length;
            inputNode.setSelectionRange(end, end);
          }
        } else {
          confirmBtn.focus();
        }
      });
    }));
  }

  window.SferaDialogs = {
    alert(options = {}) {
      return openDialog({
        mode: "alert",
        confirmText: "ОК",
        ...options
      });
    },
    confirm(options = {}) {
      return openDialog({
        mode: "confirm",
        confirmText: "Подтвердить",
        cancelText: "Отмена",
        ...options
      });
    },
    prompt(options = {}) {
      return openDialog({
        mode: "prompt",
        confirmText: "Сохранить",
        cancelText: "Отмена",
        ...options
      });
    },
    copy(options = {}) {
      return openDialog({
        mode: "copy",
        confirmText: "Закрыть",
        ...options
      });
    }
  };
})();
