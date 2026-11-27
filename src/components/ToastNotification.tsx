import React from "react";
import { CheckCircle2, Heart, SlidersHorizontal, Sparkles } from "lucide-react";

export type ToastTone = "success" | "heart" | "setting" | "info";

export interface ToastMessage {
  id: number;
  text: string;
  tone: ToastTone;
}

interface ToastNotificationProps {
  toast: ToastMessage | null;
}

const ICON_MAP: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  heart: Heart,
  setting: SlidersHorizontal,
  info: Sparkles,
};

const ACCENT_MAP: Record<ToastTone, string> = {
  success: "text-emerald-400",
  heart: "text-rose-400",
  setting: "text-amber-300",
  info: "text-zinc-300",
};

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toast }) => {
  if (!toast) return null;

  const Icon = ICON_MAP[toast.tone];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="floating-toast"
      className="fixed bottom-[72px] md:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-4 w-full flex justify-center"
    >
      <div
        key={toast.id}
        className="animate-view-enter inline-flex items-center gap-2 max-w-[360px] bg-zinc-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-[0_8px_28px_rgba(0,0,0,0.22)] border border-white/10"
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${ACCENT_MAP[toast.tone]} ${
            toast.tone === "heart" ? "fill-rose-400" : ""
          }`}
          aria-hidden="true"
        />
        <span className="text-xs font-medium leading-snug truncate">{toast.text}</span>
      </div>
    </div>
  );
};
