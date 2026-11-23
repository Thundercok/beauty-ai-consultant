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
    }
  }

  if (validCount < 50) {
    return [1.0, 1.0, 1.0];
  }

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
      if (valid[i]) {
        sumR += linR[i] ** p;
        sumG += linG[i] ** p;
        sumB += linB[i] ** p;
      }
    }
    return normalizeIlluminantLuma([
      (sumR / validCount) ** (1 / p),
      (sumG / validCount) ** (1 / p),
      (sumB / validCount) ** (1 / p),
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
        !valid[idx] ||
        !valid[idx - 1] ||
        !valid[idx + 1] ||
        !valid[idx - width] ||
        !valid[idx + width]
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

export function applyBradfordWhiteBalance(
  rgba: Uint8ClampedArray,
  estIlluminantLinear: [number, number, number]
): Uint8ClampedArray {
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
  const catRgb = mat3Mul(XYZ_TO_SRGB_MATRIX, mat3Mul(catXyz, SRGB_TO_XYZ_MATRIX));

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
