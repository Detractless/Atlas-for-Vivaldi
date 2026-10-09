/* The add popup's HTML (addPopup.js wires it). Every value that came from the
   user (page names, group names, a page being edited) goes through esc(). */

import { NEW_GROUP } from '../../utils/addBookmarkFlow.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function textField(name, label, value, placeholder, extra = '') {
  return `<label class="add-popup-field"${extra}>
      <span class="add-popup-label">${label}</span>
      <input class="add-popup-input" type="text" data-field="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">
      <span class="add-popup-error" data-error-for="${name}" role="alert"></span>
    </label>`;
}

function selectField(name, label, optionsHtml) {
  return `<label class="add-popup-field add-popup-field--select">
      <span class="add-popup-label">${label}</span>
      <select class="add-popup-input" data-field="${name}">${optionsHtml}</select>
      <span class="add-popup-error" data-error-for="${name}" role="alert"></span>
    </label>`;
}

function pageOptions(pages, startPage) {
  if (!pages.length) return '<option value="">No pages yet</option>';
  return pages.map((t) => `<option value="${esc(t.id)}"${t.id === startPage ? ' selected' : ''}>${esc(t.label)}</option>`).join('');
}

/** The group list for one page: its groups, then "New group…". */
export function groupOptions(groups) {
  return '<option value="">Choose a group</option>' +
    groups.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('') +
    `<option value="${esc(NEW_GROUP)}">New group…</option>`;
}

/**
 * @param {object} o
 * @param {object|null} o.editing  the page being edited, or null when adding
 * @param {Array} o.pages  bookmark pages, in switcher order
 * @param {*} o.startPage  the page chosen at first
 * @param {number} o.pageCount  used for the new page's placeholder name
 */
export function popupMarkup({ editing, pages, startPage, pageCount }) {
  const modes = editing ? '' : `
    <div class="add-popup-modes" role="group" aria-label="What to add">
      <button type="button" class="add-popup-mode" data-add-mode="bookmark" aria-pressed="true">Bookmark</button>
      <button type="button" class="add-popup-mode" data-add-mode="page" aria-pressed="false">Page</button>
    </div>`;
  const bookmarkFields = editing ? '' : `
    <div class="picker-well add-popup-well" data-mode-fields="bookmark">
      ${textField('name', 'Name', '', 'GitHub')}
      ${textField('url', 'URL', '', 'https://example.com')}
      ${selectField('page', 'Page', pageOptions(pages, startPage))}
      ${selectField('group', 'Group', groupOptions([]))}
      ${textField('newGroup', 'New group name', '', 'WORK', ' data-newgroup hidden')}
    </div>`;
  const pageFields = `
    <div class="picker-well add-popup-well" data-mode-fields="page"${editing ? '' : ' hidden'}>
      ${textField('pageName', 'Name', editing ? editing.label : '', `Page ${pageCount}`)}
      ${textField('sub', 'Subtitle', editing ? (editing.sub || '') : '', 'Three to five words')}
    </div>
    <div class="add-popup-count" aria-live="polite"></div>`;
  return `
    <div class="picker-card add-popup-card">
      <div class="picker-title">${editing ? 'Edit page' : 'Add'}</div>
      ${modes}
      ${bookmarkFields}
      ${pageFields}
      <div class="picker-foot">
        <button type="button" class="picker-btn" data-add-cancel>Cancel</button>
        <button type="button" class="picker-btn picker-btn--primary" data-add-save>${editing ? 'Save' : 'Add'}</button>
      </div>
      <button type="button" class="close-btn picker-hidden-close" hidden></button>
    </div>`;
}
