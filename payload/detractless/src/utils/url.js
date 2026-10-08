/**
 * TLDs we will navigate to from a bare, scheme-less input.
 *
 * WHY A LIST AT ALL. The previous domain pattern made its TLD group OPTIONAL, so
 * it really meant "word, dot, word": `notes.1`, `version.1.3` and `report.v2`
 * were all read as hosts and the spotlight navigated to https://notes.1.
 * Requiring the last label to be alphabetic kills the numeric cases on its own,
 * but only a list separates `notes.docx` from `notes.io`.
 *
 * DELIBERATELY ABSENT: `zip` and `mov`. Both are real TLDs and both are, in
 * practice, overwhelmingly file extensions, so an input ending in either resolves
 * as a search. Anything genuinely on those TLDs still works when typed with a
 * scheme, which is the escape hatch for every judgement call in this list.
 *
 * Short by design. An unlisted TLD degrades to a search, which the user can
 * always override with `https://`; a full IANA table is not warranted.
 */
const KNOWN_TLDS = new Set([
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
  'cl', 'pe', 'ph', 'th', 'vn', 'id', 'my', 'eu',
]);

/** A hostname: dot-separated labels of alphanumerics and hyphens, no empty labels. */
const HOSTNAME_PATTERN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

export function isUrl(input) {
  input = input.trim();
  if (!input) return false;
  if (input.match(/^https?:\/\//i)) return true;
  if (input.match(/^(ftp|ftps|file):\/\//i)) return true;
  if (isFilePath(input)) return true;

  // localhost and bare IPs are checked BEFORE the TLD rule: they have no TLD to
  // look up, and an IP's last label is numeric so the rule below would reject it.
  if (input.match(/^(localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?([/?#].*)?$/i)) return true;

  if (input.includes(" ")) return false;
  if (!input.includes(".")) return false;

  // Strip path/query/fragment, then the port, leaving just the hostname to judge.
  const hostname = input.split(/[/?#]/)[0].split(":")[0];
  if (!HOSTNAME_PATTERN.test(hostname)) return false;

  const tld = hostname.slice(hostname.lastIndexOf(".") + 1).toLowerCase();
  return KNOWN_TLDS.has(tld);
}

/**
 * Returns true if the input looks like a local filesystem path.
 * Matches:
 *   - Windows absolute: C:\...  or C:/...
 *   - UNC paths:        \\server\share
 *   - Unix/macOS absolute: /home/...  /Users/...
 */
export function isFilePath(input) {
  input = input.trim();
  // Already a file:// URL
  if (input.match(/^file:\/\//i)) return false;
  // Windows drive-letter path:  C:\ or C:/
  if (input.match(/^[a-zA-Z]:[/\\]/)) return true;
  // UNC path: \\server\share
  if (input.startsWith('\\\\')) return true;
  // Unix absolute path starting with /  (must have at least one more segment to
  // avoid matching a bare "/" which would be ambiguous)
  if (input.match(/^\/[^/]/)) return true;
  return false;
}

/**
 * Converts a local filesystem path to a file:/// URL.
 * Backslashes are replaced with forward slashes. Drive letters are kept.
 */
export function filePathToUrl(input) {
  input = input.trim().replace(/\\/g, '/');
  // UNC: //server/share -> file:////server/share
  if (input.startsWith('//')) return 'file:' + input;
  // Windows drive letter: C:/... -> file:///C:/...
  if (input.match(/^[a-zA-Z]:\//)) return 'file:///' + input;
  // Unix absolute: /home/... -> file:///home/...
  return 'file://' + input;
}

export function formatUrl(input) {
  input = input.trim();
  if (input.match(/^https?:\/\//i)) return input;
  if (input.match(/^(ftp|ftps|file):\/\//i)) return input;
  if (isFilePath(input)) return filePathToUrl(input);
  return "https://" + input;
}
