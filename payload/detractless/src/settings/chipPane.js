// src/settings/chipPane.js — the panel on the right of the social media filter's pills (pages.js socialChips). Rest the pointer on
// a pill for a moment, or Tab to it, and the panel shows what the part hides, a slideshow of the sites showing it
// (constants/socialSlides.js; it flips every few seconds), and the sites it is planned for. Moving the pointer across the pills
// shows nothing, so the panel doesn't flicker as you go past. Point at nothing and it says to point at a part. A part with no
// pictures is text only. settings/shell.js starts it.
import { partOf } from '../utils/socialFilter.js';
import { SLIDE_DIR, slidesOf } from '../constants/socialSlides.js';

const SLIDE_MS = 2400;
const HOVER_MS = 350;    // the pointer must rest on a pill this long before the panel shows it
const SWITCH_MS = 150;   // and this long to change from one part to another, once the panel is showing one
const PICTURE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10.5" r="1.6"/><path d="M4 17l5-4.5 4 3.2 3-2.7 4 3.5"/></svg>';
let content = null, owner = null, timer = 0, pending = 0;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** ["A", "B", "C"] -> "A, B and C" */
const andList = (xs) => (xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs.join(""));
const paneEl = () => (content ? content.querySelector(".sp-chip-pane") : null);

/** What the panel shows when nothing is pointed at. */
export const restingPane = () => `<div class="sp-chip-pane-in sp-chip-rest"><div class="sp-chip-ghost">${PICTURE}</div>` +
  `<div class="sp-chip-pane-title">Point at a part</div>` +
  `<div class="sp-chip-pane-desc">Move over any pill, or Tab to it, to see where it shows up on each site.</div></div>`;

function slideshow(slides) {
  const shots = slides.map((s, i) => `<div class="sp-chip-slide${i === 0 ? " on" : ""}">` +
    `<img src="${SLIDE_DIR}${s.img}.jpg" alt=""><span class="sp-chip-site">${esc(s.site)}</span></div>`).join("");
  const dots = slides.length > 1 ? `<div class="sp-chip-dots">${slides.map((s, i) => `<i${i === 0 ? ' class="on"' : ""}></i>`).join("")}</div>` : "";
  return `<div class="sp-chip-shot">${shots}</div>${dots}`;
}

/** Show the next slide. */
function advance() {
  const pane = paneEl();
  if (!pane) { clearInterval(timer); return; }   // the page was drawn again: the panel this belonged to is gone
  const slides = pane.querySelectorAll(".sp-chip-slide"), dots = pane.querySelectorAll(".sp-chip-dots i");
  const next = ([...slides].findIndex((s) => s.classList.contains("on")) + 1) % slides.length;
  slides.forEach((s, i) => s.classList.toggle("on", i === next));
  dots.forEach((d, i) => d.classList.toggle("on", i === next));
}

/** Back to "Point at a part". */
export function resetChipPane() {
  clearInterval(timer);
  clearTimeout(pending);
  if (!owner) return;
  owner.removeAttribute("aria-describedby");
  owner = null;
  const pane = paneEl();
  if (pane) pane.innerHTML = restingPane();
}

function showPart(chip) {
  const part = partOf(chip.dataset.chip), pane = paneEl();
  if (!part || !pane) return;
  clearInterval(timer);
  clearTimeout(pending);
  if (owner && owner !== chip) owner.removeAttribute("aria-describedby");
  const slides = slidesOf(part.id);
  pane.innerHTML = `<div class="sp-chip-pane-in"><div class="sp-chip-pane-title">${esc(part.label)}</div><div class="sp-chip-pane-desc">${esc(part.desc)}</div>` +
    (slides.length ? slideshow(slides) : "") + `<div class="sp-chip-pane-sites">Planned for ${esc(andList(part.sites))}</div></div>`;
  chip.setAttribute("aria-describedby", pane.id);
  owner = chip;
  if (slides.length > 1) timer = setInterval(advance, SLIDE_MS);
}

/** Show a part in the panel for any pill inside `contentEl`: after the pointer has rested on it a moment, or at once for the
    keyboard. Go back to the resting panel when the pointer or the keyboard leaves the pills. Moving between pills, or over the
    gaps between them, keeps the panel where it is. */
export function initChipPane(contentEl) {
  content = contentEl;
  const chipOf = (e) => (e.target.closest ? e.target.closest("[data-chip]") : null);
  const leaves = (e) => { const to = e.relatedTarget, area = e.target.closest(".sp-chip-area"); return !(to && area && area.contains(to)); };
  content.addEventListener("mouseover", (e) => {
    const c = chipOf(e);
    if (!c) return;
    clearTimeout(pending);
    if (c !== owner) pending = setTimeout(() => showPart(c), owner ? SWITCH_MS : HOVER_MS);
  });
  content.addEventListener("mouseout", (e) => {
    if (!e.target.closest(".sp-chip-area")) return;
    if (chipOf(e)) clearTimeout(pending);   // passed over it: nothing was waiting long enough
    if (leaves(e)) resetChipPane();
  });
  content.addEventListener("focusin", (e) => { const c = chipOf(e); if (c && c !== owner) showPart(c); });
  content.addEventListener("focusout", (e) => { if (chipOf(e) && leaves(e)) resetChipPane(); });
}
