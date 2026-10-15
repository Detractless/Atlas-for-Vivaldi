// Usage totals: for each site (its host name), per local hour, how long it was in front of you and what
// you did there. Pure rules, with no storage or page in them, so they can be tested alone.
//
// The page script (components/atlas/atlas-usage.js) sends small deltas; the service worker adds them to
// the store with addUsage(). Hours are kept for 14 days, then folded into days, kept for 180 days.

export const STORE_VERSION = 1;
export const HOUR_DAYS = 14;
export const DAY_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What is counted, and the most one message may add (a page sends every 30 seconds, so these are generous). */
export const FIELDS = {
  visibleMs: 120000, handsOnMs: 120000, mediaFrontMs: 120000, mediaBackMs: 120000, scrollMs: 120000,
  pageViews: 500, imagesSeen: 2000, clicks: 5000, keys: 5000, scrollScreens: 2000,
};

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const hourKey = (ms) => `${dayKey(ms)}T${pad(new Date(ms).getHours())}`;
/** "2026-10-15" or "2026-10-15T04" -> the time that hour or day starts (local). */
export function keyStart(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}))?$/.exec(key);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0).getTime() : NaN;
}

/** The host name to file usage under ("www." dropped), or "" when it is not a plain host name. */
export function cleanHost(host) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  return h.length > 0 && h.length <= 100 && /^[a-z0-9.-]+$/.test(h) && h.indexOf('..') === -1 ? h : '';
}

/** A message's numbers made safe: only the known fields, whole non-negative numbers, none over its cap. */
export function cleanDelta(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [field, cap] of Object.entries(FIELDS)) {
    const n = Number(raw[field]);
    if (Number.isFinite(n) && n > 0) out[field] = Math.round(Math.min(n, cap) * 100) / 100;
  }
  return out;
}

export const hasUsage = (delta) => Object.keys(delta || {}).length > 0;

const blank = () => Object.fromEntries(Object.keys(FIELDS).map((f) => [f, 0]));
function addInto(bucket, host, delta) {
  const row = bucket[host] || (bucket[host] = blank());
  for (const f of Object.keys(FIELDS)) row[f] = Math.round(((row[f] || 0) + (delta[f] || 0)) * 100) / 100;
}

/** The store with `delta` added under `host` for the hour of `now`; old hours folded into days, old days dropped. */
export function addUsage(store, host, delta, now = Date.now()) {
  const next = { v: STORE_VERSION, hours: { ...((store && store.hours) || {}) }, days: { ...((store && store.days) || {}) } };
  const hk = hourKey(now);
  next.hours[hk] = { ...(next.hours[hk] || {}) };
  next.hours[hk][host] = { ...(next.hours[hk][host] || {}) };
  addInto(next.hours[hk], host, delta);
  const hourCutoff = now - HOUR_DAYS * DAY_MS, dayCutoff = now - DAY_DAYS * DAY_MS;
  for (const key of Object.keys(next.hours)) {
    const start = keyStart(key);
    if (!(start < hourCutoff)) continue;
    const dk = key.slice(0, 10);
    next.days[dk] = { ...(next.days[dk] || {}) };
    for (const [h, row] of Object.entries(next.hours[key])) addInto(next.days[dk], h, row);
    delete next.hours[key];
  }
  for (const key of Object.keys(next.days)) if (keyStart(key) < dayCutoff) delete next.days[key];
  return next;
}

/** Totals per site over the last `days` days (today counts as one), biggest first. */
export function summarize(store, { days = 7, now = Date.now() } = {}) {
  const startOfToday = keyStart(dayKey(now));
  const from = startOfToday - (days - 1) * DAY_MS;
  const sites = {};
  for (const bucket of [(store && store.hours) || {}, (store && store.days) || {}]) {
    for (const [key, hosts] of Object.entries(bucket)) {
      if (keyStart(key) < from) continue;
      for (const [host, row] of Object.entries(hosts)) addInto(sites, host, row);
    }
  }
  const list = Object.entries(sites).map(([host, t]) => ({ host, ...t })).sort((a, b) => b.visibleMs - a.visibleMs);
  const total = blank();
  for (const s of list) for (const f of Object.keys(FIELDS)) total[f] += s[f];
  return { sites: list, total, days };
}

/** The numbers worth reading, worked out from a site's (or the grand) totals. */
export function derived(t) {
  const min = (ms) => ms / 60000;
  return {
    handsOnShare: t.visibleMs > 0 ? t.handsOnMs / t.visibleMs : 0,                  // 0 to 1
    imagesPerMin: t.visibleMs > 0 ? t.imagesSeen / min(t.visibleMs) : 0,
    screensPerMin: t.scrollMs > 0 ? t.scrollScreens / min(t.scrollMs) : 0,          // scroll speed while scrolling
    mediaMs: t.mediaFrontMs + t.mediaBackMs,
  };
}

/** "3h 12m", "45m", "20s" from milliseconds. */
export function clock(ms) {
  const s = Math.round(ms / 1000);
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}
