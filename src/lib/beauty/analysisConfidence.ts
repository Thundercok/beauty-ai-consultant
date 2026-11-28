import type { ConsultationReport } from "./types";

export interface ConfidenceFactor {
  id: "lighting" | "landmarks" | "skin_area" | "season_clarity";
  label: string;
  valueLabel: string;
  score: number; // 0..100
  status: "good" | "fair" | "warn";
}

export interface AnalysisConfidenceResult {
  score: number; // 0..100
  level: "high" | "medium" | "low";
  label: string;
  lightingNote: string;
  factors: ConfidenceFactor[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function statusFromScore(score: number): "good" | "fair" | "warn" {
  if (score >= 80) return "good";
  if (score >= 60) return "fair";
  return "warn";
}

/**
 * Computes an interpretable 0–100% reliability score for the skin & season analysis
 * based on lighting conditions (CCT deviation & off-Planckian cast), neural landmark
 * coverage, valid skin pixel count, and seasonal classification certainty.
 */
/** Ceiling for the score when the skin colour had to be averaged from non-skin pixels. */
export const MAX_SCORE_WITHOUT_SKIN = 30;

export function computeAnalysisConfidence(
  report: Pick<
    ConsultationReport,
    "whiteBalance" | "landmarkSource" | "landmarkCount" | "skinMetrics" | "season"
  > &
    Partial<Pick<ConsultationReport, "skinEvidence">>
): AnalysisConfidenceResult {
  const cct = report.whiteBalance.estimatedCctK;
  const offLocus = report.whiteBalance.offLocusDeg ?? 0;
  const wbDisabled = report.whiteBalance.method === "none";

  // 1. Lighting quality score (45% weight — largest impact on true skin colorimetry)
  let lightingScore = 88;
  let lightingNote = "Ánh sáng cân bằng tốt gần chuẩn ban ngày";
  let lightingValueLabel = "Tự nhiên";

  if (cct !== null) {
    const roundedCct = Math.round(cct / 100) * 100;
    const distFromIdeal =
      cct >= 5000 && cct <= 6800
        ? 0
        : cct < 5000
          ? 5000 - cct
          : cct - 6800;

    // Gentle penalty for warm/cool indoor lamps when WB is active; heavier when WB is off
    const cctPenalty = wbDisabled
      ? (distFromIdeal / 1000) * 18
      : (distFromIdeal / 1000) * 9.5;
    // Off-Planckian cast (green fluorescent / magenta LED) is harder to invert cleanly
    const offLocusPenalty = Math.max(0, offLocus - 3) * 2.4;

    lightingScore = Math.round(clamp(98 - cctPenalty - offLocusPenalty, 38, 98));

    if (distFromIdeal === 0 && offLocus <= 5) {
      lightingNote = `Ánh sáng tự nhiên (~${roundedCct}K) cho điều kiện đo màu ổn định nhất`;
      lightingValueLabel = `~${roundedCct}K (Chuẩn)`;
    } else if (cct < 5000) {
      lightingNote = wbDisabled
        ? `Ảnh ám đèn vàng (~${roundedCct}K) và chưa bật khử màu đèn`
        : `Ảnh chụp dưới đèn vàng (~${roundedCct}K) — đã tự khử màu đèn`;
      lightingValueLabel = `~${roundedCct}K (Đèn vàng)`;
    } else if (cct > 6800) {
      lightingNote = wbDisabled
        ? `Ảnh ám đèn lạnh (~${roundedCct}K) và chưa bật khử màu đèn`
        : `Ảnh chụp dưới đèn lạnh (~${roundedCct}K) — đã tự khử màu đèn`;
      lightingValueLabel = `~${roundedCct}K (Đèn lạnh)`;
    } else {
      lightingNote = `Ánh sáng hỗn hợp (lệch sắc ${offLocus.toFixed(1)}°) — nên chụp gần cửa sổ`;
      lightingValueLabel = `~${roundedCct}K (Hỗn hợp)`;
    }
  } else {
    lightingScore = 62;
    lightingNote = "Chưa ước lượng được nguồn sáng gốc — dùng ánh sáng hiện có";
    lightingValueLabel = "Chưa rõ";
  }

  // 2. Landmark precision score (25% weight)
  const hasNeural = report.landmarkSource === "mediapipe_468" && report.landmarkCount >= 468;
  const landmarkScore = hasNeural ? 96 : 64;
  const landmarkValueLabel = hasNeural
    ? `${report.landmarkCount} điểm`
    : "Khung ước lượng";

  // 3. Valid skin sample area score (15% weight)
  const px = report.skinMetrics.sampleCount;
  const sampleScore =
    px >= 6000 ? 96 : px >= 2500 ? 86 : px >= 1000 ? 72 : px >= 350 ? 58 : 42;
  const sampleValueLabel = `${px.toLocaleString()} px`;

  // 4. Season margin / clarity score (15% weight)
  const rawSeasonConf = clamp(report.season.confidence, 0, 1);
  const seasonClarityScore = Math.round(
    clamp(55 + rawSeasonConf * 45 - (report.season.isBorderline ? 8 : 0), 48, 98)
  );
  const seasonValueLabel = report.season.isBorderline
    ? "Giao mùa gần kề"
    : `${Math.round(rawSeasonConf * 100)}% rõ nét`;

  const weighted =
    lightingScore * 0.45 +
    landmarkScore * 0.25 +
    sampleScore * 0.15 +
    seasonClarityScore * 0.15;

  // Without real skin pixels every other factor describes the background, not the person.
  // A grey or black frame even scores as perfect D65 light, so the evidence gate must cap
  // the result instead of being just one more weighted term.
  const noSkinEvidence = report.skinEvidence?.usedRegionFallback === true;
  const score = noSkinEvidence
    ? Math.min(MAX_SCORE_WITHOUT_SKIN, Math.round(weighted))
    : Math.round(clamp(weighted, 35, 99));
  const level: AnalysisConfidenceResult["level"] =
    score >= 82 ? "high" : score >= 65 ? "medium" : "low";
  const label = noSkinEvidence
    ? "Không tìm thấy vùng da để đo"
    : level === "high"
      ? "Ảnh rõ nét"
      : level === "medium"
        ? "Ảnh khá ổn"
        : "Nên chụp lại nơi đủ sáng";

  return {
    score,
    level,
    label,
    lightingNote,
    factors: [
      {
        id: "lighting",
        label: "Ánh sáng gốc",
        valueLabel: lightingValueLabel,
        score: lightingScore,
        status: statusFromScore(lightingScore),
      },
      {
        id: "landmarks",
        label: "Nhận diện mặt",
        valueLabel: landmarkValueLabel,
        score: landmarkScore,
        status: statusFromScore(landmarkScore),
      },
      {
        id: "skin_area",
        label: "Vùng da đo",
        valueLabel: sampleValueLabel,
        score: sampleScore,
        status: statusFromScore(sampleScore),
      },
      {
        id: "season_clarity",
        label: "Độ rõ mùa màu",
        valueLabel: seasonValueLabel,
        score: seasonClarityScore,
        status: statusFromScore(seasonClarityScore),
      },
    ],
  };
}
