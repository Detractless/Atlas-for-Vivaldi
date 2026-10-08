/* ── 08-reload-helper.js: Reload button enabler on internal and extension pages ── */

var RELOADABLE = /^(chrome|vivaldi|chrome-extension):/;

function reloadTarget(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
    var t = ts && ts[0];
    cb(t && RELOADABLE.test(t.url || '') ? t : null);
  });
}

function checkReloadButton() {
  var btn = document.querySelector ? document.querySelector('.ToolbarButton-Button[data-name="Reload"]') : null;
  if (!btn || !btn.disabled) return;
  reloadTarget(function (t) {
    if (!t) return;
    btn.disabled = false;
    btn.removeAttribute('disabled');
    if (!btn.title) btn.title = 'Reload current page (Ctrl+R)';
  });
}

if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(function () { setTimeout(checkReloadButton, 100); });
}
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (id, info) {
    if (info.status === 'complete' || info.url) setTimeout(checkReloadButton, 100);
  });
}
setTimeout(checkReloadButton, 1000);

document.addEventListener('click', function (e) {
  var btn = e.target && e.target.closest && e.target.closest('[data-name="Reload"]');
  if (!btn) return;
  reloadTarget(function (t) {
    if (t) chrome.tabs.reload(t.id, {}, function () { void chrome.runtime.lastError; });
  });
}, true);

