/* The Downloads sidebar is our own page, laid out like Chromium's (components/atlas/
   atlas-downloads-panel.html), registered as a web panel by the installer. Vivaldi's own
   "open the panel when a download starts" is switched off there, so this opens ours:
   when a download starts, press the panel's switch button, unless it is already showing.
   Downloads that an extension starts (Atlas's own saves) stay quiet. */
var ATLAS_DL_PANEL = 'WEBPANEL_atlas_downloads';
var atlasDlOpening = false;

function atlasDownloadsPanelShowing() {
  var views = document.querySelectorAll('#panels-container webview'), i, widest = 0, active = null;
  for (i = 0; i < views.length; i++) {
    var width = views[i].getBoundingClientRect().width;
    if (width > widest) { widest = width; active = views[i]; }
  }
  return !!active && (active.getAttribute('src') || '').indexOf('atlas-downloads-panel.html') >= 0;
}

function atlasOpenDownloadsPanel(retried) {
  var button = document.querySelector('[data-name="' + ATLAS_DL_PANEL + '"]');
  if (!button || atlasDownloadsPanelShowing()) return;
  if (!retried && atlasDlOpening) return;
  atlasDlOpening = true;
  setTimeout(function () { atlasDlOpening = false; }, 400);
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
    var Kind = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
    button.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, button: 0 }));
  });
  // A switch pressed while another panel's 220 ms slide is running is ignored, so if
  // the panel is still not showing after the slide, press it once more.
  if (retried) return;
  setTimeout(function () {
    if (!atlasDownloadsPanelShowing()) atlasOpenDownloadsPanel(true);
  }, 300);
}

if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(function (item) {
    if (item && !item.byExtensionId) atlasOpenDownloadsPanel();
  });
  Atlas.openDownloadsPanel = atlasOpenDownloadsPanel;
}
