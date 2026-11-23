import { srgbChannelToLinear } from "./bradfordCat";
import type { ChromophoreSummary } from "./types";

function normalizeBasis(v: [number, number, number]): [number, number, number] {
  const norm = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / norm, v[1] / norm, v[2] / norm];
}

export const MELANIN_BASIS = normalizeBasis([0.488, 0.751, 1.32]);
export const HEMOGLOBIN_BASIS = normalizeBasis([0.1, 0.82, 0.563]);
export const SHADING_BASIS: [number, number, number] = [
  1 / Math.sqrt(3),
  1 / Math.sqrt(3),
  1 / Math.sqrt(3),
];

function invert3x3(m: number[][]): number[][] {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  const invDet = 1 / det;
  return [
    [(e * i - f * h) * invDet, (c * h - b * i) * invDet, (b * f - c * e) * invDet],
    [(f * g - d * i) * invDet, (a * i - c * g) * invDet, (c * d - a * f) * invDet],
    [(d * h - e * g) * invDet, (b * g - a * h) * invDet, (a * e - b * d) * invDet],
  ];
}

// B = [MELANIN_BASIS, HEMOGLOBIN_BASIS, SHADING_BASIS] as columns
const BASIS_MATRIX = [
  [MELANIN_BASIS[0], HEMOGLOBIN_BASIS[0], SHADING_BASIS[0]],
  [MELANIN_BASIS[1], HEMOGLOBIN_BASIS[1], SHADING_BASIS[1]],
  [MELANIN_BASIS[2], HEMOGLOBIN_BASIS[2], SHADING_BASIS[2]],
];
const CHROMOPHORE_INV = invert3x3(BASIS_MATRIX);

export function extractRelativeChromophoresSrgb(
  rgba: Uint8ClampedArray,
  skinMask: Uint8Array,
  width: number,
  height: number,
  clipThreshold = 245,
  darkThreshold = 12
): ChromophoreSummary {
  const n = width * height;
  const validMask = new Uint8Array(n);
  const melaninDelta = new Float32Array(n);
  const hemoglobinDelta = new Float32Array(n);
  const shadingDelta = new Float32Array(n);

  let validPixels = 0;
  for (let i = 0; i < n; i++) {
    if (skinMask[i] === 0) continue;
    const idx = i * 4;
    const r = rgba[idx];
    const g = rgba[idx + 1];
    const b = rgba[idx + 2];
    if (Math.max(r, g, b) < clipThreshold && Math.min(r, g, b) > darkThreshold) {
      validMask[i] = 1;
      validPixels++;
    }
  }

  if (validPixels < 10) {
    return {
      validPixels,
      melaninSpatialStd: 0,
      hemoglobinSpatialStd: 0,
      melaninDelta,
      hemoglobinDelta,
      shadingDelta,
      validMask,
      width,
      height,
    };
  }

  const odR = new Float32Array(n);
  const odG = new Float32Array(n);
  const odB = new Float32Array(n);
  let meanOdR = 0;
  let meanOdG = 0;
  let meanOdB = 0;

  for (let i = 0; i < n; i++) {
    if (!validMask[i]) continue;
    const idx = i * 4;
    const lr = Math.max(1e-6, srgbChannelToLinear(rgba[idx]));
    const lg = Math.max(1e-6, srgbChannelToLinear(rgba[idx + 1]));
    const lb = Math.max(1e-6, srgbChannelToLinear(rgba[idx + 2]));
    const dr = -Math.log(lr);
    const dg = -Math.log(lg);
    const db = -Math.log(lb);
    odR[i] = dr;
    odG[i] = dg;
    odB[i] = db;
    meanOdR += dr;
    meanOdG += dg;
    meanOdB += db;
  }
  meanOdR /= validPixels;
  meanOdG /= validPixels;
  meanOdB /= validPixels;

  let sumSqMel = 0;
  let sumSqHem = 0;

  for (let i = 0; i < n; i++) {
    if (!validMask[i]) continue;
    const cr = odR[i] - meanOdR;
    const cg = odG[i] - meanOdG;
    const cb = odB[i] - meanOdB;

    const dm = CHROMOPHORE_INV[0][0] * cr + CHROMOPHORE_INV[0][1] * cg + CHROMOPHORE_INV[0][2] * cb;
    const dh = CHROMOPHORE_INV[1][0] * cr + CHROMOPHORE_INV[1][1] * cg + CHROMOPHORE_INV[1][2] * cb;
    const ds = CHROMOPHORE_INV[2][0] * cr + CHROMOPHORE_INV[2][1] * cg + CHROMOPHORE_INV[2][2] * cb;

    melaninDelta[i] = dm;
    hemoglobinDelta[i] = dh;
    shadingDelta[i] = ds;

    sumSqMel += dm * dm;
    sumSqHem += dh * dh;
  }

  return {
    validPixels,
    melaninSpatialStd: Number(Math.sqrt(sumSqMel / validPixels).toFixed(4)),
    hemoglobinSpatialStd: Number(Math.sqrt(sumSqHem / validPixels).toFixed(4)),
    melaninDelta,
    hemoglobinDelta,
    shadingDelta,
    validMask,
    width,
    height,
  };
}

/**
 * Render a cool-to-warm diagnostic heatmap overlay onto an RGBA buffer
 * for either melanin_delta or hemoglobin_delta.
 */
export function renderChromophoreHeatmapRgba(
  baseRgba: Uint8ClampedArray,
  chromo: ChromophoreSummary,
  channel: "melanin" | "hemoglobin"
): Uint8ClampedArray {
  const values = channel === "melanin" ? chromo.melaninDelta : chromo.hemoglobinDelta;
  const std = Math.max(
    0.04,
    channel === "melanin" ? chromo.melaninSpatialStd * 2.2 : chromo.hemoglobinSpatialStd * 2.2
  );
  const out = new Uint8ClampedArray(baseRgba.length);

  for (let i = 0; i < chromo.validMask.length; i++) {
    const idx = i * 4;
    if (!chromo.validMask[i]) {
      // Dim non-skin context slightly for contrast
      const lum = 0.299 * baseRgba[idx] + 0.587 * baseRgba[idx + 1] + 0.114 * baseRgba[idx + 2];
      const muted = Math.round(lum * 0.55);
      out[idx] = muted;
      out[idx + 1] = muted;
      out[idx + 2] = muted;
      out[idx + 3] = 255;
      continue;
    }

    // Normalized [-1, 1] centered at 0
    const norm = Math.max(-1, Math.min(1, values[i] / std));
    let hr: number;
    let hg: number;
    let hb: number;
    if (channel === "melanin") {
      // Amber / Sepia scale for relative melanin concentration
      const t = (norm + 1) * 0.5; // [0, 1]
      hr = Math.round(45 + t * 205);
      hg = Math.round(80 + (1 - Math.abs(t - 0.5) * 2) * 110 + t * 40);
      hb = Math.round(145 - t * 115);
    } else {
      // Cyan-to-Crimson scale for relative hemoglobin / erythema
      const t = (norm + 1) * 0.5;
      hr = Math.round(40 + t * 210);
      hg = Math.round(150 - Math.abs(t - 0.35) * 140);
      hb = Math.round(200 - t * 145);
    }
    out[idx] = Math.round(baseRgba[idx] * 0.25 + hr * 0.75);
    out[idx + 1] = Math.round(baseRgba[idx + 1] * 0.25 + hg * 0.75);
    out[idx + 2] = Math.round(baseRgba[idx + 2] * 0.25 + hb * 0.75);
    out[idx + 3] = 255;
  }
  return out;
}
