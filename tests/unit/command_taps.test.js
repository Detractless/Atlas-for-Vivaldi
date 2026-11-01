'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/modules/30-command-taps.js'), 'utf8'), context);
const create = context.createAtlasCommandTapDetector;

function setup() {
  let time = 0, activations = 0;
  const detector = create({ windowId: 7, now: () => time, onDoubleTap: () => activations++ });
  const send = (at, down, code = 91, modifiers = down ? 8 : 0, extra = {}) => {
    time = at;
    return detector.feed({ windowId: 7, down, code, modifiers, ...extra });
  };
  const tap = (at, code = 91, flags = 0) => { send(at, true, code, 8 | flags); return send(at + 30, false, code, flags); };
  return { send, tap, detector, activations: () => activations };
}

test('fires once after two completed Command taps, with the 450ms existing down-to-down limit', () => {
  const e = setup();
  e.tap(0);
  e.send(400, true);
  assert.equal(e.activations(), 0, 'a second keydown alone must not trigger');
  assert.equal(e.send(430, false), true);
  assert.equal(e.activations(), 1);
  e.send(440, false);
  assert.equal(e.activations(), 1);
});

test('supports both right-Command codes and sequential left/right taps', () => {
  for (const pair of [[92, 92], [91, 92], [92, 91], [93, 93], [91, 93], [93, 91]]) {
    const e = setup(); e.tap(0, pair[0]); e.tap(200, pair[1]);
    assert.equal(e.activations(), 1);
  }
});

test('a slow second tap or a held Command is not a double tap', () => {
  const slow = setup(); slow.tap(0); slow.tap(451); assert.equal(slow.activations(), 0);
  const held = setup(); held.send(0, true); held.send(500, false); held.tap(550);
  assert.equal(held.activations(), 0);
});

test('Command chords cancel a pending pair even when only the other keyup is observed', () => {
  for (const observedDown of [false, true]) {
    const e = setup(); e.tap(0); e.send(100, true);
    e.send(110, observedDown, 65, 8); e.send(150, false); e.tap(220);
    assert.equal(e.activations(), 0);
  }
});

test('Control+Space and bare Control never activate the Command gesture', () => {
  for (const spaceDelivered of [false, true]) {
    const e = setup();
    for (const at of [0, 120, 240, 360]) {
      e.send(at, true, 17, 2);
      if (spaceDelivered) { e.send(at + 10, true, 32, 2); e.send(at + 20, false, 32, 2); }
      e.send(at + 30, false, 17, 0);
    }
    assert.equal(e.activations(), 0);
  }
});

test('other held modifiers reject Command taps but lock flags do not', () => {
  for (const other of [1, 2, 4]) {
    const e = setup(); e.send(0, true, 91, 8 | other); e.send(30, false, 91, other); e.tap(150);
    assert.equal(e.activations(), 0);
  }
  const caps = setup(); caps.tap(0, 91, 512); caps.tap(150, 91, 512);
  assert.equal(caps.activations(), 1);
});

test('pointer or window changes cancel a partial pair', () => {
  const e = setup(); e.tap(0); e.detector.reset(); e.tap(150);
  assert.equal(e.activations(), 0);
  e.send(180, true, 91, 8, { windowId: 8 }); e.send(200, false, 91, 0, { windowId: 8 }); e.tap(300);
  assert.equal(e.activations(), 0);
});

test('holding both Command keys together cannot count as two taps', () => {
  for (const right of [92, 93]) {
    const e = setup(); e.send(0, true, 91); e.send(10, true, right); e.send(20, false, right, 8); e.send(30, false, 91, 0);
    e.tap(150);
    assert.equal(e.activations(), 0);
  }
});

test('the legacy right-Command code cannot activate without the Command modifier', () => {
  const e = setup();
  for (const at of [0, 150]) { e.send(at, true, 93, 0); e.send(at + 30, false, 93, 0); }
  assert.equal(e.activations(), 0, 'a context-menu key by itself must remain a menu key');
});

test('repeat notifications cannot manufacture taps', () => {
  const e = setup(); e.send(0, true); e.send(50, true, 91, 8, { autoRepeat: true }); e.send(70, true);
  e.send(100, false);
  assert.equal(e.activations(), 0);
  e.tap(200);
  assert.equal(e.activations(), 1);
});

test('after-gesture notifications, missing presses, and malformed packets do not trigger', () => {
  const e = setup(); e.send(0, false); e.send(50, false); e.tap(100);
  e.send(200, true, 91, 8, { afterGesture: true }); e.send(230, false); e.tap(300);
  assert.equal(e.activations(), 0);
  e.detector.feed({ down: 'yes', code: 91, modifiers: 8 }); e.tap(400);
  assert.equal(e.activations(), 0);
});
