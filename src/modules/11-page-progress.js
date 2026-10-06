/* ── 11-page-progress.js: Page-load progress indicator and Safari-style loading state ── */
(function () {
  'use strict';

  var settleTimer = null;
  var maxTimer = null;
  var browser = null;
  var myWinId = null;

  if (chrome.windows && chrome.windows.getCurrent) {
    chrome.windows.getCurrent(function (w) { if (w) myWinId = w.id; });
  }

  function getBrowser() {
    if (!browser && document.getElementById) browser = document.getElementById('browser');
    return browser;
  }

  function setBrowserLoading(loading) {
    var b = getBrowser();
    if (!b) return;

    if (loading) {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      b.classList.remove('atlas-loading-done');
      b.classList.add('atlas-loading');

      clearTimeout(maxTimer);
      maxTimer = setTimeout(function () {
        setBrowserLoading(false);
      }, 12000);
    } else {
      clearTimeout(maxTimer);
      maxTimer = null;
      if (b.classList.contains('atlas-loading')) {
        b.classList.remove('atlas-loading');
        b.classList.add('atlas-loading-done');
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(function () {
          b.classList.remove('atlas-loading-done');
          settleTimer = null;
        }, 500);
      } else {
        b.classList.remove('atlas-loading-done');
      }
    }
  }

  function isNewTabUrl(url) {
    if (!url) return true;
    var u = url.toLowerCase();
    return u.indexOf('atlas-blank.html') !== -1 ||
           u.indexOf('mpognobbkildjkofajifpdfhcoklimli') !== -1 ||
           u.indexOf('chrome://newtab') !== -1 ||
           u.indexOf('vivaldi://newtab') !== -1 ||
           u.indexOf('startpage') !== -1 ||
           u === 'about:blank' ||
           u === '';
  }

  if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener(function (tabId, info) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs[0] || tabs[0].id !== tabId) return;
        var url = (info && info.url) || tabs[0].url;
        if (isNewTabUrl(url)) {
          setBrowserLoading(false);
          return;
        }
        if (info.status === 'loading') {
          setBrowserLoading(true);
        } else if (info.status === 'complete') {
          setBrowserLoading(false);
        }
      });
    });
  }

  if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(function (activeInfo) {
      chrome.tabs.get(activeInfo.tabId, function (t) {
        if (chrome.runtime.lastError || !t) return;
        if (isNewTabUrl(t.url)) {
          setBrowserLoading(false);
          return;
        }
        setBrowserLoading(t.status === 'loading');
      });
    });
  }

  Atlas.setBrowserLoading = setBrowserLoading;
  Atlas.isNewTabUrl = isNewTabUrl;
})();
