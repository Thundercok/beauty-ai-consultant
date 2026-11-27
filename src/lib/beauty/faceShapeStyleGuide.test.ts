import test from "node:test";
import assert from "node:assert/strict";
import { classifyFaceShapeFromRatios } from "./faceAnalysis";
import { buildFaceShapeStyleProfile } from "./faceShapeStyleGuide";
import type { FaceShapeName } from "./types";

const ALL_SHAPES: FaceShapeName[] = ["Oval", "Round", "Square", "Heart", "Oblong", "Diamond"];

test("buildFaceShapeStyleProfile returns 3 distinct eyewear picks and brow guidance for all 6 shapes", () => {
  for (const shape of ALL_SHAPES) {
    const warm = buildFaceShapeStyleProfile(shape, "Warm (Golden)");
    const cool = buildFaceShapeStyleProfile(shape, "Cool (Pink/Blue)");

    assert.equal(warm.shape, shape);
    assert.equal(warm.eyewearTopPicks.length, 3);
    assert.ok(warm.eyebrowShapeVi.length > 10);
    assert.ok(warm.eyewearAvoidVi.length > 10);
    assert.equal(warm.frameColors.length, 4);

    const uniqueIds = new Set(warm.eyewearTopPicks.map((p) => p.id));
    assert.equal(uniqueIds.size, 3, `${shape} eyewear picks must be distinct`);

    // Warm vs cool undertones receive distinct metal/frame palettes
    assert.notEqual(warm.frameColors[0].label, cool.frameColors[0].label);
  }
});

test("classifyFaceShapeFromRatios never underflows to 0% even for extreme ratios", () => {
  const normal = classifyFaceShapeFromRatios(1.18, 0.78, 1.05);
  const sumNormal = Object.values(normal.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumNormal - 1) < 1e-6);
  assert.ok(normal.probabilities[normal.primary] > 0.25);

  const extreme = classifyFaceShapeFromRatios(1.8, 0.4, 0.3);
  const sumExtreme = Object.values(extreme.probabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumExtreme - 1) < 1e-6);
  assert.ok(extreme.probabilities[extreme.primary] > 0.5);
});
