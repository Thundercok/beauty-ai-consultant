import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Droplets, ScanFace, ShoppingBag, SlidersHorizontal } from "lucide-react";
import selfieCafeWarmUrl from "./assets/images/selfie_cafe_warm_1795755930772.jpg";
import selfieOfficeCoolUrl from "./assets/images/selfie_office_cool_1795755934169.jpg";
import selfieTanOutdoorUrl from "./assets/images/selfie_tan_outdoor_1795755933086.jpg";
import {
  CameraCaptureModal,
  type CapturedCameraFrame,
} from "./components/CameraCaptureModal";
import { CatalogMatcher, type CatalogFilterId } from "./components/CatalogMatcher";
import { GettingStartedEmptyState } from "./components/GettingStartedEmptyState";
import { LipTryOnView } from "./components/LipTryOnView";
import { PhotoPickerSheet, type DemoPortraitPreset } from "./components/PhotoPickerSheet";
import { ProductDetailSheet } from "./components/ProductDetailSheet";
import { ProInsightsView } from "./components/ProInsightsView";
import { ToastNotification, type ToastMessage, type ToastTone } from "./components/ToastNotification";
import { ToneHomeView, type ToneViewportMode } from "./components/ToneHomeView";
import { TopProgressBar } from "./components/TopProgressBar";
import { labToRgb, rgbToHex } from "./lib/beauty/bradfordCat";
import {
  findClosestByHex,
  simulateIndoorLightingRgba,
  type ColorHarmonyPalette,
} from "./lib/beauty/colorHarmony";
import { triggerHaptic } from "./lib/beauty/haptics";
import type { EnhancementStats } from "./lib/beauty/imageEnhancement";
import { detectNeuralFaceLandmarks } from "./lib/beauty/neuralLandmarks";
import { detectInitialFaceBox, runPortraitAnalysisPipeline } from "./lib/beauty/portraitPipeline";
import { assessAnalysisValidity, type FaceDetectionOutcome } from "./lib/beauty/analysisValidity";
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
    label: "Quán cà phê tối",
    subtitle: "Đèn vàng · Mặt mộc",
    url: selfieCafeWarmUrl,
  },
  {
    id: "office_cool",
    label: "Đèn văn phòng",
    subtitle: "Huỳnh quang lạnh",
    url: selfieOfficeCoolUrl,
  },
  {
    id: "daylight_tan",
    label: "Nắng ban công",
    subtitle: "Da ngăm · Sáng lệch",
    url: selfieTanOutdoorUrl,
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
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
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
  const toastTimerRef = useRef<number | null>(null);
  const toastSeqRef = useRef(0);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [imageBuffer, setImageBuffer] = useState<LoadedImageBuffer | null>(null);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [faceDetection, setFaceDetection] = useState<FaceDetectionOutcome>("pending");
  const [activeDemoId, setActiveDemoId] = useState<string | null>(DEMO_PORTRAIT_PRESETS[0].id);
  const [neuralLandmarks, setNeuralLandmarks] = useState<Array<[number, number, number]> | null>(
    null
  );
  const [landmarkStatus, setLandmarkStatus] = useState<"loading" | "neural" | "fallback">(
    "loading"
  );
  const [enhancementStats, setEnhancementStats] = useState<EnhancementStats | null>(null);

  // Subtle top viewport progress bar state
  const [progressValue, setProgressValue] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const [processingLabel, setProcessingLabel] = useState("Đang tải ảnh chân dung…");

  const [faceBox, setFaceBox] = useState<FaceLandmarksBox>(DEFAULT_FACE_BOX);
  const [showOverlay, setShowOverlay] = useState(false);
  const [viewportMode, setViewportMode] = useState<ToneViewportMode>("corrected");
  const [activeTab, setActiveTab] = useState<AppTab>("tone");
  const [shopCategory, setShopCategory] = useState<CatalogFilterId>("vn_popular");
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<MatchedProduct | null>(null);

  const [wbMethod, setWbMethod] = useState<WhiteBalanceMethod>("planckian_grey_edge");
  const [occasion, setOccasion] = useState<OccasionType>("office");
  const [texture, setTexture] = useState<SkinTextureType>("combination");
  const [catalogIlluminant, setCatalogIlluminant] = useState<IlluminantName>("D65");

  const [inspectedLipstick, setInspectedLipstick] = useState<MatchedProduct | null>(null);
  const [tryOnBlushEnabled, setTryOnBlushEnabled] = useState(false);
  const [tryOnBlushId, setTryOnBlushId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(() => loadSavedProductIds());
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [pulsingMobileTab, setPulsingMobileTab] = useState<AppTab | null>(null);
  const mobilePulseTimerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, tone: ToastTone = "info") => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    const id = ++toastSeqRef.current;
    setToast({ id, text, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      toastTimerRef.current = null;
    }, 2600);
  }, []);

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

  useEffect(() => {
    return () => {
      clearProgressTimers();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (mobilePulseTimerRef.current !== null) {
        window.clearTimeout(mobilePulseTimerRef.current);
      }
    };
  }, [clearProgressTimers]);

  const handleToggleSave = useCallback(
    (id: number) => {
      const removing = savedIds.has(id);
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
      showToast(
        removing ? "Đã bỏ lưu sản phẩm" : "Đã lưu sản phẩm yêu thích",
        removing ? "info" : "heart"
      );
    },
    [savedIds, showToast]
  );

  const handleOccasionChange = useCallback(
    (next: OccasionType) => {
      setOccasion(next);
      const labels: Record<OccasionType, string> = {
        daily: "Đi học",
        office: "Đi chơi",
        glam: "Đi tiệc",
      };
      showToast(`Đã chuyển phong cách: ${labels[next]}`, "setting");
    },
    [showToast]
  );

  const handleTextureChange = useCallback(
    (next: SkinTextureType) => {
      setTexture(next);
      const labels: Record<SkinTextureType, string> = {
        combination: "Da hỗn hợp",
        oily: "Da dầu",
        dry: "Da khô",
      };
      showToast(`Đã cập nhật loại da: ${labels[next]}`, "setting");
    },
    [showToast]
  );

  const handleWbMethodChange = useCallback(
    (next: WhiteBalanceMethod) => {
      setWbMethod(next);
      const labels: Record<WhiteBalanceMethod, string> = {
        planckian_grey_edge: "Planckian Grey-Edge",
        planckian_sog: "Shades-of-Gray",
        none: "Giữ ánh sáng gốc",
      };
      showToast(`Cân bằng sáng: ${labels[next]}`, "setting");
    },
    [showToast]
  );

  const handleCatalogIlluminantChange = useCallback(
    (next: IlluminantName) => {
      setCatalogIlluminant(next);
      showToast(`Chuẩn ánh sáng bảng màu: ${next}`, "setting");
    },
    [showToast]
  );

  const handleToggleMeshPreview = useCallback(() => {
    setShowOverlay((prev) => {
      const next = !prev;
      if (next) {
        const count = neuralLandmarks?.length ?? 0;
        showToast(
          count >= 468
            ? `Đang hiển thị lưới ${count} điểm khuôn mặt`
            : "Đang hiển thị khung ước lượng khuôn mặt",
          "setting"
        );
      } else {
        showToast("Đã ẩn lưới khuôn mặt", "info");
      }
      return next;
    });
  }, [neuralLandmarks, showToast]);

  const switchTab = useCallback((tab: AppTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleMobileTabPress = useCallback(
    (tab: AppTab) => {
      triggerHaptic(tab === activeTab ? "soft" : "selection");
      if (mobilePulseTimerRef.current !== null) {
        window.clearTimeout(mobilePulseTimerRef.current);
      }
      setPulsingMobileTab(tab);
      mobilePulseTimerRef.current = window.setTimeout(() => {
        setPulsingMobileTab((current) => (current === tab ? null : current));
        mobilePulseTimerRef.current = null;
      }, 170);
      switchTab(tab);
    },
    [activeTab, switchTab]
  );

  const processLoadedBuffer = useCallback(
    async (buf: LoadedImageBuffer) => {
      const token = ++processTokenRef.current;
      const autoBox = detectInitialFaceBox(buf.rgba, buf.width, buf.height);
      // Publish buffer immediately so full optical analysis renders in <20ms without waiting for WASM
      setImageBuffer(buf);
      setIsDecodingImage(false);
      setFaceBox(autoBox);
      setNeuralLandmarks(null);
      setEnhancementStats(null);
      setLandmarkStatus("loading");
      setFaceDetection("pending");
      setProgressValue((p) => Math.max(p, 0.45));
      setProcessingLabel("Đang tinh chỉnh 478 điểm khuôn mặt…");

      let outcome: FaceDetectionOutcome = "unavailable";
      try {
        const { landmarks, enhancement } = await detectNeuralFaceLandmarks(
          buf.rgba,
          buf.width,
          buf.height
        );
        if (token !== processTokenRef.current) return;
        setEnhancementStats(enhancement);
        setProcessingLabel("Hoàn tất nhận diện khuôn mặt");
        setProgressValue(0.92);
        if (landmarks && landmarks.length >= 468) {
          outcome = "found";
          setNeuralLandmarks(landmarks);
          setLandmarkStatus("neural");
        } else {
          outcome = "not_found";
          setNeuralLandmarks(null);
          setLandmarkStatus("fallback");
        }
      } catch {
        if (token !== processTokenRef.current) return;
        outcome = "unavailable";
        setNeuralLandmarks(null);
        setLandmarkStatus("fallback");
      } finally {
        if (token === processTokenRef.current) {
          setFaceDetection(outcome);
          finishProgress();
          // The banner states the exact reason; the toast must not claim success when it isn't.
          if (outcome === "found") showToast("Phân tích hoàn tất", "success");
          else if (outcome === "not_found") showToast("Không tìm thấy khuôn mặt trong ảnh", "info");
          else showToast("Đang dùng khung ước lượng khuôn mặt", "info");
        }
      }
    },
    [finishProgress, showToast]
  );

  const handleClearPortrait = useCallback(() => {
    processTokenRef.current += 1;
    setImageBuffer(null);
    setIsDecodingImage(false);
    setImageError(null);
    setActiveDemoId(null);
    setNeuralLandmarks(null);
    setEnhancementStats(null);
    setLandmarkStatus("fallback");
    setInspectedLipstick(null);
    setTryOnBlushEnabled(false);
    setTryOnBlushId(null);
    finishProgress();
  }, [finishProgress]);

  const handleResetFaceBox = useCallback(() => {
    if (!imageBuffer) {
      setFaceBox(DEFAULT_FACE_BOX);
    } else {
      setFaceBox(detectInitialFaceBox(imageBuffer.rgba, imageBuffer.width, imageBuffer.height));
    }
    showToast("Đã đặt lại khung khuôn mặt mặc định", "setting");
  }, [imageBuffer, showToast]);

  const loadDemoPreset = useCallback(
    (preset: DemoPortraitPreset) => {
      setImageError(null);
      setActiveDemoId(preset.id);
      setIsDecodingImage(true);
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
            setIsDecodingImage(false);
            setLandmarkStatus("fallback");
            finishProgress();
          }
        };
        img.onerror = () => {
          if (fallbackUrl) {
            loadFromUrl(fallbackUrl, "Ảnh mẫu dự phòng");
          } else {
            setImageError("Không tải được ảnh mẫu.");
            setIsDecodingImage(false);
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
    setIsDecodingImage(true);
    setLandmarkStatus("loading");
    beginProgress("Đang đọc ảnh từ thiết bị…");

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const buf = imageElementToBuffer(img, file.name);
        setInspectedLipstick(null);
        setTryOnBlushEnabled(false);
        setTryOnBlushId(null);
        setViewportMode("corrected");
        void processLoadedBuffer(buf);
        setActiveTab("tone");
      } catch (err) {
        setImageError(err instanceof Error ? err.message : "Không xử lý được ảnh tải lên.");
        setIsDecodingImage(false);
        setLandmarkStatus("fallback");
        finishProgress();
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setImageError("Tệp ảnh không hợp lệ hoặc định dạng không hỗ trợ (hãy dùng JPG, PNG, WebP).");
      setIsDecodingImage(false);
      setLandmarkStatus("fallback");
      finishProgress();
    };
    img.src = objectUrl;
    event.target.value = "";
  };

  const handleCapturedCameraFrame = useCallback(
    (frame: CapturedCameraFrame) => {
      setImageError(null);
      setActiveDemoId(null);
      setIsDecodingImage(false);
      setLandmarkStatus("loading");
      beginProgress("Đang phân tích ảnh selfie…");
      setInspectedLipstick(null);
      setTryOnBlushEnabled(false);
      setTryOnBlushId(null);
      setViewportMode("corrected");
      setActiveTab("tone");
      void processLoadedBuffer(frame);
    },
    [beginProgress, processLoadedBuffer]
  );

  const openLiveCamera = useCallback(() => {
    setCameraModalOpen(true);
  }, []);

  const rawReport: ConsultationReport | null = useMemo(() => {
    if (!imageBuffer) return null;
    return runPortraitAnalysisPipeline(
      imageBuffer.rgba,
      imageBuffer.width,
      imageBuffer.height,
      faceBox,
      { wbMethod, occasion, texture, neuralLandmarks }
    );
  }, [imageBuffer, faceBox, wbMethod, occasion, texture, neuralLandmarks]);

  const analysisValidity = useMemo(
    () =>
      rawReport
        ? assessAnalysisValidity({ faceDetection, skinEvidence: rawReport.skinEvidence })
        : null,
    [rawReport, faceDetection]
  );
  // A rejected analysis is withheld everywhere: no season, no products, no makeup advice.
  const report = analysisValidity?.status === "reject" ? null : rawReport;

  // Never block the rendered analysis on slow MediaPipe WASM downloads; only show decoding state while reading a new file
  const isProcessingPortrait = isDecodingImage && !report;

  const topMatches = useMemo(() => {
    if (!report || products.length === 0) {
      return { lipsticks: [], blushes: [], eyeshadows: [] };
    }
    return {
      lipsticks: matchProducts(report.blendedTargets.lip, products, {
        productType: "lipstick",
        lipBaseLab: report.lipMetrics.lipBaseLab,
        topK: 300,
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
      showToast(`Đã áp dụng bộ màu ${palette.title}`, "success");
      switchTab("tryon");
    },
    [topMatches.lipsticks, topMatches.blushes, showToast, switchTab]
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
    <div className="min-h-screen overflow-x-clip flex flex-col bg-white text-[#111111]">
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
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E5E5]">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-[52px] md:h-[60px] flex items-center justify-between gap-4 md:gap-8">
          <button
            type="button"
            onClick={() => switchTab("tone")}
            className="text-[17px] sm:text-[18px] font-bold tracking-[-0.035em] text-[#111111] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Beauty AI
          </button>

          <nav
            aria-label="Điều hướng chính"
            className="hidden md:flex items-center gap-8 text-[13px] font-medium h-full"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchTab(item.id)}
                  className={`h-full inline-flex items-center border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? "border-[#111111] text-[#111111] font-semibold"
                      : "border-transparent text-[#666666] hover:text-[#111111]"
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
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-4 py-1.5 text-xs font-semibold text-white bg-[#111111] hover:bg-[#2B2B2B] rounded-[4px] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Phân tích ảnh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Active App Screen with generous mobile bottom padding so fixed 56px bottom nav NEVER clips content */}
      <main
        key={activeTab}
        className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 pt-5 pb-28 md:py-8 animate-view-enter"
      >
        {(imageError || catalogError) && (
          <div className="mb-5 bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] px-4 py-3 rounded-[4px] text-xs">
            {imageError || catalogError}
          </div>
        )}

        {analysisValidity?.message && (
          <div
            role={analysisValidity.status === "reject" ? "alert" : "status"}
            className={
              analysisValidity.status === "reject"
                ? "mb-5 bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] px-4 py-3 rounded-[4px] text-xs"
                : "mb-5 bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] px-4 py-3 rounded-[4px] text-xs"
            }
          >
            {analysisValidity.message}
          </div>
        )}

        {activeTab === "tone" &&
          (!report && !isProcessingPortrait ? (
            <GettingStartedEmptyState
              tab="tone"
              demoPresets={DEMO_PORTRAIT_PRESETS}
              onPickGallery={() => galleryInputRef.current?.click()}
              onPickCamera={openLiveCamera}
              onSelectDemo={loadDemoPreset}
            />
          ) : (
            <ToneHomeView
              report={report}
              isProcessing={isProcessingPortrait}
              processingLabel={processingLabel}
              isDemoPortrait={activeDemoId !== null}
              skinSwatchHex={skinSwatchHex}
              faceBox={faceBox}
              viewportMode={viewportMode}
              onViewportModeChange={setViewportMode}
              occasion={occasion}
              onOccasionChange={handleOccasionChange}
              texture={texture}
              onTextureChange={handleTextureChange}
              topLipstick={topMatches.lipsticks[0] ?? null}
              topBlush={topMatches.blushes[0] ?? null}
              topEyeshadow={topMatches.eyeshadows[0] ?? null}
              savedIds={savedIds}
              onToggleSave={handleToggleSave}
              onInspectProduct={setDetailProduct}
              onCycleDemoPortrait={handleCycleDemoPortrait}
              onPickGallery={() => galleryInputRef.current?.click()}
              onPickCamera={openLiveCamera}
              onClearPortrait={handleClearPortrait}
              onTryLipstick={handleTryLipstick}
              onApplyHarmonyPalette={handleApplyHarmonyPalette}
              onOpenShopCategory={handleOpenShopCategory}
              onOpenInsights={() => switchTab("insights")}
            />
          ))}

        {activeTab === "tryon" &&
          (!report ? (
            <GettingStartedEmptyState
              tab="tryon"
              demoPresets={DEMO_PORTRAIT_PRESETS}
              onPickGallery={() => galleryInputRef.current?.click()}
              onPickCamera={openLiveCamera}
              onSelectDemo={loadDemoPreset}
            />
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
              onNotify={(msg) => showToast(msg, "success")}
            />
          ))}

        {activeTab === "shop" &&
          (!report ? (
            <GettingStartedEmptyState
              tab="shop"
              demoPresets={DEMO_PORTRAIT_PRESETS}
              onPickGallery={() => galleryInputRef.current?.click()}
              onPickCamera={openLiveCamera}
              onSelectDemo={loadDemoPreset}
            />
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
          (!report ? (
            <GettingStartedEmptyState
              tab="insights"
              demoPresets={DEMO_PORTRAIT_PRESETS}
              onPickGallery={() => galleryInputRef.current?.click()}
              onPickCamera={openLiveCamera}
              onSelectDemo={loadDemoPreset}
            />
          ) : (
            <ProInsightsView
              report={report}
              faceBox={faceBox}
              onFaceBoxChange={setFaceBox}
              onResetFaceBox={handleResetFaceBox}
              landmarkStatus={landmarkStatus}
              showMeshPreview={showOverlay}
              onToggleMeshPreview={handleToggleMeshPreview}
              enhancementStats={enhancementStats}
              sortedSeasons={sortedSeasons}
              wbMethod={wbMethod}
              onWbMethodChange={handleWbMethodChange}
              catalogIlluminant={catalogIlluminant}
              onCatalogIlluminantChange={handleCatalogIlluminantChange}
              onExportJson={handleExportJson}
              topLipstick={topMatches.lipsticks[0] ?? null}
              topBlush={topMatches.blushes[0] ?? null}
              topEyeshadow={topMatches.eyeshadows[0] ?? null}
              demoPresets={DEMO_PORTRAIT_PRESETS}
              activeDemoId={activeDemoId}
              onSelectDemo={loadDemoPreset}
              onOpenPhotoPicker={() => setPhotoSheetOpen(true)}
            />
          ))}
      </main>

      {/* Quiet Desktop Footer */}
      <footer className="hidden md:block border-t border-[#E5E5E5] bg-white mt-auto">
        <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-center justify-between text-xs text-[#737373]">
          <span>Beauty AI Consultant · Phân tích tông da &amp; hiệu chỉnh trang điểm thực tế</span>
          <span className="font-mono tabular-nums">{products.length} sản phẩm tham chiếu</span>
        </div>
      </footer>

      {/* Mobile Fixed Thumb-Zone Bottom Tab Bar (56px) with Haptic & Tactile Feedback */}
      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Điều hướng chính trên di động"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-white/96 backdrop-blur-md border-t border-[#E5E5E5] grid grid-cols-4 items-center"
      >
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          const isPulsing = pulsingMobileTab === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`mobile-tab-${id}`}
              onClick={() => handleMobileTabPress(id)}
              aria-current={isActive ? "page" : undefined}
              className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium whitespace-nowrap select-none touch-manipulation transition-all duration-150 active:scale-92 cursor-pointer ${
                isActive ? "text-[#111111] font-semibold" : "text-[#737373] hover:text-[#111111]"
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[2px] bg-[#DC2626] transition-all duration-200 ease-out ${
                  isActive ? "w-8 opacity-100" : "w-0 opacity-0"
                }`}
              />
              <Icon
                className={`w-[20px] h-[20px] transition-transform duration-150 ease-out ${
                  isPulsing ? "scale-112" : "scale-100"
                }`}
                strokeWidth={isActive ? 2.1 : 1.65}
              />
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
        hasPortrait={Boolean(report)}
        onClose={() => setPhotoSheetOpen(false)}
        onPickCamera={openLiveCamera}
        onPickGallery={() => galleryInputRef.current?.click()}
        onSelectDemo={loadDemoPreset}
        onClearPortrait={handleClearPortrait}
      />

      {/* Live Selfie Camera Studio with Real-Time Lighting Assistant & Face Alignment Guide */}
      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCaptureFrame={handleCapturedCameraFrame}
        onFallbackNativeCamera={() => cameraInputRef.current?.click()}
        onFallbackGallery={() => galleryInputRef.current?.click()}
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
      {/* Brief Floating Feedback Toast Notification */}
      <ToastNotification toast={toast} />
    </div>
  );
}
