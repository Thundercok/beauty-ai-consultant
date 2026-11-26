import React, { useMemo } from "react";
import { ChevronRight, Heart, RefreshCw, Sparkles } from "lucide-react";
import { PortraitSkeleton, ResultsSkeleton } from "./AnalysisSkeleton";
import { PortraitCanvas, type ViewportMode } from "./PortraitCanvas";
import {
  buildSeasonColorHarmonies,
  type ColorHarmonyPalette,
} from "../lib/beauty/colorHarmony";
import { deltaEToMatchPercent } from "../lib/beauty/virtualMakeup";
import {
  PRODUCT_TYPE_VI_LABELS,
  SEASON_VI_LABELS,
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

interface ToneHomeViewProps {
  report: ConsultationReport | null;
  isProcessing: boolean;
  processingLabel: string;
  skinSwatchHex: string;
  faceBox: FaceLandmarksBox;
  viewportMode: ViewportMode;
  onViewportModeChange: (mode: ViewportMode) => void;
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
  onTryLipstick: (product: MatchedProduct | null) => void;
  onApplyHarmonyPalette: (palette: ColorHarmonyPalette) => void;
  onOpenShopCategory: (category: "lipstick" | "blush" | "eyeshadow" | "all") => void;
  onOpenInsights: () => void;
}

const OCCASION_OPTIONS: Array<{ id: OccasionType; label: string }> = [
  { id: "daily", label: "Hằng ngày" },
  { id: "office", label: "Đi làm" },
  { id: "glam", label: "Đi tiệc" },
];

const TEXTURE_OPTIONS: Array<{ id: SkinTextureType; label: string }> = [
  { id: "combination", label: "Hỗn hợp" },
  { id: "oily", label: "Da dầu" },
  { id: "dry", label: "Da khô" },
];

function shortSeasonName(fullTitle: string): string {
  return fullTitle.replace(/\s*\([^)]*\)/, "");
}

function describeLightingCorrection(cctK: number | null, isOriginalView: boolean): string {
  if (cctK === null) {
    return isOriginalView ? "Ảnh gốc chưa cân bằng sáng" : "Tông màu cá nhân của bạn";
  }
  const rounded = Math.round(cctK / 100) * 100;
  if (cctK < 5500) {
    return isOriginalView
      ? `Ảnh gốc ám đèn vàng (~${rounded}K)`
      : `Đã khử đèn vàng (~${rounded}K) → ánh sáng chuẩn`;
  }
  if (cctK > 7200) {
    return isOriginalView
      ? `Ảnh gốc ám đèn lạnh (~${rounded}K)`
      : `Đã khử đèn lạnh (~${rounded}K) → ánh sáng chuẩn`;
  }
  return isOriginalView ? "Ảnh gốc ánh sáng tự nhiên" : "Tông màu cá nhân của bạn";
}

export const ToneHomeView: React.FC<ToneHomeViewProps> = ({
  report,
  isProcessing,
  processingLabel,
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
  onTryLipstick,
  onApplyHarmonyPalette,
  onOpenShopCategory,
  onOpenInsights,
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

  const isOriginalView = viewportMode === "original";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
      {/* Left Column: Portrait Hero Mirror + Signature 3-Color Swatch Bar */}
      <div className="lg:col-span-5">
        <div className="bg-white rounded-3xl overflow-hidden border border-zinc-200/85 shadow-[0_2px_20px_rgba(0,0,0,0.04)]">
          {/* Explicit fixed responsive height + overflow-hidden prevents any canvas bleed */}
          <div
            data-testid="hero-portrait-frame"
            className="relative h-[355px] sm:h-[435px] lg:h-[490px] w-full overflow-hidden bg-zinc-950"
          >
            {/* Top floating minimal translucent controls */}
            <div className="absolute top-3 inset-x-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
              <div className="pointer-events-auto inline-flex items-center p-0.5 rounded-full bg-black/45 backdrop-blur-md border border-white/15">
                {(
                  [
                    ["corrected", "Ánh sáng chuẩn"],
                    ["original", "Gốc"],
                  ] as const
                ).map(([id, label]) => {
                  const active =
                    viewportMode === id || (id === "corrected" && viewportMode !== "original");
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onViewportModeChange(id)}
                      className={`min-h-[32px] px-3 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                        active ? "bg-white text-zinc-900 shadow-2xs" : "text-white/85 hover:text-white"
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
                className="pointer-events-auto min-h-[34px] px-3 py-1 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/15 text-white text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
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
              <PortraitCanvas
                report={report}
                mode={isOriginalView ? "original" : "corrected"}
                showOverlay={false}
                box={faceBox}
                fit="cover"
                containerClassName="h-full w-full bg-zinc-950"
              />
            )}

            {/* Measured bottom contrast scrim showing lighting status + Personal Color verdict */}
            <div className="absolute inset-x-0 bottom-0 pt-20 pb-4 px-4 sm:px-5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
              {isProcessing || !report ? (
                <div className="space-y-2">
                  <div className="h-3 w-28 rounded-full bg-white/25 animate-pulse" />
                  <div className="h-6 w-48 rounded-md bg-white/30 animate-pulse" />
                  <div className="h-3.5 w-44 rounded-full bg-white/20 animate-pulse" />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-amber-200/95 truncate">
                    {describeLightingCorrection(
                      report.whiteBalance.estimatedCctK,
                      isOriginalView
                    )}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full ring-2 ring-white/80 shrink-0"
                      style={{ backgroundColor: skinSwatchHex }}
                      aria-hidden="true"
                    />
                    <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                      {shortSeasonName(SEASON_VI_LABELS[report.season.season].title)}
                    </h1>
                  </div>
                  <div className="text-xs text-white/85 truncate">
                    {translateItaCategory(report.skinMetrics.ITA_category)} ·{" "}
                    {UNDERTONE_VI_LABELS[report.season.undertone]} ·{" "}
                    {SHAPE_VI_LABELS[report.faceShape.primary]}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Attached 3-Shade Signature Swatch Strip (clean flat surface, zero cards-within-cards) */}
          <div
            data-testid="hero-signature-palette"
            className="bg-white px-4 sm:px-5 py-4 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-900">Bảng màu hợp da nhất</span>
              {!isProcessing && report && (
                <button
                  type="button"
                  onClick={() => onTryLipstick(topLipstick)}
                  className="text-xs font-semibold text-rose-700 hover:text-rose-800 inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                >
                  <span>Thử son lên môi</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {isProcessing || !report ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="h-11 rounded-xl skeleton-shimmer" />
                    <div className="h-3 w-14 rounded-full skeleton-shimmer" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    {
                      label: "Màu Son",
                      hex: report.blendedTargets.lip,
                      action: () => onTryLipstick(topLipstick),
                      hint: "Thử ngay",
                    },
                    {
                      label: "Má Hồng",
                      hex: report.blendedTargets.blush,
                      action: () => onOpenShopCategory("blush"),
                      hint: "Xem mẫu",
                    },
                    {
                      label: "Phấn Mắt",
                      hex: report.blendedTargets.eyeshadow,
                      action: () => onOpenShopCategory("eyeshadow"),
                      hint: "Xem mẫu",
                    },
                  ] as const
                ).map((swatch) => (
                  <button
                    key={swatch.label}
                    type="button"
                    onClick={swatch.action}
                    className="group text-left space-y-1.5 cursor-pointer"
                  >
                    <div
                      className="h-11 w-full rounded-xl ring-1 ring-black/6 group-hover:scale-[1.02] transition-transform duration-150"
                      style={{ backgroundColor: swatch.hex }}
                    />
                    <div className="px-0.5">
                      <div className="text-xs font-semibold text-zinc-900 leading-tight truncate">
                        {swatch.label}
                      </div>
                      <div className="text-[11px] text-zinc-500 group-hover:text-rose-700 transition-colors truncate">
                        {swatch.hint}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!isProcessing && report && (
              <p className="text-xs text-zinc-600 leading-relaxed pt-3 border-t border-zinc-100">
                {SEASON_VI_LABELS[report.season.season].summary}
                {report.season.isBorderline
                  ? ` Bạn cũng hợp tông gần kề như ${shortSeasonName(
                      SEASON_VI_LABELS[report.season.secondarySeason].title
                    )}.`
                  : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Color Harmony, Instant Picks, Practical Makeup Guide */}
      <div className="lg:col-span-7 space-y-5">
        {isProcessing || !report ? (
          <ResultsSkeleton />
        ) : (
          <>
            {/* Color Harmony Section — Complementary Eyeshadow, Blush & Lipstick Palettes */}
            {harmonyBundle && activeHarmony && (
              <section
                data-testid="color-harmony-section"
                aria-label="Phối màu hài hòa"
                className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900">
                      Phối màu hài hòa
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Bộ màu mắt · má · son chuẩn tông{" "}
                      {shortSeasonName(SEASON_VI_LABELS[report.season.season].title)}
                    </p>
                  </div>

                  {/* Occasion / Look Switcher */}
                  <div
                    role="tablist"
                    aria-label="Chọn phong cách phối màu"
                    className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-xl sm:w-[250px] shrink-0"
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
                          className={`min-h-[38px] sm:min-h-[34px] px-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                            active
                              ? "bg-white text-zinc-900 shadow-xs font-semibold"
                              : "text-zinc-600 hover:text-zinc-900"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Connected 3-Tone Editorial Swatch Strip (Eyeshadow · Blush · Lipstick) */}
                <div className="space-y-3">
                  <div className="grid grid-cols-3 rounded-2xl overflow-hidden ring-1 ring-black/8">
                    {[
                      activeHarmony.eyeshadow,
                      activeHarmony.blush,
                      activeHarmony.lipstick,
                    ].map((swatch) => (
                      <div key={swatch.role} className="flex flex-col bg-white">
                        <div
                          className="h-16 sm:h-[72px] w-full"
                          style={{ backgroundColor: swatch.hex }}
                        />
                        <div className="px-2.5 sm:px-3 py-2.5 border-t border-zinc-100">
                          <div className="text-[11px] font-medium text-zinc-500">
                            {swatch.roleLabel}
                          </div>
                          <div className="text-xs font-semibold text-zinc-900 leading-snug mt-0.5 line-clamp-2">
                            {swatch.shadeLabel}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Practical harmony note + Try-on CTA */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-0.5">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-semibold text-zinc-900">
                        {activeHarmony.title} ·{" "}
                        <span className="font-medium text-rose-700">
                          {activeHarmony.harmonyType}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 leading-relaxed">{activeHarmony.tip}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onApplyHarmonyPalette(activeHarmony)}
                      className="min-h-[42px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Thử bảng màu này</span>
                    </button>
                  </div>
                </div>

                {/* Compact Avoid Colors Row */}
                <div className="pt-3.5 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <span className="text-xs font-medium text-zinc-500 shrink-0">
                    Tông màu dễ làm xỉn da:
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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

            {/* Instant Top Picks Carousel */}
            {quickPicks.length > 0 && (
              <section aria-label="Gợi ý nổi bật cho bạn" className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900">
                      Gợi ý hợp nhất cho bạn
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Chọn nhanh theo sắc da và màu môi tự nhiên
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenShopCategory("all")}
                    className="min-h-[40px] px-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                  >
                    <span>Xem tất cả</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
                  {quickPicks.map((item) => {
                    const matchPct = deltaEToMatchPercent(item.deltaE);
                    const isSaved = savedIds.has(item.id);
                    const isLip = item.productType === "lipstick";
                    return (
                      <article
                        key={item.id}
                        className="w-[215px] sm:w-auto shrink-0 snap-start bg-white rounded-2xl border border-zinc-200/85 overflow-hidden flex flex-col justify-between"
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
                              className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                            >
                              <Heart
                                className={`w-4 h-4 ${
                                  isSaved ? "fill-rose-600 text-rose-600" : "text-zinc-600"
                                }`}
                              />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => onInspectProduct(item)}
                            className="w-full text-left p-3 space-y-1 cursor-pointer"
                          >
                            <div className="text-[11px] text-zinc-500 truncate">
                              {item.brand} ·{" "}
                              {PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType}
                            </div>
                            <h3 className="text-xs font-semibold text-zinc-900 line-clamp-1">
                              {item.name}
                            </h3>
                            <div className="text-xs text-zinc-600 truncate">{item.shade}</div>
                            <div className="text-[11px] font-medium text-emerald-700 tabular-nums pt-0.5">
                              {matchPct}% hợp da bạn
                            </div>
                          </button>
                        </div>

                        <div className="px-3 pb-3 pt-1">
                          {isLip ? (
                            <button
                              type="button"
                              onClick={() => onTryLipstick(item)}
                              className="w-full min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Thử lên môi
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onInspectProduct(item)}
                              className="w-full min-h-[40px] sm:min-h-[36px] px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Xem chi tiết
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Practical Face-Shape Makeup Guide with inline Skin Texture control */}
            <section className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-zinc-900">
                    Mẹo trang điểm cho {SHAPE_VI_LABELS[report.faceShape.primary]}
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {report.advice.executionParameters.intensity.replace(/\s*\([^)]*\)/, "")}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-xl sm:w-[230px] shrink-0">
                  {TEXTURE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onTextureChange(opt.id)}
                      className={`min-h-[36px] sm:min-h-[32px] px-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                        texture === opt.id
                          ? "bg-white text-zinc-900 shadow-xs font-semibold"
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divide-y divide-zinc-100 text-sm">
                {[
                  { label: "Tạo khối", text: report.advice.contour },
                  { label: "Đánh má", text: report.advice.blush },
                  { label: "Trang điểm mắt", text: report.advice.eyes },
                  { label: "Cách đánh môi", text: report.advice.lip },
                ].map((row) => (
                  <div key={row.label} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="text-xs font-semibold text-zinc-900 mb-0.5">{row.label}</div>
                    <p className="text-xs text-zinc-600 leading-relaxed">{row.text}</p>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-zinc-100 space-y-1.5 text-xs text-zinc-600 leading-relaxed">
                <div>
                  <span className="font-semibold text-zinc-900">Nền &amp; Dưỡng: </span>
                  {report.advice.executionParameters.prep} ·{" "}
                  {report.advice.executionParameters.textureStyle}
                </div>
                <div>
                  <span className="font-semibold text-zinc-900">Nên hạn chế: </span>
                  {report.advice.avoid.join(" · ")}
                </div>
              </div>

              <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-500">
                  Kiểm tra ánh đèn phòng &amp; bản đồ sắc tố da
                </span>
                <button
                  type="button"
                  onClick={onOpenInsights}
                  className="text-xs font-semibold text-zinc-900 hover:text-rose-700 inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
                >
                  <span>Chuyên sâu</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
