# Research Plan: Illumination-Invariant Skin Colorimetry & Chromophore Separation

## 1. Practical & Scientific Goal

Buying accurate cosmetic shades (foundation, blush, lipstick) from a casual smartphone selfie fails primarily because indoor room lighting (2700K warm LEDs, 4000K office fluorescents, mixed window light) shifts perceived skin chromaticity far beyond the human just-noticeable difference ($\Delta E_{00} \approx 2.0$).

Our goal is to design and verify a **physically grounded, deterministic optical pipeline** that separates:
1. **Room illuminant ($\mathbf{E}$)** and geometric shading ($s(x)$), from
2. **Intrinsic skin chromophores** — relative and absolute melanin ($c_M$) and hemoglobin ($c_H$) — and D65 skin/lip colorimetry for accurate cosmetic matching.

---

## 2. Verified Baseline Failure Modes

| Experiment | Finding | Implication |
| :--- | :--- | :--- |
| `exp01_baseline_failure.py` | Under 2700K vs. 6500K with **no WB**, skin shifts by $\Delta E_{00} = 9.1$, $ITA^\circ$ drops by $11.4^\circ$, naive Melanin drops $53\%$, and Hemoglobin rises $63\%$. | Raw sRGB selfies cannot reliably classify undertone or chromophores. |
| `exp01_baseline_failure.py` | **Skin-ROI Gray-World WB** destroys true skin color even at ideal 6500K ($\Delta E_{00} = 13.7\text{–}18.7$, $a^*, b^* \to 0$, Hemoglobin $\to 0$). | Never assume skin pixels average to achromatic gray. |
| `exp02_illuminant_estimation.py` | On `sample_face.jpg` (512×512) at 6500K, **Sclera WB** (75 px) gives $\Delta E_{00} = 9.41$ and **brightest-skin specular** gives $\Delta E_{00} = 7.27$. **Non-Skin SoG ($p=6$)** stabilizes $b^*$ across 2700K–8000K (`15.4–15.9`) but suffers background color bias ($\Delta E_{00} = 5.46\text{–}7.70$). | Any single-region "white point" heuristic introduces systematic color bias when that region is not truly achromatic. |

---

## 3. Experimental Roadmap (Incremental & Falsifiable)

### Phase 1 — Illumination-Invariant Relative Chromophore Maps (`exp03`)
- **Hypothesis:** In linear-RGB optical density space $\mathbf{d}(x) = -\log \mathbf{I}(x)$, projecting centered log-chromaticity $\tilde{\mathbf{d}}(x) - \bar{\tilde{\mathbf{d}}}_{\text{skin}}$ onto fixed physiological melanin/hemoglobin basis vectors $(\mathbf{v}_M, \mathbf{v}_H)$ yields spatial pigmentation/erythema maps that are invariant to arbitrary linear diagonal illuminants $\mathbf{E}$ and shading $s(x)$ (zero sign ambiguity, unlike unconstrained FastICA).
- **Falsification Criterion:** Measure pixel-wise correlation ($r$) and RMSE of extracted $\Delta c_M(x), \Delta c_H(x)$ maps between 2700K and 6500K relit portraits; compare directly against non-linear sRGB `log10` and unconstrained FastICA.

### Phase 2 — Constrained Illuminant Estimation for Absolute Skin Tone (`exp04`)
- **Hypothesis:** Restricting candidate illuminants to the 1D Planckian/daylight locus (2500K–9000K) combined with a physiological skin-chromaticity prior reduces absolute $\Delta E_{00}$ and $ITA^\circ$ drift below both `No WB` and `Non-Skin SoG` without erasing warm/cool undertone.
- **Validation:** Multi-portrait synthetic relighting suite + small real-world validation set captured under 3 controlled lights with a physical gray card / ColorChecker reference (kept local under `data/private/`).

### Phase 3 — End-to-End Cosmetic Matching Validation
- Verify whether improved D65 skin & lip recovery stabilizes top-3 K-beauty SKU recommendations ($\Delta E_{00}$ rank stability / Jaccard overlap across 2700K, 4000K, 6500K).
