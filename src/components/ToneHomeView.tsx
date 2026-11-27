import React, { useMemo } from "react";
import {
  Camera,
  ChevronRight,
  Heart,
  ImagePlus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { PortraitSkeleton, ResultsSkeleton } from "./AnalysisSkeleton";
import { FaceShapeStyleGuide } from "./FaceShapeStyleGuide";
import { MakeupGuideSection } from "./MakeupGuideSection";
import { PortraitCanvas, type ViewportMode } from "./PortraitCanvas";
import {
  buildSeasonColorHarmonies,
  type ColorHarmonyPalette,
} from "../lib/beauty/colorHarmony";
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

  const effectiveMode: "corrected" | "original" =
    viewportMode === "original" ? "original" : "corrected";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
      {/* Left Column: Clean Full-Bleed Portrait Mirror + Own-Photo CTA (Zero Slider Clutter) */}
      <div className="lg:col-span-5">
        <div className="bg-white rounded-3xl overflow-hidden border border-zinc-200/85 shadow-[0_2px_20px_rgba(0,0,0,0.04)]">
          <div
            data-testid="hero-portrait-frame"
            className="relative h-[375px] sm:h-[445px] lg:h-[495px] w-full overflow-hidden bg-zinc-950"
          >
            {/* Clean Top Floating Toggle: Daylight | Original + Switch Demo */}
            <div className="absolute top-3 inset-x-3 z-20 flex items-center justify-between gap-2 pointer-events-none">
              <div className="pointer-events-auto inline-flex items-center p-0.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15">
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
                      className={`min-h-[32px] px-3 py-1 text-[11px] font-semibold rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? "bg-white text-zinc-900 shadow-2xs"
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
                className="pointer-events-auto min-h-[34px] px-2.5 sm:px-3 py-1 rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-md border border-white/15 text-white text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
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
                mode={effectiveMode}
                showOverlay={false}
                meshPreview={false}
                box={faceBox}
                fit="cover"
                containerClassName="h-full w-full bg-zinc-950"
              />
            )}

            {/* Plain-Vietnamese Skin Verdict Overlay */}
            <div className="absolute inset-x-0 bottom-0 z-10 pt-20 pb-4 px-4 sm:px-5 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
              {isProcessing || !report || !plainGuide ? (
                <div className="space-y-2">
                  <div className="h-3 w-36 rounded-full bg-white/25 animate-pulse" />
                  <div className="h-6 w-52 rounded-md bg-white/30 animate-pulse" />
                  <div className="h-3.5 w-44 rounded-full bg-white/20 animate-pulse" />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-amber-200/95 truncate">
                    {describeLightingPlainVi(report.whiteBalance.estimatedCctK, effectiveMode)}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-4 h-4 rounded-full ring-2 ring-white/80 shrink-0"
                      style={{ backgroundColor: skinSwatchHex }}
                      aria-hidden="true"
                    />
                    <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight leading-snug truncate">
                      {plainGuide.plainTitle}
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
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Chụp selfie ngay</span>
                </button>
                <button
                  type="button"
                  onClick={onPickGallery}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
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
      <div className="lg:col-span-7 space-y-5">
        {isProcessing || !report || !plainGuide ? (
          <ResultsSkeleton />
        ) : (
          <>
            {/* Card 1: Plain-Vietnamese Verdict + Single Unified 3-Color Palette (Lip · Blush · Eye) + Try Now */}
            {harmonyBundle && activeHarmony && (
              <section
                data-testid="color-harmony-section"
                aria-label="Kết luận tông da và 3 màu hợp nhất"
                className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
              >
                {/* Plain-Vietnamese Takeaway */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900">
                      Kết luận tông da của bạn
                    </h2>
                    <span className="text-xs font-semibold text-rose-700">
                      Nhóm {plainGuide.shortTag}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                    {plainGuide.oneLiner}
                  </p>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Mẹo nhanh: {plainGuide.studentTip}
                  </p>
                </div>

                {/* Look Switcher: Đi học | Đi chơi | Đi tiệc */}
                <div className="pt-3 border-t border-zinc-100 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900">
                        3 màu Son · Má · Mắt hợp da nhất
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {activeHarmony.title} · {activeHarmony.harmonyType}
                      </div>
                    </div>

                    <div
                      role="tablist"
                      aria-label="Chọn dịp trang điểm"
                      className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-xl sm:w-[240px] shrink-0"
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
                            className={`min-h-[36px] sm:min-h-[32px] px-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
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

                  {/* Single Clean 3-Swatch Bar (Son môi · Má hồng · Phấn mắt) */}
                  <div
                    data-testid="hero-signature-palette"
                    className="grid grid-cols-3 rounded-2xl overflow-hidden ring-1 ring-black/8"
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
                        <div className="px-2.5 sm:px-3 py-2.5 border-t border-zinc-100">
                          <div className="text-[11px] font-medium text-zinc-500">
                            {swatch.roleLabel}
                          </div>
                          <div className="text-xs font-semibold text-zinc-900 leading-snug mt-0.5 line-clamp-2">
                            {swatch.shadeLabel}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-zinc-600 leading-relaxed">{activeHarmony.tip}</p>

                  {/* Primary Action: Try Now on Your Lips */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onApplyHarmonyPalette(activeHarmony)}
                      className="min-h-[44px] sm:min-h-[40px] px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Thử ngay lên môi</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenShopCategory("all")}
                      className="min-h-[42px] sm:min-h-[40px] px-4 py-2 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <span>Xem mỹ phẩm theo ngân sách</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
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

            {/* Card 2: Personalized Step-by-Step Makeup Guide ('Hướng dẫn trang điểm') */}
            <MakeupGuideSection report={report} texture={texture} />

            {/* Card 3: Top 3 Real Product Picks with Student Price Range & Bare-Face / Teeth Cues */}
            {quickPicks.length > 0 && (
              <section aria-label="Gợi ý sản phẩm hợp nhất" className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-0.5">
                  <div>
                    <h2 className="text-base font-bold tracking-tight text-zinc-900">
                      Gợi ý chọn mua nhanh
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Khớp sẵn màu môi thật và sắc da của bạn
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenShopCategory("all")}
                    className="min-h-[38px] px-2 text-xs font-semibold text-zinc-700 hover:text-zinc-900 inline-flex items-center gap-0.5 whitespace-nowrap cursor-pointer"
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
                        className="w-[225px] sm:w-auto shrink-0 snap-start bg-white rounded-2xl border border-zinc-200/85 overflow-hidden flex flex-col justify-between"
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
                              className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${
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
                              {item.brand} · {PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType}
                            </div>
                            <h3 className="text-xs font-semibold text-zinc-900 line-clamp-1">
                              {item.name}
                            </h3>
                            <div className="text-xs text-zinc-600 truncate">{item.shade}</div>
                            <div className="pt-0.5 flex items-center gap-1.5 text-[11px] truncate">
                              <span className="font-semibold text-emerald-700 tabular-nums">
                                {matchPct}% hợp
                              </span>
                              <span className="text-zinc-300" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-medium text-zinc-700 tabular-nums truncate">
                                {priceInfo.priceRangeLabel}
                              </span>
                            </div>
                            {traits.badges.length > 0 && (
                              <div className="text-[11px] font-medium text-rose-700 truncate">
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
                              className="w-full min-h-[38px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                            >
                              Thử lên môi
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onInspectProduct(item)}
                              className="w-full min-h-[38px] sm:min-h-[34px] px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
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
  );
};
