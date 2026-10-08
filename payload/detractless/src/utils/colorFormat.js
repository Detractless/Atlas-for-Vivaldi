export function formatColorForWeb(hex) {
  if (typeof hex === 'string' && hex.length === 9 && hex.startsWith('#')) {
    return '#' + hex.substring(3, 9) + hex.substring(1, 3);
  }
  return hex;
}

export function hexMix(a, b, t) {
  const parse = (h) => {
    h = String(h).replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const ca = parse(a), cb = parse(b);
  if (ca.some(isNaN) || cb.some(isNaN)) return a;
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return '#' + mixed.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
