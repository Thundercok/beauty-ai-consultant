export interface Point2D {
  x: number;
  y: number;
}

export type HeatmapZoneId = "brows" | "eyes" | "nose" | "cheeks" | "lips" | "jaw";

export type HeatmapSeverity = "balanced" | "mild" | "notable";

export interface AsymmetryHeatPoint {
  x: number;
  y: number;
  side: "left" | "right";
  zoneId: HeatmapZoneId;
  /** Normalized intensity in [0, 1] used to paint the Gaussian thermal splat */
  heat: number;
  /** Combined bilateral landmark delta as % of bizygomatic face width */
  deltaPct: number;
  horizontalDiffPct: number;
  verticalDiffPct: number;
  landmarkIndex: number;
}

export interface AsymmetryHeatZone {
  id: HeatmapZoneId;
  labelVi: string;
  severity: HeatmapSeverity;
  severityLabelVi: string;
  /** Representative heat intensity [0, 1] */
  heat: number;
  /** Mean horizontal width delta (% of face width) */
  horizontalDiffPct: number;
  /** Mean vertical height delta (% of face width) */
  verticalDiffPct: number;
  /** Peak combined landmark delta (% of face width) */
  maxDeltaPct: number;
  /** Mean combined landmark delta (% of face width) */
  combinedDeltaPct: number;
  higherSide: "left" | "right" | "even";
  widerSide: "left" | "right" | "even";
  /** Primary deviating-side hotspot coordinate in portrait pixel space */
  hotspotPx: Point2D;
  /** Mirror-side partner anchor coordinate in portrait pixel space */
  partnerPx: Point2D;
  /** Landmark cluster points on the image-left side (user's anatomical right in non-mirrored selfie) */
  leftPointsPx: Point2D[];
  /** Landmark cluster points on the image-right side */
  rightPointsPx: Point2D[];
  /** Radius in portrait pixels for the interactive hover halo */
  haloRadiusPx: number;
  /** Short, direct Vietnamese summary of what differs */
  summaryVi: string;
  /** Actionable, natural makeup repair advice */
  repairAdviceVi: string;
  /** Specific step-by-step technique cue */
  repairStepVi: string;
}

export interface FacialAsymmetryHeatmapData {
  available: boolean;
  /** Overall bilateral balance score (0..100) */
  overallScore: number;
  /** Roll angle compensated by the midline axis in degrees */
  headTiltDeg: number;
  faceWidthPx: number;
  midline: {
    top: Point2D;
    bottom: Point2D;
  };
  /** Zones sorted from highest variance (most heat) to lowest */
  zones: AsymmetryHeatZone[];
  /** Zones with mild or notable variance */
  highVarianceZones: AsymmetryHeatZone[];
  /** Per-landmark heat emitters (both sides) for canvas thermal field rendering */
  points: AsymmetryHeatPoint[];
  /** Short honest note about head angle & lighting */
  noteVi: string;
}

interface ZoneSpec {
  id: HeatmapZoneId;
  labelVi: string;
  /** Pairs of [imageLeftIdx, imageRightIdx] MediaPipe 478 landmark indices */
  pairs: ReadonlyArray<readonly [number, number]>;
  /** Scale multiplier for interactive hover halo relative to face width */
  haloScale: number;
}

const HEATMAP_ZONE_SPECS: ReadonlyArray<ZoneSpec> = [
  {
    id: "brows",
    labelVi: "Chân mày",
    pairs: [
      [70, 300],
      [63, 293],
      [105, 334],
      [66, 296],
      [107, 336],
    ],
    haloScale: 0.145,
  },
  {
    id: "eyes",
    labelVi: "Mắt & đuôi mắt",
    pairs: [
      [33, 263],
      [133, 362],
      [159, 386],
      [145, 374],
      [130, 359],
    ],
    haloScale: 0.13,
  },
  {
    id: "nose",
    labelVi: "Sống & cánh mũi",
    pairs: [
      [129, 358],
      [49, 279],
      [102, 331],
      [48, 278],
      [64, 294],
    ],
    haloScale: 0.105,
  },
  {
    id: "cheeks",
    labelVi: "Gò má",
    pairs: [
      [116, 345],
      [123, 352],
      [50, 280],
      [205, 425],
      [234, 454],
    ],
    haloScale: 0.165,
  },
  {
    id: "lips",
    labelVi: "Khóe & viền môi",
    pairs: [
      [61, 291],
      [37, 267],
      [39, 269],
      [40, 270],
      [84, 314],
    ],
    haloScale: 0.12,
  },
  {
    id: "jaw",
    labelVi: "Đường hàm",
    pairs: [
      [172, 397],
      [136, 365],
      [150, 379],
      [149, 378],
      [176, 400],
    ],
    haloScale: 0.16,
  },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPt(lm: Array<[number, number, number]>, idx: number): Point2D {
  const p = lm[idx];
  return { x: p[0], y: p[1] };
}

function centroid(pts: Point2D[]): Point2D {
  if (pts.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / pts.length, y: sy / pts.length };
}

/**
 * Maps a combined bilateral delta (% of bizygomatic width) into a perceptual [0, 1] heat score.
 * <= 0.8% -> ~0 (cool/balanced), ~2.4% -> ~0.48 (warm amber), >= 5.2% -> 1.0 (hot crimson).
 */
export function deltaPctToHeat(deltaPct: number): number {
  if (!Number.isFinite(deltaPct) || deltaPct <= 0.7) return 0;
  return clamp((deltaPct - 0.7) / 4.5, 0, 1);
}

/**
 * Perceptual thermal color ramp for the canvas heatmap overlay:
 * 0.00 -> transparent
 * 0.25 -> soft cool-blue / slate tint (subtle low variance)
 * 0.55 -> warm amber (#F59E0B)
 * 0.80 -> burnt orange (#EA580C)
 * 1.00 -> crisp crimson (#DC2626)
 */
export function heatToRgba(heatRaw: number): [number, number, number, number] {
  const t = clamp(Number.isFinite(heatRaw) ? heatRaw : 0, 0, 1);
  if (t <= 0.01) return [0, 0, 0, 0];

  type Stop = readonly [number, number, number, number, number];
  const stops: ReadonlyArray<Stop> = [
    [0.01, 56, 189, 248, 0],
    [0.18, 56, 189, 248, 52],
    [0.42, 250, 204, 21, 118],
    [0.7, 249, 115, 22, 168],
    [1.0, 220, 38, 38, 215],
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      // Smoothstep easing prevents harsh contour bands
      const s = f * f * (3 - 2 * f);
      return [
        Math.round(a[1] + (b[1] - a[1]) * s),
        Math.round(a[2] + (b[2] - a[2]) * s),
        Math.round(a[3] + (b[3] - a[3]) * s),
        Math.round(a[4] + (b[4] - a[4]) * s),
      ];
    }
  }
  return [220, 38, 38, 215];
}

function sideVi(side: "left" | "right"): string {
  return side === "left" ? "trái ảnh" : "phải ảnh";
}

function oppositeSide(side: "left" | "right"): "left" | "right" {
  return side === "left" ? "right" : "left";
}

function buildZoneAdvice(
  zoneId: HeatmapZoneId,
  severity: HeatmapSeverity,
  hDiffPct: number,
  vDiffPct: number,
  higherSide: "left" | "right" | "even",
  widerSide: "left" | "right" | "even"
): { summaryVi: string; repairAdviceVi: string; repairStepVi: string } {
  if (severity === "balanced") {
    switch (zoneId) {
      case "brows":
        return {
          summaryVi: "Hai bên chân mày khá đều nhau.",
          repairAdviceVi: "Chỉ cần chải gel giữ nếp và dặm nhẹ chỗ thưa, không cần chỉnh dáng.",
          repairStepVi: "Dùng chì mảnh đi theo khung mày sẵn có, giữ phần đầu mày nhạt.",
        };
      case "eyes":
        return {
          summaryVi: "Độ cao và đuôi mắt hai bên cân đối.",
          repairAdviceVi: "Kẻ viền mí sát chân mi và tán phấn mắt đều tay hai bên là đẹp tự nhiên.",
          repairStepVi: "Chuốt mascara tập trung giữa mi để mắt mở to mà không làm lệch đuôi.",
        };
      case "nose":
        return {
          summaryVi: "Sống và hai bên cánh mũi cân xứng.",
          repairAdviceVi: "Tạo khối sống mũi thật nhẹ tay ở hốc mắt và đầu mũi nếu muốn gọn hơn.",
          repairStepVi: "Chấm bắt sáng nhỏ ở chóp mũi thay vì kéo một đường dài dễ lộ phấn.",
        };
      case "cheeks":
        return {
          summaryVi: "Hai bên gò má đều độ đầy và độ cao.",
          repairAdviceVi: "Tán má hồng đối xứng từ giữa gò má chếch nhẹ lên thái dương.",
          repairStepVi: "Dùng cọ bông sạch tán lại viền má để màu tiệp vào da.",
        };
      case "lips":
        return {
          summaryVi: "Khóe môi và viền môi cân đối hai bên.",
          repairAdviceVi: "Tán son lòng môi hoặc phủ toàn môi theo viền tự nhiên đều hài hòa.",
          repairStepVi: "Dùng tăm bông làm mềm viền môi trên để gương mặt trông nhẹ nhàng hơn.",
        };
      case "jaw":
        return {
          summaryVi: "Đường viền hàm hai bên tương đối cân nhau.",
          repairAdviceVi: "Nếu cần gọn mặt, phủ nhẹ phấn tạo khối dưới xương hàm đều hai bên.",
          repairStepVi: "Tán hướng xuống vùng cổ để không tạo vệt đậm ở quai hàm.",
        };
    }
  }

  const highName = higherSide === "even" ? "một bên" : sideVi(higherSide);
  const lowSide: "left" | "right" = higherSide === "left" ? "right" : "left";
  const lowName = sideVi(lowSide);
  const wideName = widerSide === "even" ? "một bên" : sideVi(widerSide);
  const narrowName = widerSide === "even" ? "bên còn lại" : sideVi(oppositeSide(widerSide));

  switch (zoneId) {
    case "brows":
      return {
        summaryVi:
          higherSide !== "even"
            ? `Mày bên ${highName} đang nhỉnh cao hơn khoảng ${vDiffPct.toFixed(1)}%.`
            : `Độ dài hoặc khoảng cách hai bên mày chênh khoảng ${hDiffPct.toFixed(1)}%.`,
        repairAdviceVi:
          higherSide !== "even"
            ? `Nâng nhẹ viền trên mày bên ${lowName} và tỉa gọn sợi thừa sát viền trên bên ${highName}.`
            : `Kéo đuôi mày bên ${narrowName} dài thêm 1–2 mm để khung mày cân hai bên.`,
        repairStepVi:
          higherSide !== "even"
            ? `Chải gel hướng lên ở mày bên ${lowName}; chấm chút che khuyết điểm ngay dưới cung mày bên ${highName} để mắt nhìn đều tầm nhau.`
            : "Đo điểm đầu và đuôi mày theo cánh mũi bằng thân cọ trước khi gẩy sợi.",
      };

    case "eyes":
      return {
        summaryVi:
          higherSide !== "even"
            ? `Đuôi mắt bên ${highName} cao hơn bên ${lowName} khoảng ${vDiffPct.toFixed(1)}%.`
            : `Độ mở ngang hai bên mắt chênh nhẹ khoảng ${hDiffPct.toFixed(1)}%.`,
        repairAdviceVi:
          higherSide !== "even"
            ? `Kẻ eyeliner hất nhẹ đuôi ở mắt bên ${lowName}, còn bên ${highName} đi đường ngang sát chân mi.`
            : `Tán phấn nâu nhạt rộng hơn một chút ở đuôi mắt bên ${narrowName} để kéo cân chiều ngang.`,
        repairStepVi:
          "Nhìn thẳng vào gương khi vẽ đuôi eyeliner thay vì kéo căng mí mắt sang ngang.",
      };

    case "nose":
      return {
        summaryVi:
          widerSide !== "even"
            ? `Cánh mũi bên ${wideName} rộng hơn nhẹ (lệch ${hDiffPct.toFixed(1)}%).`
            : `Hai bên cánh mũi có độ cao lệch nhẹ (${vDiffPct.toFixed(1)}%).`,
        repairAdviceVi:
          widerSide !== "even"
            ? `Đi đường tạo khối mảnh hơn sát sống mũi bên ${wideName} và đặt highlight hơi lệch nhẹ về phía ${narrowName}.`
            : `Phủ phấn khối nâu xám thật nhẹ dưới cánh mũi bên thấp để kéo đều trục mũi.`,
        repairStepVi:
          "Dùng cọ đầu nhỏ tông nâu xám lạnh (taupe), tránh phấn nâu cam dễ làm sống mũi bị đục.",
      };

    case "cheeks":
      return {
        summaryVi:
          widerSide !== "even"
            ? `Gò má bên ${wideName} đầy hơn bên ${narrowName} (${hDiffPct.toFixed(1)}%).`
            : `Độ cao gò má hai bên lệch khoảng ${vDiffPct.toFixed(1)}%.`,
        repairAdviceVi:
          widerSide !== "even"
            ? `Tán phấn khối mỏng dọc rìa ngoài má bên ${wideName}, còn má hồng bên ${narrowName} đánh cao và tròn hơn một chút.`
            : `Đặt tâm má hồng bên ${lowName} cao hơn bên ${highName} khoảng 5 mm để nâng gò má đồng đều.`,
        repairStepVi:
          "Mỉm cười nhẹ để xác định đỉnh má nhưng tán phấn khi mặt thả lỏng để không bị xệ.",
      };

    case "lips":
      return {
        summaryVi:
          higherSide !== "even"
            ? `Khóe môi bên ${highName} nhếch cao hơn khoảng ${vDiffPct.toFixed(1)}%.`
            : `Độ rộng khóe môi hai bên lệch khoảng ${hDiffPct.toFixed(1)}%.`,
        repairAdviceVi:
          higherSide !== "even"
            ? `Dùng che khuyết điểm làm gọn khóe dưới bên ${lowName} rồi viền nhẹ nâng khóe môi lên 1 mm.`
            : `Tán son mờ viền (blur) thay vì kẻ viền sắc nét để mắt không chú ý vào độ lệch khóe môi.`,
        repairStepVi:
          "Chọn chì kẻ môi tiệp màu môi thật, chỉnh lại đỉnh môi trên trước khi phủ son màu.",
      };

    case "jaw":
      return {
        summaryVi:
          widerSide !== "even"
            ? `Đường hàm bên ${wideName} rộng hơn bên ${narrowName} khoảng ${hDiffPct.toFixed(1)}%.`
            : `Góc hàm hai bên chênh cao độ khoảng ${vDiffPct.toFixed(1)}%.`,
        repairAdviceVi:
          widerSide !== "even"
            ? `Tập trung phủ khối nâu xám dưới góc hàm bên ${wideName} và giữ bên ${narrowName} thoáng sáng.`
            : `Tạo bóng nhẹ từ dái tai xuống cằm bên ${lowName} để đường viền hàm trông thanh thoát đều nhau.`,
        repairStepVi:
          "Bắt đầu đặt cọ từ sau tai kéo về phía cằm rồi tan dần xuống cổ, không dặm đậm ở giữa má.",
      };
  }
}

export function buildFacialAsymmetryHeatmap(
  neuralLandmarks: Array<[number, number, number]> | null | undefined
): FacialAsymmetryHeatmapData {
  if (!neuralLandmarks || neuralLandmarks.length < 468) {
    return {
      available: false,
      overallScore: 0,
      headTiltDeg: 0,
      faceWidthPx: 0,
      midline: { top: { x: 0, y: 0 }, bottom: { x: 0, y: 0 } },
      zones: [],
      highVarianceZones: [],
      points: [],
      noteVi: "Cần ảnh chính diện rõ mặt để dựng bản đồ độ lệch theo điểm khuôn mặt.",
    };
  }

  const foreheadTop = getPt(neuralLandmarks, 10);
  const noseBridge = getPt(neuralLandmarks, 168);
  const chinBottom = getPt(neuralLandmarks, 152);
  const leftCheekOuter = getPt(neuralLandmarks, 234);
  const rightCheekOuter = getPt(neuralLandmarks, 454);

  const faceWidthPx = Math.max(1, dist2D(leftCheekOuter, rightCheekOuter));

  // Roll-compensated vertical midline vector (top -> chin)
  const axisDx = chinBottom.x - foreheadTop.x;
  const axisDy = chinBottom.y - foreheadTop.y;
  const axisLen = Math.max(1e-5, Math.hypot(axisDx, axisDy));
  const ux = axisDx / axisLen;
  const uy = axisDy / axisLen;

  // Orthogonal right-pointing horizontal axis (ensure positive on rightCheekOuter)
  let rx = uy;
  let ry = -ux;
  const probeRight =
    (rightCheekOuter.x - noseBridge.x) * rx + (rightCheekOuter.y - noseBridge.y) * ry;
  if (probeRight < 0) {
    rx = -rx;
    ry = -ry;
  }

  const headTiltDeg = (Math.atan2(axisDx, axisDy) * 180) / Math.PI;

  const projectLocal = (p: Point2D): { h: number; v: number } => {
    const dx = p.x - noseBridge.x;
    const dy = p.y - noseBridge.y;
    return {
      h: dx * rx + dy * ry,
      v: dx * ux + dy * uy,
    };
  };

  const zones: AsymmetryHeatZone[] = [];
  const points: AsymmetryHeatPoint[] = [];

  for (const spec of HEATMAP_ZONE_SPECS) {
    let sumAbsH = 0;
    let sumAbsV = 0;
    let sumSignedH = 0; // positive => right side wider
    let sumSignedV = 0; // positive => right side sits higher (smaller v along downward axis)
    let sumCombined = 0;
    let maxDeltaPct = 0;

    const leftPts: Point2D[] = [];
    const rightPts: Point2D[] = [];

    for (const [lIdx, rIdx] of spec.pairs) {
      const pL = getPt(neuralLandmarks, lIdx);
      const pR = getPt(neuralLandmarks, rIdx);
      leftPts.push(pL);
      rightPts.push(pR);

      const locL = projectLocal(pL);
      const locR = projectLocal(pR);

      const distL = Math.abs(locL.h);
      const distR = Math.abs(locR.h);
      const signedHPct = ((distR - distL) / faceWidthPx) * 100;
      const absHPct = Math.abs(signedHPct);

      // Smaller v = higher on the face (since axis points forehead -> chin)
      const signedVPct = ((locL.v - locR.v) / faceWidthPx) * 100;
      const absVPct = Math.abs(signedVPct);

      const combinedPct = Math.hypot(absHPct, absVPct * 1.15);
      const pairHeat = deltaPctToHeat(combinedPct);

      sumAbsH += absHPct;
      sumAbsV += absVPct;
      sumSignedH += signedHPct;
      sumSignedV += signedVPct;
      sumCombined += combinedPct;
      if (combinedPct > maxDeltaPct) maxDeltaPct = combinedPct;

      // Concentrate primary heat on the side that protrudes/rises more, with a softer mirror echo
      const rightMoreDeviant =
        Math.abs(signedVPct) >= Math.abs(signedHPct) ? signedVPct >= 0 : signedHPct >= 0;

      points.push({
        x: pL.x,
        y: pL.y,
        side: "left",
        zoneId: spec.id,
        heat: rightMoreDeviant ? pairHeat * 0.52 : pairHeat,
        deltaPct: Number(combinedPct.toFixed(2)),
        horizontalDiffPct: Number(absHPct.toFixed(2)),
        verticalDiffPct: Number(absVPct.toFixed(2)),
        landmarkIndex: lIdx,
      });

      points.push({
        x: pR.x,
        y: pR.y,
        side: "right",
        zoneId: spec.id,
        heat: rightMoreDeviant ? pairHeat : pairHeat * 0.52,
        deltaPct: Number(combinedPct.toFixed(2)),
        horizontalDiffPct: Number(absHPct.toFixed(2)),
        verticalDiffPct: Number(absVPct.toFixed(2)),
        landmarkIndex: rIdx,
      });
    }

    const n = spec.pairs.length;
    const meanH = sumAbsH / n;
    const meanV = sumAbsV / n;
    const meanCombined = sumCombined / n;
    const avgSignedH = sumSignedH / n;
    const avgSignedV = sumSignedV / n;

    const higherSide: "left" | "right" | "even" =
      Math.abs(avgSignedV) < 0.75 ? "even" : avgSignedV > 0 ? "right" : "left";
    const widerSide: "left" | "right" | "even" =
      Math.abs(avgSignedH) < 0.9 ? "even" : avgSignedH > 0 ? "right" : "left";

    // Representative zone heat blends mean & peak deltas
    const effectiveDelta = meanCombined * 0.65 + maxDeltaPct * 0.35;
    const heat = deltaPctToHeat(effectiveDelta);

    const severity: HeatmapSeverity =
      effectiveDelta >= 3.2 ? "notable" : effectiveDelta >= 1.75 ? "mild" : "balanced";
    const severityLabelVi =
      severity === "notable" ? "Lệch rõ" : severity === "mild" ? "Lệch nhẹ" : "Cân đối";

    const leftCenter = centroid(leftPts);
    const rightCenter = centroid(rightPts);

    const primarySide: "left" | "right" =
      higherSide !== "even"
        ? higherSide
        : widerSide !== "even"
          ? widerSide
          : avgSignedH >= 0
            ? "right"
            : "left";

    const hotspotPx = primarySide === "left" ? leftCenter : rightCenter;
    const partnerPx = primarySide === "left" ? rightCenter : leftCenter;

    const { summaryVi, repairAdviceVi, repairStepVi } = buildZoneAdvice(
      spec.id,
      severity,
      meanH,
      meanV,
      higherSide,
      widerSide
    );

    zones.push({
      id: spec.id,
      labelVi: spec.labelVi,
      severity,
      severityLabelVi,
      heat: Number(heat.toFixed(3)),
      horizontalDiffPct: Number(meanH.toFixed(2)),
      verticalDiffPct: Number(meanV.toFixed(2)),
      maxDeltaPct: Number(maxDeltaPct.toFixed(2)),
      combinedDeltaPct: Number(meanCombined.toFixed(2)),
      higherSide,
      widerSide,
      hotspotPx,
      partnerPx,
      leftPointsPx: leftPts,
      rightPointsPx: rightPts,
      haloRadiusPx: Number((faceWidthPx * spec.haloScale).toFixed(1)),
      summaryVi,
      repairAdviceVi,
      repairStepVi,
    });
  }

  zones.sort((a, b) => b.combinedDeltaPct - a.combinedDeltaPct || b.maxDeltaPct - a.maxDeltaPct);

  const avgDelta = zones.reduce((acc, z) => acc + z.combinedDeltaPct, 0) / Math.max(1, zones.length);
  const overallScore = Math.round(clamp(100 - avgDelta * 8.2, 55, 99.5) * 10) / 10;
  const highVarianceZones = zones.filter((z) => z.severity !== "balanced");

  const tiltAbs = Math.abs(headTiltDeg);
  const noteVi =
    tiltAbs > 7
      ? `Ảnh hơi nghiêng (${tiltAbs.toFixed(1)}°) — đã tự căn lại trục giữa nhưng chụp thẳng mặt sẽ đo chuẩn hơn.`
      : highVarianceZones.length === 0
        ? "Gương mặt cân đối tự nhiên, chỉ có sai lệch rất nhỏ giữa hai bên."
        : "Di chuột hoặc chạm vào vùng nóng trên ảnh để xem cách cân chỉnh bằng trang điểm.";

  return {
    available: true,
    overallScore,
    headTiltDeg: Number(headTiltDeg.toFixed(1)),
    faceWidthPx: Number(faceWidthPx.toFixed(1)),
    midline: {
      top: foreheadTop,
      bottom: chinBottom,
    },
    zones,
    highVarianceZones,
    points,
    noteVi,
  };
}
