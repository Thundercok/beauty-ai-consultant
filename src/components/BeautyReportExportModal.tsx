import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, FileCode2, FileImage, FileText, X } from "lucide-react";
import {
  generateBeautyReportBundle,
  type GeneratedBeautyReportBundle,
} from "../lib/beauty/reportExport";
import type {
  ConsultationReport,
  FaceLandmarksBox,
  MatchedProduct,
} from "../lib/beauty/types";

interface BeautyReportExportModalProps {
  open: boolean;
  onClose: () => void;
  report: ConsultationReport;
  faceBox: FaceLandmarksBox;
  skinSwatchHex: string;
  recommendedLipsticks: MatchedProduct[];
  recommendedBlushes: MatchedProduct[];
  recommendedEyeshadows: MatchedProduct[];
  onExportJson: () => void;
  onNotify?: (message: string) => void;
}

export const BeautyReportExportModal: React.FC<BeautyReportExportModalProps> = ({
  open,
  onClose,
  report,
  faceBox,
  skinSwatchHex,
  recommendedLipsticks,
  recommendedBlushes,
  recommendedEyeshadows,
  onExportJson,
  onNotify,
}) => {
  const [bundle, setBundle] = useState<GeneratedBeautyReportBundle | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewPage, setPreviewPage] = useState<"page1" | "page2">("page1");
  const [lastDownloaded, setLastDownloaded] = useState<"pdf" | "png" | "json" | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsGenerating(true);
    setErrorMsg(null);
    setLastDownloaded(null);

    const build = async () => {
      try {
        if (typeof document !== "undefined" && document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => window.setTimeout(resolve, 450)),
          ]);
        }
        if (cancelled) return;

        const generated = generateBeautyReportBundle({
          report,
          faceBox,
          skinSwatchHex,
          recommendedLipsticks,
          recommendedBlushes,
          recommendedEyeshadows,
        });

        if (!cancelled) {
          setBundle(generated);
          setIsGenerating(false);
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "Không thể dựng báo cáo trên trình duyệt này."
          );
          setIsGenerating(false);
        }
      }
    };

    const rafId = window.requestAnimationFrame(() => {
      void build();
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [
    open,
    report,
    faceBox,
    skinSwatchHex,
    recommendedLipsticks,
    recommendedBlushes,
    recommendedEyeshadows,
  ]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const triggerDownloadPdf = () => {
    if (!bundle) return;
    const pdfBuffer = new Uint8Array(bundle.pdfBytes);
    const blob = new Blob([pdfBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${bundle.fileBaseName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setLastDownloaded("pdf");
    onNotify?.("Đã tải báo cáo PDF (2 trang A4)");
  };

  const triggerDownloadPng = () => {
    if (!bundle) return;
    const a = document.createElement("a");
    a.href = bundle.posterPngDataUrl;
    a.download = `${bundle.fileBaseName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setLastDownloaded("png");
    onNotify?.("Đã tải ảnh báo cáo độ nét cao (PNG)");
  };

  const triggerDownloadJson = () => {
    onExportJson();
    setLastDownloaded("json");
    onNotify?.("Đã xuất dữ liệu phân tích JSON");
  };

  const activePreviewUrl =
    previewPage === "page1" ? bundle?.page1DataUrl : bundle?.page2DataUrl;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-export-title"
      data-testid="report-export-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[920px] max-h-[92vh] bg-white border border-[#E5E5E5] flex flex-col overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-[#E5E5E5] flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0 space-y-0.5">
            <h2
              id="report-export-title"
              className="text-base sm:text-lg font-bold tracking-[-0.02em] text-[#111111]"
            >
              Xuất báo cáo phân tích cá nhân
            </h2>
            <p className="text-xs text-[#666666]">
              Bao gồm tông da CIELAB, bản đồ bất đối xứng đánh dấu đỏ, dáng mặt và gợi ý sản phẩm
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại tải báo cáo"
            className="w-8 h-8 rounded-[4px] border border-[#E5E5E5] hover:border-[#111111] text-[#525252] hover:text-[#111111] inline-flex items-center justify-center shrink-0 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action & Page Switcher Bar */}
        <div className="px-4 sm:px-6 py-3 bg-[#FAFAFA] border-b border-[#E5E5E5] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div
            role="tablist"
            aria-label="Chọn trang xem trước báo cáo"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-0.5 bg-[#EFEFEF] rounded-[4px]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={previewPage === "page1"}
              data-testid="report-preview-tab-page1"
              onClick={() => setPreviewPage("page1")}
              className={`min-w-0 min-h-[32px] px-2 sm:px-3 py-1 text-xs rounded-[3px] truncate transition-colors cursor-pointer ${
                previewPage === "page1"
                  ? "bg-white text-[#111111] font-semibold shadow-2xs"
                  : "text-[#666666] hover:text-[#111111] font-medium"
              }`}
            >
              <span className="sm:hidden">Trang 1 · Tông da</span>
              <span className="hidden sm:inline">Trang 1 · Tông da &amp; Lệch mặt</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={previewPage === "page2"}
              data-testid="report-preview-tab-page2"
              onClick={() => setPreviewPage("page2")}
              className={`min-w-0 min-h-[32px] px-2 sm:px-3 py-1 text-xs rounded-[3px] truncate transition-colors cursor-pointer ${
                previewPage === "page2"
                  ? "bg-white text-[#111111] font-semibold shadow-2xs"
                  : "text-[#666666] hover:text-[#111111] font-medium"
              }`}
            >
              <span className="sm:hidden">Trang 2 · Mỹ phẩm</span>
              <span className="hidden sm:inline">Trang 2 · Dáng mặt &amp; Mỹ phẩm</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              data-testid="download-report-pdf-btn"
              disabled={!bundle || isGenerating}
              onClick={triggerDownloadPdf}
              className="flex-1 sm:flex-none min-h-[36px] px-3 sm:px-4 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              {lastDownloaded === "pdf" ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              <span>Tải PDF (A4)</span>
            </button>

            <button
              type="button"
              data-testid="download-report-png-btn"
              disabled={!bundle || isGenerating}
              onClick={triggerDownloadPng}
              className="flex-1 sm:flex-none min-h-[36px] px-2.5 sm:px-3.5 py-1.5 rounded-[4px] bg-white hover:bg-[#F5F5F5] disabled:opacity-45 text-[#111111] border border-[#D4D4D4] hover:border-[#111111] text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
            >
              {lastDownloaded === "png" ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <FileImage className="w-3.5 h-3.5" />
              )}
              <span className="sm:hidden">Ảnh PNG</span>
              <span className="hidden sm:inline">Tải ảnh PNG (HD)</span>
            </button>

            <button
              type="button"
              data-testid="download-report-json-btn"
              onClick={triggerDownloadJson}
              className="min-h-[36px] px-2 sm:px-2.5 py-1.5 rounded-[4px] border border-[#E5E5E5] sm:border-transparent text-[#525252] hover:text-[#111111] hover:bg-[#EFEFEF] text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer shrink-0"
              title="Tải tệp JSON dữ liệu thô"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Live Rendered Report Preview Viewport */}
        <div className="flex-1 overflow-y-auto bg-[#F0F0F0] p-4 sm:p-6">
          {errorMsg ? (
            <div className="bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] p-4 text-xs">
              {errorMsg}
            </div>
          ) : isGenerating || !activePreviewUrl ? (
            <div className="h-[460px] flex flex-col items-center justify-center gap-3 text-[#525252]">
              <Download className="w-6 h-6 animate-pulse text-[#111111]" />
              <div className="text-xs font-medium">Đang dựng bản in báo cáo độ nét cao…</div>
            </div>
          ) : (
            <div className="max-w-[640px] mx-auto bg-white border border-[#D4D4D4] shadow-md">
              <img
                src={activePreviewUrl}
                data-testid="report-preview-image"
                alt={
                  previewPage === "page1"
                    ? "Xem trước Trang 1 báo cáo tông da và phân tích bất đối xứng"
                    : "Xem trước Trang 2 báo cáo dáng mặt và gợi ý mỹ phẩm"
                }
                className="block w-full h-auto"
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
