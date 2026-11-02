// Scroll fade (Settings > Focus): the longer or farther you scroll, on any site, the darker every page gets. When it is fully
// dim it stays that way for a wait you can't shorten by scrolling or by stopping. This file is the setting and its rules,
// with no page or storage in it, so they can be tested alone. Two files repeat parts of it in their own words (they can't
// import): src/modules/36-scroll-fade-layer.js draws the dimming in the browser window and keeps the wait, and
// components/atlas/atlas-scroll-fade.js counts the scrolling on pages. tests/unit/scroll_fade_rules.test.js feeds all of them
// the same values; keep them the same.
//
// One setting, `scrollFade`:
//   on          whether it works at all
//   by          what counts toward the dimming: 'time' (scrolling time), 'distance' (screens scrolled) or 'either'
//               (whichever is further along)
//   minutes     scrolling time that dims the page fully
//   screens     scrolling distance that dims it fully, in window heights
//   darkest     how dark the page gets at the end, in percent
//   restSeconds how long without scrolling clears a page that is not fully dim yet
//   waitMinutes how long it stays fully dim once it gets there, whatever you do
//   except      host names it leaves alone (never counted, never dimmed), each covering its subdomains
// The scrolling is one total for every site, so going to another site does not start again. The total (chrome.storage.local
// atlas_scroll_fade) is { ms, screens, last, until }: `until` is when the wait ends, or 0 while there is none.
// While its Focus lock holds, the setting can only get stricter (looser(), used by utils/focusLock.js).
// pages/newtab/profilesCore.js repeats looser() in its own words too.

export const DEFAULTS = {
  on: false, by: 'either', minutes: 5, screens: 150, darkest: 70, restSeconds: 60, waitMinutes: 10, except: [],
};

export const BY = { either: 'Whichever comes first', time: 'Time', distance: 'Distance' };
export const MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
export const SCREENS = [25, 50, 100, 150, 250, 500, 1000];
export const REST_SECONDS = [30, 60, 120, 300, 600];
export const WAIT_MINUTES = [1, 2, 5, 10, 15, 30, 60];
export const DARKEST_MIN = 10;
export const DARKEST_MAX = 90;

/** Nothing counted yet, and no wait running. */
export const EMPTY = { ms: 0, screens: 0, last: 0, until: 0 };

const SITE_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** What the user typed or pasted as a site ("https://www.Reddit.com/r/all"), as a bare host name, or null. */
export function cleanSite(text) {
  const host = String(text == null ? '' : text).trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '').replace(/[/?#:].*$/, '').replace(/\.$/, '');
  return SITE_RE.test(host) ? host : null;
}

/** The setting made safe: known values, numbers inside their range, and the sites as clean host names once each. */
export function normalize(value) {
  const v = value && typeof value === 'object' ? value : {};
  const except = Array.isArray(v.except) ? [...new Set(v.except.map(cleanSite).filter(Boolean))].slice(0, 60) : [];
  return {
    on: v.on === true,
    by: Object.prototype.hasOwnProperty.call(BY, v.by) ? v.by : DEFAULTS.by,
    minutes: num(v.minutes, 1, 240, DEFAULTS.minutes),
    screens: num(v.screens, 5, 5000, DEFAULTS.screens),
    darkest: num(v.darkest, DARKEST_MIN, DARKEST_MAX, DEFAULTS.darkest),
    restSeconds: num(v.restSeconds, 10, 3600, DEFAULTS.restSeconds),
    waitMinutes: num(v.waitMinutes, 1, 240, DEFAULTS.waitMinutes),
    except,
  };
}

/** The setting with `field` set to `to`. */
export const withField = (value, field, to) => normalize({ ...normalize(value), [field]: to });

/** Whether `host` is a site the fade works on: it is on, and the host is not one the user excepted (or a subdomain of one). */
export function appliesTo(cfg, host) {
  const c = normalize(cfg), h = String(host || '').toLowerCase().replace(/^www\./, '');
  if (!c.on || !h) return false;
  return !c.except.some((s) => h === s || h.endsWith('.' + s));
}

/** How far along (0 to 1) `ms` of scrolling and `screens` of distance are, by what the setting counts. */
export function progress(cfg, ms, screens) {
  const c = normalize(cfg);
  const t = c.by === 'distance' ? 0 : ms / (c.minutes * 60000);
  const d = c.by === 'time' ? 0 : screens / c.screens;
  return Math.min(1, Math.max(0, t, d));
}

/** How dark the page is (0 to 1): the darkest, times how far along it is. */
export const amount = (cfg, ms, screens) => (normalize(cfg).darkest / 100) * progress(cfg, ms, screens);

/** A saved total made safe: numbers only, nothing negative. Anything else (an older shape) is nothing counted. */
export function cleanTotals(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return { ms: n(r.ms), screens: n(r.screens), last: n(r.last), until: n(r.until) };
}

/** The total as it stands at `now`: while a wait runs it holds until it ends, whatever is scrolled; a page that is not fully
    dim clears after the rest; and reaching full dark starts the wait. */
export function settle(cfg, raw, now) {
  const c = normalize(cfg), t = cleanTotals(raw);
  if (t.until > 0) return now >= t.until ? { ...EMPTY } : t;
  if ((t.ms || t.screens) && now - t.last >= c.restSeconds * 1000) return { ...EMPTY };
  if (progress(c, t.ms, t.screens) >= 1) return { ...t, until: now + c.waitMinutes * 60000 };
  return t;
}

/** Whether `to` is looser than `from`: switched off, a limit that is farther away, a lighter dimming, a shorter rest or wait,
    or more sites left alone. Off is already the loosest, so nothing is looser than it. */
export function looser(from, to) {
  const a = normalize(from), b = normalize(to);
  if (!a.on) return false;
  if (!b.on) return true;
  const time = (c) => (c.by === 'distance' ? Infinity : c.minutes);
  const dist = (c) => (c.by === 'time' ? Infinity : c.screens);
  const more = b.except.some((s) => !a.except.includes(s));
  return time(b) > time(a) || dist(b) > dist(a) || b.darkest < a.darkest || b.restSeconds < a.restSeconds || b.waitMinutes < a.waitMinutes || more;
}
