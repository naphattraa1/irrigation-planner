// ============================================
// GLOBAL STATE
// ============================================

let map = null;
let mapInitialized = false;
let pipelineLayer = null;
let boundaryLayer = null;
let calculationState = {
    waterDemand: 0,
    pipeLength: 0,
    headLoss: 0,
    maxLateralLength: 0,
    validationStatus: 'pending',
    validationNotes: [],
    bom: []
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    setupEventListeners();
    syncSliderAndInput();
    calculateAll();
});

// ============================================
// MAP INITIALIZATION (Leaflet)
// ============================================

function initializeMap() {
    if (mapInitialized) return;
    
    map = L.map('map-container').setView([13.7563, 100.5018], 15); // Default: Bangkok
    
    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    // Add satellite layer option (using Esri World Imagery)
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        maxZoom: 19
    });
    
    // Layer control
    const baseMaps = {
        "Street Map": L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }),
        "Satellite": satelliteLayer
    };
    
    L.control.layers(baseMaps).addTo(map);
    
    // Add default boundary polygon (dummy rectangular field)
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

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Input synchronization
    const areaSlider = document.getElementById('area');
    const areaValue = document.getElementById('area-value');
    
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
    
    // All input changes trigger recalculation
    ['kc', 'eto', 'rainfall', 'main-diameter', 'max-lateral'].forEach(id => {
        document.getElementById(id).addEventListener('change', calculateAll);
        document.getElementById(id).addEventListener('input', calculateAll);
    });
    
    // Action buttons
    document.getElementById('calculate-demand').addEventListener('click', calculateAll);
    document.getElementById('generate-layout').addEventListener('click', generateLayout);
    document.getElementById('validate-hydraulics').addEventListener('click', validateHydraulics);
    document.getElementById('show-bom').addEventListener('click', showBOM);
    document.getElementById('finalize-design').addEventListener('click', finalizeDesign);
    
    // Modal close on outside click
    document.getElementById('finalize-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeModal();
        }
    });
}

function syncSliderAndInput() {
    const areaSlider = document.getElementById('area');
    const areaValue = document.getElementById('area-value');
    areaValue.value = areaSlider.value;
}

// ============================================
// CALCULATION FUNCTIONS
// ============================================

/**
 * FAO-56 Water Demand Calculation
 * ETc = Kc * ET0
 * Water Demand = (ETc - Rainfall) * Area * 10,000 * 1000 / 1000
 * Returns: L/day
 */
function calculateWaterDemand() {
    const area = parseFloat(document.getElementById('area').value); // ha
    const kc = parseFloat(document.getElementById('kc').value);
    const eto = parseFloat(document.getElementById('eto').value); // mm/day
    const rainfall = parseFloat(document.getElementById('rainfall').value); // mm/day
    
    // Crop evapotranspiration (ETc)
    const etc = kc * eto; // mm/day
    
    // Net irrigation requirement (after accounting for rainfall)
    const netIrrigation = Math.max(0, etc - rainfall); // mm/day
    
    // Convert to L/day: (mm/day) * (ha) * (10,000 m²/ha) * (1 L/m² per mm)
    const waterDemand = netIrrigation * area * 10000; // L/day
    
    return waterDemand;
}

/**
 * Pipe Length Heuristic
 * Estimates total pipe length based on area
 * Returns: meters
 */
function calculatePipeLength() {
    const area = parseFloat(document.getElementById('area').value); // ha
    const areaM2 = area * 10000; // m²
    
    // Heuristic: assume grid layout with spacing
    // Approximate: sqrt(area) * 2 (main + laterals) * 1.2 (efficiency factor)
    const sideLength = Math.sqrt(areaM2); // meters
    const estimatedLength = sideLength * 2 * 1.2; // meters
    
    return Math.round(estimatedLength);
}

/**
 * Hazen-Williams Head Loss Calculation
 * hf = 10.67 * Q^1.852 * L / (C^1.852 * D^4.871)
 * Returns: head loss percentage
 */
function calculateHeadLoss() {
    const waterDemand = calculateWaterDemand(); // L/day
    const flowRate = waterDemand / (24 * 3600); // L/s
    const flowRateM3s = flowRate / 1000; // m³/s
    
    const diameter = parseFloat(document.getElementById('main-diameter').value) / 1000; // m
    const length = calculatePipeLength(); // m
    const C = 150; // Hazen-Williams coefficient for PVC
    
    // Hazen-Williams formula
    const hf = 10.67 * Math.pow(flowRateM3s, 1.852) * length / (Math.pow(C, 1.852) * Math.pow(diameter, 4.871));
    
    // Assume typical operating pressure of 30m (3 bar)
    const operatingHead = 30; // meters
    const headLossPercent = (hf / operatingHead) * 100;
    
    return Math.max(0, Math.min(100, headLossPercent));
}

/**
 * Maximum Lateral Length Calculation
 * Based on pressure drop and flow requirements
 * Returns: meters
 */
function calculateMaxLateralLength() {
    const diameter = parseFloat(document.getElementById('main-diameter').value); // mm
    const maxLateral = parseFloat(document.getElementById('max-lateral').value); // m
    
    // Theoretical calculation based on pressure drop
    // Simplified: use input value but validate against hydraulic constraints
    const waterDemand = calculateWaterDemand();
    const flowPerLateral = waterDemand / 10; // Assume 10 laterals
    const flowRate = flowPerLateral / (24 * 3600 * 1000); // m³/s
    
    const diameterM = diameter / 1000;
    const C = 150;
    
    // Calculate max length for 5% head loss
    const maxHeadLoss = 0.05 * 30; // 5% of operating head
    const maxLength = (maxHeadLoss * Math.pow(C, 1.852) * Math.pow(diameterM, 4.871)) / 
                      (10.67 * Math.pow(flowRate, 1.852));
    
    return Math.min(maxLateral, Math.max(50, maxLength));
}

/**
 * Zone Splitting Logic
 * Determines number of zones based on area and water demand
 */
function calculateZones() {
    const area = parseFloat(document.getElementById('area').value);
    const waterDemand = calculateWaterDemand();
    
    // Assume each zone can handle 50,000 L/day
    const maxZoneCapacity = 50000; // L/day
    const zones = Math.ceil(waterDemand / maxZoneCapacity);
    
    return Math.max(1, zones);
}

/**
 * Bill of Materials Calculation
 * Returns array of BOM items
 */
function calculateBOM() {
    const area = parseFloat(document.getElementById('area').value);
    const diameter = parseFloat(document.getElementById('main-diameter').value);
    const pipeLength = calculatePipeLength();
    const zones = calculateZones();
    const waterDemand = calculateWaterDemand();
    
    // Pricing (example values in USD)
    const prices = {
        pipe: {
            50: 2.5,
            63: 3.0,
            75: 3.5,
            90: 4.0,
            110: 5.0,
            125: 6.0,
            140: 7.0,
            160: 8.0
        },
        fittings: 15,
        valves: 25,
        emitters: 0.5,
        pump: 500,
        controller: 200
    };
    
    const bom = [];
    
    // Main pipe
    const pipePrice = prices.pipe[diameter] || 5.0;
    bom.push({
        item: `Main Pipe (${diameter}mm)`,
        quantity: Math.ceil(pipeLength),
        unit: 'm',
        unitPrice: pipePrice,
        total: Math.ceil(pipeLength) * pipePrice
    });
    
    // Lateral pipes (assume 50% of main length)
    const lateralLength = Math.ceil(pipeLength * 0.5);
    bom.push({
        item: 'Lateral Pipes (16mm)',
        quantity: lateralLength,
        unit: 'm',
        unitPrice: 1.5,
        total: lateralLength * 1.5
    });
    
    // Fittings
    const numFittings = Math.ceil(pipeLength / 20); // Fitting every 20m
    bom.push({
        item: 'Pipe Fittings',
        quantity: numFittings,
        unit: 'pcs',
        unitPrice: prices.fittings,
        total: numFittings * prices.fittings
    });
    
    // Valves (one per zone)
    bom.push({
        item: 'Control Valves',
        quantity: zones,
        unit: 'pcs',
        unitPrice: prices.valves,
        total: zones * prices.valves
    });
    
    // Emitters (assume 1 per m²)
    const numEmitters = Math.ceil(area * 10000);
    bom.push({
        item: 'Drip Emitters',
        quantity: numEmitters,
        unit: 'pcs',
        unitPrice: prices.emitters,
        total: numEmitters * prices.emitters
    });
    
    // Pump (one per system)
    bom.push({
        item: 'Irrigation Pump',
        quantity: 1,
        unit: 'pcs',
        unitPrice: prices.pump,
        total: prices.pump
    });
    
    // Controller
    bom.push({
        item: 'Irrigation Controller',
        quantity: 1,
        unit: 'pcs',
        unitPrice: prices.controller,
        total: prices.controller
    });
    
    return bom;
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

function calculateAll() {
    calculationState.waterDemand = calculateWaterDemand();
    calculationState.pipeLength = calculatePipeLength();
    calculationState.headLoss = calculateHeadLoss();
    calculationState.maxLateralLength = calculateMaxLateralLength();
    calculationState.bom = calculateBOM();
    
    updateOutputs();
}

function updateOutputs() {
    // Update water demand
    document.getElementById('water-demand').textContent = 
        formatNumber(calculationState.waterDemand);
    
    // Update pipe length
    document.getElementById('pipe-length').textContent = 
        formatNumber(calculationState.pipeLength);
    
    // Update head loss
    document.getElementById('head-loss').textContent = 
        formatNumber(calculationState.headLoss, 2) + '%';
    
    // Update max lateral
    document.getElementById('max-lateral-output').textContent = 
        formatNumber(calculationState.maxLateralLength);
}

// ============================================
// LAYOUT GENERATION
// ============================================

function generateLayout() {
    if (!mapInitialized) {
        initializeMap();
    }
    
    // Clear existing pipeline
    if (pipelineLayer) {
        map.removeLayer(pipelineLayer);
    }
    
    const area = parseFloat(document.getElementById('area').value);
    const pipeLength = calculationState.pipeLength;
    
    // Get boundary bounds
    const bounds = boundaryLayer.getBounds();
    const center = bounds.getCenter();
    
    // Generate pipeline layout (simplified grid pattern)
    const pipelinePoints = [];
    
    // Main line (vertical)
    const mainStart = [center.lat - 0.001, center.lng];
    const mainEnd = [center.lat + 0.001, center.lng];
    pipelinePoints.push([mainStart, mainEnd]);
    
    // Lateral lines (horizontal, spaced)
    const numLaterals = Math.floor(pipeLength / 100);
    for (let i = 0; i < numLaterals; i++) {
        const latOffset = (i - numLaterals / 2) * 0.0003;
        const lateralStart = [center.lat + latOffset, center.lng - 0.0015];
        const lateralEnd = [center.lat + latOffset, center.lng + 0.0015];
        pipelinePoints.push([lateralStart, lateralEnd]);
    }
    
    // Create polyline group
    const pipelineLines = pipelinePoints.map(points => {
        return L.polyline(points, {
            color: '#4a90e2',
            weight: 4,
            opacity: 0.8
        });
    });
    
    pipelineLayer = L.layerGroup(pipelineLines);
    pipelineLayer.addTo(map);
    
    // Fit map to show both boundary and pipeline
    const allBounds = L.latLngBounds(
        [...bounds.getSouthWest().toArray(), ...bounds.getNorthEast().toArray()]
    );
    map.fitBounds(allBounds, { padding: [50, 50] });
    
    // Show success message
    showNotification('Layout generated successfully!', 'success');
}

// ============================================
// VALIDATION
// ============================================

function validateHydraulics() {
    const validationNotes = [];
    let isValid = true;
    
    // Check head loss
    if (calculationState.headLoss > 15) {
        validationNotes.push('Head loss exceeds 15% - consider larger pipe diameter');
        isValid = false;
    } else if (calculationState.headLoss > 10) {
        validationNotes.push('Head loss is high (10-15%) - monitor pressure');
    } else {
        validationNotes.push('Head loss is within acceptable range');
    }
    
    // Check max lateral length
    const maxLateralInput = parseFloat(document.getElementById('max-lateral').value);
    if (calculationState.maxLateralLength < maxLateralInput * 0.8) {
        validationNotes.push('Maximum lateral length may be too long for current setup');
        isValid = false;
    }
    
    // Check water demand
    if (calculationState.waterDemand > 100000) {
        validationNotes.push('High water demand - consider zone splitting');
    }
    
    // Check pipe diameter vs area
    const area = parseFloat(document.getElementById('area').value);
    const diameter = parseFloat(document.getElementById('main-diameter').value);
    if (area > 50 && diameter < 110) {
        validationNotes.push('Large area detected - consider larger main pipe');
        isValid = false;
    }
    
    calculationState.validationStatus = isValid ? 'valid' : 'invalid';
    calculationState.validationNotes = validationNotes;
    
    updateValidationDisplay();
    showNotification(isValid ? 'Validation passed!' : 'Validation issues found', isValid ? 'success' : 'warning');
}

function updateValidationDisplay() {
    const card = document.getElementById('validation-card');
    const status = document.getElementById('validation-status');
    const notes = document.getElementById('validation-notes');
    const icon = document.getElementById('validation-icon');
    
    if (calculationState.validationStatus === 'valid') {
        card.className = 'output-card validation-card valid';
        status.textContent = 'Valid';
        icon.className = 'fas fa-check-circle';
        notes.textContent = calculationState.validationNotes.join(' • ');
    } else if (calculationState.validationStatus === 'invalid') {
        card.className = 'output-card validation-card invalid';
        status.textContent = 'Needs Adjustment';
        icon.className = 'fas fa-exclamation-triangle';
        notes.textContent = calculationState.validationNotes.join(' • ');
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
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Add BOM rows
    let total = 0;
    calculationState.bom.forEach(item => {
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
    
    // Add total row
    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
        <td colspan="4" style="text-align: right; font-weight: 600;">Total:</td>
        <td style="font-weight: 600;">$${formatNumber(total, 2)}</td>
    `;
    tbody.appendChild(totalRow);
    
    // Show container
    container.style.display = 'block';
    
    // Scroll to BOM
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    showNotification('BOM generated successfully!', 'success');
}

// ============================================
// FINALIZE DESIGN MODAL
// ============================================

function finalizeDesign() {
    const modal = document.getElementById('finalize-modal');
    const modalBody = document.getElementById('modal-body');
    
    const area = parseFloat(document.getElementById('area').value);
    const kc = parseFloat(document.getElementById('kc').value);
    const eto = parseFloat(document.getElementById('eto').value);
    const rainfall = parseFloat(document.getElementById('rainfall').value);
    const diameter = parseFloat(document.getElementById('main-diameter').value);
    const maxLateral = parseFloat(document.getElementById('max-lateral').value);
    const zones = calculateZones();
    const bomTotal = calculationState.bom.reduce((sum, item) => sum + item.total, 0);
    
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
                    <div><strong>Pipe Length:</strong> ${formatNumber(calculationState.pipeLength)} m</div>
                </div>
            </div>
            
            <div>
                <h3 style="color: var(--primary-green); margin-bottom: 1rem;">
                    <i class="fas fa-chart-line"></i> Results
                </h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                    <div><strong>Water Demand:</strong> ${formatNumber(calculationState.waterDemand)} L/day</div>
                    <div><strong>Head Loss:</strong> ${formatNumber(calculationState.headLoss, 2)}%</div>
                    <div><strong>Max Lateral Length:</strong> ${formatNumber(calculationState.maxLateralLength)} m</div>
                    <div><strong>Validation:</strong> ${calculationState.validationStatus === 'valid' ? '✓ Valid' : '⚠ Needs Adjustment'}</div>
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
            
            ${calculationState.validationNotes.length > 0 ? `
                <div style="background: var(--grey-light); padding: 1rem; border-radius: var(--radius-md);">
                    <h4 style="margin-bottom: 0.5rem;">Validation Notes:</h4>
                    <ul style="margin-left: 1.5rem;">
                        ${calculationState.validationNotes.map(note => `<li>${note}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
    
    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('finalize-modal').classList.remove('active');
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

function scrollToSection(sectionId) {
    document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
}

function showNotification(message, type = 'info') {
    // Simple notification (can be enhanced with a proper notification library)
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
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add notification animations to CSS dynamically
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

