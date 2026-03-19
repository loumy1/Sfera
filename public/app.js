(() => {
const CHUNK_URLS = [
  "/assets/js/app/chunks/app.part01.js?v=20260319-explicit1",
  "/assets/js/app/chunks/app.part02.js?v=20260319-explicit1",
  "/assets/js/app/chunks/app.part03.js?v=20260319-explicit1",
  "/assets/js/app/chunks/app.part04.js?v=20260319-explicit1"
];

  async function loadSource() {
    const responses = await Promise.all(CHUNK_URLS.map((url) => fetch(url)));
    const sources = [];
    for (let i = 0; i < responses.length; i += 1) {
      const response = responses[i];
      if (!response.ok) {
        throw new Error(`Failed to load chunk: ${CHUNK_URLS[i]} (HTTP ${response.status})`);
      }
      sources.push(await response.text());
    }
    return sources.join("\n");
  }

  async function boot() {
    const source = await loadSource();
    const runner = new Function(source + "\n//# sourceURL=/assets/js/app/runtime.bundle.js");
    runner();
  }

  const bootPromise = boot().catch((error) => {
    console.error(error);
    const statusEl = document.getElementById("statusMessage");
    if (statusEl) {
      statusEl.textContent = "Ошибка загрузки интерфейса";
      statusEl.style.color = "#ef4444";
    }
  });

  window["__sferaAppBootPromise"] = bootPromise;
})();
