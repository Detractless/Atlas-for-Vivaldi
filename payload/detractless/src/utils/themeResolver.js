export function resolveActiveTheme(cfg) {
  let active = (cfg && cfg.Theme) || 'dark';
  if (active === 'system') {
    active = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return active;
}
