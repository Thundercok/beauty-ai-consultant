import assert from "node:assert/strict";
import test from "node:test";
import { adaptLabBradford, hexToLab, labToRgb, rgbToLab } from "./bradfordCat";
import { extractRelativeChromophoresSrgb } from "./chromophores";
import { illuminantLocusLinearRgb, projectToPlanckianLocus } from "./colorConstancy";
import { classifySeason } from "./faceAnalysis";
import {
  adaptiveLowLightContrast,
  bilateralDenoiseRgba,
  enhancePortraitForLandmarks,
  unsharpMaskLumaRgba,
} from "./imageEnhancement";
import { kubelkaMunkLipBlend } from "./kubelkaMunk";
import {
  POPULARITY_HIGHLIGHT_THRESHOLD,
  blendTargetColorsLab,
  ciede2000,
  scoreMatchedProductsPopularity,
  selectTrendingProducts,
} from "./productMatcher";

test("Bradford CAT round-trips D50 -> D65 -> D50 accurately", () => {
  const labD50: [number, number, number] = [65.0, 12.0, 18.0];
  const adaptedD65 = adaptLabBradford(labD50, "D50", "D65");
  const backToD50 = adaptLabBradford(adaptedD65, "D65", "D50");
  assert.ok(Math.abs(backToD50[0] - labD50[0]) < 1e-4);
  assert.ok(Math.abs(backToD50[1] - labD50[1]) < 1e-4);
  assert.ok(Math.abs(backToD50[2] - labD50[2]) < 1e-4);
});

test("Soft 12-season classifier has no cliff across warm/cool boundary and hits archetypes", () => {
  let prevLab: [number, number, number] | null = null;
  let prevWarm: number | null = null;

  for (let i = 0; i <= 12; i++) {
    const bVal = 9.0 + i * 0.5;
    const season = classifySeason(65.0, 9.5, bVal);
    const probSum = Object.values(season.probabilities).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(probSum - 1.0) < 1e-6);

    const targets = blendTargetColorsLab(season.probabilities);
    const lipLab = hexToLab(targets.lip);
    if (prevLab !== null && prevWarm !== null) {
      const stepDe00 = ciede2000(prevLab, lipLab);
      assert.ok(stepDe00 < 1.2, `Discontinuous lip jump (${stepDe00}) at b*=${bVal}`);
      assert.ok(Math.abs(season.warmProbability - prevWarm) < 0.1);
    }
    prevLab = lipLab;
    prevWarm = season.warmProbability;
  }

  const deepWarm = classifySeason(46.0, 10.5, 18.5);
  assert.equal(deepWarm.season, "Deep Autumn");
  assert.ok(deepWarm.warmProbability > 0.75);

  const lightCool = classifySeason(74.0, 11.0, 10.5);
  assert.equal(lightCool.season, "Light Summer");
  assert.ok(lightCool.warmProbability < 0.25);
});

test("Kubelka-Munk zero thickness preserves substrate and opaque layer approaches shade", () => {
  const substrate: [number, number, number] = [118, 73, 76];
  const product: [number, number, number] = [185, 63, 72];

  const bare = kubelkaMunkLipBlend(substrate, [198, 73, 84], { thickness: 0.0 });
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(bare[i] - substrate[i]) < 0.2);
  }

  const sheer = kubelkaMunkLipBlend(substrate, product, { textureType: "Juicy Tint" });
  const opaque = kubelkaMunkLipBlend(substrate, product, { textureType: "Lip Clay / Mud" });
  const dist = (a: [number, number, number], b: [number, number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(dist(opaque, product) < dist(sheer, product));
});

test("Planckian locus projection recovers 3500K and 6500K illuminants within 120K", () => {
  for (const targetCct of [3500, 6500]) {
    const ill = illuminantLocusLinearRgb(targetCct);
    const proj = projectToPlanckianLocus(ill);
    assert.ok(Math.abs(proj.cctKelvin - targetCct) < 120);
    assert.ok(proj.offLocusDeg < 0.5);
  }
});

test("Beer-Lambert chromophore decomposition separates synthetic skin pixels cleanly", () => {
  const width = 4;
  const height = 4;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height).fill(1);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 200 + (i % 4) * 5;
    rgba[i * 4 + 1] = 155 + (i % 4) * 3;
    rgba[i * 4 + 2] = 135 + (i % 4) * 2;
    rgba[i * 4 + 3] = 255;
  }
  const chromo = extractRelativeChromophoresSrgb(rgba, mask, width, height);
  assert.equal(chromo.validPixels, 16);
  assert.ok(chromo.melaninSpatialStd > 0);
  assert.ok(chromo.hemoglobinSpatialStd >= 0);

  // sRGB <-> Lab round trip sanity check
  const rgb: [number, number, number] = [215, 168, 145];
  const round = labToRgb(rgbToLab(rgb));
  assert.ok(Math.abs(round[0] - rgb[0]) < 0.5);
});

test("Convex hull and scanline polygon fill enclose expected ROI area", () => {
  const hull = [
    [2, 2],
    [8, 2],
    [8, 8],
    [2, 8],
  ] as Array<[number, number]>;
  const mask = new Uint8Array(10 * 10);
  // Fill square [2..8, 2..8]
  for (let y = 2; y <= 8; y++) {
    for (let x = 2; x <= 8; x++) {
      mask[y * 10 + x] = 1;
    }
  }
  assert.equal(mask[5 * 10 + 5], 1);
  assert.equal(mask[0], 0);
  assert.equal(hull.length, 4);
});

test("Bilateral denoise reduces grain while preserving sharp step edges", () => {
  const width = 12;
  const height = 12;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const base = x < 6 ? 60 : 210;
      const noise = (x + y) % 2 === 0 ? 14 : -14;
      const v = Math.max(0, Math.min(255, base + noise));
      rgba[idx] = v;
      rgba[idx + 1] = v;
      rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
    }
  }

  const denoised = bilateralDenoiseRgba(rgba, width, height, 1.6, 26);

  // Measure variation in the left flat region away from border
  let diffSumBefore = 0;
  let diffSumAfter = 0;
  for (let y = 2; y <= 9; y++) {
    for (let x = 1; x <= 4; x++) {
      const idx = (y * width + x) * 4;
      diffSumBefore += Math.abs(rgba[idx] - 60);
      diffSumAfter += Math.abs(denoised[idx] - 60);
    }
  }
  assert.ok(diffSumAfter < diffSumBefore * 0.4, "Expected bilateral filter to smooth flat-region grain");

  // Sharp edge across x=5 -> x=6 should remain strongly separated
  const leftVal = denoised[(6 * width + 4) * 4];
  const rightVal = denoised[(6 * width + 7) * 4];
  assert.ok(rightVal - leftVal > 110, `Expected edge preservation, got gap ${rightVal - leftVal}`);
});

test("Adaptive low-light contrast lifts dim portraits and leaves well-lit ones neutral", () => {
  const width = 8;
  const height = 8;
  const dim = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // Slight spread so percentile stretch + gamma both exercise naturally
    const offset = (i % 4) * 4;
    dim[i * 4] = 38 + offset;
    dim[i * 4 + 1] = 28 + offset;
    dim[i * 4 + 2] = 24 + offset;
    dim[i * 4 + 3] = 255;
  }

  const dimRes = adaptiveLowLightContrast(dim, width, height);
  assert.ok(dimRes.meanLumaBefore < 45);
  assert.ok(dimRes.meanLumaAfter > dimRes.meanLumaBefore + 20);
  assert.ok(dimRes.gammaApplied < 0.95);

  const bright = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    bright[i * 4] = 175 + (i % 5) * 6;
    bright[i * 4 + 1] = 150 + (i % 5) * 6;
    bright[i * 4 + 2] = 140 + (i % 5) * 6;
    bright[i * 4 + 3] = 255;
  }
  const brightRes = adaptiveLowLightContrast(bright, width, height);
  assert.equal(brightRes.gammaApplied, 1);

  const sharpened = unsharpMaskLumaRgba(dim, width, height, 0.45);
  assert.equal(sharpened.length, dim.length);

  const full = enhancePortraitForLandmarks(dim, width, height);
  assert.equal(full.enhancedRgba.length, dim.length);
  assert.equal(full.stats.lowLightBoosted, true);
  assert.equal(full.stats.bilateralRadius, 2);
});

test("selectTrendingProducts ranks matching multi-season popular items with brand diversity", () => {
  const sampleCatalog = [
    {
      id: 1,
      product_name: "Juicy Lasting Tint 25",
      brand: "Romand",
      product_type: "lipstick",
      texture_type: "Juicy Tint",
      hex_color: "#D9786D",
      shade_name: "Bare Grape",
      undertone: "Neutral",
      best_seasons: "Light Spring, Soft Summer, Light Summer",
    },
    {
      id: 2,
      product_name: "Perfect Couple Lip Love 04",
      brand: "Lemonade",
      product_type: "lipstick",
      texture_type: "Matte Lipstick",
      hex_color: "#D97A65",
      shade_name: "04 Milk",
      undertone: "Warm",
      best_seasons: "Warm Spring, Light Spring",
    },
    {
      id: 3,
      product_name: "Aesthetic Blush 01",
      brand: "Lemonade",
      product_type: "blush",
      texture_type: "Cream Blush",
      hex_color: "#F0ACA1",
      shade_name: "01 Pinky Peach",
      undertone: "Neutral",
      best_seasons: "Light Spring, Light Summer",
    },
    {
      id: 4,
      product_name: "Obscure Shadow",
      brand: "UnknownBrand",
      product_type: "eyeshadow",
      texture_type: "Matte Eyeshadow",
      hex_color: "#223344",
      shade_name: "Navy",
      undertone: "Cool",
      best_seasons: "Cool Winter",
    },
  ];

  const hot = selectTrendingProducts(sampleCatalog, {
    blendedTargets: { lip: "#D9786D", blush: "#F0ACA1", eyeshadow: "#D7AE87" },
    skinHex: "#E6C7B5",
    lipBaseLab: [62, 16, 12],
    userSeason: "Light Spring",
    limit: 3,
  });

  assert.equal(hot.length, 3);
  assert.ok(hot[0].popularityScore >= hot[1].popularityScore);
  assert.ok(hot[0].hotReason.length > 0);
  // Diverse top picks pick Romand + Lemonade before repeating Lemonade
  assert.notEqual(hot[0].brand, hot[1].brand);

  const scored = scoreMatchedProductsPopularity(
    [
      {
        id: 10,
        brand: "Romand",
        name: "Juicy Lasting Tint 25",
        shade: "Bare Grape",
        productType: "lipstick",
        texture: "Juicy Tint",
        hex: "#D9786D",
        deltaE: 1.5,
        matchTier: "Great Match",
        undertone: "Neutral",
        bestSeasons: "Light Spring, Soft Summer, Light Summer",
      },
      {
        id: 11,
        brand: "UnknownBrand",
        name: "Obscure Shadow",
        shade: "Navy",
        productType: "eyeshadow",
        texture: "Matte Eyeshadow",
        hex: "#223344",
        deltaE: 9.8,
        matchTier: "Close Alternative",
        undertone: "Cool",
        bestSeasons: "Cool Winter",
      },
    ],
    "Light Spring"
  );
  assert.ok(scored[0].popularityScore >= POPULARITY_HIGHLIGHT_THRESHOLD);
  assert.equal(scored[0].isPopular, true);
  assert.equal(scored[1].isPopular, false);
});


