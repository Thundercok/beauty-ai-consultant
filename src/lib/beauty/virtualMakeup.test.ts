import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVirtualMakeupToRgba,
  computeLipAlphaMask,
  deltaEToMatchPercent,
  hasActiveVirtualMakeup,
} from "./virtualMakeup";
import type { FaceLandmarksBox } from "./types";

const SAMPLE_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.45,
  faceWidth: 0.44,
  faceHeight: 0.56,
  jawRatio: 0.8,
  foreheadRatio: 1.0,
  lipCenterY: 0.62,
  lipWidth: 0.24,
};

function createFlatPortrait(width: number, height: number, rgb: [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[0];
    rgba[i * 4 + 1] = rgb[1];
    rgba[i * 4 + 2] = rgb[2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

test("deltaEToMatchPercent maps perceptual distance monotonically into 52-99% range", () => {
  assert.equal(deltaEToMatchPercent(0), 99);
  assert.ok(deltaEToMatchPercent(2.5) >= 92);
  assert.ok(deltaEToMatchPercent(2.5) > deltaEToMatchPercent(8));
  assert.ok(deltaEToMatchPercent(8) > deltaEToMatchPercent(16));
  assert.equal(deltaEToMatchPercent(40), 52);
});

test("computeLipAlphaMask returns tight bounds and matches precomputed compositing output", () => {
  const width = 80;
  const height = 100;
  const base = createFlatPortrait(width, height, [210, 175, 160]);
  const skinMask = new Uint8Array(width * height).fill(1);
  const cached = computeLipAlphaMask(width, height, null, SAMPLE_BOX);

  assert.ok(cached.minX > 10 && cached.maxX < width - 10);
  assert.ok(cached.minY > 40 && cached.maxY < 80);
  assert.ok(Math.abs(cached.centerXNorm - 0.5) < 0.05);

  const direct = applyVirtualMakeupToRgba(base, width, height, null, skinMask, SAMPLE_BOX, {
    lipEnabled: true,
    lipHex: "#B8293D",
    lipTexture: "Matte Lipstick",
    lipThickness: 1.3,
    blushEnabled: false,
  });

  const withCache = applyVirtualMakeupToRgba(base, width, height, null, skinMask, SAMPLE_BOX, {
    lipEnabled: true,
    lipHex: "#B8293D",
    lipTexture: "Matte Lipstick",
    lipThickness: 1.3,
    blushEnabled: false,
    precomputedLipMask: cached,
  });

  assert.deepEqual(Array.from(withCache), Array.from(direct));

  // Top-left corner far from lips must remain untouched
  assert.equal(withCache[0], base[0]);
  assert.equal(withCache[1], base[1]);
  assert.equal(withCache[2], base[2]);

  // Center of lip region (x=40, y=62) must shift noticeably toward red
  const lipIdx = (62 * width + 40) * 4;
  assert.ok(
    withCache[lipIdx] - withCache[lipIdx + 1] > base[lipIdx] - base[lipIdx + 1] + 25,
    "Lip center should gain strong red chroma from matte red lipstick"
  );
});

test("applyVirtualMakeupToRgba returns identical buffer when disabled", () => {
  const width = 40;
  const height = 50;
  const base = createFlatPortrait(width, height, [200, 165, 150]);
  const rendered = applyVirtualMakeupToRgba(base, width, height, null, null, SAMPLE_BOX, {
    lipEnabled: false,
    blushEnabled: false,
  });
  assert.equal(hasActiveVirtualMakeup({ lipEnabled: false, blushEnabled: false }), false);
  assert.deepEqual(Array.from(rendered), Array.from(base));
});

test("applyVirtualMakeupToRgba applies asymmetric contour, corrective brow lift, and eyeshadow cleanly", () => {
  const width = 120;
  const height = 140;
  const base = createFlatPortrait(width, height, [212, 180, 162]);
  const skinMask = new Uint8Array(width * height).fill(1);

  const lms: Array<[number, number, number]> = Array.from({ length: 478 }, () => [60, 70, 0]);
  // Cheeks & jaw (faceW = 60)
  lms[234] = [30, 72, 0];
  lms[454] = [90, 72, 0];
  lms[132] = [32, 84, 0];
  lms[361] = [88, 84, 0];
  lms[172] = [36, 98, 0];
  lms[397] = [84, 98, 0];
  lms[136] = [44, 108, 0];
  lms[365] = [76, 108, 0];
  lms[149] = [52, 114, 0];
  lms[378] = [68, 114, 0];
  // Nose
  lms[193] = [55, 56, 0];
  lms[122] = [55, 66, 0];
  lms[114] = [55, 74, 0];
  lms[129] = [52, 82, 0];
  lms[417] = [65, 56, 0];
  lms[351] = [65, 66, 0];
  lms[343] = [65, 74, 0];
  lms[358] = [68, 82, 0];
  lms[6] = [60, 58, 0];
  lms[197] = [60, 66, 0];
  lms[195] = [60, 72, 0];
  lms[4] = [60, 80, 0];
  lms[2] = [60, 84, 0];
  lms[116] = [38, 72, 0];
  lms[123] = [36, 78, 0];
  lms[50] = [44, 78, 0];
  lms[345] = [82, 72, 0];
  lms[352] = [84, 78, 0];
  lms[280] = [76, 78, 0];

  // Brows
  [
    [70, 38, 48], [63, 42, 46], [105, 47, 45], [66, 51, 46], [107, 54, 48],
    [55, 54, 51], [65, 50, 50], [52, 46, 49], [53, 42, 50], [46, 38, 51],
    [336, 66, 48], [296, 69, 46], [334, 73, 45], [293, 78, 46], [300, 82, 48],
    [276, 82, 51], [283, 78, 50], [282, 74, 49], [295, 70, 50], [285, 66, 51],
  ].forEach(([idx, x, y]) => {
    lms[idx] = [x, y, 0];
  });

  const opts = {
    contourEnabled: true,
    contourHex: "#6A5045",
    highlightHex: "#F7EAE0",
    contourIntensity: 0.35,
    widerJawSide: "right" as const,
    browEnabled: true,
    browHex: "#443A37",
    browIntensity: 0.36,
    browLiftSide: "right" as const,
    browLiftPx: 2.5,
  };
  assert.equal(hasActiveVirtualMakeup(opts), true);

  const rendered = applyVirtualMakeupToRgba(base, width, height, lms, skinMask, SAMPLE_BOX, opts);

  // Right jaw (wider side) must be noticeably darker than left jaw (narrower side)
  const rJawIdx = (98 * width + 84) * 4;
  const lJawIdx = (98 * width + 36) * 4;
  assert.ok(
    rendered[rJawIdx] < rendered[lJawIdx],
    `Wider right jaw (${rendered[rJawIdx]}) should be contoured darker than left jaw (${rendered[lJawIdx]})`
  );

  // Nose bridge center (x=60, y=68) should be brighter than flat base
  const bridgeIdx = (68 * width + 60) * 4;
  assert.ok(rendered[bridgeIdx] > base[bridgeIdx], "Nose bridge highlight should lift luminance");

  // Right brow center (x=73, y=47) should be darkened by brow grooming
  const rBrowIdx = (47 * width + 73) * 4;
  assert.ok(rendered[rBrowIdx] < base[rBrowIdx] - 8, "Right brow should receive optical taupe fill");
});

