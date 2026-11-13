/**
 * Tests for the calculations of the user interface. Run with: node --test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sequences, paramDefinitions } = require('../sequences.js');
const {
    paramLimit, applyContrastAgent, limitT2s, ernstAngle, analyzeContrast, buildCsv,
    encodeState, decodeState, MAX_NAME_LENGTH
} = require('../logic.js');

const PALETTE = ['#bb86fc', '#03dac6', '#cf6679', '#ffb74d', '#64b5f6'];
const CTX = { sequences, paramDefinitions, palette: PALETTE, maxTissues: 5 };

function close(actual, expected, tol = 1e-9, msg = '') {
    assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);
}

function sampleState() {
    return {
        seq: 'IR',
        x: 'TI',
        seqParams: { TR: 6000, TE: 15, TI: 485 },
        magnitude: true,
        agent: { on: true, r1: 4.5, r2: 6 },
        tissues: [
            { name: 'White "Matter", left', color: '#cf6679', params: { T1: 700, T2: 80, T2s: 60, Rho: 0.73, ADC: 0.7, C: 0 } },
            { name: 'Tumour <b>', color: '#bb86fc', params: { T1: 1500, T2: 200, T2s: 100, Rho: 0.9, ADC: 1.4, C: 0.25 } }
        ]
    };
}

const decodeRaw = (obj) => decodeState(encodeURIComponent(JSON.stringify(obj)), CTX);
const rawState = (changes = {}) => ({
    v: 1, q: 'SE', x: 'TR', p: { TR: 500, TE: 20 }, m: 0, a: [0, 4, 5],
    k: ['T1', 'T2', 'T2s', 'Rho', 'ADC', 'C'],
    t: [['WM', '#cf6679', 700, 80, 60, 0.73, 0.7, 0]],
    ...changes
});

// --- Contrast agent ---

test('applyContrastAgent: no agent gives the same values', () => {
    const t = { T1: 1000, T2: 100, T2s: 50, Rho: 0.8, C: 0 };
    assert.deepEqual(applyContrastAgent(t, 4, 5), t);
    assert.notEqual(applyContrastAgent(t, 4, 5), t); // a copy
});

test('applyContrastAgent: the rates add', () => {
    // T1 = 1000 ms (R1 = 1 /s), r1 = 4 /(mM s), C = 0.5 mM: R1 = 3 /s
    const r = applyContrastAgent({ T1: 1000, T2: 100, T2s: 50, Rho: 0.8, C: 0.5 }, 4, 5);
    close(r.T1, 1000 / 3);
    close(r.T2, 1000 / (10 + 2.5));
    close(r.T2s, 1000 / (20 + 2.5));
    assert.equal(r.Rho, 0.8);
    assert.ok(r.T2s <= r.T2 && r.T2 <= r.T1);
});

test('limitT2s: T2* is not longer than T2', () => {
    const a = { T2: 80, T2s: 100 };
    assert.equal(limitT2s(a), true);
    assert.equal(a.T2s, 80);
    const b = { T2: 80, T2s: 60 };
    assert.equal(limitT2s(b), false);
    assert.equal(b.T2s, 60);
});

// --- Ernst angle ---

test('ernstAngle is the flip angle with the maximum SPGR signal', () => {
    for (const [TR, T1] of [[10, 1000], [50, 700], [500, 1400], [2000, 4000]]) {
        const tissue = { T1, T2s: 50, Rho: 1 };
        let best = 0, bestTheta = null;
        for (let Theta = 0.5; Theta <= 120; Theta += 0.01) {
            const s = sequences.SPGR.calc({ TR, TE: 5, Theta }, tissue);
            if (s > best) { best = s; bestTheta = Theta; }
        }
        close(ernstAngle(TR, T1), bestTheta, 0.02, `TR=${TR} T1=${T1}`);
    }
});

// --- Contrast analysis ---

test('analyzeContrast: maximum difference, ratio and efficiency of each pair', () => {
    const xs = [100, 400, 900, 1600];
    const series = [
        { name: 'A', color: '#111', xs, ys: [0.1, 0.4, 0.6, 0.7] },
        { name: 'B', color: '#222', xs, ys: [0.05, 0.1, 0.2, 0.25] },
        { name: 'C', color: '#333', xs, ys: [null, 0.1, 0.2, 0.25] }
    ];
    const res = analyzeContrast(series, (k) => xs[k]);
    assert.equal(res.length, 3);
    const ab = res[0];
    assert.equal(ab.name, 'A vs B');
    assert.equal(ab.color, '#111');
    close(ab.diff, 0.45);
    assert.equal(ab.diffX, 1600);
    close(ab.ratio, 4);
    assert.equal(ab.ratioX, 400);
    // diff / sqrt(TR in s): 0.158, 0.474, 0.422, 0.356
    close(ab.eff, 0.3 / Math.sqrt(0.4));
    assert.equal(ab.effX, 400);
    // B and C are equal where C has a value: no maximum
    const bc = res[2];
    assert.equal(bc.diff, 0);
    assert.equal(bc.diffX, null);
    assert.equal(bc.ratioX, null);
    assert.equal(bc.effX, null);
});

test('analyzeContrast: with a fixed TR the efficiency maximum is at the difference maximum', () => {
    const xs = [10, 20, 30];
    const series = [
        { name: 'A', color: '#111', xs, ys: [0.5, 0.3, 0.2] },
        { name: 'B', color: '#222', xs, ys: [0.4, 0.1, 0.1] }
    ];
    const [res] = analyzeContrast(series, () => 2000);
    assert.equal(res.effX, res.diffX);
    close(res.eff, res.diff / Math.sqrt(2));
    // No TR: no efficiency
    const [noTr] = analyzeContrast(series, null);
    assert.equal(noTr.effX, null);
});

// --- CSV ---

test('buildCsv: header with quotes, one row for each X value, empty for no signal', () => {
    const csv = buildCsv('TR (ms)', [
        { name: 'White "Matter", left', xs: [1, 2], ys: [0.5, null] },
        { name: 'CSF', xs: [1, 2], ys: [0.25, 0.75] }
    ]);
    assert.equal(csv, '"TR (ms)","White ""Matter"", left","CSF"\r\n1,0.5,0.25\r\n2,,0.75\r\n');
});

// --- State in the URL ---

test('encodeState and decodeState: a round trip gives the same state', () => {
    const state = sampleState();
    const text = encodeState(state, paramDefinitions);
    assert.match(text, /^[A-Za-z0-9%._~!'()*-]+$/); // safe in a URL hash
    assert.deepEqual(decodeState(text, CTX), state);
});

test('decodeState: each sequence with its default values makes a round trip', () => {
    for (const [id, seq] of Object.entries(sequences)) {
        const seqParams = {};
        for (const key of seq.params) {
            const def = paramDefinitions[key];
            if (def.type === 'seq') {
                seqParams[key] = (seq.defaults && seq.defaults[key] !== undefined) ? seq.defaults[key] : def.default;
            }
        }
        const state = { ...sampleState(), seq: id, x: Object.keys(seqParams)[0], seqParams };
        assert.deepEqual(decodeState(encodeState(state, paramDefinitions), CTX), state, id);
    }
});

test('decodeState: text that is not a state gives null', () => {
    assert.equal(decodeState('', CTX), null);
    assert.equal(decodeState('%E0%A4%A', CTX), null);          // bad percent code
    assert.equal(decodeState('not json', CTX), null);
    assert.equal(decodeState('null', CTX), null);
    assert.equal(decodeState('[1,2]', CTX), null);
    assert.equal(decodeRaw(rawState({ v: 2 })), null);
    assert.equal(decodeRaw(rawState({ t: [] })), null);
    assert.equal(decodeRaw(rawState({ t: 'x' })), null);
});

test('decodeState: only sequence ids of the sequence list are accepted', () => {
    for (const q of ['XX', 'constructor', '__proto__', 'toString', 5, null]) {
        assert.equal(decodeRaw(rawState({ q })), null, String(q));
    }
});

test('decodeState: bad numbers get the default value and numbers stay in range', () => {
    const s = decodeRaw(rawState({
        p: { TR: 'abc', TE: -50, Extra: 1, __proto__: { TI: 5 } },
        a: [1, 1e9, 'x'],
        t: [['WM', '#cf6679', null, 1e12, 5, 7, -3, 99]]
    }));
    assert.deepEqual(s.seqParams, { TR: paramDefinitions.TR.default, TE: paramDefinitions.TE.min });
    assert.deepEqual(s.agent, { on: true, r1: paramDefinitions.r1.max, r2: paramDefinitions.r2.default });
    const p = s.tissues[0].params;
    assert.equal(p.T1, paramDefinitions.T1.default);
    assert.equal(p.T2, 1e6);
    assert.equal(p.T2s, 5);
    assert.equal(p.Rho, 1);
    assert.equal(p.ADC, 0);
    assert.equal(p.C, paramDefinitions.C.max);
});

test('decodeState: counts are integers, T2* <= T2 and X is a parameter of the sequence', () => {
    const s = decodeRaw(rawState({
        q: 'FSE', x: 'TI', p: { TR: 3000, TE: 80, ETL: 7.6, ESP: 10 },
        t: [['WM', '#cf6679', 700, 80, 200, 0.73, 0.7, 0]]
    }));
    assert.equal(s.seqParams.ETL, 8);
    assert.equal(s.tissues[0].params.T2s, 80);
    assert.equal(s.x, 'TR');
    // A tissue parameter is not accepted as the X-axis
    assert.equal(decodeRaw(rawState({ x: 'T1' })).x, 'TR');
    // The default X-axis of the sequence
    assert.equal(decodeRaw(rawState({ q: 'DWI', x: 'nothing' })).x, 'B');
});

test('decodeState: colours come from the palette, names are text of limited length', () => {
    const s = decodeRaw(rawState({
        t: [
            ['A', 'red; background: url(x)', 700, 80, 60, 0.7, 0.7, 0],
            ['B', '"><script>', 700, 80, 60, 0.7, 0.7, 0],
            ['C', '#bb86fc', 700, 80, 60, 0.7, 0.7, 0],
            [{ a: 1 }, '#ffb74d', 700, 80, 60, 0.7, 0.7, 0],
            ['x'.repeat(500), '#64b5f6', 700, 80, 60, 0.7, 0.7, 0],
            ['Too many', '#64b5f6', 700, 80, 60, 0.7, 0.7, 0],
            'not a row'
        ]
    }));
    assert.equal(s.tissues.length, 5);
    for (const t of s.tissues) assert.ok(PALETTE.includes(t.color), t.color);
    assert.equal(new Set(s.tissues.map(t => t.color)).size, 5);
    assert.equal(s.tissues[3].name, 'Tissue 4');
    assert.equal(s.tissues[4].name.length, MAX_NAME_LENGTH);
});

test('decodeState: a state without the newer tissue parameters gets their defaults', () => {
    const s = decodeRaw(rawState({ k: ['T1', 'T2', 'T2s', 'Rho'], t: [['WM', '#cf6679', 700, 80, 60, 0.73]] }));
    assert.deepEqual(s.tissues[0].params, {
        T1: 700, T2: 80, T2s: 60, Rho: 0.73,
        ADC: paramDefinitions.ADC.default, C: paramDefinitions.C.default
    });
});

test('decodeState: counts have a hard limit, so that a link cannot make a very long calculation', () => {
    const s = decodeRaw(rawState({ q: 'FSE', p: { TR: 1e9, TE: 1e9, ETL: 1e9, ESP: 1 } }));
    assert.equal(s.seqParams.ETL, paramDefinitions.ETL.hardMax);
    assert.equal(s.seqParams.TR, 1e6);
    const m = decodeRaw(rawState({ q: 'MPRAGE', p: { N: 5e5 } }));
    assert.equal(m.seqParams.N, paramDefinitions.N.hardMax);
});

test('paramLimit: each count has a hard limit, and a fixed range is its own limit', () => {
    for (const [key, def] of Object.entries(paramDefinitions)) {
        if (def.integer) assert.ok(paramLimit(def) <= 2048, key);
        if (def.fixedRange) assert.equal(paramLimit(def), def.max, key);
        assert.ok(paramLimit(def) >= def.max, key);
    }
});
