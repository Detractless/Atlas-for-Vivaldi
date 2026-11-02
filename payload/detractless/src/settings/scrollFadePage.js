// src/settings/scrollFadePage.js — the Scroll fade section of Settings > Focus (settings/pages.js adds it): the rows, the
// sites it leaves alone as pills, and a row of pictures of the page getting darker. Its controls are settings/fadeControls.js.
// shell.js calls showFade() and paintFadeSites() to bring what is on screen up to date without drawing the page again.
import { CONTROLS, labelOf } from './controls.js';
import { getSetting } from './registry.js';
import { row, card, section, select, slider } from './markup.js';
import { lockState } from '../utils/focusLock.js';
import { normalize, DARKEST_MIN, DARKEST_MAX } from '../utils/scrollFade.js';
import { fade } from './fadeControls.js';

const X_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m4.5 4.5 7 7M11.5 4.5l-7 7"/></svg>';
const STEPS = [["Start", 0], ["A quarter", 0.25], ["Halfway", 0.5], ["Three quarters", 0.75], ["Fully dim", 1]];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** How dark one picture is: `darkest` percent, `at` of the way along. */
const shade = (darkest, at) => Math.round(darkest * at * 10) / 1000;

/** What decides which rows are there: when this changes the page is drawn again; anything else is brought up to date in place. */
const shapeOf = (f) => [f.on, f.by, f.except.join(",")].join("|");
/** Whether the lock stops sites being added to the list (more sites left alone is looser). */
const sitesHeld = () => lockState(getSetting("focusLocks"), "scrollFade") !== "open";

const siteChip = (host) =>
  `<button type="button" class="sp-chip site" data-site="${esc(host)}" aria-label="Stop leaving ${esc(host)} alone">${esc(host)}${X_ICON}</button>`;

const ADD_HINT = "Add a site, like docs.google.com";
const HELD_HINT = "Locked: no more sites can be left alone";
const addInput = (held) =>
  `<input class="sp-input sp-site-add" type="text" data-input="fadeAddSite" placeholder="${held ? HELD_HINT : ADD_HINT}" spellcheck="false" autocomplete="off"${held ? " disabled" : ""}>`;

function sitesRow(f) {
  const none = f.except.length ? "" : `<span class="sp-sites-none">None: every site dims</span>`;
  return `<div class="sp-sites">${f.except.map(siteChip).join("")}${none}${addInput(sitesHeld())}</div>`;
}

/** The pictures: the same photo at five points along, each with the black layer at that point's darkness. */
function previews(darkest) {
  return `<div class="sp-fade-prev" aria-hidden="true">${STEPS.map(([name, at]) =>
    `<figure><div class="sp-fade-shot"><img src="src/assets/saturation-preview.jpg" alt=""><i data-at="${at}" style="opacity:${shade(darkest, at)}"></i></div><figcaption>${name}</figcaption></figure>`
  ).join("")}</div>`;
}

/** The section. `note` and `lock` are the Fade row's text under its title and the lock beside it (pages.js has both). */
export function scrollFadeSection(note, lock) {
  const f = fade();
  const rows = [
    row("Fade", note, select("fade", labelOf("fade")) + lock),
    row("Dim by", "What counts toward the dimming", select("fadeBy", labelOf("fadeBy"))),
  ];
  if (f.by !== "distance") rows.push(row("Fully dim after", "Of scrolling, on all sites together", select("fadeMinutes", labelOf("fadeMinutes"))));
  if (f.by !== "time") rows.push(row(f.by === "distance" ? "Fully dim after scrolling" : "Or after scrolling", "One screen is one window height. Endless feeds count the same", select("fadeScreens", labelOf("fadeScreens"))));
  rows.push(
    row("Darkest it gets", "How dim the page is at the end", slider("fadeDarkest", f.darkest, DARKEST_MIN, DARKEST_MAX)),
    row("Rest to clear", "Stop scrolling this long and a page that is not fully dim comes back", select("fadeRest", labelOf("fadeRest"))),
    row("Wait once fully dim", "It stays fully dim this long, whether you keep scrolling or stop", select("fadeWait", labelOf("fadeWait"))),
    row("Leave these sites alone", "Never counted, never dimmed. Every other site works together", ""),
    sitesRow(f),
    previews(f.darkest),
  );
  return section("Scroll fade", [card(rows).replace('class="sp-card"', `class="sp-card" data-fadeshape="${esc(shapeOf(f))}"`)]);
}

/** The pictures at a darkness (percent), in place. */
export function paintFadePreview(content, darkest) {
  content.querySelectorAll(".sp-fade-shot i").forEach((layer) => { layer.style.opacity = String(shade(darkest, Number(layer.dataset.at))); });
}

/** The add-a-site field with or without the lock on it, in place. */
export function paintFadeSites(content) {
  const held = sitesHeld(), input = content.querySelector('[data-input="fadeAddSite"]');
  if (!input || input.disabled === held) return;
  input.disabled = held;
  input.placeholder = held ? HELD_HINT : ADD_HINT;
}

/** The section brought up to date after the setting changed, without drawing the page again: the slider and the pictures.
    False when rows must come or go (it was switched on or off, or what it dims by or the list of sites changed), or the
    section is not on screen: the page is drawn again. */
export function showFade(content, value) {
  const card = content.querySelector("[data-fadeshape]");
  const f = normalize(value);
  if (!card || card.dataset.fadeshape !== shapeOf(f)) return false;
  const sl = content.querySelector('[data-slider="fadeDarkest"]');
  if (sl && document.activeElement !== sl) {
    sl.value = String(f.darkest);
    const out = sl.closest(".sp-slider-wrap").querySelector(".sp-slider-val");
    if (out) out.textContent = f.darkest + "%";
  }
  paintFadePreview(content, sl && document.activeElement === sl ? Number(sl.value) : f.darkest);
  paintFadeSlider(content);
  for (const key of ["fade", "fadeBy", "fadeMinutes", "fadeScreens", "fadeRest", "fadeWait"]) {
    const label = content.querySelector(`[data-select="${key}"] span`);
    if (label) label.textContent = labelOf(key);
  }
  return true;
}

/** The slider's lightest value now (it can only go darker while the lock holds), in place. */
export function paintFadeSlider(content) {
  const sl = content.querySelector('[data-slider="fadeDarkest"]');
  if (sl) sl.min = String(CONTROLS.fadeDarkest.min());
}
