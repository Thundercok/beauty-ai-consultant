# beauty-ai-consultant

Optical skin colorimetry, illumination-invariant chromophore analysis, and finite-layer Kubelka–Munk K-beauty consultation.

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Thundercok/beauty-ai-consultant/blob/main/notebooks/makeup_app_ml.ipynb)

## Directory Structure

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
│   ├── cli.py                 # Command-line pipeline (`uv run beauty-ai`)
│   ├── face_analysis.py       # Facial ratios, lip metrics, ITA, season baseline
│   ├── kubelka_munk.py        # Finite-layer RGB Kubelka-Munk lip renderer
│   ├── product_matcher.py     # Vectorized CIEDE2000 (Delta E 00) product matching
│   └── skin_roi_v2.py         # Landmark-guided convex-hull/HSV skin ROI extraction
├── data/
│   ├── product_database.csv   # 175 curated K-beauty & eyewear SKUs
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

## Quick Start

```bash
# Core colorimetry, Kubelka-Munk, and test suite
uv sync
uv run ruff check src tests
uv run pytest

# Full CLI with MediaPipe landmark extraction
uv sync --extra vision
uv run beauty-ai --image data/sample_face.jpg --output-json report.json
```

Use `--catalog-illuminant D50` only for a catalogue whose colour measurements are explicitly authored in D50 Lab; standard sRGB hex swatches are D65-referenced by definition.

## Research Status & Limitations

- **Verified deterministic primitives**: convex-hull/HSV skin ROI sampling with eye/lip exclusion and trimmed means, conditional Bradford CAT, finite-layer RGB Kubelka–Munk lip blending, and vectorized CIEDE2000 matching.
- **Unvalidated baselines**: face-shape classification and 12-season mapping remain heuristic baselines until evaluated against expert-labelled ground truth.
- **Active research focus**: illumination-invariant skin chromophore decomposition (melanin & hemoglobin estimation under uncontrolled indoor lighting).
