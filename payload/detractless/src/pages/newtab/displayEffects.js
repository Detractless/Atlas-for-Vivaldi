// What the display settings DO to the page. Reading and saving them is the
// settings registry's job (settings/definitions.js); these only apply a value.
import { fadeInEnabled, spotlightVisible, setUiScale, setCurrentPage } from './newtabState.js';

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

export function applySpotlightVisibility() {
  const searchPage = document.getElementById("search-page");
  if (searchPage) searchPage.classList.toggle("hide-spotlight", !spotlightVisible);
}

/* The scale is stored as uiScale and only ever applied from the stored value, so
   _scaleCache (read by preinit.js before the first paint) always equals storage.
   Writing the cache from a preview that was never saved is what let a new tab
   paint one size and then jump to another. */
export function applyScale(value) {
  const preScale = document.getElementById('pre-scale');
  if (preScale) preScale.remove();
  setUiScale(value);
  try { localStorage.setItem('_scaleCache', String(value)); } catch (e) { /* no localStorage here: the cache only speeds up first paint */ }
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
}

/** Grayscale removes colour from the whole new tab (html.grayscale in settingsPage.css). */
export function applyGrayscale(on) {
  document.documentElement.classList.toggle("grayscale", !!on);
}

export function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  const targetPage = document.getElementById(`${pageName}-page`);
  if (!targetPage) return;
  targetPage.classList.add("active"); setCurrentPage(pageName);
  if (pageName === "search") {
    const searchInput = document.getElementById("search-input");
    if (searchInput && spotlightVisible) setTimeout(() => searchInput.focus(), 50);
  }
  if (pageName === "bookmarks" && fadeInEnabled) {
    const bookmarksContent = document.querySelector(".bookmarks-content");
    if (bookmarksContent) { bookmarksContent.classList.remove("fade-in"); void bookmarksContent.offsetWidth; bookmarksContent.classList.add("fade-in"); }
  }
}
