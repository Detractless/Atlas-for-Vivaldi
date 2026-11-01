export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

export function catchRate(items, threshold) {
  const leaks = items.filter((i) => i.label === "leak");
  if (!leaks.length) return 0;
  return leaks.filter((i) => i.score >= threshold).length / leaks.length;
}

export function falseBlockRate(items, threshold) {
  const benign = items.filter((i) => i.label === "benign");
  if (!benign.length) return 0;
  return benign.filter((i) => i.score >= threshold).length / benign.length;
}

export function matchedFp(items, maxFp) {
  let best = { threshold: 1, catch: 0 };
  for (let i = 1000; i >= 0; i -= 1) {
    const threshold = i / 1000;
    if (falseBlockRate(items, threshold) > maxFp) break;
    best = { threshold, catch: catchRate(items, threshold) };
  }
  return best;
}

export function summarize(items, options = {}) {
  const maxFp = options.maxFp ?? 0.02;
  const thresholds = options.thresholds ?? [0.15, 0.3, 0.5, 0.7, 0.9];
  const times = items.map((i) => i.ms ?? 0);
  const points = Object.fromEntries(thresholds.map((t) => [
    t.toFixed(2),
    { catch: +catchRate(items, t).toFixed(4), falseBlock: +falseBlockRate(items, t).toFixed(4) },
  ]));
  const best = matchedFp(items, maxFp);
  return {
    counts: {
      benign: items.filter((i) => i.label === "benign").length,
      leak: items.filter((i) => i.label === "leak").length,
      total: items.length,
    },
    latency: { p50: Math.round(percentile(times, 50)), p95: Math.round(percentile(times, 95)) },
    matchedFp: { maxFp, threshold: +best.threshold.toFixed(3), catch: +best.catch.toFixed(4) },
    points,
  };
}
