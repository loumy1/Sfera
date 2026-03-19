(() => {
  "use strict";

  const STORAGE_KEY = "sfera_intro_seen_v2";
  const MIN_VISIBLE_MS = 1900;
  const EXIT_ANIMATION_MS = 1040;
  const FAILSAFE_MS = 3800;
  const BOOT_PROMISE_KEYS = [
    "__sferaAppBootPromise",
    "__sferaPublicProfileBootPromise",
    "__sferaItemPageBootPromise"
  ];

  function delay(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function getBootPromise() {
    for (const key of BOOT_PROMISE_KEYS) {
      const candidate = window[key];
      if (candidate && typeof candidate.then === "function") {
        return Promise.resolve(candidate).catch(() => undefined);
      }
    }
    return null;
  }

  function waitForWindowLoad() {
    if (document.readyState === "complete") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      window.addEventListener("load", () => resolve(), { once: true });
    });
  }

  function shouldSkipIntro() {
    if (document.documentElement.classList.contains("site-intro-skip")) {
      return true;
    }
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function markSeen() {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore storage errors
    }
  }

  function finishIntro(overlay, immediate = false) {
    if (!overlay || overlay.dataset.introDone === "1") {
      return;
    }
    overlay.dataset.introDone = "1";
    document.body.classList.remove("site-intro-active");

    if (immediate) {
      overlay.remove();
      return;
    }

    overlay.classList.add("is-leaving");
    window.setTimeout(() => {
      overlay.remove();
    }, EXIT_ANIMATION_MS);
  }

  async function runIntro() {
    const overlay = document.getElementById("siteIntroOverlay");
    if (!overlay) {
      return;
    }

    if (shouldSkipIntro()) {
      finishIntro(overlay, true);
      return;
    }

    document.body.classList.add("site-intro-active");
    markSeen();

    const startedAt = Date.now();
    const bootPromise = getBootPromise();
    const readyPromise = Promise.race([
      bootPromise || waitForWindowLoad(),
      waitForWindowLoad(),
      delay(FAILSAFE_MS)
    ]);

    await readyPromise;
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_VISIBLE_MS) {
      await delay(MIN_VISIBLE_MS - elapsed);
    }

    finishIntro(overlay, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      runIntro().catch(() => undefined);
    }, { once: true });
  } else {
    runIntro().catch(() => undefined);
  }
})();
