export type SymmetryZoneId = "brows" | "eyes" | "cheeks" | "jaw" | "lips";

export type SideBias = "balanced" | "left" | "right";

export interface ZoneSymmetryMetric {
  id: SymmetryZoneId;
  labelVi: string;
  score: number; // 0..100
  horizontalDiffPct: number; // % of face width difference (|v_left| - |v_right|)
  verticalDiffPct: number; // % of face width vertical offset
  widerSide: SideBias;
  higherSide: SideBias;
}

export interface ContouringInsight {
  zone: string;
  tipVi: string;
}

export interface FacialSymmetryReport {
  available: boolean;
  overallScore: number; // 0..100
  level: "high" | "moderate" | "notable";
  labelVi: string;
  headTiltDeg: number; // roll angle compensated during measurement
  widerOverallSide: SideBias;
  zones: ZoneSymmetryMetric[];
  contouringInsights: ContouringInsight[];
}

interface ZoneDefinition {
  id: SymmetryZoneId;
  labelVi: string;
  weight: number;
  /** Paired [userRight/imageLeft, userLeft/imageRight] MediaPipe 478 landmark indices */
  pairs: Array<[number, number]>;
}

const SYMMETRY_ZONES: ZoneDefinition[] = [
  {
    id: "brows",
    labelVi: "Chân mày",
    weight: 0.18,
    pairs: [
      [70, 300],
      [105, 334],
      [107, 336],
    ],
  },
  {
    id: "eyes",
    labelVi: "Đôi mắt",
    weight: 0.22,
    pairs: [
      [33, 263],
      [133, 362],
      [159, 386],
    ],
  },
  {
    id: "cheeks",
    labelVi: "Gò má",
    weight: 0.22,
    pairs: [
      [116, 345],
      [234, 454],
      [50, 280],
    ],
  },
  {
    id: "jaw",
    labelVi: "Quai hàm",
    weight: 0.22,
    pairs: [
      [172, 397],
      [136, 365],
      [149, 378],
    ],
  },
  {
    id: "lips",
    labelVi: "Khóe môi",
    weight: 0.16,
    pairs: [
      [61, 291],
      [37, 267],
    ],
  },
];

function sideLabelVi(side: SideBias): string {
  if (side === "left") return "bên trái ảnh";
  if (side === "right") return "bên phải ảnh";
  return "hai bên";
}

/**
 * Computes roll-invariant, scale-normalized facial symmetry from MediaPipe 478 landmarks
 * by projecting paired left/right anatomical landmarks onto the midline axis (forehead->chin)
 * and generating actionable makeup contouring advice from the measured left/right deltas.
 */
export function analyzeFacialSymmetry(
  landmarks: Array<[number, number, number]> | null
): FacialSymmetryReport {
  if (!landmarks || landmarks.length < 468) {
    return {
      available: false,
      overallScore: 0,
      level: "moderate",
      labelVi: "Cần lưới 478 điểm AI để đo độ đối xứng",
      headTiltDeg: 0,
      widerOverallSide: "balanced",
      zones: [],
      contouringInsights: [
        {
          zone: "Chưa đủ dữ liệu điểm mặt",
          tipVi:
            "Tải ảnh chụp chính diện đủ sáng để hệ thống nhận diện 478 điểm và tính độ lệch trái–phải cho tạo khối.",
        },
      ],
    };
  }

  // Midline anchor points: forehead center (10), glabella (168), nose tip (1), chin (152)
  const topPt = landmarks[10];
  const bridgePt = landmarks[168];
  const chinPt = landmarks[152];

  // Unit vector u along facial vertical midline (top -> chin)
  const dxMid = chinPt[0] - topPt[0];
  const dyMid = chinPt[1] - topPt[1];
  const midLen = Math.hypot(dxMid, dyMid) || 1;
  const ux = dxMid / midLen;
  const uy = dyMid / midLen;

  // Orthogonal horizontal axis v pointing toward image-right (when face is upright: uy > 0 => vx = uy > 0)
  const vx = uy;
  const vy = -ux;

  // Roll angle relative to vertical downward vector (0, 1)
  const headTiltDeg = Number(((Math.atan2(dxMid, dyMid) * 180) / Math.PI).toFixed(1));

  // Normalize all landmark deltas by bizygomatic face width (234 <-> 454)
  const faceWidth = Math.max(
    1e-4,
    Math.hypot(landmarks[454][0] - landmarks[234][0], landmarks[454][1] - landmarks[234][1])
  );

  // Midline origin at glabella/bridge projected smoothly
  const ox = bridgePt[0];
  const oy = bridgePt[1];

  const project = (pt: [number, number, number]): { u: number; v: number } => {
    const rx = pt[0] - ox;
    const ry = pt[1] - oy;
    return {
      u: rx * ux + ry * uy,
      v: rx * vx + ry * vy,
    };
  };

  const zones: ZoneSymmetryMetric[] = [];
  let weightedScoreSum = 0;
  let weightTotal = 0;
  let globalWidthSignedSum = 0;

  for (const zone of SYMMETRY_ZONES) {
    let horizAbsSum = 0;
    let vertAbsSum = 0;
    let horizSignedSum = 0; // negative => image-left wider, positive => image-right wider
    let vertSignedSum = 0; // negative => image-left higher (smaller u), positive => image-right higher

    for (const [leftIdx, rightIdx] of zone.pairs) {
      const pL = project(landmarks[leftIdx]);
      const pR = project(landmarks[rightIdx]);

      const distL = Math.abs(pL.v);
      const distR = Math.abs(pR.v);
      const hDiff = (distR - distL) / faceWidth;
      // Smaller u means higher up on the face (closer to forehead)
      const vDiff = (pL.u - pR.u) / faceWidth;

      horizAbsSum += Math.abs(hDiff);
      vertAbsSum += Math.abs(vDiff);
      horizSignedSum += hDiff;
      vertSignedSum += vDiff;
    }

    const pairCount = zone.pairs.length;
    const meanHoriz = horizAbsSum / pairCount;
    const meanVert = vertAbsSum / pairCount;
    const signedHoriz = horizSignedSum / pairCount;
    const signedVert = vertSignedSum / pairCount;

    // Combined perceptual asymmetry index (horizontal width + vertical height alignment)
    const combinedDelta = Math.hypot(meanHoriz, meanVert * 1.15);
    // Calibrated smooth decay: 0% delta -> 100%, 4% delta -> ~90%, 10% delta -> ~75%
    const score = Number(Math.max(40, Math.min(100, 100 * Math.exp(-combinedDelta * 2.65))).toFixed(1));

    const widerSide: SideBias =
      Math.abs(signedHoriz) < 0.012 ? "balanced" : signedHoriz < 0 ? "left" : "right";
    const higherSide: SideBias =
      Math.abs(signedVert) < 0.01 ? "balanced" : signedVert < 0 ? "left" : "right";

    zones.push({
      id: zone.id,
      labelVi: zone.labelVi,
      score,
      horizontalDiffPct: Number((meanHoriz * 100).toFixed(1)),
      verticalDiffPct: Number((meanVert * 100).toFixed(1)),
      widerSide,
      higherSide,
    });

    weightedScoreSum += score * zone.weight;
    weightTotal += zone.weight;
    if (zone.id === "cheeks" || zone.id === "jaw") {
      globalWidthSignedSum += signedHoriz;
    }
  }

  const overallScore = Number((weightedScoreSum / Math.max(1e-6, weightTotal)).toFixed(1));
  const widerOverallSide: SideBias =
    Math.abs(globalWidthSignedSum) < 0.025
      ? "balanced"
      : globalWidthSignedSum < 0
        ? "left"
        : "right";

  const level: FacialSymmetryReport["level"] =
    overallScore >= 90 ? "high" : overallScore >= 82 ? "moderate" : "notable";
  const labelVi =
    level === "high"
      ? "Cân đối rất cao"
      : level === "moderate"
        ? "Cân đối hài hòa"
        : "Có độ lệch tự nhiên nhẹ";

  // Build data-driven makeup contouring recommendations from measured zone deltas
  const contouringInsights: ContouringInsight[] = [];
  const jawZone = zones.find((z) => z.id === "jaw");
  const cheekZone = zones.find((z) => z.id === "cheeks");
  const browZone = zones.find((z) => z.id === "brows");
  const lipZone = zones.find((z) => z.id === "lips");

  if (jawZone && jawZone.widerSide !== "balanced" && jawZone.horizontalDiffPct >= 1.5) {
    contouringInsights.push({
      zone: "Tạo khối quai hàm",
      tipVi: `Góc hàm ${sideLabelVi(jawZone.widerSide)} nhỉnh hơn ~${jawZone.horizontalDiffPct.toFixed(1)}% — phớt thêm 1 lớp khối nâu xám nhạt thật mỏng sát viền hàm bên này và bắt sáng nhẹ bên đối diện để thu gọn đều hai bên.`,
    });
  } else {
    contouringInsights.push({
      zone: "Tạo khối quai hàm",
      tipVi:
        "Đường hàm hai bên khá cân bằng — chỉ cần phớt khối siêu nhẹ dưới xương hàm để giữ nét thon gọn tự nhiên.",
    });
  }

  if (cheekZone && (cheekZone.horizontalDiffPct >= 1.8 || cheekZone.verticalDiffPct >= 1.4)) {
    const lowerSide: SideBias =
      cheekZone.higherSide === "left"
        ? "right"
        : cheekZone.higherSide === "right"
          ? "left"
          : "balanced";
    contouringInsights.push({
      zone: "Đánh má & khối gò má",
      tipVi:
        lowerSide !== "balanced"
          ? `Gò má có độ chênh cao nhẹ (${cheekZone.verticalDiffPct.toFixed(1)}%) — đặt trọng tâm má hồng và bắt sáng nhẹ cao hơn ~2mm ở ${sideLabelVi(lowerSide)} để nâng đều ánh nhìn.`
          : `Độ rộng gò má lệch nhẹ ~${cheekZone.horizontalDiffPct.toFixed(1)}% — phớt khối thật mỏng sát hõm má ${sideLabelVi(cheekZone.widerSide)} và tán má hồng hướng chéo lên thái dương.`,
    });
  } else {
    contouringInsights.push({
      zone: "Đánh má & khối gò má",
      tipVi:
        "Hai gò má cân xứng tốt — đánh má hồng và bắt sáng đều hai bên theo đúng dáng mặt để tạo hiệu ứng căng bóng.",
    });
  }

  if (browZone && browZone.verticalDiffPct >= 1.2 && browZone.higherSide !== "balanced") {
    const lowerBrow = browZone.higherSide === "left" ? "right" : "left";
    contouringInsights.push({
      zone: "Cân chỉnh chân mày",
      tipVi: `Chân mày lệch cao ~${browZone.verticalDiffPct.toFixed(1)}% — gẩy sợi nhẹ phía trên viền mày ${sideLabelVi(lowerBrow)} và chải gel nâng sợi để cân khung mắt.`,
    });
  } else if (lipZone && lipZone.verticalDiffPct >= 1.4) {
    contouringInsights.push({
      zone: "Cân viền môi",
      tipVi: `Khóe môi có độ chênh nhẹ ~${lipZone.verticalDiffPct.toFixed(1)}% — dùng chì viền môi đồng màu nâng nhẹ khóe môi bên thấp hơn trước khi thoa son.`,
    });
  } else {
    contouringInsights.push({
      zone: "Chân mày & Khung mắt",
      tipVi:
        "Khung mắt và chân mày đạt độ đối xứng cao — chỉ cần kẻ dáng mày tự nhiên theo trục sống mũi mà không cần chỉnh lệch.",
    });
  }

  return {
    available: true,
    overallScore,
    level,
    labelVi,
    headTiltDeg,
    widerOverallSide,
    zones,
    contouringInsights,
  };
}
