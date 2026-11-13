/**
 * MRI Signal Intensity Simulator: tissue presets
 *
 * Each preset value comes from ONE row of the literature table
 * (reference-data.js). Values from different sources are not averaged.
 *
 *   params - T1, T2, T2s (ms), Rho (proton density, water = 1),
 *            ADC (10^-3 mm^2/s)
 *   src    - for each parameter, the literature row that gives the value:
 *            [PMID, start of the tissue name of the row]. A parameter that
 *            is not in `src` has no source: its value is only illustrative,
 *            and the page says so.
 *   srcNote - (optional) a short text that the page shows with the source,
 *            when the row is not exactly the tissue or the measure of the preset
 *
 * The tests compare each sourced value with the literature rows.
 * This file has no DOM code, so that Node.js can load it for the tests.
 */

// ADC of normal brain: Helenius et al. 2002 (measured at 1.5 T; the page shows
// this when the preset is for a different field strength)
const BRAIN_ADC = { WM: 0.7, GM: 0.89, CSF: 3.02 };
const BRAIN_ADC_SRC = '11847041';

// Human brain, in vivo
const REFERENCE_PRESETS = {
    '1.5T': [
        {
            name: 'White Matter', color: '#cf6679',
            params: { T1: 678, T2: 80, T2s: 66.2, Rho: 0.7226, ADC: BRAIN_ADC.WM },
            src: { T1: ['24621588', 'White matter'], T2: ['20593370', 'White matter'], T2s: ['17459640', 'White matter'], Rho: ['40815301', 'White matter'], ADC: [BRAIN_ADC_SRC, 'White matter'] }
        },
        {
            name: 'Gray Matter', color: '#bb86fc',
            params: { T1: 1154, T2: 87, T2s: 84, Rho: 0.8406, ADC: BRAIN_ADC.GM },
            src: { T1: ['24621588', 'Gray matter'], T2: ['20593370', 'Cortical gray matter'], T2s: ['17459640', 'Cortical gray matter'], Rho: ['40815301', 'Cortical gray matter'], ADC: [BRAIN_ADC_SRC, 'Cortical gray matter'] }
        },
        {
            name: 'CSF', color: '#03dac6',
            params: { T1: 4070, T2: 2000, T2s: 1000, Rho: 1.0, ADC: BRAIN_ADC.CSF },
            src: { T1: ['17260370', 'CSF'], ADC: [BRAIN_ADC_SRC, 'CSF'] }
        }
    ],
    '3.0T': [
        {
            name: 'White Matter', color: '#cf6679',
            params: { T1: 911, T2: 71, T2s: 50, Rho: 0.691, ADC: BRAIN_ADC.WM },
            src: { T1: ['24621588', 'White matter'], T2: ['20593370', 'White matter'], T2s: ['31920951', 'White matter'], Rho: ['31920951', 'White matter'], ADC: [BRAIN_ADC_SRC, 'White matter'] }
        },
        {
            name: 'Gray Matter', color: '#bb86fc',
            params: { T1: 1615, T2: 76, T2s: 55.7, Rho: 0.837, ADC: BRAIN_ADC.GM },
            src: { T1: ['24621588', 'Gray matter'], T2: ['20593370', 'Cortical gray matter'], T2s: ['31920951', 'Gray matter'], Rho: ['31920951', 'Gray matter'], ADC: [BRAIN_ADC_SRC, 'Cortical gray matter'] }
        },
        {
            name: 'CSF', color: '#03dac6',
            params: { T1: 4454, T2: 2372.9, T2s: 300, Rho: 1.0, ADC: BRAIN_ADC.CSF },
            src: { T1: ['37582262', 'CSF'], T2: ['37582262', 'CSF'], ADC: [BRAIN_ADC_SRC, 'CSF'] }
        }
    ],
    '7.0T': [
        {
            name: 'White Matter', color: '#cf6679',
            params: { T1: 1284, T2: 47, T2s: 27.1, Rho: 0.7, ADC: BRAIN_ADC.WM },
            src: { T1: ['24621588', 'White matter'], T2: ['20593370', 'White matter'], T2s: ['30549128', 'White matter'], ADC: [BRAIN_ADC_SRC, 'White matter'] }
        },
        {
            name: 'Gray Matter', color: '#bb86fc',
            params: { T1: 2065, T2: 47, T2s: 32.8, Rho: 0.83, ADC: BRAIN_ADC.GM },
            src: { T1: ['24621588', 'Gray matter'], T2: ['20593370', 'Cortical gray matter'], T2s: ['30549128', 'Gray matter'], ADC: [BRAIN_ADC_SRC, 'Cortical gray matter'] }
        },
        {
            name: 'CSF', color: '#03dac6',
            params: { T1: 4425, T2: 1050, T2s: 100, Rho: 1.0, ADC: BRAIN_ADC.CSF },
            src: { T1: ['17260370', 'CSF'], T2: ['29110239', 'CSF'], ADC: [BRAIN_ADC_SRC, 'CSF'] }
        }
    ]
};

// More tissues for the "Add preset" list (human, 3 T)
const EXTRA_TISSUES = [
    {
        name: 'Subcutaneous fat (3T)',
        params: { T1: 382, T2: 68, T2s: 40, Rho: 0.9, ADC: 0.0181 },
        src: { T1: ['14990831', 'Subcutaneous fat'], T2: ['14990831', 'Subcutaneous fat'], ADC: ['21413077', 'Bone marrow fat'] },
        srcNote: { ADC: 'bone marrow fat' }
    },
    {
        name: 'Skeletal muscle (3T)',
        params: { T1: 898, T2: 29, T2s: 25.3, Rho: 0.75, ADC: 1.8 },
        src: { T1: ['14990831', 'Skeletal muscle'], T2: ['14990831', 'Skeletal muscle'], T2s: ['23189142', 'Skeletal muscle'], ADC: ['31705253', 'Skeletal muscle'] }
    },
    {
        name: 'Venous blood (3T)',
        params: { T1: 1694, T2: 62.4, T2s: 30, Rho: 0.85, ADC: 1.54 },
        src: { T1: ['23269013', 'Blood (venous)'], T2: ['18666116', 'Blood (venous)'], ADC: ['28940621', 'Blood'] }
    },
    {
        name: 'Peritumoral edema, glioma (3T)',
        params: { T1: 1449.3, T2: 153.8, T2s: 100, Rho: 0.84, ADC: 1.18 },
        src: { T1: ['28542553', 'Peritumoral edema'], T2: ['28542553', 'Peritumoral edema'], Rho: ['28542553', 'Peritumoral edema'], ADC: ['37881606', 'Peritumoral edema'] },
        srcNote: { ADC: 'minimum ADC' }
    }
];

// The default relaxivities r1 and r2 (paramDefinitions in sequences.js) are
// those of this row of `relaxivityData`
const DEFAULT_AGENT_SOURCE = { agent: 'Gadoterate', field_T: 1.5, medium: 'bovine plasma', pmid: '16230904' };

// Name of the literature field for each preset parameter
const PRESET_FIELD = { T1: 'T1_ms', T2: 'T2_ms', T2s: 'T2s_ms', Rho: 'PD', ADC: 'ADC' };

// The literature row that gives a preset value, or null
function findPresetSource(preset, key, referenceData) {
    const src = preset.src ? preset.src[key] : undefined;
    if (!src) return null;
    const [pmid, tissue] = src;
    const field = PRESET_FIELD[key];
    return referenceData.find(r =>
        r.pmid === pmid && r.tissue.startsWith(tissue) && r[field] === preset.params[key]
    ) || null;
}

// Node.js (tests). In the browser, these are globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { REFERENCE_PRESETS, EXTRA_TISSUES, DEFAULT_AGENT_SOURCE, PRESET_FIELD, findPresetSource };
}
