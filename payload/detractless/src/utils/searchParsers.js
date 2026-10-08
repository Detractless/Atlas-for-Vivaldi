// URL-matching helpers that operate on parsed URL objects and SEARCH_ENGINE_PARSERS
// rule structs. Pure functions with no dependency on engines.js state.

// Does this URL match a parser rule? When applyPresent is false (URL
// normalization) only host+path are checked; when true (search detection) the
// param-presence requirement is also enforced.
export function matchSearchParser(urlObj, p, applyPresent) {
  if (!urlObj.hostname.includes(p.host)) return false;
  if (p.pathMatch === "prefix") {
    if (!urlObj.pathname.startsWith(p.path)) return false;
  } else if (urlObj.pathname !== p.path) {
    return false;
  }
  if (applyPresent) {
    if (p.present === "has") return urlObj.searchParams.has(p.param);
    if (p.present === "truthy") return !!urlObj.searchParams.get(p.param);
  }
  return true;
}

// Rebuild a canonical search URL key from a matched parser rule.
export function standardiseByParser(urlObj, p) {
  const value = urlObj.searchParams.get(p.param) || "";
  return `https://${urlObj.hostname}${p.path}?${p.param}=${encodeURIComponent(value)}`;
}
