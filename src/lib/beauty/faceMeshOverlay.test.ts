import test from "node:test";
import assert from "node:assert/strict";
import {
  FACE_MESH_CONTOURS,
  classifyMeshLandmarkZone,
  summarizeFaceMesh,
} from "./faceMeshOverlay";
import type { FaceLandmarksBox } from "./types";

const SAMPLE_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.45,
  faceWidth: 0.42,
  faceHeight: 0.54,
  jawRatio: 0.8,
  foreheadRatio: 1.0,
  lipCenterY: 0.59,
  lipWidth: 0.16,
};

function makeSynthetic478Landmarks(offsetX = 0): Array<[number, number, number]> {
  return Array.from({ length: 478 }, (_, idx) => [
    120 + offsetX + (idx % 20) * 8,
    90 + Math.floor(idx / 20) * 12,
    0,
  ]);
}

test("classifyMeshLandmarkZone assigns anatomical zones including all 10 iris points", () => {
  assert.equal(classifyMeshLandmarkZone(10), "oval");
  assert.equal(classifyMeshLandmarkZone(33), "eye");
  assert.equal(classifyMeshLandmarkZone(70), "brow");
  assert.equal(classifyMeshLandmarkZone(4), "nose");
  assert.equal(classifyMeshLandmarkZone(61), "lip");
  assert.equal(classifyMeshLandmarkZone(468), "iris");
  assert.equal(classifyMeshLandmarkZone(477), "iris");
  assert.equal(classifyMeshLandmarkZone(205), "face");
});

test("FACE_MESH_CONTOURS indices stay within the 478-point range", () => {
  for (const contour of FACE_MESH_CONTOURS) {
    assert.ok(contour.indices.length >= 4);
    for (const idx of contour.indices) {
      assert.ok(idx >= 0 && idx < 478, `Index ${idx} out of 478-point bounds`);
    }
  }
});

test("summarizeFaceMesh reports full 478-point registration quality accurately", () => {
  const full = summarizeFaceMesh(makeSynthetic478Landmarks(0), SAMPLE_BOX, 420, 520, "neural");
  assert.equal(full.mode, "neural");
  assert.equal(full.pointCount, 478);
  assert.equal(full.hasIrises, true);
  assert.equal(full.inBoundsCount, 478);
  assert.equal(full.quality, "good");
  assert.equal(full.featureCounts.irises, 10);
  assert.ok(full.statusLabel.includes("478"));

  const clipped = summarizeFaceMesh(makeSynthetic478Landmarks(300), SAMPLE_BOX, 420, 520, "neural");
  assert.equal(clipped.quality, "partial");
  assert.ok(clipped.inBoundsRatio < 0.92);

  const fallback = summarizeFaceMesh(null, SAMPLE_BOX, 420, 520, "fallback");
  assert.equal(fallback.mode, "fallback");
  assert.equal(fallback.pointCount, 0);
  assert.equal(fallback.quality, "fallback");
});
