/**
 * MRI Signal Intensity Simulator: signal equations
 *
 * Each sequence has:
 *   name, params     - display name and the parameters that the sequence uses
 *   citation, url    - source of the equation
 *   equationStr      - equation in TeX, for MathJax
 *   calc(seqP, tissueP) - signal for the sequence and tissue parameters
 *   defaults         - (optional) default values that replace the global ones
 *   valid(seqP)      - (optional) false if the timing is not possible
 *   signed           - (optional) true if the signal can be negative
 *
 * This file has no DOM code, so that Node.js can load it for the tests.
 */

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
        params: ['TR', 'TE', 'Theta', 'T1', 'T2', 'Rho'],
        citation: 'MRIQuestions.com',
        url: 'https://mriquestions.com/true-fispfiesta.html',
        equationStr: '$$ S = \\rho \\sin\\theta \\frac{1 - e^{-TR/T1}}{1 - (e^{-TR/T1} - e^{-TR/T2}) \\cos\\theta - e^{-TR/T1} e^{-TR/T2}} e^{-TE/T2} $$',
        calc: (seqP, tissueP) => {
            // Full bSSFP Signal Equation (On-Resonance)
            // S = Rho * [ (1-E1)*sin(alpha) ] / [ 1 - (E1-E2)*cos(alpha) - E1*E2 ] * exp(-TE/T2)
            // Where E1 = exp(-TR/T1), E2 = exp(-TR/T2)
            const { TR, TE, Theta } = seqP;
            let { T1, T2, Rho } = tissueP;
            if (T1 <= 0) T1 = 1;
            if (T2 <= 0) T2 = 1;

            const alphaRad = Theta * Math.PI / 180;
            const E1 = Math.exp(-TR / T1);
            const E2 = Math.exp(-TR / T2);
            const E_TE = Math.exp(-TE / T2);

            const sina = Math.sin(alphaRad);
            const cosa = Math.cos(alphaRad);

            const num = (1 - E1) * sina;
            const den = 1 - (E1 - E2) * cosa - (E1 * E2);

            if (den === 0) return 0;
            return Rho * (num / den) * E_TE;
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
    }
};

// Node.js (tests). In the browser, `sequences` is a global.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { sequences };
}
