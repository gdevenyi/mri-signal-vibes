/**
 * Tests for the signal equations. Run with: node --test
 *
 * Most tests are limit checks: in a known limit, an equation must agree with
 * a simpler equation or with a known value.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sequences } = require('../sequences.js');

const WM = { T1: 700, T2: 80, T2s: 60, Rho: 0.73 };
const GM = { T1: 1000, T2: 100, T2s: 70, Rho: 0.83 };
const CSF = { T1: 4000, T2: 2000, T2s: 1000, Rho: 1.0 };
const TISSUES = [WM, GM, CSF];

function close(actual, expected, tol = 1e-9, msg = '') {
    assert.ok(Math.abs(actual - expected) <= tol, `${msg} expected ${expected}, got ${actual}`);
}

test('each sequence has the necessary fields', () => {
    for (const [id, seq] of Object.entries(sequences)) {
        assert.equal(typeof seq.name, 'string', id);
        assert.ok(Array.isArray(seq.params), id);
        assert.equal(typeof seq.equationStr, 'string', id);
        assert.equal(typeof seq.calc, 'function', id);
    }
});

test('each sequence gives a finite signal with |S| <= Rho on a parameter grid', () => {
    for (const [id, seq] of Object.entries(sequences)) {
        for (const tissue of TISSUES) {
            for (const TR of [5, 20, 100, 500, 3000]) {
                for (const Theta of [1, 10, 30, 60, 90, 120, 179, 180]) {
                    for (const TI of [0, 150, 1000]) {
                        // Two sets of inversion times: TI2 < TI1 (DIR) and TI1 < TI2 (MP2RAGE)
                        for (const [TI1, TI2] of [[400, 60], [60, 400]]) {
                            const seqP = {
                                TR, TE: Math.min(TR, 80), TI, Theta, ETL: 1, ESP: 10,
                                TI1, TI2, N: 3, Theta2: 7, Phi: 30, B: 500
                            };
                            if (seq.valid && !seq.valid(seqP)) continue;
                            const s = seq.calc(seqP, { ...tissue, ADC: 0.8 });
                            const where = `${id} TR=${TR} Theta=${Theta} TI=${TI} TI1=${TI1}`;
                            assert.ok(Number.isFinite(s), `${where}: ${s}`);
                            // DESS combines two signals, so its limit is sqrt(2) * Rho
                            const limit = (id === 'DESS' ? Math.SQRT2 : 1) * tissue.Rho + 1e-9;
                            assert.ok(Math.abs(s) <= limit, `${where}: ${s}`);
                        }
                    }
                }
            }
        }
    }
});

test('steady-state sequences give a signal that is not negative', () => {
    for (const id of ['SR', 'SPGR', 'FISP', 'PSIF', 'DESS', 'bSSFP']) {
        for (const tissue of TISSUES) {
            for (const TR of [5, 20, 100, 500, 3000]) {
                for (const Theta of [1, 30, 90, 150, 180]) {
                    const s = sequences[id].calc({ TR, TE: 2, Theta }, tissue);
                    assert.ok(s >= -1e-12, `${id} TR=${TR} Theta=${Theta}: ${s}`);
                }
            }
        }
    }
});

test('SR and SE: long TR and TE = 0 give Rho', () => {
    close(sequences.SR.calc({ TR: 1e6, TE: 0 }, WM), WM.Rho);
    close(sequences.SE.calc({ TR: 1e6, TE: 0 }, WM), WM.Rho);
});

test('SR: TR = 0 gives no signal', () => {
    close(sequences.SR.calc({ TR: 0, TE: 10 }, WM), 0);
});

test('SE agrees with SR when TE is much shorter than TR', () => {
    const p = { TR: 2000, TE: 0.001 };
    close(sequences.SE.calc(p, GM), sequences.SR.calc(p, GM), 1e-6);
});

test('SPGR at 90 degrees is the SR equation with T2* decay', () => {
    const p = { TR: 500, TE: 20, Theta: 90 };
    const expected = sequences.SR.calc(p, { ...WM, T2: WM.T2s });
    close(sequences.SPGR.calc(p, WM), expected, 1e-12);
});

test('SPGR has its maximum at the Ernst angle', () => {
    const TR = 20;
    const ernst = Math.acos(Math.exp(-TR / WM.T1)) * 180 / Math.PI;
    const at = (Theta) => sequences.SPGR.calc({ TR, TE: 0, Theta }, WM);
    assert.ok(at(ernst) > at(ernst - 0.5));
    assert.ok(at(ernst) > at(ernst + 0.5));
});

test('FSE with one echo is the SE equation', () => {
    const p = { TR: 500, TE: 80, ETL: 1, ESP: 10 };
    close(sequences.FSE.calc(p, WM), sequences.SE.calc(p, WM), 1e-12);
});

test('FSE.valid: the echo train must fit between 0 and TR', () => {
    const { valid } = sequences.FSE;
    assert.equal(valid({ TR: 500, TE: 80, ETL: 8, ESP: 10 }), true);
    assert.equal(valid({ TR: 500, TE: 20, ETL: 8, ESP: 10 }), false, 'first echo before 0');
    assert.equal(valid({ TR: 100, TE: 80, ETL: 8, ESP: 10 }), false, 'last echo after TR');
    assert.equal(valid({ TR: 500, ...sequences.FSE.defaults, ETL: 8, ESP: 10 }), true, 'defaults');
});

test('FISP becomes SPGR when T2 -> 0', () => {
    for (const [TR, Theta] of [[500, 90], [10, 30], [20, 60], [100, 150]]) {
        const p = { TR, TE: 5, Theta };
        const fisp = sequences.FISP.calc(p, { ...WM, T2: 1e-6 });
        close(fisp, sequences.SPGR.calc(p, WM), 1e-9, `TR=${TR} Theta=${Theta}`);
    }
});

test('FISP becomes SPGR when TR is much longer than T2', () => {
    const p = { TR: 5000, TE: 5, Theta: 40 };
    close(sequences.FISP.calc(p, WM), sequences.SPGR.calc(p, WM), 1e-9);
});

test('PSIF gives no signal when T2 -> 0', () => {
    close(sequences.PSIF.calc({ TR: 20, TE: 0, Theta: 40 }, { ...WM, T2: 1e-6 }), 0, 1e-9);
});

test('FISP is larger than PSIF', () => {
    for (const TR of [5, 20, 100]) {
        for (const Theta of [10, 40, 90]) {
            const p = { TR, TE: 0, Theta };
            assert.ok(sequences.FISP.calc(p, WM) > sequences.PSIF.calc(p, WM), `TR=${TR} Theta=${Theta}`);
        }
    }
});

test('DESS is the root sum of squares of FISP and PSIF', () => {
    const p = { TR: 20, TE: 5, Theta: 40 };
    const expected = Math.hypot(sequences.FISP.calc(p, GM), sequences.PSIF.calc(p, GM));
    close(sequences.DESS.calc(p, GM), expected, 1e-12);
});

test('bSSFP with TR much shorter than T1 and T2 agrees with the known limit', () => {
    // S = Rho * sin(a) / (1 + cos(a) + (1 - cos(a)) * T1/T2)
    for (const Theta of [20, 60, 90]) {
        const a = Theta * Math.PI / 180;
        const expected = WM.Rho * Math.sin(a) / (1 + Math.cos(a) + (1 - Math.cos(a)) * WM.T1 / WM.T2);
        close(sequences.bSSFP.calc({ TR: 0.001, TE: 0, Theta }, WM), expected, 1e-5, `Theta=${Theta}`);
    }
});

test('IR.valid: TI must not be longer than TR', () => {
    assert.equal(sequences.IR.valid({ TR: 500, TE: 20, TI: 150 }), true);
    assert.equal(sequences.IR.valid({ TR: 100, TE: 20, TI: 150 }), false);
});

test('IR: long TR and TI = 0 give -Rho', () => {
    close(sequences.IR.calc({ TR: 1e6, TE: 0, TI: 0 }, WM), -WM.Rho);
});

test('IR: long TR and long TI give Rho', () => {
    close(sequences.IR.calc({ TR: 1e7, TE: 0, TI: 1e5 }, WM), WM.Rho);
});

test('IR.nullTI gives a TI with no signal', () => {
    for (const tissue of TISSUES) {
        for (const TR of [2000, 5000, 10000]) {
            const p = { TR, TE: 20 };
            const TI = sequences.IR.nullTI(p, tissue);
            assert.ok(TI > 0);
            close(sequences.IR.calc({ ...p, TI }, tissue), 0, 1e-12, `TR=${TR}`);
        }
    }
});

test('IR.nullTI is T1 * ln(2) when TR is long', () => {
    close(sequences.IR.nullTI({ TR: 1e7, TE: 20 }, WM), WM.T1 * Math.LN2, 1e-9);
});

test('IR.nullTI gives null when there is no null point', () => {
    // This only occurs when TR is not longer than TE
    assert.equal(sequences.IR.nullTI({ TR: 10, TE: 20 }, CSF), null);
});
