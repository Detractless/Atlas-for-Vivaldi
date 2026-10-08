/* ══════════════════════════════════════════════════════════════════════
   BOOKMARK EDIT DIALOG (R-012)

   Right-clicking a group title or a bookmark opens a dialog over the
   blurred page rather than a floating context menu. Same overlay, same
   card, same dismissal paths as the settings pickers in settingsModal.js,
   because those two paths (Escape via a hidden .close-btn, and a click on
   the backdrop) are the fiddly part of any dialog and are already written.

   ONE BUILDER, TWO CALLERS. A group needs name, page and delete; a
   bookmark needs name, URL and delete. That is the same shape with a
   different field list, so buildDialog() takes a spec and the two exported
   helpers are just specs. Two hand-written dialogs would drift, which is
   the argument that put the switch in components.css and the scroll
   affordance in shared/.

   NAVIGATION, not stacking: choosing an action swaps the PANE inside the
   one card. There is never a second overlay over the first.
   ══════════════════════════════════════════════════════════════════════ */

import { Icons } from '../../constants/icons.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * @param {object} spec
 * @param {string} spec.title
 * @param {string} [spec.subtitle]
 * @param {Array}  spec.actions  each is one of:
 *   { kind: 'input', label, icon, value, fieldValue, upper?, placeholder?,
 *     paneTitle, save(value) -> true | string   (a string is an error message) }
 *   { kind: 'list',  label, icon, value, paneTitle, options: [{label, value, note}],
 *     pick(value) }
 *   { kind: 'danger', label, count, confirm() }
 */
export function buildDialog(spec) {
  // Only ever one of these on screen. A dialog covers the page, so a second
  // right-click cannot normally reach a bookmark underneath, but nothing
  // structurally prevented two overlays stacking and the second would have
  // trapped the first behind it. Scoped to this dialog's own class so a
  // settings picker is never torn down by a bookmark edit.
  document.querySelectorAll('.bookmark-dialog').forEach(node => node.remove());

  const overlay = el('div', 'modal show picker-modal bookmark-dialog');
  const card = el('div', 'picker-card');
  const close = () => overlay.remove();

  const panes = [];
  const showPane = (pane) => {
    panes.forEach(p => p.classList.toggle('picker-pane--on', p === pane));
    const field = pane.querySelector('.picker-field');
    if (field) requestAnimationFrame(() => { field.focus(); field.select(); });
  };

  // ── root pane: the action list ──────────────────────────────────────
  const root = el('div', 'picker-pane picker-pane--on');
  panes.push(root);
  root.appendChild(Object.assign(el('div', 'picker-title'), { textContent: spec.title }));
  if (spec.subtitle) root.appendChild(el('div', 'picker-subtitle', spec.subtitle));

  /* The actions sit in an inset canvas well rather than on the card itself. */
  const rootHost = el('div', 'picker-wellhost');
  const rootWell = el('div', 'picker-well');

  spec.actions.forEach(action => {
    if (action.kind === 'danger') {
      rootWell.appendChild(dangerRow(action, close));
      return;
    }
    const row = el('button', 'picker-row');
    row.type = 'button';
    row.appendChild(iconSpan(action.icon));
    row.appendChild(el('span', null, action.label));
    if (action.value) row.appendChild(el('span', 'picker-row-value', action.value));

    const pane = action.kind === 'input'
      ? inputPane(action, close, () => showPane(root))
      : listPane(action, close, () => showPane(root));
    panes.push(pane);
    row.addEventListener('click', () => showPane(pane));
    rootWell.appendChild(row);
  });
  rootHost.appendChild(rootWell);
  root.appendChild(rootHost);

  panes.forEach(p => card.appendChild(p));

  // The global Escape path clicks a modal's .close-btn, so a dialog built at
  // runtime needs one or Escape would strand it on screen. Hidden, not absent.
  const hiddenClose = el('button', 'close-btn picker-hidden-close');
  hiddenClose.type = 'button';
  /* HIDDEN AS AN ATTRIBUTE, not only as a class. This element carries two
     single-class rules that disagree: .close-btn paints a 44px disc and
     .picker-hidden-close removes it. Equal specificity means SHEET ORDER decides,
     so when .picker-hidden-close was promoted into components.css (which loads
     before newtab.css) the disc started winning and a stray circle appeared in
     the corner of every picker dialog. The attribute is answered by
     `[hidden] { display: none !important }` in base.css, which no author rule can
     outrank, so this cannot come back if the sheets are reordered again.
     .click() still works on a hidden element, which is what the global Escape
     path relies on. */
  hiddenClose.hidden = true;
  hiddenClose.addEventListener('click', close);
  card.appendChild(hiddenClose);

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  showPane(root);
}

function iconSpan(svg) {
  const span = el('span', 'picker-row-icon');
  span.innerHTML = svg || '';
  return span;
}

/* A destructive row arms before it commits, the same two-step the context
   menu's showConfirm gave us. It names the count, because deleting a group
   destroys every bookmark in it and that must not look like deleting one. */
function dangerRow(action, close) {
  const row = el('button', 'picker-row picker-row--danger');
  row.type = 'button';
  row.appendChild(iconSpan(action.icon));
  const label = el('span', null, action.label);
  row.appendChild(label);

  let armed = false;
  row.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      row.classList.add('picker-row--armed');
      row.replaceChildren(el('span', null,
        action.count > 1 ? `Delete ${action.count} bookmarks?` : 'Delete, are you sure?'));
      return;
    }
    action.confirm();
    close();
  });
  return row;
}

function paneShell(action, onBack) {
  const pane = el('div', 'picker-pane');
  pane.appendChild(el('div', 'picker-title', action.paneTitle || action.label));
  return pane;
}

function inputPane(action, close, onBack) {
  const pane = paneShell(action, onBack);

  const wrap = el('div', 'picker-fieldwrap');
  const field = el('input', 'picker-field' + (action.upper ? ' picker-field--upper' : ''));
  field.type = 'text';
  field.value = action.fieldValue || '';
  if (action.placeholder) field.placeholder = action.placeholder;
  const error = el('div', 'picker-error');
  wrap.append(field, error);
  pane.appendChild(wrap);

  /* async, because a save may need to look something up before it can accept
     the value. R-017 added exactly that: the new-group name is checked against
     the chosen page's existing groups. Without the await, `result` would be a
     Promise, never a string, so every async validation failure would have read
     as success and closed the dialog. */
  const commit = async () => {
    const result = await action.save(field.value);
    // A string result is a reason it could not be saved. Renaming a group to a
    // name that already exists used to fail SILENTLY (bookmarks.js returned
    // early), which in a dialog would read as the save button being broken.
    if (typeof result === 'string') {
      error.textContent = result;
      error.classList.add('picker-error--show');
      field.focus();
      return;
    }
    close();
  };

  field.addEventListener('input', () => error.classList.remove('picker-error--show'));
  field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
  });

  const foot = el('div', 'picker-foot');
  const back = el('button', 'picker-btn', 'Back');
  back.type = 'button';
  back.addEventListener('click', onBack);
  const save = el('button', 'picker-btn picker-btn--primary', 'Save');
  save.type = 'button';
  save.addEventListener('click', commit);
  foot.append(back, save);
  pane.appendChild(foot);
  return pane;
}

function listPane(action, close, onBack) {
  const pane = paneShell(action, onBack);
  /* Options in a well too, so a long list (every page, every group) scrolls
     inside a fixed-size dialog instead of growing one. */
  const host = el('div', 'picker-wellhost');
  const well = el('div', 'picker-well');
  action.options.forEach(option => {
    const row = el('button', 'picker-row');
    row.type = 'button';
    row.appendChild(el('span', null, option.label));
    if (option.note) row.appendChild(el('span', 'picker-row-value', option.note));
    row.addEventListener('click', () => { action.pick(option.value); close(); });
    well.appendChild(row);
  });
  if (!action.options.length) {
    well.appendChild(el('div', 'picker-empty', action.emptyText || 'Nothing to choose'));
  }
  host.appendChild(well);
  pane.appendChild(host);
  const foot = el('div', 'picker-foot');
  const back = el('button', 'picker-btn', 'Back');
  back.type = 'button';
  back.addEventListener('click', onBack);
  foot.appendChild(back);
  pane.appendChild(foot);
  return pane;
}

/* ── Single-pane pickers (R-015) ─────────────────────────────────────────
   The add flow needs a picker that IS a list, with no root pane of action
   rows in front of it: a value row on the Add Bookmark subpage is already the
   thing you clicked, so making you click a second row to reach the choices
   would be a pane for nothing.

   These are the existing panes with a one-pane shell around them, NOT a third
   picker implementation. settingsModal.openPickerDialog and
   engineModal.buildEngineDialog are the two that already exist; a fourth hand
   rolled card is the drift this file was created to prevent. Back closes,
   because at one pane deep there is nowhere behind to go. */
function onePaneDialog(buildPane) {
  document.querySelectorAll('.bookmark-dialog').forEach(node => node.remove());

  const overlay = el('div', 'modal show picker-modal bookmark-dialog');
  const card = el('div', 'picker-card');
  const close = () => overlay.remove();

  const pane = buildPane(close);
  pane.classList.add('picker-pane--on');
  card.appendChild(pane);

  // Same reason as buildDialog: the global Escape path clicks a .close-btn.
  const hiddenClose = el('button', 'close-btn picker-hidden-close');
  hiddenClose.type = 'button';
  /* HIDDEN AS AN ATTRIBUTE, not only as a class. This element carries two
     single-class rules that disagree: .close-btn paints a 44px disc and
     .picker-hidden-close removes it. Equal specificity means SHEET ORDER decides,
     so when .picker-hidden-close was promoted into components.css (which loads
     before newtab.css) the disc started winning and a stray circle appeared in
     the corner of every picker dialog. The attribute is answered by
     `[hidden] { display: none !important }` in base.css, which no author rule can
     outrank, so this cannot come back if the sheets are reordered again.
     .click() still works on a hidden element, which is what the global Escape
     path relies on. */
  hiddenClose.hidden = true;
  hiddenClose.addEventListener('click', close);
  card.appendChild(hiddenClose);

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return close;
}

/** A flat list of choices. `pick` receives the chosen option's value. */
export function openListPicker({ title, subtitle, options, emptyText, pick, back }) {
  onePaneDialog((close) => {
    /* `back` turns the foot's Back button from "close" into "go to the previous
       step". One-pane dialogs used to hardwire it to close because at one pane
       deep there was nowhere behind to go; the sequential add flow (R-021 pass)
       is a chain of one-pane dialogs, so for it there is. Absent, the old
       behaviour stands and Back closes. */
    const onBack = back ? () => { close(); back(); } : close;
    const pane = listPane({ paneTitle: title, options, emptyText, pick }, close, onBack);
    /* paneShell renders only a title, so the subtitle is inserted behind it
       here rather than teaching every pane about a field one caller wants. */
    if (subtitle) pane.insertBefore(el('div', 'picker-subtitle', subtitle), pane.children[1]);
    return pane;
  });
}

/** One text field. `save` returns true, or a string to show as an error. */
export function openInputPicker({ title, value, placeholder, upper, save, back }) {
  onePaneDialog((close) => {
    // See openListPicker: `back` makes this one link in a chain rather than a leaf.
    const onBack = back ? () => { close(); back(); } : close;
    const pane = inputPane(
      { paneTitle: title, fieldValue: value, placeholder, upper, save },
      close, onBack,
    );
    // buildDialog focuses through showPane on every pane switch; a one-pane
    // dialog never switches, so it has to do this itself or the field opens
    // unfocused and the caret gives no sign of where typing goes.
    const field = pane.querySelector('.picker-field');
    if (field) requestAnimationFrame(() => { field.focus(); field.select(); });
    return pane;
  });
}

/* ── The two specs ───────────────────────────────────────────────────── */

export function openGroupDialog({ name, count, pages, currentPageLabel, onRename, onMove, onDelete }) {
  buildDialog({
    title: name,
    subtitle: count === 1 ? '1 bookmark' : `${count} bookmarks`,
    actions: [
      {
        kind: 'input', label: 'Rename group', paneTitle: 'Rename group',
        icon: Icons.edit, fieldValue: name, upper: true,
        save: onRename,
      },
      {
        kind: 'list', label: 'Move to page', paneTitle: 'Move to page',
        icon: Icons.move, value: currentPageLabel,
        options: pages, emptyText: 'There is only one page',
        pick: onMove,
      },
      { kind: 'danger', label: 'Delete group', icon: Icons.delete, count, confirm: onDelete },
    ],
  });
}

export function openBookmarkItemDialog({ name, url, onRename, onEditUrl, onDelete }) {
  buildDialog({
    title: name,
    subtitle: url,
    actions: [
      {
        kind: 'input', label: 'Rename', paneTitle: 'Rename bookmark',
        icon: Icons.edit, fieldValue: name,
        save: onRename,
      },
      {
        kind: 'input', label: 'Edit URL', paneTitle: 'Edit URL',
        icon: Icons.link, fieldValue: url, placeholder: 'https://example.com',
        save: onEditUrl,
      },
      { kind: 'danger', label: 'Delete bookmark', icon: Icons.delete, count: 1, confirm: onDelete },
    ],
  });
}

export function openTabDialog({ name, onRename, onDelete }) {
  buildDialog({
    title: name,
    subtitle: 'Page',
    actions: [
      {
        kind: 'input', label: 'Rename page', paneTitle: 'Rename page',
        icon: Icons.edit, fieldValue: name,
        save: onRename,
      },
      { kind: 'danger', label: 'Delete page', icon: Icons.delete, count: 0, confirm: onDelete },
    ],
  });
}
