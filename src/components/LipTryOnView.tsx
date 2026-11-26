import React, { useMemo, useState } from "react";
import { Eye, Heart, ZoomIn, ZoomOut } from "lucide-react";
import { hexToLab, hexToRgb, rgbToHex, rgbToLab } from "../lib/beauty/bradfordCat";
import { DEFAULT_KS, TEXTURE_KS_MAP, kubelkaMunkLipBlend } from "../lib/beauty/kubelkaMunk";
import { ciede2000 } from "../lib/beauty/productMatcher";
import { deltaEToMatchPercent, type VirtualMakeupOptions } from "../lib/beauty/virtualMakeup";
import type { ConsultationReport, FaceLandmarksBox, MatchedProduct } from "../lib/beauty/types";
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
}

const FINISH_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "Juicy Tint", label: "Tint bóng" },
  { id: "Velvet Tint", label: "Kem nhung" },
  { id: "Matte Lipstick", label: "Son lì" },
  { id: "Dewy Balm", label: "Son dưỡng" },
  { id: "Blur Water Tint", label: "Tint mịn mờ" },
  { id: "Lip Clay / Mud", label: "Son bùn" },
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
}) => {
  // Show top 4 closest matches first, then greedily pick visually distinct shades for rich variety
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

  const activeProduct = selectedLipstick ?? curatedShades[0] ?? null;
  const [customTexture, setCustomTexture] = useState<string | null>(null);
  const [thicknessOverride, setThicknessOverride] = useState<number | null>(null);
  const [compareBare, setCompareBare] = useState(false);
  const [holdingBare, setHoldingBare] = useState(false);
  const [zoomToLips, setZoomToLips] = useState(false);

  const effectiveTexture = customTexture ?? activeProduct?.texture ?? "Juicy Tint";
  const ksDefaults = TEXTURE_KS_MAP[effectiveTexture] ?? DEFAULT_KS;
  const effectiveThickness = thicknessOverride ?? ksDefaults.thickness;

  const isBareActive = compareBare || holdingBare;
  const activeBlush =
    availableBlushes.find((b) => b.id === selectedBlushId) ?? availableBlushes[0] ?? null;
  const effectiveBlushHex = activeBlush?.hex ?? report.blendedTargets.blush;

  const simulation = useMemo(() => {
    const productHex = activeProduct?.hex ?? report.blendedTargets.lip;
    const substrateRgb: [number, number, number] = hexToRgb(report.lipMetrics.lipBaseHex);
    const productRgb = hexToRgb(productHex);
    const renderedRgb = kubelkaMunkLipBlend(substrateRgb, productRgb, {
      textureType: effectiveTexture,
      thickness: effectiveThickness,
    });
    const renderedHex = rgbToHex(renderedRgb);
    const renderedDeltaE = ciede2000(hexToLab(report.blendedTargets.lip), rgbToLab(renderedRgb));

    return {
      productHex,
      renderedHex,
      matchPercent: deltaEToMatchPercent(renderedDeltaE),
      renderedDeltaE,
    };
  }, [
    activeProduct,
    report.blendedTargets.lip,
    report.lipMetrics.lipBaseHex,
    effectiveTexture,
    effectiveThickness,
  ]);

  const virtualMakeup: VirtualMakeupOptions = useMemo(
    () => ({
      lipEnabled: !isBareActive,
      lipHex: simulation.productHex,
      lipTexture: effectiveTexture,
      lipThickness: effectiveThickness,
      blushEnabled: !isBareActive && blushEnabled,
      blushHex: effectiveBlushHex,
      blushIntensity: 0.24,
    }),
    [
      isBareActive,
      simulation.productHex,
      effectiveTexture,
      effectiveThickness,
      blushEnabled,
      effectiveBlushHex,
    ]
  );

  const thicknessLabel =
    effectiveThickness <= 0.15
      ? "Môi mộc"
      : effectiveThickness < 0.75
        ? "Lòng môi nhẹ"
        : effectiveThickness < 1.25
          ? "1–2 lớp tự nhiên"
          : "Full môi đậm";

  const matchVerdict =
    simulation.renderedDeltaE <= 5.5
      ? "Lên môi rất sáng da và tự nhiên"
      : simulation.renderedDeltaE <= 10.5
        ? "Hài hòa dễ dùng hằng ngày"
        : "Sắc son cá tính — nên tán mỏng lòng môi cho tự nhiên hơn";

  const isSaved = activeProduct ? savedIds.has(activeProduct.id) : false;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
      {/* Left: Interactive Virtual Try-On Portrait Mirror */}
      <div className="lg:col-span-5 space-y-3">
        <div
          className="relative bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-200/80 shadow-xs h-[365px] sm:h-[450px] lg:h-[505px] w-full select-none"
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
              className={`pointer-events-auto min-h-[38px] px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
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
                className={`min-h-[38px] min-w-[38px] px-2.5 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border inline-flex items-center justify-center gap-1 whitespace-nowrap transition-colors cursor-pointer ${
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
                className={`min-h-[38px] px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border whitespace-nowrap transition-colors cursor-pointer ${
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
            virtualMakeup={virtualMakeup}
            zoomToLips={zoomToLips}
            fit="cover"
            containerClassName="h-full w-full bg-zinc-950"
          />

          {/* Compact bottom active-shade strip on portrait */}
          {activeProduct && (
            <div className="absolute inset-x-0 bottom-0 pt-14 pb-3.5 px-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent pointer-events-none">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-white/75 truncate">
                    {activeProduct.brand} · Nhấn giữ ảnh để so sánh
                  </div>
                  <div className="text-sm font-bold text-white truncate">
                    {activeProduct.name} · {activeProduct.shade}
                  </div>
                </div>
                <span className="text-xs font-semibold text-emerald-300 tabular-nums shrink-0">
                  {isBareActive ? "Môi mộc" : `${simulation.matchPercent}% hợp da`}
                </span>
              </div>
            </div>
          )}
        </div>

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

      {/* Right: Thumb-Zone Shade Swatch Carousel + Finish & Coverage Controls */}
      <div className="lg:col-span-7 space-y-4 sm:space-y-5">
        <div className="bg-white rounded-2xl border border-zinc-200/90 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 truncate">
                Chọn màu son thử
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5 truncate">
                Chạm màu bên dưới để thử lên môi
              </p>
            </div>
            {activeProduct && (
              <button
                type="button"
                onClick={() => onToggleSave(activeProduct.id)}
                className={`min-h-[42px] px-3.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  isSaved
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <Heart className={`w-4 h-4 ${isSaved ? "fill-rose-600 text-rose-600" : ""}`} />
                <span>{isSaved ? "Đã lưu" : "Lưu màu"}</span>
              </button>
            )}
          </div>

          {/* Horizontal swipeable shade dots on mobile, clean wrap on desktop */}
          <div
            className="flex lg:flex-wrap items-center gap-3 overflow-x-auto no-scrollbar py-1 -mx-1 px-1 snap-x"
            role="listbox"
            aria-label="Chọn màu son thử lên môi"
          >
            {curatedShades.map((item) => {
              const isSelected = activeProduct?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelectLipstick(item);
                    setCustomTexture(null);
                    setThicknessOverride(null);
                    setCompareBare(false);
                  }}
                  className="group flex flex-col items-center gap-1.5 shrink-0 snap-start cursor-pointer"
                >
                  <span
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition-transform ${
                      isSelected
                        ? "ring-2 ring-zinc-900 ring-offset-2 scale-105"
                        : "ring-1 ring-black/10 group-hover:scale-105"
                    }`}
                    style={{ backgroundColor: item.renderedHex ?? item.hex }}
                  />
                  <span
                    className={`text-[11px] max-w-[66px] truncate ${
                      isSelected ? "font-semibold text-zinc-900" : "text-zinc-500"
                    }`}
                  >
                    {item.shade.split(" ").slice(0, 2).join(" ")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Finish & Intensity Controls */}
          <div className="pt-3 border-t border-zinc-100 space-y-4">
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
                    className={`min-h-[40px] sm:min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
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

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="lip-intensity-slider" className="font-semibold text-zinc-700">
                  Độ đậm khi thoa
                </label>
                <span className="font-semibold text-zinc-900">{thicknessLabel}</span>
              </div>
              <div className="py-1.5">
                <input
                  id="lip-intensity-slider"
                  type="range"
                  min={0.1}
                  max={2.2}
                  step={0.05}
                  value={effectiveThickness}
                  onChange={(e) => {
                    setThicknessOverride(Number(e.target.value));
                    setCompareBare(false);
                  }}
                  className="w-full h-2 accent-zinc-900 cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500">
                <span>Lòng môi nhẹ</span>
                <span>Tự nhiên</span>
                <span>Full môi đậm</span>
              </div>
            </div>
          </div>
        </div>

        {/* True-on-Lips Color Swatch Comparison */}
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
              <div className="h-14 sm:h-16" style={{ backgroundColor: simulation.productHex }} />
              <div className="p-2.5 bg-white">
                <div className="text-[11px] text-zinc-500">Màu thỏi</div>
                <div className="text-xs font-semibold text-zinc-900 truncate mt-0.5">
                  {activeProduct ? activeProduct.shade : "Màu gợi ý"}
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border-2 border-zinc-900">
              <div className="h-14 sm:h-16" style={{ backgroundColor: simulation.renderedHex }} />
              <div className="p-2.5 bg-zinc-50">
                <div className="text-[11px] font-semibold text-zinc-900">Lên môi bạn</div>
                <div className="text-xs font-semibold text-emerald-700 tabular-nums mt-0.5">
                  {simulation.matchPercent}% hợp da
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 space-y-1.5 text-xs">
            <div className="font-semibold text-zinc-900">{matchVerdict}</div>
            <p className="text-zinc-600 leading-relaxed">{report.lipMetrics.coverageRequirement}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
