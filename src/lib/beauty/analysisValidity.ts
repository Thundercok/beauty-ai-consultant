import type { SkinEvidence } from "./types";

/**
 * What MediaPipe said about the photo.
 * - pending:     the detector is still loading or running; only the quick face-box guess exists
 * - found:       a face with the full 478-point mesh was detected
 * - not_found:   the detector ran and saw no face
 * - multiple_faces: more than one face was detected; withhold results so a bystander is never analyzed
 * - unavailable: the detector failed to load or crashed (offline, WASM timeout, old browser)
 */
export type FaceDetectionOutcome =
  | "pending"
  | "found"
  | "not_found"
  | "multiple_faces"
  | "unavailable";

export type AnalysisValidityStatus = "ok" | "warn" | "reject";

export type AnalysisValidityReason =
  | "no_face"
  | "multiple_faces"
  | "no_skin"
  | "few_skin_pixels"
  | "detector_unavailable";

export interface AnalysisValidity {
  status: AnalysisValidityStatus;
  reason: AnalysisValidityReason | null;
  /** Vietnamese message for the banner, null when status is "ok" */
  message: string | null;
}

export interface AnalysisValidityInput {
  faceDetection: FaceDetectionOutcome;
  skinEvidence: SkinEvidence;
}

/** Below this many verified skin pixels the averaged colour is too noisy to trust fully. */
export const MIN_TRUSTED_SKIN_PIXELS = 1000;

/**
 * Minimum share of the estimated face region that must pass the skin-colour gate when no
 * face detector is available. Measured on the bundled portraits: 0.92–0.99 for real faces,
 * 0.42 for a wood-textured wall and 0.14 for random noise.
 */
export const MIN_FACE_SKIN_RATIO = 0.6;

const MESSAGES: Record<AnalysisValidityReason, string> = {
  no_face:
    "Không tìm thấy khuôn mặt trong ảnh. Hãy chọn ảnh chụp chính diện, rõ mặt và đủ sáng.",
  multiple_faces:
    "Phát hiện nhiều khuôn mặt trong cùng một ảnh. Hãy chọn hoặc cắt ảnh chỉ có một khuôn mặt chính diện để đo tông da chính xác.",
  no_skin:
    "Không đo được vùng da trên ảnh (ảnh quá tối, quá sáng hoặc không phải ảnh chân dung). Hãy chụp lại nơi đủ sáng.",
  few_skin_pixels:
    "Vùng da đo được quá nhỏ nên kết quả có thể chưa chính xác. Nên chụp gần hơn, mặt chiếm phần lớn khung hình.",
  detector_unavailable:
    "Chưa tải được bộ nhận diện khuôn mặt nên đang dùng khung ước lượng. Kết quả có thể kém chính xác hơn.",
};

export function verdict(
  status: AnalysisValidityStatus,
  reason: AnalysisValidityReason | null
): AnalysisValidity {
  return { status, reason, message: reason ? MESSAGES[reason] : null };
}

/**
 * Decides whether the consultation may be shown, shown with a warning, or must be withheld.
 * "reject" hides every result (season, products, makeup advice) and asks for a new photo.
 */
export function assessAnalysisValidity(input: AnalysisValidityInput): AnalysisValidity {
  const { faceDetection, skinEvidence } = input;
  const { verifiedSkinPixels, faceRegionPixels, usedRegionFallback } = skinEvidence;
  const skinRatio = faceRegionPixels > 0 ? verifiedSkinPixels / faceRegionPixels : 0;

  // 1. Multiple faces in frame: never silently score a random person in a group shot.
  if (faceDetection === "multiple_faces") return verdict("reject", "multiple_faces");

  // 2. No pixel looked like skin: every colour measured belongs to the background or shadow.
  //    This holds even when MediaPipe found a face (e.g. a portrait shot in near darkness).
  if (usedRegionFallback) return verdict("reject", "no_skin");

  // 3. The detector ran to completion and saw no face.
  if (faceDetection === "not_found") return verdict("reject", "no_face");

  // 3. The detector could not run. Fall back on the skin ratio as the only evidence of a face:
  //    real portraits fill 90%+ of the estimated face region with skin, textured walls ~40%.
  if (faceDetection === "unavailable") {
    if (skinRatio < MIN_FACE_SKIN_RATIO) return verdict("reject", "no_face");
    return verdict("warn", "detector_unavailable");
  }

  // 4. A face is confirmed (or the detector is still running and the quick estimate is shown):
  //    only warn when too little skin was measured to average a stable colour.
  if (verifiedSkinPixels < MIN_TRUSTED_SKIN_PIXELS) return verdict("warn", "few_skin_pixels");
  return verdict("ok", null);
}
