// src/pages/sidepanel/panelDialog.js — THE way a panel view opens a dialog.
//
// Spec 004. The panel had grown its own dialog shapes (a two-button card, then
// slide-over strips before that) while the new tab already owned a dialog system
// the user explicitly likes: the picker. This module renders that system, in the
// picker vocabulary that now lives in styles/components.css, so the bookmark
// dialogs on the new tab and every panel dialog are one component.
//
// Like panelScreen.js before it, this is an API rather than a convention: a view
// that wants a dialog CANNOT rebuild the shell wrong, because it never writes
// the shell. It hands over rows and gets the whole contract: the blur overlay,
// Escape and backdrop close, single-field input panes with Back returning to
// the MENU (one dialog with panes, not a pile of dialogs), and danger rows that
// arm in place to "Delete, are you sure?" instead of ever showing a filled
// destructive button.

import { attachScrollAffordance } from '../../components/shared/scrollAffordance.js';

/* The scroll affordance for a well that overflows. base.css hides scrollbars
   everywhere, so a scrolling well owes the R-010 substitute exactly as the
   panel's lists do; without it a fifteen-option picker scrolls with no cue at
   all. Attached per dialog, since each one is built and thrown away. */
function wellAffordance(host, well) {
  requestAnimationFrame(() => {
    if (well.scrollHeight <= well.clientHeight + 1) return;   // nothing hidden
    attachScrollAffordance(well, { host, items: '.picker-row' });
  });
}

/* One host for the whole panel, created once. .modal and .picker-card are the
   shared vocabulary; nothing here styles anything. */
const modal = document.createElement('div');
/* sp-modal is the SCALE HOOK, not decoration. The .picker-* vocabulary is shared
   with the new tab since spec 004, where a 320px card floats in a ~1400px
   viewport and reads correctly. In a 380px panel that same card covers 84% of
   the surface and stops reading as a dialog at all. The panel therefore scales
   it down through this marker (see .sp-modal in styles/panel.css) rather than by
   editing the shared rules, which would shrink the bookmark dialogs too. */
modal.className = 'modal sp-modal';
const card = document.createElement('div');
card.className = 'picker-card';
modal.appendChild(card);
document.body.appendChild(modal);

let activeSpec = null;

function close() {
  activeSpec = null;
  modal.classList.remove('show');
  card.replaceChildren();
}

modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('show')) close();
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconSpan(svg) {
  const span = el('span', 'picker-row-icon');
  span.innerHTML = svg || '';
  return span;
}

/** The menu pane: title, optional subtitle, one WELL of rows.
 *
 *  The rows sit in an inset canvas well rather than straight on the card, and
 *  the well caps its own height and scrolls (see .picker-well). Before that cap
 *  a fifteen-option picker rendered fifteen rows and grew taller than the panel
 *  it floated on. */
function renderMenu(spec) {
  card.replaceChildren();
  card.appendChild(el('div', 'picker-title', spec.title));
  if (spec.subtitle) card.appendChild(el('div', 'picker-subtitle', spec.subtitle));

  const host = el('div', 'picker-wellhost');
  const well = el('div', 'picker-well');
  for (const row of spec.rows) {
    well.appendChild(row.danger ? dangerRow(row) : actionRow(row));
  }
  host.appendChild(well);
  card.appendChild(host);
  wellAffordance(host, well);
}

function actionRow(row) {
  const btn = el('button', 'picker-row');
  btn.type = 'button';
  /* A CHOICE row marks the current answer instead of carrying an icon. The mark
     is a filled dot in a muted well (.sp-radio), never a ring: the new tab's own
     radio draws its ring with a border, and UI-RULES bans lines, so promoting
     that technique into the panel would have carried the ban straight into new
     code. Surfaces do the same job. */
  if ('mark' in row) {
    /* A CHOICE row: the tick slot is reserved on every row so the labels line
       up, and only the current one draws anything. */
    if (row.mark) btn.classList.add('is-current');
    btn.appendChild(el('span', 'picker-check'));
  } else {
    btn.appendChild(iconSpan(row.icon));
  }
  btn.appendChild(el('span', null, row.label));
  btn.addEventListener('click', () => {
    if (row.input) { renderInput(row); return; }
    close();
    if (row.onPick) row.onPick();
  });
  return btn;
}

/* The armed two-step, byte-for-byte the bookmark dialog's move: first click
   arms the row itself, drops its icon, tints with the error background; the
   second click commits. Walking away (Escape, backdrop, Back) disarms by
   destroying the pane. */
function dangerRow(row) {
  const btn = el('button', 'picker-row picker-row--danger');
  btn.type = 'button';
  btn.appendChild(iconSpan(row.icon));
  btn.appendChild(el('span', null, row.label));

  let armed = false;
  btn.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      btn.classList.add('picker-row--armed');
      btn.replaceChildren(el('span', null, row.confirmLabel || 'Delete, are you sure?'));
      return;
    }
    close();
    row.onPick();
  });
  return btn;
}

/** A single-field input pane: title, field, error line, Back and Save. */
function renderInput(row) {
  const spec = activeSpec;
  card.replaceChildren();
  card.appendChild(el('div', 'picker-title', row.paneTitle || row.label));

  const wrap = el('div', 'picker-fieldwrap');
  const field = el('input', 'picker-field');
  field.type = 'text';
  field.autocomplete = 'off';
  field.value = row.input.value || '';
  if (row.input.placeholder) field.placeholder = row.input.placeholder;
  const error = el('div', 'picker-error');
  wrap.append(field, error);
  card.appendChild(wrap);

  /* async, for the same reason the bookmark dialog's commit is: a save may need
     to validate against stored state, and without the await a rejection string
     would read as success and close the dialog. A string result is the reason
     the value was refused; anything else means saved. */
  const commit = async () => {
    const result = await row.input.onSave(field.value);
    if (typeof result === 'string') {
      error.textContent = result;
      error.classList.add('picker-error--show');
      field.focus();
      return;
    }
    close();
  };

  field.addEventListener('input', () => error.classList.remove('picker-error--show'));
  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
  });

  const foot = el('div', 'picker-foot');
  const back = el('button', 'picker-btn', 'Back');
  back.type = 'button';
  back.addEventListener('click', () => renderMenu(spec));
  const saveBtn = el('button', 'picker-btn picker-btn--primary', 'Save');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', commit);
  foot.append(back, saveBtn);
  card.appendChild(foot);

  field.focus();
}

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} [spec.subtitle]
 * @param {Array<{icon?: string, label: string, paneTitle?: string, mark?: boolean,
 *   onPick?: () => void, danger?: boolean, confirmLabel?: string,
 *   input?: {value?: string, placeholder?: string,
 *            onSave: (value: string) => Promise<string|void>|string|void}}>} spec.rows
 */
export function openPanelDialog(spec) {
  activeSpec = spec;
  renderMenu(spec);
  modal.classList.add('show');
}
