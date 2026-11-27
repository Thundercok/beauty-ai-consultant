import { hexToLab, labToRgb, rgbToHex } from "./bradfordCat";
import { analyzeFacialSymmetry, type SideBias } from "./facialSymmetry";
import type { ConsultationReport, FaceLandmarksBox, SeasonClassification } from "./types";

export type HonestAuditZoneId =
  | "brows"
  | "contour_jaw"
  | "shine_oil"
  | "nose"
  | "eyes"
  | "thirds_lips";

export type HonestIssueSeverity = "fix_first" | "minor_tweak" | "balanced";

export interface Point2D {
  x: number;
  y: number;
}

export interface VisualCueLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: "reference" | "axis" | "measured";
  label?: string;
}

export interface VisualCueArrow {
  from: Point2D;
  to: Point2D;
  kind: "lift" | "trim" | "narrow";
  label?: string;
}

export interface VisualCueStroke {
  points: Point2D[];
  kind: "contour" | "highlight" | "brow_fill" | "eyeliner_lift" | "oil_zone";
  weight: "strong" | "normal" | "soft";
  closed?: boolean;
}

export interface HonestAuditIssue {
  id: HonestAuditZoneId;
  zoneLabelVi: string;
  severity: HonestIssueSeverity;
  severityTagVi: string;
  measuredDeltaVi: string;
  brutalCalloutVi: string;
  fixStepsVi: string[];
  /** Visual cues in raw image pixel coordinates (0..width, 0..height) */
  lines: VisualCueLine[];
  arrows: VisualCueArrow[];
  strokes: VisualCueStroke[];
  calloutAnchor: Point2D;
  shortPinLabel: string;
  /** Concise anchored red-marker diagnostic & short repair instruction rendered on the photo */
  stickerTitleVi: string;
  stickerFixVi: string;
  /** Which Real Makeup layer most directly fixes this zone */
  primaryMakeupLayer: "brow" | "contour" | "eyeshadow" | "blush" | "lip";
}

export interface PerimeterCalloutSlot {
  issue: HonestAuditIssue;
  markerIndex: number;
  side: "left" | "right";
  /** Normalized 0..1 coordinates within image space for clean leader-line & callout layout */
  anchorXNorm: number;
  anchorYNorm: number;
  stickerYNorm: number;
}

export interface FacialThirdsMetrics {
  upperPct: number;
  middlePct: number;
  lowerPct: number;
  dominantThird: "upper" | "middle" | "lower" | "balanced";
  summaryVi: string;
}

export interface PoseCalibrationMetrics {
  rollDeg: number;
  yawDeg: number;
  yawCompensated: boolean;
  ipdPx: number;
  mmPerPx: number;
  poseReliability: "high" | "moderate" | "angled";
  poseNoteVi: string;
}

export interface ContourShadingBalance {
  available: boolean;
  leftContourContrastL: number;
  rightContourContrastL: number;
  shadingAsymmetryDeltaL: number;
  heavierSide: SideBias;
}

export interface RealMakeupCorrectionPlan {
  browHex: string;
  browLiftSide: SideBias;
  browLiftPx: number;
  contourHex: string;
  highlightHex: string;
  widerJawSide: SideBias;
  lowerCheekSide: SideBias;
  noseContourStrength: number;
  eyeshadowHex: string;
  droopingEyeSide: SideBias;
}

export interface HonestLandmarkAuditReport {
  available: boolean;
  width: number;
  height: number;
  overallBalanceScore: number; // un-floored 35..97
  verdictTagVi: string;
  brutalHeadlineVi: string;
  brutalSummaryVi: string;
  headTiltDeg: number;
  pose: PoseCalibrationMetrics;
  contourShading: ContourShadingBalance;
  midlineAxis: { top: Point2D; bottom: Point2D };
  facialThirds: FacialThirdsMetrics;
  issues: HonestAuditIssue[];
  realMakeupPlan: RealMakeupCorrectionPlan;
  limitationNoteVi: string;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function sideVi(side: SideBias): string {
  if (side === "left") return "bên trái ảnh";
  if (side === "right") return "bên phải ảnh";
  return "hai bên";
}

function oppositeSide(side: SideBias): SideBias {
  if (side === "left") return "right";
  if (side === "right") return "left";
  return "balanced";
}

function pt(landmarks: Array<[number, number, number]>, idx: number): Point2D {
  const p = landmarks[idx];
  return { x: p[0], y: p[1] };
}

function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPt(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pointInPolygon(x: number, y: number, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-6) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Estimates a robust anatomical coordinate frame using:
 * 1) Inter-canthal ocular baseline (#33, #133, #362, #263) + sagittal midline PCA (#10, #168, #6, #197, #2, #0, #152)
 *    so a slightly deviated chin NEVER creates phantom brow or eye tilt.
 * 2) Inter-Pupillary Distance (IPD ≈ 61.5mm adult norm) for physical millimeter calibration.
 * 3) 3D Yaw estimation from both MediaPipe Z-depth (#234 vs #454) and 2D nose-to-cheek foreshortening.
 */
function buildAnatomicalPoseFrame(lms: Array<[number, number, number]>): {
  origin: Point2D;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  faceWidth: number;
  pose: PoseCalibrationMetrics;
  project: (p: Point2D) => { u: number; v: number };
} {
  const lOuter = pt(lms, 33);
  const lInner = pt(lms, 133);
  const rInner = pt(lms, 362);
  const rOuter = pt(lms, 263);

  // Eye centers (prefer MediaPipe iris landmarks #468 / #473 when they are distinct from placeholder origin)
  const lEyeMid = lerpPt(lOuter, lInner, 0.5);
  const rEyeMid = lerpPt(rOuter, rInner, 0.5);
  const hasRealIrises =
    lms.length >= 478 &&
    dist(pt(lms, 468), lEyeMid) < dist(lOuter, lInner) * 0.45 &&
    dist(pt(lms, 473), rEyeMid) < dist(rOuter, rInner) * 0.45 &&
    dist(pt(lms, 468), pt(lms, 473)) > dist(lInner, rInner);

  const lPupil = hasRealIrises ? pt(lms, 468) : lEyeMid;
  const rPupil = hasRealIrises ? pt(lms, 473) : rEyeMid;
  const ipdPx = Math.max(12, dist(lPupil, rPupil));
  // East/Southeast Asian young adult mean IPD is ~61.5mm (far tighter variance than bizygomatic width)
  const mmPerPx = clamp(61.5 / ipdPx, 0.08, 1.8);

  // Compute ocular horizontal vector (left pupil -> right pupil)
  const eyeDx = rPupil.x - lPupil.x;
  const eyeDy = rPupil.y - lPupil.y;
  const eyeLen = Math.hypot(eyeDx, eyeDy) || 1;
  const eyeVx = eyeDx / eyeLen;
  const eyeVy = eyeDy / eyeLen;

  // Compute sagittal midline vector via least-squares fit on upper/mid/lower sagittal landmarks
  const sagittalPts = [10, 168, 6, 197, 2, 152].map((idx) => pt(lms, idx));
  let mx = 0;
  let my = 0;
  for (const p of sagittalPts) {
    mx += p.x;
    my += p.y;
  }
  mx /= sagittalPts.length;
  my /= sagittalPts.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of sagittalPts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  // Principal eigenvector of 2x2 covariance pointing downward (uy > 0)
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let pcaUx = Math.cos(theta);
  let pcaUy = Math.sin(theta);
  // Pick the eigenvector aligned with top(#10) -> chin(#152)
  const topToChinX = lms[152][0] - lms[10][0];
  const topToChinY = lms[152][1] - lms[10][1];
  if (Math.abs(pcaUx * topToChinX + pcaUy * topToChinY) < Math.abs(-pcaUy * topToChinX + pcaUx * topToChinY)) {
    const tmp = pcaUx;
    pcaUx = -pcaUy;
    pcaUy = tmp;
  }
  if (pcaUx * topToChinX + pcaUy * topToChinY < 0) {
    pcaUx = -pcaUx;
    pcaUy = -pcaUy;
  }

  // Blend ocular perpendicular (60% — unaffected by chin deviation) with sagittal PCA (40%)
  const eyeUx = -eyeVy;
  const eyeUy = eyeVx;
  let ux = eyeUx * 0.6 + pcaUx * 0.4;
  let uy = eyeUy * 0.6 + pcaUy * 0.4;
  const uNorm = Math.hypot(ux, uy) || 1;
  ux /= uNorm;
  uy /= uNorm;
  const vx = uy;
  const vy = -ux;

  // Roll angle relative to image vertical downward (0, 1)
  const rollDeg = Number(((Math.atan2(ux, uy) * 180) / Math.PI).toFixed(1));

  // Anchor origin at glabella (#168) projected cleanly onto upper sagittal midline
  const origin = pt(lms, 168);
  const project = (p: Point2D): { u: number; v: number } => {
    const rx = p.x - origin.x;
    const ry = p.y - origin.y;
    return { u: rx * ux + ry * uy, v: rx * vx + ry * vy };
  };

  const faceWidth = Math.max(20, dist(pt(lms, 234), pt(lms, 454)));

  // 3D Yaw Estimation:
  // (a) 2D nasal-bridge-to-cheek foreshortening ratio: symmetric front face => dLeft ≈ dRight
  const noseBridgeV = project(pt(lms, 6)).v;
  const lCheekEdgeV = project(pt(lms, 234)).v;
  const rCheekEdgeV = project(pt(lms, 454)).v;
  const dLeft = Math.max(4, Math.abs(noseBridgeV - lCheekEdgeV));
  const dRight = Math.max(4, Math.abs(rCheekEdgeV - noseBridgeV));
  const foreshorteningRatio = (dRight - dLeft) / (dRight + dLeft); // + => right cheek wider (head turned left)
  const yaw2DDeg = Math.asin(clamp(foreshorteningRatio * 1.15, -0.82, 0.82)) * (180 / Math.PI);

  // (b) MediaPipe Z-depth difference across cheek edges (#454 vs #234) when Z is populated
  const zDelta = (lms[454][2] ?? 0) - (lms[234][2] ?? 0);
  const hasRealZ = Math.abs(zDelta) > 1e-4;
  const yaw3DDeg = hasRealZ
    ? Math.atan2(zDelta, Math.max(12, faceWidth * 0.85)) * (180 / Math.PI)
    : yaw2DDeg;

  // Conservative blend so true jaw asymmetry is never erased as fake yaw, while genuine 3/4 turns ARE detected
  const rawYawDeg = hasRealZ ? yaw2DDeg * 0.55 + yaw3DDeg * 0.45 : yaw2DDeg * 0.7;
  const yawDeg = Number(clamp(rawYawDeg, -35, 35).toFixed(1));
  const absYaw = Math.abs(yawDeg);
  const absRoll = Math.abs(rollDeg);

  const poseReliability: PoseCalibrationMetrics["poseReliability"] =
    absYaw <= 5.5 && absRoll <= 6
      ? "high"
      : absYaw <= 11 && absRoll <= 12
        ? "moderate"
        : "angled";

  const poseNoteVi =
    poseReliability === "high"
      ? `Góc chụp chính diện chuẩn (nghiêng ${absRoll.toFixed(1)}° · xoay ${absYaw.toFixed(1)}°)`
      : poseReliability === "moderate"
        ? `Đầu hơi xoay ${absYaw.toFixed(1)}° — đã tự bù phối cảnh khi đo lệch hàm`
        : `Ảnh xoay góc ${absYaw.toFixed(1)}° — đo chiều dọc mày/mắt chuẩn nhưng độ rộng hàm chịu ảnh hưởng góc máy`;

  return {
    origin,
    ux,
    uy,
    vx,
    vy,
    faceWidth,
    pose: {
      rollDeg,
      yawDeg,
      yawCompensated: absYaw >= 3.5,
      ipdPx: Number(ipdPx.toFixed(1)),
      mmPerPx: Number(mmPerPx.toFixed(3)),
      poseReliability,
      poseNoteVi,
    },
    project,
  };
}

interface DetectedOilZone {
  id: "forehead" | "nose" | "inner_cheeks" | "chin";
  labelVi: string;
  polygon: Point2D[];
  centroid: Point2D;
  specularPct: number;
  meanLumaDelta: number;
}

/**
 * Measures real specular / sebum oiliness directly on the portrait pixels inside skinMask.
 */
function detectOilyShineZones(
  rgba: Uint8ClampedArray,
  skinMask: Uint8Array,
  width: number,
  height: number,
  lms: Array<[number, number, number]>
): {
  zones: DetectedOilZone[];
  overallShinePct: number;
  shiniestZone: DetectedOilZone | null;
} {
  if (rgba.length < width * height * 4 || skinMask.length < width * height) {
    return { zones: [], overallShinePct: 0, shiniestZone: null };
  }

  const lumas: number[] = [];
  const sats: number[] = [];
  for (let y = 0; y < height; y += 2) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 2) {
      const pIdx = rowOffset + x;
      if (skinMask[pIdx] === 0) continue;
      const off = pIdx * 4;
      const r = rgba[off];
      const g = rgba[off + 1];
      const b = rgba[off + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 1 ? (maxC - minC) / maxC : 0;
      lumas.push(luma);
      sats.push(sat);
    }
  }

  if (lumas.length < 40) {
    return { zones: [], overallShinePct: 0, shiniestZone: null };
  }

  lumas.sort((a, b) => a - b);
  sats.sort((a, b) => a - b);
  const medianLuma = lumas[Math.floor(lumas.length * 0.5)];
  const p75Luma = lumas[Math.floor(lumas.length * 0.75)];
  const p25Luma = lumas[Math.floor(lumas.length * 0.25)];
  const robustStd = Math.max(9, (p75Luma - p25Luma) * 0.7413);
  const medianSat = sats[Math.floor(sats.length * 0.5)];

  const specLumaThresh = Math.min(235, medianLuma + Math.max(14, robustStd * 1.05));
  const softHotLumaThresh = Math.min(242, medianLuma + Math.max(24, robustStd * 1.65));
  const specSatCeiling = Math.max(0.18, medianSat * 0.98);

  const zoneDefs: Array<{
    id: DetectedOilZone["id"];
    labelVi: string;
    indices: number[];
  }> = [
    {
      id: "forehead",
      labelVi: "Trán giữa",
      indices: [109, 10, 338, 297, 337, 151, 108, 67],
    },
    {
      id: "nose",
      labelVi: "Sống & cánh mũi",
      indices: [193, 168, 417, 351, 419, 358, 327, 2, 98, 129, 196, 122],
    },
    {
      id: "inner_cheeks",
      labelVi: "Cạnh mũi & má trong",
      indices: [118, 119, 120, 47, 142, 203, 50],
    },
    {
      id: "chin",
      labelVi: "Vùng cằm",
      indices: [18, 313, 406, 396, 152, 175, 199, 200, 83],
    },
  ];

  const detected: DetectedOilZone[] = [];

  for (const def of zoneDefs) {
    const poly = def.indices.map((idx) => pt(lms, idx));
    let minX = width - 1;
    let maxX = 0;
    let minY = height - 1;
    let maxY = 0;
    for (const p of poly) {
      if (p.x < minX) minX = Math.max(0, Math.floor(p.x));
      if (p.x > maxX) maxX = Math.min(width - 1, Math.ceil(p.x));
      if (p.y < minY) minY = Math.max(0, Math.floor(p.y));
      if (p.y > maxY) maxY = Math.min(height - 1, Math.ceil(p.y));
    }

    let totalSkin = 0;
    let shinyPixels = 0;
    let sumLuma = 0;
    let hotX = 0;
    let hotY = 0;
    let polyCx = 0;
    let polyCy = 0;
    for (const p of poly) {
      polyCx += p.x;
      polyCy += p.y;
    }
    polyCx /= poly.length;
    polyCy /= poly.length;

    for (let y = minY; y <= maxY; y += 2) {
      const rowOffset = y * width;
      for (let x = minX; x <= maxX; x += 2) {
        if (!pointInPolygon(x, y, poly)) continue;
        const pIdx = rowOffset + x;
        if (skinMask[pIdx] === 0) continue;
        const off = pIdx * 4;
        const r = rgba[off];
        const g = rgba[off + 1];
        const b = rgba[off + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC > 1 ? (maxC - minC) / maxC : 0;

        totalSkin += 1;
        sumLuma += luma;

        const isSpecular =
          (luma >= specLumaThresh && sat <= specSatCeiling) || luma >= softHotLumaThresh;
        if (isSpecular) {
          shinyPixels += 1;
          hotX += x;
          hotY += y;
        }
      }
    }

    if (totalSkin < 10) continue;
    const specularPct = (shinyPixels / totalSkin) * 100;
    const meanLumaDelta = sumLuma / totalSkin - medianLuma;
    const centroid: Point2D =
      shinyPixels > 0
        ? { x: hotX / shinyPixels, y: hotY / shinyPixels }
        : { x: polyCx, y: polyCy };

    detected.push({
      id: def.id,
      labelVi: def.labelVi,
      polygon: poly,
      centroid,
      specularPct,
      meanLumaDelta,
    });
  }

  detected.sort((a, b) => b.specularPct - a.specularPct);
  const shiniestZone = detected[0] ?? null;
  const overallShinePct = shiniestZone
    ? Number(
        Math.min(
          100,
          shiniestZone.specularPct * 0.72 + (detected[1]?.specularPct ?? 0) * 0.28
        ).toFixed(1)
      )
    : 0;

  return { zones: detected, overallShinePct, shiniestZone };
}

/**
 * Measures real pixel-level cheekbone-to-hollow contour contrast on the left vs right side
 * inside skinMask, removing ambient left-to-right side-lighting bias by comparing local
 * vertical contrast (upper cheekbone L* minus lower cheek hollow L*) on each side!
 * Because directional side light brightens BOTH the cheekbone and hollow on the lit side together,
 * the local vertical step (cheekboneL - hollowL) isolates actual lopsided contour placement/depth.
 */
function detectContourShadingAsymmetry(
  rgba: Uint8ClampedArray,
  skinMask: Uint8Array,
  width: number,
  height: number,
  lms: Array<[number, number, number]>,
  faceWidth: number
): ContourShadingBalance {
  const empty: ContourShadingBalance = {
    available: false,
    leftContourContrastL: 0,
    rightContourContrastL: 0,
    shadingAsymmetryDeltaL: 0,
    heavierSide: "balanced",
  };
  if (rgba.length < width * height * 4 || skinMask.length < width * height) {
    return empty;
  }

  const sampleDiskMeanL = (center: Point2D, radius: number): { meanL: number; count: number } => {
    const rInt = Math.max(3, Math.round(radius));
    const minX = Math.max(0, Math.floor(center.x - rInt));
    const maxX = Math.min(width - 1, Math.ceil(center.x + rInt));
    const minY = Math.max(0, Math.floor(center.y - rInt));
    const maxY = Math.min(height - 1, Math.ceil(center.y + rInt));
    const r2 = rInt * rInt;
    let sumL = 0;
    let count = 0;

    for (let y = minY; y <= maxY; y++) {
      const dy = y - center.y;
      const rowOffset = y * width;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - center.x;
        if (dx * dx + dy * dy > r2) continue;
        const pIdx = rowOffset + x;
        if (skinMask[pIdx] === 0) continue;
        const off = pIdx * 4;
        // Perceptual lightness proxy scaled 0..100 (matches CIE L* scale cleanly)
        const luma = (0.299 * rgba[off] + 0.587 * rgba[off + 1] + 0.114 * rgba[off + 2]) / 2.55;
        sumL += luma;
        count += 1;
      }
    }
    return { meanL: count > 0 ? sumL / count : 0, count };
  };

  const radius = Math.max(5, faceWidth * 0.065);
  // Upper cheekbone highlight centers (#116/#50 left, #345/#280 right)
  const lCheekHigh = lerpPt(pt(lms, 116), pt(lms, 50), 0.5);
  const rCheekHigh = lerpPt(pt(lms, 345), pt(lms, 280), 0.5);
  // Sub-zygomatic contour hollow centers (#132/#172/#50 left, #361/#397/#280 right)
  const lHollow = lerpPt(lerpPt(pt(lms, 132), pt(lms, 172), 0.5), pt(lms, 50), 0.35);
  const rHollow = lerpPt(lerpPt(pt(lms, 361), pt(lms, 397), 0.5), pt(lms, 280), 0.35);

  const lHighSample = sampleDiskMeanL(lCheekHigh, radius);
  const rHighSample = sampleDiskMeanL(rCheekHigh, radius);
  const lHollowSample = sampleDiskMeanL(lHollow, radius);
  const rHollowSample = sampleDiskMeanL(rHollow, radius);

  if (
    lHighSample.count < 8 ||
    rHighSample.count < 8 ||
    lHollowSample.count < 8 ||
    rHollowSample.count < 8
  ) {
    return empty;
  }

  // Positive contrast means hollow is darker than cheekbone (contour shadow depth)
  const leftContourContrastL = Number((lHighSample.meanL - lHollowSample.meanL).toFixed(1));
  const rightContourContrastL = Number((rHighSample.meanL - rHollowSample.meanL).toFixed(1));
  const diff = leftContourContrastL - rightContourContrastL;
  const absDiff = Number(Math.abs(diff).toFixed(1));

  // Ignore strong directional side lighting where one whole cheekbone is >18 L* brighter than the other
  const crossFaceLightGap = Math.abs(lHighSample.meanL - rHighSample.meanL);
  if (crossFaceLightGap > 18) {
    return {
      available: false,
      leftContourContrastL,
      rightContourContrastL,
      shadingAsymmetryDeltaL: 0,
      heavierSide: "balanced",
    };
  }

  const heavierSide: SideBias = absDiff < 5.5 ? "balanced" : diff > 0 ? "left" : "right";
  return {
    available: true,
    leftContourContrastL,
    rightContourContrastL,
    shadingAsymmetryDeltaL: absDiff,
    heavierSide,
  };
}

/**
 * Calibrates contour, highlight, and brow shades directly from the user's real skin CIELAB
 * and undertone so virtual corrective makeup never turns orange on cool skin or chalky gray on tan skin.
 */
function buildCalibratedMakeupShades(
  skinL: number,
  skinA: number,
  skinB: number,
  undertone: SeasonClassification["undertone"]
): {
  contourHex: string;
  highlightHex: string;
  browHex: string;
  eyeshadowHex: string;
} {
  const isCool = undertone === "Cool (Pink/Blue)";
  const isWarm = undertone === "Warm (Golden)";

  const contourL = clamp(skinL - 21, 22, 52);
  const contourA = isCool ? clamp(skinA * 0.45, 2, 7) : clamp(skinA * 0.6, 3, 9);
  const contourB = isCool
    ? clamp(skinB * 0.38, 3, 9)
    : isWarm
      ? clamp(skinB * 0.62, 6, 15)
      : clamp(skinB * 0.48, 4, 12);

  const highlightL = clamp(skinL + 13, 66, 94);
  const highlightA = clamp(skinA * 0.35, 0, 5);
  const highlightB = isCool ? clamp(skinB * 0.35, 2, 8) : clamp(skinB * 0.55, 5, 13);

  const browHex = isWarm ? "#4F3E34" : isCool ? "#3F3A3D" : "#463D39";
  const eyeshadowHex = isWarm ? "#A67661" : isCool ? "#9A747D" : "#9E766E";

  return {
    contourHex: rgbToHex(labToRgb([contourL, contourA, contourB])),
    highlightHex: rgbToHex(labToRgb([highlightL, highlightA, highlightB])),
    browHex,
    eyeshadowHex,
  };
}

function severityFromDelta(deltaPct: number, fixThreshold: number, minorThreshold: number): HonestIssueSeverity {
  if (deltaPct >= fixThreshold) return "fix_first";
  if (deltaPct >= minorThreshold) return "minor_tweak";
  return "balanced";
}

function severityTag(sev: HonestIssueSeverity): string {
  if (sev === "fix_first") return "Lệch rõ";
  if (sev === "minor_tweak") return "Lệch nhẹ";
  return "Cân bằng";
}

/**
 * Performs a brutally honest, roll- and yaw-compensated geometric + optical audit from
 * MediaPipe 478 landmarks and skin pixels, returning calibrated millimeter discrepancies,
 * red surgical overlay geometry, and actionable corrective advice.
 */
export function buildHonestLandmarkAudit(
  report: ConsultationReport,
  box: FaceLandmarksBox
): HonestLandmarkAuditReport {
  const { width, height, neuralLandmarks } = report;
  const skinL = report.skinMetrics.L_star;
  const skinA = report.skinMetrics.a_star;
  const skinB = report.skinMetrics.b_star;
  const undertone = report.season.undertone;

  const shades = buildCalibratedMakeupShades(skinL, skinA, skinB, undertone);
  const symmetry = analyzeFacialSymmetry(neuralLandmarks);

  if (!neuralLandmarks || neuralLandmarks.length < 468 || !symmetry.available) {
    const cx = box.centerX * width;
    const topY = Math.max(8, (box.centerY - box.faceHeight * 0.5) * height);
    const botY = Math.min(height - 8, (box.centerY + box.faceHeight * 0.5) * height);
    return {
      available: false,
      width,
      height,
      overallBalanceScore: 0,
      verdictTagVi: "Thiếu dữ liệu điểm mặt",
      brutalHeadlineVi: "Ảnh này chưa nhận đủ 478 điểm mặt để đo lệch chính xác",
      brutalSummaryVi:
        "Ảnh quá nghiêng, tóc che trán/hàm hoặc thiếu sáng khiến hệ thống không thể đo từng milimet chân mày và quai hàm. Hãy chụp chính diện rõ mặt hoặc chọn một trong 3 mẫu ảnh thật.",
      headTiltDeg: 0,
      pose: {
        rollDeg: 0,
        yawDeg: 0,
        yawCompensated: false,
        ipdPx: 0,
        mmPerPx: 0,
        poseReliability: "angled",
        poseNoteVi: "Chưa nhận diện đủ 478 điểm chuẩn.",
      },
      contourShading: {
        available: false,
        leftContourContrastL: 0,
        rightContourContrastL: 0,
        shadingAsymmetryDeltaL: 0,
        heavierSide: "balanced",
      },
      midlineAxis: { top: { x: cx, y: topY }, bottom: { x: cx, y: botY } },
      facialThirds: {
        upperPct: 33,
        middlePct: 34,
        lowerPct: 33,
        dominantThird: "balanced",
        summaryVi: "Chưa đủ điểm chuẩn để đo tỷ lệ 3 tầng mặt.",
      },
      issues: [],
      realMakeupPlan: {
        ...shades,
        browLiftSide: "balanced",
        browLiftPx: 0,
        widerJawSide: "balanced",
        lowerCheekSide: "balanced",
        noseContourStrength: 0.22,
        droopingEyeSide: "balanced",
      },
      limitationNoteVi:
        "Cần nhận diện đủ lưới 478 điểm MediaPipe (chụp thẳng mặt, không đeo kính che mày) để đo lệch chính xác.",
    };
  }

  const lms = neuralLandmarks;
  const frame = buildAnatomicalPoseFrame(lms);
  const { ux, uy, vx, vy, faceWidth, pose, project } = frame;

  const pxToMm = (px: number) => Number(Math.max(0.4, px * pose.mmPerPx).toFixed(1));
  const pctToMm = (pct: number) => pxToMm((pct / 100) * faceWidth);

  const topPt = pt(lms, 10);
  const glabellaPt = pt(lms, 168);
  const noseBasePt = pt(lms, 2);
  const noseTipPt = pt(lms, 1);
  const chinPt = pt(lms, 152);

  const midlineAxis = {
    top: { x: topPt.x - ux * faceWidth * 0.14, y: topPt.y - uy * faceWidth * 0.14 },
    bottom: { x: chinPt.x + ux * faceWidth * 0.1, y: chinPt.y + uy * faceWidth * 0.1 },
  };

  const shiftUp = (p: Point2D, px: number): Point2D => ({
    x: p.x - ux * px,
    y: p.y - uy * px,
  });
  const shiftRight = (p: Point2D, px: number): Point2D => ({
    x: p.x + vx * px,
    y: p.y + vy * px,
  });

  // ---------------------------------------------------------------------------
  // 1. BROWS (Multi-point Brow Height + Brow-to-Lid Space Asymmetry)
  // ---------------------------------------------------------------------------
  const lBrowPts = [70, 63, 105, 66, 107].map((i) => pt(lms, i));
  const rBrowPts = [336, 296, 334, 293, 300].map((i) => pt(lms, i));
  const lBrowPeak = pt(lms, 105);
  const rBrowPeak = pt(lms, 334);
  const lBrowHead = pt(lms, 107);
  const rBrowHead = pt(lms, 336);
  const lBrowTail = pt(lms, 70);
  const rBrowTail = pt(lms, 300);

  // Measure vertical offset in our ocular-anchored anatomical frame (smaller u = higher up on face)
  const peakDiffPx = project(lBrowPeak).u - project(rBrowPeak).u; // >0 => left brow lower, <0 => right brow lower
  const headDiffPx = project(lBrowHead).u - project(rBrowHead).u;
  const tailDiffPx = project(lBrowTail).u - project(rBrowTail).u;
  const weightedBrowDiffPx = peakDiffPx * 0.5 + tailDiffPx * 0.3 + headDiffPx * 0.2;

  // Also measure brow-to-upper-lid clearance (palpebral space: #159 left lid vs #386 right lid)
  const lBrowLidSpace = project(pt(lms, 159)).u - project(lBrowPeak).u;
  const rBrowLidSpace = project(pt(lms, 386)).u - project(rBrowPeak).u;
  const lidSpaceDiffPx = rBrowLidSpace - lBrowLidSpace; // >0 => left brow sits closer to eye (lower)

  const combinedBrowDiffPx = weightedBrowDiffPx * 0.7 + lidSpaceDiffPx * 0.3;
  const browVertPct = Number(((Math.abs(combinedBrowDiffPx) / faceWidth) * 100).toFixed(1));
  const browMm = pxToMm(Math.abs(combinedBrowDiffPx));
  const browSeverity = severityFromDelta(browVertPct, 1.8, 0.9);

  const lowerBrowSide: SideBias =
    browVertPct < 0.85 ? "balanced" : combinedBrowDiffPx > 0 ? "left" : "right";
  const higherBrowSide: SideBias = oppositeSide(lowerBrowSide);

  // Detect whether mismatch is strongest at arch peak vs tail
  const worstBrowPartVi =
    Math.abs(tailDiffPx) > Math.abs(peakDiffPx) * 1.25
      ? "đuôi mày"
      : Math.abs(headDiffPx) > Math.abs(peakDiffPx) * 1.25
        ? "đầu mày"
        : "đỉnh mày";

  const browLines: VisualCueLine[] = [];
  const browArrows: VisualCueArrow[] = [];
  const browStrokes: VisualCueStroke[] = [];

  const refBrowPeak = higherBrowSide === "right" ? rBrowPeak : lBrowPeak;
  const refBrowU = project(refBrowPeak).u;
  const midlineAtBrow: Point2D = {
    x: glabellaPt.x + ux * refBrowU,
    y: glabellaPt.y + uy * refBrowU,
  };
  browLines.push({
    x1: shiftRight(midlineAtBrow, -faceWidth * 0.42).x,
    y1: shiftRight(midlineAtBrow, -faceWidth * 0.42).y,
    x2: shiftRight(midlineAtBrow, faceWidth * 0.42).x,
    y2: shiftRight(midlineAtBrow, faceWidth * 0.42).y,
    kind: "reference",
    label: "Đường ngang chuẩn mày",
  });

  const browLiftPx =
    lowerBrowSide === "balanced"
      ? 0
      : clamp(Math.abs(combinedBrowDiffPx) * 0.85, 1.4, Math.max(4.5, faceWidth * 0.036));

  if (lowerBrowSide !== "balanced" && browSeverity !== "balanced") {
    const targetPeak = lowerBrowSide === "left" ? lBrowPeak : rBrowPeak;
    const targetBrowPts = lowerBrowSide === "left" ? lBrowPts : rBrowPts;
    const liftArrowLen = Math.max(11, faceWidth * 0.1);
    browArrows.push({
      from: shiftUp(targetPeak, 2),
      to: shiftUp(targetPeak, liftArrowLen),
      kind: "lift",
      label: `Nâng +${browMm}mm`,
    });
    browStrokes.push({
      points: targetBrowPts.map((p) => shiftUp(p, Math.max(2.2, browLiftPx * 1.1))),
      kind: "brow_fill",
      weight: browSeverity === "fix_first" ? "strong" : "normal",
    });
  } else {
    browStrokes.push(
      { points: lBrowPts, kind: "brow_fill", weight: "soft" },
      { points: rBrowPts, kind: "brow_fill", weight: "soft" }
    );
  }

  const liftTargetMm = Number(Math.min(3.0, Math.max(1.0, browMm)).toFixed(1));
  const browIssue: HonestAuditIssue = {
    id: "brows",
    zoneLabelVi: "Độ cao chân mày",
    severity: browSeverity,
    severityTagVi: severityTag(browSeverity),
    measuredDeltaVi:
      lowerBrowSide !== "balanced" && browVertPct >= 0.85
        ? `${worstBrowPartVi[0].toUpperCase()}${worstBrowPartVi.slice(1)} ${sideVi(lowerBrowSide)} thấp hơn ${browMm}mm (${browVertPct.toFixed(1)}%)`
        : `Độ chênh độ cao rất nhỏ (${browMm}mm · ${browVertPct.toFixed(1)}%)`,
    brutalCalloutVi:
      browSeverity === "fix_first"
        ? `Nói thẳng: ${worstBrowPartVi} ${sideVi(lowerBrowSide)} đang thấp hơn rõ ${browMm}mm. Nếu bạn kẻ theo đúng khuôn lông mày mọc sẵn ở cả 2 bên, ảnh chụp chính diện sẽ tố ngay khung mắt bị lệch tầng.`
        : browSeverity === "minor_tweak"
          ? `${worstBrowPartVi[0].toUpperCase()}${worstBrowPartVi.slice(1)} ${sideVi(lowerBrowSide)} trễ nhẹ ${browMm}mm so với bên đối diện. Chỉ cần nâng nhẹ mép trên khi gẩy sợi là gương mặt tỉnh và cân ngay.`
          : "Hai đỉnh và khoảng cách mày–mí đo được rất ngang nhau. Đừng cố cạo hay vẽ nâng quá tay kẻo tự tạo lệch.",
    fixStepsVi:
      lowerBrowSide !== "balanced" && browSeverity !== "balanced"
        ? [
            `Mày ${sideVi(lowerBrowSide)} (bên thấp): gẩy sợi mảnh ở mép TRÊN phần ${worstBrowPartVi} cao thêm ~${liftTargetMm}mm, tuyệt đối không tô dày thêm viền dưới.`,
            `Mày ${sideVi(higherBrowSide)} (bên cao): dùng che khuyết điểm dẹt gọt gọn nhẹ viền trên và chỉ tán bám sát viền dưới để đưa 2 đỉnh về cùng trục ngang.`,
          ]
        : [
            "Chỉ chải gel trong dựng nhẹ đầu mày và dặm thưa phần đuôi bị trống bằng chì nâu xám mềm, giữ nguyên khung thật.",
          ],
    lines: browLines,
    arrows: browArrows,
    strokes: browStrokes,
    calloutAnchor: lowerBrowSide === "right" ? rBrowPeak : lBrowPeak,
    shortPinLabel: browSeverity === "balanced" ? "Mày cân" : `Mày lệch ${browMm}mm`,
    stickerTitleVi:
      browSeverity === "balanced"
        ? "Chân mày cân bằng"
        : `Mày ${lowerBrowSide === "left" ? "trái" : "phải"} thấp ${browMm}mm`,
    stickerFixVi:
      browSeverity === "balanced"
        ? "Chải gel giữ nguyên dáng tự nhiên"
        : `Gẩy nâng mép trên +${liftTargetMm}mm`,
    primaryMakeupLayer: "brow",
  };

  // ---------------------------------------------------------------------------
  // 2. JAWLINE, CHEEKBONE & LOPSIDED CONTOURING (Yaw-Compensated Geometry + Pixel Shading Audit)
  // ---------------------------------------------------------------------------
  // Compensate horizontal jaw/cheek distances for mild 3D yaw foreshortening (up to 12°)
  const yawRad = (clamp(pose.yawDeg, -14, 14) * Math.PI) / 180;
  // Perspective foreshortening shift along v axis at jaw/cheek plane
  const yawBiasFraction = Math.sin(yawRad) * 0.42;

  const jawPairs: Array<[number, number]> = [
    [172, 397],
    [136, 365],
    [149, 378],
  ];
  const cheekPairs: Array<[number, number]> = [
    [234, 454],
    [116, 345],
    [132, 361],
  ];

  const computeYawAdjustedHorizDiff = (pairs: Array<[number, number]>) => {
    let signedSum = 0;
    for (const [lIdx, rIdx] of pairs) {
      const distL = Math.abs(project(pt(lms, lIdx)).v);
      const distR = Math.abs(project(pt(lms, rIdx)).v);
      // Adjust symmetrically for mild camera yaw so turned heads don't trigger fake jaw asymmetry
      const adjL = distL / Math.max(0.75, 1 - yawBiasFraction);
      const adjR = distR / Math.max(0.75, 1 + yawBiasFraction);
      signedSum += (adjR - adjL) / faceWidth;
    }
    const meanSigned = signedSum / pairs.length;
    return {
      signedPct: meanSigned * 100,
      absPct: Number((Math.abs(meanSigned) * 100).toFixed(1)),
    };
  };

  const jawMeas = computeYawAdjustedHorizDiff(jawPairs);
  const cheekMeas = computeYawAdjustedHorizDiff(cheekPairs);
  const geomWidthDiffPct = Math.max(jawMeas.absPct, cheekMeas.absPct);
  const dominantGeomSigned = Math.abs(jawMeas.signedPct) >= Math.abs(cheekMeas.signedPct)
    ? jawMeas.signedPct
    : cheekMeas.signedPct;

  const widerJawSide: SideBias =
    geomWidthDiffPct < 1.25 ? "balanced" : dominantGeomSigned < 0 ? "left" : "right";
  const narrowerSide: SideBias = oppositeSide(widerJawSide);

  const cheekZone = symmetry.zones.find((z) => z.id === "cheeks")!;
  const lowerCheekSide: SideBias =
    cheekZone.higherSide === "balanced" ? "balanced" : oppositeSide(cheekZone.higherSide);

  // Also check real pixel-level lopsided cheek-hollow contour shading!
  const contourShading = detectContourShadingAsymmetry(
    report.originalRgba,
    report.skinMask,
    width,
    height,
    lms,
    faceWidth
  );
  const hasLopsidedContourShading =
    contourShading.available && contourShading.heavierSide !== "balanced" && contourShading.shadingAsymmetryDeltaL >= 6.0;

  const geomSeverity = severityFromDelta(geomWidthDiffPct, 2.4, 1.3);
  const shadingSeverity: HonestIssueSeverity =
    hasLopsidedContourShading && contourShading.shadingAsymmetryDeltaL >= 9.5
      ? "fix_first"
      : hasLopsidedContourShading
        ? "minor_tweak"
        : "balanced";

  const sevOrderRank: Record<HonestIssueSeverity, number> = {
    fix_first: 0,
    minor_tweak: 1,
    balanced: 2,
  };
  const contourSeverity: HonestIssueSeverity =
    sevOrderRank[geomSeverity] <= sevOrderRank[shadingSeverity] ? geomSeverity : shadingSeverity;

  const isShadingPrimary =
    hasLopsidedContourShading && sevOrderRank[shadingSeverity] < sevOrderRank[geomSeverity];

  const lJawContour = [234, 132, 172, 136, 149].map((i) => pt(lms, i));
  const rJawContour = [454, 361, 397, 365, 378].map((i) => pt(lms, i));
  const lCheekHighlight = [116, 123, 50].map((i) => pt(lms, i));
  const rCheekHighlight = [345, 352, 280].map((i) => pt(lms, i));

  const contourLines: VisualCueLine[] = [
    {
      x1: midlineAxis.top.x,
      y1: midlineAxis.top.y,
      x2: midlineAxis.bottom.x,
      y2: midlineAxis.bottom.y,
      kind: "axis",
      label: "Trục giữa mặt",
    },
  ];
  const contourArrows: VisualCueArrow[] = [];
  const contourStrokes: VisualCueStroke[] = [];

  const targetContourSide: SideBias = isShadingPrimary
    ? oppositeSide(contourShading.heavierSide)
    : widerJawSide;

  if (targetContourSide === "left") {
    contourStrokes.push(
      { points: lJawContour, kind: "contour", weight: "strong" },
      { points: rJawContour, kind: "contour", weight: "soft" },
      { points: rCheekHighlight, kind: "highlight", weight: "normal" }
    );
    const lJawMid = pt(lms, 172);
    contourArrows.push({
      from: shiftRight(lJawMid, -faceWidth * 0.065),
      to: shiftRight(lJawMid, faceWidth * 0.08),
      kind: "narrow",
      label: "Thu gọn hàm trái",
    });
  } else if (targetContourSide === "right") {
    contourStrokes.push(
      { points: rJawContour, kind: "contour", weight: "strong" },
      { points: lJawContour, kind: "contour", weight: "soft" },
      { points: lCheekHighlight, kind: "highlight", weight: "normal" }
    );
    const rJawMid = pt(lms, 397);
    contourArrows.push({
      from: shiftRight(rJawMid, faceWidth * 0.065),
      to: shiftRight(rJawMid, -faceWidth * 0.08),
      kind: "narrow",
      label: "Thu gọn hàm phải",
    });
  } else {
    contourStrokes.push(
      { points: lJawContour, kind: "contour", weight: "normal" },
      { points: rJawContour, kind: "contour", weight: "normal" },
      { points: lCheekHighlight, kind: "highlight", weight: "soft" },
      { points: rCheekHighlight, kind: "highlight", weight: "soft" }
    );
  }

  const jawToneAdvice =
    undertone === "Warm (Golden)"
      ? "nâu khói pha ấm nhẹ (tránh cam đất quá rực)"
      : "nâu xám lạnh (cool taupe, tuyệt đối tránh bronzer ánh cam)";

  const jawMm = pctToMm(geomWidthDiffPct);
  const contourIssue: HonestAuditIssue = {
    id: "contour_jaw",
    zoneLabelVi: "Khối hàm & Tạo khối gò má",
    severity: contourSeverity,
    severityTagVi: severityTag(contourSeverity),
    measuredDeltaVi: isShadingPrimary
      ? `Bóng hõm má ${sideVi(contourShading.heavierSide)} đậm hơn ΔL* ${contourShading.shadingAsymmetryDeltaL.toFixed(1)}`
      : widerJawSide !== "balanced"
        ? `Hàm/má ${sideVi(widerJawSide)} rộng hơn ${geomWidthDiffPct.toFixed(1)}% (~${jawMm}mm)${pose.yawCompensated ? " · đã bù xoay đầu" : ""}`
        : `Độ rộng hai bên hàm chênh rất ít (${geomWidthDiffPct.toFixed(1)}%)`,
    brutalCalloutVi: isShadingPrimary
      ? `Nói thẳng: độ đổ bóng tạo khối vùng hõm má đang lệch tay — ${sideVi(contourShading.heavierSide)} đậm hơn rõ (ΔL* ${contourShading.shadingAsymmetryDeltaL.toFixed(1)}). Hai bên tán không đều sẽ làm gò má trông cao thấp mất cân đối.`
      : contourSeverity === "fix_first"
        ? `Nói thật: nửa hàm ${sideVi(widerJawSide)} đầy và bè hơn bên kia ${geomWidthDiffPct.toFixed(1)}% (~${jawMm}mm). Nếu bạn đánh khối 2 bên đậm bằng nhau, mặt sẽ bị hóp bên nhỏ trong khi bên to vẫn lộ rõ.`
        : contourSeverity === "minor_tweak"
          ? `Góc hàm ${sideVi(widerJawSide)} nhỉnh hơn nhẹ (${geomWidthDiffPct.toFixed(1)}%) — dấu hiệu quen thuộc khi nhai lệch bên. Chỉ cần tăng lực tán khối đúng bên này là giấu gọn ngay.`
          : "Hai bên hàm và độ đổ bóng gò má khá đều — không nên quệt khối quá đậm dọc hõm má kẻo làm mặt già và bết xám.",
    fixStepsVi: isShadingPrimary
      ? [
          `Bên ${sideVi(contourShading.heavierSide)} (đang đậm hơn): dùng bông mút sạch dặm nhẹ 1 lớp phấn phủ mờ lên rìa khối để làm dịu ranh giới tối.`,
          `Bên ${sideVi(oppositeSide(contourShading.heavierSide))} (đang nhạt hơn): bồi thêm 1 lượt mỏng phấn khối ${jawToneAdvice} sát dưới gò má để 2 bên đồng độ sâu.`,
        ]
      : widerJawSide !== "balanced" && contourSeverity !== "balanced"
        ? [
            `Nửa ${sideVi(widerJawSide)} (bên rộng hơn): dùng cọ vát lấy phấn khối ${jawToneAdvice}, tán 2 lượt mỏng ôm sát dưới xương hàm kéo lên mang tai để đẩy lùi đường viền.`,
            `Nửa ${sideVi(narrowerSide)} (bên gọn hơn): chỉ phớt 1/2 lượng phấn sát cổ, chấm sáng nhẹ đỉnh gò má để hai nửa mặt cân thể tích.`,
          ]
        : [
            `Phớt thật mỏng phấn khối ${jawToneAdvice} ngay dưới viền xương hàm và chấm bắt sáng nhẹ trên gò má.`,
          ],
    lines: contourLines,
    arrows: contourArrows,
    strokes: contourStrokes,
    calloutAnchor: targetContourSide === "right" ? pt(lms, 397) : pt(lms, 172),
    shortPinLabel: isShadingPrimary
      ? `Khối lệch Δ${contourShading.shadingAsymmetryDeltaL.toFixed(0)}`
      : contourSeverity === "balanced"
        ? "Hàm cân"
        : `Hàm lệch +${geomWidthDiffPct.toFixed(1)}%`,
    stickerTitleVi: isShadingPrimary
      ? `Khối má ${contourShading.heavierSide === "left" ? "trái" : "phải"} đậm hơn`
      : contourSeverity === "balanced"
        ? "Khung hàm cân đối"
        : `Hàm ${widerJawSide === "left" ? "trái" : "phải"} bè +${geomWidthDiffPct.toFixed(1)}%`,
    stickerFixVi: isShadingPrimary
      ? `Tán dịu má ${contourShading.heavierSide === "left" ? "trái" : "phải"}, bù nhẹ bên kia`
      : contourSeverity === "balanced"
        ? "Phớt khối siêu mỏng dưới viền hàm"
        : `Tán khối sâu dưới xương hàm ${widerJawSide === "left" ? "trái" : "phải"}`,
    primaryMakeupLayer: "contour",
  };

  // ---------------------------------------------------------------------------
  // 3. OILY / SPECULAR SHINE ZONES (Vùng bóng dầu thực tế trên bề mặt da)
  // ---------------------------------------------------------------------------
  const shineReport = detectOilyShineZones(
    report.originalRgba,
    report.skinMask,
    width,
    height,
    lms
  );
  const peakShinePct = shineReport.shiniestZone?.specularPct ?? 0;
  const shineSeverity: HonestIssueSeverity =
    peakShinePct >= 12 ? "fix_first" : peakShinePct >= 4.5 ? "minor_tweak" : "balanced";

  const oilyHotZones = shineReport.zones.filter((z) => z.specularPct >= 4.5).slice(0, 2);
  const shineStrokes: VisualCueStroke[] =
    oilyHotZones.length > 0
      ? oilyHotZones.map((z, idx) => ({
          points: z.polygon,
          kind: "oil_zone",
          weight: idx === 0 && shineSeverity === "fix_first" ? "strong" : "normal",
          closed: true,
        }))
      : shineReport.shiniestZone
        ? [
            {
              points: shineReport.shiniestZone.polygon,
              kind: "oil_zone",
              weight: "soft",
              closed: true,
            },
          ]
        : [];

  const primaryOilLabel = shineReport.shiniestZone?.labelVi ?? "Vùng chữ T";
  const secondaryOilLabel = oilyHotZones[1]?.labelVi ?? null;
  const combinedOilZonesLabel = secondaryOilLabel
    ? `${primaryOilLabel} & ${secondaryOilLabel.toLowerCase()}`
    : primaryOilLabel;

  const shineAnchor =
    shineReport.shiniestZone?.centroid ?? lerpPt(pt(lms, 10), pt(lms, 168), 0.55);

  const shineIssue: HonestAuditIssue = {
    id: "shine_oil",
    zoneLabelVi: "Vùng bóng dầu bề mặt",
    severity: shineSeverity,
    severityTagVi: severityTag(shineSeverity),
    measuredDeltaVi:
      shineSeverity === "balanced"
        ? `Độ phản xạ dầu thấp (${peakShinePct.toFixed(1)}% tại ${primaryOilLabel.toLowerCase()})`
        : `${combinedOilZonesLabel}: bóng dầu ${peakShinePct.toFixed(1)}% diện tích vùng`,
    brutalCalloutVi:
      shineSeverity === "fix_first"
        ? `Nói thẳng: ánh sáng phản xạ bóng dầu rất rõ ở ${combinedOilZonesLabel.toLowerCase()} (${peakShinePct.toFixed(1)}%). Đánh thêm highlight hoặc cushion bóng lên đúng vùng này sẽ lộ lỗ chân lông và nhanh xỉn nền.`
        : shineSeverity === "minor_tweak"
          ? `Vùng ${combinedOilZonesLabel.toLowerCase()} hơi bóng dầu (${peakShinePct.toFixed(1)}%). Khóa nhẹ phấn phủ lì đúng vùng đánh dấu trên ảnh sẽ giữ mặt ráo mịn hẳn.`
          : "Bề mặt vùng chữ T khá ráo mịn — tránh dặm phấn phủ quá dày kẻo khô mốc cánh mũi.",
    fixStepsVi:
      shineSeverity !== "balanced"
        ? [
            `Tại ${combinedOilZonesLabel.toLowerCase()}: ép nhẹ giấy thấm dầu, sau đó dùng bông mút khô ấn 1 lớp mỏng phấn phủ không màu (translucent matte).`,
            "Tránh đánh highlight nhũ lên hai bên cánh mũi và giữa trán — chỉ đặt sáng nhẹ ở đỉnh gò má ngoài.",
          ]
        : [
            "Chỉ cần phớt rất nhẹ phấn phủ kiềm dầu sát hai cánh mũi trước khi ra ngoài.",
          ],
    lines: [],
    arrows: [],
    strokes: shineStrokes,
    calloutAnchor: shineAnchor,
    shortPinLabel: shineSeverity === "balanced" ? "Da ráo" : `Bóng dầu ${peakShinePct.toFixed(0)}%`,
    stickerTitleVi:
      shineSeverity === "balanced"
        ? "Vùng chữ T ráo mịn"
        : `Bóng dầu ${primaryOilLabel.toLowerCase()}`,
    stickerFixVi:
      shineSeverity === "balanced"
        ? "Giữ lớp nền mỏng nhẹ"
        : "Thấm dầu & khóa phấn phủ lì",
    primaryMakeupLayer: "contour",
  };

  // ---------------------------------------------------------------------------
  // 4. NOSE BRIDGE & ALAR WIDTH (Sống mũi & Cánh mũi)
  // ---------------------------------------------------------------------------
  const interCanthal = Math.max(12, dist(pt(lms, 133), pt(lms, 362)));
  const alarWidth = dist(pt(lms, 98), pt(lms, 327));
  const noseWidthRatio = alarWidth / interCanthal;
  const noseTipDevPx = Math.abs(project(noseTipPt).v);
  const noseTipDevPct = (noseTipDevPx / faceWidth) * 100;
  const noseTipLean: SideBias =
    noseTipDevPct < 1.1 ? "balanced" : project(noseTipPt).v < 0 ? "left" : "right";

  const noseSeverity: HonestIssueSeverity =
    noseWidthRatio >= 1.15 || noseTipDevPct >= 2.2
      ? "fix_first"
      : noseWidthRatio >= 1.07 || noseTipDevPct >= 1.2
        ? "minor_tweak"
        : "balanced";

  const lNoseRail = [193, 122, 114, 129].map((i) => pt(lms, i));
  const rNoseRail = [417, 351, 343, 358].map((i) => pt(lms, i));
  const noseBridgeHighlight = [168, 6, 197, 195, 5, 4].map((i) => pt(lms, i));

  const noseStrokes: VisualCueStroke[] = [
    { points: lNoseRail, kind: "contour", weight: noseSeverity === "fix_first" ? "strong" : "normal" },
    { points: rNoseRail, kind: "contour", weight: noseSeverity === "fix_first" ? "strong" : "normal" },
    { points: noseBridgeHighlight, kind: "highlight", weight: noseSeverity === "fix_first" ? "strong" : "normal" },
  ];

  const noseArrows: VisualCueArrow[] = [];
  if (noseWidthRatio >= 1.07) {
    const lAla = pt(lms, 98);
    const rAla = pt(lms, 327);
    noseArrows.push(
      { from: shiftRight(lAla, -faceWidth * 0.05), to: shiftRight(lAla, faceWidth * 0.045), kind: "narrow" },
      { from: shiftRight(rAla, faceWidth * 0.05), to: shiftRight(rAla, -faceWidth * 0.045), kind: "narrow" }
    );
  }

  const noseIssue: HonestAuditIssue = {
    id: "nose",
    zoneLabelVi: "Sống mũi & Cánh mũi",
    severity: noseSeverity,
    severityTagVi: severityTag(noseSeverity),
    measuredDeltaVi:
      noseTipLean !== "balanced" && noseTipDevPct >= 1.2
        ? `Cánh mũi ${noseWidthRatio.toFixed(2)}× khoảng mắt · Đầu mũi lệch nhẹ ${sideVi(noseTipLean)}`
        : `Cánh mũi bằng ${noseWidthRatio.toFixed(2)}× khoảng cách 2 khóe mắt`,
    brutalCalloutVi:
      noseSeverity === "fix_first"
        ? `Nói thẳng: cánh mũi đang rộng hơn tỷ lệ chuẩn (${noseWidthRatio.toFixed(2)}× khoảng mắt). Kẻ 2 đường khối thẳng tuột từ mày xuống cánh mũi sẽ cực giả — cần chặn khối ngắt quãng ở hốc mắt và chữ V đầu mũi.`
        : noseSeverity === "minor_tweak"
          ? `Cánh mũi hơi đầy nhẹ (${noseWidthRatio.toFixed(2)}× khoảng mắt)${noseTipLean !== "balanced" ? ` và đầu mũi hơi nghiêng ${sideVi(noseTipLean)}` : ""}. Tán khối đúng 2 điểm gãy giúp sống mũi thanh và cao hơn hẳn.`
          : "Sống mũi và cánh mũi cân xứng với khoảng cách mắt — chỉ cần chấm sáng siêu nhẹ ở sống giữa và đầu mũi.",
    fixStepsVi: [
      "Tạo 2 đoạn khối ngắn bằng cọ đầu nhỏ ở hốc đầu mày–sống mũi (chữ C mềm) và bo chữ V ôm đầu mũi, để trống đoạn giữa sống mũi.",
      noseTipLean !== "balanced" && noseTipDevPct >= 1.2
        ? `Đặt chấm sáng sống mũi nhích ~1mm về ${sideVi(oppositeSide(noseTipLean))} để kéo thẳng trục thị giác.`
        : "Chấm bắt sáng không nhũ to ở đúng 2 điểm: sống mũi ngang đuôi mắt và 1 chấm nhỏ ngay đầu mũi.",
    ],
    lines: [{ x1: pt(lms, 168).x, y1: pt(lms, 168).y, x2: pt(lms, 2).x, y2: pt(lms, 2).y, kind: "axis" }],
    arrows: noseArrows,
    strokes: noseStrokes,
    calloutAnchor: noseTipPt,
    shortPinLabel: noseSeverity === "balanced" ? "Mũi cân" : `Cánh mũi ${noseWidthRatio.toFixed(2)}×`,
    stickerTitleVi:
      noseSeverity === "balanced"
        ? "Sống mũi cân tỷ lệ"
        : `Cánh mũi rộng (${noseWidthRatio.toFixed(2)}×)`,
    stickerFixVi:
      noseSeverity === "balanced"
        ? "Chấm sáng nhẹ sống giữa & đầu mũi"
        : "Khối ngắt quãng hốc mắt + chữ V mũi",
    primaryMakeupLayer: "contour",
  };

  // ---------------------------------------------------------------------------
  // 5. EYES (Đôi mắt & Độ xếch đuôi mắt)
  // ---------------------------------------------------------------------------
  const lInner = pt(lms, 133);
  const lOuter = pt(lms, 33);
  const rInner = pt(lms, 362);
  const rOuter = pt(lms, 263);

  const lCant = (project(lInner).u - project(lOuter).u) / faceWidth;
  const rCant = (project(rInner).u - project(rOuter).u) / faceWidth;
  const cantDiffPct = Math.abs(lCant - rCant) * 100;
  const outerVertDiffPx = project(lOuter).u - project(rOuter).u;
  const outerVertPct = (Math.abs(outerVertDiffPx) / faceWidth) * 100;
  const eyeDeltaPct = Number(Math.max(outerVertPct, cantDiffPct).toFixed(1));
  const eyeMm = pctToMm(eyeDeltaPct);
  const eyeSeverity = severityFromDelta(eyeDeltaPct, 1.8, 0.9);

  const lowerEyeSide: SideBias =
    eyeDeltaPct < 0.9
      ? "balanced"
      : cantDiffPct >= outerVertPct
        ? lCant < rCant
          ? "left"
          : "right"
        : outerVertDiffPx > 0
          ? "left"
          : "right";

  const eyeLines: VisualCueLine[] = [
    { x1: lOuter.x, y1: lOuter.y, x2: rOuter.x, y2: rOuter.y, kind: "reference", label: "Đường trục 2 đuôi mắt" },
  ];
  const eyeArrows: VisualCueArrow[] = [];
  const eyeStrokes: VisualCueStroke[] = [];

  if (lowerEyeSide === "left") {
    const flickEnd = shiftUp(shiftRight(lOuter, -faceWidth * 0.065), faceWidth * 0.045);
    eyeArrows.push({ from: lOuter, to: flickEnd, kind: "lift", label: "Nâng đuôi mắt" });
    eyeStrokes.push({
      points: [lerpPt(lInner, lOuter, 0.55), lOuter, flickEnd],
      kind: "eyeliner_lift",
      weight: eyeSeverity === "fix_first" ? "strong" : "normal",
    });
  } else if (lowerEyeSide === "right") {
    const flickEnd = shiftUp(shiftRight(rOuter, faceWidth * 0.065), faceWidth * 0.045);
    eyeArrows.push({ from: rOuter, to: flickEnd, kind: "lift", label: "Nâng đuôi mắt" });
    eyeStrokes.push({
      points: [lerpPt(rInner, rOuter, 0.55), rOuter, flickEnd],
      kind: "eyeliner_lift",
      weight: eyeSeverity === "fix_first" ? "strong" : "normal",
    });
  } else {
    eyeStrokes.push(
      {
        points: [lerpPt(lInner, lOuter, 0.6), lOuter, shiftUp(shiftRight(lOuter, -faceWidth * 0.04), faceWidth * 0.02)],
        kind: "eyeliner_lift",
        weight: "soft",
      },
      {
        points: [lerpPt(rInner, rOuter, 0.6), rOuter, shiftUp(shiftRight(rOuter, faceWidth * 0.04), faceWidth * 0.02)],
        kind: "eyeliner_lift",
        weight: "soft",
      }
    );
  }

  const eyeIssue: HonestAuditIssue = {
    id: "eyes",
    zoneLabelVi: "Trục mắt & Đuôi mắt",
    severity: eyeSeverity,
    severityTagVi: severityTag(eyeSeverity),
    measuredDeltaVi:
      lowerEyeSide !== "balanced" && eyeDeltaPct >= 0.9
        ? `Đuôi mắt ${sideVi(lowerEyeSide)} trễ hơn ${eyeMm}mm (${eyeDeltaPct.toFixed(1)}%)`
        : `Hai trục mắt cân bằng (lệch ${eyeDeltaPct.toFixed(1)}%)`,
    brutalCalloutVi:
      eyeSeverity === "fix_first"
        ? `Nói thẳng: đuôi mắt ${sideVi(lowerEyeSide)} trễ rõ hơn bên còn lại (~${eyeMm}mm). Kẻ eyeliner dày bằng nhau cả 2 mắt sẽ làm bên này trông sụp và nhỏ hơn hẳn.`
        : eyeSeverity === "minor_tweak"
          ? `Đuôi mắt ${sideVi(lowerEyeSide)} hơi chùng nhẹ (${eyeDeltaPct.toFixed(1)}%). Nâng nhẹ góc đá đuôi eyeliner bên này ~1mm là hai mắt cân ngay.`
          : "Độ cao và góc đuôi 2 mắt đều — giữ eyeliner thật mảnh sát chân mi và bấm mi cong là tối ưu.",
    fixStepsVi:
      lowerEyeSide !== "balanced" && eyeSeverity !== "balanced"
        ? [
            `Mắt ${sideVi(lowerEyeSide)} (bên trễ): tán phấn nâu lì chữ V ở 1/3 đuôi mắt hướng chếch lên thái dương và đá đuôi liner mỏng cao hơn bên kia ~1–1.5mm.`,
            `Mắt ${sideVi(oppositeSide(lowerEyeSide))}: kẻ liner ngang tự nhiên theo đường mi thật, tránh hất quá cao.`,
          ]
        : ["Tán 1 lớp phấn lì mỏng sát nếp mí và kẻ sát chân mi bằng chì nâu mềm, kéo ngang đuôi ~2mm."],
    lines: eyeLines,
    arrows: eyeArrows,
    strokes: eyeStrokes,
    calloutAnchor: lowerEyeSide === "right" ? rOuter : lOuter,
    shortPinLabel: eyeSeverity === "balanced" ? "Mắt cân" : `Đuôi mắt trễ ${eyeMm}mm`,
    stickerTitleVi:
      eyeSeverity === "balanced"
        ? "Trục 2 mắt cân"
        : `Đuôi mắt ${lowerEyeSide === "left" ? "trái" : "phải"} trễ ${eyeMm}mm`,
    stickerFixVi:
      eyeSeverity === "balanced"
        ? "Kẻ mảnh sát chân mi, bấm mi cong"
        : "Đá đuôi liner nâng +1.5mm",
    primaryMakeupLayer: "eyeshadow",
  };

  // ---------------------------------------------------------------------------
  // 6. FACIAL THIRDS & LIP CORNERS (Tỷ lệ 3 tầng mặt & Khóe môi)
  // ---------------------------------------------------------------------------
  const uTop = project(topPt).u;
  const uBrow = project(glabellaPt).u;
  const uNoseBase = project(noseBasePt).u;
  const uChin = project(chinPt).u;

  const upperLen = Math.max(1, uBrow - uTop);
  const midLenThird = Math.max(1, uNoseBase - uBrow);
  const lowerLen = Math.max(1, uChin - uNoseBase);
  const totalThirds = upperLen + midLenThird + lowerLen;

  const upperPct = Math.round((upperLen / totalThirds) * 100);
  const middlePct = Math.round((midLenThird / totalThirds) * 100);
  const lowerPct = Math.max(1, 100 - upperPct - middlePct);

  const maxThirdDev = Math.max(
    Math.abs(upperPct - 33.3),
    Math.abs(middlePct - 33.3),
    Math.abs(lowerPct - 33.3)
  );
  const dominantThird: FacialThirdsMetrics["dominantThird"] =
    maxThirdDev < 3.5
      ? "balanced"
      : upperPct >= middlePct && upperPct >= lowerPct
        ? "upper"
        : middlePct >= upperPct && middlePct >= lowerPct
          ? "middle"
          : "lower";

  const lLipCorner = pt(lms, 61);
  const rLipCorner = pt(lms, 291);
  const lipCornerDiffPx = project(lLipCorner).u - project(rLipCorner).u;
  const lipVertDiffPct = Number(((Math.abs(lipCornerDiffPx) / faceWidth) * 100).toFixed(1));
  const lowerLipSide: SideBias =
    lipVertDiffPct < 1.0 ? "balanced" : lipCornerDiffPx > 0 ? "left" : "right";

  const thirdsSeverity: HonestIssueSeverity =
    maxThirdDev >= 6.5 || lipVertDiffPct >= 2.0
      ? "fix_first"
      : maxThirdDev >= 3.8 || lipVertDiffPct >= 1.1
        ? "minor_tweak"
        : "balanced";

  const thirdsLines: VisualCueLine[] = [
    {
      x1: shiftRight(glabellaPt, -faceWidth * 0.48).x,
      y1: shiftRight(glabellaPt, -faceWidth * 0.48).y,
      x2: shiftRight(glabellaPt, -faceWidth * 0.34).x,
      y2: shiftRight(glabellaPt, -faceWidth * 0.34).y,
      kind: "measured",
      label: `Trán ${upperPct}%`,
    },
    {
      x1: shiftRight(noseBasePt, -faceWidth * 0.48).x,
      y1: shiftRight(noseBasePt, -faceWidth * 0.48).y,
      x2: shiftRight(noseBasePt, -faceWidth * 0.34).x,
      y2: shiftRight(noseBasePt, -faceWidth * 0.34).y,
      kind: "measured",
      label: `Giữa ${middlePct}%`,
    },
    {
      x1: shiftRight(chinPt, -faceWidth * 0.48).x,
      y1: shiftRight(chinPt, -faceWidth * 0.48).y,
      x2: shiftRight(chinPt, -faceWidth * 0.34).x,
      y2: shiftRight(chinPt, -faceWidth * 0.34).y,
      kind: "measured",
      label: `Cằm ${lowerPct}%`,
    },
  ];

  const thirdsArrows: VisualCueArrow[] = [];
  const thirdsStrokes: VisualCueStroke[] = [];

  if (lowerLipSide !== "balanced" && lipVertDiffPct >= 1.0) {
    const targetCorner = lowerLipSide === "left" ? lLipCorner : rLipCorner;
    thirdsArrows.push({
      from: targetCorner,
      to: shiftUp(targetCorner, Math.max(8, faceWidth * 0.065)),
      kind: "lift",
      label: "Nâng khóe môi",
    });
  }

  if (dominantThird === "middle") {
    thirdsStrokes.push({
      points: [shiftRight(chinPt, -faceWidth * 0.1), chinPt, shiftRight(chinPt, faceWidth * 0.1)],
      kind: "highlight",
      weight: "normal",
    });
  } else if (dominantThird === "upper") {
    thirdsStrokes.push({
      points: [shiftRight(topPt, -faceWidth * 0.22), topPt, shiftRight(topPt, faceWidth * 0.22)],
      kind: "contour",
      weight: "normal",
    });
  } else if (dominantThird === "lower") {
    thirdsStrokes.push({
      points: [shiftRight(chinPt, -faceWidth * 0.14), chinPt, shiftRight(chinPt, faceWidth * 0.14)],
      kind: "contour",
      weight: "normal",
    });
  }

  const thirdsSummaryVi =
    dominantThird === "balanced"
      ? `Tỷ lệ 3 tầng (${upperPct}% / ${middlePct}% / ${lowerPct}%) tiệm cận chuẩn 1:1:1.`
      : dominantThird === "upper"
        ? `Tầng trán chiếm ${upperPct}% (cao hơn chuẩn 33%).`
        : dominantThird === "middle"
          ? `Tầng giữa chiếm ${middlePct}% (dài hơn chuẩn 33%).`
          : `Tầng dưới chiếm ${lowerPct}% (đầy hơn chuẩn 33%).`;

  const thirdsIssue: HonestAuditIssue = {
    id: "thirds_lips",
    zoneLabelVi: "3 tầng mặt & Khóe môi",
    severity: thirdsSeverity,
    severityTagVi: severityTag(thirdsSeverity),
    measuredDeltaVi: `Trán ${upperPct}% · Giữa ${middlePct}% · Cằm ${lowerPct}%${
      lipVertDiffPct >= 1.1 ? ` · Khóe môi lệch ${lipVertDiffPct.toFixed(1)}%` : ""
    }`,
    brutalCalloutVi:
      dominantThird === "middle"
        ? `Nói thẳng: tầng giữa mặt hơi dài (${middlePct}%). Đánh má quá sát thái dương hoặc bỏ qua phấn mi dưới sẽ làm khoảng mắt–môi trông trống hơn.`
        : dominantThird === "upper"
          ? `Tầng trán hơi cao (${upperPct}%). Nếu vén sát không dặm bóng chân tóc, nửa trên sẽ chiếm ưu thế làm ngũ quan trông nhỏ lại.`
          : dominantThird === "lower"
            ? `Tầng dưới chiếm ${lowerPct}%, hơi đầy so với nửa trên. Tránh thoa son tràn viền dưới quá dày làm nặng phần cằm.`
            : lipVertDiffPct >= 1.1 && lowerLipSide !== "balanced"
              ? `Tỷ lệ 3 tầng cân, nhưng khóe môi ${sideVi(lowerLipSide)} hơi trễ nhẹ (${lipVertDiffPct.toFixed(1)}%).`
              : "Tỷ lệ 3 tầng mặt và khóe môi cân bằng rất tốt — chỉ cần giữ lớp trang điểm gọn nhẹ.",
    fixStepsVi: [
      dominantThird === "middle"
        ? "Tán phấn mi dưới (aegyo-sal nhẹ) và đặt má hồng ngang dưới bọng mắt để thu ngắn thị giác tầng giữa."
        : dominantThird === "upper"
          ? "Dặm phấn tạo khối đồng màu tóc sát chân tóc hai bên thái dương hoặc để mái thưa ôm nhẹ đỉnh trán."
          : dominantThird === "lower"
            ? "Phớt nhẹ phấn khối nâu xám dưới đáy cằm và tập trung nhấn hàng mi trên + má hồng hơi cao."
            : "Giữ vị trí má hồng và chân mày đúng trục tự nhiên, không cần ép thu ngắn tầng nào.",
      lowerLipSide !== "balanced" && lipVertDiffPct >= 1.1
        ? `Chấm che khuyết điểm gọn viền dưới khóe môi ${sideVi(lowerLipSide)} và nhích viền son lên ~1mm để cân khóe cười.`
        : "Thoa son tán mờ viền ngoài (blur lip) giúp tổng thể môi mềm và tự nhiên.",
    ],
    lines: thirdsLines,
    arrows: thirdsArrows,
    strokes: thirdsStrokes,
    calloutAnchor: lowerLipSide === "right" ? rLipCorner : lLipCorner,
    shortPinLabel:
      dominantThird !== "balanced"
        ? `3 tầng ${upperPct}/${middlePct}/${lowerPct}`
        : `Môi lệch ${lipVertDiffPct.toFixed(1)}%`,
    stickerTitleVi:
      dominantThird === "middle"
        ? `Tầng giữa dài (${middlePct}%)`
        : dominantThird === "upper"
          ? `Tầng trán cao (${upperPct}%)`
          : dominantThird === "lower"
            ? `Tầng cằm đầy (${lowerPct}%)`
            : lowerLipSide !== "balanced"
              ? `Khóe môi ${lowerLipSide === "left" ? "trái" : "phải"} trễ nhẹ`
              : "3 tầng mặt cân đối",
    stickerFixVi:
      dominantThird === "middle"
        ? "Đánh má ngang thấp + phấn mi dưới"
        : dominantThird === "upper"
          ? "Dặm bóng chân tóc + mái thưa"
          : dominantThird === "lower"
            ? "Phớt khối đáy cằm, nhấn mi trên"
            : lowerLipSide !== "balanced"
              ? "Nâng viền khóe môi +1mm"
              : "Tán mờ viền môi tự nhiên",
    primaryMakeupLayer: "lip",
  };

  // Sort brutally: fix_first -> minor_tweak -> balanced
  const sevRank: Record<HonestIssueSeverity, number> = {
    fix_first: 0,
    minor_tweak: 1,
    balanced: 2,
  };
  const issues = [browIssue, contourIssue, shineIssue, noseIssue, eyeIssue, thirdsIssue].sort(
    (a, b) => sevRank[a.severity] - sevRank[b.severity]
  );

  const fixFirstCount = issues.filter((i) => i.severity === "fix_first").length;
  const minorCount = issues.filter((i) => i.severity === "minor_tweak").length;

  const peakAsymmetryPct = Math.max(browVertPct, geomWidthDiffPct, eyeDeltaPct, lipVertDiffPct);
  const proportionPenalty =
    Math.max(0, (noseWidthRatio - 1.05) * 30) + Math.max(0, (maxThirdDev - 3.0) * 1.4);
  const severityPenalty =
    fixFirstCount * 6.5 +
    minorCount * 2.2 +
    Math.max(0, peakAsymmetryPct - 1.2) * 1.6 +
    (hasLopsidedContourShading ? 4.5 : 0);
  const rawBalance = symmetry.overallScore - proportionPenalty - severityPenalty;
  const overallBalanceScore = Math.round(clamp(rawBalance, 35, 97));

  const verdictTagVi =
    overallBalanceScore >= 87 && fixFirstCount === 0
      ? "Khung mặt cân đối"
      : overallBalanceScore >= 75
        ? "Có điểm lệch cần chỉnh"
        : "Lệch rõ — cần sửa bằng khối";

  const topTwo = issues.slice(0, 2);
  const brutalHeadlineVi =
    fixFirstCount >= 2
      ? `Phát hiện ${fixFirstCount} điểm lệch rõ: ${topTwo.map((i) => i.zoneLabelVi.split(" & ")[0]).join(" & ")}`
      : fixFirstCount === 1
        ? `Điểm lệch rõ nhất nằm ở ${topTwo[0].zoneLabelVi.toLowerCase()}`
        : minorCount > 0
          ? `Khung mặt hài hòa, còn ${minorCount} điểm lệch nhẹ dưới cam thường`
          : "Khung mặt cân đối thật — tránh lạm dụng tạo khối đậm";

  const brutalSummaryVi =
    fixFirstCount > 0 || minorCount > 0
      ? `${topTwo[0].measuredDeltaVi}. Chạm vào từng dấu đỏ trên ảnh hoặc danh sách bên dưới để xem hướng sửa trực tiếp, rồi mở chế độ Trượt Trước / Sau để đối chiếu.`
      : `Mọi chỉ số lệch trái–phải đều trong ngưỡng tự nhiên (${overallBalanceScore}/100). Chỉ cần lớp trang điểm gọn nhẹ để tôn đường nét sẵn có.`;

  const noseContourStrength =
    noseSeverity === "fix_first" ? 0.34 : noseSeverity === "minor_tweak" ? 0.24 : 0.14;

  const limitationNoteVi = `${pose.poseNoteVi}. Hiệu chuẩn milimet theo khoảng cách đồng tử (IPD ≈ 61.5mm · ${report.landmarkCount} điểm MediaPipe).`;

  const contourLab = hexToLab(shades.contourHex);
  const safeContourHex = contourLab[0] < skinL - 5 ? shades.contourHex : "#6E5549";

  return {
    available: true,
    width,
    height,
    overallBalanceScore,
    verdictTagVi,
    brutalHeadlineVi,
    brutalSummaryVi,
    headTiltDeg: pose.rollDeg,
    pose,
    contourShading,
    midlineAxis,
    facialThirds: {
      upperPct,
      middlePct,
      lowerPct,
      dominantThird,
      summaryVi: thirdsSummaryVi,
    },
    issues,
    realMakeupPlan: {
      browHex: shades.browHex,
      browLiftSide: lowerBrowSide,
      browLiftPx,
      contourHex: safeContourHex,
      highlightHex: shades.highlightHex,
      widerJawSide,
      lowerCheekSide,
      noseContourStrength,
      eyeshadowHex: shades.eyeshadowHex,
      droopingEyeSide: lowerEyeSide,
    },
    limitationNoteVi,
  };
}

/**
 * Pure collision-free perimeter layout solver for red diagnostic markers & repair callouts.
 * In overview ("all"), ONLY surfaces actual detected asymmetries/defects (severity !== "balanced",
 * up to 3 highest-priority red markers) so the portrait is never cluttered with green "all good" tags.
 */
export function computePerimeterCalloutSlots(
  issues: HonestAuditIssue[],
  width: number,
  height: number,
  midlineX: number,
  focusedZone: HonestAuditZoneId | "all"
): PerimeterCalloutSlot[] {
  if (issues.length === 0 || width <= 0 || height <= 0) return [];

  let selected: HonestAuditIssue[];
  if (focusedZone !== "all") {
    const match = issues.find((i) => i.id === focusedZone);
    selected = match ? [match] : [];
  } else {
    const priorityOrder: Record<HonestAuditZoneId, number> = {
      brows: 0,
      contour_jaw: 1,
      shine_oil: 2,
      nose: 3,
      eyes: 4,
      thirds_lips: 5,
    };
    const sevOrder: Record<HonestIssueSeverity, number> = {
      fix_first: 0,
      minor_tweak: 1,
      balanced: 2,
    };
    // Brutally honest filter: only flag REAL non-balanced issues on the photo overview!
    const actionable = issues.filter((i) => i.severity !== "balanced");
    selected = [...actionable]
      .sort((a, b) => {
        const sDiff = sevOrder[a.severity] - sevOrder[b.severity];
        if (sDiff !== 0) return sDiff;
        return priorityOrder[a.id] - priorityOrder[b.id];
      })
      .slice(0, 3);
  }

  if (selected.length === 0) return [];

  const rawSlots: PerimeterCalloutSlot[] = selected.map((issue, idx) => {
    const anchorXNorm = clamp(issue.calloutAnchor.x / width, 0.08, 0.92);
    const anchorYNorm = clamp(issue.calloutAnchor.y / height, 0.14, 0.82);
    const side: "left" | "right" = issue.calloutAnchor.x < midlineX ? "left" : "right";
    return {
      issue,
      markerIndex: idx + 1,
      side,
      anchorXNorm,
      anchorYNorm,
      stickerYNorm: clamp(anchorYNorm, 0.18, 0.76),
    };
  });

  // Balance rails if all 3 red markers land on the exact same edge
  if (rawSlots.length === 3) {
    const leftCount = rawSlots.filter((s) => s.side === "left").length;
    if (leftCount === 3 || leftCount === 0) {
      let closestIdx = 0;
      let bestDist = Infinity;
      rawSlots.forEach((s, idx) => {
        const d = Math.abs(s.issue.calloutAnchor.x - midlineX);
        if (d < bestDist) {
          bestDist = d;
          closestIdx = idx;
        }
      });
      rawSlots[closestIdx].side = rawSlots[closestIdx].side === "left" ? "right" : "left";
    }
  }

  const minGap = 0.22;
  const minY = 0.18;
  const maxY = 0.76;

  const packRail = (rail: PerimeterCalloutSlot[]) => {
    rail.sort((a, b) => a.anchorYNorm - b.anchorYNorm);
    for (let i = 1; i < rail.length; i++) {
      if (rail[i].stickerYNorm - rail[i - 1].stickerYNorm < minGap) {
        rail[i].stickerYNorm = rail[i - 1].stickerYNorm + minGap;
      }
    }
    if (rail.length > 0 && rail[rail.length - 1].stickerYNorm > maxY) {
      rail[rail.length - 1].stickerYNorm = maxY;
      for (let i = rail.length - 2; i >= 0; i--) {
        if (rail[i + 1].stickerYNorm - rail[i].stickerYNorm < minGap) {
          rail[i].stickerYNorm = Math.max(minY, rail[i + 1].stickerYNorm - minGap);
        }
      }
    }
  };

  const leftRail = rawSlots.filter((s) => s.side === "left");
  const rightRail = rawSlots.filter((s) => s.side === "right");
  packRail(leftRail);
  packRail(rightRail);

  return [...leftRail, ...rightRail].sort((a, b) => a.markerIndex - b.markerIndex);
}
