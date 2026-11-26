import React, { useEffect, useMemo, useState } from "react";
import { Heart, Search } from "lucide-react";
import { labToRgb, rgbToHex } from "../lib/beauty/bradfordCat";
import {
  matchProducts,
  scoreMatchedProductsPopularity,
  type TrendingProductItem,
} from "../lib/beauty/productMatcher";
import { deltaEToMatchPercent } from "../lib/beauty/virtualMakeup";
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
  "Lemonade",
  "OFÉLIA",
  "M.O.I Cosmetics",
  "Cỏ Mềm Homelab",
  "Gilaa",
  "Black Rouge",
  "Merzy",
  "Colorkey",
  "Maybelline",
  "L'Oreal",
]);

const CATEGORY_TABS: Array<{ id: CatalogFilterId; label: string }> = [
  { id: "vn_popular", label: "Hãng Việt & Phổ biến" },
  { id: "lipstick", label: "Son môi" },
  { id: "blush", label: "Má hồng" },
  { id: "eyeshadow", label: "Phấn mắt" },
  { id: "foundation", label: "Kem nền" },
  { id: "saved", label: "Đã lưu" },
  { id: "popular_only", label: "Bán chạy" },
  { id: "contour", label: "Tạo khối" },
  { id: "concealer", label: "Che khuyết điểm" },
  { id: "glasses", label: "Gọng kính" },
  { id: "all", label: "Tất cả" },
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
            topK: 150,
            catalogIlluminant,
          })
        );
      }
    } else {
      baseMatched = matchProducts(getTargetForType(activeType), sourceList, {
        productType: activeType,
        lipBaseLab: activeType === "lipstick" ? lipBaseLab : undefined,
        topK: 150,
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

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rankedItems;
    return rankedItems.filter(
      (item) =>
        item.brand.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.shade.toLowerCase().includes(q)
    );
  }, [rankedItems, query]);

  const displayedItems = filteredItems.slice(0, visibleCount);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header + Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
            Mỹ phẩm hợp tông da bạn
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Chạm vào từng sản phẩm để xem chi tiết màu và chép tên tìm mua
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
            placeholder="Tìm tên son, hãng, mã màu..."
            aria-label="Tìm tên son, hãng hoặc mã màu"
            className="w-full min-h-[44px] md:min-h-[40px] pl-10 pr-3 py-2 text-sm md:text-xs bg-white border border-zinc-200 rounded-2xl md:rounded-xl text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
      </div>

      {/* Interactive Category Filter Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
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
              className={`min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 snap-start border transition-colors cursor-pointer ${
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

      {/* 2-Column Mobile Grid / 3–4 Column Desktop Grid */}
      {displayedItems.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {displayedItems.map((item) => {
            const typeLabel = PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType;
            const textureLabel = TEXTURE_VI_LABELS[item.texture] ?? item.texture;
            const matchPct = deltaEToMatchPercent(item.deltaE);
            const isSaved = savedIds.has(item.id);
            const isLip = item.productType === "lipstick";

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
                      className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isSaved ? "fill-rose-600 text-rose-600" : "text-zinc-600"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Clean Unboxed Typography */}
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
                    <div className="pt-1 flex items-center gap-1.5 text-[11px] truncate">
                      <span
                        className={`font-semibold tabular-nums ${
                          matchPct >= 90 ? "text-emerald-700" : "text-zinc-800"
                        }`}
                      >
                        {matchPct}% hợp da
                      </span>
                      <span className="text-zinc-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-zinc-500 truncate">{textureLabel}</span>
                    </div>
                  </button>
                </div>

                {/* Card Action */}
                <div className="px-3 pb-3 pt-1">
                  {isLip ? (
                    <button
                      type="button"
                      onClick={() => onTryLipstick(item)}
                      className="w-full min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Thử lên môi
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onInspectProduct(item)}
                      className="w-full min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Xem chi tiết
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl py-12 px-4 text-center space-y-2">
          <div className="text-sm font-semibold text-zinc-800">
            {activeType === "saved"
              ? "Bạn chưa lưu sản phẩm nào"
              : "Không tìm thấy sản phẩm phù hợp"}
          </div>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            {activeType === "saved"
              ? "Chạm biểu tượng trái tim trên bất kỳ thỏi son hoặc phấn má nào để lưu lại so sánh."
              : "Thử đổi từ khóa tìm kiếm hoặc chuyển sang danh mục khác."}
          </p>
        </div>
      )}

      {filteredItems.length > visibleCount && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 12)}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 text-xs font-semibold text-zinc-800 bg-white border border-zinc-300 rounded-2xl hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Xem thêm ({filteredItems.length - visibleCount} sản phẩm)
          </button>
        </div>
      )}
    </div>
  );
};
