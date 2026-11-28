import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Heart, Search } from "lucide-react";
import { labToRgb, rgbToHex } from "../lib/beauty/bradfordCat";
import {
  CIEDE2000_SIMILARITY_THRESHOLDS,
  isColorimetricMatchProductType,
  matchProducts,
  scoreMatchedProductsPopularity,
  type TrendingProductItem,
} from "../lib/beauty/productMatcher";
import type { AnalysisConfidenceResult } from "../lib/beauty/analysisConfidence";
import type { AnalysisValidity } from "../lib/beauty/analysisValidity";
import {
  catalogProductToBrowseItem,
  evaluateRecommendationEligibility,
} from "../lib/beauty/recommendationIntegrity";
import {
  buildVnShopLinks,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
  type PriceTierId,
} from "../lib/beauty/vnBeautyGuide";
import {
  PRODUCT_TYPE_VI_LABELS,
  TEXTURE_VI_LABELS,
  translateMatchTier,
} from "../lib/beauty/viLabels";
import type {
  CatalogProduct,
  IlluminantName,
  MatchedProduct,
  SeasonName,
  SkinMetrics,
} from "../lib/beauty/types";

export type CatalogFilterId =
  | "vn_popular"
  | "popular_only"
  | "saved"
  | "lipstick"
  | "blush"
  | "eyeshadow"
  | "foundation"
  | "contour"
  | "concealer"
  | "glasses"
  | "all";

interface CatalogMatcherProps {
  products: CatalogProduct[];
  blendedTargets: { lip: string; blush: string; eyeshadow: string } | null;
  lipBaseLab: [number, number, number] | null;
  skinMetrics: SkinMetrics | null;
  userSeason: SeasonName | null;
  analysisValidity?: AnalysisValidity | null;
  analysisConfidence?: AnalysisConfidenceResult | null;
  catalogIlluminant: IlluminantName;
  initialCategory?: CatalogFilterId;
  savedIds: Set<number>;
  onToggleSave: (id: number) => void;
  onInspectProduct: (product: MatchedProduct) => void;
  onTryLipstick: (product: MatchedProduct) => void;
  onRequestAnalysis?: () => void;
}

type UndertoneFilterId = "all" | "warm" | "cool" | "neutral";

const UNDERTONE_FILTER_OPTIONS: Array<{ id: UndertoneFilterId; label: string }> = [
  { id: "all", label: "Mọi tông" },
  { id: "warm", label: "Tông Ấm" },
  { id: "cool", label: "Tông Lạnh" },
  { id: "neutral", label: "Trung tính" },
];

function matchesUndertoneFilter(undertoneRaw: string, filter: UndertoneFilterId): boolean {
  if (filter === "all") return true;
  const u = undertoneRaw.toLowerCase();
  if (filter === "warm") return u.includes("warm") || u.includes("ấm");
  if (filter === "cool") return u.includes("cool") || u.includes("lạnh");
  return u.includes("neutral") || u.includes("trung");
}

const VN_POPULAR_BRANDS = new Set([
  "Romand",
  "Peripera",
  "Black Rouge",
  "Merzy",
  "Colorkey",
  "Judydoll",
  "BBIA",
  "Lemonade",
  "OFÉLIA",
  "M.O.I Cosmetics",
  "Cỏ Mềm Homelab",
  "Gilaa",
  "3CE",
  "Maybelline",
  "Clio",
]);

const CATEGORY_TABS: Array<{ id: CatalogFilterId; label: string }> = [
  { id: "vn_popular", label: "Sinh viên hay dùng" },
  { id: "lipstick", label: "Son môi" },
  { id: "blush", label: "Má hồng" },
  { id: "eyeshadow", label: "Phấn mắt" },
  { id: "foundation", label: "Cushion / Nền" },
  { id: "saved", label: "Đã lưu" },
  { id: "contour", label: "Tạo khối" },
  { id: "concealer", label: "Che khuyết điểm" },
  { id: "glasses", label: "Gọng kính" },
  { id: "all", label: "Tất cả" },
];

const BUDGET_OPTIONS: Array<{ id: PriceTierId; label: string }> = [
  { id: "all", label: "Mọi giá" },
  { id: "under_200k", label: "Dưới 200k" },
  { id: "mid_200_350k", label: "200–350k" },
  { id: "luxury_350k_plus", label: "Trên 350k" },
];

export const CatalogMatcher: React.FC<CatalogMatcherProps> = ({
  products,
  blendedTargets,
  lipBaseLab,
  skinMetrics,
  userSeason,
  analysisValidity = null,
  analysisConfidence = null,
  catalogIlluminant,
  initialCategory = "vn_popular",
  savedIds,
  onToggleSave,
  onInspectProduct,
  onTryLipstick,
  onRequestAnalysis,
}) => {
  const hasPortraitData = Boolean(blendedTargets && lipBaseLab && skinMetrics && userSeason);
  const eligibility = useMemo(
    () =>
      evaluateRecommendationEligibility({
        catalogCount: products.length,
        hasAnalysis: hasPortraitData,
        analysisValidity,
        confidence: analysisConfidence,
        targetHex: blendedTargets?.lip,
      }),
    [products.length, hasPortraitData, analysisValidity, analysisConfidence, blendedTargets?.lip]
  );
  const hasPortraitProfile = eligibility.canPersonalize && hasPortraitData;

  const [activeType, setActiveType] = useState<CatalogFilterId>(initialCategory);
  const [budgetTier, setBudgetTier] = useState<PriceTierId>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedUndertone, setSelectedUndertone] = useState<UndertoneFilterId>("all");
  const [onlyBareFace, setOnlyBareFace] = useState(false);
  const [onlyTeethBright, setOnlyTeethBright] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setActiveType(initialCategory);
    setVisibleCount(12);
  }, [initialCategory]);

  const availableBrands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.brand) set.add(p.brand);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const skinHex = useMemo(() => {
    if (!skinMetrics) return "#E6C7B5";
    return rgbToHex(labToRgb([skinMetrics.L_star, skinMetrics.a_star, skinMetrics.b_star]));
  }, [skinMetrics]);

  const rankedItems: TrendingProductItem[] = useMemo(() => {
    const sourceList =
      activeType === "vn_popular"
        ? products.filter((p) => VN_POPULAR_BRANDS.has(p.brand))
        : activeType === "saved"
          ? products.filter((p) => savedIds.has(p.id))
          : activeType === "all" || activeType === "popular_only"
            ? products
            : products.filter((p) => p.product_type === activeType);

    if (!hasPortraitProfile || !blendedTargets || !lipBaseLab || !userSeason) {
      // Guest / unpersonalized browse mode: explicit null deltaE & matchTier (zero fabricated scores)
      return sourceList.map((p) => ({
        ...catalogProductToBrowseItem(p),
        popularityScore: VN_POPULAR_BRANDS.has(p.brand) ? 80 : 50,
        isPopular: VN_POPULAR_BRANDS.has(p.brand),
        hotReason: "",
      }));
    }

    const getTargetForType = (type: string): string | null => {
      if (type === "lipstick") return blendedTargets.lip;
      if (type === "blush") return blendedTargets.blush;
      if (type === "eyeshadow") return blendedTargets.eyeshadow;
      if (isColorimetricMatchProductType(type)) return skinHex;
      return null;
    };

    const matchOrBrowseType = (type: string, list: CatalogProduct[]): MatchedProduct[] => {
      const targetHex = getTargetForType(type);
      if (!targetHex) {
        // Non-colorimetric categories (glasses, mascara, eyeliner, setting spray, etc.)
        // are displayed as honest catalog entries rather than scored against bare skin HEX.
        return list
          .filter((p) => p.product_type === type)
          .map((p) => catalogProductToBrowseItem(p));
      }
      return matchProducts(targetHex, list, {
        productType: type,
        lipBaseLab: type === "lipstick" ? lipBaseLab : undefined,
        topK: 180,
        catalogIlluminant,
      });
    };

    let baseMatched: MatchedProduct[] = [];
    if (
      activeType === "all" ||
      activeType === "vn_popular" ||
      activeType === "popular_only" ||
      activeType === "saved"
    ) {
      const types = Array.from(new Set(sourceList.map((p) => p.product_type)));
      for (const t of types) {
        baseMatched.push(...matchOrBrowseType(t, sourceList));
      }
    } else {
      baseMatched = matchOrBrowseType(activeType, sourceList);
    }

    const scored = scoreMatchedProductsPopularity(baseMatched, userSeason);
    if (activeType === "popular_only") {
      return scored
        .filter((item) => item.isPopular)
        .sort((a, b) => b.popularityScore - a.popularityScore);
    }

    scored.sort((a, b) => (a.deltaE ?? Infinity) - (b.deltaE ?? Infinity));
    return scored;
  }, [
    hasPortraitProfile,
    activeType,
    products,
    blendedTargets,
    lipBaseLab,
    skinHex,
    userSeason,
    catalogIlluminant,
    savedIds,
  ]);

  const enrichedAndFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rankedItems
      .map((item) => {
        const price = estimateProductPriceVn(item.brand, item.productType, item.name);
        const traits = evaluateVnStudentTraits({
          productType: item.productType,
          texture: item.texture,
          hex: item.hex,
          renderedHex: item.renderedHex,
          deltaE: typeof item.deltaE === "number" ? item.deltaE : undefined,
        });
        return { item, price, traits };
      })
      .filter(({ item, price, traits }) => {
        if (budgetTier !== "all" && price.tier !== budgetTier) return false;
        if (selectedBrand !== "all" && item.brand !== selectedBrand) return false;
        if (!matchesUndertoneFilter(item.undertone, selectedUndertone)) return false;
        if (onlyBareFace && !traits.bareFaceFriendly) return false;
        if (onlyTeethBright && !traits.teethBrightening) return false;
        if (q) {
          return (
            item.brand.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.shade.toLowerCase().includes(q)
          );
        }
        return true;
      });
  }, [
    rankedItems,
    budgetTier,
    selectedBrand,
    selectedUndertone,
    onlyBareFace,
    onlyTeethBright,
    query,
  ]);

  const displayedItems = enrichedAndFiltered.slice(0, visibleCount);

  return (
    <div data-testid="catalog-matcher-view" className="space-y-4 sm:space-y-5 pb-6 md:pb-2">
      {/* Guest Browse Prompt Banner when no portrait is analyzed yet */}
      {!hasPortraitProfile && (
        <div
          data-testid="catalog-guest-banner"
          className="bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[#111111]">
              {eligibility.bannerTitleVi ?? `Đang xem toàn bộ ${products.length} sản phẩm`}
            </div>
            <p className="text-xs text-[#666666]">
              {eligibility.bannerMessageVi ??
                "Bạn có thể lọc theo hãng, tông màu và lưu sản phẩm ngay. Chưa tính độ gần màu theo da cho tới khi bạn phân tích ảnh chân dung."}
            </p>
          </div>
          {onRequestAnalysis && (
            <button
              type="button"
              onClick={onRequestAnalysis}
              className="min-h-[36px] px-3.5 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Đo tông da
            </button>
          )}
        </div>
      )}

      {eligibility.status === "caution" && eligibility.bannerMessageVi && (
        <div
          data-testid="catalog-caution-banner"
          role="status"
          className="bg-[#FFFBEB] border border-[#FDE68A] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[#78350F]">
              {eligibility.bannerTitleVi}
            </div>
            <p className="text-xs text-[#92400E]">{eligibility.bannerMessageVi}</p>
          </div>
          {onRequestAnalysis && (
            <button
              type="button"
              onClick={onRequestAnalysis}
              className="min-h-[34px] px-3 py-1.5 rounded-[4px] bg-white border border-[#F59E0B] hover:bg-[#FEF3C7] text-[#92400E] text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Chọn ảnh rõ hơn
            </button>
          )}
        </div>
      )}

      {/* Header + Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3.5">
        <div>
          <h1 className="text-2xl sm:text-[30px] font-bold tracking-[-0.03em] text-[#111111] leading-tight">
            {hasPortraitProfile ? "Mỹ phẩm gợi ý" : "Danh mục mỹ phẩm"}
          </h1>
          <p className="text-xs sm:text-sm text-[#666666] mt-0.5">
            Lọc theo hãng, tông màu hoặc tầm giá tham khảo tại Việt Nam
          </p>
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-4 h-4 text-[#737373] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(12);
            }}
            placeholder="Tìm Romand, Black Rouge, Lemonade..."
            aria-label="Tìm tên son, hãng hoặc mã màu"
            className="w-full min-h-[40px] md:min-h-[38px] pl-10 pr-3 py-2 text-sm md:text-xs bg-white border border-[#D4D4D4] rounded-[4px] text-[#111111] placeholder:text-[#8C8C8C] focus:outline-none focus:border-[#111111]"
          />
        </div>
      </div>

      {/* Category Filter Row */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
        {CATEGORY_TABS.map((tab) => {
          const isActive = activeType === tab.id;
          const label =
            tab.id === "saved" && savedIds.size > 0
              ? `${tab.label} (${savedIds.size})`
              : tab.label;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveType(tab.id);
                setVisibleCount(12);
              }}
              className={`min-h-[36px] sm:min-h-[34px] px-3.5 py-1.5 text-xs font-medium rounded-[4px] whitespace-nowrap shrink-0 snap-start border transition-colors cursor-pointer ${
                isActive
                  ? "bg-[#111111] text-white border-[#111111]"
                  : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#111111] hover:text-[#111111]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Budget Tier, Brand, Undertone & Student Quick Filter Bar */}
      <div
        data-testid="budget-filter-bar"
        className="py-3 border-y border-[#E5E5E5] space-y-2.5"
      >
        <div className="space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
          {/* Price Tier Segmented Buttons */}
          <div className="grid grid-cols-4 sm:flex sm:items-center gap-1.5">
            {BUDGET_OPTIONS.map((opt) => {
              const active = budgetTier === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`budget-btn-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => {
                    setBudgetTier(opt.id);
                    setVisibleCount(12);
                  }}
                  className={`min-h-[34px] px-1.5 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded-[4px] whitespace-nowrap text-center border transition-colors cursor-pointer ${
                    active
                      ? "bg-[#DC2626] text-white border-[#DC2626]"
                      : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#111111]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Student Suitability Quick Filters */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              type="button"
              data-testid="filter-bareface"
              aria-pressed={onlyBareFace}
              onClick={() => {
                setOnlyBareFace((v) => !v);
                setVisibleCount(12);
              }}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-[4px] whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                onlyBareFace
                  ? "bg-[#111111] text-white border-[#111111]"
                  : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#111111]"
              }`}
            >
              Hợp mặt mộc đi học
            </button>
            <button
              type="button"
              data-testid="filter-teeth-bright"
              aria-pressed={onlyTeethBright}
              onClick={() => {
                setOnlyTeethBright((v) => !v);
                setVisibleCount(12);
              }}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-[4px] whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                onlyTeethBright
                  ? "bg-[#111111] text-white border-[#111111]"
                  : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#111111]"
              }`}
            >
              Sáng răng · Không xỉn da
            </button>
          </div>
        </div>

        {/* Brand & Undertone Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#F0F0F0]">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {UNDERTONE_FILTER_OPTIONS.map((opt) => {
              const active = selectedUndertone === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`undertone-filter-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedUndertone(opt.id);
                    setVisibleCount(12);
                  }}
                  className={`min-h-[32px] px-2.5 py-1 text-[11px] font-medium rounded-[4px] whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                    active
                      ? "bg-[#111111] text-white border-[#111111]"
                      : "bg-white text-[#525252] border-[#E5E5E5] hover:border-[#111111]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="catalog-brand-filter" className="text-[11px] text-[#666666] whitespace-nowrap">
              Thương hiệu:
            </label>
            <select
              id="catalog-brand-filter"
              data-testid="catalog-brand-select"
              value={selectedBrand}
              onChange={(e) => {
                setSelectedBrand(e.target.value);
                setVisibleCount(12);
              }}
              className="min-h-[32px] px-2.5 py-1 text-xs bg-white border border-[#D4D4D4] rounded-[4px] text-[#111111] focus:outline-none focus:border-[#111111]"
            >
              <option value="all">Tất cả ({availableBrands.length} hãng)</option>
              {availableBrands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Explicit Estimated VN Price Disclaimer + Result Count */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-[#737373]">
        <span>
          Hiển thị <strong className="font-semibold text-[#111111]">{enrichedAndFiltered.length}</strong> sản phẩm
        </span>
        <span data-testid="price-estimate-disclaimer">
          Giá tham khảo tại Việt Nam, có thể khác tùy nơi bán.
        </span>
      </div>

      {/* Product Grid */}
      {displayedItems.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {displayedItems.map(({ item, price, traits }) => {
            const typeLabel = PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType;
            const textureLabel = TEXTURE_VI_LABELS[item.texture] ?? item.texture;
            const validDelta =
              hasPortraitProfile &&
              item.isPersonalized !== false &&
              typeof item.deltaE === "number" &&
              Number.isFinite(item.deltaE)
                ? item.deltaE
                : null;
            const isSaved = savedIds.has(item.id);
            const isLip = item.productType === "lipstick";
            const shopLinks = buildVnShopLinks(item.brand, item.name, item.shade);

            return (
              <article
                key={item.id}
                data-popular={item.isPopular ? "true" : "false"}
                className="bg-white border border-[#E5E5E5] hover:border-[#111111] overflow-hidden flex flex-col justify-between transition-colors"
              >
                <div>
                  {/* Swatch Visual Header */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => onInspectProduct(item)}
                      aria-label={`Xem chi tiết ${item.brand} ${item.name} ${item.shade}`}
                      className="block w-full text-left cursor-pointer"
                    >
                      {hasPortraitProfile && isLip && item.renderedHex ? (
                        <>
                          <div className="grid grid-cols-2 h-20 sm:h-24">
                            <div style={{ backgroundColor: item.hex }} />
                            <div style={{ backgroundColor: item.renderedHex }} />
                          </div>
                          <div className="grid grid-cols-2 px-2.5 py-1 bg-zinc-50 border-b border-zinc-100 text-[10px] text-zinc-500">
                            <span className="truncate">Màu thỏi</span>
                            <span className="text-right font-medium text-zinc-800 truncate">
                              Lên môi bạn
                            </span>
                          </div>
                        </>
                      ) : (
                        <div
                          className="h-20 sm:h-24 border-b border-zinc-100"
                          style={{ backgroundColor: item.hex }}
                        />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleSave(item.id)}
                      aria-label={isSaved ? `Bỏ lưu ${item.name}` : `Lưu ${item.name}`}
                      className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isSaved ? "fill-rose-600 text-rose-600" : "text-zinc-600"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Clean Unboxed Typography (Zero Pill Clutter) */}
                  <button
                    type="button"
                    onClick={() => onInspectProduct(item)}
                    className="w-full text-left p-3 space-y-1 cursor-pointer"
                  >
                    <div className="text-[11px] text-zinc-500 truncate">
                      {item.brand} · {typeLabel}
                    </div>
                    <h3 className="text-xs sm:text-sm font-semibold text-zinc-900 leading-snug line-clamp-2">
                      {item.name}
                    </h3>
                    <div className="text-xs text-zinc-600 truncate">{item.shade}</div>

                    {/* Price + Documented CIEDE2000 Color Similarity Tier (or Undertone when unmeasured) */}
                    <div className="pt-1 flex flex-wrap items-baseline justify-between gap-x-1.5 gap-y-0.5 text-[11px]">
                      {validDelta !== null ? (
                        <span
                          title={`Khoảng cách màu CIEDE2000 ΔE₀₀ = ${validDelta.toFixed(2)} (<1.0 rất gần, <2.0 gần, <5.0 cùng họ, ≥5.0 khác sắc độ)`}
                          className={`font-semibold tabular-nums whitespace-nowrap ${
                            validDelta < CIEDE2000_SIMILARITY_THRESHOLDS.GREAT_MAX
                              ? "text-emerald-700"
                              : validDelta < CIEDE2000_SIMILARITY_THRESHOLDS.CLOSE_MAX
                                ? "text-zinc-800"
                                : "text-zinc-500"
                          }`}
                        >
                          {translateMatchTier(item.matchTier)} · ΔE {validDelta.toFixed(1)}
                        </span>
                      ) : (
                        <span className="font-medium text-zinc-500 truncate">
                          {item.undertone || "Chưa rõ tông"}
                        </span>
                      )}
                      <span
                        title="Khoảng giá ước tính tham khảo tại Việt Nam (không phải giá bán trực tiếp)"
                        className="font-semibold text-zinc-900 tabular-nums whitespace-nowrap"
                      >
                        {price.priceRangeLabel}
                      </span>
                    </div>

                    {/* Unboxed Student Suitability Cues */}
                    <div className="text-[11px] leading-snug truncate">
                      {traits.bareFaceFriendly || traits.teethBrightening ? (
                        <span className="font-medium text-rose-700">
                          {[
                            traits.bareFaceFriendly ? "Hợp mặt mộc" : null,
                            traits.teethBrightening ? "Sáng răng" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : (
                        <span className="text-zinc-500">{textureLabel}</span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Card Actions */}
                <div className="px-3 pb-3 pt-1 flex items-center gap-1.5">
                  {isLip && hasPortraitProfile ? (
                    <button
                      type="button"
                      onClick={() => onTryLipstick(item)}
                      className="flex-1 min-h-[36px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-semibold text-white bg-[#111111] hover:bg-[#2B2B2B] rounded-[4px] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Thử môi
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInspectProduct(item)}
                      className="flex-1 min-h-[36px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-semibold rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-[#111111] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Chi tiết
                    </button>
                  )}

                  <a
                    href={shopLinks.shopeeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Tìm kiếm ${item.brand} ${item.name} trên Shopee`}
                    className="min-h-[36px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-[4px] border border-[#E5E5E5] bg-white hover:border-[#111111] text-[#525252] hover:text-[#111111] inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Tìm mua</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#E5E5E5] py-12 px-4 text-center space-y-2.5">
          <div className="text-sm font-semibold text-zinc-800">
            {activeType === "saved"
              ? "Bạn chưa lưu sản phẩm nào"
              : "Không tìm thấy sản phẩm khớp bộ lọc"}
          </div>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            {activeType === "saved"
              ? "Chạm biểu tượng trái tim trên bất kỳ thỏi son hoặc phấn má nào để lưu lại so sánh."
              : "Thử nới lỏng mức giá, thương hiệu hoặc bỏ chọn bộ lọc nhanh để xem thêm gợi ý."}
          </p>
          {(budgetTier !== "all" ||
            selectedBrand !== "all" ||
            selectedUndertone !== "all" ||
            onlyBareFace ||
            onlyTeethBright ||
            query) && (
            <button
              type="button"
              onClick={() => {
                setBudgetTier("all");
                setSelectedBrand("all");
                setSelectedUndertone("all");
                setOnlyBareFace(false);
                setOnlyTeethBright(false);
                setQuery("");
              }}
              className="mt-1 min-h-[38px] px-4 py-1.5 rounded-[4px] bg-[#111111] text-white text-xs font-semibold cursor-pointer"
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      )}

      {enrichedAndFiltered.length > visibleCount && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 12)}
            className="w-full sm:w-auto min-h-[40px] px-6 py-2 text-xs font-semibold text-[#111111] bg-white border border-[#D4D4D4] hover:border-[#111111] rounded-[4px] transition-colors cursor-pointer"
          >
            Xem thêm ({enrichedAndFiltered.length - visibleCount} sản phẩm)
          </button>
        </div>
      )}
    </div>
  );
};
