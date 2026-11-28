/**
 * Recovering skin pixels whose camera channel clipped.
 *
 * Warm room light plus exposure metered on the face often blows out the red channel on the
 * lit side of the face. Dropping those pixels keeps the hue honest but leaves only the shadow
 * side, so measured L* falls by up to ~20 and a light complexion reads as a deep one.
 *
 * In linear RGB, shading scales all three channels by the same factor, so the channel ratios
 * of one person's skin barely change between highlight and shadow. Ratios measured on the
 * unclipped skin therefore predict the lost channel from the two that survived.
 */

/** 8-bit value at or above which a camera channel is treated as clipped. */
export const CLIPPED_CHANNEL = 250;

/** Fewest unclipped skin pixels needed before their channel ratios are trusted. */
export const MIN_RATIO_SAMPLES = 60;

/** Share of unclipped skin pixels, brightest by green first, used as the ratio reference. */
export const REFERENCE_BRIGHTEST_SHARE = 0.2;

export type LinearRgb = [number, number, number];
export type ClippedChannels = [boolean, boolean, boolean];

/** Linear-light channel ratios of the person's unclipped skin, relative to green. */
export interface SkinChannelRatios {
  rOverG: number;
  bOverG: number;
}

export function clippedChannels(r: number, g: number, b: number): ClippedChannels {
  return [r >= CLIPPED_CHANNEL, g >= CLIPPED_CHANNEL, b >= CLIPPED_CHANNEL];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Chooses which unclipped skin pixels stand in for the clipped ones.
 *
 * The ratios are NOT the same across the face: highlights are measurably less red than
 * shadows (true R/G of clipped pixels 2.4–2.8 vs 2.7–3.9 for the unclipped rest, across the
 * bundled portraits under 3500K). Using every unclipped pixel rebuilds highlights too red.
 *
 * @param samples linear camera RGB of every unclipped pixel that passed the skin gate
 * @returns the pixels whose R/G and B/G medians are used; must keep at least
 *   MIN_RATIO_SAMPLES pixels whenever `samples` has that many
 */
function selectRatioReference(samples: LinearRgb[]): LinearRgb[] {
  // The brightest unclipped pixels sit next to the clipped ones in brightness, so their ratios
  // are the closest stand-in. A fifth of the face is narrow enough to cut most of the shadow
  // bias and wide enough that a few odd pixels cannot swing the median (10% overshot to too
  // blue on one bundled selfie).
  const keep = Math.max(MIN_RATIO_SAMPLES, Math.round(samples.length * REFERENCE_BRIGHTEST_SHARE));
  return [...samples].sort((p, q) => q[1] - p[1]).slice(0, keep);
}

/**
 * Median R/G and B/G of the reference skin pixels, in linear light. Medians, because a few
 * blemishes or lip-edge pixels should not move the ratio for the whole face.
 * Returns null when there are too few samples to trust.
 */
export function estimateSkinChannelRatios(samples: LinearRgb[]): SkinChannelRatios | null {
  const rg: number[] = [];
  const bg: number[] = [];
  for (const [r, g, b] of selectRatioReference(samples)) {
    if (g <= 1e-4) continue;
    rg.push(r / g);
    bg.push(b / g);
  }
  if (rg.length < MIN_RATIO_SAMPLES) return null;
  return { rOverG: median(rg), bOverG: median(bg) };
}

/**
 * Rebuilds the camera's linear RGB for a pixel with clipped channels, or returns null when
 * the pixel cannot be recovered and should be left out of the skin measurement.
 *
 * @param lin linear camera RGB as read (a clipped channel reads at or near 1)
 * @param clipped which channels the camera clipped
 * @param ratios channel ratios of this person's unclipped skin
 */
export function reconstructClippedPixel(
  lin: LinearRgb,
  clipped: ClippedChannels,
  ratios: SkinChannelRatios
): LinearRgb | null {
  const clippedCount = clipped.filter(Boolean).length;
  if (clippedCount === 0) return lin;
  // Two lost channels leave one value and no way to tell brightness from hue.
  if (clippedCount > 1) return null;

  const [r, g, b] = lin;
  let rebuilt: LinearRgb;
  if (clipped[0]) rebuilt = [g * ratios.rOverG, g, b];
  else if (clipped[1]) rebuilt = [r, r / ratios.rOverG, b];
  else rebuilt = [r, g, g * ratios.bOverG];

  // Clipping only ever lowers a reading. A prediction below what the camera recorded means
  // this pixel is not coloured like the rest of the skin (glare, hair, a lip edge).
  const k = clipped.indexOf(true);
  return rebuilt[k] >= lin[k] ? rebuilt : null;
}
