import { rgbToHex, rgbToLab } from "./bradfordCat";
import { extractRelativeChromophoresSrgb } from "./chromophores";
import {
  applyBradfordWhiteBalance,
  estimateNonskinIlluminant,
  projectToPlanckianLocus,
} from "./colorConstancy";
import { buildSkinMetrics, classifyFaceShapeFromRatios, classifySeason, resolveGlowupProfile } from "./faceAnalysis";
import { blendTargetColorsLab } from "./productMatcher";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  OccasionType,
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

/**
 * Automatically detect the dominant face region from skin-chromaticity pixels
 * (HSV + YCbCr consensus) so any portrait photo initializes sensible face/lip bounds.
 */
export function detectInitialFaceBox(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): FaceLandmarksBox {
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let count = 0;

  // Focus skin clustering inside central 82% horizontally and upper-middle 85% vertically
  for (let y = Math.floor(height * 0.08); y < Math.floor(height * 0.9); y++) {
    for (let x = Math.floor(width * 0.09); x < Math.floor(width * 0.91); x++) {
      const idx = (y * width + x) * 4;
      const r = rgba[idx];
      const g = rgba[idx + 1];
      const b = rgba[idx + 2];

      const [h, s, v] = rgbToHsvOpenCv(r, g, b);
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isHsvSkin = (h <= 25 || h >= 170) && s >= 20 && s <= 220 && v >= 55;
      const isYccSkin = cr >= 133 && cr <= 175 && cb >= 77 && cb <= 129;

      if (isHsvSkin && isYccSkin) {
        const nx = x / width;
        const ny = y / height;
        sumX += nx;
        sumY += ny;
        sumXX += nx * nx;
        sumYY += ny * ny;
        count++;
      }
    }
  }

  if (count < 80) {
    return {
      centerX: 0.5,
      centerY: 0.44,
      faceWidth: 0.42,
      faceHeight: 0.54,
      jawRatio: 0.8,
      foreheadRatio: 1.0,
      lipCenterY: 0.59,
      lipWidth: 0.16,
    };
  }

  const meanX = sumX / count;
  const meanY = sumY / count;
  const stdX = Math.sqrt(Math.max(0.002, sumXX / count - meanX * meanX));
  const stdY = Math.sqrt(Math.max(0.004, sumYY / count - meanY * meanY));

  const faceWidth = Math.min(0.68, Math.max(0.26, stdX * 3.1));
  const faceHeight = Math.min(0.76, Math.max(0.34, stdY * 3.2));
  const lipCenterY = Math.min(0.85, meanY + faceHeight * 0.25);
  const lipWidth = Math.min(0.28, Math.max(0.09, faceWidth * 0.38));

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

function buildFaceOvalAndExclusionMasks(
  width: number,
  height: number,
  box: FaceLandmarksBox
): {
  faceHullMask: Uint8Array;
  featureExclusionMask: Uint8Array;
  innerLipMask: Uint8Array;
  outerLipMask: Uint8Array;
} {
  const n = width * height;
  const faceHullMask = new Uint8Array(n);
  const featureExclusionMask = new Uint8Array(n);
  const innerLipMask = new Uint8Array(n);
  const outerLipMask = new Uint8Array(n);

  const cx = box.centerX * width;
  const cy = box.centerY * height;
  const rx = (box.faceWidth * width) / 2;
  const ry = (box.faceHeight * height) / 2;

  // Eye regions (left & right) for exclusion
  const eyeY = cy - ry * 0.16;
  const leftEyeX = cx - rx * 0.38;
  const rightEyeX = cx + rx * 0.38;
  const eyeRx = Math.max(4, rx * 0.22);
  const eyeRy = Math.max(3, ry * 0.11);

  // Lip region
  const lipCy = box.lipCenterY * height;
  const lipRx = (box.lipWidth * width) / 2;
  const lipRy = Math.max(4, ry * 0.11);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Tapered face oval (forehead vs jaw width)
      const relY = (y - cy) / Math.max(1, ry);
      if (Math.abs(relY) <= 1.0) {
        const taper = relY < 0 ? 0.92 + (box.foreheadRatio - 1) * 0.2 : 0.85 + (box.jawRatio - 0.8) * 0.5;
        const localRx = Math.max(4, rx * Math.max(0.55, taper));
        const dx = (x - cx) / localRx;
        if (dx * dx + relY * relY <= 1.0) {
          faceHullMask[idx] = 1;
        }
      }

      // Eyes exclusion
      const leDist = ((x - leftEyeX) / eyeRx) ** 2 + ((y - eyeY) / eyeRy) ** 2;
      const reDist = ((x - rightEyeX) / eyeRx) ** 2 + ((y - eyeY) / eyeRy) ** 2;
      if (leDist <= 1.0 || reDist <= 1.0) {
        featureExclusionMask[idx] = 1;
      }

      // Lip inner + outer border ring
      const lipDist = ((x - cx) / Math.max(2, lipRx)) ** 2 + ((y - lipCy) / Math.max(2, lipRy)) ** 2;
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

  return { faceHullMask, featureExclusionMask, innerLipMask, outerLipMask };
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
  }
): ConsultationReport {
  const { faceHullMask, featureExclusionMask, innerLipMask, outerLipMask } =
    buildFaceOvalAndExclusionMasks(width, height, box);

  // Step 1: White balance via Planckian-constrained non-skin illuminant + Bradford CAT
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
    const rawIll = estimateNonskinIlluminant(originalRgba, width, height, faceHullMask, rawMethod, 6.0);
    const proj = projectToPlanckianLocus(rawIll);
    correctedRgba = applyBradfordWhiteBalance(originalRgba, proj.illuminantLinear);
    wbDiagnostics = {
      method: options.wbMethod,
      estimatedCctK: Number(proj.cctKelvin.toFixed(1)),
      offLocusDeg: Number(proj.offLocusDeg.toFixed(2)),
      illuminantLinear: proj.illuminantLinear,
    };
  }

  // Step 2: Skin ROI extraction (face hull ∩ HSV skin - eyes/lips) on corrected image
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
    const r = correctedRgba[idx];
    const g = correctedRgba[idx + 1];
    const b = correctedRgba[idx + 2];
    const [h, s, v] = rgbToHsvOpenCv(r, g, b);
    if (((h <= 25 || h >= 170) && s >= 20 && s <= 220 && v >= 55)) {
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

  // Fallback if lighting/filter left too few HSV skin pixels inside hull
  if (skinCount < 60) {
    for (let i = 0; i < n; i++) {
      if (!faceHullMask[i] || featureExclusionMask[i]) continue;
      const idx = i * 4;
      const r = correctedRgba[idx];
      const g = correctedRgba[idx + 1];
      const b = correctedRgba[idx + 2];
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

  const skinL = trimmedMean(lVals, 0.1);
  const skinA = trimmedMean(aVals, 0.1);
  const skinB = trimmedMean(bVals, 0.1);
  const skinMetrics = buildSkinMetrics(
    skinL,
    skinA,
    skinB,
    melIndexSum / Math.max(1, skinCount),
    hemIndexSum / Math.max(1, skinCount),
    skinCount,
    "face_hull_hsv_feature_exclusion_trimmed_mean"
  );

  // Step 3: Lip base & border darkness metrics
  const innerL: number[] = [];
  const innerA: number[] = [];
  const innerB: number[] = [];
  const outerL: number[] = [];

  for (let i = 0; i < n; i++) {
    if (innerLipMask[i]) {
      const idx = i * 4;
      const [l, a, b] = rgbToLab([correctedRgba[idx], correctedRgba[idx + 1], correctedRgba[idx + 2]]);
      innerL.push(l);
      innerA.push(a);
      innerB.push(b);
    } else if (outerLipMask[i]) {
      const idx = i * 4;
      const [l] = rgbToLab([correctedRgba[idx], correctedRgba[idx + 1], correctedRgba[idx + 2]]);
      outerL.push(l);
    }
  }

  const lipBaseLab: [number, number, number] = [
    innerL.length ? median(innerL) : 52,
    innerA.length ? median(innerA) : 18,
    innerB.length ? median(innerB) : 10,
  ];
  const borderL = outerL.length ? median(outerL) : lipBaseLab[0] - 2;
  const lipDarkness = Math.max(0, lipBaseLab[0] - borderL);
  const hasDarkLipBorder = borderL < 43 || lipDarkness > 5;

  // Approximate inner lip RGB for hex preview
  let lipRSum = 0;
  let lipGSum = 0;
  let lipBSum = 0;
  let lipCount = 0;
  for (let i = 0; i < n; i++) {
    if (innerLipMask[i]) {
      const idx = i * 4;
      lipRSum += correctedRgba[idx];
      lipGSum += correctedRgba[idx + 1];
      lipBSum += correctedRgba[idx + 2];
      lipCount++;
    }
  }
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
      ? "Cần che khuyết điểm / son lip clay"
      : "Viền môi sáng (có thể dùng tint bóng)",
    recommendedTexture: hasDarkLipBorder ? "Lip Clay / Mud" : "Juicy Tint",
  };

  // Step 4: Beer-Lambert chromophore decomposition on original unclipped sRGB
  const chromophores = extractRelativeChromophoresSrgb(originalRgba, skinMask, width, height);

  // Step 5: Face shape, soft Gaussian 12-season, blended Lab targets, and advice
  const r1 = (box.faceHeight * height) / Math.max(1, box.faceWidth * width);
  const faceShape = classifyFaceShapeFromRatios(r1, box.jawRatio, box.foreheadRatio);
  const season = classifySeason(skinL, skinA, skinB);
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
    skinMask,
    correctedRgba,
    originalRgba,
    width,
    height,
  };
}
