import React, { useMemo, useState } from "react";
import { hexToLab, hexToRgb, rgbToHex, rgbToLab } from "../lib/beauty/bradfordCat";
import { DEFAULT_KS, TEXTURE_KS_MAP, kubelkaMunkLipBlend, pigmentKsFromRgb } from "../lib/beauty/kubelkaMunk";
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
  { id: "Juicy Tint", label: "Son Tint Bóng" },
  { id: "Dewy Balm", label: "Son Dưỡng Có Màu" },
  { id: "Blur Water Tint", label: "Tint Mịn Mờ" },
  { id: "Velvet Tint", label: "Son Kem Nhung" },
  { id: "Matte Lipstick", label: "Son Thỏi Lì" },
  { id: "Lip Clay / Mud", label: "Son Bùn / Che Phủ Cao" },
  { id: "Mirror Gloss", label: "Son Bóng Gương" },
  { id: "Water Stain", label: "Tint Nước Mỏng" },
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
    const renderedLab = rgbToLab(renderedRgb);
    const opaqueDeltaE = ciede2000(hexToLab(targetLipHex), hexToLab(productHex));
    const renderedDeltaE = ciede2000(hexToLab(targetLipHex), renderedLab);
    const { k } = pigmentKsFromRgb(productRgb, ksDefaults.scattering);

    return {
      productHex,
      renderedHex,
      opaqueDeltaE: Number(opaqueDeltaE.toFixed(2)),
      renderedDeltaE: Number(renderedDeltaE.toFixed(2)),
      k,
    };
  }, [activeProduct, targetLipHex, lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness, ksDefaults.scattering]);

  const thicknessDescription =
    effectiveThickness <= 0.15
      ? "Gần như môi mộc"
      : effectiveThickness < 0.75
        ? "Đánh lòng môi mỏng nhẹ (lộ sắc môi thật)"
        : effectiveThickness < 1.25
          ? "Đánh 1–2 lớp tự nhiên"
          : "Thoa full môi che phủ cao";

  return (
    <section id="kubelka-munk" className="border-t border-zinc-200 pt-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
            04. Mô phỏng màu son thực tế (Kubelka–Munk)
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Thử màu son lên sắc môi thật của bạn
          </h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
            Cùng một thỏi son nhưng son tint mỏng sẽ hòa cùng màu môi mộc của bạn, còn son lì/son bùn
            sẽ lên chuẩn màu hãng hơn. Kéo thanh độ dày để xem màu thực tế trên môi.
          </p>
        </div>
        {availableLipsticks.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="km-lipstick-select" className="text-xs font-medium text-zinc-600 whitespace-nowrap">
              Chọn thỏi son:
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
              className="text-xs bg-white border border-zinc-300 rounded-md px-2.5 py-1.5 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-lg p-5 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-zinc-700 mb-2">
                <span>Chất son (Texture)</span>
                <span className="text-zinc-500">{effectiveTexture}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {TEXTURE_LABELS.map((tex) => (
                  <button
                    key={tex.id}
                    type="button"
                    onClick={() => {
                      setCustomTexture(tex.id);
                      setThicknessOverride(null);
                    }}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded border text-left truncate transition-colors cursor-pointer ${
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
                <label htmlFor="km-thickness-slider">Độ dày lớp son</label>
                <span className="text-zinc-900 font-medium">{thicknessDescription}</span>
              </div>
              <input
                id="km-thickness-slider"
                type="range"
                min={0}
                max={2.4}
                step={0.05}
                value={effectiveThickness}
                onChange={(e) => setThicknessOverride(Number(e.target.value))}
                className="w-full accent-zinc-900 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
                <span>Môi mộc</span>
                <span>Lòng môi nhẹ</span>
                <span>Full môi đậm</span>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4 text-xs text-zinc-600 space-y-1">
            <div className="font-medium text-zinc-800">Nhận xét nền môi của bạn</div>
            <p>{lipMetrics.coverageRequirement}</p>
            <div className="font-mono text-[11px] text-zinc-400 pt-1">
              K/S RGB: {simulation.k.map((v) => v.toFixed(2)).join(" / ")} · S={ksDefaults.scattering.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-zinc-200 rounded-md overflow-hidden">
              <div className="h-28 w-full" style={{ backgroundColor: lipMetrics.lipBaseHex }} />
              <div className="p-3 bg-white">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Bước 1 · Nền môi thật</div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5">Môi mộc đo được</div>
                <div className="text-xs font-mono text-zinc-500 mt-1">
                  {lipMetrics.lipBaseHex} · L*={lipMetrics.lipBaseLab[0].toFixed(0)}
                </div>
              </div>
            </div>

            <div className="border border-zinc-200 rounded-md overflow-hidden">
              <div className="h-28 w-full" style={{ backgroundColor: simulation.productHex }} />
              <div className="p-3 bg-white">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Bước 2 · Màu hãng</div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5 truncate">
                  {activeProduct ? activeProduct.shade : "Màu mục tiêu"}
                </div>
                <div className="text-xs font-mono text-zinc-500 mt-1">
                  {simulation.productHex} · ΔE={simulation.opaqueDeltaE.toFixed(1)}
                </div>
              </div>
            </div>

            <div className="border border-zinc-900 rounded-md overflow-hidden">
              <div className="h-28 w-full" style={{ backgroundColor: simulation.renderedHex }} />
              <div className="p-3 bg-zinc-50">
                <div className="text-[11px] uppercase tracking-wider text-cyan-800 font-semibold">
                  Kết quả trên môi bạn
                </div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5">
                  {TEXTURE_LABELS.find((t) => t.id === effectiveTexture)?.label ?? effectiveTexture}
                </div>
                <div className="text-xs font-mono text-zinc-700 mt-1">
                  {simulation.renderedHex} · ΔE={simulation.renderedDeltaE.toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-600">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block w-4 h-4 rounded-sm border border-zinc-300 shrink-0"
                style={{ backgroundColor: targetLipHex }}
              />
              <span>
                Màu son hợp nhất với mùa sắc của bạn:{" "}
                <strong className="font-mono text-zinc-900">{targetLipHex}</strong>
              </span>
            </div>
            <div className="text-zinc-500">
              Độ sậm viền môi: <strong className="font-mono text-zinc-800">{lipMetrics.lipDarknessIndex.toFixed(1)}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
