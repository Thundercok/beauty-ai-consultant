import assert from "node:assert/strict";
import test from "node:test";
import { computeAnalysisConfidence } from "./analysisConfidence";
import type { ConsultationReport, SeasonName } from "./types";

function makeBaseReport(
  overrides: Partial<
    Pick<
      ConsultationReport,
      "whiteBalance" | "landmarkSource" | "landmarkCount" | "skinMetrics" | "season"
    >
  > = {}
) {
  const emptyProbs = {} as Record<SeasonName, number>;
  return {
    whiteBalance: {
      method: "planckian_grey_edge" as const,
      estimatedCctK: 5800,
      offLocusDeg: 1.5,
      illuminantLinear: [1, 1, 1] as [number, number, number],
    },
    landmarkSource: "mediapipe_468" as const,
    landmarkCount: 478,
    skinMetrics: {
      ITA_deg: 46,
      ITA_category: "Light",
      L_star: 68,
      a_star: 10,
      b_star: 15,
      Melanin_index: 120,
      Hemoglobin_index: 40,
      sampleCount: 8200,
      method: "mediapipe",
    },
    season: {
      season: "Warm Spring" as const,
      secondarySeason: "Light Spring" as const,
      confidence: 0.78,
      isBorderline: false,
      warmProbability: 0.82,
      probabilities: emptyProbs,
      undertone: "Warm (Golden)" as const,
      skinHueDeg: 56,
      skinChroma: 18,
    },
    ...overrides,
  };
}

test("computeAnalysisConfidence rewards daylight + 478 landmarks with high score", () => {
  const res = computeAnalysisConfidence(makeBaseReport());
  assert.ok(res.score >= 88 && res.score <= 99, `Expected high score, got ${res.score}`);
  assert.equal(res.level, "high");
  assert.equal(res.factors.length, 4);
});

test("computeAnalysisConfidence drops noticeably under harsh warm cast without WB or fallback box", () => {
  const daylight = computeAnalysisConfidence(makeBaseReport());
  const warmWithWb = computeAnalysisConfidence(
    makeBaseReport({
      whiteBalance: {
        method: "planckian_grey_edge",
        estimatedCctK: 3000,
        offLocusDeg: 4.5,
        illuminantLinear: [1.3, 0.95, 0.55],
      },
    })
  );
  const harshNoWbFallback = computeAnalysisConfidence(
    makeBaseReport({
      whiteBalance: {
        method: "none",
        estimatedCctK: 2800,
        offLocusDeg: 11,
        illuminantLinear: [1.4, 0.9, 0.45],
      },
      landmarkSource: "fallback_box",
      landmarkCount: 0,
      skinMetrics: {
        ...makeBaseReport().skinMetrics,
        sampleCount: 400,
      },
    })
  );

  assert.ok(
    daylight.score > warmWithWb.score,
    `Expected daylight (${daylight.score}) > warmWithWb (${warmWithWb.score})`
  );
  assert.ok(
    warmWithWb.score > harshNoWbFallback.score,
    `Expected warmWithWb (${warmWithWb.score}) > harshNoWbFallback (${harshNoWbFallback.score})`
  );
  assert.equal(harshNoWbFallback.level, "low");
});
