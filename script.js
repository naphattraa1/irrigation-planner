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
    satelliteSummary: null,
    layoutMode: 'heuristic', // 'heuristic' or 'ai'
    charts: {
        seasonal: null,
        cost: null,
        zone: null,
        seasonalETO: null
    },
    flowAnimation: null // For water flow animation on map
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
// SATELLITE PREPROCESSING (STUB)
// ============================================
// This module provides satellite/remote-sensing data preprocessing capabilities.
// Currently returns mock data, but can be extended to call external APIs
// (e.g., Google Earth Engine, Sentinel Hub, etc.) in the future.

/**
 * Preprocess satellite data for a given farm boundary.
 * This is a stub function that simulates calling an external satellite API.
 * 
 * @param {Array} boundaryLatLngs - Array of Leaflet LatLng objects representing the farm boundary
 * @returns {Object} Satellite data summary with NDVI, slope, and soil type
 */
function preprocessSatelliteData(boundaryLatLngs) {
    // TODO: Replace with actual API call to external satellite data service
    // Example: Google Earth Engine, Sentinel Hub, etc.
    // const response = await fetch('/api/satellite-data', {
    //     method: 'POST',
    //     body: JSON.stringify({ boundary: boundaryLatLngs })
    // });
    // const data = await response.json();
    
    // Mock data generation based on boundary
    // In a real implementation, this would be fetched from satellite imagery
    const latLngs = boundaryLatLngs.map(ll => 
        Array.isArray(ll) ? { lat: ll[0], lng: ll[1] } : ll
    );
    
    // Calculate approximate area for mock data variation
    const bounds = L.latLngBounds(latLngs);
    const center = bounds.getCenter();
    
    // Mock NDVI (Normalized Difference Vegetation Index) - ranges from -1 to 1, typically 0 to 1 for vegetation
    const ndviMean = 0.6 + (Math.random() * 0.3); // 0.6 to 0.9 (healthy vegetation)
    
    // Mock slope classification
    const slopeOptions = ['Flat', 'Moderate', 'Steep'];
    const slopeClass = slopeOptions[Math.floor(Math.random() * slopeOptions.length)];
    
    // Mock soil type
    const soilTypes = ['Loam', 'Clay', 'Sandy Loam', 'Clay Loam', 'Silt Loam'];
    const soilType = soilTypes[Math.floor(Math.random() * soilTypes.length)];
    
    const satelliteData = {
        ndviMean: parseFloat(ndviMean.toFixed(3)),
        slopeClass: slopeClass,
        soilType: soilType,
        timestamp: new Date().toISOString()
    };
    
    // Store in AppState for use throughout the application
    AppState.satelliteSummary = satelliteData;
    
    return satelliteData;
}

/**
 * Update the satellite data display in the UI.
 * 
 * @param {Object} satelliteData - Satellite data object from preprocessSatelliteData()
 */
function updateSatelliteDisplay(satelliteData) {
    const ndviEl = document.getElementById('satellite-ndvi');
    const slopeEl = document.getElementById('satellite-slope');
    const soilEl = document.getElementById('satellite-soil');
    
    if (ndviEl) {
        ndviEl.textContent = satelliteData.ndviMean ? satelliteData.ndviMean.toFixed(3) : 'N/A';
    }
    
    if (slopeEl) {
        slopeEl.textContent = satelliteData.slopeClass || 'N/A';
    }
    
    if (soilEl) {
        soilEl.textContent = satelliteData.soilType || 'N/A';
    }
}

// ============================================
// DESIGN REQUEST / RESPONSE SCHEMA
// ============================================
// These functions define the logical input/output structure of the irrigation design system.
// They can be used to:
// - Document the data flow in reports
// - Prepare data for backend API calls
// - Convert between UI state and structured design data

/**
 * Build a design request object from current UI inputs.
 * This represents the input schema for the irrigation design system.
 * 
 * @returns {Object} Design request object containing all relevant inputs
 */
function buildDesignRequestFromUI() {
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const cropType = document.getElementById('crop-type')?.value || 'Sugarcane';
    const kc = parseFloat(document.getElementById('kc')?.value || 0.9);
    const eto = parseFloat(document.getElementById('eto')?.value || 5.0);
    const rainfall = parseFloat(document.getElementById('rainfall')?.value || 0);
    const mainDiameter = parseFloat(document.getElementById('main-diameter')?.value || 110);
    const maxLateral = parseFloat(document.getElementById('max-lateral')?.value || 100);
    const project = getCurrentProject();
    
    // Get boundary coordinates from map
    let boundary = [];
    if (boundaryLayer) {
        const latLngs = boundaryLayer.getLatLngs()[0] || boundaryLayer.getLatLngs();
        boundary = latLngs.map(ll => 
            Array.isArray(ll) ? ll : [ll.lat, ll.lng]
        );
    }
    
    // Get scenario from seasonal simulation
    const scenario = document.getElementById('scenario-preset')?.value || 'normal';
    
    return {
        boundary: boundary,
        general: {
            area: area,
            cropType: cropType,
            location: project?.location || 'N/A',
            province: project?.location || 'N/A'
        },
        waterModel: {
            kc: kc,
            eto: eto,
            rainfall: rainfall
        },
        hydraulics: {
            mainDiameter: mainDiameter,
            maxLateral: maxLateral
        },
        designOptions: {
            layoutSource: AppState.layoutMode === 'ai' ? 'AI (stub)' : 'Heuristic (local)',
            scenario: scenario
        },
        timestamp: new Date().toISOString()
    };
}

/**
 * Build a design response object from current calculation state.
 * This represents the output schema for the irrigation design system.
 * 
 * @returns {Object} Design response object containing all calculated results
 */
function buildDesignResponseFromState() {
    const state = AppState.calculationState;
    const zones = calculateZones();
    const bomTotal = state.bom.reduce((sum, item) => sum + item.total, 0);
    const area = parseFloat(document.getElementById('area')?.value || 10);
    const pipeLength = state.pipeLength;
    const lengthPerZone = Math.ceil(pipeLength / zones);
    
    return {
        waterDemandLday: state.waterDemand,
        pipeLengthM: state.pipeLength,
        headLossPercent: state.headLoss,
        maxLateralLengthM: state.maxLateralLength,
        zones: {
            count: zones,
            lengthPerZoneM: lengthPerZone,
            details: Array.from({ length: zones }, (_, i) => ({
                zoneId: i + 1,
                lengthM: lengthPerZone
            }))
        },
        validation: {
            status: state.validationStatus,
            notes: state.validationNotes
        },
        satelliteSummary: AppState.satelliteSummary || {
            ndviMean: null,
            slopeClass: null,
            soilType: null
        },
        bom: state.bom.map(item => ({
            item: item.item,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            total: item.total
        })),
        totalCost: bomTotal,
        timestamp: new Date().toISOString()
    };
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

    // Layout mode selector
    const layoutModeSelect = document.getElementById('layout-mode');
    if (layoutModeSelect) {
        layoutModeSelect.addEventListener('change', function() {
            AppState.layoutMode = this.value;
        });
    }

    // Satellite data refresh button
    const refreshSatelliteBtn = document.getElementById('refresh-satellite');
    if (refreshSatelliteBtn) {
        refreshSatelliteBtn.addEventListener('click', function() {
            if (!boundaryLayer) {
                showNotification('Please generate a layout first to define the boundary', 'warning');
                return;
            }
            
            const latLngs = boundaryLayer.getLatLngs()[0] || boundaryLayer.getLatLngs();
            const satelliteData = preprocessSatelliteData(latLngs);
            updateSatelliteDisplay(satelliteData);
            showNotification('Satellite data refreshed!', 'success');
        });
    }

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

    // Show Design JSON button
    const showDesignJsonBtn = document.getElementById('show-design-json-btn');
    if (showDesignJsonBtn) {
        showDesignJsonBtn.addEventListener('click', showDesignJSON);
    }

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

// Water model & rules (FAO-56 style)
// ETc = Kc * ET0, net irrigation = max(0, ETc - effectiveRainfall)
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

// Hydraulic validation using Hazen–Williams equation
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

// Bill of Materials estimation based on pipe length, fittings, valves, emitters, pump, controller
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

// Heuristic network generation (MST/Steiner-like grid layout)
async function generateLayout() {
    if (!mapInitialized) {
        initializeMap();
    }

    // Build layout input from UI
    const layoutInput = buildDesignRequestFromUI();
    
    // Call AI layout hook (currently returns stub, can be replaced with AI API call)
    const result = await callAiLayout(layoutInput);
    updateLayoutSource(result.source);
    
    // Draw layout on map
    drawLayoutOnMap(result);
    
    showNotification('Layout generated successfully!', 'success');
}

/**
 * AI Layout Integration Hook
 * This function can be extended to call an actual AI backend service.
 * For now, it returns a stub result based on the selected layout mode.
 * 
 * @param {Object} layoutInput - Design request object from buildDesignRequestFromUI()
 * @returns {Promise<Object>} Layout result with source, layoutType, and geometry data
 */
async function callAiLayout(layoutInput) {
    // Determine layout mode
    const mode = AppState.layoutMode || 'heuristic';
    
    if (mode === 'ai') {
        // TODO: Replace with actual AI API call
        // Example:
        // const response = await fetch('/api/ai-generate-layout', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(layoutInput)
        // });
        // const aiResult = await response.json();
        // return {
        //     source: 'AI (stub)',
        //     layoutType: aiResult.layoutType,
        //     nodes: aiResult.nodes,
        //     edges: aiResult.edges,
        //     note: 'AI-generated layout'
        // };
        
        // Stub AI response
        return {
            source: 'AI (stub)',
            layoutType: 'grid',
            note: 'AI stub - would generate optimized layout here'
        };
    } else {
        // Heuristic mode (current implementation)
        return {
            source: 'Heuristic (local)',
            layoutType: 'grid',
            note: 'Heuristic grid layout generated locally'
        };
    }
}

/**
 * Draw layout on map based on layout result.
 * This function handles the actual drawing of pipes, nodes, and markers on the Leaflet map.
 * Currently uses heuristic drawing, but can be extended to use AI-generated node/edge data.
 * 
 * @param {Object} layoutResult - Result from callAiLayout()
 */
function drawLayoutOnMap(layoutResult) {
    // Clear existing layout
    if (pipelineLayer) {
        map.removeLayer(pipelineLayer);
        pipelineLayer = null;
    }
    
    // Stop any existing flow animation
    if (AppState.flowAnimation) {
        clearInterval(AppState.flowAnimation.interval);
        AppState.flowAnimation.markers.forEach(m => map.removeLayer(m));
        AppState.flowAnimation = null;
    }

    const area = parseFloat(document.getElementById('area')?.value || 10);
    const pipeLength = AppState.calculationState.pipeLength;
    const bounds = boundaryLayer.getBounds();
    const center = bounds.getCenter();

    // Enhanced layout: Main pipe, sub-mains, and laterals
    const layoutComponents = [];
    let mainPipe = null;
    let mainStart = null;
    let mainEnd = null;

    // Main pipe (thicker, vertical)
    mainStart = [center.lat - 0.0015, center.lng];
    mainEnd = [center.lat + 0.0015, center.lng];
    mainPipe = L.polyline([mainStart, mainEnd], {
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

    // TODO: Future enhancement - if layoutResult contains AI-generated nodes/edges,
    // use those instead of heuristic grid:
    // if (layoutResult.nodes && layoutResult.edges) {
    //     // Draw AI-generated network
    //     layoutResult.edges.forEach(edge => { ... });
    // }

    // Fit map to bounds
    const allBounds = L.latLngBounds(
        [...bounds.getSouthWest().toArray(), ...bounds.getNorthEast().toArray()]
    );
    map.fitBounds(allBounds, { padding: [50, 50] });
    
    // Start water flow animation on main pipe
    if (mainPipe && mainStart && mainEnd) {
        startWaterFlowAnimation(mainStart, mainEnd);
    }
}

/**
 * Start water flow animation on the main pipe to simulate water movement.
 * Creates animated circle markers that move along the pipe from pump to end.
 */
function startWaterFlowAnimation(startLatLng, endLatLng) {
    // Stop any existing animation
    if (AppState.flowAnimation) {
        clearInterval(AppState.flowAnimation.interval);
        AppState.flowAnimation.markers.forEach(m => map.removeLayer(m));
    }
    
    // Interpolate points along the pipe
    const numPoints = 5;
    const flowMarkers = [];
    
    // Create multiple flow markers
    for (let i = 0; i < numPoints; i++) {
        const progress = i / numPoints;
        const lat = startLatLng[0] + (endLatLng[0] - startLatLng[0]) * progress;
        const lng = startLatLng[1] + (endLatLng[1] - startLatLng[1]) * progress;
        
        const flowIcon = L.divIcon({
            className: 'water-flow-marker',
            html: '<div style="width: 12px; height: 12px; border-radius: 50%; background: #4a90e2; border: 2px solid white; box-shadow: 0 0 8px rgba(74, 144, 226, 0.8); animation: pulse 1.5s infinite;"></div>',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
        
        const marker = L.marker([lat, lng], { icon: flowIcon }).addTo(map);
        flowMarkers.push(marker);
    }
    
    // Animate markers moving along the pipe
    let progress = 0;
    const speed = 0.02; // Speed of animation (0 to 1 per interval)
    
    const interval = setInterval(() => {
        progress += speed;
        if (progress > 1) progress = 0; // Loop animation
        
        flowMarkers.forEach((marker, i) => {
            const markerProgress = (progress + i / numPoints) % 1;
            const lat = startLatLng[0] + (endLatLng[0] - startLatLng[0]) * markerProgress;
            const lng = startLatLng[1] + (endLatLng[1] - startLatLng[1]) * markerProgress;
            marker.setLatLng([lat, lng]);
        });
    }, 50); // Update every 50ms
    
    AppState.flowAnimation = {
        interval: interval,
        markers: flowMarkers
    };
}

// Add CSS for pulse animation (if not already in styles.css)
if (!document.getElementById('water-flow-animation-style')) {
    const style = document.createElement('style');
    style.id = 'water-flow-animation-style';
    style.textContent = `
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.3); opacity: 0.7; }
        }
        .water-flow-marker {
            background: transparent !important;
            border: none !important;
        }
    `;
    document.head.appendChild(style);
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
                        <i class="fas fa-satellite"></i> Satellite / Field Context
                    </h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div><strong>NDVI Mean:</strong> ${AppState.satelliteSummary?.ndviMean ? AppState.satelliteSummary.ndviMean.toFixed(3) : 'Not loaded'}</div>
                        <div><strong>Slope Class:</strong> ${AppState.satelliteSummary?.slopeClass || 'Not loaded'}</div>
                        <div><strong>Soil Type:</strong> ${AppState.satelliteSummary?.soilType || 'Not loaded'}</div>
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

    // Find peak month for water demand
    const peakMonth = monthlyData.reduce((max, curr) => 
        curr.waterDemand > max.waterDemand ? curr : max
    );

    // Find peak rainfall month
    const peakRainfallMonth = monthlyData.reduce((max, curr) => 
        curr.rainfall > max.rainfall ? curr : max
    );

    // Find peak ET₀ month
    const peakETOMonth = monthlyData.reduce((max, curr) => 
        curr.eto > max.eto ? curr : max
    );

    // Calculate averages
    const avgDemand = monthlyData.reduce((sum, m) => sum + m.waterDemand, 0) / 12;
    const avgRainfall = monthlyData.reduce((sum, m) => sum + m.rainfall, 0) / 12;
    const avgETO = monthlyData.reduce((sum, m) => sum + m.eto, 0) / 12;

    // Update charts
    updateSeasonalChart(monthlyData);
    updateSeasonalETOChart(monthlyData);

    // Update summary
    const summaryContent = document.getElementById('seasonal-summary-content');
    if (summaryContent) {
        summaryContent.innerHTML = `
            <div style="display: grid; gap: 1rem;">
                <div>
                    <strong>Peak Water Demand Month:</strong> ${peakMonth.month}
                </div>
                <div>
                    <strong>Peak Demand:</strong> ${formatNumber(peakMonth.waterDemand)} L/day
                </div>
                <div>
                    <strong>Average Monthly Demand:</strong> ${formatNumber(avgDemand)} L/day
                </div>
                <div>
                    <strong>Highest Rainfall Month:</strong> ${peakRainfallMonth.month} (${formatNumber(peakRainfallMonth.rainfall)} mm/day)
                </div>
                <div>
                    <strong>Highest ET₀ Month:</strong> ${peakETOMonth.month} (${formatNumber(peakETOMonth.eto, 1)} mm/day)
                </div>
                <div style="margin-top: 1rem; padding: 1rem; background: var(--grey-light); border-radius: var(--radius-sm);">
                    <strong>Design Recommendation:</strong><br>
                    System should be sized for peak month demand (${peakMonth.month}: ${formatNumber(peakMonth.waterDemand)} L/day). 
                    Peak rainfall occurs in ${peakRainfallMonth.month}, while peak ET₀ is in ${peakETOMonth.month}.
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

function updateSeasonalETOChart(monthlyData) {
    const ctx = document.getElementById('seasonal-eto-chart');
    if (!ctx) return;

    if (AppState.charts.seasonalETO) {
        AppState.charts.seasonalETO.destroy();
    }

    AppState.charts.seasonalETO = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthlyData.map(d => d.month),
            datasets: [
                {
                    label: 'ET₀ (mm/day)',
                    data: monthlyData.map(d => d.eto),
                    backgroundColor: 'rgba(74, 144, 226, 0.7)',
                    borderColor: '#4a90e2',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Rainfall (mm/day)',
                    data: monthlyData.map(d => d.rainfall),
                    type: 'line',
                    borderColor: '#2d8659',
                    backgroundColor: 'rgba(45, 134, 89, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'ET₀ (mm/day)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Rainfall (mm/day)'
                    },
                    grid: {
                        drawOnChartArea: false
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

        // Satellite Data
        if (AppState.satelliteSummary) {
            y += 15;
            doc.setFontSize(14);
            doc.text('Satellite / Field Context', 20, y);
            y += 10;
            doc.setFontSize(10);
            doc.text(`NDVI Mean: ${AppState.satelliteSummary.ndviMean ? AppState.satelliteSummary.ndviMean.toFixed(3) : 'N/A'}`, 20, y);
            y += 7;
            doc.text(`Slope Class: ${AppState.satelliteSummary.slopeClass || 'N/A'}`, 20, y);
            y += 7;
            doc.text(`Soil Type: ${AppState.satelliteSummary.soilType || 'N/A'}`, 20, y);
        }

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
// DESIGN JSON DISPLAY
// ============================================

/**
 * Show design request and response JSON in a modal for developer demo/debugging.
 */
function showDesignJSON() {
    const requestJson = buildDesignRequestFromUI();
    const responseJson = buildDesignResponseFromState();
    
    const requestEl = document.getElementById('design-request-json');
    const responseEl = document.getElementById('design-response-json');
    const modal = document.getElementById('design-json-modal');
    
    if (requestEl && responseEl && modal) {
        requestEl.textContent = JSON.stringify(requestJson, null, 2);
        responseEl.textContent = JSON.stringify(responseJson, null, 2);
        modal.classList.add('active');
        
        // Also log to console for easy copy-paste
        console.log('Design Request:', requestJson);
        console.log('Design Response:', responseJson);
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
