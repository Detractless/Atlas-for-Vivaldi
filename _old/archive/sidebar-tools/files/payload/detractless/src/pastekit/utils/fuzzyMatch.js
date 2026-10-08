// src/utils/fuzzyMatch.js — pure fuzzy matcher with a consecutive-character
// streak bonus and a prefix bonus. Shared by the @ autocomplete (with
// highlighting) and the service-worker snippet search (score only).

/**
 * Score `needle` against `hay` (both compared lower-case by the caller).
 * Returns 0 when any needle char is missing from hay in order.
 */
export function fuzzyScore(needle, hay) {
  let hi = 0, score = 0, streak = 0;
  for (let i = 0; i < needle.length; i++) {
    const idx = hay.indexOf(needle[i], hi);
    if (idx === -1) return 0;
    streak = (idx === hi) ? streak + 1 : 0;
    score += 1 + streak; // reward consecutive matches
    if (idx === 0) score += 2; // prefix bonus
    hi = idx + 1;
  }
  return score;
}

/**
 * Score `query` against `name` and build an HTML string with the matched
 * characters wrapped in <b>. Returns { score, html } or null when no match.
 */
export function fuzzyHighlight(query, name) {
  const q = query.toLowerCase(), n = name.toLowerCase();
  if (!q) return { score: 1, html: escapeHtml(name) };
  const score = fuzzyScore(q, n);
  if (score === 0) return null;
  // Greedily bold matched chars (same left-to-right walk as the scorer).
  let hi = 0, out = '', last = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = n.indexOf(q[i], hi);
    out += escapeHtml(name.slice(last, idx)) + '<b>' + escapeHtml(name[idx]) + '</b>';
    last = idx + 1; hi = idx + 1;
  }
  out += escapeHtml(name.slice(last));
  return { score, html: out };
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
