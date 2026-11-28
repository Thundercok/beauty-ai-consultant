import React, { useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  ImagePlus,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { PortraitSkeleton, ResultsSkeleton } from "./AnalysisSkeleton";
import { FaceShapeStyleGuide } from "./FaceShapeStyleGuide";
import { InteractiveFaceGuideOverlay } from "./InteractiveFaceGuideOverlay";
import { MakeupGuideSection } from "./MakeupGuideSection";
import { PortraitCanvas, type ViewportMode } from "./PortraitCanvas";
import {
  buildSeasonColorHarmonies,
  type ColorHarmonyPalette,
} from "../lib/beauty/colorHarmony";
import { exportFaceGuidePngDataUrl } from "../lib/beauty/faceGuideExport";
import {
  FACE_GUIDE_ZONE_ORDER,
  buildFaceGuideGeometry,
  buildFaceGuideZones,
  stepFaceGuideRoutine,
  toggleFaceGuideLayer,
  type FaceGuideIntensity,
  type FaceGuideZoneId,
} from "../lib/beauty/faceGuideMap";
import { analyzeVnFacialFeaturesFromReport } from "../lib/beauty/vnFeatureAnalysis";
import { deltaEToMatchPercent } from "../lib/beauty/virtualMakeup";
import {
  VN_SEASON_PLAIN_GUIDE,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
} from "../lib/beauty/vnBeautyGuide";
import {
  PRODUCT_TYPE_VI_LABELS,
  SHAPE_VI_LABELS,
  UNDERTONE_VI_LABELS,
  translateItaCategory,
} from "../lib/beauty/viLabels";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  MatchedProduct,
  OccasionType,
  SkinTextureType,
} from "../lib/beauty/types";

export type ToneViewportMode = ViewportMode;

interface ToneHomeViewProps {
  report: ConsultationReport | null;
  isProcessing: boolean;
  processingLabel: string;
  isDemoPortrait: boolean;
  skinSwatchHex: string;
  faceBox: FaceLandmarksBox;
  viewportMode: ToneViewportMode;
  onViewportModeChange: (mode: ToneViewportMode) => void;
  occasion: OccasionType;
  onOccasionChange: (val: OccasionType) => void;
  texture: SkinTextureType;
  onTextureChange: (val: SkinTextureType) => void;
  topLipstick: MatchedProduct | null;
  topBlush: MatchedProduct | null;
  topEyeshadow: MatchedProduct | null;
  savedIds: Set<number>;
  onToggleSave: (id: number) => void;
  onInspectProduct: (product: MatchedProduct) => void;
  onCycleDemoPortrait: () => void;
  onPickGallery: () => void;
  onPickCamera: () => void;
  onClearPortrait: () => void;
  onTryLipstick: (product: MatchedProduct | null) => void;
  onApplyHarmonyPalette: (palette: ColorHarmonyPalette) => void;
  onOpenShopCategory: (category: "lipstick" | "blush" | "eyeshadow" | "all") => void;
  onOpenInsights: () => void;
  onSavePalette?: () => void;
}

const OCCASION_OPTIONS: Array<{ id: OccasionType; label: string }> = [
  { id: "daily", label: "Đi học" },
  { id: "office", label: "Đi chơi" },
  { id: "glam", label: "Đi tiệc" },
];

function describeLightingPlainVi(cctK: number | null, mode: ToneViewportMode): string {
  if (mode === "original") {
    if (cctK !== null && cctK < 5200) return "Ảnh gốc chụp dưới ánh đèn vàng";
    if (cctK !== null && cctK > 7200) return "Ảnh gốc chụp dưới đèn trắng lạnh";
    return "Ảnh gốc trước khi cân bằng sáng";
  }
  if (cctK !== null && cctK < 5200) return "Đã khử ánh đèn vàng để đo đúng sắc da thật";
  if (cctK !== null && cctK > 7200) return "Đã khử ánh đèn lạnh để đo đúng sắc da thật";
  return "Màu da đã chuẩn ánh sáng tự nhiên";
}

export const ToneHomeView: React.FC<ToneHomeViewProps> = ({
  report,
  isProcessing,
  processingLabel,
  isDemoPortrait,
  skinSwatchHex,
  faceBox,
  viewportMode,
  onViewportModeChange,
  occasion,
  onOccasionChange,
  texture,
  onTextureChange,
  topLipstick,
  topBlush,
  topEyeshadow,
  savedIds,
  onToggleSave,
  onInspectProduct,
  onCycleDemoPortrait,
  onPickGallery,
  onPickCamera,
  onClearPortrait,
  onTryLipstick,
  onApplyHarmonyPalette,
  onOpenShopCategory,
  onOpenInsights,
  onSavePalette,
}) => {
  const quickPicks = [topLipstick, topBlush, topEyeshadow].filter(
    (item): item is MatchedProduct => item !== null
  );

  const harmonyBundle = useMemo(() => {
    if (!report) return null;
    return buildSeasonColorHarmonies(report.season.season, report.blendedTargets);
  }, [report]);

  const activeHarmony: ColorHarmonyPalette | null = useMemo(() => {
    if (!harmonyBundle) return null;
    return (
      harmonyBundle.palettes.find((p) => p.id === occasion) ?? harmonyBundle.palettes[0] ?? null
    );
  }, [harmonyBundle, occasion]);

  const plainGuide = report ? VN_SEASON_PLAIN_GUIDE[report.season.season] : null;

  const portraitFrameRef = useRef<HTMLDivElement | null>(null);
  const [activeGuideLayers, setActiveGuideLayers] = useState<FaceGuideZoneId[]>([]);
  const [focusedGuideZone, setFocusedGuideZone] = useState<FaceGuideZoneId | null>(null);
  const [routineStepMode, setRoutineStepMode] = useState(false);
  const [guideIntensity, setGuideIntensity] = useState<FaceGuideIntensity>("crisp");
  const [savedGuideToast, setSavedGuideToast] = useState(false);

  const featureAnalysis = useMemo(() => {
    if (!report) return null;
    return analyzeVnFacialFeaturesFromReport(report);
  }, [report]);

  const faceGuideGeometry = useMemo(() => {
    if (!report) return null;
    return buildFaceGuideGeometry({
      width: report.width,
      height: report.height,
      neuralLandmarks: report.neuralLandmarks,
      box: faceBox,
      faceShape: report.faceShape.primary,
      undertone: report.season.undertone,
      blendedTargets: report.blendedTargets,
    });
  }, [report, faceBox]);

  const faceGuideZones = useMemo(() => {
    if (!report || !featureAnalysis) return null;
    return buildFaceGuideZones(report, featureAnalysis);
  }, [report, featureAnalysis]);

  const activeZoneContent = useMemo(() => {
    if (!faceGuideZones || activeGuideLayers.length === 0) return null;
    const focusId =
      focusedGuideZone && activeGuideLayers.includes(focusedGuideZone)
        ? focusedGuideZone
        : activeGuideLayers[activeGuideLayers.length - 1];
    return faceGuideZones[focusId] ?? null;
  }, [faceGuideZones, activeGuideLayers, focusedGuideZone]);

  const handleToggleLayer = (zone: FaceGuideZoneId) => {
    setRoutineStepMode(false);
    setActiveGuideLayers((prev) => {
      const next = toggleFaceGuideLayer(prev, zone);
      if (next.includes(zone)) {
        setFocusedGuideZone(zone);
      } else {
        setFocusedGuideZone(next[next.length - 1] ?? null);
      }
      return next;
    });
  };

  const handleTapIdlePin = (zone: FaceGuideZoneId) => {
    setRoutineStepMode(false);
    setActiveGuideLayers([zone]);
    setFocusedGuideZone(zone);
  };

  const handleToggleAllLayers = () => {
    setRoutineStepMode(false);
    if (activeGuideLayers.length === FACE_GUIDE_ZONE_ORDER.length) {
      setActiveGuideLayers([]);
      setFocusedGuideZone(null);
    } else {
      setActiveGuideLayers([...FACE_GUIDE_ZONE_ORDER]);
      setFocusedGuideZone("eyes");
    }
  };

  const handleStartRoutineMode = () => {
    if (routineStepMode) {
      setRoutineStepMode(false);
      setActiveGuideLayers([]);
      setFocusedGuideZone(null);
      return;
    }
    const startZone = FACE_GUIDE_ZONE_ORDER[0];
    setRoutineStepMode(true);
    setActiveGuideLayers([startZone]);
    setFocusedGuideZone(startZone);
  };

  const handleStepRoutine = (dir: "prev" | "next") => {
    const nextZone = stepFaceGuideRoutine(focusedGuideZone, dir);
    setRoutineStepMode(true);
    setActiveGuideLayers([nextZone]);
    setFocusedGuideZone(nextZone);
  };

  const handleClearAllLayers = () => {
    setRoutineStepMode(false);
    setActiveGuideLayers([]);
    setFocusedGuideZone(null);
  };

  const scrollPortraitIntoViewOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      portraitFrameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleShowZoneFromGuide = (zone: FaceGuideZoneId) => {
    setRoutineStepMode(false);
    setActiveGuideLayers((prev) => {
      if (prev.includes(zone)) return prev;
      const nextSet = new Set<FaceGuideZoneId>([...prev, zone]);
      return FACE_GUIDE_ZONE_ORDER.filter((id) => nextSet.has(id));
    });
    setFocusedGuideZone(zone);
    scrollPortraitIntoViewOnMobile();
  };

  const handleShowContourFromGuide = () => {
    setRoutineStepMode(false);
    setActiveGuideLayers(["cheek_jaw", "nose"]);
    setFocusedGuideZone("nose");
    scrollPortraitIntoViewOnMobile();
  };

  const effectiveMode: "corrected" | "original" =
    viewportMode === "original" ? "original" : "corrected";

  const handleDownloadGuidePng = () => {
    if (!report || !faceGuideGeometry || !faceGuideZones || activeGuideLayers.length === 0) return;
    const rgba = effectiveMode === "original" ? report.originalRgba : report.correctedRgba;
    const dataUrl = exportFaceGuidePngDataUrl({
      rgba,
      width: report.width,
      height: report.height,
      geometry: faceGuideGeometry,
      zones: faceGuideZones,
      activeLayers: activeGuideLayers,
      intensity: guideIntensity,
      subtitleVi: `${SHAPE_VI_LABELS[report.faceShape.primary]} · ${UNDERTONE_VI_LABELS[report.season.undertone]}`,
    });
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "so-do-makeup.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSavedGuideToast(true);
    window.setTimeout(() => setSavedGuideToast(false), 1800);
  };

  return (
    <div className="space-y-4">
      {isDemoPortrait && (
        <div
          data-testid="demo-mode-banner"
          role="status"
          className="bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        >
          <div className="text-xs text-[#92400E] leading-relaxed">
            <strong className="font-semibold text-[#78350F]">Đang xem ảnh mẫu</strong> — kết quả bên dưới chỉ để tham khảo.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onPickGallery}
              className="min-h-[34px] px-3 py-1 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              Dùng ảnh của bạn
            </button>
            <button
              type="button"
              data-testid="exit-demo-btn"
              onClick={onClearPortrait}
              className="min-h-[34px] px-2.5 py-1 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[#111111] text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Đóng</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-8 items-start">
      {/* Left Column: Sharp Architectural Portrait Mirror (Sticky on Tablet & Desktop) */}
      <div className="md:col-span-5 md:sticky md:top-20">
        <div className="bg-white border border-[#E5E5E5] overflow-hidden">
          <div className="w-full bg-[#F5F5F5] sm:py-4 md:p-0 md:bg-[#111111]">
            <div
              ref={portraitFrameRef}
              data-testid="hero-portrait-frame"
              className="relative aspect-[4/5] w-full max-w-[440px] mx-auto md:max-w-none overflow-hidden bg-[#111111] sm:border sm:border-[#E5E5E5] md:border-0"
            >
            {/* Clean Top Floating Toggle: Daylight | Original + Switch Demo */}
            <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
              <div className="pointer-events-auto inline-flex items-center p-0.5 rounded-[3px] bg-[#111111]/75 backdrop-blur-md border border-white/15">
                {(
                  [
                    ["corrected", "Chuẩn sáng"],
                    ["original", "Ảnh gốc"],
                  ] as const
                ).map(([id, label]) => {
                  const active = effectiveMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onViewportModeChange(id)}
                      className={`min-h-[30px] px-3 py-1 text-[11px] font-semibold rounded-[2px] whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? "bg-white text-[#111111]"
                          : "text-white/85 hover:text-white"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={onCycleDemoPortrait}
                className="pointer-events-auto min-h-[32px] px-2.5 sm:px-3 py-1 rounded-[3px] bg-[#111111]/75 hover:bg-[#111111] backdrop-blur-md border border-white/15 text-white text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Mẫu khác</span>
              </button>
            </div>

            {isProcessing || !report ? (
              <PortraitSkeleton
                variant="studio"
                statusMessage={processingLabel}
                className="h-full max-h-none"
              />
            ) : (
              <>
                <PortraitCanvas
                  report={report}
                  mode={effectiveMode}
                  showOverlay={false}
                  meshPreview={false}
                  box={faceBox}
                  fit="cover"
                  containerClassName="h-full w-full bg-zinc-950"
                />
                {faceGuideGeometry && faceGuideZones && (
                  <InteractiveFaceGuideOverlay
                    geometry={faceGuideGeometry}
                    zones={faceGuideZones}
                    activeLayers={activeGuideLayers}
                    showPins={false}
                    intensity={guideIntensity}
                    onTapPin={handleTapIdlePin}
                  />
                )}
              </>
            )}

            {/* Bottom Portrait Scrim: Slim Active-Layer Key When Guides Are ON, Full Skin Verdict When Idle */}
            {activeZoneContent && !isProcessing && report && faceGuideZones ? (
              <div
                data-testid="face-guide-legend-bar"
                className="absolute inset-x-0 bottom-0 z-10 pt-10 pb-3 px-4 bg-gradient-to-t from-black/80 via-black/35 to-transparent pointer-events-none"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-white/95">
                  {activeGuideLayers.length > 1 ? (
                    <>
                      <span className="text-white/75">
                        Đang bật {activeGuideLayers.length}/5 lớp:
                      </span>
                      {activeGuideLayers.map((id) => {
                        const z = faceGuideZones[id];
                        return (
                          <span key={id} className="inline-flex items-center gap-1">
                            <span
                              className="w-2 h-2 rounded-full ring-1 ring-white/75 shrink-0"
                              style={{ backgroundColor: z.swatchColor }}
                              aria-hidden="true"
                            />
                            <span>{z.shortLabel}</span>
                          </span>
                        );
                      })}
                    </>
                  ) : (
                    activeZoneContent.legend.map((item) => (
                      <span key={item.label} className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-block shrink-0 ${
                            item.dashed
                              ? "w-3.5 h-0 border-t-2 border-dashed"
                              : "w-2.5 h-2.5 rounded-full ring-1 ring-white/70"
                          }`}
                          style={
                            item.dashed
                              ? { borderColor: item.swatchColor }
                              : { backgroundColor: item.swatchColor }
                          }
                          aria-hidden="true"
                        />
                        <span>{item.label}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="absolute inset-x-0 bottom-0 z-10 pt-12 pb-3.5 px-4 sm:px-5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
                {isProcessing || !report || !plainGuide ? (
                  <div className="space-y-2">
                    <div className="h-3 w-36 rounded-full bg-white/25 animate-pulse" />
                    <div className="h-6 w-52 rounded-[3px] bg-white/30 animate-pulse" />
                    <div className="h-3.5 w-44 rounded-full bg-white/20 animate-pulse" />
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium text-amber-200/95 truncate">
                      {describeLightingPlainVi(report.whiteBalance.estimatedCctK, effectiveMode)}
                    </div>
                    <div className="flex items-start gap-2">
                      <span
                        className="w-3.5 h-3.5 mt-1 rounded-full ring-2 ring-white/80 shrink-0"
                        style={{ backgroundColor: skinSwatchHex }}
                        aria-hidden="true"
                      />
                      <h1 className="text-lg sm:text-[21px] font-bold text-white tracking-[-0.025em] leading-snug line-clamp-2">
                        {plainGuide.plainTitle}
                      </h1>
                    </div>
                    <div className="text-[11px] sm:text-xs text-white/85 truncate">
                      {translateItaCategory(report.skinMetrics.ITA_category)} ·{" "}
                      {SHAPE_VI_LABELS[report.faceShape.primary]}
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Interactive Multi-Layer Makeup Blueprint & Step-by-Step Routine Controls */}
          {!isProcessing && report && faceGuideZones && (
            <div
              data-testid="face-guide-panel"
              className="px-4 sm:px-5 py-3 bg-white border-b border-zinc-100 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-zinc-900 whitespace-nowrap">
                  Chỉ dẫn trên mặt
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    data-testid="face-guide-routine-btn"
                    aria-pressed={routineStepMode}
                    onClick={handleStartRoutineMode}
                    className={`inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      routineStepMode
                        ? "text-rose-700 font-semibold"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <Play className="w-3 h-3" />
                    <span>{routineStepMode ? "Tắt bước" : "Theo bước"}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="face-guide-all-btn"
                    onClick={
                      activeGuideLayers.length > 0 &&
                      activeGuideLayers.length === FACE_GUIDE_ZONE_ORDER.length
                        ? handleClearAllLayers
                        : handleToggleAllLayers
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 whitespace-nowrap cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    <span>
                      {activeGuideLayers.length === FACE_GUIDE_ZONE_ORDER.length
                        ? "Tắt hết"
                        : "Tất cả"}
                    </span>
                  </button>
                </div>
              </div>

              {/* 5 Independent Layer Toggles */}
              <div
                role="group"
                aria-label="Bật hoặc tắt từng lớp chỉ dẫn trang điểm trên khuôn mặt"
                className="grid grid-cols-5 gap-1 p-1 bg-[#F5F5F5] rounded-[4px]"
              >
                {FACE_GUIDE_ZONE_ORDER.map((zoneId) => {
                  const zone = faceGuideZones[zoneId];
                  const isOn = activeGuideLayers.includes(zoneId);
                  return (
                    <button
                      key={zoneId}
                      type="button"
                      data-testid={`layer-toggle-${zoneId}`}
                      aria-pressed={isOn}
                      onClick={() => handleToggleLayer(zoneId)}
                      className={`min-h-[36px] sm:min-h-[32px] px-1 text-[11px] font-medium rounded-[3px] whitespace-nowrap inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                        isOn
                          ? "bg-[#111111] text-white font-semibold"
                          : "text-[#525252] hover:text-[#111111] hover:bg-white"
                      }`}
                    >
                      <span className="lg:hidden">{zone.pinLabel}</span>
                      <span className="hidden lg:inline">{zone.shortLabel}</span>
                    </button>
                  );
                })}
              </div>

              {activeZoneContent ? (
                <div
                  data-testid="face-guide-detail"
                  className="pt-2 border-t border-zinc-100 space-y-2"
                >
                  {/* Step-by-Step Routine Bar OR Multi-Layer Focus Switcher */}
                  {routineStepMode ? (
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-zinc-900 tabular-nums">
                        Bước {activeZoneContent.stepNumber}/5 · {activeZoneContent.shortLabel}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStepRoutine("prev")}
                          aria-label="Bước trước"
                          className="min-h-[28px] px-2 rounded-md border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          <span>Trước</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStepRoutine("next")}
                          aria-label="Bước tiếp theo"
                          className="min-h-[28px] px-2.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white font-medium inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                        >
                          <span>Tiếp theo</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {activeGuideLayers.length > 1 ? (
                          activeGuideLayers.map((id) => {
                            const z = faceGuideZones[id];
                            const isFocused = activeZoneContent.id === id;
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setFocusedGuideZone(id)}
                                className={`whitespace-nowrap pb-0.5 transition-colors cursor-pointer ${
                                  isFocused
                                    ? "font-semibold text-zinc-900 border-b border-zinc-900"
                                    : "text-zinc-500 hover:text-zinc-800"
                                }`}
                              >
                                {z.shortLabel}
                              </button>
                            );
                          })
                        ) : (
                          <span className="font-medium text-rose-700 truncate">
                            {activeZoneContent.detectedCueVi}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleClearAllLayers}
                        className="text-zinc-500 hover:text-zinc-900 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Tắt lớp vẽ
                      </button>
                    </div>
                  )}

                  <div className="space-y-1">
                    {activeGuideLayers.length > 1 && (
                      <div className="text-[11px] font-medium text-rose-700">
                        {activeZoneContent.detectedCueVi}
                      </div>
                    )}
                    <h3 className="text-xs sm:text-sm font-bold text-zinc-900 leading-snug">
                      {activeZoneContent.titleVi}
                    </h3>
                    <p className="text-xs text-zinc-700 leading-relaxed">
                      {activeZoneContent.howToVi}
                    </p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">
                      <span className="font-semibold text-zinc-700">Tránh: </span>
                      {activeZoneContent.avoidVi}
                    </p>
                  </div>

                  {/* Utility Strip: Crisp vs Natural Preview Mode + 1-Tap PNG Blueprint Save */}
                  <div className="pt-2 border-t border-[#E5E5E5] flex flex-wrap items-center justify-between gap-2">
                    <div
                      data-testid="guide-intensity-toggle"
                      role="group"
                      aria-label="Độ rõ nét sơ đồ trang điểm"
                      className="inline-flex items-center p-0.5 rounded-[4px] bg-[#F5F5F5] text-[11px]"
                    >
                      {(
                        [
                          ["crisp", "Nét vẽ rõ"],
                          ["soft", "Tán nhẹ tự nhiên"],
                        ] as const
                      ).map(([modeId, label]) => {
                        const active = guideIntensity === modeId;
                        return (
                          <button
                            key={modeId}
                            type="button"
                            data-testid={`guide-intensity-${modeId}`}
                            aria-pressed={active}
                            onClick={() => setGuideIntensity(modeId)}
                            className={`min-h-[28px] px-2.5 py-0.5 rounded-[3px] whitespace-nowrap transition-colors cursor-pointer ${
                              active
                                ? "bg-white text-[#111111] font-semibold shadow-2xs"
                                : "text-[#666666] hover:text-[#111111] font-medium"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      {activeZoneContent.id === "lips" && (
                        <button
                          type="button"
                          onClick={() => onTryLipstick(topLipstick)}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Thử son ngay</span>
                        </button>
                      )}

                      <button
                        type="button"
                        data-testid="save-face-guide-btn"
                        onClick={handleDownloadGuidePng}
                        className="min-h-[30px] px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                      >
                        {savedGuideToast ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700">Đã lưu sơ đồ</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span>Lưu sơ đồ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  Chạm từng vùng phía trên để hiện đường tán trực tiếp lên mặt.
                </p>
              )}
            </div>
          )}

          {/* Direct 1-tap Analyze Your Own Photo Action Bar */}
          {!isProcessing && report && (
            <div className="px-4 sm:px-5 py-3.5 bg-white space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>
                  {isDemoPortrait
                    ? "Đang xem ảnh mẫu · Thử với mặt bạn để đo chuẩn nhất"
                    : "Đang phân tích ảnh của bạn"}
                </span>
                {!isDemoPortrait && (
                  <button
                    type="button"
                    onClick={onClearPortrait}
                    className="font-medium text-zinc-500 hover:text-rose-700 whitespace-nowrap cursor-pointer"
                  >
                    Xóa ảnh
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={onPickCamera}
                  className="min-h-[40px] px-3 py-2 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Chụp selfie ngay</span>
                </button>
                <button
                  type="button"
                  onClick={onPickGallery}
                  className="min-h-[40px] px-3 py-2 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[#111111] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>Chọn ảnh có sẵn</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Plain-Vietnamese Summary + Unified 3-Swatch Palette + Try Now + Student Picks + Style Guide */}
      <div className="md:col-span-7 space-y-5">
        {isProcessing || !report || !plainGuide ? (
          <ResultsSkeleton />
        ) : (
          <>
            {/* Card 1: Plain-Vietnamese Verdict + Single Unified 3-Color Palette (Lip · Blush · Eye) + Try Now */}
            {harmonyBundle && activeHarmony && (
              <section
                data-testid="color-harmony-section"
                aria-label="Kết luận tông da và 3 màu hợp nhất"
                className="bg-white border border-[#E5E5E5] p-5 sm:p-6 space-y-5"
              >
                {/* Plain-Vietnamese Takeaway */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg sm:text-[22px] font-bold tracking-[-0.025em] text-[#111111]">
                      Tông da của bạn
                    </h2>
                    <span className="text-xs font-semibold text-[#DC2626]">
                      Nhóm {plainGuide.shortTag}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#333333] leading-relaxed">
                    {plainGuide.oneLiner}
                  </p>
                  <p className="text-xs text-[#666666] leading-relaxed">
                    Mẹo nhanh: {plainGuide.studentTip}
                  </p>
                </div>

                {/* Look Switcher: Đi học | Đi chơi | Đi tiệc */}
                <div className="pt-4 border-t border-[#EAEAEA] space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="text-xs font-semibold text-[#111111]">
                        3 màu Son · Má · Mắt hợp da nhất
                      </div>
                      <div className="text-[11px] text-[#737373]">
                        {activeHarmony.title} · {activeHarmony.harmonyType}
                      </div>
                    </div>

                    <div
                      role="tablist"
                      aria-label="Chọn dịp trang điểm"
                      className="grid grid-cols-3 gap-0.5 p-0.5 bg-[#F2F2F2] rounded-[4px] sm:w-[230px] shrink-0"
                    >
                      {OCCASION_OPTIONS.map((opt) => {
                        const active = occasion === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            onClick={() => onOccasionChange(opt.id)}
                            className={`min-h-[34px] sm:min-h-[30px] px-2 text-xs font-medium rounded-[3px] whitespace-nowrap transition-colors cursor-pointer ${
                              active
                                ? "bg-white text-[#111111] shadow-2xs font-semibold"
                                : "text-[#666666] hover:text-[#111111]"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Single Clean 3-Swatch Bar (Son môi · Má hồng · Phấn mắt) */}
                  <div
                    data-testid="hero-signature-palette"
                    className="grid grid-cols-3 border border-[#E5E5E5] divide-x divide-[#E5E5E5] overflow-hidden"
                  >
                    {[
                      activeHarmony.lipstick,
                      activeHarmony.blush,
                      activeHarmony.eyeshadow,
                    ].map((swatch) => (
                      <button
                        key={swatch.role}
                        type="button"
                        onClick={() =>
                          swatch.role === "lipstick"
                            ? onApplyHarmonyPalette(activeHarmony)
                            : onOpenShopCategory(swatch.role)
                        }
                        className="group flex flex-col bg-white text-left cursor-pointer"
                      >
                        <div
                          className="h-16 sm:h-[72px] w-full transition-opacity group-hover:opacity-90"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <div className="px-2.5 sm:px-3 py-2.5 border-t border-[#E5E5E5]">
                          <div className="text-[11px] font-medium text-[#737373]">
                            {swatch.roleLabel}
                          </div>
                          <div className="text-xs font-semibold text-[#111111] leading-snug mt-0.5 line-clamp-2">
                            {swatch.shadeLabel}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-[#525252] leading-relaxed">{activeHarmony.tip}</p>

                  {/* Primary Action: Try Now on Your Lips + Direct Entry to Brutally Honest Audit */}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onApplyHarmonyPalette(activeHarmony)}
                      className="min-h-[42px] sm:min-h-[38px] px-5 py-2 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Thử ngay lên môi</span>
                    </button>

                    <button
                      type="button"
                      data-testid="open-honest-audit-btn"
                      onClick={onOpenInsights}
                      className="min-h-[40px] sm:min-h-[38px] px-4 py-2 rounded-[4px] border border-[#DC2626] bg-white hover:bg-[#DC2626] text-[#DC2626] hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <span>Xem điểm lệch &amp; cách chỉnh</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenShopCategory("all")}
                      className="min-h-[40px] sm:min-h-[38px] px-4 py-2 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[#111111] text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <span>Mỹ phẩm hợp túi tiền</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    {onSavePalette && (
                      <button
                        type="button"
                        data-testid="save-palette-btn"
                        onClick={onSavePalette}
                        className="min-h-[40px] sm:min-h-[38px] px-3.5 py-2 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[#111111] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>Lưu bảng màu</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Compact Avoid Colors Line */}
                <div className="pt-3 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-500 shrink-0">
                    Màu nên tránh kẻo xỉn da:
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {harmonyBundle.avoidSwatches.map((avoid) => (
                      <div key={avoid.label} className="inline-flex items-center gap-1.5">
                        <span
                          className="relative w-4 h-4 rounded-full ring-1 ring-black/10 shrink-0 overflow-hidden"
                          style={{ backgroundColor: avoid.hex }}
                          aria-hidden="true"
                        >
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="w-[140%] h-[1.5px] bg-white/90 rotate-45 shadow-2xs" />
                          </span>
                        </span>
                        <span className="text-xs text-zinc-600">{avoid.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Card 2: Personalized Step-by-Step Makeup Guide ('Hướng dẫn Makeup AI') */}
            <MakeupGuideSection
              report={report}
              texture={texture}
              activeGuideLayers={activeGuideLayers}
              onShowZoneOnFace={handleShowZoneFromGuide}
              onShowContourOnFace={handleShowContourFromGuide}
            />

            {/* Card 3: Top 3 Real Product Picks with Student Price Range & Bare-Face / Teeth Cues */}
            {quickPicks.length > 0 && (
              <section aria-label="Gợi ý sản phẩm hợp nhất" className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <div>
                    <h2 className="text-lg font-bold tracking-[-0.025em] text-[#111111]">
                      Gợi ý chọn mua nhanh
                    </h2>
                    <p className="text-xs text-[#666666]">
                      Khớp sẵn màu môi thật và sắc da của bạn
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenShopCategory("all")}
                    className="min-h-[38px] px-2 text-xs font-semibold text-[#525252] hover:text-[#111111] inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                  >
                    <span>Lọc theo giá</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
                  {quickPicks.map((item) => {
                    const matchPct = deltaEToMatchPercent(item.deltaE);
                    const isSaved = savedIds.has(item.id);
                    const isLip = item.productType === "lipstick";
                    const priceInfo = estimateProductPriceVn(item.brand, item.productType, item.name);
                    const traits = evaluateVnStudentTraits({
                      productType: item.productType,
                      texture: item.texture,
                      hex: item.hex,
                      renderedHex: item.renderedHex,
                      deltaE: item.deltaE,
                    });

                    return (
                      <article
                        key={item.id}
                        className="w-[225px] sm:w-auto shrink-0 snap-start bg-white border border-[#E5E5E5] overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          <div className="relative h-16">
                            <button
                              type="button"
                              onClick={() => onInspectProduct(item)}
                              aria-label={`Xem chi tiết ${item.brand} ${item.name}`}
                              className="block w-full h-full cursor-pointer"
                            >
                              {isLip && item.renderedHex ? (
                                <div className="grid grid-cols-2 h-full">
                                  <div style={{ backgroundColor: item.hex }} />
                                  <div style={{ backgroundColor: item.renderedHex }} />
                                </div>
                              ) : (
                                <div className="h-full" style={{ backgroundColor: item.hex }} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleSave(item.id)}
                              aria-label={isSaved ? `Bỏ lưu ${item.name}` : `Lưu ${item.name}`}
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-[3px] bg-white/95 hover:bg-white flex items-center justify-center transition-colors cursor-pointer"
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${
                                  isSaved ? "fill-[#DC2626] text-[#DC2626]" : "text-[#525252]"
                                }`}
                              />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onInspectProduct(item)}
                            className="w-full text-left p-3 space-y-1 cursor-pointer"
                          >
                            <div className="text-[11px] text-[#737373] truncate">
                              {item.brand} · {PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType}
                            </div>
                            <h3 className="text-xs font-semibold text-[#111111] line-clamp-1">
                              {item.name}
                            </h3>
                            <div className="text-xs text-[#525252] truncate">{item.shade}</div>
                            <div className="pt-0.5 flex items-center gap-1.5 text-[11px] truncate">
                              <span className="font-semibold text-[#111111] tabular-nums">
                                {matchPct}% hợp
                              </span>
                              <span className="text-[#D4D4D4]" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-medium text-[#525252] tabular-nums truncate">
                                {priceInfo.priceRangeLabel}
                              </span>
                            </div>
                            {traits.badges.length > 0 && (
                              <div className="text-[11px] font-medium text-[#DC2626] truncate">
                                {traits.badges[0]}
                              </div>
                            )}
                          </button>
                        </div>

                        <div className="px-3 pb-3 pt-1">
                          {isLip ? (
                            <button
                              type="button"
                              onClick={() => onTryLipstick(item)}
                              className="w-full min-h-[36px] sm:min-h-[34px] px-3 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Thử lên môi
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onInspectProduct(item)}
                              className="w-full min-h-[36px] sm:min-h-[34px] px-3 py-1.5 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[#111111] text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Xem &amp; tìm mua
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Card 3: Practical Face Shape Makeup & Eyewear Guide (no engineering ratios on Home) */}
            <FaceShapeStyleGuide
              report={report}
              texture={texture}
              onTextureChange={onTextureChange}
              onOpenInsights={onOpenInsights}
            />
          </>
        )}
      </div>
      </div>
    </div>
  );
};
