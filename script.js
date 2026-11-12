/**
 * MRI Signal Intensity Simulator Logic
 * Refactored for Multi-Tissue & Contrast
 */

// --- Configuration & Constants ---

// Categorize parameters:
// Sequence Params: TR, TE, TI, Theta
// Tissue Params: T1, T2, T2s, Rho
const paramType = {
    'TR': 'seq', 'TE': 'seq', 'TI': 'seq', 'Theta': 'seq', 'ETL': 'seq', 'ESP': 'seq',
    'T1': 'tissue', 'T2': 'tissue', 'T2s': 'tissue', 'Rho': 'tissue'
};

// The signal equations (`sequences`) are in sequences.js

const paramDefinitions = {
    // Sequence
    'TR': { label: 'TR (ms)', symbol: 'TR', unit: 'ms', min: 1, max: 5000, step: 10, default: 500 },
    'TE': { label: 'TE (ms)', symbol: 'TE', unit: 'ms', min: 1, max: 300, step: 1, default: 20 },
    'TI': { label: 'TI (ms)', symbol: 'TI', unit: 'ms', min: 0, max: 3000, step: 10, default: 150 },
    'ETL': { label: 'ETL', symbol: 'ETL', unit: '', min: 1, max: 32, step: 1, default: 8 }, // Echo Train Length
    'ESP': { label: 'ESP (ms)', symbol: 'ESP', unit: 'ms', min: 1, max: 100, step: 1, default: 10 }, // Echo Spacing
    'Theta': { label: 'Flip Angle (°)', symbol: 'θ', unit: '°', min: 1, max: 180, step: 1, default: 90 },
    // Tissue
    'T1': { label: 'T1 (ms)', symbol: 'T1', unit: 'ms', min: 1, max: 3000, step: 10, default: 800 },
    'T2': { label: 'T2 (ms)', symbol: 'T2', unit: 'ms', min: 1, max: 500, step: 1, default: 80 },
    'T2s': { label: 'T2* (ms)', symbol: 'T2*', unit: 'ms', min: 1, max: 200, step: 1, default: 40 },
    'Rho': { label: 'Proton Density', symbol: 'ρ', unit: '', min: 0, max: 1, step: 0.01, default: 1.0 }
};

// --- State ---
let currentSeqId = 'SE';
let currentMode = 'sim'; // 'sim' or 'ref'

const REFERENCE_PRESETS = {
    '1.5T': [
        { name: 'White Matter', params: { T1: 700, T2: 80, T2s: 60, Rho: 0.73 }, color: '#cf6679' },
        { name: 'Gray Matter', params: { T1: 1000, T2: 100, T2s: 70, Rho: 0.83 }, color: '#bb86fc' },
        { name: 'CSF', params: { T1: 4000, T2: 2000, T2s: 1000, Rho: 1.0 }, color: '#03dac6' }
    ],
    '3.0T': [
        { name: 'White Matter', params: { T1: 950, T2: 95, T2s: 50, Rho: 0.73 }, color: '#cf6679' },
        { name: 'Gray Matter', params: { T1: 1450, T2: 95, T2s: 50, Rho: 0.83 }, color: '#bb86fc' },
        { name: 'CSF', params: { T1: 4000, T2: 2000, T2s: 300, Rho: 1.0 }, color: '#03dac6' }
    ],
    '7.0T': [
        { name: 'White Matter', params: { T1: 1300, T2: 60, T2s: 28, Rho: 0.73 }, color: '#cf6679' },
        { name: 'Gray Matter', params: { T1: 2000, T2: 53, T2s: 30, Rho: 0.83 }, color: '#bb86fc' },
        { name: 'CSF', params: { T1: 4500, T2: 1500, T2s: 100, Rho: 1.0 }, color: '#03dac6' }
    ]
};

let currentSeqParams = {};
// Initialize with 1.5T Default (Deep Copy to identify valid objects)
let tissues = JSON.parse(JSON.stringify(REFERENCE_PRESETS['1.5T'])).map((t, i) => ({ ...t, id: i + 1 }));
let nextTissueId = 4;
let xAxisParam = 'TR'; // Default X-Axis
let yAxisAuto = true;
let magnitudeMode = false; // Show |S| for sequences with a signed signal
let chartInstance = null;

const tissueColors = ['#bb86fc', '#03dac6', '#cf6679', '#ffb74d', '#64b5f6'];

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

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

    // Add Tissue Button
    document.getElementById('add-tissue-btn').addEventListener('click', addTissue);

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

    [yMinInput, yMaxInput].forEach(inp => {
        inp.addEventListener('change', () => {
            if (!yAxisAuto) updateUI();
        });
    });

    setSequence('SE');
    updateView();
}

// --- Core Logic ---

function setSequence(seqId) {
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

    // Display citation and URL
    const citationDisplay = document.getElementById('citation-display');
    if (seq.url) {
        citationDisplay.innerHTML = `${seq.citation || ''} <br> <a href="${seq.url}" target="_blank" rel="noopener" style="color:var(--primary);text-decoration:none;">[View Source Equation]</a>`;
    } else {
        citationDisplay.textContent = seq.citation || '';
    }

    // Magnitude option
    document.getElementById('magnitude-container').style.display = seq.signed ? 'flex' : 'none';

    // Initialize Seq Params
    currentSeqParams = {};
    seq.params.forEach(pKey => {
        if (paramType[pKey] === 'seq') {
            const seqDefault = seq.defaults ? seq.defaults[pKey] : undefined;
            currentSeqParams[pKey] = seqDefault !== undefined ? seqDefault : paramDefinitions[pKey].default;
        }
    });

    // Trigger MathJax typeset
    if (window.MathJax && window.MathJax.typesetPromise) {
        window.MathJax.typesetPromise([document.getElementById('equation-display')]).catch((err) => console.log('MathJax error:', err));
    }

    // Determine default X-Axis if current one is not valid for this sequence OR is a tissue param
    // We strictly want only seq params now.
    const isSeqParam = paramType[xAxisParam] === 'seq';
    if (!seq.params.includes(xAxisParam) || !isSeqParam) {
        if (seq.params.includes('TR')) xAxisParam = 'TR';
        else if (seq.params.includes('TI')) xAxisParam = 'TI';
        else xAxisParam = seq.params.find(k => paramType[k] === 'seq') || 'TR';
    }

    buildControls();
    updateView();
}

// Expose to global scope for HTML buttons
window.loadPreset = function (strength) {
    if (!REFERENCE_PRESETS[strength]) return;

    // Replace tissues with deep copy of preset
    tissues = JSON.parse(JSON.stringify(REFERENCE_PRESETS[strength])).map((t, i) => ({ ...t, id: i + 1 }));
    nextTissueId = 4;

    // Switch back to simulator
    currentMode = 'sim';
    updateView();
    buildControls();

    // Optional: Toast or alert? Switching view is clear enough.
}

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
        if (paramType[pKey] === 'seq') {
            const opt = document.createElement('option');
            opt.value = pKey;
            opt.textContent = paramDefinitions[pKey].label;
            if (pKey === xAxisParam) opt.selected = true;
            xSelect.appendChild(opt);
        }
    });

    // --- Sequence Sliders ---
    seq.params.forEach(pKey => {
        if (paramType[pKey] === 'seq') {
            createSlider(seqContainer, pKey, currentSeqParams[pKey], (val) => {
                currentSeqParams[pKey] = val;
                updateChart();
            }, false);
        }
    });

    // --- Tissue Cards ---
    tissues.forEach((tissue) => {
        const card = document.createElement('div');
        card.className = 'tissue-card';
        card.style.borderColor = tissue.color;

        const header = document.createElement('div');
        header.className = 'tissue-header';

        const nameInput = document.createElement('input');
        nameInput.className = 'tissue-name-input';
        nameInput.value = tissue.name;
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

        // Null button: set TI to the null point of this tissue
        if (seq.nullTI) {
            const nullBtn = document.createElement('button');
            nullBtn.className = 'tissue-null-btn';
            nullBtn.textContent = 'Null';
            nullBtn.title = 'Set TI to the null point of this tissue';
            nullBtn.addEventListener('click', () => {
                const ti = seq.nullTI(currentSeqParams, tissue.params);
                if (ti === null) {
                    // No null point at this TR and TE (TR is too short)
                    nullBtn.textContent = 'No null';
                    setTimeout(() => { nullBtn.textContent = 'Null'; }, 1500);
                    return;
                }
                currentSeqParams.TI = Math.round(ti);
                buildControls();
            });
            header.appendChild(nullBtn);
        }
        if (tissues.length > 1) { // Don't allow removing the last tissue
            header.appendChild(removeBtn);
        }

        card.appendChild(header);

        // Tissue Param Sliders - Always show all 4
        const tissueKeys = ['Rho', 'T1', 'T2', 'T2s'];
        tissueKeys.forEach(pKey => {
            createSlider(card, pKey, tissue.params[pKey], (val) => {
                tissue.params[pKey] = val;
                updateChart();
            }, true, `tissue${tissue.id}-`); // compact mode
        });

        tissueContainer.appendChild(card);
    });

    updateUI();
}

function createSlider(container, pKey, initVal, onChange, isCompact, idPrefix = '') {
    const def = paramDefinitions[pKey];

    // A preset value can be larger than the slider range (for example CSF T1).
    if (pKey !== 'Theta' && pKey !== 'Rho' && initVal > def.max) {
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

    let lastVal = initVal;

    // Sync Slider -> Input
    slider.addEventListener('input', (e) => {
        const newVal = Math.max(parseFloat(e.target.value), def.min);
        valInput.value = newVal;
        lastVal = newVal;

        // Infinite Range Logic: Bi-directional scaling (except Theta and Rho)
        if (pKey !== 'Theta' && pKey !== 'Rho') {
            const currentMax = parseFloat(slider.max);
            let newMax = currentMax;

            // Expand gently if pushing the edge (> 90%)
            if (newVal >= currentMax * 0.90) {
                newMax = Math.ceil(currentMax * 1.1);
            }
            // Shrink gently if pulling away (< 70%) to keep detail, 
            // but keep at least ~20% headroom and don't drop below original default minimums (e.g. 100 or so? handled by logic)
            // We ensure newMax is at least newVal * 1.2 to give space to move right again.
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

        onChange(newVal);
    });

    // Sync Input -> Slider
    valInput.addEventListener('change', (e) => {
        let newVal = parseFloat(e.target.value);

        // Empty or invalid text: go back to the last good value
        if (!Number.isFinite(newVal)) {
            valInput.value = lastVal;
            return;
        }

        // Auto-expand max if input > max (except Theta and Rho)
        if (pKey !== 'Theta' && pKey !== 'Rho' && newVal > parseFloat(slider.max)) {
            const newMax = Math.ceil(newVal * 1.5);
            slider.max = newMax;
            valInput.max = newMax;
            def.max = newMax;
        }

        // Clamp
        if (newVal < def.min) newVal = def.min;
        // Hard clamp for Theta and Rho
        if ((pKey === 'Theta' || pKey === 'Rho') && newVal > def.max) newVal = def.max;

        valInput.value = newVal;
        slider.value = newVal;
        lastVal = newVal;
        onChange(newVal);
    });

    group.appendChild(labelRow);
    group.appendChild(slider);
    container.appendChild(group);
}

function addTissue() {
    if (tissues.length >= 5) return; // Limit to 5
    // Use the first colour that no tissue has at this time
    const usedColors = tissues.map(t => t.color);
    const color = tissueColors.find(c => !usedColors.includes(c)) || tissueColors[tissues.length % tissueColors.length];
    const id = nextTissueId++;
    tissues.push({
        id: id,
        name: `Tissue ${id}`,
        params: { T1: 800, T2: 80, T2s: 40, Rho: 1.0 },
        color: color
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
        // If both checks are relevant (not hidden by X-axis choice logic, though validation applies to data)
        // If TR or TE is the X-Axis, we can't easily "clamp" the slider since it defines the range/step.
        // We only clamp STATIC parameters here.

        if (xAxisParam !== 'TR' && xAxisParam !== 'TE') {
            if (currentSeqParams.TE > currentSeqParams.TR) {
                currentSeqParams.TE = currentSeqParams.TR;
                // Update UI
                const inp = document.getElementById('input-TE');
                const sld = document.getElementById('slider-TE');
                if (inp) inp.value = currentSeqParams.TE;
                if (sld) sld.value = currentSeqParams.TE;
            }
        }
    }
}

function updateChart() {
    enforceConstraints();
    const seq = sequences[currentSeqId];
    const def = paramDefinitions[xAxisParam];
    const isSeqParam = paramType[xAxisParam] === 'seq';

    // Generate data points
    let steps = 2048;

    let plotMax = def.max;
    // User request: Use slider value as max plot value (except Theta)
    if (xAxisParam !== 'Theta' && isSeqParam) {
        plotMax = currentSeqParams[xAxisParam];
        // Ensure plotMax is not below min (though slider limits should prevent this)
        if (plotMax < def.min) plotMax = def.min;
    }

    const range = plotMax - def.min;

    // ETL is a count of echoes: use integer values only
    if (xAxisParam === 'ETL') steps = Math.max(1, Math.round(range));

    const datasets = [];

    // Arrays to store signals for contrast calc (if valid)
    // We only contrast the first two tissues
    const signalData = []; // [ [y1 values], [y2 values] ]

    tissues.forEach((tissue, tIdx) => {
        const points = [];
        const yValues = [];

        for (let i = 0; i <= steps; i++) {
            let xVal = def.min + (range * (i / steps));
            if (xAxisParam === 'ETL') xVal = Math.round(xVal);

            // Build current call params
            let sP = { ...currentSeqParams };
            let tP = { ...tissue.params };

            if (isSeqParam) sP[xAxisParam] = xVal;
            else tP[xAxisParam] = xVal;

            let yVal = 0;
            // Dynamic Constraint: Signal is null if TE > TR (for relevant sequences)
            // or if the sequence timing is not possible (seq.valid)
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
            yValues.push(yVal);
        }

        if (tIdx < 10) signalData.push({ xs: points.map(p => p.x), ys: yValues, name: tissue.name, color: tissue.color }); // Store up to 10 for logic (limit is 5 anyway)

        datasets.push({
            label: tissue.name,
            data: points,
            borderColor: tissue.color,
            backgroundColor: tissue.color + '10', // 10 hex alpha
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.4
        });
    });

    // Calculate Contrast (Multi-Tissue)
    // We want to calculate AND display contrast for EVERY pair.
    let pairwiseResults = [];
    let hasContrast = false;

    if (signalData.length >= 2) {
        hasContrast = true;

        // Iterate unique pairs
        for (let i = 0; i < signalData.length; i++) {
            for (let j = i + 1; j < signalData.length; j++) {
                const t1 = signalData[i];
                const t2 = signalData[j];
                const xs = t1.xs;
                const s1 = t1.ys;
                const s2 = t2.ys;

                // X positions stay null if no maximum is found
                let pMaxDiff = 0, pMaxDiffX = null;
                let pMaxRatio = 1, pMaxRatioX = null;

                for (let k = 0; k < s1.length; k++) {
                    const v1 = s1[k];
                    const v2 = s2[k];

                    // Handling nulls
                    if (v1 === null || v2 === null) continue;

                    // Diff
                    const diff = Math.abs(v1 - v2);
                    if (diff > pMaxDiff) {
                        pMaxDiff = diff;
                        pMaxDiffX = xs[k];
                    }

                    // Ratio
                    if (Math.abs(v2) > 0.001 && Math.abs(v1) > 0.001) {
                        const r = Math.max(Math.abs(v1 / v2), Math.abs(v2 / v1));
                        if (r > pMaxRatio) {
                            pMaxRatio = r;
                            pMaxRatioX = xs[k];
                        }
                    }
                }

                pairwiseResults.push({
                    name: `${t1.name} vs ${t2.name}`,
                    diff: pMaxDiff,
                    diffX: pMaxDiffX,
                    ratio: pMaxRatio,
                    ratioX: pMaxRatioX,
                    color: t1.color // Maybe use one of the colors for line identification?
                });
            }
        }
    }

    // Update Contrast UI
    const contrastBox = document.getElementById('contrast-info');
    if (hasContrast && pairwiseResults.length > 0) {
        let html = '';

        // Find Y range for lines
        let allYs = signalData.flatMap(d => d.ys).filter(y => y !== null);
        let minY = Math.min(...allYs);
        let maxY = Math.max(...allYs);
        if (minY === maxY) { minY -= 0.1; maxY += 0.1; }
        if (!isFinite(minY)) minY = 0;
        if (!isFinite(maxY)) maxY = 1;

        const hasValidPoints = allYs.length > 0;
        if (!hasValidPoints) {
            html = '<span style="color:#aaa">No valid signal for these settings. Check that TE &le; TR and that the echo train fits between 0 and TR.</span>';
        }

        const unit = paramDefinitions[xAxisParam].unit || '';
        const unitStr = unit ? ` ${unit}` : '';
        const atStr = (x) => (x === null ? 'n/a' : `@ ${Math.round(x)}${unitStr}`);

        pairwiseResults.forEach(res => {
            if (!hasValidPoints) return;

            // Add UI Block
            html += `
                <div class="stat-item" style="border-left: 3px solid ${res.color}; padding-left: 0.5rem;">
                    <span class="stat-label" style="color: #fff; font-weight:700;">${escapeHtml(res.name)}</span>
                    <div style="font-size: 0.9rem; color: #ddd;">
                        Max Diff: <span style="color: white; font-weight:600;">${res.diff.toFixed(3)}</span> 
                        <span style="font-size:0.7em; opacity:0.7">${atStr(res.diffX)}</span>
                    </div>
                    <div style="font-size: 0.9rem; color: #ffeb3b;">
                        Max Ratio: <span style="font-weight:600;">${res.ratio.toFixed(2)}</span>
                        <span style="font-size:0.7em; opacity:0.7">${atStr(res.ratioX)}</span>
                    </div>
                </div>
            `;

            // Marker lines: Max Diff in white (dashed), Max Ratio in yellow (dotted).
            // No line if no maximum was found.
            if (res.diffX !== null) {
                datasets.push({
                    label: `Max Diff (${res.name})`,
                    data: [{ x: res.diffX, y: minY }, { x: res.diffX, y: maxY }],
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                    borderDash: [5, 5],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                });
            }

            if (res.ratioX !== null) {
                datasets.push({
                    label: `Max Ratio (${res.name})`,
                    data: [{ x: res.ratioX, y: minY }, { x: res.ratioX, y: maxY }],
                    borderColor: 'rgba(255, 235, 59, 0.7)', // Yellowish
                    borderDash: [2, 4],
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                });
            }
        });

        contrastBox.innerHTML = html;

    } else {
        contrastBox.innerHTML = '<span style="color:#aaa">Add at least 2 tissues for contrast analysis.</span>';
    }

    const ctx = document.getElementById('signalChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

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
                    title: { display: true, text: def.label, color: '#a0a0a0' },
                    grid: { color: '#333' },
                    ticks: { color: '#a0a0a0' }
                },
                y: {
                    title: { display: true, text: (seq.signed && magnitudeMode) ? 'Signal Intensity (magnitude)' : 'Signal Intensity', color: '#a0a0a0' },
                    grid: { color: '#333' },
                    ticks: { color: '#a0a0a0' },
                    min: yAxisAuto ? undefined : parseFloat(document.getElementById('y-min-input').value),
                    max: yAxisAuto ? undefined : parseFloat(document.getElementById('y-max-input').value)
                }
            },
            plugins: {
                legend: { display: true, labels: { color: '#e0e0e0' } },
                tooltip: {
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

// Start
init();
