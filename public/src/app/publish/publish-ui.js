(() => {
  "use strict";

  function createAppPublishUi(ctx) {
    const helperApi = window.SferaPublishHelpers.createAppPublishHelpers(ctx);
    const albumApi = window.SferaPublishAlbum.createAppPublishAlbum({
      ...ctx,
      deps: { ...(ctx?.deps || {}), ...helperApi }
    });
    const formsApi = window.SferaPublishForms.createAppPublishForms({
      ...ctx,
      deps: { ...(ctx?.deps || {}), ...helperApi, ...albumApi }
    });
    return { ...helperApi, ...albumApi, ...formsApi };
  }

  window.SferaPublishUi = { createAppPublishUi };
})();
