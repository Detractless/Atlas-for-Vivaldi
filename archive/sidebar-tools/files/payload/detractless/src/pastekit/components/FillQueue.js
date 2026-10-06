// content/fillQueue.js — FillQueue class (§C4).
// Flags items instead of removing them (FlowClip pattern); cursor over immutable list.
import { insertText } from './InsertText.js';

export class FillQueue {
  constructor(snippets) {
    this.items = (snippets || []).map(s => Object.assign({}, s, { filled: false }));
    this.cursor = 0;
    this._listeners = { advance: [], done: [], cancel: [] };
  }
  on(evt, fn) { (this._listeners[evt] || (this._listeners[evt] = [])).push(fn); return this; }
  _emit(evt, payload) { for (const fn of (this._listeners[evt] || [])) fn(payload); }
  get current()   { return this.items[this.cursor] || null; }
  get remaining() { return this.items.length - this.cursor; }
  get isDone()    { return this.cursor >= this.items.length; }

  fillNext(targetElement) {
    const item = this.current;
    if (!item) return null;
    // Insert at the caret (where the user clicked) — never select-all first,
    // so refilling a field appends instead of wiping existing content.
    if (!insertText(targetElement, item.text, item.html)) return null;
    item.filled = true;
    this.cursor++;
    this._emit('advance', { item, cursor: this.cursor, total: this.items.length });
    if (this.isDone) this._emit('done', {});
    return item;
  }
  reset()  { this.cursor = 0; this.items.forEach(i => { i.filled = false; }); }
  cancel() { this._emit('cancel', {}); }
}
