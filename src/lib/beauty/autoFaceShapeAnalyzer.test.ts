import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFaceShapeFromGeometry } from "./autoFaceShapeAnalyzer";
import type { FaceLandmarksBox, SeasonClassification } from "./types";

function makeNeuralLandmarksForShape(params: {
  length: number;
  cheek: number;
  jaw: number;
  forehead: number;
}): Array<[number, number, number]> {
  const cx = 200;
  const cy = 240;
  const lms: Array<[number, number, number]> = Array.from({ length: 478 }, () => [cx, cy, 0]);
  lms[10] = [cx, cy - params.length / 2, 0];
  lms[152] = [cx, cy + params.length / 2, 0];
  lms[234] = [cx - params.cheek / 2, cy, 0];
  lms[454] = [cx + params.cheek / 2, cy, 0];
  lms[172] = [cx - params.jaw / 2, cy + params.length * 0.28, 0];
  lms[397] = [cx + params.jaw / 2, cy + params.length * 0.28, 0];
  lms[54] = [cx - params.forehead / 2, cy - params.length * 0.3, 0];
  lms[284] = [cx + params.forehead / 2, cy - params.length * 0.3, 0];
  return lms;
}

const DEFAULT_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.45,
  faceWidth: 0.44,
  faceHeight: 0.52,
  jawRatio: 0.82,
  foreheadRatio: 0.84,
  lipCenterY: 0.62,
  lipWidth: 0.16,
};

test("analyzeFaceShapeFromGeometry classifies distinct shapes accurately from neuralLandmarks", () => {
  const cases: Array<{
    expected: "Oval" | "Round" | "Square" | "Heart" | "Oblong" | "Diamond";
    dims: { length: number; cheek: number; jaw: number; forehead: number };
  }> = [
    { expected: "Oval", dims: { length: 240, cheek: 200, jaw: 160, forehead: 160 } },
    { expected: "Round", dims: { length: 204, cheek: 200, jaw: 180, forehead: 180 } },
    { expected: "Square", dims: { length: 216, cheek: 200, jaw: 188, forehead: 188 } },
    { expected: "Heart", dims: { length: 236, cheek: 200, jaw: 140, forehead: 175 } },
    { expected: "Oblong", dims: { length: 280, cheek: 200, jaw: 170, forehead: 170 } },
    { expected: "Diamond", dims: { length: 236, cheek: 200, jaw: 144, forehead: 132 } },
  ];

  const hexPattern = /#[0-9a-fA-F]{3,6}\b/;

  for (const tc of cases) {
    const res = analyzeFaceShapeFromGeometry({
      neuralLandmarks: makeNeuralLandmarksForShape(tc.dims),
      faceBox: DEFAULT_BOX,
      width: 400,
      height: 500,
      undertone: "Warm (Golden)",
    });

    assert.equal(res.source, "neural");
    assert.equal(res.result.primary, tc.expected);
    assert.equal(res.tips.length, 3);
    assert.ok(res.confidencePct >= 1 && res.confidencePct <= 99);
    for (const tip of res.tips) {
      assert.ok(tip.headlineVi.length > 10);
      assert.ok(tip.detailVi.length > 30);
      assert.equal(hexPattern.test(tip.detailVi), false);
    }
  }
});

test("analyzeFaceShapeFromGeometry falls back cleanly to faceBox when neuralLandmarks is null", () => {
  const roundBox: FaceLandmarksBox = {
    centerX: 0.5,
    centerY: 0.45,
    faceWidth: 0.5,
    faceHeight: 0.51,
    jawRatio: 0.9,
    foreheadRatio: 0.9,
    lipCenterY: 0.62,
    lipWidth: 0.16,
  };

  const res = analyzeFaceShapeFromGeometry({
    neuralLandmarks: null,
    faceBox: roundBox,
    width: 400,
    height: 400,
    undertone: "Cool (Pink/Blue)",
  });

  assert.equal(res.source, "faceBox");
  assert.equal(res.result.primary, "Round");
  assert.equal(res.tips.length, 3);
  assert.equal(res.tips[0].id, "contour");
  assert.equal(res.tips[1].id, "highlight");
  assert.equal(res.tips[2].id, "blush_brow");
  assert.match(res.tips[0].detailVi, /nâu xám lạnh/i);
  assert.match(res.tips[1].detailVi, /ngọc trai trắng hồng/i);
});

test("analyzeFaceShapeFromGeometry adapts contour, highlight, and blush tones to all undertones", () => {
  const undertones: SeasonClassification["undertone"][] = [
    "Warm (Golden)",
    "Cool (Pink/Blue)",
    "Neutral",
  ];
  const neural = makeNeuralLandmarksForShape({
    length: 240,
    cheek: 200,
    jaw: 160,
    forehead: 160,
  });

  const outputs = undertones.map((undertone) =>
    analyzeFaceShapeFromGeometry({
      neuralLandmarks: neural,
      faceBox: DEFAULT_BOX,
      width: 400,
      height: 500,
      undertone,
    })
  );

  assert.notEqual(outputs[0].tips[0].detailVi, outputs[1].tips[0].detailVi);
  assert.notEqual(outputs[0].tips[1].detailVi, outputs[1].tips[1].detailVi);
  assert.notEqual(outputs[1].tips[2].detailVi, outputs[2].tips[2].detailVi);
});
