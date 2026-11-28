import { labToRgb, rgbToHex, rgbToLab } from "./bradfordCat";
import type { ConsultationReport, FaceLandmarksBox } from "./types";

export type ZoneLuminanceRole = "highlight" | "neutral" | "shadow";

export interface FacialZoneLabPoint {
  id: string;
  labelVi: string;
  shortLabelVi: string;
  L: number;
  a: number;
  b: number;
  p10L: number;
  p90L: number;
  deltaL: number;
  deltaA: number;
  deltaB: number;
  deltaE: number;
  hex: string;
  sampleCount: number;
  role: ZoneLuminanceRole;
  makeupNoteVi: string;
}

export interface SkinPixelLabSample {
  L: number;
  a: number;
  b: number;
  deltaL: number;
  deltaA: number;
  deltaB: number;
  hex: string;
  role: ZoneLuminanceRole;
  regionVi: string;
}

export interface IdealNeutralReference {
  L: number;
  a: number;
  b: number;
  chroma: number;
  hueDeg: number;
  hex: string;
}

export interface SkinLabVarianceAnalysis {
  idealNeutral: IdealNeutralReference;
  userMeanLab: { L: number; a: number; b: number; hex: string };
  zones: FacialZoneLabPoint[];
  pixelCloud: SkinPixelLabSample[];
  brightestZone: FacialZoneLabPoint | null;
  darkestZone: FacialZoneLabPoint | null;
  reddestZone: FacialZoneLabPoint | null;
  luminanceSpread: number;
  meanDeltaE: number;
  hasData: boolean;
}

interface ZoneSpec {
  id: string;
  labelVi: string;
  shortLabelVi: string;
  landmarkIndices: number[];
  fallbackRel: { dx: number; dy: number; rx: number; ry: number };
  radiusScale: number;
}

/**
 * 8 anatomical facial zones spanning natural highlight planes (forehead, nose bridge),
 * mid-face reference planes (cheekbones, cheeks, chin), and contour shadow planes (jawline).
 * MediaPipe FaceMesh 468 indices follow standard canonical topology.
 */
const FACIAL_ZONE_SPECS: ZoneSpec[] = [
  {
    id: "forehead",
    labelVi: "Trán giữa",
    shortLabelVi: "Trán",
    landmarkIndices: [10, 151, 9, 108, 337],
    fallbackRel: { dx: 0, dy: -0.33, rx: 0.16, ry: 0.08 },
    radiusScale: 0.11,
  },
  {
    id: "nose_bridge",
    labelVi: "Sống mũi",
    shortLabelVi: "Sống mũi",
    landmarkIndices: [168, 6, 197, 195, 5],
    fallbackRel: { dx: 0, dy: -0.04, rx: 0.055, ry: 0.11 },
    radiusScale: 0.065,
  },
  {
    id: "left_cheekbone",
    labelVi: "Gò má trái",
    shortLabelVi: "Gò má T",
    landmarkIndices: [116, 117, 118, 123, 50],
    fallbackRel: { dx: -0.24, dy: 0.02, rx: 0.09, ry: 0.07 },
    radiusScale: 0.085,
  },
  {
    id: "right_cheekbone",
    labelVi: "Gò má phải",
    shortLabelVi: "Gò má P",
    landmarkIndices: [345, 346, 347, 352, 280],
    fallbackRel: { dx: 0.24, dy: 0.02, rx: 0.09, ry: 0.07 },
    radiusScale: 0.085,
  },
  {
    id: "left_cheek",
    labelVi: "Bầu má trái",
    shortLabelVi: "Má trái",
    landmarkIndices: [205, 206, 187, 147, 123],
    fallbackRel: { dx: -0.22, dy: 0.14, rx: 0.1, ry: 0.085 },
    radiusScale: 0.095,
  },
  {
    id: "right_cheek",
    labelVi: "Bầu má phải",
    shortLabelVi: "Má phải",
    landmarkIndices: [425, 426, 411, 376, 352],
    fallbackRel: { dx: 0.22, dy: 0.14, rx: 0.1, ry: 0.085 },
    radiusScale: 0.095,
  },
  {
    id: "chin",
    labelVi: "Vùng cằm",
    shortLabelVi: "Cằm",
    landmarkIndices: [152, 175, 199, 200, 18],
    fallbackRel: { dx: 0, dy: 0.37, rx: 0.11, ry: 0.065 },
    radiusScale: 0.085,
  },
  {
    id: "jaw_shadow",
    labelVi: "Hõm hàm & Viền",
    shortLabelVi: "Viền hàm",
    landmarkIndices: [172, 136, 150, 397, 365, 379],
    fallbackRel: { dx: 0.31, dy: 0.27, rx: 0.09, ry: 0.09 },
    radiusScale: 0.09,
  },
];

const IDEAL_NEUTRAL_HUE_DEG = 53.0;
const HIGHLIGHT_DELTA_L_THRESHOLD = 2.2;
const SHADOW_DELTA_L_THRESHOLD = -2.2;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.floor((sortedValues.length - 1) * p))
  );
  return sortedValues[idx];
}

function classifyRole(deltaL: number): ZoneLuminanceRole {
  if (deltaL >= HIGHLIGHT_DELTA_L_THRESHOLD) return "highlight";
  if (deltaL <= SHADOW_DELTA_L_THRESHOLD) return "shadow";
  return "neutral";
}

function describeZoneMakeupNote(
  id: string,
  role: ZoneLuminanceRole,
  deltaL: number,
  deltaA: number,
  deltaB: number
): string {
  if (role === "highlight") {
    if (id === "forehead" || id === "nose_bridge") {
      return `Bắt sáng tự nhiên (+${deltaL.toFixed(1)} L*). Chỉ cần thấm dầu/phủ phấn lì mỏng để tránh bóng quá mức.`;
    }
    return `Vùng nâng sáng tự nhiên (+${deltaL.toFixed(1)} L*). Giữ nền thật mỏng để tôn độ căng bóng sẵn có.`;
  }
  if (role === "shadow") {
    if (id === "jaw_shadow") {
      return `Vùng đổ bóng tự nhiên (${deltaL.toFixed(1)} L*). Phù hợp tán phấn khối xám nâu nhẹ dọc rìa xương hàm.`;
    }
    if (id === "chin") {
      return `Hơi tối hơn mức trung bình (${deltaL.toFixed(1)} L*). Chấm nhẹ che khuyết điểm sáng 0.5 tông ở chóp cằm.`;
    }
    return `Vùng chìm nhẹ (${deltaL.toFixed(1)} L*). Có thể nâng sáng cục bộ hoặc tận dụng làm đường tạo khối mềm.`;
  }
  if (deltaA >= 2.6) {
    return `Độ sáng cân bằng nhưng ửng đỏ rõ (+${deltaA.toFixed(1)} a*). Ưu tiên nền trung tính hoặc primer xanh nhạt trước khi tán má.`;
  }
  if (deltaB >= 3.0) {
    return `Sắc vàng ấm nổi bật (+${deltaB.toFixed(1)} b*). Chọn kem nền không quá hồng để giữ sự tiệp màu tự nhiên.`;
  }
  return `Sắc da ổn định gần chuẩn trung tính (ΔL* ${deltaL >= 0 ? "+" : ""}${deltaL.toFixed(1)}). Dùng làm mốc thử màu kem nền chính xác nhất.`;
}

/**
 * Computes the 'ideal' neutral reference CIELAB color anchored to the user's measured skin
 * luminance (L*) and a balanced neutral skin undertone hue (53° — exact midpoint between
 * cool pink-blue and warm golden skin prototypes).
 */
export function computeIdealNeutralReference(
  skinL: number,
  skinA: number,
  skinB: number
): IdealNeutralReference {
  const userChroma = Math.hypot(skinA, skinB);
  const idealChroma = Math.min(22, Math.max(14, userChroma * 0.92));
  const hueRad = (IDEAL_NEUTRAL_HUE_DEG * Math.PI) / 180;
  const idealL = Math.min(82, Math.max(32, skinL));
  const idealA = idealChroma * Math.cos(hueRad);
  const idealB = idealChroma * Math.sin(hueRad);
  const hex = rgbToHex(labToRgb([idealL, idealA, idealB]));

  return {
    L: round1(idealL),
    a: round1(idealA),
    b: round1(idealB),
    chroma: round1(idealChroma),
    hueDeg: IDEAL_NEUTRAL_HUE_DEG,
    hex,
  };
}

interface SampledRegionResult {
  L: number;
  a: number;
  b: number;
  p10L: number;
  p90L: number;
  sampleCount: number;
}

function sampleCircularZone(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  skinMask: Uint8Array,
  faceHullMask: Uint8Array,
  centers: Array<{ cx: number; cy: number; rx: number; ry: number }>
): SampledRegionResult | null {
  const lVals: number[] = [];
  const aVals: number[] = [];
  const bVals: number[] = [];

  const collectWithMask = (mask: Uint8Array) => {
    for (const { cx, cy, rx, ry } of centers) {
      const x0 = Math.max(0, Math.floor(cx - rx));
      const x1 = Math.min(width - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry));
      const y1 = Math.min(height - 1, Math.ceil(cy + ry));
      const invRx2 = 1 / Math.max(1, rx * rx);
      const invRy2 = 1 / Math.max(1, ry * ry);
      // Stride 2px on larger images for fast deterministic sampling
      const stride = Math.max(1, Math.round(Math.min(rx, ry) / 14));

      for (let y = y0; y <= y1; y += stride) {
        const dy = y - cy;
        const dyNorm = dy * dy * invRy2;
        if (dyNorm > 1) continue;
        for (let x = x0; x <= x1; x += stride) {
          const dx = x - cx;
          if (dx * dx * invRx2 + dyNorm > 1) continue;
          const idx = y * width + x;
          if (mask[idx] === 0) continue;
          const o = idx * 4;
          const [L, a, b] = rgbToLab([rgba[o], rgba[o + 1], rgba[o + 2]]);
          // Skip extreme clipped glare or occluded black pixels
          if (L < 12 || L > 97) continue;
          lVals.push(L);
          aVals.push(a);
          bVals.push(b);
        }
      }
    }
  };

  collectWithMask(skinMask);
  // Jawline shadow zones occasionally get partially excluded by strict HSV skin mask;
  // fall back to faceHullMask if fewer than 12 verified pixels are present.
  if (lVals.length < 12) {
    lVals.length = 0;
    aVals.length = 0;
    bVals.length = 0;
    collectWithMask(faceHullMask);
  }

  if (lVals.length === 0) return null;

  const sortedL = [...lVals].sort((x, y) => x - y);
  const sortedA = [...aVals].sort((x, y) => x - y);
  const sortedB = [...bVals].sort((x, y) => x - y);

  // Use 10% trimmed mean to resist isolated specular/hair outliers while capturing real variance
  const trim = Math.floor(sortedL.length * 0.1);
  const start = trim;
  const end = Math.max(start + 1, sortedL.length - trim);
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  const count = end - start;
  for (let i = start; i < end; i++) {
    sumL += sortedL[i];
    sumA += sortedA[i];
    sumB += sortedB[i];
  }

  return {
    L: sumL / count,
    a: sumA / count,
    b: sumB / count,
    p10L: percentile(sortedL, 0.1),
    p90L: percentile(sortedL, 0.9),
    sampleCount: lVals.length,
  };
}

function resolveZoneEllipses(
  spec: ZoneSpec,
  report: ConsultationReport,
  faceBox: FaceLandmarksBox
): Array<{ cx: number; cy: number; rx: number; ry: number }> {
  const { width, height, neuralLandmarks } = report;
  const faceW = Math.max(24, faceBox.faceWidth * width);
  const faceH = Math.max(24, faceBox.faceHeight * height);

  if (neuralLandmarks && neuralLandmarks.length >= 468) {
    // detectNeuralFaceLandmarks stores pixel coordinates [xPx, yPx, zPx];
    // defensively scale only if a synthetic caller supplied normalized [0..1] coords.
    const probe = neuralLandmarks[1] ?? neuralLandmarks[0];
    const isNormalized = probe !== undefined && Math.abs(probe[0]) <= 1.5 && Math.abs(probe[1]) <= 1.5;
    const toPxX = (v: number) => (isNormalized ? v * width : v);
    const toPxY = (v: number) => (isNormalized ? v * height : v);

    if (spec.id === "jaw_shadow") {
      // Sample both left and right jaw hollow shadows combined
      const leftIdx = [172, 136, 150];
      const rightIdx = [397, 365, 379];
      const ellipses: Array<{ cx: number; cy: number; rx: number; ry: number }> = [];
      for (const group of [leftIdx, rightIdx]) {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (const lmIdx of group) {
          const lm = neuralLandmarks[lmIdx];
          if (lm) {
            sx += toPxX(lm[0]);
            sy += toPxY(lm[1]);
            n++;
          }
        }
        if (n > 0) {
          const r = Math.max(6, faceW * spec.radiusScale);
          ellipses.push({ cx: sx / n, cy: sy / n, rx: r, ry: r });
        }
      }
      if (ellipses.length > 0) return ellipses;
    } else {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const lmIdx of spec.landmarkIndices) {
        const lm = neuralLandmarks[lmIdx];
        if (lm) {
          sx += toPxX(lm[0]);
          sy += toPxY(lm[1]);
          n++;
        }
      }
      if (n > 0) {
        const rx = Math.max(5, faceW * spec.radiusScale);
        const ry = Math.max(5, faceH * spec.radiusScale * 0.85);
        return [{ cx: sx / n, cy: sy / n, rx, ry }];
      }
    }
  }

  // Fallback box proportional anchor
  const cxBase = faceBox.centerX * width;
  const cyBase = faceBox.centerY * height;
  if (spec.id === "jaw_shadow") {
    return [
      {
        cx: cxBase - spec.fallbackRel.dx * faceW,
        cy: cyBase + spec.fallbackRel.dy * faceH,
        rx: Math.max(5, spec.fallbackRel.rx * faceW),
        ry: Math.max(5, spec.fallbackRel.ry * faceH),
      },
      {
        cx: cxBase + spec.fallbackRel.dx * faceW,
        cy: cyBase + spec.fallbackRel.dy * faceH,
        rx: Math.max(5, spec.fallbackRel.rx * faceW),
        ry: Math.max(5, spec.fallbackRel.ry * faceH),
      },
    ];
  }

  return [
    {
      cx: cxBase + spec.fallbackRel.dx * faceW,
      cy: cyBase + spec.fallbackRel.dy * faceH,
      rx: Math.max(5, spec.fallbackRel.rx * faceW),
      ry: Math.max(5, spec.fallbackRel.ry * faceH),
    },
  ];
}

function classifyPixelRegionVi(
  x: number,
  y: number,
  faceBox: FaceLandmarksBox,
  width: number,
  height: number
): string {
  const rx = (x / Math.max(1, width) - faceBox.centerX) / Math.max(0.05, faceBox.faceWidth);
  const ry = (y / Math.max(1, height) - faceBox.centerY) / Math.max(0.05, faceBox.faceHeight);
  if (ry < -0.18) return "Vùng trán";
  if (Math.abs(rx) < 0.14 && ry >= -0.18 && ry <= 0.15) return "Sống mũi";
  if (ry > 0.25) return Math.abs(rx) > 0.2 ? "Viền hàm" : "Vùng cằm";
  return rx < 0 ? "Vùng má trái" : "Vùng má phải";
}

function samplePixelCloud(
  report: ConsultationReport,
  faceBox: FaceLandmarksBox,
  ideal: IdealNeutralReference,
  maxPoints = 110
): SkinPixelLabSample[] {
  const { width, height, correctedRgba, skinMask } = report;
  const totalPixels = width * height;
  if (totalPixels === 0 || correctedRgba.length < totalPixels * 4 || skinMask.length < totalPixels) {
    return [];
  }

  // Count valid skin pixels first to pick an even deterministic sampling stride
  let validCount = 0;
  for (let i = 0; i < totalPixels; i++) {
    if (skinMask[i] !== 0) validCount++;
  }
  if (validCount === 0) return [];

  const step = Math.max(1, Math.floor(validCount / maxPoints));
  const samples: SkinPixelLabSample[] = [];
  let seen = 0;

  for (let i = 0; i < totalPixels && samples.length < maxPoints; i++) {
    if (skinMask[i] === 0) continue;
    if (seen % step === 0) {
      const o = i * 4;
      const r = correctedRgba[o];
      const g = correctedRgba[o + 1];
      const bVal = correctedRgba[o + 2];
      const [L, a, b] = rgbToLab([r, g, bVal]);
      if (L >= 15 && L <= 95) {
        const deltaL = L - ideal.L;
        const deltaA = a - ideal.a;
        const deltaB = b - ideal.b;
        const x = i % width;
        const y = Math.floor(i / width);
        samples.push({
          L: round1(L),
          a: round1(a),
          b: round1(b),
          deltaL: round1(deltaL),
          deltaA: round1(deltaA),
          deltaB: round1(deltaB),
          hex: rgbToHex([r, g, bVal]),
          role: classifyRole(deltaL),
          regionVi: classifyPixelRegionVi(x, y, faceBox, width, height),
        });
      }
    }
    seen++;
  }

  return samples;
}

/**
 * Extracts regional CIELAB (L*, a*, b*) skin tone variance across 8 facial planes plus a
 * stratified pixel cloud, comparing every region against the 'ideal' neutral reference.
 */
export function analyzeSkinLabVariance(
  report: ConsultationReport,
  faceBox: FaceLandmarksBox
): SkinLabVarianceAnalysis {
  const idealNeutral = computeIdealNeutralReference(
    report.skinMetrics.L_star,
    report.skinMetrics.a_star,
    report.skinMetrics.b_star
  );
  const userMeanLab = {
    L: round1(report.skinMetrics.L_star),
    a: round1(report.skinMetrics.a_star),
    b: round1(report.skinMetrics.b_star),
    hex: rgbToHex(
      labToRgb([report.skinMetrics.L_star, report.skinMetrics.a_star, report.skinMetrics.b_star])
    ),
  };

  const zones: FacialZoneLabPoint[] = [];

  for (const spec of FACIAL_ZONE_SPECS) {
    const ellipses = resolveZoneEllipses(spec, report, faceBox);
    const sampled = sampleCircularZone(
      report.correctedRgba,
      report.width,
      report.height,
      report.skinMask,
      report.faceHullMask,
      ellipses
    );
    if (!sampled) continue;

    const deltaL = sampled.L - idealNeutral.L;
    const deltaA = sampled.a - idealNeutral.a;
    const deltaB = sampled.b - idealNeutral.b;
    const deltaE = Math.sqrt(deltaL * deltaL + deltaA * deltaA + deltaB * deltaB);
    const role = classifyRole(deltaL);
    const hex = rgbToHex(labToRgb([sampled.L, sampled.a, sampled.b]));

    zones.push({
      id: spec.id,
      labelVi: spec.labelVi,
      shortLabelVi: spec.shortLabelVi,
      L: round1(sampled.L),
      a: round1(sampled.a),
      b: round1(sampled.b),
      p10L: round1(sampled.p10L),
      p90L: round1(sampled.p90L),
      deltaL: round1(deltaL),
      deltaA: round1(deltaA),
      deltaB: round1(deltaB),
      deltaE: round1(deltaE),
      hex,
      sampleCount: sampled.sampleCount,
      role,
      makeupNoteVi: describeZoneMakeupNote(spec.id, role, deltaL, deltaA, deltaB),
    });
  }

  const pixelCloud = samplePixelCloud(report, faceBox, idealNeutral, 110);

  if (zones.length === 0) {
    return {
      idealNeutral,
      userMeanLab,
      zones: [],
      pixelCloud,
      brightestZone: null,
      darkestZone: null,
      reddestZone: null,
      luminanceSpread: 0,
      meanDeltaE: 0,
      hasData: false,
    };
  }

  let brightestZone = zones[0];
  let darkestZone = zones[0];
  let reddestZone = zones[0];
  let deltaESum = 0;

  for (const z of zones) {
    if (z.L > brightestZone.L) brightestZone = z;
    if (z.L < darkestZone.L) darkestZone = z;
    if (z.a > reddestZone.a) reddestZone = z;
    deltaESum += z.deltaE;
  }

  return {
    idealNeutral,
    userMeanLab,
    zones,
    pixelCloud,
    brightestZone,
    darkestZone,
    reddestZone,
    luminanceSpread: round1(brightestZone.L - darkestZone.L),
    meanDeltaE: round1(deltaESum / zones.length),
    hasData: true,
  };
}
