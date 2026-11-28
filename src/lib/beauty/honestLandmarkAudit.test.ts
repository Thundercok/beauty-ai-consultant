import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHonestLandmarkAudit,
  computePerimeterCalloutSlots,
} from "./honestLandmarkAudit";
import type { ConsultationReport, FaceLandmarksBox } from "./types";

function makeSyntheticLandmarks(opts?: {
  rightBrowDropPx?: number;
  rightJawOutPx?: number;
  wideNosePx?: number;
  rollDeg?: number;
  yawDeg?: number;
}): Array<[number, number, number]> {
  const cx = 200;
  const pts: Array<[number, number, number]> = Array.from({ length: 478 }, () => [cx, 250, 0]);

  const setSym = (lIdx: number, rIdx: number, dx: number, y: number, rDx = dx, rY = y) => {
    pts[lIdx] = [cx - dx, y, 0];
    pts[rIdx] = [cx + rDx, rY, 0];
  };

  // Midline (roughly equal thirds: 100->180, 180->260, 260->340)
  pts[10] = [cx, 100, 0];
  pts[168] = [cx, 180, 0];
  pts[6] = [cx, 198, 0];
  pts[197] = [cx, 215, 0];
  pts[195] = [cx, 232, 0];
  pts[5] = [cx, 244, 0];
  pts[4] = [cx, 252, 0];
  pts[1] = [cx, 250, 0];
  pts[2] = [cx, 260, 0];
  pts[0] = [cx, 286, 0];
  pts[199] = [cx, 326, 0];
  pts[152] = [cx, 340, 0];

  const browDrop = opts?.rightBrowDropPx ?? 0;
  const jawOut = opts?.rightJawOutPx ?? 0;
  const noseExtra = opts?.wideNosePx ?? 0;

  // Brows
  setSym(70, 300, 52, 170, 52, 170 + browDrop);
  setSym(63, 293, 44, 165, 44, 165 + browDrop);
  setSym(105, 334, 34, 162, 34, 162 + browDrop);
  setSym(66, 296, 24, 166, 24, 166 + browDrop);
  setSym(107, 336, 16, 170, 16, 170 + browDrop);

  // Eyes & Irises (IPD = 66px => ~0.93mm/px)
  setSym(33, 263, 48, 194);
  setSym(133, 362, 18, 194);
  setSym(159, 386, 33, 188);
  setSym(468, 473, 33, 194);

  // Nose bridge & alae
  setSym(193, 417, 10, 184);
  setSym(122, 351, 9, 206);
  setSym(114, 343, 11, 228);
  setSym(129, 358, 18 + noseExtra, 252);
  setSym(98, 327, 18 + noseExtra, 255);

  // Cheeks & bizygomatic width (faceWidth = 156px)
  setSym(234, 454, 78, 224);
  setSym(116, 345, 62, 226);
  setSym(123, 352, 66, 236);
  setSym(50, 280, 44, 242);

  // Jaw
  setSym(132, 361, 74, 254, 74 + jawOut, 254);
  setSym(172, 397, 64, 286, 64 + jawOut, 286);
  setSym(136, 365, 50, 310, 50 + jawOut * 0.85, 310);
  setSym(149, 378, 30, 328, 30 + jawOut * 0.6, 328);

  // Lips
  setSym(61, 291, 26, 294);
  setSym(37, 267, 10, 288);

  // Simulate realistic 3D head yaw around vertical axis passing through nose bridge
  if (opts?.yawDeg) {
    const yawRad = (opts.yawDeg * Math.PI) / 180;
    const zScale = Math.sin(yawRad);
    const sideShift = Math.sin(yawRad) * 0.42;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i][0] - cx;
      const scale = dx < 0 ? 1 - sideShift : 1 + sideShift;
      pts[i] = [cx + dx * scale, pts[i][1], dx * zScale];
    }
  }

  if (opts?.rollDeg) {
    const rad = (opts.rollDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ox = 200;
    const oy = 220;
    return pts.map(([x, y, z]) => {
      const dx = x - ox;
      const dy = y - oy;
      return [ox + dx * cos - dy * sin, oy + dx * sin + dy * cos, z];
    });
  }

  return pts;
}

function makeReport(landmarks: Array<[number, number, number]> | null): ConsultationReport {
  return {
    width: 400,
    height: 500,
    originalRgba: new Uint8ClampedArray(400 * 500 * 4),
    correctedRgba: new Uint8ClampedArray(400 * 500 * 4),
    skinMask: new Uint8Array(400 * 500),
    faceHullMask: new Uint8Array(400 * 500),
    landmarkSource: landmarks ? "mediapipe_468" : "fallback_box",
    neuralLandmarks: landmarks,
    landmarkCount: landmarks ? landmarks.length : 0,
    skinEvidence: { verifiedSkinPixels: 20000, faceRegionPixels: 24000, usedRegionFallback: false },
    whiteBalance: {
      method: "planckian_grey_edge",
      estimatedCctK: 5800,
      offLocusDeg: 2.1,
      illuminantLinear: [1, 1, 1],
    },
    skinMetrics: {
      L_star: 66,
      a_star: 11,
      b_star: 15,
      ITA_deg: 42,
      ITA_category: "Intermediate",
      Melanin_index: 0.32,
      Hemoglobin_index: 0.25,
      sampleCount: 8500,
      method: "trimmed_median",
    },
    chromophores: {
      validPixels: 8500,
      melaninSpatialStd: 0.05,
      hemoglobinSpatialStd: 0.04,
      melaninDelta: new Float32Array(0),
      hemoglobinDelta: new Float32Array(0),
      shadingDelta: new Float32Array(0),
      validMask: new Uint8Array(0),
      width: 400,
      height: 500,
    },
    season: {
      season: "Cool Winter",
      secondarySeason: "Bright Winter",
      confidence: 0.86,
      isBorderline: false,
      undertone: "Cool (Pink/Blue)",
      warmProbability: 0.16,
      skinHueDeg: 52,
      skinChroma: 18,
      probabilities: {
        "Cool Winter": 0.72,
        "Bright Winter": 0.12,
        "Deep Winter": 0.08,
        "Cool Summer": 0.08,
        "Light Summer": 0,
        "Soft Summer": 0,
        "Light Spring": 0,
        "Warm Spring": 0,
        "Bright Spring": 0,
        "Soft Autumn": 0,
        "Warm Autumn": 0,
        "Deep Autumn": 0,
      },
    },
    faceShape: {
      primary: "Oval",
      secondary: "Heart",
      ratios: { r1: 1.45, r2: 0.79, r3: 0.94 },
      probabilities: {
        Oval: 0.65,
        Heart: 0.15,
        Round: 0.05,
        Square: 0.05,
        Oblong: 0.05,
        Diamond: 0.05,
      },
    },
    lipMetrics: {
      lipBaseLab: [56, 16, 10],
      lipBaseHex: "#a26a67",
      lipBorderL: 54,
      lipDarknessIndex: 0.12,
      hasDarkLipBorder: false,
      coverageRequirement: "medium",
      recommendedTexture: "Velvet Lip",
    },
    blendedTargets: {
      lip: "#b6535e",
      blush: "#d98a8c",
      eyeshadow: "#9a747d",
    },
    advice: {
      contour: "",
      blush: "",
      lip: "",
      eyes: "",
      avoid: [],
      targetColors: {
        lip: "#b6535e",
        blush: "#d98a8c",
        eyeshadow: "#9a747d",
      },
      executionParameters: {
        intensity: "medium",
        textureStyle: "velvet",
        eyeDepth: "soft",
        prep: "hydrated",
        setting: "natural",
      },
    },
  };
}

const DEFAULT_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.44,
  faceWidth: 0.42,
  faceHeight: 0.54,
  jawRatio: 0.8,
  foreheadRatio: 1.0,
  lipCenterY: 0.59,
  lipWidth: 0.16,
};

test("detects right brow droop, wider right jaw, and IPD-calibrated mm metrics with red cues", () => {
  const lms = makeSyntheticLandmarks({
    rightBrowDropPx: 6,
    rightJawOutPx: 8,
    wideNosePx: 6,
  });
  const audit = buildHonestLandmarkAudit(makeReport(lms), DEFAULT_BOX);

  assert.equal(audit.available, true);
  assert.ok(audit.overallBalanceScore < 85, `Expected lower honest balance score, got ${audit.overallBalanceScore}`);
  assert.ok(audit.pose.ipdPx > 60 && audit.pose.mmPerPx > 0.5, "Should calibrate IPD millimeter scale");

  const browIssue = audit.issues.find((i) => i.id === "brows")!;
  assert.equal(browIssue.severity, "fix_first");
  assert.equal(audit.realMakeupPlan.browLiftSide, "right");
  assert.ok(browIssue.arrows.length > 0, "Expected lift arrow cue above lower right brow");
  assert.ok(browIssue.arrows[0].to.y < browIssue.arrows[0].from.y, "Arrow should point upward");

  const jawIssue = audit.issues.find((i) => i.id === "contour_jaw")!;
  assert.equal(jawIssue.severity, "fix_first");
  assert.equal(audit.realMakeupPlan.widerJawSide, "right");
  assert.ok(jawIssue.strokes.some((s) => s.kind === "contour" && s.weight === "strong"));

  const noseIssue = audit.issues.find((i) => i.id === "nose")!;
  assert.equal(noseIssue.severity, "fix_first");
  assert.ok(noseIssue.arrows.length === 2, "Expected bilateral nose narrowing arrow cues");

  // Zero raw hex codes in user-facing Vietnamese text
  for (const issue of audit.issues) {
    assert.equal(/#[0-9a-fA-F]{6}/.test(issue.brutalCalloutVi), false);
    for (const step of issue.fixStepsVi) {
      assert.equal(/#[0-9a-fA-F]{6}/.test(step), false);
    }
  }
});

test("remains roll-invariant under head tilt and compensates mild 3D yaw without false jaw asymmetry", () => {
  const tiltedLms = makeSyntheticLandmarks({ rollDeg: 8 });
  const tiltedAudit = buildHonestLandmarkAudit(makeReport(tiltedLms), DEFAULT_BOX);

  assert.equal(tiltedAudit.available, true);
  assert.ok(tiltedAudit.overallBalanceScore >= 88, `Balanced tilted face should score >=88, got ${tiltedAudit.overallBalanceScore}`);
  assert.ok(Math.abs(tiltedAudit.headTiltDeg) > 6, "Should report measured head tilt angle");
  assert.equal(tiltedAudit.realMakeupPlan.browLiftSide, "balanced");
  assert.equal(tiltedAudit.realMakeupPlan.widerJawSide, "balanced");

  // Mild 7° 3D head turn on a symmetric face should be detected & compensated so jaw isn't falsely flagged fix_first
  const yawedLms = makeSyntheticLandmarks({ yawDeg: 7 });
  const yawedAudit = buildHonestLandmarkAudit(makeReport(yawedLms), DEFAULT_BOX);
  assert.ok(Math.abs(yawedAudit.pose.yawDeg) >= 3.5, `Expected detected yaw, got ${yawedAudit.pose.yawDeg}`);
  const jawOnYaw = yawedAudit.issues.find((i) => i.id === "contour_jaw")!;
  assert.notEqual(jawOnYaw.severity, "fix_first", "Mild head turn should not cause false severe jaw asymmetry");
});

test("detects pixel-level lopsided cheek-hollow contouring on an otherwise symmetric skeleton", () => {
  const lms = makeSyntheticLandmarks();
  const report = makeReport(lms);

  // Fill uniform medium skin across the face
  for (let y = 100; y <= 335; y++) {
    for (let x = 120; x <= 280; x++) {
      const idx = y * 400 + x;
      report.skinMask[idx] = 1;
      const off = idx * 4;
      report.originalRgba[off] = 196;
      report.originalRgba[off + 1] = 158;
      report.originalRgba[off + 2] = 136;
      report.originalRgba[off + 3] = 255;
    }
  }

  // Paint a noticeably heavier contour stripe ONLY on the left cheek hollow (~x: 132..166, y: 250..278)
  for (let y = 250; y <= 278; y++) {
    for (let x = 132; x <= 166; x++) {
      const off = (y * 400 + x) * 4;
      report.originalRgba[off] = 152;
      report.originalRgba[off + 1] = 114;
      report.originalRgba[off + 2] = 96;
    }
  }

  const audit = buildHonestLandmarkAudit(report, DEFAULT_BOX);
  assert.equal(audit.contourShading.available, true);
  assert.equal(audit.contourShading.heavierSide, "left");
  assert.ok(audit.contourShading.shadingAsymmetryDeltaL >= 8);

  const contourIssue = audit.issues.find((i) => i.id === "contour_jaw")!;
  assert.notEqual(contourIssue.severity, "balanced", "Lopsided cheek contour shading must be flagged");
  assert.match(contourIssue.stickerTitleVi, /Khối má trái đậm hơn/);
});

test("gracefully reports unavailability when neural landmarks are absent", () => {
  const audit = buildHonestLandmarkAudit(makeReport(null), DEFAULT_BOX);
  assert.equal(audit.available, false);
  assert.equal(audit.issues.length, 0);
  assert.match(audit.brutalHeadlineVi, /478 điểm/);
});

test("detects specular oily T-zone shine on original skin pixels and stays balanced on matte skin", () => {
  const lms = makeSyntheticLandmarks();
  lms[109] = [175, 108, 0];
  lms[10] = [200, 100, 0];
  lms[338] = [225, 108, 0];
  lms[297] = [232, 126, 0];
  lms[337] = [222, 146, 0];
  lms[151] = [200, 148, 0];
  lms[108] = [178, 146, 0];
  lms[67] = [168, 126, 0];

  const oilyReport = makeReport(lms);
  const matteReport = makeReport(lms);

  for (let y = 100; y <= 330; y++) {
    for (let x = 130; x <= 270; x++) {
      const idx = y * 400 + x;
      oilyReport.skinMask[idx] = 1;
      matteReport.skinMask[idx] = 1;
      const off = idx * 4;
      oilyReport.originalRgba[off] = 192;
      oilyReport.originalRgba[off + 1] = 152;
      oilyReport.originalRgba[off + 2] = 128;
      oilyReport.originalRgba[off + 3] = 255;

      matteReport.originalRgba[off] = 192;
      matteReport.originalRgba[off + 1] = 152;
      matteReport.originalRgba[off + 2] = 128;
      matteReport.originalRgba[off + 3] = 255;
    }
  }

  for (let y = 112; y <= 142; y++) {
    for (let x = 180; x <= 220; x++) {
      const off = (y * 400 + x) * 4;
      oilyReport.originalRgba[off] = 244;
      oilyReport.originalRgba[off + 1] = 238;
      oilyReport.originalRgba[off + 2] = 234;
    }
  }

  const oilyAudit = buildHonestLandmarkAudit(oilyReport, DEFAULT_BOX);
  const matteAudit = buildHonestLandmarkAudit(matteReport, DEFAULT_BOX);

  const oilyShine = oilyAudit.issues.find((i) => i.id === "shine_oil")!;
  const matteShine = matteAudit.issues.find((i) => i.id === "shine_oil")!;

  assert.equal(oilyShine.severity, "fix_first", "Glossy forehead patch should trigger fix_first");
  assert.ok(oilyShine.strokes.some((s) => s.kind === "oil_zone" && s.closed), "Should draw closed oil zone contour");
  assert.equal(matteShine.severity, "balanced", "Uniform matte skin should remain balanced");
});

test("computePerimeterCalloutSlots surfaces ONLY actionable non-balanced markers in overview and prevents collisions", () => {
  // 1. Asymmetric face: 3 real issues => 3 numbered collision-free markers
  const asymLms = makeSyntheticLandmarks({ rightBrowDropPx: 6, rightJawOutPx: 8, wideNosePx: 6 });
  const asymAudit = buildHonestLandmarkAudit(makeReport(asymLms), DEFAULT_BOX);

  const slots = computePerimeterCalloutSlots(asymAudit.issues, 400, 500, 200, "all");
  assert.equal(slots.length, 3, "Should cap overview red markers at 3");
  assert.ok(slots.every((s) => s.issue.severity !== "balanced"), "Overview markers must only flag real asymmetries");
  assert.deepEqual(slots.map((s) => s.markerIndex), [1, 2, 3]);

  for (const side of ["left", "right"] as const) {
    const rail = slots.filter((s) => s.side === side).sort((a, b) => a.stickerYNorm - b.stickerYNorm);
    for (let i = 0; i < rail.length; i++) {
      assert.ok(rail[i].stickerYNorm >= 0.17 && rail[i].stickerYNorm <= 0.77, "Marker callout must stay in safe vertical frame");
      if (i > 0) {
        assert.ok(rail[i].stickerYNorm - rail[i - 1].stickerYNorm >= 0.21, "Adjacent markers on same rail must not overlap");
      }
    }
  }

  // 2. Perfectly symmetric matte face: 0 overview red markers (no green clutter!)
  const balancedLms = makeSyntheticLandmarks();
  const balancedAudit = buildHonestLandmarkAudit(makeReport(balancedLms), DEFAULT_BOX);
  const balancedSlots = computePerimeterCalloutSlots(balancedAudit.issues, 400, 500, 200, "all");
  assert.equal(balancedSlots.length, 0, "Perfectly balanced face should not render red clutter markers in overview");

  // 3. Explicit single-zone focus still renders that zone's slot cleanly
  const singleSlot = computePerimeterCalloutSlots(balancedAudit.issues, 400, 500, 200, "brows");
  assert.equal(singleSlot.length, 1);
  assert.equal(singleSlot[0].issue.id, "brows");
});
