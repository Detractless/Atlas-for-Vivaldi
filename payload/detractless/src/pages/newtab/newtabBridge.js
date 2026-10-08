// New-tab side of requests the toolbar menu sends (the bundle only knows
// "open-settings"). "Add page or bookmark" clicks the hidden add button that
// initBookmarkAddModal already wires. A fresh tab opened with ?add=1 does the
// same once the page has finished starting.
(function () {
  function openAdd() {
    const b = document.getElementById("global-add-btn");
    if (b) b.click();
  }
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.atlas && msg.atlas.act === "open-add") {
        openAdd();
        if (sendResponse) sendResponse({ ok: true });
      }
    });
  } catch (e) { /* not an extension page (no chrome.runtime): nothing to listen to */ }
  if (new URLSearchParams(location.search).has("add")) {
    window.addEventListener("load", () => setTimeout(openAdd, 400));
  }
})();
