import React, { useState } from "react";
import { Download, SlidersHorizontal } from "lucide-react";
import { PortraitCanvas } from "./PortraitCanvas";
import { RelightingLab } from "./RelightingLab";
import { SEASON_VI_LABELS, describeCctVi } from "../lib/beauty/viLabels";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  IlluminantName,
  SeasonName,
  WhiteBalanceMethod,
} from "../lib/beauty/types";

interface ProInsightsViewProps {
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  onFaceBoxChange: (updater: (prev: FaceLandmarksBox) => FaceLandmarksBox) => void;
  landmarkStatus: "loading" | "neural" | "fallback";
  sortedSeasons: Array<{ name: SeasonName; prob: number }>;
  wbMethod: WhiteBalanceMethod;
  onWbMethodChange: (m: WhiteBalanceMethod) => void;
  catalogIlluminant: IlluminantName;
  onCatalogIlluminantChange: (ill: IlluminantName) => void;
  onExportJson: () => void;
}

export const ProInsightsView: React.FC<ProInsightsViewProps> = ({
  report,
  faceBox,
  onFaceBoxChange,
  landmarkStatus,
  sortedSeasons,
  wbMethod,
  onWbMethodChange,
  catalogIlluminant,
  onCatalogIlluminantChange,
  onExportJson,
}) => {
  const [subTab, setSubTab] = useState<"lighting" | "skinmaps" | "metrics">("lighting");

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
            Kiểm tra ánh đèn &amp; Sắc tố da
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Xem độ ổn định màu da dưới ánh đèn phòng, bản đồ sắc tố và các chỉ số đo chi tiết
          </p>
        </div>

        <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 p-1 bg-zinc-100 rounded-xl shrink-0">
          {(
            [
              ["lighting", "Ánh đèn phòng"],
              ["skinmaps", "Bản đồ da"],
              ["metrics", "Chỉ số chi tiết"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`min-h-[40px] sm:min-h-[36px] px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                subTab === id
                  ? "bg-white text-zinc-900 shadow-xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === "lighting" && <RelightingLab report={report} />}

      {subTab === "skinmaps" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Phân bố sắc tố nâu (Melanin)</h2>
                <p className="text-xs text-zinc-500">
                  Giúp quan sát độ đều màu và vùng sạm nhẹ trên khuôn mặt
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                <span>Ít</span>
                <span className="w-12 h-2 rounded-xs bg-gradient-to-r from-[#2d5091] via-[#c7995b] to-[#fa961e]" />
                <span>Nhiều</span>
              </div>
            </div>
            <PortraitCanvas
              report={report}
              mode="melanin"
              showOverlay={false}
              box={faceBox}
              className="max-h-[340px]"
            />
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Phân bố độ ửng đỏ (Hemoglobin)
                </h2>
                <p className="text-xs text-zinc-500">
                  Nhận diện vùng má hay ửng đỏ để chọn kem nền &amp; má hồng hài hòa
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                <span>Ít</span>
                <span className="w-12 h-2 rounded-xs bg-gradient-to-r from-[#2896c8] via-[#a35a9c] to-[#fa2c37]" />
                <span>Nhiều</span>
              </div>
            </div>
            <PortraitCanvas
              report={report}
              mode="hemoglobin"
              showOverlay={false}
              box={faceBox}
              className="max-h-[340px]"
            />
          </div>
        </div>
      )}

      {subTab === "metrics" && (
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 sm:p-6 space-y-6">
          {/* Tabular Colorimetry Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-zinc-100">
            <div>
              <div className="text-[11px] text-zinc-500">Hệ màu CIELAB (L* / a* / b*)</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {report.skinMetrics.L_star.toFixed(1)} / {report.skinMetrics.a_star.toFixed(1)} /{" "}
                {report.skinMetrics.b_star.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Chỉ số độ sáng ITA°</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {report.skinMetrics.ITA_deg.toFixed(1)}°
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Ánh sáng ảnh gốc</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {report.whiteBalance.estimatedCctK !== null
                  ? `${Math.round(report.whiteBalance.estimatedCctK)}K`
                  : "—"}
              </div>
              <div className="text-[11px] text-zinc-500">
                {describeCctVi(report.whiteBalance.estimatedCctK)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-zinc-500">Xác suất tông ấm</div>
              <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-1">
                {(report.season.warmProbability * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top 4 Seasons Breakdown */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Phân bố xác suất 4 nhóm mùa gần nhất
              </h2>
              <div className="space-y-2.5">
                {sortedSeasons.slice(0, 4).map((item, idx) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs gap-2">
                      <span
                        className={idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"}
                      >
                        {SEASON_VI_LABELS[item.name].title}
                      </span>
                      <span className="font-mono tabular-nums text-zinc-700 shrink-0">
                        {(item.prob * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          idx === 0 ? "bg-zinc-900" : "bg-zinc-400"
                        }`}
                        style={{ width: `${Math.max(4, item.prob * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calibration Controls */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-900">Tùy chỉnh thuật toán đo</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="wb-method" className="block text-xs font-medium text-zinc-600 mb-1.5">
                    Cân bằng ánh sáng
                  </label>
                  <select
                    id="wb-method"
                    value={wbMethod}
                    onChange={(e) => onWbMethodChange(e.target.value as WhiteBalanceMethod)}
                    className="w-full min-h-[44px] sm:min-h-[38px] text-sm sm:text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900"
                  >
                    <option value="planckian_grey_edge">Planckian Grey-Edge (Mặc định)</option>
                    <option value="planckian_sog">Shades-of-Gray</option>
                    <option value="none">Giữ nguyên ánh sáng ảnh gốc</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="catalog-ill" className="block text-xs font-medium text-zinc-600 mb-1.5">
                    Chuẩn ánh sáng bảng màu
                  </label>
                  <select
                    id="catalog-ill"
                    value={catalogIlluminant}
                    onChange={(e) => onCatalogIlluminantChange(e.target.value as IlluminantName)}
                    className="w-full min-h-[44px] sm:min-h-[38px] text-sm sm:text-xs bg-white border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900"
                  >
                    <option value="D65">Chuẩn màn hình sRGB (D65)</option>
                    <option value="D50">Chuẩn phòng lab ICC (D50 → D65)</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-zinc-500 font-mono tabular-nums space-y-1">
                <div>
                  Điểm khuôn mặt:{" "}
                  {landmarkStatus === "neural"
                    ? `${report.landmarkCount} điểm MediaPipe`
                    : "Khung ước lượng thủ công"}
                </div>
                <div>
                  Vùng da hợp lệ: {report.skinMetrics.sampleCount.toLocaleString()} px · Melanin σ=
                  {report.chromophores.melaninSpatialStd.toFixed(3)} · Hemoglobin σ=
                  {report.chromophores.hemoglobinSpatialStd.toFixed(3)}
                </div>
              </div>
            </div>
          </div>

          {landmarkStatus === "fallback" && (
            <div className="pt-4 border-t border-zinc-100 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Chỉnh tâm khuôn mặt thủ công</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <label className="block">
                  <span className="flex justify-between text-zinc-600">
                    <span>Tâm ngang</span>
                    <span className="font-mono tabular-nums">{faceBox.centerX.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={0.8}
                    step={0.01}
                    value={faceBox.centerX}
                    onChange={(e) =>
                      onFaceBoxChange((b) => ({ ...b, centerX: Number(e.target.value) }))
                    }
                    className="w-full h-2 mt-1.5 accent-zinc-900"
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-zinc-600">
                    <span>Tâm dọc</span>
                    <span className="font-mono tabular-nums">{faceBox.centerY.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={0.75}
                    step={0.01}
                    value={faceBox.centerY}
                    onChange={(e) =>
                      onFaceBoxChange((b) => ({ ...b, centerY: Number(e.target.value) }))
                    }
                    className="w-full h-2 mt-1.5 accent-zinc-900"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">
              Xuất dữ liệu sắc da CIELAB, sắc tố và bảng đối chiếu mỹ phẩm dạng tệp JSON.
            </span>
            <button
              type="button"
              onClick={onExportJson}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-[38px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-900 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải báo cáo JSON</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
