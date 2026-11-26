import { hexToRgb } from "./bradfordCat";
import { kubelkaMunkLipBlend } from "./kubelkaMunk";
import { fillPolygonMask } from "./neuralLandmarks";
import type { FaceLandmarksBox } from "./types";

/**
 * Canonical MediaPipe 468/478 outer lip contour (ordered perimeter).
 */
export const OUTER_LIP_CONTOUR: readonly number[] = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];

/**
 * Canonical MediaPipe 468/478 inner mouth opening contour (excluded so teeth/cavity stay clean).
 */
export const INNER_LIP_CONTOUR: readonly number[] = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
];

const GLOSSY_TEXTURES = new Set(["Juicy Tint", "Mirror Gloss", "Dewy Balm", "Water Stain"]);

export interface CachedLipMask {
  mask: Float32Array;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerXNorm: number;
  centerYNorm: number;
}

export interface VirtualMakeupOptions {
  lipHex?: string;
  lipTexture?: string;
  lipThickness?: number;
  lipEnabled?: boolean;
  blushHex?: string;
  blushIntensity?: number;
  blushEnabled?: boolean;
  precomputedLipMask?: CachedLipMask;
}

/**
 * Converts a CIEDE2000 distance into a consumer-friendly 52–99% match score.
 */
export function deltaEToMatchPercent(deltaE: number): number {
  if (!Number.isFinite(deltaE) || deltaE <= 0) return 99;
  const raw = Math.round(99 - deltaE * 2.15);
  return Math.max(52, Math.min(99, raw));
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function featherBinaryMaskInBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  passes = 2
): Float32Array {
  let src = new Float32Array(mask.length);
  const bx0 = Math.max(1, minX - passes - 1);
  const bx1 = Math.min(width - 2, maxX + passes + 1);
  const by0 = Math.max(1, minY - passes - 1);
  const by1 = Math.min(height - 2, maxY + passes + 1);

  for (let y = by0 - 1; y <= by1 + 1; y++) {
    const row = y * width;
    for (let x = bx0 - 1; x <= bx1 + 1; x++) {
      src[row + x] = mask[row + x] > 0 ? 1 : 0;
    }
  }

  for (let p = 0; p < passes; p++) {
    const dst = new Float32Array(mask.length);
    for (let y = by0; y <= by1; y++) {
      const row = y * width;
      for (let x = bx0; x <= bx1; x++) {
        const idx = row + x;
        const sum =
          src[idx - width - 1] +
          src[idx - width] * 2 +
          src[idx - width + 1] +
          src[idx - 1] * 2 +
          src[idx] * 4 +
          src[idx + 1] * 2 +
          src[idx + width - 1] +
          src[idx + width] * 2 +
          src[idx + width + 1];
        dst[idx] = sum / 16;
      }
    }
    src = dst;
  }

  return src;
}

/**
 * Precomputes the feathered lip alpha mask and tight bounding box once per portrait,
 * making live lipstick shade/thickness adjustments run in <1ms per frame.
 */
export function computeLipAlphaMask(
  width: number,
  height: number,
  landmarks: Array<[number, number, number]> | null,
  box: FaceLandmarksBox
): CachedLipMask {
  const mask = new Uint8Array(width * height);
  let minX = width - 1;
  let maxX = 0;
  let minY = height - 1;
  let maxY = 0;

  if (landmarks && landmarks.length >= 468) {
    const outerPts: Array<[number, number]> = OUTER_LIP_CONTOUR.map((idx) => {
      const px = Math.min(width - 1, Math.max(0, landmarks[idx][0]));
      const py = Math.min(height - 1, Math.max(0, landmarks[idx][1]));
      if (px < minX) minX = Math.floor(px);
      if (px > maxX) maxX = Math.ceil(px);
      if (py < minY) minY = Math.floor(py);
      if (py > maxY) maxY = Math.ceil(py);
      return [px, py];
    });
    fillPolygonMask(mask, width, height, outerPts, 1);

    // Exclude inner mouth cavity when smiling or mouth is slightly parted so teeth stay completely clean
    const upperInner = landmarks[13];
    const lowerInner = landmarks[14];
    const mouthGapPx = Math.hypot(upperInner[0] - lowerInner[0], upperInner[1] - lowerInner[1]);
    if (mouthGapPx > Math.max(1.5, height * 0.0045)) {
      const innerPts: Array<[number, number]> = INNER_LIP_CONTOUR.map((idx) => [
        Math.min(width - 1, Math.max(0, landmarks[idx][0])),
        Math.min(height - 1, Math.max(0, landmarks[idx][1])),
      ]);
      fillPolygonMask(mask, width, height, innerPts, 0);
    }
  } else {
    const cx = box.centerX * width;
    const cy = box.lipCenterY * height;
    const rx = Math.max(8, (box.lipWidth * width) / 2);
    const ry = Math.max(4, rx * 0.34);
    minX = Math.max(0, Math.floor(cx - rx));
    maxX = Math.min(width - 1, Math.ceil(cx + rx));
    minY = Math.max(0, Math.floor(cy - ry));
    maxY = Math.min(height - 1, Math.ceil(cy + ry));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          mask[y * width + x] = 1;
        }
      }
    }
  }

  const pad = 3;
  const clampedMinX = Math.max(0, minX - pad);
  const clampedMaxX = Math.min(width - 1, maxX + pad);
  const clampedMinY = Math.max(0, minY - pad);
  const clampedMaxY = Math.min(height - 1, maxY + pad);

  const feathered = featherBinaryMaskInBounds(
    mask,
    width,
    height,
    minX,
    maxX,
    minY,
    maxY,
    2
  );

  return {
    mask: feathered,
    minX: clampedMinX,
    maxX: clampedMaxX,
    minY: clampedMinY,
    maxY: clampedMaxY,
    centerXNorm: width > 0 ? ((clampedMinX + clampedMaxX) * 0.5) / width : 0.5,
    centerYNorm: height > 0 ? ((clampedMinY + clampedMaxY) * 0.5) / height : 0.62,
  };
}

/**
 * Applies photorealistic virtual lipstick (Kubelka-Munk optical blend) and optional
 * diffused cheek blush directly onto a portrait RGBA buffer without mutating the input.
 */
export function applyVirtualMakeupToRgba(
  baseRgba: Uint8ClampedArray,
  width: number,
  height: number,
  landmarks: Array<[number, number, number]> | null,
  skinMask: Uint8Array | null,
  box: FaceLandmarksBox,
  options: VirtualMakeupOptions
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(baseRgba);

  // 1. Optional diffused cheekbone blush (restricted to detected skin mask)
  if (options.blushEnabled && options.blushHex) {
    const blushRgb = hexToRgb(options.blushHex);
    const intensity = Math.max(0, Math.min(0.45, options.blushIntensity ?? 0.22));
    if (intensity > 0.005) {
      let leftCenter: [number, number];
      let rightCenter: [number, number];
      let radius: number;

      if (landmarks && landmarks.length >= 468) {
        const l1 = landmarks[50];
        const l2 = landmarks[116];
        const r1 = landmarks[280];
        const r2 = landmarks[345];
        leftCenter = [(l1[0] + l2[0]) * 0.5, (l1[1] + l2[1]) * 0.5 + height * 0.01];
        rightCenter = [(r1[0] + r2[0]) * 0.5, (r1[1] + r2[1]) * 0.5 + height * 0.01];
        const cheekSpan = Math.hypot(
          rightCenter[0] - leftCenter[0],
          rightCenter[1] - leftCenter[1]
        );
        radius = Math.max(12, cheekSpan * 0.3);
      } else {
        const cx = box.centerX * width;
        const cy = (box.centerY + box.faceHeight * 0.05) * height;
        const offset = box.faceWidth * width * 0.28;
        leftCenter = [cx - offset, cy];
        rightCenter = [cx + offset, cy];
        radius = Math.max(12, box.faceWidth * width * 0.2);
      }

      const invTwoSigma2 = 1 / (2 * (radius * 0.52) * (radius * 0.52));
      const centers: Array<[number, number]> = [leftCenter, rightCenter];

      for (const [cx, cy] of centers) {
        const x0 = Math.max(0, Math.floor(cx - radius));
        const x1 = Math.min(width - 1, Math.ceil(cx + radius));
        const y0 = Math.max(0, Math.floor(cy - radius));
        const y1 = Math.min(height - 1, Math.ceil(cy + radius));

        for (let y = y0; y <= y1; y++) {
          const dy = y - cy;
          const row = y * width;
          for (let x = x0; x <= x1; x++) {
            const pIdx = row + x;
            if (skinMask && skinMask[pIdx] === 0) continue;
            const dx = x - cx;
            const d2 = dx * dx + dy * dy;
            if (d2 > radius * radius) continue;
            const falloff = Math.exp(-d2 * invTwoSigma2);
            const alpha = intensity * falloff;
            const o = pIdx * 4;
            const mulR = (out[o] * blushRgb[0]) / 255;
            const mulG = (out[o + 1] * blushRgb[1]) / 255;
            const mulB = (out[o + 2] * blushRgb[2]) / 255;
            const targetR = mulR * 0.65 + blushRgb[0] * 0.35;
            const targetG = mulG * 0.65 + blushRgb[1] * 0.35;
            const targetB = mulB * 0.65 + blushRgb[2] * 0.35;
            out[o] = clampByte(out[o] * (1 - alpha) + targetR * alpha);
            out[o + 1] = clampByte(out[o + 1] * (1 - alpha) + targetG * alpha);
            out[o + 2] = clampByte(out[o + 2] * (1 - alpha) + targetB * alpha);
          }
        }
      }
    }
  }

  // 2. Virtual Lipstick using per-pixel Kubelka-Munk optical substrate blending inside tight lip bounds
  if (options.lipEnabled && options.lipHex) {
    const thickness = options.lipThickness ?? 0.9;
    if (thickness > 0.01) {
      const lipData =
        options.precomputedLipMask ?? computeLipAlphaMask(width, height, landmarks, box);
      const { mask: lipMask, minX, maxX, minY, maxY } = lipData;
      const productRgb = hexToRgb(options.lipHex);
      const textureType = options.lipTexture ?? "Juicy Tint";
      const isGlossy = GLOSSY_TEXTURES.has(textureType);

      let lumaSum = 0;
      let lumaCount = 0;
      for (let y = minY; y <= maxY; y++) {
        const row = y * width;
        for (let x = minX; x <= maxX; x++) {
          const i = row + x;
          if (lipMask[i] > 0.45) {
            const o = i * 4;
            lumaSum += 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2];
            lumaCount++;
          }
        }
      }
      const meanLipLuma = lumaCount > 0 ? lumaSum / lumaCount : 135;

      const thicknessFactor = Math.min(1, 0.45 + thickness * 0.35);
      const maxAlpha = isGlossy ? 0.72 : 0.82;

      for (let y = minY; y <= maxY; y++) {
        const row = y * width;
        for (let x = minX; x <= maxX; x++) {
          const i = row + x;
          const weight = lipMask[i];
          if (weight <= 0.015) continue;

          const o = i * 4;
          const r = out[o];
          const g = out[o + 1];
          const b = out[o + 2];
          const pixelLuma = 0.299 * r + 0.587 * g + 0.114 * b;

          const kmRgb = kubelkaMunkLipBlend([r, g, b], productRgb, {
            textureType,
            thickness,
          });

          const rawRatio = pixelLuma / Math.max(36, meanLipLuma);
          const clampedRatio = Math.max(0.55, Math.min(1.25, rawRatio));
          const shadingMix = Math.pow(clampedRatio, 0.72);

          let targetR = kmRgb[0] * shadingMix;
          let targetG = kmRgb[1] * shadingMix;
          let targetB = kmRgb[2] * shadingMix;

          if (isGlossy && pixelLuma > meanLipLuma * 1.08) {
            const glossBoost = Math.min(30, (pixelLuma - meanLipLuma * 1.08) * 0.6) * weight;
            targetR += glossBoost;
            targetG += glossBoost * 0.96;
            targetB += glossBoost * 0.96;
          }

          const alpha = Math.min(maxAlpha, weight * maxAlpha * thicknessFactor);
          out[o] = clampByte(r * (1 - alpha) + targetR * alpha);
          out[o + 1] = clampByte(g * (1 - alpha) + targetG * alpha);
          out[o + 2] = clampByte(b * (1 - alpha) + targetB * alpha);
        }
      }
    }
  }

  return out;
}
