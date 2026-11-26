import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVirtualMakeupToRgba,
  computeLipAlphaMask,
  deltaEToMatchPercent,
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
  assert.deepEqual(Array.from(rendered), Array.from(base));
});
