import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { labToRgb, rgbToHex } from "../lib/beauty/bradfordCat";
import { matchProducts } from "../lib/beauty/productMatcher";
import { translateMatchTier } from "../lib/beauty/viLabels";
import type {
  CatalogProduct,
  IlluminantName,
  MatchedProduct,
  SkinMetrics,
} from "../lib/beauty/types";

interface CatalogMatcherProps {
  products: CatalogProduct[];
  blendedTargets: { lip: string; blush: string; eyeshadow: string };
  lipBaseLab: [number, number, number];
  skinMetrics: SkinMetrics;
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
  { id: "vn_popular", label: "Hãng Việt & Phổ biến VN" },
  { id: "lipstick", label: "Son môi" },
  { id: "blush", label: "Má hồng" },
  { id: "eyeshadow", label: "Phấn mắt" },
  { id: "foundation", label: "Kem nền / Cushion" },
  { id: "contour", label: "Tạo khối" },
  { id: "concealer", label: "Che khuyết điểm" },
  { id: "glasses", label: "Gọng kính" },
  { id: "all", label: "Tất cả sản phẩm" },
] as const;

export const CatalogMatcher: React.FC<CatalogMatcherProps> = ({
  products,
  blendedTargets,
  lipBaseLab,
  skinMetrics,
  catalogIlluminant,
  onInspectLipstick,
}) => {
  const [activeType, setActiveType] = useState<(typeof CATEGORY_TABS)[number]["id"]>("vn_popular");
  const [query, setQuery] = useState("");

  const skinHex = useMemo(
    () => rgbToHex(labToRgb([skinMetrics.L_star, skinMetrics.a_star, skinMetrics.b_star])),
    [skinMetrics.L_star, skinMetrics.a_star, skinMetrics.b_star]
  );

  const rankedItems = useMemo(() => {
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

    if (activeType === "all" || activeType === "vn_popular") {
      const types = Array.from(new Set(sourceList.map((p) => p.product_type)));
      const merged: MatchedProduct[] = [];
      for (const t of types) {
        merged.push(
          ...matchProducts(getTargetForType(t), sourceList, {
            productType: t,
            lipBaseLab: t === "lipstick" ? lipBaseLab : undefined,
            topK: 150,
            catalogIlluminant,
          })
        );
      }
      merged.sort((a, b) => a.deltaE - b.deltaE);
      return merged;
    }

    return matchProducts(getTargetForType(activeType), sourceList, {
      productType: activeType,
      lipBaseLab: activeType === "lipstick" ? lipBaseLab : undefined,
      topK: 150,
      catalogIlluminant,
    });
  }, [activeType, products, blendedTargets, lipBaseLab, skinHex, catalogIlluminant]);

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

  return (
    <section id="catalog" className="border-t border-zinc-200 pt-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
            05. Kho sản phẩm Việt Nam &amp; Quốc tế ({products.length} mã màu)
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Gợi ý mỹ phẩm &amp; gọng kính hợp nhất với bạn
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            Bao gồm Lemonade, OFÉLIA, M.O.I Cosmetics, Cỏ Mềm, Gilaa, Black Rouge, Merzy, Romand, 3CE...
            được xếp hạng từ hợp nhất đến gợi ý gần đúng.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm hãng, tên son, mã màu..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-zinc-300 rounded-md text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          />
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 bg-zinc-100 border border-zinc-200 rounded-lg overflow-x-auto mb-5">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveType(tab.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeType === tab.id
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                <th className="py-3 px-4">Màu sắc</th>
                <th className="py-3 px-4">Thương hiệu &amp; Sản phẩm</th>
                <th className="py-3 px-4">Mã màu &amp; Chất liệu</th>
                <th className="py-3 px-4">Phù hợp mùa</th>
                <th className="py-3 px-4 text-right">Độ lệch (ΔE)</th>
                <th className="py-3 px-4">Đánh giá</th>
                <th className="py-3 px-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-xs">
              {filteredItems.slice(0, 30).map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-6 h-6 rounded border border-zinc-300 shrink-0"
                        style={{ backgroundColor: item.hex }}
                        title={`Màu sản phẩm: ${item.hex}`}
                      />
                      {item.renderedHex && (
                        <span
                          className="inline-block w-6 h-6 rounded border border-zinc-900 shrink-0"
                          style={{ backgroundColor: item.renderedHex }}
                          title={`Màu khi thoa lên môi bạn: ${item.renderedHex}`}
                        />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-zinc-900">{item.brand}</div>
                    <div className="text-zinc-600">{item.name}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-zinc-900">{item.shade}</div>
                    <div className="text-zinc-500 mt-0.5">
                      {item.texture} · {item.undertone}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-zinc-600 max-w-xs">{item.bestSeasons}</td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-900">
                    {item.deltaE.toFixed(1)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-medium ${
                        item.matchTier === "Exact Match"
                          ? "text-emerald-700"
                          : item.matchTier === "Great Match"
                            ? "text-cyan-700"
                            : "text-zinc-600"
                      }`}
                    >
                      {translateMatchTier(item.matchTier)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {item.productType === "lipstick" ? (
                      <button
                        type="button"
                        onClick={() => {
                          onInspectLipstick(item);
                          document
                            .getElementById("kubelka-munk")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded transition-colors whitespace-nowrap cursor-pointer"
                      >
                        Thử lên môi
                      </button>
                    ) : (
                      <span className="font-mono text-[11px] text-zinc-400">{item.hex}</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-zinc-500">
                    Không tìm thấy sản phẩm phù hợp với từ khóa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
