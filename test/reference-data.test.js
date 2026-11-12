/**
 * Tests for the literature reference values. Run with: node --test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { referenceData } = require('../reference-data.js');

const SPECIES = ['human', 'mouse', 'rat'];
const CONDITIONS = ['in vivo', 'ex vivo'];
const where = (r) => `${r.species} ${r.condition} ${r.field_T}T ${r.tissue} (${r.citation})`;

test('there are reference records', () => {
    assert.ok(referenceData.length > 0);
});

test('each record has a species, a condition and a field in the 1.5 T to 18 T range', () => {
    for (const r of referenceData) {
        assert.ok(SPECIES.includes(r.species), where(r));
        assert.ok(CONDITIONS.includes(r.condition), where(r));
        assert.ok(typeof r.field_T === 'number' && r.field_T >= 1.5 && r.field_T <= 18, where(r));
        assert.ok(typeof r.tissue === 'string' && r.tissue.length > 0, where(r));
        assert.equal(typeof r.gd_doped, 'boolean', where(r));
        assert.equal(typeof r.converted_from_rate, 'boolean', where(r));
        assert.equal(typeof r.checked, 'boolean', where(r));
    }
});

test('each record has a reference: a citation with a PMID or a DOI', () => {
    for (const r of referenceData) {
        assert.ok(typeof r.citation === 'string' && r.citation.length > 0, where(r));
        assert.ok(r.pmid || r.doi, where(r));
        if (r.pmid) assert.match(r.pmid, /^\d+$/, where(r));
        if (r.doi) assert.match(r.doi, /^10\.\d{4,}\//, where(r));
    }
});

test('each record gives one or more values, and all values are positive', () => {
    for (const r of referenceData) {
        const values = [r.T1_ms, r.T2_ms, r.T2s_ms, r.PD].filter(v => v !== null);
        assert.ok(values.length > 0, where(r));
        for (const key of ['T1_ms', 'T2_ms', 'T2s_ms', 'PD']) {
            const v = r[key];
            assert.ok(v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0), `${key} ${where(r)}`);
        }
        for (const key of ['T1_sd', 'T2_sd', 'T2s_sd']) {
            const v = r[key];
            assert.ok(v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0), `${key} ${where(r)}`);
        }
    }
});

test('relaxation values are in a physical order and range', () => {
    for (const r of referenceData) {
        // A contrast agent in the sample makes T1 much shorter
        const minT1 = r.gd_doped ? 10 : 50;
        if (r.T1_ms !== null) assert.ok(r.T1_ms >= minT1 && r.T1_ms <= 6000, `T1 ${where(r)}`);
        if (r.T2_ms !== null) assert.ok(r.T2_ms >= 3 && r.T2_ms <= 3000, `T2 ${where(r)}`);
        if (r.T2s_ms !== null) assert.ok(r.T2s_ms >= 1 && r.T2s_ms <= 2000, `T2* ${where(r)}`);
        if (r.PD !== null) assert.ok(r.PD <= 1.05, `PD ${where(r)}`);
        if (r.T1_ms !== null && r.T2_ms !== null) assert.ok(r.T2_ms <= r.T1_ms, `T2 <= T1 ${where(r)}`);
        if (r.T2_ms !== null && r.T2s_ms !== null) assert.ok(r.T2s_ms <= r.T2_ms, `T2* <= T2 ${where(r)}`);
    }
});

test('each record has the quote that the values came from', () => {
    for (const r of referenceData) {
        assert.ok(typeof r.quote === 'string' && r.quote.length > 0, where(r));
    }
});
