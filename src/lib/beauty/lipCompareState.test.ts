import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCompareBuyingVerdict,
  resolveCompareSlotSelection,
} from "./lipCompareState";
import type { MatchedProduct } from "./types";

function makeProduct(id: number, brand: string, shade: string): MatchedProduct {
  return {
    id,
    brand,
    name: "Juicy Lasting Tint",
    shade,
    productType: "lipstick",
    texture: "Juicy Tint",
    hex: "#C55A63",
    renderedHex: "#C25B64",
    deltaE: 3.5,
    matchTier: "Exact Match",
    undertone: "Cool",
    bestSeasons: "Cool Summer",
  };
}

test("resolveCompareSlotSelection assigns A and advances focus to B cleanly", () => {
  const res = resolveCompareSlotSelection({
    slot: "A",
    pickedId: 10,
    currentAId: 1,
    currentBId: 2,
  });
  assert.equal(res.nextAId, 10);
  assert.equal(res.nextBId, 2);
  assert.equal(res.nextActiveSlot, "B");
  assert.equal(res.swapped, false);
});

test("resolveCompareSlotSelection swaps A and B instead of duplicating identical shades", () => {
  const res = resolveCompareSlotSelection({
    slot: "B",
    pickedId: 1,
    currentAId: 1,
    currentBId: 2,
  });
  assert.equal(res.nextAId, 2);
  assert.equal(res.nextBId, 1);
  assert.equal(res.swapped, true);
});

test("buildCompareBuyingVerdict recommends higher-match shade with plain Vietnamese reasons and no hex codes", () => {
  const verdict = buildCompareBuyingVerdict({
    productA: makeProduct(1, "Rom&nd", "06 Figfig"),
    productB: makeProduct(2, "3CE", "Taupe"),
    matchPercentA: 94,
    matchPercentB: 86,
    priceA: {
      tier: "under_200k",
      tierLabel: "Dưới 200k",
      priceRangeLabel: "150k–180k",
      minK: 150,
      maxK: 180,
    },
    priceB: {
      tier: "mid_200_350k",
      tierLabel: "200–350k",
      priceRangeLabel: "270k–320k",
      minK: 270,
      maxK: 320,
    },
    traitsA: { bareFaceFriendly: true, teethBrightening: true, badges: ["Hợp mặt mộc đi học"] },
    traitsB: { bareFaceFriendly: false, teethBrightening: true, badges: ["Không xỉn răng"] },
  });

  assert.equal(verdict.recommendedSlot, "A");
  assert.match(verdict.headlineVi, /Màu A/);
  assert.match(verdict.sublineVi, /\+8%/);
  assert.match(verdict.sublineVi, /giá mềm hơn/i);
  assert.ok(!/#[0-9a-fA-F]{6}/.test(verdict.headlineVi + verdict.sublineVi));
});

test("buildCompareBuyingVerdict highlights cheaper option when match percentages are tied", () => {
  const verdict = buildCompareBuyingVerdict({
    productA: makeProduct(1, "MAC", "Chili"),
    productB: makeProduct(2, "Rom&nd", "23 Nucadamia"),
    matchPercentA: 91,
    matchPercentB: 90,
    priceA: {
      tier: "luxury_350k_plus",
      tierLabel: "Trên 350k",
      priceRangeLabel: "580k–650k",
      minK: 580,
      maxK: 650,
    },
    priceB: {
      tier: "under_200k",
      tierLabel: "Dưới 200k",
      priceRangeLabel: "150k–180k",
      minK: 150,
      maxK: 180,
    },
    traitsA: { bareFaceFriendly: false, teethBrightening: true, badges: [] },
    traitsB: { bareFaceFriendly: true, teethBrightening: false, badges: [] },
  });

  assert.equal(verdict.recommendedSlot, "B");
  assert.match(verdict.headlineVi, /tiết kiệm hơn/i);
});

test("resolveComparePairMeta maps A vs B, Bare vs A, and Bare vs B cleanly for horizontal slider", async () => {
  const { resolveComparePairMeta } = await import("./lipCompareState");

  const ab = resolveComparePairMeta("a_vs_b");
  assert.equal(ab.leftKind, "A");
  assert.equal(ab.rightKind, "B");

  const bareA = resolveComparePairMeta("bare_vs_a");
  assert.equal(bareA.leftKind, "bare");
  assert.equal(bareA.rightKind, "A");
  assert.match(bareA.ariaLabel, /không son/i);

  const bareB = resolveComparePairMeta("bare_vs_b");
  assert.equal(bareB.leftKind, "bare");
  assert.equal(bareB.rightKind, "B");
  assert.match(bareB.ariaLabel, /Màu B/i);
});
