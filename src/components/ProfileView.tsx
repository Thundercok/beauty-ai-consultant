import React, { useMemo, useState } from "react";
import {
  Bookmark,
  Camera,
  HardDrive,
  Heart,
  HelpCircle,
  History,
  Palette,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { PWAInstallButton } from "./PWAInstallButton";
import type {
  AnalysisHistoryEntry,
  LocalProfileSnapshot,
  SavedPaletteEntry,
  UserBeautyPreferences,
} from "../lib/beauty/localProfileStore";
import {
  PRODUCT_TYPE_VI_LABELS,
  SEASON_VI_LABELS,
  SHAPE_VI_LABELS,
  TEXTURE_VI_LABELS,
  UNDERTONE_VI_LABELS,
} from "../lib/beauty/viLabels";
import { catalogProductToBrowseItem } from "../lib/beauty/recommendationIntegrity";
import { estimateProductPriceVn } from "../lib/beauty/vnBeautyGuide";
import type {
  CatalogProduct,
  MatchedProduct,
  OccasionType,
  SkinTextureType,
} from "../lib/beauty/types";

interface ProfileViewProps {
  profile: LocalProfileSnapshot;
  products: CatalogProduct[];
  hasActiveReport: boolean;
  onSaveCurrentPalette: () => void;
  onDeleteAnalysis: (id: string) => void;
  onDeletePalette: (id: string) => void;
  onRemoveSavedProduct: (id: number) => void;
  onInspectCatalogProduct: (product: MatchedProduct) => void;
  onUpdatePreferences: (partial: Partial<UserBeautyPreferences>) => void;
  onClearAllData: () => void;
  onOpenOnboarding: () => void;
  onOpenPhotoPicker: () => void;
  onOpenCatalog: () => void;
}

const OCCASION_LABELS: Record<OccasionType, string> = {
  daily: "Đi học / Hằng ngày",
  office: "Đi chơi / Công sở",
  glam: "Đi tiệc / Nổi bật",
};

const TEXTURE_LABELS: Record<SkinTextureType, string> = {
  combination: "Da hỗn hợp",
  oily: "Da dầu",
  dry: "Da khô",
};

function formatDateTimeVi(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function catalogProductToInspectable(p: CatalogProduct): MatchedProduct {
  return catalogProductToBrowseItem(p);
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  products,
  hasActiveReport,
  onSaveCurrentPalette,
  onDeleteAnalysis,
  onDeletePalette,
  onRemoveSavedProduct,
  onInspectCatalogProduct,
  onUpdatePreferences,
  onClearAllData,
  onOpenOnboarding,
  onOpenPhotoPicker,
  onOpenCatalog,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  const savedProducts = useMemo(() => {
    const idSet = new Set(profile.savedProductIds);
    return products.filter((p) => idSet.has(p.id));
  }, [products, profile.savedProductIds]);

  const storageLabel =
    profile.storageBackend === "memory"
      ? "Lưu tạm phiên này"
      : "Lưu riêng trên máy này";

  return (
    <div data-testid="profile-view" className="space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#E5E5E5]">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-[30px] font-bold tracking-[-0.03em] text-[#111111] leading-tight">
            {profile.preferences.displayName.trim()
              ? `Hồ sơ của ${profile.preferences.displayName.trim()}`
              : "Hồ sơ của tôi"}
          </h1>
          <p className="text-xs sm:text-sm text-[#666666]">
            Lịch sử đo màu, bảng màu đã lưu và các món mỹ phẩm bạn đánh dấu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenOnboarding}
            className="min-h-[36px] px-3 py-1.5 rounded-[4px] border border-[#D4D4D4] hover:border-[#111111] bg-white text-xs font-medium text-[#111111] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Hướng dẫn</span>
          </button>
          <button
            type="button"
            onClick={onOpenPhotoPicker}
            className="min-h-[36px] px-3.5 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Đo ảnh mới</span>
          </button>
        </div>
      </div>

      {/* Local-Only Privacy & Storage Disclosure */}
      <div
        data-testid="privacy-local-notice"
        className="bg-[#FAFAFA] border border-[#E5E5E5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-[4px] bg-white border border-[#E5E5E5] text-[#111111] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-[#111111]">
              Dữ liệu chỉ lưu trên máy này
            </div>
            <p className="text-xs text-[#666666] leading-relaxed">
              Không lưu ảnh gốc và không gửi đi đâu. Thông tin nằm riêng trên trình duyệt hiện tại,{" "}
              <strong className="font-medium text-[#404040]">không tự đồng bộ sang máy khác</strong>.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 text-[11px] text-[#525252] bg-white border border-[#E5E5E5] px-2.5 py-1.5 rounded-[4px] shrink-0 self-start sm:self-center">
          <HardDrive className="w-3.5 h-3.5" />
          <span>{storageLabel}</span>
        </div>
      </div>

      {/* Main 2-Column Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 cols: Analysis History + Saved Palettes */}
        <div className="lg:col-span-7 space-y-6">
          {/* Analysis History */}
          <section
            data-testid="profile-history-section"
            className="bg-white border border-[#E5E5E5] p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#EFEFEF]">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#111111]" />
                <h2 className="text-sm sm:text-base font-bold text-[#111111]">
                  Lịch sử phân tích ({profile.analyses.length})
                </h2>
              </div>
              <span className="text-[11px] text-[#737373]">Tối đa 25 lần gần nhất</span>
            </div>

            {profile.analyses.length === 0 ? (
              <div className="py-6 text-center space-y-2.5">
                <p className="text-xs text-[#666666]">
                  Chưa có lần phân tích nào được lưu. Khi bạn phân tích một ảnh chân dung hợp lệ, tóm tắt sắc da sẽ tự động lưu tại đây.
                </p>
                <button
                  type="button"
                  onClick={onOpenPhotoPicker}
                  className="min-h-[36px] px-4 py-1.5 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold cursor-pointer"
                >
                  Bắt đầu phân tích ảnh
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {profile.analyses.map((entry: AnalysisHistoryEntry) => {
                  const seasonVi = SEASON_VI_LABELS[entry.season]?.title ?? entry.season;
                  const shapeVi = SHAPE_VI_LABELS[entry.faceShape] ?? entry.faceShape;
                  const undertoneVi = UNDERTONE_VI_LABELS[entry.undertone] ?? entry.undertone;
                  return (
                    <div
                      key={entry.id}
                      data-testid="history-entry-row"
                      className="border border-[#E5E5E5] bg-[#FAFAFA] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="flex flex-col gap-1 shrink-0 pt-0.5" aria-hidden="true">
                          <span
                            className="w-8 h-8 rounded-[3px] border border-black/15"
                            style={{ backgroundColor: entry.skinHex }}
                            title="Màu da đo được"
                          />
                          <div className="grid grid-cols-3 gap-0.5">
                            <span
                              className="h-2 rounded-[1px]"
                              style={{ backgroundColor: entry.targetLipHex }}
                            />
                            <span
                              className="h-2 rounded-[1px]"
                              style={{ backgroundColor: entry.targetBlushHex }}
                            />
                            <span
                              className="h-2 rounded-[1px]"
                              style={{ backgroundColor: entry.targetEyeshadowHex }}
                            />
                          </div>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-xs sm:text-sm font-bold text-[#111111]">
                              {seasonVi}
                            </span>
                            {entry.isDemo && (
                              <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-[2px]">
                                Ảnh mẫu (Demo)
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#525252]">
                            {undertoneVi} · Mặt {shapeVi} · Chất lượng ảnh {entry.reliabilityScore}%
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-[#737373]">
                            L* {entry.L_star.toFixed(1)} · a* {entry.a_star.toFixed(1)} · b*{" "}
                            {entry.b_star.toFixed(1)} · {formatDateTimeVi(entry.createdAt)}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteAnalysis(entry.id)}
                        aria-label={`Xóa bản ghi phân tích ${seasonVi}`}
                        className="min-h-[34px] px-2.5 py-1 rounded-[4px] border border-[#E5E5E5] hover:border-[#DC2626] text-[#666666] hover:text-[#DC2626] bg-white text-xs inline-flex items-center gap-1 self-end sm:self-center shrink-0 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Xóa</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Saved Palettes */}
          <section
            data-testid="profile-palettes-section"
            className="bg-white border border-[#E5E5E5] p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#EFEFEF]">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#111111]" />
                <h2 className="text-sm sm:text-base font-bold text-[#111111]">
                  Bảng màu đã lưu ({profile.palettes.length})
                </h2>
              </div>
              {hasActiveReport && (
                <button
                  type="button"
                  data-testid="profile-save-current-palette-btn"
                  onClick={onSaveCurrentPalette}
                  className="min-h-[32px] px-3 py-1 rounded-[4px] bg-[#111111] hover:bg-[#2B2B2B] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Lưu bảng màu hiện tại</span>
                </button>
              )}
            </div>

            {profile.palettes.length === 0 ? (
              <p className="text-xs text-[#666666] py-4 text-center">
                Chưa có bảng màu nào được lưu. Bạn có thể bấm &ldquo;Lưu bảng màu&rdquo; sau khi phân tích tông da để giữ lại công thức son · má · mắt yêu thích.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.palettes.map((pal: SavedPaletteEntry) => (
                  <div
                    key={pal.id}
                    data-testid="saved-palette-card"
                    className="border border-[#E5E5E5] bg-[#FAFAFA] overflow-hidden"
                  >
                    <div className="grid grid-cols-4 h-12" aria-hidden="true">
                      <div style={{ backgroundColor: pal.skinHex }} title="Da" />
                      <div style={{ backgroundColor: pal.lipHex }} title="Son" />
                      <div style={{ backgroundColor: pal.blushHex }} title="Má hồng" />
                      <div style={{ backgroundColor: pal.eyeshadowHex }} title="Phấn mắt" />
                    </div>
                    <div className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-bold text-[#111111] truncate">{pal.name}</div>
                        <div className="text-[11px] text-[#666666]">
                          {SEASON_VI_LABELS[pal.season]?.title ?? pal.season} ·{" "}
                          {OCCASION_LABELS[pal.occasion]}
                        </div>
                        <div className="font-mono text-[10px] text-[#737373]">
                          {formatDateTimeVi(pal.createdAt)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeletePalette(pal.id)}
                        aria-label={`Xóa bảng màu ${pal.name}`}
                        className="w-7 h-7 rounded-[4px] border border-[#E5E5E5] hover:border-[#DC2626] text-[#666666] hover:text-[#DC2626] bg-white flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 cols: Saved Products, Preferences, PWA, Privacy & Clear All */}
        <div className="lg:col-span-5 space-y-6">
          {/* Saved Products */}
          <section
            data-testid="profile-saved-products-section"
            className="bg-white border border-[#E5E5E5] p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#EFEFEF]">
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4 text-[#DC2626]" />
                <h2 className="text-sm sm:text-base font-bold text-[#111111]">
                  Sản phẩm đã lưu ({savedProducts.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={onOpenCatalog}
                className="text-xs font-semibold text-[#111111] hover:text-[#DC2626] cursor-pointer"
              >
                Mở danh mục
              </button>
            </div>

            {savedProducts.length === 0 ? (
              <p className="text-xs text-[#666666] py-3">
                Chưa có sản phẩm nào được lưu. Nhấn biểu tượng tim trong tab Mỹ phẩm để lưu nhanh các mã son, má hồng hoặc phấn mắt bạn quan tâm.
              </p>
            ) : (
              <div className="space-y-2">
                {savedProducts.map((p) => {
                  const price = estimateProductPriceVn(p.brand, p.product_type, p.product_name);
                  const typeLabel = PRODUCT_TYPE_VI_LABELS[p.product_type] ?? p.product_type;
                  const texLabel = TEXTURE_VI_LABELS[p.texture_type] ?? p.texture_type;
                  return (
                    <div
                      key={p.id}
                      data-testid="profile-saved-product-row"
                      className="flex items-center justify-between gap-2.5 border border-[#E5E5E5] bg-[#FAFAFA] p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onInspectCatalogProduct(catalogProductToInspectable(p))}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <span
                          className="w-8 h-8 rounded-[3px] border border-black/15 shrink-0"
                          style={{ backgroundColor: p.hex_color }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#111111] truncate">
                            {p.brand} · {p.product_name}
                          </div>
                          <div className="text-[11px] text-[#666666] truncate">
                            {p.shade_name} · {typeLabel} ({texLabel}) · Ước tính {price.priceRangeLabel}
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveSavedProduct(p.id)}
                        aria-label={`Bỏ lưu ${p.brand} ${p.product_name}`}
                        className="w-7 h-7 rounded-[4px] border border-[#E5E5E5] hover:border-[#DC2626] text-[#666666] hover:text-[#DC2626] bg-white flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* User Preferences */}
          <section className="bg-white border border-[#E5E5E5] p-4 sm:p-5 space-y-4">
            <h2 className="text-sm sm:text-base font-bold text-[#111111] pb-2.5 border-b border-[#EFEFEF]">
              Tùy chọn mặc định
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="profile-display-name" className="block font-medium text-[#525252] mb-1">
                  Tên hiển thị (tùy chọn)
                </label>
                <input
                  id="profile-display-name"
                  type="text"
                  maxLength={40}
                  value={profile.preferences.displayName}
                  onChange={(e) => onUpdatePreferences({ displayName: e.target.value })}
                  placeholder="Ví dụ: Linh, Minh Anh…"
                  className="w-full min-h-[38px] px-3 py-1.5 bg-white border border-[#D4D4D4] focus:border-[#111111] focus:outline-none rounded-[4px] text-xs text-[#111111]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-default-occasion" className="block font-medium text-[#525252] mb-1">
                    Dịp trang điểm mặc định
                  </label>
                  <select
                    id="profile-default-occasion"
                    value={profile.preferences.occasion}
                    onChange={(e) =>
                      onUpdatePreferences({ occasion: e.target.value as OccasionType })
                    }
                    className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D4D4D4] rounded-[4px] text-xs text-[#111111]"
                  >
                    {(Object.keys(OCCASION_LABELS) as OccasionType[]).map((key) => (
                      <option key={key} value={key}>
                        {OCCASION_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="profile-default-texture" className="block font-medium text-[#525252] mb-1">
                    Loại da mặc định
                  </label>
                  <select
                    id="profile-default-texture"
                    value={profile.preferences.texture}
                    onChange={(e) =>
                      onUpdatePreferences({ texture: e.target.value as SkinTextureType })
                    }
                    className="w-full min-h-[38px] px-2.5 py-1.5 bg-white border border-[#D4D4D4] rounded-[4px] text-xs text-[#111111]"
                  >
                    {(Object.keys(TEXTURE_LABELS) as SkinTextureType[]).map((key) => (
                      <option key={key} value={key}>
                        {TEXTURE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* PWA & Offline Information */}
          <section className="bg-white border border-[#E5E5E5] p-4 sm:p-5 space-y-3">
            <h2 className="text-sm sm:text-base font-bold text-[#111111]">
              Thêm ra màn hình chính
            </h2>
            <p className="text-xs text-[#666666] leading-relaxed">
              Cài ứng dụng để mở nhanh như app thường. Danh mục 217 sản phẩm và dữ liệu đã lưu vẫn xem được khi mất mạng.
            </p>
            <div className="pt-1">
              <PWAInstallButton variant="card" />
            </div>
          </section>

          {/* Privacy & Clear All Data */}
          <section className="bg-[#FAFAFA] border border-[#E5E5E5] p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-bold text-[#111111]">Quản lý dữ liệu &amp; Quyền riêng tư</h2>
            <p className="text-xs text-[#666666] leading-relaxed">
              Xóa toàn bộ lịch sử phân tích, bảng màu đã lưu, sản phẩm yêu thích và tùy chọn cá nhân khỏi trình duyệt này. Hành động này không thể hoàn tác.
            </p>

            {!confirmClear ? (
              <button
                type="button"
                data-testid="clear-all-profile-data-btn"
                onClick={() => setConfirmClear(true)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-[4px] border border-[#DC2626]/50 hover:border-[#DC2626] bg-white text-[#DC2626] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa toàn bộ dữ liệu cá nhân</span>
              </button>
            ) : (
              <div className="bg-[#FEF2F2] border border-[#FECACA] p-3 space-y-2.5">
                <p className="text-xs font-medium text-[#991B1B]">
                  Bạn chắc chắn muốn xóa toàn bộ lịch sử, bảng màu và sản phẩm đã lưu trên trình duyệt này?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="confirm-clear-all-data-btn"
                    onClick={() => {
                      onClearAllData();
                      setConfirmClear(false);
                    }}
                    className="min-h-[34px] px-3.5 py-1 rounded-[4px] bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-semibold cursor-pointer"
                  >
                    Xác nhận xóa hết
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="min-h-[34px] px-3 py-1 rounded-[4px] border border-[#D4D4D4] bg-white text-[#111111] text-xs font-medium cursor-pointer"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
