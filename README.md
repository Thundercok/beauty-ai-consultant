# beauty-ai-consultant 🌟
> **AI Personal Color & Face Shape Makeup Recommendation Engine**

beauty-ai-consultant is an AI-powered computer vision and colorimetry platform for personalized beauty consultation. Given a single selfie photograph, it analyzes facial geometry (478 MediaPipe 3D landmarks) and skin colorimetry (D65 CIELAB + $ITA^\circ$) to provide customized makeup technique guidance and match real-world cosmetic SKUs via vectorized CIEDE2000 ($\Delta E_{00}$).

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/Thundercok/beauty-ai-consultant/blob/main/makeup_app_ml.ipynb)

---

## 🌟 Key Features

1. **Face Shape Classification**: Computes geometric ratios ($r_1, r_2, r_3$) over 478 3D landmarks to classify 6 facial shapes (*Oval, Round, Square, Heart, Oblong, Diamond*) with fuzzy Gaussian probabilities.
2. **Skin Colorimetry & 12 Personal Color Seasons**: Skin-ROI white balance, single-argument $ITA^\circ$ calculation, Melanin & Hemoglobin reflectance indices, and 12-season mapping (*Light Summer, Warm Autumn, Deep Winter...*).
3. **Lip Hyperpigmentation & Base Blending**: Samples outer lip border darkness ($L^*$) for concealer/coverage recommendations, and simulates optical color blending on the user's natural lip base.
4. **Modern K-Beauty SKU Matching**: Vectorized CIEDE2000 color matching with Bradford CAT (D50$\to$D65) across 70+ modern SKUs (Romand, 3CE, Peripera, BBIA, Merzy, Amuse, Flower Knows).
5. **Full Makeup Layout Recommendation**: Cohesive layout card spanning lipsticks, blushes, eyeshadow palettes, contouring placement, and skin prep/setting routines.

---

## 📂 Directory Structure

```
GlowUpAdvisor/
├── makeup_app/
│   └── data/
│       └── product_database.csv      # 70+ K-Beauty & Asian Beauty SKUs
├── makeup_app_ml.ipynb              # Colab-ready 1-click Jupyter Notebook (11 Cells)
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

---

## 🔬 Core Optical & Color Science Formulas

* **Individual Typology Angle ($ITA^\circ$)**:
  $$ITA^{\circ} = \arctan\!\left(\frac{L^* - 50}{b^*}\right) \times \frac{180}{\pi}$$
* **Optical Base Lip Color Blending**:
  $$\text{Rendered Color} = (1 - \text{Opacity}) \times \text{LipBase}_{\text{Lab}} + \text{Opacity} \times \text{Shade}_{\text{Lab}}$$
* **CIEDE2000 Color Distance ($\Delta E_{00}$)** evaluated via vectorized NumPy array matrix pass in $1.1\text{ ms}$.

---

## 📄 Documentation & Technical Reports
- **[glowup_comprehensive_report.pdf](glowup_comprehensive_report.pdf)** — Full 22-page architectural & optical report.
- **[makeup_app_technical_report.pdf](makeup_app_technical_report.pdf)** — IEEE format technical audit report.
