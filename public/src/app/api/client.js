(() => {
  "use strict";

  function isNotFoundError(error) {
    return Number(error?.status) === 404 || /404/.test(String(error?.message || ""));
  }

  async function fetchJsonWithInit(path, init) {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function apiCompatPaths(path) {
    const paths = [path];

    if (path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
      paths.push(`/api/auth/${path.slice("/api/".length)}`);
    }

    return paths;
  }

  async function api(path, options = {}) {
    const init = {
      method: options.method || "GET",
      headers: {}
    };

    if (options.body !== undefined) {
      if (options.body instanceof FormData) {
        init.body = options.body;
      } else {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
      }
    }

    const candidatePaths = apiCompatPaths(path);
    const lastCandidatePath = candidatePaths[candidatePaths.length - 1];
    let lastError = null;

    for (const candidatePath of candidatePaths) {
      const { response, data } = await fetchJsonWithInit(candidatePath, init);

      if (response.ok) {
        return data;
      }

      const error = new Error(data.error || `Ошибка ${response.status} (${candidatePath})`);
      error.status = response.status;
      error.path = candidatePath;
      lastError = error;

      if (response.status === 404 && candidatePath !== lastCandidatePath) {
        continue;
      }

      throw error;
    }

    throw lastError || new Error(`Ошибка запроса (${path})`);
  }


  window.SferaApiClient = {
    isNotFoundError,
    api
  };
})();
