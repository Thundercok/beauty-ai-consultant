import React, { useMemo, useState } from "react";
import { Flame, Search } from "lucide-react";
import { labToRgb, rgbToHex } from "../lib/beauty/bradfordCat";
import {
  matchProducts,
  scoreMatchedProductsPopularity,
  type TrendingProductItem,
} from "../lib/beauty/productMatcher";
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

interface CatalogMatcherProps {
  products: CatalogProduct[];
  blendedTargets: { lip: string; blush: string; eyeshadow: string };
  lipBaseLab: [number, number, number];
  skinMetrics: SkinMetrics;
  userSeason: SeasonName;
  catalogIlluminant: IlluminantName;
  onInspectLipstick: (product: MatchedProduct) => void;
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

const CATEGORY_TABS = [
  { id: "vn_popular", label: "Hãng Việt & Phổ biến" },
  { id: "popular_only", label: "Phổ biến nhất" },
  { id: "lipstick", label: "Son môi" },
  { id: "blush", label: "Má hồng" },
  { id: "eyeshadow", label: "Phấn mắt" },
  { id: "foundation", label: "Kem nền" },
  { id: "contour", label: "Tạo khối" },
  { id: "concealer", label: "Che khuyết điểm" },
  { id: "glasses", label: "Gọng kính" },
  { id: "all", label: "Tất cả" },
] as const;

export const CatalogMatcher: React.FC<CatalogMatcherProps> = ({
  products,
  blendedTargets,
  lipBaseLab,
  skinMetrics,
  userSeason,
  catalogIlluminant,
  onInspectLipstick,
}) => {
  const [activeType, setActiveType] = useState<(typeof CATEGORY_TABS)[number]["id"]>("vn_popular");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(6);

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
        : products;

    let baseMatched: MatchedProduct[] = [];
    if (activeType === "all" || activeType === "vn_popular" || activeType === "popular_only") {
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

    // Keep scientific ΔE2000 accuracy primary, slightly preferring popular items within equal ΔE bands
    scored.sort((a, b) => a.deltaE - b.deltaE);
    return scored;
  }, [activeType, products, blendedTargets, lipBaseLab, skinHex, userSeason, catalogIlluminant]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rankedItems;
    return rankedItems.filter(
      (item) =>
        item.brand.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.shade.toLowerCase().includes(q) ||
        item.bestSeasons.toLowerCase().includes(q)
    );
  }, [rankedItems, query]);

  const displayedItems = filteredItems.slice(0, visibleCount);

  return (
    <section
      id="catalog"
      className="scroll-mt-20 border-t border-zinc-200 pt-8 md:pt-10 space-y-5"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-1">
            03. Ứng dụng: Đối chiếu bảng màu mỹ phẩm ({products.length} mã SKU)
          </p>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">
            Sản phẩm tương thích theo khoảng cách màu ΔE2000
          </h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
            Xếp hạng theo độ gần với mục tiêu sắc độ đo được từ ảnh; các mã có viền nổi bật là
            sản phẩm phổ biến &amp; hợp mùa sắc cao.
          </p>
        </div>

        <div className="relative w-full md:w-72 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleCount(6);
            }}
            placeholder="Tìm tên son, hãng, mã màu..."
            aria-label="Tìm tên son, hãng hoặc mã màu"
            className="w-full min-h-[44px] md:min-h-[38px] pl-10 pr-3 py-2 text-sm md:text-xs bg-white border border-zinc-300 rounded-xl md:rounded-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100 border border-zinc-200 rounded-xl overflow-x-auto snap-x">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveType(tab.id);
              setVisibleCount(6);
            }}
            className={`min-h-[40px] md:min-h-[34px] px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 snap-start transition-colors cursor-pointer ${
              activeType === tab.id
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {displayedItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {displayedItems.map((item) => {
            const typeLabel = PRODUCT_TYPE_VI_LABELS[item.productType] ?? item.productType;
            const textureLabel = TEXTURE_VI_LABELS[item.texture] ?? item.texture;
            const tierLabel = translateMatchTier(item.matchTier);

            return (
              <article
                key={item.id}
                data-popular={item.isPopular ? "true" : "false"}
                className={`bg-white rounded-2xl md:rounded-xl overflow-hidden flex flex-col justify-between transition-shadow hover:shadow-sm ${
                  item.isPopular
                    ? "border border-amber-400/90 ring-1 ring-amber-200/70"
                    : "border border-zinc-200"
                }`}
              >
                <div>
                  {item.renderedHex ? (
                    <div>
                      <div className="grid grid-cols-2 h-16">
                        <div style={{ backgroundColor: item.hex }} title={`Màu thỏi: ${item.hex}`} />
                        <div
                          style={{ backgroundColor: item.renderedHex }}
                          title={`Khi lên môi bạn: ${item.renderedHex}`}
                        />
                      </div>
                      <div className="grid grid-cols-2 px-4 py-1.5 bg-zinc-50 border-b border-zinc-100 text-[11px] text-zinc-500">
                        <span>Màu thỏi son</span>
                        <span className="text-right font-medium text-zinc-800">
                          Lên môi thật
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div
                        className="h-16"
                        style={{ backgroundColor: item.hex }}
                        title={`Màu sản phẩm: ${item.hex}`}
                      />
                      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-50 border-b border-zinc-100 text-[11px] text-zinc-500">
                        <span>Màu sản phẩm</span>
                        <span className="font-mono tabular-nums text-zinc-600">{item.hex}</span>
                      </div>
                    </div>
                  )}

                  <div className="p-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs text-zinc-500 truncate">
                        {item.brand} · {typeLabel}
                      </div>
                      {item.isPopular && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/90 text-[11px] font-medium text-amber-800 shrink-0">
                          <Flame className="w-3 h-3 text-amber-600" aria-hidden="true" />
                          Phổ biến
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 leading-snug">
                      {item.name}
                    </h3>
                    <div className="text-xs text-zinc-700">{item.shade}</div>
                    <div className="text-xs text-zinc-500 pt-0.5">
                      <span
                        className={
                          item.matchTier === "Exact Match"
                            ? "font-medium text-emerald-700"
                            : item.matchTier === "Great Match"
                              ? "font-medium text-zinc-800"
                              : "text-zinc-500"
                        }
                      >
                        {tierLabel}
                      </span>{" "}
                      · {textureLabel}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 bg-zinc-50/50">
                  <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                    ΔE {item.deltaE.toFixed(1)} · {item.renderedHex ?? item.hex}
                  </span>
                  {item.productType === "lipstick" ? (
                    <button
                      type="button"
                      onClick={() => {
                        onInspectLipstick(item);
                        document
                          .getElementById("lip-tryon")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="min-h-[40px] md:min-h-[32px] px-3.5 md:px-3 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl md:rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Thử mô hình môi
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-500 py-1">{item.undertone}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl py-10 text-center text-sm text-zinc-500">
          Không tìm thấy sản phẩm phù hợp với điều kiện lọc hiện tại.
        </div>
      )}

      {filteredItems.length > visibleCount && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 6)}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 text-xs font-medium text-zinc-800 bg-white border border-zinc-300 rounded-xl md:rounded-md hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Xem thêm ({filteredItems.length - visibleCount} mã còn lại)
          </button>
        </div>
      )}
    </section>
  );
};
