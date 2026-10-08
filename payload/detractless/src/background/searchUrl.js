import { SEARCH_ENGINE_PARSERS } from '../constants/engines.js';
import { matchSearchParser, standardiseByParser } from '../utils/searchParsers.js';

export function standardiseUrl(inputUrl, managedEngines) {
  try {
    const urlObj = new URL(inputUrl)

    // 1. Primary built-in engines (checked before managed engines, host+path only)
    for (const parser of SEARCH_ENGINE_PARSERS.primary) {
      if (matchSearchParser(urlObj, parser, false)) return standardiseByParser(urlObj, parser)
    }

    // 2. Managed Engines (Dynamic)
    const engineList = Object.values(managedEngines);
    for (const engine of engineList) {
      if (inputUrl.startsWith(engine.url)) {
        try {
          const match = engine.url.match(/[?&]([^=]+)=$/);
          if (match && match[1]) {
            const paramKey = match[1];
            const q = urlObj.searchParams.get(paramKey) || "";
            return engine.url + encodeURIComponent(q);
          }
        } catch (err) { /* engine URL pattern did not parse: keep the URL as typed */ }
        return inputUrl;
      }
    }

    // 3. Secondary built-in engines (checked after managed engines, host+path only)
    for (const parser of SEARCH_ENGINE_PARSERS.secondary) {
      if (matchSearchParser(urlObj, parser, false)) return standardiseByParser(urlObj, parser)
    }

    return null // Not a supported search URL
  } catch (e) {
    return null
  }
}

export function isSearchEngine(url, managedEngines) {
  try {
    const parsedUrl = new URL(url)

    // 1. Primary built-in engines (param-presence enforced)
    for (const parser of SEARCH_ENGINE_PARSERS.primary) {
      if (matchSearchParser(parsedUrl, parser, true)) return true
    }

    // 2. Managed Engines check
    const engineList = Object.values(managedEngines);
    if (engineList.some(engine => url.startsWith(engine.url))) {
      return true;
    }

    // 3. Secondary built-in engines (param-presence enforced)
    for (const parser of SEARCH_ENGINE_PARSERS.secondary) {
      if (matchSearchParser(parsedUrl, parser, true)) return true
    }

    return false
  } catch (e) {
    return false
  }
}
