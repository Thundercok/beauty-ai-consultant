import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FlipHorizontal2, ImagePlus, RefreshCw, X } from "lucide-react";
import {
  analyzeCameraFrame,
  evaluateAmbientLux,
  type FaceAlignmentReading,
  type LightingReading,
} from "../lib/beauty/cameraAssistant";
import { FaceAlignmentGuideOverlay } from "./FaceAlignmentGuideOverlay";
import { LightingAssistantOverlay } from "./LightingAssistantOverlay";

export interface CapturedCameraFrame {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  sourceLabel: string;
}

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCaptureFrame: (frame: CapturedCameraFrame) => void;
  onFallbackNativeCamera: () => void;
  onFallbackGallery: () => void;
}

interface AmbientLightSensorLike {
  illuminance?: number;
  start: () => void;
  stop: () => void;
  addEventListener: (type: "reading" | "error", listener: () => void) => void;
  removeEventListener: (type: "reading" | "error", listener: () => void) => void;
}

const INITIAL_LIGHTING: LightingReading = {
  level: "slightly_dim",
  badgeEn: "Checking",
  labelVi: "Đang kiểm tra ánh sáng",
  guidanceVi: "Hướng mặt về phía ánh sáng đều để hệ thống đo chuẩn nhất.",
  score: 50,
  brightnessPct: 50,
  source: "standby",
  lux: null,
  luma: null,
  asymmetry: 0,
};

const INITIAL_ALIGNMENT: FaceAlignmentReading = {
  status: "standby",
  labelVi: "Căn mắt & cằm vào khung",
  hintVi: "Đặt mắt ngang vạch dẫn và cằm chạm vạch dưới trước khi chụp.",
  isReady: false,
  skinCoverage: 0,
  verticalOffset: 0,
  horizontalOffset: 0,
};

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  open,
  onClose,
  onCaptureFrame,
  onFallbackNativeCamera,
  onFallbackGallery,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const ambientLuxRef = useRef<number | null>(null);

  const [cameraState, setCameraState] = useState<"starting" | "live" | "unavailable">("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(true);
  const [lighting, setLighting] = useState<LightingReading>(INITIAL_LIGHTING);
  const [alignment, setAlignment] = useState<FaceAlignmentReading>(INITIAL_ALIGNMENT);
  const [retryCounter, setRetryCounter] = useState(0);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Try Web AmbientLightSensor if available on the user's device
  useEffect(() => {
    if (!open) return;
    ambientLuxRef.current = null;

    const SensorCtor = (
      window as unknown as {
        AmbientLightSensor?: new (opts?: { frequency?: number }) => AmbientLightSensorLike;
      }
    ).AmbientLightSensor;

    if (!SensorCtor) return;

    let sensor: AmbientLightSensorLike | null = null;
    const onReading = () => {
      if (sensor && typeof sensor.illuminance === "number") {
        ambientLuxRef.current = sensor.illuminance;
        setLighting(evaluateAmbientLux(sensor.illuminance));
      }
    };
    const onError = () => {
      ambientLuxRef.current = null;
    };

    try {
      sensor = new SensorCtor({ frequency: 2 });
      sensor.addEventListener("reading", onReading);
      sensor.addEventListener("error", onError);
      sensor.start();
    } catch {
      ambientLuxRef.current = null;
    }

    return () => {
      if (sensor) {
        try {
          sensor.removeEventListener("reading", onReading);
          sensor.removeEventListener("error", onError);
          sensor.stop();
        } catch {
          // Ignore sensor cleanup errors
        }
      }
    };
  }, [open]);

  // Open front-facing live camera stream via getUserMedia
  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    let cancelled = false;
    setCameraState("starting");
    setCameraError(null);
    setLighting(INITIAL_LIGHTING);
    setAlignment(INITIAL_ALIGNMENT);

    async function startStream() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) {
          setCameraState("unavailable");
          setCameraError(
            "Trình duyệt không hỗ trợ mở camera trực tiếp. Bạn có thể chụp bằng camera hệ thống hoặc tải ảnh lên."
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 960 },
            height: { ideal: 1280 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
        }
        setCameraState("live");
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Chưa được cấp quyền camera. Hãy cho phép quyền camera hoặc chọn ảnh từ thiết bị."
            : "Không tìm thấy camera trước khả dụng trên thiết bị này. Bạn vẫn có thể chọn ảnh có sẵn.";
        setCameraError(msg);
        setCameraState("unavailable");
      }
    }

    void startStream();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, retryCounter, stopCamera]);

  // Continuous real-time camera frame analysis (~4 Hz) for Lighting Assistant + Face Alignment Guide
  useEffect(() => {
    if (!open || cameraState !== "live") return;

    const sampleW = 72;
    const sampleH = 96;
    if (!sampleCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = sampleW;
      c.height = sampleH;
      sampleCanvasRef.current = c;
    }

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = sampleCanvasRef.current;
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.save();
      if (mirrored) {
        ctx.translate(sampleW, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, sampleW, sampleH);
      ctx.restore();

      const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
      const { lighting: frameLighting, alignment: frameAlignment } = analyzeCameraFrame(
        imgData.data,
        sampleW,
        sampleH
      );

      // Prefer hardware AmbientLightSensor lux if active, unless frame shows strong side-shadow asymmetry
      if (ambientLuxRef.current !== null && frameLighting.level !== "uneven") {
        setLighting(evaluateAmbientLux(ambientLuxRef.current));
      } else {
        setLighting(frameLighting);
      }
      setAlignment(frameAlignment);
    }, 260);

    return () => window.clearInterval(timer);
  }, [open, cameraState, mirrored]);

  const handleCapturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const maxWidth = 420;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const width = Math.max(64, Math.round(video.videoWidth * scale));
    const height = Math.max(64, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.save();
    if (mirrored) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    const imgData = ctx.getImageData(0, 0, width, height);
    stopCamera();
    onCaptureFrame({
      rgba: new Uint8ClampedArray(imgData.data),
      width,
      height,
      sourceLabel: "Ảnh chụp selfie trực tiếp",
    });
    onClose();
  }, [mirrored, onCaptureFrame, onClose, stopCamera]);

  if (!open) return null;

  return (
    <div
      data-testid="camera-capture-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-studio-title"
    >
      <div className="relative w-full h-full sm:h-auto sm:max-w-[440px] sm:max-h-[92vh] bg-zinc-950 text-white sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-white/10">
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-zinc-950/90 border-b border-white/10 z-20">
          <div className="min-w-0">
            <h2 id="camera-studio-title" className="text-sm font-bold tracking-tight text-white">
              Chụp selfie chuẩn ánh sáng
            </h2>
            <p className="text-[11px] text-zinc-400 truncate">
              Trợ lý đo sáng &amp; khung căn mắt–cằm thời gian thực
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setMirrored((m) => !m)}
              aria-label={mirrored ? "Tắt lật gương camera" : "Bật lật gương camera"}
              className={`min-h-[38px] min-w-[38px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                mirrored
                  ? "bg-white/15 text-white"
                  : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <FlipHorizontal2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng camera selfie"
              className="min-h-[38px] min-w-[38px] rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>

        {/* Live Viewfinder + Lighting Assistant Overlay + Face Alignment Guide Overlay */}
        <div className="relative flex-1 min-h-[420px] sm:min-h-[480px] bg-zinc-900 overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`absolute inset-0 w-full h-full object-cover ${
              mirrored ? "-scale-x-100" : ""
            } ${cameraState === "live" ? "opacity-100" : "opacity-0"}`}
          />

          {/* Real-time Face Alignment Guide Frame Overlay */}
          <FaceAlignmentGuideOverlay alignment={alignment} />

          {/* Real-time Lighting Assistant Overlay pinned cleanly at top of viewfinder */}
          <div className="absolute top-3 inset-x-3 z-20">
            <LightingAssistantOverlay reading={lighting} />
          </div>

          {/* Starting / Camera Unavailable Center Panel */}
          {cameraState !== "live" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
              <div className="max-w-[290px] rounded-2xl bg-zinc-950/85 backdrop-blur-md border border-white/15 p-4 space-y-3 shadow-xl">
                {cameraState === "starting" ? (
                  <>
                    <div className="w-9 h-9 rounded-full border-2 border-white/25 border-t-white animate-spin mx-auto" />
                    <div className="text-xs font-semibold text-white">Đang mở camera trước…</div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">
                      Hãy cho phép truy cập camera để bật trợ lý đo sáng và khung căn khuôn mặt.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-white">Chưa kết nối được camera trực tiếp</div>
                    <p className="text-[11px] text-zinc-300 leading-relaxed">{cameraError}</p>
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onFallbackNativeCamera();
                        }}
                        className="w-full min-h-[38px] px-3 py-2 rounded-xl bg-white text-zinc-900 hover:bg-zinc-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Mở camera hệ thống</span>
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRetryCounter((c) => c + 1)}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Thử lại</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onFallbackGallery();
                          }}
                          className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <ImagePlus className="w-3 h-3" />
                          <span>Thư viện ảnh</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Camera Controls Bar */}
        <div className="px-5 py-4 bg-zinc-950 border-t border-white/10 flex items-center justify-between gap-4 z-20">
          <button
            type="button"
            onClick={() => {
              onClose();
              onFallbackGallery();
            }}
            className="min-h-[44px] px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" />
            <span>Thư viện</span>
          </button>

          <button
            type="button"
            disabled={cameraState !== "live"}
            onClick={handleCapturePhoto}
            aria-label="Chụp ảnh phân tích"
            className={`w-16 h-16 rounded-full p-1 border-2 transition-all flex items-center justify-center ${
              cameraState === "live"
                ? lighting.level === "perfect" && alignment.isReady
                  ? "border-emerald-400 cursor-pointer active:scale-95"
                  : "border-white cursor-pointer active:scale-95"
                : "border-white/25 opacity-40 cursor-not-allowed"
            }`}
          >
            <span
              className={`w-full h-full rounded-full transition-colors ${
                lighting.level === "perfect" && alignment.isReady ? "bg-emerald-400" : "bg-white"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-3 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
