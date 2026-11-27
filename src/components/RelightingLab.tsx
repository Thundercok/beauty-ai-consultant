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
  const [compareLayout, setCompareLayout] = useState<"slider" | "side_by_side">("slider");

  const experiment = useMemo(
    () => runRelightingExperiment(report, simulatedCct),
    [report, simulatedCct]
  );

  const beautyAiMethod =
    experiment.methods.find((m) => m.method === "planckian_bradford") ?? experiment.methods[2];
  const rawMethod = experiment.methods[0];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Chọn ánh sáng phòng để kiểm tra độ ổn định màu da
            </h3>
            <p className="text-xs text-zinc-600 mt-0.5">
              Đèn vàng hoặc đèn huỳnh quang dễ làm app thông thường đoán sai tông da. Kéo thanh
              trượt trên ảnh để thấy cách Beauty AI khử ánh đèn về ánh sáng chuẩn ban ngày.
            </p>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">
            {simulatedCct}K · {describeCctVi(simulatedCct)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {LAMP_PRESETS.map((preset) => (
            <button
              key={preset.cct}
              type="button"
              onClick={() => setSimulatedCct(preset.cct)}
              className={`min-h-[44px] md:min-h-[36px] px-3 py-2 text-xs font-medium rounded-xl md:rounded-md border text-left sm:text-center transition-colors cursor-pointer ${
                simulatedCct === preset.cct
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div>
          <div className="py-1.5">
            <input
              aria-label="Nhiệt độ màu ánh đèn mô phỏng"
              type="range"
              min={2600}
              max={8500}
              step={100}
              value={simulatedCct}
              onChange={(e) => setSimulatedCct(Number(e.target.value))}
              className="w-full h-2 accent-zinc-900 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>Đèn vàng ấm</span>
            <span>Trong nhà</span>
            <span>Ban ngày</span>
            <span>Trời râm</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-700">
              So sánh khử ánh sáng đèn {simulatedCct}K
            </span>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 border border-zinc-200">
              {(
                [
                  ["slider", "Trượt so sánh"],
                  ["side_by_side", "Song song"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCompareLayout(id)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                    compareLayout === id
                      ? "bg-white text-zinc-900 font-semibold shadow-2xs"
                      : "text-zinc-600 hover:text-zinc-900"
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
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl overflow-hidden">
                <div className="px-3 sm:px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
                  <div className="text-xs font-semibold text-zinc-900 truncate">
                    Dưới đèn {simulatedCct}K
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">Chưa khử màu đèn</div>
                </div>
                <BufferCanvas
                  rgba={experiment.relitRgba}
                  width={report.width}
                  height={report.height}
                  label={`Ảnh mô phỏng dưới đèn ${simulatedCct}K`}
                />
              </div>

              <div className="bg-white border border-zinc-900 rounded-2xl md:rounded-xl overflow-hidden">
                <div className="px-3 sm:px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
                  <div className="text-xs font-semibold text-zinc-900 truncate">Sau khi khử đèn</div>
                  <div className="text-[11px] text-zinc-700 truncate">Màu da tự nhiên</div>
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

        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 text-xs">
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-zinc-900">Đối chiếu 3 phương pháp</h3>
              <span className="text-[11px] text-zinc-500">
                Chuẩn: {SEASON_VI_LABELS[experiment.baselineSeason].title.replace(/\s*\([^)]*\)/, "")}
              </span>
            </div>

            <div className="space-y-2">
              {experiment.methods.map((m) => {
                const isBest = m.method === beautyAiMethod.method;
                return (
                  <div
                    key={m.method}
                    className={`p-3 rounded-xl md:rounded-md border space-y-1 ${
                      isBest ? "border-zinc-900 bg-white" : "border-zinc-200 bg-zinc-50/70"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={isBest ? "font-semibold text-zinc-900" : "text-zinc-600"}>
                        {m.label}
                      </span>
                      <span className="font-mono tabular-nums text-[11px] font-semibold text-zinc-700 shrink-0">
                        ΔE {m.deltaEFromDaylight.toFixed(1)}
                      </span>
                    </div>
                    <div className="font-semibold text-zinc-900">
                      {SEASON_VI_LABELS[m.predictedSeason].title.replace(/\s*\([^)]*\)/, "")} ·{" "}
                      {UNDERTONE_VI_LABELS[m.undertone]}
                    </div>
                    <div
                      className={
                        m.seasonMatched
                          ? "text-emerald-700"
                          : m.method === rawMethod.method
                            ? "text-rose-700"
                            : "text-amber-700"
                      }
                    >
                      {m.seasonMatched
                        ? "Khớp chuẩn như chụp dưới nắng ban ngày"
                        : "Lệch mùa màu do ám sắc đèn phòng"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-3 space-y-1.5">
            <div className="font-semibold text-zinc-800">
              Độ bất biến sắc tố dưới đèn {simulatedCct}K
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono tabular-nums text-[11px] text-zinc-600">
              <div>
                Melanin σ: {experiment.baselineMelaninStd.toFixed(3)} →{" "}
                <strong className="text-zinc-900">{experiment.relitMelaninStd.toFixed(3)}</strong>
              </div>
              <div>
                Hemoglobin σ: {experiment.baselineHemoglobinStd.toFixed(3)} →{" "}
                <strong className="text-zinc-900">{experiment.relitHemoglobinStd.toFixed(3)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
