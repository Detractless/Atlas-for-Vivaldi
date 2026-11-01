'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../../src/modules/07-profile-menu.js'), 'utf8');
const fn = source.slice(source.indexOf('function addDropTail'), source.indexOf('var AVATAR ='));

function tailFor(panelRect, anchorRect, radius) {
  const dom = new JSDOM('<body><div id="p"></div></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  const panel = w.document.getElementById('p');
  panel.getBoundingClientRect = () => panelRect;
  w.getComputedStyle = () => ({ backgroundColor: 'rgb(246, 246, 246)', borderTopColor: 'rgb(220, 220, 220)', borderTopLeftRadius: radius });
  w.eval(fn + '; window.addDropTail = addDropTail;');
  w.addDropTail(panel, anchorRect);
  const svg = panel.querySelector('svg.atlas-drop-tail');
  const d = svg.querySelector('path').getAttribute('d');
  return { svg, d, left: parseFloat(svg.style.left), top: parseFloat(svg.style.top) };
}
const panel = { left: 1500, right: 1710, top: 78, width: 210, height: 200 };
const anchorAt = (cx) => ({ left: cx - 18, width: 36 });

test('the pointer has 45-degree sides, so it matches the tab card and toolbar popups', () => {
  const { d } = tailFor(panel, anchorAt(1600), '12px');
  const [m, l1, , l2] = d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((s) => s.split(',').map(Number));
  assert.equal(l1[0] - m[0], m[1] - l1[1], 'left side rises as far as it runs');
  assert.equal(l2[0] - l1[0] > 0, true);
  assert.match(d, / Q/, 'the tip is rounded, not a sharp point');
});

test('it is 16px wide where it meets the panel edge and stands about 7px proud', () => {
  const { svg, d, top } = tailFor(panel, anchorAt(1600), '12px');
  const [base, tip] = d.match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g).map((s) => s.split(',').map(Number));
  const edgeY = panel.top - top; // where the panel's top edge falls inside the svg
  const widthAtEdge = Number(svg.getAttribute('width')) - 2 * (base[1] - edgeY);
  assert.equal(base[1] - edgeY, 1, 'base sits 1px inside the panel');
  assert.equal(widthAtEdge, 16);
  const tipY = 0.25 * tip[1] + 0.5 * 0 + 0.25 * tip[1]; // the rounded tip's highest point
  assert.ok(Math.abs(edgeY - tipY - 7.15) < 0.01, 'tip stands about 7px above the panel');
});

test('it points at the button but stays off the rounded corners', () => {
  const mid = (t) => t.left + 9;
  assert.equal(mid(tailFor(panel, anchorAt(1600), '12px')), 1600, 'centred on the button');
  assert.equal(mid(tailFor(panel, anchorAt(1692), '12px')), 1710 - 21, 'right foot stays on the straight edge');
  assert.equal(mid(tailFor(panel, anchorAt(1480), '12px')), 1500 + 21, 'left foot stays on the straight edge');
});

test('a panel with no readable radius still keeps clear of a 12px corner', () => {
  const { left } = tailFor(panel, anchorAt(1700), '');
  assert.equal(left + 9, 1710 - 21);
});
