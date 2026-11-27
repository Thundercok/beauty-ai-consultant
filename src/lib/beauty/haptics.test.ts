import assert from "node:assert/strict";
import test from "node:test";
import { HAPTIC_PATTERNS, triggerHaptic, type HapticPattern } from "./haptics";

test("triggerHaptic invokes navigator vibrate with crisp selection and soft patterns", () => {
  const calls: HapticPattern[] = [];
  const vibrate = (pattern: HapticPattern) => {
    calls.push(pattern);
    return true;
  };

  const tabSwitch = triggerHaptic("selection", { vibrate, prefersReducedMotion: false });
  assert.equal(tabSwitch.triggered, true);
  assert.equal(tabSwitch.channel, "vibrate");
  assert.equal(tabSwitch.pattern, HAPTIC_PATTERNS.selection);

  const tabReselect = triggerHaptic("soft", { vibrate, prefersReducedMotion: false });
  assert.equal(tabReselect.triggered, true);
  assert.equal(tabReselect.pattern, HAPTIC_PATTERNS.soft);

  assert.deepEqual(calls, [HAPTIC_PATTERNS.selection, HAPTIC_PATTERNS.soft]);
});

test("triggerHaptic respects prefers-reduced-motion and stays silent", () => {
  let called = false;
  const res = triggerHaptic("selection", {
    prefersReducedMotion: true,
    vibrate: () => {
      called = true;
      return true;
    },
  });

  assert.equal(called, false);
  assert.equal(res.triggered, false);
  assert.equal(res.channel, "none");
});

test("triggerHaptic falls back to iOS native switch pulse on touch devices without vibrate", () => {
  let iosPulsed = false;
  const res = triggerHaptic("selection", {
    prefersReducedMotion: false,
    isTouchDevice: true,
    triggerIosSwitch: () => {
      iosPulsed = true;
      return true;
    },
  });

  assert.equal(iosPulsed, true);
  assert.equal(res.triggered, true);
  assert.equal(res.channel, "ios-switch");
});

test("triggerHaptic fails gracefully without throwing when vibrate rejects or is absent on desktop", () => {
  const throwingRes = triggerHaptic("selection", {
    prefersReducedMotion: false,
    vibrate: () => {
      throw new Error("Blocked by browser policy");
    },
  });
  assert.equal(throwingRes.triggered, false);
  assert.equal(throwingRes.channel, "none");

  const desktopRes = triggerHaptic("selection", {
    prefersReducedMotion: false,
    isTouchDevice: false,
  });
  assert.equal(desktopRes.triggered, false);
  assert.equal(desktopRes.channel, "none");
});
