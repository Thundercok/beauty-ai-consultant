import { buildVnHighlightContourPlan, type VnFeatureAnalysisResult } from "./vnFeatureAnalysis";
import { SHAPE_VI_LABELS } from "./viLabels";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  FaceShapeName,
  SeasonClassification,
} from "./types";

export type FaceGuideZoneId = "hair" | "eyes" | "nose" | "cheek_jaw" | "lips";

export interface Point2D {
  x: number;
  y: number;
}

export interface ProjectedPinPosition {
  leftPct: number;
  topPct: number;
  visible: boolean;
}

export interface GuideStrokePath {
  d: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dashed?: boolean;
  blur?: boolean;
  crispOutline?: string;
}

export interface GuideSweepArrow {
  d: string;
  tipX: number;
  tipY: number;
  angleDeg: number;
  stroke: string;
  opacity: number;
}

export interface GuideDot {
  x: number;
  y: number;
  r: number;
  ry?: number;
  fill: string;
  opacity: number;
  glow?: boolean;
}

export interface GuideEllipseBlob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotateDeg: number;
  fill: string;
  opacity: number;
  outlineColor?: string;
  softRadial?: boolean;
}

export interface GuidePolygonFill {
  points: string;
  fill: string;
  opacity: number;
}

export interface ZoneVisualPrimitives {
  strokes: GuideStrokePath[];
  arrows: GuideSweepArrow[];
  dots: GuideDot[];
  blobs: GuideEllipseBlob[];
  polygons: GuidePolygonFill[];
}

export interface FaceGuideGeometry {
  width: number;
  height: number;
  pins: Record<FaceGuideZoneId, Point2D>;
  visuals: Record<FaceGuideZoneId, ZoneVisualPrimitives>;
}

export interface FaceGuideLegendItem {
  label: string;
  swatchColor: string;
  dashed?: boolean;
}

export interface FaceGuideZoneContent {
  id: FaceGuideZoneId;
  shortLabel: string;
  pinLabel: string;
  swatchColor: string;
  stepNumber: number;
  titleVi: string;
  detectedCueVi: string;
  howToVi: string;
  avoidVi: string;
  legend: FaceGuideLegendItem[];
}

/**
 * Natural makeup routine order: Eyes -> Nose Contour -> Cheek Blush & Jaw -> Lips -> Hair Framing.
 */
export const FACE_GUIDE_ZONE_ORDER: readonly FaceGuideZoneId[] = [
  "eyes",
  "cheek_jaw",
  "nose",
  "lips",
  "hair",
];

export type FaceGuideIntensity = "soft" | "crisp";

/**
 * Maps a MakeupGuideSection concern ID to its matching interactive portrait overlay zone.
 */
export function mapConcernToGuideZone(concernId: string): FaceGuideZoneId | null {
  if (concernId === "eyes") return "eyes";
  if (concernId === "nose") return "nose";
  if (concernId === "face_fullness") return "cheek_jaw";
  return null;
}

/**
 * Pure helper: toggles a single visual guide layer ON/OFF cleanly in deterministic order.
 */
export function toggleFaceGuideLayer(
  activeLayers: readonly FaceGuideZoneId[],
  zone: FaceGuideZoneId
): FaceGuideZoneId[] {
  const exists = activeLayers.includes(zone);
  if (exists) {
    return activeLayers.filter((id) => id !== zone);
  }
  const nextSet = new Set<FaceGuideZoneId>([...activeLayers, zone]);
  return FACE_GUIDE_ZONE_ORDER.filter((id) => nextSet.has(id));
}

/**
 * Pure helper: advances or rewinds a 1-step-at-a-time makeup routine walkthrough.
 */
export function stepFaceGuideRoutine(
  current: FaceGuideZoneId | null,
  direction: "next" | "prev"
): FaceGuideZoneId {
  const idx = current ? FACE_GUIDE_ZONE_ORDER.indexOf(current) : -1;
  if (idx < 0) {
    return direction === "next"
      ? FACE_GUIDE_ZONE_ORDER[0]
      : FACE_GUIDE_ZONE_ORDER[FACE_GUIDE_ZONE_ORDER.length - 1];
  }
  const nextIdx =
    direction === "next"
      ? (idx + 1) % FACE_GUIDE_ZONE_ORDER.length
      : (idx - 1 + FACE_GUIDE_ZONE_ORDER.length) % FACE_GUIDE_ZONE_ORDER.length;
  return FACE_GUIDE_ZONE_ORDER[nextIdx];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Projects a pixel coordinate (x, y) in image space (imgW x imgH) into percentage coordinates
 * inside a container rendered with CSS `object-cover object-top` (equivalent to SVG
 * `preserveAspectRatio="xMidYMin slice"`).
 */
export function projectImagePointToCoverPercent(
  x: number,
  y: number,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number
): ProjectedPinPosition {
  if (imgW <= 0 || imgH <= 0 || frameW <= 0 || frameH <= 0) {
    return { leftPct: 50, topPct: 50, visible: false };
  }

  const scale = Math.max(frameW / imgW, frameH / imgH);
  const renderedW = imgW * scale;
  const offsetX = (frameW - renderedW) / 2;
  const offsetY = 0; // object-top aligns vertical origin to top edge

  const fx = x * scale + offsetX;
  const fy = y * scale + offsetY;

  const rawLeft = (fx / frameW) * 100;
  const rawTop = (fy / frameH) * 100;

  const visible = rawLeft >= -2 && rawLeft <= 102 && rawTop >= -2 && rawTop <= 102;

  return {
    leftPct: Number(clamp(rawLeft, 7, 93).toFixed(2)),
    topPct: Number(clamp(rawTop, 13, 86).toFixed(2)),
    visible,
  };
}

function pt(lm: Array<[number, number, number]>, idx: number): Point2D {
  return { x: lm[idx][0], y: lm[idx][1] };
}

function lerpPt(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function smoothPath(points: Point2D[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

function makeSweepArrow(
  points: Point2D[],
  stroke: string,
  opacity = 0.85
): GuideSweepArrow {
  const n = points.length;
  const tip = points[n - 1];
  const prev = points[Math.max(0, n - 2)];
  const angleDeg = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;
  return {
    d: smoothPath(points),
    tipX: tip.x,
    tipY: tip.y,
    angleDeg: Number(angleDeg.toFixed(1)),
    stroke,
    opacity,
  };
}

const OUTER_LIP_INDICES = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
];

function getZonePaletteColors(
  undertone: SeasonClassification["undertone"],
  blendedTargets?: { lip: string; blush: string; eyeshadow: string }
) {
  const contour =
    undertone === "Cool (Pink/Blue)"
      ? "#574845"
      : undertone === "Warm (Golden)"
        ? "#735139"
        : "#654E42";
  const contourGuide = undertone === "Cool (Pink/Blue)" ? "#E9DDD9" : "#F5E7DA";
  const highlight = undertone === "Cool (Pink/Blue)" ? "#FFF6FA" : "#FFFBEB";
  const blush =
    blendedTargets?.blush ??
    (undertone === "Cool (Pink/Blue)"
      ? "#E27D9E"
      : undertone === "Warm (Golden)"
        ? "#EC836B"
        : "#E4817E");
  const eyeshadow =
    blendedTargets?.eyeshadow ??
    (undertone === "Cool (Pink/Blue)" ? "#A57982" : "#AD7D60");
  const eyeDepth = undertone === "Cool (Pink/Blue)" ? "#6E4B53" : "#7B513A";
  const liner = "#3D2319";
  const hair = "#FFF7ED";
  const lip = blendedTargets?.lip ?? "#C95A66";

  return { contour, contourGuide, highlight, blush, eyeshadow, eyeDepth, liner, hair, lip };
}

/**
 * Builds anatomically anchored SVG guide curves, radial cloud blush, directional brush-sweep
 * arrows, highlight points, and 5 spatially separated interactive pin positions in image
 * coordinate space. Supports both MediaPipe 468/478 neural landmarks and fallback boxes.
 */
export function buildFaceGuideGeometry(params: {
  width: number;
  height: number;
  neuralLandmarks: Array<[number, number, number]> | null;
  box: FaceLandmarksBox;
  faceShape: FaceShapeName;
  undertone: SeasonClassification["undertone"];
  blendedTargets?: { lip: string; blush: string; eyeshadow: string };
}): FaceGuideGeometry {
  const { width, height, neuralLandmarks: lm, box, faceShape, undertone, blendedTargets } = params;
  const colors = getZonePaletteColors(undertone, blendedTargets);
  const hasNeural = Boolean(lm && lm.length >= 468);

  let faceW: number;
  let faceH: number;
  let cx: number;
  let foreheadTop: Point2D;
  let leftTemple: Point2D;
  let rightTemple: Point2D;
  let leftCheekOuter: Point2D;
  let rightCheekOuter: Point2D;
  let leftCheekMid: Point2D;
  let rightCheekMid: Point2D;
  let leftJaw: Point2D;
  let rightJaw: Point2D;
  let chin: Point2D;

  let leftEyeOuter: Point2D;
  let leftEyeInner: Point2D;
  let leftEyeTop: Point2D;
  let leftEyeBottom: Point2D;
  let rightEyeOuter: Point2D;
  let rightEyeInner: Point2D;
  let rightEyeTop: Point2D;
  let rightEyeBottom: Point2D;

  let leftBrowInner: Point2D;
  let leftBrowPeak: Point2D;
  let leftBrowOuter: Point2D;
  let rightBrowInner: Point2D;
  let rightBrowPeak: Point2D;
  let rightBrowOuter: Point2D;

  let noseBridgeTop: Point2D;
  let noseBridgeMid: Point2D;
  let noseTip: Point2D;
  let noseUnderTip: Point2D;
  let noseLeftSide: Point2D;
  let noseRightSide: Point2D;
  let noseLeftAlar: Point2D;
  let noseRightAlar: Point2D;

  let lipTop: Point2D;
  let lipBottom: Point2D;
  let lipLeft: Point2D;
  let lipRight: Point2D;
  let lipCenter: Point2D;
  let lipPolygonPts: Point2D[];

  if (hasNeural && lm) {
    leftCheekOuter = pt(lm, 234);
    rightCheekOuter = pt(lm, 454);
    foreheadTop = pt(lm, 10);
    chin = pt(lm, 152);
    faceW = Math.max(
      24,
      Math.hypot(rightCheekOuter.x - leftCheekOuter.x, rightCheekOuter.y - leftCheekOuter.y)
    );
    faceH = Math.max(30, Math.hypot(chin.x - foreheadTop.x, chin.y - foreheadTop.y));
    cx = (leftCheekOuter.x + rightCheekOuter.x) / 2;

    leftTemple = pt(lm, 54);
    rightTemple = pt(lm, 284);
    leftCheekMid = pt(lm, 116);
    rightCheekMid = pt(lm, 345);
    leftJaw = pt(lm, 172);
    rightJaw = pt(lm, 397);

    leftEyeOuter = pt(lm, 33);
    leftEyeInner = pt(lm, 133);
    leftEyeTop = pt(lm, 159);
    leftEyeBottom = pt(lm, 145);

    rightEyeInner = pt(lm, 362);
    rightEyeOuter = pt(lm, 263);
    rightEyeTop = pt(lm, 386);
    rightEyeBottom = pt(lm, 374);

    leftBrowInner = pt(lm, 55);
    leftBrowPeak = pt(lm, 105);
    leftBrowOuter = pt(lm, 70);
    rightBrowInner = pt(lm, 285);
    rightBrowPeak = pt(lm, 334);
    rightBrowOuter = pt(lm, 300);

    noseBridgeTop = pt(lm, 6);
    noseBridgeMid = pt(lm, 197);
    noseTip = pt(lm, 1);
    noseUnderTip = pt(lm, 2);
    noseLeftSide = pt(lm, 114);
    noseRightSide = pt(lm, 343);
    noseLeftAlar = pt(lm, 48);
    noseRightAlar = pt(lm, 278);

    lipTop = pt(lm, 0);
    lipBottom = pt(lm, 17);
    lipLeft = pt(lm, 61);
    lipRight = pt(lm, 291);
    lipCenter = lerpPt(pt(lm, 13), pt(lm, 14), 0.5);
    lipPolygonPts = OUTER_LIP_INDICES.map((i) => pt(lm, i));
  } else {
    cx = box.centerX * width;
    const cy = box.centerY * height;
    faceW = Math.max(36, box.faceWidth * width);
    faceH = Math.max(44, box.faceHeight * height);
    const rx = faceW / 2;
    const ry = faceH / 2;

    foreheadTop = { x: cx, y: cy - ry * 0.88 };
    chin = { x: cx, y: cy + ry * 0.92 };
    leftCheekOuter = { x: cx - rx * 0.94, y: cy + ry * 0.04 };
    rightCheekOuter = { x: cx + rx * 0.94, y: cy + ry * 0.04 };
    leftTemple = { x: cx - rx * 0.78, y: cy - ry * 0.56 };
    rightTemple = { x: cx + rx * 0.78, y: cy - ry * 0.56 };
    leftCheekMid = { x: cx - rx * 0.56, y: cy + ry * 0.14 };
    rightCheekMid = { x: cx + rx * 0.56, y: cy + ry * 0.14 };
    leftJaw = { x: cx - rx * 0.68, y: cy + ry * 0.56 };
    rightJaw = { x: cx + rx * 0.68, y: cy + ry * 0.56 };

    const eyeY = cy - ry * 0.14;
    leftEyeOuter = { x: cx - rx * 0.56, y: eyeY };
    leftEyeInner = { x: cx - rx * 0.2, y: eyeY };
    leftEyeTop = { x: cx - rx * 0.38, y: eyeY - ry * 0.07 };
    leftEyeBottom = { x: cx - rx * 0.38, y: eyeY + ry * 0.06 };

    rightEyeInner = { x: cx + rx * 0.2, y: eyeY };
    rightEyeOuter = { x: cx + rx * 0.56, y: eyeY };
    rightEyeTop = { x: cx + rx * 0.38, y: eyeY - ry * 0.07 };
    rightEyeBottom = { x: cx + rx * 0.38, y: eyeY + ry * 0.06 };

    leftBrowInner = { x: cx - rx * 0.16, y: eyeY - ry * 0.17 };
    leftBrowPeak = { x: cx - rx * 0.44, y: eyeY - ry * 0.23 };
    leftBrowOuter = { x: cx - rx * 0.62, y: eyeY - ry * 0.17 };
    rightBrowInner = { x: cx + rx * 0.16, y: eyeY - ry * 0.17 };
    rightBrowPeak = { x: cx + rx * 0.44, y: eyeY - ry * 0.23 };
    rightBrowOuter = { x: cx + rx * 0.62, y: eyeY - ry * 0.17 };

    noseBridgeTop = { x: cx, y: eyeY - ry * 0.02 };
    noseBridgeMid = { x: cx, y: cy + ry * 0.02 };
    noseTip = { x: cx, y: cy + ry * 0.17 };
    noseUnderTip = { x: cx, y: cy + ry * 0.23 };
    noseLeftSide = { x: cx - rx * 0.11, y: cy + ry * 0.03 };
    noseRightSide = { x: cx + rx * 0.11, y: cy + ry * 0.03 };
    noseLeftAlar = { x: cx - rx * 0.17, y: cy + ry * 0.19 };
    noseRightAlar = { x: cx + rx * 0.17, y: cy + ry * 0.19 };

    const lipY = box.lipCenterY * height;
    const lipHalfW = Math.max(10, (box.lipWidth * width) / 2);
    const lipHalfH = Math.max(5, ry * 0.11);
    lipTop = { x: cx, y: lipY - lipHalfH };
    lipBottom = { x: cx, y: lipY + lipHalfH };
    lipLeft = { x: cx - lipHalfW, y: lipY };
    lipRight = { x: cx + lipHalfW, y: lipY };
    lipCenter = { x: cx, y: lipY };
    lipPolygonPts = [
      lipLeft,
      { x: cx - lipHalfW * 0.45, y: lipY - lipHalfH * 0.9 },
      lipTop,
      { x: cx + lipHalfW * 0.45, y: lipY - lipHalfH * 0.9 },
      lipRight,
      { x: cx + lipHalfW * 0.5, y: lipY + lipHalfH * 0.9 },
      lipBottom,
      { x: cx - lipHalfW * 0.5, y: lipY + lipHalfH * 0.9 },
    ];
  }

  const strokeUnit = Math.max(1.8, faceW * 0.015);

  // 1. Hair & Bangs Framing Guide (graceful S-curve curtain bangs draping past cheekbones/jaw)
  const hairStrokes: GuideStrokePath[] = [];
  const hairDots: GuideDot[] = [];
  const hairlineY = Math.max(6, foreheadTop.y - faceH * 0.09);
  const crownLiftY = Math.max(4, foreheadTop.y - faceH * 0.18);
  const partX = faceShape === "Round" || faceShape === "Square" ? cx - faceW * 0.1 : cx;

  const leftBangMid = { x: leftCheekOuter.x - faceW * 0.01, y: leftCheekOuter.y - faceH * 0.04 };
  const rightBangMid = { x: rightCheekOuter.x + faceW * 0.01, y: rightCheekOuter.y - faceH * 0.04 };
  const leftBangEnd =
    faceShape === "Square"
      ? { x: leftJaw.x - faceW * 0.04, y: leftJaw.y + faceH * 0.04 }
      : faceShape === "Round"
        ? { x: leftCheekOuter.x - faceW * 0.05, y: leftCheekOuter.y + faceH * 0.2 }
        : { x: leftCheekOuter.x - faceW * 0.05, y: leftCheekOuter.y + faceH * 0.11 };
  const rightBangEnd =
    faceShape === "Square"
      ? { x: rightJaw.x + faceW * 0.04, y: rightJaw.y + faceH * 0.04 }
      : faceShape === "Round"
        ? { x: rightCheekOuter.x + faceW * 0.05, y: rightCheekOuter.y + faceH * 0.2 }
        : { x: rightCheekOuter.x + faceW * 0.05, y: rightCheekOuter.y + faceH * 0.11 };

  hairStrokes.push(
    {
      d: smoothPath([
        { x: partX, y: hairlineY },
        { x: leftTemple.x - faceW * 0.04, y: leftTemple.y - faceH * 0.06 },
        leftBangMid,
        leftBangEnd,
      ]),
      stroke: colors.hair,
      strokeWidth: strokeUnit * 1.35,
      opacity: 0.9,
      dashed: true,
    },
    {
      d: smoothPath([
        { x: partX, y: hairlineY },
        { x: rightTemple.x + faceW * 0.04, y: rightTemple.y - faceH * 0.06 },
        rightBangMid,
        rightBangEnd,
      ]),
      stroke: colors.hair,
      strokeWidth: strokeUnit * 1.35,
      opacity: 0.9,
      dashed: true,
    }
  );

  if (faceShape === "Oblong" || faceShape === "Heart") {
    const bangY = lerpPt(foreheadTop, noseBridgeTop, 0.44).y;
    hairStrokes.push({
      d: smoothPath([
        { x: leftTemple.x + faceW * 0.05, y: bangY - faceH * 0.02 },
        { x: cx, y: bangY + faceH * 0.015 },
        { x: rightTemple.x - faceW * 0.05, y: bangY - faceH * 0.02 },
      ]),
      stroke: "#FDE68A",
      strokeWidth: strokeUnit * 1.2,
      opacity: 0.88,
      dashed: true,
    });
  } else {
    hairStrokes.push({
      d: smoothPath([
        { x: leftTemple.x - faceW * 0.02, y: Math.max(6, foreheadTop.y - faceH * 0.09) },
        { x: cx, y: crownLiftY },
        { x: rightTemple.x + faceW * 0.02, y: Math.max(6, foreheadTop.y - faceH * 0.09) },
      ]),
      stroke: "#FDE68A",
      strokeWidth: strokeUnit * 1.15,
      opacity: 0.86,
      dashed: true,
    });
  }

  hairDots.push({
    x: partX,
    y: hairlineY,
    r: strokeUnit * 1.3,
    fill: "#FFFBEB",
    opacity: 0.94,
    glow: true,
  });

  // 2. Eye Makeup Guide (layered matte eyeshadow + outer-V depth + brow arch hint + brush sweep arrows + crisp thin brown wing)
  const leftEyeW = Math.max(
    10,
    Math.hypot(leftEyeInner.x - leftEyeOuter.x, leftEyeInner.y - leftEyeOuter.y)
  );
  const rightEyeW = Math.max(
    10,
    Math.hypot(rightEyeOuter.x - rightEyeInner.x, rightEyeOuter.y - rightEyeInner.y)
  );
  const lidLiftL = leftEyeW * 0.27;
  const lidLiftR = rightEyeW * 0.27;
  const browArchLift = faceShape === "Round" ? faceH * 0.014 : faceShape === "Oblong" ? -faceH * 0.008 : 0;

  const eyeStrokes: GuideStrokePath[] = [
    // Subtle face-shape brow arch reference curve
    {
      d: smoothPath([
        leftBrowInner,
        { x: leftBrowPeak.x, y: leftBrowPeak.y - browArchLift },
        leftBrowOuter,
      ]),
      stroke: "#FDE68A",
      strokeWidth: strokeUnit * 0.85,
      opacity: 0.62,
      dashed: true,
    },
    {
      d: smoothPath([
        rightBrowInner,
        { x: rightBrowPeak.x, y: rightBrowPeak.y - browArchLift },
        rightBrowOuter,
      ]),
      stroke: "#FDE68A",
      strokeWidth: strokeUnit * 0.85,
      opacity: 0.62,
      dashed: true,
    },
    // Soft matte base eyeshadow arc 2–3mm above upper crease
    {
      d: smoothPath([
        { x: leftEyeInner.x - leftEyeW * 0.05, y: leftEyeTop.y - lidLiftL * 0.45 },
        { x: leftEyeTop.x, y: leftEyeTop.y - lidLiftL },
        { x: leftEyeOuter.x - leftEyeW * 0.14, y: leftEyeOuter.y - lidLiftL * 0.45 },
      ]),
      stroke: colors.eyeshadow,
      strokeWidth: strokeUnit * 3.4,
      opacity: 0.64,
      blur: true,
      crispOutline: colors.contourGuide,
    },
    {
      d: smoothPath([
        { x: rightEyeInner.x + rightEyeW * 0.05, y: rightEyeTop.y - lidLiftR * 0.45 },
        { x: rightEyeTop.x, y: rightEyeTop.y - lidLiftR },
        { x: rightEyeOuter.x + rightEyeW * 0.14, y: rightEyeOuter.y - lidLiftR * 0.45 },
      ]),
      stroke: colors.eyeshadow,
      strokeWidth: strokeUnit * 3.4,
      opacity: 0.64,
      blur: true,
      crispOutline: colors.contourGuide,
    },
    // Outer-V depth shading accent at outer 1/3 corner
    {
      d: smoothPath([
        { x: leftEyeOuter.x + leftEyeW * 0.16, y: leftEyeTop.y - lidLiftL * 0.65 },
        { x: leftEyeOuter.x - leftEyeW * 0.08, y: leftEyeOuter.y - lidLiftL * 0.12 },
        { x: leftEyeOuter.x + leftEyeW * 0.12, y: leftEyeBottom.y + leftEyeW * 0.05 },
      ]),
      stroke: colors.eyeDepth,
      strokeWidth: strokeUnit * 2.1,
      opacity: 0.56,
      blur: true,
    },
    {
      d: smoothPath([
        { x: rightEyeOuter.x - rightEyeW * 0.16, y: rightEyeTop.y - lidLiftR * 0.65 },
        { x: rightEyeOuter.x + rightEyeW * 0.08, y: rightEyeOuter.y - lidLiftR * 0.12 },
        { x: rightEyeOuter.x - rightEyeW * 0.12, y: rightEyeBottom.y + rightEyeW * 0.05 },
      ]),
      stroke: colors.eyeDepth,
      strokeWidth: strokeUnit * 2.1,
      opacity: 0.56,
      blur: true,
    },
    // Thin natural brown eyeliner wing at outer 1/3 only
    {
      d: smoothPath([
        lerpPt(leftEyeTop, leftEyeOuter, 0.42),
        leftEyeOuter,
        { x: leftEyeOuter.x - leftEyeW * 0.26, y: leftEyeOuter.y - leftEyeW * 0.09 },
      ]),
      stroke: colors.liner,
      strokeWidth: strokeUnit * 1.2,
      opacity: 0.94,
    },
    {
      d: smoothPath([
        lerpPt(rightEyeTop, rightEyeOuter, 0.42),
        rightEyeOuter,
        { x: rightEyeOuter.x + rightEyeW * 0.26, y: rightEyeOuter.y - rightEyeW * 0.09 },
      ]),
      stroke: colors.liner,
      strokeWidth: strokeUnit * 1.2,
      opacity: 0.94,
    },
  ];

  // Delicate curved brush-sweep arrows showing outward-upward eyeshadow blending direction
  const eyeArrows: GuideSweepArrow[] = [
    makeSweepArrow(
      [
        { x: leftEyeTop.x + leftEyeW * 0.12, y: leftEyeTop.y - lidLiftL * 1.25 },
        { x: leftEyeTop.x - leftEyeW * 0.18, y: leftEyeTop.y - lidLiftL * 1.38 },
        { x: leftEyeOuter.x - leftEyeW * 0.18, y: leftEyeOuter.y - lidLiftL * 0.85 },
      ],
      "#FFF7ED",
      0.88
    ),
    makeSweepArrow(
      [
        { x: rightEyeTop.x - rightEyeW * 0.12, y: rightEyeTop.y - lidLiftR * 1.25 },
        { x: rightEyeTop.x + rightEyeW * 0.18, y: rightEyeTop.y - lidLiftR * 1.38 },
        { x: rightEyeOuter.x + rightEyeW * 0.18, y: rightEyeOuter.y - lidLiftR * 0.85 },
      ],
      "#FFF7ED",
      0.88
    ),
  ];

  const eyeDots: GuideDot[] = [
    {
      x: leftEyeInner.x,
      y: leftEyeInner.y + leftEyeW * 0.05,
      r: strokeUnit * 1.05,
      fill: colors.highlight,
      opacity: 0.92,
      glow: true,
    },
    {
      x: rightEyeInner.x,
      y: rightEyeInner.y + rightEyeW * 0.05,
      r: strokeUnit * 1.05,
      fill: colors.highlight,
      opacity: 0.92,
      glow: true,
    },
    {
      x: leftEyeBottom.x,
      y: leftEyeBottom.y + leftEyeW * 0.14,
      r: strokeUnit * 0.9,
      fill: colors.highlight,
      opacity: 0.84,
      glow: true,
    },
    {
      x: rightEyeBottom.x,
      y: rightEyeBottom.y + rightEyeW * 0.14,
      r: strokeUnit * 0.9,
      fill: colors.highlight,
      opacity: 0.84,
      glow: true,
    },
  ];

  // 3. Nose Contour & 2-Point Highlight Guide (C-curves + directional downward sweep arrows + tip V + vertical teardrop bridge glow)
  const leftNoseEnd = {
    x: noseLeftSide.x + (noseBridgeMid.x - noseLeftSide.x) * 0.2,
    y: noseLeftSide.y + faceH * 0.05,
  };
  const rightNoseEnd = {
    x: noseRightSide.x - (noseRightSide.x - noseBridgeMid.x) * 0.2,
    y: noseRightSide.y + faceH * 0.05,
  };

  const noseStrokes: GuideStrokePath[] = [
    {
      d: smoothPath([leftBrowInner, lerpPt(leftBrowInner, noseLeftSide, 0.55), leftNoseEnd]),
      stroke: colors.contour,
      strokeWidth: strokeUnit * 3.0,
      opacity: 0.74,
      blur: true,
      crispOutline: colors.contourGuide,
    },
    {
      d: smoothPath([rightBrowInner, lerpPt(rightBrowInner, noseRightSide, 0.55), rightNoseEnd]),
      stroke: colors.contour,
      strokeWidth: strokeUnit * 3.0,
      opacity: 0.74,
      blur: true,
      crispOutline: colors.contourGuide,
    },
    {
      d: smoothPath([
        lerpPt(noseLeftAlar, noseTip, 0.2),
        noseUnderTip,
        lerpPt(noseRightAlar, noseTip, 0.2),
      ]),
      stroke: colors.contour,
      strokeWidth: strokeUnit * 2.5,
      opacity: 0.74,
      blur: true,
      crispOutline: colors.contourGuide,
    },
  ];

  const noseArrows: GuideSweepArrow[] = [
    makeSweepArrow(
      [
        { x: leftBrowInner.x - faceW * 0.02, y: leftBrowInner.y + faceH * 0.02 },
        { x: lerpPt(leftBrowInner, noseLeftSide, 0.55).x - faceW * 0.015, y: lerpPt(leftBrowInner, noseLeftSide, 0.55).y + faceH * 0.01 },
        { x: leftNoseEnd.x - faceW * 0.012, y: leftNoseEnd.y + faceH * 0.01 },
      ],
      "#F5E7DA",
      0.82
    ),
    makeSweepArrow(
      [
        { x: rightBrowInner.x + faceW * 0.02, y: rightBrowInner.y + faceH * 0.02 },
        { x: lerpPt(rightBrowInner, noseRightSide, 0.55).x + faceW * 0.015, y: lerpPt(rightBrowInner, noseRightSide, 0.55).y + faceH * 0.01 },
        { x: rightNoseEnd.x + faceW * 0.012, y: rightNoseEnd.y + faceH * 0.01 },
      ],
      "#F5E7DA",
      0.82
    ),
  ];

  const noseDots: GuideDot[] = [
    {
      x: noseBridgeTop.x,
      y: lerpPt(noseBridgeTop, noseBridgeMid, 0.42).y,
      r: strokeUnit * 1.15,
      ry: strokeUnit * 2.15,
      fill: colors.highlight,
      opacity: 0.96,
      glow: true,
    },
    {
      x: noseTip.x,
      y: noseTip.y - faceH * 0.012,
      r: strokeUnit * 1.55,
      fill: colors.highlight,
      opacity: 0.96,
      glow: true,
    },
  ];

  // 4. Cheek Blush Cloud + Directional Brush Sweep Arrows + Face-Shape Jaw/Temple Contour
  const cheekBlobs: GuideEllipseBlob[] = [];
  const cheekStrokes: GuideStrokePath[] = [];
  const cheekArrows: GuideSweepArrow[] = [];
  const cheekDots: GuideDot[] = [];

  const blushRx = faceW * (faceShape === "Oblong" ? 0.175 : 0.145);
  const blushRy = faceW * (faceShape === "Oblong" ? 0.08 : 0.095);
  const blushTilt =
    faceShape === "Round" || faceShape === "Square"
      ? 24
      : faceShape === "Oblong"
        ? 4
        : 14;

  const leftBlushCenter =
    faceShape === "Round" || faceShape === "Square"
      ? lerpPt(leftCheekMid, leftCheekOuter, 0.34)
      : lerpPt(leftCheekMid, noseLeftSide, 0.18);
  const rightBlushCenter =
    faceShape === "Round" || faceShape === "Square"
      ? lerpPt(rightCheekMid, rightCheekOuter, 0.34)
      : lerpPt(rightCheekMid, noseRightSide, 0.18);

  cheekBlobs.push(
    {
      cx: leftBlushCenter.x,
      cy: leftBlushCenter.y,
      rx: blushRx,
      ry: blushRy,
      rotateDeg: -blushTilt,
      fill: colors.blush,
      opacity: 0.72,
      outlineColor: "#FFE4E6",
      softRadial: true,
    },
    {
      cx: rightBlushCenter.x,
      cy: rightBlushCenter.y,
      rx: blushRx,
      ry: blushRy,
      rotateDeg: blushTilt,
      fill: colors.blush,
      opacity: 0.72,
      outlineColor: "#FFE4E6",
      softRadial: true,
    }
  );

  const sweepLiftY =
    faceShape === "Oblong"
      ? blushRy * 0.12
      : faceShape === "Round" || faceShape === "Square"
        ? blushRy * 0.68
        : blushRy * 0.42;
  cheekArrows.push(
    makeSweepArrow(
      [
        { x: leftBlushCenter.x + blushRx * 0.52, y: leftBlushCenter.y + sweepLiftY * 0.5 },
        { x: leftBlushCenter.x, y: leftBlushCenter.y - sweepLiftY * 0.15 },
        { x: leftBlushCenter.x - blushRx * 0.58, y: leftBlushCenter.y - sweepLiftY * 0.7 },
      ],
      "#FFF1F2",
      0.88
    ),
    makeSweepArrow(
      [
        { x: rightBlushCenter.x - blushRx * 0.52, y: rightBlushCenter.y + sweepLiftY * 0.5 },
        { x: rightBlushCenter.x, y: rightBlushCenter.y - sweepLiftY * 0.15 },
        { x: rightBlushCenter.x + blushRx * 0.58, y: rightBlushCenter.y - sweepLiftY * 0.7 },
      ],
      "#FFF1F2",
      0.88
    )
  );

  if (faceShape === "Heart") {
    cheekStrokes.push(
      {
        d: smoothPath([
          { x: leftTemple.x, y: leftTemple.y - faceH * 0.04 },
          { x: leftTemple.x - faceW * 0.02, y: leftTemple.y + faceH * 0.09 },
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.6,
        opacity: 0.66,
        blur: true,
        crispOutline: colors.contourGuide,
      },
      {
        d: smoothPath([
          { x: rightTemple.x, y: rightTemple.y - faceH * 0.04 },
          { x: rightTemple.x + faceW * 0.02, y: rightTemple.y + faceH * 0.09 },
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.6,
        opacity: 0.66,
        blur: true,
        crispOutline: colors.contourGuide,
      }
    );
  } else if (faceShape === "Oblong") {
    cheekStrokes.push(
      {
        d: smoothPath([
          { x: cx - faceW * 0.24, y: foreheadTop.y + faceH * 0.02 },
          { x: cx, y: foreheadTop.y + faceH * 0.01 },
          { x: cx + faceW * 0.24, y: foreheadTop.y + faceH * 0.02 },
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.4,
        opacity: 0.64,
        blur: true,
        crispOutline: colors.contourGuide,
      },
      {
        d: smoothPath([
          { x: chin.x - faceW * 0.14, y: chin.y - faceH * 0.02 },
          { x: chin.x, y: chin.y },
          { x: chin.x + faceW * 0.14, y: chin.y - faceH * 0.02 },
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.0,
        opacity: 0.66,
        blur: true,
        crispOutline: colors.contourGuide,
      }
    );
  } else if (faceShape === "Diamond") {
    cheekStrokes.push(
      {
        d: smoothPath([
          { x: leftCheekOuter.x + faceW * 0.02, y: leftCheekOuter.y - faceH * 0.05 },
          { x: leftCheekOuter.x + faceW * 0.04, y: leftCheekOuter.y + faceH * 0.12 },
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.6,
        opacity: 0.7,
        blur: true,
        crispOutline: colors.contourGuide,
      },
      {
        d: smoothPath([
          { x: rightCheekOuter.x - faceW * 0.02, y: rightCheekOuter.y - faceH * 0.05 },
          { x: rightCheekOuter.x - faceW * 0.04, y: rightCheekOuter.y + faceH * 0.12 },
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.6,
        opacity: 0.7,
        blur: true,
        crispOutline: colors.contourGuide,
      }
    );
  } else {
    const jawAlpha = faceShape === "Oval" ? 0.56 : 0.74;
    cheekStrokes.push(
      {
        d: smoothPath([
          lerpPt(leftCheekOuter, leftJaw, 0.35),
          leftJaw,
          lerpPt(leftJaw, chin, 0.55),
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.6,
        opacity: jawAlpha,
        blur: true,
        crispOutline: colors.contourGuide,
      },
      {
        d: smoothPath([
          lerpPt(rightCheekOuter, rightJaw, 0.35),
          rightJaw,
          lerpPt(rightJaw, chin, 0.55),
        ]),
        stroke: colors.contour,
        strokeWidth: strokeUnit * 3.6,
        opacity: jawAlpha,
        blur: true,
        crispOutline: colors.contourGuide,
      }
    );
  }

  if (faceShape === "Oblong") {
    cheekDots.push(
      {
        x: leftBlushCenter.x,
        y: leftBlushCenter.y - faceH * 0.055,
        r: strokeUnit * 1.4,
        fill: colors.highlight,
        opacity: 0.9,
        glow: true,
      },
      {
        x: rightBlushCenter.x,
        y: rightBlushCenter.y - faceH * 0.055,
        r: strokeUnit * 1.4,
        fill: colors.highlight,
        opacity: 0.9,
        glow: true,
      }
    );
  } else {
    cheekDots.push({
      x: chin.x,
      y: chin.y - faceH * 0.045,
      r: strokeUnit * 1.5,
      fill: colors.highlight,
      opacity: 0.92,
      glow: true,
    });
  }

  // 5. Lip Gradient & Cupid's Bow Guide
  const lipPolygons: GuidePolygonFill[] = [
    {
      points: lipPolygonPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
      fill: colors.lip,
      opacity: 0.44,
    },
  ];
  const lipStrokes: GuideStrokePath[] = [
    {
      d: smoothPath([
        lerpPt(lipLeft, lipCenter, 0.2),
        lipCenter,
        lerpPt(lipRight, lipCenter, 0.2),
      ]),
      stroke: colors.lip,
      strokeWidth: strokeUnit * 2.5,
      opacity: 0.72,
      blur: true,
    },
  ];
  const lipDots: GuideDot[] = [
    {
      x: lipTop.x,
      y: lipTop.y - faceH * 0.012,
      r: strokeUnit * 1.2,
      fill: colors.highlight,
      opacity: 0.94,
      glow: true,
    },
    {
      x: lipCenter.x,
      y: lerpPt(lipCenter, lipBottom, 0.5).y,
      r: strokeUnit * 1.25,
      fill: "#FFFFFF",
      opacity: 0.84,
      glow: true,
    },
  ];

  const pins: Record<FaceGuideZoneId, Point2D> = {
    hair: {
      x: lerpPt(foreheadTop, leftTemple, 0.72).x,
      y: Math.max(height * 0.14, foreheadTop.y + faceH * 0.03),
    },
    eyes: {
      x: rightEyeOuter.x + rightEyeW * 0.28,
      y: rightEyeTop.y - lidLiftR * 0.7,
    },
    nose: {
      x: noseBridgeMid.x,
      y: lerpPt(noseBridgeMid, noseTip, 0.4).y,
    },
    cheek_jaw: {
      x: lerpPt(leftCheekMid, leftJaw, 0.38).x,
      y: lerpPt(leftCheekMid, leftJaw, 0.38).y,
    },
    lips: {
      x: lipRight.x + faceW * 0.06,
      y: lipRight.y + faceH * 0.015,
    },
  };

  return {
    width,
    height,
    pins,
    visuals: {
      hair: { strokes: hairStrokes, arrows: [], dots: hairDots, blobs: [], polygons: [] },
      eyes: { strokes: eyeStrokes, arrows: eyeArrows, dots: eyeDots, blobs: [], polygons: [] },
      nose: { strokes: noseStrokes, arrows: noseArrows, dots: noseDots, blobs: [], polygons: [] },
      cheek_jaw: {
        strokes: cheekStrokes,
        arrows: cheekArrows,
        dots: cheekDots,
        blobs: cheekBlobs,
        polygons: [],
      },
      lips: { strokes: lipStrokes, arrows: [], dots: lipDots, blobs: [], polygons: lipPolygons },
    },
  };
}

function getHairGuidanceVi(faceShape: FaceShapeName): {
  titleVi: string;
  detectedCueVi: string;
  howToVi: string;
  avoidVi: string;
} {
  const shapeLabel = SHAPE_VI_LABELS[faceShape] ?? "Mặt Trái Xoan";
  switch (faceShape) {
    case "Round":
      return {
        titleVi: "Kiểu mái & tóc gọn mặt tròn",
        detectedCueVi: `${shapeLabel} · Ưu tiên phồng đỉnh đầu & che nhẹ gò má`,
        howToVi:
          "Rẽ ngôi lệch 6:4 hoặc 7:3, cắt mái bay layer dài quá gò má ôm nhẹ hai bên má. Đánh phồng chân tóc đỉnh đầu giúp kéo dài trục dọc gương mặt rõ rệt.",
        avoidVi: "Tránh cắt mái bằng dày sát chân mày hoặc ép tóc thẳng ép sát đỉnh đầu.",
      };
    case "Square":
      return {
        titleVi: "Kiểu mái & tóc làm mềm góc hàm",
        detectedCueVi: `${shapeLabel} · Ưu tiên đường cong ôm góc hàm`,
        howToVi:
          "Để mái bay dài uốn chữ S rủ xuống ngang xương hàm và tỉa layer uốn lơi nhẹ hai bên để che mềm góc hàm vuông một cách tự nhiên.",
        avoidVi: "Tránh cắt tóc bob ngang cằm ép thẳng vì dễ nhấn mạnh đường hàm ngang.",
      };
    case "Heart":
      return {
        titleVi: "Kiểu mái & tóc cân đối trán – cằm",
        detectedCueVi: `${shapeLabel} · Trán thoáng, cằm V-line nhỏ gọn`,
        howToVi:
          "Cắt mái thưa kiểu Hàn hoặc mái bay mỏng ôm hai bên thái dương để thu gọn độ rộng trán, uốn phồng nhẹ phần đuôi tóc ngang cằm.",
        avoidVi: "Tránh buộc tóc kéo căng hết phần thái dương làm trán lộ rộng hơn.",
      };
    case "Oblong":
      return {
        titleVi: "Kiểu mái & tóc rút gọn chiều dài mặt",
        detectedCueVi: `${shapeLabel} · Ưu tiên đường mái ngang & phồng hai bên`,
        howToVi:
          "Cắt mái thưa phủ nhẹ 1/2 trán kết hợp tóc tỉa tầng ngang vai uốn sóng lơi hai bên má để tạo cảm giác mặt bầu bĩnh, trẻ trung hơn.",
        avoidVi: "Tránh tóc quá dài thẳng đơ rẽ ngôi giữa không mái làm mặt trông dài hơn.",
      };
    case "Diamond":
      return {
        titleVi: "Kiểu mái & tóc dịu gò má cao",
        detectedCueVi: `${shapeLabel} · Gò má cao sắc nét, trán và cằm gọn`,
        howToVi:
          "Để mái bay dài chấm đỉnh gò má kết hợp mái thưa nhẹ phần trán giúp làm mềm độ nhô gò má và cân bằng vùng thái dương.",
        avoidVi: "Tránh rẽ ngôi giữa ép sát trán hoặc cắt layer quá ngắn dừng ngay đỉnh gò má.",
      };
    case "Oval":
    default:
      return {
        titleVi: "Kiểu mái & tóc tôn dáng trái xoan",
        detectedCueVi: `${shapeLabel} · Tỷ lệ hài hòa, hợp hầu hết kiểu tóc`,
        howToVi:
          "Mái bay nhẹ rẽ ngôi giữa hoặc mái thưa mỏng đều rất tôn gương mặt; chỉ cần giữ chân tóc đỉnh đầu hơi phồng tự nhiên là nhìn thanh thoát ngay.",
        avoidVi: "Tránh che kín toàn bộ trán và hai bên má làm mất lợi thế đường nét hài hòa.",
      };
  }
}

function getCheekJawHowToVi(faceShape: FaceShapeName, isFullFace: boolean): string {
  switch (faceShape) {
    case "Round":
      return "Quét cọ má hồng theo chiều mũi tên xéo từ gò má cao lên thái dương, rồi phớt thật mỏng phấn khối dọc rìa dưới xương hàm vào cằm và chấm sáng đầu cằm để mặt thon dài hơn.";
    case "Square":
      return "Tán má hồng theo mũi tên xéo hướng lên thái dương để nâng mặt, sau đó dùng cọ bông phớt khối mờ dọc hai góc xương hàm dưới giúp đường hàm mềm mại, thanh thoát hơn.";
    case "Heart":
      return "Đánh má hồng theo vùng oval dịu giữa bầu má, kết hợp phớt khối siêu mỏng sát hai bên thái dương và chấm sáng nhẹ đầu cằm để cân bằng trán – hàm.";
    case "Oblong":
      return "Tán má hồng theo chiều mũi tên ngang qua hai bên gò má và phớt khối mỏng sát chân tóc giữa trán + rìa dưới cằm giúp tỷ lệ mặt trông đầy đặn, trẻ trung hơn.";
    case "Diamond":
      return "Dặm má hồng mềm ngay dưới đỉnh gò má, phớt khối siêu mỏng ở rìa ngoài gò má hướng về mang tai và chấm sáng nhẹ đầu cằm để dịu độ sắc của gò má cao.";
    case "Oval":
    default:
      return isFullFace
        ? "Tán má hồng theo chiều mũi tên xéo hướng lên thái dương, rồi phớt thật mỏng phấn khối dọc rìa dưới xương hàm vào cằm để mặt gọn và ăn ảnh hơn."
        : "Dặm má hồng phớt mỏng theo hướng mũi tên nâng nhẹ trên gò má, quét lướt cực nhẹ phấn khối dưới viền hàm và chấm chút bắt sáng ở đầu cằm để giữ vẻ tươi tắn tự nhiên.";
  }
}

/**
 * Builds concise, natural Vietnamese student-friendly instructions & color legends
 * for each of the 5 interactive makeup routine layers (zero hex codes in copy).
 */
export function buildFaceGuideZones(
  report: ConsultationReport,
  analysis: VnFeatureAnalysisResult
): Record<FaceGuideZoneId, FaceGuideZoneContent> {
  const byId = Object.fromEntries(analysis.items.map((item) => [item.id, item]));
  const hc = buildVnHighlightContourPlan(report.faceShape, report.season.undertone);
  const colors = getZonePaletteColors(report.season.undertone, report.blendedTargets);
  const hair = getHairGuidanceVi(report.faceShape.primary);

  const eyeItem = byId.eyes;
  const noseItem = byId.nose;
  const fullnessItem = byId.face_fullness;

  const lipCue = report.lipMetrics.hasDarkLipBorder
    ? "Viền môi hơi sậm · Nên tán mờ viền trước khi tô lòng môi"
    : "Sắc môi tự nhiên · Hợp kiểu đánh lòng môi trong trẻo đi học";

  return {
    eyes: {
      id: "eyes",
      shortLabel: "Phấn mắt",
      pinLabel: "Mắt",
      swatchColor: colors.eyeshadow,
      stepNumber: 1,
      titleVi: "Tán phấn mắt & kẻ eyeliner mảnh",
      detectedCueVi: eyeItem?.detectedLabel ?? "Mắt tự nhiên · Ưu tiên mở chiều sâu",
      howToVi:
        eyeItem?.makeupFixVi ??
        "Tán phấn mắt lì theo chiều mũi tên loang cao hơn nếp mí 2–3mm khi mở mắt thẳng, kẻ chì nâu mảnh 1/3 đuôi mắt và chấm nhẹ nhũ mịn đầu mắt.",
      avoidVi:
        eyeItem?.avoidVi ??
        "Tránh kẻ đường eyeliner đen dày hết bầu mắt làm nuốt nếp mí.",
      legend: [
        { label: "Phấn mắt tạo hốc", swatchColor: colors.eyeshadow },
        { label: "Eyeliner nâu 1/3 đuôi", swatchColor: colors.liner },
        { label: "Sáng đầu mắt", swatchColor: colors.highlight },
      ],
    },
    cheek_jaw: {
      id: "cheek_jaw",
      shortLabel: "Má hồng",
      pinLabel: "Má",
      swatchColor: colors.blush,
      stepNumber: 2,
      titleVi: `Tán má hồng & viền hàm dáng ${hc.faceShapeVi.toLowerCase()}`,
      detectedCueVi: fullnessItem?.detectedLabel ?? hc.goalVi,
      howToVi: getCheekJawHowToVi(
        report.faceShape.primary,
        fullnessItem?.severity === "notable"
      ),
      avoidVi:
        fullnessItem?.avoidVi ??
        "Tránh đánh khối đậm ngay hõm má kiểu Âu Mỹ vì dễ làm mặt già và lộ vệt.",
      legend: [
        { label: "Vùng tán má hồng", swatchColor: colors.blush },
        { label: "Khối gọn mặt", swatchColor: colors.contour },
        { label: "Bắt sáng", swatchColor: colors.highlight },
      ],
    },
    nose: {
      id: "nose",
      shortLabel: "Khối mũi",
      pinLabel: "Mũi",
      swatchColor: colors.contour,
      stepNumber: 3,
      titleVi: "Tạo khối chữ C & bắt sáng 2 điểm",
      detectedCueVi: noseItem?.detectedLabel ?? "Tạo sống mũi thanh gọn tự nhiên",
      howToVi:
        noseItem?.makeupFixVi ??
        "Phớt nhẹ chữ C từ đầu chân mày xuống 1/3 sống mũi và chữ V thật nhỏ dưới đầu mũi. Chấm bắt sáng tách 2 điểm ở giữa sống mũi và chóp mũi.",
      avoidVi:
        noseItem?.avoidVi ??
        "Tránh kẻ 2 đường khối thẳng đậm kéo suốt chiều dài mũi gây giả.",
      legend: [
        { label: "Khối nâu xám mờ", swatchColor: colors.contour },
        { label: "Bắt sáng 2 điểm", swatchColor: colors.highlight },
      ],
    },
    lips: {
      id: "lips",
      shortLabel: "Môi",
      pinLabel: "Môi",
      swatchColor: colors.lip,
      stepNumber: 4,
      titleVi: "Đánh son lòng môi & bắt sáng nhân trung",
      detectedCueVi: lipCue,
      howToVi: report.lipMetrics.hasDarkLipBorder
        ? "Dặm nhẹ chút cushion thừa lên viền môi để làm mờ viền sậm, tô son đậm dần vào lòng môi rồi tán loang ra ngoài; chấm siêu nhẹ bắt sáng ở đỉnh nhân trung."
        : "Tô son tập trung ở lòng môi rồi bặm nhẹ tán loang mềm viền theo kiểu sinh viên Hàn – Việt; thêm một chấm bóng nhẹ giữa môi dưới giúp môi đầy đặn hơn.",
      avoidVi:
        "Tránh kẻ viền môi sắc cứng quá đậm khi đi học hằng ngày kẻo trông già dặn.",
      legend: [
        { label: "Son lòng môi", swatchColor: colors.lip },
        { label: "Sáng nhân trung", swatchColor: colors.highlight },
      ],
    },
    hair: {
      id: "hair",
      shortLabel: "Tóc/Mái",
      pinLabel: "Tóc",
      swatchColor: "#F59E0B",
      stepNumber: 5,
      titleVi: hair.titleVi,
      detectedCueVi: hair.detectedCueVi,
      howToVi: hair.howToVi,
      avoidVi: hair.avoidVi,
      legend: [
        { label: "Đường mái ôm mặt", swatchColor: colors.hair, dashed: true },
        { label: "Độ phồng / đường mái", swatchColor: "#FDE68A", dashed: true },
      ],
    },
  };
}
