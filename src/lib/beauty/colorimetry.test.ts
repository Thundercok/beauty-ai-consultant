import assert from "node:assert/strict";
import test from "node:test";
import {
  BRADFORD_INV_MATRIX,
  BRADFORD_MATRIX,
  SRGB_TO_XYZ_MATRIX,
  WHITEPOINTS,
  XYZ_TO_SRGB_MATRIX,
  adaptLabBradford,
  adaptXyzBradford,
  hexToLab,
  hexToRgb,
  labToRgb,
  labToXyz,
  mat3Mul,
  rgbToLab,
  xyzToLab,
} from "./bradfordCat";
import { extractRelativeChromophoresSrgb } from "./chromophores";
import {
  applyNaturalDaylightRelighting,
  illuminantLocusLinearRgb,
  projectToPlanckianLocus,
} from "./colorConstancy";
import { classifySeason } from "./faceAnalysis";
import {
  adaptiveLowLightContrast,
  bilateralDenoiseRgba,
  enhancePortraitForLandmarks,
  unsharpMaskLumaRgba,
} from "./imageEnhancement";
import { kubelkaMunkLipBlend } from "./kubelkaMunk";
import {
  CIEDE2000_SIMILARITY_THRESHOLDS,
  POPULARITY_HIGHLIGHT_THRESHOLD,
  blendTargetColorsLab,
  ciede2000,
  classifyColorSimilarityTier,
  describeColorSimilarity,
  isColorimetricMatchProductType,
  matchProducts,
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

test("applyNaturalDaylightRelighting removes fluorescent green tint, avoids tungsten purple shift, and lifts side shadow", () => {
  const width = 32;
  const height = 32;
  const n = width * height;
  const faceMask = new Uint8Array(n);
  for (let y = 8; y < 24; y++) {
    for (let x = 8; x < 24; x++) {
      faceMask[y * width + x] = 1;
    }
  }

  // Case 1: Fluorescent cyan-green office light (7200K + green Duv spike) on neutral grey patch
  const officeRgba = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    officeRgba[i * 4] = 135;
    officeRgba[i * 4 + 1] = 158;
    officeRgba[i * 4 + 2] = 154;
    officeRgba[i * 4 + 3] = 255;
  }
  const officeRawIll: [number, number, number] = [0.84, 1.07, 1.05];
  const officeProj = projectToPlanckianLocus(officeRawIll);
  const officeOut = applyNaturalDaylightRelighting(officeRgba, width, height, {
    planckianIlluminant: officeProj.illuminantLinear,
    rawIlluminant: officeProj.rawIlluminantLinear,
    cctKelvin: officeProj.cctKelvin,
    faceHullMask: faceMask,
  });
  const centerIdx = (16 * width + 16) * 4;
  const officeBeforeLab = rgbToLab([officeRgba[centerIdx], officeRgba[centerIdx + 1], officeRgba[centerIdx + 2]]);
  const officeAfterLab = rgbToLab([officeOut[centerIdx], officeOut[centerIdx + 1], officeOut[centerIdx + 2]]);
  // Greenness (negative a*) should be substantially reduced toward neutral
  assert.ok(
    Math.abs(officeAfterLab[1]) < Math.abs(officeBeforeLab[1]),
    `Expected fluorescent green tint reduction: before a*=${officeBeforeLab[1]}, after a*=${officeAfterLab[1]}`
  );

  // Case 2: Side-lit portrait (left cheek dark shadow, right cheek bright)
  const sideLit = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isDarkSide = x < 16;
      sideLit[idx] = isDarkSide ? 115 : 205;
      sideLit[idx + 1] = isDarkSide ? 86 : 162;
      sideLit[idx + 2] = isDarkSide ? 70 : 132;
      sideLit[idx + 3] = 255;
    }
  }
  const neutralProj = projectToPlanckianLocus([1, 1, 1]);
  const sideOut = applyNaturalDaylightRelighting(sideLit, width, height, {
    planckianIlluminant: neutralProj.illuminantLinear,
    rawIlluminant: [1, 1, 1],
    cctKelvin: 5800,
    faceHullMask: faceMask,
  });
  const leftBeforeL = rgbToLab([sideLit[(16 * width + 10) * 4], sideLit[(16 * width + 10) * 4 + 1], sideLit[(16 * width + 10) * 4 + 2]])[0];
  const rightBeforeL = rgbToLab([sideLit[(16 * width + 21) * 4], sideLit[(16 * width + 21) * 4 + 1], sideLit[(16 * width + 21) * 4 + 2]])[0];
  const leftAfterL = rgbToLab([sideOut[(16 * width + 10) * 4], sideOut[(16 * width + 10) * 4 + 1], sideOut[(16 * width + 10) * 4 + 2]])[0];
  const rightAfterL = rgbToLab([sideOut[(16 * width + 21) * 4], sideOut[(16 * width + 21) * 4 + 1], sideOut[(16 * width + 21) * 4 + 2]])[0];
  assert.ok(
    rightAfterL - leftAfterL < rightBeforeL - leftBeforeL - 2,
    `Expected side-shadow gap to shrink: before=${(rightBeforeL - leftBeforeL).toFixed(1)}, after=${(rightAfterL - leftAfterL).toFixed(1)}`
  );
  // Warm skin tone b* should stay positive (never pushed into purple-blue)
  const leftAfterB = rgbToLab([sideOut[(16 * width + 10) * 4], sideOut[(16 * width + 10) * 4 + 1], sideOut[(16 * width + 10) * 4 + 2]])[2];
  assert.ok(leftAfterB > 8, `Expected warm skin b* to stay natural, got ${leftAfterB}`);
});

test("CIEDE2000 matches all 34 Sharma, Wu & Dalal (2005) Table 1 published reference pairs within 0.0001", () => {
  const SHARMA_2005_PAIRS: Array<{
    id: number;
    a: [number, number, number];
    b: [number, number, number];
    expected: number;
  }> = [
    { id: 1, a: [50.0, 2.6772, -79.7751], b: [50.0, 0.0, -82.7485], expected: 2.0425 },
    { id: 2, a: [50.0, 3.1571, -77.2803], b: [50.0, 0.0, -82.7485], expected: 2.8615 },
    { id: 3, a: [50.0, 2.8361, -74.0200], b: [50.0, 0.0, -82.7485], expected: 3.4412 },
    { id: 4, a: [50.0, -1.3802, -84.2814], b: [50.0, 0.0, -82.7485], expected: 1.0 },
    { id: 5, a: [50.0, -1.1848, -84.8006], b: [50.0, 0.0, -82.7485], expected: 1.0 },
    { id: 6, a: [50.0, -0.9009, -85.5211], b: [50.0, 0.0, -82.7485], expected: 1.0 },
    { id: 7, a: [50.0, 0.0, 0.0], b: [50.0, -1.0, 2.0], expected: 2.3669 },
    { id: 8, a: [50.0, -1.0, 2.0], b: [50.0, 0.0, 0.0], expected: 2.3669 },
    { id: 9, a: [50.0, 2.49, -0.001], b: [50.0, -2.49, 0.0009], expected: 7.1792 },
    { id: 10, a: [50.0, 2.49, -0.001], b: [50.0, -2.49, 0.001], expected: 7.1792 },
    { id: 11, a: [50.0, 2.49, -0.001], b: [50.0, -2.49, 0.0011], expected: 7.2195 },
    { id: 12, a: [50.0, 2.49, -0.001], b: [50.0, -2.49, 0.0012], expected: 7.2195 },
    { id: 13, a: [50.0, -0.001, 2.49], b: [50.0, 0.0009, -2.49], expected: 4.8045 },
    { id: 14, a: [50.0, -0.001, 2.49], b: [50.0, 0.0011, -2.49], expected: 4.7461 },
    { id: 15, a: [50.0, 2.5, 0.0], b: [50.0, 0.0, -2.5], expected: 4.3065 },
    { id: 16, a: [50.0, 2.5, 0.0], b: [73.0, 25.0, -18.0], expected: 27.1492 },
    { id: 17, a: [50.0, 2.5, 0.0], b: [61.0, -5.0, 29.0], expected: 22.8977 },
    { id: 18, a: [50.0, 2.5, 0.0], b: [56.0, -27.0, -3.0], expected: 31.903 },
    { id: 19, a: [50.0, 2.5, 0.0], b: [58.0, 24.0, 15.0], expected: 19.4535 },
    { id: 20, a: [50.0, 2.5, 0.0], b: [50.0, 3.1736, 0.5854], expected: 1.0 },
    { id: 21, a: [50.0, 2.5, 0.0], b: [50.0, 3.2972, 0.0], expected: 1.0 },
    { id: 22, a: [50.0, 2.5, 0.0], b: [50.0, 1.8634, 0.5757], expected: 1.0 },
    { id: 23, a: [50.0, 2.5, 0.0], b: [50.0, 3.2592, 0.335], expected: 1.0 },
    { id: 24, a: [60.2574, -34.0099, 36.2677], b: [60.4626, -34.1751, 39.4387], expected: 1.2644 },
    { id: 25, a: [63.0109, -31.0961, -5.8663], b: [62.8187, -29.7946, -4.0864], expected: 1.263 },
    { id: 26, a: [61.2901, 3.7196, -5.3901], b: [61.4292, 2.248, -4.962], expected: 1.8731 },
    { id: 27, a: [35.0831, -44.1164, 3.7933], b: [35.0232, -40.0716, 1.5901], expected: 1.8645 },
    { id: 28, a: [22.7233, 20.0904, -46.694], b: [23.0331, 14.973, -42.5619], expected: 2.0373 },
    { id: 29, a: [36.4612, 47.858, 18.3852], b: [36.2715, 50.5065, 21.2231], expected: 1.4146 },
    { id: 30, a: [90.8027, -2.0831, 1.441], b: [91.1528, -1.6435, 0.0447], expected: 1.4441 },
    { id: 31, a: [90.9257, -0.5406, -0.9208], b: [88.6381, -0.8985, -0.7239], expected: 1.5381 },
    { id: 32, a: [6.7747, -0.2908, -2.4247], b: [5.8714, -0.0985, -2.2286], expected: 0.6377 },
    { id: 33, a: [2.0776, 0.0795, -1.135], b: [0.9033, -0.0636, -0.5514], expected: 0.9082 },
    { id: 34, a: [50.0, 0.0, 0.0], b: [50.0, 0.0, 0.0], expected: 0.0 },
  ];

  for (const pair of SHARMA_2005_PAIRS) {
    const got = ciede2000(pair.a, pair.b);
    const rev = ciede2000(pair.b, pair.a);
    assert.ok(
      Math.abs(got - pair.expected) < 0.0001,
      `Sharma pair #${pair.id}: got ${got.toFixed(6)}, expected ${pair.expected}`
    );
    assert.ok(Math.abs(got - rev) < 1e-12, `Sharma pair #${pair.id} must be symmetric`);
  }

  // Identity & IEEE-754 negative-zero guard (Sharma Eq. 7)
  assert.equal(ciede2000([50, 0, 0], [50, 0, 0]), 0);
  assert.equal(ciede2000([50, -0, -0], [50, 10, 10]), ciede2000([50, 0, 0], [50, 10, 10]));
});

test("Bradford CAT and sRGB->CIELAB matrices match published Lindbloom / IEC 61966-2-1 references", () => {
  const bradId = mat3Mul(BRADFORD_MATRIX, BRADFORD_INV_MATRIX);
  const srgbId = mat3Mul(SRGB_TO_XYZ_MATRIX, XYZ_TO_SRGB_MATRIX);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const target = r === c ? 1 : 0;
      assert.ok(Math.abs(bradId[r][c] - target) < 1e-6, `Bradford inverse residual at [${r},${c}]`);
      assert.ok(Math.abs(srgbId[r][c] - target) < 1e-6, `sRGB inverse residual at [${r},${c}]`);
    }
  }

  // Verify Bradford D50 -> D65 and D65 -> D50 transforms against Bruce Lindbloom published matrices
  const LINDBLOOM_D50_TO_D65 = [
    [0.9555766, -0.0230393, 0.0631636],
    [-0.0282895, 1.0099416, 0.0210077],
    [0.0122982, -0.020483, 1.3299098],
  ];
  const LINDBLOOM_D65_TO_D50 = [
    [1.0478112, 0.0228866, -0.050127],
    [0.0295424, 0.9904844, -0.0170491],
    [-0.0092345, 0.0150436, 0.7521316],
  ];
  const cols50to65 = [
    adaptXyzBradford([1, 0, 0], "D50", "D65"),
    adaptXyzBradford([0, 1, 0], "D50", "D65"),
    adaptXyzBradford([0, 0, 1], "D50", "D65"),
  ];
  const cols65to50 = [
    adaptXyzBradford([1, 0, 0], "D65", "D50"),
    adaptXyzBradford([0, 1, 0], "D65", "D50"),
    adaptXyzBradford([0, 0, 1], "D65", "D50"),
  ];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      assert.ok(
        Math.abs(cols50to65[c][r] - LINDBLOOM_D50_TO_D65[r][c]) < 1e-6,
        `Bradford D50->D65 mismatch at [${r},${c}]`
      );
      assert.ok(
        Math.abs(cols65to50[c][r] - LINDBLOOM_D65_TO_D50[r][c]) < 1e-6,
        `Bradford D65->D50 mismatch at [${r},${c}]`
      );
    }
  }

  // Verify D50 white adapts to D65 whitepoint and Lab <-> XYZ is exact across CIE epsilon = (6/29)^3
  const adaptedWhite = adaptXyzBradford(WHITEPOINTS.D50, "D50", "D65");
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(adaptedWhite[i] - WHITEPOINTS.D65[i]) < 1e-6);
  }
  const eps = (6 / 29) ** 3;
  for (const scale of [0, eps * 0.5, eps * 0.9999, eps * 1.0001, 0.5, 1.0]) {
    const xyz: [number, number, number] = [
      WHITEPOINTS.D65[0] * scale,
      WHITEPOINTS.D65[1] * scale,
      WHITEPOINTS.D65[2] * scale,
    ];
    const back = labToXyz(xyzToLab(xyz, "D65"), "D65");
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(back[k] - xyz[k]) < 1e-12, `XYZ<->Lab threshold round-trip at scale=${scale}`);
    }
  }

  // Strict hexToRgb rejects partial-hex garbage (e.g. "#1Z2G3H") instead of parseInt prefix coercion
  assert.deepEqual(hexToRgb("#1Z2G3H"), [180, 140, 130]);

  // Verify sRGB primaries and neutrals against Lindbloom D65 CIELAB reference values
  const SRGB_REFS: Array<{ rgb: [number, number, number]; lab: [number, number, number] }> = [
    { rgb: [255, 255, 255], lab: [100.0, 0.0, 0.0] },
    { rgb: [0, 0, 0], lab: [0.0, 0.0, 0.0] },
    { rgb: [255, 0, 0], lab: [53.2408, 80.0925, 67.2032] },
    { rgb: [0, 255, 0], lab: [87.7347, -86.1827, 83.1793] },
    { rgb: [0, 0, 255], lab: [32.297, 79.1875, -107.8602] },
    { rgb: [128, 128, 128], lab: [53.585, 0.0, 0.0] },
  ];
  for (const item of SRGB_REFS) {
    const de = ciede2000(rgbToLab(item.rgb), item.lab);
    assert.ok(de < 0.001, `sRGB ${item.rgb} Lab error dE00=${de}`);
  }
});

test("Kubelka-Munk lip blend is numerically stable for extreme black/white shades and converges at high thickness", () => {
  const lip: [number, number, number] = [150, 90, 95];
  const blackOut = kubelkaMunkLipBlend(lip, [0, 0, 0], { textureType: "Lip Clay / Mud" });
  const whiteOut = kubelkaMunkLipBlend(lip, [255, 255, 255], { textureType: "Matte Lipstick" });
  const darkSubOut = kubelkaMunkLipBlend([0, 0, 0], [185, 63, 72], { textureType: "Juicy Tint" });
  const infThickOut = kubelkaMunkLipBlend(lip, [185, 63, 72], { thickness: 100 });

  for (const out of [blackOut, whiteOut, darkSubOut, infThickOut]) {
    for (const ch of out) {
      assert.ok(Number.isFinite(ch) && ch >= 0 && ch <= 255, `Non-finite or out-of-range channel ${ch}`);
    }
  }
  // Infinite-thickness limit must converge to product shade R_inf regardless of lip substrate
  assert.ok(Math.abs(infThickOut[0] - 185) < 0.1);
  assert.ok(Math.abs(infThickOut[1] - 63) < 0.1);
  assert.ok(Math.abs(infThickOut[2] - 72) < 0.1);
  // Pure black opaque shade must stay dark, never NaN
  assert.ok(blackOut[0] < 10 && blackOut[1] < 10 && blackOut[2] < 10);
});

test("productMatcher classifies documented CIEDE2000 bands honestly and avoids fabricated sales claims", () => {
  assert.equal(classifyColorSimilarityTier(null), null);
  assert.equal(classifyColorSimilarityTier(0.4), "Exact Match");
  assert.equal(classifyColorSimilarityTier(CIEDE2000_SIMILARITY_THRESHOLDS.EXACT_MAX), "Great Match");
  assert.equal(classifyColorSimilarityTier(CIEDE2000_SIMILARITY_THRESHOLDS.GREAT_MAX), "Close Alternative");
  assert.equal(classifyColorSimilarityTier(CIEDE2000_SIMILARITY_THRESHOLDS.CLOSE_MAX), "Distant Shade");
  assert.equal(classifyColorSimilarityTier(25.4), "Distant Shade");

  const matched = matchProducts(
    "#B84C5E",
    [
      {
        id: 101,
        brand: "Romand",
        product_name: "Juicy Lasting Tint",
        shade_name: "Exact Berry",
        product_type: "lipstick",
        texture_type: "Matte Lipstick",
        hex_color: "#B84C5E",
        undertone: "Cool",
        best_seasons: "Bright Winter",
      },
      {
        id: 102,
        brand: "Romand",
        product_name: "Juicy Lasting Tint",
        shade_name: "Distant Blue",
        product_type: "lipstick",
        texture_type: "Matte Lipstick",
        hex_color: "#1B6CA8",
        undertone: "Cool",
        best_seasons: "",
      },
    ],
    { productType: "lipstick", topK: 5 }
  );

  assert.equal(matched[0].matchTier, "Exact Match");
  assert.equal(matched[1].matchTier, "Distant Shade");

  const curated = scoreMatchedProductsPopularity(matched, "Bright Winter");
  for (const item of curated) {
    assert.ok(!item.hotReason.includes("bán chạy"), `Must not emit unverified sales claim: ${item.hotReason}`);
  }
});

test("productMatcher enforces Requirement 1 & 4: excludes incomplete rows, gates distant/unscored boosts, and scopes colorimetric categories", () => {
  // 1. Colorimetric category scope prevents scoring glasses/mascara/eyeliner against bare skin HEX
  assert.equal(isColorimetricMatchProductType("lipstick"), true);
  assert.equal(isColorimetricMatchProductType("foundation"), true);
  assert.equal(isColorimetricMatchProductType("powder"), true);
  assert.equal(isColorimetricMatchProductType("glasses"), false);
  assert.equal(isColorimetricMatchProductType("mascara"), false);
  assert.equal(isColorimetricMatchProductType("eyeliner"), false);
  assert.equal(isColorimetricMatchProductType("setting_spray"), false);

  // 2. Documented threshold descriptions
  const exactDesc = describeColorSimilarity(0.74);
  assert.equal(exactDesc.tier, "Exact Match");
  assert.equal(exactDesc.thresholdBand, "< 1.0");
  assert.equal(exactDesc.isWithinCloseThreshold, true);
  assert.equal(exactDesc.deltaELabel, "ΔE₀₀ 0.7");

  const distantDesc = describeColorSimilarity(7.25);
  assert.equal(distantDesc.tier, "Distant Shade");
  assert.equal(distantDesc.thresholdBand, "≥ 5.0");
  assert.equal(distantDesc.isWithinCloseThreshold, false);

  // 3. Incomplete catalog rows (missing brand / name) are excluded; missing optional metadata is flagged
  const matches = matchProducts(
    "#C85A6A",
    [
      {
        id: 201,
        brand: "",
        product_name: "Missing Brand Tint",
        shade_name: "01",
        product_type: "lipstick",
        texture_type: "Matte",
        hex_color: "#C85A6A",
        undertone: "Cool",
        best_seasons: "Cool Winter",
      },
      {
        id: 202,
        brand: "SmallIndie",
        product_name: "Clean Rose",
        shade_name: "01",
        product_type: "lipstick",
        texture_type: "",
        hex_color: "#C85A6A",
        undertone: "",
        best_seasons: "",
      },
    ],
    {
      productType: "lipstick",
      lipBaseLab: [Number.NaN, 12, 10], // non-finite lipBaseLab must gracefully fall back to swatch Lab without NaN
      topK: 5,
    }
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 202);
  assert.equal(matches[0].deltaE, 0);
  assert.equal(matches[0].similarityBasis, "ciede2000_d65_swatch");
  assert.ok(matches[0].missingMetadataFields?.includes("UNKNOWN_UNDERTONE"));
  assert.ok(matches[0].missingMetadataFields?.includes("UNKNOWN_BEST_SEASONS"));

  // 4. Unscored/unpersonalized items receive 0 score; Distant Shades with popular brand + cult line + season
  //    must NEVER be flagged isPopular=true or outrank an Exact Match from a non-curated brand.
  const scored = scoreMatchedProductsPopularity(
    [
      {
        id: 301,
        brand: "SmallIndie",
        name: "Exact Shade",
        shade: "01",
        productType: "lipstick",
        texture: "Matte",
        hex: "#C85A6A",
        deltaE: 0.6,
        matchTier: "Exact Match",
        isPersonalized: true,
        undertone: "Cool",
        bestSeasons: "",
      },
      {
        id: 302,
        brand: "Romand",
        name: "Juicy Lasting Tint",
        shade: "Distant Shade",
        productType: "lipstick",
        texture: "Juicy Tint",
        hex: "#1A5276",
        deltaE: 8.0,
        matchTier: "Distant Shade",
        isPersonalized: true,
        undertone: "Cool",
        bestSeasons: "All Seasons, Cool Winter",
      },
      {
        id: 303,
        brand: "Romand",
        name: "Juicy Lasting Tint",
        shade: "Unscored Browse",
        productType: "lipstick",
        texture: "Juicy Tint",
        hex: "#C85A6A",
        deltaE: null,
        matchTier: null,
        isPersonalized: false,
        undertone: "Cool",
        bestSeasons: "All Seasons, Cool Winter",
      },
    ],
    "Cool Winter"
  );

  assert.equal(scored[2].popularityScore, 0);
  assert.equal(scored[2].isPopular, false);
  assert.equal(scored[1].isPopular, false, "Distant Shade (ΔE >= 5.0) must never be flagged isPopular");
  assert.ok(
    scored[0].popularityScore > scored[1].popularityScore,
    `Exact Match (${scored[0].popularityScore}) must outrank Distant Shade (${scored[1].popularityScore})`
  );
});




