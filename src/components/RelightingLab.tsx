import React, { useEffect, useMemo, useRef, useState } from "react";
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
        className="block max-w-full max-h-[260px] w-auto h-auto"
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

  const beautyAiMethod =
    experiment.methods.find((m) => m.method === "planckian_grey_edge") ?? experiment.methods[2];
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
              Đèn vàng hoặc đèn huỳnh quang dễ làm app thông thường đoán sai tông da. Xem cách
              Beauty AI đưa ảnh về ánh sáng chuẩn ban ngày.
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
        <div className="lg:col-span-7 grid grid-cols-2 gap-3 sm:gap-4">
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

        <div className="lg:col-span-5 bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-4 text-xs">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-zinc-900">Kết quả đối chiếu</h3>

            <div className="p-3 rounded-xl md:rounded-md border border-zinc-200 bg-zinc-50/70 space-y-1">
              <div className="text-zinc-500">Nếu không khử ánh đèn:</div>
              <div className="font-semibold text-zinc-900">
                {SEASON_VI_LABELS[rawMethod.predictedSeason].title} ·{" "}
                {UNDERTONE_VI_LABELS[rawMethod.undertone]}
              </div>
              <div className={rawMethod.seasonMatched ? "text-emerald-700" : "text-rose-700"}>
                {rawMethod.seasonMatched
                  ? "Trùng với màu gốc"
                  : `Bị lệch so với mùa chuẩn (${SEASON_VI_LABELS[experiment.baselineSeason].title})`}
              </div>
            </div>

            <div className="p-3 rounded-xl md:rounded-md border border-zinc-900 bg-white space-y-1">
              <div className="text-zinc-500">Với Beauty AI khử đèn chuẩn:</div>
              <div className="font-semibold text-zinc-900">
                {SEASON_VI_LABELS[beautyAiMethod.predictedSeason].title} ·{" "}
                {UNDERTONE_VI_LABELS[beautyAiMethod.undertone]}
              </div>
              <div className={beautyAiMethod.seasonMatched ? "text-emerald-700" : "text-amber-700"}>
                {beautyAiMethod.seasonMatched
                  ? "Giữ chính xác kết quả như chụp dưới nắng ban ngày"
                  : `Độ lệch nhỏ (ΔE ${beautyAiMethod.deltaEFromDaylight.toFixed(1)})`}
              </div>
            </div>
          </div>

          <p className="text-zinc-500 border-t border-zinc-100 pt-3">
            Ánh sáng phòng luôn được tự động cân bằng ở bước phân tích chính để bạn không phải lo
            chụp ảnh bị vàng hoặc xanh đèn.
          </p>
        </div>
      </div>
    </div>
  );
};
