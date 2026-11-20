# beauty-ai-consultant

<p align="center">
  <strong>A computer-vision and color-science toolkit for personalized K-beauty consultation, skin-tone analysis, and cosmetic color matching.</strong>
</p>

<p align="center">
  <a href="https://github.com/Thundercok/beauty-ai-consultant/actions/workflows/ci.yml"><img src="https://github.com/Thundercok/beauty-ai-consultant/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.11%2B-blue.svg?style=flat-square" alt="Python 3.11+" /></a>
  <a href="https://astral.sh/uv"><img src="https://img.shields.io/badge/Package%20Manager-uv-6E9F18.svg?style=flat-square" alt="uv" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://github.com/Thundercok/beauty-ai-consultant"><img src="https://img.shields.io/badge/Computer%20Vision-MediaPipe%20%7C%20OpenCV-5C6BC0?style=flat-square" alt="Computer Vision" /></a>
  <a href="https://github.com/Thundercok/beauty-ai-consultant"><img src="https://img.shields.io/badge/Color%20Science-CIEDE2000%20%7C%20Kubelka--Munk-00897B?style=flat-square" alt="Color Science" /></a>
  <a href="https://github.com/Thundercok/beauty-ai-consultant"><img src="https://img.shields.io/badge/Domain-K--Beauty%20%7C%20Cosmetics-EC407A?style=flat-square" alt="K-Beauty and Cosmetics" /></a>
</p>

---

## 1. Overview

**Beauty AI Consultant** is a standalone Python toolkit for image-based beauty analysis and cosmetic color recommendation. It combines facial landmark analysis, skin-region sampling, colorimetric matching, and physically motivated lip-color rendering to support more consistent product exploration.

The project focuses on three connected tasks:

- **Face and skin analysis:** landmark-guided facial measurements, skin-region extraction, and Individual Typology Angle (ITA) estimation.
- **Cosmetic color matching:** vectorized CIEDE2000 comparison between measured colors and a curated K-beauty product catalogue.
- **Color appearance modeling:** chromatic adaptation and finite-layer RGB Kubelka–Munk rendering for lipstick/blending experiments.

The repository is intended as a decision-support and experimentation tool. Its outputs should not be treated as dermatological assessments or guaranteed product matches.

## 2. Architecture & Repository Structure

```text
beauty-ai-consultant/
├── .github/workflows/ci.yml
├── pyproject.toml
├── uv.lock
├── LICENSE
├── src/beauty_ai/
│   ├── __init__.py
│   ├── advice_engine.py       # Compositional 6-shape x 12-season K-beauty rules
│   ├── bradford_cat.py        # Explicit Bradford chromatic adaptation (D50 <-> D65)
│   ├── cli.py                 # Command-line pipeline (uv run beauty-ai)
│   ├── face_analysis.py       # Facial ratios, lip metrics, ITA, season baseline
│   ├── kubelka_munk.py        # Finite-layer RGB Kubelka-Munk lip renderer
│   ├── product_matcher.py     # Vectorized CIEDE2000 product matching
│   └── skin_roi_v2.py         # Landmark-guided skin ROI extraction
├── data/
│   ├── product_database.csv   # Curated K-beauty and eyewear catalogue
│   └── sample_face.jpg
├── docs/
│   ├── glowup_comprehensive_report.pdf
│   ├── glowup_comprehensive_report.tex
│   ├── makeup_app_technical_report.pdf
│   └── makeup_app_technical_report.tex
├── notebooks/
│   └── makeup_app_ml.ipynb
└── tests/
```

## 3. Quick Start

### Install core dependencies

```bash
uv sync
```

### Run quality checks

```bash
uv run ruff check src tests
uv run pytest
```

### Enable facial landmark extraction

```bash
uv sync --extra vision
uv run beauty-ai --image data/sample_face.jpg --output-json report.json
```

Use `--catalog-illuminant D50` only when the catalogue's color measurements are explicitly authored in D50 Lab. Standard sRGB hex swatches are D65-referenced by definition.

## 4. Core Components

| Component | Responsibility |
|---|---|
| `skin_roi_v2.py` | Extracts a skin region of interest using facial landmarks and image-color constraints |
| `face_analysis.py` | Computes facial proportions, lip metrics, ITA, and baseline seasonal features |
| `bradford_cat.py` | Applies explicit Bradford chromatic adaptation between reference illuminants |
| `product_matcher.py` | Ranks catalogue colors using CIEDE2000 color difference |
| `kubelka_munk.py` | Models finite-layer pigment blending for lipstick appearance experiments |
| `advice_engine.py` | Applies compositional face-shape and seasonal-color recommendation rules |
| `cli.py` | Exposes the analysis pipeline through a command-line interface |

## 5. Research Status & Limitations

- **Implemented deterministic components:** skin-ROI sampling and aggregation, Bradford chromatic adaptation, finite-layer RGB Kubelka–Munk blending, and vectorized CIEDE2000 matching.
- **Heuristic components:** face-shape classification and 12-season color mapping are rule-based baselines, not validated expert-level classifications.
- **Catalogue dependency:** recommendations are limited by the coverage, provenance, and measurement quality of the product database.
- **Image sensitivity:** camera processing, white balance, exposure, illumination, and image compression can shift measured colors. A reference image cannot guarantee an exact real-world product match.
- **Not a medical tool:** skin analysis is for cosmetic exploration only; it does not diagnose skin conditions or provide medical advice.

The active research focus is illumination-invariant skin chromophore decomposition (melanin and hemoglobin estimation under uncontrolled indoor lighting). This remains an ongoing research direction, not a validated production capability.

## 6. Reproducibility & Continuous Integration

The GitHub Actions workflow runs on pushes and pull requests targeting `main`. It installs the project with `uv`, runs Ruff, and executes the pytest suite on Ubuntu with Python 3.12.

For local reproduction, use the committed `uv.lock` and the commands in the Quick Start section.

## 7. License

Released under the [MIT License](LICENSE).
