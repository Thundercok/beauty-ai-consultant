import React, { useMemo, useState } from "react";
import {
  analyzeVnFacialFeaturesFromReport,
  buildPersonalizedMakeupGuide,
  type ConcernCategoryId,
  type ConcernSeverity,
} from "../lib/beauty/vnFeatureAnalysis";
import type { ConsultationReport, SkinTextureType } from "../lib/beauty/types";

interface MakeupGuideSectionProps {
  report: ConsultationReport;
  texture: SkinTextureType;
}

const SEVERITY_META: Record<ConcernSeverity, { label: string; className: string }> = {
  notable: { label: "Nên ưu tiên", className: "text-rose-700 font-semibold" },
  mild: { label: "Chỉnh nhẹ sẽ đẹp hơn", className: "text-amber-700 font-semibold" },
  balanced: { label: "Hài hòa sẵn · Mẹo tham khảo", className: "text-emerald-700 font-semibold" },
};

export const MakeupGuideSection: React.FC<MakeupGuideSectionProps> = ({ report, texture }) => {
  const analysis = useMemo(() => analyzeVnFacialFeaturesFromReport(report), [report]);
  const guide = useMemo(
    () => buildPersonalizedMakeupGuide(analysis, report.season.undertone, texture),
    [analysis, report.season.undertone, texture]
  );

  const [activeTab, setActiveTab] = useState<ConcernCategoryId | "priority">("priority");

  const visibleItems = useMemo(() => {
    if (activeTab !== "priority") {
      return guide.items.filter((item) => item.id === activeTab);
    }
    const prioritized = guide.items.filter((item) => item.autoDetected);
    return prioritized.length > 0 ? prioritized : guide.items.slice(0, 3);
  }, [guide.items, activeTab]);

  return (
    <section
      data-testid="makeup-guide-section"
      aria-label="Hướng dẫn trang điểm theo kết quả phân tích khuôn mặt"
      className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
    >
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900">
            Hướng dẫn trang điểm
          </h2>
          <span className="text-xs font-medium text-zinc-500 tabular-nums">
            {guide.detectedCount > 0
              ? `${guide.detectedCount} điểm ưu tiên từ ảnh bạn`
              : "5 mẹo phổ biến"}
          </span>
        </div>
        <p className="text-xs text-zinc-600 leading-relaxed">{guide.summaryLineVi}</p>
      </div>

      {/* Interactive Concern Tabs: Priority from Photo + Quick-Pick Common Concerns */}
      <div
        role="tablist"
        aria-label="Chọn nhược điểm muốn xem hướng dẫn trang điểm"
        className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 -mx-1 px-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "priority"}
          onClick={() => setActiveTab("priority")}
          className={`min-h-[36px] sm:min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
            activeTab === "priority"
              ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
              : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
          }`}
        >
          Ưu tiên theo ảnh ({guide.detectedCount || 3})
        </button>

        {guide.items.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[36px] sm:min-h-[32px] px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                active
                  ? "bg-zinc-900 text-white border-zinc-900 font-semibold"
                  : "bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100"
              }`}
            >
              {item.quickTabLabel}
            </button>
          );
        })}
      </div>

      {/* Step-by-Step Personalized Makeup Instructions (Hairline Divided, Zero Nested Cards) */}
      <div className="divide-y divide-zinc-100">
        {visibleItems.map((item) => {
          const meta = SEVERITY_META[item.severity];
          return (
            <article key={item.id} className="py-4 first:pt-1 last:pb-0 space-y-2.5">
              {/* Kicker + Title */}
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="text-zinc-500 font-medium">{item.detectedStatusVi}</span>
                  <span className={`whitespace-nowrap ${meta.className}`}>{meta.label}</span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 leading-snug">{item.titleVi}</h3>
              </div>

              {/* 3 Concrete Numbered Steps */}
              <ol className="space-y-2 text-xs text-zinc-700 leading-relaxed">
                {item.stepsVi.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="font-mono tabular-nums text-[11px] font-semibold text-zinc-400 pt-0.5 shrink-0">
                      0{idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              {/* Tailored Product/Color Note + What to Avoid */}
              <div className="pt-1 space-y-1 text-xs leading-relaxed">
                <p className="text-zinc-800">
                  <span className="font-semibold text-zinc-900">Hợp tông da bạn: </span>
                  {item.shadePickVi}
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
