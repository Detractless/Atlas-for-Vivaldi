// src/services/snippetCsv.js — the snippet CSV inside a .detractless archive
// (shared/pastekit/lists/snippets.csv). Used by detractlessFormat.js only.

export const CSV_COLS = ['name', 'description', 'contentText', 'contentHtml', 'tags', 'folderXid', 'createdAt', 'updatedAt'];

function csvEscape(val) {
  const s = String(val == null ? '' : val);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r'))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function toCsv(rows) {
  const lines = [CSV_COLS.map(csvEscape).join(',')];
  for (const row of rows) lines.push(CSV_COLS.map(h => csvEscape(row[h])).join(','));
  return lines.join('\r\n');
}

function advanceQuoted(state, text, i) {
  const ch = text[i];
  if (ch !== '"') { state.field += ch; return i + 1; }
  if (text[i + 1] === '"') { state.field += '"'; return i + 2; }
  state.inQuote = false;
  return i + 1;
}

function flushRow(state, rows, text, i) {
  state.row.push(state.field);
  state.field = '';
  let next = i + 1;
  if (text[i] === '\r' && text[i + 1] === '\n') next++;
  if (state.row.some(c => c !== '')) rows.push(state.row);
  state.row = [];
  return next;
}

export function parseCsv(text) {
  const rows = [];
  const state = { row: [], field: '', inQuote: false };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (state.inQuote) { i = advanceQuoted(state, text, i); continue; }
    if (ch === '"') { state.inQuote = true; i++; continue; }
    if (ch === ',') { state.row.push(state.field); state.field = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') { i = flushRow(state, rows, text, i); continue; }
    state.field += ch;
    i++;
  }
  if (state.field || state.row.length) {
    state.row.push(state.field);
    if (state.row.some(c => c !== '')) rows.push(state.row);
  }
  return rows;
}
