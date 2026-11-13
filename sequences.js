/**
 * MRI Signal Intensity Simulator: parameters and signal equations
 *
 * Each sequence has:
 *   name, params     - display name and the parameters that the sequence uses
 *   citation, url    - source of the equation or of the sequence
 *   equationStr      - equation in TeX, for MathJax
 *   calc(seqP, tissueP) - signal for the sequence and tissue parameters
 *   defaults         - (optional) default values that replace the global ones
 *   defaultX         - (optional) parameter for the X-axis when the sequence opens
 *   notes            - (optional) definitions and assumptions, shown below the equation
 *   valid(seqP)      - (optional) false if the timing is not possible
 *   signed           - (optional) true if the signal can be negative
 *   ernst            - (optional) true if the Ernst angle applies to the sequence
 *   nullParams(seqP, tissueP) - (optional) parameter values that give no signal
 *                      for the tissue, or null if there are none
 *   nullPair(seqP, tissueA, tissueB) - (optional) the same for two tissues
 *
 * This file has no DOM code, so that Node.js can load it for the tests.
 */

// type:       'seq' (scanner setting), 'tissue' (tissue property) or 'agent'
//             (property of the contrast agent)
// fixedRange: the slider range does not grow or shrink with the value
// fullAxis:   as the X-axis, the plot shows the full range (not 0 to the value)
// integer:    the parameter is a count
// hardMax:    the largest value that the program accepts, when the slider
//             range can grow
const paramDefinitions = {
    // Sequence
    'TR': { type: 'seq', label: 'TR (ms)', symbol: 'TR', unit: 'ms', min: 1, max: 5000, step: 10, default: 500 },
    'TE': { type: 'seq', label: 'TE (ms)', symbol: 'TE', unit: 'ms', min: 1, max: 300, step: 1, default: 20 },
    'TI': { type: 'seq', label: 'TI (ms)', symbol: 'TI', unit: 'ms', min: 0, max: 3000, step: 10, default: 150 },
    'TI1': { type: 'seq', label: 'TI1 (ms)', symbol: 'TI1', unit: 'ms', min: 0, max: 5000, step: 10, default: 700 },
    'TI2': { type: 'seq', label: 'TI2 (ms)', symbol: 'TI2', unit: 'ms', min: 0, max: 5000, step: 10, default: 2500 },
    'ETL': { type: 'seq', label: 'ETL', symbol: 'ETL', unit: '', min: 1, max: 32, step: 1, default: 8, integer: true, hardMax: 512 }, // Echo Train Length
    'ESP': { type: 'seq', label: 'ESP (ms)', symbol: 'ESP', unit: 'ms', min: 1, max: 100, step: 1, default: 10 }, // Echo Spacing
    'N': { type: 'seq', label: 'Readouts per train', symbol: 'N', unit: '', min: 1, max: 256, step: 1, default: 160, integer: true, hardMax: 1024 },
    'Theta': { type: 'seq', label: 'Flip Angle (°)', symbol: 'θ', unit: '°', min: 1, max: 180, step: 1, default: 90, fixedRange: true, fullAxis: true },
    'Theta2': { type: 'seq', label: 'Flip Angle 2 (°)', symbol: 'θ2', unit: '°', min: 1, max: 180, step: 1, default: 5, fixedRange: true, fullAxis: true },
    'Phi': { type: 'seq', label: 'Off-resonance per TR (°)', symbol: 'φ', unit: '°', min: -360, max: 360, step: 1, default: 0, fixedRange: true, fullAxis: true },
    'B': { type: 'seq', label: 'b-value (s/mm²)', symbol: 'b', unit: 's/mm²', min: 0, max: 3000, step: 10, default: 1000 },
    // Tissue
    'T1': { type: 'tissue', label: 'T1 (ms)', symbol: 'T1', unit: 'ms', min: 1, max: 3000, step: 10, default: 800 },
    'T2': { type: 'tissue', label: 'T2 (ms)', symbol: 'T2', unit: 'ms', min: 1, max: 500, step: 1, default: 80 },
    'T2s': { type: 'tissue', label: 'T2* (ms)', symbol: 'T2*', unit: 'ms', min: 1, max: 200, step: 1, default: 40 },
    'Rho': { type: 'tissue', label: 'Proton Density', symbol: 'ρ', unit: '', min: 0, max: 1, step: 0.01, default: 1.0, fixedRange: true },
    'ADC': { type: 'tissue', label: 'ADC (10⁻³ mm²/s)', symbol: 'ADC', unit: '10⁻³ mm²/s', min: 0, max: 3.5, step: 0.01, default: 0.8, fixedRange: true },
    'C': { type: 'tissue', label: 'Contrast agent (mM)', symbol: 'C', unit: 'mM', min: 0, max: 5, step: 0.01, default: 0, fixedRange: true },
    // Contrast agent
    'r1': { type: 'agent', label: 'Relaxivity r1 (1/(mM·s))', symbol: 'r1', unit: '1/(mM·s)', min: 0, max: 30, step: 0.1, default: 3.6, fixedRange: true },
    'r2': { type: 'agent', label: 'Relaxivity r2 (1/(mM·s))', symbol: 'r2', unit: '1/(mM·s)', min: 0, max: 30, step: 0.1, default: 4.3, fixedRange: true }
};

// --- Longitudinal magnetization as affine maps M -> a*M + b (with M0 = 1) ---
// The magnetization-prepared sequences (MPRAGE, MP2RAGE) are a chain of
// these maps. The steady state is the fixed point of the chain for one cycle.
const mzMap = {
    // Free recovery for the time t
    relax: (t, T1) => {
        const e = Math.exp(-t / T1);
        return { a: e, b: 1 - e };
    },
    // Ideal inversion pulse
    invert: () => ({ a: -1, b: 0 }),
    // n excitation pulses with flip angle cosine `cos`, each followed by a
    // recovery for the time esp
    train: (n, esp, cos, T1) => {
        const e = Math.exp(-esp / T1);
        const q = cos * e;
        const qn = Math.pow(q, n);
        const sum = q === 1 ? n : (1 - qn) / (1 - q);
        return { a: qn, b: (1 - e) * sum };
    },
    // Apply the maps in the given order
    chain: (...maps) => maps.reduce((acc, m) => ({ a: m.a * acc.a, b: m.a * acc.b + m.b }), { a: 1, b: 0 }),
    apply: (m, M) => m.a * M + m.b,
    // Fixed point: M = a*M + b
    steady: (m) => m.b / (1 - m.a)
};

// Timing of a train of N readouts whose centre readout is at the time TI.
// before/after: number of pulses before the centre readout / from it onwards.
function readoutTrain(N, ESP) {
    const before = Math.floor(N / 2);
    return { before, after: N - before, tBefore: before * ESP, tAfter: (N - before) * ESP };
}

// Signals of the two readout trains of MP2RAGE, for M0 = 1 (also used for MPRAGE
// by the tests). Returns the longitudinal magnetization before the centre
// pulse of each train, in the steady state.
function mp2rageMz(seqP, T1) {
    const { TR, TI1, TI2, ESP, N, Theta, Theta2 } = seqP;
    const c1 = Math.cos(Theta * Math.PI / 180);
    const c2 = Math.cos(Theta2 * Math.PI / 180);
    const tr = readoutTrain(N, ESP);
    const TA = TI1 - tr.tBefore;
    const TB = TI2 - TI1 - N * ESP;
    const TC = TR - TI2 - tr.tAfter;

    const toCentre1 = mzMap.chain(mzMap.invert(), mzMap.relax(TA, T1), mzMap.train(tr.before, ESP, c1, T1));
    const toCentre2 = mzMap.chain(mzMap.train(tr.after, ESP, c1, T1), mzMap.relax(TB, T1), mzMap.train(tr.before, ESP, c2, T1));
    const toEnd = mzMap.chain(mzMap.train(tr.after, ESP, c2, T1), mzMap.relax(TC, T1));

    const mStart = mzMap.steady(mzMap.chain(toCentre1, toCentre2, toEnd));
    const m1 = mzMap.apply(toCentre1, mStart);
    const m2 = mzMap.apply(toCentre2, m1);
    return { m1, m2 };
}

const sequences = {
    'SR': {
        name: 'Saturation Recovery (SR)',
        params: ['TR', 'TE', 'T1', 'T2', 'Rho'],
        citation: 'Standard saturation recovery model: 90° excitation, no transverse magnetization before each pulse',
        url: '',
        equationStr: '$$ S = \\rho (1 - e^{-TR/T1}) e^{-TE/T2} $$',
        calc: (seqP, tissueP) => {
            const { TR, TE } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            return Rho * (1 - Math.exp(-TR / T1)) * Math.exp(-TE / T2);
        }
    },
    'SE': {
        name: 'Spin Echo (SE)',
        params: ['TR', 'TE', 'T1', 'T2', 'Rho'],
        citation: 'Introduction to Functional Magnetic Resonance Imaging Principles and Techniques',
        url: 'https://www.cambridge.org/core/books/abs/introduction-to-functional-magnetic-resonance-imaging/relaxation-and-contrast-in-mri/FFBF5E6D903F4FEFE129F2DEB7F4EE9B',
        equationStr: '$$ S = \\rho e^{-TE/T2} (1 - 2e^{-(TR - TE/2)/T1} + e^{-TR/T1}) $$',
        calc: (seqP, tissueP) => {
            // S = Rho * exp(-TE/T2) * [1 - 2*exp(-(TR - TE/2)/T1) + exp(-TR/T1)]
            const { TR, TE } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            const term1 = Math.exp(-TE / T2);
            const term2 = 1 - 2 * Math.exp(-(TR - TE / 2) / T1) + Math.exp(-TR / T1);

            return Rho * term1 * term2;
        }
    },
    'FSE': {
        name: 'Fast Spin Echo (FSE / TSE)',
        params: ['TR', 'TE', 'ETL', 'ESP', 'T1', 'T2', 'Rho'],
        citation: 'Fast Spin Echo Signal Equation with Full Spin Echo Formulation',
        url: '',
        // The default TE (20 ms) puts the first echoes before the excitation pulse.
        defaults: { TE: 80 },
        // The echo train is centred on TE. All echoes must occur after the
        // excitation (TE_1 > 0) and before the next one (TE_ETL <= TR).
        valid: (seqP) => {
            const { TR, TE, ETL, ESP } = seqP;
            const halfTrain = ((ETL - 1) / 2) * ESP;
            return TE - halfTrain > 0 && TE + halfTrain <= TR;
        },
        equationStr: '$$ S = \\frac{\\rho}{ETL} \\sum_{k=1}^{ETL} \\left[1 - 2\\exp\\left(-\\frac{TR-TE_k/2}{T_1}\\right) + \\exp\\left(-\\frac{TR}{T_1}\\right)\\right] \\cdot \\exp\\left(-\\frac{TE_k}{T_2}\\right) $$',
        calc: (seqP, tissueP) => {
            // Full FSE formulation accounting for echo train
            // TE_k = TE_eff + (k - k_c) * ESP
            // where k_c = (ETL + 1) / 2 for symmetric echo trains
            const { TR, TE, ETL, ESP } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;
            
            const TE_eff = TE; // TE is the effective echo time
            
            // For a symmetric echo train, k_c = (ETL + 1) / 2
            const k_c = (ETL + 1) / 2;
                        
            // Sum over all echoes in the train
            let sum = 0;
            for (let k = 1; k <= ETL; k++) {
                // Calculate TE_k for this echo
                const TE_k = TE_eff + (k - k_c) * ESP;
                const T1_term = 1 - 2 * Math.exp(-(TR - TE_k / 2) / T1) + Math.exp(-TR / T1);   
                // T2 decay term for this specific echo
                const T2_term = Math.exp(-TE_k / T2);
                
                sum += T1_term * T2_term;
            }
            
            // Average signal over all echoes
            return (Rho / ETL) * sum;
        }
    },
    'SPGR': {
        name: 'Spoiled Gradient Echo (SPGR / FLASH)',
        params: ['TR', 'TE', 'Theta', 'T1', 'T2s', 'Rho'],
        ernst: true,
        citation: 'Introduction to Functional Magnetic Resonance Imaging Principles and Techniques',
        url: 'https://www.cambridge.org/core/books/abs/introduction-to-functional-magnetic-resonance-imaging/relaxation-and-contrast-in-mri/FFBF5E6D903F4FEFE129F2DEB7F4EE9B',
        // S = Rho * e^(-TE/T2*) * sin(alpha) * (1 - e^(-TR/T1)) / (1 - cos(alpha) * e^(-TR/T1))
        equationStr: '$$ S = \\rho e^{-TE/T2^*} \\sin\\theta \\frac{1 - e^{-TR/T1}}{1 - \\cos\\theta e^{-TR/T1}} $$',
        calc: (seqP, tissueP) => {
            // S = Rho * exp(-TE/T2*) * sin(Theta) * (1 - exp(-TR/T1)) / (1 - cos(Theta) * exp(-TR/T1))
            const { TR, TE, Theta } = seqP;
            let { T1, T2s, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2s <= 0) T2s = 1;

            const tr_t1 = TR / T1;
            const te_t2s = TE / T2s;
            const thetaRad = Theta * Math.PI / 180;

            const E1 = Math.exp(-tr_t1);
            const E2s = Math.exp(-te_t2s);
            const sinTheta = Math.sin(thetaRad);
            const cosTheta = Math.cos(thetaRad);

            const num = (1 - E1);
            const den = 1 - (cosTheta * E1);

            if (den === 0) return 0;
            return Rho * E2s * sinTheta * (num / den);
        }
    },
    'FISP': {
        name: 'FISP (Steady State)',
        params: ['TR', 'TE', 'Theta', 'T1', 'T2', 'T2s', 'Rho'],
        citation: 'MRIQuestions.com, with corrections from Hänicke & Vogel, Magn Reson Med 2003;49:771-775',
        url: 'https://mriquestions.com/grassfisp-parameters.html',
        // The equation image on the cited page has two errors: e^{+TR/T1} in the
        // bracket and (1 - e^{-TR/T1})^2 in the root. That form gives negative or
        // NaN signals. The form below is the SSFP-FID solution (Hanicke & Vogel,
        // Magn Reson Med 2003;49:771-775). It becomes the SPGR equation when T2 -> 0.
        equationStr: '$$ S = \\rho \\tan(\\frac{\\theta}{2}) \\left[ 1 - (e^{-TR/T1} - \\cos \\theta) \\sqrt{\\frac{1 - e^{-2TR/T2}}{(1 - e^{-TR/T1} \\cos \\theta)^2 - e^{-2TR/T2}(e^{-TR/T1} - \\cos \\theta)^2}} \\right] e^{-TE/T2^*} $$',
        calc: (seqP, tissueP) => {
            const { TR, TE, Theta } = seqP;
            let { T1, T2, T2s, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;
            if (T2s <= 0) T2s = 1;

            // tan(theta/2) has no limit at 180 degrees, but the signal goes to 0.
            if (Theta >= 180) return 0;

            const alphaRad = Theta * Math.PI / 180;
            const tan_a_2 = Math.tan(alphaRad / 2);
            const cos_alpha = Math.cos(alphaRad);

            const E1 = Math.exp(-TR / T1);
            const E2_sq = Math.exp(-2 * TR / T2);
            const E_TE = Math.exp(-TE / T2s);

            // Denominator in the root: (1 - E1*cos a)^2 - E2^2 * (E1 - cos a)^2
            const den_sqrt = Math.pow(1 - E1 * cos_alpha, 2) - E2_sq * Math.pow(E1 - cos_alpha, 2);

            if (den_sqrt <= 0) return 0; // Avoid NaN
            const sqrt_val = Math.sqrt((1 - E2_sq) / den_sqrt);

            // Bracket: 1 - (E1 - cos a) * sqrt(...)
            const bracket = 1 - ((E1 - cos_alpha) * sqrt_val);

            return Rho * tan_a_2 * bracket * E_TE;
        }
    },
    'PSIF': {
        name: 'PSIF (Reverse FISP / SSFP-Echo)',
        params: ['TR', 'TE', 'Theta', 'T1', 'T2', 'Rho'],
        citation: 'MRIQuestions.com',
        url: 'https://mriquestions.com/psif-vs-fisp.html',
        equationStr: '$$ S = \\rho \\tan(\\frac{\\theta}{2}) \\left[ 1 - (1 - e^{-TR/T1} \\cos \\theta) \\sqrt{\\frac{1 - e^{-2TR/T2}}{(1 - e^{-TR/T1} \\cos \\theta)^2 - e^{-2TR/T2}(e^{-TR/T1} - \\cos \\theta)^2}} \\right] e^{-TE/T2} $$',
        calc: (seqP, tissueP) => {
            // PSIF equation. Agrees with the equation image on the cited page.
            const { TR, TE, Theta } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            // tan(theta/2) has no limit at 180 degrees, but the signal goes to 0.
            if (Theta >= 180) return 0;

            const alphaRad = Theta * Math.PI / 180;
            const tan_a_2 = Math.tan(alphaRad / 2);
            const cos_alpha = Math.cos(alphaRad);

            const E1 = Math.exp(-TR / T1);
            const E2_sq = Math.exp(-2 * TR / T2); // e^(-2TR/T2)
            const E_TE = Math.exp(-TE / T2);

            // Sqrt Term
            const num_sqrt = 1 - E2_sq;

            // Denom: (1 - E1*cos a)^2 - E2^2 * (E1 - cos a)^2
            const term1 = Math.pow(1 - E1 * cos_alpha, 2);
            const term2 = E2_sq * Math.pow(E1 - cos_alpha, 2);
            const den_sqrt = term1 - term2;

            if (den_sqrt <= 0) return 0;
            const sqrt_val = Math.sqrt(num_sqrt / den_sqrt);

            // Bracket: 1 - (1 - E1*cos a) * sqrt(...)
            const bracket = 1 - ((1 - E1 * cos_alpha) * sqrt_val);

            return Rho * tan_a_2 * bracket * E_TE;
        }
    },
    'DESS': {
        name: 'DESS (Dual Echo Steady State)',
        params: ['TR', 'TE', 'Theta', 'T1', 'T2', 'T2s', 'Rho'],
        citation: 'Root sum of squares of the FISP and PSIF signals (see those sequences for the sources)',
        url: '',
        equationStr: '$$ S = \\sqrt{S_{FISP}^2 + S_{PSIF}^2} $$',
        calc: (seqP, tissueP) => {
            // DESS acquires the FISP (S+) and PSIF (S-) signals in one TR and
            // combines them. This model uses the root sum of squares.
            const sPlus = sequences.FISP.calc(seqP, tissueP);
            const sMinus = sequences.PSIF.calc(seqP, tissueP);
            return Math.sqrt(sPlus * sPlus + sMinus * sMinus);
        }
    },
    'bSSFP': {
        name: 'Balanced SSFP (TrueFISP / FIESTA)',
        params: ['TR', 'TE', 'Theta', 'Phi', 'T1', 'T2', 'Rho'],
        citation: 'Elliptical signal model: Xiang & Hoff, Magn Reson Med 2014;71:927-933. The equation was checked against a Bloch simulation (see the tests).',
        url: 'https://doi.org/10.1002/mrm.25098',
        defaults: { TR: 10, TE: 5, Theta: 60 },
        notes: 'φ is the phase that the magnetization gets from off-resonance in one TR (φ = 360° · Δf · TR). The RF phase alternates (0°, 180°), so φ = 0 is the centre of the pass band and the dark bands are at φ = ±180°. Put φ on the X-axis to see the banding profile.',
        equationStr: '$$ S = \\rho \\frac{(1 - E_1) \\sin\\theta}{D} \\cdot \\frac{\\sqrt{1 + 2 E_2 \\cos\\varphi + E_2^2}}{1 + b \\cos\\varphi} e^{-TE/T2} $$ $$ D = 1 - E_1 \\cos\\theta - E_2^2 (E_1 - \\cos\\theta), \\quad b = \\frac{E_2 (1 - E_1)(1 + \\cos\\theta)}{D}, \\quad E_1 = e^{-TR/T1}, \\quad E_2 = e^{-TR/T2} $$',
        calc: (seqP, tissueP) => {
            // Magnitude of the bSSFP signal with off-resonance.
            // With phi = 0 this is the on-resonance equation:
            // S = Rho * (1-E1)*sin(a) / (1 - (E1-E2)*cos(a) - E1*E2) * exp(-TE/T2)
            const { TR, TE, Theta } = seqP;
            const Phi = seqP.Phi === undefined ? 0 : seqP.Phi;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            const alphaRad = Theta * Math.PI / 180;
            const E1 = Math.exp(-TR / T1);
            const E2 = Math.exp(-TR / T2);
            const E_TE = Math.exp(-TE / T2);
            const sina = Math.sin(alphaRad);
            const cosa = Math.cos(alphaRad);
            // Phase per TR that includes the RF phase step of 180 degrees:
            // cos(phi + 180) = -cos(phi)
            const cosPhi = Math.cos(Phi * Math.PI / 180);

            const D = 1 - E1 * cosa - E2 * E2 * (E1 - cosa);
            if (D === 0) return 0;
            const M = (1 - E1) * sina / D;
            const b = E2 * (1 - E1) * (1 + cosa) / D;
            const den = 1 + b * cosPhi;
            if (den === 0) return 0;
            const num = Math.sqrt(Math.max(0, 1 + 2 * E2 * cosPhi + E2 * E2));

            return Rho * M * (num / den) * E_TE;
        }
    },
    'IR': {
        name: 'Inversion Recovery',
        params: ['TR', 'TE', 'TI', 'T1', 'T2', 'Rho'],
        citation: 'Introduction to Functional Magnetic Resonance Imaging Principles and Techniques',
        url: 'https://www.cambridge.org/core/books/abs/introduction-to-functional-magnetic-resonance-imaging/relaxation-and-contrast-in-mri/FFBF5E6D903F4FEFE129F2DEB7F4EE9B',
        // S = Rho * e^(-TE/T2) * (1 - 2*e^(-TI/T1) + 2*e^(-(TR-TE/2)/T1) - e^(-TR/T1))
        equationStr: '$$ S = \\rho e^{-TE/T2} (1 - 2e^{-TI/T1} + 2e^{-(TR-TE/2)/T1} - e^{-TR/T1}) $$',
        // The signal can be negative. The UI has a magnitude option for this.
        signed: true,
        // The inversion time cannot be longer than the repetition time.
        // Without this limit the equation gives |S| > Rho.
        valid: (seqP) => seqP.TI <= seqP.TR,
        // TI at which the signal of a tissue is zero (the root of the equation
        // above). Returns null if the tissue has no null point at this TR and TE.
        nullTI: (seqP, tissueP) => {
            const { TR, TE } = seqP;
            let { T1 } = tissueP;
            if (T1 <= 0) T1 = 1;

            const den = 1 + 2 * Math.exp(-(TR - TE / 2) / T1) - Math.exp(-TR / T1);
            const ti = T1 * Math.log(2 / den);
            return ti > 0 ? ti : null;
        },
        nullParams: (seqP, tissueP) => {
            const ti = sequences.IR.nullTI(seqP, tissueP);
            return ti === null ? null : { TI: ti };
        },
        calc: (seqP, tissueP) => {
            const { TR, TE, TI } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            const term1 = Math.exp(-TE / T2);
            const E_TI = Math.exp(-TI / T1);
            const E_TR_TE2 = Math.exp(-(TR - TE / 2) / T1); // exp(-(TR-TE/2)/T1)
            const E_TR = Math.exp(-TR / T1);

            const term2 = 1 - 2 * E_TI + 2 * E_TR_TE2 - E_TR;

            return Rho * term1 * term2;
        }
    },
    'DIR': {
        name: 'Double Inversion Recovery (DIR)',
        params: ['TR', 'TE', 'TI1', 'TI2', 'T1', 'T2', 'Rho'],
        citation: 'Sequence: Redpath & Smith, Br J Radiol 1994;67:1258-1263. The equation is the steady state of the model in the notes; it was checked against a Bloch simulation (see the tests).',
        url: 'https://doi.org/10.1259/0007-1285-67-804-1258',
        // These values null CSF and white matter of the 1.5T preset
        defaults: { TR: 10000, TE: 20, TI1: 3350, TI2: 460 },
        defaultX: 'TI2',
        notes: 'TI1 is the time from the first inversion pulse to the excitation. TI2 is the time from the second inversion pulse to the excitation, so TI2 < TI1. The model is a spin echo with a refocusing pulse at TE/2 and ideal inversion pulses. The Null button of a tissue sets TI2 for the current TI1. "Null tissues 1 + 2" sets TI1 and TI2 together.',
        equationStr: '$$ S = \\rho e^{-TE/T2} \\left(1 - 2e^{-TI_2/T1} + 2e^{-TI_1/T1} - 2e^{-(TR - TE/2)/T1} + e^{-TR/T1}\\right) $$',
        signed: true,
        valid: (seqP) => seqP.TI2 <= seqP.TI1 && seqP.TI1 <= seqP.TR - seqP.TE / 2,
        // TI2 that gives no signal for the tissue at the current TI1
        nullParams: (seqP, tissueP) => {
            const { TR, TE, TI1 } = seqP;
            let { T1 } = tissueP;
            if (T1 <= 0) T1 = 1;
            const K = 2 * Math.exp(-TI1 / T1) - 2 * Math.exp(-(TR - TE / 2) / T1) + Math.exp(-TR / T1);
            const arg = (1 + K) / 2;
            if (arg <= 0) return null;
            const ti2 = -T1 * Math.log(arg);
            return (ti2 > 0 && ti2 <= TI1) ? { TI2: ti2 } : null;
        },
        // TI1 and TI2 that give no signal for two tissues
        nullPair: (seqP, tissueA, tissueB) => {
            const seq = sequences.DIR;
            const maxTI1 = seqP.TR - seqP.TE / 2;
            // Signal of tissue B when TI2 nulls tissue A
            const f = (ti1) => {
                const p = seq.nullParams({ ...seqP, TI1: ti1 }, tissueA);
                if (p === null) return null;
                return seq.calc({ ...seqP, TI1: ti1, TI2: p.TI2 }, { ...tissueB, Rho: 1, T2: 1e9 });
            };
            const steps = 2000;
            let prevX = null, prevF = null;
            for (let i = 1; i <= steps; i++) {
                const x = maxTI1 * i / steps;
                const fx = f(x);
                if (fx !== null && prevF !== null && prevF * fx <= 0 && prevF !== fx) {
                    // Bisection between prevX and x
                    let lo = prevX, hi = x, fLo = prevF;
                    for (let k = 0; k < 60; k++) {
                        const mid = (lo + hi) / 2;
                        const fMid = f(mid);
                        if (fMid === null) break;
                        if (fLo * fMid <= 0) hi = mid;
                        else { lo = mid; fLo = fMid; }
                    }
                    const ti1 = (lo + hi) / 2;
                    const p = seq.nullParams({ ...seqP, TI1: ti1 }, tissueA);
                    if (p !== null) return { TI1: ti1, TI2: p.TI2 };
                }
                prevX = x;
                prevF = fx;
            }
            return null;
        },
        calc: (seqP, tissueP) => {
            const { TR, TE, TI1, TI2 } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            const mz = 1 - 2 * Math.exp(-TI2 / T1) + 2 * Math.exp(-TI1 / T1)
                - 2 * Math.exp(-(TR - TE / 2) / T1) + Math.exp(-TR / T1);
            return Rho * Math.exp(-TE / T2) * mz;
        }
    },
    'EPI': {
        name: 'Gradient Echo EPI (BOLD)',
        params: ['TR', 'TE', 'Theta', 'T1', 'T2s', 'Rho'],
        ernst: true,
        citation: 'The signal at the centre of k-space is the spoiled gradient echo signal (see SPGR for the source). The BOLD contrast is a small change of T2*.',
        url: '',
        defaults: { TR: 2000, TE: 30, Theta: 90 },
        defaultX: 'TE',
        notes: 'This is the SPGR equation with timing that is typical for functional MRI. The signal difference between two tissues with a small difference in T2* is largest near TE = T2*.',
        equationStr: '$$ S = \\rho e^{-TE/T2^*} \\sin\\theta \\frac{1 - e^{-TR/T1}}{1 - \\cos\\theta e^{-TR/T1}} $$',
        calc: (seqP, tissueP) => sequences.SPGR.calc(seqP, tissueP)
    },
    'MPRAGE': {
        name: 'MPRAGE',
        params: ['TR', 'TI', 'ESP', 'N', 'Theta', 'TE', 'T1', 'T2s', 'Rho'],
        citation: 'Sequence: Mugler & Brookeman, Magn Reson Med 1990;15:152-157. The equation is the steady state of the model in the notes; it was checked against a pulse-by-pulse simulation (see the tests).',
        url: 'https://doi.org/10.1002/mrm.1910150117',
        defaults: { TR: 2300, TI: 900, ESP: 7, N: 176, Theta: 9, TE: 3 },
        defaultX: 'TI',
        notes: 'TR is the time between two inversion pulses (the cycle time), not the spacing of the readouts. ESP is the spacing of the N gradient echo readouts. TI is the time from the inversion pulse to the centre readout of the train, and the signal is that of the centre readout (linear phase encoding). The model has an ideal inversion pulse and perfect spoiling.',
        equationStr: '$$ S = \\rho \\sin\\theta \\, M_c \\, e^{-TE/T2^*}, \\quad M_c = q^{n} \\left[1 - (1 + M_{ss}) e^{-T_A/T1}\\right] + (1 - E) \\frac{1 - q^{n}}{1 - q} $$ $$ E = e^{-ESP/T1}, \\quad q = E \\cos\\theta, \\quad n = \\lfloor N/2 \\rfloor, \\quad T_A = TI - n \\cdot ESP $$ $$ M_{ss} \\text{: magnetization before the inversion pulse in the steady state (fixed point of one cycle)} $$',
        signed: true,
        // The readout train must fit after the inversion and before the next one
        valid: (seqP) => {
            const tr = readoutTrain(seqP.N, seqP.ESP);
            return seqP.TI - tr.tBefore >= 0 && seqP.TR - seqP.TI - tr.tAfter >= 0;
        },
        calc: (seqP, tissueP) => {
            const { TR, TI, ESP, N, Theta, TE } = seqP;
            let { T1, T2s, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2s <= 0) T2s = 1;

            const thetaRad = Theta * Math.PI / 180;
            const cos = Math.cos(thetaRad);
            const tr = readoutTrain(N, ESP);
            const toCentre = mzMap.chain(
                mzMap.invert(),
                mzMap.relax(TI - tr.tBefore, T1),
                mzMap.train(tr.before, ESP, cos, T1)
            );
            const toEnd = mzMap.chain(
                mzMap.train(tr.after, ESP, cos, T1),
                mzMap.relax(TR - TI - tr.tAfter, T1)
            );
            const mStart = mzMap.steady(mzMap.chain(toCentre, toEnd));
            const mCentre = mzMap.apply(toCentre, mStart);

            return Rho * Math.sin(thetaRad) * mCentre * Math.exp(-TE / T2s);
        }
    },
    'MP2RAGE': {
        name: 'MP2RAGE',
        params: ['TR', 'TI1', 'TI2', 'ESP', 'N', 'Theta', 'Theta2', 'T1'],
        citation: 'Marques et al., NeuroImage 2010;49:1271-1281. The steady state was checked against a pulse-by-pulse simulation (see the tests).',
        url: 'https://doi.org/10.1016/j.neuroimage.2009.10.002',
        defaults: { TR: 5000, TI1: 700, TI2: 2500, ESP: 7, N: 160, Theta: 4, Theta2: 5 },
        defaultX: 'TI1',
        notes: 'TR is the time between two inversion pulses. TI1 and TI2 are the times from the inversion pulse to the centre readout of the first and the second train. Each train has N readouts with the spacing ESP; the first uses θ and the second uses θ2. The result is between -0.5 and 0.5. It does not depend on the proton density or on T2*, because these are the same in the two images. The model has an ideal inversion pulse.',
        equationStr: '$$ S = \\frac{G_1 G_2}{G_1^2 + G_2^2}, \\quad G_1 = \\sin\\theta \\, M_{c,1}, \\quad G_2 = \\sin\\theta_2 \\, M_{c,2} $$ $$ M_{c,i} \\text{: longitudinal magnetization before the centre readout of train } i \\text{ in the steady state} $$',
        signed: true,
        valid: (seqP) => {
            const tr = readoutTrain(seqP.N, seqP.ESP);
            return seqP.TI1 - tr.tBefore >= 0
                && seqP.TI2 - seqP.TI1 - seqP.N * seqP.ESP >= 0
                && seqP.TR - seqP.TI2 - tr.tAfter >= 0;
        },
        calc: (seqP, tissueP) => {
            let { T1 } = tissueP;
            if (T1 <= 0) T1 = 1;

            const { m1, m2 } = mp2rageMz(seqP, T1);
            const g1 = Math.sin(seqP.Theta * Math.PI / 180) * m1;
            const g2 = Math.sin(seqP.Theta2 * Math.PI / 180) * m2;
            const den = g1 * g1 + g2 * g2;
            if (den === 0) return 0;
            return (g1 * g2) / den;
        }
    },
    'DWI': {
        name: 'Diffusion-Weighted Spin Echo (DWI)',
        params: ['TR', 'TE', 'B', 'T1', 'T2', 'Rho', 'ADC'],
        citation: 'Diffusion attenuation: Stejskal & Tanner, J Chem Phys 1965;42:288-292. The other factors are the Spin Echo equation.',
        url: 'https://doi.org/10.1063/1.1695690',
        defaults: { TR: 4000, TE: 90, B: 1000 },
        defaultX: 'B',
        notes: 'b is in s/mm² and the ADC is in 10⁻³ mm²/s. The model has one diffusion compartment (no perfusion and no kurtosis).',
        equationStr: '$$ S = \\rho e^{-TE/T2} (1 - 2e^{-(TR - TE/2)/T1} + e^{-TR/T1}) \\, e^{-b \\cdot ADC} $$',
        calc: (seqP, tissueP) => {
            const ADC = tissueP.ADC === undefined ? 0 : tissueP.ADC;
            // b in s/mm^2 and ADC in 1e-3 mm^2/s
            return sequences.SE.calc(seqP, tissueP) * Math.exp(-seqP.B * ADC * 1e-3);
        }
    }
};

// Node.js (tests). In the browser, these are globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sequences, paramDefinitions, mzMap, readoutTrain, mp2rageMz };
}
