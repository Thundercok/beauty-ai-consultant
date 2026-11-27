import { linearChannelToSrgb, rgbToHex, rgbToLab, srgbChannelToLinear } from "./bradfordCat";
import { extractRelativeChromophoresSrgb } from "./chromophores";
import {
  applyBradfordWhiteBalance,
  applyNaturalDaylightRelighting,
  estimateNonskinIlluminant,
  illuminantLocusLinearRgb,
  projectToPlanckianLocus,
} from "./colorConstancy";
import { buildSkinMetrics, classifyFaceShapeFromRatios, classifySeason, resolveGlowupProfile } from "./faceAnalysis";
import {
  FEATURE_POLYGONS,
  INNER_LIP_INDICES,
  OUTER_LIP_INDICES,
  SKIN_LANDMARKS,
  computeConvexHull,
  fillPolygonMask,
} from "./neuralLandmarks";
import { ciede2000, blendTargetColorsLab } from "./productMatcher";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  OccasionType,
  RelightingExperimentReport,
  SkinTextureType,
  WhiteBalanceDiagnostics,
  WhiteBalanceMethod,
} from "./types";

function rgbToHsvOpenCv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 255;
  return [h / 2, s, max];
}

function trimmedMean(values: number[], proportion = 0.1): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * proportion);
  const core = trim > 0 && sorted.length > 2 * trim ? sorted.slice(trim, sorted.length - trim) : sorted;
  let sum = 0;
  for (let i = 0; i < core.length; i++) sum += core[i];
  return sum / core.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function detectInitialFaceBox(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): FaceLandmarksBox {
  const gridCols = 16;
  const gridRows = 16;
  const counts = new Float32Array(gridCols * gridRows);

  for (let y = Math.floor(height * 0.05); y < Math.floor(height * 0.85); y++) {
    const gy = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
    for (let x = Math.floor(width * 0.08); x < Math.floor(width * 0.92); x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      const [h, s, v] = rgbToHsvOpenCv(r, g, b);
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isHsvSkin = (h <= 25 || h >= 170) && s >= 18 && s <= 145 && v >= 65 && r - g <= 68;
      const isYccSkin = cr >= 133 && cr <= 170 && cb >= 80 && cb <= 128;

      if (isHsvSkin && isYccSkin) {
        const gx = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
        const upperWeight = y < height * 0.62 ? 1.25 : 0.7;
        counts[gy * gridCols + gx] += upperWeight;
      }
    }
  }

  let bestScore = -1;
  let peakGx = 8;
  let peakGy = 5;
  for (let gy = 1; gy < gridRows - 1; gy++) {
    for (let gx = 1; gx < gridCols - 1; gx++) {
      let localScore = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          localScore += counts[(gy + dy) * gridCols + (gx + dx)];
        }
      }
      if (localScore > bestScore) {
        bestScore = localScore;
        peakGx = gx;
        peakGy = gy;
      }
    }
  }

  if (bestScore < 20) {
    return {
      centerX: 0.5,
      centerY: 0.38,
      faceWidth: 0.34,
      faceHeight: 0.44,
      jawRatio: 0.8,
      foreheadRatio: 1.0,
      lipCenterY: 0.49,
      lipWidth: 0.13,
    };
  }

  const peakX = (peakGx + 0.5) / gridCols;
  const peakY = (peakGy + 0.5) / gridRows;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let localCount = 0;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    if (Math.abs(ny - peakY) > 0.24) continue;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      if (Math.abs(nx - peakX) > 0.2) continue;
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      const [h, s, v] = rgbToHsvOpenCv(r, g, b);
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      if (
        (h <= 25 || h >= 170) &&
        s >= 18 &&
        s <= 145 &&
        v >= 65 &&
        r - g <= 68 &&
        cr >= 133 &&
        cr <= 170 &&
        cb >= 80 &&
        cb <= 128
      ) {
        sumX += nx;
        sumY += ny;
        sumXX += nx * nx;
        sumYY += ny * ny;
        localCount++;
      }
    }
  }

  if (localCount < 40) {
    return {
      centerX: Number(peakX.toFixed(3)),
      centerY: Number(peakY.toFixed(3)),
      faceWidth: 0.28,
      faceHeight: 0.36,
      jawRatio: 0.8,
      foreheadRatio: 1.0,
      lipCenterY: Number(Math.min(0.85, peakY + 0.09).toFixed(3)),
      lipWidth: 0.11,
    };
  }

  const meanX = sumX / localCount;
  const meanY = sumY / localCount;
  const stdX = Math.sqrt(Math.max(0.001, sumXX / localCount - meanX * meanX));
  const stdY = Math.sqrt(Math.max(0.0015, sumYY / localCount - meanY * meanY));

  const faceWidth = Math.min(0.56, Math.max(0.18, stdX * 3.1));
  const faceHeight = Math.min(0.66, Math.max(0.24, stdY * 3.2));
  const lipCenterY = Math.min(0.85, meanY + faceHeight * 0.23);
  const lipWidth = Math.min(0.24, Math.max(0.07, faceWidth * 0.38));

  return {
    centerX: Number(meanX.toFixed(3)),
    centerY: Number(meanY.toFixed(3)),
    faceWidth: Number(faceWidth.toFixed(3)),
    faceHeight: Number(faceHeight.toFixed(3)),
    jawRatio: 0.8,
    foreheadRatio: 1.0,
    lipCenterY: Number(lipCenterY.toFixed(3)),
    lipWidth: Number(lipWidth.toFixed(3)),
  };
}

function drawCircleMask(mask: Uint8Array, width: number, height: number, cx: number, cy: number, radius: number) {
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(width - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(height - 1, Math.ceil(cy + radius));
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
        mask[y * width + x] = 1;
      }
    }
  }
}

function buildNeuralMasks(
  width: number,
  height: number,
  landmarks: Array<[number, number, number]>
) {
  const n = width * height;
  const faceHullMask = new Uint8Array(n);
  const featureExclusionMask = new Uint8Array(n);
  const innerLipMask = new Uint8Array(n);
  const outerLipMask = new Uint8Array(n);

  const hullPts: Array<[number, number]> = SKIN_LANDMARKS.map((idx) => [
    Math.min(width - 1, Math.max(0, landmarks[idx][0])),
    Math.min(height - 1, Math.max(0, landmarks[idx][1])),
  ]);
  const convexHull = computeConvexHull(hullPts);
  fillPolygonMask(faceHullMask, width, height, convexHull, 1);

  for (const polyIndices of FEATURE_POLYGONS) {
    const polyPts: Array<[number, number]> = polyIndices.map((idx) => [
      Math.min(width - 1, Math.max(0, landmarks[idx][0])),
      Math.min(height - 1, Math.max(0, landmarks[idx][1])),
    ]);
    const polyHull = computeConvexHull(polyPts);
    fillPolygonMask(featureExclusionMask, width, height, polyHull, 1);
  }

  const radius = Math.max(2, Math.floor(Math.min(width, height) * 0.015));
  for (const idx of INNER_LIP_INDICES) {
    drawCircleMask(innerLipMask, width, height, landmarks[idx][0], landmarks[idx][1], radius);
  }
  for (const idx of OUTER_LIP_INDICES) {
    drawCircleMask(outerLipMask, width, height, landmarks[idx][0], landmarks[idx][1], radius);
  }

  const dist = (a: number, b: number) =>
    Math.hypot(landmarks[a][0] - landmarks[b][0], landmarks[a][1] - landmarks[b][1]);
  const r1 = dist(10, 152) / (dist(234, 454) + 1e-6);
  const r2 = dist(172, 397) / (dist(234, 454) + 1e-6);
  const r3 = dist(54, 284) / (dist(172, 397) + 1e-6);

  return { faceHullMask, featureExclusionMask, innerLipMask, outerLipMask, ratios: { r1, r2, r3 } };
}

function buildFallbackBoxMasks(width: number, height: number, box: FaceLandmarksBox) {
  const n = width * height;
  const faceHullMask = new Uint8Array(n);
  const featureExclusionMask = new Uint8Array(n);
  const innerLipMask = new Uint8Array(n);
  const outerLipMask = new Uint8Array(n);

  const cx = box.centerX * width;
  const cy = box.centerY * height;
  const rx = (box.faceWidth * width) / 2;
  const ry = (box.faceHeight * height) / 2;

  const eyeY = cy - ry * 0.16;
  const leftEyeX = cx - rx * 0.38;
  const rightEyeX = cx + rx * 0.38;
  const eyeRx = Math.max(4, rx * 0.22);
  const eyeRy = Math.max(3, ry * 0.11);

  const lipCy = box.lipCenterY * height;
  const lipRx = (box.lipWidth * width) / 2;
  const lipRy = Math.max(4, ry * 0.11);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const relY = (y - cy) / Math.max(1, ry);
      if (Math.abs(relY) <= 1.0) {
        const taper =
          relY < 0
            ? 0.92 + (box.foreheadRatio - 1) * 0.2
            : 0.85 + (box.jawRatio - 0.8) * 0.5;
        const localRx = Math.max(4, rx * Math.max(0.55, taper));
        const dx = (x - cx) / localRx;
        if (dx * dx + relY * relY <= 1.0) {
          faceHullMask[idx] = 1;
        }
      }

      const leDist = ((x - leftEyeX) / eyeRx) ** 2 + ((y - eyeY) / eyeRy) ** 2;
      const reDist = ((x - rightEyeX) / eyeRx) ** 2 + ((y - eyeY) / eyeRy) ** 2;
      if (leDist <= 1.0 || reDist <= 1.0) {
        featureExclusionMask[idx] = 1;
      }

      const lipDist =
        ((x - cx) / Math.max(2, lipRx)) ** 2 + ((y - lipCy) / Math.max(2, lipRy)) ** 2;
      if (lipDist <= 1.45) {
        featureExclusionMask[idx] = 1;
      }
      if (lipDist <= 0.65) {
        innerLipMask[idx] = 1;
      } else if (lipDist <= 1.25) {
        outerLipMask[idx] = 1;
      }
    }
  }

  const r1 = (box.faceHeight * height) / Math.max(1, box.faceWidth * width);
  return {
    faceHullMask,
    featureExclusionMask,
    innerLipMask,
    outerLipMask,
    ratios: { r1, r2: box.jawRatio, r3: box.foreheadRatio },
  };
}

function sampleSkinFromImage(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  faceHullMask: Uint8Array,
  featureExclusionMask: Uint8Array
) {
  const n = width * height;
  const skinMask = new Uint8Array(n);
  const lVals: number[] = [];
  const aVals: number[] = [];
  const bVals: number[] = [];
  let melIndexSum = 0;
  let hemIndexSum = 0;
  let skinCount = 0;

  for (let i = 0; i < n; i++) {
    if (!faceHullMask[i] || featureExclusionMask[i]) continue;
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const [h, s, v] = rgbToHsvOpenCv(r, g, b);
    if ((h <= 25 || h >= 170) && s >= 20 && s <= 220 && v >= 55) {
      skinMask[i] = 1;
      const [lStar, aStar, bStar] = rgbToLab([r, g, b]);
      lVals.push(lStar);
      aVals.push(aStar);
      bVals.push(bStar);
      melIndexSum += 100 * Math.log10(255 / (r + 1));
      hemIndexSum += 100 * Math.log10((r + 1) / (g + 1));
      skinCount++;
    }
  }

  if (skinCount < 60) {
    for (let i = 0; i < n; i++) {
      if (!faceHullMask[i] || featureExclusionMask[i]) continue;
      const idx = i * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];
      skinMask[i] = 1;
      const [lStar, aStar, bStar] = rgbToLab([r, g, b]);
      lVals.push(lStar);
      aVals.push(aStar);
      bVals.push(bStar);
      melIndexSum += 100 * Math.log10(255 / (r + 1));
      hemIndexSum += 100 * Math.log10((r + 1) / (g + 1));
      skinCount++;
    }
  }

  // Reject specular glare (L*>88), deep shadow (L*<20), and localized acne redness spikes
  // (a* > median(a) + 9) when measuring true baseline skin undertone, while keeping skinMask intact.
  let cleanL = lVals;
  let cleanA = aVals;
  let cleanB = bVals;
  if (lVals.length >= 120) {
    const medA = median(aVals);
    const fL: number[] = [];
    const fA: number[] = [];
    const fB: number[] = [];
    for (let i = 0; i < lVals.length; i++) {
      if (lVals[i] >= 20 && lVals[i] <= 88 && aVals[i] <= medA + 9.0) {
        fL.push(lVals[i]);
        fA.push(aVals[i]);
        fB.push(bVals[i]);
      }
    }
    if (fL.length >= 80) {
      cleanL = fL;
      cleanA = fA;
      cleanB = fB;
    }
  }

  return {
    skinMask,
    skinL: trimmedMean(cleanL, 0.12),
    skinA: trimmedMean(cleanA, 0.12),
    skinB: trimmedMean(cleanB, 0.12),
    melIndex: melIndexSum / Math.max(1, skinCount),
    hemIndex: hemIndexSum / Math.max(1, skinCount),
    skinCount,
  };
}

export function runPortraitAnalysisPipeline(
  originalRgba: Uint8ClampedArray,
  width: number,
  height: number,
  box: FaceLandmarksBox,
  options: {
    wbMethod: WhiteBalanceMethod;
    occasion: OccasionType;
    texture: SkinTextureType;
    neuralLandmarks?: Array<[number, number, number]> | null;
  }
): ConsultationReport {
  const hasNeural = Boolean(options.neuralLandmarks && options.neuralLandmarks.length >= 468);
  const masks = hasNeural
    ? buildNeuralMasks(width, height, options.neuralLandmarks!)
    : buildFallbackBoxMasks(width, height, box);

  const { faceHullMask, featureExclusionMask, innerLipMask, outerLipMask, ratios } = masks;

  let wbDiagnostics: WhiteBalanceDiagnostics;
  let correctedRgba: Uint8ClampedArray;

  if (options.wbMethod === "none") {
    correctedRgba = new Uint8ClampedArray(originalRgba);
    wbDiagnostics = {
      method: "none",
      estimatedCctK: null,
      offLocusDeg: null,
      illuminantLinear: [1, 1, 1],
    };
  } else {
    const rawMethod = options.wbMethod === "planckian_grey_edge" ? "grey_edge" : "sog";
    const rawIll = estimateNonskinIlluminant(originalRgba, width, height, faceHullMask, rawMethod, 3.5);
    const proj = projectToPlanckianLocus(rawIll);
    correctedRgba = applyNaturalDaylightRelighting(originalRgba, width, height, {
      planckianIlluminant: proj.illuminantLinear,
      rawIlluminant: proj.rawIlluminantLinear,
      cctKelvin: proj.cctKelvin,
      faceHullMask,
    });
    wbDiagnostics = {
      method: options.wbMethod,
      estimatedCctK: Number(proj.cctKelvin.toFixed(1)),
      offLocusDeg: Number(proj.offLocusDeg.toFixed(2)),
      illuminantLinear: proj.illuminantLinear,
    };
  }

  const skinSample = sampleSkinFromImage(
    correctedRgba,
    width,
    height,
    faceHullMask,
    featureExclusionMask
  );

  const skinMetrics = buildSkinMetrics(
    skinSample.skinL,
    skinSample.skinA,
    skinSample.skinB,
    skinSample.melIndex,
    skinSample.hemIndex,
    skinSample.skinCount,
    hasNeural
      ? "mediapipe_468_face_hull_hsv_trimmed_mean"
      : "fallback_oval_hsv_trimmed_mean"
  );

  const n = width * height;
  const innerL: number[] = [];
  const innerA: number[] = [];
  const innerB: number[] = [];
  const outerL: number[] = [];
  let lipRSum = 0;
  let lipGSum = 0;
  let lipBSum = 0;
  let lipCount = 0;

  for (let i = 0; i < n; i++) {
    if (innerLipMask[i]) {
      const idx = i * 4;
      const r = correctedRgba[idx];
      const g = correctedRgba[idx + 1];
      const b = correctedRgba[idx + 2];
      const [l, a, bVal] = rgbToLab([r, g, b]);
      innerL.push(l);
      innerA.push(a);
      innerB.push(bVal);
      lipRSum += r;
      lipGSum += g;
      lipBSum += b;
      lipCount++;
    } else if (outerLipMask[i]) {
      const idx = i * 4;
      const [l] = rgbToLab([correctedRgba[idx], correctedRgba[idx + 1], correctedRgba[idx + 2]]);
      outerL.push(l);
    }
  }

  // Exclude dark mouth-slit shadow pixels (L* < 18) when enough genuine lip tissue pixels exist
  let validLipL = innerL;
  let validLipA = innerA;
  let validLipB = innerB;
  if (innerL.length >= 20) {
    const fL: number[] = [];
    const fA: number[] = [];
    const fB: number[] = [];
    for (let i = 0; i < innerL.length; i++) {
      if (innerL[i] >= 18) {
        fL.push(innerL[i]);
        fA.push(innerA[i]);
        fB.push(innerB[i]);
      }
    }
    if (fL.length >= 12) {
      validLipL = fL;
      validLipA = fA;
      validLipB = fB;
    }
  }

  const lipBaseLab: [number, number, number] = [
    validLipL.length ? median(validLipL) : 52,
    validLipA.length ? median(validLipA) : 18,
    validLipB.length ? median(validLipB) : 10,
  ];
  const validOuterL = outerL.filter((l) => l >= 18);
  const borderL = validOuterL.length
    ? median(validOuterL)
    : outerL.length
      ? median(outerL)
      : lipBaseLab[0] - 2;
  const lipDarkness = Math.max(0, lipBaseLab[0] - borderL);
  const hasDarkLipBorder = borderL < 43 || lipDarkness > 5.2;
  const lipBaseHex =
    lipCount > 0
      ? rgbToHex([lipRSum / lipCount, lipGSum / lipCount, lipBSum / lipCount])
      : "#B47A78";

  const lipMetrics = {
    lipBaseLab,
    lipBaseHex,
    lipBorderL: Number(borderL.toFixed(2)),
    lipDarknessIndex: Number(lipDarkness.toFixed(2)),
    hasDarkLipBorder,
    coverageRequirement: hasDarkLipBorder
      ? "Viền môi hơi sậm — nên che khuyết điểm nhẹ hoặc ưu tiên son bùn/son kem lì"
      : "Viền môi sáng đều — hợp cả son tint bóng lẫn son lì",
    recommendedTexture: hasDarkLipBorder ? "Lip Clay / Mud" : "Juicy Tint",
  };

  const chromophores = extractRelativeChromophoresSrgb(
    originalRgba,
    skinSample.skinMask,
    width,
    height
  );

  const faceShape = classifyFaceShapeFromRatios(ratios.r1, ratios.r2, ratios.r3);
  const season = classifySeason(skinSample.skinL, skinSample.skinA, skinSample.skinB);
  const blendedTargets = blendTargetColorsLab(season.probabilities);
  const advice = resolveGlowupProfile(
    faceShape.primary,
    season.season,
    options.occasion,
    options.texture
  );

  return {
    whiteBalance: wbDiagnostics,
    faceShape,
    skinMetrics,
    lipMetrics,
    chromophores,
    season,
    blendedTargets,
    advice,
    landmarkSource: hasNeural ? "mediapipe_468" : "fallback_box",
    landmarkCount: options.neuralLandmarks?.length ?? 0,
    neuralLandmarks: options.neuralLandmarks ?? null,
    skinMask: skinSample.skinMask,
    faceHullMask,
    correctedRgba,
    originalRgba,
    width,
    height,
  };
}

/**
 * Relight a D65-calibrated portrait in linear sRGB under a simulated Planckian/Daylight
 * illuminant (exp01-exp05 benchmark), then compare Unbalanced vs Legacy Skin-Gray-World vs
 * Planckian Grey-Edge + Bradford CAT.
 */
export function runRelightingExperiment(
  report: ConsultationReport,
  targetCctK: number
): RelightingExperimentReport {
  const { width, height, correctedRgba, faceHullMask, skinMask } = report;
  const simIll = illuminantLocusLinearRgb(targetCctK);
  const d65Ill = illuminantLocusLinearRgb(6504);

  // Diagonal linear-RGB gain relative to D65
  const gainR = simIll[0] / Math.max(d65Ill[0], 1e-6);
  const gainG = simIll[1] / Math.max(d65Ill[1], 1e-6);
  const gainB = simIll[2] / Math.max(d65Ill[2], 1e-6);

  const relitRgba = new Uint8ClampedArray(correctedRgba.length);
  for (let i = 0; i < correctedRgba.length; i += 4) {
    const lr = srgbChannelToLinear(correctedRgba[i]) * gainR;
    const lg = srgbChannelToLinear(correctedRgba[i + 1]) * gainG;
    const lb = srgbChannelToLinear(correctedRgba[i + 2]) * gainB;
    relitRgba[i] = Math.round(linearChannelToSrgb(Math.min(1, lr)));
    relitRgba[i + 1] = Math.round(linearChannelToSrgb(Math.min(1, lg)));
    relitRgba[i + 2] = Math.round(linearChannelToSrgb(Math.min(1, lb)));
    relitRgba[i + 3] = 255;
  }

  // Baseline skin Lab on D65 reference
  const baselineLab: [number, number, number] = [
    report.skinMetrics.L_star,
    report.skinMetrics.a_star,
    report.skinMetrics.b_star,
  ];
  const baselineSeason = report.season.season;

  const measureSkinLabOnMask = (rgba: Uint8ClampedArray): [number, number, number] => {
    const ls: number[] = [];
    const as: number[] = [];
    const bs: number[] = [];
    for (let i = 0; i < skinMask.length; i++) {
      if (!skinMask[i]) continue;
      const idx = i * 4;
      const [l, a, b] = rgbToLab([rgba[idx], rgba[idx + 1], rgba[idx + 2]]);
      ls.push(l);
      as.push(a);
      bs.push(b);
    }
    return [trimmedMean(ls, 0.1), trimmedMean(as, 0.1), trimmedMean(bs, 0.1)];
  };

  // Method 1: Unbalanced Raw under lamp
  const rawLab = measureSkinLabOnMask(relitRgba);
  const rawSeason = classifySeason(rawLab[0], rawLab[1], rawLab[2]);

  // Method 2: Legacy Skin-ROI Gray-World WB (exp01 failure mode: erases true skin undertone)
  let rMean = 0;
  let gMean = 0;
  let bMean = 0;
  let count = 0;
  for (let i = 0; i < skinMask.length; i++) {
    if (!skinMask[i]) continue;
    const idx = i * 4;
    rMean += relitRgba[idx];
    gMean += relitRgba[idx + 1];
    bMean += relitRgba[idx + 2];
    count++;
  }
  rMean /= Math.max(1, count);
  gMean /= Math.max(1, count);
  bMean /= Math.max(1, count);
  const gwRgba = new Uint8ClampedArray(relitRgba.length);
  for (let i = 0; i < relitRgba.length; i += 4) {
    gwRgba[i] = Math.min(255, Math.max(0, Math.round((relitRgba[i] * gMean) / (rMean + 1e-6))));
    gwRgba[i + 1] = relitRgba[i + 1];
    gwRgba[i + 2] = Math.min(255, Math.max(0, Math.round((relitRgba[i + 2] * gMean) / (bMean + 1e-6))));
    gwRgba[i + 3] = 255;
  }
  const gwLab = measureSkinLabOnMask(gwRgba);
  const gwSeason = classifySeason(gwLab[0], gwLab[1], gwLab[2]);

  // Method 3: Beauty AI Planckian Grey-Edge + Bradford CAT
  const rawEst = estimateNonskinIlluminant(relitRgba, width, height, faceHullMask, "grey_edge", 6.0);
  const proj = projectToPlanckianLocus(rawEst);
  const recoveredRgba = applyBradfordWhiteBalance(relitRgba, proj.illuminantLinear);
  const recoveredLab = measureSkinLabOnMask(recoveredRgba);
  const recoveredSeason = classifySeason(recoveredLab[0], recoveredLab[1], recoveredLab[2]);

  // Chromophore invariance check (exp03)
  const relitChromo = extractRelativeChromophoresSrgb(relitRgba, skinMask, width, height);

  return {
    simulatedCctK: targetCctK,
    relitRgba,
    recoveredRgba,
    baselineSeason,
    baselineLab,
    baselineMelaninStd: report.chromophores.melaninSpatialStd,
    baselineHemoglobinStd: report.chromophores.hemoglobinSpatialStd,
    relitMelaninStd: relitChromo.melaninSpatialStd,
    relitHemoglobinStd: relitChromo.hemoglobinSpatialStd,
    methods: [
      {
        method: "unbalanced",
        label: "Ảnh thô (Không cân bằng sáng)",
        skinLab: rawLab,
        deltaEFromDaylight: Number(ciede2000(baselineLab, rawLab).toFixed(2)),
        predictedSeason: rawSeason.season,
        undertone: rawSeason.undertone,
        seasonMatched: rawSeason.season === baselineSeason,
      },
      {
        method: "skin_gw",
        label: "Cân bằng kiểu cũ (Gray-World trên da)",
        skinLab: gwLab,
        deltaEFromDaylight: Number(ciede2000(baselineLab, gwLab).toFixed(2)),
        predictedSeason: gwSeason.season,
        undertone: gwSeason.undertone,
        seasonMatched: gwSeason.season === baselineSeason,
      },
      {
        method: "planckian_bradford",
        label: "Beauty AI (Planckian + Bradford D65)",
        skinLab: recoveredLab,
        deltaEFromDaylight: Number(ciede2000(baselineLab, recoveredLab).toFixed(2)),
        predictedSeason: recoveredSeason.season,
        undertone: recoveredSeason.undertone,
        seasonMatched: recoveredSeason.season === baselineSeason,
      },
    ],
  };
}
