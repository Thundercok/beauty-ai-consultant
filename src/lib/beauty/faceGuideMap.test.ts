import test from "node:test";
import assert from "node:assert/strict";
import {
  FACE_GUIDE_ZONE_ORDER,
  buildFaceGuideGeometry,
  buildFaceGuideZones,
  mapConcernToGuideZone,
  projectImagePointToCoverPercent,
  stepFaceGuideRoutine,
  toggleFaceGuideLayer,
} from "./faceGuideMap";
import { buildFaceGuideExportCaption } from "./faceGuideExport";
import { analyzeVnFacialFeatures } from "./vnFeatureAnalysis";
import type { ConsultationReport, FaceLandmarksBox, FaceShapeName } from "./types";

const BASE_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.45,
  faceWidth: 0.42,
  faceHeight: 0.52,
  jawRatio: 0.84,
  foreheadRatio: 1.0,
  lipCenterY: 0.62,
  lipWidth: 0.16,
};

function makeFakeNeuralLandmarks(width: number, height: number): Array<[number, number, number]> {
  const lms: Array<[number, number, number]> = Array.from({ length: 478 }, () => [
    width * 0.5,
    height * 0.48,
    0,
  ]);
  lms[10] = [width * 0.5, height * 0.2, 0];
  lms[152] = [width * 0.5, height * 0.72, 0];
  lms[234] = [width * 0.3, height * 0.46, 0];
  lms[454] = [width * 0.7, height * 0.46, 0];
  lms[54] = [width * 0.34, height * 0.28, 0];
  lms[284] = [width * 0.66, height * 0.28, 0];
  lms[116] = [width * 0.37, height * 0.49, 0];
  lms[345] = [width * 0.63, height * 0.49, 0];
  lms[172] = [width * 0.34, height * 0.62, 0];
  lms[397] = [width * 0.66, height * 0.62, 0];

  lms[33] = [width * 0.36, height * 0.41, 0];
  lms[133] = [width * 0.45, height * 0.41, 0];
  lms[159] = [width * 0.405, height * 0.39, 0];
  lms[145] = [width * 0.405, height * 0.425, 0];
  lms[362] = [width * 0.55, height * 0.41, 0];
  lms[263] = [width * 0.64, height * 0.41, 0];
  lms[386] = [width * 0.595, height * 0.39, 0];
  lms[374] = [width * 0.595, height * 0.425, 0];

  lms[55] = [width * 0.45, height * 0.35, 0];
  lms[285] = [width * 0.55, height * 0.35, 0];
  lms[6] = [width * 0.5, height * 0.41, -0.05];
  lms[197] = [width * 0.5, height * 0.45, -0.06];
  lms[1] = [width * 0.5, height * 0.51, -0.09];
  lms[2] = [width * 0.5, height * 0.53, -0.06];
  lms[114] = [width * 0.46, height * 0.45, -0.02];
  lms[343] = [width * 0.54, height * 0.45, -0.02];
  lms[48] = [width * 0.44, height * 0.51, -0.03];
  lms[278] = [width * 0.56, height * 0.51, -0.03];

  lms[0] = [width * 0.5, height * 0.58, -0.04];
  lms[13] = [width * 0.5, height * 0.605, -0.04];
  lms[14] = [width * 0.5, height * 0.612, -0.04];
  lms[17] = [width * 0.5, height * 0.64, -0.04];
  lms[61] = [width * 0.42, height * 0.61, -0.02];
  lms[291] = [width * 0.58, height * 0.61, -0.02];
  return lms;
}

test("projectImagePointToCoverPercent matches CSS object-cover object-top math", () => {
  // Image 400x400 inside wider frame 800x400: scale=2, renderedW=800, offsetX=0, offsetY=0
  const wide = projectImagePointToCoverPercent(200, 100, 400, 400, 800, 400);
  assert.equal(wide.leftPct, 50);
  assert.equal(wide.topPct, 50);
  assert.equal(wide.visible, true);

  // Image 600x400 inside tall frame 300x400: scale=1, renderedW=600, offsetX=-150
  const center = projectImagePointToCoverPercent(300, 200, 600, 400, 300, 400);
  assert.equal(center.leftPct, 50);
  assert.equal(center.topPct, 50);
  assert.equal(center.visible, true);

  // Point cropped off far left is marked not visible and clamped safely inside frame bounds
  const offLeft = projectImagePointToCoverPercent(20, 200, 600, 400, 300, 400);
  assert.equal(offLeft.visible, false);
  assert.ok(offLeft.leftPct >= 7 && offLeft.leftPct <= 93);
});

test("buildFaceGuideGeometry generates valid visuals & separated pins for neural and fallback modes", () => {
  const neural = makeFakeNeuralLandmarks(400, 500);
  const shapes: FaceShapeName[] = ["Oval", "Round", "Square", "Heart", "Oblong", "Diamond"];

  for (const faceShape of shapes) {
    const geom = buildFaceGuideGeometry({
      width: 400,
      height: 500,
      neuralLandmarks: neural,
      box: BASE_BOX,
      faceShape,
      undertone: "Warm (Golden)",
      blendedTargets: { lip: "#C85A60", blush: "#E58B78", eyeshadow: "#B7886E" },
    });

    for (const zone of FACE_GUIDE_ZONE_ORDER) {
      const pin = geom.pins[zone];
      assert.ok(Number.isFinite(pin.x) && Number.isFinite(pin.y), `${faceShape} ${zone} pin finite`);
      const vis = geom.visuals[zone];
      const totalPrimitives =
        vis.strokes.length + vis.dots.length + vis.blobs.length + vis.polygons.length;
      assert.ok(totalPrimitives >= 3, `${faceShape} ${zone} has visual primitives`);
    }

    // Ensure pins are well separated spatially (> 25px apart on 400x500 canvas)
    for (let i = 0; i < FACE_GUIDE_ZONE_ORDER.length; i++) {
      for (let j = i + 1; j < FACE_GUIDE_ZONE_ORDER.length; j++) {
        const a = geom.pins[FACE_GUIDE_ZONE_ORDER[i]];
        const b = geom.pins[FACE_GUIDE_ZONE_ORDER[j]];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        assert.ok(dist > 25, `pins ${FACE_GUIDE_ZONE_ORDER[i]} and ${FACE_GUIDE_ZONE_ORDER[j]} separated`);
      }
    }
  }

  // Fallback box mode (neuralLandmarks === null)
  const fallback = buildFaceGuideGeometry({
    width: 400,
    height: 500,
    neuralLandmarks: null,
    box: BASE_BOX,
    faceShape: "Round",
    undertone: "Cool (Pink/Blue)",
  });
  for (const zone of FACE_GUIDE_ZONE_ORDER) {
    assert.ok(Number.isFinite(fallback.pins[zone].x));
    assert.ok(fallback.visuals[zone].strokes.length > 0);
  }
});

test("buildFaceGuideZones produces plain Vietnamese advice with zero raw hex codes", () => {
  const width = 40;
  const height = 40;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(180);
  const skinMask = new Uint8Array(width * height).fill(1);
  const hemoDelta = new Float32Array(width * height).fill(0.02);

  const faceShape = {
    primary: "Round" as const,
    secondary: "Oval" as const,
    probabilities: {
      Oval: 0.25,
      Round: 0.55,
      Square: 0.05,
      Heart: 0.05,
      Oblong: 0.05,
      Diamond: 0.05,
    },
    ratios: { r1: 1.08, r2: 0.88, r3: 0.98 },
  };

  const analysis = analyzeVnFacialFeatures({
    rgba,
    width,
    height,
    skinMask,
    neuralLandmarks: null,
    faceShape,
    skinL: 64,
    skinA: 11,
    melaninSpatialStd: 0.06,
    hemoglobinSpatialStd: 0.05,
    hemoglobinDelta: hemoDelta,
  });

  const mockReport = {
    faceShape,
    season: {
      season: "Soft Autumn",
      secondarySeason: "Warm Autumn",
      confidence: 0.88,
      isBorderline: false,
      warmProbability: 0.72,
      probabilities: {} as ConsultationReport["season"]["probabilities"],
      undertone: "Warm (Golden)",
      skinHueDeg: 54,
      skinChroma: 18,
    },
    lipMetrics: {
      lipBaseLab: [54, 18, 12],
      lipBaseHex: "#AE726B",
      lipBorderL: 49,
      lipDarknessIndex: 0.35,
      hasDarkLipBorder: true,
      coverageRequirement: "medium",
      recommendedTexture: "Velvet Matte",
    },
    blendedTargets: {
      lip: "#C85A60",
      blush: "#E58B78",
      eyeshadow: "#B7886E",
    },
  } as ConsultationReport;

  const zones = buildFaceGuideZones(mockReport, analysis);
  const hexPattern = /#[0-9a-fA-F]{3,6}\b/;

  for (const id of FACE_GUIDE_ZONE_ORDER) {
    const z = zones[id];
    assert.ok(z.titleVi.length > 6);
    assert.ok(z.howToVi.length > 20);
    assert.ok(z.avoidVi.length > 10);
    assert.ok(z.legend.length >= 2);
    assert.equal(hexPattern.test(z.titleVi), false);
    assert.equal(hexPattern.test(z.howToVi), false);
    assert.equal(hexPattern.test(z.avoidVi), false);
  }

  assert.equal(/Dáng Mặt/i.test(zones.hair.detectedCueVi), false);
  assert.equal(/sống mũi/i.test(zones.cheek_jaw.howToVi), false);
});

test("toggleFaceGuideLayer supports independent multi-layer combinations and deterministic order", () => {
  const s1 = toggleFaceGuideLayer([], "cheek_jaw");
  assert.deepEqual(s1, ["cheek_jaw"]);

  const s2 = toggleFaceGuideLayer(s1, "eyes");
  assert.deepEqual(s2, ["eyes", "cheek_jaw"]);

  const s3 = toggleFaceGuideLayer(s2, "cheek_jaw");
  assert.deepEqual(s3, ["eyes"]);
});

test("stepFaceGuideRoutine cycles cleanly forward and backward across all 5 steps", () => {
  assert.equal(stepFaceGuideRoutine(null, "next"), "eyes");
  assert.equal(stepFaceGuideRoutine("eyes", "next"), "cheek_jaw");
  assert.equal(stepFaceGuideRoutine("hair", "next"), "eyes");
  assert.equal(stepFaceGuideRoutine("eyes", "prev"), "hair");
});

test("buildFaceGuideGeometry includes directional brush-sweep arrows for eyes, cheeks, and nose plus brow/outer-V strokes", () => {
  const neural = makeFakeNeuralLandmarks(400, 500);
  const geom = buildFaceGuideGeometry({
    width: 400,
    height: 500,
    neuralLandmarks: neural,
    box: BASE_BOX,
    faceShape: "Round",
    undertone: "Warm (Golden)",
  });
  assert.equal(geom.visuals.eyes.arrows.length, 2);
  assert.equal(geom.visuals.cheek_jaw.arrows.length, 2);
  assert.equal(geom.visuals.nose.arrows.length, 2);
  assert.equal(geom.visuals.eyes.strokes.length, 8);
  assert.equal(geom.visuals.cheek_jaw.blobs.every((b) => b.softRadial === true), true);
});

test("mapConcernToGuideZone links AI guide concerns to matching portrait layers", () => {
  assert.equal(mapConcernToGuideZone("eyes"), "eyes");
  assert.equal(mapConcernToGuideZone("nose"), "nose");
  assert.equal(mapConcernToGuideZone("face_fullness"), "cheek_jaw");
  assert.equal(mapConcernToGuideZone("skin_blemish"), null);
  assert.equal(mapConcernToGuideZone("unknown"), null);
});

test("buildFaceGuideExportCaption formats active layer labels cleanly", () => {
  const dummyZones = {
    eyes: { shortLabel: "Phấn mắt" },
    cheek_jaw: { shortLabel: "Má hồng" },
    nose: { shortLabel: "Khối mũi" },
    lips: { shortLabel: "Môi" },
    hair: { shortLabel: "Tóc/Mái" },
  } as Parameters<typeof buildFaceGuideExportCaption>[0];

  assert.equal(
    buildFaceGuideExportCaption(dummyZones, ["eyes", "cheek_jaw"]),
    "Sơ đồ: Phấn mắt · Má hồng"
  );
  assert.equal(buildFaceGuideExportCaption(dummyZones, []), "Sơ đồ trang điểm cá nhân hóa");
});

