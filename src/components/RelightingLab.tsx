import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import {
  clampSplitPercent,
  computeCompareBadgeVisibility,
  computeSplitPercentFromPointer,
} from "../lib/beauty/beforeAfterSlider";
import { runRelightingExperiment } from "../lib/beauty/portraitPipeline";
import { SEASON_VI_LABELS, UNDERTONE_VI_LABELS, describeCctVi } from "../lib/beauty/viLabels";
import type { ConsultationReport } from "../lib/beauty/types";

interface RelightingLabProps {
  report: ConsultationReport;
}

const LAMP_PRESETS = [
  { cct: 2800, label: "Đèn vàng quán ăn (2800K)" },
  { cct: 3500, label: "Đèn phòng ngủ (3500K)" },
  { cct: 4500, label: "Đèn văn phòng (4500K)" },
  { cct: 6500, label: "Nắng ban ngày (6500K)" },
];

const BufferCanvas: React.FC<{
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  label: string;
  fit?: "contain" | "cover";
}> = React.memo(({ rgba, width, height, label, fit = "contain" }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  }, [rgba, width, height]);

  return (
    <div
      className={
        fit === "cover"
          ? "w-full h-full bg-zinc-950 overflow-hidden"
          : "w-full bg-zinc-100 flex items-center justify-center"
      }
    >
      <canvas
        ref={ref}
        aria-label={label}
        className={
          fit === "cover"
            ? "block w-full h-full object-cover object-top"
            : "block max-w-full max-h-[260px] w-auto h-auto"
        }
      />
    </div>
  );
});
BufferCanvas.displayName = "BufferCanvas";

const RelightingSmoothSlider: React.FC<{
  beforeRgba: Uint8ClampedArray;
  afterRgba: Uint8ClampedArray;
  width: number;
  height: number;
  simulatedCct: number;
}> = ({ beforeRgba, afterRgba, width, height, simulatedCct }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const dividerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const liveSplitRef = useRef(50);

  const [splitPct, setSplitPct] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const applySplit = useCallback((pct: number) => {
    const clamped = clampSplitPercent(pct);
    liveSplitRef.current = clamped;
    if (clipRef.current) {
      clipRef.current.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`;
    }
    if (dividerRef.current) {
      dividerRef.current.style.left = `${clamped}%`;
    }
  }, []);

  useEffect(() => {
    if (!draggingRef.current) {
      applySplit(splitPct);
    }
  }, [splitPct, applySplit]);

  const getPct = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return liveSplitRef.current;
    const rect = el.getBoundingClientRect();
    return computeSplitPercentFromPointer(clientX, rect.left, rect.width);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    applySplit(getPct(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    applySplit(getPct(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setSplitPct(Math.round(liveSplitRef.current));
  };

  const { showBeforeBadge, showAfterBadge } = computeCompareBadgeVisibility(splitPct);
  const motionClass = isDragging
    ? "transition-none"
    : "transition-[clip-path,left] duration-200 ease-out";

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl overflow-hidden">
      <div className="bg-zinc-950 flex items-center justify-center">
        <div
          ref={containerRef}
          data-testid="relighting-before-after"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDoubleClick={() => setSplitPct(50)}
          className="relative aspect-[3/4] w-full max-w-[340px] select-none touch-pan-y cursor-ew-resize overflow-hidden bg-zinc-950"
        >
          <div className="absolute inset-0">
            <BufferCanvas
              rgba={afterRgba}
              width={width}
              height={height}
              label="Ảnh sau khi cân bằng ánh sáng"
              fit="cover"
            />
          </div>
          <div
            ref={clipRef}
            className={`absolute inset-0 will-change-[clip-path] ${motionClass}`}
            style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
          >
            <BufferCanvas
              rgba={beforeRgba}
              width={width}
              height={height}
              label={`Ảnh mô phỏng dưới đèn ${simulatedCct}K`}
              fit="cover"
            />
          </div>

          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs border border-white/15 text-[10.5px] font-semibold text-amber-100 transition-opacity duration-150 ${
              showBeforeBadge ? "opacity-100" : "opacity-0"
            }`}
          >
            Trước · Đèn {simulatedCct}K
          </div>
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs border border-emerald-300/25 text-[10.5px] font-semibold text-emerald-200 transition-opacity duration-150 ${
              showAfterBadge ? "opacity-100" : "opacity-0"
            }`}
          >
            Sau · Đã khử đèn D65
          </div>

          <div
            ref={dividerRef}
            role="slider"
            tabIndex={0}
            aria-label="Kéo mượt để so sánh ảnh dưới đèn phòng và sau khi khử đèn"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(splitPct)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setSplitPct((v) => clampSplitPercent(v - 5));
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setSplitPct((v) => clampSplitPercent(v + 5));
              }
            }}
            style={{ left: `${splitPct}%` }}
            className={`absolute inset-y-0 z-10 -translate-x-1/2 w-10 flex items-center justify-center touch-none focus:outline-none ${motionClass}`}
          >
            <div className="h-full w-[2px] bg-white shadow-[0_0_10px_rgba(0,0,0,0.65)]" />
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white text-zinc-900 shadow-[0_4px_16px_rgba(0,0,0,0.35)] ring-2 ring-black/10 flex items-center justify-center transition-transform ${
                isDragging ? "scale-105 ring-4 ring-white/40" : ""
              }`}
            >
              <MoveHorizontal className="w-4 h-4" strokeWidth={2.3} />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2.5 bg-zinc-50 border-t border-zinc-100 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setSplitPct(100)}
          className="text-[11px] font-semibold text-zinc-600 hover:text-zinc-900 whitespace-nowrap cursor-pointer"
        >
          Đèn {simulatedCct}K
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(splitPct)}
          onChange={(e) => setSplitPct(Number(e.target.value))}
          aria-label="Kéo so sánh mô phỏng đèn phòng"
          className="flex-1 h-1.5 accent-zinc-900 cursor-pointer"
        />
        <button
          type="button"
          onClick={() => setSplitPct(0)}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap cursor-pointer"
        >
          Đã khử đèn
        </button>
      </div>
    </div>
  );
};

export const RelightingLab: React.FC<RelightingLabProps> = ({ report }) => {
  const [simulatedCct, setSimulatedCct] = useState<number>(2800);
  const [compareLayout, setCompareLayout] = useState<"side_by_side" | "slider">("side_by_side");

  const experiment = useMemo(
    () => runRelightingExperiment(report, simulatedCct),
    [report, simulatedCct]
  );

  const beautyAiMethod =
    experiment.methods.find((m) => m.method === "planckian_bradford") ?? experiment.methods[2];
  const rawMethod = experiment.methods[0];

  return (
    <section
      data-testid="relighting-lab-section"
      aria-label="Kiểm tra màu da dưới các loại ánh đèn"
      className="bg-white border border-[#E5E5E5] divide-y divide-[#E5E5E5]"
    >
      {/* Top Bar: 1-Tap Lighting Presets + Display-Sans Kelvin Readout (Zero Sliders Needed) */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="space-y-1">
            <div className="metric-label">Thử ánh đèn phòng</div>
            <h2 className="text-lg sm:text-xl font-bold text-[#0A0A0A] tracking-[-0.025em]">
              Chọn loại đèn để xem độ ổn định màu da
            </h2>
            <p className="text-xs text-[#666666]">
              Chạm nhanh một nguồn sáng bên dưới để đối chiếu ngay ảnh trước và sau khi khử ám đèn.
            </p>
          </div>
          <div className="sm:text-right shrink-0">
            <div className="metric-label">Nhiệt độ màu đang thử</div>
            <div className="metric-display text-[28px] sm:text-[34px] font-bold text-[#0A0A0A] mt-0.5">
              {simulatedCct}
              <span className="text-sm font-medium text-[#737373] ml-0.5">K</span>
            </div>
            <div className="text-[11px] text-[#737373]">{describeCctVi(simulatedCct)}</div>
          </div>
        </div>

        {/* 4 Equal 1-Tap Lighting Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {LAMP_PRESETS.map((preset) => {
            const active = simulatedCct === preset.cct;
            return (
              <button
                key={preset.cct}
                type="button"
                aria-pressed={active}
                onClick={() => setSimulatedCct(preset.cct)}
                className={`min-h-[44px] px-3.5 py-2.5 text-left border transition-colors cursor-pointer ${
                  active
                    ? "bg-[#111111] text-white border-[#111111]"
                    : "bg-[#FAFAFA] text-[#111111] border-[#E5E5E5] hover:border-[#111111]"
                }`}
              >
                <div
                  className={`font-display tabular-nums text-base font-bold leading-none ${
                    active ? "text-white" : "text-[#0A0A0A]"
                  }`}
                >
                  {preset.cct}K
                </div>
                <div
                  className={`text-[11px] mt-1 truncate ${
                    active ? "text-white/80" : "text-[#666666]"
                  }`}
                >
                  {preset.label.replace(/\s*\([^)]*\)/, "")}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Consistent 12-Column Split: Side-by-Side Comparison (Default) + Method Benchmark */}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x divide-[#E5E5E5] items-stretch">
        <div className="lg:col-span-7 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="metric-label">So sánh trực tiếp · Đèn {simulatedCct}K</span>
            <div className="inline-flex items-center p-0.5 bg-[#EFEFEF] rounded-[4px]">
              {(
                [
                  ["side_by_side", "Song song"],
                  ["slider", "Kéo so sánh"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCompareLayout(id)}
                  className={`min-h-[28px] px-2.5 text-[11px] rounded-[3px] whitespace-nowrap transition-colors cursor-pointer ${
                    compareLayout === id
                      ? "bg-white text-[#0A0A0A] font-semibold shadow-2xs"
                      : "text-[#666666] hover:text-[#0A0A0A] font-medium"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {compareLayout === "slider" ? (
            <RelightingSmoothSlider
              beforeRgba={experiment.relitRgba}
              afterRgba={experiment.recoveredRgba}
              width={report.width}
              height={report.height}
              simulatedCct={simulatedCct}
            />
          ) : (
            <div className="grid grid-cols-2 border border-[#E5E5E5] divide-x divide-[#E5E5E5]">
              <div>
                <div className="px-3.5 py-2.5 border-b border-[#E5E5E5] bg-[#FAFAFA]">
                  <div className="metric-label">Trước khi khử</div>
                  <div className="text-xs font-bold text-[#0A0A0A] truncate mt-0.5">
                    Dưới đèn {simulatedCct}K
                  </div>
                </div>
                <BufferCanvas
                  rgba={experiment.relitRgba}
                  width={report.width}
                  height={report.height}
                  label={`Ảnh mô phỏng dưới đèn ${simulatedCct}K`}
                />
              </div>

              <div>
                <div className="px-3.5 py-2.5 border-b border-[#E5E5E5] bg-[#FAFAFA]">
                  <div className="metric-label">Sau khi khử đèn</div>
                  <div className="text-xs font-bold text-[#0A0A0A] truncate mt-0.5">
                    Ánh sáng ban ngày
                  </div>
                </div>
                <BufferCanvas
                  rgba={experiment.recoveredRgba}
                  width={report.width}
                  height={report.height}
                  label="Ảnh sau khi cân bằng ánh sáng"
                />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col divide-y divide-[#E5E5E5]">
          <div className="px-5 sm:px-6 py-4 flex items-baseline justify-between gap-2 bg-[#FAFAFA]">
            <span className="metric-label">Đối chiếu 3 phương pháp</span>
            <span className="text-xs font-semibold text-[#0A0A0A]">
              Chuẩn: {SEASON_VI_LABELS[experiment.baselineSeason].title.replace(/\s*\([^)]*\)/, "")}
            </span>
          </div>

          <div className="divide-y divide-[#EFEFEF] flex-1">
            {experiment.methods.map((m) => {
              const isBest = m.method === beautyAiMethod.method;
              return (
                <div
                  key={m.method}
                  className={`px-5 sm:px-6 py-4 flex items-start justify-between gap-4 ${
                    isBest ? "bg-white" : "bg-[#FAFAFA]/60"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="metric-label">{m.label}</div>
                    <div className="text-sm font-bold text-[#0A0A0A]">
                      {SEASON_VI_LABELS[m.predictedSeason].title.replace(/\s*\([^)]*\)/, "")} ·{" "}
                      {UNDERTONE_VI_LABELS[m.undertone]}
                    </div>
                    <div
                      className={`text-xs font-medium ${
                        m.seasonMatched
                          ? "text-emerald-700"
                          : m.method === rawMethod.method
                            ? "text-[#DC2626]"
                            : "text-[#B45309]"
                      }`}
                    >
                      {m.seasonMatched
                        ? "Khớp chuẩn như chụp ban ngày"
                        : "Lệch màu do ám sắc đèn phòng"}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="metric-label">Sai lệch ΔE</div>
                    <div
                      className={`metric-display-sm text-2xl font-bold mt-0.5 ${
                        isBest ? "text-emerald-700" : "text-[#0A0A0A]"
                      }`}
                    >
                      {m.deltaEFromDaylight.toFixed(1)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 divide-x divide-[#E5E5E5] bg-[#FAFAFA]">
            <div className="px-5 py-3.5 space-y-1">
              <div className="metric-label">Melanin σ ({simulatedCct}K)</div>
              <div className="metric-display-sm text-lg font-bold text-[#0A0A0A]">
                {experiment.relitMelaninStd.toFixed(3)}
              </div>
              <div className="font-mono text-[10px] text-[#737373]">
                Gốc {experiment.baselineMelaninStd.toFixed(3)}
              </div>
            </div>
            <div className="px-5 py-3.5 space-y-1">
              <div className="metric-label">Hemoglobin σ ({simulatedCct}K)</div>
              <div className="metric-display-sm text-lg font-bold text-[#0A0A0A]">
                {experiment.relitHemoglobinStd.toFixed(3)}
              </div>
              <div className="font-mono text-[10px] text-[#737373]">
                Gốc {experiment.baselineHemoglobinStd.toFixed(3)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
