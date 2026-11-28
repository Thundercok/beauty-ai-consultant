import assert from "node:assert/strict";
import test from "node:test";
import { srgbChannelToLinear } from "./bradfordCat";
import {
  CLIPPED_CHANNEL,
  type LinearRgb,
  estimateSkinChannelRatios,
  reconstructClippedPixel,
} from "./highlightRecovery";

const CLIP = srgbChannelToLinear(CLIPPED_CHANNEL);
const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];

/**
 * One face under a warm lamp, from deep shadow (G 0.05) to the lit cheek (G 0.6), in linear
 * camera RGB. Skin gets less red as it gets brighter: shadows are lit by light that scattered
 * through or bounced off skin, highlights carry surface reflection in the lamp's own colour.
 * The slope is fitted to the 7 bundled portraits re-lit to 3500K (R/G about 3.4 in shadow,
 * 2.6 on the clipped side).
 */
function warmLitFace(): { recorded: LinearRgb[]; lost: LinearRgb[] } {
  const face: LinearRgb[] = Array.from({ length: 4000 }, (_, i) => {
    const g = 0.05 + (0.55 * i) / 3999;
    return [g * (3.7 - 2.4 * g), g, g * (0.5 + 0.4 * g)];
  });
  return {
    recorded: face.filter((p) => p[0] < CLIP),
    lost: face.filter((p) => p[0] >= CLIP),
  };
}

test("reference ratios describe the highlights being rebuilt, not the shadow side", () => {
  const { recorded, lost } = warmLitFace();
  const truth = median(lost.map(([r, g]) => r / g));
  const wholeFace = median(recorded.map(([r, g]) => r / g));
  const ratios = estimateSkinChannelRatios(recorded);
  assert.ok(ratios);
  const naiveError = Math.abs(wholeFace - truth);
  const error = Math.abs(ratios.rOverG - truth);
  // The whole-face median is about 0.66 too red here, enough to pull hue ~4° towards red.
  assert.ok(
    error < naiveError * 0.65,
    `R/G ${ratios.rOverG.toFixed(3)} vs highlight truth ${truth.toFixed(3)} (whole-face median ${wholeFace.toFixed(3)})`
  );
});

test("too few unclipped samples give no ratios", () => {
  assert.equal(estimateSkinChannelRatios([[0.5, 0.2, 0.1]]), null);
});

test("a single clipped channel is rebuilt from green", () => {
  const ratios = { rOverG: 2.6, bOverG: 0.6 };
  const rebuilt = reconstructClippedPixel([CLIP, 0.45, 0.27], [true, false, false], ratios);
  assert.ok(rebuilt);
  assert.ok(Math.abs(rebuilt[0] - 0.45 * 2.6) < 1e-9);
  assert.equal(rebuilt[1], 0.45);
});

test("pixels that cannot be rebuilt are left out", () => {
  const ratios = { rOverG: 2.6, bOverG: 0.6 };
  // Two lost channels.
  assert.equal(reconstructClippedPixel([CLIP, CLIP, 0.3], [true, true, false], ratios), null);
  // Predicted red below what the camera recorded: not coloured like this person's skin.
  assert.equal(reconstructClippedPixel([CLIP, 0.2, 0.12], [true, false, false], ratios), null);
});
