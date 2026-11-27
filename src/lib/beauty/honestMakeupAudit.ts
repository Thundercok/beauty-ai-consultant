import { computeAnalysisConfidence } from "./analysisConfidence";
import { hexToLab } from "./bradfordCat";
import { ciede2000 } from "./productMatcher";
import type { ConsultationReport, MatchedProduct } from "./types";

export type HonestVerdictTier = "buy" | "conditional" | "risky" | "skip";

export type AuditCheckStatus = "pass" | "warn" | "fail";

export interface HonestAuditCheck {
  id:
    | "undertone"
    | "contrast_coverage"
    | "teeth"
    | "blush_harmony"
    | "measurement";
  label: string;
  status: AuditCheckStatus;
  verdictShort: string;
  detailVi: string;
}

export interface HonestMakeupAuditResult {
  /** Un-floored 0..100 scientifically penalized score (can drop below 40 on true clashes) */
  overallScore: number;
  /** True lip perceptual score before blush harmony modifier (0..100) */
  lipFitScore: number;
  /** Optional blush perceptual fit score when blush is active (0..100) */
  blushFitScore: number | null;
  verdictTier: HonestVerdictTier;
  verdictTagVi: string;
  headlineVi: string;
  brutalSummaryVi: string;
  actionableTipVi: string;
  checks: HonestAuditCheck[];
  /** Transparent caveat about photo lighting/landmark/season uncertainty (null if high reliability) */
  measurementCaveatVi: string | null;
  diagnostics: {
    lipDeltaE: number;
    blushDeltaE: number | null;
    lipHueDeg: number;
    blushHueDeg: number | null;
    lipBlushHueGapDeg: number | null;
    renderedLipL: number;
    skinL: number;
    confidenceScore: number;
  };
}

export interface HonestMakeupAuditInput {
  report: Pick<
    ConsultationReport,
    | "skinMetrics"
    | "lipMetrics"
    | "season"
    | "blendedTargets"
    | "whiteBalance"
    | "landmarkSource"
    | "landmarkCount"
  >;
  lipstick: Pick<MatchedProduct, "brand" | "name" | "shade" | "hex" | "texture" | "undertone"> | null;
  renderedLipHex: string;
  lipThickness: number;
  blushEnabled: boolean;
  blushHex?: string | null;
  blushIntensity?: number;
  blushProduct?: Pick<MatchedProduct, "brand" | "shade" | "undertone"> | null;
}

const SHEER_LIP_TEXTURES = new Set([
  "Juicy Tint",
  "Dewy Balm",
  "Mirror Gloss",
  "Water Stain",
]);

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function labHueDeg(a: number, b: number): number {
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

function angularGapDeg(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Un-floored Gaussian decay converting CIEDE2000 distance into a brutally honest 0..100 fit score.
 * Unlike the old 52..99 linear clamp, strong mismatches (ΔE >= 18) genuinely drop into the 20s-40s.
 */
export function honestDeltaEToScore(deltaE: number): number {
  if (!Number.isFinite(deltaE) || deltaE <= 0) return 99;
  const score = 100 * Math.exp(-Math.pow(deltaE / 17.5, 1.55));
  return Math.round(clamp(score, 8, 99));
}

/**
 * Performs a multi-factor, brutally honest colorimetric audit of the active lipstick
 * (and optional blush pair) on the user's actual calibrated skin & natural lip substrate.
 * No people-pleasing flattery: flags undertone clashes, chalky washout, dark lip border leaks,
 * teeth-yellowing hues, lip-blush temperature conflicts, and photo-lighting uncertainty.
 */
export function evaluateHonestMakeupAudit(
  input: HonestMakeupAuditInput
): HonestMakeupAuditResult {
  const {
    report,
    lipstick,
    renderedLipHex,
    lipThickness,
    blushEnabled,
    blushHex,
    blushIntensity = 0.26,
    blushProduct,
  } = input;

  const skinL = report.skinMetrics.L_star;
  const itaDeg = report.skinMetrics.ITA_deg;
  const warmProb = report.season.warmProbability;
  const isCoolSkin = warmProb <= 0.42;
  const isWarmSkin = warmProb >= 0.58;

  const targetLipLab = hexToLab(report.blendedTargets.lip);
  const [lipL, lipA, lipB] = hexToLab(renderedLipHex);
  const lipChroma = Math.hypot(lipA, lipB);
  const lipHue = labHueDeg(lipA, lipB);
  const lipDeltaE = Number(ciede2000(targetLipLab, [lipL, lipA, lipB]).toFixed(2));

  let lipScore = honestDeltaEToScore(lipDeltaE);
  let totalPenalty = 0;

  const checks: HonestAuditCheck[] = [];

  // 1. Undertone Alignment Check (Actual rendered lip Lab hue & b*/a* axis vs skin undertone)
  // Warm/orange-heavy lips sit around h° >= 33..75 (high b* relative to a*)
  // Cool berry/blue-pink lips sit around h° <= 12 or h° >= 320 (very low or negative b*)
  const isLipWarmOrange =
    (lipHue >= 32 && lipHue <= 82 && lipChroma >= 18) || (lipB > lipA * 0.72 && lipB >= 14);
  const isLipCoolBluePink =
    ((lipHue <= 12 || lipHue >= 315) && lipChroma >= 16) || (lipB <= 2.5 && lipA >= 14);
  const declaredWarm = lipstick?.undertone?.toLowerCase().includes("warm") ?? false;
  const declaredCool = lipstick?.undertone?.toLowerCase().includes("cool") ?? false;

  let undertoneStatus: AuditCheckStatus = "pass";
  let undertoneShort = "Cùng tông da";
  let undertoneDetail =
    "Sắc độ son lên môi đồng nhất với nhiệt màu da thật, giúp da sáng gọn mà không tạo ranh giới gắt.";

  if (isCoolSkin && (isLipWarmOrange || (declaredWarm && lipB > lipA * 0.52))) {
    const severe = lipHue >= 38 || lipB > lipA * 0.8;
    undertoneStatus = severe ? "fail" : "warn";
    totalPenalty += severe ? 24 : 13;
    undertoneShort = severe ? "Chọi tông lạnh" : "Hơi ngả ấm";
    undertoneDetail = severe
      ? "Màu này nhiều sắc cam/vàng chọi thẳng với nền da tông lạnh — bôi full môi rất dễ làm da xỉn xám và mặt kém tươi."
      : "Son hơi thiên cam ấm so với da tông lạnh của bạn — nếu để mặt mộc sẽ hơi tối da, chỉ nên tán mỏng lòng môi hoặc phối nền ấm nhẹ.";
  } else if (isWarmSkin && (isLipCoolBluePink || (declaredCool && lipB < 5.5))) {
    const severe = lipB < 1.5 || lipHue >= 330 || lipHue <= 6;
    undertoneStatus = severe ? "fail" : "warn";
    totalPenalty += severe ? 24 : 13;
    undertoneShort = severe ? "Chọi tông ấm" : "Hơi lạnh sắc";
    undertoneDetail = severe
      ? "Ánh hồng tím lạnh lệch hẳn sắc da vàng ấm — lên môi thật rất dễ bị sến, lộ viền và làm da trông xạm vàng."
      : "Màu hơi thiên hồng lạnh so với da ấm — đánh đậm dễ bị tách khỏi màu da, nên trộn thêm lớp son đất mỏng nếu thích.";
  }

  checks.push({
    id: "undertone",
    label: "Nhiệt màu với da",
    status: undertoneStatus,
    verdictShort: undertoneShort,
    detailVi: undertoneDetail,
  });

  // 2. Contrast, Chalky Washout & Dark Lip Border Coverage (Kubelka-Munk substrate reality)
  const isSheerTexture = SHEER_LIP_TEXTURES.has(lipstick?.texture ?? "");
  const isChalkyWashout =
    (lipL > skinL - 3.5 && lipL >= 58) || (itaDeg < 38 && lipL >= 60 && lipChroma < 26);
  const isDarkBorderExposed =
    report.lipMetrics.hasDarkLipBorder && isSheerTexture && lipThickness < 0.9;
  const isTooHeavyBareFace = lipL < 27 || lipChroma > 58;

  let coverageStatus: AuditCheckStatus = "pass";
  let coverageShort = "Che phủ & độ đậm ổn";
  let coverageDetail =
    "Độ đậm nhạt cân bằng với độ sáng nền da và sắc tố môi thật — dùng đi học hằng ngày không bị bợt hay quá dừ.";

  if (isChalkyWashout) {
    coverageStatus = "fail";
    totalPenalty += 22;
    coverageShort = "Dễ bợt môi";
    coverageDetail =
      "Sắc son lên môi quá sáng/nhiều nền trắng so với độ sáng da thật — rất dễ bị bợt, lộ vân môi và làm gương mặt trông mệt mỏi.";
  } else if (isDarkBorderExposed) {
    coverageStatus = "warn";
    totalPenalty += 12;
    coverageShort = "Khó che viền thâm";
    coverageDetail =
      "Viền môi của bạn hơi sậm nên lớp son tint/bóng mỏng này sẽ lộ viền thâm rõ — nếu mua phải dặm che khuyết điểm môi trước hoặc đổi sang son bùn/kem lì.";
  } else if (isTooHeavyBareFace) {
    coverageStatus = "warn";
    totalPenalty += 8;
    coverageShort = "Hơi dừ khi để mộc";
    coverageDetail =
      "Sắc son lên môi khá đậm hoặc chói — để mặt mộc đi học dễ bị lệch pha; chỉ hợp khi đánh thật mỏng lòng môi hoặc có thêm nền + kẻ mày.";
  }

  checks.push({
    id: "contrast_coverage",
    label: "Độ che & sắc tố môi",
    status: coverageStatus,
    verdictShort: coverageShort,
    detailVi: coverageDetail,
  });

  // 3. Teeth Optical Contrast (Simultaneous contrast along yellow b* axis)
  const yellowsTeeth =
    (lipB > lipA * 0.72 && lipB >= 14) || (lipHue >= 38 && lipHue <= 82 && lipChroma >= 22);
  const brightensTeeth =
    lipA >= 22 && lipL >= 24 && lipL <= 57 && lipB <= 22 && lipB <= lipA * 0.58;

  let teethStatus: AuditCheckStatus = "pass";
  let teethShort = "Trung tính";
  let teethDetail = "Không làm xỉn men răng trong ánh sáng lớp học bình thường.";

  if (yellowsTeeth) {
    teethStatus = "warn";
    totalPenalty += 9;
    teethShort = "Dễ ngả vàng răng";
    teethDetail =
      "Tỷ lệ sắc cam/vàng trong màu son cao — hiệu ứng tương phản màu sẽ khiến men răng trông ngả vàng hơn khi cười.";
  } else if (brightensTeeth) {
    teethStatus = "pass";
    teethShort = "Sáng răng rõ";
    teethDetail =
      "Nền đỏ/hồng lạnh hoặc đỏ gạch sạch sắc giúp men răng trông sáng trắng hơn rõ rệt.";
  }

  checks.push({
    id: "teeth",
    label: "Hiệu ứng màu răng",
    status: teethStatus,
    verdictShort: teethShort,
    detailVi: teethDetail,
  });

  // 4. Lip + Blush Harmony Audit (active in 'So sánh Makeup' or whenever Blush is ON)
  let blushDeltaE: number | null = null;
  let blushFitScore: number | null = null;
  let blushHue: number | null = null;
  let lipBlushHueGapDeg: number | null = null;

  if (blushEnabled && blushHex) {
    const targetBlushLab = hexToLab(report.blendedTargets.blush);
    const [bL, bA, bB] = hexToLab(blushHex);
    const blushChroma = Math.hypot(bA, bB);
    blushHue = labHueDeg(bA, bB);
    blushDeltaE = Number(ciede2000(targetBlushLab, [bL, bA, bB]).toFixed(2));
    blushFitScore = honestDeltaEToScore(blushDeltaE);
    lipBlushHueGapDeg = Number(angularGapDeg(lipHue, blushHue).toFixed(1));

    const isBlushWarmOrange = blushHue >= 36 && blushHue <= 82 && blushChroma >= 16;
    const isBlushCoolPink = (blushHue <= 14 || blushHue >= 315) && blushChroma >= 14;
    const tempClash =
      (isLipCoolBluePink && isBlushWarmOrange) ||
      (isLipWarmOrange && isBlushCoolPink) ||
      lipBlushHueGapDeg > 36;
    const doubleHeavy = lipChroma >= 44 && lipThickness >= 1.15 && blushIntensity >= 0.31;
    const blushClashesSkin =
      (isCoolSkin && isBlushWarmOrange) || (isWarmSkin && isBlushCoolPink) || blushDeltaE > 15;

    let blushStatus: AuditCheckStatus = "pass";
    let blushShort = "Ăn khớp Son & Má";
    let blushDetail = `Phấn má${blushProduct ? ` ${blushProduct.brand} (${blushProduct.shade})` : ""} đồng điệu nhiệt màu với son môi, giúp tổng thể mặt tươi tự nhiên không bị tách khối.`;

    if (tempClash) {
      blushStatus = "fail";
      totalPenalty += 14;
      blushShort = "Lệch tông Son – Má";
      blushDetail =
        "Màu son và màu phấn má đang ngược nhiệt màu (một bên ấm cam, một bên lạnh hồng) — nhìn tổng thể khuôn mặt bị rời rạc. Nên đổi màu má cùng tông hoặc bấm dùng cặp AI gợi ý.";
    } else if (blushClashesSkin) {
      blushStatus = "warn";
      totalPenalty += 9;
      blushShort = "Má chưa thật hợp da";
      blushDetail =
        "Màu phấn má đang chọn hơi lệch tông da thật — tán đậm dễ làm vùng gò má bị xỉn hoặc ửng gắt, nên giảm độ đậm má hoặc chọn lại màu AI đề xuất.";
    } else if (doubleHeavy) {
      blushStatus = "warn";
      totalPenalty += 6;
      blushShort = "Cả môi & má đều đậm";
      blushDetail =
        "Bạn đang để cả son full môi đậm lẫn má hồng rõ — ra nắng rất dễ bị dừ. Nguyên tắc đẹp tự nhiên: môi đậm thì hạ má xuống mức nhẹ.";
    }

    checks.push({
      id: "blush_harmony",
      label: "Phối cặp Son + Má",
      status: blushStatus,
      verdictShort: blushShort,
      detailVi: blushDetail,
    });
  }

  // 5. Measurement Reliability Honesty (Never pretend 100% certainty on bad lighting!)
  const confidence = computeAnalysisConfidence(report);
  const cct = report.whiteBalance.estimatedCctK;
  const offLocus = report.whiteBalance.offLocusDeg ?? 0;
  const heavyLightCast =
    cct !== null && (cct < 4100 || cct > 7600 || offLocus > 6.5);
  const usedFallbackBox = report.landmarkSource !== "mediapipe_468";

  const caveatParts: string[] = [];
  if (heavyLightCast && cct !== null) {
    caveatParts.push(
      `ảnh gốc ám màu đèn khá mạnh (~${Math.round(cct / 100) * 100}K)`
    );
  }
  if (usedFallbackBox) {
    caveatParts.push("chưa khóa đủ lưới 468 điểm khuôn mặt");
  }
  if (report.season.isBorderline) {
    caveatParts.push("tông da nằm vùng giao mùa nên chênh lệch nhỏ");
  }

  const measurementCaveatVi =
    caveatParts.length > 0
      ? `Nói thật về độ tin cậy ảnh (${confidence.score}%): ${caveatParts.join(", ")} — nên chụp thêm 1 tấm sát cửa sổ ánh sáng trời để chốt màu chuẩn tuyệt đối.`
      : null;

  // Combine final honest score (NO fake 52% floor!)
  const lipFitScore = Math.round(clamp(lipScore - totalPenalty * 0.78, 12, 98));
  const combinedBase =
    blushFitScore !== null ? lipScore * 0.72 + blushFitScore * 0.28 : lipScore;
  const overallScore = Math.round(clamp(combinedBase - totalPenalty, 10, 98));

  let verdictTier: HonestVerdictTier;
  let verdictTagVi: string;
  let headlineVi: string;
  let brutalSummaryVi: string;
  let actionableTipVi: string;

  if (overallScore >= 82 && !checks.some((c) => c.status === "fail")) {
    verdictTier = "buy";
    verdictTagVi = "Chốt được";
    headlineVi = blushEnabled
      ? "Combo Son + Má này hợp thật, nâng sáng mặt rõ"
      : "Màu son này hợp da thật, mua không phí tiền";
    brutalSummaryVi = blushEnabled
      ? "Cả sắc son sau khi pha với nền môi thật lẫn màu má đều khớp nhiệt màu da — kéo thanh trượt sẽ thấy mặt tươi tỉnh hơn mà không bị giả."
      : "Màu son khi chồng lên sắc tố môi thật vẫn giữ đúng độ hài hòa với da, dùng đi học hằng ngày hay chụp cam thường đều ổn.";
    actionableTipVi =
      lipThickness > 1.2
        ? "Mẹo nhỏ: đi học chỉ cần 1 lớp mỏng hoặc tán lòng môi cho tự nhiên, đi chơi mới chồng full môi."
        : "Có thể đánh thẳng không cần che viền môi cầu kỳ, kết hợp má hồng tán mỏng là đủ gọn.";
  } else if (overallScore >= 65) {
    verdictTier = "conditional";
    verdictTagVi = "Có điều kiện";
    headlineVi = "Dùng tạm ổn nhưng chưa phải màu tối ưu nhất";
    const firstIssue = checks.find((c) => c.status === "fail" || c.status === "warn");
    brutalSummaryVi = firstIssue
      ? `Điểm trừ thật: ${firstIssue.detailVi}`
      : "Màu nằm ở mức an toàn nhưng chưa làm bật tông da rõ rệt bằng top 3 màu AI gợi ý đầu bảng.";
    actionableTipVi = isDarkBorderExposed
      ? "Nếu vẫn muốn mua: bắt buộc che nhẹ viền môi bằng cushion trước, hoặc chuyển sang chất son bùn/kem lì."
      : "Chỉ nên tán mỏng lòng môi rồi bặm đều thay vì đánh dày full viền; tránh đánh cả môi lẫn má cùng đậm.";
  } else if (overallScore >= 46) {
    verdictTier = "risky";
    verdictTagVi = "Dễ dìm da";
    headlineVi = "Cân nhắc kỹ — màu này dễ làm mặt kém tươi";
    const failIssues = checks.filter((c) => c.status === "fail" || c.status === "warn");
    brutalSummaryVi =
      failIssues.length > 0
        ? failIssues.map((i) => i.detailVi).slice(0, 2).join(" ")
        : "Khoảng cách màu thực tế sau khi lên môi lệch khá xa bảng màu hợp tông da của bạn.";
    actionableTipVi =
      "Nếu chưa mua thì đừng xuống tiền vội — bấm 'Dùng cặp AI gợi ý' để xem màu tôn da thật hơn, hoặc chỉ dùng làm màu trộn lòng môi với một cây son đất khác.";
  } else {
    verdictTier = "skip";
    verdictTagVi = "Nên bỏ qua";
    headlineVi = "Nói thẳng: đừng mua màu này cho tông da của bạn";
    const failIssues = checks.filter((c) => c.status === "fail" || c.status === "warn");
    brutalSummaryVi =
      failIssues.length > 0
        ? failIssues.map((i) => i.detailVi).slice(0, 2).join(" ")
        : "Sắc độ lên môi xung đột mạnh với tông da và nền môi thật, bôi lên sẽ bị tách mặt và xỉn da rõ rệt.";
    actionableTipVi =
      "Tiết kiệm tiền cho màu khác! Chọn lại trong 4 màu đầu danh sách (đã lọc theo đúng nền môi & tông da của bạn) để thử trên thanh trượt.";
  }

  return {
    overallScore,
    lipFitScore,
    blushFitScore,
    verdictTier,
    verdictTagVi,
    headlineVi,
    brutalSummaryVi,
    actionableTipVi,
    checks,
    measurementCaveatVi,
    diagnostics: {
      lipDeltaE,
      blushDeltaE,
      lipHueDeg: Number(lipHue.toFixed(1)),
      blushHueDeg: blushHue !== null ? Number(blushHue.toFixed(1)) : null,
      lipBlushHueGapDeg,
      renderedLipL: Number(lipL.toFixed(1)),
      skinL: Number(skinL.toFixed(1)),
      confidenceScore: confidence.score,
    },
  };
}
