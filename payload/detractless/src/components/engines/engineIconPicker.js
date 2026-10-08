// src/components/engines/engineIconPicker.js — the two-layer icon picker of the
// Add Engine form: layer 1 picks the icon type (SVG file or acronym), layer 2
// takes the file or the letters and colour. The choice lives in iconChoice until
// the form is submitted (engineModal.js handleAddEngine).

/** What the user picked for the engine being added. resetIconChoice() clears it. */
export const iconChoice = { type: 'file', file: null, acronym: { text: '', color: '#3b82f6' } };

export function resetIconChoice() {
  iconChoice.type = 'file';
  iconChoice.file = null;
  iconChoice.acronym = { text: '', color: '#3b82f6' };
}

/* ── Popup dialog builder ─────────────────────────────────────────── */

const DIALOG_CLASS = 'engine-popup-dialog';

function closeAllEngineDialogs() {
  document.querySelectorAll('.' + DIALOG_CLASS).forEach(n => n.remove());
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className  = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function buildEngineDialog({ title, subtitle, body, foot }) {
  closeAllEngineDialogs();

  const overlay = el('div', `modal show ${DIALOG_CLASS}`);
  const card    = el('div', 'picker-card');

  card.appendChild(el('div', 'picker-title', title));
  if (subtitle) card.appendChild(el('div', 'picker-subtitle', subtitle));
  if (body) card.appendChild(body);

  if (foot && foot.length) {
    const footEl = el('div', 'picker-foot');
    foot.forEach(({ label, primary, onClick }) => {
      const btn = el('button', 'picker-btn' + (primary ? ' picker-btn--primary' : ''), label);
      btn.type = 'button';
      btn.addEventListener('click', onClick);
      footEl.appendChild(btn);
    });
    card.appendChild(footEl);
  }

  overlay.appendChild(card);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAllEngineDialogs(); });
  document.body.appendChild(overlay);
  return overlay;
}

/* ── Icon type picker — layer 1 ───────────────────────────────────── */

export function openIconTypePicker() {
  const body = el('div', 'picker-pane picker-pane--on');

  /* The options sit in a well like every other dialog list, and the current one
     is marked with the shared tick. This was the THIRD consumer of .picker-radio
     and the one I missed when deleting it: the class had no rules left, so the
     mark would have rendered as nothing at all. */
  const host = el('div', 'picker-wellhost');
  const well = el('div', 'picker-well');

  [{ type: 'file', label: 'Upload SVG' }, { type: 'acronym', label: 'Acronym' }].forEach(({ type, label }) => {
    const row = el('button', 'picker-row' + (iconChoice.type === type ? ' is-current' : ''));
    row.type = 'button';
    row.appendChild(el('span', 'picker-check'));
    const span = el('span', '', label); span.style.flex = '1';
    row.append(span);
    row.addEventListener('click', () => {
      iconChoice.type = type;
      const labelEl = document.getElementById('engine-add-icon-label');
      if (labelEl) labelEl.textContent = type === 'file' ? 'Upload SVG' : 'Acronym';
      closeAllEngineDialogs();
      setTimeout(() => openIconInputPicker(type), 80);
    });
    well.appendChild(row);
  });
  host.appendChild(well);
  body.appendChild(host);

  buildEngineDialog({ title: 'Icon type', subtitle: 'How the engine icon is provided', body, foot: [] });
}

/* ── Icon input picker — layer 2 ──────────────────────────────────── */

function openIconInputPicker(type) {
  const body = el('div', 'picker-fieldwrap');
  let inputEl;

  if (type === 'file') {
    inputEl = document.createElement('input');
    inputEl.type = 'file'; inputEl.accept = '.svg';
    inputEl.style.display = 'none';
    const proxyBtn = document.createElement('button');
    proxyBtn.className = 'picker-btn';
    proxyBtn.type = 'button';
    proxyBtn.style.width = '100%';
    proxyBtn.textContent = 'Select SVG File';
    proxyBtn.addEventListener('click', () => inputEl.click());
    inputEl.addEventListener('change', () => {
      const file = inputEl.files?.[0];
      proxyBtn.textContent = file ? file.name : 'Select SVG File';
    });
    body.append(inputEl, proxyBtn);
  } else {
    const row = el('div'); row.style.cssText = 'display:flex;gap:10px;align-items:center;';
    inputEl = document.createElement('input');
    inputEl.type = 'text'; inputEl.maxLength = 2; inputEl.placeholder = 'e.g. YT';
    inputEl.className = 'picker-field'; inputEl.value = iconChoice.acronym.text; inputEl.style.flex = '1';
    const colorInput = document.createElement('input');
    colorInput.type = 'color'; colorInput.value = iconChoice.acronym.color;
    colorInput.className = 'color-picker-circle'; colorInput.style.flexShrink = '0';
    colorInput.addEventListener('input', () => { iconChoice.acronym.color = colorInput.value; });
    row.append(inputEl, colorInput); body.appendChild(row);
  }

  buildEngineDialog({
    title: type === 'file' ? 'Upload SVG' : 'Acronym',
    subtitle: type === 'acronym' ? 'Up to 2 letters and a colour' : undefined,
    body,
    foot: [
      { label: 'Back', onClick: () => { closeAllEngineDialogs(); setTimeout(() => openIconTypePicker(), 80); } },
      { label: 'Done', primary: true, onClick: () => {
        if (type === 'file') { iconChoice.file = inputEl.files?.[0] || null; }
        else { iconChoice.acronym.text = inputEl.value.trim(); }
        closeAllEngineDialogs();
      }},
    ],
  });

  if (type === 'acronym') requestAnimationFrame(() => { inputEl.focus(); inputEl.select(); });
}
