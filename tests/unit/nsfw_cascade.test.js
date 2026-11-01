import { test } from "node:test";
import assert from "node:assert/strict";

class MockMemoryController {
  constructor(options = {}) {
    this.cleanStreak = 0;
    this.cleanStreakTarget = options.cleanStreakTarget ?? 15;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 20000;
    this.extendedTimeoutMs = options.extendedTimeoutMs ?? 300000; // 5 min
    this.recentEscalations = [];
    this.isStage2Loaded = false;
    this.isPinned = false;
  }

  recordEscalation(now = Date.now()) {
    this.isStage2Loaded = true;
    this.cleanStreak = 0;
    this.recentEscalations.push(now);
    // Keep escalations within 2 minutes
    this.recentEscalations = this.recentEscalations.filter((t) => now - t <= 120000);
    if (this.recentEscalations.length >= 2) {
      this.isPinned = true;
    }
  }

  recordCleanImage() {
    this.cleanStreak += 1;
  }

  shouldPurge(now = Date.now(), lastUsedTime = 0) {
    if (!this.isStage2Loaded) return false;
    const elapsed = now - lastUsedTime;
    if (this.isPinned) {
      if (elapsed >= this.extendedTimeoutMs) {
        this.isPinned = false;
        return true;
      }
      return false;
    }
    return this.cleanStreak >= this.cleanStreakTarget && elapsed >= this.idleTimeoutMs;
  }
}

function routeDecision(score, thresholds = { low: 0.15, high: 0.85 }) {
  if (score < thresholds.low) return { action: "clear", stage: 1 };
  if (score >= thresholds.high) return { action: "block", stage: 1 };
  return { action: "escalate", stage: 2 };
}

test("cascade router: clears obviously clean images at stage 1", () => {
  const res = routeDecision(0.08);
  assert.equal(res.action, "clear");
  assert.equal(res.stage, 1);
});

test("cascade router: blocks obviously explicit images at stage 1", () => {
  const res = routeDecision(0.92);
  assert.equal(res.action, "block");
  assert.equal(res.stage, 1);
});

test("cascade router: escalates ambiguous scores to stage 2", () => {
  const res = routeDecision(0.45);
  assert.equal(res.action, "escalate");
  assert.equal(res.stage, 2);
});

test("memory controller: does not purge before clean streak target", () => {
  const ctrl = new MockMemoryController({ cleanStreakTarget: 15, idleTimeoutMs: 20000 });
  const t0 = 100000;
  ctrl.recordEscalation(t0);

  for (let i = 0; i < 10; i += 1) ctrl.recordCleanImage();
  assert.equal(ctrl.shouldPurge(t0 + 25000, t0), false);
});

test("memory controller: purges after clean streak and idle timeout reached", () => {
  const ctrl = new MockMemoryController({ cleanStreakTarget: 15, idleTimeoutMs: 20000 });
  const t0 = 100000;
  ctrl.recordEscalation(t0);

  for (let i = 0; i < 16; i += 1) ctrl.recordCleanImage();
  assert.equal(ctrl.shouldPurge(t0 + 25000, t0), true);
});

test("memory controller: double escalation within 2 min pins Freepik for 5 min", () => {
  const ctrl = new MockMemoryController({
    cleanStreakTarget: 15,
    idleTimeoutMs: 20000,
    extendedTimeoutMs: 300000,
  });
  const t0 = 100000;
  ctrl.recordEscalation(t0);
  ctrl.recordEscalation(t0 + 30000); // 30s later -> 2 in 2min

  assert.equal(ctrl.isPinned, true);

  for (let i = 0; i < 20; i += 1) ctrl.recordCleanImage();
  // 30s idle is not enough when pinned
  assert.equal(ctrl.shouldPurge(t0 + 60000, t0 + 30000), false);
  // After 5 minutes idle, pin releases and purges
  assert.equal(ctrl.shouldPurge(t0 + 350000, t0 + 30000), true);
});
