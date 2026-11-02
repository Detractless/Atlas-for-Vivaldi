// The social media filter's engine following a single-page site from one page to the next: the route on <html> changes
// the moment the address does, and the page just left stays hidden until the site shows the new one.
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
    parts: { whoToFollow: { css: ['.who'], on: ['home'] } },
  }, extra || {});
}

const on = (parts) => ({ mode: 'parts', parts });

test('a change of address is followed at once by the navigation events, not at the next 300 ms check', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['whoToFollow']) });
  const navigation = new t.window.EventTarget();   /* the page's Navigation API; jsdom has none */
  t.window.navigation = navigation;
  await wait(20);
  const route = () => t.document.documentElement.getAttribute('data-atlas-route');
  t.window.history.pushState({}, '', '/watch?v=1');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  assert.equal(route(), 'watch', 'a link inside the site (Navigation API)');
  t.window.history.pushState({}, '', '/');
  t.window.dispatchEvent(new t.window.PopStateEvent('popstate'));
  assert.equal(route(), 'home', 'the Back button');
  t.window.history.pushState({}, '', '/watch?v=2');
  t.window.dispatchEvent(new t.window.HashChangeEvent('hashchange'));
  assert.equal(route(), 'watch', 'a change after the #');
});

test('a site that shows the old page for a while keeps the old route\'s rules on until its settle event', async () => {
  const t = loadSocial({ html: HTML, table: table({ settle: { events: ['page-ready'], after: 20, max: 400 } }), filter: on(['whoToFollow']) });
  const navigation = new t.window.EventTarget();
  t.window.navigation = navigation;
  await wait(20);
  const root = t.document.documentElement;
  const route = () => root.getAttribute('data-atlas-route'), held = () => root.getAttribute('data-atlas-route-held');
  assert.equal(held(), null, 'nothing is held on the first page');
  t.window.history.pushState({}, '', '/watch?v=1');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  assert.equal(route(), 'watch', 'the new route is current at once');
  assert.equal(held(), 'home', 'and the page just left stays hidden while the site still shows it');
  await wait(40);
  assert.equal(held(), 'home', 'nothing releases it by itself before the event');
  t.document.dispatchEvent(new t.window.Event('page-ready'));
  assert.equal(held(), 'home', 'the event releases it after the short delay, not in the same breath');
  await wait(50);
  assert.equal(held(), null, 'released once the new page is on screen');
});

test('the old route is released after the longest wait even if the site never says it is ready', async () => {
  const t = loadSocial({ html: HTML, table: table({ settle: { events: ['page-ready'], after: 20, max: 80 } }), filter: on(['whoToFollow']) });
  const navigation = new t.window.EventTarget();
  t.window.navigation = navigation;
  await wait(20);
  t.window.history.pushState({}, '', '/watch?v=1');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  assert.equal(t.document.documentElement.getAttribute('data-atlas-route-held'), 'home');
  await wait(140);
  assert.equal(t.document.documentElement.hasAttribute('data-atlas-route-held'), false);
});

test('two quick changes hold both old pages, and a second change inside the delay is not cut short', async () => {
  const t = loadSocial({ html: HTML, table: table({ settle: { events: ['page-ready'], after: 60, max: 1000 } }), filter: on(['whoToFollow']) });
  const navigation = new t.window.EventTarget();
  t.window.navigation = navigation;
  await wait(20);
  const held = () => t.document.documentElement.getAttribute('data-atlas-route-held');
  t.window.history.pushState({}, '', '/watch?v=1');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  t.window.history.pushState({}, '', '/other');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  assert.equal(held(), 'home watch');
  t.document.dispatchEvent(new t.window.Event('page-ready'));
  await wait(20);
  t.window.history.pushState({}, '', '/');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));   /* a new change while the release is pending */
  await wait(80);
  assert.ok(held(), 'the pending release did not cut the new change\'s hold short');
});

test('a table with no settle event never holds a route, and the filter off leaves no held route behind', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['whoToFollow']) });
  const navigation = new t.window.EventTarget();
  t.window.navigation = navigation;
  await wait(20);
  t.window.history.pushState({}, '', '/watch?v=1');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  assert.equal(t.document.documentElement.hasAttribute('data-atlas-route-held'), false);
  const u = loadSocial({ html: HTML, table: table({ settle: { events: ['page-ready'], max: 5000 } }), filter: on(['whoToFollow']) });
  const nav2 = new u.window.EventTarget();
  u.window.navigation = nav2;
  await wait(20);
  u.window.history.pushState({}, '', '/watch?v=1');
  nav2.dispatchEvent(new u.window.Event('currententrychange'));
  assert.equal(u.document.documentElement.getAttribute('data-atlas-route-held'), 'home');
  await u.chrome.storage.sync.set({ socialFilter: { mode: 'off', parts: ['whoToFollow'] } });
  await wait(20);
  assert.equal(u.document.documentElement.hasAttribute('data-atlas-route-held'), false);
});

test('with the filter off the navigation events add nothing to the page', async () => {
  const t = loadSocial({ html: HTML, table: table(), filter: on(['whoToFollow']) });
  const navigation = new t.window.EventTarget();
  t.window.navigation = navigation;
  await wait(20);
  await t.chrome.storage.sync.set({ socialFilter: { mode: 'off', parts: ['whoToFollow'] } });
  await wait(20);
  t.window.history.pushState({}, '', '/watch?v=1');
  navigation.dispatchEvent(new t.window.Event('currententrychange'));
  t.window.dispatchEvent(new t.window.PopStateEvent('popstate'));
  t.window.dispatchEvent(new t.window.HashChangeEvent('hashchange'));
  assert.equal(t.document.documentElement.hasAttribute('data-atlas-route'), false);
  assert.equal(styles(t.document).length, 0);
});
