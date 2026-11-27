import React, { useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Columns2,
  Download,
  ExternalLink,
  Eye,
  Heart,
  Search,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { hexToLab, hexToRgb, rgbToHex, rgbToLab } from "../lib/beauty/bradfordCat";
import { DEFAULT_KS, TEXTURE_KS_MAP, kubelkaMunkLipBlend } from "../lib/beauty/kubelkaMunk";
import { ciede2000 } from "../lib/beauty/productMatcher";
import {
  applyVirtualMakeupToRgba,
  deltaEToMatchPercent,
  type VirtualMakeupOptions,
} from "../lib/beauty/virtualMakeup";
import {
  buildVnShopLinks,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
  type PriceTierId,
} from "../lib/beauty/vnBeautyGuide";
import type { ConsultationReport, FaceLandmarksBox, MatchedProduct } from "../lib/beauty/types";
import { LipCompareSliderPortrait } from "./LipCompareSliderPortrait";
import { PortraitCanvas } from "./PortraitCanvas";

interface LipTryOnViewProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  selectedLipstick: MatchedProduct | null;
  availableLipsticks: MatchedProduct[];
  availableBlushes: MatchedProduct[];
  onSelectLipstick: (product: MatchedProduct) => void;
  blushEnabled: boolean;
  onBlushEnabledChange: (enabled: boolean) => void;
  selectedBlushId: number | null;
  onSelectBlushId: (id: number) => void;
  savedIds: Set<number>;
  onToggleSave: (id: number) => void;
  onNotify?: (message: string) => void;
}

const FINISH_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "Juicy Tint", label: "Tint bóng" },
  { id: "Velvet Tint", label: "Kem nhung" },
  { id: "Matte Lipstick", label: "Son lì" },
  { id: "Dewy Balm", label: "Son dưỡng" },
  { id: "Blur Water Tint", label: "Tint mịn mờ" },
  { id: "Lip Clay / Mud", label: "Son bùn" },
];

const INTENSITY_PRESETS: Array<{ id: string; label: string; thickness: number }> = [
  { id: "gradient", label: "Lòng môi nhẹ", thickness: 0.45 },
  { id: "natural", label: "1–2 lớp tự nhiên", thickness: 0.95 },
  { id: "full", label: "Full môi đậm", thickness: 1.75 },
];

const BUDGET_FILTERS: Array<{ id: PriceTierId; label: string }> = [
  { id: "all", label: "Mọi giá" },
  { id: "under_200k", label: "Dưới 200k" },
  { id: "mid_200_350k", label: "200–350k" },
  { id: "luxury_350k_plus", label: "Trên 350k" },
];

export const LipTryOnView: React.FC<LipTryOnViewProps> = ({
  report,
  faceBox,
  selectedLipstick,
  availableLipsticks,
  availableBlushes,
  onSelectLipstick,
  blushEnabled,
  onBlushEnabledChange,
  selectedBlushId,
  onSelectBlushId,
  savedIds,
  onToggleSave,
  onNotify,
}) => {
  const compareScrollRef = useRef<HTMLDivElement | null>(null);

  // Pick top 4 closest matches first, then greedily pick visually distinct shades for quick discovery
  const curatedShades = useMemo(() => {
    if (availableLipsticks.length <= 16) return availableLipsticks;
    const picked: MatchedProduct[] = [];
    const usedIds = new Set<number>();

    if (selectedLipstick) {
      picked.push(selectedLipstick);
      usedIds.add(selectedLipstick.id);
    }

    for (const item of availableLipsticks) {
      if (picked.length >= 4) break;
      if (!usedIds.has(item.id)) {
        picked.push(item);
        usedIds.add(item.id);
      }
    }

    const candidates = availableLipsticks.filter((item) => !usedIds.has(item.id));
    while (picked.length < 16 && candidates.length > 0) {
      let bestIdx = 0;
      let bestMinDist = -1;
      for (let i = 0; i < candidates.length; i++) {
        const candLab = hexToLab(candidates[i].renderedHex ?? candidates[i].hex);
        let minDist = Infinity;
        for (const p of picked) {
          const d = ciede2000(candLab, hexToLab(p.renderedHex ?? p.hex));
          if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) {
          bestMinDist = minDist;
          bestIdx = i;
        }
      }
      const [chosen] = candidates.splice(bestIdx, 1);
      picked.push(chosen);
    }

    return picked;
  }, [availableLipsticks, selectedLipstick]);

  const productA = selectedLipstick ?? curatedShades[0] ?? null;

  // Compare 2 Shades Mode state (supports smooth Split Slider on 1 face OR Side-by-Side 2 portraits)
  const [compareTwoMode, setCompareTwoMode] = useState(false);
  const [compareLayout, setCompareLayout] = useState<"slider" | "side_by_side">("slider");
  const [compareSplitPct, setCompareSplitPct] = useState(50);
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  const [secondShadeId, setSecondShadeId] = useState<number | null>(null);

  // Search, budget filter, and full-catalog expansion so users can pick ANY 2 lipsticks
  const [shadeQuery, setShadeQuery] = useState("");
  const [budgetFilter, setBudgetFilter] = useState<PriceTierId>("all");
  const [showAllCatalog, setShowAllCatalog] = useState(false);

  const productB = useMemo(() => {
    const found = availableLipsticks.find((s) => s.id === secondShadeId);
    if (found && found.id !== productA?.id) return found;
    return curatedShades.find((s) => s.id !== productA?.id) ?? availableLipsticks[1] ?? productA;
  }, [curatedShades, availableLipsticks, secondShadeId, productA]);

  // Whichever product slot is currently focused for editing / inspection
  const focusedProduct = compareTwoMode && activeSlot === "B" ? productB : productA;

  const [customTexture, setCustomTexture] = useState<string | null>(null);
  const [thicknessOverride, setThicknessOverride] = useState<number | null>(null);
  const [compareBare, setCompareBare] = useState(false);
  const [holdingBare, setHoldingBare] = useState(false);
  const [zoomToLips, setZoomToLips] = useState(false);

  const effectiveTexture = customTexture ?? focusedProduct?.texture ?? "Juicy Tint";
  const ksDefaults = TEXTURE_KS_MAP[effectiveTexture] ?? DEFAULT_KS;
  const effectiveThickness = thicknessOverride ?? ksDefaults.thickness;

  const isBareActive = !compareTwoMode && (compareBare || holdingBare);
  const activeBlush =
    availableBlushes.find((b) => b.id === selectedBlushId) ?? availableBlushes[0] ?? null;
  const effectiveBlushHex = activeBlush?.hex ?? report.blendedTargets.blush;

  // Filtered list of lipsticks so user can quickly pick ANY shade in the database
  const displayedShades = useMemo(() => {
    const q = shadeQuery.trim().toLowerCase();
    const isFiltering = q.length > 0 || budgetFilter !== "all" || showAllCatalog;
    const source = isFiltering ? availableLipsticks : curatedShades;

    const filtered = source.filter((item) => {
      if (budgetFilter !== "all") {
        const tier = estimateProductPriceVn(item.brand, "lipstick", item.name).tier;
        if (tier !== budgetFilter) return false;
      }
      if (q) {
        const haystack = `${item.brand} ${item.name} ${item.shade} ${item.texture}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return isFiltering ? filtered : filtered.slice(0, 16);
  }, [availableLipsticks, curatedShades, shadeQuery, budgetFilter, showAllCatalog]);

  const simulateForProduct = (prod: MatchedProduct | null, textureOverrideForProd?: string) => {
    const productHex = prod?.hex ?? report.blendedTargets.lip;
    const tex = textureOverrideForProd ?? prod?.texture ?? effectiveTexture;
    const substrateRgb: [number, number, number] = hexToRgb(report.lipMetrics.lipBaseHex);
    const productRgb = hexToRgb(productHex);
    const renderedRgb = kubelkaMunkLipBlend(substrateRgb, productRgb, {
      textureType: tex,
      thickness: effectiveThickness,
    });
    const renderedHex = rgbToHex(renderedRgb);
    const renderedDeltaE = ciede2000(hexToLab(report.blendedTargets.lip), rgbToLab(renderedRgb));

    const layerSteps = [
      { label: "Môi mộc", thickness: 0 },
      { label: "Lòng môi", thickness: 0.45 },
      { label: "1 lớp", thickness: 0.95 },
      { label: "Full môi", thickness: 1.75 },
    ].map((step) => ({
      ...step,
      hex:
        step.thickness === 0
          ? report.lipMetrics.lipBaseHex
          : rgbToHex(
              kubelkaMunkLipBlend(substrateRgb, productRgb, {
                textureType: tex,
                thickness: step.thickness,
              })
            ),
    }));

    return {
      productHex,
      renderedHex,
      matchPercent: deltaEToMatchPercent(renderedDeltaE),
      renderedDeltaE,
      layerSteps,
    };
  };

  const simA = useMemo(
    () =>
      simulateForProduct(
        productA,
        !compareTwoMode || activeSlot === "A" ? effectiveTexture : productA?.texture
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productA, report.blendedTargets.lip, report.lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness, compareTwoMode, activeSlot]
  );

  const simB = useMemo(
    () =>
      simulateForProduct(
        productB,
        compareTwoMode && activeSlot === "B" ? effectiveTexture : productB?.texture
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productB, report.blendedTargets.lip, report.lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness, compareTwoMode, activeSlot]
  );

  const focusedSim = compareTwoMode && activeSlot === "B" ? simB : simA;

  const virtualMakeupA: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: !isBareActive,
      lipHex: simA.productHex,
      lipTexture: !compareTwoMode || activeSlot === "A" ? effectiveTexture : productA?.texture ?? effectiveTexture,
      lipThickness: effectiveThickness,
      blushEnabled: !isBareActive && blushEnabled,
      blushHex: effectiveBlushHex,
      blushIntensity: 0.24,
    }),
    [
      isBareActive,
      simA.productHex,
      compareTwoMode,
      activeSlot,
      effectiveTexture,
      productA?.texture,
      effectiveThickness,
      blushEnabled,
      effectiveBlushHex,
    ]
  );

  const virtualMakeupB: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: true,
      lipHex: simB.productHex,
      lipTexture: compareTwoMode && activeSlot === "B" ? effectiveTexture : productB?.texture ?? effectiveTexture,
      lipThickness: effectiveThickness,
      blushEnabled,
      blushHex: effectiveBlushHex,
      blushIntensity: 0.24,
    }),
    [
      simB.productHex,
      compareTwoMode,
      activeSlot,
      effectiveTexture,
      productB?.texture,
      effectiveThickness,
      blushEnabled,
      effectiveBlushHex,
    ]
  );

  const priceA = productA ? estimateProductPriceVn(productA.brand, "lipstick", productA.name) : null;
  const traitsA = productA
    ? evaluateVnStudentTraits({
        productType: "lipstick",
        texture: productA.texture,
        hex: productA.hex,
        renderedHex: simA.renderedHex,
        deltaE: simA.renderedDeltaE,
      })
    : null;
  const shopLinksA = productA
    ? buildVnShopLinks(productA.brand, productA.name, productA.shade)
    : null;

  const priceB = productB ? estimateProductPriceVn(productB.brand, "lipstick", productB.name) : null;
  const traitsB = productB
    ? evaluateVnStudentTraits({
        productType: "lipstick",
        texture: productB.texture,
        hex: productB.hex,
        renderedHex: simB.renderedHex,
        deltaE: simB.renderedDeltaE,
      })
    : null;
  const shopLinksB = productB
    ? buildVnShopLinks(productB.brand, productB.name, productB.shade)
    : null;

  const focusedPrice = compareTwoMode && activeSlot === "B" ? priceB : priceA;
  const focusedTraits = compareTwoMode && activeSlot === "B" ? traitsB : traitsA;
  const focusedShopLinks = compareTwoMode && activeSlot === "B" ? shopLinksB : shopLinksA;
  const isFocusedSaved = focusedProduct ? savedIds.has(focusedProduct.id) : false;

  const matchVerdict =
    focusedSim.renderedDeltaE <= 5.5
      ? "Lên môi rất sáng da và tự nhiên"
      : focusedSim.renderedDeltaE <= 10.5
        ? "Hài hòa, dễ dùng hằng ngày đi học & đi chơi"
        : "Màu son cá tính — tán nhẹ lòng môi sẽ tự nhiên hơn";

  const handleSelectShade = (item: MatchedProduct) => {
    if (compareTwoMode && activeSlot === "B") {
      setSecondShadeId(item.id);
      setCustomTexture(null);
      return;
    }
    onSelectLipstick(item);
    setCustomTexture(null);
    setCompareBare(false);
  };

  const handleSwapAB = () => {
    if (!productA || !productB) return;
    const prevA = productA;
    onSelectLipstick(productB);
    setSecondShadeId(prevA.id);
    onNotify?.("Đã đổi vị trí Màu A và Màu B");
  };

  /**
   * Exports a clean PNG collage (single look OR side-by-side Shade A vs Shade B)
   * so students can immediately send it to friends to ask which lipstick to buy.
   */
  const handleSaveLookPng = () => {
    try {
      const renderRgbaToCanvas = (rgba: Uint8ClampedArray): HTMLCanvasElement => {
        const c = document.createElement("canvas");
        c.width = report.width;
        c.height = report.height;
        const cctx = c.getContext("2d");
        if (cctx) {
          cctx.putImageData(
            new ImageData(new Uint8ClampedArray(rgba), report.width, report.height),
            0,
            0
          );
        }
        return c;
      };

      const footerH = 74;
      const out = document.createElement("canvas");

      if (compareTwoMode && productA && productB) {
        const gap = 8;
        out.width = report.width * 2 + gap;
        out.height = report.height + footerH;
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);

        const rgbaA = applyVirtualMakeupToRgba(
          report.correctedRgba,
          report.width,
          report.height,
          report.neuralLandmarks,
          report.skinMask,
          faceBox,
          virtualMakeupA
        );
        const rgbaB = applyVirtualMakeupToRgba(
          report.correctedRgba,
          report.width,
          report.height,
          report.neuralLandmarks,
          report.skinMask,
          faceBox,
          virtualMakeupB
        );
        ctx.drawImage(renderRgbaToCanvas(rgbaA), 0, 0);
        ctx.drawImage(renderRgbaToCanvas(rgbaB), report.width + gap, 0);

        const drawLabel = (x: number, tag: string, prod: MatchedProduct, priceText: string) => {
          ctx.fillStyle = "#18181b";
          ctx.font = "bold 14px system-ui, sans-serif";
          ctx.fillText(`${tag}: ${prod.brand}`, x + 12, report.height + 26);
          ctx.fillStyle = "#52525b";
          ctx.font = "12px system-ui, sans-serif";
          ctx.fillText(`${prod.shade} · ${priceText}`, x + 12, report.height + 48);
        };
        drawLabel(0, "Màu A", productA, priceA?.priceRangeLabel ?? "");
        drawLabel(report.width + gap, "Màu B", productB, priceB?.priceRangeLabel ?? "");
      } else if (productA) {
        out.width = report.width;
        out.height = report.height + footerH;
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);

        const rgbaA = applyVirtualMakeupToRgba(
          report.correctedRgba,
          report.width,
          report.height,
          report.neuralLandmarks,
          report.skinMask,
          faceBox,
          virtualMakeupA
        );
        ctx.drawImage(renderRgbaToCanvas(rgbaA), 0, 0);

        ctx.fillStyle = "#18181b";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.fillText(`${productA.brand} · ${productA.name}`, 12, report.height + 26);
        ctx.fillStyle = "#52525b";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(
          `${productA.shade} · ${priceA?.priceRangeLabel ?? ""} · ${simA.matchPercent}% hợp da`,
          12,
          report.height + 48
        );
      } else {
        return;
      }

      const dataUrl = out.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = compareTwoMode ? "so-sanh-2-mau-son.png" : "thu-mau-son.png";
      a.click();
      onNotify?.(compareTwoMode ? "Đã lưu ảnh so sánh 2 màu son" : "Đã lưu ảnh thử son");
    } catch {
      onNotify?.("Không thể xuất ảnh trên trình duyệt này");
    }
  };

  return (
    <div className="space-y-4 pb-8 md:pb-2">
      {/* Top Mode Bar: Single Try-On vs Compare 2 Shades Side-by-Side + Save Image */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Chế độ thử son"
          className="inline-grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-xl"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!compareTwoMode}
            onClick={() => {
              setCompareTwoMode(false);
              setActiveSlot("A");
            }}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              !compareTwoMode
                ? "bg-white text-zinc-900 shadow-xs font-semibold"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Thử 1 màu</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compareTwoMode}
            data-testid="compare-two-shades-tab"
            onClick={() => {
              setCompareTwoMode(true);
              setCompareBare(false);
            }}
            className={`min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              compareTwoMode
                ? "bg-white text-zinc-900 shadow-xs font-semibold"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>So sánh 2 màu</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveLookPng}
          className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Lưu ảnh hỏi bạn</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
        {/* Left: Portrait Mirror (Single OR Side-by-Side 2 Shades) */}
        <div className="lg:col-span-5 space-y-3">
          {compareTwoMode && productA && productB ? (
            <>
              {compareLayout === "slider" ? (
                <>
                  <LipCompareSliderPortrait
                    report={report}
                    box={faceBox}
                    productA={productA}
                    productB={productB}
                    swatchHexA={simA.renderedHex}
                    swatchHexB={simB.renderedHex}
                    makeupA={virtualMakeupA}
                    makeupB={virtualMakeupB}
                    activeSlot={activeSlot}
                    onActiveSlotChange={setActiveSlot}
                    zoomToLips={zoomToLips}
                    splitPct={compareSplitPct}
                    onSplitPctChange={setCompareSplitPct}
                  />

                  {/* Compact A vs B Summary & Quick Buy Strip under Split Slider */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        {
                          slot: "A" as const,
                          product: productA,
                          price: priceA,
                          sim: simA,
                          links: shopLinksA,
                        },
                        {
                          slot: "B" as const,
                          product: productB,
                          price: priceB,
                          sim: simB,
                          links: shopLinksB,
                        },
                      ] as const
                    ).map(({ slot, product, price, sim, links }) => {
                      const isSelectedSlot = activeSlot === slot;
                      return (
                        <div
                          key={slot}
                          data-testid={`compare-slot-${slot}`}
                          role="button"
                          tabIndex={0}
                          onClick={() => setActiveSlot(slot)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setActiveSlot(slot);
                            }
                          }}
                          className={`rounded-2xl bg-white border-2 p-2.5 space-y-2 transition-all cursor-pointer ${
                            isSelectedSlot
                              ? "border-zinc-900 shadow-2xs"
                              : "border-zinc-200/90 hover:border-zinc-400"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
                                  style={{ backgroundColor: sim.renderedHex }}
                                />
                                <span className="text-[11px] font-bold text-zinc-900 truncate">
                                  Màu {slot} · {product.brand}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold text-emerald-700 tabular-nums shrink-0">
                                {sim.matchPercent}%
                              </span>
                            </div>
                            <div className="text-xs font-medium text-zinc-800 truncate">
                              {product.shade}
                            </div>
                            <div className="text-[11px] text-zinc-500 tabular-nums truncate">
                              {price?.priceRangeLabel}
                            </div>
                          </div>

                          {links && (
                            <a
                              href={links.shopeeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full min-h-[32px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                            >
                              <span>Mua Màu {slot}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div
                  ref={compareScrollRef}
                  data-testid="compare-two-shades-grid"
                  className="grid grid-cols-2 gap-2.5"
                >
                  {(
                    [
                      {
                        slot: "A" as const,
                        product: productA,
                        makeup: virtualMakeupA,
                        price: priceA,
                        traits: traitsA,
                        sim: simA,
                        links: shopLinksA,
                      },
                      {
                        slot: "B" as const,
                        product: productB,
                        makeup: virtualMakeupB,
                        price: priceB,
                        traits: traitsB,
                        sim: simB,
                        links: shopLinksB,
                      },
                    ] as const
                  ).map(({ slot, product, makeup, price, traits, sim, links }) => {
                    const isSelectedSlot = activeSlot === slot;
                    return (
                      <div
                        key={slot}
                        data-testid={`compare-slot-${slot}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveSlot(slot)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveSlot(slot);
                          }
                        }}
                        className={`rounded-2xl overflow-hidden bg-white border-2 transition-all cursor-pointer flex flex-col justify-between ${
                          isSelectedSlot
                            ? "border-zinc-900 shadow-sm"
                            : "border-zinc-200/90 hover:border-zinc-400"
                        }`}
                      >
                        <div>
                          <div className="relative h-[225px] sm:h-[285px] bg-zinc-950">
                            <span
                              className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isSelectedSlot
                                  ? "bg-zinc-900 text-white"
                                  : "bg-black/60 text-white/90"
                              }`}
                            >
                              Màu {slot} {isSelectedSlot ? "· Đang đổi" : ""}
                            </span>
                            <PortraitCanvas
                              report={report}
                              mode="corrected"
                              showOverlay={false}
                              box={faceBox}
                              virtualMakeup={makeup}
                              zoomToLips={zoomToLips}
                              fit="cover"
                              containerClassName="h-full w-full bg-zinc-950"
                            />
                          </div>
                          <div className="p-2.5 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-3 h-3 rounded-full ring-1 ring-black/10 shrink-0"
                                style={{ backgroundColor: sim.renderedHex }}
                              />
                              <span className="text-[11px] font-semibold text-zinc-900 truncate">
                                {product.brand}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-zinc-800 line-clamp-1">
                              {product.shade}
                            </div>
                            <div className="text-[11px] text-zinc-500 tabular-nums truncate">
                              <span className="font-semibold text-emerald-700">
                                {sim.matchPercent}% hợp
                              </span>{" "}
                              · {price?.priceRangeLabel}
                            </div>
                            {traits && traits.badges.length > 0 && (
                              <div className="text-[10px] font-medium text-rose-700 truncate">
                                {traits.badges[0]}
                              </div>
                            )}
                          </div>
                        </div>

                        {links && (
                          <div className="px-2.5 pb-2.5">
                            <a
                              href={links.shopeeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full min-h-[32px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
                            >
                              <span>Mua Màu {slot}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Compare View Controls: Slider vs Side-by-Side + Swap A/B + Zoom Lips */}
              <div className="bg-white rounded-2xl border border-zinc-200/90 p-2.5 space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-1 p-0.5 bg-zinc-100 rounded-xl">
                  <button
                    type="button"
                    data-testid="compare-layout-slider"
                    onClick={() => setCompareLayout("slider")}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      compareLayout === "slider"
                        ? "bg-white text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Kéo thanh trượt
                  </button>
                  <button
                    type="button"
                    data-testid="compare-layout-side-by-side"
                    onClick={() => setCompareLayout("side_by_side")}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      compareLayout === "side_by_side"
                        ? "bg-white text-zinc-900 shadow-2xs font-semibold"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    2 ảnh cạnh nhau
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
                  <button
                    type="button"
                    onClick={handleSwapAB}
                    className="font-semibold text-zinc-800 hover:text-zinc-950 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Đổi chỗ A ⇄ B</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomToLips((v) => !v)}
                    className="font-semibold text-rose-700 hover:text-rose-800 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    {zoomToLips ? (
                      <ZoomOut className="w-3.5 h-3.5" />
                    ) : (
                      <ZoomIn className="w-3.5 h-3.5" />
                    )}
                    <span>{zoomToLips ? "Xem toàn mặt" : "Phóng to môi"}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div
              className="relative bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-200/80 shadow-xs h-[360px] sm:h-[445px] lg:h-[495px] w-full select-none"
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                setHoldingBare(true);
              }}
              onPointerUp={() => setHoldingBare(false)}
              onPointerLeave={() => setHoldingBare(false)}
              onPointerCancel={() => setHoldingBare(false)}
            >
              {/* Top overlay controls */}
              <div className="absolute top-3 inset-x-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
                <button
                  type="button"
                  aria-pressed={compareBare}
                  onClick={() => setCompareBare((v) => !v)}
                  className={`pointer-events-auto min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                    isBareActive
                      ? "bg-white text-zinc-900 border-white"
                      : "bg-black/55 text-white border-white/20 hover:bg-black/75"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isBareActive ? "Đang xem môi mộc" : "Môi mộc"}</span>
                </button>

                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-pressed={zoomToLips}
                    aria-label={zoomToLips ? "Thu nhỏ toàn mặt" : "Phóng to vùng môi"}
                    onClick={() => setZoomToLips((v) => !v)}
                    className={`min-h-[36px] min-w-[36px] px-2.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                      zoomToLips
                        ? "bg-white text-zinc-900 border-white"
                        : "bg-black/55 text-white border-white/20 hover:bg-black/75"
                    }`}
                  >
                    {zoomToLips ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    aria-pressed={blushEnabled}
                    onClick={() => onBlushEnabledChange(!blushEnabled)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border whitespace-nowrap transition-colors cursor-pointer ${
                      blushEnabled
                        ? "bg-rose-600 text-white border-rose-500"
                        : "bg-black/55 text-white border-white/20 hover:bg-black/75"
                    }`}
                  >
                    {blushEnabled ? "Má hồng: Bật" : "+ Má hồng"}
                  </button>
                </div>
              </div>

              <PortraitCanvas
                report={report}
                mode="corrected"
                showOverlay={false}
                box={faceBox}
                virtualMakeup={virtualMakeupA}
                zoomToLips={zoomToLips}
                fit="cover"
                containerClassName="h-full w-full bg-zinc-950"
              />

              {/* Compact bottom active-shade strip */}
              {productA && (
                <div className="absolute inset-x-0 bottom-0 pt-14 pb-3.5 px-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] text-white/80 truncate">
                        {productA.brand} · {priceA?.priceRangeLabel} · Nhấn giữ ảnh xem môi mộc
                      </div>
                      <div className="text-sm font-bold text-white leading-snug line-clamp-2">
                        {productA.name} — {productA.shade}
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-emerald-300 tabular-nums shrink-0">
                      {isBareActive ? "Môi mộc" : `${simA.matchPercent}% hợp`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inline Blush Shade Switcher when Blush overlay is active */}
          {blushEnabled && availableBlushes.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200/90 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-900 truncate">
                  Má hồng: {activeBlush?.brand}
                </div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {activeBlush?.shade ?? "Màu má gợi ý"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {availableBlushes.slice(0, 4).map((b) => {
                  const isSelected = activeBlush?.id === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onSelectBlushId(b.id)}
                      aria-label={`Chọn má hồng ${b.brand} ${b.shade}`}
                      className={`w-8 h-8 rounded-full transition-transform cursor-pointer ${
                        isSelected
                          ? "ring-2 ring-zinc-900 ring-offset-2 scale-105"
                          : "ring-1 ring-black/10"
                      }`}
                      style={{ backgroundColor: b.hex }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Quick Full-Catalog Shade Picker (Any 2 Shades!), Student Info + Quick Shopee Buy, Finish & Layering */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 space-y-4">
            {/* Slot Switcher when in Compare 2 Shades mode */}
            {compareTwoMode && productA && productB && (
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-xl">
                {(
                  [
                    { slot: "A" as const, prod: productA, hex: simA.renderedHex },
                    { slot: "B" as const, prod: productB, hex: simB.renderedHex },
                  ] as const
                ).map(({ slot, prod, hex }) => {
                  const active = activeSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setActiveSlot(slot)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs inline-flex items-center gap-2 transition-colors cursor-pointer min-w-0 ${
                        active
                          ? "bg-white text-zinc-900 font-semibold shadow-xs"
                          : "text-zinc-600 hover:text-zinc-900 font-medium"
                      }`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full ring-1 ring-black/15 shrink-0"
                        style={{ backgroundColor: hex }}
                      />
                      <span className="truncate">
                        Màu {slot}: {prod.brand} · {prod.shade}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Focused Product Details + Save + Quick Shopee Search */}
            {focusedProduct && (
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-zinc-100">
                <div className="min-w-0 space-y-1">
                  <div className="text-xs text-zinc-500">
                    {compareTwoMode ? `Màu ${activeSlot} đang chọn · ` : ""}
                    {focusedProduct.brand} ·{" "}
                    <span className="font-semibold text-zinc-800">
                      {focusedPrice?.priceRangeLabel}
                    </span>
                  </div>
                  <h1 className="text-sm sm:text-base font-bold text-zinc-900 leading-snug">
                    {focusedProduct.name} · {focusedProduct.shade}
                  </h1>
                  {focusedTraits && focusedTraits.badges.length > 0 && (
                    <div className="text-xs font-medium text-rose-700">
                      {focusedTraits.badges.join(" · ")}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleSave(focusedProduct.id)}
                    className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                      isFocusedSaved
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${isFocusedSaved ? "fill-rose-600 text-rose-600" : ""}`}
                    />
                    <span>{isFocusedSaved ? "Đã lưu" : "Lưu"}</span>
                  </button>

                  {focusedShopLinks && (
                    <a
                      href={focusedShopLinks.shopeeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                      <span>Tìm trên Shopee</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Quick Search + Budget Filter to Pick ANY Lipstick from the Catalog */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-zinc-700">
                  {compareTwoMode
                    ? `Chọn nhanh màu bất kỳ cho Màu ${activeSlot}`
                    : "Chọn màu son thử lên môi"}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllCatalog((v) => !v)}
                  className="text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap cursor-pointer"
                >
                  {showAllCatalog
                    ? "Thu gọn gợi ý"
                    : `Xem tất cả (${availableLipsticks.length} màu)`}
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={shadeQuery}
                    onChange={(e) => setShadeQuery(e.target.value)}
                    placeholder="Tìm Romand, Black Rouge, 3CE, MAC..."
                    aria-label="Tìm màu son để thử"
                    className="w-full min-h-[36px] pl-8 pr-8 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 focus:bg-white text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
                  />
                  {shadeQuery && (
                    <button
                      type="button"
                      onClick={() => setShadeQuery("")}
                      aria-label="Xóa từ khóa tìm son"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1 shrink-0">
                  {BUDGET_FILTERS.map((b) => {
                    const active = budgetFilter === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBudgetFilter(b.id)}
                        className={`min-h-[36px] px-2 rounded-xl text-[11px] font-medium whitespace-nowrap border transition-colors cursor-pointer ${
                          active
                            ? "bg-rose-700 text-white border-rose-700 font-semibold"
                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shade Dots Grid (scrollable when viewing full catalog) */}
              {displayedShades.length === 0 ? (
                <div className="py-5 text-center text-xs text-zinc-500">
                  Không tìm thấy màu son khớp bộ lọc — thử xóa từ khóa hoặc chọn &ldquo;Mọi giá&rdquo;.
                </div>
              ) : (
                <div
                  className={`${
                    showAllCatalog || shadeQuery || budgetFilter !== "all"
                      ? "grid grid-cols-4 sm:grid-cols-6 gap-x-2 gap-y-3 max-h-[240px] overflow-y-auto pr-1 py-1"
                      : "flex lg:flex-wrap items-start gap-3 overflow-x-auto no-scrollbar py-1 -mx-1 px-1 snap-x"
                  }`}
                  role="listbox"
                  aria-label="Danh sách màu son để chọn thử"
                >
                  {displayedShades.map((item) => {
                    const isSlotA = productA?.id === item.id;
                    const isSlotB = compareTwoMode && productB?.id === item.id;
                    const isHighlighted = compareTwoMode
                      ? activeSlot === "A"
                        ? isSlotA
                        : isSlotB
                      : isSlotA;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => handleSelectShade(item)}
                        className="group flex flex-col items-center gap-1.5 shrink-0 snap-start w-[68px] mx-auto cursor-pointer"
                      >
                        <span
                          className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-transform ${
                            isHighlighted
                              ? "ring-2 ring-zinc-900 ring-offset-2 scale-105"
                              : isSlotA || isSlotB
                                ? "ring-2 ring-rose-500 ring-offset-1"
                                : "ring-1 ring-black/10 group-hover:scale-105"
                          }`}
                          style={{ backgroundColor: item.renderedHex ?? item.hex }}
                        >
                          {compareTwoMode && (isSlotA || isSlotB) && (
                            <span className="text-[10px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded-full">
                              {isSlotA ? "A" : "B"}
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[10px] text-zinc-400 truncate w-full text-center leading-none`}
                        >
                          {item.brand}
                        </span>
                        <span
                          className={`text-[11px] leading-tight text-center line-clamp-2 w-full ${
                            isHighlighted ? "font-semibold text-zinc-900" : "text-zinc-600"
                          }`}
                        >
                          {item.shade}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Finish & Layering Preset Controls (Clean Buttons — No Finicky Sliders) */}
            <div className="pt-3 border-t border-zinc-100 space-y-3.5">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-700">Chất son</div>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1">
                  {FINISH_OPTIONS.map((tex) => (
                    <button
                      key={tex.id}
                      type="button"
                      onClick={() => {
                        setCustomTexture(tex.id);
                        setThicknessOverride(null);
                        setCompareBare(false);
                      }}
                      className={`min-h-[38px] sm:min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                        effectiveTexture === tex.id
                          ? "bg-zinc-900 text-white border-zinc-900"
                          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      {tex.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-700">Cách đánh son</div>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 rounded-xl">
                  {INTENSITY_PRESETS.map((preset) => {
                    const active =
                      !isBareActive && Math.abs(effectiveThickness - preset.thickness) < 0.25;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setThicknessOverride(preset.thickness);
                          setCompareBare(false);
                        }}
                        className={`min-h-[36px] sm:min-h-[32px] px-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? "bg-white text-zinc-900 shadow-xs font-semibold"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-Side Buying Decision Matrix (Compare Mode) OR Layering Breakdown (Single Mode) */}
          {compareTwoMode && productA && productB ? (
            <div
              data-testid="compare-decision-table"
              className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-zinc-900">
                  So sánh nhanh để dễ chốt đơn
                </h2>
                <span className="text-xs text-zinc-500">
                  {simA.matchPercent > simB.matchPercent
                    ? "Màu A hợp tông da hơn"
                    : simB.matchPercent > simA.matchPercent
                      ? "Màu B hợp tông da hơn"
                      : "Cả hai đều rất hợp da"}
                </span>
              </div>

              <div className="divide-y divide-zinc-100 text-xs">
                <div className="py-2 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Độ hợp da</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      simA.matchPercent >= simB.matchPercent ? "text-emerald-700" : "text-zinc-700"
                    }`}
                  >
                    A: {simA.matchPercent}%
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${
                      simB.matchPercent >= simA.matchPercent ? "text-emerald-700" : "text-zinc-700"
                    }`}
                  >
                    B: {simB.matchPercent}%
                  </span>
                </div>

                <div className="py-2 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Giá tham chiếu</span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {priceA?.priceRangeLabel}
                  </span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {priceB?.priceRangeLabel}
                  </span>
                </div>

                <div className="py-2 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Hợp mặt mộc</span>
                  <span className="text-zinc-800">
                    {traitsA?.bareFaceFriendly ? "Có · Dễ dùng đi học" : "Nên kèm nền nhẹ"}
                  </span>
                  <span className="text-zinc-800">
                    {traitsB?.bareFaceFriendly ? "Có · Dễ dùng đi học" : "Nên kèm nền nhẹ"}
                  </span>
                </div>

                <div className="py-2 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Hiệu ứng răng</span>
                  <span className="text-zinc-800">
                    {traitsA?.teethBrightening ? "Sáng răng" : "Tự nhiên"}
                  </span>
                  <span className="text-zinc-800">
                    {traitsB?.teethBrightening ? "Sáng răng" : "Tự nhiên"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                <div className="rounded-xl overflow-hidden border border-zinc-200">
                  <div
                    className="h-14 sm:h-16"
                    style={{ backgroundColor: report.lipMetrics.lipBaseHex }}
                  />
                  <div className="p-2.5 bg-white">
                    <div className="text-[11px] text-zinc-500">Môi mộc</div>
                    <div className="text-xs font-semibold text-zinc-900 truncate mt-0.5">
                      Nền môi bạn
                    </div>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-zinc-200">
                  <div className="h-14 sm:h-16" style={{ backgroundColor: focusedSim.productHex }} />
                  <div className="p-2.5 bg-white">
                    <div className="text-[11px] text-zinc-500">Màu trên thỏi</div>
                    <div className="text-xs font-semibold text-zinc-900 truncate mt-0.5">
                      {focusedProduct ? focusedProduct.shade : "Màu gợi ý"}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden border-2 border-zinc-900">
                  <div
                    className="h-14 sm:h-16"
                    style={{ backgroundColor: focusedSim.renderedHex }}
                  />
                  <div className="p-2.5 bg-zinc-50">
                    <div className="text-[11px] font-semibold text-zinc-900">Lên môi thật</div>
                    <div className="text-xs font-semibold text-emerald-700 tabular-nums mt-0.5">
                      {focusedSim.matchPercent}% hợp da
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 space-y-2">
                <div className="text-xs font-semibold text-zinc-900">
                  Xem màu theo từng lớp thoa
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {focusedSim.layerSteps.map((step) => {
                    const isActive =
                      step.thickness === 0
                        ? isBareActive
                        : !isBareActive && Math.abs(effectiveThickness - step.thickness) < 0.25;
                    return (
                      <button
                        key={step.label}
                        type="button"
                        onClick={() => {
                          if (step.thickness === 0) {
                            setCompareBare(true);
                          } else {
                            setCompareBare(false);
                            setThicknessOverride(step.thickness);
                          }
                        }}
                        className="group text-left space-y-1 cursor-pointer"
                      >
                        <div
                          className={`h-8 rounded-lg transition-all ${
                            isActive
                              ? "ring-2 ring-zinc-900 ring-offset-1"
                              : "ring-1 ring-black/8 group-hover:scale-[1.02]"
                          }`}
                          style={{ backgroundColor: step.hex }}
                        />
                        <div
                          className={`text-[11px] text-center ${
                            isActive ? "font-semibold text-zinc-900" : "text-zinc-500"
                          }`}
                        >
                          {step.label}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 space-y-1 text-xs">
                <div className="font-semibold text-zinc-900">{matchVerdict}</div>
                <p className="text-zinc-600 leading-relaxed">
                  {report.lipMetrics.coverageRequirement}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
