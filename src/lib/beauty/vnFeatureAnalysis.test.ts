import assert from "node:assert/strict";
import test from "node:test";
import { analyzeVnFacialFeatures, buildPersonalizedMakeupGuide } from "./vnFeatureAnalysis";
import type { FaceShapeResult } from "./types";

function makeSyntheticFaceBuffer(
  width: number,
  height: number,
  options?: {
    redSpotFraction?: number;
    underEyeDark?: boolean;
  }
) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const skinMask = new Uint8Array(width * height);
  const hemoDelta = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      // Warm neutral skin baseline (~L=68, a=11, b=17)
      let r = 212;
      let g = 174;
      let b = 152;

      const inFace = x >= 20 && x <= width - 20 && y >= 20 && y <= height - 20;
      if (inFace) {
        skinMask[idx] = 1;
      }

      // Under-eye darkening band around y=42..52
      if (options?.underEyeDark && y >= 42 && y <= 52 && ((x >= 32 && x <= 46) || (x >= 74 && x <= 88))) {
        r = 152;
        g = 122;
        b = 114;
      }

      // Red blemish patches in cheek area
      if (options?.redSpotFraction && inFace) {
        const thresholdX = 20 + Math.floor((width - 40) * options.redSpotFraction);
        if (x < thresholdX && y >= 65 && y <= 95) {
          r = 210;
          g = 128;
          b = 118;
          hemoDelta[idx] = 0.22;
        }
      }

      rgba[p] = r;
      rgba[p + 1] = g;
      rgba[p + 2] = b;
      rgba[p + 3] = 255;
    }
  }

  return { rgba, skinMask, hemoDelta };
}

function makeLandmarks(overrides?: {
  alarSpan?: number;
  eyeHeight?: number;
  jawSpan?: number;
  noseBridgeZ?: number;
}): Array<[number, number, number]> {
  const lm: Array<[number, number, number]> = Array.from({ length: 478 }, () => [60, 60, 0]);

  // Face width = 80px (x=20..100)
  lm[234] = [20, 60, 0];
  lm[454] = [100, 60, 0];
  lm[10] = [60, 22, 0];
  lm[152] = [60, 110, 0];

  // Cheeks
  lm[50] = [38, 66, 0];
  lm[280] = [82, 66, 0];

  // Jaw width
  const jawSpan = overrides?.jawSpan ?? 64;
  lm[172] = [60 - jawSpan / 2, 92, 0];
  lm[397] = [60 + jawSpan / 2, 92, 0];

  // Nose bridge & alar wings
  const alarSpan = overrides?.alarSpan ?? 18;
  lm[6] = [60, 44, overrides?.noseBridgeZ ?? -0.09];
  lm[197] = [60, 52, overrides?.noseBridgeZ ?? -0.09];
  lm[114] = [53, 52, -0.02];
  lm[343] = [67, 52, -0.02];
  lm[48] = [60 - alarSpan / 2, 66, -0.04];
  lm[278] = [60 + alarSpan / 2, 66, -0.04];

  // Eyes (width = 16px each)
  const eyeH = overrides?.eyeHeight ?? 5.5;
  lm[33] = [30, 40, 0];
  lm[133] = [46, 40, 0];
  lm[159] = [38, 40 - eyeH / 2, 0];
  lm[145] = [38, 40 + eyeH / 2, 0];

  lm[263] = [90, 40, 0];
  lm[362] = [74, 40, 0];
  lm[386] = [82, 40 - eyeH / 2, 0];
  lm[374] = [82, 40 + eyeH / 2, 0];

  return lm;
}

const ROUND_SHAPE: FaceShapeResult = {
  primary: "Round",
  secondary: "Oval",
  probabilities: { Oval: 0.2, Round: 0.65, Square: 0.08, Heart: 0.03, Oblong: 0.02, Diamond: 0.02 },
  ratios: { r1: 1.01, r2: 0.91, r3: 1.0 },
};

const OVAL_SHAPE: FaceShapeResult = {
  primary: "Oval",
  secondary: "Heart",
  probabilities: { Oval: 0.72, Round: 0.08, Square: 0.05, Heart: 0.08, Oblong: 0.04, Diamond: 0.03 },
  ratios: { r1: 1.24, r2: 0.76, r3: 1.0 },
};

test("analyzeVnFacialFeatures flags wide/low nose, monolid eyes, fuller face, red acne, and dark under-eyes with Vietnamese makeup fixes", () => {
  const width = 120;
  const height = 120;
  const { rgba, skinMask, hemoDelta } = makeSyntheticFaceBuffer(width, height, {
    redSpotFraction: 0.45,
    underEyeDark: true,
  });
  const lm = makeLandmarks({
    alarSpan: 24, // 24/80 = 0.30 (wide alar)
    eyeHeight: 3.4, // 3.4/16 = 0.2125 (monolid/narrow aperture)
    jawSpan: 74, // 74/80 = 0.925 (fuller jawline)
    noseBridgeZ: -0.02, // flat bridge
  });

  const result = analyzeVnFacialFeatures({
    rgba,
    width,
    height,
    skinMask,
    neuralLandmarks: lm,
    faceShape: ROUND_SHAPE,
    skinL: 73,
    skinA: 12,
    melaninSpatialStd: 0.11,
    hemoglobinSpatialStd: 0.11,
    hemoglobinDelta: hemoDelta,
  });

  assert.equal(result.items.length, 5);
  const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));

  assert.equal(byId.nose.severity, "notable");
  assert.match(byId.nose.detectedLabel, /Sống mũi hơi thấp/i);
  assert.equal(byId.eyes.severity, "notable");
  assert.match(byId.eyes.detectedLabel, /Mắt một mí|mí lót/i);
  assert.equal(byId.face_fullness.severity, "notable");
  assert.match(byId.face_fullness.detectedLabel, /Má bầu bĩnh/i);
  assert.equal(byId.skin_blemish.severity, "notable");
  assert.match(byId.skin_blemish.makeupFixVi, /xanh lá nhạt/i);
  assert.equal(byId.undereye.severity, "notable");
  assert.match(byId.undereye.detectedLabel, /quầng thâm/i);

  // Ensure zero raw hex codes or offensive shaming terms appear anywhere
  for (const item of result.items) {
    assert.ok(!/#[0-9a-fA-F]{6}/.test(item.makeupFixVi), `No hex codes in ${item.id}`);
    assert.ok(!/xấu|béo phì/i.test(item.summaryVi), `Tactful Vietnamese copy in ${item.id}`);
  }
});

test("analyzeVnFacialFeatures returns balanced ratings cleanly when features are even and skin is uniform", () => {
  const width = 120;
  const height = 120;
  const { rgba, skinMask, hemoDelta } = makeSyntheticFaceBuffer(width, height, {
    redSpotFraction: 0,
    underEyeDark: false,
  });
  const lm = makeLandmarks({
    alarSpan: 17,
    eyeHeight: 5.8,
    jawSpan: 58,
    noseBridgeZ: -0.1,
  });

  const result = analyzeVnFacialFeatures({
    rgba,
    width,
    height,
    skinMask,
    neuralLandmarks: lm,
    faceShape: OVAL_SHAPE,
    skinL: 73,
    skinA: 12,
    melaninSpatialStd: 0.04,
    hemoglobinSpatialStd: 0.04,
    hemoglobinDelta: hemoDelta,
  });

  const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
  assert.equal(byId.face_fullness.severity, "balanced");
  assert.equal(byId.skin_blemish.severity, "balanced");
  assert.equal(byId.undereye.severity, "balanced");
});

test("buildPersonalizedMakeupGuide provides dedicated acne-safe and monolid/hooded-eye guides tailored to undertone and skin texture", () => {
  const width = 120;
  const height = 120;
  const { rgba, skinMask, hemoDelta } = makeSyntheticFaceBuffer(width, height, {
    redSpotFraction: 0.45,
    underEyeDark: true,
  });
  const lm = makeLandmarks({ alarSpan: 24, eyeHeight: 3.4, jawSpan: 74, noseBridgeZ: -0.02 });

  const analysis = analyzeVnFacialFeatures({
    rgba,
    width,
    height,
    skinMask,
    neuralLandmarks: lm,
    faceShape: ROUND_SHAPE,
    skinL: 73,
    skinA: 12,
    melaninSpatialStd: 0.11,
    hemoglobinSpatialStd: 0.11,
    hemoglobinDelta: hemoDelta,
  });

  const coolOily = buildPersonalizedMakeupGuide(analysis, "Cool (Pink/Blue)", "oily");
  const warmDry = buildPersonalizedMakeupGuide(analysis, "Warm (Golden)", "dry");

  assert.equal(coolOily.items.length, 5);
  assert.deepEqual(
    coolOily.items.map((i) => i.quickTabLabel),
    ["Da mụn", "Mắt một mí / mí lót", "Mũi tẹt", "Mặt tròn", "Quầng thâm"]
  );

  const acneCool = coolOily.items[0];
  const eyesCool = coolOily.items[1];
  const noseCool = coolOily.items[2];
  const acneWarm = warmDry.items[0];
  const eyesWarm = warmDry.items[1];
  const noseWarm = warmDry.items[2];

  assert.equal(acneCool.titleVi, "Hướng dẫn trang điểm cho da mụn");
  assert.equal(eyesCool.titleVi, "Trang điểm mắt một mí/mí lót");

  for (const item of coolOily.items) {
    assert.equal(item.stepsVi.length, 3);
    assert.ok(!/#[0-9a-fA-F]{6}/.test(item.stepsVi.join(" ")));
  }

  // Acne guide covers pore-safe non-comedogenic foundation + natural concealer
  assert.match(acneCool.stepsVi.join(" "), /bít tắc lỗ chân lông/i);
  assert.match(acneCool.stepsVi.join(" "), /non-comedogenic/i);
  assert.match(acneCool.stepsVi.join(" "), /che khuyết điểm/i);
  assert.match(acneCool.shadePickVi, /kiềm dầu/i);
  assert.match(acneWarm.shadePickVi, /cấp ẩm|dưỡng ẩm/i);

  // Monolid/hooded eye guide covers eyeshadow depth + thin eyeliner tailored to undertone
  assert.match(eyesCool.stepsVi.join(" "), /eyeliner/i);
  assert.match(eyesCool.stepsVi.join(" "), /2–3mm/i);
  assert.match(eyesCool.stepsVi.join(" "), /hồng đất lạnh/i);
  assert.match(eyesWarm.stepsVi.join(" "), /nâu trà sữa/i);

  // Nose contour still adapts to undertone
  assert.match(noseCool.shadePickVi, /nâu xám tro lạnh/i);
  assert.match(noseWarm.shadePickVi, /nâu be xám dịu/i);
});

test("buildVnHighlightContourPlan covers all 6 face shapes with natural Vietnamese student highlight and contour zones", async () => {
  const { buildVnHighlightContourPlan } = await import("./vnFeatureAnalysis");
  const shapes: Array<FaceShapeResult["primary"]> = [
    "Oval",
    "Round",
    "Square",
    "Heart",
    "Oblong",
    "Diamond",
  ];

  for (const primary of shapes) {
    const plan = buildVnHighlightContourPlan(
      { ...OVAL_SHAPE, primary },
      primary === "Round" ? "Cool (Pink/Blue)" : "Warm (Golden)"
    );
    assert.ok(plan.faceShapeVi.length > 0);
    assert.ok(plan.highlightZonesVi.length > 20);
    assert.ok(plan.contourZonesVi.length > 20);
    assert.ok(!/#[0-9a-fA-F]{6}/.test(plan.highlightZonesVi + plan.contourZonesVi + plan.productToneVi));
    assert.ok(!/bắt sáng\s+bắt sáng/i.test(plan.productToneVi));
  }

  const roundCool = buildVnHighlightContourPlan(ROUND_SHAPE, "Cool (Pink/Blue)");
  assert.equal(roundCool.faceShapeVi, "Mặt tròn");
  assert.match(roundCool.productToneVi, /nâu xám tro lạnh/i);
});

