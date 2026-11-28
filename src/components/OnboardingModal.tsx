import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ShieldCheck, Sparkles, Sun, X } from "lucide-react";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const SLIDES = [
  {
    step: "01 / 03",
    icon: Sparkles,
    title: "Biết tông da, thử son và chọn mỹ phẩm hợp mặt",
    body: "Tải ảnh rõ mặt hoặc chụp trực tiếp để xem tông da, thử màu son lên nền môi thật và tra cứu 217 món mỹ phẩm phổ biến — miễn phí, không cần tạo tài khoản.",
    bullets: [
      "Tự cân bằng ánh đèn phòng để xem màu da và dáng mặt của bạn.",
      "Thử son, má hồng và so sánh trực tiếp trên chính gương mặt mình.",
      "Xem trước toàn bộ danh mục mỹ phẩm và lưu món yêu thích bất cứ lúc nào.",
    ],
  },
  {
    step: "02 / 03",
    icon: Sun,
    title: "Mẹo chụp ảnh chuẩn & lưu ý nhỏ",
    body: "Ánh sáng tự nhiên giúp đo màu sát nhất. Nếu ảnh quá tối, ngược sáng hoặc mờ mặt, ứng dụng sẽ báo để bạn chụp lại thay vì đoán bừa.",
    bullets: [
      "Đứng gần cửa sổ ban ngày, tắt filter chỉnh màu và vén gọn tóc mái.",
      "Kết quả dùng để tham khảo chọn màu trang điểm, không thay thế khám da liễu.",
      "Giá mỹ phẩm là mức tham khảo tại Việt Nam, có thể khác tùy nơi bán.",
    ],
  },
  {
    step: "03 / 03",
    icon: ShieldCheck,
    title: "Ảnh luôn ở yên trên máy bạn",
    body: "Mọi bước nhận diện khuôn mặt và đo màu đều chạy ngay trên thiết bị. Ảnh chân dung của bạn không bao giờ bị tải lên máy chủ.",
    bullets: [
      "Lịch sử chỉ lưu các thông số màu gọn nhẹ, không lưu ảnh gốc.",
      "Dữ liệu lưu riêng trên trình duyệt này và không tự đồng bộ sang máy khác.",
      "Bạn có thể xóa từng mục hoặc xóa hết trong tab Hồ sơ bất cứ lúc nào.",
    ],
  },
] as const;

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  open,
  onComplete,
  onSkip,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIdx(0);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkip();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onSkip]);

  if (!open || typeof document === "undefined") return null;

  const slide = SLIDES[stepIdx];
  const Icon = slide.icon;
  const isLast = stepIdx === SLIDES.length - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSkip();
      }}
    >
      <div className="w-full max-w-lg bg-white border border-[#E5E5E5] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-[4px] bg-[#111111] text-white flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <span className="font-mono text-xs font-semibold text-[#525252]">{slide.step}</span>
          </div>

          <button
            type="button"
            data-testid="onboarding-skip-btn"
            onClick={onSkip}
            className="min-h-[32px] px-2.5 text-xs font-medium text-[#666666] hover:text-[#111111] inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Bỏ qua</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <h2
              id="onboarding-title"
              className="text-lg sm:text-xl font-bold tracking-[-0.02em] text-[#111111] leading-snug"
            >
              {slide.title}
            </h2>
            <p className="text-xs sm:text-sm text-[#525252] leading-relaxed">{slide.body}</p>
          </div>

          <ul className="space-y-2.5 pt-1">
            {slide.bullets.map((line, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 text-xs text-[#262626] leading-relaxed bg-[#FAFAFA] border border-[#EFEFEF] px-3 py-2.5"
              >
                <span className="font-mono text-[11px] font-bold text-[#DC2626] shrink-0 mt-0.5">
                  0{i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 py-4 border-t border-[#E5E5E5] bg-[#FAFAFA] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {SLIDES.map((s, idx) => (
              <span
                key={s.step}
                className={`h-1.5 rounded-full transition-all ${
                  idx === stepIdx ? "w-6 bg-[#111111]" : "w-1.5 bg-[#D4D4D4]"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                className="min-h-[38px] px-3.5 py-1.5 rounded-[4px] border border-[#D4D4D4] hover:border-[#111111] bg-white text-xs font-medium text-[#111111] cursor-pointer"
              >
                Quay lại
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                data-testid="onboarding-finish-btn"
                onClick={onComplete}
                className="min-h-[38px] px-4 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Bắt đầu sử dụng</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                data-testid="onboarding-next-btn"
                onClick={() => setStepIdx((i) => Math.min(SLIDES.length - 1, i + 1))}
                className="min-h-[38px] px-4 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Tiếp tục</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
