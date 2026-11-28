import React, { useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Droplets,
  HelpCircle,
  ImagePlus,
  Lamp,
  ScanFace,
  ShieldCheck,
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
  onOpenOnboarding?: () => void;
  onBrowseCatalog?: () => void;
}

const TAB_COPY: Record<
  EmptyStateTab,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  tone: {
    title: "Xem tông da & chọn màu hợp mặt",
    description:
      "Chọn ảnh rõ mặt hoặc chụp trực tiếp. Ảnh xử lý ngay trên máy, không tải lên máy chủ.",
    icon: ScanFace,
  },
  tryon: {
    title: "Thử son trên màu môi thật của bạn",
    description:
      "Tải một bức ảnh chính diện để xem màu son và má hồng lên da bạn trông ra sao.",
    icon: Droplets,
  },
  shop: {
    title: "Xếp hạng mỹ phẩm theo tông da của bạn",
    description:
      "Tải ảnh chân dung để sắp xếp 217 mã son, má hồng và phấn mắt theo độ hợp với màu da và môi thật.",
    icon: ShoppingBag,
  },
  insights: {
    title: "Xem bản đồ độ lệch, dáng mặt & sắc da",
    description:
      "Tải ảnh chính diện để xem các vùng lệch trên mặt, gợi ý chỉnh đường nét và thử ánh đèn phòng.",
    icon: Sparkles,
  },
};

const LIGHTING_TIPS: Array<{
  id: string;
  tag: string;
  title: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "daylight",
    tag: "Ánh sáng",
    title: "Đứng gần cửa sổ ban ngày",
    detail:
      "Quay mặt về phía ánh sáng dịu và tránh nắng chiếu gắt để màu da hiện đúng nhất.",
    icon: Sun,
  },
  {
    id: "avoid-mixed",
    tag: "Đèn phòng",
    title: "Tránh ngược sáng hoặc đèn màu",
    detail:
      "Đèn vàng tối hoặc đèn LED đổi màu dễ làm lệch sắc da khi chụp trong phòng.",
    icon: Lamp,
  },
  {
    id: "bare-skin",
    tag: "Mặt mộc",
    title: "Tắt filter chỉnh màu khi chụp",
    detail:
      "Giữ ảnh gốc không làm trắng hay tô son đậm giúp chọn màu son sát với ngoài đời hơn.",
    icon: Sparkles,
  },
  {
    id: "framing",
    tag: "Góc mặt",
    title: "Nhìn thẳng máy ảnh, vén gọn tóc mái",
    detail:
      "Để lộ rõ trán, hai má và đường hàm giúp đo dáng mặt và độ cân đối chính xác hơn.",
    icon: ScanFace,
  },
];

export const GettingStartedEmptyState: React.FC<GettingStartedEmptyStateProps> = ({
  tab,
  demoPresets,
  onPickGallery,
  onPickCamera,
  onSelectDemo,
  onOpenOnboarding,
  onBrowseCatalog,
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
      className="max-w-4xl mx-auto bg-white border border-[#E5E5E5] p-5 sm:p-8 space-y-6"
    >
      {/* Hero / Entry Actions */}
      <div className="flex flex-col items-center text-center space-y-4 max-w-xl mx-auto">
        <div className="w-10 h-10 rounded-[4px] bg-[#111111] text-white flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl sm:text-[28px] font-bold tracking-[-0.03em] text-[#111111] leading-tight text-balance">
            {copy.title}
          </h1>
          <p className="text-xs sm:text-sm text-[#525252] leading-relaxed text-pretty">
            {copy.description}
          </p>
        </div>

        {/* Primary & Secondary Capture Actions */}
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1">
          <button
            type="button"
            data-testid="empty-upload-btn"
            onClick={onPickGallery}
            className="min-h-[44px] px-5 py-2.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ImagePlus className="w-4 h-4" />
            <span>Chọn ảnh từ máy</span>
          </button>

          <button
            type="button"
            data-testid="empty-camera-btn"
            onClick={onPickCamera}
            className="min-h-[44px] px-5 py-2.5 rounded-[4px] bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#D4D4D4] hover:border-[#111111] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-4 h-4" />
            <span>Chụp selfie</span>
          </button>
        </div>

        {/* Secondary Guest Links: Browse Catalog + Onboarding/Privacy */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-0.5 text-xs">
          {onBrowseCatalog && tab === "tone" && (
            <button
              type="button"
              onClick={onBrowseCatalog}
              className="font-semibold text-[#111111] hover:text-[#DC2626] underline underline-offset-4 cursor-pointer"
            >
              Xem trước 217 sản phẩm
            </button>
          )}
          {onOpenOnboarding && (
            <button
              type="button"
              data-testid="empty-open-onboarding-btn"
              onClick={onOpenOnboarding}
              className="inline-flex items-center gap-1 text-[#525252] hover:text-[#111111] cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Lưu ý chụp ảnh &amp; riêng tư</span>
            </button>
          )}
        </div>

        <p className="inline-flex items-center gap-1.5 text-[11px] text-[#737373]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#525252] shrink-0" />
          <span>Xử lý trực tiếp trên máy · Không cần đăng nhập</span>
        </p>
      </div>

      {/* Compact Lighting & Input Quality Tips Carousel (Tone tab empty state) */}
      {tab === "tone" && (
        <div
          data-testid="tone-tips-carousel"
          aria-label="Mẹo chụp ảnh rõ màu da"
          className="pt-5 border-t border-[#EFEFEF] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-[#111111]">
              Chụp sao cho chuẩn màu da
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-mono tabular-nums text-[#737373] mr-1">
                {tipIndex + 1}/{LIGHTING_TIPS.length}
              </span>
              <button
                type="button"
                onClick={handlePrevTip}
                aria-label="Mẹo trước"
                className="w-8 h-8 rounded-[4px] border border-[#E5E5E5] hover:border-[#111111] flex items-center justify-center text-[#525252] transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextTip}
                aria-label="Mẹo tiếp theo"
                className="w-8 h-8 rounded-[4px] border border-[#E5E5E5] hover:border-[#111111] flex items-center justify-center text-[#525252] transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            key={activeTip.id}
            className="animate-view-enter bg-[#FAFAFA] border border-[#E5E5E5] p-3.5 sm:p-4 flex items-start gap-3.5"
          >
            <div className="w-9 h-9 rounded-[4px] bg-white border border-[#E5E5E5] text-[#111111] flex items-center justify-center shrink-0">
              <TipIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-[11px] font-mono uppercase tracking-[0.04em] font-semibold text-[#666666]">
                {activeTip.tag}
              </div>
              <div className="text-sm font-semibold text-[#111111] leading-snug">
                {activeTip.title}
              </div>
              <p className="text-xs text-[#525252] leading-relaxed">{activeTip.detail}</p>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Optional Demo Mode */}
      {demoPresets.length > 0 && (
        <div
          data-testid="empty-demo-section"
          className="pt-5 border-t border-[#EFEFEF] space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
            <span className="text-xs font-bold text-[#111111]">
              Hoặc dùng thử với ảnh mẫu
            </span>
            <span className="text-[11px] text-[#666666]">
              Kết quả minh họa, không phải sắc da của bạn
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {demoPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                data-testid={`demo-preset-${preset.id}`}
                onClick={() => onSelectDemo(preset)}
                className="group text-left overflow-hidden border border-[#E5E5E5] hover:border-[#111111] transition-colors bg-white cursor-pointer"
              >
                <div className="aspect-[4/4] sm:aspect-[4/3] w-full bg-[#F5F5F5] overflow-hidden relative">
                  <img
                    src={preset.url}
                    alt={`Ảnh mẫu: ${preset.label}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-[50%_22%] group-hover:scale-[1.03] transition-transform duration-200"
                  />
                  <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-mono px-1.5 py-0.5 rounded-[2px]">
                    DEMO
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <div className="text-xs font-semibold text-[#111111] truncate">
                    {preset.label}
                  </div>
                  <div className="text-[11px] text-[#666666] truncate">{preset.subtitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
