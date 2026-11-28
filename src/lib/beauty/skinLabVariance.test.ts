import test from "node:test";
import assert from "node:assert/strict";
import { labToRgb } from "./bradfordCat";
import { analyzeSkinLabVariance, computeIdealNeutralReference } from "./skinLabVariance";
import type { ConsultationReport, FaceLandmarksBox } from "./types";

function makeSyntheticReport(options?: {
  width?: number;
  height?: number;
  emptyMask?: boolean;
  useNeural?: boolean;
}): ConsultationReport {
  const width = options?.width ?? 160;
  const height = options?.height ?? 200;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const skinMask = new Uint8Array(width * height);
  const faceHullMask = new Uint8Array(width * height);

  const cx = width * 0.5;
  const cy = height * 0.5;
  const faceW = width * 0.6;
  const faceH = height * 0.65;

  // Paint spatially varying skin: bright forehead/nose highlight, rosy mid cheeks, darker jaw shadow
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const nx = (x - cx) / (faceW * 0.5);
      const ny = (y - cy) / (faceH * 0.5);
      const inFace = nx * nx + ny * ny <= 1.05;

      let L = 65;
      let a = 12;
      let b = 16;

      if (inFace) {
        if (!options?.emptyMask) {
          skinMask[idx] = 1;
          faceHullMask[idx] = 1;
        }
        // Bright highlight on forehead & nose bridge
        if (ny < -0.35 || (Math.abs(nx) < 0.2 && ny >= -0.35 && ny <= 0.15)) {
          L = 73.5;
          a = 10.5;
          b = 15.0;
        } else if (ny > 0.35 && Math.abs(nx) > 0.32) {
          // Natural jawline contour shadow
          L = 55.0;
          a = 11.0;
          b = 14.5;
        } else if (Math.abs(nx) > 0.25 && ny >= -0.1 && ny <= 0.35) {
          // Slightly rosier cheek plane
          L = 65.5;
          a = 16.5;
          b = 15.5;
        }
      }

      const [r, g, bCh] = labToRgb([L, a, b]);
      const o = idx * 4;
      rgba[o] = Math.round(r);
      rgba[o + 1] = Math.round(g);
      rgba[o + 2] = Math.round(bCh);
      rgba[o + 3] = 255;
    }
  }

  let neuralLandmarks: Array<[number, number, number]> | null = null;
  if (options?.useNeural) {
    neuralLandmarks = Array.from({ length: 468 }, () => [0.5 * width, 0.5 * height, 0]);
    const setPts = (indices: number[], nx: number, ny: number) => {
      for (const i of indices) {
        neuralLandmarks![i] = [nx * width, ny * height, 0];
      }
    };
    setPts([10, 151, 9, 108, 337], 0.5, 0.29); // Forehead
    setPts([168, 6, 197, 195, 5], 0.5, 0.47); // Nose bridge
    setPts([116, 117, 118, 123, 50], 0.36, 0.51); // Left cheekbone
    setPts([345, 346, 347, 352, 280], 0.64, 0.51); // Right cheekbone
    setPts([205, 206, 187, 147], 0.37, 0.58); // Left cheek
    setPts([425, 426, 411, 376], 0.63, 0.58); // Right cheek
    setPts([152, 175, 199, 200, 18], 0.5, 0.72); // Chin
    setPts([172, 136, 150], 0.33, 0.68); // Left jaw shadow
    setPts([397, 365, 379], 0.67, 0.68); // Right jaw shadow
  }

  return {
    whiteBalance: {
      method: "planckian_grey_edge",
      estimatedCctK: 5400,
      offLocusDeg: 0,
      illuminantLinear: [1, 1, 1],
    },
    faceShape: {
      primary: "Oval",
      secondary: "Heart",
      probabilities: { Oval: 0.7, Heart: 0.15, Round: 0.05, Square: 0.04, Oblong: 0.03, Diamond: 0.03 },
      ratios: { r1: 1.2, r2: 0.8, r3: 1.0 },
    },
    skinMetrics: {
      ITA_deg: 41.5,
      ITA_category: "Light (Fitzpatrick II)",
      L_star: 65.0,
      a_star: 13.0,
      b_star: 16.0,
      Melanin_index: 0.3,
      Hemoglobin_index: 0.25,
      sampleCount: 8000,
      method: "test",
    },
    lipMetrics: {
      lipBaseLab: [52, 22, 11],
      lipBaseHex: "#B06868",
      lipBorderL: 48,
      lipDarknessIndex: 0.2,
      hasDarkLipBorder: false,
      coverageRequirement: "Sheer",
      recommendedTexture: "Tint",
    },
    chromophores: {
      validPixels: 8000,
      melaninSpatialStd: 0.04,
      hemoglobinSpatialStd: 0.03,
      melaninDelta: new Float32Array(width * height),
      hemoglobinDelta: new Float32Array(width * height),
      shadingDelta: new Float32Array(width * height),
      validMask: skinMask,
      width,
      height,
    },
    season: {
      season: "Bright Winter",
      secondarySeason: "Cool Summer",
      confidence: 0.8,
      isBorderline: false,
      warmProbability: 0.3,
      probabilities: {
        "Light Spring": 0.02,
        "Warm Spring": 0.02,
        "Bright Spring": 0.03,
        "Light Summer": 0.05,
        "Cool Summer": 0.12,
        "Soft Summer": 0.03,
        "Warm Autumn": 0.02,
        "Soft Autumn": 0.02,
        "Deep Autumn": 0.01,
        "Bright Winter": 0.62,
        "Cool Winter": 0.04,
        "Deep Winter": 0.02,
      },
      undertone: "Cool (Pink/Blue)",
      skinHueDeg: 50.9,
      skinChroma: 20.6,
    },
    blendedTargets: { lip: "#BE5663", blush: "#DC7F8A", eyeshadow: "#866C6A" },
    advice: {
      contour: "",
      blush: "",
      lip: "",
      eyes: "",
      avoid: [],
      targetColors: { lip: "#BE5663", blush: "#DC7F8A", eyeshadow: "#866C6A" },
      executionParameters: { intensity: "", textureStyle: "", eyeDepth: "", prep: "", setting: "" },
    },
    landmarkSource: options?.useNeural ? "mediapipe_468" : "fallback_box",
    landmarkCount: options?.useNeural ? 468 : 0,
    skinEvidence: { verifiedSkinPixels: 8000, faceRegionPixels: 9000, usedRegionFallback: false },
    neuralLandmarks,
    skinMask,
    faceHullMask,
    correctedRgba: rgba,
    originalRgba: rgba,
    width,
    height,
  };
}

const DEFAULT_FACE_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.5,
  faceWidth: 0.6,
  faceHeight: 0.65,
  jawRatio: 0.8,
  foreheadRatio: 1.0,
  lipCenterY: 0.68,
  lipWidth: 0.24,
};

test("computeIdealNeutralReference anchors to user L* and 53 deg neutral hue", () => {
  const ideal = computeIdealNeutralReference(66.0, 18.0, 16.0);
  assert.equal(ideal.L, 66.0);
  assert.equal(ideal.hueDeg, 53.0);
  assert.match(ideal.hex, /^#[0-9A-F]{6}$/);
  const recoveredHue = (Math.atan2(ideal.b, ideal.a) * 180) / Math.PI;
  assert.ok(Math.abs(recoveredHue - 53.0) < 1.0, `Expected hue ~53°, got ${recoveredHue}`);
});

test("analyzeSkinLabVariance detects natural highlights, cheek redness, and jawline shadows with neural landmarks", () => {
  const report = makeSyntheticReport({ useNeural: true });
  const analysis = analyzeSkinLabVariance(report, DEFAULT_FACE_BOX);

  assert.equal(analysis.hasData, true);
  assert.equal(analysis.zones.length, 8);
  assert.ok(analysis.pixelCloud.length >= 40 && analysis.pixelCloud.length <= 110);

  const forehead = analysis.zones.find((z) => z.id === "forehead")!;
  const nose = analysis.zones.find((z) => z.id === "nose_bridge")!;
  const jaw = analysis.zones.find((z) => z.id === "jaw_shadow")!;
  const leftCheek = analysis.zones.find((z) => z.id === "left_cheek")!;

  assert.equal(forehead.role, "highlight");
  assert.equal(nose.role, "highlight");
  assert.ok(forehead.deltaL > 5, `Forehead deltaL should be clearly positive, got ${forehead.deltaL}`);

  assert.equal(jaw.role, "shadow");
  assert.ok(jaw.deltaL < -5, `Jaw shadow deltaL should be clearly negative, got ${jaw.deltaL}`);

  assert.ok(leftCheek.a > forehead.a, "Cheek should read rosier (higher a*) than forehead");
  assert.ok(analysis.luminanceSpread > 12, `Expected strong L* contrast spread, got ${analysis.luminanceSpread}`);
  assert.equal(analysis.darkestZone?.id, "jaw_shadow");
  assert.ok(analysis.brightestZone?.id === "forehead" || analysis.brightestZone?.id === "nose_bridge");
});

test("analyzeSkinLabVariance works cleanly with fallback box and handles empty skin masks without NaN", () => {
  const fallbackReport = makeSyntheticReport({ useNeural: false });
  const fallbackResult = analyzeSkinLabVariance(fallbackReport, DEFAULT_FACE_BOX);
  assert.equal(fallbackResult.hasData, true);
  assert.equal(fallbackResult.zones.length, 8);
  for (const z of fallbackResult.zones) {
    assert.ok(Number.isFinite(z.L) && Number.isFinite(z.a) && Number.isFinite(z.b));
    assert.ok(Number.isFinite(z.deltaE) && z.deltaE >= 0);
    assert.match(z.hex, /^#[0-9A-F]{6}$/);
  }

  const emptyReport = makeSyntheticReport({ emptyMask: true });
  const emptyResult = analyzeSkinLabVariance(emptyReport, DEFAULT_FACE_BOX);
  assert.equal(emptyResult.hasData, false);
  assert.equal(emptyResult.zones.length, 0);
  assert.equal(emptyResult.pixelCloud.length, 0);
  assert.equal(emptyResult.luminanceSpread, 0);
});
