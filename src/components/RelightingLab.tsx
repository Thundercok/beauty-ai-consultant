import React, { useEffect, useMemo, useRef, useState } from "react";
import { rgbToHex, labToRgb } from "../lib/beauty/bradfordCat";
import { runRelightingExperiment } from "../lib/beauty/portraitPipeline";
import { SEASON_VI_LABELS, UNDERTONE_VI_LABELS, describeCctVi } from "../lib/beauty/viLabels";
import type { ConsultationReport } from "../lib/beauty/types";

interface RelightingLabProps {
  report: ConsultationReport;
}

const LAMP_PRESETS = [
  { cct: 2800, label: "2800K · Đèn vàng quán ăn" },
  { cct: 3500, label: "3500K · Đèn phòng ngủ" },
  { cct: 4500, label: "4500K · Đèn văn phòng" },
  { cct: 6500, label: "6500K · Nắng ban ngày" },
  { cct: 8000, label: "8000K · Trời râm mát" },
];

const BufferCanvas: React.FC<{
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  label: string;
}> = ({ rgba, width, height, label }) => {
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
    <div className="w-full bg-zinc-100 flex items-center justify-center">
      <canvas
        ref={ref}
        aria-label={label}
        className="block max-w-full max-h-[280px] w-auto h-auto"
      />
    </div>
  );
};

export const RelightingLab: React.FC<RelightingLabProps> = ({ report }) => {
  const [simulatedCct, setSimulatedCct] = useState<number>(2800);

  const experiment = useMemo(
    () => runRelightingExperiment(report, simulatedCct),
    [report, simulatedCct]
  );

  const melaninDriftPct = useMemo(() => {
    if (experiment.baselineMelaninStd === 0) return 0;
    return (
      (Math.abs(experiment.relitMelaninStd - experiment.baselineMelaninStd) /
        experiment.baselineMelaninStd) *
      100
    );
  }, [experiment]);

  return (
    <section id="relighting" className="border-t border-zinc-200 pt-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
            02. Thử nghiệm ổn định dưới các loại ánh sáng
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Tại sao thử son dưới đèn vàng lại khác khi ra nắng?
          </h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
            Kéo thanh nhiệt độ màu để giả lập ảnh chụp dưới đèn vàng ấm (2800K) đến trời râm (8000K).
            Xem cách Beauty AI giữ nguyên sắc tố da thật so với ảnh thô và thuật toán cân bằng cũ.
          </p>
        </div>
        <div className="font-mono text-xs text-zinc-700 shrink-0">
          {simulatedCct}K · {describeCctVi(simulatedCct)}
        </div>
      </div>

      {/* Preset buttons + slider */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {LAMP_PRESETS.map((preset) => (
            <button
              key={preset.cct}
              type="button"
              onClick={() => setSimulatedCct(preset.cct)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
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
          <div className="flex justify-between text-xs font-medium text-zinc-700 mb-1.5">
            <label htmlFor="relight-cct-slider">Nhiệt độ màu ánh đèn mô phỏng (CCT)</label>
            <span className="font-mono text-zinc-900">{simulatedCct} K</span>
          </div>
          <input
            id="relight-cct-slider"
            type="range"
            min={2600}
            max={8500}
            step={100}
            value={simulatedCct}
            onChange={(e) => setSimulatedCct(Number(e.target.value))}
            className="w-full accent-zinc-900 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-zinc-500 mt-1">
            <span>2600K (Đèn vàng rất ấm)</span>
            <span>4500K (Đèn trắng trung tính)</span>
            <span>6500K (Chuẩn ban ngày D65)</span>
            <span>8500K (Trời xanh lạnh)</span>
          </div>
        </div>
      </div>

      {/* Visual comparison + stability table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 grid grid-cols-2 gap-4">
          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-zinc-200 bg-zinc-50">
              <div className="text-xs font-semibold text-zinc-900">1. Ảnh dưới đèn {simulatedCct}K</div>
              <div className="text-[11px] text-zinc-500">Chưa xử lý màu ánh đèn</div>
            </div>
            <BufferCanvas
              rgba={experiment.relitRgba}
              width={report.width}
              height={report.height}
              label={`Ảnh mô phỏng dưới đèn ${simulatedCct}K`}
            />
          </div>

          <div className="bg-white border border-zinc-900 rounded-lg overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-zinc-200 bg-zinc-50">
              <div className="text-xs font-semibold text-zinc-900">2. Sau khi Beauty AI khử đèn</div>
              <div className="text-[11px] text-cyan-800">Khôi phục về ánh sáng chuẩn D65</div>
            </div>
            <BufferCanvas
              rgba={experiment.recoveredRgba}
              width={report.width}
              height={report.height}
              label="Ảnh sau khi cân bằng Planckian + Bradford"
            />
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-zinc-200 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 mb-1">
              So sánh độ chính xác khi đổi ánh sáng phòng
            </h3>
            <p className="text-xs text-zinc-600 mb-4">
              Màu chuẩn ban ngày của bạn:{" "}
              <strong className="text-zinc-900">
                {SEASON_VI_LABELS[experiment.baselineSeason].title}
              </strong>
              . Sai lệch màu càng nhỏ (ΔE gần 0) thì gợi ý son &amp; phấn càng ổn định.
            </p>

            <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-md overflow-hidden text-xs">
              {experiment.methods.map((m) => {
                const swatch = rgbToHex(labToRgb(m.skinLab));
                return (
                  <div key={m.method} className="p-3 flex items-center justify-between gap-3 bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-6 h-6 rounded border border-zinc-300 shrink-0"
                        style={{ backgroundColor: swatch }}
                        title={`Màu da đo được: ${swatch}`}
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 truncate">{m.label}</div>
                        <div className="text-zinc-600 truncate">
                          {SEASON_VI_LABELS[m.predictedSeason].title} ·{" "}
                          {UNDERTONE_VI_LABELS[m.undertone]}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-semibold text-zinc-900">
                        Lệch ΔE = {m.deltaEFromDaylight.toFixed(1)}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          m.seasonMatched ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {m.seasonMatched ? "Giữ đúng kết quả" : "Bị lệch mùa sắc"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
            <span>
              Độ ổn định sắc tố Melanin (Beer–Lambert):{" "}
              <strong className="font-mono text-zinc-900">
                σ = {experiment.relitMelaninStd.toFixed(4)}
              </strong>{" "}
              (chỉ lệch {melaninDriftPct.toFixed(1)}% so với chuẩn)
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              Hemoglobin σ = {experiment.relitHemoglobinStd.toFixed(4)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
