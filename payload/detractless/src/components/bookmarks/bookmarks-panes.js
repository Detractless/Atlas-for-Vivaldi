/* ══════════════════════════════════════════════════════════════════════
   THE PANES INSIDE A BOOKMARK DIALOG

   One row shape (icon, label, value), one input pane, one list pane and the
   arming delete row. bookmarks-dialog.js decides WHICH panes a dialog has;
   this file is how each one is drawn and behaves.
   ══════════════════════════════════════════════════════════════════════ */

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* A dialog built at runtime needs a .close-btn, because the global Escape path
   clicks one; hidden, not absent, so Escape cannot strand the dialog. */
export function hiddenCloseButton(close) {
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
  return hiddenClose;
}

export function iconSpan(svg) {
  const span = el('span', 'picker-row-icon');
  span.innerHTML = svg || '';
  return span;
}

/* A destructive row arms before it commits, the same two-step the context
   menu's showConfirm gave us. It names the count, because deleting a group
   destroys every bookmark in it and that must not look like deleting one. */
export function dangerRow(action, close) {
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

export function paneShell(action, onBack) {
  const pane = el('div', 'picker-pane');
  pane.appendChild(el('div', 'picker-title', action.paneTitle || action.label));
  return pane;
}

export function inputPane(action, close, onBack) {
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

export function listPane(action, close, onBack) {
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
