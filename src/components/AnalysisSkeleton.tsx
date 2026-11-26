import React from "react";

export const PortraitSkeleton: React.FC<{
  className?: string;
  variant?: "light" | "studio";
  statusMessage?: string;
}> = ({ className = "", variant = "light", statusMessage = "Đang xử lý ảnh chân dung…" }) => {
  const isStudio = variant === "studio";
  return (
    <div
      role="status"
      aria-label={statusMessage}
      className={`w-full flex flex-col items-center justify-center p-6 aspect-[4/5] max-h-[340px] sm:max-h-[420px] ${
        isStudio ? "bg-[#161514]" : "bg-[#F5F3F0]"
      } ${className}`}
    >
      <div
        className={`relative w-36 h-44 sm:w-44 sm:h-52 rounded-[999px] flex flex-col items-center justify-center ${
          isStudio ? "bg-white/10 animate-pulse" : "skeleton-shimmer"
        }`}
      >
        <div
          className={`w-16 h-20 sm:w-20 sm:h-24 rounded-full mb-2 ${
            isStudio ? "bg-white/15" : "bg-white/55"
          }`}
        />
        <div
          className={`w-24 h-8 sm:w-28 sm:h-10 rounded-t-full ${
            isStudio ? "bg-white/10" : "bg-white/45"
          }`}
        />
      </div>

      <div
        className={`mt-5 text-xs font-medium ${
          isStudio ? "text-white/75" : "text-zinc-500"
        }`}
      >
        {statusMessage}
      </div>
    </div>
  );
};

export const ResultsSkeleton: React.FC = () => {
  return (
    <div
      role="status"
      aria-label="Đang phân tích tông da và gợi ý màu"
      className="space-y-4 sm:space-y-5"
    >
      <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="space-y-3">
          <div className="h-3 w-40 rounded-full skeleton-shimmer" />
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg skeleton-shimmer shrink-0" />
            <div className="h-7 w-56 sm:w-64 rounded-lg skeleton-shimmer" />
          </div>
          <div className="h-4 w-3/4 rounded-full skeleton-shimmer" />
          <div className="space-y-2 pt-1">
            <div className="h-3.5 w-full rounded-full skeleton-shimmer" />
            <div className="h-3.5 w-5/6 rounded-full skeleton-shimmer" />
          </div>
        </div>

        <div className="pt-4 border-t border-zinc-100 space-y-3">
          <div className="h-3 w-52 rounded-full skeleton-shimmer" />
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="border border-zinc-200/80 rounded-xl overflow-hidden">
                <div className="h-14 sm:h-16 w-full skeleton-shimmer" />
                <div className="p-2.5 bg-white space-y-1.5">
                  <div className="h-3 w-14 rounded-full skeleton-shimmer" />
                  <div className="h-2.5 w-12 rounded-full skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <div className="h-5 w-48 rounded-md skeleton-shimmer" />
          <div className="h-3 w-24 rounded-full skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="space-y-2">
              <div className="h-3 w-full rounded-full skeleton-shimmer" />
              <div className="h-3 w-4/5 rounded-full skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Đang phân tích tông da và gợi ý màu trang điểm...</span>
    </div>
  );
};
