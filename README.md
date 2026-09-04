# beauty-ai-consultant 🌟
> **AI Personal Color & Face Shape Makeup Recommendation Engine**

beauty-ai-consultant is an AI-powered computer vision and colorimetry platform for personalized beauty consultation. Given a single selfie photograph, it analyzes facial geometry (478 MediaPipe 3D landmarks) and skin colorimetry (D65 CIELAB + $ITA^\circ$) to provide customized makeup technique guidance and match real-world cosmetic SKUs via vectorized CIEDE2000 ($\Delta E_{00}$).

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Thundercok/beauty-ai-consultant/blob/main/makeup_app_ml.ipynb)

---

## 🌟 Key Features

1. **Face Shape Classification**: Computes geometric ratios ($r_1, r_2, r_3$) over 478 3D landmarks to classify 6 facial shapes (*Oval, Round, Square, Heart, Oblong, Diamond*) with fuzzy Gaussian probabilities.
2. **Skin Colorimetry & 12 Personal Color Seasons**: Skin-ROI white balance, single-argument $ITA^\circ$ calculation, Melanin & Hemoglobin reflectance indices, and 12-season mapping (*Light Summer, Warm Autumn, Deep Winter...*).
3. **Lip Hyperpigmentation & Base Blending**: Samples outer lip border darkness ($L^*$) for concealer/coverage recommendations, and simulates optical color blending on the user's natural lip base.
4. **Modern K-Beauty SKU Matching**: Complete vectorized CIEDE2000 colour matching and finite-layer Kubelka–Munk lip rendering across 70+ modern SKUs (Romand, 3CE, Peripera, BBIA, Merzy, Amuse, Flower Knows). Bradford D50$\to$D65 adaptation is applied only when a catalogue colour is documented as D50-referenced; ordinary sRGB hex is D65.
5. **Full Makeup Layout Recommendation**: Cohesive layout card spanning lipsticks, blushes, eyeshadow palettes, contouring placement, and skin prep/setting routines.

---

## 📂 Directory Structure

```
GlowUpAdvisor/
├── makeup_app/
│   ├── data/
│   │   └── product_database.csv      # 70+ K-Beauty & Asian Beauty SKUs
│   └── src/                          # Tier-A reusable pipeline modules
│       ├── bradford_cat.py
│       ├── kubelka_munk.py
│       ├── skin_roi_v2.py
│       └── advice_engine.py
├── makeup_app_ml.ipynb              # Colab-ready Jupyter Notebook
├── cli.py                            # Command-line pipeline
├── tests/                            # Tier-A unit tests
├── glowup_comprehensive_report.pdf  # 22-page Technical & Architectural Report
├── glowup_comprehensive_report.tex  # LaTeX source for comprehensive report
├── makeup_app_technical_report.pdf  # IEEE-formatted technical report
├── sample_face.jpg                   # Sample test face image
└── README.md
```

---

## 🚀 Quick Start (Google Colab / Local)

### 1. Run in Google Colab (One-Click)
1. Open [Google Colab](https://colab.research.google.com/).
2. Select **Upload** $\to$ Upload `makeup_app_ml.ipynb`.
3. Click **Runtime $\to$ Run all (Ctrl + F9)**.

### 2. Local Jupyter Notebook
```bash
# Install dependencies
pip install "mediapipe==0.10.14" opencv-python-headless scikit-learn scikit-image pandas numpy matplotlib seaborn Pillow jupyter

# Launch notebook
jupyter notebook makeup_app_ml.ipynb
```

### 3. Command Line

```bash
python cli.py --image sample_face.jpg --output-json report.json
```

Use `--catalog-illuminant D50` only for a catalogue whose colour measurements are explicitly supplied in D50 Lab. The bundled hex database is treated as sRGB/D65.

## Tier-A Upgrade Status

The current release implements the data-free upgrade tier: convex-hull/HSV skin sampling with feature exclusion and trimmed means; full 6 × 12 compositional advice; finite-layer RGB Kubelka–Munk lip matching; and an explicit, conditional Bradford CAT. The personal-colour and face-shape classifiers remain unvalidated heuristics until an expert-labelled dataset is supplied for Tier B; their outputs are marked accordingly rather than presented as trained-model results.

---

## 🔬 Core Optical & Color Science Formulas

* **Individual Typology Angle ($ITA^\circ$)**:
  $$ITA^{\circ} = \arctan\!\left(\frac{L^* - 50}{b^*}\right) \times \frac{180}{\pi}$$
* **Optical Base Lip Color Blending**: finite-layer RGB Kubelka–Munk rendering; a zero-thickness layer returns the natural lip substrate and an opaque layer approaches the product reflectance.
* **CIEDE2000 Color Distance ($\Delta E_{00}$)** evaluated via vectorized NumPy array matrix pass in $1.1\text{ ms}$.

---

## 📄 Documentation & Technical Reports
- **[glowup_comprehensive_report.pdf](glowup_comprehensive_report.pdf)** — Full 22-page architectural & optical report.
- **[makeup_app_technical_report.pdf](makeup_app_technical_report.pdf)** — IEEE format technical audit report.
