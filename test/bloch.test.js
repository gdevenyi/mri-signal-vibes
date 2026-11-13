/**
 * Tests of the new sequence equations against independent simulations.
 * Run with: node --test
 *
 * The simulations here do not use the closed forms of sequences.js. They
 * apply each pulse and each delay in turn, and repeat the cycle until the
 * magnetization is in the steady state.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sequences, paramDefinitions } = require('../sequences.js');
const { REFERENCE_PRESETS } = require('../presets.js');

const WM = { T1: 700, T2: 80, T2s: 60, Rho: 0.73, ADC: 0.7 };
const GM = { T1: 1000, T2: 100, T2s: 70, Rho: 0.83, ADC: 0.8 };
const CSF = { T1: 4000, T2: 2000, T2s: 1000, Rho: 1.0, ADC: 3.0 };
const TISSUES = [WM, GM, CSF];

function close(actual, expected, tol = 1e-9, msg = '') {
    assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);
}

// Longitudinal recovery for the time t (M0 = 1)
const recover = (mz, t, T1) => 1 + (mz - 1) * Math.exp(-t / T1);

// --- bSSFP: full Bloch simulation with a 3-component magnetization ---

// Steady-state |Mxy| at the time TE after the pulse. The RF phase alternates
// by 180 degrees; phiDeg is the off-resonance phase per TR.
function simulateBssfp({ TR, TE, Theta, Phi }, { T1, T2 }) {
    const a = Theta * Math.PI / 180;
    const phi = Phi * Math.PI / 180;
    let m = [0, 0, 1];
    const precessRelax = ([x, y, z], t) => {
        const ang = phi * t / TR;
        const e2 = Math.exp(-t / T2);
        return [
            e2 * (x * Math.cos(ang) - y * Math.sin(ang)),
            e2 * (x * Math.sin(ang) + y * Math.cos(ang)),
            recover(z, t, T1)
        ];
    };
    // Rotation about the x axis by the angle ang
    const pulse = ([x, y, z], ang) => [
        x,
        y * Math.cos(ang) + z * Math.sin(ang),
        -y * Math.sin(ang) + z * Math.cos(ang)
    ];
    let sign = 1;
    const cycles = Math.ceil(40 * Math.max(T1, T2) / TR);
    for (let i = 0; i < cycles; i++) {
        m = precessRelax(m, TR);
        sign = -sign;
        m = pulse(m, sign * a);
    }
    m = precessRelax(m, TE);
    return Math.hypot(m[0], m[1]);
}

test('bSSFP agrees with a Bloch simulation, with and without off-resonance', () => {
    for (const t of [WM, GM, { T1: 300, T2: 250 }]) {
        for (const Theta of [10, 45, 70, 120]) {
            for (const Phi of [-300, -180, -90, 0, 30, 150, 180, 270]) {
                const p = { TR: 8, TE: 4, Theta, Phi };
                const expected = simulateBssfp(p, t);
                close(sequences.bSSFP.calc(p, { ...t, Rho: 1 }), expected, 1e-6, `Theta=${Theta} Phi=${Phi}`);
            }
        }
    }
});

test('bSSFP at zero off-resonance is the on-resonance equation', () => {
    for (const t of TISSUES) {
        for (const Theta of [5, 30, 60, 90, 150]) {
            const TR = 10, TE = 5;
            const E1 = Math.exp(-TR / t.T1), E2 = Math.exp(-TR / t.T2);
            const a = Theta * Math.PI / 180;
            const expected = t.Rho * (1 - E1) * Math.sin(a)
                / (1 - (E1 - E2) * Math.cos(a) - E1 * E2) * Math.exp(-TE / t.T2);
            close(sequences.bSSFP.calc({ TR, TE, Theta, Phi: 0 }, t), expected, 1e-12);
            // No Phi value: the same result
            close(sequences.bSSFP.calc({ TR, TE, Theta }, t), expected, 1e-12);
        }
    }
});

test('bSSFP has its dark band at an off-resonance of 180 degrees', () => {
    const p = { TR: 10, TE: 5, Theta: 60 };
    const pass = sequences.bSSFP.calc({ ...p, Phi: 0 }, WM);
    const band = sequences.bSSFP.calc({ ...p, Phi: 180 }, WM);
    assert.ok(band < 0.2 * pass, `pass ${pass}, band ${band}`);
    // The profile is periodic and symmetric
    close(sequences.bSSFP.calc({ ...p, Phi: 40 }, WM), sequences.bSSFP.calc({ ...p, Phi: -40 }, WM), 1e-12);
    close(sequences.bSSFP.calc({ ...p, Phi: 40 }, WM), sequences.bSSFP.calc({ ...p, Phi: 400 }, WM), 1e-12);
});

// --- DIR ---

// Spin echo with two ideal inversion pulses. Returns Mz before the excitation.
function simulateDir({ TR, TE, TI1, TI2 }, T1) {
    let mz = 1;
    for (let i = 0; i < 60; i++) {
        mz = 0;                                   // 90 degree excitation
        mz = recover(mz, TE / 2, T1);
        mz = -mz;                                 // refocusing pulse
        mz = recover(mz, TR - TE / 2 - TI1, T1);
        mz = -mz;                                 // inversion 1
        mz = recover(mz, TI1 - TI2, T1);
        mz = -mz;                                 // inversion 2
        mz = recover(mz, TI2, T1);
    }
    return mz;
}

test('DIR agrees with a pulse-by-pulse simulation', () => {
    for (const t of TISSUES) {
        for (const p of [
            { TR: 10000, TE: 20, TI1: 3380, TI2: 470 },
            { TR: 3000, TE: 80, TI1: 1500, TI2: 200 },
            { TR: 800, TE: 30, TI1: 700, TI2: 650 }
        ]) {
            const expected = t.Rho * Math.exp(-p.TE / t.T2) * simulateDir(p, t.T1);
            close(sequences.DIR.calc(p, t), expected, 1e-12);
        }
    }
});

test('DIR with two inversions at the same time is the SE equation', () => {
    for (const t of TISSUES) {
        const p = { TR: 2000, TE: 40, TI1: 500, TI2: 500 };
        close(sequences.DIR.calc(p, t), sequences.SE.calc(p, t), 1e-12);
    }
});

test('DIR.valid: TI2 <= TI1 and the first inversion is after the refocusing pulse', () => {
    const { valid } = sequences.DIR;
    assert.equal(valid({ TR: 10000, TE: 20, TI1: 3380, TI2: 470 }), true);
    assert.equal(valid({ TR: 10000, TE: 20, TI1: 400, TI2: 470 }), false);
    assert.equal(valid({ TR: 3000, TE: 20, TI1: 2995, TI2: 470 }), false);
});

test('DIR.nullParams gives a TI2 with no signal', () => {
    const p = { TR: 10000, TE: 20, TI1: 3000 };
    for (const t of TISSUES) {
        const r = sequences.DIR.nullParams(p, t);
        assert.notEqual(r, null);
        close(sequences.DIR.calc({ ...p, ...r }, t), 0, 1e-12);
    }
    // TI1 is too short for CSF to have a null point with TI2 <= TI1
    assert.equal(sequences.DIR.nullParams({ TR: 300, TE: 20, TI1: 5 }, { T1: 4000 }), null);
});

test('DIR.nullPair gives no signal for the two tissues', () => {
    const p = { TR: 10000, TE: 20 };
    const r = sequences.DIR.nullPair(p, CSF, WM);
    assert.notEqual(r, null);
    close(sequences.DIR.calc({ ...p, ...r }, CSF), 0, 1e-9);
    close(sequences.DIR.calc({ ...p, ...r }, WM), 0, 1e-9);
    assert.ok(Math.abs(sequences.DIR.calc({ ...p, ...r }, GM)) > 0.05);
});

test('the DIR defaults null CSF and white matter of the 1.5T preset', () => {
    const preset = REFERENCE_PRESETS['1.5T'];
    const wm = preset.find(t => t.name === 'White Matter').params;
    const csf = preset.find(t => t.name === 'CSF').params;
    const d = sequences.DIR.defaults;
    const r = sequences.DIR.nullPair({ TR: d.TR, TE: d.TE }, csf, wm);
    assert.notEqual(r, null);
    // The default values are this result, rounded to the slider step
    close(d.TI1, r.TI1, 10);
    close(d.TI2, r.TI2, 10);
});

// --- MPRAGE and MP2RAGE ---

// Applies each pulse of each cycle. `trains` is a list of
// { TI, Theta } with TI = time from the inversion to the centre readout.
// Returns Mz before the centre pulse of each train in the steady state.
function simulateMpTrains({ TR, ESP, N }, trains, T1) {
    const before = Math.floor(N / 2);
    let mz = 1;
    let centres = [];
    for (let cycle = 0; cycle < 80; cycle++) {
        centres = [];
        let time = 0;
        mz = -mz;                                 // inversion
        for (const { TI, Theta } of trains) {
            const cos = Math.cos(Theta * Math.PI / 180);
            const start = TI - before * ESP;
            mz = recover(mz, start - time, T1);
            for (let k = 0; k < N; k++) {
                if (k === before) centres.push(mz);
                mz = mz * cos;                    // excitation, perfect spoiling
                mz = recover(mz, ESP, T1);
            }
            time = start + N * ESP;
        }
        mz = recover(mz, TR - time, T1);
    }
    return centres;
}

test('MPRAGE agrees with a pulse-by-pulse simulation', () => {
    for (const t of TISSUES) {
        for (const p of [
            { TR: 2300, TI: 900, ESP: 7, N: 176, Theta: 9, TE: 3 },
            { TR: 1800, TI: 700, ESP: 10, N: 65, Theta: 15, TE: 4 },
            { TR: 3000, TI: 1100, ESP: 6, N: 1, Theta: 30, TE: 2 }
        ]) {
            const [mc] = simulateMpTrains(p, [{ TI: p.TI, Theta: p.Theta }], t.T1);
            const expected = t.Rho * Math.sin(p.Theta * Math.PI / 180) * mc * Math.exp(-p.TE / t.T2s);
            close(sequences.MPRAGE.calc(p, t), expected, 1e-12);
        }
    }
});

test('MPRAGE with a very small flip angle follows the inversion recovery curve', () => {
    // No readout effect: Mz(TI) = 1 - 2*exp(-TI/T1) / (1 + exp(-TR/T1))
    const Theta = 1e-4;
    for (const t of TISSUES) {
        const p = { TR: 2300, TI: 900, ESP: 7, N: 176, Theta, TE: 0 };
        const mz = 1 - 2 * Math.exp(-p.TI / t.T1) / (1 + Math.exp(-p.TR / t.T1));
        const expected = t.Rho * Math.sin(Theta * Math.PI / 180) * mz;
        close(sequences.MPRAGE.calc(p, t) / expected, 1, 1e-6);
    }
});

test('MPRAGE.valid: the readout train must fit in the cycle', () => {
    const { valid } = sequences.MPRAGE;
    assert.equal(valid({ TR: 2300, TI: 900, ESP: 7, N: 176 }), true);
    assert.equal(valid({ TR: 2300, TI: 500, ESP: 7, N: 176 }), false);  // train starts before the inversion
    assert.equal(valid({ TR: 1400, TI: 900, ESP: 7, N: 176 }), false);  // train ends after TR
});

test('MP2RAGE agrees with a pulse-by-pulse simulation', () => {
    for (const T1 of [500, 700, 1000, 1500, 2500, 4000]) {
        for (const p of [
            { TR: 5000, TI1: 700, TI2: 2500, ESP: 7, N: 160, Theta: 4, Theta2: 5 },
            { TR: 6000, TI1: 800, TI2: 2700, ESP: 6, N: 175, Theta: 7, Theta2: 5 }
        ]) {
            const [m1, m2] = simulateMpTrains(p, [
                { TI: p.TI1, Theta: p.Theta }, { TI: p.TI2, Theta: p.Theta2 }
            ], T1);
            const g1 = Math.sin(p.Theta * Math.PI / 180) * m1;
            const g2 = Math.sin(p.Theta2 * Math.PI / 180) * m2;
            close(sequences.MP2RAGE.calc(p, { T1 }), g1 * g2 / (g1 * g1 + g2 * g2), 1e-12, `T1=${T1}`);
        }
    }
});

test('MP2RAGE stays in -0.5 to 0.5, does not use Rho and decreases with T1', () => {
    const p = { TR: 5000, TI1: 700, TI2: 2500, ESP: 7, N: 160, Theta: 4, Theta2: 5 };
    let prev = Infinity;
    for (let T1 = 300; T1 <= 4000; T1 += 100) {
        const s = sequences.MP2RAGE.calc(p, { T1, Rho: 0.3, T2s: 10 });
        assert.ok(s >= -0.5 && s <= 0.5, `T1=${T1}: ${s}`);
        close(s, sequences.MP2RAGE.calc(p, { T1, Rho: 1, T2s: 500 }), 1e-15);
        // With this protocol the signal is a monotonic function of T1 in the brain range
        if (T1 >= 500 && T1 <= 3000) assert.ok(s < prev, `T1=${T1}`);
        prev = s;
    }
});

test('MP2RAGE.valid: the two trains must fit and must not overlap', () => {
    const { valid } = sequences.MP2RAGE;
    const p = { TR: 5000, TI1: 700, TI2: 2500, ESP: 7, N: 160 };
    assert.equal(valid(p), true);
    assert.equal(valid({ ...p, TI1: 400 }), false);
    assert.equal(valid({ ...p, TI2: 1500 }), false);
    assert.equal(valid({ ...p, TR: 3000 }), false);
});

// --- EPI and DWI ---

test('EPI is the SPGR equation', () => {
    for (const t of TISSUES) {
        const p = { TR: 2000, TE: 30, Theta: 77 };
        assert.equal(sequences.EPI.calc(p, t), sequences.SPGR.calc(p, t));
    }
});

test('EPI: the T2* contrast for a small change of T2* is largest at TE = T2*', () => {
    const base = { T1: 1000, T2s: 50, Rho: 1 };
    const active = { ...base, T2s: 50.5 };
    let best = 0, bestTE = null;
    for (let TE = 1; TE <= 150; TE += 0.5) {
        const p = { TR: 2000, TE, Theta: 90 };
        const d = sequences.EPI.calc(p, active) - sequences.EPI.calc(p, base);
        if (d > best) { best = d; bestTE = TE; }
    }
    close(bestTE, 50, 0.5);
});

test('DWI is the SE equation at b = 0 and decays with exp(-b * ADC)', () => {
    for (const t of TISSUES) {
        const p = { TR: 4000, TE: 90 };
        assert.equal(sequences.DWI.calc({ ...p, B: 0 }, t), sequences.SE.calc(p, t));
        const ratio = sequences.DWI.calc({ ...p, B: 1000 }, t) / sequences.SE.calc(p, t);
        // ADC is in 1e-3 mm^2/s: b = 1000 s/mm^2 gives exp(-ADC)
        close(ratio, Math.exp(-t.ADC), 1e-12);
    }
});

// --- Structure ---

test('each sequence parameter has a definition, and the defaults are valid', () => {
    for (const [id, seq] of Object.entries(sequences)) {
        const seqP = {};
        for (const key of seq.params) {
            const def = paramDefinitions[key];
            assert.ok(def, `${id}: no definition for ${key}`);
            if (def.type === 'seq') {
                seqP[key] = (seq.defaults && seq.defaults[key] !== undefined) ? seq.defaults[key] : def.default;
                assert.ok(seqP[key] >= def.min, `${id}: default ${key} is below the minimum`);
            }
        }
        for (const key of Object.keys(seq.defaults || {})) {
            assert.ok(seq.params.includes(key), `${id}: default for ${key}, which is not a parameter`);
        }
        if (seq.defaultX) {
            assert.ok(seq.params.includes(seq.defaultX), `${id}: defaultX`);
            assert.equal(paramDefinitions[seq.defaultX].type, 'seq', `${id}: defaultX`);
        }
        if (seq.valid) assert.equal(seq.valid(seqP), true, `${id}: the default timing is not valid`);
        assert.ok(seqP.TE === undefined || seqP.TE <= seqP.TR, `${id}: default TE > TR`);
        for (const t of TISSUES) {
            const s = seq.calc(seqP, t);
            assert.ok(Number.isFinite(s), `${id}: default signal is not finite`);
        }
    }
});
