// The social media filter's engine (atlas-social-core.js + guard + behaviours): what it adds to a page, when it
// adds nothing, and how the safety guard switches a runaway part off.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadSocial, styles, wait, closeAll } = require("../helpers/social_env");

test.afterEach(closeAll);

const HTML = `<!doctype html><html><head><title>T</title></head><body>
  <div id="app"><header id="search"><input id="q"></header>
  <main id="feed"><div class="short">s1</div><div class="short">s2</div><div class="like">l</div></main>
  <aside id="rail"><div class="who">w</div></aside></div></body></html>`;

function table(extra) {
  return Object.assign({
    key: 'demo', name: 'Demo', live: true, hosts: ['example.test'],
    route: (path) => (path === '/' ? 'home' : path.startsWith('/watch') ? 'watch' : 'other'),
    landmarks: [{ sel: '#app' }, { sel: '#search' }, { sel: '#feed', on: ['home'] }],
    parts: {
      shortVideos: { css: ['.short'] },
      whoToFollow: { css: ['.who'], on: ['home'] },
      likes: { css: ['.like'] },
    },
  }, extra || {});
}

const on = (parts) => ({ mode: 'parts', parts });

test('filter off: nothing is added to the page', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: { mode: 'off', parts: ['shortVideos'] } });
  await wait(20);
  assert.equal(styles(t.document).length, 0);
  assert.equal(t.document.documentElement.hasAttribute('data-atlas-route'), false);
  assert.equal(t.document.querySelectorAll('[data-atlas-social-trips]').length, 0);
});

test('no setting saved yet: nothing is added', async () => {
  const t = loadSocial({ html: HTML, table: table() });
  await wait(20);
  assert.equal(styles(t.document).length, 0);
});

test('block-sites-entirely mode adds no page rules (the extension handles that)', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: { mode: 'all', parts: ['shortVideos'] } });
  await wait(20);
  assert.equal(styles(t.document).length, 0);
});

test('parts mode: one style block per chosen part, none for the others', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['shortVideos', 'likes']) });
  await wait(20);
  const ids = styles(t.document).map((s) => s.getAttribute('data-atlas-social')).sort();
  assert.deepEqual(ids, ['likes', 'shortVideos']);
  assert.match(styles(t.document)[0].textContent, /display:none!important/);
});

test('a part not in the site table is ignored, and the page is untouched', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['homeFeed', 'nonsense']) });
  await wait(20);
  assert.equal(styles(t.document).length, 0);
});

test('one rule per selector, so a bad selector cannot take a neighbour with it', async () => {
  const t = loadSocial({ html: HTML, table: table({ parts: { likes: { css: ['.like', 'div[', '.who'] } } }), filter: on(['likes']) });
  await wait(20);
  const lines = styles(t.document)[0].textContent.split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines.every((l) => /\{display:none!important\}$/.test(l)));
});

test('rules can be limited to pages: they are scoped by the route on <html>', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['whoToFollow']) });
  await wait(20);
  assert.equal(styles(t.document)[0].textContent,
    'html[data-atlas-route="home"] .who{display:none!important}\nhtml[data-atlas-route-held~="home"] .who{display:none!important}');
  assert.equal(t.document.documentElement.getAttribute('data-atlas-route'), 'home');
  t.window.history.pushState({}, '', '/watch?v=1');
  t.S.internals.tick(t.state);
  assert.equal(t.document.documentElement.getAttribute('data-atlas-route'), 'watch');
});

test('changing the setting adds and removes parts live, and switching off removes everything', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['shortVideos']) });
  await wait(20);
  assert.equal(styles(t.document).length, 1);
  await t.chrome.storage.sync.set({ socialFilter: on(['shortVideos', 'likes']) });
  await wait(20);
  assert.equal(styles(t.document).length, 2);
  await t.chrome.storage.sync.set({ socialFilter: on(['likes']) });
  await wait(20);
  assert.deepEqual(styles(t.document).map((s) => s.getAttribute('data-atlas-social')), ['likes']);
  await t.chrome.storage.sync.set({ socialFilter: { mode: 'off', parts: ['likes'] } });
  await wait(20);
  assert.equal(styles(t.document).length, 0);
  assert.equal(t.document.documentElement.hasAttribute('data-atlas-route'), false);
});

test('a site that drops our route attribute or a style block gets them back on the next tick', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['shortVideos', 'whoToFollow']) });
  await wait(20);
  t.document.documentElement.removeAttribute('data-atlas-route');
  styles(t.document)[0].remove();
  assert.equal(styles(t.document).length, 1);
  t.S.internals.tick(t.state);
  assert.equal(styles(t.document).length, 2);
  assert.equal(t.document.documentElement.getAttribute('data-atlas-route'), 'home');
});

test('a table that is not live does nothing at all', async () => {
  const t = loadSocial({ html: HTML, table: table({ live: false }), filter: on(['shortVideos']) });
  await wait(20);
  assert.equal(t.state, null);
  assert.equal(styles(t.document).length, 0);
});

test('guard: a rule that would hide a landmark switches that part off, and only that part', async () => {
  const bad = table({ parts: { shortVideos: { css: ['.short'] }, likes: { css: ['#search'] } } });
  const t = loadSocial({ html: HTML, table: bad, filter: on(['shortVideos', 'likes']) });
  await wait(20);
  t.S.internals.runChecks(t.state);
  assert.deepEqual(styles(t.document).map((s) => s.getAttribute('data-atlas-social')), ['shortVideos']);
  assert.equal(t.document.documentElement.getAttribute('data-atlas-social-trips'), 'likes');
  assert.match(t.state.tripped.likes, /^landmark:/);
});

test('guard: a rule that hides something around a landmark trips too', async () => {
  const bad = table({ parts: { likes: { css: ['#app > header'] } } });
  const t = loadSocial({ html: HTML, table: bad, filter: on(['likes']) });
  await wait(20);
  t.S.internals.runChecks(t.state);
  assert.equal(styles(t.document).length, 0);
});

test('guard: a rule that matches the page itself trips', async () => {
  for (const sel of ['body', 'html', 'body > div']) {
    const t = loadSocial({ html: HTML, table: table({ parts: { likes: { css: [sel] } } }), filter: on(['likes']) });
    await wait(20);
    t.S.internals.runChecks(t.state);
    assert.equal(styles(t.document).length, 0, sel);
    assert.match(t.state.tripped.likes, /page-root|landmark/, sel);
  }
});

test('guard: a selector the browser cannot parse trips, a runaway selector trips', async () => {
  const many = '<div class="x"></div>'.repeat(2001);
  const t = loadSocial({ html: HTML.replace('</body>', many + '</body>'), table: table({ parts: { likes: { css: ['.x'] }, whoToFollow: { css: ['div['] } } }), filter: on(['likes', 'whoToFollow']) });
  await wait(20);
  t.S.internals.runChecks(t.state);
  assert.match(t.state.tripped.likes, /^too-many/);
  assert.match(t.state.tripped.whoToFollow, /^bad-selector/);
});

test('guard: a part covering too much of the window trips unless it says maxArea: 1', async () => {
  const win = { innerWidth: 1000, innerHeight: 800 };
  for (const [cap, expectTrip] of [[undefined, true], [1, false]]) {
    const part = { css: ['.short'] };
    if (cap !== undefined) part.maxArea = cap;
    const t = loadSocial({ html: HTML, table: table({ parts: { shortVideos: part } }), filter: on(['shortVideos']) });
    await wait(20);
    Object.assign(t.window, win);
    t.window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }; };
    t.S.internals.runChecks(t.state);
    assert.equal(!!t.state.tripped.shortVideos, expectTrip, 'maxArea ' + cap);
    if (!expectTrip) assert.equal(styles(t.document)[0].disabled, false, 'style is switched back on after measuring');
  }
});

test('guard: a modest part passes and its style stays on', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['shortVideos']) });
  await wait(20);
  Object.assign(t.window, { innerWidth: 1000, innerHeight: 800 });
  t.window.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; };
  t.S.internals.runChecks(t.state);
  assert.equal(Object.keys(t.state.tripped).length, 0);
  assert.equal(styles(t.document).length, 1);
});

test('redirect: a part can send a page away once, and never in a loop', async () => {
  const part = { css: ['.short'], redirect: { from: /^\/shorts\//, to: '/' } };
  const t = loadSocial({ html: HTML, url: 'https://example.test/shorts/abc', table: table({ parts: { shortVideos: part } }), filter: on(['shortVideos']) });
  await wait(20);
  assert.deepEqual(t.navigations, ['https://example.test/']);
  t.S.internals.tick(t.state);
  t.window.history.pushState({}, '', '/shorts/abc');
  t.S.internals.tick(t.state);
  assert.equal(t.navigations.length, 1, 'the same address is not redirected twice in 10 seconds');
});

test('behaviours: a part\'s act runs while it is on and is stopped when it is switched off', async () => {
  let started = 0, stopped = 0;
  const part = { css: ['.short'], act: () => { started++; return () => { stopped++; }; } };
  const t = loadSocial({ html: HTML, table: table({ parts: { shortVideos: part } }), filter: on(['shortVideos']) });
  await wait(20);
  assert.equal(started, 1);
  await t.chrome.storage.sync.set({ socialFilter: { mode: 'off', parts: [] } });
  await wait(20);
  assert.equal(stopped, 1);
});

test('behaviours: the tab-title count is stripped', async () => {
  const t = loadSocial({ html: HTML.replace('<title>T</title>', '<title>(3) Inbox</title>') });
  const stop = t.S.helpers.stripTitleCount();
  assert.equal(t.document.title, 'Inbox');
  stop();
});

test('health: match counts and trips are kept per part, without page addresses', async () => {
  const bad = table({ parts: { shortVideos: { css: ['.short'] }, likes: { css: ['#search'] }, whoToFollow: { css: ['.nothing'] } } });
  const t = loadSocial({ html: HTML, table: bad, filter: on(['shortVideos', 'likes', 'whoToFollow']) });
  await wait(20);
  t.S.internals.runChecks(t.state);
  t.S.internals.flush(t.state);
  await wait(20);
  const h = (await t.chrome.storage.local.get('atlas_social_health')).atlas_social_health.demo;
  assert.equal(h.shortVideos.matches, 2);
  assert.equal(h.shortVideos.everMatched, true);
  assert.equal(h.likes.trips, 1);
  assert.equal(h.whoToFollow.matches, 0);
  assert.equal(h.whoToFollow.everMatched, false);
  assert.ok(!JSON.stringify(h).includes('example.test'));
});

test('the engine normalizes the setting like utils/socialFilter.js does', async () => {
  const { normalize } = await import('../../payload/detractless/src/utils/socialFilter.js');
  const t = loadSocial({});
  const known = ['homeFeed', 'shortVideos', 'likes'];
  for (const v of [undefined, null, 'x', {}, { mode: 'parts' }, { mode: 'all', parts: ['likes', 'zzz', 'homeFeed'] }, { mode: 'bogus', parts: ['likes'] }]) {
    const a = t.S.internals.normalize(v, known);
    const b = normalize(v);
    assert.equal(a.mode, b.mode);
    assert.deepEqual(a.parts, b.parts.filter((id) => known.includes(id)));
  }
});

test('a part can say how many matches are normal (maxMatches); the default is far above a long list', async () => {
  const many = '<div class="x"></div>'.repeat(450);
  const defaults = loadSocial({ html: HTML.replace('</body>', many + '</body>'), table: table({ parts: { likes: { css: ['.x'] } } }), filter: on(['likes']) });
  await wait(20);
  defaults.S.internals.runChecks(defaults.state);
  assert.equal(Object.keys(defaults.state.tripped).length, 0, '450 matches is an ordinary list');
  const capped = loadSocial({ html: HTML.replace('</body>', many + '</body>'), table: table({ parts: { likes: { css: ['.x'], maxMatches: 100 } } }), filter: on(['likes']) });
  await wait(20);
  capped.S.internals.runChecks(capped.state);
  assert.match(capped.state.tripped.likes, /^too-many/);
});

test('the smoke selectors are protected like landmarks', async () => {
  const bad = table({ smoke: ['#q'], landmarks: [{ sel: '#app' }], parts: { likes: { css: ['header#search > input'] } } });
  const t = loadSocial({ html: HTML, table: bad, filter: on(['likes']) });
  await wait(20);
  t.S.internals.runChecks(t.state);
  assert.match(t.state.tripped.likes, /^landmark:#q/);
});

test('a part that tripped gets a fresh try on the next kind of page, and when it is switched off and on again', async () => {
  const bad = table({ parts: { likes: { css: ['#search'], on: ['home'] } } });
  const t = loadSocial({ html: HTML, table: bad, filter: on(['likes']) });
  await wait(20);
  t.S.internals.runChecks(t.state);
  assert.ok(t.state.tripped.likes);
  t.window.history.pushState({}, '', '/watch?v=1');
  t.S.internals.tick(t.state);
  assert.equal(Object.keys(t.state.tripped).length, 0, 'route change clears the trip');
  assert.equal(styles(t.document).length, 1, 'and the part is mounted again');
  t.S.internals.runChecks(t.state);   // on the watch route its rule is out of scope: no trip
  assert.equal(Object.keys(t.state.tripped).length, 0);
  t.window.history.pushState({}, '', '/');
  t.S.internals.tick(t.state);
  t.S.internals.runChecks(t.state);
  assert.ok(t.state.tripped.likes, 'back on the home route it trips again');
  await t.chrome.storage.sync.set({ socialFilter: { mode: 'off', parts: [] } });
  await wait(20);
  assert.equal(Object.keys(t.state.tripped).length, 0, 'switching it off clears the trip');
});

test('behaviours: a switch the part turned off is turned back on when the part stops', async () => {
  const html = HTML.replace('</body>', '<button id="auto" aria-checked="true"></button></body>');
  const t = loadSocial({ html });
  const btn = t.document.getElementById('auto');
  btn.addEventListener('click', () => btn.setAttribute('aria-checked', btn.getAttribute('aria-checked') === 'true' ? 'false' : 'true'));
  const stop = t.S.helpers.keepOff('#auto', (el) => el.getAttribute('aria-checked') === 'true');
  await wait(800);
  assert.equal(btn.getAttribute('aria-checked'), 'false', 'turned off');
  stop();
  assert.equal(btn.getAttribute('aria-checked'), 'true', 'given back as found');
});

test('behaviours: pauseVideos only acts where the part applies, and unmutes what it muted when it stops', async () => {
  const html = HTML.replace('</body>', '<video id="v" class="vid"></video></body>');
  const t = loadSocial({ html });
  const v = t.document.getElementById('v');
  let paused = false, applies = false, pauses = 0;
  Object.defineProperty(v, 'paused', { get: () => paused });
  v.pause = () => { pauses++; paused = true; };
  const stop = t.S.helpers.pauseVideos('.vid', () => applies);
  await wait(900);
  assert.equal(pauses, 0, 'not on a page the part covers: left playing');
  assert.equal(v.muted, false);
  applies = true;
  await wait(900);
  assert.equal(pauses, 1);
  assert.equal(v.muted, true);
  stop();
  assert.equal(v.muted, false, 'unmuted on stop');
});

test('shadow rules: a part puts its rules into the shadow root of each host, now and as hosts arrive', async () => {
  const shadowTable = table({ parts: { likes: { css: ['.like'], shadow: [{ host: 'x-card', css: ['.vote', 'span:has(> .vote)'] }] }, share: { css: ['.like'], shadow: [{ host: 'x-card', css: ['.share'], on: ['home'] }] } } });
  const t = loadSocial({ html: HTML.replace('</body>', '<x-card id="c1"></x-card></body>'), table: shadowTable, filter: on(['likes']) });
  const card = (id) => t.document.getElementById(id);
  await wait(20);
  card('c1').attachShadow({ mode: 'open' });
  t.S.internals.tick(t.state);
  const rootStyles = (id) => Array.from(card(id).shadowRoot.querySelectorAll('style[data-atlas-social-shadow]'));
  assert.equal(rootStyles('c1').length, 1);
  assert.deepEqual(rootStyles('c1').map((s) => s.getAttribute('data-atlas-social-shadow')), ['likes']);
  assert.equal(rootStyles('c1')[0].textContent, '.vote{display:none!important}\nspan:has(> .vote){display:none!important}');
  t.S.internals.tick(t.state);
  assert.equal(rootStyles('c1').length, 1, 'once per host, however often it is swept');
  // a host that arrives later, with its root attached after it was created
  const late = t.document.createElement('x-card');
  late.id = 'c2';
  t.document.body.appendChild(late);
  await wait(80);
  assert.equal(late.shadowRoot, null);
  late.attachShadow({ mode: 'open' });
  t.S.internals.tick(t.state);
  assert.equal(rootStyles('c2').length, 1);
  // a second part with a route-scoped shadow rule
  await t.chrome.storage.sync.set({ socialFilter: on(['likes', 'share']) });
  await wait(30);
  const share = rootStyles('c1').find((s) => s.getAttribute('data-atlas-social-shadow') === 'share');
  assert.equal(share.textContent, ':host-context(html[data-atlas-route="home"]) .share{display:none!important}\n:host-context(html[data-atlas-route-held~="home"]) .share{display:none!important}');
  // switching a part off takes only its rules out; switching everything off takes them all
  await t.chrome.storage.sync.set({ socialFilter: on(['share']) });
  await wait(30);
  assert.deepEqual(rootStyles('c1').map((s) => s.getAttribute('data-atlas-social-shadow')), ['share']);
  await t.chrome.storage.sync.set({ socialFilter: { mode: 'off', parts: [] } });
  await wait(30);
  assert.equal(rootStyles('c1').length + rootStyles('c2').length, 0);
  assert.equal(t.state.shadowObserver, null, 'no watcher left running');
});
