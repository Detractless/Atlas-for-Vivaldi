import { isUrl, isFilePath, filePathToUrl, formatUrl } from '../../utils/url.js';
import { allCachedBookmarks, searchDropdownIndex, currentEngine, searchEngines, defaultEngineKey, spotlightVisible, getBookmarkPillBehavior } from '../../pages/newtab/newtabState.js';
import { renderBookmarkSearchResults, updateSearchDropdownSelection, hideBookmarkSearchResults, sortByUsage } from '../bookmarks/bookmarkSearch.js';
import { resolveEnterAction, searchTextFor } from '../../utils/pillSelection.js';
import { updateCurrentEngine } from '../engines/enginesUI.js';
import { attachScrollAffordance } from '../shared/scrollAffordance.js';

export function initializeSearch() {
  const searchInput = document.getElementById("search-input");
  const plus = document.getElementById('plus');
  const resultsContainer = document.getElementById("bookmark-search-results");
  if (!searchInput) return;
  const ui = { searchInput, plus, resultsContainer };

  // Local Bookmark Search Trigger & Render
  searchInput.addEventListener("input", () => onSearchInput(ui));
  searchInput.addEventListener("focus", () => {
    const v = searchInput.value;
    if (v.startsWith("./") || (getBookmarkPillBehavior() === "always" && v.trim().length > 0)) {
      searchInput.dispatchEvent(new Event('input'));
    }
  });

  // R-010: the pill list scrolls with scrollbars hidden, so it gets the shared
  // two-way fade and hidden-pill count. This replaces a local bottom-only
  // overlay that decided its own visibility from scroll position, which is the
  // predicate R-008 removed. Attached ONCE: the affordance re-measures itself
  // when renderBookmarkSearchResults rewrites the list.
  if (resultsContainer) {
    attachScrollAffordance(resultsContainer, { items: '.bookmark-search-item:not(.empty)' });
  }

  const searchCard = searchInput.closest('.spotlight-search-container');
  document.addEventListener("click", (e) => {
    const wrapper = document.getElementById('bookmark-pills-wrapper');
    const inSearch = searchCard && searchCard.contains(e.target);
    const inPills = (resultsContainer && resultsContainer.contains(e.target)) || (wrapper && wrapper.contains(e.target));
    if (resultsContainer && !inSearch && !inPills) {
      hideBookmarkSearchResults();
    }
  });

  searchInput.addEventListener("keydown", (e) => onSearchKeydown(e, ui));
  if (plus) wireEnginePicker(plus);
}

/** Bookmarks whose name contains the (lower-cased) query. */
function matchingBookmarks(query) {
  return allCachedBookmarks.filter(bm => bm.name.toLowerCase().includes(query));
}

function showPills(ui, bookmarks) {
  ui.plus.classList.remove('plus--active');
  renderBookmarkSearchResults(sortByUsage(bookmarks));
}

/* "./" opens the bookmark pills on purpose; with the "always" setting any text
   that matches a bookmark name shows them too. */
function onSearchInput(ui) {
  const val = ui.searchInput.value;
  if (val.startsWith("./")) {
    const raw = val.substring(2);
    const query = raw.trim().toLowerCase();
    if (raw === ' ') showPills(ui, allCachedBookmarks);
    else if (query.length > 0) showPills(ui, matchingBookmarks(query));
    else hideBookmarkSearchResults();
  } else if (getBookmarkPillBehavior() === "always" && val.trim().length > 0) {
    const matched = matchingBookmarks(val.trim().toLowerCase());
    if (matched.length > 0) showPills(ui, matched);
    else hideBookmarkSearchResults();
  } else {
    hideBookmarkSearchResults();
  }
}

function pillItems(ui) {
  return ui.resultsContainer.querySelectorAll(".bookmark-search-item:not(.empty)");
}

async function onSearchKeydown(e, ui) {
  const { searchInput, resultsContainer } = ui;
  const isSearchActive = (searchInput.value.startsWith("./") || getBookmarkPillBehavior() === "always") && resultsContainer && resultsContainer.style.display === "flex";
  if (movePillSelection(e, ui, isSearchActive)) return;
  if (e.key === "Enter") await submitSearch(e, ui, isSearchActive);
}

/** Arrow keys (and Tab) move through the pills. True when the key was used. */
function movePillSelection(e, ui, isSearchActive) {
  if (e.key === "ArrowDown" && isSearchActive) {
    e.preventDefault();
    updateSearchDropdownSelection(searchDropdownIndex + 1);
    return true;
  }
  if (e.key === "ArrowUp" && isSearchActive) {
    e.preventDefault();
    updateSearchDropdownSelection(searchDropdownIndex - 1);
    return true;
  }
  /* Tab still commits to the top pill when nothing is selected, which only
     happens now if the user has arrowed off the list. Kept because it costs
     nothing and some people reach for Tab in a completion field. */
  if (e.key === "Tab" && isSearchActive && searchDropdownIndex < 0) {
    if (pillItems(ui).length > 0) {
      e.preventDefault();
      updateSearchDropdownSelection(0);
      return true;
    }
  }
  return false;
}

async function submitSearch(e, ui, isSearchActive) {
  const { searchInput } = ui;
  const items = isSearchActive ? pillItems(ui) : [];

  /* SHIFT+ENTER MEANS "SEARCH THIS, LITERALLY", and it overrides everything
     below: the selected pill, the URL sniffing, and the file-path check. It
     is the one escape hatch that makes plain Enter safe to keep fast, and it
     is the only way to search for text that merely LOOKS like a destination:
     a real bookmark name, "notes.io", "archive.zip", or a site you want to
     read about rather than visit. */
  const forceSearch = e.shiftKey;

  if (resolveEnterAction(isSearchActive, searchDropdownIndex, items.length, forceSearch) === 'bookmark') {
    window.location.href = items[searchDropdownIndex].dataset.url;
    return;
  }

  // Strips a leading "./", which marks the bookmark mode and is not query text.
  const query = searchTextFor(searchInput.value);
  if (!query) return;
  const targetUrl = (!forceSearch && isUrl(query)) ? await destinationUrl(query) : searchUrl(query, searchInput);
  if (targetUrl === null) return;
  window.location.href = targetUrl; searchInput.value = "";
}

/** URL-shaped input: the address to open, or null when a file can't be opened. */
async function destinationUrl(query) {
  let targetUrl = formatUrl(query);
  // File path: test whether file access is allowed before navigating.
  // Chrome silently refuses file:// URLs from extensions when the user
  // hasn't enabled "Allow access to file URLs", so we probe first.
  if (targetUrl.startsWith('file://') || isFilePath(query)) {
    if (!targetUrl.startsWith('file://')) targetUrl = filePathToUrl(query);
    try {
      // chrome.extension.isAllowedFileSchemeAccess is the official API
      // for checking this at runtime.
      const allowed = await new Promise(resolve =>
        chrome.extension.isAllowedFileSchemeAccess(resolve)
      );
      if (!allowed) {
        showFileAccessWarning();
        return null;
      }
    } catch (_) {
      // API unavailable — try anyway; worst case Chrome shows its own error
    }
  }
  return targetUrl;
}

/** Text input: the engine's search URL, or null when the browser searched itself. */
function searchUrl(query, searchInput) {
  if (currentEngine === "default" && window.chrome && window.chrome.search) {
    try {
      chrome.search.query({ text: query, disposition: "CURRENT_TAB" });
      searchInput.value = "";
      return null;
    } catch (error) {
      return "https://www.google.com/search?q=" + encodeURIComponent(query);
    }
  }
  const engine = searchEngines[currentEngine];
  if (engine) return engine.url + encodeURIComponent(query);
  const defaultEngine = searchEngines[defaultEngineKey];
  if (defaultEngine) return defaultEngine.url + encodeURIComponent(query);
  return "https://www.google.com/search?q=" + encodeURIComponent(query);
}

/** The + button opens the engine links; picking one switches engine. */
function wireEnginePicker(plus) {
  const engineLinks = document.getElementById('engine-links');
  const close = () => {
    plus.classList.remove('plus--active');
    if (engineLinks) engineLinks.classList.remove('active');
  };
  plus.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBookmarkSearchResults();
    plus.classList.toggle('plus--active');
    if (engineLinks) engineLinks.classList.toggle('active', plus.classList.contains('plus--active'));
  });
  if (engineLinks) engineLinks.addEventListener('click', function (e) {
    const link = e.target.closest('.plus__link');
    if (link && link.dataset.engine) {
      e.preventDefault(); e.stopPropagation();
      updateCurrentEngine(link.dataset.engine);
      plus.classList.remove('plus--active');
      engineLinks.classList.remove('active');
    }
  });
  document.addEventListener('click', (e) => {
    if (!plus.contains(e.target) && (!engineLinks || !engineLinks.contains(e.target))) close();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   FILE ACCESS WARNING
   Shown when the user types a local file path but "Allow access to file
   URLs" is disabled for this extension in chrome://extensions.
   ══════════════════════════════════════════════════════════════════════ */

function showFileAccessWarning() {
  // Remove any existing warning
  document.querySelectorAll('.file-access-warning').forEach(n => n.remove());

  const overlay = document.createElement('div');
  overlay.className = 'modal show file-access-warning';
  overlay.style.zIndex = '500';

  const card = document.createElement('div');
  card.className = 'picker-card';
  card.style.cssText = 'max-width: 340px; padding: 24px;';

  // Title
  const title = document.createElement('div');
  title.className = 'picker-title';
  title.style.cssText = 'padding: 0 0 8px; font-size: 16px;';
  title.textContent = 'File access not enabled';

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'font-size: 13px; color: var(--text-secondary); line-height: 1.55; padding: 0 0 20px;';
  body.innerHTML =
    'This extension doesn\'t have permission to open local files.<br><br>' +
    'To enable it, open <strong>chrome://extensions</strong> in your browser, ' +
    'find <strong>Detractless New Tab</strong>, click <strong>Details</strong>, ' +
    'and turn on <strong>"Allow access to file URLs"</strong>.';

  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'picker-btn picker-btn--primary';
  dismissBtn.style.cssText = 'width: 100%;';
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.type = 'button';
  dismissBtn.addEventListener('click', () => overlay.remove());

  card.append(title, body, dismissBtn);
  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

