import React, { useMemo, useState } from "react";
import { ChevronDown, Download, RotateCcw, SlidersHorizontal } from "lucide-react";
import { AutoFaceShapeCard } from "./AutoFaceShapeCard";
import { BeautyReportExportModal } from "./BeautyReportExportModal";
import { FacialAsymmetryHeatmap } from "./FacialAsymmetryHeatmap";
import { HonestFaceAuditStudio } from "./HonestFaceAuditStudio";
import type { DemoPortraitPreset } from "./PhotoPickerSheet";
import { PortraitCanvas } from "./PortraitCanvas";
import { RelightingLab } from "./RelightingLab";
import { SkinToneLabChart } from "./SkinToneLabChart";
import { computeAnalysisConfidence } from "../lib/beauty/analysisConfidence";
import { buildFacialAsymmetryHeatmap } from "../lib/beauty/asymmetryHeatmap";
import { analyzeFaceShapeFromGeometry } from "../lib/beauty/autoFaceShapeAnalyzer";
import { summarizeFaceMesh } from "../lib/beauty/faceMeshOverlay";
import type { EnhancementStats } from "../lib/beauty/imageEnhancement";
import {
  SEASON_VI_LABELS,
  UNDERTONE_VI_LABELS,
  describeCctVi,
  translateItaCategory,
} from "../lib/beauty/viLabels";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  IlluminantName,
  MatchedProduct,
  SeasonName,
  WhiteBalanceMethod,
} from "../lib/beauty/types";

interface ProInsightsViewProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  skinSwatchHex: string;
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
  topLipstick: MatchedProduct | null;
  topBlush: MatchedProduct | null;
  topEyeshadow: MatchedProduct | null;
  recommendedLipsticks: MatchedProduct[];
  recommendedBlushes: MatchedProduct[];
  recommendedEyeshadows: MatchedProduct[];
  demoPresets: DemoPortraitPreset[];
  activeDemoId: string | null;
  onSelectDemo: (preset: DemoPortraitPreset) => void;
  onOpenPhotoPicker: () => void;
  onNotify?: (message: string) => void;
  isDemoPortrait?: boolean;
}

type InsightsTab = "overview" | "honest_audit" | "lighting";
type SkinMapMode = "melanin" | "hemoglobin" | "roi";

export const ProInsightsView: React.FC<ProInsightsViewProps> = ({
  report,
  faceBox,
  skinSwatchHex,
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
  topLipstick,
  topBlush,
  topEyeshadow,
  recommendedLipsticks,
  recommendedBlushes,
  recommendedEyeshadows,
  demoPresets,
  activeDemoId,
  onSelectDemo,
  onOpenPhotoPicker,
  onNotify,
  isDemoPortrait = false,
}) => {
  const [subTab, setSubTab] = useState<InsightsTab>("overview");
  const [skinMapMode, setSkinMapMode] = useState<SkinMapMode>("melanin");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [showAllSeasons, setShowAllSeasons] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(
    landmarkStatus === "fallback"
  );
  const [showRoiOverlay, setShowRoiOverlay] = useState(true);

  const visibleSeasons = showAllSeasons ? sortedSeasons : sortedSeasons.slice(0, 4);

  const heatmapSummary = useMemo(
    () => buildFacialAsymmetryHeatmap(report.neuralLandmarks),
    [report.neuralLandmarks]
  );

  const faceShapeSummary = useMemo(
    () =>
      analyzeFaceShapeFromGeometry({
        neuralLandmarks: report.neuralLandmarks,
        faceBox,
        width: report.width,
        height: report.height,
        undertone: report.season.undertone,
      }),
    [report.neuralLandmarks, faceBox, report.width, report.height, report.season.undertone]
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

  const balanceAccentClass =
    !heatmapSummary.available
      ? "text-[#737373]"
      : heatmapSummary.overallScore >= 88
        ? "text-[#059669]"
        : heatmapSummary.overallScore >= 76
          ? "text-[#D97706]"
          : "text-[#DC2626]";

  const confidenceAccentClass =
    confidence.level === "high"
      ? "text-[#059669]"
      : confidence.level === "medium"
        ? "text-[#D97706]"
        : "text-[#DC2626]";

  const cctLabel =
    report.whiteBalance.estimatedCctK !== null
      ? `${Math.round(report.whiteBalance.estimatedCctK)}K`
      : "Tự động";

  return (
    <div className="space-y-6">
      {isDemoPortrait && (
        <div
          data-testid="insights-demo-strip"
          className="bg-[#FFFBEB] border border-[#FDE68A] px-3.5 py-2 text-xs text-[#92400E]"
        >
          <strong className="font-semibold text-[#78350F]">Đang xem ảnh mẫu</strong> — số liệu bên
          dưới chỉ để minh họa.
        </div>
      )}

      {/* Editorial Header + Above-the-Fold 4-Metric Display-Sans KPI Bento */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-2xl sm:text-[32px] font-bold tracking-[-0.035em] text-[#0A0A0A] leading-tight">
              Phân tích chi tiết
            </h1>
            <p className="text-xs sm:text-sm text-[#737373]">
              Toàn bộ chỉ số cân đối, dáng mặt, sắc độ da và ánh sáng trong một màn hình
            </p>
          </div>

          <button
            type="button"
            data-testid="open-report-export-btn"
            onClick={() => setReportModalOpen(true)}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-[#0A0A0A] hover:bg-[#262626] rounded-[4px] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Tải báo cáo</span>
          </button>
        </div>

        {/* Above-the-Fold 4-Metric Display-Sans KPI Strip */}
        <section
          data-testid="pro-insights-kpi-grid"
          aria-label="Tóm tắt 4 chỉ số khuôn mặt chính"
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#E5E5E5] border border-[#E5E5E5]"
        >
          {/* Metric 1: Facial Balance */}
          <div className="bg-white p-4 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="metric-label">Độ cân đối</span>
              {heatmapSummary.available && (
                <span className={`text-[11px] font-semibold ${balanceAccentClass}`}>
                  {heatmapSummary.overallScore >= 88
                    ? "Cân đều"
                    : heatmapSummary.overallScore >= 76
                      ? "Lệch nhẹ"
                      : "Cần chỉnh"}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="metric-display text-[30px] sm:text-[36px]">
                {heatmapSummary.available ? Math.round(heatmapSummary.overallScore) : "—"}
              </span>
              {heatmapSummary.available && (
                <span className="text-sm font-medium text-[#737373] font-mono tabular-nums">
                  /100
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#737373] truncate">
              {heatmapSummary.available && heatmapSummary.zones[0]
                ? `Lệch rõ nhất: ${heatmapSummary.zones[0].labelVi}`
                : "Chụp chính diện để đo 478 điểm"}
            </p>
          </div>

          {/* Metric 2: Face Shape */}
          <div className="bg-white p-4 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="metric-label">Dáng mặt</span>
              <span className="text-[11px] font-mono tabular-nums font-semibold text-[#525252]">
                {faceShapeSummary.confidencePct}%
              </span>
            </div>
            <div className="metric-display-sm text-[22px] sm:text-[26px] truncate">
              {faceShapeSummary.shapeLabelVi}
            </div>
            <p className="text-[11px] text-[#737373] font-mono tabular-nums truncate">
              Tỉ lệ {faceShapeSummary.result.ratios.r1.toFixed(2)} · Trán/Hàm{" "}
              {faceShapeSummary.result.ratios.r3.toFixed(2)}
            </p>
          </div>

          {/* Metric 3: Skin Lightness & Undertone */}
          <div className="bg-white p-4 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="metric-label">Độ sáng da (ITA°)</span>
              <span
                className="w-4 h-4 border border-[#D4D4D4] shrink-0"
                style={{ backgroundColor: skinSwatchHex }}
                aria-hidden="true"
              />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="metric-display text-[30px] sm:text-[36px]">
                {report.skinMetrics.ITA_deg.toFixed(1)}°
              </span>
            </div>
            <p className="text-[11px] text-[#737373] truncate">
              {translateItaCategory(report.skinMetrics.ITA_category)} ·{" "}
              {UNDERTONE_VI_LABELS[report.season.undertone].replace(/\s*\([^)]*\)/, "")}
            </p>
          </div>

          {/* Metric 4: Image Clarity & Lighting */}
          <div className="bg-white p-4 sm:p-5 flex flex-col justify-between gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="metric-label">Độ rõ ảnh</span>
              <span className={`text-[11px] font-semibold ${confidenceAccentClass}`}>
                {confidence.label}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="metric-display text-[30px] sm:text-[36px]">
                {confidence.score}
              </span>
              <span className="text-sm font-medium text-[#737373] font-mono tabular-nums">
                %
              </span>
            </div>
            <p className="text-[11px] text-[#737373] truncate">
              {cctLabel} · {describeCctVi(report.whiteBalance.estimatedCctK)}
            </p>
          </div>
        </section>

        {/* 3 Fixed, Non-Scrolling Architectural Tabs */}
        <div
          role="tablist"
          aria-label="Chọn mục phân tích chi tiết"
          data-testid="pro-insights-tablist"
          className="grid grid-cols-3 sm:flex sm:items-center sm:gap-8 border-b border-[#E5E5E5]"
        >
          {(
            [
              ["overview", "Tổng quan"],
              ["honest_audit", "Chỉnh đường nét"],
              ["lighting", "Thử ánh sáng"],
            ] as const
          ).map(([id, label]) => {
            const active = subTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                data-testid={`pro-subtab-${id}`}
                aria-selected={active}
                onClick={() => setSubTab(id)}
                className={`min-h-[44px] px-2 sm:px-0 py-2.5 text-xs sm:text-[13px] border-b-2 text-center sm:text-left -mb-px transition-colors cursor-pointer ${
                  active
                    ? "border-[#DC2626] text-[#0A0A0A] font-semibold"
                    : "border-transparent text-[#737373] hover:text-[#0A0A0A] font-medium"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: Unified Editorial Grid Overview — Everything Scannable Without Tab-Hunting */}
      {subTab === "overview" && (
        <div className="space-y-6">
          {/* Row 1: Full-Width Interactive Asymmetry Heatmap */}
          <FacialAsymmetryHeatmap
            report={report}
            faceBox={faceBox}
            onOpenPhotoPicker={onOpenPhotoPicker}
          />

          {/* Row 2: Equal-Height 2-Column Row — Face Shape + Skin Tone L*a*b* Variance */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            <div className="xl:col-span-6">
              <AutoFaceShapeCard
                neuralLandmarks={report.neuralLandmarks}
                faceBox={faceBox}
                width={report.width}
                height={report.height}
                undertone={report.season.undertone}
              />
            </div>
            <div className="xl:col-span-6">
              <SkinToneLabChart report={report} faceBox={faceBox} />
            </div>
          </div>

          {/* Row 3: Equal-Height 2-Column Row — Skin Pigment/ROI Maps + Colorimetry & Season Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Left: Consolidated Skin Pigment & ROI Verification Card (1-Tap Switcher) */}
            <section
              data-testid="mesh-preview-bar"
              aria-label="Bản đồ sắc tố da và vùng đo 478 điểm"
              className="lg:col-span-6 bg-white border border-[#E5E5E5] flex flex-col divide-y divide-[#E5E5E5] h-full"
            >
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="metric-label">Bản đồ da &amp; vùng lấy mẫu</div>
                  <h2 className="font-display text-lg font-bold tracking-[-0.025em] text-[#0A0A0A] mt-0.5">
                    {skinMapMode === "melanin"
                      ? "Phân bố sắc tố nâu (Melanin)"
                      : skinMapMode === "hemoglobin"
                        ? "Phân bố độ ửng đỏ (Hemoglobin)"
                        : "Vùng đo da & Lưới 478 điểm"}
                  </h2>
                </div>

                <div
                  role="tablist"
                  aria-label="Chọn lớp bản đồ da"
                  className="grid grid-cols-3 border border-[#E5E5E5] rounded-[4px] overflow-hidden shrink-0"
                >
                  {(
                    [
                      ["melanin", "Melanin"],
                      ["hemoglobin", "Ửng đỏ"],
                      ["roi", "Vùng đo"],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={skinMapMode === mode}
                      onClick={() => setSkinMapMode(mode)}
                      className={`min-h-[34px] px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                        skinMapMode === mode
                          ? "bg-[#0A0A0A] text-white"
                          : "bg-white text-[#525252] hover:text-[#0A0A0A]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Single Sharp Canvas Stage */}
              <div className="bg-[#0A0A0A] flex-1 flex flex-col justify-center">
                <PortraitCanvas
                  report={report}
                  mode={
                    skinMapMode === "roi"
                      ? showRoiOverlay
                        ? "roi"
                        : "corrected"
                      : skinMapMode
                  }
                  showOverlay={skinMapMode === "roi" && showRoiOverlay}
                  meshPreview={skinMapMode === "roi" && showMeshPreview}
                  box={faceBox}
                  className="max-h-[340px]"
                />
              </div>

              {/* Context Bar: Legend or Quick Mesh/ROI Toggles */}
              <div className="px-4 sm:px-5 py-3 bg-white flex flex-wrap items-center justify-between gap-2 text-xs">
                {skinMapMode === "roi" ? (
                  <>
                    <span className="text-[#525252] truncate">{meshSummary.statusLabel}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowRoiOverlay((v) => !v)}
                        className={`min-h-[30px] px-2.5 rounded-[3px] text-[11px] font-semibold border transition-colors cursor-pointer ${
                          showRoiOverlay
                            ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                            : "bg-white text-[#525252] border-[#D4D4D4] hover:border-[#0A0A0A]"
                        }`}
                      >
                        Vùng đo: {showRoiOverlay ? "Bật" : "Tắt"}
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showMeshPreview}
                        onClick={onToggleMeshPreview}
                        className={`min-h-[30px] px-2.5 rounded-[3px] text-[11px] font-semibold border transition-colors cursor-pointer ${
                          showMeshPreview
                            ? "bg-[#DC2626] text-white border-[#DC2626]"
                            : "bg-white text-[#525252] border-[#D4D4D4] hover:border-[#0A0A0A]"
                        }`}
                      >
                        Lưới 478: {showMeshPreview ? "Bật" : "Tắt"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-[#525252]">
                      {skinMapMode === "melanin"
                        ? "Nhận diện vùng sạm màu hoặc tàn nhang nhẹ trên da."
                        : "Nhận diện vùng má hay ửng đỏ để chọn kem nền & má hồng."}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-[#737373] shrink-0">
                      <span>Ít</span>
                      <span
                        className={`w-14 h-2 ${
                          skinMapMode === "melanin"
                            ? "bg-gradient-to-r from-[#2d5091] via-[#c7995b] to-[#fa961e]"
                            : "bg-gradient-to-r from-[#2896c8] via-[#a35a9c] to-[#fa2c37]"
                        }`}
                      />
                      <span>Nhiều</span>
                    </div>
                  </>
                )}
              </div>

              {/* 3-Column Display-Sans Skin Map Stats */}
              <div className="grid grid-cols-3 divide-x divide-[#E5E5E5] bg-[#FAFAFA]">
                <div className="px-3.5 py-3">
                  <div className="metric-label">Điểm đo mặt</div>
                  <div className="metric-display-sm text-base sm:text-lg mt-1">
                    {meshSummary.mode === "neural"
                      ? `${meshSummary.inBoundsCount}/${meshSummary.pointCount}`
                      : "Ước lượng"}
                  </div>
                </div>
                <div className="px-3.5 py-3">
                  <div className="metric-label">Mẫu da sạch</div>
                  <div className="metric-display-sm text-base sm:text-lg mt-1">
                    {report.skinMetrics.sampleCount.toLocaleString()}
                    <span className="text-[11px] font-mono text-[#737373] font-normal ml-0.5">
                      px
                    </span>
                  </div>
                </div>
                <div className="px-3.5 py-3">
                  <div className="metric-label">
                    {skinMapMode === "hemoglobin" ? "Độ đều ửng đỏ" : "Độ đều sắc nâu"}
                  </div>
                  <div className="metric-display-sm text-base sm:text-lg mt-1">
                    {skinMapMode === "hemoglobin"
                      ? report.chromophores.hemoglobinSpatialStd.toFixed(3)
                      : report.chromophores.melaninSpatialStd.toFixed(3)}
                  </div>
                </div>
              </div>
            </section>

            {/* Right: Colorimetry, Season Matrix, Image Quality & Collapsible Technical Controls */}
            <section
              data-testid="skin-metrics-confidence-card"
              aria-label="Chỉ số màu sắc, 12 nhóm mùa và tùy chỉnh kỹ thuật"
              className="lg:col-span-6 bg-white border border-[#E5E5E5] flex flex-col divide-y divide-[#E5E5E5] h-full"
            >
              {/* Header */}
              <div className="p-4 sm:p-5 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="metric-label">Sắc độ &amp; nhóm mùa</div>
                  <h2 className="font-display text-lg font-bold tracking-[-0.025em] text-[#0A0A0A] mt-0.5">
                    {SEASON_VI_LABELS[report.season.season].title}
                  </h2>
                </div>
                <span className="font-mono tabular-nums text-xs font-semibold text-[#525252] shrink-0">
                  {report.season.season}
                </span>
              </div>

              {/* 3-Column Display-Sans Colorimetry Strip */}
              <div className="grid grid-cols-3 divide-x divide-[#E5E5E5] bg-[#FAFAFA]">
                <div className="px-3.5 py-3.5">
                  <div className="metric-label">L* / a* / b*</div>
                  <div className="metric-display-sm text-base sm:text-lg mt-1">
                    {report.skinMetrics.L_star.toFixed(0)} · {report.skinMetrics.a_star.toFixed(0)}{" "}
                    · {report.skinMetrics.b_star.toFixed(0)}
                  </div>
                </div>
                <div className="px-3.5 py-3.5">
                  <div className="metric-label">Tông ấm</div>
                  <div className="metric-display-sm text-base sm:text-lg mt-1">
                    {(report.season.warmProbability * 100).toFixed(0)}%
                  </div>
                </div>
                <div className="px-3.5 py-3.5">
                  <div className="metric-label">Góc màu · Độ bão hòa</div>
                  <div className="metric-display-sm text-base sm:text-lg mt-1">
                    {report.season.skinHueDeg.toFixed(0)}° · {report.season.skinChroma.toFixed(1)}
                  </div>
                </div>
              </div>

              {/* Season Probabilities */}
              <div className="p-4 sm:p-5 space-y-3 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="metric-label">
                    Độ khớp {showAllSeasons ? "12 nhóm mùa" : "4 nhóm mùa gần nhất"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllSeasons((v) => !v)}
                    className="text-xs font-semibold text-[#DC2626] hover:text-[#991B1B] whitespace-nowrap cursor-pointer"
                  >
                    {showAllSeasons ? "Thu gọn" : "Xem tất cả 12 mùa"}
                  </button>
                </div>

                <div className="space-y-2.5">
                  {visibleSeasons.map((item, idx) => (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span
                          className={
                            idx === 0
                              ? "font-semibold text-[#0A0A0A]"
                              : "font-medium text-[#525252]"
                          }
                        >
                          {SEASON_VI_LABELS[item.name].title}
                          <span className="text-[#737373] font-normal ml-1.5">({item.name})</span>
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-[#0A0A0A] shrink-0">
                          {(item.prob * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-[4px] w-full bg-[#EFEFEF] overflow-hidden">
                        <div
                          className={`h-full ${idx === 0 ? "bg-[#0A0A0A]" : "bg-[#A3A3A3]"}`}
                          style={{ width: `${Math.max(2, item.prob * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Compact Image Quality Breakdown */}
                <div className="pt-3.5 mt-3.5 border-t border-[#EFEFEF] space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="metric-label">Kiểm tra chất lượng ảnh đầu vào</span>
                    <span className={`text-[11px] font-semibold ${confidenceAccentClass}`}>
                      {confidence.score}% · {confidence.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-[#525252]">
                    {confidence.factors.map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 min-w-0">
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              f.status === "good"
                                ? "bg-emerald-500"
                                : f.status === "fair"
                                  ? "bg-amber-500"
                                  : "bg-rose-500"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="truncate">{f.label}</span>
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-[#0A0A0A] shrink-0">
                          {f.valueLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Collapsible Technical & Manual ROI Controls (Out of the Way by Default) */}
              <div className="bg-[#FAFAFA]">
                <button
                  type="button"
                  aria-expanded={showAdvancedControls}
                  onClick={() => setShowAdvancedControls((v) => !v)}
                  className="w-full px-4 sm:px-5 py-3 flex items-center justify-between gap-2 text-xs font-semibold text-[#0A0A0A] hover:bg-[#F5F5F5] transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#525252]" />
                    <span>Tùy chỉnh kỹ thuật &amp; khung đo mặt</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#737373] transition-transform ${
                      showAdvancedControls ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {showAdvancedControls && (
                  <div className="px-4 sm:px-5 pb-4 pt-2 border-t border-[#E5E5E5] bg-white space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="wb-method"
                          className="block metric-label mb-1.5"
                        >
                          Cân bằng ánh sáng
                        </label>
                        <select
                          id="wb-method"
                          value={wbMethod}
                          onChange={(e) =>
                            onWbMethodChange(e.target.value as WhiteBalanceMethod)
                          }
                          className="w-full min-h-[38px] text-xs bg-white border border-[#D4D4D4] rounded-[4px] px-2.5 py-1.5 text-[#0A0A0A]"
                        >
                          <option value="planckian_grey_edge">Tự động chuẩn ánh sáng (Mặc định)</option>
                          <option value="planckian_sog">Cân bằng dịu (Shades-of-Gray)</option>
                          <option value="none">Giữ nguyên ánh sáng ảnh gốc</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="catalog-ill"
                          className="block metric-label mb-1.5"
                        >
                          Chuẩn ánh sáng bảng màu
                        </label>
                        <select
                          id="catalog-ill"
                          value={catalogIlluminant}
                          onChange={(e) =>
                            onCatalogIlluminantChange(e.target.value as IlluminantName)
                          }
                          className="w-full min-h-[38px] text-xs bg-white border border-[#D4D4D4] rounded-[4px] px-2.5 py-1.5 text-[#0A0A0A]"
                        >
                          <option value="D65">Ánh sáng ban ngày (D65)</option>
                          <option value="D50">Chuẩn studio in ấn (D50)</option>
                        </select>
                      </div>
                    </div>

                    {enhancementStats && (
                      <div className="text-[11px] text-[#737373] font-mono tabular-nums">
                        Tiền xử lý ảnh:{" "}
                        {enhancementStats.lowLightBoosted
                          ? `Đã nâng sáng (${enhancementStats.meanLumaBefore.toFixed(0)} → ${enhancementStats.meanLumaAfter.toFixed(0)})`
                          : `Độ sáng ổn định (Luma ${enhancementStats.meanLumaBefore.toFixed(0)})`}
                      </div>
                    )}

                    <div className="pt-3 border-t border-[#EFEFEF] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="metric-label">Khung khuôn mặt thủ công</span>
                        <button
                          type="button"
                          onClick={onResetFaceBox}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#525252] hover:text-[#0A0A0A] cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Đặt lại</span>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
                        {(
                          [
                            { key: "centerX", label: "Tâm ngang", min: 0.2, max: 0.8, step: 0.01 },
                            { key: "centerY", label: "Tâm dọc", min: 0.2, max: 0.75, step: 0.01 },
                            { key: "faceWidth", label: "Rộng mặt", min: 0.2, max: 0.75, step: 0.01 },
                            { key: "faceHeight", label: "Cao mặt", min: 0.25, max: 0.85, step: 0.01 },
                            { key: "jawRatio", label: "Tỷ lệ hàm", min: 0.65, max: 0.98, step: 0.01 },
                            { key: "lipCenterY", label: "Vị trí môi", min: 0.4, max: 0.8, step: 0.01 },
                          ] as const
                        ).map((ctrl) => (
                          <label key={ctrl.key} className="block">
                            <span className="flex justify-between text-[#525252]">
                              <span>{ctrl.label}</span>
                              <span className="font-mono tabular-nums text-[#0A0A0A]">
                                {faceBox[ctrl.key].toFixed(2)}
                              </span>
                            </span>
                            <input
                              type="range"
                              min={ctrl.min}
                              max={ctrl.max}
                              step={ctrl.step}
                              value={faceBox[ctrl.key]}
                              onChange={(e) =>
                                onFaceBoxChange((b) => ({
                                  ...b,
                                  [ctrl.key]: Number(e.target.value),
                                }))
                              }
                              className="w-full h-1.5 mt-1 accent-[#0A0A0A] cursor-pointer"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: Brutally Honest Feature Repair & Virtual Makeup Overlay */}
      {subTab === "honest_audit" && (
        <HonestFaceAuditStudio
          report={report}
          faceBox={faceBox}
          topLipstick={topLipstick}
          topBlush={topBlush}
          topEyeshadow={topEyeshadow}
          demoPresets={demoPresets}
          activeDemoId={activeDemoId}
          onSelectDemo={onSelectDemo}
          onOpenPhotoPicker={onOpenPhotoPicker}
        />
      )}

      {/* TAB 3: 1-Tap Side-by-Side Ambient Lighting Simulation */}
      {subTab === "lighting" && <RelightingLab report={report} />}

      <BeautyReportExportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        report={report}
        faceBox={faceBox}
        skinSwatchHex={skinSwatchHex}
        recommendedLipsticks={recommendedLipsticks}
        recommendedBlushes={recommendedBlushes}
        recommendedEyeshadows={recommendedEyeshadows}
        onExportJson={onExportJson}
        onNotify={onNotify}
      />
    </div>
  );
};
