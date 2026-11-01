/* The Downloads sidebar is our own page, laid out like Chromium's (components/atlas/
   downloads-panel.html), registered as a web panel by the installer. Vivaldi's own
   "open the panel when a download starts" is switched off there, so this opens ours:
   when a download starts, press the panel's switch button, unless it is already showing.
   Downloads that an extension starts (Atlas's own saves) stay quiet. */
var ATLAS_DL_PANEL = 'WEBPANEL_atlas_downloads';
var atlasDlOpening = false;

function atlasDownloadsPanelShowing() {
  var view = document.querySelector('#panels-container webview[src*="downloads-panel.html"]');
  return !!view && view.getBoundingClientRect().width > 0;
}

function atlasOpenDownloadsPanel() {
  var button = document.querySelector('[data-name="' + ATLAS_DL_PANEL + '"]');
  if (!button || atlasDlOpening || atlasDownloadsPanelShowing()) return;
  atlasDlOpening = true;
  setTimeout(function () { atlasDlOpening = false; }, 400);
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
    var Kind = type.indexOf('pointer') === 0 ? PointerEvent : MouseEvent;
    button.dispatchEvent(new Kind(type, { bubbles: true, cancelable: true, composed: true, button: 0 }));
  });
}

if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.onCreated) {
  chrome.downloads.onCreated.addListener(function (item) {
    if (item && !item.byExtensionId) atlasOpenDownloadsPanel();
  });
  Atlas.openDownloadsPanel = atlasOpenDownloadsPanel;
}
