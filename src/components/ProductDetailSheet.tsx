import React, { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Heart, X } from "lucide-react";
import { deltaEToMatchPercent } from "../lib/beauty/virtualMakeup";
import {
  buildVnShopLinks,
  estimateProductPriceVn,
  evaluateVnStudentTraits,
} from "../lib/beauty/vnBeautyGuide";
import {
  PRODUCT_TYPE_VI_LABELS,
  SEASON_VI_LABELS,
  TEXTURE_VI_LABELS,
} from "../lib/beauty/viLabels";
import type { MatchedProduct, SeasonName } from "../lib/beauty/types";

interface ProductDetailSheetProps {
  product: MatchedProduct | null;
  skinHex: string;
  lipBaseHex: string;
  userSeason: SeasonName;
  isSaved: boolean;
  onClose: () => void;
  onToggleSave: (id: number) => void;
  onTryLipstick: (product: MatchedProduct) => void;
}

export const ProductDetailSheet: React.FC<ProductDetailSheetProps> = ({
  product,
  skinHex,
  lipBaseHex,
  userSeason,
  isSaved,
  onClose,
  onToggleSave,
  onTryLipstick,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [product, onClose]);

  if (!product) return null;

  const isLip = product.productType === "lipstick";
  const matchPct = deltaEToMatchPercent(product.deltaE);
  const typeLabel = PRODUCT_TYPE_VI_LABELS[product.productType] ?? product.productType;
  const textureLabel = TEXTURE_VI_LABELS[product.texture] ?? product.texture;
  const seasonShort = SEASON_VI_LABELS[userSeason].title;
  const priceInfo = estimateProductPriceVn(product.brand, product.productType, product.name);
  const traits = evaluateVnStudentTraits({
    productType: product.productType,
    texture: product.texture,
    hex: product.hex,
    renderedHex: product.renderedHex,
    deltaE: product.deltaE,
  });
  const shopLinks = buildVnShopLinks(product.brand, product.name, product.shade);

  const handleCopy = async () => {
    const text = `${product.brand} ${product.name} ${product.shade}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-sheet-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl border border-zinc-200/80 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Swatch Showcase */}
        <div className="relative">
          <div className="sm:hidden absolute top-2.5 inset-x-0 flex justify-center pointer-events-none z-10">
            <span className="w-10 h-1.5 rounded-full bg-white/75 shadow-xs" />
          </div>

          {isLip && product.renderedHex ? (
            <div className="grid grid-cols-3 h-28">
              <div className="relative" style={{ backgroundColor: lipBaseHex }}>
                <span className="absolute bottom-2 left-2.5 text-[10px] font-medium text-white bg-black/45 px-1.5 py-0.5 rounded-md">
                  Môi mộc
                </span>
              </div>
              <div className="relative" style={{ backgroundColor: product.hex }}>
                <span className="absolute bottom-2 left-2.5 text-[10px] font-medium text-white bg-black/45 px-1.5 py-0.5 rounded-md">
                  Màu thỏi
                </span>
              </div>
              <div className="relative" style={{ backgroundColor: product.renderedHex }}>
                <span className="absolute bottom-2 left-2.5 text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded-md">
                  Lên môi bạn
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 h-28">
              <div className="relative" style={{ backgroundColor: skinHex }}>
                <span className="absolute bottom-2 left-2.5 text-[10px] font-medium text-white bg-black/45 px-1.5 py-0.5 rounded-md">
                  Sắc da bạn
                </span>
              </div>
              <div className="relative" style={{ backgroundColor: product.hex }}>
                <span className="absolute bottom-2 left-2.5 text-[10px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded-md">
                  Màu sản phẩm
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết sản phẩm"
            className="absolute top-3 right-3 min-h-[40px] min-w-[40px] rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-xs transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 pb-7 space-y-4">
          <div className="space-y-1">
            <div className="text-xs text-zinc-500">
              {product.brand} · {typeLabel} · {textureLabel}
            </div>
            <h2 id="product-sheet-title" className="text-lg font-bold text-zinc-900 leading-snug">
              {product.name}
            </h2>
            <div className="text-sm text-zinc-700">{product.shade}</div>
            {traits.badges.length > 0 && (
              <div className="text-xs font-semibold text-rose-700 pt-0.5">
                {traits.badges.join(" · ")}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 py-3 border-y border-zinc-100 text-xs">
            <div>
              <div className="text-zinc-500">Độ hợp da ({seasonShort})</div>
              <div
                className={`text-sm font-bold tabular-nums mt-0.5 ${
                  matchPct >= 90 ? "text-emerald-700" : "text-zinc-900"
                }`}
              >
                {matchPct}% hợp da bạn
              </div>
            </div>
            <div className="text-right">
              <div className="text-zinc-500">Giá tham khảo VN</div>
              <div className="text-sm font-bold text-zinc-900 tabular-nums mt-0.5">
                {priceInfo.priceRangeLabel}
              </div>
            </div>
          </div>

          <p className="text-xs text-zinc-600 leading-relaxed">
            {isLip
              ? "Màu đã được tính sẵn độ hòa trộn với sắc môi mộc của bạn để khi mua về đánh thật sẽ không bị lệch tông hay xỉn da."
              : `Gam màu hài hòa với sắc da ${seasonShort}, dễ đánh mỏng hằng ngày khi đi học hoặc đi chơi mà không làm nặng mặt.`}
          </p>

          <div className="space-y-2.5 pt-1">
            {isLip && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTryLipstick(product);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                Thử màu son này lên môi
              </button>
            )}

            {/* Quick-Buy Links: Shopee & TikTok Shop */}
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={shopLinks.shopeeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3 py-2 rounded-2xl bg-[#EE4D2D] hover:bg-[#d84324] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Tìm trên Shopee</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              <a
                href={shopLinks.tiktokShopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[42px] px-3 py-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>Tìm TikTok Shop</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => onToggleSave(product.id)}
                className={`min-h-[42px] px-3 py-2 rounded-2xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  isSaved
                    ? "bg-rose-50 border-rose-200 text-rose-700"
                    : "bg-white border-zinc-200 text-zinc-800 hover:bg-zinc-50"
                }`}
              >
                <Heart className={`w-4 h-4 ${isSaved ? "fill-rose-600 text-rose-600" : ""}`} />
                <span>{isSaved ? "Đã lưu" : "Lưu lại"}</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="min-h-[42px] px-3 py-2 rounded-2xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-700" />
                    <span className="text-emerald-700">Đã sao chép</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Chép tên màu</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
