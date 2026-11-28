import React, { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Columns2,
  Download,
  ExternalLink,
  Eye,
  Heart,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { hexToLab, hexToRgb, rgbToHex, rgbToLab } from "../lib/beauty/bradfordCat";
import { evaluateHonestMakeupAudit } from "../lib/beauty/honestMakeupAudit";
import { DEFAULT_KS, TEXTURE_KS_MAP, kubelkaMunkLipBlend } from "../lib/beauty/kubelkaMunk";
import {
  buildCompareBuyingVerdict,
  resolveComparePairMeta,
  resolveCompareSlotSelection,
  type ComparePairMode,
  type CompareSlot,
  type TryOnMode,
} from "../lib/beauty/lipCompareState";
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
import { HonestMakeupVerdictCard } from "./HonestMakeupVerdictCard";
import { LipCompareSliderPortrait, type SliderSideSpec } from "./LipCompareSliderPortrait";
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

  // 3 clean Try-On modes: Single Try-On | Bare vs Lip Slider | 2-Shade Comparison Slider
  const [tryOnMode, setTryOnMode] = useState<TryOnMode>("single");
  const [compareLayout, setCompareLayout] = useState<"slider" | "side_by_side">("slider");
  const [comparePairMode, setComparePairMode] = useState<ComparePairMode>("a_vs_b");
  const [compareSplitPct, setCompareSplitPct] = useState(50);
  const [bareSplitPct, setBareSplitPct] = useState(50);
  const [activeSlot, setActiveSlot] = useState<CompareSlot>("A");
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

  const isCompareTwo = tryOnMode === "compare_two";
  const isBareVsLip = tryOnMode === "bare_vs_lip";

  const focusedProduct = isCompareTwo && activeSlot === "B" ? productB : productA;

  const [customTexture, setCustomTexture] = useState<string | null>(null);
  const [thicknessOverride, setThicknessOverride] = useState<number | null>(null);
  const [blushIntensity, setBlushIntensity] = useState<number>(0.28);
  const [makeupCompareLipOn, setMakeupCompareLipOn] = useState<boolean>(true);
  const [compareBare, setCompareBare] = useState(false);
  const [holdingBare, setHoldingBare] = useState(false);
  const [zoomToLips, setZoomToLips] = useState(false);

  const effectiveTexture = customTexture ?? focusedProduct?.texture ?? "Juicy Tint";
  const ksDefaults = TEXTURE_KS_MAP[effectiveTexture] ?? DEFAULT_KS;
  const effectiveThickness = thicknessOverride ?? ksDefaults.thickness;

  const isBareSingleActive = tryOnMode === "single" && (compareBare || holdingBare);
  const activeBlush =
    availableBlushes.find((b) => b.id === selectedBlushId) ?? availableBlushes[0] ?? null;
  const effectiveBlushHex = activeBlush?.hex ?? report.blendedTargets.blush;
  const bestAiLipstick = availableLipsticks[0] ?? null;
  const bestAiBlush = availableBlushes[0] ?? null;

  // Filtered list of lipsticks so user can quickly pick ANY shade in the catalog
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
      { label: "Không son", thickness: 0 },
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
        !isCompareTwo || activeSlot === "A" ? effectiveTexture : productA?.texture
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productA, report.blendedTargets.lip, report.lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness, isCompareTwo, activeSlot]
  );

  const simB = useMemo(
    () =>
      simulateForProduct(
        productB,
        isCompareTwo && activeSlot === "B" ? effectiveTexture : productB?.texture
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [productB, report.blendedTargets.lip, report.lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness, isCompareTwo, activeSlot]
  );

  const focusedSim = isCompareTwo && activeSlot === "B" ? simB : simA;

  const virtualMakeupBare: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: false,
      lipHex: report.lipMetrics.lipBaseHex,
      lipTexture: "Dewy Balm",
      lipThickness: 0,
      blushEnabled: false,
      blushHex: effectiveBlushHex,
      blushIntensity: 0,
      faceShape: report.faceShape.primary,
    }),
    [report.lipMetrics.lipBaseHex, effectiveBlushHex, report.faceShape.primary]
  );

  const virtualMakeupA: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: !isBareSingleActive,
      lipHex: simA.productHex,
      lipTexture:
        !isCompareTwo || activeSlot === "A"
          ? effectiveTexture
          : productA?.texture ?? effectiveTexture,
      lipThickness: effectiveThickness,
      blushEnabled: !isBareSingleActive && blushEnabled,
      blushHex: effectiveBlushHex,
      blushIntensity,
      faceShape: report.faceShape.primary,
    }),
    [
      isBareSingleActive,
      simA.productHex,
      isCompareTwo,
      activeSlot,
      effectiveTexture,
      productA?.texture,
      effectiveThickness,
      blushEnabled,
      effectiveBlushHex,
      blushIntensity,
      report.faceShape.primary,
    ]
  );

  const virtualMakeupAWithLip: VirtualMakeupOptions = useMemo(
    () => ({
      ...virtualMakeupA,
      lipEnabled: true,
      blushEnabled,
    }),
    [virtualMakeupA, blushEnabled]
  );

  const virtualMakeupAiCompareAfter: VirtualMakeupOptions = useMemo(
    () => ({
      ...virtualMakeupA,
      lipEnabled: makeupCompareLipOn,
      blushEnabled,
      blushIntensity,
    }),
    [virtualMakeupA, makeupCompareLipOn, blushEnabled, blushIntensity]
  );

  const virtualMakeupB: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: true,
      lipHex: simB.productHex,
      lipTexture:
        isCompareTwo && activeSlot === "B"
          ? effectiveTexture
          : productB?.texture ?? effectiveTexture,
      lipThickness: effectiveThickness,
      blushEnabled,
      blushHex: effectiveBlushHex,
      blushIntensity,
      faceShape: report.faceShape.primary,
    }),
    [
      simB.productHex,
      isCompareTwo,
      activeSlot,
      effectiveTexture,
      productB?.texture,
      effectiveThickness,
      blushEnabled,
      effectiveBlushHex,
      blushIntensity,
      report.faceShape.primary,
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

  const focusedPrice = isCompareTwo && activeSlot === "B" ? priceB : priceA;
  const focusedTraits = isCompareTwo && activeSlot === "B" ? traitsB : traitsA;
  const focusedShopLinks = isCompareTwo && activeSlot === "B" ? shopLinksB : shopLinksA;
  const isFocusedSaved = focusedProduct ? savedIds.has(focusedProduct.id) : false;

  // Scientifically calibrated brutally honest audits (un-floored 0..100, checks undertone, washout, teeth, lip-blush harmony)
  const auditA = useMemo(
    () =>
      evaluateHonestMakeupAudit({
        report,
        lipstick: productA,
        renderedLipHex: simA.renderedHex,
        lipThickness: effectiveThickness,
        blushEnabled,
        blushHex: effectiveBlushHex,
        blushIntensity,
        blushProduct: activeBlush,
      }),
    [report, productA, simA.renderedHex, effectiveThickness, blushEnabled, effectiveBlushHex, blushIntensity, activeBlush]
  );

  const auditB = useMemo(
    () =>
      evaluateHonestMakeupAudit({
        report,
        lipstick: productB,
        renderedLipHex: simB.renderedHex,
        lipThickness: effectiveThickness,
        blushEnabled,
        blushHex: effectiveBlushHex,
        blushIntensity,
        blushProduct: activeBlush,
      }),
    [report, productB, simB.renderedHex, effectiveThickness, blushEnabled, effectiveBlushHex, blushIntensity, activeBlush]
  );

  const focusedAudit = isCompareTwo && activeSlot === "B" ? auditB : auditA;

  const scoreToneClass = (score: number) =>
    score >= 82 ? "text-emerald-700" : score >= 65 ? "text-amber-700" : "text-rose-700";
  const scrimScoreToneClass = (score: number) =>
    score >= 82 ? "text-emerald-300" : score >= 65 ? "text-amber-300" : "text-rose-300";

  const compareVerdict = useMemo(() => {
    if (!productA || !productB) return null;
    return buildCompareBuyingVerdict({
      productA,
      productB,
      matchPercentA: auditA.overallScore,
      matchPercentB: auditB.overallScore,
      priceA,
      priceB,
      traitsA,
      traitsB,
    });
  }, [productA, productB, auditA.overallScore, auditB.overallScore, priceA, priceB, traitsA, traitsB]);

  const handleApplyBestAiPair = () => {
    if (bestAiLipstick) {
      onSelectLipstick(bestAiLipstick);
      setCustomTexture(null);
      setThicknessOverride(null);
    }
    if (bestAiBlush) {
      onSelectBlushId(bestAiBlush.id);
    }
    onBlushEnabledChange(true);
    setMakeupCompareLipOn(true);
    setBlushIntensity(0.26);
    setCompareBare(false);
    setShadeQuery("");
    setBudgetFilter("all");
    onNotify?.("Đã áp dụng cặp Son + Phấn má AI hợp tông da nhất");
  };

  const handleSwitchMode = (nextMode: TryOnMode) => {
    setTryOnMode(nextMode);
    if (nextMode === "single") {
      setActiveSlot("A");
    } else if (nextMode === "bare_vs_lip") {
      setActiveSlot("A");
      setCompareBare(false);
      setMakeupCompareLipOn(true);
      // Entering 'So sánh Makeup' automatically activates AI blush + lipstick so before/after shows both!
      if (!blushEnabled) {
        onBlushEnabledChange(true);
      }
      if (selectedBlushId === null && bestAiBlush) {
        onSelectBlushId(bestAiBlush.id);
      }
    } else if (nextMode === "compare_two") {
      setCompareBare(false);
      // Focus slot B so the user can immediately tap any 2nd shade to compare with their current shade A
      setActiveSlot("B");
    }
  };

  const handleSelectShade = (item: MatchedProduct) => {
    if (isCompareTwo) {
      const resolved = resolveCompareSlotSelection({
        slot: activeSlot,
        pickedId: item.id,
        currentAId: productA?.id ?? null,
        currentBId: productB?.id ?? null,
      });

      if (resolved.nextAId !== null && resolved.nextAId !== productA?.id) {
        const nextA = availableLipsticks.find((p) => p.id === resolved.nextAId);
        if (nextA) onSelectLipstick(nextA);
      }
      if (resolved.nextBId !== null) {
        setSecondShadeId(resolved.nextBId);
      }
      if (resolved.swapped) {
        onNotify?.("Đã đổi vị trí Màu A và Màu B");
      }
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

  const bareLeftSpec: SliderSideSpec | null = productA
    ? {
        prefix: "Mặt mộc",
        label: "",
        footerCaption: "Trước · Mặt mộc",
        swatchHex: report.lipMetrics.lipBaseHex,
        makeup: virtualMakeupBare,
      }
    : null;

  const bareRightSpec: SliderSideSpec | null = productA
    ? {
        prefix:
          makeupCompareLipOn && blushEnabled
            ? "Makeup AI"
            : makeupCompareLipOn
              ? "Chỉ son"
              : blushEnabled
                ? "Chỉ má"
                : "Mặt mộc",
        label:
          makeupCompareLipOn && blushEnabled
            ? "Son + Má"
            : makeupCompareLipOn
              ? productA.shade
              : activeBlush?.shade ?? "",
        footerCaption:
          makeupCompareLipOn && blushEnabled
            ? "Sau · Son + Má AI"
            : makeupCompareLipOn
              ? `Sau · Son ${productA.brand}`
              : blushEnabled
                ? `Sau · Má ${activeBlush?.brand ?? "AI"}`
                : "Chưa bật makeup",
        swatchHex: makeupCompareLipOn ? simA.renderedHex : effectiveBlushHex,
        makeup: virtualMakeupAiCompareAfter,
        isSelected: true,
      }
    : null;

  const compareLeftSpec: SliderSideSpec | null = productA
    ? {
        prefix: "A",
        label: productA.shade,
        footerCaption: `A · ${productA.brand}`,
        swatchHex: simA.renderedHex,
        makeup: virtualMakeupAWithLip,
        isSelected: activeSlot === "A",
        onSelect: () => setActiveSlot("A"),
      }
    : null;

  const compareRightSpec: SliderSideSpec | null = productB
    ? {
        prefix: "B",
        label: productB.shade,
        footerCaption: `B · ${productB.brand}`,
        swatchHex: simB.renderedHex,
        makeup: virtualMakeupB,
        isSelected: activeSlot === "B",
        onSelect: () => setActiveSlot("B"),
      }
    : null;

  const comparePairMeta = resolveComparePairMeta(comparePairMode);
  const activeCompareLeftSpec =
    comparePairMeta.leftKind === "bare" ? bareLeftSpec : compareLeftSpec;
  const activeCompareRightSpec =
    comparePairMeta.rightKind === "A" ? compareLeftSpec : compareRightSpec;

  /**
   * Exports a clean PNG collage matching the active mode (single look, bare vs lip, or 2 shades)
   * so students can save or send it to friends to decide which shade to buy.
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

      if (isCompareTwo && productA && productB) {
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
          virtualMakeupAWithLip
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
      } else if (isBareVsLip && productA) {
        const gap = 8;
        out.width = report.width * 2 + gap;
        out.height = report.height + footerH;
        const ctx = out.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, out.width, out.height);

        const rgbaLip = applyVirtualMakeupToRgba(
          report.correctedRgba,
          report.width,
          report.height,
          report.neuralLandmarks,
          report.skinMask,
          faceBox,
          virtualMakeupAiCompareAfter
        );
        ctx.drawImage(renderRgbaToCanvas(report.correctedRgba), 0, 0);
        ctx.drawImage(renderRgbaToCanvas(rgbaLip), report.width + gap, 0);

        ctx.fillStyle = "#18181b";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.fillText("Trước · Mặt mộc", 12, report.height + 26);
        ctx.fillStyle = "#52525b";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("Chưa thoa son & phấn má", 12, report.height + 48);

        ctx.fillStyle = "#18181b";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.fillText(
          blushEnabled ? `Sau Makeup AI: ${productA.brand} + Má` : `Sau: ${productA.brand}`,
          report.width + gap + 12,
          report.height + 26
        );
        ctx.fillStyle = "#52525b";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(
          `${productA.shade} · ${auditA.overallScore}/100 (${auditA.verdictTagVi})`,
          report.width + gap + 12,
          report.height + 48
        );
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
          `${productA.shade} · ${priceA?.priceRangeLabel ?? ""} · ${auditA.overallScore}/100 (${auditA.verdictTagVi})`,
          12,
          report.height + 48
        );
      } else {
        return;
      }

      const dataUrl = out.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = isCompareTwo
        ? "so-sanh-2-mau-son.png"
        : isBareVsLip
          ? "so-sanh-makeup-ai.png"
          : "thu-mau-son.png";
      a.click();
      onNotify?.(
        isCompareTwo
          ? "Đã lưu ảnh so sánh 2 màu son"
          : isBareVsLip
            ? "Đã lưu ảnh không son / có son"
            : "Đã lưu ảnh thử son"
      );
    } catch {
      onNotify?.("Không thể xuất ảnh trên trình duyệt này");
    }
  };

  return (
    <div className="space-y-5 pb-10 md:pb-4">
      {/* Refined Top Mode Bar: 3 Crisp Modes + Save Look Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Chế độ thử son"
          className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-0.5 bg-[#EFEFEF] rounded-[4px] w-full sm:w-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tryOnMode === "single"}
            data-testid="tryon-mode-single"
            onClick={() => handleSwitchMode("single")}
            className={`min-h-[36px] px-2 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-[3px] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              tryOnMode === "single"
                ? "bg-white text-[#111111] shadow-2xs font-semibold"
                : "text-[#666666] hover:text-[#111111]"
            }`}
          >
            <Sparkles className="hidden sm:inline-block w-3.5 h-3.5 shrink-0" />
            <span>Thử 1 màu</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={isBareVsLip}
            data-testid="makeup-compare-tab"
            onClick={() => handleSwitchMode("bare_vs_lip")}
            className={`min-h-[36px] px-1.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-[3px] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              isBareVsLip
                ? "bg-white text-[#111111] shadow-2xs font-semibold"
                : "text-[#666666] hover:text-[#111111]"
            }`}
          >
            <SlidersHorizontal className="hidden sm:inline-block w-3.5 h-3.5 shrink-0" />
            <span>So sánh Makeup</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={isCompareTwo}
            data-testid="compare-two-shades-tab"
            onClick={() => handleSwitchMode("compare_two")}
            className={`min-h-[36px] px-2 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-medium rounded-[3px] inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              isCompareTwo
                ? "bg-white text-[#111111] shadow-2xs font-semibold"
                : "text-[#666666] hover:text-[#111111]"
            }`}
          >
            <Columns2 className="hidden sm:inline-block w-3.5 h-3.5 shrink-0" />
            <span>So 2 màu son</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveLookPng}
          className="hidden sm:inline-flex min-h-[36px] px-3.5 py-1.5 rounded-[4px] border border-[#D4D4D4] bg-white hover:border-[#111111] text-xs font-semibold text-[#111111] items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Lưu ảnh hỏi bạn</span>
        </button>
      </div>

      <p className="text-[11px] text-[#737373] leading-relaxed -mt-2">
        Màu son và má được pha theo màu môi thật trong ảnh — ngoài đời có thể khác nhẹ tùy ánh sáng và số lớp thoa.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-8 items-start">
        {/* Left: Sticky Portrait Mirror Studio (Tablet & Desktop) */}
        <div className="md:col-span-5 md:sticky md:top-20 space-y-3">
          {isCompareTwo &&
          productA &&
          productB &&
          activeCompareLeftSpec &&
          activeCompareRightSpec ? (
            <>
              {compareLayout === "slider" ? (
                <LipCompareSliderPortrait
                  report={report}
                  box={faceBox}
                  leftSide={activeCompareLeftSpec}
                  rightSide={activeCompareRightSpec}
                  zoomToLips={zoomToLips}
                  splitPct={compareSplitPct}
                  onSplitPctChange={setCompareSplitPct}
                  ariaLabel={comparePairMeta.ariaLabel}
                  hintText={comparePairMeta.hintText}
                  testId="lip-compare-slider"
                />
              ) : (
                <div
                  data-testid="compare-two-shades-grid"
                  className="grid grid-cols-2 gap-2.5"
                >
                  {(
                    [
                      {
                        slot: "A" as const,
                        product: productA,
                        makeup: virtualMakeupAWithLip,
                        price: priceA,
                        traits: traitsA,
                        sim: simA,
                        audit: auditA,
                        links: shopLinksA,
                      },
                      {
                        slot: "B" as const,
                        product: productB,
                        makeup: virtualMakeupB,
                        price: priceB,
                        traits: traitsB,
                        sim: simB,
                        audit: auditB,
                        links: shopLinksB,
                      },
                    ] as const
                  ).map(({ slot, product, makeup, price, traits, sim, audit, links }) => {
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
                        className={`rounded-2xl overflow-hidden bg-white border transition-all cursor-pointer flex flex-col justify-between ${
                          isSelectedSlot
                            ? "border-zinc-900 ring-1 ring-zinc-900"
                            : "border-zinc-200/90 hover:border-zinc-400"
                        }`}
                      >
                        <div>
                          <div className="relative h-[230px] sm:h-[290px] bg-zinc-950">
                            <span
                              className={`absolute top-2.5 left-2.5 z-10 px-2.5 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-md ${
                                isSelectedSlot
                                  ? "bg-white text-zinc-950"
                                  : "bg-zinc-950/65 text-white"
                              }`}
                            >
                              Màu {slot} {isSelectedSlot ? "· Đang chọn" : ""}
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
                          <div className="p-3 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
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
                              <span className={`font-semibold ${scoreToneClass(audit.overallScore)}`}>
                                {audit.overallScore}/100 · {audit.verdictTagVi}
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
                          <div className="px-3 pb-3">
                            <a
                              href={links.shopeeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="w-full min-h-[34px] px-2.5 py-1 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors"
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

              {/* Unified Studio Control Strip for Compare 2 Shades */}
              <div className="bg-white rounded-2xl border border-zinc-200/85 overflow-hidden">
                <div className="px-2.5 sm:px-3 py-2 flex items-center justify-between gap-2">
                  <div className="inline-grid grid-cols-2 gap-0.5 p-0.5 bg-zinc-100 rounded-xl shrink-0">
                    <button
                      type="button"
                      data-testid="compare-layout-slider"
                      onClick={() => setCompareLayout("slider")}
                      className={`min-h-[32px] px-2 sm:px-2.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        compareLayout === "slider"
                          ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      Thanh trượt
                    </button>
                    <button
                      type="button"
                      data-testid="compare-layout-side-by-side"
                      onClick={() => setCompareLayout("side_by_side")}
                      className={`min-h-[32px] px-2 sm:px-2.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        compareLayout === "side_by_side"
                          ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      2 ảnh
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 sm:gap-3 text-[11px] sm:text-xs">
                    <button
                      type="button"
                      onClick={handleSwapAB}
                      className="min-h-[32px] font-medium text-zinc-700 hover:text-zinc-950 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      <span>Đổi A⇄B</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomToLips((v) => !v)}
                      className="min-h-[32px] font-semibold text-rose-700 hover:text-rose-800 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      {zoomToLips ? (
                        <ZoomOut className="w-3.5 h-3.5" />
                      ) : (
                        <ZoomIn className="w-3.5 h-3.5" />
                      )}
                      <span>{zoomToLips ? "Toàn mặt" : "Phóng môi"}</span>
                    </button>
                  </div>
                </div>

                {/* Quick 3-way slider pair toggle: A vs B OR Bare (Không son) vs A / B */}
                {compareLayout === "slider" && (
                  <div className="px-2.5 sm:px-3 py-2 border-t border-zinc-100 bg-zinc-50/60">
                    <div
                      role="group"
                      aria-label="Chọn cặp so sánh trên thanh trượt"
                      className="grid grid-cols-3 gap-1 p-0.5 bg-zinc-200/65 rounded-xl"
                    >
                      {(
                        [
                          { id: "a_vs_b", label: "Màu A ↔ B", testId: "compare-pair-ab" },
                          { id: "bare_vs_a", label: "Không son ↔ A", testId: "compare-pair-bare-a" },
                          { id: "bare_vs_b", label: "Không son ↔ B", testId: "compare-pair-bare-b" },
                        ] as const
                      ).map((opt) => {
                        const active = comparePairMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            data-testid={opt.testId}
                            aria-pressed={active}
                            onClick={() => setComparePairMode(opt.id)}
                            className={`min-h-[32px] px-2 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                              active
                                ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                                : "text-zinc-600 hover:text-zinc-900"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Hairline A vs B Summary Row (in Slider layout) */}
                {compareLayout === "slider" && (
                  <div className="grid grid-cols-2 divide-x divide-zinc-100 border-t border-zinc-100">
                    {(
                      [
                        {
                          slot: "A" as const,
                          sideLabel: "Trái",
                          product: productA,
                          price: priceA,
                          sim: simA,
                          audit: auditA,
                          links: shopLinksA,
                        },
                        {
                          slot: "B" as const,
                          sideLabel: "Phải",
                          product: productB,
                          price: priceB,
                          sim: simB,
                          audit: auditB,
                          links: shopLinksB,
                        },
                      ] as const
                    ).map(({ slot, sideLabel, product, price, sim, audit, links }) => {
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
                          className={`p-3 space-y-2 transition-colors cursor-pointer ${
                            isSelectedSlot ? "bg-zinc-50/90" : "bg-white hover:bg-zinc-50/50"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <span
                                className={`font-semibold ${
                                  isSelectedSlot ? "text-zinc-950" : "text-zinc-500"
                                }`}
                              >
                                Màu {slot} · {sideLabel}
                              </span>
                              <span className={`font-semibold tabular-nums ${scoreToneClass(audit.overallScore)}`}>
                                {audit.overallScore}/100
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-3 h-3 rounded-full ring-1 ring-black/15 shrink-0"
                                style={{ backgroundColor: sim.renderedHex }}
                              />
                              <span className="text-xs font-semibold text-zinc-900 truncate">
                                {product.shade}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate tabular-nums">
                              {product.brand} · {price?.priceRangeLabel}
                            </div>
                          </div>

                          {links && (
                            <a
                              href={links.shopeeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`w-full min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors ${
                                isSelectedSlot
                                  ? "bg-zinc-900 text-white hover:bg-zinc-800"
                                  : "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                              }`}
                            >
                              <span>Mua Màu {slot}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : isBareVsLip && productA && bareLeftSpec && bareRightSpec ? (
            <>
              <LipCompareSliderPortrait
                report={report}
                box={faceBox}
                leftSide={bareLeftSpec}
                rightSide={bareRightSpec}
                zoomToLips={zoomToLips}
                splitPct={bareSplitPct}
                onSplitPctChange={setBareSplitPct}
                ariaLabel="Thanh trượt so sánh khuôn mặt trước và sau khi áp dụng son môi và phấn má gợi ý từ AI"
                hintText="Kéo so trước · sau makeup"
                testId="makeup-compare-slider"
              />

              {/* Dedicated 'So sánh Makeup' Studio Control Strip */}
              <div
                data-testid="makeup-compare-controls"
                className="bg-white border border-[#E5E5E5] overflow-hidden"
              >
                <div className="px-2 sm:px-3 py-2 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
                  <div className="inline-grid grid-cols-3 gap-0.5 p-0.5 bg-[#EFEFEF] rounded-[4px] shrink-0">
                    {[
                      { label: "Mặt mộc", pct: 100 },
                      { label: "50/50", pct: 50 },
                      { label: "Có makeup", pct: 0 },
                    ].map((snap) => {
                      const active = Math.abs(bareSplitPct - snap.pct) <= 8;
                      return (
                        <button
                          key={snap.label}
                          type="button"
                          onClick={() => setBareSplitPct(snap.pct)}
                          className={`min-h-[32px] px-1.5 sm:px-2.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                            active
                              ? "bg-white text-zinc-950 shadow-2xs font-semibold"
                              : "text-zinc-600 hover:text-zinc-900"
                          }`}
                        >
                          {snap.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setZoomToLips((v) => !v)}
                    className="min-h-[32px] px-1 text-[11px] sm:text-xs font-semibold text-zinc-900 hover:text-rose-700 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {zoomToLips ? (
                      <ZoomOut className="w-3.5 h-3.5" />
                    ) : (
                      <ZoomIn className="w-3.5 h-3.5" />
                    )}
                    <span>{zoomToLips ? "Toàn mặt" : "Phóng môi"}</span>
                  </button>
                </div>

                {/* Independent AI Lip + Blush Layer Toggles & Blush Strength */}
                <div className="px-3 py-2 border-t border-zinc-100 bg-zinc-50/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="makeup-compare-toggle-lip"
                      aria-pressed={makeupCompareLipOn}
                      onClick={() => setMakeupCompareLipOn((v) => !v)}
                      className={`min-h-[30px] px-2.5 rounded-lg border font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        makeupCompareLipOn
                          ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
                          : "bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900"
                      }`}
                    >
                      {makeupCompareLipOn ? "Son: Bật" : "Son: Tắt"}
                    </button>
                    <button
                      type="button"
                      data-testid="makeup-compare-toggle-blush"
                      aria-pressed={blushEnabled}
                      onClick={() => onBlushEnabledChange(!blushEnabled)}
                      className={`min-h-[30px] px-2.5 rounded-lg border font-medium whitespace-nowrap transition-colors cursor-pointer ${
                        blushEnabled
                          ? "bg-rose-600 text-white border-rose-600 font-semibold"
                          : "bg-white text-zinc-600 border-zinc-200 hover:text-zinc-900"
                      }`}
                    >
                      {blushEnabled ? "Má hồng: Bật" : "Má hồng: Tắt"}
                    </button>
                  </div>

                  {blushEnabled ? (
                    <div
                      role="group"
                      aria-label="Độ đậm phấn má"
                      className="inline-flex items-center gap-0.5 p-0.5 bg-zinc-200/65 rounded-lg"
                    >
                      {(
                        [
                          { label: "Má nhẹ", val: 0.18 },
                          { label: "Vừa", val: 0.28 },
                          { label: "Rõ nét", val: 0.38 },
                        ] as const
                      ).map((preset) => {
                        const active = Math.abs(blushIntensity - preset.val) < 0.04;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => setBlushIntensity(preset.val)}
                            className={`min-h-[26px] px-2 rounded-md text-[11px] whitespace-nowrap transition-colors cursor-pointer ${
                              active
                                ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                                : "text-zinc-600 hover:text-zinc-900 font-medium"
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleApplyBestAiPair}
                      className="min-h-[30px] text-[11px] font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap cursor-pointer"
                    >
                      Bật lại cặp AI gợi ý
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="w-full bg-[#F5F5F5] sm:py-4 md:p-0 md:bg-[#111111] border border-[#E5E5E5] overflow-hidden">
              <div
                className="relative bg-[#111111] overflow-hidden aspect-[4/5] w-full max-w-[460px] mx-auto md:max-w-none sm:border sm:border-[#E5E5E5] md:border-0 select-none"
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
                    className={`pointer-events-auto min-h-[32px] px-3 py-1 rounded-[3px] text-[11px] font-semibold backdrop-blur-md border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                      isBareSingleActive
                        ? "bg-white text-[#111111] border-white shadow-sm"
                        : "bg-[#111111]/75 text-white border-white/15 hover:bg-[#111111]"
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{isBareSingleActive ? "Không son" : "Xem không son"}</span>
                  </button>

                  <div className="pointer-events-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-pressed={zoomToLips}
                      aria-label={zoomToLips ? "Thu nhỏ toàn mặt" : "Phóng to vùng môi"}
                      onClick={() => setZoomToLips((v) => !v)}
                      className={`min-h-[32px] min-w-[32px] px-2 py-1 rounded-[3px] text-[11px] font-medium backdrop-blur-md border inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
                        zoomToLips
                          ? "bg-white text-[#111111] border-white shadow-sm"
                          : "bg-[#111111]/75 text-white border-white/15 hover:bg-[#111111]"
                      }`}
                    >
                      {zoomToLips ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      aria-pressed={blushEnabled}
                      onClick={() => onBlushEnabledChange(!blushEnabled)}
                      className={`min-h-[32px] px-3 py-1 rounded-[3px] text-[11px] font-semibold backdrop-blur-md border whitespace-nowrap transition-colors cursor-pointer ${
                        blushEnabled
                          ? "bg-[#DC2626] text-white border-[#DC2626]"
                          : "bg-[#111111]/75 text-white border-white/15 hover:bg-[#111111]"
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
                  containerClassName="h-full w-full bg-[#111111]"
                />

                {/* Compact bottom active-shade strip */}
                {productA && (
                  <div className="absolute inset-x-0 bottom-0 pt-12 pb-3.5 px-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] text-white/80 truncate">
                          {productA.brand} · {priceA?.priceRangeLabel}
                          <span className="hidden lg:inline"> · Nhấn giữ ảnh xem không son</span>
                        </div>
                        <div className="text-sm font-bold text-white leading-snug line-clamp-2">
                          {productA.name} — {productA.shade}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-semibold tabular-nums shrink-0 ${
                          isBareSingleActive ? "text-white/85" : scrimScoreToneClass(auditA.overallScore)
                        }`}
                      >
                        {isBareSingleActive ? "Mặt mộc" : `${auditA.overallScore}/100 · ${auditA.verdictTagVi}`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Inline Blush Shade Switcher when Blush overlay is active */}
          {blushEnabled && availableBlushes.length > 0 && (
            <div className="bg-white border border-[#E5E5E5] px-4 py-3 flex items-center justify-between gap-3">
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

        {/* Right: Contiguous Product Studio, Full-Catalog Picker, Finish & Buying Verdict */}
        <div className="md:col-span-7 space-y-5">
          <div className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-6 space-y-5 shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
            {/* Active Slot Selector when in "Chọn so sánh" mode */}
            {isCompareTwo && productA && productB && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-zinc-900">
                    Đang chọn cho {activeSlot === "A" ? "Màu A (bên trái)" : "Màu B (bên phải)"}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Chạm màu bất kỳ bên dưới để đổi
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-2xl">
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
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs inline-flex items-center gap-2 transition-all cursor-pointer min-w-0 ${
                          active
                            ? "bg-white text-zinc-950 font-semibold shadow-xs"
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
              </div>
            )}

            {/* Focused Product Editorial Header + Quick Actions */}
            {focusedProduct && (
              <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3.5 pb-4 border-b border-zinc-100">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-700">{focusedProduct.brand}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-zinc-900 tabular-nums">
                      {focusedPrice?.priceRangeLabel}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`font-semibold tabular-nums ${scoreToneClass(
                        focusedAudit.overallScore
                      )}`}
                    >
                      {focusedAudit.overallScore}/100 · {focusedAudit.verdictTagVi}
                    </span>
                  </div>
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 leading-snug">
                    {focusedProduct.name} — {focusedProduct.shade}
                  </h1>
                  {focusedTraits && focusedTraits.badges.length > 0 && (
                    <div className="text-xs font-medium text-rose-700">
                      {focusedTraits.badges.join(" · ")}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 w-full xl:w-auto">
                  {!isCompareTwo && (
                    <button
                      type="button"
                      data-testid="quick-choose-compare-btn"
                      onClick={() => handleSwitchMode("compare_two")}
                      className="min-h-[38px] px-3 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-semibold text-zinc-900 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                    >
                      <Columns2 className="w-3.5 h-3.5" />
                      <span>So 2 màu</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onToggleSave(focusedProduct.id)}
                    aria-label={isFocusedSaved ? "Bỏ lưu màu son" : "Lưu màu son"}
                    className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                      isFocusedSaved
                        ? "bg-rose-50 border-rose-200 text-rose-700"
                        : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        isFocusedSaved ? "fill-rose-600 text-rose-600" : ""
                      }`}
                    />
                    <span>{isFocusedSaved ? "Đã lưu" : "Lưu"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveLookPng}
                    className="sm:hidden min-h-[38px] px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Lưu ảnh</span>
                  </button>

                  {focusedShopLinks && (
                    <a
                      href={focusedShopLinks.shopeeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                      <span>Tìm Shopee</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Quick Search + Budget Filter to Pick ANY Lipstick from the Catalog */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-zinc-900">
                  {isCompareTwo
                    ? `Chọn màu bất kỳ cho Màu ${activeSlot}`
                    : isBareVsLip
                      ? "Chọn màu son để so với môi mộc"
                      : "Chọn màu son thử lên môi"}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllCatalog((v) => !v)}
                  className="text-xs font-semibold text-rose-700 hover:text-rose-800 whitespace-nowrap cursor-pointer"
                >
                  {showAllCatalog
                    ? "Thu gọn gợi ý"
                    : `Tất cả (${availableLipsticks.length} màu)`}
                </button>
              </div>

              <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={shadeQuery}
                    onChange={(e) => setShadeQuery(e.target.value)}
                    placeholder="Tìm Romand, Black Rouge, 3CE, MAC..."
                    aria-label="Tìm màu son để thử"
                    className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50/70 focus:bg-white text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-400 transition-colors"
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
                        className={`min-h-[38px] px-2.5 rounded-xl text-[11px] font-medium whitespace-nowrap border transition-colors cursor-pointer ${
                          active
                            ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
                            : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tactile Cosmetic Swatch Grid */}
              {displayedShades.length === 0 ? (
                <div className="py-6 text-center text-xs text-zinc-500">
                  Không tìm thấy màu son khớp bộ lọc — thử xóa từ khóa hoặc chọn &ldquo;Mọi giá&rdquo;.
                </div>
              ) : (
                <div
                  className={`${
                    showAllCatalog || shadeQuery || budgetFilter !== "all"
                      ? "grid grid-cols-4 sm:grid-cols-6 gap-x-2 gap-y-3.5 max-h-[248px] overflow-y-auto pr-1 py-1.5"
                      : "flex lg:grid lg:grid-cols-8 items-start gap-3 lg:gap-x-2 lg:gap-y-3.5 overflow-x-auto no-scrollbar py-1.5 -mx-1 px-1 snap-x"
                  }`}
                  role="listbox"
                  aria-label="Danh sách màu son để chọn thử"
                >
                  {displayedShades.map((item) => {
                    const isSlotA = productA?.id === item.id;
                    const isSlotB = isCompareTwo && productB?.id === item.id;
                    const isHighlighted = isCompareTwo
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
                        className="group flex flex-col items-center gap-1.5 shrink-0 snap-start w-[66px] lg:w-full mx-auto cursor-pointer focus:outline-none"
                      >
                        <span
                          className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-transform duration-150 overflow-hidden ${
                            isHighlighted
                              ? "ring-2 ring-zinc-950 ring-offset-2 scale-105"
                              : isSlotA || isSlotB
                                ? "ring-2 ring-rose-500 ring-offset-2"
                                : "ring-1 ring-black/10 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-zinc-900"
                          }`}
                          style={{ backgroundColor: item.renderedHex ?? item.hex }}
                        >
                          {/* Subtle cosmetic gloss specular sheen */}
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-full"
                            style={{
                              background:
                                "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0) 56%)",
                            }}
                          />
                          {isCompareTwo && (isSlotA || isSlotB) && (
                            <span className="relative z-10 text-[10px] font-bold text-white bg-zinc-950/75 px-1.5 py-0.5 rounded-full">
                              {isSlotA ? "A" : "B"}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] text-zinc-400 truncate w-full text-center leading-none">
                          {item.brand}
                        </span>
                        <span
                          className={`text-[11px] leading-tight text-center line-clamp-2 w-full ${
                            isHighlighted ? "font-semibold text-zinc-950" : "text-zinc-600"
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

            {/* Finish & Layering Controls (Clean Hairline Section) */}
            <div className="pt-4 border-t border-zinc-100 space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-800">Chất son</div>
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
                      className={`min-h-[36px] sm:min-h-[34px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                        effectiveTexture === tex.id
                          ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
                          : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      {tex.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-800">Cách đánh son</div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-xl">
                  {INTENSITY_PRESETS.map((preset) => {
                    const active =
                      !isBareSingleActive && Math.abs(effectiveThickness - preset.thickness) < 0.25;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          setThicknessOverride(preset.thickness);
                          setCompareBare(false);
                        }}
                        className={`min-h-[36px] sm:min-h-[32px] px-1 sm:px-2 text-[11px] sm:text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? "bg-white text-zinc-950 shadow-xs font-semibold"
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

          {/* Buying Decision Matrix (Compare 2 Shades) OR Shade Progression Breakdown (Single / Bare-vs-Lip) */}
          {isCompareTwo && productA && productB && compareVerdict ? (
            <div
              data-testid="compare-decision-table"
              className="bg-white rounded-3xl border border-zinc-200/85 p-5 sm:p-6 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
            >
              <div className="space-y-1">
                <h2 className="text-sm sm:text-base font-bold text-zinc-950">
                  {compareVerdict.headlineVi}
                </h2>
                <p className="text-xs text-zinc-600 leading-relaxed">{compareVerdict.sublineVi}</p>
              </div>

              <div className="divide-y divide-zinc-100 text-xs">
                <div className="py-2.5 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Điểm hợp thật</span>
                  <span
                    className={`font-semibold tabular-nums ${scoreToneClass(auditA.overallScore)}`}
                  >
                    A: {auditA.overallScore}/100 ({auditA.verdictTagVi})
                  </span>
                  <span
                    className={`font-semibold tabular-nums ${scoreToneClass(auditB.overallScore)}`}
                  >
                    B: {auditB.overallScore}/100 ({auditB.verdictTagVi})
                  </span>
                </div>

                <div className="py-2.5 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Giá tham chiếu</span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {priceA?.priceRangeLabel}
                  </span>
                  <span className="font-semibold text-zinc-900 tabular-nums">
                    {priceB?.priceRangeLabel}
                  </span>
                </div>

                <div className="py-2.5 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Hợp mặt mộc</span>
                  <span className="text-zinc-800">
                    {traitsA?.bareFaceFriendly ? "Có · Dễ đi học" : "Nên kèm nền nhẹ"}
                  </span>
                  <span className="text-zinc-800">
                    {traitsB?.bareFaceFriendly ? "Có · Dễ đi học" : "Nên kèm nền nhẹ"}
                  </span>
                </div>

                <div className="py-2.5 grid grid-cols-3 gap-2 items-center">
                  <span className="text-zinc-500">Hiệu ứng răng</span>
                  <span className="text-zinc-800">
                    {auditA.checks.find((c) => c.id === "teeth")?.verdictShort ?? "Trung tính"}
                  </span>
                  <span className="text-zinc-800">
                    {auditB.checks.find((c) => c.id === "teeth")?.verdictShort ?? "Trung tính"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <>
              <HonestMakeupVerdictCard
                audit={focusedAudit}
                onApplyBestAiPair={handleApplyBestAiPair}
                showAiPairCta={Boolean(
                  bestAiLipstick &&
                    (focusedAudit.verdictTier !== "buy" ||
                      productA?.id !== bestAiLipstick.id ||
                      (isBareVsLip &&
                        (!blushEnabled ||
                          !makeupCompareLipOn ||
                          (bestAiBlush && activeBlush?.id !== bestAiBlush.id))))
                )}
              />

              <div className="bg-white rounded-3xl border border-zinc-200/85 p-5 sm:p-6 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]">
                <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                  <div className="rounded-2xl overflow-hidden border border-zinc-200/85">
                    <div
                      className="h-14 sm:h-16"
                      style={{ backgroundColor: report.lipMetrics.lipBaseHex }}
                    />
                    <div className="p-2.5 bg-white">
                      <div className="text-[11px] text-zinc-500">Không son</div>
                      <div className="text-xs font-semibold text-zinc-900 truncate mt-0.5">
                        Nền môi mộc
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden border border-zinc-200/85">
                    <div
                      className="h-14 sm:h-16"
                      style={{ backgroundColor: focusedSim.productHex }}
                    />
                    <div className="p-2.5 bg-white">
                      <div className="text-[11px] text-zinc-500">Màu trên thỏi</div>
                      <div className="text-xs font-semibold text-zinc-900 truncate mt-0.5">
                        {focusedProduct ? focusedProduct.shade : "Màu gợi ý"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl overflow-hidden border-2 border-zinc-900">
                    <div
                      className="h-14 sm:h-16"
                      style={{ backgroundColor: focusedSim.renderedHex }}
                    />
                    <div className="p-2.5 bg-zinc-50">
                      <div className="text-[11px] font-semibold text-zinc-900">Lên môi thật</div>
                      <div
                        className={`text-xs font-semibold tabular-nums mt-0.5 ${scoreToneClass(
                          focusedAudit.overallScore
                        )}`}
                      >
                        {focusedAudit.overallScore}/100 · {focusedAudit.verdictTagVi}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-900">
                    Xem màu theo từng lớp thoa
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {focusedSim.layerSteps.map((step) => {
                      const isActive =
                        step.thickness === 0
                          ? isBareSingleActive || (isBareVsLip && bareSplitPct >= 92)
                          : !isBareSingleActive && Math.abs(effectiveThickness - step.thickness) < 0.25;
                      return (
                        <button
                          key={step.label}
                          type="button"
                          onClick={() => {
                            if (step.thickness === 0) {
                              if (isBareVsLip) {
                                setBareSplitPct(100);
                              } else {
                                setCompareBare(true);
                              }
                            } else {
                              setCompareBare(false);
                              setThicknessOverride(step.thickness);
                              if (isBareVsLip && bareSplitPct >= 90) {
                                setBareSplitPct(50);
                              }
                            }
                          }}
                          className="group text-left space-y-1.5 cursor-pointer"
                        >
                          <div
                            className={`h-8 rounded-xl transition-all ${
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
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
