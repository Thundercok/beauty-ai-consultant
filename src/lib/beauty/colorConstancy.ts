import {
  BRADFORD_INV_MATRIX,
  BRADFORD_MATRIX,
  SRGB_TO_XYZ_MATRIX,
  WHITEPOINTS,
  XYZ_TO_SRGB_MATRIX,
  linearChannelToSrgb,
  mat3Mul,
  mat3Vec,
  srgbChannelToLinear,
} from "./bradfordCat";

export function planckianXy(cctKelvin: number): [number, number] {
  const t = cctKelvin;
  let x: number;
  if (t <= 4000) {
    x = -0.2661239e9 / t ** 3 - 0.2343589e6 / t ** 2 + 0.8776956e3 / t + 0.17991;
  } else {
    x = -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  }
  let y: number;
  if (t <= 2222) {
    y = -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683;
  } else if (t <= 4000) {
    y = -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  }
  return [x, y];
}

export function daylightXy(cctKelvin: number): [number, number] {
  const t = cctKelvin;
  const x =
    t <= 7000
      ? -4.607e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
      : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.23704;
  const y = -3.0 * x ** 2 + 2.87 * x - 0.275;
  return [x, y];
}

export function illuminantLocusXy(cctKelvin: number): [number, number] {
  if (cctKelvin <= 4000) return planckianXy(cctKelvin);
  if (cctKelvin >= 5000) return daylightXy(cctKelvin);
  const alpha = (cctKelvin - 4000) / 1000;
  const [xp, yp] = planckianXy(cctKelvin);
  const [xd, yd] = daylightXy(cctKelvin);
  return [(1 - alpha) * xp + alpha * xd, (1 - alpha) * yp + alpha * yd];
}

export function normalizeIlluminantLuma(rgbLin: [number, number, number]): [number, number, number] {
  const r = Math.max(rgbLin[0], 1e-6);
  const g = Math.max(rgbLin[1], 1e-6);
  const b = Math.max(rgbLin[2], 1e-6);
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const denom = y + 1e-12;
  return [r / denom, g / denom, b / denom];
}

export function illuminantLocusLinearRgb(cctKelvin: number): [number, number, number] {
  const [x, y] = illuminantLocusXy(cctKelvin);
  const xyz: [number, number, number] = [x / y, 1.0, (1 - x - y) / y];
  const rgb = mat3Vec(XYZ_TO_SRGB_MATRIX, xyz);
  return normalizeIlluminantLuma(rgb);
}

export function projectToPlanckianLocus(
  rawIlluminantLinear: [number, number, number],
  tMin = 2500,
  tMax = 9000,
  numSteps = 261
): {
  illuminantLinear: [number, number, number];
  cctKelvin: number;
  offLocusDeg: number;
  rawIlluminantLinear: [number, number, number];
} {
  const raw = normalizeIlluminantLuma(rawIlluminantLinear);
  const rawNorm = Math.hypot(raw[0], raw[1], raw[2]) + 1e-12;
  const rawUnit: [number, number, number] = [raw[0] / rawNorm, raw[1] / rawNorm, raw[2] / rawNorm];

  const miredMin = 1e6 / tMax;
  const miredMax = 1e6 / tMin;
  let bestDot = -Infinity;
  let bestCct = 6500;
  let bestIll: [number, number, number] = [1, 1, 1];

  for (let i = 0; i < numSteps; i++) {
    const mired = miredMin + ((miredMax - miredMin) * i) / (numSteps - 1);
    const cct = 1e6 / mired;
    const cand = illuminantLocusLinearRgb(cct);
    const candNorm = Math.hypot(cand[0], cand[1], cand[2]) + 1e-12;
    const dot =
      (cand[0] / candNorm) * rawUnit[0] +
      (cand[1] / candNorm) * rawUnit[1] +
      (cand[2] / candNorm) * rawUnit[2];
    if (dot > bestDot) {
      bestDot = dot;
      bestCct = cct;
      bestIll = cand;
    }
  }

  const clampedDot = Math.min(1, Math.max(-1, bestDot));
  const offLocusDeg = (Math.acos(clampedDot) * 180) / Math.PI;
  return {
    illuminantLinear: bestIll,
    cctKelvin: bestCct,
    offLocusDeg,
    rawIlluminantLinear: raw,
  };
}

/**
 * Estimate raw linear-RGB illuminant from non-skin pixels (outside excludeMask).
 * Supports Shades-of-Gray (p=6) and 1st-order Sobel Grey-Edge.
 */
export function estimateNonskinIlluminant(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  excludeMask: Uint8Array,
  method: "sog" | "grey_edge" = "grey_edge",
  p = 6.0,
  clipThreshold = 245,
  darkThreshold = 10
): [number, number, number] {
  const n = width * height;
  const valid = new Uint8Array(n);
  let validCount = 0;

  const neutralValid = new Uint8Array(n);
  let neutralCount = 0;

  for (let i = 0; i < n; i++) {
    if (excludeMask[i] !== 0) continue;
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const maxCh = Math.max(r, g, b);
    const minCh = Math.min(r, g, b);
    if (maxCh < clipThreshold && minCh > darkThreshold) {
      valid[i] = 1;
      validCount++;
      // Prefer near-neutral surfaces (walls, ceilings, clothing, paper) over bright
      // colored light filaments or foliage that would hijack high-p Minkowski norms.
      const sat = maxCh > 0 ? (maxCh - minCh) / maxCh : 0;
      if (sat <= 0.68 && maxCh >= 28 && maxCh <= 238) {
        neutralValid[i] = 1;
        neutralCount++;
      }
    }
  }

  if (validCount < 50) {
    return [1.0, 1.0, 1.0];
  }

  const activeValid = neutralCount >= 180 ? neutralValid : valid;
  const activeCount = neutralCount >= 180 ? neutralCount : validCount;

  // Build linear RGB arrays
  const linR = new Float32Array(n);
  const linG = new Float32Array(n);
  const linB = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    linR[i] = srgbChannelToLinear(rgba[idx]);
    linG[i] = srgbChannelToLinear(rgba[idx + 1]);
    linB[i] = srgbChannelToLinear(rgba[idx + 2]);
  }

  if (method === "sog") {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let i = 0; i < n; i++) {
      if (activeValid[i]) {
        sumR += linR[i] ** p;
        sumG += linG[i] ** p;
        sumB += linB[i] ** p;
      }
    }
    return normalizeIlluminantLuma([
      (sumR / activeCount) ** (1 / p),
      (sumG / activeCount) ** (1 / p),
      (sumB / activeCount) ** (1 / p),
    ]);
  }

  // First-order Grey-Edge: Gaussian 3x3 smoothing + Sobel gradient magnitude
  const blurChannel = (src: Float32Array): Float32Array => {
    const out = new Float32Array(n);
    for (let y = 0; y < height; y++) {
      const ym1 = Math.max(0, y - 1);
      const yp1 = Math.min(height - 1, y + 1);
      for (let x = 0; x < width; x++) {
        const xm1 = Math.max(0, x - 1);
        const xp1 = Math.min(width - 1, x + 1);
        const val =
          (src[ym1 * width + xm1] +
            2 * src[ym1 * width + x] +
            src[ym1 * width + xp1] +
            2 * src[y * width + xm1] +
            4 * src[y * width + x] +
            2 * src[y * width + xp1] +
            src[yp1 * width + xm1] +
            2 * src[yp1 * width + x] +
            src[yp1 * width + xp1]) /
          16;
        out[y * width + x] = val;
      }
    }
    return out;
  };

  const smoothR = blurChannel(linR);
  const smoothG = blurChannel(linG);
  const smoothB = blurChannel(linB);

  let sumEdgeR = 0;
  let sumEdgeG = 0;
  let sumEdgeB = 0;
  let edgeCount = 0;

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      // Check 2px eroded interior
      if (
        !activeValid[idx] ||
        !activeValid[idx - 1] ||
        !activeValid[idx + 1] ||
        !activeValid[idx - width] ||
        !activeValid[idx + width]
      ) {
        continue;
      }
      const sobelMag = (arr: Float32Array): number => {
        const tl = arr[(y - 1) * width + (x - 1)];
        const tc = arr[(y - 1) * width + x];
        const tr = arr[(y - 1) * width + (x + 1)];
        const ml = arr[y * width + (x - 1)];
        const mr = arr[y * width + (x + 1)];
        const bl = arr[(y + 1) * width + (x - 1)];
        const bc = arr[(y + 1) * width + x];
        const br = arr[(y + 1) * width + (x + 1)];
        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        return Math.hypot(gx, gy);
      };

      sumEdgeR += sobelMag(smoothR) ** p;
      sumEdgeG += sobelMag(smoothG) ** p;
      sumEdgeB += sobelMag(smoothB) ** p;
      edgeCount++;
    }
  }

  if (edgeCount < 50) {
    // Fallback to Shades-of-Gray
    return estimateNonskinIlluminant(rgba, width, height, excludeMask, "sog", p, clipThreshold, darkThreshold);
  }

  return normalizeIlluminantLuma([
    (sumEdgeR / edgeCount) ** (1 / p),
    (sumEdgeG / edgeCount) ** (1 / p),
    (sumEdgeB / edgeCount) ** (1 / p),
  ]);
}

function buildBradfordRgbMatrix(estIlluminantLinear: [number, number, number]): number[][] {
  const srcWhiteXyz = mat3Vec(SRGB_TO_XYZ_MATRIX, normalizeIlluminantLuma(estIlluminantLinear));
  const dstWhiteXyz = WHITEPOINTS.D65;

  const srcLms = mat3Vec(BRADFORD_MATRIX, srcWhiteXyz);
  const dstLms = mat3Vec(BRADFORD_MATRIX, dstWhiteXyz);

  const lmsScale: number[][] = [
    [dstLms[0] / Math.max(srcLms[0], 1e-8), 0, 0],
    [0, dstLms[1] / Math.max(srcLms[1], 1e-8), 0],
    [0, 0, dstLms[2] / Math.max(srcLms[2], 1e-8)],
  ];
  const catXyz = mat3Mul(BRADFORD_INV_MATRIX, mat3Mul(lmsScale, BRADFORD_MATRIX));
  return mat3Mul(XYZ_TO_SRGB_MATRIX, mat3Mul(catXyz, SRGB_TO_XYZ_MATRIX));
}

export function applyBradfordWhiteBalance(
  rgba: Uint8ClampedArray,
  estIlluminantLinear: [number, number, number]
): Uint8ClampedArray {
  const catRgb = buildBradfordRgbMatrix(estIlluminantLinear);

  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const lr = srgbChannelToLinear(rgba[i]);
    const lg = srgbChannelToLinear(rgba[i + 1]);
    const lb = srgbChannelToLinear(rgba[i + 2]);

    const nr = Math.min(1, Math.max(0, catRgb[0][0] * lr + catRgb[0][1] * lg + catRgb[0][2] * lb));
    const ng = Math.min(1, Math.max(0, catRgb[1][0] * lr + catRgb[1][1] * lg + catRgb[1][2] * lb));
    const nb = Math.min(1, Math.max(0, catRgb[2][0] * lr + catRgb[2][1] * lg + catRgb[2][2] * lb));

    out[i] = Math.round(linearChannelToSrgb(nr));
    out[i + 1] = Math.round(linearChannelToSrgb(ng));
    out[i + 2] = Math.round(linearChannelToSrgb(nb));
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

/**
 * Soft highlight knee so bright highlights roll off smoothly without hard channel-clipping hue shifts.
 */
function softClipLinear(v: number): number {
  if (v <= 0) return 0;
  if (v <= 0.84) return v;
  const excess = v - 0.84;
  return 0.84 + (0.16 * excess) / (excess + 0.16);
}

/**
 * Build an ultra-smooth coarse illumination field (16x16 grid blurred twice)
 * to model low-frequency directional shadows without halos or skin smoothing.
 */
function buildCoarseIlluminationField(
  luma: Float32Array,
  width: number,
  height: number,
  gridSize = 16
): Float32Array {
  const gw = gridSize;
  const gh = gridSize;
  const grid = new Float32Array(gw * gh);
  const counts = new Float32Array(gw * gh);

  for (let y = 0; y < height; y++) {
    const gy = Math.min(gh - 1, Math.floor((y / height) * gh));
    for (let x = 0; x < width; x++) {
      const gx = Math.min(gw - 1, Math.floor((x / width) * gw));
      const idx = gy * gw + gx;
      grid[idx] += luma[y * width + x];
      counts[idx] += 1;
    }
  }
  for (let i = 0; i < grid.length; i++) {
    grid[i] = counts[i] > 0 ? grid[i] / counts[i] : 0.25;
  }

  let cur = grid;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) {
      const ym1 = Math.max(0, y - 1);
      const yp1 = Math.min(gh - 1, y + 1);
      for (let x = 0; x < gw; x++) {
        const xm1 = Math.max(0, x - 1);
        const xp1 = Math.min(gw - 1, x + 1);
        next[y * gw + x] =
          (cur[ym1 * gw + xm1] +
            2 * cur[ym1 * gw + x] +
            cur[ym1 * gw + xp1] +
            2 * cur[y * gw + xm1] +
            4 * cur[y * gw + x] +
            2 * cur[y * gw + xp1] +
            cur[yp1 * gw + xm1] +
            2 * cur[yp1 * gw + x] +
            cur[yp1 * gw + xp1]) /
          16;
      }
    }
    cur = next;
  }
  return cur;
}

function sampleCoarseField(
  grid: Float32Array,
  gridSize: number,
  nx: number,
  ny: number
): number {
  const gx = Math.min(gridSize - 1.001, Math.max(0, nx * (gridSize - 1)));
  const gy = Math.min(gridSize - 1.001, Math.max(0, ny * (gridSize - 1)));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(gridSize - 1, x0 + 1);
  const y1 = Math.min(gridSize - 1, y0 + 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const v00 = grid[y0 * gridSize + x0];
  const v10 = grid[y0 * gridSize + x1];
  const v01 = grid[y1 * gridSize + x0];
  const v11 = grid[y1 * gridSize + x1];

  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

export interface NaturalDaylightOptions {
  /** Planckian-projected illuminant linear RGB */
  planckianIlluminant: [number, number, number];
  /** Raw 2D scene illuminant linear RGB (contains green-magenta fluorescent Duv tint) */
  rawIlluminant: [number, number, number];
  /** Estimated correlated color temperature in Kelvin */
  cctKelvin: number;
  /** Optional face hull mask for face-aware bounce-fill & directional shadow balancing */
  faceHullMask?: Uint8Array;
}

/**
 * Natural Studio Daylight Calibration ("Ánh sáng chuẩn D65"):
 * 1. Combines Planckian CCT + safely clamped green-magenta (Duv) tint removal
 *    so fluorescent green casts don't turn skin muddy brown.
 * 2. Uses CAT16-style incomplete chromatic adaptation so warm indoor light
 *    never overshoots healthy skin into corpse purple-blue.
 * 3. Applies face-aware soft studio bounce-fill and low-frequency directional
 *    shadow equalization in linear luminance space — preserving 100% of real
 *    skin texture, freckles, and undertone chromaticity without bleaching tan skin.
 */
export function applyNaturalDaylightRelighting(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: NaturalDaylightOptions
): Uint8ClampedArray {
  const planck = normalizeIlluminantLuma(options.planckianIlluminant);
  const raw = normalizeIlluminantLuma(options.rawIlluminant);
  const cct = options.cctKelvin;

  // 1) Safely bounded Duv (green-magenta) tint component relative to Planckian locus.
  // Fluorescent office lights carry a strong green spike (+G); clamping keeps colored
  // walls or foliage from ever tinting skin magenta.
  const tintWeight = cct >= 5600 ? 0.78 : 0.45;
  const combinedSource: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const rawRatio = raw[c] / Math.max(planck[c], 1e-4);
    const clampedRatio = Math.min(1.11, Math.max(0.90, rawRatio));
    const blendedRatio = 1 + (clampedRatio - 1) * tintWeight;
    combinedSource[c] = planck[c] * blendedRatio;
  }
  const normalizedCombined = normalizeIlluminantLuma(combinedSource);

  // 2) Incomplete chromatic adaptation (CIECAM02 / CAT16 style degree D):
  // Smartphones partially AWB indoor scenes; 100% hard Bradford overshoots warm
  // tungsten faces into cold purple. Using adaptive D removes the cast naturally.
  const adaptationD =
    cct < 5500 ? 0.78 : cct > 6400 ? 0.86 : 0.74;
  const adaptedIlluminant = normalizeIlluminantLuma([
    1 + (normalizedCombined[0] - 1) * adaptationD,
    1 + (normalizedCombined[1] - 1) * adaptationD,
    1 + (normalizedCombined[2] - 1) * adaptationD,
  ]);

  const catRgb = buildBradfordRgbMatrix(adaptedIlluminant);
  const n = width * height;

  const linR = new Float32Array(n);
  const linG = new Float32Array(n);
  const linB = new Float32Array(n);
  const luma = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const sr = srgbChannelToLinear(rgba[idx]);
    const sg = srgbChannelToLinear(rgba[idx + 1]);
    const sb = srgbChannelToLinear(rgba[idx + 2]);

    const nr = Math.max(0, catRgb[0][0] * sr + catRgb[0][1] * sg + catRgb[0][2] * sb);
    const ng = Math.max(0, catRgb[1][0] * sr + catRgb[1][1] * sg + catRgb[1][2] * sb);
    const nb = Math.max(0, catRgb[2][0] * sr + catRgb[2][1] * sg + catRgb[2][2] * sb);

    linR[i] = nr;
    linG[i] = ng;
    linB[i] = nb;
    luma[i] = 0.2126729 * nr + 0.7151522 * ng + 0.072175 * nb;
  }

  // 3) Measure face illumination statistics (exposure + left/right side-shadow asymmetry)
  const faceMask = options.faceHullMask;
  let faceMinX = width;
  let faceMaxX = 0;
  let faceMinY = height;
  let faceMaxY = 0;
  const faceLumas: number[] = [];

  if (faceMask && faceMask.length === n) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (faceMask[i]) {
          if (x < faceMinX) faceMinX = x;
          if (x > faceMaxX) faceMaxX = x;
          if (y < faceMinY) faceMinY = y;
          if (y > faceMaxY) faceMaxY = y;
          faceLumas.push(luma[i]);
        }
      }
    }
  }

  let faceMidLuma = 0.28;
  let faceP85Luma = 0.42;
  let sideShadowAsymmetry = 0;
  const faceCenterX = faceMaxX > faceMinX ? (faceMinX + faceMaxX) / 2 : width / 2;
  const faceCenterY = faceMaxY > faceMinY ? (faceMinY + faceMaxY) / 2 : height * 0.45;
  const faceRx = Math.max(width * 0.16, (faceMaxX - faceMinX) * 0.65);
  const faceRy = Math.max(height * 0.2, (faceMaxY - faceMinY) * 0.65);

  if (faceLumas.length >= 60) {
    faceLumas.sort((a, b) => a - b);
    faceMidLuma = faceLumas[Math.floor(faceLumas.length * 0.5)];
    faceP85Luma = faceLumas[Math.floor(faceLumas.length * 0.85)];

    let leftSum = 0;
    let leftN = 0;
    let rightSum = 0;
    let rightN = 0;
    for (let y = faceMinY; y <= faceMaxY; y++) {
      for (let x = faceMinX; x <= faceMaxX; x++) {
        const i = y * width + x;
        if (!faceMask![i]) continue;
        if (x < faceCenterX) {
          leftSum += luma[i];
          leftN++;
        } else {
          rightSum += luma[i];
          rightN++;
        }
      }
    }
    const leftMean = leftSum / Math.max(1, leftN);
    const rightMean = rightSum / Math.max(1, rightN);
    const hi = Math.max(leftMean, rightMean);
    const lo = Math.min(leftMean, rightMean);
    sideShadowAsymmetry = hi > 0.04 ? Math.min(1, Math.max(0, (hi - lo) / (hi + 1e-4))) : 0;
  }

  // 4) Coarse low-frequency illumination field for directional bounce-fill (zero halos)
  const gridSize = 16;
  const envGrid = buildCoarseIlluminationField(luma, width, height, gridSize);
  const faceEnvTarget = Math.min(0.54, Math.max(faceMidLuma * 1.08, faceP85Luma * 0.88));

  // Gentle studio fill-light exposure & shadow recovery for dim indoor lighting:
  // Protects naturally tan skin by checking highlight headroom (faceP85Luma) and
  // capping exposure gain strictly so deep/tan complexions are never bleached.
  const dimDeficit = Math.max(0, 0.32 - faceMidLuma);
  const globalExposureGain = 1 + Math.min(0.22, dimDeficit * 0.82);
  const shadowFillStrength = Math.min(0.42, 0.16 + dimDeficit * 1.05);
  const localBounceStrength = Math.min(0.72, 0.22 + sideShadowAsymmetry * 0.92);

  // Subtle fresh daylight crispness without washing out or oversaturating skin
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) {
    const ny = y / Math.max(1, height - 1);
    const dyFace = (y - faceCenterY) / faceRy;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const nx = x / Math.max(1, width - 1);
      const dxFace = (x - faceCenterX) / faceRx;

      const yLin = luma[i];
      if (yLin <= 1e-6) {
        const idx = i * 4;
        out[idx] = 0;
        out[idx + 1] = 0;
        out[idx + 2] = 0;
        out[idx + 3] = rgba[idx + 3];
        continue;
      }

      // Smooth radial falloff around the portrait subject so bounce-fill acts
      // like a soft daylight window/reflector illuminating the subject cleanly
      const dist2 = dxFace * dxFace + dyFace * dyFace;
      const subjectWeight = Math.exp(-0.55 * dist2);

      // Local directional shadow fill (lifts shadowed cheek / under-eye hollows)
      // and gently tames hot directional glare on the opposite cheek
      const localEnv = sampleCoarseField(envGrid, gridSize, nx, ny);
      let bounceGain = 1.0;
      if (localEnv < faceEnvTarget && localEnv > 0.025) {
        const rawBounce = Math.min(1.95, faceEnvTarget / localEnv);
        bounceGain = 1 + (rawBounce - 1) * localBounceStrength * (0.3 + 0.7 * subjectWeight);
      } else if (localEnv > faceEnvTarget * 1.08 && sideShadowAsymmetry > 0.18) {
        const rawTame = Math.max(0.84, (faceEnvTarget * 1.08) / localEnv);
        bounceGain = 1 - (1 - rawTame) * Math.min(0.55, sideShadowAsymmetry) * subjectWeight;
      }

      // Soft studio fill-light exposure + shadow-lift curve (anchored at highlights)
      const exposureGain = 1 + (globalExposureGain - 1) * (0.55 + 0.45 * subjectWeight);
      const baseY = yLin * exposureGain * bounceGain;
      // Smooth shadow lift that peaks in mid-shadows (~0.22) and fades smoothly toward highlights
      const shadowCurve =
        baseY + shadowFillStrength * baseY * Math.pow(Math.max(0, 1 - Math.min(1, baseY)), 2.2);

      // Gentle highlight rolloff so skin highlights stay luminous, never chalky/clipped
      const targetY = softClipLinear(shadowCurve);
      const gain = targetY / yLin;

      // Apply uniform luminance gain to preserve true skin hue & undertone chromaticity
      const r = softClipLinear(linR[i] * gain);
      const g = softClipLinear(linG[i] * gain);
      const b = softClipLinear(linB[i] * gain);

      // Subtle micro-contrast S-curve in sRGB to keep eyes, brows, and natural skin crisp
      const sr = linearChannelToSrgb(r) / 255;
      const sg = linearChannelToSrgb(g) / 255;
      const sb = linearChannelToSrgb(b) / 255;

      const sCurve = (v: number) => {
        const delta = v - 0.5;
        return Math.min(1, Math.max(0, v + 0.04 * delta * (1 - 4 * delta * delta)));
      };

      const idx = i * 4;
      out[idx] = Math.round(sCurve(sr) * 255);
      out[idx + 1] = Math.round(sCurve(sg) * 255);
      out[idx + 2] = Math.round(sCurve(sb) * 255);
      out[idx + 3] = rgba[idx + 3];
    }
  }

  return out;
}

