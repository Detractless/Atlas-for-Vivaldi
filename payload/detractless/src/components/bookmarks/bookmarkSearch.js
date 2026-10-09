import { BookmarkDB } from '../../services/bookmarksDB.js';
import {
  usageScores,
  searchDropdownIndex, setSearchDropdownIndex
} from '../../pages/newtab/newtabState.js';
import { initialSelectionIndex } from '../../utils/pillSelection.js';
import { warn } from '../../services/log.js';
import { forActiveAccount } from '../../services/googleAccount.js';


/**
 * @param {Array} matches bookmarks to draw
 * No `mode` parameter any more: both explicit ("./") and ambient ("always")
 * lists preselect their top row, so the caller's branch no longer changes the
 * selection. Shift+Enter is what distinguishes "go there" from "search that".
 */
export function renderBookmarkSearchResults(matches) {
  const resultsContainer = document.getElementById("bookmark-search-results");
  if (!resultsContainer) return;

  resultsContainer.innerHTML = "";
  setSearchDropdownIndex(-1);

  resultsContainer.style.animation = "none";
  resultsContainer.offsetHeight;
  resultsContainer.style.animation = "";

  if (matches.length === 0) {
    resultsContainer.innerHTML = '';
    const emptyItem = document.createElement('div');
    emptyItem.className = 'bookmark-search-item empty';
    emptyItem.textContent = 'No matching bookmarks';
    resultsContainer.appendChild(emptyItem);
    resultsContainer.style.display = 'flex';
    return;
  }

  matches.forEach((bm, idx) => {
    const item = document.createElement("div");
    item.className = "bookmark-search-item";
    item.dataset.url = bm.url;
    item.dataset.index = idx;
    item.style.animationDelay = `${idx * 0.05}s`;

    const nameDiv = document.createElement("div");
    nameDiv.className = "bookmark-search-item-name";
    nameDiv.textContent = bm.name;

    item.appendChild(nameDiv);

    item.addEventListener("click", () => {
      BookmarkDB.recordClick(bm.url).catch((e) => warn('recording a bookmark click failed', e));
      window.location.href = forActiveAccount(bm.url);
    });

    resultsContainer.appendChild(item);
  });
  resultsContainer.style.display = "flex";

  const initial = initialSelectionIndex(matches.length);
  if (initial >= 0) updateSearchDropdownSelection(initial);
  else setSearchDropdownIndex(-1);
}

export function hideBookmarkSearchResults() {
  const resultsContainer = document.getElementById("bookmark-search-results");
  if (resultsContainer) resultsContainer.style.display = "none";
  // The fade and count used to be hidden by hand here. They are the shared
  // affordance now (R-010) and hide themselves: a display:none list measures
  // as zero height, which is zero hidden pills at both ends.
  setSearchDropdownIndex(-1);
}

export function updateSearchDropdownSelection(index) {
  const resultsContainer = document.getElementById("bookmark-search-results");
  if (!resultsContainer) return;

  const items = resultsContainer.querySelectorAll(".bookmark-search-item:not(.empty)");
  if (items.length === 0) return;

  items.forEach(i => i.classList.remove("selected"));

  if (index >= items.length) index = items.length - 1;
  if (index < 0) index = 0;

  setSearchDropdownIndex(index);
  if (items[searchDropdownIndex]) {
    items[searchDropdownIndex].classList.add("selected");
    items[searchDropdownIndex].scrollIntoView({ block: "nearest" });
  }
}

export function sortByUsage(list) {
  return [...list].sort((a, b) => (usageScores.get(b.url) || 0) - (usageScores.get(a.url) || 0));
}
