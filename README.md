# MRI Signal Vibes

MRI Signal Vibes is a web page that calculates the MRI signal of tissues for common pulse sequences. It plots the signal as a function of one scanner setting (for example TR, TE, TI or the flip angle). Researchers, students and clinicians can use it to see how the scanner settings and the tissue properties (T1, T2, T2\*, proton density and ADC) change the image contrast.

The equations have ideal pulses and no noise. They do not include image reconstruction, coil sensitivity or artifacts. Use the results to learn and to plan, not for clinical decisions.

## Usage

Open `index.html` in a modern web browser. No build step or server is necessary. The page loads Chart.js and MathJax from a CDN, so it needs an internet connection.

The page opens on the **About** page, which explains the purpose of the simulator and how to use it. A link from **Copy link** opens the simulator directly.

1. Select a pulse sequence in the menu on the left.
2. Set the scanner settings with the sliders, or type a value.
3. Select the parameter of the X-axis.
4. Change the tissues: edit the values, add a tissue with **+** or with the **Add preset…** list, or remove a tissue. The simulator starts with the 1.5 T brain presets. Use **Load to Sim** on the **Reference Values** page to load the 3 T or 7 T presets, and **Add to Sim** to add one published tissue.
5. Read the contrast results and the optimal parameter values below the plot.

## Features

### Pulse Sequences

The simulator has these sequences:

- **Saturation Recovery (SR)**: T1 recovery after a 90° pulse, with T2 decay
- **Spin Echo (SE)**: Full spin echo formulation with T1 recovery and T2 decay
- **Fast Spin Echo (FSE / TSE)**: Complete echo train formulation with:
  - Individual echo timing calculation (TE_k = TE_eff + (k - k_c) × ESP)
  - User-controllable Echo Spacing (ESP)
  - Echo Train Length (ETL) parameter
  - Summation over all echoes with proper T1 and T2 weighting
- **Diffusion-Weighted Spin Echo (DWI)**: Spin echo with the attenuation $e^{-b \cdot ADC}$; each tissue has an ADC
- **Inversion Recovery (IR)**: Inversion pulse with variable TI, with:
  - A **Magnitude** option that shows |S|, as in a magnitude image
  - A **Null** button on each tissue that sets TI to the null point of that tissue (as in STIR and FLAIR)
- **Double Inversion Recovery (DIR)**: Two inversion pulses, with:
  - A **Null** button on each tissue that sets TI2 for the current TI1
  - A **Null tissues 1 + 2** button that sets TI1 and TI2 so that the first two tissues give no signal
- **Spoiled Gradient Echo (SPGR / FLASH)**: Steady-state gradient echo with T2\* decay
- **Gradient Echo EPI (BOLD)**: The SPGR equation with timing that is typical for functional MRI
- **FISP (Steady State)**: SSFP-FID gradient echo (not balanced) with T2\* decay
- **PSIF (Reverse FISP / SSFP-Echo)**: Reverse steady-state free precession
- **DESS (Dual Echo Steady State)**: Root sum of squares of the FISP and PSIF signals
- **Balanced SSFP (TrueFISP / FIESTA)**: Balanced steady-state with an off-resonance parameter, which shows the banding profile
- **MPRAGE**: Inversion pulse and a train of gradient echo readouts, in the steady state
- **MP2RAGE**: Two readout trains after one inversion pulse, combined into one image that does not depend on proton density

### Interactive Visualization

- **Live plot**: The curves change immediately when a setting changes
- **Tissue comparison**: Up to 5 tissues on one plot
- **Contrast Markers**: Vertical lines at the points of maximum difference and maximum ratio (explained below the plot, not in the legend)
- **Ernst Angle**: For SPGR and GRE-EPI, the Ernst angle of each tissue, with a marker line when the flip angle is the X-axis
- **Flexible X-Axis**: Plot signal vs. any sequence parameter (TR, TE, TI, Flip Angle, ETL, ESP, b-value, off-resonance and others)
- **Y-Axis Control**: Auto-scaling or manual range specification
- **Export**: The curves as a CSV file and the plot as a PNG image
- **Copy link**: The sequence, the settings and the tissues are in the URL, so that a link opens the same view

### Tissue Library

Tissue presets at three field strengths (human brain, in vivo):

- **1.5T**: White Matter, Gray Matter, CSF
- **3.0T**: White Matter, Gray Matter, CSF
- **7.0T**: White Matter, Gray Matter, CSF

The **Add preset** list adds one more tissue with values for 3 T: subcutaneous fat, skeletal muscle, venous blood or peritumoral edema of a glioma.

Each preset value is the value of one row of the literature table, and the **Reference Values** page shows that source for each value. Values from different sources are not averaged, so a preset is one published result and not a consensus value. Some values have no source, because no readable published value was found (for example T2\* of CSF, and the proton density of fat, muscle and blood). These values are only illustrative, and the page gives them the mark "illustrative". The presets are in `presets.js`.

### Contrast Agent

The **Contrast agent** option gives each tissue a concentration $C$ (mM). The relaxivities $r_1$ and $r_2$ are in the scanner settings:

$$\frac{1}{T_{1}^{\prime}} = \frac{1}{T_{1}} + r_{1} C, \qquad \frac{1}{T_{2}^{\prime}} = \frac{1}{T_{2}} + r_{2} C, \qquad \frac{1}{T_{2}^{\ast\prime}} = \frac{1}{T_{2}^{\ast}} + r_{2} C$$

The default relaxivities ($r_1 = 3.6$, $r_2 = 4.3$ per mM per second) are those of gadoterate in bovine plasma at 1.5 T and 37 °C (Rohrer et al., Invest Radiol 2005;40:715-724). The relaxivity depends on the agent, the field strength, the medium and the temperature. The **Reference Values** page has a table of published relaxivities, and a button on each row sets $r_1$ and $r_2$ of the simulator.

### Literature Reference Values

The **Reference Values** page has a table of published values, with a reference for each row:

- **Tissue type**: brain tissue and CSF, brain lesions and tumours (the pathology is in the words of the source), fat, bone marrow and muscle, and blood
- **Species**: human, mouse and rat (the tissue types other than brain are human only)
- **Condition**: in vivo and ex vivo (post-mortem, fixed and unfixed; blood samples in vitro)
- **Field strength**: 1.5 T to 17.6 T
- **Values**: T1, T2, T2\*, proton density and ADC, as given in the source
- **Filters**: tissue type, value, species, condition, field strength and tissue name
- **Add to Sim**: adds the row to the simulator as a tissue. If the source does not give a value, the simulator uses a default value and the tissue name says so.

Each row is one measurement from one source. Rows are not averaged, and different sources can disagree. For ex vivo tissue, the fixation, the temperature and contrast agents change the values significantly, so the table shows them. Rows with a contrast agent in the sample have a "Contrast agent" mark.

The ADC is in $10^{-3}$ mm²/s. Sources print it in different units, so the notes of each row give the value and the unit as printed. The measure (ADC, mean diffusivity, minimum ADC) and the b-values are in the details of the row.

A second table has published relaxivities of gadolinium contrast agents (r1, r2 and r2\* in 1/(mM·s)), with the field strength, the medium and the temperature. The largest source of r1 and r2 is Rohrer et al. 2005 (water, bovine plasma and canine blood). Values in human plasma and human blood are from other papers, and many of them give only r1. A row with a "Cited value" mark has a value that its paper did not measure.

The data are in `reference-data.js`. This file is generated: the records of the literature search, the scripts that make the file and the list of papers that were not read (`LEADS.md`) are in `tools/reference-data/`. Each record has the text of the source that contains the values (`quote`). For records with `checked: true`, the quote or all its numbers were found again in a second, fresh copy of the abstract or the open full text. This shows that the values are in the source. It does not fully prove that each value is with the correct tissue, so compare important values with the paper. Some records were read from a PDF file of the paper (`read_from` then gives the PDF page). For these records, `checked: true` shows that a script found the quote in the text of the PDF and the values in the quote; the tables were also compared with the PDF page when they were read. Records with `checked: false` (a "Read once" mark in the table) were read one time, and a second copy was not available or the text of the PDF has character errors at that position.

The ± value is the error as printed in the source. It is usually an SD. If the source gives a standard error, a median or an approximate value, the notes of the row say so. Some rows are not healthy adult tissue (for example multiple sclerosis tissue, aged or juvenile animals, or the control side of a disease model); the details of the row say so.

The table is not complete. Some combinations have no row because no value was found, because the paper was not available to read, or because the paper gives the values only in figures: for example human in vivo above 9.4 T, mouse and rat at 14.1 T, mouse at clinical field strengths, T2 and T2\* of CSF at 1.5 T, proton density at 7 T, and T2\* and proton density of fat, muscle and blood. `tools/reference-data/LEADS.md` lists the papers that were not read.

### Parameter Control

**Sequence Parameters** (vary by sequence):

- TR (Repetition Time): 1-5000 ms
- TE (Echo Time): 1-300 ms
- TI (Inversion Time): 0-3000 ms
- TI1, TI2 (Inversion Times, DIR and MP2RAGE): 0-5000 ms
- ETL (Echo Train Length): 1-32 echoes
- ESP (Echo Spacing): 1-100 ms
- N (Readouts per train, MPRAGE and MP2RAGE): 1-256
- Flip Angle (θ, θ2): 1-180°
- Off-resonance per TR (φ, bSSFP): -360° to 360°
- b-value (DWI): 0-3000 s/mm²

The range of the time parameters and of the b-value becomes larger when you type a larger value. The counts have a limit (ETL 512, N 1024).

**Tissue Parameters** (customizable for each tissue):

- T1 (Longitudinal Relaxation): 1-3000 ms
- T2 (Transverse Relaxation): 1-500 ms
- T2\* (Effective Transverse Relaxation): 1-200 ms, and not longer than T2
- ρ (Proton Density): 0-1
- ADC (Apparent Diffusion Coefficient, DWI only): 0-3.5 × 10⁻³ mm²/s
- C (Contrast agent concentration, with the Contrast agent option): 0-5 mM

**Contrast agent settings** (with the Contrast agent option):

- r1, r2 (Relaxivities): 0-30 per mM per second

### Contrast Analysis

The simulator calculates these values for each pair of tissues and shows them below the plot:

- **Maximum Signal Difference**: Largest absolute difference between tissue pairs
- **Maximum Signal Ratio**: Largest ratio between tissue pairs
- **Maximum Difference / √TR**: The signal difference for each unit of scan time (TR in seconds). The maximum difference alone favours a long TR, which is not the best choice when the scan time is fixed.
- **Optimal Parameter Values**: The X-axis value of each maximum

## Technology Stack

- **Frontend**: HTML, CSS and JavaScript, with no framework
- **Charts**: [Chart.js](https://www.chartjs.org/) for interactive plotting
- **Mathematics**: [MathJax](https://www.mathjax.org/) for equation rendering

## Development

The parameters and signal equations are in `sequences.js`, the calculations of the interface (contrast agent, contrast analysis, CSV, state in the URL) are in `logic.js`, the tissue presets are in `presets.js`, and the literature reference values are in `reference-data.js`. These files have no DOM code. The user interface is in `script.js`. The text of the About page is in `index.html`.

Run the tests of the signal equations, of the reference data and of the presets with Node.js (no packages are necessary):

```sh
node --test
```

The linters (ESLint and Stylelint) need the development packages. Install them with pnpm, then run all checks:

```sh
pnpm install
pnpm run check
```

GitHub Actions runs the same checks on each push and pull request (`.github/workflows/ci.yml`).

Most tests are limit checks. For example, FISP must become SPGR when $T_2 \to 0$, and FSE with one echo must be equal to SE.

The equations of bSSFP with off-resonance, DIR, MPRAGE and MP2RAGE are compared with independent simulations (`test/bloch.test.js`). These simulations apply each pulse and each delay in turn until the magnetization is in the steady state.

## Mathematical Formulations

The signal equations come from the MRI physics literature (see References). The FSE/TSE equation uses the full spin echo equation and sums the signal of all echoes in the train:

$$S = \frac{\rho}{ETL} \sum_{k=1}^{ETL} \left[1 - 2\exp\left(-\frac{TR-TE_k/2}{T_1}\right) + \exp\left(-\frac{TR}{T_1}\right)\right] \cdot \exp\left(-\frac{TE_k}{T_2}\right)$$

Where $TE_k = TE_{eff} + (k - k_c) \cdot ESP$ and $k_c = \frac{ETL + 1}{2}$ for symmetric echo trains.

The simulator shows no signal when the echo train does not fit in the repetition: the first echo must be after the excitation ($TE_1 > 0$) and the last echo must not be after $TR$ ($TE_{ETL} \le TR$).

The FISP equation image on MRIQuestions.com contains two errors (the sign of an exponent and a missing $\cos\theta$) that give negative signals. The simulator uses the SSFP-FID solution from Hänicke & Vogel (2003), which becomes the SPGR equation when $T_2 \to 0$:

$$S = \rho \tan\left(\frac{\theta}{2}\right) \left[1 - (E_1 - \cos\theta) \sqrt{\frac{1 - E_2^2}{(1 - E_1\cos\theta)^2 - E_2^2 (E_1 - \cos\theta)^2}}\right] e^{-TE/T_2^{\ast}}$$

Where $E_1 = e^{-TR/T_1}$ and $E_2 = e^{-TR/T_2}$.

Inversion Recovery shows no signal when $TI > TR$. The **Null** button uses the root of the IR equation:

$$TI_{null} = T_1 \ln\left(\frac{2}{1 + 2e^{-(TR - TE/2)/T_1} - e^{-TR/T_1}}\right)$$

This becomes $T_1 \ln 2$ when $TR$ is long.

Double Inversion Recovery uses a spin echo with two ideal inversion pulses. $TI_1$ and $TI_2$ are the times from the first and the second inversion pulse to the excitation:

$$S = \rho e^{-TE/T_2} \left(1 - 2e^{-TI_2/T_1} + 2e^{-TI_1/T_1} - 2e^{-(TR - TE/2)/T_1} + e^{-TR/T_1}\right)$$

Balanced SSFP uses the elliptical signal model (Xiang & Hoff 2014). $\varphi$ is the off-resonance phase in one TR, with alternating RF phase, so $\varphi = 0$ is the centre of the pass band:

$$S = \rho \frac{(1 - E_1)\sin\theta}{D} \cdot \frac{\sqrt{1 + 2E_2\cos\varphi + E_2^2}}{1 + b\cos\varphi} e^{-TE/T_2}, \quad D = 1 - E_1\cos\theta - E_2^2(E_1 - \cos\theta), \quad b = \frac{E_2(1 - E_1)(1 + \cos\theta)}{D}$$

MPRAGE and MP2RAGE have no short closed form. The simulator writes each part of the cycle (inversion, delay, readout train) as a map $M_z \to aM_z + b$ and solves for the fixed point of one cycle. In these sequences, $TR$ is the time between two inversion pulses, and each $TI$ is the time from the inversion pulse to the centre readout of a train. The signal is that of the centre readout. The models have an ideal inversion pulse and perfect spoiling.

## References

### Primary Literature

- Introduction to Functional Magnetic Resonance Imaging: Principles and Techniques  
  https://www.cambridge.org/core/books/abs/introduction-to-functional-magnetic-resonance-imaging/relaxation-and-contrast-in-mri/FFBF5E6D903F4FEFE129F2DEB7F4EE9B

### Sequence-Specific Resources

- Fast Spin Echo: https://www.81bones.net/mri/mri_FSE.pdf
- PSIF vs FISP: https://mriquestions.com/psif-vs-fisp.html
- Spoiled GRE: https://mriquestions.com/spoiled-gre-parameters.html
- FISP Parameters: https://mriquestions.com/grassfisp-parameters.html
- Hänicke W, Vogel HU. An analytical solution for the SSFP signal in MRI. Magn Reson Med 2003;49:771-775.
- Inversion Recovery: https://mriquestions.com/choice-of-ir-parameters.html
- Balanced SSFP: https://mriquestions.com/true-fispfiesta.html
- Xiang QS, Hoff MN. Banding artifact removal for bSSFP imaging with an elliptical signal model. Magn Reson Med 2014;71:927-933. https://doi.org/10.1002/mrm.25098
- Redpath TW, Smith FW. Use of a double inversion recovery pulse sequence to image selectively grey or white brain matter. Br J Radiol 1994;67:1258-1263. https://doi.org/10.1259/0007-1285-67-804-1258
- Mugler JP, Brookeman JR. Three-dimensional magnetization-prepared rapid gradient-echo imaging (3D MP RAGE). Magn Reson Med 1990;15:152-157. https://doi.org/10.1002/mrm.1910150117
- Marques JP, et al. MP2RAGE, a self bias-field corrected sequence for improved segmentation and T1-mapping at high field. NeuroImage 2010;49:1271-1281. https://doi.org/10.1016/j.neuroimage.2009.10.002
- Stejskal EO, Tanner JE. Spin diffusion measurements: spin echoes in the presence of a time-dependent field gradient. J Chem Phys 1965;42:288-292. https://doi.org/10.1063/1.1695690

### Additional Reading

- A Quantitative Approach to Sequence and Image: https://mriquestions.com/uploads/3/4/5/7/34572113/a_quantitative_approach_to_sequence_and_image.1.pdf
- Tissue Property Filters: https://mriquestions.com/uploads/3/4/5/7/34572113/tissue_property_filters.pdf
