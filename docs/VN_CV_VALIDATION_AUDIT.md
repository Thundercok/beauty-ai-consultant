# Vietnamese User CV Validation Audit

**Status:** Code-level audit completed; no algorithm changes in this document.
**Scope:** Skin tone / undertone measurement, lip-base measurement, lighting robustness, and evidence needed before claiming suitability for Vietnamese users.
**Important:** "Vietnamese users" are not a single skin-tone or beauty-preference group. Validation must cover a range of skin depths, undertones, lip pigmentation, ages, devices, and makeup habits. Do not encode nationality as a color prior.

## 1. What the current code already does

- Uses MediaPipe FaceLandmarker landmarks to build face and lip masks.
- Estimates the scene illuminant from non-skin pixels, projects it onto a Planckian/daylight locus, and applies Bradford adaptation for measurement.
- Samples face skin pixels after excluding eyes and mouth, filters some highlights/shadows/redness outliers, and computes CIELAB/ITA-derived metrics.
- Has explicit validity states for no face, multiple faces, insufficient skin pixels, and unavailable detector.
- Reports capture-quality factors and widens seasonal uncertainty under non-daylight lighting.
- Keeps portrait processing local in the browser.

These are useful foundations. They do not yet demonstrate real-world accuracy across Vietnamese users or across phone camera pipelines.

## 2. Findings from source inspection

### CV-01 — Lip-base sampling is sparse and has no independent evidence gate (High priority)

**Location:** `src/lib/beauty/portraitPipeline.ts`, `buildNeuralMasks()` and the lip metrics section of `runPortraitAnalysisPipeline()`.

The neural lip masks are formed by drawing small circles around six inner-lip landmarks and eight outer-lip landmarks. The radius is 1.5% of the smaller image dimension. The code then takes median Lab values from the inner samples and median L* from the outer samples.

If no inner-lip pixels are sampled, the pipeline silently substitutes Lab `[52, 18, 10]` and HEX `#B47A78`. The general analysis-validity gate checks face/skin evidence, not whether the lip region itself was measured successfully. Consequently, a report may have valid skin evidence but a synthetic/default lip base.

**Recommendation:**
- Add explicit lip evidence fields: sampled pixel count, valid-pixel ratio, mask coverage, fallback-used flag, and a lip measurement status.
- Do not present a measured lip-base color or personalized lipstick ranking when the lip sample is absent or unreliable. Show a clear "chưa đo được màu môi" state and allow catalog browsing.
- Evaluate a filled polygon/segmentation mask derived from the lip contour against the current landmark-circle approach. Do not replace the current mask until it wins on labeled images.

### CV-02 — Lip highlight/clipping recovery is not applied to lip samples (High priority)

**Location:** `src/lib/beauty/portraitPipeline.ts`, `sampleSkinFromImage()` and lip sampling loop.

Skin sampling has a two-pass clipped-channel recovery path. The lip sampling loop reads directly from `colorimetricRgba` and does not apply equivalent clipping detection/reconstruction. Glossy lips, direct flash, and strong specular highlights can therefore influence the lip-base median differently from the skin measurement.

**Recommendation:**
- Track clipped/near-clipped lip pixels and exclude them from the lip color estimate initially.
- Test whether highlight recovery is valid for lips separately; lip gloss and lipstick are not the same reflectance/material as skin, so do not reuse skin channel ratios without evidence.
- Return a low-confidence lip measurement when too few non-clipped pixels remain.

### CV-03 — Skin pixel selection uses fixed HSV thresholds (Medium–High priority)

**Location:** `src/lib/beauty/portraitPipeline.ts`, `sampleSkinFromImage()`.

The skin gate accepts hue in two fixed ranges, saturation from 20 to 220, and value at least 55. This is simple and fast, but its behavior under different camera ISPs, makeup, shadows, skin depths, and color casts needs a labeled evaluation. Existing code tests and bundled portraits do not establish population-level coverage.

**Recommendation:**
- Measure false rejection and background contamination by skin-depth / undertone group.
- Report coverage and error by group, not just one overall score.
- Compare fixed HSV gating with landmark-constrained robust sampling and a calibrated skin-probability approach. Preserve a conservative reject/warn fallback.

### CV-04 — White-balance and uncertainty calibration evidence is narrow (Medium–High priority)

**Location:** `src/lib/beauty/faceAnalysis.ts`, `SKIN_MEASUREMENT_UNCERTAINTY`; `src/lib/beauty/colorConstancy.ts`.

The uncertainty comment says the error model was fitted on five bundled portraits relit across a range of CCT values. This is useful as an engineering regression set, but it is not a representative validation set across real phone sensors, lighting spectra, and skin tones. CCT alone also does not describe all mixed/green/magenta LED spectra.

**Recommendation:**
- Keep the current uncertainty disclosure.
- Validate with real captures from multiple phone models under daylight, warm LED, cool LED, fluorescent/green cast, mixed light, and flash.
- Compare corrected measurements against a color reference captured in the same session. Track residual error and repeatability per device and skin-depth group.

### CV-05 — ITA labels should not be presented as equivalent to Fitzpatrick types (Medium priority)

**Location:** `src/lib/beauty/faceAnalysis.ts`, `classifyItaCategory()`.

The implementation maps ITA angle bands to labels that include Fitzpatrick I–VI. ITA and Fitzpatrick are different classification systems and are not interchangeable. The label risks implying a validated Fitzpatrick assessment from a photo-derived ITA value.

**Recommendation:**
- Label the result as an ITA-based skin-tone range only, or remove the Fitzpatrick equivalence.
- Keep Fitzpatrick out of the UI unless collected/validated independently for an appropriate purpose.

## 3. Recommended validation dataset

Build an opt-in, consented, locally processed evaluation set. Store only what is necessary and do not commit identifiable face images to the repository.

For each participant/session, record:
- Device make/model and front/rear camera.
- Lighting type and capture distance.
- Skin reference measurement or calibrated color target in frame.
- Skin depth range and self-described undertone only as separate descriptors; do not treat self-description as ground truth for Lab.
- Natural lip color, visible lip pigmentation / border darkness, and whether lip product, balm, gloss, or makeup is present.
- Repeated captures after repositioning and under at least two lighting conditions.

Suggested coverage:
- A broad range of skin depths, including light through deep.
- Warm, cool, neutral, and uncertain undertones.
- Lips with low/high pigmentation, darker borders, uneven pigmentation, dryness, and gloss.
- Multiple Android and iPhone camera pipelines.

## 4. Metrics and release gates

| Area | Metric | Suggested initial gate |
|---|---|---|
| Skin color | Median and 90th-percentile ΔE00 vs reference | Establish baseline first; set threshold after reference-device pilot |
| Repeatability | Within-person ΔE00 across repeat captures in same lighting | Report median / P90, stratified by device |
| Group fairness | Skin-pixel false-rejection and contamination rates | No group silently falls back more often without warning |
| Lip base | ΔE00 vs lip reference swatch / spectro reading | Separate gate from skin; never infer from skin score |
| Lip mask | Precision / recall or IoU against manually annotated lip region | Compare current landmark circles to contour masks |
| Confidence | Calibration of warning states against measurement error | "High" must correspond to lower observed error, not just a heuristic score |

These are proposed evaluation criteria, not claims that the current system already meets them.

## 5. Implementation order

1. **Add lip-measurement evidence and fail-safe UI state** (CV-01).
2. **Add clipping diagnostics for lip samples** (CV-02).
3. **Create a consented, diverse capture protocol and reference set** (CV-03 / CV-04).
4. **Run a group-stratified evaluation of skin segmentation and color constancy**.
5. **Correct ITA/Fitzpatrick wording** (CV-05).
6. Only then tune thresholds or replace algorithms based on measured failure cases.

## 6. Explicit non-goals

- Do not assume one "Vietnamese skin tone" or one universal lipstick palette.
- Do not hard-code nationality as an undertone or skin-depth prior.
- Do not claim clinical, spectrophotometric, or population-level accuracy from unit tests and a handful of bundled portraits.
- Do not use synthetic lip defaults as if they were measured user data.
