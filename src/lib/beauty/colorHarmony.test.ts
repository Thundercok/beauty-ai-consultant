import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSeasonColorHarmonies,
  findClosestByHex,
  simulateIndoorLightingRgba,
} from "./colorHarmony";
import type { SeasonName } from "./types";

const ALL_SEASONS: SeasonName[] = [
  "Light Spring",
  "Warm Spring",
  "Bright Spring",
  "Light Summer",
  "Cool Summer",
  "Soft Summer",
  "Warm Autumn",
  "Soft Autumn",
  "Deep Autumn",
  "Bright Winter",
  "Cool Winter",
  "Deep Winter",
];

const HEX_RE = /^#[0-9A-F]{6}$/i;

test("buildSeasonColorHarmonies produces 3 distinct valid palettes and avoid swatches for all 12 seasons", () => {
  const targets = { lip: "#CF6C62", blush: "#E9908C", eyeshadow: "#C1956D" };

  for (const season of ALL_SEASONS) {
    const bundle = buildSeasonColorHarmonies(season, targets);
    assert.equal(bundle.palettes.length, 3, `${season} should produce 3 palettes`);
    assert.equal(bundle.avoidSwatches.length, 3, `${season} should produce 3 avoid swatches`);

    const lipHexes = new Set<string>();
    for (const p of bundle.palettes) {
      assert.match(p.eyeshadow.hex, HEX_RE);
      assert.match(p.blush.hex, HEX_RE);
      assert.match(p.lipstick.hex, HEX_RE);
      assert.ok(p.tip.length > 10);
      lipHexes.add(p.lipstick.hex);
    }
    assert.equal(lipHexes.size, 3, `${season} palettes should offer 3 distinct lip shades`);
  }
});

test("simulateIndoorLightingRgba applies visible warm 3100K and cool 7800K shifts", () => {
  // Neutral studio daylight grey pixel
  const neutral = new Uint8ClampedArray([200, 200, 200, 255]);
  const warm = simulateIndoorLightingRgba(neutral, 3100);
  const cool = simulateIndoorLightingRgba(neutral, 7800);

  assert.ok(warm[0] > warm[2] + 30, "3100K indoor lamp should shift neutral grey noticeably warm (R > B)");
  assert.ok(cool[2] > cool[0] + 6, "7800K fluorescent should shift neutral grey cooler (B > R)");
  assert.equal(warm[3], 255);
});

test("findClosestByHex picks the nearest lipstick swatch", () => {
  const items = [
    { id: 1, hex: "#FF2222" },
    { id: 2, hex: "#C87D6B" },
    { id: 3, hex: "#2222AA" },
  ];
  const hit = findClosestByHex(items, "#CA7B69");
  assert.equal(hit?.id, 2);
});
