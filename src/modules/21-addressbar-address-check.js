/* ── 21-addressbar-address-check.js: does the address field hold an address? ──
   The engine button (19-addressbar-engine-picker.js) means "this will be
   searched", so it steps aside while the field holds something that will be
   opened as a site instead (2026-10-10): text with a scheme (https://,
   vivaldi://, ...), www., localhost, an IP address, a file path, or
   name.ending where the ending is one the new tab knows. Anything else, and
   an empty field, is a search.

   The endings are the new tab's own list (payload/detractless/src/utils/url.js,
   KNOWN_TLDS), copied here because the window can't load the new tab's
   modules; a test keeps the two the same. An ending not on the list is a
   search, as on the new tab: https:// still opens it. ── */

var ATLAS_KNOWN_ENDINGS = [
  // generic
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'name', 'pro',
  'mobi', 'asia', 'tel', 'travel', 'jobs', 'aero', 'coop', 'museum',
  // common modern generics
  'app', 'dev', 'io', 'ai', 'co', 'me', 'tv', 'cc', 'xyz', 'online', 'site',
  'tech', 'store', 'blog', 'cloud', 'page', 'live', 'shop', 'wiki', 'design',
  'art', 'fun', 'space', 'world', 'today', 'news', 'media', 'email', 'link',
  'click', 'host', 'press', 'club', 'life', 'vip', 'top', 'one', 'run', 'fm',
  'gg', 'sh', 'ly', 'to', 'is', 'am', 'so', 'st', 'md', 'ms', 'im', 'ws',
  // country codes in common use
  'uk', 'de', 'fr', 'jp', 'cn', 'ru', 'br', 'in', 'au', 'ca', 'us', 'es', 'it',
  'nl', 'se', 'no', 'fi', 'dk', 'pl', 'ch', 'at', 'be', 'cz', 'gr', 'pt', 'ro',
  'hu', 'ie', 'nz', 'mx', 'kr', 'tw', 'hk', 'sg', 'za', 'il', 'tr', 'ua', 'ar',
  'cl', 'pe', 'ph', 'th', 'vn', 'id', 'my', 'eu'
];

/* A hostname: dot-separated labels of letters, digits and hyphens, no empty labels. */
var ATLAS_HOSTNAME = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

function atlasLooksLikeAddress(text) {
  var v = String(text || '').trim();
  if (!v || atlasIsNewTabUrl(v)) return false;   // the new tab's own address reads as an empty field
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || /^(about|mailto):\S/i.test(v)) return true;
  if (/^([a-zA-Z]:[\/\\]|\\\\|\/[^\/\s])/.test(v)) return true;   // C:\..., \\server, /Users/...
  if (/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([\/?#]\S*)?$/i.test(v)) return true;
  if (/\s/.test(v) || v.indexOf('.') === -1) return false;
  if (/^www\.\S/i.test(v)) return true;
  var host = v.split(/[\/?#]/)[0].split(':')[0];
  if (!ATLAS_HOSTNAME.test(host)) return false;
  return ATLAS_KNOWN_ENDINGS.indexOf(host.slice(host.lastIndexOf('.') + 1).toLowerCase()) !== -1;
}
