// What the display settings DO to the page. Reading and saving them is the
// settings registry's job (settings/definitions.js); these only apply a value.
import { fadeInEnabled, setCurrentPage } from './newtabState.js';

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

/* The search bar's show/hide switch stood here with the bar itself. */

/* The UI scale (body zoom) stood here. The setting is gone; preinit.js clears what it left behind. */

export function showPage(pageName) {
  document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
  const targetPage = document.getElementById(`${pageName}-page`);
  if (!targetPage) return;
  targetPage.classList.add("active"); setCurrentPage(pageName);
  if (pageName === "bookmarks" && fadeInEnabled) {
    const bookmarksContent = document.querySelector(".bookmarks-content");
    if (bookmarksContent) { bookmarksContent.classList.remove("fade-in"); void bookmarksContent.offsetWidth; bookmarksContent.classList.add("fade-in"); }
  }
}
