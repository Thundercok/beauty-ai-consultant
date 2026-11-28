import React from "react";
import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
      className="fixed bottom-16 md:bottom-4 left-4 z-50 flex items-center gap-2 rounded-[4px] bg-[#111111] text-white border border-white/15 px-3 py-2 text-xs font-medium shadow-lg"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
      <span>Đang ngoại tuyến — Danh mục &amp; dữ liệu đã lưu vẫn dùng bình thường.</span>
    </div>
  );
};
