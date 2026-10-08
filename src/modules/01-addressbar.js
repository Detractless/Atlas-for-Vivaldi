/* ── 01-addressbar.js: Address field focus blur release, blank new tab marker, spellcheck activation ── */

/* 1. Release the address field when focus leaves the browser UI.
      Clicking blank page area moves focus into the web content and the UI
      window fires `blur`; without this the field keeps :focus-within and
      stays visually expanded. */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('blur', function () {
    var a = document.activeElement;
    if (a && a.closest &&
        a.closest('.UrlBar-AddressField, .UrlBar-SearchField, .SearchField')) {
      a.blur();
    }
  });
}

/* 2. Mark the window while the active tab is the blank new tab, so the
      stylesheet can keep the address field empty there. The field's value
      is set by React without firing mutations, so it is polled. */
var NEWTAB = 'atlas-blank.html';

function activateSpellcheck(input) {
  if (!input) return;
  if (!input.spellcheck || input.getAttribute('spellcheck') !== 'true') {
    input.spellcheck = true;
    input.setAttribute('spellcheck', 'true');
  }
}

function syncNewTabClass() {
  var browser = document.getElementById ? document.getElementById('browser') : null;
  var input = document.querySelector ? (document.querySelector('.UrlBar-UrlField.url') ||
              document.querySelector('.UrlBar-AddressField input')) : null;
  if (input) activateSpellcheck(input);
  if (!browser || !input) return;
  var isNew = (input.value || '').indexOf(NEWTAB) !== -1;
  if (browser.classList.contains('atlas-newtab') !== isNew) {
    browser.classList.toggle('atlas-newtab', isNew);
  }
}

if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(function () { setTimeout(syncNewTabClass, 50); });
}
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener(function (id, info) {
    if (info.status === 'complete' || info.url) setTimeout(syncNewTabClass, 50);
  });
}
setTimeout(syncNewTabClass, 500);

/* Activate spellcheck as soon as address field receives focus */
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('focusin', function (e) {
    var target = e.target;
    if (!target) return;
    if ((target.matches && target.matches('.UrlBar-AddressField input, .UrlBar-UrlField.url')) ||
        (target.closest && target.closest('.UrlBar-AddressField'))) {
      activateSpellcheck(target);
    }
  }, true);

  /* 3. Home button click handler: navigates active tab to Detractless home dashboard */
  document.addEventListener('click', function (e) {
    var homeBtn = e.target.closest && e.target.closest('button[data-name="Home"]');
    if (homeBtn) {
      e.preventDefault();
      e.stopPropagation();
      var homeUrl = ATLAS_NEWTAB_URL;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
          if (ts && ts[0]) chrome.tabs.update(ts[0].id, { url: homeUrl });
          else if (chrome.tabs.create) chrome.tabs.create({ url: homeUrl });
        });
      }
    }
  }, true);

  /* 4. "home" keyword typed or empty Enter in address bar / search field navigates to home dashboard */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var target = e.target;
    if (!target) return;
    var isField = (target.matches && target.matches('.UrlBar-AddressField input, .UrlBar-UrlField.url, .UrlBar-SearchField input, .SearchField input')) ||
                  (target.closest && target.closest('.UrlBar-AddressField, .UrlBar-SearchField, .SearchField'));
    if (!isField) return;
    var val = (target.value || '').trim().toLowerCase();
    if (val === 'home' || val === 'home/' || val === '') {
      e.preventDefault();
      e.stopPropagation();
      var homeUrl = ATLAS_NEWTAB_URL;
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (ts) {
          if (ts && ts[0]) chrome.tabs.update(ts[0].id, { url: homeUrl });
          else if (chrome.tabs.create) chrome.tabs.create({ url: homeUrl });
        });
      }
      if (typeof target.blur === 'function') target.blur();
    }
  }, true);
}

