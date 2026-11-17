// The bookmark well's row geometry comes from the --bm-* tokens in bookmarks.css.
export function rowMetrics(host) {
  const cs = getComputedStyle(host);
  const num = (name, fallback) => {
    const value = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    pitch: num('--bm-row-pitch', 36), gap: num('--bm-row-gap', 0), pad: num('--bm-well-padding', 0),
    chrome: num('--bm-title-height', 24) + num('--bm-title-gap', 8), groupGap: num('--bm-group-gap', 32),
  };
}

// The last row has no gap beneath it.
export const wellHeight = (rows, metrics) => rows * metrics.pitch - metrics.gap + metrics.pad * 2;

// Round down so a group never claims more room than its column has.
export const rowsThatFit = (px, metrics) => Math.max(1, Math.floor((px - metrics.pad * 2 + metrics.gap) / metrics.pitch));
