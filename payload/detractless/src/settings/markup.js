// src/settings/markup.js — icons and HTML builders for the Settings page.
// Also exposed to profilesPage.js through window.AtlasSettingsUI.

export const I = {
  search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3 3"/>',
  sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1"/>',
  focus: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.5"/>',
  db: '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
  reset: '<path d="M4 10a6 6 0 1 0 2-4.5M4 3.5v3h3"/>',
  star: '<path d="m10 3 2.1 4.4 4.9.6-3.6 3.3.9 4.8L10 13.7 5.7 16l.9-4.8L3 7.9l4.9-.6z"/>',
  ext: '<path d="M7 13 13 7M8 7h5v5"/>'
};

export const svg = (d, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const CHEV =
  '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 6.5 8 10l3.5-3.5"/></svg>';
export const CHECK =
  '<svg viewBox="0 0 17 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l3 3 6-7"/></svg>';

export const row = (title, desc, ctrl) =>
  `<div class="sp-row"><div class="sp-row-text"><div class="sp-row-title">${title}</div>${desc ? `<div class="sp-row-desc">${desc}</div>` : ""}</div><div class="sp-row-ctrl">${ctrl}</div></div>`;
export const card = (rows) => `<div class="sp-card">${rows.join("")}</div>`;
export const section = (title, cards) =>
  `<div class="sp-section">${title ? `<h2 class="sp-section-title">${title}</h2>` : ""}${cards.join("")}</div>`;

/** A drop-down pill showing `label`; opening it lists the control's options. */
export const select = (key, label, sm = false) =>
  `<button class="sp-pill${sm ? " sm" : ""}" data-select="${key}"><span>${label}</span>${CHEV}</button>`;
export const toggle = (key, on) =>
  `<button class="sp-toggle" role="switch" data-toggle="${key}" aria-checked="${on}"></button>`;

/** A small picture of the page in one theme, used as a radio button. */
export function modeThumb(id, checked, bg, panel, line) {
  return `
    <button class="sp-mode" role="radio" data-mode="${id}" aria-checked="${checked}" aria-label="${id}">
      <svg viewBox="0 0 80 60">${id === "system"
        ? `<rect width="40" height="60" fill="#f4f4f4"/><rect x="40" width="40" height="60" fill="#1c1c1c"/>
           <rect x="6" y="8" width="10" height="44" rx="2" fill="#e2e2e2"/><rect x="46" y="8" width="10" height="44" rx="2" fill="#2e2e2e"/>
           <rect x="20" y="14" width="14" height="2.5" rx="1" fill="#7aa7f7"/><rect x="60" y="14" width="14" height="2.5" rx="1" fill="#7aa7f7"/>`
        : `<rect width="80" height="60" fill="${bg}"/><rect x="6" y="8" width="14" height="44" rx="2" fill="${panel}"/>
           <rect x="26" y="12" width="40" height="2.5" rx="1" fill="#7aa7f7"/><rect x="26" y="20" width="30" height="2.5" rx="1" fill="${line}"/>
           <rect x="26" y="28" width="44" height="2.5" rx="1" fill="#7aa7f7"/><rect x="26" y="36" width="24" height="2.5" rx="1" fill="${line}"/>`}
      </svg>
    </button>`;
}

/** The UI scale applies to the new tab, not to Settings itself, so Settings shows this sample at the chosen size. */
export const scalePreview = (scale) =>
  `<div class="sp-scale-preview" aria-hidden="true"><div class="sp-scale-sample" style="zoom:${scale}">` +
  `<div class="sp-scale-bar">${svg(I.search)}<span>Search the web</span></div>` +
  `<div class="sp-scale-pills"><span>Notion</span><span>Gmail</span><span>Calendar</span></div></div></div>`;
