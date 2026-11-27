import React, { useMemo, useState } from "react";
import { ChevronRight, Glasses, Sparkles } from "lucide-react";
import {
  buildFaceShapeStyleProfile,
  type EyewearSilhouetteId,
} from "../lib/beauty/faceShapeStyleGuide";
import { SHAPE_VI_LABELS } from "../lib/beauty/viLabels";
import type {
  ConsultationReport,
  FaceShapeName,
  SkinTextureType,
} from "../lib/beauty/types";

interface FaceShapeStyleGuideProps {
  report: ConsultationReport;
  texture: SkinTextureType;
  onTextureChange: (val: SkinTextureType) => void;
  onOpenInsights: () => void;
}

type GuideTab = "makeup" | "eyewear";

const TEXTURE_OPTIONS: Array<{ id: SkinTextureType; label: string }> = [
  { id: "combination", label: "Hỗn hợp" },
  { id: "oily", label: "Da dầu" },
  { id: "dry", label: "Da khô" },
];

const FaceShapeSilhouette: React.FC<{ shape: FaceShapeName }> = ({ shape }) => {
  const pathByShape: Record<FaceShapeName, string> = {
    Oval: "M 24 6 C 35 6 41 14 41 25 C 41 37 33 46 24 46 C 15 46 7 37 7 25 C 7 14 13 6 24 6 Z",
    Round: "M 24 8 C 36 8 42 16 42 26 C 42 36 35 44 24 44 C 13 44 6 36 6 26 C 6 16 12 8 24 8 Z",
    Square: "M 12 9 L 36 9 C 40 9 41 13 41 18 L 40 34 C 40 40 36 43 24 44 C 12 43 8 40 8 34 L 7 18 C 7 13 8 9 12 9 Z",
    Heart: "M 24 8 C 36 8 42 14 41 22 C 40 31 32 41 24 46 C 16 41 8 31 7 22 C 6 14 12 8 24 8 Z",
    Oblong: "M 24 4 C 33 4 38 11 38 25 C 38 39 33 47 24 47 C 15 47 10 39 10 25 C 10 11 15 4 24 4 Z",
    Diamond: "M 24 6 C 31 6 35 12 41 24 C 36 35 30 45 24 46 C 18 45 12 35 7 24 C 13 12 17 6 24 6 Z",
  };

  return (
    <svg
      viewBox="0 0 48 52"
      className="w-10 h-11 shrink-0 text-zinc-900"
      aria-hidden="true"
    >
      <path
        d={pathByShape[shape]}
        fill="rgba(244, 244, 245, 0.9)"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <line x1="12" y1="24" x2="36" y2="24" stroke="#E11D48" strokeWidth="1" strokeDasharray="2 2" opacity="0.65" />
      <line x1="24" y1="8" x2="24" y2="44" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.28" />
    </svg>
  );
};

const EyewearSilhouetteIcon: React.FC<{ id: EyewearSilhouetteId }> = ({ id }) => {
  return (
    <svg viewBox="0 0 80 30" className="w-16 h-7 shrink-0 text-zinc-800" fill="none" aria-hidden="true">
      {id === "cat_eye" && (
        <>
          <path d="M 5 11 L 12 9 C 22 9 32 11 35 15 C 34 23 26 25 18 24 C 10 23 7 18 5 11 Z" stroke="currentColor" strokeWidth="2" />
          <path d="M 75 11 L 68 9 C 58 9 48 11 45 15 C 46 23 54 25 62 24 C 70 23 73 18 75 11 Z" stroke="currentColor" strokeWidth="2" />
          <path d="M 35 14 Q 40 12 45 14" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
      {id === "oval" && (
        <>
          <ellipse cx="22" cy="16" rx="14" ry="8.5" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="58" cy="16" rx="14" ry="8.5" stroke="currentColor" strokeWidth="2" />
          <path d="M 36 15 Q 40 13 44 15" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
      {id === "round" && (
        <>
          <circle cx="22" cy="16" r="10.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="58" cy="16" r="10.5" stroke="currentColor" strokeWidth="2" />
          <path d="M 32.5 15 Q 40 12 47.5 15" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
      {id === "rectangle" && (
        <>
          <rect x="7" y="9" width="29" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
          <rect x="44" y="9" width="29" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M 36 14 L 44 14" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
      {id === "browline" && (
        <>
          <path d="M 7 12 C 13 8 28 8 35 12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M 45 12 C 52 8 67 8 73 12" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
          <path d="M 9 13 C 9 23 16 25 22 25 C 29 25 34 22 34 13" stroke="currentColor" strokeWidth="1.3" />
          <path d="M 46 13 C 46 22 51 25 58 25 C 64 25 71 23 71 13" stroke="currentColor" strokeWidth="1.3" />
          <path d="M 35 13 Q 40 11 45 13" stroke="currentColor" strokeWidth="1.8" />
        </>
      )}
      {id === "aviator" && (
        <>
          <path d="M 8 10 L 35 10 C 35 20 30 26 21 26 C 12 26 8 20 8 10 Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M 45 10 L 72 10 C 72 20 68 26 59 26 C 50 26 45 20 45 10 Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M 35 10 L 45 10" stroke="currentColor" strokeWidth="1.6" />
          <path d="M 36 14 Q 40 12 44 14" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
      {(id === "wayfarer" || id === "geometric") && (
        <>
          <path d="M 7 9 L 36 10 L 34 22 C 33 24 27 25 20 25 C 12 25 9 22 8 17 Z" stroke="currentColor" strokeWidth="2.1" />
          <path d="M 73 9 L 44 10 L 46 22 C 47 24 53 25 60 25 C 68 25 71 22 72 17 Z" stroke="currentColor" strokeWidth="2.1" />
          <path d="M 36 12 Q 40 10.5 44 12" stroke="currentColor" strokeWidth="2" />
        </>
      )}
    </svg>
  );
};

export const FaceShapeStyleGuide: React.FC<FaceShapeStyleGuideProps> = ({
  report,
  texture,
  onTextureChange,
  onOpenInsights,
}) => {
  const [activeTab, setActiveTab] = useState<GuideTab>("makeup");

  const styleProfile = useMemo(
    () => buildFaceShapeStyleProfile(report.faceShape.primary, report.season.undertone),
    [report.faceShape.primary, report.season.undertone]
  );

  return (
    <section
      data-testid="face-shape-style-guide"
      aria-label="Gợi ý trang điểm và gọng kính theo dáng mặt"
      className="bg-white rounded-3xl border border-zinc-200/85 p-4 sm:p-5 space-y-4 shadow-[0_2px_16px_rgba(0,0,0,0.03)]"
    >
      {/* Header: Face Shape Verdict */}
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-zinc-50 border border-zinc-200/70 p-2 shrink-0">
          <FaceShapeSilhouette shape={report.faceShape.primary} />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <h2 className="text-base font-bold tracking-tight text-zinc-900">
            {SHAPE_VI_LABELS[report.faceShape.primary]}
          </h2>
          <p className="text-xs text-zinc-600 leading-relaxed">{styleProfile.headlineVi}</p>
        </div>
      </div>

      {/* Clean 2-Tab Style Switcher: Trang điểm · Gọng kính */}
      <div
        role="tablist"
        aria-label="Chọn hướng dẫn theo dáng mặt"
        className="grid grid-cols-2 gap-1 p-1 bg-zinc-100 rounded-xl"
      >
        {(
          [
            { id: "makeup", label: "Cách trang điểm", icon: Sparkles },
            { id: "eyewear", label: "Chọn gọng kính", icon: Glasses },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(id)}
              className={`min-h-[38px] px-2 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
                active
                  ? "bg-white text-zinc-900 shadow-xs font-semibold"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Natural Vietnamese Makeup Guide */}
      {activeTab === "makeup" && (
        <div data-testid="makeup-guide-panel" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="text-xs text-zinc-500">
              Loại da của bạn:{" "}
              <strong className="font-semibold text-zinc-900">
                {texture === "oily" ? "Da dầu" : texture === "dry" ? "Da khô" : "Da hỗn hợp"}
              </strong>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-xl sm:w-[230px] shrink-0">
              {TEXTURE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onTextureChange(opt.id)}
                  className={`min-h-[34px] sm:min-h-[30px] px-2 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                    texture === opt.id
                      ? "bg-white text-zinc-900 shadow-xs font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-zinc-100 text-sm">
            {[
              { label: "Đánh má hồng", text: report.advice.blush },
              { label: "Cách đánh son", text: report.advice.lip },
              { label: "Mắt & Chân mày", text: `${report.advice.eyes} ${styleProfile.eyebrowShapeVi}` },
              { label: "Tạo khối nhẹ", text: report.advice.contour },
            ].map((row) => (
              <div key={row.label} className="py-2.5 first:pt-0 last:pb-0">
                <div className="text-xs font-semibold text-zinc-900 mb-0.5">{row.label}</div>
                <p className="text-xs text-zinc-600 leading-relaxed">{row.text}</p>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-zinc-100 space-y-1.5 text-xs text-zinc-600 leading-relaxed">
            <div>
              <span className="font-semibold text-zinc-900">Nền bền màu trời nóng ẩm: </span>
              {report.advice.executionParameters.prep}. {report.advice.executionParameters.setting}.
            </div>
            <div>
              <span className="font-semibold text-zinc-900">Nên tránh: </span>
              {report.advice.avoid.join(" · ")}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Eyewear Guide */}
      {activeTab === "eyewear" && (
        <div data-testid="eyewear-guide-panel" className="space-y-4">
          <div className="space-y-2.5">
            {styleProfile.eyewearTopPicks.map((frame, index) => (
              <div
                key={frame.id}
                className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-50/80 border border-zinc-200/70"
              >
                <div className="rounded-xl bg-white border border-zinc-200/80 px-2 py-2 flex items-center justify-center shrink-0">
                  <EyewearSilhouetteIcon id={frame.id} />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs font-bold text-zinc-900">
                      {index + 1}. {frame.nameVi}
                    </span>
                    <span className="text-[11px] font-medium text-rose-700">{frame.tagVi}</span>
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed">{frame.reasonVi}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-zinc-100 space-y-2.5">
            <div className="text-xs font-semibold text-zinc-900">
              Màu gọng kính sáng da bạn
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {styleProfile.frameColors.map((swatch) => (
                <div
                  key={swatch.label}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-zinc-50 border border-zinc-200/70"
                >
                  <span
                    className="w-4 h-4 rounded-full ring-1 ring-black/15 shrink-0"
                    style={{ backgroundColor: swatch.hex }}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] font-medium text-zinc-800 truncate">
                    {swatch.label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed">{styleProfile.frameFinishNoteVi}</p>
          </div>

          <div className="pt-3 border-t border-zinc-100 space-y-1.5 text-xs text-zinc-600 leading-relaxed">
            <div>
              <span className="font-semibold text-zinc-900">Mẹo chọn size kính: </span>
              {styleProfile.eyewearFitTipVi}
            </div>
            <div>
              <span className="font-semibold text-zinc-900">Gọng nên tránh: </span>
              {styleProfile.eyewearAvoidVi}
            </div>
          </div>
        </div>
      )}

      {/* Quiet Link to Technical Pro Insights Tab */}
      <div className="pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500">
          Muốn xem số liệu kỹ thuật (CIELAB, ITA°, lưới 478 điểm)?
        </span>
        <button
          type="button"
          onClick={onOpenInsights}
          className="text-xs font-semibold text-zinc-900 hover:text-rose-700 inline-flex items-center gap-0.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Chuyên sâu</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
};
