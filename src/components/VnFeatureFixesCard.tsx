import React, { useMemo, useState } from "react";
import {
  analyzeVnFacialFeaturesFromReport,
  type ConcernCategoryId,
  type ConcernSeverity,
} from "../lib/beauty/vnFeatureAnalysis";
import type { ConsultationReport } from "../lib/beauty/types";

interface VnFeatureFixesCardProps {
  report: ConsultationReport;
}

const AREA_SHORT_LABELS: Record<ConcernCategoryId, string> = {
  nose: "Dáng mũi",
  eyes: "Mắt & mí",
  face_fullness: "Độ gọn mặt",
  skin_blemish: "Mụn & nền da",
  undereye: "Quầng mắt",
};

const SEVERITY_LABEL: Record<ConcernSeverity, { text: string; className: string }> = {
  notable: { text: "Nên ưu tiên xử lý", className: "text-rose-700 font-semibold" },
  mild: { text: "Chỉnh nhẹ sẽ đẹp hơn", className: "text-amber-700 font-semibold" },
  balanced: { text: "Khá hài hòa sẵn", className: "text-emerald-700 font-semibold" },
};

export const VnFeatureFixesCard: React.FC<VnFeatureFixesCardProps> = ({ report }) => {
  const analysis = useMemo(() => analyzeVnFacialFeaturesFromReport(report), [report]);
  const [selectedArea, setSelectedArea] = useState<ConcernCategoryId | "detected">("detected");

  const visibleItems = useMemo(() => {
    if (selectedArea !== "detected") {
      return analysis.items.filter((item) => item.id === selectedArea);
    }
    const flagged = analysis.items.filter((item) => item.autoDetected);
    // Always show at least the top 3 items even on very balanced portraits
    return flagged.length > 0 ? flagged : analysis.items.slice(0, 3);
  }, [analysis.items, selectedArea]);

  return (
    <section
      data-testid="vn-feature-fixes-card"
      aria-label="Phân tích khuyết điểm nét mặt và cách khắc phục trang điểm"
      className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
    >
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold tracking-tight text-zinc-900">
            Nhận diện khuyết điểm &amp; cách che
          </h2>
          <span className="text-xs font-medium text-zinc-500 tabular-nums">
            {analysis.highlightedIds.length > 0
              ? `${analysis.highlightedIds.length} điểm nên chỉnh nhẹ`
              : "5 vùng gương mặt"}
          </span>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Soi dáng mũi, mí mắt, độ đầy vùng má–hàm, nốt mụn đỏ &amp; quầng mắt để chọn đúng mẹo
          trang điểm kiểu Á Đông.
        </p>
      </div>

      {/* Interactive Filter Row: Auto-detected + All 5 Specific Facial Areas */}
      <div
        role="tablist"
        aria-label="Chọn vùng khuôn mặt muốn xem mẹo khắc phục"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedArea === "detected"}
          onClick={() => setSelectedArea("detected")}
          className={`min-h-[36px] sm:min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
            selectedArea === "detected"
              ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
              : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
          }`}
        >
          Điểm cần chú ý ({analysis.highlightedIds.length || 3})
        </button>

        {analysis.items.map((item) => {
          const active = selectedArea === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedArea(item.id)}
              className={`min-h-[36px] sm:min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                active
                  ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
                  : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
              }`}
            >
              {AREA_SHORT_LABELS[item.id]}
            </button>
          );
        })}
      </div>

      {/* Clean Hairline-Divided Breakdown (Zero Nested Boxes / Zero Pills) */}
      <div className="divide-y divide-zinc-100">
        {visibleItems.map((item) => {
          const severityMeta = SEVERITY_LABEL[item.severity];
          return (
            <article key={item.id} className="py-3.5 first:pt-1 last:pb-0 space-y-2">
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-zinc-500">{item.areaLabel}</span>
                  <span className={`text-[11px] whitespace-nowrap ${severityMeta.className}`}>
                    {severityMeta.text}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 leading-snug">
                  {item.detectedLabel}
                </h3>
              </div>

              <p className="text-xs text-zinc-600 leading-relaxed">{item.summaryVi}</p>

              <div className="space-y-1 text-xs leading-relaxed">
                <p className="text-zinc-800">
                  <span className="font-semibold text-zinc-900">Cách khắc phục: </span>
                  {item.makeupFixVi}
                </p>
                <p className="text-zinc-500">
                  <span className="font-semibold text-zinc-700">Tránh lỗi này: </span>
                  {item.avoidVi}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
