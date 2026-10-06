import { DEFAULT_ENGINES } from '../../constants/engines.js';

export function extractSearchQuery(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    const query = params.get('q') || params.get('query') || params.get('p') ||
                  params.get('text') || params.get('search_query');
    return query || '';
  } catch {
    return '';
  }
}

export function detectSearchEngine(url) {
  try {
    const hostname = new URL(url).hostname;
    for (const [, engine] of Object.entries(DEFAULT_ENGINES)) {
      if (!engine.url) continue;
      try {
        const domain = new URL(engine.url).hostname.split('.').slice(-2).join('.');
        if (hostname.includes(domain)) return { name: engine.name, icon: engine.icon };
      } catch { continue; }
    }
    return { name: 'Search', icon: '' };
  } catch {
    return { name: 'Search', icon: '' };
  }
}
