import test from "node:test";
import assert from "node:assert/strict";
import { analyzeFacialSymmetry } from "./facialSymmetry";

function buildSymmetric478Landmarks(options?: {
  tiltDeg?: number;
  jawRightExtraPx?: number;
  browLeftLiftPx?: number;
}): Array<[number, number, number]> {
  const cx = 200;
  const cy = 220;
  const pts: Array<[number, number, number]> = Array.from({ length: 478 }, () => [cx, cy, 0]);

  // Midline
  pts[10] = [cx, 80, 0];
  pts[168] = [cx, 175, 0];
  pts[1] = [cx, 235, 0];
  pts[152] = [cx, 355, 0];

  const setPair = (lIdx: number, rIdx: number, dx: number, y: number, extraR = 0, liftL = 0) => {
    pts[lIdx] = [cx - dx, y - liftL, 0];
    pts[rIdx] = [cx + dx + extraR, y, 0];
  };

  // Brows
  setPair(70, 300, 58, 155, 0, options?.browLeftLiftPx ?? 0);
  setPair(105, 334, 38, 148, 0, options?.browLeftLiftPx ?? 0);
  setPair(107, 336, 18, 152, 0, options?.browLeftLiftPx ?? 0);

  // Eyes
  setPair(33, 263, 52, 180);
  setPair(133, 362, 20, 182);
  setPair(159, 386, 36, 175);

  // Cheeks
  setPair(116, 345, 68, 222);
  setPair(234, 454, 90, 215);
  setPair(50, 280, 52, 234);

  // Jaw
  setPair(172, 397, 72, 295, options?.jawRightExtraPx ?? 0);
  setPair(136, 365, 58, 322, options?.jawRightExtraPx ?? 0);
  setPair(149, 378, 36, 342, options?.jawRightExtraPx ?? 0);

  // Lips
  setPair(61, 291, 32, 286);
  setPair(37, 267, 12, 276);

  if (options?.tiltDeg) {
    const rad = (options.tiltDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let i = 0; i < pts.length; i++) {
      const rx = pts[i][0] - cx;
      const ry = pts[i][1] - cy;
      pts[i] = [cx + rx * cos - ry * sin, cy + rx * sin + ry * cos, 0];
    }
  }

  return pts;
}

test("analyzeFacialSymmetry scores perfectly symmetric faces at 100% and stays roll-invariant under head tilt", () => {
  const upright = analyzeFacialSymmetry(buildSymmetric478Landmarks());
  assert.equal(upright.available, true);
  assert.equal(upright.overallScore, 100);
  assert.equal(upright.level, "high");
  assert.equal(upright.zones.length, 5);
  assert.equal(upright.widerOverallSide, "balanced");

  // Rotate face by 10 degrees — roll-invariant midline projection must still score ~100%
  const tilted = analyzeFacialSymmetry(buildSymmetric478Landmarks({ tiltDeg: 10 }));
  assert.equal(tilted.available, true);
  assert.ok(tilted.overallScore >= 99, `Expected >=99 under roll, got ${tilted.overallScore}`);
  assert.ok(Math.abs(Math.abs(tilted.headTiltDeg) - 10) < 0.5);
});

test("analyzeFacialSymmetry detects jaw width asymmetry and brow height offset with targeted contouring tips", () => {
  const asym = analyzeFacialSymmetry(
    buildSymmetric478Landmarks({ jawRightExtraPx: 14, browLeftLiftPx: 8 })
  );
  assert.equal(asym.available, true);
  assert.ok(asym.overallScore < 95);

  const jaw = asym.zones.find((z) => z.id === "jaw");
  const brow = asym.zones.find((z) => z.id === "brows");
  assert.ok(jaw && jaw.widerSide === "right" && jaw.horizontalDiffPct > 4);
  assert.ok(brow && brow.higherSide === "left" && brow.verticalDiffPct > 2);
  assert.ok(asym.contouringInsights.some((c) => c.zone.includes("quai hàm") && c.tipVi.includes("phải")));
  assert.ok(asym.contouringInsights.some((c) => c.zone.includes("chân mày")));
});

test("analyzeFacialSymmetry returns unavailable gracefully when neural landmarks are absent", () => {
  const res = analyzeFacialSymmetry(null);
  assert.equal(res.available, false);
  assert.equal(res.zones.length, 0);
  assert.ok(res.contouringInsights.length > 0);
});
