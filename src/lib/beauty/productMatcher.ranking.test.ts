import test from "node:test";
import assert from "node:assert/strict";
import { scoreLipstickRecommendation } from "./productMatcher";

test("lipstick ranking keeps color dominant while using season and undertone as secondary signals", () => {
  const closeButMetadataMismatch = scoreLipstickRecommendation({
    deltaE: 0.2,
    productSeasons: "Warm Autumn, Soft Autumn",
    productUndertone: "Warm",
    userSeason: "Cool Summer",
    userUndertone: "Cool (Pink/Blue)",
  });
  const slightlyFartherMetadataMatch = scoreLipstickRecommendation({
    deltaE: 4.0,
    productSeasons: "Cool Summer, Soft Summer",
    productUndertone: "Cool",
    userSeason: "Cool Summer",
    userUndertone: "Cool (Pink/Blue)",
  });
  assert.ok(closeButMetadataMismatch.score > slightlyFartherMetadataMatch.score);
  assert.ok(closeButMetadataMismatch.score >= 0 && closeButMetadataMismatch.score <= 100);
});

test("missing season and undertone metadata stays neutral rather than being treated as a match", () => {
  const missing = scoreLipstickRecommendation({
    deltaE: 2,
    productSeasons: "",
    productUndertone: "",
    userSeason: "Cool Summer",
    userUndertone: "Cool (Pink/Blue)",
  });
  const matched = scoreLipstickRecommendation({
    deltaE: 2,
    productSeasons: "Cool Summer",
    productUndertone: "Cool",
    userSeason: "Cool Summer",
    userUndertone: "Cool (Pink/Blue)",
  });
  assert.ok(matched.score > missing.score);
  assert.ok(missing.reasons.some((reason) => reason.includes("Chưa có")));
});

test("without personalization context, ranking remains color-only and does not create metadata score", () => {
  const neutral = scoreLipstickRecommendation({
    deltaE: 1,
    productSeasons: "",
    productUndertone: "",
  });
  assert.equal(neutral.score, 80);
  assert.ok(neutral.reasons.length === 1);
});
