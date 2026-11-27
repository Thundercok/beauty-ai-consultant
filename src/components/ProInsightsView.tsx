import React, { useMemo, useState } from "react";
import { Download, RotateCcw, Scale, ScanFace, SlidersHorizontal } from "lucide-react";
import { PortraitCanvas } from "./PortraitCanvas";
import { RelightingLab } from "./RelightingLab";
import { computeAnalysisConfidence } from "../lib/beauty/analysisConfidence";
import { summarizeFaceMesh } from "../lib/beauty/faceMeshOverlay";
import { analyzeFacialSymmetry } from "../lib/beauty/facialSymmetry";
import type { EnhancementStats } from "../lib/beauty/imageEnhancement";
import {
  SEASON_VI_LABELS,
  SHAPE_VI_LABELS,
  describeCctVi,
  translateItaCategory,
} from "../lib/beauty/viLabels";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  FaceShapeName,
  IlluminantName,
  SeasonName,
  WhiteBalanceMethod,
} from "../lib/beauty/types";

interface ProInsightsViewProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  onFaceBoxChange: (updater: (prev: FaceLandmarksBox) => FaceLandmarksBox) => void;
  onResetFaceBox: () => void;
  landmarkStatus: "loading" | "neural" | "fallback";
  showMeshPreview: boolean;
  onToggleMeshPreview: () => void;
  enhancementStats: EnhancementStats | null;
  sortedSeasons: Array<{ name: SeasonName; prob: number }>;
  wbMethod: WhiteBalanceMethod;
  onWbMethodChange: (m: WhiteBalanceMethod) => void;
  catalogIlluminant: IlluminantName;
  onCatalogIlluminantChange: (ill: IlluminantName) => void;
  onExportJson: () => void;
}

const ConfidenceRing: React.FC<{
  score: number;
  level: "high" | "medium" | "low";
}> = ({ score, level }) => {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const strokeClass =
    level === "high"
      ? "stroke-emerald-600"
      : level === "medium"
        ? "stroke-amber-500"
        : "stroke-rose-600";
  const textClass =
    level === "high"
      ? "text-emerald-700"
      : level === "medium"
        ? "text-amber-700"
        : "text-rose-700";

  return (
    <div
      data-testid="confidence-ring"
      className="relative w-14 h-14 shrink-0 flex items-center justify-center"
      role="img"
      aria-label={`Độ tin cậy phân tích ${score}%`}
    >
      <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="4.5"
          className="stroke-zinc-200"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${strokeClass} transition-[stroke-dashoffset] duration-500 ease-out`}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-mono tabular-nums text-xs font-bold ${textClass}`}>
        {score}%
      </span>
    </div>
  );
};

export const ProInsightsView: React.FC<ProInsightsViewProps> = ({
  report,
  faceBox,
  onFaceBoxChange,
  onResetFaceBox,
  landmarkStatus,
  showMeshPreview,
  onToggleMeshPreview,
  enhancementStats,
  sortedSeasons,
  wbMethod,
  onWbMethodChange,
  catalogIlluminant,
  onCatalogIlluminantChange,
  onExportJson,
}) => {
  const [subTab, setSubTab] = useState<"lighting" | "skinmaps" | "metrics">("lighting");
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const [showRoiTuning, setShowRoiTuning] = useState(landmarkStatus === "fallback");
  const [showRoiOverlay, setShowRoiOverlay] = useState(true);

  const visibleSeasons = showAllSeasons ? sortedSeasons : sortedSeasons.slice(0, 4);

  const symmetry = useMemo(
    () => analyzeFacialSymmetry(report.neuralLandmarks),
    [report.neuralLandmarks]
  );

  const confidence = useMemo(() => computeAnalysisConfidence(report), [report]);

  const meshSummary = useMemo(
    () =>
      summarizeFaceMesh(
        report.neuralLandmarks,
        faceBox,
        report.width,
        report.height,
        landmarkStatus
      ),
    [report.neuralLandmarks, faceBox, report.width, report.height, landmarkStatus]
  );

  const rankedShapes = useMemo(() => {
    return (Object.keys(report.faceShape.probabilities) as FaceShapeName[])
      .map((name) => ({ name, prob: report.faceShape.probabilities[name] }))
      .sort((a, b) => b.prob - a.prob);
  }, [report.faceShape.probabilities]);

  return (
    <div className="space-y-5">
      {/* Header Row: Title + Export JSON cleanly separated from the 3-tab control so mobile NEVER collides */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-zinc-900">
              Phân tích chuyên sâu
            </h1>
            <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
              Ánh đèn phòng, lưới 478 điểm, bản đồ Melanin/Hemoglobin và chỉ số CIELAB, ITA°
            </p>
          </div>

          <button
            type="button"
            onClick={onExportJson}
            className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất JSON</span>
          </button>
        </div>

        {/* Dedicated Full-Width 3-Tab Segmented Bar on Mobile, Compact on Desktop */}
        <div
          role="tablist"
          aria-label="Chọn mục phân tích chuyên sâu"
          className="grid grid-cols-3 sm:inline-grid sm:grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-xl w-full sm:w-auto"
        >
          {(
            [
              ["lighting", "Ánh đèn"],
              ["skinmaps", "Bản đồ da"],
              ["metrics", "Chỉ số"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              onClick={() => setSubTab(id)}
              className={`min-h-[38px] sm:min-h-[36px] px-2.5 sm:px-4 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap text-center transition-colors cursor-pointer ${
                subTab === id
                  ? "bg-white text-zinc-900 shadow-xs font-semibold"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "lighting" && <RelightingLab report={report} />}

      {subTab === "skinmaps" && (
        <div className="space-y-4 sm:space-y-5">
          {/* Moved from Tone Home: 478-Point Face Mesh & Skin ROI Verification Card */}
          <div
            data-testid="mesh-preview-bar"
            className="bg-white border border-zinc-200 rounded-2xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0">
                  <ScanFace className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Vùng đo da (ROI) &amp; Lưới 478 điểm
                  </h2>
                  <p className="text-xs text-zinc-500 truncate">{meshSummary.statusLabel}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRoiOverlay((v) => !v)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    showRoiOverlay
                      ? "bg-zinc-900 text-white border-zinc-900"
                      : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  {showRoiOverlay ? "Vùng đo da: Bật" : "Vùng đo da: Tắt"}
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showMeshPreview}
                  onClick={onToggleMeshPreview}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    showMeshPreview
                      ? "bg-rose-600 text-white border-rose-600"
                      : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  {showMeshPreview ? "Lưới 478 điểm: Bật" : "Hiện lưới 478 điểm"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 items-center">
              <div className="md:col-span-6 bg-zinc-950">
                <PortraitCanvas
                  report={report}
                  mode={showRoiOverlay ? "roi" : "corrected"}
                  showOverlay={showRoiOverlay}
                  meshPreview={showMeshPreview}
                  box={faceBox}
                  className="max-h-[360px]"
                />
              </div>
              <div className="md:col-span-6 p-4 sm:p-5 space-y-3 text-xs text-zinc-600">
                <div className="font-semibold text-zinc-900">Cách hệ thống trích xuất màu da</div>
                <p className="leading-relaxed">
                  Vùng sáng trong khung là các điểm da mặt sạch đã tự động loại trừ mắt, chân mày, môi và tóc để đo đúng sắc tố da thật.
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-100 font-mono tabular-nums">
                  <div>
                    <div className="text-[11px] font-sans text-zinc-500">Số điểm nhận diện</div>
                    <div className="text-sm font-semibold text-zinc-900 mt-0.5">
                      {meshSummary.mode === "neural"
                        ? `${meshSummary.inBoundsCount}/${meshSummary.pointCount}`
                        : "Khung ước lượng"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-sans text-zinc-500">Vùng da hợp lệ</div>
                    <div className="text-sm font-semibold text-zinc-900 mt-0.5">
                      {report.skinMetrics.sampleCount.toLocaleString()} px
                    </div>
                  </div>
                </div>
                {showMeshPreview && meshSummary.mode === "neural" && (
                  <div
                    data-testid="mesh-preview-legend"
                    className="pt-2 border-t border-zinc-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500"
                  >
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-zinc-400" />
                      Viền mặt
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-sky-400" />
                      Mắt &amp; Mày
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      Viền môi
                    </span>
                    {meshSummary.hasIrises && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Mống mắt
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Melanin & Hemoglobin Maps */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">Phân bố sắc tố nâu (Melanin)</h2>
                  <p className="text-xs text-zinc-500">
                    Quan sát độ đều màu và vùng sạm nhẹ trên khuôn mặt
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                  <span>Ít</span>
                  <span className="w-12 h-2 rounded-xs bg-gradient-to-r from-[#2d5091] via-[#c7995b] to-[#fa961e]" />
                  <span>Nhiều</span>
                </div>
              </div>
              <PortraitCanvas
                report={report}
                mode="melanin"
                showOverlay={false}
                box={faceBox}
                className="max-h-[340px]"
              />
            </div>

            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Phân bố độ ửng đỏ (Hemoglobin)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Nhận diện vùng má hay ửng đỏ để chọn kem nền &amp; má hồng hài hòa
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                  <span>Ít</span>
                  <span className="w-12 h-2 rounded-xs bg-gradient-to-r from-[#2896c8] via-[#a35a9c] to-[#fa2c37]" />
                  <span>Nhiều</span>
                </div>
              </div>
              <PortraitCanvas
                report={report}
                mode="hemoglobin"
                showOverlay={false}
                box={faceBox}
                className="max-h-[340px]"
              />
            </div>
          </div>
        </div>
      )}

      {subTab === "metrics" && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-6 space-y-6">
          {/* Moved from Tone Home: Analysis Confidence Ring + Factor Breakdown */}
          <div
            data-testid="skin-metrics-confidence-card"
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <ConfidenceRing score={confidence.score} level={confidence.level} />
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2 className="text-sm sm:text-base font-bold text-zinc-900">
                    Độ tin cậy ảnh phân tích
                  </h2>
                  <span
                    className={`text-xs font-semibold ${
                      confidence.level === "high"
                        ? "text-emerald-700"
                        : confidence.level === "medium"
                          ? "text-amber-700"
                          : "text-rose-700"
                    }`}
                  >
                    {confidence.label}
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">{confidence.lightingNote}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
              {confidence.factors.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      f.status === "good"
                        ? "bg-emerald-500"
                        : f.status === "fair"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    {f.label}: <strong className="font-medium text-zinc-700">{f.valueLabel}</strong>
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Tabular Colorimetry Summary (CIELAB, ITA°, CCT, Warm Prob) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-zinc-100">
            <div>
              <div className="text-[11px] text-zinc-500">Hệ màu CIELAB (L* / a* / b*)</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {report.skinMetrics.L_star.toFixed(1)} / {report.skinMetrics.a_star.toFixed(1)} /{" "}
                {report.skinMetrics.b_star.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Chỉ số độ sáng ITA°</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {report.skinMetrics.ITA_deg.toFixed(1)}°
              </div>
              <div className="text-[11px] text-zinc-500">
                {translateItaCategory(report.skinMetrics.ITA_category)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Ánh sáng ảnh gốc</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {report.whiteBalance.estimatedCctK !== null
                  ? `${Math.round(report.whiteBalance.estimatedCctK)}K`
                  : "—"}
              </div>
              <div className="text-[11px] text-zinc-500">
                {describeCctVi(report.whiteBalance.estimatedCctK)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Xác suất tông ấm</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {(report.season.warmProbability * 100).toFixed(0)}%
              </div>
              <div className="text-[11px] text-zinc-500 font-mono tabular-nums">
                Hue {report.season.skinHueDeg.toFixed(1)}° · C* {report.season.skinChroma.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Facial Symmetry & Data-Driven Makeup Contouring Card */}
          <section
            data-testid="facial-symmetry-card"
            aria-label="Độ đối xứng khuôn mặt và gợi ý tạo khối"
            className="rounded-2xl bg-zinc-50/75 border border-zinc-200/80 p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                {symmetry.available ? (
                  <div
                    data-testid="symmetry-score-ring"
                    className="relative w-14 h-14 shrink-0 flex items-center justify-center"
                    role="img"
                    aria-label={`Độ đối xứng khuôn mặt ${symmetry.overallScore}%`}
                  >
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
                      <circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        strokeWidth="4.5"
                        className="stroke-zinc-200"
                      />
                      <circle
                        cx="28"
                        cy="28"
                        r="22"
                        fill="none"
                        strokeWidth="4.5"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 22}
                        strokeDashoffset={2 * Math.PI * 22 * (1 - symmetry.overallScore / 100)}
                        className={
                          symmetry.level === "high"
                            ? "stroke-emerald-600"
                            : symmetry.level === "moderate"
                              ? "stroke-amber-500"
                              : "stroke-rose-600"
                        }
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-mono tabular-nums text-xs font-bold text-zinc-900">
                      {Math.round(symmetry.overallScore)}%
                    </span>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-zinc-200/70 text-zinc-600 flex items-center justify-center shrink-0">
                    <Scale className="w-5 h-5" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h2 className="text-sm sm:text-base font-bold text-zinc-900">
                      Độ đối xứng khuôn mặt
                    </h2>
                    {symmetry.available && (
                      <span
                        className={`text-xs font-semibold ${
                          symmetry.level === "high"
                            ? "text-emerald-700"
                            : symmetry.level === "moderate"
                              ? "text-amber-700"
                              : "text-rose-700"
                        }`}
                      >
                        {symmetry.labelVi}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {symmetry.available
                      ? `Đo độ lệch trái–phải trên 5 vùng điểm chuẩn (đã bù nghiêng đầu ${Math.abs(symmetry.headTiltDeg).toFixed(1)}°)`
                      : symmetry.labelVi}
                  </p>
                </div>
              </div>

              {symmetry.available && (
                <div className="font-mono tabular-nums text-xs text-zinc-600 bg-white border border-zinc-200/80 rounded-xl px-3 py-1.5 self-start sm:self-center whitespace-nowrap shrink-0">
                  Tổng điểm:{" "}
                  <strong className="font-bold text-zinc-900">
                    {symmetry.overallScore.toFixed(1)}%
                  </strong>
                </div>
              )}
            </div>

            {symmetry.available ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-3 border-t border-zinc-200/70">
                <div className="lg:col-span-6 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-900">
                    So sánh điểm chuẩn trái – phải theo vùng
                  </div>
                  <div className="space-y-2.5">
                    {symmetry.zones.map((zone) => {
                      const barColor =
                        zone.score >= 90
                          ? "bg-emerald-600"
                          : zone.score >= 82
                            ? "bg-amber-500"
                            : "bg-rose-500";
                      return (
                        <div key={zone.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-zinc-800 whitespace-nowrap">
                              {zone.labelVi}
                            </span>
                            <div className="flex items-center gap-2 font-mono tabular-nums shrink-0">
                              <span className="text-[10px] sm:text-[11px] text-zinc-500 whitespace-nowrap">
                                Δ {zone.horizontalDiffPct.toFixed(1)}% · {zone.verticalDiffPct.toFixed(1)}%
                              </span>
                              <span className="font-semibold text-zinc-900 w-9 text-right">
                                {zone.score.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-zinc-200/80 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.max(8, zone.score)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-6 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-900">
                    Gợi ý cân chỉnh tạo khối nhẹ
                  </div>
                  <div className="space-y-2">
                    {symmetry.contouringInsights.map((insight) => (
                      <div
                        key={insight.zone}
                        className="rounded-xl bg-white border border-zinc-200/75 px-3 py-2.5 space-y-0.5"
                      >
                        <div className="text-xs font-semibold text-zinc-900">{insight.zone}</div>
                        <p className="text-xs text-zinc-600 leading-relaxed">{insight.tipVi}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-600 leading-relaxed pt-2 border-t border-zinc-200/70">
                {symmetry.contouringInsights[0]?.tipVi}
              </p>
            )}
          </section>

          {/* Biometric Face Shape Ratios (R1 / R2 / R3) + 6-Shape Probabilities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-5 border-b border-zinc-100">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Tỷ lệ dáng mặt ({SHAPE_VI_LABELS[report.faceShape.primary]})
              </h2>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { code: "R1", label: "Dài / Rộng", value: report.faceShape.ratios.r1 },
                  { code: "R2", label: "Hàm / Gò má", value: report.faceShape.ratios.r2 },
                  { code: "R3", label: "Trán / Hàm", value: report.faceShape.ratios.r3 },
                ].map((m) => (
                  <div
                    key={m.code}
                    className="rounded-xl bg-zinc-50 border border-zinc-200/70 p-3 space-y-0.5"
                  >
                    <div className="text-[11px] text-zinc-500">{m.label}</div>
                    <div className="font-mono tabular-nums text-sm font-bold text-zinc-900">
                      {m.value.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 pt-1">
                {rankedShapes.map((item, idx) => {
                  const pct = Math.round(item.prob * 100);
                  return (
                    <div key={item.name} className="flex items-center gap-2.5 text-xs">
                      <span
                        className={`w-28 truncate ${
                          idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"
                        }`}
                      >
                        {SHAPE_VI_LABELS[item.name]}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            idx === 0 ? "bg-zinc-900" : "bg-zinc-300"
                          }`}
                          style={{ width: `${Math.max(3, pct)}%` }}
                        />
                      </div>
                      <span className="w-9 text-right font-mono tabular-nums text-[11px] text-zinc-600">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Full 12-Season Probability Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Xác suất {showAllSeasons ? "12 nhóm mùa" : "4 nhóm mùa gần nhất"}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAllSeasons((v) => !v)}
                  className="text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap cursor-pointer"
                >
                  {showAllSeasons ? "Thu gọn" : "Xem tất cả 12 mùa"}
                </button>
              </div>
              <div className="space-y-2.5">
                {visibleSeasons.map((item, idx) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs gap-2">
                      <span
                        className={idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"}
                      >
                        {SEASON_VI_LABELS[item.name].title} ({item.name})
                      </span>
                      <span className="font-mono tabular-nums text-zinc-700 shrink-0">
                        {(item.prob * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          idx === 0 ? "bg-zinc-900" : "bg-zinc-400"
                        }`}
                        style={{ width: `${Math.max(2, item.prob * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Calibration & Pipeline Diagnostics */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">Tùy chỉnh thuật toán đo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="wb-method" className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Cân bằng ánh sáng
                </label>
                <select
                  id="wb-method"
                  value={wbMethod}
                  onChange={(e) => onWbMethodChange(e.target.value as WhiteBalanceMethod)}
                  className="w-full min-h-[42px] sm:min-h-[38px] text-sm sm:text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900"
                >
                  <option value="planckian_grey_edge">Planckian Grey-Edge (Mặc định)</option>
                  <option value="planckian_sog">Shades-of-Gray</option>
                  <option value="none">Giữ nguyên ánh sáng ảnh gốc</option>
                </select>
              </div>

              <div>
                <label htmlFor="catalog-ill" className="block text-xs font-medium text-zinc-600 mb-1.5">
                  Chuẩn ánh sáng bảng màu
                </label>
                <select
                  id="catalog-ill"
                  value={catalogIlluminant}
                  onChange={(e) => onCatalogIlluminantChange(e.target.value as IlluminantName)}
                  className="w-full min-h-[42px] sm:min-h-[38px] text-sm sm:text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900"
                >
                  <option value="D65">Chuẩn màn hình sRGB (D65)</option>
                  <option value="D50">Chuẩn phòng lab ICC (D50 → D65)</option>
                </select>
              </div>
            </div>

            <div className="text-xs text-zinc-500 font-mono tabular-nums space-y-1.5 pt-1">
              <div>
                Điểm khuôn mặt:{" "}
                {landmarkStatus === "neural"
                  ? `${report.landmarkCount} điểm MediaPipe`
                  : "Khung ước lượng thủ công"}
              </div>
              <div>
                Vùng da hợp lệ: {report.skinMetrics.sampleCount.toLocaleString()} px · Melanin σ=
                {report.chromophores.melaninSpatialStd.toFixed(3)} · Hemoglobin σ=
                {report.chromophores.hemoglobinSpatialStd.toFixed(3)}
              </div>
              {enhancementStats && (
                <div>
                  Tiền xử lý nhận diện:{" "}
                  {enhancementStats.lowLightBoosted
                    ? `Nâng sáng thiếu sáng (${enhancementStats.meanLumaBefore.toFixed(0)} → ${enhancementStats.meanLumaAfter.toFixed(0)})`
                    : `Độ sáng ổn định (Luma ${enhancementStats.meanLumaBefore.toFixed(0)})`}
                </div>
              )}
            </div>
          </div>

          {/* Manual Face Box / ROI Fine-Tuning */}
          <div className="pt-4 border-t border-zinc-100 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowRoiTuning((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 hover:text-rose-700 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>
                  {showRoiTuning ? "Ẩn tinh chỉnh khung vùng đo" : "Tinh chỉnh khung khuôn mặt thủ công"}
                </span>
              </button>

              {showRoiTuning && (
                <button
                  type="button"
                  onClick={onResetFaceBox}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Đặt lại</span>
                </button>
              )}
            </div>

            {showRoiTuning && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
                {(
                  [
                    { key: "centerX", label: "Tâm ngang", min: 0.2, max: 0.8, step: 0.01 },
                    { key: "centerY", label: "Tâm dọc", min: 0.2, max: 0.75, step: 0.01 },
                    { key: "faceWidth", label: "Độ rộng mặt", min: 0.2, max: 0.75, step: 0.01 },
                    { key: "faceHeight", label: "Chiều cao mặt", min: 0.25, max: 0.85, step: 0.01 },
                    { key: "jawRatio", label: "Tỷ lệ hàm", min: 0.65, max: 0.98, step: 0.01 },
                    { key: "lipCenterY", label: "Vị trí môi dọc", min: 0.4, max: 0.8, step: 0.01 },
                  ] as const
                ).map((ctrl) => (
                  <label key={ctrl.key} className="block">
                    <span className="flex justify-between text-zinc-600">
                      <span>{ctrl.label}</span>
                      <span className="font-mono tabular-nums">{faceBox[ctrl.key].toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={faceBox[ctrl.key]}
                      onChange={(e) =>
                        onFaceBoxChange((b) => ({ ...b, [ctrl.key]: Number(e.target.value) }))
                      }
                      className="w-full h-2 mt-1.5 accent-zinc-900 cursor-pointer"
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
