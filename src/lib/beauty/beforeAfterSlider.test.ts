import assert from "node:assert/strict";
import test from "node:test";
import {
  clampSplitPercent,
  computeCompareBadgeVisibility,
  computeSplitPercentFromPointer,
  formatBeforeLightingBadge,
} from "./beforeAfterSlider";

test("clampSplitPercent and computeSplitPercentFromPointer bound pointer coordinates cleanly", () => {
  assert.equal(clampSplitPercent(-12), 0);
  assert.equal(clampSplitPercent(145), 100);
  assert.equal(clampSplitPercent(Number.NaN), 50);

  assert.equal(computeSplitPercentFromPointer(150, 100, 200), 25);
  assert.equal(computeSplitPercentFromPointer(50, 100, 200), 0);
  assert.equal(computeSplitPercentFromPointer(360, 100, 200), 100);
  assert.equal(computeSplitPercentFromPointer(120, 100, 0), 50);
});

test("formatBeforeLightingBadge adapts copy for tungsten, cool fluorescent, daylight, and unknown CCT", () => {
  assert.equal(formatBeforeLightingBadge(3120), "Trước · Đèn vàng ~3100K");
  assert.equal(formatBeforeLightingBadge(7258), "Trước · Đèn lạnh ~7300K");
  assert.equal(formatBeforeLightingBadge(5357), "Trước · Gốc ~5400K");
  assert.equal(formatBeforeLightingBadge(null), "Trước · Ảnh gốc");
});

test("computeCompareBadgeVisibility fades badges smoothly near outer edges", () => {
  assert.deepEqual(computeCompareBadgeVisibility(50), {
    showBeforeBadge: true,
    showAfterBadge: true,
  });
  assert.deepEqual(computeCompareBadgeVisibility(10), {
    showBeforeBadge: false,
    showAfterBadge: true,
  });
  assert.deepEqual(computeCompareBadgeVisibility(90), {
    showBeforeBadge: true,
    showAfterBadge: false,
  });
});
