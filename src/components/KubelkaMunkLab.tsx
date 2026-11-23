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

const TEXTURE_OPTIONS = Object.keys(TEXTURE_KS_MAP);

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
    const { k, s } = pigmentKsFromRgb(productRgb, ksDefaults.scattering);

    return {
      productHex,
      renderedHex,
      renderedLab,
      opaqueDeltaE: Number(opaqueDeltaE.toFixed(2)),
      renderedDeltaE: Number(renderedDeltaE.toFixed(2)),
      k,
      s,
    };
  }, [activeProduct, targetLipHex, lipMetrics.lipBaseHex, effectiveTexture, effectiveThickness, ksDefaults.scattering]);

  return (
    <section id="kubelka-munk" className="border-t border-zinc-200 pt-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
            03. Optical Lip Rendering
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Finite-Layer Kubelka–Munk Simulator
          </h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
            Models finite cosmetic pigment scattering and absorption (K/S) over your measured natural lip
            substrate rather than assuming opaque swatch color.
          </p>
        </div>
        {availableLipsticks.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor="km-lipstick-select" className="text-xs font-medium text-zinc-600 whitespace-nowrap">
              Active SKU:
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
              {availableLipsticks.slice(0, 20).map((item) => (
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
                <span>Formula Scattering Profile</span>
                <span className="font-mono text-zinc-500">S = {ksDefaults.scattering.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {TEXTURE_OPTIONS.map((tex) => (
                  <button
                    key={tex}
                    type="button"
                    onClick={() => {
                      setCustomTexture(tex);
                      setThicknessOverride(null);
                    }}
                    className={`px-2 py-1.5 text-[11px] font-medium rounded border text-left truncate transition-colors ${
                      effectiveTexture === tex
                        ? "bg-zinc-900 text-white border-zinc-900"
                        : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
                    }`}
                    title={tex}
                  >
                    {tex}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-medium text-zinc-700 mb-1.5">
                <label htmlFor="km-thickness-slider">Optical Layer Thickness (d)</label>
                <span className="font-mono text-zinc-900">{effectiveThickness.toFixed(2)}</span>
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
                <span>0.0 (Bare Lip)</span>
                <span>0.55 (Sheer Tint)</span>
                <span>1.6+ (Opaque Clay)</span>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4">
            <div className="text-xs font-medium text-zinc-700 mb-2">
              Inferred RGB Absorption / Scattering (K/S)
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="bg-zinc-50 border border-zinc-200 rounded p-2">
                <div className="text-zinc-500">R-band K</div>
                <div className="font-semibold text-zinc-900 mt-0.5">{simulation.k[0].toFixed(3)}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded p-2">
                <div className="text-zinc-500">G-band K</div>
                <div className="font-semibold text-zinc-900 mt-0.5">{simulation.k[1].toFixed(3)}</div>
              </div>
              <div className="bg-zinc-50 border border-zinc-200 rounded p-2">
                <div className="text-zinc-500">B-band K</div>
                <div className="font-semibold text-zinc-900 mt-0.5">{simulation.k[2].toFixed(3)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-lg p-5 flex flex-col justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-zinc-200 rounded-md overflow-hidden">
              <div className="h-24 w-full" style={{ backgroundColor: lipMetrics.lipBaseHex }} />
              <div className="p-3 bg-white">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Measured Substrate</div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5">Natural Lip Base</div>
                <div className="text-xs font-mono text-zinc-600 mt-1">
                  {lipMetrics.lipBaseHex} · L*={lipMetrics.lipBaseLab[0].toFixed(1)}
                </div>
              </div>
            </div>

            <div className="border border-zinc-200 rounded-md overflow-hidden">
              <div className="h-24 w-full" style={{ backgroundColor: simulation.productHex }} />
              <div className="p-3 bg-white">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">Opaque Swatch</div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5 truncate">
                  {activeProduct ? activeProduct.shade : "Target Shade"}
                </div>
                <div className="text-xs font-mono text-zinc-600 mt-1">
                  {simulation.productHex} · ΔE00={simulation.opaqueDeltaE.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="border border-zinc-900 rounded-md overflow-hidden">
              <div className="h-24 w-full" style={{ backgroundColor: simulation.renderedHex }} />
              <div className="p-3 bg-zinc-50">
                <div className="text-[11px] uppercase tracking-wider text-cyan-700 font-medium">
                  K–M Rendered On Lip
                </div>
                <div className="text-sm font-semibold text-zinc-900 mt-0.5">{effectiveTexture}</div>
                <div className="text-xs font-mono text-zinc-800 mt-1">
                  {simulation.renderedHex} · ΔE00={simulation.renderedDeltaE.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-600">
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-4 h-4 rounded-sm border border-zinc-300 shrink-0"
                style={{ backgroundColor: targetLipHex }}
              />
              <span>
                Season Blended Target Lip:{" "}
                <strong className="font-mono text-zinc-900">{targetLipHex}</strong>
              </span>
            </div>
            <div className="font-mono text-zinc-700">
              Lip Border L*: {lipMetrics.lipBorderL.toFixed(1)} · Darkness Index:{" "}
              {lipMetrics.lipDarknessIndex.toFixed(1)} ({lipMetrics.recommendedTexture})
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
