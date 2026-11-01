'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../../src/modules/32-tab-card.js'), 'utf8');
const ID = 'mpognobbkildjkofajifpdfhcoklimli';
const OTHER = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';

function open(html) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { id: ID } };
  const timers = [];
  dom.window.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  dom.window.eval(source);
  return { window: dom.window, doc: dom.window.document, timers };
}
const card = (host) => '<div class="tab-solo"><div class="tooltip-item"><div class="thumbnail-caption">' +
  '<span class="thumbnail-text"><strong class="title">T</strong><span class="url">' + host + '</span></span></div></div></div>';
const tick = () => new Promise((r) => setTimeout(r, 0));

test('Atlas pages are marked to read "Atlas" when the card appears, without editing the line', async () => {
  const { doc } = open('<div id="vivaldi-tooltip"></div>');
  doc.getElementById('vivaldi-tooltip').innerHTML = card(ID);
  await tick();
  const line = doc.querySelector('.url');
  assert.ok(line.classList.contains('atlas-own'));
  assert.ok(!line.classList.contains('atlas-no-id'));
  assert.equal(line.textContent, ID, "React's text is left alone");
});

test("another extension's id is hidden, not relabelled", async () => {
  const { doc } = open('<div id="vivaldi-tooltip"></div>');
  doc.getElementById('vivaldi-tooltip').innerHTML = card(OTHER);
  await tick();
  assert.ok(doc.querySelector('.url').classList.contains('atlas-no-id'));
  assert.ok(!doc.querySelector('.url').classList.contains('atlas-own'));
});

test('a real site keeps its domain, and a reused line follows the page it now shows', async () => {
  const { doc } = open('<div id="vivaldi-tooltip"></div>');
  const tip = doc.getElementById('vivaldi-tooltip');
  tip.innerHTML = card('lonelyplanet.com');
  await tick();
  assert.ok(!doc.querySelector('.url').classList.contains('atlas-own'));
  doc.querySelector('.url').textContent = ID;
  await tick();
  assert.ok(doc.querySelector('.url').classList.contains('atlas-own'));
  doc.querySelector('.url').textContent = OTHER;
  await tick();
  assert.ok(!doc.querySelector('.url').classList.contains('atlas-own'));
  assert.ok(doc.querySelector('.url').classList.contains('atlas-no-id'));
  doc.querySelector('.url').textContent = 'reddit.com';
  await tick();
  assert.ok(!doc.querySelector('.url').classList.contains('atlas-own'));
  assert.ok(!doc.querySelector('.url').classList.contains('atlas-no-id'));
});

test('a 32-letter site name outside the extension alphabet is not mistaken for an id', async () => {
  const { doc } = open('<div id="vivaldi-tooltip"></div>');
  doc.getElementById('vivaldi-tooltip').innerHTML = card('qrstuvwxyzqrstuvwxyzqrstuvwxyzqr');
  await tick();
  assert.ok(!doc.querySelector('.url').classList.contains('atlas-no-id'));
});

test('it waits for the tooltip container to exist, then starts', async () => {
  const { doc, timers } = open('<div id="browser"></div>');
  assert.equal(timers.length, 1);
  doc.getElementById('browser').insertAdjacentHTML('beforeend', '<div id="vivaldi-tooltip">' + card(ID) + '</div>');
  timers.shift()();
  assert.ok(doc.querySelector('.url').classList.contains('atlas-own'), 'a card already open is handled at start');
  assert.equal(timers.length, 0);
});

test('it gives up quietly after 40 tries when the container never appears', () => {
  const { timers } = open('<div id="browser"></div>');
  let n = 0;
  while (timers.length) { timers.shift()(); n++; }
  assert.equal(n, 40);
});

test('the card CSS hides the thumbnail, RAM line, favicon and extension id, and keeps the audio button', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../payload/css-mods/02-tabs.css'), 'utf8');
  const rule = /(#browser #vivaldi-tooltip[^{]*\.thumbnail-image[^{]*\{[^}]*\})/.exec(css);
  assert.ok(rule, 'hiding rule present');
  for (const part of ['.thumbnail-image', '.size', '.thumbnail-buttons .favicon', '.url.atlas-no-id']) assert.ok(rule[1].includes(part), part);
  assert.ok(/display:\s*none/.test(rule[1]));
  assert.ok(!/audio/.test(rule[1]) && !/\.close/.test(rule[1]));
  assert.ok(/#browser\.tabs-top #vivaldi-tooltip[^{]*::before/.test(css), 'pointer only when tabs are on top');
  assert.ok(/\.url\.atlas-own \{ font-size: 0; \}/.test(css), 'the id text is collapsed');
  assert.ok(/\.url\.atlas-own::after \{[^}]*content: "Atlas"/.test(css), 'and "Atlas" is drawn in its place');
  const address = fs.readFileSync(path.join(__dirname, '../../payload/css-mods/03-addressbar.css'), 'utf8');
  const logo = /#browser \.atlas-enginebtn \{[^}]*z-index:\s*(\d+)/.exec(address);
  const above = /#browser #vivaldi-tooltip \.tooltip \{\s*z-index:\s*(\d+) !important/.exec(css);
  assert.ok(logo && above, 'both z-index rules present');
  assert.ok(Number(above[1]) > Number(logo[1]), 'the card draws above the address bar engine logo');
});
