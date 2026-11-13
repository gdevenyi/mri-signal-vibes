/**
 * Tests for the literature reference values. Run with: node --test
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { referenceData, relaxivityData } = require('../reference-data.js');
const { paramDefinitions } = require('../sequences.js');
const {
    REFERENCE_PRESETS, EXTRA_TISSUES, DEFAULT_AGENT_SOURCE, findPresetSource
} = require('../presets.js');

const SPECIES = ['human', 'mouse', 'rat'];
const CONDITIONS = ['in vivo', 'ex vivo'];
const CATEGORIES = ['brain', 'lesion', 'body', 'blood'];
const where = (r) => `${r.species} ${r.condition} ${r.field_T}T ${r.tissue} (${r.citation})`;

test('there are reference records', () => {
    assert.ok(referenceData.length > 0);
});

test('each record has a species, a condition, a category and a field in the 1.5 T to 18 T range', () => {
    for (const r of referenceData) {
        assert.ok(SPECIES.includes(r.species), where(r));
        assert.ok(CONDITIONS.includes(r.condition), where(r));
        assert.ok(CATEGORIES.includes(r.category), where(r));
        // Some ADC sources do not give the field strength in the text that was read
        if (r.field_T === null) assert.ok(r.ADC !== null, where(r));
        else assert.ok(typeof r.field_T === 'number' && r.field_T >= 1.4 && r.field_T <= 18, where(r));
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
        const values = [r.T1_ms, r.T2_ms, r.T2s_ms, r.PD, r.ADC].filter(v => v !== null);
        assert.ok(values.length > 0, where(r));
        for (const key of ['T1_ms', 'T2_ms', 'T2s_ms', 'PD', 'ADC']) {
            const v = r[key];
            assert.ok(v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0), `${key} ${where(r)}`);
        }
        for (const key of ['T1_sd', 'T2_sd', 'T2s_sd', 'ADC_sd']) {
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
        // ADC in 1e-3 mm^2/s: free water at 37 degrees C is near 3
        if (r.ADC !== null) assert.ok(r.ADC >= 0.005 && r.ADC <= 3.5, `ADC ${where(r)}`);
        if (r.T1_ms !== null && r.T2_ms !== null) assert.ok(r.T2_ms <= r.T1_ms, `T2 <= T1 ${where(r)}`);
        if (r.T2_ms !== null && r.T2s_ms !== null) assert.ok(r.T2s_ms <= r.T2_ms, `T2* <= T2 ${where(r)}`);
    }
});

test('each record has the quote that the values came from', () => {
    for (const r of referenceData) {
        assert.ok(typeof r.quote === 'string' && r.quote.length > 0, where(r));
    }
});

test('the ADC of CSF is larger than the ADC of normal brain tissue in the same source', () => {
    const csf = (r) => /csf|cerebrospinal/i.test(r.tissue);
    for (const r of referenceData.filter(x => x.ADC !== null && csf(x))) {
        const others = referenceData.filter(x => x.ADC !== null && x.pmid === r.pmid && !csf(x) && x.category === 'brain');
        for (const o of others) assert.ok(r.ADC > o.ADC, `${where(r)} against ${o.tissue}`);
    }
});

// --- Contrast agent relaxivities ---

const whereRel = (r) => `${r.agent} ${r.field_T}T ${r.medium} (${r.citation})`;

test('each relaxivity record has an agent, a field, a medium, a value and a reference', () => {
    assert.ok(relaxivityData.length > 0);
    for (const r of relaxivityData) {
        assert.ok(typeof r.agent === 'string' && r.agent.length > 0, whereRel(r));
        assert.ok(typeof r.medium === 'string' && r.medium.length > 0, whereRel(r));
        assert.ok(typeof r.field_T === 'number' && r.field_T >= 1.4 && r.field_T <= 18, whereRel(r));
        assert.ok(r.r1 !== null || r.r2 !== null || r.r2s !== null, whereRel(r));
        for (const key of ['r1', 'r2', 'r2s']) {
            const v = r[key];
            // r2* in whole blood can be some hundreds per mM per second
            const limit = key === 'r2s' ? 1000 : 200;
            assert.ok(v === null || (typeof v === 'number' && v > 0 && v < limit), `${key} ${whereRel(r)}`);
        }
        assert.equal(typeof r.secondary, 'boolean', whereRel(r));
        assert.ok(r.warning === null || (typeof r.warning === 'string' && r.warning.length > 0), whereRel(r));
        assert.equal(typeof r.checked, 'boolean', whereRel(r));
        assert.ok(typeof r.quote === 'string' && r.quote.length > 0, whereRel(r));
        assert.ok(typeof r.citation === 'string' && r.citation.length > 0, whereRel(r));
        assert.ok(r.pmid || r.doi, whereRel(r));
    }
});

test('r2 is not smaller than r1 in each relaxivity record', () => {
    for (const r of relaxivityData) {
        if (r.r1 !== null && r.r2 !== null) assert.ok(r.r2 >= r.r1, whereRel(r));
    }
});

test('the default relaxivities are those of one relaxivity record', () => {
    const s = DEFAULT_AGENT_SOURCE;
    const rows = relaxivityData.filter(r =>
        r.agent === s.agent && r.field_T === s.field_T && r.medium === s.medium && r.pmid === s.pmid);
    assert.equal(rows.length, 1);
    assert.equal(paramDefinitions.r1.default, rows[0].r1);
    assert.equal(paramDefinitions.r2.default, rows[0].r2);
});

// --- Presets ---

const allPresets = [
    ...Object.entries(REFERENCE_PRESETS).flatMap(([field, list]) => list.map(p => ({ field: parseFloat(field), p }))),
    ...EXTRA_TISSUES.map(p => ({ field: 3, p }))
];

test('each preset value with a source is the value of that literature row', () => {
    for (const { field, p } of allPresets) {
        for (const key of Object.keys(p.src)) {
            const row = findPresetSource(p, key, referenceData);
            assert.notEqual(row, null, `${field}T ${p.name} ${key}`);
            assert.equal(row.species, 'human', `${field}T ${p.name} ${key}`);
            assert.equal(row.gd_doped, false, `${field}T ${p.name} ${key}`);
            // Relaxation times and PD depend on the field: the row must be for the field of the preset
            if (key !== 'ADC') {
                assert.equal(row.field_T, field, `${field}T ${p.name} ${key}`);
                assert.equal(row.condition, 'in vivo', `${field}T ${p.name} ${key}`);
            }
        }
    }
});

test('each preset has all parameters in the slider range and in a physical order', () => {
    for (const { field, p } of allPresets) {
        const where = `${field}T ${p.name}`;
        assert.deepEqual(Object.keys(p.params).sort(), ['ADC', 'Rho', 'T1', 'T2', 'T2s'], where);
        for (const key of Object.keys(p.src)) assert.ok(key in p.params, `${where} ${key}`);
        assert.ok(p.params.T2s <= p.params.T2 && p.params.T2 <= p.params.T1, where);
        assert.ok(p.params.Rho > 0 && p.params.Rho <= 1, where);
        assert.ok(p.params.ADC >= paramDefinitions.ADC.min && p.params.ADC <= paramDefinitions.ADC.max, where);
    }
});

test('the times that come from rates have no converted error', () => {
    // Spees 2001 (blood in vitro): the error of the rate is not an error of the time
    for (const r of referenceData.filter(x => x.pmid === '11283978')) {
        assert.equal(r.T1_sd, null, where(r));
    }
});

test('the relaxivity rows of a paper with an unread erratum have a warning', () => {
    const rows = relaxivityData.filter(r => r.pmid === '16481903');
    assert.ok(rows.length > 0);
    for (const r of rows) assert.match(r.warning, /erratum/, whereRel(r));
});
