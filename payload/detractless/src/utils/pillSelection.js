// src/utils/pillSelection.js — who owns Enter in the spotlight.
//
// Lives in utils, next to searchParsers.js, for the same reason: it is a pure
// predicate over values with no DOM and no visual element of its own. The
// renderer in components/bookmarks/bookmarkSearch.js consumes it.
//
// THE BUG THIS EXISTS FOR. The pill list auto-selected its first row on EVERY
// render, and the Enter handler fell back to index 0 whenever nothing was
// selected. With pills set to "always" that combination left no keystroke that
// could run a plain search: matching is `includes()`, so a bookmark named Gmail
// swallowed the query "mail" and Enter opened Gmail instead of searching for it.
//
// THE DISTINCTION THAT FIXES IT is what the user ASKED FOR, not what matched.
//
//   EXPLICIT ("./" typed)  the user asked for bookmarks, so a bookmark wins and
//                          Enter opens the top hit with no arrow press.
//   AMBIENT  ("always")    the user typed a query and the pills appeared on their
//                          own, so search wins and the pills are an offer. Arrow
//                          down or Tab accepts the offer.

/** The user typed "./" and is browsing bookmarks deliberately. */
export const MODE_EXPLICIT = 'explicit';

/** Pills appeared under an ordinary query because the setting is "always". */
export const MODE_AMBIENT = 'ambient';

/**
 * The row selected when a fresh set of matches is drawn.
 *
 * BOTH MODES PRESELECT NOW. This briefly returned -1 in ambient mode, so Enter
 * always searched and reaching a bookmark cost an extra ArrowDown or Tab. That
 * fixed a real bug (with includes() matching, a bookmark named Gmail swallowed
 * the query "mail" and nothing could search for it) but it taxed the common case
 * to rescue the rare one. Shift+Enter is the escape hatch now, so the fast path
 * comes back: type, press Enter, go.
 *
 * @param {number} matchCount how many pills were drawn
 * @returns {number} row index, or -1 when there is nothing to select
 */
export function initialSelectionIndex(matchCount) {
  return (!matchCount || matchCount <= 0) ? -1 : 0;
}

/**
 * Does Enter open a bookmark, or run a search?
 *
 * SHIFT IS AN UNCONDITIONAL OVERRIDE, checked before anything else. Shift+Enter
 * means "search the text I typed, literally", and it outranks a selected pill,
 * a URL-shaped input and a file path alike. That single rule is what lets plain
 * Enter go back to being fast: there is always a way out.
 *
 * Deliberately does NOT fall back to row 0 when nothing is selected. That
 * fallback was the original bug: it made "nothing is selected" and "row 0 is
 * selected" behave identically.
 *
 * @param {boolean} listVisible is the pill list on screen
 * @param {number} selectedIndex current selection, -1 when nothing is selected
 * @param {number} matchCount how many pills are drawn
 * @param {boolean} [forceSearch] true when Shift was held
 * @returns {'bookmark'|'search'}
 */
export function resolveEnterAction(listVisible, selectedIndex, matchCount, forceSearch = false) {
  if (forceSearch) return 'search';
  if (!listVisible) return 'search';
  if (!matchCount || matchCount <= 0) return 'search';
  if (selectedIndex < 0) return 'search';
  return 'bookmark';
}

/**
 * The text to actually search for.
 *
 * Strips the "./" sigil, which is a mode marker rather than part of the query:
 * searching the web for "./invoices" would be nonsense. Applies to plain Enter
 * too, not just Shift+Enter, since either can end up searching from that mode.
 */
export function searchTextFor(value) {
  const raw = (value == null ? '' : String(value)).trim();
  return raw.startsWith('./') ? raw.slice(2).trim() : raw;
}

/**
 * Which mode a raw input value puts the spotlight in, or null for no pills.
 *
 * @param {string} value the raw search field value
 * @param {string} pillBehavior the bookmarkPillBehavior setting
 */
export function modeForInput(value, pillBehavior) {
  const raw = value == null ? '' : String(value);
  if (pillBehavior === 'never') return null;
  if (raw.startsWith('./')) return MODE_EXPLICIT;
  if (pillBehavior === 'always' && raw.trim().length > 0) return MODE_AMBIENT;
  return null;
}
