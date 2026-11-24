import React, { useMemo, useState } from "react";
import { hexToLab, hexToRgb, rgbToHex, rgbToLab } from "../lib/beauty/bradfordCat";
import { DEFAULT_KS, TEXTURE_KS_MAP, kubelkaMunkLipBlend } from "../lib/beauty/kubelkaMunk";
import { ciede2000 } from "../lib/beauty/productMatcher";
import type { LipMetrics, MatchedProduct } from "../lib/beauty/types";

interface KubelkaMunkLabProps {
  lipMetrics: LipMetrics;
  targetLipHex: string;
  selectedLipstick: MatchedProduct | null;
  availableLipsticks: MatchedProduct[];
  onSelectLipstick: (product: MatchedProduct) => void;
}

const TEXTURE_LABELS: Array<{ id: string; label: string }> = [
  { id: "Juicy Tint", label: "Son tint bóng" },
  { id: "Dewy Balm", label: "Son dưỡng có màu" },
  { id: "Blur Water Tint", label: "Tint mịn mờ" },
  { id: "Velvet Tint", label: "Son kem nhung" },
  { id: "Matte Lipstick", label: "Son thỏi lì" },
  { id: "Lip Clay / Mud", label: "Son bùn che phủ cao" },
  { id: "Mirror Gloss", label: "Son bóng gương" },
  { id: "Water Stain", label: "Tint nước mỏng" },
];

export const KubelkaMunkLab: React.FC<KubelkaMunkLabProps> = ({
  lipMetrics,
  targetLipHex,
  selectedLipstick,
  availableLipsticks,
  onSelectLipstick,
}) => {
  const activeProduct = selectedLipstick ?? availableLipsticks[0] ?? null;
  const [customTexture, setCustomTexture] = useState<string | null>(null);
  const [thicknessOverride, setThicknessOverride] = useState<number | null>(null);

  const effectiveTexture = customTexture ?? activeProduct?.texture ?? "Juicy Tint";
  const ksDefaults = TEXTURE_KS_MAP[effectiveTexture] ?? DEFAULT_KS;
  const effectiveThickness = thicknessOverride ?? ksDefaults.thickness;

  const simulation = useMemo(() => {
    const productHex = activeProduct?.hex ?? targetLipHex;
    const substrateRgb: [number, number, number] = hexToRgb(lipMetrics.lipBaseHex);
    const productRgb = hexToRgb(productHex);
    const renderedRgb = kubelkaMunkLipBlend(substrateRgb, productRgb, {
      textureType: effectiveTexture,
      thickness: effectiveThickness,
    });
    const renderedHex = rgbToHex(renderedRgb);
    const renderedDeltaE = ciede2000(hexToLab(targetLipHex), rgbToLab(renderedRgb));

    return {
      productHex,
      renderedHex,
      renderedDeltaE: Number(renderedDeltaE.toFixed(1)),
    };
  }, [activeProduct, targetLipHex, lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness]);

  const thicknessDescription =
    effectiveThickness <= 0.15
      ? "Gần như môi mộc"
      : effectiveThickness < 0.75
        ? "Đánh lòng môi mỏng nhẹ"
        : effectiveThickness < 1.25
          ? "Đánh 1–2 lớp tự nhiên"
          : "Thoa full môi che phủ cao";

  const matchVerdict =
    simulation.renderedDeltaE <= 5
      ? "Lên môi rất tiệp với tông da của bạn"
      : simulation.renderedDeltaE <= 10
        ? "Hài hòa tự nhiên khi đánh lên môi"
        : "Sắc son hơi khác bảng màu chuẩn — nên tán mỏng hoặc phối thêm viền môi";

  return (
    <section id="lip-tryon" className="scroll-mt-20 border-t border-zinc-200 pt-8 md:pt-10 space-y-5 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-1">
            02B. Mô hình quang học Kubelka-Munk trên sắc môi thật
          </p>
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">
            Mô phỏng truyền sáng &amp; che phủ sắc tố trên nền môi tự nhiên
          </h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
            Tính toán phản xạ quang học hai thông lượng (K/S) giữa lớp sắc tố son và nền môi gốc.
            Son tint mỏng cho ánh nền môi xuyên qua, còn son lì có độ tán xạ che phủ cao hơn.
          </p>
        </div>

        {availableLipsticks.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 shrink-0 w-full md:w-auto">
            <label htmlFor="km-lipstick-select" className="text-xs font-medium text-zinc-600 whitespace-nowrap">
              Thỏi son đang thử:
            </label>
            <select
              id="km-lipstick-select"
              value={activeProduct?.id ?? ""}
              onChange={(e) => {
                const chosen = availableLipsticks.find((p) => p.id === Number(e.target.value));
                if (chosen) {
                  onSelectLipstick(chosen);
                  setCustomTexture(null);
                  setThicknessOverride(null);
                }
              }}
              className="w-full md:max-w-[260px] min-h-[44px] md:min-h-[38px] text-sm md:text-xs bg-white border border-zinc-300 rounded-xl md:rounded-md px-3 py-2 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {availableLipsticks.slice(0, 30).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.brand} {item.name} — {item.shade}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 items-stretch">
        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-zinc-700 mb-2">Chọn chất son</div>
              <div className="grid grid-cols-2 gap-2">
                {TEXTURE_LABELS.map((tex) => (
                  <button
                    key={tex.id}
                    type="button"
                    onClick={() => {
                      setCustomTexture(tex.id);
                      setThicknessOverride(null);
                    }}
                    className={`min-h-[44px] md:min-h-[36px] px-3 py-2 text-xs font-medium rounded-xl md:rounded-md border text-left truncate transition-colors cursor-pointer ${
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

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-zinc-700 mb-1.5">
                <label htmlFor="km-thickness-slider">Cách thoa son</label>
                <span className="text-zinc-900 font-semibold">{thicknessDescription}</span>
              </div>
              <div className="py-2">
                <input
                  id="km-thickness-slider"
                  type="range"
                  min={0}
                  max={2.4}
                  step={0.05}
                  value={effectiveThickness}
                  onChange={(e) => setThicknessOverride(Number(e.target.value))}
                  className="w-full h-2 accent-zinc-900 cursor-pointer"
                />
              </div>
              <div className="flex justify-between text-[11px] text-zinc-500">
                <span>Môi mộc</span>
                <span>Lòng môi nhẹ</span>
                <span>Full môi đậm</span>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4 text-xs text-zinc-600 space-y-1">
            <div className="font-semibold text-zinc-900">Gợi ý cho nền môi của bạn</div>
            <p>{lipMetrics.coverageRequirement}</p>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-5">
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="h-20 sm:h-32 w-full" style={{ backgroundColor: lipMetrics.lipBaseHex }} />
              <div className="p-2.5 sm:p-3 bg-white">
                <div className="text-[11px] sm:text-xs text-zinc-500 truncate">1. Nền môi</div>
                <div className="text-xs sm:text-sm font-semibold text-zinc-900 mt-0.5 truncate">
                  Môi mộc
                </div>
                <div className="text-[11px] sm:text-xs font-mono text-zinc-500 mt-1">
                  {lipMetrics.lipBaseHex}
                </div>
              </div>
            </div>

            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="h-20 sm:h-32 w-full" style={{ backgroundColor: simulation.productHex }} />
              <div className="p-2.5 sm:p-3 bg-white">
                <div className="text-[11px] sm:text-xs text-zinc-500 truncate">2. Thỏi son</div>
                <div className="text-xs sm:text-sm font-semibold text-zinc-900 mt-0.5 truncate">
                  {activeProduct ? activeProduct.shade : "Màu gợi ý"}
                </div>
                <div className="text-[11px] sm:text-xs font-mono text-zinc-500 mt-1">
                  {simulation.productHex}
                </div>
              </div>
            </div>

            <div className="border-2 border-zinc-900 rounded-xl overflow-hidden">
              <div className="h-20 sm:h-32 w-full" style={{ backgroundColor: simulation.renderedHex }} />
              <div className="p-2.5 sm:p-3 bg-zinc-50">
                <div className="text-[11px] sm:text-xs font-semibold text-zinc-900 truncate">
                  3. Lên môi
                </div>
                <div className="text-xs sm:text-sm font-semibold text-zinc-900 mt-0.5 truncate">
                  {TEXTURE_LABELS.find((t) => t.id === effectiveTexture)?.label ?? effectiveTexture}
                </div>
                <div className="text-[11px] sm:text-xs font-mono text-zinc-700 mt-1">
                  {simulation.renderedHex}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-zinc-700">
              <span
                className="inline-block w-4 h-4 rounded-sm border border-zinc-300 shrink-0"
                style={{ backgroundColor: targetLipHex }}
              />
              <span>{matchVerdict}</span>
            </div>
            <span className="text-zinc-500">
              Màu chuẩn mùa sắc: <strong className="font-mono text-zinc-800">{targetLipHex}</strong>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
