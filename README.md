# beauty-ai-consultant

<p align="center">
  <strong>A browser-based computer-vision and color-science app for personalized K-beauty consultation, skin-tone analysis, and cosmetic color matching.</strong>
</p>

<p align="center">
  <a href="https://github.com/Thundercok/beauty-ai-consultant/actions/workflows/ci.yml"><img src="https://github.com/Thundercok/beauty-ai-consultant/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=flat-square" alt="TypeScript" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB.svg?style=flat-square" alt="React 19" /></a>
  <a href="https://bun.sh/"><img src="https://img.shields.io/badge/Package%20Manager-bun-F9F1E1.svg?style=flat-square" alt="bun" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://github.com/Thundercok/beauty-ai-consultant"><img src="https://img.shields.io/badge/Computer%20Vision-MediaPipe%20Face%20Landmarker-5C6BC0?style=flat-square" alt="Computer Vision" /></a>
  <a href="https://github.com/Thundercok/beauty-ai-consultant"><img src="https://img.shields.io/badge/Color%20Science-CIEDE2000%20%7C%20Kubelka--Munk-00897B?style=flat-square" alt="Color Science" /></a>
  <a href="https://github.com/Thundercok/beauty-ai-consultant"><img src="https://img.shields.io/badge/Domain-K--Beauty%20%7C%20Cosmetics-EC407A?style=flat-square" alt="K-Beauty and Cosmetics" /></a>
</p>

---

## 1. Overview

**Beauty AI Consultant** is a web app for image-based beauty analysis and cosmetic color recommendation. It started from a very practical everyday problem: trying to buy the right makeup shades (lipstick, blush, cushion foundation) for my girlfriend without guessing blindly under warm store or bedroom lighting, where a swatch on screen can look completely different on actual skin and pigmented lips.

All image processing runs on-device in the browser. A selfie never leaves the machine; the Express server only serves the app, the product catalogue, and the MediaPipe model files.

The app has four views (the UI is in Vietnamese):

- **Tone (Tông da):** removes the room's color cast, measures skin and lip color, estimates ITA° and a 12-season palette, and suggests the best-matching products and makeup tips for the detected face shape.
- **Try-on (Thử son):** renders lipstick and blush onto the portrait with a finite-layer Kubelka–Munk model, so a shade is shown as pigment over the person's own lip color rather than a flat overlay.
- **Shop (Mỹ phẩm):** CIEDE2000 matching against a curated K-beauty catalogue, with filters, popularity scoring, and saved items.
- **Insights (Chuyên sâu):** white-balance diagnostics, a relighting experiment (2700K to 6500K), and melanin / hemoglobin chromophore heatmaps.

Outputs are decision support for product exploration. They are not dermatological assessments or guaranteed product matches.

## 2. Repository Structure

```text
beauty-ai-consultant/
├── .github/workflows/ci.yml      # bun install, typecheck, unit tests, production build
├── server.ts                     # Express + Vite middleware; /api/products, /api/health, MediaPipe assets
├── index.html
├── package.json / bun.lock
├── src/
│   ├── App.tsx                   # Tab shell, upload / camera flow, analysis state
│   ├── main.tsx                  # Entry point with root error boundary
│   ├── components/               # ToneHomeView, LipTryOnView, CatalogMatcher, ProInsightsView, ...
│   └── lib/beauty/
│       ├── portraitPipeline.ts   # End-to-end analysis: landmarks → WB → skin/lip ROI → report
│       ├── neuralLandmarks.ts    # MediaPipe Face Landmarker (WASM) and ROI polygon masks
│       ├── colorConstancy.ts     # Planckian / daylight-locus constrained illuminant estimation
│       ├── bradfordCat.ts        # sRGB ↔ XYZ ↔ CIELAB and Bradford chromatic adaptation
│       ├── chromophores.ts       # Linear-RGB Beer–Lambert melanin / hemoglobin decomposition
│       ├── faceAnalysis.ts       # Facial ratios, face shape, ITA°, 12-season classification
│       ├── productMatcher.ts     # CIEDE2000, soft CIELAB target blending, popularity ranking
│       ├── kubelkaMunk.ts        # Finite-layer RGB Kubelka–Munk lip blend
│       ├── virtualMakeup.ts      # Lip / blush alpha masks and compositing
│       ├── colorHarmony.ts       # Eye-cheek-lip harmony sets and indoor-light simulation
│       ├── imageEnhancement.ts   # Bilateral denoise, low-light contrast, luma unsharp mask
│       ├── adviceEngine.ts       # Face-shape × season K-beauty rules
│       ├── viLabels.ts           # Vietnamese UI labels
│       └── *.test.ts             # node:test unit tests
├── data/
│   ├── product_database.csv      # 217 curated K-beauty and eyewear SKUs
│   └── sample_face.jpg
├── public/mediapipe/             # face_landmarker.task and the vision WASM runtime
└── docs/
    ├── RESEARCH_PLAN.md          # Hypotheses, verified failure modes, experimental roadmap
    └── *_report.{tex,pdf}        # Technical reports
```

## 3. Quick Start

Requires [bun](https://bun.sh/) and Node.js 20+.

```bash
bun install
```

```bash
bun run dev
```

Then open <http://localhost:3000>. The app loads a sample portrait so every view works before you upload a photo.

### Quality checks

```bash
bun run lint
```

```bash
bun run test
```

```bash
bun run build
```

### Production

```bash
bun run build && bun run start
```

`start` serves the built `dist/` with `NODE_ENV=production`. Set `PORT` to change the port and `DISABLE_HMR=true` to turn off hot reload in dev.

## 4. Analysis Pipeline

1. **Landmarks.** MediaPipe Face Landmarker locates the face; low-light frames are denoised and contrast-boosted first so detection holds up indoors.
2. **Illuminant estimation.** The room light is estimated from non-skin pixels and projected onto the CIE daylight / Planckian locus (2500K–9000K), so a warm bulb is corrected without pushing skin toward gray.
3. **White balance.** Bradford chromatic adaptation maps the estimated illuminant to D65.
4. **Skin and lip sampling.** Landmark polygons give the skin and inner / outer lip regions; skin pixels are further gated by HSV and YCbCr skin-color ranges.
5. **Classification.** ITA° and CIELAB values feed a Gaussian-prototype 12-season classifier; facial ratios give the face shape.
6. **Matching.** Target colors are softly blended in CIELAB and ranked against the catalogue with CIEDE2000, then re-scored for popularity and brand diversity.

## 5. Research Status & Limitations

- **Deterministic components:** illuminant estimation, Bradford adaptation, chromophore decomposition, Kubelka–Munk blending, and CIEDE2000 matching are implemented and unit-tested.
- **Heuristic components:** face-shape classification and 12-season mapping are rule-based baselines, not validated expert classifications.
- **Catalogue dependency:** recommendations are limited by the coverage and measurement quality of the product database. Hex swatches are treated as D65 sRGB.
- **Image sensitivity:** camera processing, exposure, and compression still shift measured colors. A photo cannot guarantee an exact real-world match.
- **Not a medical tool:** skin analysis is for cosmetic exploration only.

The research questions behind the pipeline (illumination-invariant chromophore maps, constrained illuminant estimation, recommendation stability across lighting) are written up in [docs/RESEARCH_PLAN.md](docs/RESEARCH_PLAN.md). The original Python toolkit and its benchmarks (`exp01`–`exp05`) were replaced by this TypeScript port; they remain in git history up to commit `7b509a9`.

## 6. Continuous Integration

GitHub Actions runs on pushes and pull requests to `main`: `bun install --frozen-lockfile`, `tsc --noEmit`, the `node:test` suite, and `vite build`.

## 7. License

Released under the [MIT License](LICENSE).
