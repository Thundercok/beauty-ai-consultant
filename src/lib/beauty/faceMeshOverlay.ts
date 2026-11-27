import type { FaceLandmarksBox } from "./types";

export type MeshPointZone = "oval" | "eye" | "brow" | "nose" | "lip" | "iris" | "face";

export interface MeshContourPath {
  zone: Exclude<MeshPointZone, "face">;
  indices: number[];
  closed: boolean;
}

export interface FaceMeshSummary {
  mode: "neural" | "fallback";
  pointCount: number;
  hasIrises: boolean;
  inBoundsCount: number;
  inBoundsRatio: number;
  featureCounts: {
    oval: number;
    eyesAndBrows: number;
    lips: number;
    irises: number;
    skinSurface: number;
  };
  quality: "good" | "partial" | "fallback";
  statusLabel: string;
}

/**
 * Canonical MediaPipe 478-point Face Landmarker contour paths used to verify
 * facial feature registration (jawline, eyes, brows, nose, lips, and irises).
 */
export const FACE_MESH_CONTOURS: MeshContourPath[] = [
  {
    zone: "oval",
    closed: true,
    indices: [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
      400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
      54, 103, 67, 109,
    ],
  },
  {
    zone: "eye",
    closed: true,
    indices: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  },
  {
    zone: "eye",
    closed: true,
    indices: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382],
  },
  {
    zone: "brow",
    closed: false,
    indices: [70, 63, 105, 66, 107],
  },
  {
    zone: "brow",
    closed: false,
    indices: [300, 293, 334, 296, 336],
  },
  {
    zone: "nose",
    closed: false,
    indices: [168, 6, 197, 195, 5, 4],
  },
  {
    zone: "nose",
    closed: false,
    indices: [98, 97, 2, 326, 327],
  },
  {
    zone: "lip",
    closed: true,
    indices: [
      61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146,
    ],
  },
  {
    zone: "lip",
    closed: true,
    indices: [
      78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
    ],
  },
  {
    zone: "iris",
    closed: true,
    indices: [469, 470, 471, 472],
  },
  {
    zone: "iris",
    closed: true,
    indices: [474, 475, 476, 477],
  },
];

const OVAL_SET = new Set(FACE_MESH_CONTOURS[0].indices);
const EYE_SET = new Set([...FACE_MESH_CONTOURS[1].indices, ...FACE_MESH_CONTOURS[2].indices]);
const BROW_SET = new Set([
  ...FACE_MESH_CONTOURS[3].indices,
  ...FACE_MESH_CONTOURS[4].indices,
  46,
  53,
  52,
  65,
  55,
  276,
  283,
  282,
  295,
  285,
]);
const NOSE_SET = new Set([...FACE_MESH_CONTOURS[5].indices, ...FACE_MESH_CONTOURS[6].indices]);
const LIP_SET = new Set([...FACE_MESH_CONTOURS[7].indices, ...FACE_MESH_CONTOURS[8].indices]);

/**
 * Classifies any MediaPipe FaceLandmarker point index (0..477) into an anatomical zone
 * for readable, low-clutter visual registration checking.
 */
export function classifyMeshLandmarkZone(index: number): MeshPointZone {
  if (index >= 468 && index <= 477) return "iris";
  if (LIP_SET.has(index)) return "lip";
  if (EYE_SET.has(index)) return "eye";
  if (BROW_SET.has(index)) return "brow";
  if (NOSE_SET.has(index)) return "nose";
  if (OVAL_SET.has(index)) return "oval";
  return "face";
}

/**
 * Computes registration diagnostics for the detected 478-point face mesh so the user can
 * verify landmark alignment before trusting the personal color analysis.
 */
export function summarizeFaceMesh(
  landmarks: Array<[number, number, number]> | null,
  _box: FaceLandmarksBox,
  width: number,
  height: number,
  landmarkStatus?: "loading" | "neural" | "fallback"
): FaceMeshSummary {
  if (!landmarks || landmarks.length < 468) {
    return {
      mode: "fallback",
      pointCount: 0,
      hasIrises: false,
      inBoundsCount: 0,
      inBoundsRatio: 0,
      featureCounts: {
        oval: 0,
        eyesAndBrows: 0,
        lips: 0,
        irises: 0,
        skinSurface: 0,
      },
      quality: "fallback",
      statusLabel:
        landmarkStatus === "loading"
          ? "Đang quét 478 điểm khuôn mặt…"
          : "Chưa nhận diện lưới 478 điểm · Đang dùng khung ước lượng",
    };
  }

  let inBoundsCount = 0;
  let oval = 0;
  let eyesAndBrows = 0;
  let lips = 0;
  let irises = 0;
  let skinSurface = 0;

  for (let i = 0; i < landmarks.length; i++) {
    const [x, y] = landmarks[i];
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= width && y >= 0 && y <= height) {
      inBoundsCount++;
    }
    const zone = classifyMeshLandmarkZone(i);
    if (zone === "oval") oval++;
    else if (zone === "eye" || zone === "brow") eyesAndBrows++;
    else if (zone === "lip") lips++;
    else if (zone === "iris") irises++;
    else skinSurface++;
  }

  const pointCount = landmarks.length;
  const inBoundsRatio = pointCount > 0 ? inBoundsCount / pointCount : 0;
  const hasIrises = pointCount >= 478;
  const quality = inBoundsRatio >= 0.92 ? "good" : "partial";
  const statusLabel =
    quality === "good"
      ? `Đã khớp ${pointCount} điểm khuôn mặt`
      : `${pointCount} điểm · Một phần gần mép ảnh (${Math.round(inBoundsRatio * 100)}%)`;

  return {
    mode: "neural",
    pointCount,
    hasIrises,
    inBoundsCount,
    inBoundsRatio,
    featureCounts: {
      oval,
      eyesAndBrows,
      lips,
      irises,
      skinSurface,
    },
    quality,
    statusLabel,
  };
}
