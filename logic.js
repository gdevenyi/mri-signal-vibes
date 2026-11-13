/**
 * MRI Signal Intensity Simulator: calculations of the user interface
 *
 * Contrast agent, Ernst angle, contrast analysis, CSV export and the state
 * in the URL. This file has no DOM code, so that Node.js can load it for the
 * tests.
 */

const STATE_VERSION = 1;
const MAX_NAME_LENGTH = 80;
// Upper limit for parameters whose slider range can grow and that have no
// hardMax of their own
const MAX_OPEN_VALUE = 1e6;

// The largest value that the program accepts for a parameter
function paramLimit(def) {
    if (def.fixedRange) return def.max;
    return def.hardMax !== undefined ? def.hardMax : MAX_OPEN_VALUE;
}

// Relaxation times of a tissue that contains a contrast agent.
// 1/T' = 1/T + r * C, with T in ms, r in 1/(mM*s) and C in mM.
// T2* uses r2, so that T2* <= T2 stays true.
function applyContrastAgent(tissueP, r1, r2) {
    const C = tissueP.C;
    if (!(C > 0)) return { ...tissueP };
    const shorten = (T, r) => 1 / (1 / T + r * C / 1000);
    return {
        ...tissueP,
        T1: shorten(tissueP.T1, r1),
        T2: shorten(tissueP.T2, r2),
        T2s: shorten(tissueP.T2s, r2)
    };
}

// T2* cannot be longer than T2. Changes `params` and returns true if it
// changed T2*.
function limitT2s(params) {
    if (params.T2s > params.T2) {
        params.T2s = params.T2;
        return true;
    }
    return false;
}

// Flip angle (degrees) that gives the maximum spoiled gradient echo signal
function ernstAngle(TR, T1) {
    return Math.acos(Math.exp(-TR / T1)) * 180 / Math.PI;
}

// Contrast between each pair of series.
// series:  [{ name, color, xs: [...], ys: [...] }] (a y value can be null)
// trAt(k): TR in ms at the sample k, or undefined if the sequence has no TR
// For each pair: the maximum signal difference, the maximum signal ratio
// and the maximum of difference / sqrt(TR in s) (contrast per unit of scan
// time), each with its X position (null if there is no maximum).
function analyzeContrast(series, trAt) {
    const results = [];
    for (let i = 0; i < series.length; i++) {
        for (let j = i + 1; j < series.length; j++) {
            const a = series[i];
            const b = series[j];
            const res = {
                name: `${a.name} vs ${b.name}`,
                color: a.color,
                diff: 0, diffX: null,
                ratio: 1, ratioX: null,
                eff: 0, effX: null
            };
            for (let k = 0; k < a.ys.length; k++) {
                const v1 = a.ys[k];
                const v2 = b.ys[k];
                if (v1 === null || v2 === null) continue;

                const diff = Math.abs(v1 - v2);
                if (diff > res.diff) {
                    res.diff = diff;
                    res.diffX = a.xs[k];
                }

                if (Math.abs(v1) > 0.001 && Math.abs(v2) > 0.001) {
                    const r = Math.max(Math.abs(v1 / v2), Math.abs(v2 / v1));
                    if (r > res.ratio) {
                        res.ratio = r;
                        res.ratioX = a.xs[k];
                    }
                }

                const tr = trAt ? trAt(k) : undefined;
                if (tr > 0) {
                    const eff = diff / Math.sqrt(tr / 1000);
                    if (eff > res.eff) {
                        res.eff = eff;
                        res.effX = a.xs[k];
                    }
                }
            }
            results.push(res);
        }
    }
    return results;
}

// CSV text of the plotted curves. All series have the same X values.
function buildCsv(xLabel, series) {
    const quote = (text) => `"${String(text).replace(/"/g, '""')}"`;
    const lines = [[quote(xLabel), ...series.map(s => quote(s.name))].join(',')];
    const n = series.length ? series[0].xs.length : 0;
    for (let k = 0; k < n; k++) {
        const row = [series[0].xs[k], ...series.map(s => (s.ys[k] === null ? '' : s.ys[k]))];
        lines.push(row.join(','));
    }
    return lines.join('\r\n') + '\r\n';
}

// --- State in the URL ---
//
// state: {
//   seq, x,                     sequence id and X-axis parameter
//   seqParams: { TR: ... },     scanner settings
//   magnitude: bool,
//   agent: { on: bool, r1, r2 },
//   tissues: [{ name, color, params: { T1, T2, T2s, Rho, ADC, C } }]
// }

function tissueParamKeys(paramDefinitions) {
    return Object.keys(paramDefinitions).filter(k => paramDefinitions[k].type === 'tissue');
}

function encodeState(state, paramDefinitions) {
    const keys = tissueParamKeys(paramDefinitions);
    const compact = {
        v: STATE_VERSION,
        q: state.seq,
        x: state.x,
        p: state.seqParams,
        m: state.magnitude ? 1 : 0,
        a: [state.agent.on ? 1 : 0, state.agent.r1, state.agent.r2],
        k: keys,
        t: state.tissues.map(t => [t.name, t.color, ...keys.map(k => t.params[k])])
    };
    return encodeURIComponent(JSON.stringify(compact));
}

// A number in the range of the parameter, or the fallback
function cleanNumber(value, def, fallback) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    let v = Math.min(Math.max(value, def.min), paramLimit(def));
    if (def.integer) v = Math.round(v);
    return v;
}

// The text comes from the URL, so it is not trusted: each value is checked.
// ctx: { sequences, paramDefinitions, palette, maxTissues }
// Returns a complete state, or null if the text is not a state.
function decodeState(text, ctx) {
    const { sequences, paramDefinitions, palette, maxTissues } = ctx;
    let raw;
    try {
        raw = JSON.parse(decodeURIComponent(text));
    } catch {
        return null;
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.v !== STATE_VERSION) return null;
    if (typeof raw.q !== 'string' || !Object.prototype.hasOwnProperty.call(sequences, raw.q)) return null;

    const seq = sequences[raw.q];
    const seqKeys = seq.params.filter(k => paramDefinitions[k].type === 'seq');

    const seqParams = {};
    const rawP = (raw.p !== null && typeof raw.p === 'object') ? raw.p : {};
    for (const key of seqKeys) {
        const def = paramDefinitions[key];
        const fallback = (seq.defaults && seq.defaults[key] !== undefined) ? seq.defaults[key] : def.default;
        const value = Object.prototype.hasOwnProperty.call(rawP, key) ? rawP[key] : undefined;
        seqParams[key] = cleanNumber(value, def, fallback);
    }

    const x = seqKeys.includes(raw.x) ? raw.x : (seq.defaultX || seqKeys[0]);

    const rawA = Array.isArray(raw.a) ? raw.a : [];
    const agent = {
        on: rawA[0] === 1,
        r1: cleanNumber(rawA[1], paramDefinitions.r1, paramDefinitions.r1.default),
        r2: cleanNumber(rawA[2], paramDefinitions.r2, paramDefinitions.r2.default)
    };

    const allKeys = tissueParamKeys(paramDefinitions);
    const rawKeys = Array.isArray(raw.k) ? raw.k : [];
    const tissues = [];
    for (const row of (Array.isArray(raw.t) ? raw.t : [])) {
        if (tissues.length >= maxTissues) break;
        if (!Array.isArray(row)) continue;
        const usedColors = tissues.map(t => t.color);
        // Only colours of the palette are accepted
        const color = (palette.includes(row[1]) && !usedColors.includes(row[1]))
            ? row[1]
            : (palette.find(c => !usedColors.includes(c)) || palette[0]);
        const name = (typeof row[0] === 'string' && row[0].trim())
            ? row[0].slice(0, MAX_NAME_LENGTH)
            : `Tissue ${tissues.length + 1}`;
        const params = {};
        for (const key of allKeys) {
            const idx = rawKeys.indexOf(key);
            params[key] = cleanNumber(idx >= 0 ? row[idx + 2] : undefined, paramDefinitions[key], paramDefinitions[key].default);
        }
        limitT2s(params);
        tissues.push({ name, color, params });
    }
    if (tissues.length === 0) return null;

    return { seq: raw.q, x, seqParams, magnitude: raw.m === 1, agent, tissues };
}

// Node.js (tests). In the browser, these are globals.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        paramLimit, applyContrastAgent, limitT2s, ernstAngle, analyzeContrast, buildCsv,
        encodeState, decodeState, MAX_NAME_LENGTH
    };
}
