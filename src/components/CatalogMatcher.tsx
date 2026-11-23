import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { rgbToHex, labToRgb } from "../lib/beauty/bradfordCat";
import { matchProducts } from "../lib/beauty/productMatcher";
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

const CATEGORY_TABS = [
  { id: "lipstick", label: "Lipsticks" },
  { id: "blush", label: "Blushes" },
  { id: "eyeshadow", label: "Eyeshadows" },
  { id: "foundation", label: "Foundations" },
  { id: "contour", label: "Contours" },
  { id: "concealer", label: "Concealers" },
  { id: "glasses", label: "Eyewear" },
  { id: "all", label: "All SKUs" },
] as const;

export const CatalogMatcher: React.FC<CatalogMatcherProps> = ({
  products,
  blendedTargets,
  lipBaseLab,
  skinMetrics,
  catalogIlluminant,
  onInspectLipstick,
}) => {
  const [activeType, setActiveType] = useState<(typeof CATEGORY_TABS)[number]["id"]>("lipstick");
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

    if (activeType === "all") {
      const types = Array.from(new Set(products.map((p) => p.product_type)));
      const merged: MatchedProduct[] = [];
      for (const t of types) {
        merged.push(
          ...matchProducts(getTargetForType(t), products, {
            productType: t,
            lipBaseLab: t === "lipstick" ? lipBaseLab : undefined,
            topK: 100,
            catalogIlluminant,
          })
        );
      }
      merged.sort((a, b) => a.deltaE - b.deltaE);
      return merged;
    }

    return matchProducts(getTargetForType(activeType), products, {
      productType: activeType,
      lipBaseLab: activeType === "lipstick" ? lipBaseLab : undefined,
      topK: 100,
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
            04. Curated K-Beauty &amp; Eyewear Database
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            CIEDE2000 Colorimetric Product Matching
          </h2>
          <p className="text-sm text-zinc-600 mt-1">
            {products.length} catalog SKUs ranked in D65 CIELAB against your continuous seasonal targets
            ({catalogIlluminant === "D50" ? "Bradford D50 → D65 adapted" : "native sRGB D65"}).
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter brand, shade, season..."
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
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
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
                <th className="py-3 px-4">Swatch</th>
                <th className="py-3 px-4">Brand &amp; Product</th>
                <th className="py-3 px-4">Shade &amp; Formula</th>
                <th className="py-3 px-4">Best Seasons</th>
                <th className="py-3 px-4 text-right">ΔE00</th>
                <th className="py-3 px-4">Match Tier</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 text-xs">
              {filteredItems.slice(0, 24).map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50/70 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-6 h-6 rounded border border-zinc-300 shrink-0"
                        style={{ backgroundColor: item.hex }}
                        title={`Catalog Hex: ${item.hex}`}
                      />
                      {item.renderedHex && (
                        <span
                          className="inline-block w-6 h-6 rounded border border-zinc-900 shrink-0"
                          style={{ backgroundColor: item.renderedHex }}
                          title={`Kubelka-Munk Rendered On Lip: ${item.renderedHex}`}
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
                    {item.deltaE.toFixed(2)}
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
                      {item.matchTier}
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
                        className="px-2.5 py-1 text-[11px] font-medium text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded transition-colors whitespace-nowrap"
                      >
                        Test in K–M Lab
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
                    No catalog products matched your filter.
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
