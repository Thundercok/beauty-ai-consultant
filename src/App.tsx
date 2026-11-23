import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, SlidersHorizontal, Upload } from "lucide-react";
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
  FaceShapeName,
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
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const buf = imageElementToBuffer(img, "Ảnh mẫu (sample_face.jpg)");
        void processLoadedBuffer(buf);
      } catch (err) {
        setImageError(err instanceof Error ? err.message : "Không đọc được ảnh mẫu.");
      }
    };
    img.onerror = () => {
      setImageError("Không tải được ảnh mẫu từ máy chủ.");
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
        }
      };
      img.onerror = () => setImageError("Tệp ảnh không hợp lệ hoặc bị hỏng.");
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

  const sortedShapes = useMemo(() => {
    if (!report) return [];
    return (Object.keys(report.faceShape.probabilities) as FaceShapeName[])
      .map((name) => ({ name, prob: report.faceShape.probabilities[name] }))
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
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-zinc-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-zinc-200">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#colorimetry"
            className="text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            Beauty AI Consultant
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-600">
            <a
              href="#colorimetry"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Phân tích da
            </a>
            <a
              href="#relighting"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Thử ánh sáng
            </a>
            <a
              href="#kubelka-munk"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Thử màu son
            </a>
            <a
              href="#catalog"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Sản phẩm
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
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Tải ảnh của bạn
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 space-y-12">
        {/* Section 1: Main Consultation */}
        <section id="colorimetry" className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
                01. Phân tích khuôn mặt &amp; Tư vấn Personal Color
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 max-w-3xl [text-wrap:balance]">
                Tư vấn màu son, phấn &amp; dáng mặt chuẩn ánh sáng thật
              </h1>
              <p className="text-sm text-zinc-600 mt-2 max-w-2xl">
                Hệ thống tự động nhận diện 478 điểm Mắt, Mũi, Môi và Viền mặt bằng AI, khử ánh đèn
                phòng bị ám vàng/xanh rồi chọn ra các mã son và mỹ phẩm phù hợp nhất.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={loadSamplePortrait}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Dùng ảnh mẫu
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                disabled={!report}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-900 bg-zinc-100 border border-zinc-300 rounded-md hover:bg-zinc-200 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Tải báo cáo JSON
              </button>
            </div>
          </div>

          {(imageError || catalogError) && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-md text-xs">
              {imageError || catalogError}
            </div>
          )}

          {/* Asymmetric Split Console */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Portrait & Quick Settings */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="p-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2 overflow-x-auto">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ["corrected", "Đã khử ánh đèn"],
                        ["original", "Ảnh gốc"],
                        ["roi", "Vùng da đo"],
                        ["melanin", "Melanin"],
                        ["hemoglobin", "Hồng ban"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setViewportMode(id)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded whitespace-nowrap transition-colors cursor-pointer ${
                          viewportMode === id
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={showOverlay}
                    onClick={() => setShowOverlay((v) => !v)}
                    className={`px-2 py-1 text-[11px] font-medium rounded border whitespace-nowrap transition-colors cursor-pointer ${
                      showOverlay
                        ? "border-zinc-900 text-zinc-900 bg-white"
                        : "border-zinc-300 text-zinc-500 bg-zinc-100"
                    }`}
                  >
                    {showOverlay ? "Viền mặt: Bật" : "Viền mặt: Tắt"}
                  </button>
                </div>

                <PortraitCanvas
                  report={report}
                  mode={viewportMode}
                  showOverlay={showOverlay}
                  box={faceBox}
                  className="max-h-[460px]"
                />

                <div className="px-4 py-2.5 border-t border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
                  <span className="truncate font-medium text-zinc-800">
                    {landmarkStatus === "loading"
                      ? "Đang lọc nhiễu, làm nét & nhận diện khuôn mặt..."
                      : landmarkStatus === "neural"
                        ? `AI đã nhận diện ${report?.landmarkCount ?? 478} điểm · Đã lọc nhiễu & làm nét${
                            enhancementStats?.lowLightBoosted
                              ? ` · Tăng sáng (γ=${enhancementStats.gammaApplied})`
                              : ""
                          }`
                        : "Không thấy rõ mặt chính diện — đang dùng khung ước lượng"}
                  </span>
                  <span className="font-mono shrink-0 text-zinc-500">
                    {report ? `${report.skinMetrics.sampleCount.toLocaleString()} px da` : "—"}
                  </span>
                </div>
              </div>

              {/* Simple User Preferences */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="occasion-select" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Dịp trang điểm
                    </label>
                    <select
                      id="occasion-select"
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value as OccasionType)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="daily">Đi học / Hàng ngày (Nhẹ nhàng)</option>
                      <option value="office">Đi làm / Công sở (Thanh lịch)</option>
                      <option value="glam">Đi tiệc / Chụp ảnh (Nổi bật)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="texture-select" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Loại da của bạn
                    </label>
                    <select
                      id="texture-select"
                      value={texture}
                      onChange={(e) => setTexture(e.target.value as SkinTextureType)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="combination">Da hỗn hợp (Dầu chữ T)</option>
                      <option value="oily">Da dầu</option>
                      <option value="dry">Da khô / Thiếu ẩm</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="wb-method" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Chế độ khử ánh đèn
                    </label>
                    <select
                      id="wb-method"
                      value={wbMethod}
                      onChange={(e) => setWbMethod(e.target.value as WhiteBalanceMethod)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="planckian_grey_edge">Tự động chuẩn (Grey-Edge)</option>
                      <option value="planckian_sog">Tự động nhanh (Shades-of-Gray)</option>
                      <option value="none">Giữ nguyên ảnh gốc</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="catalog-ill" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Chuẩn màu bảng son
                    </label>
                    <select
                      id="catalog-ill"
                      value={catalogIlluminant}
                      onChange={(e) => setCatalogIlluminant(e.target.value as IlluminantName)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="D65">Ảnh web chuẩn (D65)</option>
                      <option value="D50">Ảnh đo phòng lab (D50 → D65)</option>
                    </select>
                  </div>
                </div>

                {landmarkStatus === "fallback" && (
                  <div className="border-t border-zinc-200 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowRoiTuning((v) => !v)}
                      className="w-full flex items-center justify-between text-xs font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Chỉnh khung mặt thủ công (khi AI không thấy rõ mặt)
                      </span>
                      <span className="text-zinc-500">{showRoiTuning ? "Ẩn" : "Mở"}</span>
                    </button>

                    {showRoiTuning && (
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                        <label className="block">
                          <span className="flex justify-between text-zinc-600">
                            <span>Vị trí ngang</span>
                            <span className="font-mono">{faceBox.centerX.toFixed(2)}</span>
                          </span>
                          <input
                            type="range"
                            min={0.2}
                            max={0.8}
                            step={0.01}
                            value={faceBox.centerX}
                            onChange={(e) =>
                              setFaceBox((b) => ({ ...b, centerX: Number(e.target.value) }))
                            }
                            className="w-full accent-zinc-900"
                          />
                        </label>
                        <label className="block">
                          <span className="flex justify-between text-zinc-600">
                            <span>Vị trí dọc</span>
                            <span className="font-mono">{faceBox.centerY.toFixed(2)}</span>
                          </span>
                          <input
                            type="range"
                            min={0.2}
                            max={0.75}
                            step={0.01}
                            value={faceBox.centerY}
                            onChange={(e) =>
                              setFaceBox((b) => ({ ...b, centerY: Number(e.target.value) }))
                            }
                            className="w-full accent-zinc-900"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Diagnostic Readout */}
            <div className="lg:col-span-7 space-y-6">
              {/* 4 Plain-Language Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Độ sáng &amp; Sắc da
                    </span>
                    <span
                      className="w-4 h-4 rounded-sm border border-zinc-300"
                      style={{ backgroundColor: skinSwatchHex }}
                      title={`Màu da đo được ${skinSwatchHex}`}
                    />
                  </div>
                  <div className="mt-2 text-base font-semibold text-zinc-900 leading-snug">
                    {report ? translateItaCategory(report.skinMetrics.ITA_category) : "—"}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-zinc-500">
                    {report
                      ? `L* ${report.skinMetrics.L_star.toFixed(0)} · a* ${report.skinMetrics.a_star.toFixed(1)} · b* ${report.skinMetrics.b_star.toFixed(1)}`
                      : "—"}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Mùa sắc cá nhân
                  </div>
                  <div className="mt-2 text-base font-semibold text-zinc-900 leading-snug">
                    {report ? SEASON_VI_LABELS[report.season.season].title : "—"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {report ? UNDERTONE_VI_LABELS[report.season.undertone] : "—"}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Dáng khuôn mặt
                  </div>
                  <div className="mt-2 text-base font-semibold text-zinc-900 leading-snug">
                    {report ? SHAPE_VI_LABELS[report.faceShape.primary] : "—"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {report
                      ? `Gần với ${SHAPE_VI_LABELS[sortedShapes[1]?.name ?? "Oval"]}`
                      : "—"}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Ánh sáng trong ảnh
                  </div>
                  <div className="mt-2 text-base font-semibold text-zinc-900 leading-snug">
                    {report?.whiteBalance.estimatedCctK
                      ? `${report.whiteBalance.estimatedCctK.toFixed(0)}K`
                      : "Ảnh gốc"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 truncate">
                    {report ? describeCctVi(report.whiteBalance.estimatedCctK) : "—"}
                  </div>
                </div>
              </div>

              {/* Season Explanation & Blended Targets */}
              {report && (
                <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">
                        Bảng màu hợp nhất với bạn: {SEASON_VI_LABELS[report.season.season].title}
                      </h2>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {SEASON_VI_LABELS[report.season.season].summary}
                        {report.season.isBorderline
                          ? ` (Có nét giao thoa nhẹ với ${SEASON_VI_LABELS[report.season.secondarySeason].title})`
                          : ""}
                      </p>
                    </div>
                    <div className="font-mono text-xs text-zinc-700 shrink-0">
                      Độ ấm da: {(report.season.warmProbability * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-zinc-700 mb-1">
                        Xác suất các nhóm màu gần bạn nhất
                      </div>
                      {sortedSeasons.slice(0, 4).map((item, idx) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"}>
                              {SEASON_VI_LABELS[item.name].title}
                            </span>
                            <span className="font-mono text-zinc-700">
                              {(item.prob * 100).toFixed(0)}%
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

                    <div className="space-y-3">
                      <div className="text-xs font-medium text-zinc-700">
                        3 tông màu chuẩn được pha theo sắc da của bạn
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {(
                          [
                            ["Màu Son", report.blendedTargets.lip],
                            ["Má Hồng", report.blendedTargets.blush],
                            ["Phấn Mắt", report.blendedTargets.eyeshadow],
                          ] as const
                        ).map(([label, hex]) => (
                          <div key={label} className="border border-zinc-200 rounded overflow-hidden">
                            <div className="h-14 w-full" style={{ backgroundColor: hex }} />
                            <div className="p-2 bg-white">
                              <div className="text-[11px] text-zinc-500">{label}</div>
                              <div className="font-mono text-xs font-semibold text-zinc-900 mt-0.5">
                                {hex}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step-by-Step Advice */}
              {report && (
                <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">
                        Hướng dẫn trang điểm cho {SHAPE_VI_LABELS[report.faceShape.primary]} ×{" "}
                        {SEASON_VI_LABELS[report.season.season].title}
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Độ đậm khuyến nghị: {report.advice.executionParameters.intensity}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2.5">
                      <div>
                        <span className="font-semibold text-zinc-900">Tạo khối: </span>
                        <span className="text-zinc-700">{report.advice.contour}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Đánh má: </span>
                        <span className="text-zinc-700">{report.advice.blush}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Trang điểm mắt: </span>
                        <span className="text-zinc-700">{report.advice.eyes}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Thoa son: </span>
                        <span className="text-zinc-700">{report.advice.lip}</span>
                      </div>
                    </div>

                    <div className="space-y-2.5 bg-zinc-50 border border-zinc-200 rounded-md p-3.5">
                      <div>
                        <span className="font-semibold text-zinc-900">Kem lót &amp; Chất son: </span>
                        <span className="text-zinc-700">
                          {report.advice.executionParameters.prep} ·{" "}
                          {report.advice.executionParameters.textureStyle}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Khóa lớp nền: </span>
                        <span className="text-zinc-700">
                          {report.advice.executionParameters.setting}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Nên tránh: </span>
                        <span className="text-zinc-600">{report.advice.avoid.join(" · ")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Top Picks */}
              {topMatches.lipsticks.length > 0 && (
                <div className="bg-white border border-zinc-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Gợi ý mua nhanh hợp nhất với bạn
                    </h2>
                    <a
                      href="#catalog"
                      className="text-xs font-medium text-cyan-800 hover:underline"
                    >
                      Xem toàn bộ {products.length} sản phẩm
                    </a>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {[
                      { title: "Son môi hợp nhất", items: topMatches.lipsticks.slice(0, 3) },
                      { title: "Má hồng hợp nhất", items: topMatches.blushes.slice(0, 2) },
                      { title: "Phấn mắt hợp nhất", items: topMatches.eyeshadows.slice(0, 2) },
                    ].map((group) => (
                      <div key={group.title} className="border border-zinc-200 rounded p-3 space-y-2">
                        <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                          {group.title}
                        </div>
                        {group.items.map((prod) => (
                          <div key={prod.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-4 h-4 rounded-sm border border-zinc-300 shrink-0"
                                style={{ backgroundColor: prod.renderedHex ?? prod.hex }}
                              />
                              <div className="truncate">
                                <span className="font-medium text-zinc-900">{prod.brand}</span>{" "}
                                <span className="text-zinc-600">{prod.shade}</span>
                              </div>
                            </div>
                            <span className="font-mono text-[11px] text-zinc-500 shrink-0">
                              ΔE {prod.deltaE.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Interactive Relighting & Chromophore Stability Lab (exp01-exp05) */}
        {report && <RelightingLab report={report} />}

        {/* Section 3: Skin Chromophore Maps */}
        {report && (
          <section id="chromophores" className="border-t border-zinc-200 pt-10 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
                  03. Phân tích sắc tố dưới bề mặt da
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  Bản đồ hắc sắc tố (Melanin) &amp; Vùng ửng đỏ (Hemoglobin)
                </h2>
                <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
                  Tách riêng sắc tố melanin (vùng sạm/tàn nhang) và hemoglobin (vùng má ửng hồng hoặc
                  mẩn đỏ) khỏi bóng tối trên khuôn mặt — hữu ích để chọn che khuyết điểm và độ che
                  phủ kem nền.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-600">
                <span>Điểm da hợp lệ: {report.chromophores.validPixels.toLocaleString()}</span>
                <span>Độ đồng đều Melanin: {report.chromophores.melaninSpatialStd.toFixed(4)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Bản đồ Melanin (Đốm nâu / Sạm nhẹ)
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Chỉ số Melanin trung bình: {report.skinMetrics.Melanin_index.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <span>Ít</span>
                    <span className="w-16 h-2 rounded-xs bg-gradient-to-r from-[#2d5091] via-[#c7995b] to-[#fa961e]" />
                    <span>Nhiều</span>
                  </div>
                </div>
                <PortraitCanvas
                  report={report}
                  mode="melanin"
                  showOverlay={false}
                  box={faceBox}
                  className="max-h-[340px]"
                />
              </div>

              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Bản đồ Hồng ban (Mạch máu / Ửng đỏ)
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Chỉ số Hemoglobin trung bình: {report.skinMetrics.Hemoglobin_index.toFixed(1)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <span>Ít</span>
                    <span className="w-16 h-2 rounded-xs bg-gradient-to-r from-[#2896c8] via-[#a35a9c] to-[#fa2c37]" />
                    <span>Nhiều</span>
                  </div>
                </div>
                <PortraitCanvas
                  report={report}
                  mode="hemoglobin"
                  showOverlay={false}
                  box={faceBox}
                  className="max-h-[340px]"
                />
              </div>
            </div>
          </section>
        )}

        {/* Section 4: Kubelka-Munk Lip Simulator */}
        {report && (
          <KubelkaMunkLab
            lipMetrics={report.lipMetrics}
            targetLipHex={report.blendedTargets.lip}
            selectedLipstick={inspectedLipstick}
            availableLipsticks={topMatches.lipsticks}
            onSelectLipstick={setInspectedLipstick}
          />
        )}

        {/* Section 5: Catalog Matcher */}
        {report && (
          <CatalogMatcher
            products={products}
            blendedTargets={report.blendedTargets}
            lipBaseLab={report.lipMetrics.lipBaseLab}
            skinMetrics={report.skinMetrics}
            catalogIlluminant={catalogIlluminant}
            onInspectLipstick={setInspectedLipstick}
          />
        )}
      </main>

      <footer className="border-t border-zinc-200 bg-white mt-16">
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div>
            Beauty AI Consultant · Công cụ tham khảo chọn màu mỹ phẩm cá nhân (không thay thế chẩn đoán
            da liễu y khoa).
          </div>
          <div>MIT License · {products.length} sản phẩm Việt Nam &amp; Quốc tế</div>
        </div>
      </footer>
    </div>
  );
}
