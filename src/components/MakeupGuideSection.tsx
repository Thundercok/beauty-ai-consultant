import React, { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import {
  mapConcernToGuideZone,
  type FaceGuideZoneId,
} from "../lib/beauty/faceGuideMap";
import {
  analyzeVnFacialFeaturesFromReport,
  buildPersonalizedMakeupGuide,
  buildVnHighlightContourPlan,
  type ConcernCategoryId,
  type ConcernSeverity,
} from "../lib/beauty/vnFeatureAnalysis";
import type { ConsultationReport, SkinTextureType } from "../lib/beauty/types";

interface MakeupGuideSectionProps {
  report: ConsultationReport;
  texture: SkinTextureType;
  activeGuideLayers?: readonly FaceGuideZoneId[];
  onShowZoneOnFace?: (zone: FaceGuideZoneId) => void;
  onShowContourOnFace?: () => void;
}

const SEVERITY_META: Record<ConcernSeverity, { label: string; className: string }> = {
  notable: { label: "Nên ưu tiên", className: "text-rose-700 font-semibold" },
  mild: { label: "Chỉnh nhẹ sẽ đẹp hơn", className: "text-amber-700 font-semibold" },
  balanced: { label: "Hài hòa sẵn · Mẹo tham khảo", className: "text-emerald-700 font-semibold" },
};

const FEATURED_ALWAYS_IDS: ReadonlySet<ConcernCategoryId> = new Set([
  "skin_blemish",
  "eyes",
  "nose",
]);

function splitStepLead(step: string): { lead: string | null; detail: string } {
  const sep = step.indexOf(": ");
  if (sep > 0 && sep < 58) {
    return { lead: step.slice(0, sep), detail: step.slice(sep + 2) };
  }
  return { lead: null, detail: step };
}

export const MakeupGuideSection: React.FC<MakeupGuideSectionProps> = ({
  report,
  texture,
  activeGuideLayers = [],
  onShowZoneOnFace,
  onShowContourOnFace,
}) => {
  const analysis = useMemo(() => analyzeVnFacialFeaturesFromReport(report), [report]);
  const guide = useMemo(
    () => buildPersonalizedMakeupGuide(analysis, report.season.undertone, texture),
    [analysis, report.season.undertone, texture]
  );
  const highlightContour = useMemo(
    () => buildVnHighlightContourPlan(report.faceShape, report.season.undertone),
    [report.faceShape, report.season.undertone]
  );

  const [activeTab, setActiveTab] = useState<ConcernCategoryId | "priority">("priority");

  const featuredItems = useMemo(
    () => guide.items.filter((item) => FEATURED_ALWAYS_IDS.has(item.id) || item.autoDetected),
    [guide.items]
  );

  const visibleItems = useMemo(() => {
    if (activeTab !== "priority") {
      return guide.items.filter((item) => item.id === activeTab);
    }
    return featuredItems;
  }, [guide.items, featuredItems, activeTab]);

  const contourActive =
    activeGuideLayers.includes("nose") && activeGuideLayers.includes("cheek_jaw");

  return (
    <section
      data-testid="makeup-guide-section"
      aria-label="Hướng dẫn Makeup AI theo hình dáng mặt và kết quả phân tích"
      className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
    >
      {/* Header */}
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-zinc-900">
            Hướng dẫn Makeup AI
          </h2>
          <span className="text-xs font-medium text-zinc-500">
            Dáng mặt: <strong className="font-semibold text-zinc-900">{highlightContour.faceShapeVi}</strong>
          </span>
        </div>
        <p className="text-xs text-zinc-600 leading-relaxed">{guide.summaryLineVi}</p>
      </div>

      {/* Face-Shape Highlight & Contour Plan (Natural Vietnamese Student Aesthetic) */}
      <div
        data-testid="highlight-contour-plan"
        className="pt-3 pb-3.5 border-y border-zinc-100 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h3 className="text-xs font-bold text-zinc-900">
              Kỹ thuật Highlight &amp; Contour cho dáng {highlightContour.faceShapeVi.toLowerCase()}
            </h3>
            <div className="text-[11px] text-zinc-500">{highlightContour.goalVi}</div>
          </div>

          {onShowContourOnFace && (
            <button
              type="button"
              data-testid="show-contour-on-face-btn"
              onClick={onShowContourOnFace}
              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                contourActive
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800"
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>{contourActive ? "Đang vẽ khối" : "Xem khối trên mặt"}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
          <div className="space-y-0.5">
            <div className="font-semibold text-zinc-900">Đánh bắt sáng (Highlight)</div>
            <p className="text-zinc-600">{highlightContour.highlightZonesVi}</p>
          </div>
          <div className="space-y-0.5 sm:border-l sm:border-zinc-100 sm:pl-3.5">
            <div className="font-semibold text-zinc-900">Tạo khối nhẹ (Contour)</div>
            <p className="text-zinc-600">{highlightContour.contourZonesVi}</p>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500">
          <span className="font-semibold text-zinc-700">Tông màu gợi ý đi học: </span>
          {highlightContour.productToneVi}
        </p>
      </div>

      {/* Interactive Concern Tabs: Featured + Quick-Pick Common Concerns */}
      <div
        role="tablist"
        aria-label="Chọn chủ đề hướng dẫn trang điểm"
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
          Nổi bật cho bạn ({featuredItems.length})
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
          const mappedZone = mapConcernToGuideZone(item.id);
          const isShownOnFace = Boolean(mappedZone && activeGuideLayers.includes(mappedZone));

          return (
            <article key={item.id} className="py-4 first:pt-1 last:pb-0 space-y-2.5">
              {/* Kicker + Title + Direct Portrait Overlay Link */}
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px]">
                  <span className="text-zinc-500 font-medium">{item.detectedStatusVi}</span>
                  <span className={`whitespace-nowrap ${meta.className}`}>{meta.label}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-zinc-900 leading-snug">{item.titleVi}</h3>
                  {mappedZone && onShowZoneOnFace && (
                    <button
                      type="button"
                      data-testid={`show-on-face-${item.id}`}
                      onClick={() => onShowZoneOnFace(mappedZone)}
                      className={`min-h-[28px] px-2.5 py-0.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                        isShownOnFace
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800"
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>{isShownOnFace ? "Đang vẽ trên mặt" : "Xem vẽ trên mặt"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 3 Concrete Numbered Steps */}
              <ol className="space-y-2 text-xs text-zinc-700 leading-relaxed">
                {item.stepsVi.map((step, idx) => {
                  const { lead, detail } = splitStepLead(step);
                  return (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="font-mono tabular-nums text-[11px] font-semibold text-zinc-400 pt-0.5 shrink-0">
                        0{idx + 1}
                      </span>
                      <span>
                        {lead && <span className="font-semibold text-zinc-900">{lead}: </span>}
                        {detail}
                      </span>
                    </li>
                  );
                })}
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
