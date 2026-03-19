(() => {
  "use strict";

  const ICONS = {
    bell: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M7 10a5 5 0 0 1 10 0v3.4l1.5 2.3a1 1 0 0 1-.84 1.55H6.34a1 1 0 0 1-.84-1.55L7 13.4Z'/><path d='M10 19a2 2 0 0 0 4 0'/></svg>",
    close: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M6 6l12 12M18 6 6 18'/></svg>",
    prev: "<svg viewBox='0 0 24 24' fill='currentColor'><rect x='5' y='5.5' width='2.6' height='13' rx='1.3'/><path d='M19 6.2v11.6c0 .66-.73 1.06-1.29.71l-8.22-5.8a.86.86 0 0 1 0-1.4l8.22-5.8A.86.86 0 0 1 19 6.2Z'/></svg>",
    play: "<svg viewBox='0 0 24 24' fill='currentColor'><path d='M8 5.9v12.2c0 .67.74 1.08 1.3.71l8.42-6.1a.86.86 0 0 0 0-1.44L9.3 5.18A.86.86 0 0 0 8 5.9Z'/></svg>",
    pause: "<svg viewBox='0 0 24 24' fill='currentColor'><rect x='7' y='5.5' width='3.2' height='13' rx='1.2'/><rect x='13.8' y='5.5' width='3.2' height='13' rx='1.2'/></svg>",
    next: "<svg viewBox='0 0 24 24' fill='currentColor'><rect x='16.4' y='5.5' width='2.6' height='13' rx='1.3'/><path d='M5 6.2v11.6c0 .66.73 1.06 1.29.71l8.22-5.8a.86.86 0 0 0 0-1.4L6.29 5.49A.86.86 0 0 0 5 6.2Z'/></svg>",
    stop: "<svg viewBox='0 0 24 24' fill='currentColor'><rect x='6.5' y='6.5' width='11' height='11' rx='2.2'/></svg>",
    shuffle: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M4.5 7h3.5c2.2 0 3.55.75 4.95 2.95l2.1 3.1c1.05 1.58 1.9 2.45 4.45 2.45H20'/><path d='m16.6 4 3.4 3-3.4 3'/><path d='M4.5 17H8c1.85 0 3.04-.5 4.2-2l1-1.46'/><path d='m16.6 14 3.4 3-3.4 3'/></svg>",
    repeat: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M7 7h10.5A2.5 2.5 0 0 1 20 9.5V10'/><path d='m16.7 4 3.3 3-3.3 3'/><path d='M17 17H6.5A2.5 2.5 0 0 1 4 14.5V14'/><path d='m7.3 20-3.3-3 3.3-3'/></svg>",
    "repeat-one": "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M6.5 7h11A2.5 2.5 0 0 1 20 9.5V10'/><path d='m16.7 4 3.3 3-3.3 3'/><path d='M17.5 17H6.5A2.5 2.5 0 0 1 4 14.5V14'/><path d='m7.3 20-3.3-3 3.3-3'/><circle cx='12' cy='12' r='3.1'/><path d='M12 10.2v3.6'/></svg>",
    like: "<svg viewBox='0 0 24 24' fill='currentColor'><path d='M9.2 10.15V19H6.8A1.8 1.8 0 0 1 5 17.2v-5.25a1.8 1.8 0 0 1 1.8-1.8ZM11.2 19V10.36l2.74-4.75A1.86 1.86 0 0 1 15.55 4c.79 0 1.43.64 1.43 1.43v2.52h1.57A2.45 2.45 0 0 1 21 10.4l-1.13 6.45A2.6 2.6 0 0 1 17.31 19Z'/></svg>",
    dislike: "<svg viewBox='0 0 24 24' fill='currentColor'><path d='M14.8 13.85V5H17.2A1.8 1.8 0 0 1 19 6.8v5.25a1.8 1.8 0 0 1-1.8 1.8ZM12.8 5v8.64l-2.74 4.75A1.86 1.86 0 0 1 8.45 20c-.79 0-1.43-.64-1.43-1.43v-2.52H5.45A2.45 2.45 0 0 1 3 13.6l1.13-6.45A2.6 2.6 0 0 1 6.69 5Z'/></svg>",
    comment: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M6.7 18.2 4 20V6.8A1.8 1.8 0 0 1 5.8 5h12.4A1.8 1.8 0 0 1 20 6.8v8.4a1.8 1.8 0 0 1-1.8 1.8H6.7Z'/></svg>",
    repost: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M7 8h10l-2.7-2.7'/><path d='M17 8 14.3 5.3'/><path d='M17 16H7l2.7 2.7'/><path d='M7 16l2.7 2.7'/><path d='M17 8a4 4 0 0 1 4 4'/><path d='M7 16a4 4 0 0 1-4-4'/></svg>",
    listen: "<svg viewBox='0 0 24 24' fill='currentColor'><rect x='4.5' y='11' width='2.6' height='7.5' rx='1.3'/><rect x='10.7' y='7.5' width='2.6' height='11' rx='1.3'/><rect x='16.9' y='4.5' width='2.6' height='14' rx='1.3'/></svg>",
    track: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M7 5.5h10'/><path d='M7 9.5h10'/><path d='M7 13.5h5.5'/><circle cx='16.9' cy='16.9' r='2.6'/><path d='M14.3 16.9V8.1l5.2-1.4v10.2'/></svg>",
    album: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><rect x='4.2' y='5' width='15.6' height='14' rx='3'/><circle cx='12' cy='12' r='3.2'/><circle cx='12' cy='12' r='1.1' fill='currentColor' stroke='none'/></svg>",
    beat: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M6 15.5V8.7'/><path d='M10 18V6'/><path d='M14 15.5V8.7'/><path d='M18 13V11.2'/><path d='M4.8 15.5h2.4'/><path d='M8.8 18h2.4'/><path d='M12.8 15.5h2.4'/><path d='M16.8 13h2.4'/></svg>",
    spark: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><path d='m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z'/><path d='M18.7 4.8v2.5'/><path d='M17.45 6.05h2.5'/><path d='M5.3 17.2v2.5'/><path d='M4.05 18.45h2.5'/></svg>",
    message: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><rect x='4.2' y='6.2' width='15.6' height='11.6' rx='2'/><path d='m5.5 8 6.5 4.8L18.5 8'/></svg>",
    user: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='8.2' r='3.2'/><path d='M5.5 18.5a6.5 6.5 0 0 1 13 0'/></svg>",
    heart: "<svg viewBox='0 0 24 24' fill='currentColor'><path d='M12 20.2 4.9 13.1a4.7 4.7 0 0 1 6.65-6.65L12 6.9l.45-.45a4.7 4.7 0 1 1 6.65 6.65Z'/></svg>",
    "chevron-down": "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>",
    "chevron-up": "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 15 6-6 6 6'/></svg>",
    lyrics: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M8 7h10'/><path d='M8 12h10'/><path d='M8 17h6'/><path d='M4.5 8h.01'/><path d='M4.5 13h.01'/><path d='M4.5 18h.01'/></svg>",
    rewind: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M10.5 7.2 6 12l4.5 4.8'/><path d='M17.5 7.2 13 12l4.5 4.8'/></svg>",
    forward: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'><path d='M13.5 7.2 18 12l-4.5 4.8'/><path d='M6.5 7.2 11 12l-4.5 4.8'/></svg>",
    volume: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M5 9.5h3.1L12 6v12l-3.9-3.5H5z'/><path d='M16 8.5a5 5 0 0 1 0 7'/><path d='M18.5 6a8.2 8.2 0 0 1 0 12'/></svg>",
    mute: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M5 9.5h3.1L12 6v12l-3.9-3.5H5z'/><path d='m16 9 5 6'/><path d='m21 9-5 6'/></svg>",
    eye: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z'/><circle cx='12' cy='12' r='2.7'/></svg>",
    'eye-off': "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.85' stroke-linecap='round' stroke-linejoin='round'><path d='M3.2 4.2 20.8 19.8'/><path d='M10.75 6.2A10.2 10.2 0 0 1 12 6c5.8 0 9.2 6 9.2 6a16.7 16.7 0 0 1-3.08 3.9'/><path d='M6.02 8.1A16.6 16.6 0 0 0 2.8 12s3.4 6 9.2 6a10 10 0 0 0 4.08-.84'/><path d='M9.9 9.9a3 3 0 0 0 4.2 4.2'/></svg>"
  };

  const EMOJI_PREFIX_MAP = [
    ["✉️", "message"],
    ["✉", "message"],
    ["🔔", "bell"],
    ["⏮", "prev"],
    ["▶", "play"],
    ["⏸", "pause"],
    ["⏭", "next"],
    ["⏹", "stop"],
    ["🔀", "shuffle"],
    ["🔂", "repeat-one"],
    ["🔁", "repost"],
    ["👍", "like"],
    ["👎", "dislike"],
    ["💬", "comment"],
    ["👂", "listen"],
    ["👤", "user"],
    ["✕", "close"],
    ["×", "close"],
    ["❤", "heart"],
    ["❤️", "heart"],
    ["♥", "heart"],
    ["▴", "chevron-up"],
    ["▾", "chevron-down"]
  ];

  const SIMPLE_TEXT_TAGS = new Set(["BUTTON", "SPAN", "DIV", "P", "A", "STRONG", "SMALL"]);
  let observer = null;
  let decorateScheduled = false;
  let isDecorating = false;
  const pendingRoots = new Set();

  function getIconMarkup(name) {
    return ICONS[name] || ICONS.message;
  }

  function mountIcon(node, name) {
    if (!node) {
      return null;
    }
    node.classList.add("sf-icon");
    node.setAttribute("aria-hidden", "true");
    node.dataset.icon = name;
    node.innerHTML = getIconMarkup(name);
    return node;
  }

  function createIcon(name, options = {}) {
    const node = document.createElement(options.tagName || "span");
    node.className = `sf-icon${options.className ? ` ${options.className}` : ""}`;
    return mountIcon(node, name);
  }

  function createTextNode(text, className) {
    const node = document.createElement("span");
    node.className = className;
    node.textContent = text;
    return node;
  }

  function createStat(iconName, text, options = {}) {
    const node = document.createElement(options.tagName || "span");
    node.className = `sf-stat${options.className ? ` ${options.className}` : ""}`;
    node.appendChild(createIcon(iconName, { className: options.iconClassName || "sf-icon--sm" }));
    if (text) {
      node.appendChild(createTextNode(text, options.textClassName || "sf-stat-label"));
    }
    return node;
  }

  function setButtonIcon(button, iconName, options = {}) {
    if (!button) {
      return null;
    }
    const label = String(options.label || "").trim();
    button.replaceChildren();
    button.classList.add("sf-icon-btn");
    if (!label) {
      button.classList.add("sf-icon-btn--icon-only");
    } else {
      button.classList.remove("sf-icon-btn--icon-only");
    }
    button.appendChild(createIcon(iconName, { className: options.iconClassName || "sf-icon--sm" }));
    if (label) {
      button.appendChild(createTextNode(label, options.labelClassName || "sf-icon-btn-label"));
    }
    return button;
  }

  function normalizeText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function resolveToken(tokenText) {
    const normalized = normalizeText(tokenText);
    if (!normalized) {
      return null;
    }
    for (const [prefix, iconName] of EMOJI_PREFIX_MAP) {
      if (!normalized.startsWith(prefix)) {
        continue;
      }
      const rest = normalizeText(normalized.slice(prefix.length));
      if (prefix === "▶") {
        return {
          icon: rest && /^[\d.,]+$/.test(rest) ? "listen" : "play",
          text: rest
        };
      }
      return {
        icon: iconName,
        text: rest
      };
    }
    return null;
  }

  function parseStatGroup(text) {
    const normalized = normalizeText(text);
    if (!normalized || !normalized.includes("•")) {
      return null;
    }
    const parts = normalized.split(/\s*•\s*/).map((part) => normalizeText(part)).filter(Boolean);
    if (parts.length < 2) {
      return null;
    }
    const parsed = parts.map((part) => resolveToken(part));
    if (parsed.some((item) => !item)) {
      return null;
    }
    return parsed;
  }

  function createStatGroup(items) {
    const wrap = document.createElement("span");
    wrap.className = "sf-stat-group";
    for (const item of items) {
      wrap.appendChild(createStat(item.icon, item.text));
    }
    return wrap;
  }

  function decoratePlainTextElement(node) {
    if (!node || !SIMPLE_TEXT_TAGS.has(node.tagName) || node.dataset.iconize === "off") {
      return;
    }
    if (node.closest("svg, script, style") || node.classList.contains("sf-icon")) {
      return;
    }
    const childElements = Array.from(node.children).filter((child) => !child.classList.contains("sf-icon"));
    if (childElements.length > 0) {
      return;
    }
    const rawText = Array.from(node.childNodes)
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent)
      .join(" ");
    const normalized = normalizeText(rawText);
    if (!normalized) {
      return;
    }

    const statGroup = parseStatGroup(normalized);
    if (statGroup) {
      node.replaceChildren(createStatGroup(statGroup));
      return;
    }

    const token = resolveToken(normalized);
    if (!token) {
      return;
    }

    if (node.tagName === "BUTTON" || node.classList.contains("ghost") || node.classList.contains("tab-btn")) {
      setButtonIcon(node, token.icon, { label: token.text });
      return;
    }

    if (!token.text) {
      node.replaceChildren(createIcon(token.icon, { className: "sf-icon--sm" }));
      return;
    }

    node.replaceChildren(createStat(token.icon, token.text, {
      className: "sf-inline-stat",
      iconClassName: "sf-icon--sm",
      textClassName: "sf-inline-stat-label"
    }));
  }

  function decorateRoot(root) {
    const rootEl = root && root.nodeType === Node.ELEMENT_NODE
      ? root
      : document.body;
    if (!rootEl) {
      return;
    }

    isDecorating = true;
    try {
      if (rootEl.matches?.("[data-icon]")) {
        mountIcon(rootEl, rootEl.dataset.icon);
      }
      rootEl.querySelectorAll?.("[data-icon]").forEach((node) => {
        mountIcon(node, node.dataset.icon);
      });

      if (SIMPLE_TEXT_TAGS.has(rootEl.tagName)) {
        decoratePlainTextElement(rootEl);
      }

      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ELEMENT);
      let current = walker.nextNode();
      while (current) {
        decoratePlainTextElement(current);
        current = walker.nextNode();
      }
    } finally {
      isDecorating = false;
    }
  }

  function flushDecorateQueue() {
    decorateScheduled = false;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    if (roots.length === 0) {
      decorateRoot(document.body);
      return;
    }
    roots.forEach((root) => decorateRoot(root));
  }

  function scheduleDecorate(root) {
    pendingRoots.add(root && root.nodeType === Node.ELEMENT_NODE ? root : document.body);
    if (decorateScheduled) {
      return;
    }
    decorateScheduled = true;
    const scheduler = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 16);
    scheduler(flushDecorateQueue);
  }

  function observe() {
    if (observer || !document.body || typeof MutationObserver !== "function") {
      return;
    }
    observer = new MutationObserver((mutations) => {
      if (isDecorating) {
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          scheduleDecorate(mutation.target?.parentElement || document.body);
          continue;
        }
        if (mutation.target) {
          scheduleDecorate(mutation.target);
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scheduleDecorate(node);
          }
        });
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  function init() {
    scheduleDecorate(document.body);
    observe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.SferaIconKit = {
    getIconMarkup,
    mountIcon,
    createIcon,
    createStat,
    createStatGroup,
    setButtonIcon,
    decorateRoot,
    scheduleDecorate
  };
})();
