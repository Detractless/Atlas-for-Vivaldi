export const DEFAULT_ENGINES = {
  default: { name: "Browser Default", url: null, icon: "src/assets/svg/default.api.svg", isDefault: true },
  google: { name: "Google", url: "https://www.google.com/search?q=", icon: "src/assets/svg/google.com.svg", isDefault: true },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=", icon: "src/assets/svg/bing.com.svg", isDefault: true },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=", icon: "src/assets/svg/duckduckgo.com.svg", isDefault: true },
  youtube: { name: "YouTube", url: "https://www.youtube.com/results?search_query=", icon: "src/assets/svg/youtube.com.svg", isDefault: true },
  reddit: { name: "Reddit", url: "https://www.reddit.com/search/?q=", icon: "src/assets/svg/reddit.com.svg", isDefault: true },
  yandex: { name: "Yandex", url: "https://yandex.com/search/?text=", icon: "src/assets/svg/yandex.com.svg", isDefault: true },
  yahoo: { name: "Yahoo", url: "https://search.yahoo.com/search?p=", icon: "src/assets/svg/yahoo.com.svg", isDefault: true },
  mojeek: { name: "Mojeek", url: "https://www.mojeek.com/search?q=", icon: "src/assets/svg/mojeek.com.svg", isDefault: true }
};

// Rules for detecting search-result pages and normalizing their URLs.
//   host      : substring matched against url.hostname
//   path      : pathname to match
//   pathMatch : 'exact' (===) or 'prefix' (startsWith)
//   param     : query-string key holding the search terms
//   present   : how isSearchEngine() requires the param —
//               'none'   host+path alone qualifies
//               'has'    param must be present (may be empty)
//               'truthy' param must be present AND non-empty
// The primary group is checked BEFORE user-managed engines and the secondary
// group AFTER, preserving the original precedence in background.js.
export const SEARCH_ENGINE_PARSERS = {
  primary: [
    { host: "google.",        path: "/search",  pathMatch: "exact",  param: "q",            present: "none" },
    { host: "bing.com",       path: "/search",  pathMatch: "exact",  param: "q",            present: "none" },
    { host: "duckduckgo.com", path: "/",        pathMatch: "exact",  param: "q",            present: "has" },
    { host: "youtube.com",    path: "/results", pathMatch: "prefix", param: "search_query", present: "truthy" }
  ],
  secondary: [
    { host: "reddit.com",     path: "/search/", pathMatch: "exact",  param: "q",            present: "has" },
    { host: "yahoo.com",      path: "/search",  pathMatch: "exact",  param: "p",            present: "has" },
    { host: "yandex.com",     path: "/search/", pathMatch: "exact",  param: "text",         present: "has" },
    { host: "mojeek.com",     path: "/search",  pathMatch: "exact",  param: "q",            present: "none" }
  ]
};

