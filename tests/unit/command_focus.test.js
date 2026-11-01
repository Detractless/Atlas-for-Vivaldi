'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/modules/30-command-taps.js'), 'utf8'), context);
const create = context.createAtlasAddressFocusHandoff;

function setup(focusAt = 1, windowAt = 1) {
  const timers = [], results = [];
  let fieldAttempts = 0, windowAttempts = 0, active = null, windowFocused = false;
  let field = { focus() { if (++fieldAttempts >= focusAt) active = field; }, select() {} };
  const handoff = create({
    schedule: (fn, ms) => { assert.equal(ms, 50); timers.push(fn); },
    getField: () => field,
    focusWindow: () => { if (++windowAttempts >= windowAt) windowFocused = true; },
    hasFocus: () => windowFocused,
    isFocused: (candidate) => active === candidate,
    onDone: (ok, attempts) => results.push({ ok, attempts }),
  });
  function run() {
    let count = 0;
    while (timers.length) { assert.ok(count++ < 20, 'focus retries must remain bounded'); timers.shift()(); }
  }
  return { handoff, timers, results, run, attempts: () => fieldAttempts, replaceField(value) { field = value; }, setActive(value) { active = value; } };
}

test('one request completes the two-stage guest-to-address-bar handoff', () => {
  const e = setup(2); e.handoff.request();
  assert.equal(e.attempts(), 1); e.run();
  assert.deepEqual(e.results, [{ ok: true, attempts: 2 }]);
  assert.equal(e.handoff.isPending(), false);
});

test('normal focus succeeds on its first attempt without later refocusing', () => {
  const e = setup(); e.handoff.request(); e.run();
  assert.deepEqual(e.results, [{ ok: true, attempts: 1 }]);
  assert.equal(e.attempts(), 1); assert.equal(e.timers.length, 0);
});

test('an inactive UI document is not counted as success merely because its input is active', () => {
  const e = setup(1, 2); e.handoff.request(); e.run();
  assert.deepEqual(e.results, [{ ok: true, attempts: 2 }]);
});

test('failure stops after three finite attempts', () => {
  const e = setup(Infinity); e.handoff.request(); e.run();
  assert.equal(e.attempts(), 3);
  assert.deepEqual(e.results, [{ ok: false, attempts: 3 }]);
  assert.equal(e.timers.length, 0);
});

test('typing, clicking or changing windows can cancel before a delayed retry', () => {
  const e = setup(2); e.handoff.request(); e.handoff.cancel(); e.run();
  assert.equal(e.attempts(), 1); assert.deepEqual(e.results, []);
});

test('a new request invalidates callbacks left by the old request', () => {
  const e = setup(2); e.handoff.request(); e.handoff.request(); e.run();
  assert.deepEqual(e.results, [{ ok: true, attempts: 1 }]);
});

test('a replacement address-field node is looked up again before retrying', () => {
  const e = setup(Infinity); e.handoff.request();
  const replacement = { focus() { e.setActive(replacement); }, select() {} };
  e.replaceField(replacement); e.run();
  assert.deepEqual(e.results, [{ ok: true, attempts: 2 }]);
});

test('a missing field fails cleanly without scheduling work', () => {
  const e = setup(); e.replaceField(null); e.handoff.request();
  assert.deepEqual(e.results, [{ ok: false, attempts: 1 }]);
  assert.equal(e.timers.length, 0);
});
