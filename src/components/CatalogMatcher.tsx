import React, { useEffect, useMemo, useState } from "react";
import { ExternalLink, Heart, Search } from "lucide-react";
import { labToRgb, rgbToHex } from "../lib/beauty/bradfordCat";
import {
  matchProducts,
  scoreMatchedProductsPopularity,
  type TrendingProductItem,
} from "../lib/beauty/productMatcher";
import { deltaEToMatchPercent } from "../lib/beauty/virtualMakeup";
import {
  buildVnShopLinks,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
  type PriceTierId,
} from "../lib/beauty/vnBeautyGuide";
import { PRODUCT_TYPE_VI_LABELS, TEXTURE_VI_LABELS } from "../lib/beauty/viLabels";
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
  blendedTargets: { lip: string; blush: string; eyeshadow: string };
  lipBaseLab: [number, number, number];
  skinMetrics: SkinMetrics;
  userSeason: SeasonName;
  catalogIlluminant: IlluminantName;
  initialCategory?: CatalogFilterId;
  savedIds: Set<number>;
  onToggleSave: (id: number) => void;
  onInspectProduct: (product: MatchedProduct) => void;
  onTryLipstick: (product: MatchedProduct) => void;
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
  catalogIlluminant,
  initialCategory = "vn_popular",
  savedIds,
  onToggleSave,
  onInspectProduct,
  onTryLipstick,
}) => {
  const [activeType, setActiveType] = useState<CatalogFilterId>(initialCategory);
  const [budgetTier, setBudgetTier] = useState<PriceTierId>("all");
  const [onlyBareFace, setOnlyBareFace] = useState(false);
  const [onlyTeethBright, setOnlyTeethBright] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setActiveType(initialCategory);
    setVisibleCount(12);
  }, [initialCategory]);

  const skinHex = useMemo(
    () => rgbToHex(labToRgb([skinMetrics.L_star, skinMetrics.a_star, skinMetrics.b_star])),
    [skinMetrics.L_star, skinMetrics.a_star, skinMetrics.b_star]
  );

  const rankedItems: TrendingProductItem[] = useMemo(() => {
    const getTargetForType = (type: string) => {
      if (type === "lipstick") return blendedTargets.lip;
      if (type === "blush") return blendedTargets.blush;
      if (type === "eyeshadow") return blendedTargets.eyeshadow;
      return skinHex;
    };

    const sourceList =
      activeType === "vn_popular"
        ? products.filter((p) => VN_POPULAR_BRANDS.has(p.brand))
        : activeType === "saved"
          ? products.filter((p) => savedIds.has(p.id))
          : products;

    let baseMatched: MatchedProduct[] = [];
    if (
      activeType === "all" ||
      activeType === "vn_popular" ||
      activeType === "popular_only" ||
      activeType === "saved"
    ) {
      const types = Array.from(new Set(sourceList.map((p) => p.product_type)));
      for (const t of types) {
        baseMatched.push(
          ...matchProducts(getTargetForType(t), sourceList, {
            productType: t,
            lipBaseLab: t === "lipstick" ? lipBaseLab : undefined,
            topK: 180,
            catalogIlluminant,
          })
        );
      }
    } else {
      baseMatched = matchProducts(getTargetForType(activeType), sourceList, {
        productType: activeType,
        lipBaseLab: activeType === "lipstick" ? lipBaseLab : undefined,
        topK: 180,
        catalogIlluminant,
      });
    }

    const scored = scoreMatchedProductsPopularity(baseMatched, userSeason);
    if (activeType === "popular_only") {
      return scored
        .filter((item) => item.isPopular)
        .sort((a, b) => b.popularityScore - a.popularityScore);
    }

    scored.sort((a, b) => a.deltaE - b.deltaE);
    return scored;
  }, [
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
          deltaE: item.deltaE,
        });
        return { item, price, traits };
      })
      .filter(({ item, price, traits }) => {
        if (budgetTier !== "all" && price.tier !== budgetTier) return false;
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
  }, [rankedItems, budgetTier, onlyBareFace, onlyTeethBright, query]);

  const displayedItems = enrichedAndFiltered.slice(0, visibleCount);

  return (
    <div className="space-y-4 sm:space-y-5 pb-6 md:pb-2">
      {/* Header + Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
            Mỹ phẩm hợp da &amp; ví tiền
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Lọc theo ngân sách sinh viên, hợp mặt mộc đi học hoặc tìm mua nhanh trên Shopee
          </p>
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(12);
            }}
            placeholder="Tìm Romand, Black Rouge, Lemonade..."
            aria-label="Tìm tên son, hãng hoặc mã màu"
            className="w-full min-h-[42px] md:min-h-[38px] pl-10 pr-3 py-2 text-sm md:text-xs bg-white border border-zinc-200 rounded-2xl md:rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
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
              className={`min-h-[38px] sm:min-h-[34px] px-3.5 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 snap-start border transition-colors cursor-pointer ${
                isActive
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Budget Tier & Vietnamese Student Needs Filter Bar */}
      <div
        data-testid="budget-filter-bar"
        className="bg-white rounded-2xl border border-zinc-200/85 p-3 sm:p-3.5 space-y-2.5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
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
                  className={`min-h-[34px] px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-medium rounded-lg whitespace-nowrap text-center border transition-colors cursor-pointer ${
                    active
                      ? "bg-rose-700 text-white border-rose-700"
                      : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Student Suitability Quick Filters */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              data-testid="filter-bareface"
              aria-pressed={onlyBareFace}
              onClick={() => {
                setOnlyBareFace((v) => !v);
                setVisibleCount(12);
              }}
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                onlyBareFace
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
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
              className={`min-h-[34px] px-3 py-1 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                onlyTeethBright
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Sáng răng · Không xỉn da
            </button>
          </div>
        </div>
      </div>

      {/* Product Grid */}
      {displayedItems.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {displayedItems.map(({ item, price, traits }) => {
            const typeLabel = PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType;
            const textureLabel = TEXTURE_VI_LABELS[item.texture] ?? item.texture;
            const matchPct = deltaEToMatchPercent(item.deltaE);
            const isSaved = savedIds.has(item.id);
            const isLip = item.productType === "lipstick";
            const shopLinks = buildVnShopLinks(item.brand, item.name, item.shade);

            return (
              <article
                key={item.id}
                data-popular={item.isPopular ? "true" : "false"}
                className="bg-white rounded-2xl border border-zinc-200/90 overflow-hidden flex flex-col justify-between transition-shadow hover:shadow-xs"
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
                      {isLip && item.renderedHex ? (
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

                    {/* Price + Match % inline */}
                    <div className="pt-1 flex items-center gap-1.5 text-[11px] truncate">
                      <span
                        className={`font-semibold tabular-nums ${
                          matchPct >= 90 ? "text-emerald-700" : "text-zinc-800"
                        }`}
                      >
                        {matchPct}% hợp
                      </span>
                      <span className="text-zinc-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-semibold text-zinc-900 tabular-nums truncate">
                        {price.priceRangeLabel}
                      </span>
                    </div>

                    {/* Unboxed Student Suitability Cues (concise on narrow mobile cards so zero mid-word clipping) */}
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
                  {isLip ? (
                    <button
                      type="button"
                      onClick={() => onTryLipstick(item)}
                      className="flex-1 min-h-[38px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Thử môi
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInspectProduct(item)}
                      className="flex-1 min-h-[38px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Chi tiết
                    </button>
                  )}

                  <a
                    href={shopLinks.shopeeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Tìm mua ${item.brand} ${item.name} trên Shopee`}
                    className="min-h-[38px] sm:min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Mua</span>
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl py-12 px-4 text-center space-y-2.5">
          <div className="text-sm font-semibold text-zinc-800">
            {activeType === "saved"
              ? "Bạn chưa lưu sản phẩm nào"
              : "Không tìm thấy sản phẩm khớp bộ lọc"}
          </div>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            {activeType === "saved"
              ? "Chạm biểu tượng trái tim trên bất kỳ thỏi son hoặc phấn má nào để lưu lại so sánh."
              : "Thử nới lỏng mức giá hoặc bỏ chọn bộ lọc nhanh để xem thêm gợi ý."}
          </p>
          {(budgetTier !== "all" || onlyBareFace || onlyTeethBright || query) && (
            <button
              type="button"
              onClick={() => {
                setBudgetTier("all");
                setOnlyBareFace(false);
                setOnlyTeethBright(false);
                setQuery("");
              }}
              className="mt-1 min-h-[38px] px-4 py-1.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold cursor-pointer"
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
            className="w-full sm:w-auto min-h-[42px] px-6 py-2 text-xs font-semibold text-zinc-800 bg-white border border-zinc-300 rounded-2xl hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Xem thêm ({enrichedAndFiltered.length - visibleCount} sản phẩm)
          </button>
        </div>
      )}
    </div>
  );
};
