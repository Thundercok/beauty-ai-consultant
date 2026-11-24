import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Droplets,
  RotateCcw,
  ScanFace,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  Upload,
} from "lucide-react";
import { PortraitSkeleton, ResultsSkeleton } from "./components/AnalysisSkeleton";
import { CatalogMatcher } from "./components/CatalogMatcher";
import { KubelkaMunkLab } from "./components/KubelkaMunkLab";
import { PortraitCanvas, type ViewportMode } from "./components/PortraitCanvas";
import { RelightingLab } from "./components/RelightingLab";
import { labToRgb, rgbToHex } from "./lib/beauty/bradfordCat";
import type { EnhancementStats } from "./lib/beauty/imageEnhancement";
import { detectNeuralFaceLandmarks } from "./lib/beauty/neuralLandmarks";
import { detectInitialFaceBox, runPortraitAnalysisPipeline } from "./lib/beauty/portraitPipeline";
import { matchProducts } from "./lib/beauty/productMatcher";
import {
  SEASON_VI_LABELS,
  SHAPE_VI_LABELS,
  UNDERTONE_VI_LABELS,
  describeCctVi,
  translateItaCategory,
} from "./lib/beauty/viLabels";
import type {
  CatalogProduct,
  ConsultationReport,
  FaceLandmarksBox,
  IlluminantName,
  MatchedProduct,
  OccasionType,
  SeasonName,
  SkinTextureType,
  WhiteBalanceMethod,
} from "./lib/beauty/types";

interface LoadedImageBuffer {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  sourceLabel: string;
}

const DEFAULT_FACE_BOX: FaceLandmarksBox = {
  centerX: 0.5,
  centerY: 0.44,
  faceWidth: 0.42,
  faceHeight: 0.54,
  jawRatio: 0.8,
  foreheadRatio: 1.0,
  lipCenterY: 0.59,
  lipWidth: 0.16,
};

function imageElementToBuffer(
  img: HTMLImageElement,
  sourceLabel: string,
  maxWidth = 360
): LoadedImageBuffer {
  const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
  const width = Math.max(64, Math.round(img.naturalWidth * scale));
  const height = Math.max(64, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Không thể khởi tạo khung vẽ 2D.");
  }
  ctx.drawImage(img, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  return {
    rgba: new Uint8ClampedArray(imgData.data),
    width,
    height,
    sourceLabel,
  };
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [imageBuffer, setImageBuffer] = useState<LoadedImageBuffer | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [neuralLandmarks, setNeuralLandmarks] = useState<Array<[number, number, number]> | null>(
    null
  );
  const [landmarkStatus, setLandmarkStatus] = useState<"loading" | "neural" | "fallback">(
    "loading"
  );
  const [enhancementStats, setEnhancementStats] = useState<EnhancementStats | null>(null);

  const [faceBox, setFaceBox] = useState<FaceLandmarksBox>(DEFAULT_FACE_BOX);
  const [showRoiTuning, setShowRoiTuning] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("corrected");
  const [studioTab, setStudioTab] = useState<"lighting" | "chromophores" | "advanced">("lighting");
  const [activeNav, setActiveNav] = useState<"results" | "catalog" | "lip-tryon" | "studio-lab">(
    "results"
  );

  const [wbMethod, setWbMethod] = useState<WhiteBalanceMethod>("planckian_grey_edge");
  const [occasion, setOccasion] = useState<OccasionType>("office");
  const [texture, setTexture] = useState<SkinTextureType>("combination");
  const [catalogIlluminant, setCatalogIlluminant] = useState<IlluminantName>("D65");

  const [inspectedLipstick, setInspectedLipstick] = useState<MatchedProduct | null>(null);

  const processLoadedBuffer = useCallback(async (buf: LoadedImageBuffer) => {
    const autoBox = detectInitialFaceBox(buf.rgba, buf.width, buf.height);
    setImageBuffer(buf);
    setFaceBox(autoBox);
    setNeuralLandmarks(null);
    setEnhancementStats(null);
    setLandmarkStatus("loading");

    try {
      const { landmarks, enhancement } = await detectNeuralFaceLandmarks(
        buf.rgba,
        buf.width,
        buf.height
      );
      setEnhancementStats(enhancement);
      if (landmarks && landmarks.length >= 468) {
        setNeuralLandmarks(landmarks);
        setLandmarkStatus("neural");
      } else {
        setNeuralLandmarks(null);
        setLandmarkStatus("fallback");
      }
    } catch {
      setNeuralLandmarks(null);
      setLandmarkStatus("fallback");
    }
  }, []);

  const loadSamplePortrait = useCallback(() => {
    setImageError(null);
    setLandmarkStatus("loading");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const buf = imageElementToBuffer(img, "Ảnh mẫu (sample_face.jpg)");
        void processLoadedBuffer(buf);
      } catch (err) {
        setImageError(err instanceof Error ? err.message : "Không đọc được ảnh mẫu.");
        setLandmarkStatus("fallback");
      }
    };
    img.onerror = () => {
      setImageError("Không tải được ảnh mẫu từ máy chủ.");
      setLandmarkStatus("fallback");
    };
    img.src = "/api/sample-face";
  }, [processLoadedBuffer]);

  useEffect(() => {
    fetch("/api/products")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: { products: CatalogProduct[] }) => {
        setProducts(data.products ?? []);
      })
      .catch((err) => {
        setCatalogError(err instanceof Error ? err.message : "Không tải được danh sách mỹ phẩm.");
      });

    loadSamplePortrait();
  }, [loadSamplePortrait]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setLandmarkStatus("loading");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        try {
          const buf = imageElementToBuffer(img, file.name);
          setInspectedLipstick(null);
          void processLoadedBuffer(buf);
        } catch (err) {
          setImageError(err instanceof Error ? err.message : "Không xử lý được ảnh tải lên.");
          setLandmarkStatus("fallback");
        }
      };
      img.onerror = () => {
        setImageError("Tệp ảnh không hợp lệ hoặc bị hỏng.");
        setLandmarkStatus("fallback");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const report: ConsultationReport | null = useMemo(() => {
    if (!imageBuffer) return null;
    return runPortraitAnalysisPipeline(
      imageBuffer.rgba,
      imageBuffer.width,
      imageBuffer.height,
      faceBox,
      { wbMethod, occasion, texture, neuralLandmarks }
    );
  }, [imageBuffer, faceBox, wbMethod, occasion, texture, neuralLandmarks]);

  const isProcessingPortrait = !report || landmarkStatus === "loading";

  const topMatches = useMemo(() => {
    if (!report || products.length === 0) {
      return { lipsticks: [], blushes: [], eyeshadows: [] };
    }
    return {
      lipsticks: matchProducts(report.blendedTargets.lip, products, {
        productType: "lipstick",
        lipBaseLab: report.lipMetrics.lipBaseLab,
        topK: 30,
        catalogIlluminant,
      }),
      blushes: matchProducts(report.blendedTargets.blush, products, {
        productType: "blush",
        topK: 3,
        catalogIlluminant,
      }),
      eyeshadows: matchProducts(report.blendedTargets.eyeshadow, products, {
        productType: "eyeshadow",
        topK: 3,
        catalogIlluminant,
      }),
    };
  }, [report, products, catalogIlluminant]);

  const sortedSeasons = useMemo(() => {
    if (!report) return [];
    return (Object.keys(report.season.probabilities) as SeasonName[])
      .map((name) => ({ name, prob: report.season.probabilities[name] }))
      .sort((a, b) => b.prob - a.prob);
  }, [report]);

  const skinSwatchHex = useMemo(() => {
    if (!report) return "#E6C7B5";
    return rgbToHex(
      labToRgb([report.skinMetrics.L_star, report.skinMetrics.a_star, report.skinMetrics.b_star])
    );
  }, [report]);

  const handleExportJson = () => {
    if (!report) return;
    const payload = {
      source: imageBuffer?.sourceLabel ?? "portrait",
      landmark_source: report.landmarkSource,
      landmark_count: report.landmarkCount,
      white_balance: {
        method: report.whiteBalance.method,
        estimated_cct_k: report.whiteBalance.estimatedCctK,
        off_locus_deg: report.whiteBalance.offLocusDeg,
      },
      face_shape: report.faceShape,
      skin_metrics: report.skinMetrics,
      chromophores: {
        valid_pixels: report.chromophores.validPixels,
        melanin_spatial_std: report.chromophores.melaninSpatialStd,
        hemoglobin_spatial_std: report.chromophores.hemoglobinSpatialStd,
        method: "linear_rgb_beer_lambert_fixed_basis",
      },
      season: report.season,
      blended_target_colors: report.blendedTargets,
      lip_metrics: report.lipMetrics,
      advice: report.advice,
      matched_products: {
        lipsticks: topMatches.lipsticks.slice(0, 5),
        blushes: topMatches.blushes.slice(0, 3),
        eyeshadows: topMatches.eyeshadows.slice(0, 3),
      },
      catalog_illuminant: catalogIlluminant,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beauty-ai-tu-van-trang-diem.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen overflow-x-clip flex flex-col bg-[#FAF9F7] text-zinc-900">
      {/* 3-Zone Top Bar Contract (compact 56px on mobile, 64px on desktop) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 h-14 md:h-16 flex items-center justify-between gap-4 md:gap-8">
          <a
            href="#results"
            onClick={() => setActiveNav("results")}
            className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            Beauty AI Consultant
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
            <a
              href="#results"
              onClick={() => setActiveNav("results")}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Phân tích da
            </a>
            <a
              href="#studio-lab"
              onClick={() => setActiveNav("studio-lab")}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Quang học &amp; Sắc tố
            </a>
            <a
              href="#lip-tryon"
              onClick={() => setActiveNav("lip-tryon")}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Hòa sắc môi
            </a>
            <a
              href="#catalog"
              onClick={() => setActiveNav("catalog")}
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Đối chiếu sản phẩm
            </a>
          </nav>

          <div className="shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 min-h-[44px] md:min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-xl md:rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Tải ảnh của bạn</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 pt-3 pb-20 sm:py-6 md:py-8 space-y-8 sm:space-y-10 md:space-y-12">
        {/* Section 1: Clean Scientific Colorimetry & Face Geometry */}
        <section id="results" className="scroll-mt-20 space-y-3.5 sm:space-y-5 md:space-y-6">
          <div className="flex items-center sm:items-end justify-between gap-3 border-b border-zinc-200/80 pb-3 sm:pb-5">
            <div className="min-w-0">
              <p className="hidden sm:block text-xs font-medium text-zinc-500 mb-1">
                01. Phân tích Trắc quang &amp; Tỉ lệ khuôn mặt
              </p>
              <h1 className="text-base sm:text-3xl lg:text-4xl font-bold tracking-tight text-zinc-900 max-w-2xl [text-wrap:balance] leading-snug">
                <span className="sm:hidden">Phân tích sắc da &amp; ánh sáng</span>
                <span className="hidden sm:inline">
                  Phân tích trắc quang sắc da &amp; hình học gương mặt
                </span>
              </h1>
              <p className="hidden sm:block text-sm text-zinc-600 mt-1.5 sm:mt-2 max-w-2xl">
                Cân bằng ánh đèn theo đường cong Planckian, tách sắc tố da theo định luật
                Beer-Lambert và phân loại 12 mùa sắc CIELAB trước khi đối chiếu mỹ phẩm.
              </p>
            </div>
            <button
              type="button"
              onClick={loadSamplePortrait}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-[38px] px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl md:rounded-md hover:bg-zinc-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="sm:hidden">Ảnh mẫu</span>
              <span className="hidden sm:inline">Dùng ảnh mẫu</span>
            </button>
          </div>

          {(imageError || catalogError) && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl md:rounded-md text-xs">
              {imageError || catalogError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 lg:gap-8 items-start">
            {/* Left: Obsidian Studio Portrait Mirror & Quick Preferences */}
            <div className="lg:col-span-5 space-y-3.5 sm:space-y-4">
              <div className="bg-[#161514] border border-zinc-200/80 rounded-3xl md:rounded-2xl overflow-hidden shadow-md">
                <div className="relative">
                  {/* Frosted top studio controls overlaid cleanly without eating extra vertical height */}
                  <div className="absolute top-3 inset-x-3 z-10 flex items-center justify-between gap-2 pointer-events-none">
                    <div className="pointer-events-auto inline-flex items-center p-0.5 rounded-full bg-black/50 backdrop-blur-md border border-white/15">
                      {(
                        [
                          ["corrected", "Đã cân bằng"],
                          ["original", "Ảnh gốc"],
                        ] as const
                      ).map(([id, label]) => {
                        const isActive =
                          viewportMode === id ||
                          (id === "corrected" &&
                            viewportMode !== "original" &&
                            viewportMode !== "corrected");
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setViewportMode(id)}
                            className={`min-h-[36px] md:min-h-[30px] px-3 md:px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors cursor-pointer ${
                              isActive
                                ? "bg-white text-zinc-900 shadow-xs"
                                : "text-white/85 hover:text-white"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      aria-pressed={showOverlay}
                      onClick={() => setShowOverlay((v) => !v)}
                      className={`pointer-events-auto min-h-[36px] md:min-h-[30px] px-3 md:px-2.5 py-1 text-xs font-medium rounded-full backdrop-blur-md border whitespace-nowrap transition-colors cursor-pointer ${
                        showOverlay
                          ? "bg-white/95 border-white text-zinc-900"
                          : "bg-black/45 border-white/20 text-white/85 hover:text-white"
                      }`}
                    >
                      {showOverlay ? "Điểm sáng: Bật" : "Điểm sáng: Tắt"}
                    </button>
                  </div>

                  {isProcessingPortrait ? (
                    <PortraitSkeleton
                      variant="studio"
                      className="max-h-[340px] sm:max-h-[420px]"
                    />
                  ) : (
                    <PortraitCanvas
                      report={report}
                      mode={viewportMode}
                      showOverlay={showOverlay}
                      box={faceBox}
                      containerClassName="bg-[#161514]"
                      className="max-h-[340px] sm:max-h-[420px]"
                    />
                  )}

                  {/* Mobile Hero Scrim: Immediate above-the-fold Personal Color verdict */}
                  <div className="lg:hidden absolute inset-x-0 bottom-0 pt-16 pb-3.5 px-4 bg-gradient-to-t from-black/90 via-black/55 to-transparent pointer-events-none">
                    {isProcessingPortrait || !report ? (
                      <div className="space-y-1.5">
                        <div className="h-2.5 w-28 rounded-full bg-white/20 animate-pulse" />
                        <div className="h-5 w-48 rounded-md bg-white/25 animate-pulse" />
                        <div className="h-3 w-40 rounded-full bg-white/15 animate-pulse" />
                      </div>
                    ) : (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/90">
                          Personal Color · {describeCctVi(report.whiteBalance.estimatedCctK)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full ring-1 ring-white/50 shrink-0"
                            style={{ backgroundColor: skinSwatchHex }}
                          />
                          <div className="text-lg font-bold text-white tracking-tight truncate">
                            {SEASON_VI_LABELS[report.season.season].title}
                          </div>
                        </div>
                        <div className="text-xs text-white/85 mt-0.5 truncate">
                          {translateItaCategory(report.skinMetrics.ITA_category)} ·{" "}
                          {UNDERTONE_VI_LABELS[report.season.undertone]} ·{" "}
                          {SHAPE_VI_LABELS[report.faceShape.primary]}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Attached Mobile 3-Shade Signature Dock (visible immediately above fold) */}
                <div className="lg:hidden bg-white px-3.5 py-3 border-t border-zinc-100 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-zinc-700">
                      3 gam màu hợp sắc da nhất
                    </span>
                    {isProcessingPortrait ? (
                      <span className="h-2.5 w-24 rounded-full skeleton-shimmer" aria-hidden="true" />
                    ) : (
                      <span className="text-zinc-500 truncate">
                        {landmarkStatus === "neural"
                          ? `${report?.landmarkCount ?? 478} điểm · Lọc nhiễu${
                              enhancementStats?.lowLightBoosted ? " · Tăng sáng" : ""
                            }`
                          : "Chỉnh khung bên dưới"}
                      </span>
                    )}
                  </div>

                  {isProcessingPortrait || !report ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map((idx) => (
                        <div
                          key={idx}
                          className="border border-zinc-200 rounded-xl overflow-hidden"
                        >
                          <div className="h-9 w-full skeleton-shimmer" />
                          <div className="px-2 py-1.5 bg-white">
                            <div className="h-2.5 w-12 rounded-full skeleton-shimmer" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["Màu Son", report.blendedTargets.lip],
                          ["Má Hồng", report.blendedTargets.blush],
                          ["Phấn Mắt", report.blendedTargets.eyeshadow],
                        ] as const
                      ).map(([label, hex]) => (
                        <div
                          key={`dock-${label}`}
                          className="border border-zinc-200 rounded-xl overflow-hidden bg-white"
                        >
                          <div className="h-9 w-full" style={{ backgroundColor: hex }} />
                          <div className="px-2.5 py-1.5 flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-zinc-800 leading-tight">
                              {label}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500 leading-tight">
                              {hex}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Desktop Portrait Status Footer */}
                <div className="hidden lg:flex px-4 py-2.5 border-t border-zinc-200 bg-zinc-50 items-center justify-between gap-2 text-xs text-zinc-600">
                  {isProcessingPortrait ? (
                    <div className="h-3 w-48 rounded-full skeleton-shimmer" aria-hidden="true" />
                  ) : (
                    <span className="truncate">
                      {landmarkStatus === "neural"
                        ? `Đã nhận diện ${report?.landmarkCount ?? 478} điểm · Lọc nhiễu & làm nét${
                            enhancementStats?.lowLightBoosted ? " · Đã tăng sáng" : ""
                          }`
                        : "Không thấy rõ mặt chính diện — chạm chỉnh khung bên dưới"}
                    </span>
                  )}
                </div>
              </div>

              {/* Everyday Preferences */}
              <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="occasion-select" className="block text-xs font-medium text-zinc-700 mb-1.5">
                      Dịp trang điểm
                    </label>
                    <select
                      id="occasion-select"
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value as OccasionType)}
                      className="w-full min-h-[44px] md:min-h-[38px] text-sm md:text-xs bg-white border border-zinc-300 rounded-xl md:rounded-md px-3 py-2 text-zinc-900"
                    >
                      <option value="daily">Đi học / Hàng ngày (Nhẹ nhàng)</option>
                      <option value="office">Đi làm / Công sở (Thanh lịch)</option>
                      <option value="glam">Đi tiệc / Buổi tối (Nổi bật)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="texture-select" className="block text-xs font-medium text-zinc-700 mb-1.5">
                      Loại da của bạn
                    </label>
                    <select
                      id="texture-select"
                      value={texture}
                      onChange={(e) => setTexture(e.target.value as SkinTextureType)}
                      className="w-full min-h-[44px] md:min-h-[38px] text-sm md:text-xs bg-white border border-zinc-300 rounded-xl md:rounded-md px-3 py-2 text-zinc-900"
                    >
                      <option value="combination">Da hỗn hợp (Dầu chữ T)</option>
                      <option value="oily">Da dầu</option>
                      <option value="dry">Da khô / Thiếu ẩm</option>
                    </select>
                  </div>
                </div>

                {!isProcessingPortrait && landmarkStatus === "fallback" && (
                  <div className="border-t border-zinc-200 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowRoiTuning((v) => !v)}
                      className="w-full min-h-[44px] md:min-h-[36px] flex items-center justify-between text-xs font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Chỉnh vị trí khuôn mặt thủ công
                      </span>
                      <span className="text-zinc-500">{showRoiTuning ? "Ẩn" : "Mở"}</span>
                    </button>

                    {showRoiTuning && (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                        <label className="block">
                          <span className="flex justify-between text-zinc-600">
                            <span>Ngang</span>
                            <span className="font-mono">{faceBox.centerX.toFixed(2)}</span>
                          </span>
                          <div className="py-1.5">
                            <input
                              type="range"
                              min={0.2}
                              max={0.8}
                              step={0.01}
                              value={faceBox.centerX}
                              onChange={(e) =>
                                setFaceBox((b) => ({ ...b, centerX: Number(e.target.value) }))
                              }
                              className="w-full h-2 accent-zinc-900"
                            />
                          </div>
                        </label>
                        <label className="block">
                          <span className="flex justify-between text-zinc-600">
                            <span>Dọc</span>
                            <span className="font-mono">{faceBox.centerY.toFixed(2)}</span>
                          </span>
                          <div className="py-1.5">
                            <input
                              type="range"
                              min={0.2}
                              max={0.75}
                              step={0.01}
                              value={faceBox.centerY}
                              onChange={(e) =>
                                setFaceBox((b) => ({ ...b, centerY: Number(e.target.value) }))
                              }
                              className="w-full h-2 accent-zinc-900"
                            />
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Scientific Colorimetry Diagnosis, Metrics Strip & Face Geometry Protocol */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">
              {isProcessingPortrait ? (
                <ResultsSkeleton />
              ) : (
                <>
                  {/* Primary Scientific Diagnosis Card */}
                  <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-5 sm:p-6 space-y-5">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-zinc-500">
                        Kết quả phân loại 12 mùa sắc (Soft CIELAB)
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className="w-6 h-6 rounded-md border border-zinc-300 shrink-0"
                          style={{ backgroundColor: skinSwatchHex }}
                          title={`Sắc da đo được: ${skinSwatchHex}`}
                        />
                        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">
                          {SEASON_VI_LABELS[report.season.season].title}
                        </h2>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
                        <span>{translateItaCategory(report.skinMetrics.ITA_category)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{UNDERTONE_VI_LABELS[report.season.undertone]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{SHAPE_VI_LABELS[report.faceShape.primary]}</span>
                        <span aria-hidden="true">·</span>
                        <span>{describeCctVi(report.whiteBalance.estimatedCctK)}</span>
                      </div>

                      <p className="text-sm text-zinc-700 pt-1 leading-relaxed">
                        {SEASON_VI_LABELS[report.season.season].summary}
                        {report.season.isBorderline
                          ? ` Vùng chuyển tiếp gần ${SEASON_VI_LABELS[report.season.secondarySeason].title}.`
                          : ""}
                      </p>
                    </div>

                    {/* Tabular Scientific Colorimetry Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3.5 border-y border-zinc-200">
                      <div>
                        <div className="text-[11px] font-medium text-zinc-500">CIELAB (L* / a* / b*)</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-0.5">
                          {report.skinMetrics.L_star.toFixed(1)} / {report.skinMetrics.a_star.toFixed(1)} /{" "}
                          {report.skinMetrics.b_star.toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-zinc-500">Góc ITA°</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-0.5">
                          {report.skinMetrics.ITA_deg.toFixed(1)}°
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-zinc-500">Ước lượng CCT</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-0.5">
                          {report.whiteBalance.estimatedCctK !== null
                            ? `${Math.round(report.whiteBalance.estimatedCctK)}K`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-zinc-500">Xác suất Tông Ấm</div>
                        <div className="font-mono tabular-nums text-sm font-semibold text-zinc-900 mt-0.5">
                          {(report.season.warmProbability * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Top 3 Season Posterior Probabilities */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-zinc-700">
                        Phân bố xác suất các nhóm mùa gần nhất
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2">
                        {sortedSeasons.slice(0, 3).map((item, idx) => (
                          <div key={item.name} className="space-y-1">
                            <div className="flex justify-between text-xs gap-2">
                              <span
                                className={`truncate ${
                                  idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"
                                }`}
                              >
                                {SEASON_VI_LABELS[item.name].title}
                              </span>
                              <span className="font-mono tabular-nums text-zinc-700 shrink-0">
                                {(item.prob * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  idx === 0 ? "bg-zinc-900" : "bg-zinc-400"
                                }`}
                                style={{ width: `${Math.max(4, item.prob * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="hidden lg:block pt-3 border-t border-zinc-200 space-y-2.5">
                      <div className="text-xs font-medium text-zinc-700">
                        Tọa độ sắc mục tiêu sau pha trộn xác suất (Target Lab Blend)
                      </div>
                      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                        {(
                          [
                            ["Màu Son", report.blendedTargets.lip],
                            ["Má Hồng", report.blendedTargets.blush],
                            ["Phấn Mắt", report.blendedTargets.eyeshadow],
                          ] as const
                        ).map(([label, hex]) => (
                          <div
                            key={label}
                            className="border border-zinc-200 rounded-xl md:rounded-md overflow-hidden"
                          >
                            <div className="h-12 w-full" style={{ backgroundColor: hex }} />
                            <div className="px-2.5 sm:px-3 py-1.5 bg-white flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-zinc-800 truncate">
                                {label}
                              </span>
                              <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                                {hex}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Facial Geometry Advice Card */}
                  <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
                      <h3 className="text-base font-semibold text-zinc-900">
                        Khuyến nghị hình học cho {SHAPE_VI_LABELS[report.faceShape.primary]}
                      </h3>
                      <span className="text-xs text-zinc-500">
                        {report.advice.executionParameters.intensity.replace(/\s*\([^)]*\)/, "")}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4 text-xs leading-relaxed">
                      <div>
                        <span className="font-semibold text-zinc-900">Tạo khối: </span>
                        <span className="text-zinc-700">{report.advice.contour}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Đánh má: </span>
                        <span className="text-zinc-700">{report.advice.blush}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Mắt: </span>
                        <span className="text-zinc-700">{report.advice.eyes}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Môi: </span>
                        <span className="text-zinc-700">{report.advice.lip}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100 text-xs text-zinc-600 space-y-1 leading-relaxed">
                      <div>
                        <span className="font-semibold text-zinc-900">Chuẩn bị &amp; Chất liệu: </span>
                        {report.advice.executionParameters.prep} ·{" "}
                        {report.advice.executionParameters.textureStyle} ·{" "}
                        {report.advice.executionParameters.setting}
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Cần tránh: </span>
                        {report.advice.avoid.join(" · ")}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Section 2A: Optical & Chromophore Research Lab (Planckian Relighting + Beer-Lambert Maps) */}
        {!isProcessingPortrait && report && (
          <section
            id="studio-lab"
            className="scroll-mt-20 border-t border-zinc-200 pt-8 md:pt-10 space-y-5 md:space-y-6"
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1">
                  02A. Thực nghiệm Quang học &amp; Sắc tố da
                </p>
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900">
                  Ổn định màu sắc dưới biến thiên ánh sáng &amp; bản đồ sắc tố Beer-Lambert
                </h2>
              </div>

              <div className="flex items-center gap-1.5 p-1.5 bg-zinc-100 border border-zinc-200 rounded-xl overflow-x-auto shrink-0">
                {(
                  [
                    ["lighting", "Thử nghiệm ánh sáng"],
                    ["chromophores", "Sắc tố Beer-Lambert"],
                    ["advanced", "Thông số & JSON"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setStudioTab(id)}
                    className={`min-h-[40px] md:min-h-[34px] px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      studioTab === id
                        ? "bg-white text-zinc-900 shadow-xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {studioTab === "lighting" && <RelightingLab report={report} />}

            {studioTab === "chromophores" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Bản đồ Melanin (Phân bố sắc tố nâu)
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Phân tách quang học theo không gian hấp thụ tuyến tính
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                      <span>Ít</span>
                      <span className="w-12 sm:w-14 h-2 rounded-xs bg-gradient-to-r from-[#2d5091] via-[#c7995b] to-[#fa961e]" />
                      <span>Nhiều</span>
                    </div>
                  </div>
                  <PortraitCanvas
                    report={report}
                    mode="melanin"
                    showOverlay={false}
                    box={faceBox}
                    className="max-h-[320px] sm:max-h-[340px]"
                  />
                </div>

                <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">
                        Bản đồ Hồng ban (Hemoglobin / Mạch máu)
                      </h3>
                      <p className="text-xs text-zinc-500">
                        Đo phân bố độ đỏ dưới biểu bì để đánh giá sắc da thực
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 shrink-0">
                      <span>Ít</span>
                      <span className="w-12 sm:w-14 h-2 rounded-xs bg-gradient-to-r from-[#2896c8] via-[#a35a9c] to-[#fa2c37]" />
                      <span>Nhiều</span>
                    </div>
                  </div>
                  <PortraitCanvas
                    report={report}
                    mode="hemoglobin"
                    showOverlay={false}
                    box={faceBox}
                    className="max-h-[320px] sm:max-h-[340px]"
                  />
                </div>
              </div>
            )}

            {studioTab === "advanced" && (
              <div className="bg-white border border-zinc-200 rounded-2xl md:rounded-xl p-5 sm:p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Tham số cân bằng trắng &amp; chuẩn chiếu sáng bảng màu
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="wb-method" className="block text-xs font-medium text-zinc-600 mb-1.5">
                          Thuật toán cân bằng trắng
                        </label>
                        <select
                          id="wb-method"
                          value={wbMethod}
                          onChange={(e) => setWbMethod(e.target.value as WhiteBalanceMethod)}
                          className="w-full min-h-[44px] md:min-h-[38px] text-sm md:text-xs bg-white border border-zinc-300 rounded-xl md:rounded-md px-3 py-2 text-zinc-900"
                        >
                          <option value="planckian_grey_edge">Planckian Grey-Edge (Mặc định)</option>
                          <option value="planckian_sog">Shades-of-Gray</option>
                          <option value="none">Không cân bằng (Ảnh gốc)</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="catalog-ill" className="block text-xs font-medium text-zinc-600 mb-1.5">
                          Chuẩn chuyển đổi Bradford CAT
                        </label>
                        <select
                          id="catalog-ill"
                          value={catalogIlluminant}
                          onChange={(e) => setCatalogIlluminant(e.target.value as IlluminantName)}
                          className="w-full min-h-[44px] md:min-h-[38px] text-sm md:text-xs bg-white border border-zinc-300 rounded-xl md:rounded-md px-3 py-2 text-zinc-900"
                        >
                          <option value="D65">Chuẩn sRGB / Web (D65)</option>
                          <option value="D50">Chuẩn đo lab ICC (D50 → D65)</option>
                        </select>
                      </div>
                    </div>

                    <div className="text-xs text-zinc-600 space-y-1 font-mono tabular-nums pt-1">
                      <div>
                        ROI hợp lệ: {report.skinMetrics.sampleCount.toLocaleString()} px ·
                        Melanin σ={report.chromophores.melaninSpatialStd.toFixed(3)} · Hemoglobin
                        σ={report.chromophores.hemoglobinSpatialStd.toFixed(3)}
                      </div>
                      <div>
                        Góc off-locus Planckian:{" "}
                        {report.whiteBalance.offLocusDeg !== null
                          ? `${report.whiteBalance.offLocusDeg.toFixed(2)}°`
                          : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Toàn bộ phân bố 4 mùa sắc hàng đầu
                    </h3>
                    <div className="space-y-2">
                      {sortedSeasons.slice(0, 4).map((item, idx) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"}>
                              {SEASON_VI_LABELS[item.name].title}
                            </span>
                            <span className="font-mono tabular-nums text-zinc-700">
                              {(item.prob * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                idx === 0 ? "bg-zinc-900" : "bg-zinc-400"
                              }`}
                              style={{ width: `${Math.max(3, item.prob * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    Xuất toàn bộ vector CIELAB, tham số sắc tố, cân bằng trắng và bảng đối chiếu
                    định dạng JSON.
                  </span>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="w-full sm:w-auto min-h-[44px] md:min-h-[38px] inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-900 bg-zinc-100 border border-zinc-300 rounded-xl md:rounded-md hover:bg-zinc-200 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải báo cáo JSON
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Section 2B: Kubelka-Munk Lip Substrate Mixing Simulation */}
        {!isProcessingPortrait && report && (
          <KubelkaMunkLab
            lipMetrics={report.lipMetrics}
            targetLipHex={report.blendedTargets.lip}
            selectedLipstick={inspectedLipstick}
            availableLipsticks={topMatches.lipsticks}
            onSelectLipstick={setInspectedLipstick}
          />
        )}

        {/* Section 3: Product Second — Catalog Matching with Highlighted Popular Picks */}
        {!isProcessingPortrait && report && (
          <CatalogMatcher
            products={products}
            blendedTargets={report.blendedTargets}
            lipBaseLab={report.lipMetrics.lipBaseLab}
            skinMetrics={report.skinMetrics}
            userSeason={report.season.season}
            catalogIlluminant={catalogIlluminant}
            onInspectLipstick={setInspectedLipstick}
          />
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white pb-16 md:pb-0 mt-8 md:mt-14">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500 text-center sm:text-left">
          <div>
            Beauty AI Consultant · Nghiên cứu trắc quang cá nhân &amp; mô hình hóa sắc mỹ phẩm.
          </div>
          <div>{products.length} sản phẩm tham chiếu trong cơ sở dữ liệu</div>
        </div>
      </footer>

      {/* Mobile Bottom Thumb-Zone Navigation Bar (56px, keeping total sticky chrome <= 13.3% of 844px) */}
      <nav
        aria-label="Điều hướng nhanh trên di động"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-white/95 backdrop-blur-md border-t border-zinc-200 grid grid-cols-4 items-center"
      >
        {[
          { id: "results" as const, href: "#results", label: "Phân tích", icon: ScanFace },
          { id: "studio-lab" as const, href: "#studio-lab", label: "Quang học", icon: Sun },
          { id: "lip-tryon" as const, href: "#lip-tryon", label: "Hòa sắc", icon: Droplets },
          { id: "catalog" as const, href: "#catalog", label: "Sản phẩm", icon: ShoppingBag },
        ].map(({ id, href, label, icon: Icon }) => {
          const isActive = activeNav === id;
          return (
            <a
              key={id}
              href={href}
              onClick={() => setActiveNav(id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                isActive ? "text-zinc-900 font-semibold" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.75} />
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
