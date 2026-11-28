import { hexToRgb, linearChannelToSrgb, srgbChannelToLinear } from "./bradfordCat";
import type { SideBias } from "./facialSymmetry";
import { kubelkaMunkLipBlend } from "./kubelkaMunk";
import { fillPolygonMask } from "./neuralLandmarks";
import type { FaceLandmarksBox, FaceShapeName } from "./types";

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

/** Canonical MediaPipe left & right eyebrow perimeters (image-left, image-right). */
const LEFT_BROW_UPPER = [70, 63, 105, 66, 107];
const LEFT_BROW_LOWER = [55, 65, 52, 53, 46];
const RIGHT_BROW_UPPER = [336, 296, 334, 293, 300];
const RIGHT_BROW_LOWER = [276, 283, 282, 295, 285];

/** Canonical MediaPipe eye opening polygons (excluded so iris/sclera stay crystal clear). */
const LEFT_EYE_OPENING = [
  33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
];
const RIGHT_EYE_OPENING = [
  263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466,
];

const LEFT_UPPER_LID = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const RIGHT_UPPER_LID = [362, 398, 384, 385, 386, 387, 388, 466, 263];

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
  blushLiftSide?: SideBias;
  /** Corrective optical brow grooming & subtle lift on lower brow */
  browEnabled?: boolean;
  browHex?: string;
  browIntensity?: number;
  browLiftSide?: SideBias;
  browLiftPx?: number;
  /** Asymmetric jawline, cheekbone & nose bridge contour + highlight */
  contourEnabled?: boolean;
  contourHex?: string;
  highlightHex?: string;
  contourIntensity?: number;
  widerJawSide?: SideBias;
  noseContourStrength?: number;
  /** Subtle upper-lid crease eyeshadow + outer-corner lift */
  eyeshadowEnabled?: boolean;
  eyeshadowHex?: string;
  eyeshadowIntensity?: number;
  droopingEyeSide?: SideBias;
  faceShape?: FaceShapeName;
  precomputedLipMask?: CachedLipMask;
}

export function hasActiveVirtualMakeup(options?: VirtualMakeupOptions): boolean {
  if (!options) return false;
  return Boolean(
    options.lipEnabled ||
      options.blushEnabled ||
      options.browEnabled ||
      options.contourEnabled ||
      options.eyeshadowEnabled
  );
}

/**
 * Monotonic UI display rescaling of CIEDE2000 perceptual distance into [52, 99].
 * IMPORTANT (Requirement 1): This is a relative color-proximity indicator for human readability,
 * NOT a statistically calibrated probability of real-world cosmetic suitability. Raw `deltaE`
 * and `classifyColorSimilarityTier(deltaE)` remain the authoritative colorimetric metrics.
 */
export function deltaEToMatchPercent(deltaE: number): number {
  if (!Number.isFinite(deltaE) || deltaE <= 0) return 99;
  const raw = Math.round(99 - deltaE * 2.15);
  return Math.max(52, Math.min(99, raw));
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-6) return wx * wx + wy * wy;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq));
  const cx = ax + t * vx;
  const cy = ay + t * vy;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

function minDistSqToPolyline(px: number, py: number, pts: Array<[number, number]>): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d2 = distToSegmentSq(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d2 < best) best = d2;
  }
  return best;
}

/**
 * Applies a feathered optical contour shadow or highlight stroke along a polyline in linear-light space.
 * Preserves real skin micro-texture, pores, and lighting gradients cleanly.
 */
function applyOpticalPolylineStroke(
  out: Uint8ClampedArray,
  width: number,
  height: number,
  skinMask: Uint8Array | null,
  pts: Array<[number, number]>,
  radiusPx: number,
  pigmentLin: [number, number, number],
  strength: number,
  mode: "contour" | "highlight"
): void {
  if (pts.length < 2 || strength <= 0.002 || radiusPx < 1) return;

  let minX = width - 1;
  let maxX = 0;
  let minY = height - 1;
  let maxY = 0;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const rCeil = Math.ceil(radiusPx * 1.45);
  const x0 = Math.max(0, Math.floor(minX - rCeil));
  const x1 = Math.min(width - 1, Math.ceil(maxX + rCeil));
  const y0 = Math.max(0, Math.floor(minY - rCeil));
  const y1 = Math.min(height - 1, Math.ceil(maxY + rCeil));
  const maxR2 = radiusPx * radiusPx * 2.1;
  const invSigma2 = 1 / (2 * (radiusPx * 0.62) * (radiusPx * 0.62));

  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      const pIdx = row + x;
      if (skinMask && skinMask[pIdx] === 0) continue;

      const d2 = minDistSqToPolyline(x, y, pts);
      if (d2 > maxR2) continue;

      const falloff = Math.exp(-d2 * invSigma2) * Math.max(0, 1 - d2 / maxR2);
      const alpha = Math.min(0.55, strength * falloff);
      if (alpha <= 0.002) continue;

      const o = pIdx * 4;
      const sr = srgbChannelToLinear(out[o]);
      const sg = srgbChannelToLinear(out[o + 1]);
      const sb = srgbChannelToLinear(out[o + 2]);

      if (mode === "contour") {
        // Soft optical shadow absorption (taupe shade darkens skin cleanly without flat paint)
        const tr = sr * (0.32 + 0.68 * pigmentLin[0]);
        const tg = sg * (0.32 + 0.68 * pigmentLin[1]);
        const tb = sb * (0.32 + 0.68 * pigmentLin[2]);
        out[o] = clampByte(linearChannelToSrgb(sr * (1 - alpha) + tr * alpha));
        out[o + 1] = clampByte(linearChannelToSrgb(sg * (1 - alpha) + tg * alpha));
        out[o + 2] = clampByte(linearChannelToSrgb(sb * (1 - alpha) + tb * alpha));
      } else {
        // Luminous highlight lift (subtle specular sheen, never blowing out to solid chalk)
        const tr = sr + (pigmentLin[0] - sr) * 0.42 + 0.045 * (1 - sr);
        const tg = sg + (pigmentLin[1] - sg) * 0.42 + 0.042 * (1 - sg);
        const tb = sb + (pigmentLin[2] - sb) * 0.42 + 0.036 * (1 - sb);
        out[o] = clampByte(linearChannelToSrgb(sr * (1 - alpha) + Math.min(0.98, tr) * alpha));
        out[o + 1] = clampByte(linearChannelToSrgb(sg * (1 - alpha) + Math.min(0.98, tg) * alpha));
        out[o + 2] = clampByte(linearChannelToSrgb(sb * (1 - alpha) + Math.min(0.98, tb) * alpha));
      }
    }
  }
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
 * Applies photorealistic multi-layer virtual makeup directly onto a portrait RGBA buffer:
 *  1. Asymmetric Contour & Highlight (jawline, cheekbone, nose bridge)
 *  2. Corrective Eyebrow grooming & subtle lift on the lower brow
 *  3. Subtle Upper-Lid Crease Eyeshadow with outer-corner lift
 *  4. Anatomically sculpted Cheekbone Blush (rotated Gaussian ellipse)
 *  5. Kubelka-Munk optical Lipstick
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
  const hasLms = Boolean(landmarks && landmarks.length >= 468);

  // ---------------------------------------------------------------------------
  // 1. Asymmetric Jawline, Cheekbone & Nose Contour + Luminous Highlight
  // ---------------------------------------------------------------------------
  if (options.contourEnabled && hasLms && landmarks) {
    const cRgb = hexToRgb(options.contourHex ?? "#785D4E");
    const cLin: [number, number, number] = [
      srgbChannelToLinear(cRgb[0]),
      srgbChannelToLinear(cRgb[1]),
      srgbChannelToLinear(cRgb[2]),
    ];
    const hRgb = hexToRgb(options.highlightHex ?? "#F5E4D6");
    const hLin: [number, number, number] = [
      srgbChannelToLinear(hRgb[0]),
      srgbChannelToLinear(hRgb[1]),
      srgbChannelToLinear(hRgb[2]),
    ];

    const baseStrength = Math.max(0, Math.min(0.58, options.contourIntensity ?? 0.3));
    const faceW = Math.hypot(
      landmarks[454][0] - landmarks[234][0],
      landmarks[454][1] - landmarks[234][1]
    );
    const jawRadius = Math.max(8.5, faceW * 0.105);
    const noseRadius = Math.max(3.8, faceW * 0.035);
    const hlRadius = Math.max(4.8, faceW * 0.045);

    const wider = options.widerJawSide ?? "balanced";
    const leftJawMult = wider === "left" ? 1.38 : wider === "right" ? 0.56 : 0.92;
    const rightJawMult = wider === "right" ? 1.38 : wider === "left" ? 0.56 : 0.92;

    const lJawPts: Array<[number, number]> = [234, 132, 172, 136, 149].map((i) => [
      landmarks[i][0],
      landmarks[i][1],
    ]);
    const rJawPts: Array<[number, number]> = [454, 361, 397, 365, 378].map((i) => [
      landmarks[i][0],
      landmarks[i][1],
    ]);

    applyOpticalPolylineStroke(
      out,
      width,
      height,
      skinMask,
      lJawPts,
      jawRadius,
      cLin,
      baseStrength * leftJawMult,
      "contour"
    );
    applyOpticalPolylineStroke(
      out,
      width,
      height,
      skinMask,
      rJawPts,
      jawRadius,
      cLin,
      baseStrength * rightJawMult,
      "contour"
    );

    // Nose bridge twin contour strokes (broken upper bridge + tip V for realism)
    const noseStrength = Math.max(0.08, Math.min(0.45, options.noseContourStrength ?? baseStrength * 0.92));
    const lNoseUpper: Array<[number, number]> = [193, 122, 114].map((i) => [
      landmarks[i][0],
      landmarks[i][1],
    ]);
    const rNoseUpper: Array<[number, number]> = [417, 351, 343].map((i) => [
      landmarks[i][0],
      landmarks[i][1],
    ]);
    const noseTipV: Array<[number, number]> = [129, 2, 358].map((i) => [
      landmarks[i][0],
      landmarks[i][1],
    ]);
    applyOpticalPolylineStroke(out, width, height, skinMask, lNoseUpper, noseRadius, cLin, noseStrength, "contour");
    applyOpticalPolylineStroke(out, width, height, skinMask, rNoseUpper, noseRadius, cLin, noseStrength, "contour");
    applyOpticalPolylineStroke(out, width, height, skinMask, noseTipV, noseRadius * 0.85, cLin, noseStrength * 0.72, "contour");

    // Luminous highlights: nose bridge center, upper cheekbones (extra lift on narrower side), chin center
    const bridgeHl: Array<[number, number]> = [6, 197, 195, 4].map((i) => [
      landmarks[i][0],
      landmarks[i][1],
    ]);
    applyOpticalPolylineStroke(out, width, height, skinMask, bridgeHl, hlRadius * 0.75, hLin, baseStrength * 0.9, "highlight");

    const lCheekHl: Array<[number, number]> = [116, 123, 50].map((i) => [
      landmarks[i][0],
      landmarks[i][1] - faceW * 0.025,
    ]);
    const rCheekHl: Array<[number, number]> = [345, 352, 280].map((i) => [
      landmarks[i][0],
      landmarks[i][1] - faceW * 0.025,
    ]);
    const lHlBoost = wider === "right" ? 1.15 : 0.78;
    const rHlBoost = wider === "left" ? 1.15 : 0.78;
    applyOpticalPolylineStroke(out, width, height, skinMask, lCheekHl, hlRadius * 1.4, hLin, baseStrength * 0.65 * lHlBoost, "highlight");
    applyOpticalPolylineStroke(out, width, height, skinMask, rCheekHl, hlRadius * 1.4, hLin, baseStrength * 0.65 * rHlBoost, "highlight");
  }

  // ---------------------------------------------------------------------------
  // 2. Corrective Groomed Eyebrows (soft taupe fill + upward arch lift on lower brow)
  // ---------------------------------------------------------------------------
  if (options.browEnabled && hasLms && landmarks) {
    const browRgb = hexToRgb(options.browHex ?? "#463D39");
    const browLinR = srgbChannelToLinear(browRgb[0]);
    const browLinG = srgbChannelToLinear(browRgb[1]);
    const browLinB = srgbChannelToLinear(browRgb[2]);
    const strength = Math.max(0, Math.min(0.55, options.browIntensity ?? 0.34));
    const liftSide = options.browLiftSide ?? "balanced";
    const liftPx = Math.max(0, Math.min(6, options.browLiftPx ?? 2.2));

    if (strength > 0.005) {
      const browMask = new Uint8Array(width * height);
      let minX = width - 1;
      let maxX = 0;
      let minY = height - 1;
      let maxY = 0;

      const buildBrowPoly = (
        upper: number[],
        lower: number[],
        applyLift: boolean
      ): Array<[number, number]> => {
        const pts: Array<[number, number]> = [];
        for (let idxPos = 0; idxPos < upper.length; idxPos++) {
          const lm = landmarks[upper[idxPos]];
          // Gently arch-lift the outer/mid upper brow on the lower side
          const liftWeight = idxPos === 0 ? 0.6 : idxPos === upper.length - 1 ? 0.55 : 1.0;
          const x = Math.min(width - 1, Math.max(0, lm[0]));
          const y = Math.min(
            height - 1,
            Math.max(0, lm[1] - (applyLift ? liftPx * liftWeight : 0.4))
          );
          if (x < minX) minX = Math.floor(x);
          if (x > maxX) maxX = Math.ceil(x);
          if (y < minY) minY = Math.floor(y);
          if (y > maxY) maxY = Math.ceil(y);
          pts.push([x, y]);
        }
        for (const i of lower) {
          const lm = landmarks[i];
          const x = Math.min(width - 1, Math.max(0, lm[0]));
          const y = Math.min(height - 1, Math.max(0, lm[1]));
          if (x < minX) minX = Math.floor(x);
          if (x > maxX) maxX = Math.ceil(x);
          if (y < minY) minY = Math.floor(y);
          if (y > maxY) maxY = Math.ceil(y);
          pts.push([x, y]);
        }
        return pts;
      };

      fillPolygonMask(
        browMask,
        width,
        height,
        buildBrowPoly(LEFT_BROW_UPPER, LEFT_BROW_LOWER, liftSide === "left"),
        1
      );
      fillPolygonMask(
        browMask,
        width,
        height,
        buildBrowPoly(RIGHT_BROW_UPPER, RIGHT_BROW_LOWER, liftSide === "right"),
        1
      );

      const feathered = featherBinaryMaskInBounds(browMask, width, height, minX, maxX, minY, maxY, 2);
      const bx0 = Math.max(0, minX - 3);
      const bx1 = Math.min(width - 1, maxX + 3);
      const by0 = Math.max(0, minY - 3);
      const by1 = Math.min(height - 1, maxY + 3);

      for (let y = by0; y <= by1; y++) {
        const row = y * width;
        for (let x = bx0; x <= bx1; x++) {
          const w = feathered[row + x];
          if (w <= 0.02) continue;
          const o = (row + x) * 4;
          const sr = srgbChannelToLinear(out[o]);
          const sg = srgbChannelToLinear(out[o + 1]);
          const sb = srgbChannelToLinear(out[o + 2]);
          // Hair-preserving translucent brow tint (fills sparse skin gaps without flattening existing dark brow hairs)
          const alpha = w * strength;
          const tr = sr * (0.28 + 0.72 * browLinR) * 0.7 + browLinR * 0.3;
          const tg = sg * (0.28 + 0.72 * browLinG) * 0.7 + browLinG * 0.3;
          const tb = sb * (0.28 + 0.72 * browLinB) * 0.7 + browLinB * 0.3;
          out[o] = clampByte(linearChannelToSrgb(sr * (1 - alpha) + tr * alpha));
          out[o + 1] = clampByte(linearChannelToSrgb(sg * (1 - alpha) + tg * alpha));
          out[o + 2] = clampByte(linearChannelToSrgb(sb * (1 - alpha) + tb * alpha));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Natural Crease Eyeshadow with Outer-Corner Lift (excludes eyeballs cleanly)
  // ---------------------------------------------------------------------------
  if (options.eyeshadowEnabled && hasLms && landmarks) {
    const shRgb = hexToRgb(options.eyeshadowHex ?? "#9E766E");
    const shLinR = srgbChannelToLinear(shRgb[0]);
    const shLinG = srgbChannelToLinear(shRgb[1]);
    const shLinB = srgbChannelToLinear(shRgb[2]);
    const strength = Math.max(0, Math.min(0.45, options.eyeshadowIntensity ?? 0.28));
    const droopSide = options.droopingEyeSide ?? "balanced";

    if (strength > 0.005) {
      const shadowMask = new Uint8Array(width * height);
      let minX = width - 1;
      let maxX = 0;
      let minY = height - 1;
      let maxY = 0;

      const buildLidPoly = (
        upperLid: number[],
        outerIdx: number,
        isLeft: boolean,
        extraLift: boolean
      ): Array<[number, number]> => {
        const eyeW = Math.max(
          10,
          Math.hypot(
            landmarks[upperLid[upperLid.length - 1]][0] - landmarks[upperLid[0]][0],
            landmarks[upperLid[upperLid.length - 1]][1] - landmarks[upperLid[0]][1]
          )
        );
        const creaseH = Math.max(4, eyeW * 0.29);
        const dirX = isLeft ? -1 : 1;
        const poly: Array<[number, number]> = [];
        // Upper crease arc (lifted softly at outer tail)
        for (let i = 0; i < upperLid.length; i++) {
          const lm = landmarks[upperLid[i]];
          const isOuter = upperLid[i] === outerIdx;
          const tailBoost = isOuter ? (extraLift ? 1.48 : 1.15) : 1.0;
          const x = Math.min(
            width - 1,
            Math.max(0, lm[0] + (isOuter ? dirX * eyeW * (extraLift ? 0.16 : 0.1) : 0))
          );
          const y = Math.min(height - 1, Math.max(0, lm[1] - creaseH * tailBoost));
          if (x < minX) minX = Math.floor(x);
          if (x > maxX) maxX = Math.ceil(x);
          if (y < minY) minY = Math.floor(y);
          if (y > maxY) maxY = Math.ceil(y);
          poly.push([x, y]);
        }
        // Return along upper lash line
        for (let i = upperLid.length - 1; i >= 0; i--) {
          const lm = landmarks[upperLid[i]];
          const x = Math.min(width - 1, Math.max(0, lm[0]));
          const y = Math.min(height - 1, Math.max(0, lm[1]));
          if (x < minX) minX = Math.floor(x);
          if (x > maxX) maxX = Math.ceil(x);
          if (y < minY) minY = Math.floor(y);
          if (y > maxY) maxY = Math.ceil(y);
          poly.push([x, y]);
        }
        return poly;
      };

      fillPolygonMask(
        shadowMask,
        width,
        height,
        buildLidPoly(LEFT_UPPER_LID, 33, true, droopSide === "left"),
        1
      );
      fillPolygonMask(
        shadowMask,
        width,
        height,
        buildLidPoly(RIGHT_UPPER_LID, 263, false, droopSide === "right"),
        1
      );

      // Strictly exclude both eye openings so whites & iris remain 100% crisp
      const excludeEye = (indices: number[]) => {
        const pts: Array<[number, number]> = indices.map((i) => [
          Math.min(width - 1, Math.max(0, landmarks[i][0])),
          Math.min(height - 1, Math.max(0, landmarks[i][1])),
        ]);
        fillPolygonMask(shadowMask, width, height, pts, 0);
      };
      excludeEye(LEFT_EYE_OPENING);
      excludeEye(RIGHT_EYE_OPENING);

      const feathered = featherBinaryMaskInBounds(
        shadowMask,
        width,
        height,
        minX,
        maxX,
        minY,
        maxY,
        3
      );
      const ex0 = Math.max(0, minX - 4);
      const ex1 = Math.min(width - 1, maxX + 4);
      const ey0 = Math.max(0, minY - 4);
      const ey1 = Math.min(height - 1, maxY + 4);

      for (let y = ey0; y <= ey1; y++) {
        const row = y * width;
        for (let x = ex0; x <= ex1; x++) {
          const w = feathered[row + x];
          if (w <= 0.02) continue;
          const o = (row + x) * 4;
          const sr = srgbChannelToLinear(out[o]);
          const sg = srgbChannelToLinear(out[o + 1]);
          const sb = srgbChannelToLinear(out[o + 2]);
          const alpha = w * strength;
          const tr = sr * (0.35 + 0.65 * shLinR) * 0.78 + shLinR * 0.22;
          const tg = sg * (0.35 + 0.65 * shLinG) * 0.78 + shLinG * 0.22;
          const tb = sb * (0.35 + 0.65 * shLinB) * 0.78 + shLinB * 0.22;
          out[o] = clampByte(linearChannelToSrgb(sr * (1 - alpha) + tr * alpha));
          out[o + 1] = clampByte(linearChannelToSrgb(sg * (1 - alpha) + tg * alpha));
          out[o + 2] = clampByte(linearChannelToSrgb(sb * (1 - alpha) + tb * alpha));
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Anatomically Sculpted Cheekbone Blush (elliptical Gaussian + optional lift)
  // ---------------------------------------------------------------------------
  if (options.blushEnabled && options.blushHex) {
    const blushRgb = hexToRgb(options.blushHex);
    const blushLinR = srgbChannelToLinear(blushRgb[0]);
    const blushLinG = srgbChannelToLinear(blushRgb[1]);
    const blushLinB = srgbChannelToLinear(blushRgb[2]);
    const intensity = Math.max(0, Math.min(0.48, options.blushIntensity ?? 0.26));
    if (intensity > 0.005) {
      const liftAngleDeg =
        options.faceShape === "Round" || options.faceShape === "Square"
          ? 24
          : options.faceShape === "Oblong"
            ? 8
            : 16;

      interface CheekEllipse {
        cx: number;
        cy: number;
        rx: number;
        ry: number;
        cosA: number;
        sinA: number;
      }

      const cheeks: CheekEllipse[] = [];

      if (hasLms && landmarks) {
        const lInner = landmarks[50];
        const lOuter = landmarks[123] ?? landmarks[116];
        const rInner = landmarks[280];
        const rOuter = landmarks[352] ?? landmarks[345];

        const cheekSpan = Math.hypot(rInner[0] - lInner[0], rInner[1] - lInner[1]);
        const rx = Math.max(14, cheekSpan * 0.34);
        const ry = Math.max(10, rx * 0.66);

        const baseAngleRad = (liftAngleDeg * Math.PI) / 180;
        const lLift = options.blushLiftSide === "left" ? -height * 0.009 : 0;
        const rLift = options.blushLiftSide === "right" ? -height * 0.009 : 0;

        const lCx = lInner[0] * 0.56 + lOuter[0] * 0.44;
        const lCy = lInner[1] * 0.56 + lOuter[1] * 0.44 + height * 0.006 + lLift;
        const rCx = rInner[0] * 0.56 + rOuter[0] * 0.44;
        const rCy = rInner[1] * 0.56 + rOuter[1] * 0.44 + height * 0.006 + rLift;

        cheeks.push(
          {
            cx: lCx,
            cy: lCy,
            rx,
            ry,
            cosA: Math.cos(baseAngleRad),
            sinA: Math.sin(baseAngleRad),
          },
          {
            cx: rCx,
            cy: rCy,
            rx,
            ry,
            cosA: Math.cos(-baseAngleRad),
            sinA: Math.sin(-baseAngleRad),
          }
        );
      } else {
        const cx = box.centerX * width;
        const cy = (box.centerY + box.faceHeight * 0.05) * height;
        const offset = box.faceWidth * width * 0.27;
        const rx = Math.max(14, box.faceWidth * width * 0.22);
        const ry = Math.max(10, rx * 0.68);
        const angleRad = (liftAngleDeg * Math.PI) / 180;
        cheeks.push(
          {
            cx: cx - offset,
            cy,
            rx,
            ry,
            cosA: Math.cos(angleRad),
            sinA: Math.sin(angleRad),
          },
          {
            cx: cx + offset,
            cy,
            rx,
            ry,
            cosA: Math.cos(-angleRad),
            sinA: Math.sin(-angleRad),
          }
        );
      }

      for (const cheek of cheeks) {
        const bound = Math.ceil(Math.max(cheek.rx, cheek.ry));
        const x0 = Math.max(0, Math.floor(cheek.cx - bound));
        const x1 = Math.min(width - 1, Math.ceil(cheek.cx + bound));
        const y0 = Math.max(0, Math.floor(cheek.cy - bound));
        const y1 = Math.min(height - 1, Math.ceil(cheek.cy + bound));

        for (let y = y0; y <= y1; y++) {
          const dy = y - cheek.cy;
          const row = y * width;
          for (let x = x0; x <= x1; x++) {
            const pIdx = row + x;
            if (skinMask && skinMask[pIdx] === 0) continue;
            const dx = x - cheek.cx;
            const u = (dx * cheek.cosA + dy * cheek.sinA) / cheek.rx;
            const v = (-dx * cheek.sinA + dy * cheek.cosA) / cheek.ry;
            const normD2 = u * u + v * v;
            if (normD2 > 1.0) continue;

            const falloff = Math.exp(-normD2 * 2.45) * (1 - normD2);
            const alpha = intensity * falloff * 1.35;
            if (alpha <= 0.002) continue;

            const o = pIdx * 4;
            const sr = srgbChannelToLinear(out[o]);
            const sg = srgbChannelToLinear(out[o + 1]);
            const sb = srgbChannelToLinear(out[o + 2]);

            const absorbR = sr * (0.35 + 0.65 * blushLinR);
            const absorbG = sg * (0.35 + 0.65 * blushLinG);
            const absorbB = sb * (0.35 + 0.65 * blushLinB);

            const targetR = absorbR * 0.72 + blushLinR * 0.28;
            const targetG = absorbG * 0.72 + blushLinG * 0.28;
            const targetB = absorbB * 0.72 + blushLinB * 0.28;

            out[o] = clampByte(linearChannelToSrgb(sr * (1 - alpha) + targetR * alpha));
            out[o + 1] = clampByte(linearChannelToSrgb(sg * (1 - alpha) + targetG * alpha));
            out[o + 2] = clampByte(linearChannelToSrgb(sb * (1 - alpha) + targetB * alpha));
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Virtual Lipstick using per-pixel Kubelka-Munk optical substrate blending
  // ---------------------------------------------------------------------------
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
