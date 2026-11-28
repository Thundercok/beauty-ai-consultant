# Beauty AI Consultant

<p align="center">
  <strong>A zero-cost, static-first, privacy-preserving web app for browser-local skin-tone analysis, virtual lipstick/blush try-on, and K-beauty product discovery.</strong>
</p>

<p align="center">
  <a href="https://github.com/Thundercok/beauty-ai-consultant/actions/workflows/ci.yml"><img src="https://github.com/Thundercok/beauty-ai-consultant/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=flat-square" alt="TypeScript" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square" alt="React 19" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Package%20Manager-bun-F9F1E1.svg?style=flat-square" alt="bun" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Hosting-Static%20GitHub%20Pages-111111?style=flat-square" alt="Static GitHub Pages" />
  <img src="https://img.shields.io/badge/Computer%20Vision-MediaPipe%20WASM-5C6BC0?style=flat-square" alt="Computer Vision" />
  <img src="https://img.shields.io/badge/Color%20Science-CIEDE2000%20%7C%20Kubelka--Munk-00897B?style=flat-square" alt="Color Science" />
  <img src="https://img.shields.io/badge/PWA-Installable%20%26%20Offline%20Ready-DC2626?style=flat-square" alt="PWA" />
</p>

---

## 1. Overview & Architecture

**Beauty AI Consultant** is a guest-first, local-first beauty analysis and cosmetic color matching app built to run **100% statically in the browser** with **zero backend requirement in production**, **zero login/account wall**, and **zero paid external services**.

- **Privacy by Architecture:** All face detection (MediaPipe 478-point Face Landmarker WASM), lighting correction (Planckian Grey-Edge + Bradford chromatic adaptation), CIELAB skin/lip sampling, chromophore decomposition, and Kubelka–Munk virtual makeup run strictly on-device. User portraits never leave the browser.
- **Guest-First, No Forced Demo:** On first visit, the app opens with a skippable 3-step onboarding & privacy guide and a clean empty state (no preloaded demo portrait pretending to be the user's face). Users can immediately upload a photo, open the live camera with real-time lighting feedback, browse all 217 catalog products in guest mode, or explicitly opt into clearly labeled **Demo Mode** sample portraits.
- **Local-First Personalization (IndexedDB):** Analysis summaries (compact colorimetry metrics only — never raw portrait images), saved palettes, saved products, and preferences are stored locally in browser IndexedDB (`beauty_ai_local_profile`) with `localStorage`/memory fallbacks, individual deletion, and two-step confirmed "Clear all data". Local data stays on the current browser and does not sync across devices.
- **Installable PWA & Offline Support:** Configured with `vite-plugin-pwa`, Web App Manifest (with `BASE_PATH`-safe paths for GitHub Pages), app icons (`192`, `512`, `maskable`, `180` Apple touch icon), in-app install button + iOS Safari Add-to-Home-Screen guide, offline banner, and on-demand caching of MediaPipe assets.

### Five Product Areas (Vietnamese UI)

1. **Tông da (Home / Tone):** Clean empty state on startup; after uploading/capturing a portrait (or opting into Demo Mode), removes room color cast, measures CIELAB skin/lip color, estimates ITA° and 12-season palette, displays interactive face-zone makeup guides (exportable as PNG), eyewear suggestions, and allows saving palettes to the local profile.
2. **Thử son (Virtual Try-On):** Finite-layer Kubelka–Munk lipstick and blush rendering over the user's measured lip color, with single try-on, before/after makeup comparison slider, 2-shade comparison slider, and honest CIEDE2000 shade-fit scoring.
3. **Mỹ phẩm (Product Discovery):** Always browsable — including before uploading a photo in guest mode — with search, category tabs, brand dropdown, undertone filter, estimated Vietnam budget tiers, saved favorites, product detail sheet, Shopee/TikTok Shop search links, and explicit estimated-price disclaimers.
4. **Chuyên sâu (Beauty Insights):** Lazy-loaded deep diagnostics including analysis quality/reliability indicator, interactive Recharts CIELAB skin tone variance chart (`L*`, `a*`, `b*`), auto face-shape geometry, facial symmetry & contouring advice, brutally honest landmark audit markers on the photo, relighting lab (2700K–6500K), chromophore maps, and A4 PDF / HD PNG / JSON report export.
5. **Hồ sơ (My Beauty Profile):** Lazy-loaded local-first profile showing analysis history (up to 25 summaries), saved color palettes (up to 30), saved products, local default preferences, PWA installation & offline behavior guide, and individual/clear-all data controls.

> **Honest Scope:** Outputs are decision support for cosmetic exploration. They are not dermatological or medical diagnoses, and displayed Vietnam prices are reference estimates rather than verified live store prices or stock.

---

## 2. Repository Structure

```text
beauty-ai-consultant/
├── .github/workflows/
│   ├── ci.yml                     # Typecheck, node:test unit suite, Vite build
│   └── pages.yml                  # Static GitHub Pages deploy (BASE_PATH=/<repo>/)
├── public/
│   ├── icon.svg                   # Vector brand mark
│   ├── pwa-192x192.png            # PWA icon (192x192)
│   ├── pwa-512x512.png            # PWA icon (512x512)
│   ├── pwa-maskable-512x512.png   # Maskable PWA icon with safe-zone padding
│   ├── apple-touch-icon.png       # iOS Safari home screen icon (180x180)
│   └── mediapipe/                 # face_landmarker.task (+ WASM copied at build time)
├── data/
│   ├── product_database.csv       # 217 curated K-beauty and eyewear SKUs (bundled statically)
│   └── sample_face.jpg
├── src/
│   ├── App.tsx                    # 5-tab shell, guest-first flow, IndexedDB wiring, lazy tabs
│   ├── main.tsx                   # Entry point with root error boundary
│   ├── hooks/
│   │   ├── usePWAInstall.ts       # beforeinstallprompt + iOS Safari install detection
│   │   └── useOnlineStatus.ts     # Reactive navigator.onLine hook
│   ├── components/                # GettingStartedEmptyState, OnboardingModal, ToneHomeView,
│   │                              # LipTryOnView, CatalogMatcher, ProductDetailSheet,
│   │                              # ProInsightsView, ProfileView, SkinToneLabChart,
│   │                              # BeautyReportExportModal, PWAInstallButton, OfflineIndicator
│   └── lib/beauty/                # Pure TS vision/colorimetry modules + node:test suites
│       ├── localProfileStore.ts   # Versioned IndexedDB repository + fallbacks + tests
│       ├── analysisValidity.ts    # Strict portrait/skin rejection gates
│       ├── analysisConfidence.ts  # 0–100% analysis quality/reliability indicator
│       ├── portraitPipeline.ts    # End-to-end local CV + colorimetry pipeline
│       ├── neuralLandmarks.ts     # MediaPipe Face Landmarker WASM (BASE_URL-aware)
│       ├── colorConstancy.ts      # Planckian / daylight-locus illuminant estimation
│       ├── bradfordCat.ts         # sRGB ↔ XYZ ↔ CIELAB & Bradford adaptation
│       ├── highlightRecovery.ts   # Specular highlight exclusion & recovery
│       ├── chromophores.ts        # Linear-RGB Beer–Lambert melanin/hemoglobin maps
│       ├── kubelkaMunk.ts         # Finite-layer Kubelka–Munk lip blending
│       ├── productMatcher.ts      # CIEDE2000 & soft CIELAB target matching
│       ├── skinLabVariance.ts     # Regional CIELAB L*/a*/b* distribution + tests
│       ├── reportExport.ts        # Native PDF 1.4 A4 & PNG HD report generator + tests
│       └── *.test.ts              # 94 deterministic node:test unit tests
├── vite.config.ts                 # Static build, MediaPipe WASM copy plugin, VitePWA
└── server.ts                      # Local dev / optional Node preview server (not required in production)
```

---

## 3. Local Development & Static Production Builds

Requires Node.js 20+ (works with `npm` or `bun`).

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

### Quality & Verification Commands

```bash
# TypeScript type-check
npm run lint

# Deterministic unit tests (94 tests via node:test)
npm run test

# Standard static production build (root base path '/')
npm run build

# GitHub Pages subpath static production build
BASE_PATH=/beauty-ai-consultant/ npm run build
cp dist/index.html dist/404.html

# Preview static production bundle locally (no Express backend)
npm run preview
```

### How MediaPipe Static Assets Work in Production

`vite.config.ts` includes a build plugin (`copyMediaPipeWasmPlugin`) that automatically copies the MediaPipe Vision WASM binaries (`vision_wasm_internal.wasm`, `vision_wasm_module_internal.wasm`, and their `.js` loaders) from `node_modules/@mediapipe/tasks-vision/wasm/` into `dist/mediapipe/wasm/` during `vite build`. Together with `public/mediapipe/face_landmarker.task` and `import.meta.env.BASE_URL`, face detection works on any static host (including GitHub Pages subpaths) with zero server-side routes.

---

## 4. Scientific Pipeline & Limitations

1. **Landmarks:** MediaPipe Face Landmarker locates 478 facial points after optional low-light contrast enhancement.
2. **Illuminant Estimation & White Balance:** Non-skin pixels estimate scene illuminant projected onto the CIE daylight / Planckian locus (2500K–9000K), adapted to D65 via Bradford CAT.
3. **Skin & Lip Sampling:** Landmark polygons + HSV/YCbCr gating + specular highlight rejection isolate valid skin/lip pixels. Strict validity gates reject photos with no face or insufficient valid skin pixels instead of fabricating a palette.
4. **Classification & Matching:** ITA° + CIELAB feed a 12-season Gaussian classifier; CIEDE2000 matches products against blended targets; Kubelka–Munk blends lipstick pigment over the user's measured lip substrate.
5. **Reliability Indicator:** Lighting quality, landmark source, valid skin pixel count, and season margin produce an **analysis quality / reliability indicator** (capped at 30% when skin evidence is insufficient) — not a statistical probability of correctness.

**Limitations:**
- Rule-based heuristics (face shape, 12-season labels, facial audit notes, and Vietnam price tiers) are practical baselines, not clinical or retail ground truth.
- Phone camera auto-beautification, harsh backlighting, and screen calibration can still shift apparent color.
- Offline mode caches the app shell, catalog, and previously downloaded MediaPipe assets; opening external Shopee/TikTok Shop links requires an internet connection.

---

## 5. License

Released under the [MIT License](LICENSE).
