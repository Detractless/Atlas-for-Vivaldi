import { fadeInEnabled, spotlightVisible, uiScale, setFadeInEnabled, setSpotlightVisible, setUiScale, currentPage, setCurrentPage } from './newtabState.js';

export function initializeFadeIn() {
  window.chrome.storage.sync.get(["fadeInEnabled"], (result) => {
    setFadeInEnabled(result.fadeInEnabled !== undefined ? result.fadeInEnabled : true);
    applyFadeIn();
  })
}

export function applyFadeIn() {
  const bookmarksContent = document.querySelector(".bookmarks-content");
  if (bookmarksContent) {
    if (fadeInEnabled) {
      bookmarksContent.classList.add("fade-in");
      bookmarksContent.style.animationDuration = "";
    } else {
      bookmarksContent.classList.remove("fade-in");
      bookmarksContent.style.animationDuration = "";
    }
  }
}

export function toggleFadeIn(enabled) {
  setFadeInEnabled(enabled);
  window.chrome.storage.sync.set({ fadeInEnabled: enabled });
  applyFadeIn();
}

export function initializeSpotlightVisibility() {
  window.chrome.storage.sync.get(["spotlightVisible"], (result) => { setSpotlightVisible(result.spotlightVisible !== undefined ? result.spotlightVisible : true); applySpotlightVisibility() })
}

export function applySpotlightVisibility() {
  const searchPage = document.getElementById("search-page"); if (searchPage) { spotlightVisible ? searchPage.classList.remove("hide-spotlight") : searchPage.classList.add("hide-spotlight") }
  const spotlightCheckbox = document.getElementById("spotlight-checkbox"); if (spotlightCheckbox) spotlightCheckbox.checked = spotlightVisible
}

export function toggleSpotlightVisibility(enabled) { setSpotlightVisible(enabled); window.chrome.storage.sync.set({ spotlightVisible: enabled }); applySpotlightVisibility() }

export function initializeScale() {
  // preinit.js applies the cached scale from IndexedDB before first paint.
  // Confirm from sync storage (source of truth across devices).
  window.chrome.storage.sync.get(["uiScale"], (result) => {
    const syncScale = result.uiScale !== undefined ? result.uiScale : 1.0;
    applyScale(syncScale);
  });
}

export function applyScale(value) {
  const preScale = document.getElementById('pre-scale');
  if (preScale) preScale.remove();
  setUiScale(value);
  try { localStorage.setItem('_scaleCache', String(value)); } catch (e) {}
  if (value === 1) {
    document.body.style.zoom = '';
    document.body.style.marginLeft = '';
    document.body.style.marginTop = '';
  } else {
    // zoom anchors to the viewport origin (0,0), not the body's shifted top-left,
    // so the correct centering offset is (1/z - 1) * 50%
    document.body.style.zoom = value;
    const pct = (1 / value - 1) * 50;
    document.body.style.marginLeft = `${pct}vw`;
    document.body.style.marginTop = `${pct}vh`;
  }
  document.querySelectorAll(".scale-btn").forEach(btn => {
    btn.classList.toggle("active", parseFloat(btn.dataset.value) === value);
  });
}

export function toggleScale(value) {
  setUiScale(value);
  applyScale(value);
}

export function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"))
  const targetPage = document.getElementById(`${pageName}-page`)
  if (targetPage) {
    targetPage.classList.add("active"); setCurrentPage(pageName);
    if (pageName === "search") {
      const searchInput = document.getElementById("search-input");
      if (searchInput && spotlightVisible) setTimeout(() => searchInput.focus(), 50);
    }
    if (pageName === "bookmarks") {
      if (fadeInEnabled) { const bookmarksContent = document.querySelector(".bookmarks-content"); if (bookmarksContent) { bookmarksContent.classList.remove("fade-in"); void bookmarksContent.offsetWidth; bookmarksContent.classList.add("fade-in") } }
    }
  }
}
