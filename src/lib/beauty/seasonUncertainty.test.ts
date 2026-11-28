import assert from "node:assert/strict";
import test from "node:test";
import { hexToLab } from "./bradfordCat";
import { classifySeason, seasonSigmaForLight } from "./faceAnalysis";
import { blendTargetColorsLab, ciede2000 } from "./productMatcher";

type Lab = [number, number, number];

/**
 * Skin L*a*b* the pipeline measured on two bundled portraits after re-lighting them to
 * 2700K, 3500K, 4000K and 5000K, then the untouched photo (last row). Exposure was metered on
 * the face, like a phone camera does. Two cast models: per-channel RGB gain and Bradford.
 */
const RELIT: Record<string, { cct: number[]; lab: Lab[] }> = {
  "sample/rgb": {
    cct: [2700, 3500, 4000, 5000, 6504],
    lab: [
      [52.47, 24.62, 22.46],
      [55.27, 18.11, 15],
      [57.27, 16.5, 14.46],
      [62.79, 13.03, 16.38],
      [66.47, 12.34, 15.71],
    ],
  },
  "sample/bradford": {
    cct: [2700, 3500, 4000, 5000, 6504],
    lab: [
      [52.54, 18.25, 28.75],
      [55.9, 13.54, 18],
      [58.02, 12.82, 15.73],
      [63.07, 11.39, 16.82],
      [66.47, 12.34, 15.71],
    ],
  },
  "tan/rgb": {
    cct: [2700, 3500, 4000, 5000, 6504],
    lab: [
      [50.16, 23.64, 16.97],
      [51.9, 22, 22.87],
      [52.36, 20.78, 23.14],
      [53.26, 17.57, 21.79],
      [54.24, 15.59, 19.92],
    ],
  },
  "tan/bradford": {
    cct: [2700, 3500, 4000, 5000, 6504],
    lab: [
      [49.81, 18.11, 24.45],
      [51.84, 17.83, 25.31],
      [52.36, 17.67, 24.76],
      [53.33, 16.08, 22.78],
      [54.24, 15.59, 19.92],
    ],
  },
};

function targets(lab: Lab, cct?: number): Lab[] {
  const season = classifySeason(lab[0], lab[1], lab[2], cct);
  return Object.values(blendTargetColorsLab(season.probabilities)).map(hexToLab);
}

const worstSlot = (a: Lab[], b: Lab[]) => Math.max(...a.map((v, k) => ciede2000(v, b[k])));

test("season likelihoods widen as the light moves away from daylight", () => {
  const daylight = seasonSigmaForLight(6504);
  const office = seasonSigmaForLight(4000);
  const tungsten = seasonSigmaForLight(2700);
  for (let k = 0; k < 3; k++) {
    assert.ok(daylight[k] < office[k] && office[k] < tungsten[k], `feature ${k}`);
  }
  // Unknown light keeps only the residual-error floor.
  assert.deepEqual(seasonSigmaForLight(null), seasonSigmaForLight(6504));
});

test("lighting-aware posteriors keep product targets closer to the daylight result", () => {
  let fixedError = 0;
  let awareError = 0;
  let n = 0;
  for (const { cct, lab } of Object.values(RELIT)) {
    const fixedDaylight = targets(lab[4]);
    const awareDaylight = targets(lab[4], cct[4]);
    for (let i = 0; i < 4; i++) {
      fixedError += worstSlot(targets(lab[i]), fixedDaylight);
      awareError += worstSlot(targets(lab[i], cct[i]), awareDaylight);
      n++;
    }
  }
  fixedError /= n;
  awareError /= n;
  // Measured: about 9.4 ΔE00 with fixed widths and 6.3 with lighting-aware ones.
  assert.ok(
    awareError < fixedError * 0.85,
    `aware ${awareError.toFixed(2)} vs fixed ${fixedError.toFixed(2)}`
  );
});

test("daylight photos keep their personalised targets", () => {
  for (const { lab } of Object.values(RELIT)) {
    const before = targets(lab[4]);
    const after = targets(lab[4], 6504);
    assert.ok(
      worstSlot(before, after) < 1.5,
      `daylight target moved ${worstSlot(before, after).toFixed(2)}`
    );
  }
});
