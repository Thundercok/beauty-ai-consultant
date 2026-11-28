# PRODUCT AUDIT, TRUST & RELEASE GOVERNANCE — BEAUTY AI CONSULTANT

Generated from direct inspection of the repository source, bundled assets, catalog CSV (`data/product_database.csv`), unit tests (`node:test`), and headless Chromium verification.

---

## 1. Repository & Asset Inventory (Verified)

| Layer | Verified Implementation |
| --- | --- |
| Framework | React 19 + TypeScript + Vite SPA (100% static-first, zero mandatory backend) |
| Styling | Tailwind CSS v4 (`src/index.css`), Google Fonts (`Outfit`, `Plus Jakarta Sans`, `JetBrains Mono`) |
| Computer Vision | MediaPipe FaceLandmarker (`@mediapipe/tasks-vision`, 478 landmarks including irises, `numFaces: 2` to reject multi-face group photos) |
| Model & WASM Assets | `public/mediapipe/face_landmarker.task` (**3.6 MB**), `public/mediapipe/wasm/vision_wasm_internal.wasm` & `vision_wasm_module_internal.wasm` (copied cleanly to `dist/mediapipe/wasm/` via `copyMediaPipeWasmPlugin`) |
| Product Catalog | `data/product_database.csv` (**25 KB**, **217 records**, **48 unique brands**, 13 product types) |
| Persistence | Local-only IndexedDB v1 + `localStorage` / memory fallback (`src/lib/beauty/localProfileStore.ts`). Raw portrait pixel buffers are NOT persisted to storage. |
| Automated Tests | `node:test` via `tsx` under `src/lib/beauty/*.test.ts` (**114 passing tests**) |

### Catalog Data Integrity Check (Verified on all 217 rows via `validateCatalog()`)
- Invalid HEX color codes: **0 / 217**
- Duplicate `(brand, product_name, shade_name, product_type)` records: **0 / 217**
- Missing `undertone`, `best_seasons`, or `texture_type`: **0 / 217**
- Missing verified commercial metadata (live retailer price, verified stock status, official SKU URL, product photo, provenance timestamp): **217 / 217** — explicitly modeled via `getProductDataProvenance()` so UI never implies verified pricing or live stock.

---

## 2. Scientific Validity & Evidence Classification Matrix

| Output / Feature | Epistemic Class | Source / Method in Code | Known Scientific Limitations | Recommended Validation Method |
| --- | --- | --- | --- | --- |
| Skin & lip `L*`, `a*`, `b*`, ITA°, Hue angle | **Measured (from sRGB pixels)** | `faceAnalysis.ts` + `colorConstancy.ts` (Planckian Grey-Edge WB + Bradford CAT + specular highlight recovery) | Depends on camera auto-WB, ISP tone curve, lighting spectrum (CRI), makeup/filters, and uncalibrated display | Measure repeatability against ColorChecker Passport & spectrophotometer across diverse skin tones (Fitzpatrick I–VI / Monk 1–10) |
| 12-Season classification & posterior weights | **Inferred (heuristic model)** | `colorHarmony.ts` + lighting-aware posterior widening (`seasonUncertainty.ts`) | Seasonal color theory is a styling framework, not a clinical or objective physical taxonomy; lighting shift widens uncertainty | Blind agreement testing with certified color analysts across controlled daylight + indoor lighting |
| CIEDE2000 product distance & `% khớp màu` | **Estimated (color similarity only)** | `productMatcher.ts` + `kubelkaMunk.ts` (lip substrate mixing) | **Color distance ≠ cosmetic suitability probability.** Static catalog HEX ignores formula finish, opacity, oxidation, texture, and undertone interaction on real skin/lips | Real-world swatch comparison on diverse lip/skin substrates under D65 + indoor light |
| Image quality / confidence index (`0–100%`) | **Heuristic quality score** | `analysisConfidence.ts` (lighting 45%, landmarks 25%, skin area 15%, season margin 15%) | **Not a statistically calibrated probability.** Reflects input capture conditions only | Calibration study (ECE / Brier score) comparing score against daylight ground-truth stability |
| Facial asymmetry heatmap & landmark deltas | **Measured (2D/pseudo-3D geometry)** | `asymmetryHeatmap.ts` & `honestLandmarkAudit.ts` (roll-compensated MediaPipe 478 landmarks) | Sensitive to head yaw/pitch, camera lens distortion (close-up selfie), expression, and hair/glasses occlusion | Cross-check landmark deltas against calibrated multi-view 3D scans |
| Vietnam price tiers & shop buttons | **Estimated / Unverified Search** | `vnBeautyGuide.ts` (`estimateProductPriceVn`, `buildVnShopLinks`) | Approximate brand/type reference range only; buttons open keyword search pages, not verified retailer SKUs or stock | Connect owner-approved verified merchant feeds with timestamps |

---

## 3. Top Verified Findings & Remediations (Audit Register)

| ID | Sev | Location | Verified Issue | Status & Remediation |
| --- | --- | --- | --- | --- |
| **AUD-01** | **P0** | `ProfileView.tsx` (`catalogProductToInspectable`) | Previously hardcoded `deltaE: 0` / `matchTier: "Great Match"`, causing `99%` match scores on unanalyzed saved products | **Fixed & unit-tested** — replaced with `catalogProductToBrowseItem()` (`deltaE: null`, `isPersonalized: false`) |
| **AUD-02** | **P0** | `CatalogMatcher.tsx` | Guest browse mode previously fabricated `deltaE: 10` / `matchTier: "Great Match"` | **Fixed & unit-tested** — centralized `evaluateRecommendationEligibility()` + explicit `null` scores |
| **AUD-03** | **P1** | `productMatcher.ts` | Did not validate `targetHex` / `row.hex_color` before CIELAB conversion | **Fixed & unit-tested** — strict `isValidHexColor()` validation skips malformed rows cleanly |
| **AUD-04** | **P1** | `CatalogMatcher.tsx` & `ProductDetailSheet.tsx` | Double-tilde `~~` price prefix and ambiguous `"Mua"` link copy | **Fixed** — clean estimated VN price labels, `"Tìm mua"` search link copy, and collapsible `Minh bạch gợi ý & nguồn dữ liệu` disclosure |
| **AUD-05** | **P1** | `CatalogMatcher.tsx` | `analysisValidity.status === "warn"` lacked a caution banner inside the catalog view | **Fixed & unit-tested** — surfaces explicit `caution` banner with retake CTA |
| **AUD-06** | **P1** | `App.tsx` (`detailProduct`) | Inspecting a product then switching portraits could leave stale match data open | **Fixed** — clears `detailProduct` whenever portrait image changes or clears |
| **AUD-07** | **P1** | `neuralLandmarks.ts` & `analysisValidity.ts` | `numFaces: 1` silently analyzed one person in multi-face group photos | **Fixed & unit-tested** — `numFaces: 2` detects `multiple_faces` and withholds results with clear Vietnamese recovery guidance |
| **AUD-08** | **P2** | `analysisConfidence.ts` & `honestMakeupAudit.ts` | Copy phrasing risked implying calibrated/absolute accuracy | **Fixed** — updated to honest measurement-stability and image-clarity wording |

---

## 4. Real-World Robustness Matrix

| Condition | Expected Behavior | Observed Behavior (Verified) | Reliable? | Fallback / Recovery & User Explanation |
| --- | --- | --- | --- | --- |
| Diverse skin tones & undertones | Fair skin-pixel segmentation across light–deep tones without clipping | Verified via unit tests (`colorimetry.test.ts`, `seasonUncertainty.test.ts`); real-world Monk 1–10 human benchmark **not yet run** | Partial (code verified, human benchmark pending) | Planckian WB + highlight recovery + explicit lighting caveat |
| Warm / cool / dim / bright lighting | Estimate CCT, apply bounded WB, widen season uncertainty, warn when extreme | Verified via `lightingDrift.test.ts` & `seasonUncertainty.test.ts` + demo portrait `cafe_warm` | Moderate (bounded by sRGB ISP) | Shows `caution` banner + recommends natural daylight near a window |
| Camera sensors / ISP / compression | Avoid crashing; avoid claiming clinical accuracy | Disclosed in `ProductDetailSheet` transparency notes & `ProInsightsView` | Referential only | Explicit limitation disclosure (`ánh sáng, cân bằng trắng, màn hình`) |
| Makeup / filters / shadows / occlusion | Avoid mistaking strong blush/shadows for bare skin; warn when skin area is small | `few_skin_pixels` (< 1,000 px) triggers `warn`; `usedRegionFallback` triggers `reject` | Low if heavy filter/makeup | Withholds or enters `caution` mode; explains why |
| No face / non-portrait / black frame | Withhold all season & product scores | Verified (`analysisValidity.test.ts`: `reject:no_face`, `reject:no_skin`) | Reliable | Hides results, preserves catalog browse, offers upload/retake CTA |
| Multiple faces in one photo | Refuse to guess which person to analyze | Verified (`neuralLandmarks.ts` `numFaces: 2` + `analysisValidity.test.ts` `reject:multiple_faces`) | Reliable | Rejects with clear message asking for single-face crop/photo |
| Camera permission denied / unavailable | Show specific Vietnamese reason + gallery/native camera fallback | Verified in `CameraCaptureModal.tsx` (`NotAllowedError` vs unavailable device) | Reliable (desktop verified; physical iOS/Android pending) | Retry camera button + native camera input + upload from gallery |
| Offline / slow network / WASM load fail | App stays usable; fallback face box warns if skin ratio passes, else rejects | Verified via `withTimeout(15000)` + `detector_unavailable` gate + PWA service worker | Partial (offline catalog ok; degraded landmarks) | Explicit warning banner (`Đang dùng khung ước lượng khuôn mặt`) |
| Invalid or incomplete catalog data | Exclude invalid HEX from color matching; mark missing attributes `"unknown"` | Verified (`recommendationIntegrity.test.ts`: 0 invalid rows in CSV, invalid HEX excluded) | Reliable | Keeps valid rows browsable; never fabricates scores |

---

## 5. Privacy & User Data Lifecycle (Code-Verified Audit)

| Stage | Verified Implementation Evidence |
| --- | --- |
| **1. Capture** | User selects local file (`<input type="file">`), captures frame in `CameraCaptureModal` (`getUserMedia` → offscreen `<canvas>`), or explicitly chooses a bundled demo portrait. |
| **2. Processing** | 100% client-side in browser memory (`LoadedImageBuffer.rgba` → `runPortraitAnalysisPipeline` + local `/mediapipe/` WASM & `.task` files). **Zero** portrait upload endpoints exist in `src/`. |
| **3. Storage** | `localProfileStore.ts` persists **only compact numeric/text summaries** (season, `L*/a*/b*`, hex swatches, saved product IDs, occasion/texture/displayName preferences) in IndexedDB (`beauty_ai_profile_v1`) with `localStorage` fallback. Raw portrait images are **never** written to IndexedDB, `localStorage`, or cookies. |
| **4. Usage** | Used locally to render skin analysis, heatmap, virtual try-on, PDF/PNG report export (`reportExport.ts`), and catalog sorting. |
| **5. Retention** | Retained locally on the current browser up to hard caps (25 analysis entries, 30 palettes) until user deletes or clears browser site data. No cross-device sync. |
| **6. Deletion** | Per-item delete buttons for history, palettes, and saved products + two-step `"Xóa toàn bộ dữ liệu cá nhân"` wipe (`localProfileStore.clearAll()`) verified in `ProfileView.tsx` and `localProfileStore.test.ts`. |
| **External Requests Observed** | Google Fonts CSS/woff2 (`index.html`) and user-initiated external search links (`shopee.vn`, `tiktok.com`, `hasaki.vn`). **Zero** third-party analytics, ads, telemetry, or image-storage SDKs. |

---

## 6. Real-Device & Cross-Browser Validation Status

| Target Platform | Status | Notes |
| --- | --- | --- |
| Desktop Chrome / Chromium (`1440×900`) | **Verified (Headless Chromium)** | Full UI, pulsed heatmap, hover/click interactions, tabs, guest catalog, transparency details, 0 console errors |
| Mobile Viewport (`390×844` Chromium emulation) | **Verified (Emulated)** | Responsive layout, 0 horizontal overflow, bottom navigation, mobile KPI strip |
| **iOS Safari (physical iPhone)** | **NOT TESTED** | Camera `getUserMedia`, EXIF orientation, Safari IndexedDB/PWA Add-to-Home-Screen require physical device QA |
| **Android Chrome (physical device)** | **NOT TESTED** | Low-memory WASM execution, front-camera ISP/WB, and install prompt require physical device QA |
| **Desktop Safari (macOS)** | **NOT TESTED** | Canvas/WASM behavior and SVG `transform-box: fill-box` pulse animation require real Safari QA |

---

## 7. Release Governance Verdict

- **Current Release Status:** **READY FOR LIMITED CLOSED BETA ONLY (NO-GO FOR PUBLIC COMMERCIAL LAUNCH)**
- **Blocking Prerequisites Before Public Launch:**
  1. Execute physical-device QA matrix on iOS Safari, Android Chrome, and Desktop Safari (camera permissions, EXIF rotation, backgrounding/resuming, low-end memory).
  2. Conduct controlled human evaluation across diverse skin tones (10–20+ participants) under daylight and indoor lighting to validate repeatability and wording comprehension.
  3. Obtain owner approval and integrate verified commercial product feeds if live pricing, stock status, or official retailer links are required for public launch (or explicitly keep beta positioned as an educational color-matching reference tool).

---

## 8. Deep Colorimetry & Recommendation Engine Audit (`productMatcher.ts`, `bradfordCat.ts`, `kubelkaMunk.ts`)

### 8.1 CIEDE2000 Verification (`src/lib/beauty/productMatcher.ts` — note: `ciede2000` resides in `productMatcher.ts`, while `bradfordCat.ts` provides sRGB/XYZ/CIELAB and Bradford CAT utilities)
- **Reference Benchmark:** Verified against **all 34 published test pairs from Sharma, Wu & Dalal (2005), Table 1** (`kL = kC = kH = 1`), including the `|h1' - h2'| = 180°` hue-mean discontinuity pairs (#11–#14), blue-region rotation (`R_T` near `h̄' = 275°`), achromatic `C' = 0` pairs, and extreme lightness `S_L` near `L* = 2` and `L* = 91`.
- **Observed Precision:** Maximum absolute error across all 34 Sharma pairs is **`4.95 × 10⁻⁵`** (`< 0.0001`, exact to all 4 published decimal places), with strict symmetry `ΔE₀₀(A, B) === ΔE₀₀(B, A)` (`< 1e-12`).
- **Hardening Applied:** Added explicit Sharma Eq. (7) zero-chroma / IEEE-754 negative-zero guard (`a' === 0 && b === 0 => h' = 0`) and Eq. (10) `C1' * C2' === 0 => Δh' = 0` guard plus `Math.max(0, ...)` under the outer square root.

### 8.2 Bradford CAT & sRGB/XYZ/CIELAB Verification (`src/lib/beauty/bradfordCat.ts`)
- **Reference Standards:** Verified against **IEC 61966-2-1** (sRGB transfer function & D65 primaries), **ASTM E308 / CIE 1931 2°** whitepoints (`D50`, `D65`), **CIE 1976** exact rational threshold `ε = (6/29)³`, and **Lam (1985) / Bruce Lindbloom** Bradford chromatic adaptation matrices (`D50 ↔ D65`).
- **Measured Accuracy:**
  - `BRADFORD_MATRIX × BRADFORD_INV_MATRIX` max residual vs identity: **`8.45 × 10⁻⁸`**
  - `SRGB_TO_XYZ_MATRIX × XYZ_TO_SRGB_MATRIX` max residual vs identity: **`1.42 × 10⁻⁷`**
  - Computed Bradford `D50 → D65` vs Lindbloom published matrix max element error: **`1.27 × 10⁻⁷`**
  - Computed Bradford `D65 → D50` vs Lindbloom published matrix max element error: **`7.48 × 10⁻⁸`**
  - `xyzToLab` ↔ `labToXyz` round-trip across CIE rational `ε = (6/29)³`: max error **`1.11 × 10⁻¹⁶`**
  - `rgbToLab` on sRGB primaries & neutrals (`White`, `Black`, `Red`, `Green`, `Blue`, `Gray128`) vs Lindbloom D65 CIELAB reference: **`ΔE₀₀ ≤ 0.00003`**
- **Hardening Applied (`AUD-16`):** Fixed `hexToRgb()` to enforce strict `/^[0-9A-Fa-f]{6}$/` validation (preventing `parseInt("1Z", 16) === 1` partial-hex coercion) and added `Number.isFinite()` guards in `srgbChannelToLinear()` / `linearChannelToSrgb()`.
- **Documented D50 Workflow Caveat:** `matchProducts(..., { catalogIlluminant: "D50" })` converts swatch hex via `hexToLab` (sRGB D65) and then adapts Lab from `D50 → D65` via `adaptLabBradford`. This is appropriate when the hex values originate from ICC D50 PCS-converted swatch tables (white stays white with `ΔE₀₀ = 0`), but cannot recover true spectral shift of an unknown studio-lit photograph.

### 8.3 Kubelka–Munk Lip Model Audit & Bug Fix (`src/lib/beauty/kubelkaMunk.ts`)
- **Critical Numerical Bug Found & Fixed:** The prior `Math.sinh(opticalDepth) / (a * Math.sinh(opticalDepth) + b * Math.cosh(opticalDepth))` implementation overflowed IEEE-754 float64 to `Infinity / Infinity = NaN` whenever `opticalDepth > 709` (reproduced directly with opaque dark/black pigment `[0, 0, 0]` → `[NaN, NaN, NaN]`). Rewritten into the mathematically identical `tanh(x)` / `sech(x)` form, eliminating all overflow while converging smoothly to exact infinite-thickness reflectance $R_\infty = 1 / (a + b)$.
- **Fundamental Scientific Limitations (Documented):**
  1. **3-Channel RGB vs Spectral `R(λ)`:** True Kubelka–Munk operates on 31+ spectral bands (400–700 nm). Computing `K/S` independently in 3 linear sRGB channels ignores metamerism and narrow-band pigment cross-talk.
  2. **Wavelength-Independent Scattering `S`:** Assumes constant `S` across R/G/B, whereas real TiO₂, iron oxide, and mica pigments scatter strongly by wavelength and particle size.
  3. **No Saunderson Surface Correction:** Omits front-surface Fresnel specular reflection (`k1 ≈ 0.04`) and internal diffuse reflection (`k2 ≈ 0.4–0.6`), which visibly alters dark glossy shades (`Mirror Gloss`, `Juicy Tint`).
  4. **Heuristic Texture Constants:** `TEXTURE_KS_MAP` (`scattering`, `thickness`) are uncalibrated visual approximations, not spectrophotometer-measured `K(λ)/S(λ)` curves, and do not model staining/pH dyes, shimmer/pearl, wear-down, or oxidation.

### 8.4 Recommendation Engine Integrity Audit (`src/lib/beauty/productMatcher.ts`, `CatalogMatcher.tsx`, `ToneHomeView.tsx`, `ProductDetailSheet.tsx`, `reportExport.ts`, `viLabels.ts`, `virtualMakeup.ts`)
- **Documented CIEDE2000 Thresholds Fixed (`AUD-09`):** Previously `matchProducts` labeled every shade with `ΔE₀₀ ≥ 2.0` (including completely unrelated shades at `ΔE₀₀ = 25.38`) as `"Close Alternative"`. Replaced with exported `CIEDE2000_SIMILARITY_THRESHOLDS` (`< 1.0 Exact Match`, `< 2.0 Great Match`, `< 5.0 Close Alternative`, `≥ 5.0 Distant Shade`), `classifyColorSimilarityTier()`, and `describeColorSimilarity()`.
- **Suitability Probability Separation (`AUD-10` & `AUD-12`):** Updated `translateMatchTier()` in `viLabels.ts` from personal suitability claims to honest color-similarity descriptions, and replaced rescaled `% hợp` / `% hợp màu` / `% khớp màu` badges across `CatalogMatcher.tsx`, `ToneHomeView.tsx`, `ProductDetailSheet.tsx`, and `reportExport.ts` with documented CIEDE2000 similarity tiers and raw `ΔE₀₀` distance (previously `deltaEToMatchPercent(5.0)` rendered `"88% hợp"` for a `"Distant Shade"`).
- **Unverified Popularity & Curation Override Fixed (`AUD-11` & `AUD-13`):** In `scoreMatchedProductsPopularity()`, unscored/unpersonalized items (`deltaE === null` or `isPersonalized === false`) now strictly receive `popularityScore = 0` and `isPopular = false` (never boosted by static brand/season tags), `"Distant Shade"` items (`ΔE₀₀ ≥ 5.0`) are hard-gated from `isPopular: true`, and metadata curation bonuses are scaled (`0.25×`) beyond `CLOSE_MAX` so static brand/line familiarity can never push a distant shade above an `"Exact Match"`.
- **Non-Colorimetric Category Gating (`AUD-14`):** Added `COLORIMETRIC_MATCH_PRODUCT_TYPES` (`lipstick`, `blush`, `eyeshadow`, `foundation`, `concealer`, `powder`) and `isColorimetricMatchProductType()` in `productMatcher.ts`, and updated `CatalogMatcher.tsx` so non-colorimetric categories (`glasses`, `mascara`, `eyeliner`, `setting_spray`, `contour`, `eyebrow`, `highlighter`) are displayed as honest catalog browse items (`deltaE: null`, `similarityBasis: "catalog_browse_only"`) instead of being scored against bare `skinHex`.
- **Strict Catalog Record & Missing-Data Gating (`AUD-15`):** `matchProducts()` now enforces `validateCatalogRecord(row).validForColorMatch` (rejecting rows with missing `brand`, `product_name`, `product_type`, or invalid HEX), guards against non-finite `lipBaseLab` / `seasonProbabilities`, and surfaces `similarityBasis` + `missingMetadataFields` explicitly on `MatchedProduct`.


