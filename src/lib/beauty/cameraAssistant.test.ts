import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCameraFrame, evaluateAmbientLux } from "./cameraAssistant";

function makeSyntheticFrame(
  width: number,
  height: number,
  fillFn: (x: number, y: number) => [number, number, number]
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fillFn(x, y);
      const idx = (y * width + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

test("evaluateAmbientLux maps dark, dim, optimal daylight, and overexposed lux accurately", () => {
  const dark = evaluateAmbientLux(20);
  assert.equal(dark.level, "too_dark");
  assert.equal(dark.badgeEn, "Too Dark");
  assert.equal(dark.source, "ambient_sensor");

  const dim = evaluateAmbientLux(95);
  assert.equal(dim.level, "slightly_dim");

  const perfect = evaluateAmbientLux(450);
  assert.equal(perfect.level, "perfect");
  assert.equal(perfect.badgeEn, "Perfect");
  assert.ok(perfect.score >= 90);

  const bright = evaluateAmbientLux(4200);
  assert.equal(bright.level, "too_bright");
});

test("analyzeCameraFrame detects Too Dark frames and Perfect centered skin frames", () => {
  const w = 64;
  const h = 80;

  const darkFrame = makeSyntheticFrame(w, h, () => [28, 22, 20]);
  const darkResult = analyzeCameraFrame(darkFrame, w, h);
  assert.equal(darkResult.lighting.level, "too_dark");
  assert.equal(darkResult.lighting.badgeEn, "Too Dark");
  assert.equal(darkResult.alignment.status, "move_closer");

  // Well-lit centered skin oval inside neutral background
  const cx = w * 0.5;
  const cy = h * 0.46;
  const rx = w * 0.22;
  const ry = h * 0.27;
  const perfectFrame = makeSyntheticFrame(w, h, (x, y) => {
    const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    return d <= 1 ? [196, 154, 132] : [135, 138, 142];
  });
  const perfectResult = analyzeCameraFrame(perfectFrame, w, h);
  assert.equal(perfectResult.lighting.level, "perfect");
  assert.equal(perfectResult.lighting.badgeEn, "Perfect");
  assert.equal(perfectResult.alignment.status, "aligned");
  assert.equal(perfectResult.alignment.isReady, true);
});

test("analyzeCameraFrame detects uneven side-lit frames", () => {
  const w = 64;
  const h = 80;
  const unevenFrame = makeSyntheticFrame(w, h, (x) => (x < w / 2 ? [210, 175, 155] : [88, 72, 65]));
  const result = analyzeCameraFrame(unevenFrame, w, h);
  assert.equal(result.lighting.level, "uneven");
  assert.ok(result.lighting.asymmetry > 0.28);
});
