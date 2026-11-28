import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCORE_WITHOUT_SKIN, computeAnalysisConfidence } from "./analysisConfidence";
import { assessAnalysisValidity, type FaceDetectionOutcome } from "./analysisValidity";
import { detectInitialFaceBox, runPortraitAnalysisPipeline } from "./portraitPipeline";
import type { SkinEvidence } from "./types";

const realFace: SkinEvidence = { verifiedSkinPixels: 30000, faceRegionPixels: 31000, usedRegionFallback: false };
const noSkin: SkinEvidence = { verifiedSkinPixels: 0, faceRegionPixels: 15000, usedRegionFallback: true };
const woodWall: SkinEvidence = { verifiedSkinPixels: 10237, faceRegionPixels: 24412, usedRegionFallback: false };
const tinyFace: SkinEvidence = { verifiedSkinPixels: 400, faceRegionPixels: 450, usedRegionFallback: false };

function check(faceDetection: FaceDetectionOutcome, skinEvidence: SkinEvidence) {
  const v = assessAnalysisValidity({ faceDetection, skinEvidence });
  return `${v.status}:${v.reason ?? "-"}`;
}

test("assessAnalysisValidity withholds results without skin or without a face", () => {
  for (const outcome of ["pending", "found", "not_found", "unavailable"] as const) {
    assert.equal(check(outcome, noSkin), "reject:no_skin", outcome);
  }
  assert.equal(check("not_found", realFace), "reject:no_face");
  assert.equal(check("unavailable", woodWall), "reject:no_face");
});

test("assessAnalysisValidity shows confirmed faces and warns on weak evidence", () => {
  assert.equal(check("found", realFace), "ok:-");
  assert.equal(check("pending", realFace), "ok:-");
  assert.equal(check("found", tinyFace), "warn:few_skin_pixels");
  assert.equal(check("unavailable", realFace), "warn:detector_unavailable");
  const warn = assessAnalysisValidity({ faceDetection: "unavailable", skinEvidence: realFace });
  assert.ok(warn.message && warn.message.length > 0);
  assert.equal(assessAnalysisValidity({ faceDetection: "found", skinEvidence: realFace }).message, null);
});

function solid(width: number, height: number, rgb: [number, number, number]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgb[0];
    rgba[i + 1] = rgb[1];
    rgba[i + 2] = rgb[2];
    rgba[i + 3] = 255;
  }
  return rgba;
}

function analyze(rgb: [number, number, number]) {
  const w = 200;
  const h = 200;
  const rgba = solid(w, h, rgb);
  return runPortraitAnalysisPipeline(rgba, w, h, detectInitialFaceBox(rgba, w, h), {
    wbMethod: "planckian_grey_edge",
    occasion: "daily",
    texture: "combination",
    neuralLandmarks: null,
  });
}

test("pipeline reports no skin evidence for black and white frames and caps confidence", () => {
  for (const rgb of [
    [0, 0, 0],
    [255, 255, 255],
    [80, 140, 220],
  ] as Array<[number, number, number]>) {
    const report = analyze(rgb);
    assert.equal(report.skinEvidence.usedRegionFallback, true, `rgb ${rgb}`);
    assert.equal(report.skinEvidence.verifiedSkinPixels, 0, `rgb ${rgb}`);
    assert.equal(report.skinMetrics.sampleCount, 0, `sampleCount must not count non-skin pixels (${rgb})`);
    const confidence = computeAnalysisConfidence(report);
    assert.ok(confidence.score <= MAX_SCORE_WITHOUT_SKIN, `score ${confidence.score} for ${rgb}`);
    assert.equal(confidence.level, "low");
  }
});

test("pipeline counts verified skin pixels for a skin-coloured frame", () => {
  const report = analyze([224, 172, 140]);
  assert.equal(report.skinEvidence.usedRegionFallback, false);
  assert.ok(report.skinEvidence.verifiedSkinPixels > 1000);
  assert.equal(report.skinMetrics.sampleCount, report.skinEvidence.verifiedSkinPixels);
});
