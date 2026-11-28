import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCameraFrame, computeCoverCrop, evaluateAmbientLux } from "./cameraAssistant";

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

test("analyzeCameraFrame accepts normal indoor soft shadow, dark bangs, and neck skin below chin", () => {
  const w = 72;
  const h = 96;
  const cx = w * 0.5;
  const cy = h * 0.46;
  const rx = w * 0.25;
  const ry = h * 0.31;

  // Simulates a realistic indoor selfie:
  // - dark room background ([38, 36, 36])
  // - dark hair covering top ~28% of the oval ([28, 25, 25])
  // - soft shadow on left cheek ([158, 114, 94]) vs brighter right cheek ([204, 154, 128])
  // - neck & warm beige shirt below the chin line ([145, 112, 92])
  const indoorSoftShadowFrame = makeSyntheticFrame(w, h, (x, y) => {
    const inFace = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    if (inFace) {
      if (y < cy - ry * 0.42) return [28, 25, 25]; // dark bangs/hair
      return x < cx ? [158, 114, 94] : [204, 154, 128]; // soft shadow vs lit cheek
    }
    if (y > cy + ry * 0.96 && Math.abs(x - cx) < w * 0.42) {
      return [145, 112, 92]; // neck + warm beige collar below chin
    }
    return [38, 36, 36]; // dim room background
  });

  const result = analyzeCameraFrame(indoorSoftShadowFrame, w, h);
  assert.equal(result.lighting.level, "perfect");
  assert.ok(result.lighting.luma !== null && result.lighting.luma >= 120);
  assert.ok(result.lighting.asymmetry < 0.44);
  assert.equal(result.alignment.status, "aligned");
  assert.equal(result.alignment.isReady, true);
});

test("analyzeCameraFrame still detects harsh uneven side-lit frames and off-center faces", () => {
  const w = 64;
  const h = 80;
  const unevenFrame = makeSyntheticFrame(w, h, (x) => (x < w / 2 ? [210, 175, 155] : [88, 72, 65]));
  const result = analyzeCameraFrame(unevenFrame, w, h);
  assert.equal(result.lighting.level, "uneven");
  assert.ok(result.lighting.asymmetry > 0.44);

  // Face shifted far to the right edge of the oval
  const offCenterFrame = makeSyntheticFrame(w, h, (x, y) => {
    const d = ((x - w * 0.72) / (w * 0.18)) ** 2 + ((y - h * 0.48) / (h * 0.24)) ** 2;
    return d <= 1 ? [196, 154, 132] : [60, 62, 66];
  });
  const offCenter = analyzeCameraFrame(offCenterFrame, w, h);
  assert.equal(offCenter.alignment.status, "center_face");
  assert.equal(offCenter.alignment.isReady, false);
});

test("computeCoverCrop center-crops wide 16:9 webcams to portrait 3:4 without squashing", () => {
  const crop = computeCoverCrop(1280, 720, 72, 96);
  assert.equal(crop.sy, 0);
  assert.equal(crop.sh, 720);
  assert.equal(crop.sw, 540);
  assert.equal(crop.sx, 370);

  const portraitCrop = computeCoverCrop(720, 1280, 72, 96);
  assert.equal(portraitCrop.sx, 0);
  assert.equal(portraitCrop.sw, 720);
  assert.equal(portraitCrop.sh, 960);
  assert.equal(portraitCrop.sy, 160);
});
