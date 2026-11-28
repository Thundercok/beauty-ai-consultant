import assert from "node:assert/strict";
import test from "node:test";
import {
  BRADFORD_INV_MATRIX,
  BRADFORD_MATRIX,
  SRGB_TO_XYZ_MATRIX,
  XYZ_TO_SRGB_MATRIX,
  linearChannelToSrgb,
  mat3Mul,
  mat3Vec,
  srgbChannelToLinear,
} from "./bradfordCat";
import { illuminantLocusLinearRgb } from "./colorConstancy";
import { ciede2000 } from "./productMatcher";
import * as pipeline from "./portraitPipeline";

// Lets the same test be pointed at another build of the pipeline when comparing versions.
const P: typeof pipeline = process.env.PIPELINE_MODULE
  ? await import(process.env.PIPELINE_MODULE)
  : pipeline;

const W = 240;
const H = 240;

/**
 * A room of neutral grey tiles with a skin-coloured oval in the middle, photographed under D65.
 * The tile edges are what the Grey-Edge illuminant estimator reads; the oval is what gets measured.
 */
function syntheticPortrait(): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const inFace = ((x - W / 2) / 70) ** 2 + ((y - H / 2) / 92) ** 2 <= 1;
      // Small deterministic texture so percentile and edge statistics are not degenerate.
      const n = ((x * 7 + y * 13) % 11) - 5;
      const tile = 70 + (((x >> 4) * 5 + (y >> 4) * 3) % 7) * 20;
      const rgb = inFace ? [214 + n, 166 + n, 140 + n] : [tile, tile, tile];
      rgba[i] = rgb[0];
      rgba[i + 1] = rgb[1];
      rgba[i + 2] = rgb[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

/**
 * Re-photographs the D65 scene under another colour temperature with a Bradford (cone-space
 * von Kries) shift, scaled down so no channel clips, like auto-exposure protecting highlights.
 */
function relight(rgba: Uint8ClampedArray, cctKelvin: number): Uint8ClampedArray {
  const lms = (rgb: [number, number, number]) =>
    mat3Vec(BRADFORD_MATRIX, mat3Vec(SRGB_TO_XYZ_MATRIX, rgb));
  const from = lms(illuminantLocusLinearRgb(6504));
  const to = lms(illuminantLocusLinearRgb(cctKelvin));
  const scale = [
    [to[0] / from[0], 0, 0],
    [0, to[1] / from[1], 0],
    [0, 0, to[2] / from[2]],
  ];
  let m = mat3Mul(
    XYZ_TO_SRGB_MATRIX,
    mat3Mul(BRADFORD_INV_MATRIX, mat3Mul(scale, mat3Mul(BRADFORD_MATRIX, SRGB_TO_XYZ_MATRIX)))
  );
  const peak = Math.max(...m.map((row) => row[0] + row[1] + row[2]));
  m = m.map((row) => row.map((v) => v / peak));
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const lin = [0, 1, 2].map((k) => srgbChannelToLinear(rgba[i + k]));
    for (let k = 0; k < 3; k++) {
      const v = m[k][0] * lin[0] + m[k][1] * lin[1] + m[k][2] * lin[2];
      out[i + k] = Math.round(linearChannelToSrgb(Math.min(1, Math.max(0, v))));
    }
    out[i + 3] = 255;
  }
  return out;
}

// The oval's own box. The heuristic face finder is tuned for photos and misses a flat oval.
const FACE_BOX = {
  centerX: 0.5,
  centerY: 0.5,
  faceWidth: 0.56,
  faceHeight: 0.74,
  jawRatio: 0.8,
  foreheadRatio: 1,
  lipCenterY: 0.68,
  lipWidth: 0.2,
};

function analyze(rgba: Uint8ClampedArray) {
  return P.runPortraitAnalysisPipeline(rgba, W, H, FACE_BOX, {
    wbMethod: "planckian_grey_edge",
    occasion: "daily",
    texture: "combination",
    neuralLandmarks: null,
  });
}

function measureSkin(rgba: Uint8ClampedArray) {
  const m = analyze(rgba).skinMetrics;
  return [m.L_star, m.a_star, m.b_star] as [number, number, number];
}

// Exposure changes L*, which is a separate question; this test is about colour (a*, b*).
const chromaDelta = (a: [number, number, number], b: [number, number, number]) =>
  ciede2000([50, a[1], a[2]], [50, b[1], b[2]]);

test("measured skin colour barely moves between warm 2700K and cool 6500K light", () => {
  const scene = syntheticPortrait();
  const byCct = [2700, 4000, 5000, 6500].map((cct) => ({
    cct,
    lab: measureSkin(relight(scene, cct)),
  }));
  let worst = 0;
  for (const a of byCct) {
    for (const b of byCct) worst = Math.max(worst, chromaDelta(a.lab, b.lab));
  }
  // About 2.5 ΔE00 now, mostly 8-bit quantisation of the dim blue channel at 2700K.
  // Measuring on the beautified display image, as before, gave about 6.7.
  assert.ok(worst < 3, `skin a*/b* drift ${worst.toFixed(2)} ΔE00 across 2700–6500K`);
});

test("clipped camera channels are not used to measure skin", () => {
  const scene = syntheticPortrait();
  // Warm light often blows out only the red channel of bright skin. The pixel still looks
  // skin-coloured, but its true red is unknown, so its hue is not trustworthy.
  for (let y = 0; y < H; y++) {
    for (let x = W / 2; x < W; x++) {
      const i = (y * W + x) * 4;
      if (scene[i] > 200 && scene[i + 1] > 150) scene[i] = 255;
    }
  }
  const report = analyze(scene);
  assert.equal(report.skinEvidence.usedRegionFallback, false);
  for (let i = 0; i < report.skinMask.length; i++) {
    if (!report.skinMask[i]) continue;
    const x = i % W;
    const idx = i * 4;
    assert.ok(scene[idx] < 255, `red-clipped pixel at x=${x} was sampled as skin`);
  }
});
