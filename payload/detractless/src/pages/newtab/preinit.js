// src/pages/newtab/preinit.js — the new tab used to zoom itself here, before the first paint, to the UI scale
// setting. That setting is gone (nothing on the page is meant to scale any more), so all this does now is drop the
// copies it kept, and a new tab saved at another size opens at 100%.
// Theme is ../shared/themePreinit.js, which index.html loads before this file.
(function () {
  try {
    localStorage.removeItem('_scaleCache');
    localStorage.removeItem('uiScale');
  } catch (e) { /* no localStorage: nothing was kept */ }
})();
