import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHonestMakeupAudit,
  honestDeltaEToScore,
} from "./honestMakeupAudit";
import type { HonestMakeupAuditInput } from "./honestMakeupAudit";

function makeBaseReport(overrides?: {
  warmProbability?: number;
  undertone?: "Warm (Golden)" | "Cool (Pink/Blue)" | "Neutral";
  skinL?: number;
  itaDeg?: number;
  hasDarkLipBorder?: boolean;
  targetLip?: string;
  targetBlush?: string;
  cctK?: number;
  landmarkSource?: "mediapipe_468" | "fallback_box";
  isBorderline?: boolean;
}): HonestMakeupAuditInput["report"] {
  const warmProbability = overrides?.warmProbability ?? 0.14;
  const undertone = overrides?.undertone ?? "Cool (Pink/Blue)";
  return {
    skinMetrics: {
      ITA_deg: overrides?.itaDeg ?? 44,
      ITA_category: "Light (Fitzpatrick II)",
      L_star: overrides?.skinL ?? 65,
      a_star: 11.5,
      b_star: 11.0,
      Melanin_index: 18,
      Hemoglobin_index: 12,
      sampleCount: 8200,
      method: "mediapipe_468_face_hull_hsv_trimmed_mean",
    },
    lipMetrics: {
      lipBaseLab: [51, 18, 9],
      lipBaseHex: "#9F6A6B",
      lipBorderL: overrides?.hasDarkLipBorder ? 38 : 49,
      lipDarknessIndex: overrides?.hasDarkLipBorder ? 9 : 2,
      hasDarkLipBorder: overrides?.hasDarkLipBorder ?? false,
      coverageRequirement: "Viền môi sáng đều",
      recommendedTexture: "Juicy Tint",
    },
    season: {
      season: undertone === "Warm (Golden)" ? "Warm Autumn" : "Cool Winter",
      secondarySeason: undertone === "Warm (Golden)" ? "Soft Autumn" : "Cool Summer",
      confidence: overrides?.isBorderline ? 0.36 : 0.72,
      isBorderline: overrides?.isBorderline ?? false,
      warmProbability,
      probabilities: {} as HonestMakeupAuditInput["report"]["season"]["probabilities"],
      undertone,
      skinHueDeg: undertone === "Warm (Golden)" ? 63 : 43,
      skinChroma: 16,
    },
    blendedTargets: {
      lip: overrides?.targetLip ?? "#B44862",
      blush: overrides?.targetBlush ?? "#D8899E",
      eyeshadow: "#8D7B87",
    },
    whiteBalance: {
      method: "planckian_grey_edge",
      estimatedCctK: overrides?.cctK ?? 5800,
      offLocusDeg: 1.8,
      illuminantLinear: [1, 1, 1],
    },
    landmarkSource: overrides?.landmarkSource ?? "mediapipe_468",
    landmarkCount: overrides?.landmarkSource === "fallback_box" ? 0 : 478,
  };
}

test("honestDeltaEToScore does not inflate severe mismatches to 52%", () => {
  assert.ok(honestDeltaEToScore(1.5) >= 95);
  assert.ok(honestDeltaEToScore(10) >= 60 && honestDeltaEToScore(10) <= 78);
  assert.ok(honestDeltaEToScore(24) < 30, "ΔE=24 should honestly drop below 30");
  assert.ok(honestDeltaEToScore(35) <= 15);
});

test("brutally rejects warm orange lipstick on cool skin and flags undertone + teeth yellowing", () => {
  const res = evaluateHonestMakeupAudit({
    report: makeBaseReport({ warmProbability: 0.12, undertone: "Cool (Pink/Blue)" }),
    lipstick: {
      brand: "Romand",
      name: "Glasting Melting Balm",
      shade: "Sorbet Balm",
      hex: "#E67E45",
      texture: "Dewy Balm",
      undertone: "Warm",
    },
    renderedLipHex: "#DE7B42",
    lipThickness: 1.0,
    blushEnabled: false,
  });

  assert.ok(
    res.verdictTier === "skip" || res.verdictTier === "risky",
    `Expected skip/risky on orange vs cool skin, got ${res.verdictTier} (${res.overallScore})`
  );
  assert.ok(res.overallScore < 55, `Expected low honest score, got ${res.overallScore}`);
  const undertoneCheck = res.checks.find((c) => c.id === "undertone");
  const teethCheck = res.checks.find((c) => c.id === "teeth");
  assert.equal(undertoneCheck?.status, "fail");
  assert.equal(teethCheck?.status, "warn");
  assert.ok(!/#[0-9a-fA-F]{6}/.test(res.headlineVi + res.brutalSummaryVi + res.actionableTipVi));
});

test("approves harmonious AI lip + blush pair on cool skin with high honest score", () => {
  const res = evaluateHonestMakeupAudit({
    report: makeBaseReport({ warmProbability: 0.12, undertone: "Cool (Pink/Blue)" }),
    lipstick: {
      brand: "Romand",
      name: "Blur Fudge Tint 07",
      shade: "Cool Rose Up",
      hex: "#B54A64",
      texture: "Velvet Tint",
      undertone: "Cool",
    },
    renderedLipHex: "#B24B64",
    lipThickness: 0.95,
    blushEnabled: true,
    blushHex: "#D98A9F",
    blushIntensity: 0.24,
    blushProduct: { brand: "Romand", shade: "Blueberry Chip", undertone: "Cool" },
  });

  assert.equal(res.verdictTier, "buy");
  assert.ok(res.overallScore >= 82, `Expected >=82, got ${res.overallScore}`);
  const blushCheck = res.checks.find((c) => c.id === "blush_harmony");
  assert.equal(blushCheck?.status, "pass");
});

test("flags chalky white-base washout on medium/tan skin", () => {
  const res = evaluateHonestMakeupAudit({
    report: makeBaseReport({
      warmProbability: 0.78,
      undertone: "Warm (Golden)",
      skinL: 55,
      itaDeg: 22,
      targetLip: "#9E453B",
    }),
    lipstick: {
      brand: "Peripera",
      name: "Ink Mood",
      shade: "Pale Milk",
      hex: "#E6C1B8",
      texture: "Matte Lipstick",
      undertone: "Warm",
    },
    renderedLipHex: "#DFB8AE",
    lipThickness: 1.2,
    blushEnabled: false,
  });

  const coverageCheck = res.checks.find((c) => c.id === "contrast_coverage");
  assert.equal(coverageCheck?.status, "fail");
  assert.match(coverageCheck?.verdictShort ?? "", /bợt môi/i);
});

test("warns honestly about dark lip border leak on thin sheer gloss and lip-blush clash", () => {
  const res = evaluateHonestMakeupAudit({
    report: makeBaseReport({
      warmProbability: 0.14,
      undertone: "Cool (Pink/Blue)",
      hasDarkLipBorder: true,
      cctK: 3200,
      isBorderline: true,
    }),
    lipstick: {
      brand: "Romand",
      name: "Juicy Lasting Tint",
      shade: "Bare Grape",
      hex: "#B8536E",
      texture: "Juicy Tint",
      undertone: "Cool",
    },
    renderedLipHex: "#B0516A",
    lipThickness: 0.5,
    blushEnabled: true,
    blushHex: "#EE9A55", // Clashing warm orange blush against cool berry lip!
    blushIntensity: 0.28,
    blushProduct: { brand: "3CE", shade: "Peach Splash", undertone: "Warm" },
  });

  const coverageCheck = res.checks.find((c) => c.id === "contrast_coverage");
  const blushCheck = res.checks.find((c) => c.id === "blush_harmony");
  assert.equal(coverageCheck?.status, "warn");
  assert.match(coverageCheck?.verdictShort ?? "", /viền thâm/i);
  assert.equal(blushCheck?.status, "fail");
  assert.match(blushCheck?.verdictShort ?? "", /Lệch tông Son – Má/i);
  assert.ok(res.measurementCaveatVi && res.measurementCaveatVi.includes("3200K"));
});
