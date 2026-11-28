import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFacialAsymmetryHeatmap,
  deltaPctToHeat,
  heatToRgba,
} from "./asymmetryHeatmap";

function makeSyntheticFace(options?: {
  rightBrowLiftPx?: number;
  leftJawExtraWidthPx?: number;
  rollDeg?: number;
}): Array<[number, number, number]> {
  const lm: Array<[number, number, number]> = Array.from({ length: 478 }, () => [250, 250, 0]);
  const cx = 250;
  const cy = 250;

  // Midline anchors
  lm[10] = [cx, 120, 0];
  lm[168] = [cx, 220, 0];
  lm[152] = [cx, 390, 0];

  // Symmetric face width = 200px (left 150, right 350)
  const pairs: Array<[number, number, number, number]> = [
    // Cheeks (234 & 454 define bizygomatic width = 200px)
    [234, 454, 100, 255],
    [116, 345, 76, 250],
    [123, 352, 82, 272],
    [50, 280, 56, 265],
    [205, 425, 48, 282],
    // Brows
    [70, 300, 68, 192],
    [63, 293, 52, 186],
    [105, 334, 38, 184],
    [66, 296, 26, 188],
    [107, 336, 15, 192],
    // Eyes
    [33, 263, 62, 214],
    [133, 362, 24, 214],
    [159, 386, 44, 207],
    [145, 374, 44, 221],
    [130, 359, 66, 215],
    // Nose
    [129, 358, 22, 266],
    [49, 279, 20, 262],
    [102, 331, 24, 270],
    [48, 278, 22, 268],
    [64, 294, 23, 269],
    // Lips
    [61, 291, 34, 314],
    [37, 267, 14, 306],
    [39, 269, 22, 308],
    [40, 270, 28, 311],
    [84, 314, 16, 324],
    // Jaw
    [172, 397, 84, 320],
    [136, 365, 72, 344],
    [150, 379, 58, 362],
    [149, 378, 42, 376],
    [176, 400, 26, 384],
  ];

  for (const [lIdx, rIdx, halfW, y] of pairs) {
    lm[lIdx] = [cx - halfW, y, 0];
    lm[rIdx] = [cx + halfW, y, 0];
  }

  // Inject right brow lift (smaller y = higher on screen)
  if (options?.rightBrowLiftPx) {
    for (const rIdx of [300, 293, 334, 296, 336]) {
      lm[rIdx] = [lm[rIdx][0], lm[rIdx][1] - options.rightBrowLiftPx, 0];
    }
  }

  // Inject left jaw extra width (push image-left jaw outward to smaller x)
  if (options?.leftJawExtraWidthPx) {
    for (const lIdx of [172, 136, 150, 149, 176]) {
      lm[lIdx] = [lm[lIdx][0] - options.leftJawExtraWidthPx, lm[lIdx][1], 0];
    }
  }

  // Optional whole-face roll rotation around (cx, cy) to test roll invariance
  if (options?.rollDeg) {
    const rad = (options.rollDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let i = 0; i < lm.length; i++) {
      const dx = lm[i][0] - cx;
      const dy = lm[i][1] - cy;
      lm[i] = [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, 0];
    }
  }

  return lm;
}

test("buildFacialAsymmetryHeatmap returns balanced near-zero heat on a perfectly symmetric face", () => {
  const lm = makeSyntheticFace();
  const data = buildFacialAsymmetryHeatmap(lm);

  assert.equal(data.available, true);
  assert.equal(data.zones.length, 6);
  assert.equal(data.highVarianceZones.length, 0);
  assert.ok(data.overallScore >= 98, `Expected >= 98, got ${data.overallScore}`);
  for (const z of data.zones) {
    assert.equal(z.severity, "balanced");
    assert.equal(z.heat, 0);
    assert.ok(z.repairAdviceVi.length > 10);
  }
});

test("buildFacialAsymmetryHeatmap isolates asymmetric brows & jaw and stays invariant under head roll", () => {
  // 8px on a 200px face = 4.0% vertical brow delta; 10px = 5.0% horizontal jaw delta
  const upright = buildFacialAsymmetryHeatmap(
    makeSyntheticFace({ rightBrowLiftPx: 8, leftJawExtraWidthPx: 10 })
  );
  const rolled = buildFacialAsymmetryHeatmap(
    makeSyntheticFace({ rightBrowLiftPx: 8, leftJawExtraWidthPx: 10, rollDeg: 11 })
  );

  assert.equal(upright.available, true);
  assert.ok(upright.highVarianceZones.length >= 2);

  const brows = upright.zones.find((z) => z.id === "brows")!;
  const jaw = upright.zones.find((z) => z.id === "jaw")!;
  assert.equal(brows.severity, "notable");
  assert.equal(brows.higherSide, "right");
  assert.ok(brows.verticalDiffPct >= 3.8 && brows.verticalDiffPct <= 4.2);
  assert.ok(brows.heat > 0.7);

  assert.equal(jaw.severity, "notable");
  assert.equal(jaw.widerSide, "left");
  assert.ok(jaw.horizontalDiffPct >= 4.8 && jaw.horizontalDiffPct <= 5.2);

  // Zones must be sorted descending by variance so highest-variance zones appear first
  assert.ok(upright.zones[0].combinedDeltaPct >= upright.zones[upright.zones.length - 1].combinedDeltaPct);

  // Roll invariance: rotated face should yield virtually identical deltas
  const rolledBrows = rolled.zones.find((z) => z.id === "brows")!;
  const rolledJaw = rolled.zones.find((z) => z.id === "jaw")!;
  assert.ok(Math.abs(rolledBrows.verticalDiffPct - brows.verticalDiffPct) < 0.15);
  assert.ok(Math.abs(rolledJaw.horizontalDiffPct - jaw.horizontalDiffPct) < 0.15);
  assert.ok(Math.abs(rolled.headTiltDeg) > 10);
});

test("buildFacialAsymmetryHeatmap handles missing or short landmarks gracefully", () => {
  const empty = buildFacialAsymmetryHeatmap(null);
  assert.equal(empty.available, false);
  assert.equal(empty.zones.length, 0);
  assert.equal(empty.points.length, 0);

  const partial = buildFacialAsymmetryHeatmap([[10, 20, 0]]);
  assert.equal(partial.available, false);
});

test("deltaPctToHeat and heatToRgba scale monotonically across variance tiers", () => {
  assert.equal(deltaPctToHeat(0.2), 0);
  assert.ok(deltaPctToHeat(2.5) > 0.25 && deltaPctToHeat(2.5) < 0.65);
  assert.equal(deltaPctToHeat(6.5), 1);

  const c0 = heatToRgba(0);
  const c1 = heatToRgba(0.3);
  const c2 = heatToRgba(0.65);
  const c3 = heatToRgba(1.0);

  assert.equal(c0[3], 0);
  assert.ok(c1[3] > c0[3]);
  assert.ok(c2[3] > c1[3]);
  assert.ok(c3[3] > c2[3]);
  // Peak heat should be strong red
  assert.ok(c3[0] >= 215 && c3[1] <= 50);
});
