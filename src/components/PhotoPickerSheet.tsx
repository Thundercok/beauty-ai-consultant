import React, { useEffect } from "react";
import { Camera, ImagePlus, X } from "lucide-react";

export interface DemoPortraitPreset {
  id: string;
  label: string;
  subtitle: string;
  url: string;
  simulatedCctK?: number;
}

interface PhotoPickerSheetProps {
  open: boolean;
  demoPresets: DemoPortraitPreset[];
  activeDemoId: string | null;
  hasPortrait?: boolean;
  onClose: () => void;
  onPickCamera: () => void;
  onPickGallery: () => void;
  onSelectDemo: (preset: DemoPortraitPreset) => void;
  onClearPortrait?: () => void;
}

export const PhotoPickerSheet: React.FC<PhotoPickerSheetProps> = ({
  open,
  demoPresets,
  activeDemoId,
  hasPortrait = false,
  onClose,
  onPickCamera,
  onPickGallery,
  onSelectDemo,
  onClearPortrait,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-7 sm:p-6 shadow-2xl border border-zinc-200/80 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle on mobile */}
        <div className="sm:hidden w-10 h-1.5 rounded-full bg-zinc-200 mx-auto -mt-1 mb-2" />

        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="photo-sheet-title" className="text-base font-bold text-zinc-900">
              Chọn ảnh chân dung
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Ảnh xử lý trực tiếp trên máy bạn, không gửi lên máy chủ.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại chọn ảnh"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera & Gallery Primary Actions */}
        <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPickCamera();
            }}
            className="w-full min-h-[60px] px-4 py-3 flex items-center gap-3.5 text-left bg-white hover:bg-zinc-50 active:bg-zinc-100 transition-colors cursor-pointer"
          >
            <span className="w-10 h-10 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">Chụp ảnh selfie ngay</div>
              <div className="text-xs text-zinc-500 truncate">
                Mở camera trước để đo tông da &amp; thử màu son
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onPickGallery();
            }}
            className="w-full min-h-[60px] px-4 py-3 flex items-center gap-3.5 text-left bg-white hover:bg-zinc-50 active:bg-zinc-100 transition-colors cursor-pointer"
          >
            <span className="w-10 h-10 rounded-full bg-zinc-100 text-zinc-800 flex items-center justify-center shrink-0">
              <ImagePlus className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-900">Chọn ảnh từ thư viện</div>
              <div className="text-xs text-zinc-500 truncate">
                Dùng ảnh mặt mộc hoặc ảnh chụp ánh sáng tự nhiên
              </div>
            </div>
          </button>
        </div>

        {/* 3 Curated Editorial Demo Portraits */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-zinc-700">Hoặc thử nhanh với ảnh mẫu</div>
          <div className="grid grid-cols-3 gap-2.5">
            {demoPresets.map((preset) => {
              const isSelected = activeDemoId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectDemo(preset);
                  }}
                  className={`group text-left rounded-2xl overflow-hidden border transition-all cursor-pointer ${
                    isSelected
                      ? "border-zinc-900 ring-2 ring-zinc-900/15"
                      : "border-zinc-200 hover:border-zinc-400"
                  }`}
                >
                  <div className="aspect-[3/4] w-full bg-zinc-100 overflow-hidden">
                    <img
                      src={preset.url}
                      alt={preset.label}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover object-top group-hover:scale-[1.03] transition-transform duration-200"
                    />
                  </div>
                  <div className="px-2 py-1.5 bg-white">
                    <div className="text-[11px] font-semibold text-zinc-900 truncate">
                      {preset.label}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">{preset.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-zinc-500 leading-relaxed">
          Mẹo: Chụp chính diện nơi đủ sáng, vén gọn tóc mái và hạn chế dùng filter chỉnh màu để
          kết quả chọn màu son chuẩn nhất.
        </p>

        {hasPortrait && onClearPortrait && (
          <div className="pt-2 border-t border-zinc-100 flex justify-end">
            <button
              type="button"
              onClick={() => {
                onClose();
                onClearPortrait();
              }}
              className="min-h-[38px] px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-rose-700 transition-colors cursor-pointer"
            >
              Xóa ảnh hiện tại
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
