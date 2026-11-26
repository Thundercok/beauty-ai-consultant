import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Droplets, ScanFace, ShoppingBag, SlidersHorizontal } from "lucide-react";
import demoBrightUrl from "./assets/images/demo_beauty_bright_1795711946366.jpg";
import demoSunlitUrl from "./assets/images/demo_beauty_sunlit_1795711975051.jpg";
import demoWarmUrl from "./assets/images/demo_beauty_warm_1795711945979.jpg";
import { ResultsSkeleton } from "./components/AnalysisSkeleton";
import { CatalogMatcher, type CatalogFilterId } from "./components/CatalogMatcher";
import { LipTryOnView } from "./components/LipTryOnView";
import { PhotoPickerSheet, type DemoPortraitPreset } from "./components/PhotoPickerSheet";
import { type ViewportMode } from "./components/PortraitCanvas";
import { ProductDetailSheet } from "./components/ProductDetailSheet";
import { ProInsightsView } from "./components/ProInsightsView";
import { ToneHomeView } from "./components/ToneHomeView";
import { TopProgressBar } from "./components/TopProgressBar";
import { labToRgb, rgbToHex } from "./lib/beauty/bradfordCat";
import {
  findClosestByHex,
  simulateIndoorLightingRgba,
  type ColorHarmonyPalette,
} from "./lib/beauty/colorHarmony";
import { detectNeuralFaceLandmarks } from "./lib/beauty/neuralLandmarks";
import { detectInitialFaceBox, runPortraitAnalysisPipeline } from "./lib/beauty/portraitPipeline";
import { matchProducts } from "./lib/beauty/productMatcher";
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

type AppTab = "tone" | "tryon" | "shop" | "insights";

interface LoadedImageBuffer {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  sourceLabel: string;
}

const DEMO_PORTRAIT_PRESETS: DemoPortraitPreset[] = [
  {
    id: "cafe_warm",
    label: "Selfie đèn vàng",
    subtitle: "Quán cà phê 3100K",
    url: demoBrightUrl,
    simulatedCctK: 3100,
  },
  {
    id: "office_cool",
    label: "Selfie đèn trắng",
    subtitle: "Văn phòng 7800K",
    url: demoWarmUrl,
    simulatedCctK: 7800,
  },
  {
    id: "daylight_tan",
    label: "Ánh sáng tự nhiên",
    subtitle: "Da nâu nắng",
    url: demoSunlitUrl,
  },
];

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

const SAVED_STORAGE_KEY = "beauty_ai_saved_products_v1";

function loadSavedProductIds(): Set<number> {
  try {
    const raw = window.localStorage.getItem(SAVED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is number => typeof id === "number"));
  } catch {
    return new Set();
  }
}

function imageElementToBuffer(
  img: HTMLImageElement,
  sourceLabel: string,
  maxWidth = 420
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
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const processTokenRef = useRef(0);
  const progressTimersRef = useRef<number[]>([]);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [imageBuffer, setImageBuffer] = useState<LoadedImageBuffer | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(DEMO_PORTRAIT_PRESETS[0].id);
  const [neuralLandmarks, setNeuralLandmarks] = useState<Array<[number, number, number]> | null>(
    null
  );
  const [landmarkStatus, setLandmarkStatus] = useState<"loading" | "neural" | "fallback">(
    "loading"
  );

  // Subtle top viewport progress bar state
  const [progressValue, setProgressValue] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("Đang tải ảnh chân dung…");

  const [faceBox, setFaceBox] = useState<FaceLandmarksBox>(DEFAULT_FACE_BOX);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("corrected");
  const [activeTab, setActiveTab] = useState<AppTab>("tone");
  const [shopCategory, setShopCategory] = useState<CatalogFilterId>("vn_popular");
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<MatchedProduct | null>(null);

  const [wbMethod, setWbMethod] = useState<WhiteBalanceMethod>("planckian_grey_edge");
  const [occasion, setOccasion] = useState<OccasionType>("office");
  const [texture, setTexture] = useState<SkinTextureType>("combination");
  const [catalogIlluminant, setCatalogIlluminant] = useState<IlluminantName>("D65");

  const [inspectedLipstick, setInspectedLipstick] = useState<MatchedProduct | null>(null);
  const [tryOnBlushEnabled, setTryOnBlushEnabled] = useState(false);
  const [tryOnBlushId, setTryOnBlushId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(() => loadSavedProductIds());

  const clearProgressTimers = useCallback(() => {
    progressTimersRef.current.forEach((id) => window.clearTimeout(id));
    progressTimersRef.current = [];
  }, []);

  const beginProgress = useCallback(
    (initialStageLabel: string) => {
      clearProgressTimers();
      setProgressVisible(true);
      setProgressValue(0.18);
      setProcessingLabel(initialStageLabel);

      // Gentle asymptotic creep while WASM/face landmarker runs so users feel steady momentum
      const t1 = window.setTimeout(() => {
        setProgressValue((p) => (p < 0.58 ? 0.58 : p));
      }, 220);
      const t2 = window.setTimeout(() => {
        setProgressValue((p) => (p < 0.82 ? 0.82 : p));
      }, 900);
      progressTimersRef.current.push(t1, t2);
    },
    [clearProgressTimers]
  );

  const finishProgress = useCallback(() => {
    clearProgressTimers();
    setProgressValue(1);
    const hideTimer = window.setTimeout(() => {
      setProgressVisible(false);
      const resetTimer = window.setTimeout(() => setProgressValue(0), 260);
      progressTimersRef.current.push(resetTimer);
    }, 280);
    progressTimersRef.current.push(hideTimer);
  }, [clearProgressTimers]);

  useEffect(() => clearProgressTimers, [clearProgressTimers]);

  const handleToggleSave = useCallback((id: number) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const switchTab = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const processLoadedBuffer = useCallback(
    async (buf: LoadedImageBuffer) => {
      const token = ++processTokenRef.current;
      const autoBox = detectInitialFaceBox(buf.rgba, buf.width, buf.height);
      setImageBuffer(buf);
      setFaceBox(autoBox);
      setNeuralLandmarks(null);
      setLandmarkStatus("loading");
      setProgressValue((p) => Math.max(p, 0.42));
      setProcessingLabel("Đang nhận diện khuôn mặt…");

      try {
        const { landmarks } = await detectNeuralFaceLandmarks(buf.rgba, buf.width, buf.height);
        if (token !== processTokenRef.current) return;
        setProcessingLabel("Đang phân tích tông da…");
        setProgressValue(0.88);
        if (landmarks && landmarks.length >= 468) {
          setNeuralLandmarks(landmarks);
          setLandmarkStatus("neural");
        } else {
          setNeuralLandmarks(null);
          setLandmarkStatus("fallback");
        }
      } catch {
        if (token !== processTokenRef.current) return;
        setNeuralLandmarks(null);
        setLandmarkStatus("fallback");
      } finally {
        if (token === processTokenRef.current) {
          finishProgress();
        }
      }
    },
    [finishProgress]
  );

  const loadDemoPreset = useCallback(
    (preset: DemoPortraitPreset) => {
      setImageError(null);
      setActiveDemoId(preset.id);
      setLandmarkStatus("loading");
      beginProgress("Đang tải ảnh mẫu…");

      const loadFromUrl = (url: string, label: string, fallbackUrl?: string) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          try {
            const rawBuf = imageElementToBuffer(img, label);
            const buf: LoadedImageBuffer =
              preset.simulatedCctK !== undefined
                ? {
                    ...rawBuf,
                    rgba: simulateIndoorLightingRgba(rawBuf.rgba, preset.simulatedCctK),
                  }
                : rawBuf;
            setInspectedLipstick(null);
            setTryOnBlushEnabled(false);
            setTryOnBlushId(null);
            setViewportMode("corrected");
            void processLoadedBuffer(buf);
          } catch (err) {
            setImageError(err instanceof Error ? err.message : "Không đọc được ảnh mẫu.");
            setLandmarkStatus("fallback");
            finishProgress();
          }
        };
        img.onerror = () => {
          if (fallbackUrl) {
            loadFromUrl(fallbackUrl, "Ảnh mẫu dự phòng");
          } else {
            setImageError("Không tải được ảnh mẫu.");
            setLandmarkStatus("fallback");
            finishProgress();
          }
        };
        img.src = url;
      };

      loadFromUrl(preset.url, preset.label, "/api/sample-face");
    },
    [beginProgress, finishProgress, processLoadedBuffer]
  );

  const handleCycleDemoPortrait = useCallback(() => {
    const currentIdx = DEMO_PORTRAIT_PRESETS.findIndex((p) => p.id === activeDemoId);
    const nextPreset = DEMO_PORTRAIT_PRESETS[(currentIdx + 1) % DEMO_PORTRAIT_PRESETS.length];
    loadDemoPreset(nextPreset);
  }, [activeDemoId, loadDemoPreset]);

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

    loadDemoPreset(DEMO_PORTRAIT_PRESETS[0]);
  }, [loadDemoPreset]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageError(null);
    setActiveDemoId(null);
    setLandmarkStatus("loading");
    beginProgress("Đang đọc ảnh từ thiết bị…");

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        finishProgress();
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const buf = imageElementToBuffer(img, file.name);
          setInspectedLipstick(null);
          void processLoadedBuffer(buf);
          setActiveTab("tone");
        } catch (err) {
          setImageError(err instanceof Error ? err.message : "Không xử lý được ảnh tải lên.");
          setLandmarkStatus("fallback");
          finishProgress();
        }
      };
      img.onerror = () => {
        setImageError("Tệp ảnh không hợp lệ hoặc bị hỏng.");
        setLandmarkStatus("fallback");
        finishProgress();
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setImageError("Không đọc được tệp ảnh đã chọn.");
      setLandmarkStatus("fallback");
      finishProgress();
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
        topK: 60,
        catalogIlluminant,
      }),
      blushes: matchProducts(report.blendedTargets.blush, products, {
        productType: "blush",
        topK: 6,
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

  const handleTryLipstick = useCallback(
    (product: MatchedProduct | null) => {
      if (product) setInspectedLipstick(product);
      switchTab("tryon");
    },
    [switchTab]
  );

  const handleApplyHarmonyPalette = useCallback(
    (palette: ColorHarmonyPalette) => {
      const closestLip = findClosestByHex(topMatches.lipsticks, palette.lipstick.hex);
      const closestBlush = findClosestByHex(topMatches.blushes, palette.blush.hex);
      if (closestLip) setInspectedLipstick(closestLip);
      if (closestBlush) setTryOnBlushId(closestBlush.id);
      setTryOnBlushEnabled(true);
      switchTab("tryon");
    },
    [topMatches.lipsticks, topMatches.blushes, switchTab]
  );

  const handleOpenShopCategory = useCallback(
    (cat: "lipstick" | "blush" | "eyeshadow" | "all") => {
      setShopCategory(cat === "all" ? "vn_popular" : cat);
      switchTab("shop");
    },
    [switchTab]
  );

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

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }> = [
    { id: "tone", label: "Tông da", icon: ScanFace },
    { id: "tryon", label: "Thử son", icon: Droplets },
    { id: "shop", label: "Mỹ phẩm", icon: ShoppingBag },
    { id: "insights", label: "Chuyên sâu", icon: SlidersHorizontal },
  ];

  return (
    <div className="min-h-screen overflow-x-clip flex flex-col bg-[#FAF9F8] text-zinc-900">
      {/* Subtle Top-of-Viewport Image Processing Progress Bar */}
      <TopProgressBar
        progress={progressValue}
        visible={progressVisible}
        label={processingLabel}
      />

      {/* Hidden native file/camera inputs */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* 3-Zone Top Bar Contract (52px mobile + 56px bottom bar = 108px <= 12.8% of 844px) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-zinc-200/80">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-[52px] md:h-16 flex items-center justify-between gap-4 md:gap-8">
          <button
            type="button"
            onClick={() => switchTab("tone")}
            className="text-base sm:text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Beauty AI
          </button>

          <nav
            aria-label="Điều hướng chính"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchTab(item.id)}
                  className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? "border-zinc-900 text-zinc-900 font-semibold"
                      : "border-transparent text-zinc-500 hover:text-zinc-900"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setPhotoSheetOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[40px] md:min-h-[38px] px-3.5 sm:px-4 py-1.5 text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 rounded-full md:rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Đổi ảnh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Active App Screen with smooth compositor-only entry transition */}
      <main
        key={activeTab}
        className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 pt-4 pb-24 md:py-7 animate-view-enter"
      >
        {(imageError || catalogError) && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs">
            {imageError || catalogError}
          </div>
        )}

        {activeTab === "tone" && (
          <ToneHomeView
            report={report}
            isProcessing={isProcessingPortrait}
            processingLabel={processingLabel}
            skinSwatchHex={skinSwatchHex}
            faceBox={faceBox}
            viewportMode={viewportMode}
            onViewportModeChange={setViewportMode}
            occasion={occasion}
            onOccasionChange={setOccasion}
            texture={texture}
            onTextureChange={setTexture}
            topLipstick={topMatches.lipsticks[0] ?? null}
            topBlush={topMatches.blushes[0] ?? null}
            topEyeshadow={topMatches.eyeshadows[0] ?? null}
            savedIds={savedIds}
            onToggleSave={handleToggleSave}
            onInspectProduct={setDetailProduct}
            onCycleDemoPortrait={handleCycleDemoPortrait}
            onTryLipstick={handleTryLipstick}
            onApplyHarmonyPalette={handleApplyHarmonyPalette}
            onOpenShopCategory={handleOpenShopCategory}
            onOpenInsights={() => switchTab("insights")}
          />
        )}

        {activeTab === "tryon" &&
          (isProcessingPortrait || !report ? (
            <ResultsSkeleton />
          ) : (
            <LipTryOnView
              report={report}
              faceBox={faceBox}
              selectedLipstick={inspectedLipstick}
              availableLipsticks={topMatches.lipsticks}
              availableBlushes={topMatches.blushes}
              onSelectLipstick={setInspectedLipstick}
              blushEnabled={tryOnBlushEnabled}
              onBlushEnabledChange={setTryOnBlushEnabled}
              selectedBlushId={tryOnBlushId}
              onSelectBlushId={setTryOnBlushId}
              savedIds={savedIds}
              onToggleSave={handleToggleSave}
            />
          ))}

        {activeTab === "shop" &&
          (isProcessingPortrait || !report ? (
            <ResultsSkeleton />
          ) : (
            <CatalogMatcher
              products={products}
              blendedTargets={report.blendedTargets}
              lipBaseLab={report.lipMetrics.lipBaseLab}
              skinMetrics={report.skinMetrics}
              userSeason={report.season.season}
              catalogIlluminant={catalogIlluminant}
              initialCategory={shopCategory}
              savedIds={savedIds}
              onToggleSave={handleToggleSave}
              onInspectProduct={setDetailProduct}
              onTryLipstick={handleTryLipstick}
            />
          ))}

        {activeTab === "insights" &&
          (isProcessingPortrait || !report ? (
            <ResultsSkeleton />
          ) : (
            <ProInsightsView
              report={report}
              faceBox={faceBox}
              onFaceBoxChange={setFaceBox}
              landmarkStatus={landmarkStatus}
              sortedSeasons={sortedSeasons}
              wbMethod={wbMethod}
              onWbMethodChange={setWbMethod}
              catalogIlluminant={catalogIlluminant}
              onCatalogIlluminantChange={setCatalogIlluminant}
              onExportJson={handleExportJson}
            />
          ))}
      </main>

      {/* Quiet Desktop Footer */}
      <footer className="hidden md:block border-t border-zinc-200/80 bg-white mt-auto">
        <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-center justify-between text-xs text-zinc-500">
          <span>Beauty AI Consultant · Phân tích tông da &amp; thử màu son tự nhiên</span>
          <span>{products.length} sản phẩm tham chiếu</span>
        </div>
      </footer>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar (56px) */}
      <nav
        aria-label="Điều hướng chính trên di động"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-white/95 backdrop-blur-md border-t border-zinc-200/90 grid grid-cols-4 items-center"
      >
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchTab(id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                isActive ? "text-rose-700 font-semibold" : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-rose-700"
                />
              )}
              <Icon className="w-[20px] h-[20px]" strokeWidth={isActive ? 2.2 : 1.75} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile Bottom Sheet / Desktop Modal for Photo Source & Demo Portrait Selection */}
      <PhotoPickerSheet
        open={photoSheetOpen}
        demoPresets={DEMO_PORTRAIT_PRESETS}
        activeDemoId={activeDemoId}
        onClose={() => setPhotoSheetOpen(false)}
        onPickCamera={() => cameraInputRef.current?.click()}
        onPickGallery={() => galleryInputRef.current?.click()}
        onSelectDemo={loadDemoPreset}
      />

      {/* Product Detail Bottom Sheet */}
      {report && (
        <ProductDetailSheet
          product={detailProduct}
          skinHex={skinSwatchHex}
          lipBaseHex={report.lipMetrics.lipBaseHex}
          userSeason={report.season.season}
          isSaved={detailProduct ? savedIds.has(detailProduct.id) : false}
          onClose={() => setDetailProduct(null)}
          onToggleSave={handleToggleSave}
          onTryLipstick={handleTryLipstick}
        />
      )}
    </div>
  );
}
