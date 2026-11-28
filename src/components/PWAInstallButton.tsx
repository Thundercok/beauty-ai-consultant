import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Download, Share, Smartphone, X } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

interface PWAInstallButtonProps {
  variant?: "header" | "card";
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = "header" }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === "card") {
      return (
        <div className="text-xs font-medium text-emerald-700 inline-flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Ứng dụng đã được cài đặt trên thiết bị này</span>
        </div>
      );
    }
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={() => void install()}
        className={
          variant === "header"
            ? "hidden sm:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#111111] bg-white hover:bg-[#F5F5F5] border border-[#D4D4D4] hover:border-[#111111] rounded-[4px] whitespace-nowrap transition-colors cursor-pointer"
            : "min-h-[38px] px-4 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
        }
      >
        <Download className="w-3.5 h-3.5" />
        <span>Cài đặt ứng dụng</span>
      </button>
    );
  }

  if (isIOS || variant === "card") {
    return (
      <>
        <button
          type="button"
          data-testid="pwa-ios-guide-btn"
          onClick={() => setShowIOSGuide(true)}
          className={
            variant === "header"
              ? "hidden sm:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-[#111111] bg-white hover:bg-[#F5F5F5] border border-[#D4D4D4] hover:border-[#111111] rounded-[4px] whitespace-nowrap transition-colors cursor-pointer"
              : "min-h-[38px] px-3.5 py-1.5 rounded-[4px] bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#D4D4D4] hover:border-[#111111] text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
          }
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>{isIOS ? "Thêm vào màn hình chính (iOS)" : "Hướng dẫn cài lên màn hình chính"}</span>
        </button>

        {showIOSGuide &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-guide-title"
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
              onClick={(e) => {
                if (e.target === e.currentTarget) setShowIOSGuide(false);
              }}
            >
              <div className="w-full max-w-sm bg-white border border-[#E5E5E5] p-5 space-y-4 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 id="pwa-guide-title" className="text-base font-bold text-[#111111]">
                      Thêm Beauty AI vào màn hình chính
                    </h3>
                    <p className="text-xs text-[#666666] mt-0.5">
                      Mở nhanh như ứng dụng, không cần tải từ cửa hàng ứng dụng.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowIOSGuide(false)}
                    aria-label="Đóng hướng dẫn cài đặt"
                    className="w-8 h-8 rounded-[4px] border border-[#E5E5E5] hover:border-[#111111] text-[#525252] flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <ol className="space-y-2.5 text-xs text-[#404040] leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-[#111111]">01</span>
                    <span>
                      Trên <strong>iPhone / iPad (Safari)</strong>: chạm biểu tượng{" "}
                      <strong className="inline-flex items-center gap-0.5 text-[#111111]">
                        <Share className="w-3 h-3 inline" /> Chia sẻ
                      </strong>{" "}
                      ở thanh công cụ trình duyệt, sau đó chọn{" "}
                      <strong>Thêm vào MH chính (Add to Home Screen)</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-mono font-bold text-[#111111]">02</span>
                    <span>
                      Trên <strong>Android (Chrome)</strong> hoặc <strong>máy tính</strong>: mở
                      menu trình duyệt và chọn <strong>Cài đặt ứng dụng</strong>.
                    </span>
                  </li>
                </ol>

                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-full min-h-[38px] rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Đã hiểu
                </button>
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }

  return null;
};
