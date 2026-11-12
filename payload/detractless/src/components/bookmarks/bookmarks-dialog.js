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
import { el, hiddenCloseButton, iconSpan, dangerRow, inputPane, listPane } from './bookmarks-panes.js';

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

  const root = buildRootPane(spec, panes, showPane, close);
  panes.forEach(p => card.appendChild(p));
  card.appendChild(hiddenCloseButton(close));

  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  showPane(root);
}

/* The root pane: what was clicked, then every action as a row, in an inset well. */
function buildRootPane(spec, panes, showPane, close) {
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
  return root;
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

/** `title` is the name as the switcher shows it; `onDelete` null leaves the
    Delete row out (Home can't be deleted). */
export function openTabDialog({ title, name, sub, onRename, onSubtitle, onDelete }) {
  const actions = [
    {
      kind: 'input', label: 'Rename page', paneTitle: 'Rename page',
      icon: Icons.edit, fieldValue: name,
      save: onRename,
    },
    {
      kind: 'input', label: 'Edit subtitle', paneTitle: 'Edit subtitle',
      icon: Icons.edit, value: sub, fieldValue: sub, placeholder: 'Three to five words',
      save: onSubtitle,
    },
  ];
  if (onDelete) actions.push({ kind: 'danger', label: 'Delete page', icon: Icons.delete, count: 0, confirm: onDelete });
  buildDialog({ title: title || name, subtitle: 'Page', actions });
}
