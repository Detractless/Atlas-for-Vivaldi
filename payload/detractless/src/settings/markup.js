// src/settings/markup.js — icons and HTML builders for the Settings page.
// Also exposed to profilesPage.js through window.AtlasSettingsUI.

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const I = {
  search: '<circle cx="9" cy="9" r="5.5"/><path d="m13.5 13.5 3 3"/>',
  sun: '<circle cx="10" cy="10" r="3.2"/><path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1 1M14.3 14.3l1 1M4.7 15.3l1-1M14.3 5.7l1-1"/>',
  focus: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="2.5"/>',
  db: '<ellipse cx="10" cy="5" rx="6" ry="2.2"/><path d="M4 5v10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>',
  reset: '<path d="M4 10a6 6 0 1 0 2-4.5M4 3.5v3h3"/>',
  star: '<path d="m10 3 2.1 4.4 4.9.6-3.6 3.3.9 4.8L10 13.7 5.7 16l.9-4.8L3 7.9l4.9-.6z"/>',
  ext: '<path d="M7 13 13 7M8 7h5v5"/>',
  pages: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14"/>',
  chart: '<path d="M4 16V9M10 16V4M16 16v-5"/>'
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
export const slider = (key, val, min = 0, max = 100, unit = "%") =>
  `<div class="sp-slider-wrap"><input type="range" class="sp-slider" data-slider="${key}" min="${min}" max="${max}" value="${val}" data-unit="${esc(unit)}"><span class="sp-slider-val">${val}${esc(unit)}</span></div>`;
/** A one-line text field; saves on change (blur or Enter), wired in shell.js. */
export const textInput = (key, value, placeholder = "") =>
  `<input class="sp-input" type="text" data-input="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}" spellcheck="false" autocomplete="off">`;

export const LOCK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
export const UNLOCK_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/></svg>';
/* What the lock button says in each state of utils/focusLock.js. */
const LOCK_LABEL = {
  open: "Lock it: it can only get stricter until you unlock it",
  held: "Locked. Click to start unlocking, which takes 30 minutes",
  unlocking: "Unlocking. Click to keep it locked",
};
/** The lock at the right end of a Focus row (`key`: tabLimit, searchDelaySeconds, saturation or nsfwAction): open, locked
    (dark), or unlocking, with the time left beside it. Every state can be clicked. */
export const lockButton = (key, state, countdown) =>
  `<span class="sp-lockcount" data-lockcount="${key}">${state === "unlocking" ? countdown : ""}</span>` +
  `<button type="button" class="sp-lockbtn${state === "held" ? " on" : state === "unlocking" ? " wait" : ""}" data-action="focus-lock" data-lock="${key}" ` +
  `data-icon="${state === "open" ? "open" : "shut"}" aria-pressed="${state !== "open"}" aria-label="${LOCK_LABEL[state]}" title="${LOCK_LABEL[state]}">${state === "open" ? UNLOCK_ICON : LOCK_ICON}</button>`;
/** The same button brought up to date in place, so a keyboard focus on it survives the countdown. */
export function paintLockButton(btn, state) {
  btn.classList.toggle("on", state === "held");
  btn.classList.toggle("wait", state === "unlocking");
  btn.setAttribute("aria-pressed", String(state !== "open"));
  btn.setAttribute("aria-label", LOCK_LABEL[state]);
  btn.title = LOCK_LABEL[state];
  const shape = state === "open" ? "open" : "shut";
  if (btn.dataset.icon !== shape) { btn.innerHTML = shape === "open" ? UNLOCK_ICON : LOCK_ICON; btn.dataset.icon = shape; }
}
/** One part of the social media filter: a pill you switch on and off. `held` (switched on, and the lock keeps it on) shows a small lock. */
export const chip = (id, label, on, held) =>
  `<button type="button" class="sp-chip${on ? " on" : ""}" data-chip="${id}" aria-pressed="${on}"${held ? ' aria-disabled="true"' : ""}>${label}${held ? LOCK_ICON : ""}</button>`;
/** A chip brought up to date in place, so a keyboard focus on it survives. */
export function paintChip(btn, on, held) {
  btn.classList.toggle("on", on);
  btn.setAttribute("aria-pressed", String(on));
  if (held) btn.setAttribute("aria-disabled", "true"); else btn.removeAttribute("aria-disabled");
  const lock = btn.querySelector("svg");
  if (held && !lock) btn.insertAdjacentHTML("beforeend", LOCK_ICON);
  else if (!held && lock) lock.remove();
}
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

/** Live saturation preview showing a colorful fruit image that desaturates as the slider moves. */
export const saturationPreview = (sat) =>
  `<div class="sp-sat-preview" aria-hidden="true"><img class="sp-sat-img" id="sp-sat-sample" src="src/assets/saturation-preview.jpg" alt="" style="filter:saturate(${sat}%);"></div>`;
