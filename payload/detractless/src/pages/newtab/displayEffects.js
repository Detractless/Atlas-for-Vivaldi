// What the display settings DO to the page. Reading and saving them is the
// settings registry's job (settings/definitions.js); these only apply a value.
import { fadeInEnabled, spotlightVisible, setCurrentPage } from './newtabState.js';

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

/* The UI scale (body zoom) stood here. The setting is gone; preinit.js clears what it left behind. */

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
