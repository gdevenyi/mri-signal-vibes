# MRI Signal Vibes

A web-interactive tool designed to simulate MRI signal intensity and contrast for various pulse sequences. This simulator allows researchers, students, and clinicians to visualize how scanner parameters and tissue properties influence the final MRI signal.

## Features

### Pulse Sequences

Comprehensive support for common MRI sequences with mathematically accurate signal equations:

- **Saturation Recovery (SR)**: T1 recovery after a 90° pulse, with T2 decay
- **Spin Echo (SE)**: Full spin echo formulation with T1 recovery and T2 decay
- **Fast Spin Echo (FSE / TSE)**: Complete echo train formulation with:
  - Individual echo timing calculation (TE_k = TE_eff + (k - k_c) × ESP)
  - User-controllable Echo Spacing (ESP)
  - Echo Train Length (ETL) parameter
  - Summation over all echoes with proper T1 and T2 weighting
- **Spoiled Gradient Echo (SPGR / FLASH)**: Steady-state gradient echo with T2\* decay
- **FISP (Steady State)**: SSFP-FID gradient echo (not balanced) with T2\* decay
- **PSIF (Reverse FISP / SSFP-Echo)**: Reverse steady-state free precession
- **DESS (Dual Echo Steady State)**: Root sum of squares of the FISP and PSIF signals
- **Balanced SSFP (TrueFISP / FIESTA)**: On-resonance balanced steady-state
- **Inversion Recovery (IR)**: Inversion pulse with variable TI, with:
  - A **Magnitude** option that shows |S|, as in a magnitude image
  - A **Null** button on each tissue that sets TI to the null point of that tissue (as in STIR and FLAIR)

### Interactive Visualization

- **Real-time Plotting**: Signal intensity curves update instantly as parameters change
- **Multi-Tissue Comparison**: Visualize up to 5 different tissues simultaneously
- **Contrast Markers**: Automatic visualization of maximum difference and ratio points
- **Flexible X-Axis**: Plot signal vs. any sequence parameter (TR, TE, TI, Flip Angle, ETL, ESP)
- **Y-Axis Control**: Auto-scaling or manual range specification

### Tissue Library

Pre-configured tissue presets at multiple field strengths:

- **1.5T**: White Matter, Gray Matter, CSF
- **3.0T**: White Matter, Gray Matter, CSF
- **7.0T**: White Matter, Gray Matter, CSF

These presets are rounded, approximate values. They are not from one source.

### Literature Reference Values

The **Reference Values** page also has a table of published brain relaxation values, with a reference for each row:

- **Species**: human, mouse and rat
- **Condition**: in vivo and ex vivo (post-mortem, fixed and unfixed)
- **Field strength**: 1.5 T to 17.6 T
- **Values**: T1, T2, T2\* and proton density, as given in the source
- **Filters**: species, condition, field strength and tissue name
- **Add to Sim**: adds the row to the simulator as a tissue. If the source does not give a value, the simulator uses a default value and the tissue name says so.

Each row is one measurement from one source. Rows are not averaged, and different sources can disagree. For ex vivo tissue, the fixation, the temperature and contrast agents change the values significantly, so the table shows them. Rows with a contrast agent in the sample have a "Contrast agent" mark.

The data are in `reference-data.js`. Each record has the text of the source that contains the values (`quote`). For records with `checked: true`, the quote or all its numbers were found again in a second, fresh copy of the abstract or the open full text. This shows that the values are in the source. It does not fully prove that each value is with the correct tissue, so compare important values with the paper. Records with `checked: false` (a "Read once" mark in the table) were read one time in the publisher full text, and a second copy was not available.

The ± value is the error as printed in the source. It is usually an SD. If the source gives a standard error, a median or an approximate value, the notes of the row say so. Some rows are not healthy adult tissue (for example multiple sclerosis tissue, aged or juvenile animals, or the control side of a disease model); the details of the row say so.

The table is not complete. Some combinations have no row because no value was found or because the paper was not available to read: for example human in vivo above 9.4 T, mouse and rat at 14.1 T, and mouse at clinical field strengths.

### Parameter Control

**Sequence Parameters** (vary by sequence):

- TR (Repetition Time): 1-5000 ms
- TE (Echo Time): 1-300 ms
- TI (Inversion Time): 0-3000 ms
- ETL (Echo Train Length): 1-32 echoes
- ESP (Echo Spacing): 1-100 ms
- Flip Angle (θ): 1-180°

**Tissue Parameters** (customizable for each tissue):

- T1 (Longitudinal Relaxation): 1-3000 ms
- T2 (Transverse Relaxation): 1-500 ms
- T2\* (Effective Transverse Relaxation): 1-200 ms
- ρ (Proton Density): 0-1

### Contrast Analysis

Automatic calculation and visualization of:

- **Maximum Signal Difference**: Largest absolute difference between tissue pairs
- **Maximum Signal Ratio**: Largest ratio between tissue pairs
- **Optimal Parameter Values**: Shows where maximum contrast occurs

## Technology Stack

- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6+)
- **Charts**: [Chart.js](https://www.chartjs.org/) for interactive plotting
- **Mathematics**: [MathJax](https://www.mathjax.org/) for equation rendering

## Usage

Simply open `index.html` in a modern web browser. No build process or server required.

1. Select a pulse sequence from the navigation
2. Adjust sequence parameters using the sliders
3. Modify tissue properties or load presets (1.5T, 3.0T, 7.0T)
4. Add/remove tissues for comparison
5. Change the X-axis parameter to explore different relationships
6. Observe contrast metrics and optimal parameter values

## Development

The signal equations are in `sequences.js` and the literature reference values are in `reference-data.js`. These files have no DOM code. The user interface is in `script.js`.

Run the tests of the signal equations and of the reference data with Node.js (no packages are necessary):

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

## Mathematical Formulations

All sequences use validated mathematical models from MRI physics literature. The FSE/TSE implementation uses the full spin echo formulation with echo train summation:

$$S = \frac{\rho}{ETL} \sum_{k=1}^{ETL} \left[1 - 2\exp\left(-\frac{TR-TE_k/2}{T_1}\right) + \exp\left(-\frac{TR}{T_1}\right)\right] \cdot \exp\left(-\frac{TE_k}{T_2}\right)$$

Where $TE_k = TE_{eff} + (k - k_c) \cdot ESP$ and $k_c = \frac{ETL + 1}{2}$ for symmetric echo trains.

The simulator shows no signal when the echo train does not fit in the repetition: the first echo must be after the excitation ($TE_1 > 0$) and the last echo must not be after $TR$ ($TE_{ETL} \le TR$).

The FISP equation image on MRIQuestions.com contains two errors (the sign of an exponent and a missing $\cos\theta$) that give negative signals. The simulator uses the SSFP-FID solution from Hänicke & Vogel (2003), which becomes the SPGR equation when $T_2 \to 0$:

$$S = \rho \tan\left(\frac{\theta}{2}\right) \left[1 - (E_1 - \cos\theta) \sqrt{\frac{1 - E_2^2}{(1 - E_1\cos\theta)^2 - E_2^2 (E_1 - \cos\theta)^2}}\right] e^{-TE/T_2^*}$$

Where $E_1 = e^{-TR/T_1}$ and $E_2 = e^{-TR/T_2}$.

Inversion Recovery shows no signal when $TI > TR$. The **Null** button uses the root of the IR equation:

$$TI_{null} = T_1 \ln\left(\frac{2}{1 + 2e^{-(TR - TE/2)/T_1} - e^{-TR/T_1}}\right)$$

This becomes $T_1 \ln 2$ when $TR$ is long.

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

### Additional Reading

- A Quantitative Approach to Sequence and Image: https://mriquestions.com/uploads/3/4/5/7/34572113/a_quantitative_approach_to_sequence_and_image.1.pdf
- Tissue Property Filters: https://mriquestions.com/uploads/3/4/5/7/34572113/tissue_property_filters.pdf
