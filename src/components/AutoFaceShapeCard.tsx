import React, { useMemo } from "react";
import { analyzeFaceShapeFromGeometry } from "../lib/beauty/autoFaceShapeAnalyzer";
import { SHAPE_VI_LABELS } from "../lib/beauty/viLabels";
import type {
  FaceLandmarksBox,
  FaceShapeName,
  SeasonClassification,
} from "../lib/beauty/types";

interface AutoFaceShapeCardProps {
  neuralLandmarks: Array<[number, number, number]> | null;
  faceBox: FaceLandmarksBox;
  width: number;
  height: number;
  undertone: SeasonClassification["undertone"];
}

const SHAPE_CONTOUR_PATHS: Record<FaceShapeName, string[]> = {
  Oval: ["M 20.5 23 Q 21.5 28 21.5 32", "M 27.5 23 Q 26.5 28 26.5 32"],
  Round: ["M 9.5 34 Q 12 45 19 48", "M 38.5 34 Q 36 45 29 48"],
  Square: ["M 9.5 34 Q 10.5 44 17 47.5", "M 38.5 34 Q 37.5 44 31 47.5", "M 10 15 Q 11 19 10 22", "M 38 15 Q 37 19 38 22"],
  Heart: ["M 9.5 14 Q 9.5 21 10.5 25", "M 38.5 14 Q 38.5 21 37.5 25"],
  Oblong: ["M 16 7.5 Q 24 6 32 7.5", "M 18 52 Q 24 53.5 30 52"],
  Diamond: ["M 9 25 Q 10.5 30 10.5 35", "M 39 25 Q 37.5 30 37.5 35"],
};

const SHAPE_HIGHLIGHT_DOTS: Record<FaceShapeName, Array<{ cx: number; cy: number; rx: number; ry: number }>> = {
  Oval: [
    { cx: 24, cy: 27, rx: 1.4, ry: 3.2 },
    { cx: 24, cy: 33.5, rx: 1.6, ry: 1.6 },
    { cx: 24, cy: 46, rx: 2.2, ry: 1.5 },
  ],
  Round: [
    { cx: 24, cy: 16, rx: 3.4, ry: 1.8 },
    { cx: 24, cy: 28, rx: 1.4, ry: 3.2 },
    { cx: 24, cy: 44.5, rx: 2.6, ry: 1.6 },
  ],
  Square: [
    { cx: 24, cy: 16, rx: 3.2, ry: 1.7 },
    { cx: 24, cy: 28, rx: 1.4, ry: 3.2 },
    { cx: 24, cy: 44.5, rx: 2.5, ry: 1.6 },
  ],
  Heart: [
    { cx: 16.5, cy: 32, rx: 2.4, ry: 1.7 },
    { cx: 31.5, cy: 32, rx: 2.4, ry: 1.7 },
    { cx: 24, cy: 29, rx: 1.4, ry: 2.8 },
  ],
  Oblong: [
    { cx: 16, cy: 30, rx: 2.8, ry: 1.8 },
    { cx: 32, cy: 30, rx: 2.8, ry: 1.8 },
    { cx: 24, cy: 31, rx: 1.5, ry: 1.8 },
  ],
  Diamond: [
    { cx: 24, cy: 15, rx: 3.4, ry: 1.8 },
    { cx: 24, cy: 28, rx: 1.4, ry: 3.0 },
    { cx: 24, cy: 46, rx: 2.8, ry: 1.7 },
  ],
};

const FaceShapeSilhouette: React.FC<{ shape: FaceShapeName }> = ({ shape }) => {
  const pathByShape: Record<FaceShapeName, string> = {
    Oval: "M 24 6 C 35 6 41 16 41 29 C 41 42 33 52 24 52 C 15 52 7 42 7 29 C 7 16 13 6 24 6 Z",
    Round: "M 24 9 C 36 9 43 18 43 29 C 43 41 36 49 24 49 C 12 49 5 41 5 29 C 5 18 12 9 24 9 Z",
    Square: "M 24 8 C 35 8 41 11 41 21 L 41 39 C 41 46 34 49 24 49 C 14 49 7 46 7 39 L 7 21 C 7 11 13 8 24 8 Z",
    Heart: "M 24 7 C 37 7 42 15 41 25 C 40 36 31 48 24 52 C 17 48 8 36 7 25 C 6 15 11 7 24 7 Z",
    Oblong: "M 24 4 C 34 4 39 13 39 29 C 39 45 33 54 24 54 C 15 54 9 45 9 29 C 9 13 14 4 24 4 Z",
    Diamond: "M 24 6 C 32 6 38 14 42 28 C 38 40 31 50 24 52 C 17 50 10 40 6 28 C 10 14 16 6 24 6 Z",
  };

  const contourPaths = SHAPE_CONTOUR_PATHS[shape];
  const highlightDots = SHAPE_HIGHLIGHT_DOTS[shape];

  return (
    <div
      className="w-14 h-16 bg-[#FAFAFA] border border-[#E5E5E5] flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 58" className="w-10 h-12">
        <path
          d={pathByShape[shape]}
          fill="#FFFDFB"
          stroke="#27272A"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        {contourPaths.map((d, i) => (
          <path
            key={`c-${i}`}
            d={d}
            fill="none"
            stroke="#9A725E"
            strokeWidth="3.2"
            strokeLinecap="round"
            opacity="0.72"
          />
        ))}
        {highlightDots.map((dot, i) => (
          <ellipse
            key={`h-${i}`}
            cx={dot.cx}
            cy={dot.cy}
            rx={dot.rx}
            ry={dot.ry}
            fill="#F59E0B"
            opacity="0.52"
          />
        ))}
      </svg>
    </div>
  );
};

export const AutoFaceShapeCard: React.FC<AutoFaceShapeCardProps> = ({
  neuralLandmarks,
  faceBox,
  width,
  height,
  undertone,
}) => {
  const analysis = useMemo(
    () =>
      analyzeFaceShapeFromGeometry({
        neuralLandmarks,
        faceBox,
        width,
        height,
        undertone,
      }),
    [neuralLandmarks, faceBox, width, height, undertone]
  );

  const rankedShapes = useMemo(
    () =>
      (Object.keys(analysis.result.probabilities) as FaceShapeName[])
        .map((name) => ({ name, prob: analysis.result.probabilities[name] }))
        .sort((a, b) => b.prob - a.prob),
    [analysis.result.probabilities]
  );

  const { ratios } = analysis.result;

  return (
    <section
      data-testid="auto-face-shape-card"
      data-shape={analysis.result.primary}
      data-source={analysis.source}
      aria-label="Phân tích dáng mặt tự động và 3 gợi ý tạo khối bắt sáng"
      className="bg-white border border-[#E5E5E5] flex flex-col divide-y divide-[#E5E5E5] h-full"
    >
      {/* Top Row: Face Shape Verdict + Display-Sans Confidence */}
      <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <FaceShapeSilhouette shape={analysis.result.primary} />
          <div className="min-w-0 space-y-1">
            <div className="metric-label">Dáng khuôn mặt · {analysis.sourceLabelVi}</div>
            <h2
              data-testid="auto-face-shape-title"
              className="metric-display-sm text-2xl sm:text-[28px] font-bold text-[#0A0A0A]"
            >
              {analysis.shapeLabelVi}
            </h2>
            <p className="text-xs text-[#525252] leading-relaxed">
              {analysis.proportionSummaryVi}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="metric-label">Độ khớp</div>
          <div className="metric-display text-[28px] sm:text-[32px] font-bold text-[#DC2626] mt-0.5">
            {analysis.confidencePct}
            <span className="text-sm font-medium text-[#737373] ml-0.5">%</span>
          </div>
          <div className="text-[11px] text-[#737373] mt-1">
            Phụ: <span className="font-semibold text-[#0A0A0A]">{analysis.secondaryLabelVi}</span>
          </div>
        </div>
      </div>

      {/* Consistent 3-Column Display-Sans Geometry Ratio Strip */}
      <div className="grid grid-cols-3 divide-x divide-[#E5E5E5] bg-[#FAFAFA]">
        {[
          { code: "R1", label: "Dài / Rộng", value: ratios.r1 },
          { code: "R2", label: "Hàm / Gò má", value: ratios.r2 },
          { code: "R3", label: "Trán / Hàm", value: ratios.r3 },
        ].map((m) => (
          <div key={m.code} className="px-4 sm:px-5 py-3.5 space-y-1">
            <div className="metric-label truncate">{m.label}</div>
            <div className="metric-display-sm text-xl sm:text-2xl font-bold text-[#0A0A0A]">
              {m.value.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* Compact 6-Shape Probability Distribution */}
      <div className="px-5 sm:px-6 py-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="metric-label">Phân bố 6 dáng mặt</span>
          <div className="flex items-center gap-3 text-[11px] text-[#737373]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-[#9A725E]" aria-hidden="true" />
              Tạo khối
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-1 bg-amber-400" aria-hidden="true" />
              Bắt sáng
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
          {rankedShapes.map((item, idx) => {
            const pct = Math.round(item.prob * 100);
            return (
              <div key={item.name} className="space-y-1">
                <div className="flex items-baseline justify-between gap-1 text-xs">
                  <span
                    className={`truncate ${
                      idx === 0 ? "font-semibold text-[#0A0A0A]" : "text-[#666666]"
                    }`}
                  >
                    {SHAPE_VI_LABELS[item.name]}
                  </span>
                  <span className="font-display tabular-nums text-xs font-bold text-[#0A0A0A]">
                    {pct}%
                  </span>
                </div>
                <div className="h-1 bg-[#EFEFEF] overflow-hidden">
                  <div
                    className={`h-full ${idx === 0 ? "bg-[#0A0A0A]" : "bg-[#D4D4D4]"}`}
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3 Concrete Contour & Highlight Makeup Tips */}
      <div className="p-5 sm:p-6 space-y-3 flex-1">
        <div className="space-y-0.5">
          <div className="metric-label">Gợi ý trang điểm theo dáng mặt</div>
          <h3 className="text-sm sm:text-[15px] font-bold text-[#0A0A0A]">
            3 bước tạo khối &amp; bắt sáng cho {analysis.shapeLabelVi.toLowerCase()}
          </h3>
        </div>

        <ol
          data-testid="auto-face-shape-tips"
          className="divide-y divide-[#EFEFEF]"
        >
          {analysis.tips.map((tip, idx) => (
            <li
              key={tip.id}
              data-testid={`face-shape-tip-${idx + 1}`}
              className="py-3 first:pt-1 last:pb-0 flex items-start gap-3"
            >
              <span className="font-display tabular-nums text-sm font-bold text-[#DC2626] pt-0.5 shrink-0">
                0{idx + 1}
              </span>
              <div className="min-w-0 space-y-0.5">
                <div className="metric-label">{tip.focusLabelVi}</div>
                <div className="text-xs sm:text-[13px] font-semibold text-[#0A0A0A] leading-snug">
                  {tip.headlineVi}
                </div>
                <p className="text-xs text-[#525252] leading-relaxed">{tip.detailVi}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
