// ============================================
// STATE & PERSISTENCE
// ============================================

const AppState = {
    projects: [],
    currentProjectId: null,
    calculationState: {
        waterDemand: 0,
        pipeLength: 0,
        headLoss: 0,
        maxLateralLength: 0,
        validationStatus: 'pending',
        validationNotes: [],
        bom: []
    },
    charts: {
        seasonal: null,
        cost: null,
        zone: null
    }
};

// Load projects from localStorage
function loadProjects() {
    const stored = localStorage.getItem('irrigation-projects');
    if (stored) {
        AppState.projects = JSON.parse(stored);
    }
}

// Save projects to localStorage
function saveProjects() {
    localStorage.setItem('irrigation-projects', JSON.stringify(AppState.projects));
}

// Get current project
function getCurrentProject() {
    return AppState.projects.find(p => p.id === AppState.currentProjectId);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    loadProjects();
    initializeNavigation();
    initializeMap();
    setupEventListeners();
    setupMonthlyTable();
    syncSliderAndInput();
    renderProjects();
    calculateAll();
    updateLayoutSource('Heuristic (local)');
});

// ============================================
// NAVIGATION & UI
// ============================================

function initializeNavigation() {
    // Sidebar navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            switchSection(section);
        });
    });

    // Sidebar toggle (mobile)
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            document.getElementById('sidebar').classList.toggle('active');
        });
    }
}

function switchSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Show selected section
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.section === sectionName) {
            item.classList.add('active');
        }
    });

    // Initialize section-specific features
    if (sectionName === 'summary') {
        updateSummarySection();
    } else if (sectionName === 'seasonal') {
        // Seasonal section ready
    }
}

function updateLayoutSource(source) {
    const sourceElement = document.getElementById('layout-source');
    if (sourceElement) {
        sourceElement.textContent = `Layout: ${source}`;
    }
}

// ============================================
// PROJECT MANAGEMENT
// ============================================

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    const emptyState = document.getElementById('empty-state');

    if (!grid) return;

    if (AppState.projects.length === 0) {
        grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    if (emptyState) emptyState.style.display = 'none';

    grid.innerHTML = AppState.projects.map(project => `
        <div class="project-card" data-project-id="${project.id}">
            <div class="project-card-badge ${project.latestMetrics?.validationOk ? 'valid' : 'invalid'}">
                ${project.latestMetrics?.validationOk ? 'OK' : 'Needs Adjustment'}
            </div>
            <div class="project-card-header">
                <div>
                    <div class="project-card-title">${project.name}</div>
                    <div class="project-card-location">
                        <i class="fas fa-map-marker-alt"></i> ${project.location}
                    </div>
                </div>
                <div class="project-card-actions">
                    <button class="project-card-action" onclick="editProject('${project.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="project-card-action" onclick="deleteProject('${project.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="project-card-metrics">
                <div class="project-metric">
                    <div class="project-metric-label">Area</div>
                    <div class="project-metric-value">${project.area} ha</div>
                </div>
                <div class="project-metric">
                    <div class="project-metric-label">Crop</div>
                    <div class="project-metric-value">${project.crop}</div>
                </div>
                <div class="project-metric">
                    <div class="project-metric-label">Demand</div>
                    <div class="project-metric-value">${formatNumber(project.latestMetrics?.demandLday || 0)} L/day</div>
                </div>
                <div class="project-metric">
                    <div class="project-metric-label">Updated</div>
                    <div class="project-metric-value">${formatDate(project.lastUpdated)}</div>
                </div>
            </div>
        </div>
    `).join('');

    // Add click listeners
    grid.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', function(e) {
            if (!e.target.closest('.project-card-actions')) {
                const projectId = this.dataset.projectId;
                loadProject(projectId);
            }
        });
    });
}

function createProject() {
    const name = document.getElementById('project-name-input').value.trim();
    const location = document.getElementById('project-location-input').value.trim();
    const area = parseFloat(document.getElementById('project-area-input').value);
    const crop = document.getElementById('project-crop-input').value;

    if (!name || !location || !area) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }

    const project = {
        id: Date.now().toString(),
        name,
        location,
        area,
        crop,
        lastUpdated: new Date().toISOString(),
        latestMetrics: {
            demandLday: 0,
            totalPipeLength: 0,
            headLossPct: 0,
            maxLateral: 0,
            validationOk: false
        }
    };

    AppState.projects.push(project);
    saveProjects();
    renderProjects();
    closeModal('new-project-modal');
    loadProject(project.id);
    showNotification('Project created successfully!', 'success');
}

function loadProject(projectId) {
    const project = AppState.projects.find(p => p.id === projectId);
    if (!project) return;

    AppState.currentProjectId = projectId;

    // Load project data into planner inputs
    document.getElementById('crop-type').value = project.crop;
    document.getElementById('area').value = project.area;
    document.getElementById('area-value').value = project.area;
    document.getElementById('kc').value = project.latestMetrics?.kc || 0.9;
    document.getElementById('eto').value = project.latestMetrics?.eto || 5.0;
    document.getElementById('rainfall').value = project.latestMetrics?.rainfall || 0;
    document.getElementById('main-diameter').value = project.latestMetrics?.mainDiameter || 110;
    document.getElementById('max-lateral').value = project.latestMetrics?.maxLateral || 100;

    // Update current project badge
    const badge = document.getElementById('current-project-badge');
    const badgeName = document.getElementById('current-project-name');
    if (badge && badgeName) {
        badge.style.display = 'inline-flex';
        badgeName.textContent = project.name;
    }

    // Switch to planner section
    switchSection('planner');
    calculateAll();
    showNotification(`Loaded project: ${project.name}`, 'success');
}

function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project?')) return;

    AppState.projects = AppState.projects.filter(p => p.id !== projectId);
    if (AppState.currentProjectId === projectId) {
        AppState.currentProjectId = null;
    }
    saveProjects();
    renderProjects();
    showNotification('Project deleted', 'success');
}

function editProject(projectId) {
    const project = AppState.projects.find(p => p.id === projectId);
    if (!project) return;

    // For now, just load the project (can add edit modal later)
    loadProject(projectId);
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // New project button
    const newProjectBtn = document.getElementById('new-project-btn');
    if (newProjectBtn) {
        newProjectBtn.addEventListener('click', function() {
            document.getElementById('new-project-modal').classList.add('active');
        });
    }

    // Save project button
    const saveProjectBtn = document.getElementById('save-project-btn');
    if (saveProjectBtn) {
        saveProjectBtn.addEventListener('click', createProject);
    }

    // Input synchronization
    const areaSlider = document.getElementById('area');
    const areaValue = document.getElementById('area-value');

    if (areaSlider && areaValue) {
        areaSlider.addEventListener('input', function() {
            areaValue.value = this.value;
            calculateAll();
        });

        areaValue.addEventListener('input', function() {
            const val = Math.max(1, Math.min(100, parseFloat(this.value) || 1));
            areaSlider.value = val;
            this.value = val;
            calculateAll();
        });
    }

    // All input changes trigger recalculation
    ['kc', 'eto', 'rainfall', 'main-diameter', 'max-lateral', 'crop-type'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', calculateAll);
            element.addEventListener('input', calculateAll);
        }
    });

    // Action buttons
    const calculateBtn = document.getElementById('calculate-demand');
    if (calculateBtn) calculateBtn.addEventListener('click', calculateAll);

    const generateBtn = document.getElementById('generate-layout');
    if (generateBtn) generateBtn.addEventListener('click', generateLayout);

    const validateBtn = document.getElementById('validate-hydraulics');
    if (validateBtn) validateBtn.addEventListener('click', validateHydraulics);

    const bomBtn = document.getElementById('show-bom');
    if (bomBtn) bomBtn.addEventListener('click', showBOM);

    const finalizeBtn = document.getElementById('finalize-design');
    if (finalizeBtn) finalizeBtn.addEventListener('click', finalizeDesign);

    // Seasonal simulation
    const runSeasonalBtn = document.getElementById('run-seasonal-sim');
    if (runSeasonalBtn) runSeasonalBtn.addEventListener('click', runSeasonalSimulation);

    const scenarioPreset = document.getElementById('scenario-preset');
    if (scenarioPreset) {
        scenarioPreset.addEventListener('change', function() {
            loadScenarioPreset(this.value);
        });
    }

    // Download report
    const downloadBtn = document.getElementById('download-report-btn');
    if (downloadBtn) downloadBtn.addEventListener('click', downloadReport);

    // Modal close handlers
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeModal(this.id);
            }
        });
    });
}

function syncSliderAndInput() {
    const areaSlider = document.getElementById('area');
    const areaValue = document.getElementById('area-value');
    if (areaSlider && areaValue) {
        areaValue.value = areaSlider.value;
    }
}

// ============================================
// CALCULATION FUNCTIONS
// ============================================

function calculateWaterDemand() {
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const kc = parseFloat(document.getElementById('kc')?.value || 0.9);
    const eto = parseFloat(document.getElementById('eto')?.value || 5.0);
    const rainfall = parseFloat(document.getElementById('rainfall')?.value || 0);

    const etc = kc * eto;
    const netIrrigation = Math.max(0, etc - rainfall);
    const waterDemand = netIrrigation * area * 10000;

    return waterDemand;
}

function calculatePipeLength() {
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const areaM2 = area * 10000;
    const sideLength = Math.sqrt(areaM2);
    const estimatedLength = sideLength * 2 * 1.2;

    return Math.round(estimatedLength);
}

function calculateHeadLoss() {
    const waterDemand = calculateWaterDemand();
    const flowRate = waterDemand / (24 * 3600);
    const flowRateM3s = flowRate / 1000;

    const diameter = parseFloat(document.getElementById('main-diameter')?.value || 110) / 1000;
    const length = calculatePipeLength();
    const C = 150;

    const hf = 10.67 * Math.pow(flowRateM3s, 1.852) * length / (Math.pow(C, 1.852) * Math.pow(diameter, 4.871));

    const operatingHead = 30;
    const headLossPercent = (hf / operatingHead) * 100;

    return Math.max(0, Math.min(100, headLossPercent));
}

function calculateMaxLateralLength() {
    const diameter = parseFloat(document.getElementById('main-diameter')?.value || 110);
    const maxLateral = parseFloat(document.getElementById('max-lateral')?.value || 100);

    const waterDemand = calculateWaterDemand();
    const flowPerLateral = waterDemand / 10;
    const flowRate = flowPerLateral / (24 * 3600 * 1000);

    const diameterM = diameter / 1000;
    const C = 150;

    const maxHeadLoss = 0.05 * 30;
    const maxLength = (maxHeadLoss * Math.pow(C, 1.852) * Math.pow(diameterM, 4.871)) /
                      (10.67 * Math.pow(flowRate, 1.852));

    return Math.min(maxLateral, Math.max(50, maxLength));
}

function calculateZones() {
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const waterDemand = calculateWaterDemand();
    const maxZoneCapacity = 50000;
    const zones = Math.ceil(waterDemand / maxZoneCapacity);

    return Math.max(1, zones);
}

function calculateBOM() {
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const diameter = parseFloat(document.getElementById('main-diameter')?.value || 110);
    const pipeLength = calculatePipeLength();
    const zones = calculateZones();
    const waterDemand = calculateWaterDemand();

    const prices = {
        pipe: { 50: 2.5, 63: 3.0, 75: 3.5, 90: 4.0, 110: 5.0, 125: 6.0, 140: 7.0, 160: 8.0 },
        fittings: 15,
        valves: 25,
        emitters: 0.5,
        pump: 500,
        controller: 200
    };

    const bom = [];

    const pipePrice = prices.pipe[diameter] || 5.0;
    bom.push({
        item: `Main Pipe (${diameter}mm)`,
        quantity: Math.ceil(pipeLength),
        unit: 'm',
        unitPrice: pipePrice,
        total: Math.ceil(pipeLength) * pipePrice
    });

    const lateralLength = Math.ceil(pipeLength * 0.5);
    bom.push({
        item: 'Lateral Pipes (16mm)',
        quantity: lateralLength,
        unit: 'm',
        unitPrice: 1.5,
        total: lateralLength * 1.5
    });

    const numFittings = Math.ceil(pipeLength / 20);
    bom.push({
        item: 'Pipe Fittings',
        quantity: numFittings,
        unit: 'pcs',
        unitPrice: prices.fittings,
        total: numFittings * prices.fittings
    });

    bom.push({
        item: 'Control Valves',
        quantity: zones,
        unit: 'pcs',
        unitPrice: prices.valves,
        total: zones * prices.valves
    });

    const numEmitters = Math.ceil(area * 10000);
    bom.push({
        item: 'Drip Emitters',
        quantity: numEmitters,
        unit: 'pcs',
        unitPrice: prices.emitters,
        total: numEmitters * prices.emitters
    });

    bom.push({
        item: 'Irrigation Pump',
        quantity: 1,
        unit: 'pcs',
        unitPrice: prices.pump,
        total: prices.pump
    });

    bom.push({
        item: 'Irrigation Controller',
        quantity: 1,
        unit: 'pcs',
        unitPrice: prices.controller,
        total: prices.controller
    });

    return bom;
}

function calculateAll() {
    AppState.calculationState.waterDemand = calculateWaterDemand();
    AppState.calculationState.pipeLength = calculatePipeLength();
    AppState.calculationState.headLoss = calculateHeadLoss();
    AppState.calculationState.maxLateralLength = calculateMaxLateralLength();
    AppState.calculationState.bom = calculateBOM();

    updateOutputs();
}

function updateOutputs() {
    const state = AppState.calculationState;

    const waterDemandEl = document.getElementById('water-demand');
    if (waterDemandEl) waterDemandEl.textContent = formatNumber(state.waterDemand);

    const pipeLengthEl = document.getElementById('pipe-length');
    if (pipeLengthEl) pipeLengthEl.textContent = formatNumber(state.pipeLength);

    const headLossEl = document.getElementById('head-loss');
    if (headLossEl) headLossEl.textContent = formatNumber(state.headLoss, 2) + '%';

    const maxLateralEl = document.getElementById('max-lateral-output');
    if (maxLateralEl) maxLateralEl.textContent = formatNumber(state.maxLateralLength);
}

// ============================================
// MAP & LAYOUT GENERATION
// ============================================

let map = null;
let mapInitialized = false;
let pipelineLayer = null;
let boundaryLayer = null;

function initializeMap() {
    if (mapInitialized) return;

    const mapContainer = document.getElementById('map-container');
    if (!mapContainer) return;

    map = L.map('map-container').setView([13.7563, 100.5018], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 19
    });

    const baseMaps = {
        "Street Map": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }),
        "Satellite": satelliteLayer
    };

    L.control.layers(baseMaps).addTo(map);

    const defaultBoundary = [
        [13.7550, 100.5000],
        [13.7575, 100.5000],
        [13.7575, 100.5035],
        [13.7550, 100.5035],
        [13.7550, 100.5000]
    ];

    boundaryLayer = L.polygon(defaultBoundary, {
        color: '#2d8659',
        fillColor: '#2d8659',
        fillOpacity: 0.2,
        weight: 2
    }).addTo(map);

    mapInitialized = true;
}

function generateLayout() {
    // AI Integration Hook: Currently uses heuristic, can be replaced with AI API call
    const layoutSource = callAiLayout();
    updateLayoutSource(layoutSource);

    if (!mapInitialized) {
        initializeMap();
    }

    if (pipelineLayer) {
        map.removeLayer(pipelineLayer);
    }

    const area = parseFloat(document.getElementById('area')?.value || 10);
    const pipeLength = AppState.calculationState.pipeLength;

    const bounds = boundaryLayer.getBounds();
    const center = bounds.getCenter();

    // Enhanced layout: Main pipe, sub-mains, and laterals
    const layoutComponents = [];

    // Main pipe (thicker, vertical)
    const mainStart = [center.lat - 0.0015, center.lng];
    const mainEnd = [center.lat + 0.0015, center.lng];
    const mainPipe = L.polyline([mainStart, mainEnd], {
        color: '#2d8659',
        weight: 6,
        opacity: 0.9
    });
    layoutComponents.push(mainPipe);

    // Add pump icon at start
    const pumpIcon = L.divIcon({
        className: 'pump-icon',
        html: '<i class="fas fa-water" style="color: #2d8659; font-size: 20px;"></i>',
        iconSize: [20, 20]
    });
    L.marker(mainStart, { icon: pumpIcon }).addTo(map).bindTooltip('Pump Station');

    // Sub-main pipes (horizontal, medium thickness)
    const numSubMains = Math.min(5, Math.floor(pipeLength / 150));
    for (let i = 0; i < numSubMains; i++) {
        const latOffset = (i - numSubMains / 2) * 0.0006;
        const subMainStart = [center.lat + latOffset, center.lng - 0.002];
        const subMainEnd = [center.lat + latOffset, center.lng + 0.002];
        const subMain = L.polyline([subMainStart, subMainEnd], {
            color: '#4a90e2',
            weight: 4,
            opacity: 0.8
        });
        layoutComponents.push(subMain);
    }

    // Lateral pipes (thinner, perpendicular to sub-mains)
    const numLaterals = Math.min(8, Math.floor(pipeLength / 100));
    for (let i = 0; i < numLaterals; i++) {
        const lngOffset = (i - numLaterals / 2) * 0.0004;
        const lateralStart = [center.lat - 0.001, center.lng + lngOffset];
        const lateralEnd = [center.lat + 0.001, center.lng + lngOffset];
        const lateral = L.polyline([lateralStart, lateralEnd], {
            color: '#6ba8f0',
            weight: 2,
            opacity: 0.7
        });
        layoutComponents.push(lateral);
    }

    // Add valve icons
    const valveIcon = L.divIcon({
        className: 'valve-icon',
        html: '<i class="fas fa-circle" style="color: #e74c3c; font-size: 12px;"></i>',
        iconSize: [12, 12]
    });
    L.marker([center.lat, center.lng], { icon: valveIcon }).addTo(map).bindTooltip('Main Valve');

    pipelineLayer = L.layerGroup(layoutComponents);
    pipelineLayer.addTo(map);

    const allBounds = L.latLngBounds(
        [...bounds.getSouthWest().toArray(), ...bounds.getNorthEast().toArray()]
    );
    map.fitBounds(allBounds, { padding: [50, 50] });

    showNotification('Layout generated successfully!', 'success');
}

// AI Integration Hook - Currently returns heuristic, can be replaced with API call
function callAiLayout() {
    // Future: Replace with actual AI API call
    // const response = await fetch('/api/generate-layout', { ... });
    // return response.json();
    
    // For now, use heuristic
    return 'Heuristic (local)';
}

// ============================================
// VALIDATION
// ============================================

function validateHydraulics() {
    const validationNotes = [];
    let isValid = true;
    const state = AppState.calculationState;

    if (state.headLoss > 15) {
        validationNotes.push('Head loss exceeds 15% - consider larger pipe diameter');
        isValid = false;
    } else if (state.headLoss > 10) {
        validationNotes.push('Head loss is high (10-15%) - monitor pressure');
    } else {
        validationNotes.push('Head loss is within acceptable range');
    }

    const maxLateralInput = parseFloat(document.getElementById('max-lateral')?.value || 100);
    if (state.maxLateralLength < maxLateralInput * 0.8) {
        validationNotes.push('Maximum lateral length may be too long for current setup');
        isValid = false;
    }

    if (state.waterDemand > 100000) {
        validationNotes.push('High water demand - consider zone splitting');
    }

    const area = parseFloat(document.getElementById('area')?.value || 10);
    const diameter = parseFloat(document.getElementById('main-diameter')?.value || 110);
    if (area > 50 && diameter < 110) {
        validationNotes.push('Large area detected - consider larger main pipe');
        isValid = false;
    }

    AppState.calculationState.validationStatus = isValid ? 'valid' : 'invalid';
    AppState.calculationState.validationNotes = validationNotes;

    updateValidationDisplay();
    showNotification(isValid ? 'Validation passed!' : 'Validation issues found', isValid ? 'success' : 'warning');
}

function updateValidationDisplay() {
    const card = document.getElementById('validation-card');
    const status = document.getElementById('validation-status');
    const notes = document.getElementById('validation-notes');
    const icon = document.getElementById('validation-icon');

    if (!card || !status || !notes || !icon) return;

    const state = AppState.calculationState;

    if (state.validationStatus === 'valid') {
        card.className = 'output-card validation-card valid';
        status.textContent = 'Valid';
        icon.className = 'fas fa-check-circle';
        notes.textContent = state.validationNotes.join(' • ');
    } else if (state.validationStatus === 'invalid') {
        card.className = 'output-card validation-card invalid';
        status.textContent = 'Needs Adjustment';
        icon.className = 'fas fa-exclamation-triangle';
        notes.textContent = state.validationNotes.join(' • ');
    } else {
        card.className = 'output-card validation-card';
        status.textContent = 'Pending';
        icon.className = 'fas fa-check-circle';
        notes.textContent = 'Click "Validate Hydraulics" to check';
    }
}

// ============================================
// BOM DISPLAY
// ============================================

function showBOM() {
    const container = document.getElementById('bom-container');
    const tbody = document.getElementById('bom-tbody');

    if (!container || !tbody) return;

    tbody.innerHTML = '';

    let total = 0;
    AppState.calculationState.bom.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.item}</td>
            <td>${formatNumber(item.quantity)}</td>
            <td>${item.unit}</td>
            <td>$${formatNumber(item.unitPrice, 2)}</td>
            <td>$${formatNumber(item.total, 2)}</td>
        `;
        tbody.appendChild(row);
        total += item.total;
    });

    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td colspan="4" style="text-align: right; font-weight: 600;">Total:</td>
        <td style="font-weight: 600;">$${formatNumber(total, 2)}</td>
    `;
    tbody.appendChild(totalRow);

    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showNotification('BOM generated successfully!', 'success');
}

// ============================================
// FINALIZE DESIGN
// ============================================

function finalizeDesign() {
    const project = getCurrentProject();
    if (!project) {
        showNotification('Please create or select a project first', 'warning');
        return;
    }

    const state = AppState.calculationState;
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const kc = parseFloat(document.getElementById('kc')?.value || 0.9);
    const eto = parseFloat(document.getElementById('eto')?.value || 5.0);
    const rainfall = parseFloat(document.getElementById('rainfall')?.value || 0);
    const diameter = parseFloat(document.getElementById('main-diameter')?.value || 110);
    const maxLateral = parseFloat(document.getElementById('max-lateral')?.value || 100);
    const zones = calculateZones();
    const bomTotal = state.bom.reduce((sum, item) => sum + item.total, 0);

    // Update project metrics
    project.latestMetrics = {
        demandLday: state.waterDemand,
        totalPipeLength: state.pipeLength,
        headLossPct: state.headLoss,
        maxLateral: state.maxLateralLength,
        validationOk: state.validationStatus === 'valid',
        kc,
        eto,
        rainfall,
        mainDiameter: diameter,
        maxLateral: maxLateral
    };
    project.lastUpdated = new Date().toISOString();

    saveProjects();
    renderProjects();

    // Show modal
    const modal = document.getElementById('finalize-modal');
    const modalBody = document.getElementById('modal-body');
    if (modal && modalBody) {
        modalBody.innerHTML = `
            <div style="display: grid; gap: 1.5rem;">
                <div>
                    <h3 style="color: var(--primary-green); margin-bottom: 1rem;">
                        <i class="fas fa-seedling"></i> Farm Parameters
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div><strong>Area:</strong> ${formatNumber(area)} ha</div>
                        <div><strong>Crop Coefficient:</strong> ${kc}</div>
                        <div><strong>ET₀:</strong> ${eto} mm/day</div>
                        <div><strong>Rainfall:</strong> ${rainfall} mm/day</div>
                    </div>
                </div>
                <div>
                    <h3 style="color: var(--primary-green); margin-bottom: 1rem;">
                        <i class="fas fa-cog"></i> Hydraulic Settings
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div><strong>Main Pipe:</strong> ${diameter} mm</div>
                        <div><strong>Max Lateral:</strong> ${maxLateral} m</div>
                        <div><strong>Zones:</strong> ${zones}</div>
                        <div><strong>Pipe Length:</strong> ${formatNumber(state.pipeLength)} m</div>
                    </div>
                </div>
                <div>
                    <h3 style="color: var(--primary-green); margin-bottom: 1rem;">
                        <i class="fas fa-chart-line"></i> Results
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div><strong>Water Demand:</strong> ${formatNumber(state.waterDemand)} L/day</div>
                        <div><strong>Head Loss:</strong> ${formatNumber(state.headLoss, 2)}%</div>
                        <div><strong>Max Lateral Length:</strong> ${formatNumber(state.maxLateralLength)} m</div>
                        <div><strong>Validation:</strong> ${state.validationStatus === 'valid' ? '✓ Valid' : '⚠ Needs Adjustment'}</div>
                    </div>
                </div>
                <div>
                    <h3 style="color: var(--primary-green); margin-bottom: 1rem;">
                        <i class="fas fa-dollar-sign"></i> Estimated Cost
                    </h3>
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--primary-green);">
                        $${formatNumber(bomTotal, 2)}
                    </div>
                </div>
                ${state.validationNotes.length > 0 ? `
                    <div style="background: var(--grey-light); padding: 1rem; border-radius: var(--radius-md);">
                        <h4 style="margin-bottom: 0.5rem;">Validation Notes:</h4>
                        <ul style="margin-left: 1.5rem;">
                            ${state.validationNotes.map(note => `<li>${note}</li>`).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
        modal.classList.add('active');
    }

    showNotification('Design finalized and saved!', 'success');
}

// ============================================
// SEASONAL SIMULATION
// ============================================

function setupMonthlyTable() {
    const tbody = document.getElementById('monthly-data-tbody');
    if (!tbody) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const defaultEto = [4.5, 5.0, 5.5, 5.8, 5.5, 5.0, 4.8, 4.9, 4.7, 4.5, 4.3, 4.2];
    const defaultRainfall = [5, 10, 20, 50, 120, 100, 90, 110, 180, 150, 40, 10];

    tbody.innerHTML = months.map((month, i) => `
        <tr>
            <td><strong>${month}</strong></td>
            <td><input type="number" class="monthly-eto" data-month="${i}" value="${defaultEto[i]}" step="0.1" min="0" max="15"></td>
            <td><input type="number" class="monthly-rainfall" data-month="${i}" value="${defaultRainfall[i]}" step="0.1" min="0" max="300"></td>
        </tr>
    `).join('');
}

function loadScenarioPreset(scenario) {
    const tbody = document.getElementById('monthly-data-tbody');
    if (!tbody) return;

    const presets = {
        normal: {
            eto: [4.5, 5.0, 5.5, 5.8, 5.5, 5.0, 4.8, 4.9, 4.7, 4.5, 4.3, 4.2],
            rainfall: [5, 10, 20, 50, 120, 100, 90, 110, 180, 150, 40, 10]
        },
        dry: {
            eto: [5.0, 5.5, 6.0, 6.5, 6.0, 5.5, 5.3, 5.4, 5.2, 5.0, 4.8, 4.7],
            rainfall: [2, 5, 10, 20, 60, 50, 40, 50, 90, 70, 15, 5]
        },
        wet: {
            eto: [4.0, 4.5, 5.0, 5.2, 5.0, 4.5, 4.3, 4.4, 4.2, 4.0, 3.8, 3.7],
            rainfall: [10, 20, 40, 80, 180, 150, 140, 170, 250, 220, 70, 20]
        }
    };

    const preset = presets[scenario] || presets.normal;
    tbody.querySelectorAll('.monthly-eto').forEach((input, i) => {
        input.value = preset.eto[i];
    });
    tbody.querySelectorAll('.monthly-rainfall').forEach((input, i) => {
        input.value = preset.rainfall[i];
    });
}

function runSeasonalSimulation() {
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const kcInitial = parseFloat(document.getElementById('kc-initial')?.value || 0.3);
    const kcMid = parseFloat(document.getElementById('kc-mid')?.value || 1.0);
    const kcLate = parseFloat(document.getElementById('kc-late')?.value || 0.7);

    const monthlyData = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    document.querySelectorAll('.monthly-eto').forEach((input, i) => {
        const eto = parseFloat(input.value);
        const rainfallInput = document.querySelector(`.monthly-rainfall[data-month="${i}"]`);
        const rainfall = parseFloat(rainfallInput?.value || 0);

        // Determine Kc based on month (simplified: initial 3, mid 6, late 3)
        let kc;
        if (i < 3) kc = kcInitial;
        else if (i < 9) kc = kcMid;
        else kc = kcLate;

        const etc = kc * eto;
        const effectiveRainfall = rainfall * 0.8; // 80% efficiency
        const netIrrigation = Math.max(0, etc - effectiveRainfall);
        const waterDemand = netIrrigation * area * 10000; // L/day

        monthlyData.push({
            month: months[i],
            eto,
            rainfall,
            kc,
            waterDemand
        });
    });

    // Find peak month
    const peakMonth = monthlyData.reduce((max, curr) => 
        curr.waterDemand > max.waterDemand ? curr : max
    );

    // Update chart
    updateSeasonalChart(monthlyData);

    // Update summary
    const summaryContent = document.getElementById('seasonal-summary-content');
    if (summaryContent) {
        summaryContent.innerHTML = `
            <div style="display: grid; gap: 1rem;">
                <div>
                    <strong>Peak Demand Month:</strong> ${peakMonth.month}
                </div>
                <div>
                    <strong>Peak Demand:</strong> ${formatNumber(peakMonth.waterDemand)} L/day
                </div>
                <div>
                    <strong>Average Monthly Demand:</strong> ${formatNumber(monthlyData.reduce((sum, m) => sum + m.waterDemand, 0) / 12)} L/day
                </div>
                <div style="margin-top: 1rem; padding: 1rem; background: var(--grey-light); border-radius: var(--radius-sm);">
                    <strong>Design Recommendation:</strong><br>
                    System should be sized for peak month demand (${peakMonth.month}: ${formatNumber(peakMonth.waterDemand)} L/day)
                </div>
            </div>
        `;
    }

    showNotification('Seasonal simulation completed!', 'success');
}

function updateSeasonalChart(monthlyData) {
    const ctx = document.getElementById('seasonal-chart');
    if (!ctx) return;

    if (AppState.charts.seasonal) {
        AppState.charts.seasonal.destroy();
    }

    AppState.charts.seasonal = new Chart(ctx, {
        type: 'line',
        data: {
            labels: monthlyData.map(d => d.month),
            datasets: [{
                label: 'Water Demand (L/day)',
                data: monthlyData.map(d => d.waterDemand),
                borderColor: '#2d8659',
                backgroundColor: 'rgba(45, 134, 89, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Water Demand (L/day)'
                    }
                }
            }
        }
    });
}

// ============================================
// SUMMARY & REPORTS
// ============================================

function updateSummarySection() {
    const state = AppState.calculationState;
    const project = getCurrentProject();

    // Update KPIs
    const kpiHeadloss = document.getElementById('kpi-headloss');
    if (kpiHeadloss) {
        kpiHeadloss.textContent = formatNumber(state.headLoss, 2) + '%';
        const bar = document.getElementById('kpi-headloss-bar');
        if (bar) {
            bar.style.width = Math.min(100, (state.headLoss / 5) * 100) + '%';
            bar.style.background = state.headLoss > 5 ? '#e74c3c' : '#2d8659';
        }
    }

    const kpiLateral = document.getElementById('kpi-lateral');
    if (kpiLateral) {
        kpiLateral.textContent = formatNumber(state.maxLateralLength) + ' m';
        const bar = document.getElementById('kpi-lateral-bar');
        if (bar) {
            const maxLateral = parseFloat(document.getElementById('max-lateral')?.value || 100);
            bar.style.width = Math.min(100, (state.maxLateralLength / maxLateral) * 100) + '%';
        }
    }

    const kpiCost = document.getElementById('kpi-cost');
    if (kpiCost) {
        const total = state.bom.reduce((sum, item) => sum + item.total, 0);
        // Format with commas and always 2 decimal places
        const formatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(total);
        kpiCost.textContent = '$' + formatted;
    }

    // Update budget display
    const kpiBudget = document.getElementById('kpi-budget');
    if (kpiBudget) {
        const project = getCurrentProject();
        if (project && project.budget) {
            const total = state.bom.reduce((sum, item) => sum + item.total, 0);
            const budget = project.budget;
            const percentage = (total / budget) * 100;
            kpiBudget.textContent = `Budget: $${formatNumber(budget, 2)} (${formatNumber(percentage, 1)}% used)`;
            kpiBudget.style.color = percentage > 100 ? '#e74c3c' : percentage > 80 ? '#f39c12' : 'var(--text-medium)';
        } else {
            kpiBudget.textContent = 'Budget: Not set';
            kpiBudget.style.color = 'var(--text-medium)';
        }
    }

    const kpiPipelength = document.getElementById('kpi-pipelength');
    if (kpiPipelength) {
        kpiPipelength.textContent = formatNumber(state.pipeLength) + ' m';
    }

    // Update charts
    updateCostChart();
    updateZoneChart();

    // Update project summary
    const summaryContent = document.getElementById('project-summary-content');
    if (summaryContent) {
        if (project) {
            summaryContent.innerHTML = `
                <div style="display: grid; gap: 1rem;">
                    <div><strong>Project:</strong> ${project.name}</div>
                    <div><strong>Location:</strong> ${project.location}</div>
                    <div><strong>Area:</strong> ${project.area} ha</div>
                    <div><strong>Crop:</strong> ${project.crop}</div>
                    <div><strong>Last Updated:</strong> ${formatDate(project.lastUpdated)}</div>
                    <div style="margin-top: 1rem; padding: 1rem; background: var(--grey-light); border-radius: var(--radius-sm);">
                        <strong>Latest Metrics:</strong><br>
                        Water Demand: ${formatNumber(project.latestMetrics?.demandLday || 0)} L/day<br>
                        Pipe Length: ${formatNumber(project.latestMetrics?.totalPipeLength || 0)} m<br>
                        Head Loss: ${formatNumber(project.latestMetrics?.headLossPct || 0)}%<br>
                        Validation: ${project.latestMetrics?.validationOk ? '✓ OK' : '⚠ Needs Adjustment'}
                    </div>
                </div>
            `;
        } else {
            summaryContent.innerHTML = '<p>No project selected. Go to Dashboard to select or create a project.</p>';
        }
    }
}

function updateCostChart() {
    const ctx = document.getElementById('cost-chart');
    if (!ctx) return;

    const bom = AppState.calculationState.bom;
    if (bom.length === 0) return;

    if (AppState.charts.cost) {
        AppState.charts.cost.destroy();
    }

    AppState.charts.cost = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: bom.map(item => item.item),
            datasets: [{
                data: bom.map(item => item.total),
                backgroundColor: [
                    '#2d8659',
                    '#4a90e2',
                    '#6ba8f0',
                    '#3da372',
                    '#f39c12',
                    '#e74c3c',
                    '#9b59b6'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function updateZoneChart() {
    const ctx = document.getElementById('zone-chart');
    if (!ctx) return;

    const zones = calculateZones();
    const pipeLength = AppState.calculationState.pipeLength;
    const lengthPerZone = Math.ceil(pipeLength / zones);

    if (AppState.charts.zone) {
        AppState.charts.zone.destroy();
    }

    const zoneData = Array.from({ length: zones }, (_, i) => ({
        label: `Zone ${i + 1}`,
        length: lengthPerZone
    }));

    AppState.charts.zone = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: zoneData.map(z => z.label),
            datasets: [{
                label: 'Pipe Length (m)',
                data: zoneData.map(z => z.length),
                backgroundColor: '#2d8659'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Pipe Length (m)'
                    }
                }
            }
        }
    });
}

function downloadReport() {
    const project = getCurrentProject();
    const state = AppState.calculationState;

    if (!project) {
        showNotification('Please create or select a project first', 'warning');
        return;
    }

    // Use jsPDF to generate PDF report
    if (typeof window.jspdf !== 'undefined') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Title
        doc.setFontSize(18);
        doc.text('Irrigation System Design Report', 20, 20);

        // Project Info
        doc.setFontSize(12);
        doc.text(`Project: ${project.name}`, 20, 35);
        doc.text(`Location: ${project.location}`, 20, 42);
        doc.text(`Area: ${project.area} ha`, 20, 49);
        doc.text(`Crop: ${project.crop}`, 20, 56);

        // Results
        let y = 70;
        doc.setFontSize(14);
        doc.text('Design Results', 20, y);
        y += 10;
        doc.setFontSize(10);
        doc.text(`Water Demand: ${formatNumber(state.waterDemand)} L/day`, 20, y);
        y += 7;
        doc.text(`Total Pipe Length: ${formatNumber(state.pipeLength)} m`, 20, y);
        y += 7;
        doc.text(`Head Loss: ${formatNumber(state.headLoss, 2)}%`, 20, y);
        y += 7;
        doc.text(`Max Lateral Length: ${formatNumber(state.maxLateralLength)} m`, 20, y);
        y += 7;
        doc.text(`Validation: ${state.validationStatus === 'valid' ? 'OK' : 'Needs Adjustment'}`, 20, y);

        // BOM
        y += 15;
        doc.setFontSize(14);
        doc.text('Bill of Materials', 20, y);
        y += 10;
        doc.setFontSize(10);
        state.bom.forEach(item => {
            doc.text(`${item.item}: ${item.quantity} ${item.unit} - $${formatNumber(item.total, 2)}`, 20, y);
            y += 7;
        });

        const total = state.bom.reduce((sum, item) => sum + item.total, 0);
        y += 5;
        doc.setFontSize(12);
        doc.text(`Total Cost: $${formatNumber(total, 2)}`, 20, y);

        // Save PDF
        doc.save(`${project.name.replace(/\s+/g, '_')}_Report.pdf`);
        showNotification('Report downloaded successfully!', 'success');
    } else {
        // Fallback: show data in alert or console
        console.log('Report Data:', { project, state });
        showNotification('PDF library not loaded. Check console for report data.', 'warning');
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatNumber(num, decimals = 0) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background: ${type === 'success' ? 'var(--primary-green)' : type === 'warning' ? '#f39c12' : 'var(--soft-blue)'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 3000;
        animation: slideInRight 0.3s ease-out;
        max-width: 300px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add notification animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
