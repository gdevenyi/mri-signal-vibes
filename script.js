/**
 * MRI Signal Intensity Simulator: user interface
 *
 * The parameters and signal equations (`paramDefinitions`, `sequences`) are
 * in sequences.js. The calculations of the interface (contrast agent,
 * contrast analysis, CSV, state in the URL) are in logic.js.
 */

// --- Configuration & Constants ---

const tissueColors = ['#bb86fc', '#03dac6', '#cf6679', '#ffb74d', '#64b5f6'];
const MAX_TISSUES = 5;

// Tissue parameters that each tissue card shows. ADC and the contrast agent
// concentration are added only when they have an effect.
const BASE_TISSUE_KEYS = ['Rho', 'T1', 'T2', 'T2s'];

// Rounded, approximate values (see the Reference Values page)
const REFERENCE_PRESETS = {
    '1.5T': [
        { name: 'White Matter', params: { T1: 700, T2: 80, T2s: 60, Rho: 0.73, ADC: 0.7 }, color: '#cf6679' },
        { name: 'Gray Matter', params: { T1: 1000, T2: 100, T2s: 70, Rho: 0.83, ADC: 0.8 }, color: '#bb86fc' },
        { name: 'CSF', params: { T1: 4000, T2: 2000, T2s: 1000, Rho: 1.0, ADC: 3.0 }, color: '#03dac6' }
    ],
    '3.0T': [
        { name: 'White Matter', params: { T1: 950, T2: 95, T2s: 50, Rho: 0.73, ADC: 0.7 }, color: '#cf6679' },
        { name: 'Gray Matter', params: { T1: 1450, T2: 95, T2s: 50, Rho: 0.83, ADC: 0.8 }, color: '#bb86fc' },
        { name: 'CSF', params: { T1: 4000, T2: 2000, T2s: 300, Rho: 1.0, ADC: 3.0 }, color: '#03dac6' }
    ],
    '7.0T': [
        { name: 'White Matter', params: { T1: 1300, T2: 60, T2s: 28, Rho: 0.73, ADC: 0.7 }, color: '#cf6679' },
        { name: 'Gray Matter', params: { T1: 2000, T2: 53, T2s: 30, Rho: 0.83, ADC: 0.8 }, color: '#bb86fc' },
        { name: 'CSF', params: { T1: 4500, T2: 1500, T2s: 100, Rho: 1.0, ADC: 3.0 }, color: '#03dac6' }
    ]
};

// More tissues for the "Add preset tissue" list. These are rounded,
// illustrative values for approximately 1.5 T. They are not from one source.
const EXTRA_TISSUES = [
    { name: 'Fat', params: { T1: 300, T2: 80, T2s: 40, Rho: 0.9, ADC: 0.1 } },
    { name: 'Muscle', params: { T1: 1000, T2: 45, T2s: 30, Rho: 0.75, ADC: 1.5 } },
    { name: 'Blood (arterial)', params: { T1: 1400, T2: 250, T2s: 150, Rho: 0.85, ADC: 2.0 } },
    { name: 'Lesion (oedema)', params: { T1: 1500, T2: 200, T2s: 100, Rho: 0.9, ADC: 1.4 } }
];

// --- State ---
let currentSeqId = 'SE';
let currentMode = 'sim'; // 'sim' or 'ref'
let currentSeqParams = {};
let tissues = [];
let nextTissueId = 1;
let xAxisParam = 'TR'; // Default X-Axis
let yAxisAuto = true;
let magnitudeMode = false; // Show |S| for sequences with a signed signal
// Contrast agent: each tissue has a concentration C, the relaxivities are global
let agent = { on: false, r1: paramDefinitions.r1.default, r2: paramDefinitions.r2.default };
let chartInstance = null;
let lastPlot = null;       // { xLabel, series } of the plot, for the CSV export
let urlReady = false;      // false during start-up: do not write the URL then
let urlTimer = null;
let lastWrittenHash = '';

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// All tissue parameters, with the default for each one that `params` does not give
function completeTissueParams(params) {
    const full = {};
    Object.keys(paramDefinitions).forEach(key => {
        if (paramDefinitions[key].type === 'tissue') {
            full[key] = params[key] !== undefined ? params[key] : paramDefinitions[key].default;
        }
    });
    return full;
}

function freeColor() {
    const usedColors = tissues.map(t => t.color);
    return tissueColors.find(c => !usedColors.includes(c)) || tissueColors[tissues.length % tissueColors.length];
}

function setTissues(list) {
    tissues = list.map((t, i) => ({
        id: i + 1,
        name: t.name,
        color: t.color,
        params: completeTissueParams(t.params)
    }));
    nextTissueId = tissues.length + 1;
}

setTissues(REFERENCE_PRESETS['1.5T']);

// --- Initialization ---
function init() {
    // Setup Nav
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (e.target.dataset.mode === 'ref') {
                setReferenceMode();
            } else {
                setSequence(e.target.dataset.seq);
            }
        });
    });

    // Add Tissue Button and the list of preset tissues
    document.getElementById('add-tissue-btn').addEventListener('click', () => addTissue());
    const presetSelect = document.getElementById('add-preset-select');
    EXTRA_TISSUES.forEach((t, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = t.name;
        presetSelect.appendChild(opt);
    });
    presetSelect.addEventListener('change', (e) => {
        const preset = EXTRA_TISSUES[Number(e.target.value)];
        if (preset) addTissue(preset);
        e.target.value = '';
    });

    // Setup Plot Control
    const xSelect = document.getElementById('x-axis-select');
    xSelect.addEventListener('change', (e) => {
        xAxisParam = e.target.value;
        updateUI();
    });

    // Y Axis Controls
    const yAutoChk = document.getElementById('y-auto-chk');
    const yManualContainer = document.getElementById('y-manual-container');
    const yMinInput = document.getElementById('y-min-input');
    const yMaxInput = document.getElementById('y-max-input');

    yAutoChk.addEventListener('change', (e) => {
        yAxisAuto = e.target.checked;
        yManualContainer.style.display = yAxisAuto ? 'none' : 'flex';
        updateUI();
    });

    // Magnitude option (only shown for sequences with a signed signal)
    document.getElementById('magnitude-chk').addEventListener('change', (e) => {
        magnitudeMode = e.target.checked;
        updateUI();
    });

    // Contrast agent option
    document.getElementById('agent-chk').addEventListener('change', (e) => {
        agent.on = e.target.checked;
        buildControls();
    });

    [yMinInput, yMaxInput].forEach(inp => {
        inp.addEventListener('change', () => {
            if (!yAxisAuto) updateUI();
        });
    });

    // Export and link
    document.getElementById('export-csv-btn').addEventListener('click', exportCsv);
    document.getElementById('export-png-btn').addEventListener('click', exportPng);
    document.getElementById('copy-link-btn').addEventListener('click', copyLink);

    initReferenceTable();

    // A link can contain the full state of the simulator
    const linked = readUrlState();
    if (linked) {
        applyState(linked);
    } else {
        setSequence('SE');
    }
    updateView();

    window.addEventListener('hashchange', () => {
        // Ignore the changes that this page made
        if (window.location.hash === lastWrittenHash) return;
        const state = readUrlState();
        if (state) {
            applyState(state);
            updateView();
        }
    });
    urlReady = true;
}

// --- Literature reference table (data in reference-data.js) ---

function initReferenceTable() {
    const fill = (id, values, label) => {
        const sel = document.getElementById(id);
        sel.innerHTML = '';
        [['', 'All'], ...values.map(v => [String(v), label(v)])].forEach(([value, text]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            sel.appendChild(opt);
        });
        sel.addEventListener('change', renderReferenceTable);
    };
    const unique = (key) => [...new Set(referenceData.map(r => r[key]))];
    const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

    fill('lit-species', unique('species').sort(), capitalize);
    fill('lit-condition', unique('condition').sort().reverse(), capitalize);
    fill('lit-field', unique('field_T').sort((a, b) => a - b), (f) => `${f} T`);
    document.getElementById('lit-tissue').addEventListener('input', renderReferenceTable);

    renderReferenceTable();
}

function formatRefValue(value, sd) {
    if (value === null || value === undefined) return '—';
    return (sd === null || sd === undefined) ? `${value}` : `${value} ± ${sd}`;
}

function renderReferenceTable() {
    const species = document.getElementById('lit-species').value;
    const condition = document.getElementById('lit-condition').value;
    const field = document.getElementById('lit-field').value;
    const tissueText = document.getElementById('lit-tissue').value.trim().toLowerCase();

    const rows = referenceData.filter(r =>
        (!species || r.species === species) &&
        (!condition || r.condition === condition) &&
        (!field || String(r.field_T) === field) &&
        (!tissueText || `${r.tissue} ${r.region_detail || ''}`.toLowerCase().includes(tissueText))
    ).sort((a, b) =>
        a.species.localeCompare(b.species) ||
        b.condition.localeCompare(a.condition) ||
        a.field_T - b.field_T ||
        a.tissue.localeCompare(b.tissue) ||
        a.citation.localeCompare(b.citation)
    );

    document.getElementById('lit-count').textContent = `${rows.length} of ${referenceData.length} rows`;

    // All text goes in with textContent, so no escape is necessary
    const cell = (tr, text, className) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (className) td.className = className;
        tr.appendChild(td);
        return td;
    };

    const tbody = document.getElementById('lit-tbody');
    tbody.innerHTML = '';
    if (rows.length === 0) {
        const tr = document.createElement('tr');
        const td = cell(tr, 'No rows for these filters. An empty result can be correct: for some species, conditions and field strengths, no published value was found.', 'lit-small');
        td.colSpan = 11;
        tbody.appendChild(tr);
    }
    rows.forEach(r => {
        const tr = document.createElement('tr');
        cell(tr, r.species.charAt(0).toUpperCase() + r.species.slice(1));
        cell(tr, r.condition);
        cell(tr, `${r.field_T} T`, 'lit-nowrap');

        const tissueTd = cell(tr, r.tissue);
        if (r.region_detail) {
            const detail = document.createElement('div');
            detail.className = 'lit-small';
            detail.textContent = r.region_detail;
            tissueTd.appendChild(detail);
        }

        cell(tr, formatRefValue(r.T1_ms, r.T1_sd), 'lit-nowrap');
        cell(tr, formatRefValue(r.T2_ms, r.T2_sd), 'lit-nowrap');
        cell(tr, formatRefValue(r.T2s_ms, r.T2s_sd), 'lit-nowrap');
        cell(tr, formatRefValue(r.PD, null), 'lit-nowrap');

        const detailsTd = cell(tr, '', 'lit-small lit-details');
        if (r.gd_doped) {
            const badge = document.createElement('span');
            badge.className = 'lit-badge';
            badge.textContent = 'Contrast agent';
            badge.title = 'A contrast agent was in the sample. It shortens the relaxation times.';
            detailsTd.appendChild(badge);
        }
        if (!r.checked) {
            const badge = document.createElement('span');
            badge.className = 'lit-badge lit-badge-muted';
            badge.textContent = 'Read once';
            badge.title = 'The values were read one time in the full text. It was not possible to find them again in a second copy of the source.';
            detailsTd.appendChild(badge);
        }
        if (r.converted_from_rate) {
            const badge = document.createElement('span');
            badge.className = 'lit-badge lit-badge-muted';
            badge.textContent = 'From rate';
            badge.title = 'The source gives a relaxation rate (R1, R2 or R2*). The time is 1/rate.';
            detailsTd.appendChild(badge);
        }
        [r.subjects, r.method, r.temperature, r.fixation].filter(Boolean).forEach(text => {
            const line = document.createElement('div');
            line.textContent = text;
            detailsTd.appendChild(line);
        });
        // Notes and the source quote are long, so they are in a collapsed block
        const more = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Notes and source quote';
        more.appendChild(summary);
        if (r.notes) {
            const note = document.createElement('div');
            note.textContent = r.notes;
            more.appendChild(note);
        }
        const quote = document.createElement('blockquote');
        quote.textContent = `${r.quote} (${r.read_from})`;
        more.appendChild(quote);
        detailsTd.appendChild(more);

        const refTd = cell(tr, '', 'lit-small');
        const url = r.doi ? `https://doi.org/${r.doi}` : (r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : null);
        if (url) {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent = r.citation;
            refTd.appendChild(link);
        } else {
            refTd.textContent = r.citation;
        }

        const actionTd = cell(tr, '');
        const btn = document.createElement('button');
        btn.className = 'preset-load-btn';
        btn.textContent = 'Add to Sim';
        const missing = referenceMissingParams(r);
        btn.title = missing.length
            ? `Add this tissue to the simulator. The source does not give ${missing.join(', ')}: the simulator uses a default value.`
            : 'Add this tissue to the simulator';
        btn.addEventListener('click', () => {
            const added = addReferenceTissue(r);
            btn.textContent = added ? 'Added' : `Sim is full (${MAX_TISSUES})`;
            setTimeout(() => { btn.textContent = 'Add to Sim'; }, 1500);
        });
        actionTd.appendChild(btn);

        tbody.appendChild(tr);
    });
}

// Names of the simulator parameters that a reference row does not give
function referenceMissingParams(r) {
    const missing = [];
    if (r.T1_ms === null) missing.push('T1');
    if (r.T2_ms === null) missing.push('T2');
    if (r.T2s_ms === null) missing.push('T2*');
    if (r.PD === null) missing.push('PD');
    return missing;
}

// Add one reference row to the simulator as a tissue. Returns false if the
// simulator is full.
function addReferenceTissue(r) {
    if (tissues.length >= MAX_TISSUES) return false;

    const params = completeTissueParams({
        T1: r.T1_ms !== null ? r.T1_ms : undefined,
        T2: r.T2_ms !== null ? r.T2_ms : undefined,
        T2s: r.T2s_ms !== null ? r.T2s_ms : undefined,
        Rho: (r.PD !== null && r.PD > 0 && r.PD <= 1) ? r.PD : undefined
    });
    // A default T2* must not be longer than a T2 from the source
    limitT2s(params);

    const missing = referenceMissingParams(r);
    tissues.push({
        id: nextTissueId++,
        name: `${r.tissue}, ${r.species} ${r.condition} ${r.field_T}T` + (missing.length ? ` (default ${missing.join(', ')})` : ''),
        params: params,
        color: freeColor()
    });
    buildControls();
    return true;
}

// --- Core Logic ---

// seqParams and xParam are optional: they come from a link
function setSequence(seqId, seqParams, xParam) {
    currentSeqId = seqId;
    currentMode = 'sim';

    // Update Nav UI
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.seq === seqId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const seq = sequences[seqId];
    document.getElementById('current-sequence-title').textContent = seq.name;
    document.getElementById('equation-display').textContent = seq.equationStr;
    document.getElementById('notes-display').textContent = seq.notes || '';

    // Display citation and URL
    const citationDisplay = document.getElementById('citation-display');
    citationDisplay.textContent = seq.citation || '';
    if (seq.url) {
        citationDisplay.appendChild(document.createElement('br'));
        const link = document.createElement('a');
        link.href = seq.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.className = 'source-link';
        link.textContent = '[View Source]';
        citationDisplay.appendChild(link);
    }

    // Magnitude option
    document.getElementById('magnitude-container').style.display = seq.signed ? 'flex' : 'none';

    // Initialize Seq Params
    currentSeqParams = {};
    seq.params.forEach(pKey => {
        if (paramDefinitions[pKey].type === 'seq') {
            const seqDefault = seq.defaults ? seq.defaults[pKey] : undefined;
            currentSeqParams[pKey] = seqDefault !== undefined ? seqDefault : paramDefinitions[pKey].default;
            if (seqParams && seqParams[pKey] !== undefined) currentSeqParams[pKey] = seqParams[pKey];
        }
    });

    // Trigger MathJax typeset
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([document.getElementById('equation-display')]).catch((err) => console.log('MathJax error:', err));
    }

    // X-axis: from the link, or the default of the sequence, or the current
    // one if this sequence has it
    const isSeqParam = (k) => seq.params.includes(k) && paramDefinitions[k].type === 'seq';
    if (xParam && isSeqParam(xParam)) {
        xAxisParam = xParam;
    } else if (seq.defaultX) {
        xAxisParam = seq.defaultX;
    } else if (!isSeqParam(xAxisParam)) {
        if (seq.params.includes('TR')) xAxisParam = 'TR';
        else xAxisParam = seq.params.find(k => paramDefinitions[k].type === 'seq') || 'TR';
    }

    buildControls();
    updateView();
}

// Expose to global scope for HTML buttons
window.loadPreset = function (strength) {
    if (!REFERENCE_PRESETS[strength]) return;

    setTissues(REFERENCE_PRESETS[strength]);

    // Switch back to simulator
    currentMode = 'sim';
    updateView();
    buildControls();
};

function setReferenceMode() {
    currentMode = 'ref';
    updateView();
}

function updateView() {
    const simView = document.getElementById('simulator-view');
    const refView = document.getElementById('reference-view');
    const eqPanel = document.getElementById('equation-display').parentElement; // Equation panel
    const plotControls = document.querySelector('.plot-controls'); // Controls in header

    // Update Nav Active State
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (currentMode === 'sim' && btn.dataset.seq === currentSeqId) btn.classList.add('active');
        if (currentMode === 'ref' && btn.dataset.mode === 'ref') btn.classList.add('active');
    });

    if (currentMode === 'ref') {
        simView.style.display = 'none';
        refView.style.display = 'block';
        eqPanel.style.display = 'none'; // Hide equation in ref mode
        plotControls.style.display = 'none'; // Hide plot controls
        document.getElementById('current-sequence-title').textContent = 'Reference Values';
    } else {
        simView.style.display = 'grid'; // grid for content-grid
        refView.style.display = 'none';
        eqPanel.style.display = 'block';
        plotControls.style.display = 'flex'; // Show plot controls
        document.getElementById('current-sequence-title').textContent = sequences[currentSeqId].name;
    }
}

// Set the scanner settings from a result of nullParams or nullPair
function applyNullResult(result) {
    Object.keys(result).forEach(key => {
        currentSeqParams[key] = Math.round(result[key]);
    });
    buildControls();
}

// Show a text on a button for a short time
function flashButton(btn, text) {
    const original = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = original; }, 1500);
}

function buildControls() {
    const seq = sequences[currentSeqId];
    const seqContainer = document.getElementById('seq-params-container');
    const tissueContainer = document.getElementById('tissues-container');
    const xSelect = document.getElementById('x-axis-select');

    seqContainer.innerHTML = '';
    tissueContainer.innerHTML = '';
    xSelect.innerHTML = '';

    // --- X-Axis Select ---
    // Allow ONLY sequence params
    seq.params.forEach(pKey => {
        if (paramDefinitions[pKey].type === 'seq') {
            const opt = document.createElement('option');
            opt.value = pKey;
            opt.textContent = paramDefinitions[pKey].label;
            if (pKey === xAxisParam) opt.selected = true;
            xSelect.appendChild(opt);
        }
    });

    // --- Sequence Sliders ---
    seq.params.forEach(pKey => {
        if (paramDefinitions[pKey].type === 'seq') {
            createSlider(seqContainer, pKey, currentSeqParams[pKey], (val) => {
                currentSeqParams[pKey] = val;
                updateChart();
            }, false);
        }
    });

    // --- Contrast agent: relaxivities ---
    if (agent.on) {
        ['r1', 'r2'].forEach(pKey => {
            createSlider(seqContainer, pKey, agent[pKey], (val) => {
                agent[pKey] = val;
                updateChart();
            }, false);
        });
    }

    // --- Null two tissues together (DIR) ---
    if (seq.nullPair && tissues.length >= 2) {
        const pairBtn = document.createElement('button');
        pairBtn.className = 'tool-btn';
        pairBtn.textContent = 'Null tissues 1 + 2';
        pairBtn.title = 'Set the inversion times so that the first two tissues give no signal';
        pairBtn.addEventListener('click', () => {
            const result = seq.nullPair(currentSeqParams, effectiveParams(tissues[0]), effectiveParams(tissues[1]));
            if (result === null) {
                flashButton(pairBtn, 'No solution');
                return;
            }
            applyNullResult(result);
        });
        seqContainer.appendChild(pairBtn);
    }

    // --- Tissue Cards ---
    const tissueKeys = [...BASE_TISSUE_KEYS];
    if (seq.params.includes('ADC')) tissueKeys.push('ADC');
    if (agent.on) tissueKeys.push('C');

    tissues.forEach((tissue) => {
        const card = document.createElement('div');
        card.className = 'tissue-card';
        card.style.borderColor = tissue.color;

        const header = document.createElement('div');
        header.className = 'tissue-header';

        const nameInput = document.createElement('input');
        nameInput.className = 'tissue-name-input';
        nameInput.value = tissue.name;
        nameInput.maxLength = MAX_NAME_LENGTH;
        nameInput.style.color = tissue.color;
        nameInput.addEventListener('change', (e) => {
            tissue.name = e.target.value;
            updateChart();
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'tissue-remove-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.title = 'Remove Tissue';
        removeBtn.addEventListener('click', () => removeTissue(tissue.id));

        header.appendChild(nameInput);

        // Null button: set the inversion time to the null point of this tissue
        if (seq.nullParams) {
            const nullBtn = document.createElement('button');
            nullBtn.className = 'tissue-null-btn';
            nullBtn.textContent = 'Null';
            nullBtn.title = 'Set the inversion time to the null point of this tissue';
            nullBtn.addEventListener('click', () => {
                const result = seq.nullParams(currentSeqParams, effectiveParams(tissue));
                if (result === null) {
                    // No null point with these settings
                    flashButton(nullBtn, 'No null');
                    return;
                }
                applyNullResult(result);
            });
            header.appendChild(nullBtn);
        }
        if (tissues.length > 1) { // Don't allow removing the last tissue
            header.appendChild(removeBtn);
        }

        card.appendChild(header);

        const idPrefix = `tissue${tissue.id}-`;
        tissueKeys.forEach(pKey => {
            createSlider(card, pKey, tissue.params[pKey], (val) => {
                tissue.params[pKey] = val;
                let corrected;
                // T2* cannot be longer than T2
                if ((pKey === 'T2' || pKey === 'T2s') && limitT2s(tissue.params)) {
                    if (pKey === 'T2s') corrected = tissue.params.T2s;
                    else syncSlider(idPrefix, 'T2s', tissue.params.T2s);
                }
                updateChart();
                return corrected;
            }, true, idPrefix); // compact mode
        });

        tissueContainer.appendChild(card);
    });

    updateUI();
}

// Show a value that the program changed on a slider and its number input
function syncSlider(idPrefix, pKey, value) {
    const inp = document.getElementById(`${idPrefix}input-${pKey}`);
    const sld = document.getElementById(`${idPrefix}slider-${pKey}`);
    if (inp) {
        inp.value = value;
        inp.dataset.last = value;
    }
    if (sld) sld.value = value;
}

// onChange can return a corrected value. The slider then shows that value.
function createSlider(container, pKey, initVal, onChange, isCompact, idPrefix = '') {
    const def = paramDefinitions[pKey];

    // A preset value can be larger than the slider range (for example CSF T1).
    if (!def.fixedRange && initVal > def.max) {
        def.max = Math.ceil(initVal * 1.5);
    }

    const group = document.createElement('div');
    group.className = isCompact ? 'control-group compact' : 'control-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'control-label-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'param-name';
    nameSpan.innerHTML = `${def.label} <span style="color:var(--primary); opacity:0.8;">(${def.symbol})</span>`;

    const valInput = document.createElement('input');
    valInput.type = 'number';
    valInput.className = 'param-input';
    valInput.id = `${idPrefix}input-${pKey}`;
    valInput.value = initVal;
    // The step grid starts at a multiple of the step (0 for TR, not 1), so that
    // a typed value such as 500 does not move to 501. The handlers apply def.min.
    const gridMin = Math.floor(def.min / def.step) * def.step;
    valInput.min = gridMin;
    valInput.max = def.max;
    valInput.step = def.step;
    // The last good value, for when the text is empty or not a number
    valInput.dataset.last = initVal;

    labelRow.appendChild(nameSpan);
    labelRow.appendChild(valInput);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'slider-input';
    slider.id = `${idPrefix}slider-${pKey}`;
    slider.min = gridMin;
    slider.max = def.max;
    slider.step = def.step;
    slider.value = initVal;

    const commit = (newVal) => {
        valInput.dataset.last = newVal;
        const corrected = onChange(newVal);
        if (corrected !== undefined && corrected !== newVal) {
            valInput.value = corrected;
            slider.value = corrected;
            valInput.dataset.last = corrected;
        }
    };

    // Sync Slider -> Input
    slider.addEventListener('input', (e) => {
        const newVal = Math.max(parseFloat(e.target.value), def.min);
        valInput.value = newVal;

        // Bi-directional scaling of the range (not for fixed ranges)
        if (!def.fixedRange) {
            const currentMax = parseFloat(slider.max);
            let newMax = currentMax;

            // Expand gently if pushing the edge (> 90%)
            if (newVal >= currentMax * 0.90) {
                newMax = Math.ceil(currentMax * 1.1);
            }
            // Shrink gently if pulling away (< 70%) to keep detail,
            // but keep at least ~20% headroom to move right again.
            else if (newVal < currentMax * 0.70) {
                const proposedMax = Math.ceil(currentMax * 0.95);
                if (proposedMax > newVal * 1.2) {
                    newMax = proposedMax;
                }
            }

            if (newMax !== currentMax) {
                slider.max = newMax;
                valInput.max = newMax;
                def.max = newMax;
            }
        }

        commit(newVal);
    });

    // Sync Input -> Slider
    valInput.addEventListener('change', (e) => {
        let newVal = parseFloat(e.target.value);

        // Empty or invalid text: go back to the last good value
        if (!Number.isFinite(newVal)) {
            valInput.value = valInput.dataset.last;
            return;
        }

        // Auto-expand max if input > max (not for fixed ranges)
        if (!def.fixedRange && newVal > parseFloat(slider.max)) {
            const newMax = Math.ceil(newVal * 1.5);
            slider.max = newMax;
            valInput.max = newMax;
            def.max = newMax;
        }

        // Clamp
        if (newVal < def.min) newVal = def.min;
        if (def.fixedRange && newVal > def.max) newVal = def.max;
        if (def.integer) newVal = Math.round(newVal);

        valInput.value = newVal;
        slider.value = newVal;
        commit(newVal);
    });

    group.appendChild(labelRow);
    group.appendChild(slider);
    container.appendChild(group);
}

// Without an argument: a new tissue with default values.
// With a preset ({ name, params }): a copy of that preset.
function addTissue(preset) {
    if (tissues.length >= MAX_TISSUES) return;
    const id = nextTissueId++;
    tissues.push({
        id: id,
        name: preset ? preset.name : `Tissue ${id}`,
        params: completeTissueParams(preset ? preset.params : {}),
        color: freeColor()
    });
    buildControls(); // Rebuild to show new tissue
}

function removeTissue(id) {
    if (tissues.length <= 1) return;
    tissues = tissues.filter(t => t.id !== id);
    buildControls();
}

function updateUI() {
    updateChart();
}

function enforceConstraints() {
    // Constraint: TE <= TR
    if (currentSeqParams.TR !== undefined && currentSeqParams.TE !== undefined) {
        // If TR or TE is the X-Axis, we can't easily "clamp" the slider since it defines the range/step.
        // We only clamp STATIC parameters here.
        if (xAxisParam !== 'TR' && xAxisParam !== 'TE') {
            if (currentSeqParams.TE > currentSeqParams.TR) {
                currentSeqParams.TE = currentSeqParams.TR;
                syncSlider('', 'TE', currentSeqParams.TE);
            }
        }
    }
}

// Tissue parameters with the effect of the contrast agent
function effectiveParams(tissue) {
    return agent.on ? applyContrastAgent(tissue.params, agent.r1, agent.r2) : { ...tissue.params };
}

// A vertical line on the plot. Marker lines are not in the legend or the tooltip.
function markerLine(label, x, minY, maxY, color, dash) {
    return {
        label: label,
        data: [{ x: x, y: minY }, { x: x, y: maxY }],
        borderColor: color,
        borderDash: dash,
        borderWidth: 1,
        pointRadius: 0,
        fill: false,
        isMarker: true
    };
}

function updateChart() {
    enforceConstraints();
    const seq = sequences[currentSeqId];
    const def = paramDefinitions[xAxisParam];

    // X range: the full range of the parameter, or from the minimum to the
    // slider value
    let plotMin = def.min;
    let plotMax = def.max;
    if (!def.fullAxis) {
        plotMax = Math.max(currentSeqParams[xAxisParam], def.min);
    }
    const range = plotMax - plotMin;

    // A count (ETL, readouts) has integer values only
    let steps = 2048;
    if (def.integer) steps = Math.max(1, Math.round(range));

    const datasets = [];
    const series = []; // [{ name, color, xs, ys }]

    tissues.forEach((tissue) => {
        const points = [];
        const tP = effectiveParams(tissue);

        for (let i = 0; i <= steps; i++) {
            let xVal = plotMin + (range * (i / steps));
            if (def.integer) xVal = Math.round(xVal);

            const sP = { ...currentSeqParams };
            sP[xAxisParam] = xVal;

            let yVal = 0;
            // Signal is null if TE > TR or if the sequence timing is not possible
            if (sP.TR !== undefined && sP.TE !== undefined && sP.TE > sP.TR) {
                yVal = null;
            } else if (seq.valid && !seq.valid(sP)) {
                yVal = null;
            } else {
                yVal = seq.calc(sP, tP);
                if (!Number.isFinite(yVal)) yVal = null;
                else if (seq.signed && magnitudeMode) yVal = Math.abs(yVal);
            }
            points.push({ x: xVal, y: yVal });
        }

        series.push({ name: tissue.name, color: tissue.color, xs: points.map(p => p.x), ys: points.map(p => p.y) });

        datasets.push({
            label: tissue.name,
            data: points,
            borderColor: tissue.color,
            backgroundColor: tissue.color + '10', // 10 hex alpha
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: def.integer ? 0 : 0.4
        });
    });

    lastPlot = { xLabel: def.label, series: series };

    // Y range of the signals, for the marker lines
    const allYs = series.flatMap(s => s.ys).filter(y => y !== null);
    const hasValidPoints = allYs.length > 0;
    let minY = hasValidPoints ? Math.min(...allYs) : 0;
    let maxY = hasValidPoints ? Math.max(...allYs) : 1;
    if (minY === maxY) { minY -= 0.1; maxY += 0.1; }

    const unit = def.unit || '';
    const unitStr = unit ? ` ${unit}` : '';
    const atStr = (x) => (x === null ? 'n/a' : `@ ${Math.round(x)}${unitStr}`);

    const contrastBox = document.getElementById('contrast-info');
    let html = '';

    if (!hasValidPoints) {
        html = '<span style="color:#aaa">No valid signal for these settings. Check that TE &le; TR and that the inversion times and the echo or readout train fit in TR.</span>';
    } else if (series.length >= 2) {
        // Contrast for each pair of tissues. The efficiency is the signal
        // difference for each unit of scan time (difference / sqrt(TR)).
        const hasTR = currentSeqParams.TR !== undefined;
        const trAt = hasTR
            ? (k) => (xAxisParam === 'TR' ? series[0].xs[k] : currentSeqParams.TR)
            : null;
        const results = analyzeContrast(series, trAt);

        results.forEach(res => {
            const effHtml = hasTR ? `
                    <div style="font-size: 0.9rem; color: #81c784;" title="Signal difference divided by the square root of TR in seconds: the contrast for each unit of scan time">
                        Max Diff/&radic;TR: <span style="font-weight:600;">${res.eff.toFixed(3)}</span>
                        <span style="font-size:0.7em; opacity:0.7">${atStr(res.effX)}</span>
                    </div>` : '';
            html += `
                <div class="stat-item" style="border-left: 3px solid ${escapeHtml(res.color)}; padding-left: 0.5rem;">
                    <span class="stat-label" style="color: #fff; font-weight:700;">${escapeHtml(res.name)}</span>
                    <div style="font-size: 0.9rem; color: #ddd;">
                        Max Diff: <span style="color: white; font-weight:600;">${res.diff.toFixed(3)}</span>
                        <span style="font-size:0.7em; opacity:0.7">${atStr(res.diffX)}</span>
                    </div>
                    <div style="font-size: 0.9rem; color: #ffeb3b;">
                        Max Ratio: <span style="font-weight:600;">${res.ratio.toFixed(2)}</span>
                        <span style="font-size:0.7em; opacity:0.7">${atStr(res.ratioX)}</span>
                    </div>${effHtml}
                </div>
            `;

            // Marker lines: Max Diff in white (dashed), Max Ratio in yellow
            // (dotted). No line if no maximum was found. With a fixed TR the
            // efficiency maximum is at the Max Diff position, so its line
            // (green) is only there when TR is the X-axis.
            if (res.diffX !== null) {
                datasets.push(markerLine(`Max Diff (${res.name})`, res.diffX, minY, maxY, 'rgba(255, 255, 255, 0.7)', [5, 5]));
            }
            if (res.ratioX !== null) {
                datasets.push(markerLine(`Max Ratio (${res.name})`, res.ratioX, minY, maxY, 'rgba(255, 235, 59, 0.7)', [2, 4]));
            }
            if (xAxisParam === 'TR' && res.effX !== null) {
                datasets.push(markerLine(`Max Diff/√TR (${res.name})`, res.effX, minY, maxY, 'rgba(129, 199, 132, 0.8)', [8, 3]));
            }
        });
    } else {
        html = '<span style="color:#aaa">Add at least 2 tissues for contrast analysis.</span>';
    }

    // Ernst angle of each tissue (spoiled gradient echo sequences)
    if (seq.ernst && hasValidPoints) {
        const parts = tissues.map(tissue => {
            const angle = ernstAngle(currentSeqParams.TR, effectiveParams(tissue).T1);
            if (xAxisParam === 'Theta') {
                datasets.push(markerLine(`Ernst angle (${tissue.name})`, angle, minY, maxY, tissue.color, [1, 3]));
            }
            return `<span style="color:${escapeHtml(tissue.color)}">${escapeHtml(tissue.name)}: ${angle.toFixed(1)}&deg;</span>`;
        });
        const trNote = xAxisParam === 'TR' ? ' (at the TR of the slider)' : '';
        html += `<div class="stat-wide">Ernst angle${trNote}: ${parts.join(', ')}</div>`;
    }

    if (datasets.some(d => d.isMarker)) {
        html += '<div class="stat-wide stat-muted">Vertical lines: white = Max Diff, yellow = Max Ratio'
            + (xAxisParam === 'TR' ? ', green = Max Diff/&radic;TR' : '')
            + ((seq.ernst && xAxisParam === 'Theta') ? ', tissue colour = Ernst angle' : '')
            + '.</div>';
    }

    contrastBox.innerHTML = html;

    // If the first part of the X range has no valid signal (for example a
    // readout train that does not fit), the plot starts at the first valid point
    const validXs = series.flatMap(s => s.xs.filter((x, k) => s.ys[k] !== null));
    const firstValidX = validXs.length ? Math.min(...validXs) : plotMin;
    const xMin = firstValidX > plotMin ? firstValidX : plotMin;
    // No range (the slider is at its minimum): let the chart find the limits
    const xLimits = range > 0 ? { min: xMin, max: plotMax } : { min: undefined, max: undefined };

    drawChart(datasets, def.label, (seq.signed && magnitudeMode) ? 'Signal Intensity (magnitude)' : 'Signal Intensity', xLimits);
    scheduleUrlUpdate();
}

// The chart is made one time. After that, only its data and labels change.
function drawChart(datasets, xLabel, yLabel, xLimits) {
    const yMin = yAxisAuto ? undefined : parseFloat(document.getElementById('y-min-input').value);
    const yMax = yAxisAuto ? undefined : parseFloat(document.getElementById('y-max-input').value);

    if (chartInstance) {
        chartInstance.data.datasets = datasets;
        chartInstance.options.scales.x.title.text = xLabel;
        chartInstance.options.scales.x.min = xLimits.min;
        chartInstance.options.scales.x.max = xLimits.max;
        chartInstance.options.scales.y.title.text = yLabel;
        chartInstance.options.scales.y.min = Number.isFinite(yMin) ? yMin : undefined;
        chartInstance.options.scales.y.max = Number.isFinite(yMax) ? yMax : undefined;
        chartInstance.update('none');
        return;
    }

    const ctx = document.getElementById('signalChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    type: 'linear',
                    min: xLimits.min,
                    max: xLimits.max,
                    title: { display: true, text: xLabel, color: '#a0a0a0' },
                    grid: { color: '#333' },
                    ticks: { color: '#a0a0a0' }
                },
                y: {
                    title: { display: true, text: yLabel, color: '#a0a0a0' },
                    grid: { color: '#333' },
                    ticks: { color: '#a0a0a0' },
                    min: Number.isFinite(yMin) ? yMin : undefined,
                    max: Number.isFinite(yMax) ? yMax : undefined
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#e0e0e0',
                        // The marker lines are explained below the plot
                        filter: (item, data) => !data.datasets[item.datasetIndex].isMarker
                    }
                },
                tooltip: {
                    filter: (item) => !item.dataset.isMarker,
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.raw.y === null) return `${ctx.dataset.label}: N/A`;
                            return `${ctx.dataset.label}: ${ctx.raw.y.toFixed(3)}`;
                        }
                    }
                }
            }
        }
    });
}

// --- State in the URL ---

function currentState() {
    return {
        seq: currentSeqId,
        x: xAxisParam,
        seqParams: { ...currentSeqParams },
        magnitude: magnitudeMode,
        agent: { ...agent },
        tissues: tissues.map(t => ({ name: t.name, color: t.color, params: { ...t.params } }))
    };
}

function writeUrlState() {
    const hash = '#s=' + encodeState(currentState(), paramDefinitions);
    lastWrittenHash = hash;
    try {
        window.history.replaceState(null, '', hash);
    } catch (err) {
        // Some browsers do not permit this for local files
        console.log('URL update error:', err);
    }
}

// The URL changes a short time after the last change of a setting
function scheduleUrlUpdate() {
    if (!urlReady) return;
    clearTimeout(urlTimer);
    urlTimer = setTimeout(writeUrlState, 300);
}

function readUrlState() {
    const hash = window.location.hash;
    if (!hash.startsWith('#s=')) return null;
    return decodeState(hash.slice(3), {
        sequences: sequences,
        paramDefinitions: paramDefinitions,
        palette: tissueColors,
        maxTissues: MAX_TISSUES
    });
}

function applyState(state) {
    setTissues(state.tissues);
    agent = { ...state.agent };
    magnitudeMode = state.magnitude;
    document.getElementById('agent-chk').checked = agent.on;
    document.getElementById('magnitude-chk').checked = magnitudeMode;
    setSequence(state.seq, state.seqParams, state.x);
}

function copyLink() {
    const btn = document.getElementById('copy-link-btn');
    clearTimeout(urlTimer);
    writeUrlState();
    const done = () => flashButton(btn, 'Copied');
    const failed = () => flashButton(btn, 'Copy the URL');
    if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
        window.navigator.clipboard.writeText(window.location.href).then(done, failed);
    } else {
        failed();
    }
}

// --- Export ---

function downloadFile(href, filename) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function exportCsv() {
    if (!lastPlot) return;
    const blob = new Blob([buildCsv(lastPlot.xLabel, lastPlot.series)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloadFile(url, `mri-signal-${currentSeqId}.csv`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPng() {
    const source = document.getElementById('signalChart');
    // The chart has a transparent background: put the page colour behind it
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    downloadFile(canvas.toDataURL('image/png'), `mri-signal-${currentSeqId}.png`);
}

// Start
init();
