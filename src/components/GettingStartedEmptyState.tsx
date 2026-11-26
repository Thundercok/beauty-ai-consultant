import React from "react";
import { Camera, Droplets, ImagePlus, ScanFace, ShoppingBag, Sparkles } from "lucide-react";
import type { DemoPortraitPreset } from "./PhotoPickerSheet";

export type EmptyStateTab = "tone" | "tryon" | "shop" | "insights";

interface GettingStartedEmptyStateProps {
  tab: EmptyStateTab;
  demoPresets: DemoPortraitPreset[];
  onPickGallery: () => void;
  onPickCamera: () => void;
  onSelectDemo: (preset: DemoPortraitPreset) => void;
}

const TAB_COPY: Record<
  EmptyStateTab,
  {
    eyebrow: string;
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  tone: {
    eyebrow: "Bắt đầu phân tích tông da",
    title: "Tải ảnh chân dung để đo tông màu cá nhân",
    description:
      "Beauty AI tự động khử ánh đèn vàng hoặc đèn lạnh trong phòng, đo sắc da chuẩn CIELAB và gợi ý bảng phối màu mắt · má · son hợp da bạn nhất.",
    icon: ScanFace,
  },
  tryon: {
    eyebrow: "Chưa có ảnh chân dung",
    title: "Tải ảnh lên để thử màu son trực tiếp lên môi bạn",
    description:
      "Hệ thống cần đo sắc môi tự nhiên và nhận diện dáng môi từ ảnh chân dung của bạn trước khi mô phỏng màu son và má hồng chân thực.",
    icon: Droplets,
  },
  shop: {
    eyebrow: "Chưa có hồ sơ tông da",
    title: "Phân tích ảnh chân dung để nhận gợi ý mỹ phẩm khớp da",
    description:
      "Sau khi tải ảnh, Beauty AI sẽ lọc hơn 180 mã son, má hồng và phấn mắt theo đúng sắc da và nền môi của bạn để tránh mua nhầm tông.",
    icon: ShoppingBag,
  },
  insights: {
    eyebrow: "Chưa có dữ liệu phân tích",
    title: "Tải ảnh chân dung để mở bản đồ sắc tố & ánh đèn phòng",
    description:
      "Tải lên một ảnh mặt mộc hoặc selfie bất kỳ để xem mô phỏng ánh sáng 3200K–6500K, phân bố Melanin/Hemoglobin và các chỉ số màu học chi tiết.",
    icon: Sparkles,
  },
};

const STEPS = [
  {
    num: "01",
    title: "Chọn ảnh chân dung",
    detail: "Tải ảnh từ thư viện hoặc chụp selfie chính diện, vén gọn tóc mái.",
  },
  {
    num: "02",
    title: "Tự động khử ánh đèn",
    detail: "Cân bằng đèn phòng về ánh sáng chuẩn và xác định 12 nhóm mùa màu.",
  },
  {
    num: "03",
    title: "Thử son & chọn mỹ phẩm",
    detail: "Xem màu son lên đúng sắc môi thật và lưu các sản phẩm hợp da nhất.",
  },
];

export const GettingStartedEmptyState: React.FC<GettingStartedEmptyStateProps> = ({
  tab,
  demoPresets,
  onPickGallery,
  onPickCamera,
  onSelectDemo,
}) => {
  const copy = TAB_COPY[tab];
  const Icon = copy.icon;

  return (
    <section
      data-testid={`getting-started-${tab}`}
      aria-label="Hướng dẫn bắt đầu phân tích chân dung"
      className="max-w-3xl mx-auto bg-white rounded-3xl border border-zinc-200/85 p-5 sm:p-8 shadow-[0_2px_20px_rgba(0,0,0,0.03)] space-y-6"
    >
      {/* Header & Value Explanation */}
      <div className="flex flex-col items-center text-center space-y-3 max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-700 flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-rose-700">{copy.eyebrow}</div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 text-balance">
            {copy.title}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-600 leading-relaxed text-pretty">
            {copy.description}
          </p>
        </div>

        {/* Primary & Secondary Upload Actions */}
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-2">
          <button
            type="button"
            onClick={onPickGallery}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4" />
            <span>Tải ảnh chân dung</span>
          </button>

          <button
            type="button"
            onClick={onPickCamera}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-4 h-4" />
            <span>Chụp selfie ngay</span>
          </button>
        </div>

        <p className="text-[11px] text-zinc-500">
          Ảnh được xử lý trực tiếp trên thiết bị của bạn, không tải lên máy chủ.
        </p>
      </div>

      {/* 3-Step Getting Started Guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-5 border-t border-zinc-100">
        {STEPS.map((step) => (
          <div key={step.num} className="space-y-1 px-1">
            <div className="text-[11px] font-mono font-semibold text-rose-700">{step.num}</div>
            <div className="text-xs font-semibold text-zinc-900">{step.title}</div>
            <p className="text-xs text-zinc-600 leading-relaxed">{step.detail}</p>
          </div>
        ))}
      </div>

      {/* Quick Demo Presets Strip */}
      {demoPresets.length > 0 && (
        <div className="pt-5 border-t border-zinc-100 space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-zinc-900">
              Hoặc trải nghiệm ngay với ảnh mẫu
            </span>
            <span className="text-[11px] text-zinc-500">Chạm để phân tích ngay</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {demoPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectDemo(preset)}
                className="group text-left rounded-2xl overflow-hidden border border-zinc-200 hover:border-zinc-400 transition-colors bg-white cursor-pointer"
              >
                <div className="aspect-[4/4] sm:aspect-[4/3] w-full bg-zinc-100 overflow-hidden">
                  <img
                    src={preset.url}
                    alt={preset.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-[50%_22%] group-hover:scale-[1.03] transition-transform duration-200"
                  />
                </div>
                <div className="px-2.5 py-2">
                  <div className="text-xs font-semibold text-zinc-900 truncate">{preset.label}</div>
                  <div className="text-[11px] text-zinc-500 truncate">{preset.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
