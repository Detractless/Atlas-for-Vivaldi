/* The add popup's HTML (addPopup.js wires it): the frame, and each screen drawn from what has been
   answered so far. Every value that came from the user (names, pages, groups, addresses) goes through esc(). */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CHEV = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
const TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';
const SEARCH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12"/></svg>';

/** The frame: a title (the question), the step, one screen, and the buttons. */
export function frameMarkup({ title, step, total, body, left, right }) {
  const dots = total > 1 ? `<span class="add-popup-dots" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i${i === step - 1 ? ' class="on"' : ''}></i>`).join('')}</span>` : '';
  const stepText = total > 1 ? `<div class="add-popup-step">Step ${step} of ${total} ${dots}</div>` : '';
  return `
    <div class="picker-card add-popup-card">
      <div class="add-popup-head"><div class="add-popup-title" data-title>${esc(title)}</div>${stepText}</div>
      <div class="add-popup-body">${body}</div>
      <div class="add-popup-foot">${left}<div class="add-popup-foot-right">${right}</div></div>
    </div>`;
}

export const button = (attr, label, primary = false, disabled = false) =>
  `<button type="button" class="add-popup-btn${primary ? ' add-popup-btn--primary' : ''}" ${attr}${disabled ? ' disabled' : ''}>${esc(label)}</button>`;

const errorSlot = (name) => `<span class="add-popup-error" data-error-for="${name}" role="alert"></span>`;

/** The address-bar card: the field, a faint line, the pills, and a hint, as one shape. */
function joinedCard({ field, icon, value, placeholder, pillsHtml, hint, hasPills }) {
  return `<div class="ap-card${hasPills ? ' ap-card--open' : ''}" data-card="${field}">
      <div class="ap-field"><span class="ap-icon">${icon}</span>
        <input class="ap-input" type="text" data-field="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"></div>
      <div class="ap-drop" data-drop="${field}"${hasPills ? '' : ' hidden'}>${pillsHtml}<div class="ap-hint" data-hint>${hint}</div></div>
    </div>${errorSlot(field)}`;
}

export const pillsMarkup = (pills, at, attr) =>
  `<div class="ap-pills" role="listbox">${pills.map((p, i) =>
    `<button type="button" class="ap-pill" role="option" ${attr}="${esc(p.value)}" aria-selected="${i === at}">${esc(p.label)}</button>`).join('')}</div>`;

/** What sits under the address field: the site pills and the hint. */
export const siteDrop = (pills, at) => ({
  pillsHtml: pillsMarkup(pills, at, 'data-site'),
  hint: pills.length ? `Enter picks ${esc(pills[Math.max(at, 0)].label)} &middot; &uarr;&darr; to move` : '',
});

/** Screen 1 of a bookmark: which website. */
export function websiteScreen({ urlText, pills, at }) {
  const drop = siteDrop(pills, at);
  return joinedCard({ field: 'url', icon: SEARCH, value: urlText, placeholder: 'Type a website', ...drop, hasPills: pills.length > 0 });
}

/** A drop-down pill: the choice shows on it, and it opens a short list. */
export function dropdown({ key, label, value, items }) {
  const rows = items.map((it) => `<button type="button" class="ap-dd-item" role="option" data-dd-item="${key}" data-value="${esc(it.value)}" aria-selected="${String(it.value) === String(value)}">${esc(it.label)}${String(it.value) === String(value) ? TICK : ''}</button>`).join('');
  const current = items.find((it) => String(it.value) === String(value));
  const more = items.length > 5 ? `<div class="ap-dd-note">${items.length - 5} more, scroll</div>` : '';
  return `<div class="ap-dd-wrap" data-dd-wrap="${key}"><div class="ap-label">${esc(label)}</div>
      <button type="button" class="ap-dd" data-dd="${key}" aria-haspopup="listbox" aria-expanded="false"><span data-dd-label="${key}">${esc(current ? current.label : 'Choose')}</span>${CHEV}</button>
      <div class="ap-dd-menu" data-dd-menu="${key}" role="listbox" hidden><div class="ap-dd-rows">${rows}</div>${more}</div>${errorSlot(key)}</div>`;
}

/** Screen 2 of a bookmark: the name, and where it goes. */
export function placeScreen({ name, namePills, pageItems, page, groupItems, group, newGroup, showNewGroup }) {
  const nameCard = joinedCard({
    field: 'name', icon: SEARCH, value: name, placeholder: 'Name',
    pillsHtml: pillsMarkup(namePills, namePills.findIndex((p) => p.value === name), 'data-name-pill'),
    hint: 'Pick a name, or keep typing your own', hasPills: namePills.length > 0,
  });
  return `${nameCard}
    <div class="ap-cols">${dropdown({ key: 'page', label: 'Page', value: page, items: pageItems })}${dropdown({ key: 'group', label: 'Group', value: group, items: groupItems })}</div>
    <div data-newgroup${showNewGroup ? '' : ' hidden'}><div class="ap-label">New group name</div>
      <div class="ap-plain"><input class="ap-input" type="text" data-field="newGroup" value="${esc(newGroup)}" placeholder="WORK" autocomplete="off" spellcheck="false"></div>${errorSlot('newGroup')}</div>`;
}

/** A plain one-line field (page name, subtitle). */
export function plainField({ field, value, placeholder, aside = '', label = '' }) {
  return `${label ? `<div class="ap-label">${esc(label)}</div>` : ''}<div class="ap-plain"><input class="ap-input" type="text" data-field="${field}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false">${aside}</div>${errorSlot(field)}`;
}
