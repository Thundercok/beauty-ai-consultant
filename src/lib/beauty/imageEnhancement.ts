export interface EnhancementStats {
  meanLumaBefore: number;
  meanLumaAfter: number;
  gammaApplied: number;
  lowLightBoosted: boolean;
  bilateralRadius: number;
  sharpenAmount: number;
}

export interface EnhancedImageResult {
  enhancedRgba: Uint8ClampedArray;
  stats: EnhancementStats;
}

/**
 * Edge-preserving 5x5 bilateral filter to suppress ISO grain / sensor noise
 * while keeping eye, nostril, and lip edges sharp for landmark detection.
 */
export function bilateralDenoiseRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  sigmaSpace = 1.6,
  sigmaColor = 26
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const radius = 2;
  const invTwoSigmaSpace2 = 1 / (2 * sigmaSpace * sigmaSpace);
  const invTwoSigmaColor2 = 1 / (2 * sigmaColor * sigmaColor);

  // Precompute spatial weights for 5x5 kernel
  const spatialWeights = new Float32Array((radius * 2 + 1) ** 2);
  let k = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      spatialWeights[k++] = Math.exp(-(dx * dx + dy * dy) * invTwoSigmaSpace2);
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIdx = (y * width + x) * 4;
      const cr = rgba[centerIdx];
      const cg = rgba[centerIdx + 1];
      const cb = rgba[centerIdx + 2];

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumW = 0;
      let wIdx = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const nIdx = (ny * width + nx) * 4;
          const nr = rgba[nIdx];
          const ng = rgba[nIdx + 1];
          const nb = rgba[nIdx + 2];

          const dr = nr - cr;
          const dg = ng - cg;
          const db = nb - cb;
          const colorDist2 = (dr * dr + dg * dg + db * db) / 3;
          const weight = spatialWeights[wIdx++] * Math.exp(-colorDist2 * invTwoSigmaColor2);

          sumR += nr * weight;
          sumG += ng * weight;
          sumB += nb * weight;
          sumW += weight;
        }
      }

      out[centerIdx] = Math.round(sumR / sumW);
      out[centerIdx + 1] = Math.round(sumG / sumW);
      out[centerIdx + 2] = Math.round(sumB / sumW);
      out[centerIdx + 3] = rgba[centerIdx + 3];
    }
  }
  return out;
}

/**
 * Adaptive low-light gamma lift + soft percentile contrast normalization on luminance.
 * Only activates gamma lift when mean luma indicates dim/backlit lighting.
 */
export function adaptiveLowLightContrast(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): { rgba: Uint8ClampedArray; meanLumaBefore: number; meanLumaAfter: number; gammaApplied: number } {
  const n = width * height;
  const hist = new Uint32Array(256);
  let lumaSum = 0;

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const luma = Math.min(
      255,
      Math.max(0, Math.round(0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]))
    );
    hist[luma]++;
    lumaSum += luma;
  }

  const meanLumaBefore = lumaSum / Math.max(1, n);
  // Target healthy landmark-detection midtone ~128 when image is dim (<108)
  const gamma =
    meanLumaBefore < 108
      ? Math.max(0.55, Math.min(0.95, Math.log(0.5) / Math.log(Math.max(meanLumaBefore / 255, 0.08))))
      : 1.0;

  // Compute 1st and 99th luminance percentiles for gentle contrast stretch
  const lowTarget = Math.floor(n * 0.01);
  const highTarget = Math.floor(n * 0.99);
  let cum = 0;
  let pLow = 0;
  let pHigh = 255;
  for (let v = 0; v < 256; v++) {
    cum += hist[v];
    if (cum >= lowTarget && pLow === 0) pLow = v;
    if (cum >= highTarget) {
      pHigh = v;
      break;
    }
  }
  const span = Math.max(40, pHigh - pLow);

  const out = new Uint8ClampedArray(rgba.length);
  let lumaAfterSum = 0;

  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    const yOrig = 0.299 * r + 0.587 * g + 0.114 * b;
    if (yOrig < 1e-3) {
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = rgba[idx + 3];
      continue;
    }

    const stretched = Math.min(1, Math.max(0, (yOrig - pLow) / span));
    const yNew = 255 * stretched ** gamma;
    // Blend 70% enhanced luminance + 30% original to prevent over-stretching well-lit faces
    const blendedY = 0.7 * yNew + 0.3 * yOrig;
    const ratio = Math.min(2.4, blendedY / yOrig);

    const nr = Math.min(255, Math.max(0, Math.round(r * ratio)));
    const ng = Math.min(255, Math.max(0, Math.round(g * ratio)));
    const nb = Math.min(255, Math.max(0, Math.round(b * ratio)));

    out[idx] = nr;
    out[idx + 1] = ng;
    out[idx + 2] = nb;
    out[idx + 3] = rgba[idx + 3];
    lumaAfterSum += 0.299 * nr + 0.587 * ng + 0.114 * nb;
  }

  return {
    rgba: out,
    meanLumaBefore: Number(meanLumaBefore.toFixed(1)),
    meanLumaAfter: Number((lumaAfterSum / Math.max(1, n)).toFixed(1)),
    gammaApplied: Number(gamma.toFixed(2)),
  };
}

/**
 * Unsharp mask applied purely to luminance to sharpen eyelid and lip edges
 * without introducing chromatic color ringing.
 */
export function unsharpMaskLumaRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  amount = 0.45
): Uint8ClampedArray {
  const n = width * height;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    luma[i] = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2];
  }

  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) {
    const ym1 = Math.max(0, y - 1);
    const yp1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(width - 1, x + 1);
      const center = y * width + x;

      const blurred =
        (luma[ym1 * width + xm1] +
          2 * luma[ym1 * width + x] +
          luma[ym1 * width + xp1] +
          2 * luma[y * width + xm1] +
          4 * luma[center] +
          2 * luma[y * width + xp1] +
          luma[yp1 * width + xm1] +
          2 * luma[yp1 * width + x] +
          luma[yp1 * width + xp1]) /
        16;

      const detail = luma[center] - blurred;
      const delta = Math.max(-28, Math.min(28, amount * detail));
      const idx = center * 4;

      out[idx] = Math.min(255, Math.max(0, Math.round(rgba[idx] + delta)));
      out[idx + 1] = Math.min(255, Math.max(0, Math.round(rgba[idx + 1] + delta)));
      out[idx + 2] = Math.min(255, Math.max(0, Math.round(rgba[idx + 2] + delta)));
      out[idx + 3] = rgba[idx + 3];
    }
  }
  return out;
}

/**
 * Full 3-stage image enhancement layer prior to MediaPipe FaceLandmarker:
 * 1) Edge-preserving 5x5 bilateral denoise
 * 2) Adaptive low-light gamma + contrast normalization
 * 3) Luma unsharp mask for eye/lip contour crispness
 */
export function enhancePortraitForLandmarks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): EnhancedImageResult {
  const denoised = bilateralDenoiseRgba(rgba, width, height, 1.6, 26);
  const contrastAdjusted = adaptiveLowLightContrast(denoised, width, height);
  const sharpenAmount = 0.45;
  const sharpened = unsharpMaskLumaRgba(contrastAdjusted.rgba, width, height, sharpenAmount);

  return {
    enhancedRgba: sharpened,
    stats: {
      meanLumaBefore: contrastAdjusted.meanLumaBefore,
      meanLumaAfter: contrastAdjusted.meanLumaAfter,
      gammaApplied: contrastAdjusted.gammaApplied,
      lowLightBoosted: contrastAdjusted.gammaApplied < 0.99,
      bilateralRadius: 2,
      sharpenAmount,
    },
  };
}
