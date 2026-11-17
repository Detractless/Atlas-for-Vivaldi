/* The Downloads sidebar is our own page, laid out like Chromium's (components/atlas/
   atlas-downloads-panel.html), registered as a web panel by the installer. Vivaldi's own
   "open the panel when a download starts" is switched off there, so this opens ours.
   Downloads that an extension starts (Atlas's own saves) stay quiet. */
var ATLAS_DL_PANEL = 'WEBPANEL_atlas_downloads';
var atlasDlOpening = false;

function atlasDownloadsPanelButton() {
  return document.querySelector('[data-name="' + ATLAS_DL_PANEL + '"]');
}

/* Vivaldi marks the panel whose content is visible with `.active` on the button's
   toolbar wrapper (state.openPanel === panel name). `.button-on` belongs to generic
   toolbar toggles and is never set on panel switches, so it cannot detect an open panel. */
function atlasDownloadsPanelShowing(button) {
  return !!button && (button.classList.contains('active') ||
    !!button.closest('.panel-clickoutside-ignore.active'));
}

function atlasPanelTransitioning(box) {
  if (!box || typeof box.getAnimations !== 'function') return false;
  try {
    return box.getAnimations({ subtree: true }).some(function (animation) {
      return animation.playState === 'running' || animation.playState === 'pending';
    });
  } catch (err) { return false; }
}

function atlasAfterPanelTransition(box, done) {
  var deadline = Date.now() + 1200;
  function check() {
    if (!atlasPanelTransitioning(box) || Date.now() >= deadline) { done(); return; }
    setTimeout(check, 50);
  }
  check();
}

function atlasDownloadsPanelUrl() {
  var extId = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) || "mpognobbkildjkofajifpdfhcoklimli";
  return "chrome-extension://" + extId + "/components/atlas/atlas-downloads-panel.html";
}

/* If the downloads webpanel navigated to another page, return it to its custom page. */
function atlasEnsureDownloadsUrl() {
  var target = atlasDownloadsPanelUrl();
  var box = document.getElementById("panels-container");
  if (!box) return;
  var views = box.querySelectorAll("webview");
  for (var i = 0; i < views.length; i++) {
    var src = views[i].getAttribute("src") || views[i].src || "";
    if (/\/components\/atlas\/atlas-downloads-panel\.html/.test(src)) return;
  }
  var activeView = box.querySelector(".webpanel.visible webview, webview");
  if (activeView) {
    var activeSrc = activeView.getAttribute("src") || activeView.src || "";
    if (!/\/components\/atlas\/atlas-downloads-panel\.html/.test(activeSrc)) {
      if (typeof activeView.setAttribute === "function") activeView.setAttribute("src", target);
      try { activeView.src = target; } catch (err) { /* webview setter may throw in mocked test DOM */ }
    }
  }
}

function atlasPressDownloadsPanel(button) {
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
    var Kind = type.indexOf('pointer') === 0 && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
    button.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, button: 0 }));
  });
}

function atlasOpenDownloadsPanel() {
  var button = atlasDownloadsPanelButton();
  var box = document.getElementById('panels-container');
  if (!button || !box || atlasDownloadsPanelShowing(button) || atlasDlOpening) return;

  atlasDlOpening = true;
  atlasPressDownloadsPanel(button);

  // A switch pressed during another panel's slide can be ignored. Wait for Vivaldi's
  // transition to settle, then retry only if its selected button still is not Downloads.
  setTimeout(function () {
    atlasAfterPanelTransition(box, function () {
      var currentButton = atlasDownloadsPanelButton();
      atlasEnsureDownloadsUrl();
      if (!currentButton || atlasDownloadsPanelShowing(currentButton)) { atlasDlOpening = false; return; }

      atlasPressDownloadsPanel(currentButton);
      setTimeout(function () {
        atlasAfterPanelTransition(box, function () {
          atlasEnsureDownloadsUrl();
          atlasDlOpening = false;
        });
      }, 300);
    });
  }, 300);
}

if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(function (item) {
    if (item && !item.byExtensionId) atlasOpenDownloadsPanel();
  });
  Atlas.openDownloadsPanel = atlasOpenDownloadsPanel;
}
