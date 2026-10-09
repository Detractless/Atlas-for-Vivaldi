/* ── Page subtitles ───────────────────────────────────────────────────────
   Every page carries a short line under its name in the page switcher (the
   `sub` field of each page in activeTabs). One rule, used by the switcher, the
   page dialog and the new-page prompt:

   - 3 to 5 words, so every page says a little about itself and no two rows
     differ much in length;
   - at most MAX_CHARS characters, which is what fits one line of the switcher
     menu at its fixed width (tabs.css), so a subtitle is never cut off. */

import { DEFAULT_TABS } from '../constants/defaults.js';

export const MIN_WORDS = 3;
export const MAX_WORDS = 5;
export const MAX_CHARS = 32;

const HOME_SUBTITLE = DEFAULT_TABS[0].sub;
const STARTER_SUBTITLE = 'Your saved links here';

/** Spaces tidied: trimmed, runs collapsed to one. */
export function cleanSubtitle(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** Why `text` can't be a subtitle, in a few words; null when it can. */
export function subtitleProblem(text) {
  const t = cleanSubtitle(text);
  const words = t ? t.split(' ').length : 0;
  if (words < MIN_WORDS) return `Use at least ${MIN_WORDS} words`;
  if (words > MAX_WORDS) return `Use at most ${MAX_WORDS} words`;
  if (t.length > MAX_CHARS) return `Keep it to ${MAX_CHARS} characters`;
  return null;
}

export function validSubtitle(text) {
  return subtitleProblem(text) === null;
}

/** The subtitle a page gets when it has none yet. */
export function starterSubtitle(page) {
  return page && page.type === 'search' ? HOME_SUBTITLE : STARTER_SUBTITLE;
}

/**
 * Pages saved before subtitles existed get the starter one. A page that
 * already has a subtitle keeps it, whatever it says: this only fills gaps and
 * never rewrites the user's text. Updates the pages in place and returns
 * whether anything changed, so the caller saves only when needed.
 */
export function fillMissingSubtitles(pages) {
  let changed = false;
  pages.forEach((page) => {
    if (!cleanSubtitle(page.sub)) {
      page.sub = starterSubtitle(page);
      changed = true;
    }
  });
  return changed;
}
