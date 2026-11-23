import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RotateCcw, SlidersHorizontal, Upload } from "lucide-react";
import { CatalogMatcher } from "./components/CatalogMatcher";
import { KubelkaMunkLab } from "./components/KubelkaMunkLab";
import { PortraitCanvas, type ViewportMode } from "./components/PortraitCanvas";
import { labToRgb, rgbToHex } from "./lib/beauty/bradfordCat";
import { detectInitialFaceBox, runPortraitAnalysisPipeline } from "./lib/beauty/portraitPipeline";
import { matchProducts } from "./lib/beauty/productMatcher";
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
  maxWidth = 320
): LoadedImageBuffer {
  const scale = img.naturalWidth > maxWidth ? maxWidth / img.naturalWidth : 1;
  const width = Math.max(64, Math.round(img.naturalWidth * scale));
  const height = Math.max(64, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to acquire 2D canvas context.");
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

  const [faceBox, setFaceBox] = useState<FaceLandmarksBox>(DEFAULT_FACE_BOX);
  const [showRoiTuning, setShowRoiTuning] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("corrected");

  const [wbMethod, setWbMethod] = useState<WhiteBalanceMethod>("planckian_grey_edge");
  const [occasion, setOccasion] = useState<OccasionType>("office");
  const [texture, setTexture] = useState<SkinTextureType>("combination");
  const [catalogIlluminant, setCatalogIlluminant] = useState<IlluminantName>("D65");

  const [inspectedLipstick, setInspectedLipstick] = useState<MatchedProduct | null>(null);

  const loadSamplePortrait = useCallback(() => {
    setImageError(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const buf = imageElementToBuffer(img, "data/sample_face.jpg");
        const autoBox = detectInitialFaceBox(buf.rgba, buf.width, buf.height);
        setImageBuffer(buf);
        setFaceBox(autoBox);
      } catch (err) {
        setImageError(err instanceof Error ? err.message : "Failed to decode sample portrait.");
      }
    };
    img.onerror = () => {
      setImageError("Could not load sample portrait from /api/sample-face.");
    };
    img.src = "/api/sample-face";
  }, []);

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
        setCatalogError(err instanceof Error ? err.message : "Failed to load catalog.");
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
          const autoBox = detectInitialFaceBox(buf.rgba, buf.width, buf.height);
          setImageBuffer(buf);
          setFaceBox(autoBox);
          setInspectedLipstick(null);
        } catch (err) {
          setImageError(err instanceof Error ? err.message : "Could not process uploaded image.");
        }
      };
      img.onerror = () => setImageError("Unsupported or corrupted image file.");
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
      { wbMethod, occasion, texture }
    );
  }, [imageBuffer, faceBox, wbMethod, occasion, texture]);

  const topMatches = useMemo(() => {
    if (!report || products.length === 0) {
      return { lipsticks: [], blushes: [], eyeshadows: [] };
    }
    return {
      lipsticks: matchProducts(report.blendedTargets.lip, products, {
        productType: "lipstick",
        lipBaseLab: report.lipMetrics.lipBaseLab,
        topK: 20,
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
        lipsticks: topMatches.lipsticks.slice(0, 3),
        blushes: topMatches.blushes.slice(0, 2),
        eyeshadows: topMatches.eyeshadows.slice(0, 2),
      },
      catalog_illuminant: catalogIlluminant,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beauty-ai-consultation-report.json";
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
              Colorimetry
            </a>
            <a
              href="#chromophores"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Chromophores
            </a>
            <a
              href="#kubelka-munk"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Kubelka–Munk
            </a>
            <a
              href="#catalog"
              className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
            >
              Catalog
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
              Upload Portrait
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 space-y-12">
        {/* Intro Strip */}
        <section id="colorimetry" className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-zinc-200 pb-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1.5">
                01. Optical Skin Colorimetry &amp; Consultation Pipeline
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 max-w-3xl [text-wrap:balance]">
                Illumination-Invariant Skin Analysis &amp; K-Beauty Matching
              </h1>
              <p className="text-sm text-zinc-600 mt-2 max-w-2xl">
                Planckian non-skin illuminant projection, Bradford D65 chromatic adaptation, Beer–Lambert
                chromophore separation, and finite-layer Kubelka–Munk lip rendering.
              </p>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={loadSamplePortrait}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-md hover:bg-zinc-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Sample
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                disabled={!report}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-900 bg-zinc-100 border border-zinc-300 rounded-md hover:bg-zinc-200 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
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
            {/* Left Optical Stage & Parameters (420px-ish / 5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="p-2 border-b border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2 overflow-x-auto">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        ["corrected", "D65 WB"],
                        ["original", "Original"],
                        ["roi", "Skin ROI"],
                        ["melanin", "Melanin"],
                        ["hemoglobin", "Hemoglobin"],
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
                    onClick={() => setShowOverlay((v) => !v)}
                    className={`px-2 py-1 text-[11px] font-medium rounded border whitespace-nowrap transition-colors cursor-pointer ${
                      showOverlay
                        ? "border-cyan-700 text-cyan-800 bg-cyan-50"
                        : "border-zinc-300 text-zinc-600 bg-white"
                    }`}
                  >
                    {showOverlay ? "ROI Guides On" : "ROI Guides Off"}
                  </button>
                </div>

                <PortraitCanvas
                  report={report}
                  mode={viewportMode}
                  showOverlay={showOverlay}
                  box={faceBox}
                  className="max-h-[460px] object-contain mx-auto"
                />

                <div className="px-4 py-2.5 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between text-[11px] text-zinc-600">
                  <span className="truncate">{imageBuffer?.sourceLabel ?? "Loading..."}</span>
                  <span className="font-mono shrink-0">
                    {report ? `${report.skinMetrics.sampleCount.toLocaleString()} skin px` : "—"}
                  </span>
                </div>
              </div>

              {/* Parameter Controls */}
              <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="wb-method" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      White Balance Method
                    </label>
                    <select
                      id="wb-method"
                      value={wbMethod}
                      onChange={(e) => setWbMethod(e.target.value as WhiteBalanceMethod)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="planckian_grey_edge">Planckian Grey-Edge</option>
                      <option value="planckian_sog">Planckian Shades-of-Gray</option>
                      <option value="none">None (Raw sRGB)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="catalog-ill" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Catalog Illuminant
                    </label>
                    <select
                      id="catalog-ill"
                      value={catalogIlluminant}
                      onChange={(e) => setCatalogIlluminant(e.target.value as IlluminantName)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="D65">D65 (Standard sRGB Hex)</option>
                      <option value="D50">D50 (Bradford → D65)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="occasion-select" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Occasion
                    </label>
                    <select
                      id="occasion-select"
                      value={occasion}
                      onChange={(e) => setOccasion(e.target.value as OccasionType)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="daily">Daily (0.4 Intensity)</option>
                      <option value="office">Office (0.6 Intensity)</option>
                      <option value="glam">Glam (1.0 Intensity)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="texture-select" className="block text-[11px] font-medium text-zinc-600 mb-1">
                      Skin Texture
                    </label>
                    <select
                      id="texture-select"
                      value={texture}
                      onChange={(e) => setTexture(e.target.value as SkinTextureType)}
                      className="w-full text-xs bg-white border border-zinc-300 rounded px-2.5 py-1.5 text-zinc-900"
                    >
                      <option value="combination">Combination</option>
                      <option value="oily">Oily</option>
                      <option value="dry">Dry</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-zinc-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowRoiTuning((v) => !v)}
                    className="w-full flex items-center justify-between text-xs font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      Face &amp; Lip Landmark Alignment
                    </span>
                    <span className="text-zinc-500">{showRoiTuning ? "Hide" : "Adjust"}</span>
                  </button>

                  {showRoiTuning && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                      <label className="block">
                        <span className="flex justify-between text-zinc-600">
                          <span>Center X</span>
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
                          <span>Center Y</span>
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
                      <label className="block">
                        <span className="flex justify-between text-zinc-600">
                          <span>Face Width</span>
                          <span className="font-mono">{faceBox.faceWidth.toFixed(2)}</span>
                        </span>
                        <input
                          type="range"
                          min={0.2}
                          max={0.75}
                          step={0.01}
                          value={faceBox.faceWidth}
                          onChange={(e) =>
                            setFaceBox((b) => ({ ...b, faceWidth: Number(e.target.value) }))
                          }
                          className="w-full accent-zinc-900"
                        />
                      </label>
                      <label className="block">
                        <span className="flex justify-between text-zinc-600">
                          <span>Face Height</span>
                          <span className="font-mono">{faceBox.faceHeight.toFixed(2)}</span>
                        </span>
                        <input
                          type="range"
                          min={0.25}
                          max={0.85}
                          step={0.01}
                          value={faceBox.faceHeight}
                          onChange={(e) =>
                            setFaceBox((b) => ({ ...b, faceHeight: Number(e.target.value) }))
                          }
                          className="w-full accent-zinc-900"
                        />
                      </label>
                      <label className="block">
                        <span className="flex justify-between text-zinc-600">
                          <span>Lip Y Position</span>
                          <span className="font-mono">{faceBox.lipCenterY.toFixed(2)}</span>
                        </span>
                        <input
                          type="range"
                          min={0.35}
                          max={0.85}
                          step={0.01}
                          value={faceBox.lipCenterY}
                          onChange={(e) =>
                            setFaceBox((b) => ({ ...b, lipCenterY: Number(e.target.value) }))
                          }
                          className="w-full accent-zinc-900"
                        />
                      </label>
                      <label className="block">
                        <span className="flex justify-between text-zinc-600">
                          <span>Jaw / Cheek Ratio</span>
                          <span className="font-mono">{faceBox.jawRatio.toFixed(2)}</span>
                        </span>
                        <input
                          type="range"
                          min={0.65}
                          max={1.0}
                          step={0.01}
                          value={faceBox.jawRatio}
                          onChange={(e) =>
                            setFaceBox((b) => ({ ...b, jawRatio: Number(e.target.value) }))
                          }
                          className="w-full accent-zinc-900"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Diagnostic Readout (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* 4-Column Telemetry Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Skin Lab (D65)
                    </span>
                    <span
                      className="w-4 h-4 rounded-sm border border-zinc-300"
                      style={{ backgroundColor: skinSwatchHex }}
                      title={`Measured Skin Tone ${skinSwatchHex}`}
                    />
                  </div>
                  <div className="mt-2 font-mono text-lg font-semibold text-zinc-900">
                    {report ? `${report.skinMetrics.L_star.toFixed(1)} L*` : "—"}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-600">
                    {report
                      ? `a* ${report.skinMetrics.a_star.toFixed(1)} · b* ${report.skinMetrics.b_star.toFixed(1)}`
                      : "—"}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    ITA° &amp; Fitzpatrick
                  </div>
                  <div className="mt-2 font-mono text-lg font-semibold text-zinc-900">
                    {report ? `${report.skinMetrics.ITA_deg.toFixed(1)}°` : "—"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 truncate">
                    {report ? report.skinMetrics.ITA_category : "—"}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    Illuminant CCT
                  </div>
                  <div className="mt-2 font-mono text-lg font-semibold text-zinc-900">
                    {report?.whiteBalance.estimatedCctK
                      ? `${report.whiteBalance.estimatedCctK.toFixed(0)} K`
                      : "Bypassed"}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-600">
                    {report?.whiteBalance.offLocusDeg !== null &&
                    report?.whiteBalance.offLocusDeg !== undefined
                      ? `Off-locus ${report.whiteBalance.offLocusDeg.toFixed(2)}°`
                      : "Raw sRGB input"}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-lg p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                    12-Season Profile
                  </div>
                  <div className="mt-2 text-lg font-semibold text-zinc-900 truncate">
                    {report ? report.season.season : "—"}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600">
                    {report
                      ? `${(report.season.confidence * 100).toFixed(1)}% · ${report.season.undertone}`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Season Gaussian Distribution & Blended CIELAB Targets */}
              {report && (
                <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-200 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">
                        Soft 12-Season Gaussian Posterior &amp; Blended Targets
                      </h2>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        Continuous CIELAB target interpolation prevents shade jumps at seasonal
                        boundaries
                        {report.season.isBorderline
                          ? ` — borderline with ${report.season.secondarySeason}`
                          : ""}
                        .
                      </p>
                    </div>
                    <div className="font-mono text-xs text-zinc-700 shrink-0">
                      Warm P = {(report.season.warmProbability * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      {sortedSeasons.slice(0, 5).map((item, idx) => (
                        <div key={item.name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className={idx === 0 ? "font-semibold text-zinc-900" : "text-zinc-600"}>
                              {item.name}
                            </span>
                            <span className="font-mono text-zinc-700">
                              {(item.prob * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                idx === 0 ? "bg-zinc-900" : "bg-zinc-400"
                              }`}
                              style={{ width: `${Math.max(2, item.prob * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div className="text-xs font-medium text-zinc-700">
                        Continuous CIELAB Target Palette
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {(
                          [
                            ["Lip Target", report.blendedTargets.lip],
                            ["Blush Target", report.blendedTargets.blush],
                            ["Eye Target", report.blendedTargets.eyeshadow],
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

              {/* Compositional 6-Shape x 12-Season Advice */}
              {report && (
                <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">
                        Compositional Consultation ({report.faceShape.primary} Face ×{" "}
                        {report.season.season})
                      </h2>
                      <p className="text-xs text-zinc-600 mt-0.5">
                        Face ratios: r1={report.faceShape.ratios.r1.toFixed(2)} · r2=
                        {report.faceShape.ratios.r2.toFixed(2)} · r3=
                        {report.faceShape.ratios.r3.toFixed(2)} · Secondary:{" "}
                        {sortedShapes[1]?.name} ({((sortedShapes[1]?.prob ?? 0) * 100).toFixed(0)}%)
                      </p>
                    </div>
                    <span className="font-mono text-xs text-zinc-700">
                      {report.advice.executionParameters.intensity}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="space-y-2.5">
                      <div>
                        <span className="font-semibold text-zinc-900">Contour: </span>
                        <span className="text-zinc-700">{report.advice.contour}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Blush: </span>
                        <span className="text-zinc-700">{report.advice.blush}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Eyes: </span>
                        <span className="text-zinc-700">{report.advice.eyes}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Lip: </span>
                        <span className="text-zinc-700">{report.advice.lip}</span>
                      </div>
                    </div>

                    <div className="space-y-2.5 bg-zinc-50 border border-zinc-200 rounded-md p-3.5">
                      <div>
                        <span className="font-semibold text-zinc-900">Prep &amp; Texture: </span>
                        <span className="text-zinc-700">
                          {report.advice.executionParameters.prep} ·{" "}
                          {report.advice.executionParameters.textureStyle}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Setting: </span>
                        <span className="text-zinc-700">
                          {report.advice.executionParameters.setting}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-zinc-900">Avoid: </span>
                        <span className="text-zinc-600">{report.advice.avoid.join(" · ")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick Top Matches Strip */}
              {topMatches.lipsticks.length > 0 && (
                <div className="bg-white border border-zinc-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Top CIEDE2000 Shade Recommendations
                    </h2>
                    <a
                      href="#catalog"
                      className="text-xs font-medium text-cyan-800 hover:underline"
                    >
                      Explore all {products.length} SKUs
                    </a>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {[
                      { title: "Lipsticks (K–M Rendered)", items: topMatches.lipsticks.slice(0, 3) },
                      { title: "Blushes", items: topMatches.blushes.slice(0, 2) },
                      { title: "Eyeshadows", items: topMatches.eyeshadows.slice(0, 2) },
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
                            <span className="font-mono text-[11px] text-zinc-700 shrink-0">
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

        {/* Section 2: Beer-Lambert Chromophore Decomposition */}
        {report && (
          <section id="chromophores" className="border-t border-zinc-200 pt-10 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-1">
                  02. Beer–Lambert Optical Density Separation
                </p>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
                  Illumination-Invariant Skin Chromophore Maps
                </h2>
                <p className="text-sm text-zinc-600 mt-1 max-w-2xl">
                  Mean-centered optical density d(x) = −ln(I_lin) cancels diagonal room illuminants and
                  separates relative melanin (ΔcM) and hemoglobin/erythema (ΔcH) from geometric shading.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-zinc-700">
                <span>Valid Pixels: {report.chromophores.validPixels.toLocaleString()}</span>
                <span>Melanin σ: {report.chromophores.melaninSpatialStd.toFixed(4)}</span>
                <span>Hemoglobin σ: {report.chromophores.hemoglobinSpatialStd.toFixed(4)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Relative Melanin Contrast (ΔcM)
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Melanin Index: {report.skinMetrics.Melanin_index.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                    <span>Low</span>
                    <span className="w-16 h-2 rounded-xs bg-gradient-to-r from-[#2d5091] via-[#c7995b] to-[#fa961e]" />
                    <span>High</span>
                  </div>
                </div>
                <PortraitCanvas
                  report={report}
                  mode="melanin"
                  showOverlay={false}
                  box={faceBox}
                  className="max-h-[360px] object-contain mx-auto"
                />
              </div>

              <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">
                      Relative Hemoglobin / Erythema (ΔcH)
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Hemoglobin Index: {report.skinMetrics.Hemoglobin_index.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                    <span>Low</span>
                    <span className="w-16 h-2 rounded-xs bg-gradient-to-r from-[#2896c8] via-[#a35a9c] to-[#fa2c37]" />
                    <span>High</span>
                  </div>
                </div>
                <PortraitCanvas
                  report={report}
                  mode="hemoglobin"
                  showOverlay={false}
                  box={faceBox}
                  className="max-h-[360px] object-contain mx-auto"
                />
              </div>
            </div>
          </section>
        )}

        {/* Section 3: Kubelka-Munk Lip Simulator */}
        {report && (
          <KubelkaMunkLab
            lipMetrics={report.lipMetrics}
            targetLipHex={report.blendedTargets.lip}
            selectedLipstick={inspectedLipstick}
            availableLipsticks={topMatches.lipsticks}
            onSelectLipstick={setInspectedLipstick}
          />
        )}

        {/* Section 4: Catalog Matcher */}
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
            Beauty AI Consultant · Cosmetic colorimetry &amp; exploration tool (not a dermatological or
            medical device).
          </div>
          <div>MIT License · 175-SKU K-Beauty &amp; Eyewear Dataset</div>
        </div>
      </footer>
    </div>
  );
}
