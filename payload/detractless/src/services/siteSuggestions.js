// Sites for the add popup's website step: the main address of places you have visited (google.com,
// not google.com/search?q=cats), most-visited first. History comes from chrome.history; where the
// page cannot read it, there are simply no suggestions and typing still works.

const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.in',
  'com.br', 'com.mx', 'co.za', 'com.sg', 'com.hk', 'com.tr', 'co.kr',
]);
const IPV4 = /^\d+(\.\d+){3}$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** The host in what was typed or saved ("https://www.netflix.com/browse" -> "netflix.com"), or "". */
export function hostOf(text) {
  const t = String(text ?? '').trim();
  if (!t || /\s/.test(t)) return '';
  try {
    const u = new URL(SCHEME.test(t) ? t : 'https://' + t);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';   // not an address at all: there is no host to find
  }
}

/** The main address of a host: "mail.google.com" -> "google.com", "bbc.co.uk" stays. */
export function mainDomain(host) {
  const h = String(host || '');
  if (!h || IPV4.test(h) || h.indexOf('.') === -1) return h;
  const parts = h.split('.');
  if (parts.length <= 2) return h;
  const last2 = parts.slice(-2).join('.');
  return TWO_PART_SUFFIXES.has(last2) ? parts.slice(-3).join('.') : last2;
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The plain name of a main address: "netflix.com" -> "Netflix". */
export function nameFor(domain) {
  const parts = String(domain || '').split('.');
  if (parts.length < 2) return cap(parts[0] || '');
  const label = TWO_PART_SUFFIXES.has(parts.slice(-2).join('.')) && parts.length >= 3 ? parts[parts.length - 3] : parts[parts.length - 2];
  return cap(label);
}

/** The names offered for what was typed as the address: the plain name, then the address. */
export function nameChoices(urlText) {
  const host = hostOf(urlText);
  if (!host || IPV4.test(host)) return host ? [host] : [];
  const domain = mainDomain(host);
  const plain = nameFor(domain), address = cap(domain);
  return plain && plain !== address ? [plain, address] : [address];
}

/** History items -> [{ domain, visits, last }], most-visited first. */
export function tally(items) {
  const by = new Map();
  for (const it of items || []) {
    let u;
    try { u = new URL(it.url); } catch (e) { continue; }   // a history entry that is not an address
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    const domain = mainDomain(u.hostname.toLowerCase().replace(/^www\./, ''));
    if (!domain) continue;
    const row = by.get(domain) || { domain, visits: 0, last: 0 };
    row.visits += it.visitCount || 1;
    row.last = Math.max(row.last, it.lastVisitTime || 0);
    by.set(domain, row);
  }
  return [...by.values()].sort((a, b) => b.visits - a.visits || b.last - a.last);
}

/** Everything in history, tallied. Resolves to [] when chrome.history is not there. */
export function loadSites(maxResults = 3000) {
  return new Promise((resolve) => {
    const api = globalThis.chrome && globalThis.chrome.history;
    if (!api || !api.search) { resolve([]); return; }
    try {
      api.search({ text: '', maxResults, startTime: 0 }, (items) => {
        void (globalThis.chrome.runtime && globalThis.chrome.runtime.lastError);
        resolve(tally(items));
      });
    } catch (e) {
      resolve([]);   // history refused: no suggestions, typing still works
    }
  });
}

/** The sites to show for what is typed: those starting with it first, then those containing it. */
export function matchSites(sites, typed, limit = 8, skip = new Set()) {
  const q = (hostOf(typed) || String(typed || '').trim().toLowerCase()).replace(/^www\./, '');
  const pool = sites.filter((s) => !skip.has(s.domain));
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((s) => s.domain.startsWith(q));
  const has = pool.filter((s) => !s.domain.startsWith(q) && s.domain.includes(q));
  return [...starts, ...has].slice(0, limit);
}
