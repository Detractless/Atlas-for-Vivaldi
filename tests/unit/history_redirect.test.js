'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../../src/modules/33-chromium-pages.js'), 'utf8');
const flyout = fs.readFileSync(path.join(__dirname, '../../src/modules/07-profile-menu.js'), 'utf8');
const HISTORY = 'chrome://history/';
const BOOKMARKS = 'chrome://bookmarks/';

// A browser with the given tabs; records what the module asks it to do.
function open(tabs) {
  const dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  const calls = [];
  const fire = { created: [], updated: [] };
  w.vivaldiWindowId = 1;
  w.chrome = {
    runtime: {},
    tabs: {
      onCreated: { addListener: (f) => fire.created.push(f) },
      onUpdated: { addListener: (f) => fire.updated.push(f) },
      query: (q, cb) => { calls.push(['query', q]); cb(tabs.filter((t) => q.windowId === undefined || t.windowId === q.windowId)); },
      update: (id, props, cb) => { calls.push(['update', id, props]); if (cb) cb(); },
      remove: (id, cb) => { calls.push(['remove', id]); if (cb) cb(); },
      create: (props, cb) => { calls.push(['create', props]); if (cb) cb(); },
    },
  };
  w.eval('var Atlas = {};\n' + source + '\nwindow.Atlas = Atlas;');
  return { w, calls, fire, actions: () => JSON.parse(JSON.stringify(calls.filter((c) => c[0] !== 'query'))) }; // plain objects: the page's own realm otherwise fails deepEqual
}
const tab = (id, url, extra) => Object.assign({ id, windowId: 1, url }, extra);

test("a tab that opens Vivaldi's history page becomes Chromium's", () => {
  const { fire, actions } = open([tab(7, 'https://a.test/'), tab(8, 'vivaldi://history/')]);
  fire.created[0](tab(8, 'vivaldi://history/'));
  assert.deepEqual(actions(), [['update', 8, { url: HISTORY }]]);
});

test('every way Vivaldi names its history page is caught', () => {
  for (const u of ['vivaldi://history', 'vivaldi://history/', 'vivaldi://history/?q=cats',
    'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/startpage?section=history']) {
    const { fire, actions } = open([tab(8, u)]);
    fire.created[0](tab(8, u));
    assert.deepEqual(actions(), [['update', 8, { url: HISTORY }]], u);
  }
  const { fire, actions } = open([tab(8, '')]);
  fire.created[0](tab(8, '', { pendingUrl: 'vivaldi://history/' }));
  assert.equal(actions().length, 1, 'a tab still loading is caught by its pending address');
});

test('other pages, and Chromium history itself, are left alone', () => {
  for (const u of ['https://a.test/', 'vivaldi://settings', 'vivaldi://downloads', 'vivaldi://historyx',
    'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/startpage?section=notes', HISTORY, BOOKMARKS,
    'vivaldi://bookmarksx', 'https://a.test/?next=vivaldi://history', 'https://a.test/?next=vivaldi://bookmarks']) {
    const { fire, actions } = open([tab(8, u)]);
    fire.created[0](tab(8, u));
    fire.updated[0](8, { url: u }, tab(8, u));
    assert.deepEqual(actions(), [], u);
  }
});

test('navigating an existing tab to the page is caught too', () => {
  const { fire, actions } = open([tab(5, 'vivaldi://history/')]);
  fire.updated[0](5, { url: 'vivaldi://history/' }, tab(5, 'vivaldi://history/'));
  assert.deepEqual(actions(), [['update', 5, { url: HISTORY }]]);
});

test('an open history tab is reused and the new one closed', () => {
  const { fire, actions } = open([tab(3, HISTORY), tab(9, 'vivaldi://history/')]);
  fire.created[0](tab(9, 'vivaldi://history/'));
  assert.deepEqual(actions(), [['update', 3, { active: true }], ['remove', 9]]);
});

test('a history tab in another window is not reused', () => {
  const { fire, actions } = open([tab(3, HISTORY, { windowId: 2 }), tab(9, 'vivaldi://history/')]);
  fire.created[0](tab(9, 'vivaldi://history/'));
  assert.deepEqual(actions(), [['update', 9, { url: HISTORY }]]);
});

test('created and updated firing for one tab acts once', () => {
  const { fire, actions } = open([tab(8, 'vivaldi://history/')]);
  fire.created[0](tab(8, 'vivaldi://history/'));
  fire.updated[0](8, { url: 'vivaldi://history/' }, tab(8, 'vivaldi://history/'));
  assert.equal(actions().length, 1);
});

test('the profile flyout opens history, reusing one that is open', () => {
  const a = open([tab(3, HISTORY), tab(4, 'https://a.test/')]);
  a.w.Atlas.openHistory();
  assert.deepEqual(a.actions(), [['update', 3, { active: true }]]);
  const b = open([tab(4, 'https://a.test/')]);
  b.w.Atlas.openHistory();
  assert.deepEqual(b.actions(), [['create', { url: HISTORY }]]);
  assert.match(flyout, /history: function \(\) \{ if \(Atlas\.openHistory\) Atlas\.openHistory\(\);/);
  assert.doesNotMatch(flyout, /vivaldi:\/\/history/);
});

test("a tab that opens Vivaldi's bookmarks page becomes Chromium's", () => {
  for (const u of ['vivaldi://bookmarks', 'vivaldi://bookmarks/', 'vivaldi://bookmarks/?q=cats',
    'chrome-extension://mpognobbkildjkofajifpdfhcoklimli/startpage?section=bookmarks']) {
    const { fire, actions } = open([tab(8, u)]);
    fire.created[0](tab(8, u));
    assert.deepEqual(actions(), [['update', 8, { url: BOOKMARKS }]], u);
  }
  const { fire, actions } = open([tab(5, 'vivaldi://bookmarks/')]);
  fire.updated[0](5, { url: 'vivaldi://bookmarks/' }, tab(5, 'vivaldi://bookmarks/'));
  assert.deepEqual(actions(), [['update', 5, { url: BOOKMARKS }]]);
});

test('an open bookmarks tab is reused, and an open history tab is not mistaken for it', () => {
  const a = open([tab(3, BOOKMARKS), tab(9, 'vivaldi://bookmarks/')]);
  a.fire.created[0](tab(9, 'vivaldi://bookmarks/'));
  assert.deepEqual(a.actions(), [['update', 3, { active: true }], ['remove', 9]]);
  const b = open([tab(3, HISTORY), tab(9, 'vivaldi://bookmarks/')]);
  b.fire.created[0](tab(9, 'vivaldi://bookmarks/'));
  assert.deepEqual(b.actions(), [['update', 9, { url: BOOKMARKS }]]);
  const c = open([tab(3, BOOKMARKS), tab(9, 'vivaldi://history/')]);
  c.fire.created[0](tab(9, 'vivaldi://history/'));
  assert.deepEqual(c.actions(), [['update', 9, { url: HISTORY }]]);
});

test('bookmarks in another window is not reused, and one tab is handled once', () => {
  const a = open([tab(3, BOOKMARKS, { windowId: 2 }), tab(9, 'vivaldi://bookmarks/')]);
  a.fire.created[0](tab(9, 'vivaldi://bookmarks/'));
  assert.deepEqual(a.actions(), [['update', 9, { url: BOOKMARKS }]]);
  const b = open([tab(8, 'vivaldi://bookmarks/')]);
  b.fire.created[0](tab(8, 'vivaldi://bookmarks/'));
  b.fire.updated[0](8, { url: 'vivaldi://bookmarks/' }, tab(8, 'vivaldi://bookmarks/'));
  assert.equal(b.actions().length, 1);
});
