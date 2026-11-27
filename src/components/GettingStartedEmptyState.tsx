import React, { useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Droplets,
  ImagePlus,
  Lamp,
  ScanFace,
  ShoppingBag,
  Sparkles,
  Sun,
} from "lucide-react";
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

const LIGHTING_TIPS: Array<{
  id: string;
  tag: string;
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}> = [
  {
    id: "daylight",
    tag: "Ánh sáng lý tưởng",
    title: "Đứng gần cửa sổ có ánh sáng tự nhiên ban ngày",
    detail:
      "Quay mặt về phía nguồn sáng dịu (tránh nắng gắt chiếu thẳng) giúp hệ thống đọc sắc tố nền da chính xác nhất.",
    icon: Sun,
    accentClass: "bg-amber-50 text-amber-700",
  },
  {
    id: "avoid-mixed",
    tag: "Tránh lệch màu",
    title: "Hạn chế đèn vàng quá tối hoặc đèn LED đổi màu",
    detail:
      "Beauty AI vẫn khử được ánh đèn phòng, nhưng tránh góc ngược sáng hoặc đèn neon giúp kết quả phân loại mùa màu ổn định hơn.",
    icon: Lamp,
    accentClass: "bg-orange-50 text-orange-700",
  },
  {
    id: "bare-skin",
    tag: "Giữ màu da thật",
    title: "Chụp mặt mộc và tắt bộ lọc chỉnh màu",
    detail:
      "Tắt filter làm trắng, làm mịn hay son đậm để đo đúng sắc môi gốc và tìm tông son không bị xỉn khi thoa thật.",
    icon: Sparkles,
    accentClass: "bg-rose-50 text-rose-700",
  },
  {
    id: "framing",
    tag: "Góc chụp rõ nét",
    title: "Giữ camera ngang tầm mắt, vén gọn tóc mái",
    detail:
      "Để lộ rõ vùng trán, hai bên má và viền môi giúp nhận diện đầy đủ 478 điểm khuôn mặt và dáng mặt.",
    icon: ScanFace,
    accentClass: "bg-zinc-100 text-zinc-700",
  },
];

export const GettingStartedEmptyState: React.FC<GettingStartedEmptyStateProps> = ({
  tab,
  demoPresets,
  onPickGallery,
  onPickCamera,
  onSelectDemo,
}) => {
  const [tipIndex, setTipIndex] = useState(0);
  const copy = TAB_COPY[tab];
  const Icon = copy.icon;
  const activeTip = LIGHTING_TIPS[tipIndex];
  const TipIcon = activeTip.icon;

  const handlePrevTip = () =>
    setTipIndex((i) => (i - 1 + LIGHTING_TIPS.length) % LIGHTING_TIPS.length);
  const handleNextTip = () => setTipIndex((i) => (i + 1) % LIGHTING_TIPS.length);

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

      {/* Compact Lighting & Input Quality Tips Carousel (Tone tab empty state) */}
      {tab === "tone" && (
        <div
          data-testid="tone-tips-carousel"
          aria-label="Mẹo ánh sáng chụp ảnh phân tích chuẩn"
          className="pt-5 border-t border-zinc-100 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-900">
              Mẹo ánh sáng để đo tông da chuẩn nhất
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono tabular-nums text-zinc-400 mr-1">
                {tipIndex + 1}/{LIGHTING_TIPS.length}
              </span>
              <button
                type="button"
                onClick={handlePrevTip}
                aria-label="Mẹo trước"
                className="w-8 h-8 rounded-full border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextTip}
                aria-label="Mẹo tiếp theo"
                className="w-8 h-8 rounded-full border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 flex items-center justify-center text-zinc-600 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            key={activeTip.id}
            className="animate-view-enter rounded-2xl bg-[#FAF9F8] border border-zinc-200/80 p-3.5 sm:p-4 flex items-start gap-3.5"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${activeTip.accentClass}`}
            >
              <TipIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[11px] font-semibold text-zinc-500">{activeTip.tag}</div>
              <div className="text-sm font-semibold text-zinc-900 leading-snug">
                {activeTip.title}
              </div>
              <p className="text-xs text-zinc-600 leading-relaxed">{activeTip.detail}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5" role="tablist" aria-label="Chọn mẹo ánh sáng">
            {LIGHTING_TIPS.map((tip, idx) => {
              const active = idx === tipIndex;
              return (
                <button
                  key={tip.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Mẹo ${idx + 1}: ${tip.title}`}
                  onClick={() => setTipIndex(idx)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    active ? "w-5 bg-zinc-900" : "w-1.5 bg-zinc-300 hover:bg-zinc-400"
                  }`}
                />
              );
            })}
          </div>
        </div>
      )}

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
