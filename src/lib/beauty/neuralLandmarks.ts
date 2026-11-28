import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { enhancePortraitForLandmarks, type EnhancementStats } from "./imageEnhancement";

export const SKIN_LANDMARKS = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];

export const FEATURE_POLYGONS: number[][] = [
  [33, 160, 158, 133, 153, 144], // Left eye
  [362, 385, 387, 263, 373, 380], // Right eye
  [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146], // Outer lips
];

export const INNER_LIP_INDICES = [13, 14, 78, 308, 82, 312];
export const OUTER_LIP_INDICES = [61, 291, 0, 17, 37, 267, 84, 314];

let landmarkerPromise: Promise<FaceLandmarker> | null = null;
let landmarkerReady = false;
let tfliteConsoleFilterInstalled = false;

export function isFaceLandmarkerReady(): boolean {
  return landmarkerReady;
}

export function resetFaceLandmarkerCache(): void {
  landmarkerPromise = null;
  landmarkerReady = false;
}

function ensureTfliteInfoConsoleFilter(): void {
  if (tfliteConsoleFilterInstalled || typeof console === "undefined") return;
  tfliteConsoleFilterInstalled = true;
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      typeof first === "string" &&
      first.startsWith("INFO: Created TensorFlow Lite")
    ) {
      console.info(...args);
      return;
    }
    originalError(...args);
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (val) => {
        window.clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    ensureTfliteInfoConsoleFilter();
    const base = import.meta.env.BASE_URL || "/";
    landmarkerPromise = withTimeout(
      (async () => {
        const vision = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`);
        const instance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `${base}mediapipe/face_landmarker.task`,
            delegate: "CPU",
          },
          runningMode: "IMAGE",
          numFaces: 2,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.45,
        });
        landmarkerReady = true;
        return instance;
      })(),
      15000,
      "MediaPipe FaceLandmarker init"
    ).catch((err) => {
      landmarkerPromise = null;
      landmarkerReady = false;
      throw err;
    });
  }
  return landmarkerPromise;
}

export async function detectNeuralFaceLandmarks(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Promise<{
  landmarks: Array<[number, number, number]> | null;
  enhancement: EnhancementStats;
  faceCount: number;
}> {
  // Preprocess with bilateral denoising, adaptive low-light contrast, and luma sharpening
  // ONLY for landmark inference — colorimetry continues to use untouched raw/WB pixels.
  const { enhancedRgba, stats } = enhancePortraitForLandmarks(rgba, width, height);

  const landmarker = await getFaceLandmarker();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { landmarks: null, enhancement: stats, faceCount: 0 };

  const imgData = new ImageData(new Uint8ClampedArray(enhancedRgba), width, height);
  ctx.putImageData(imgData, 0, 0);

  const result = landmarker.detect(canvas);
  const faceCount = result.faceLandmarks?.length ?? 0;
  if (faceCount > 1) {
    return { landmarks: null, enhancement: stats, faceCount };
  }

  const face = result.faceLandmarks?.[0];
  if (!face || face.length < 468) {
    return { landmarks: null, enhancement: stats, faceCount: 0 };
  }

  return {
    landmarks: face.map((lm) => [lm.x * width, lm.y * height, lm.z * width]),
    enhancement: stats,
    faceCount: 1,
  };
}

/**
 * Andrew's monotone chain convex hull for 2D points.
 */
export function computeConvexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Scanline-fill a polygon onto a binary Uint8Array mask.
 */
export function fillPolygonMask(
  mask: Uint8Array,
  width: number,
  height: number,
  polygon: Array<[number, number]>,
  fillValue: number
): void {
  if (polygon.length < 3) return;
  let minY = height;
  let maxY = 0;
  for (const [, y] of polygon) {
    if (y < minY) minY = Math.floor(y);
    if (y > maxY) maxY = Math.ceil(y);
  }
  minY = Math.max(0, minY);
  maxY = Math.min(height - 1, maxY);

  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      const spans = (yi > y) !== (yj > y);
      if (spans) {
        const xHit = xi + ((y - yi) * (xj - xi)) / (yj - yi);
        intersections.push(xHit);
      }
    }
    intersections.sort((a, b) => a - b);
    for (let k = 0; k + 1 < intersections.length; k += 2) {
      const xStart = Math.max(0, Math.ceil(intersections[k]));
      const xEnd = Math.min(width - 1, Math.floor(intersections[k + 1]));
      const rowOffset = y * width;
      for (let x = xStart; x <= xEnd; x++) {
        mask[rowOffset + x] = fillValue;
      }
    }
  }
}
