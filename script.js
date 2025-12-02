// script.js
// AI-Assisted Irrigation Planner (Thai units: Rai + Baht)
// Uses FAO-56 + Hazen–Williams to keep numbers realistic

// -------------------------
// GLOBAL CONSTANTS & HELPERS
// -------------------------

const RAI_PER_HA = 6.25;
const DEFAULT_STAGE_DAYS = {
  initial: 20,
  development: 30,
  mid: 40,
  late: 30,
};

function $(id) {
  return document.getElementById(id);
}

function openModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add("active");
}

function closeModal(id) {
  const modal = $(id);
  if (modal) modal.classList.remove("active");
}

function generateId() {
  return "proj_" + Math.random().toString(36).substring(2, 9);
}

// Unit helpers
function getAreaRaiFromInput() {
  return parseFloat($("area")?.value || "10"); // slider/planner area
}

function raiToHa(rai) {
  return rai / RAI_PER_HA;
}

// -------------------------
// GLOBAL STATE
// -------------------------

let projects = [];
let currentProjectId = null;

let map;
let mapInitialized = false;
let layoutLayerGroup;
let flowAnimationInterval = null;
let lastPlannerDesign = null;

let seasonalChart = null;
let seasonalEtoChart = null;
let costChart = null;
let zoneChart = null;

// -------------------------
// SIDEBAR NAV
// -------------------------

function initSidebar() {
  const sidebar = $("sidebar");
  const toggle = $("sidebar-toggle");
  const navItems = document.querySelectorAll(".nav-item");
  const sections = document.querySelectorAll(".content-section");

  if (toggle) {
    toggle.addEventListener("click", () => {
      sidebar.classList.toggle("active");
    });
  }

  navItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const target = item.getAttribute("data-section");
      if (!target) return;

      navItems.forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      sections.forEach((sec) => {
        sec.classList.toggle("active", sec.id === target);
      });

      if (target === "planner") {
        initializeMap();
      }
    });
  });
}

// -------------------------
// PROJECT DASHBOARD
// -------------------------

function renderProjectsGrid() {
  const grid = $("projects-grid");
  const emptyState = $("empty-state");

  grid.innerHTML = "";

  if (!projects.length) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  projects.forEach((proj) => {
    const card = document.createElement("div");
    card.className = "project-card";
    card.dataset.id = proj.id;

    const statusClass = proj.validation?.valid ? "valid" : "invalid";
    const statusText = proj.validation?.valid ? "Valid" : "Not Valid";

    card.innerHTML = `
      <div class="project-card-header">
        <div>
          <div class="project-card-title">${proj.name}</div>
          <div class="project-card-location">
            <i class="fas fa-map-marker-alt"></i>
            <span>${proj.location || "Location not set"}</span>
          </div>
        </div>
        <div class="project-card-actions">
          <button class="project-card-action" data-action="edit">
            <i class="fas fa-pen"></i>
          </button>
          <button class="project-card-action" data-action="delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
      <span class="project-card-badge ${statusClass}">${statusText}</span>
      <div class="project-card-metrics">
        <div class="project-metric">
          <span class="project-metric-label">Area</span>
          <span class="project-metric-value">${proj.areaRai || "-"} Rai</span>
        </div>
        <div class="project-metric">
          <span class="project-metric-label">Water Demand</span>
          <span class="project-metric-value">${proj.metrics?.waterDemand || "-"} L/day</span>
        </div>
        <div class="project-metric">
          <span class="project-metric-label">Pipe Length</span>
          <span class="project-metric-value">${proj.metrics?.pipeLength || "-"} m</span>
        </div>
        <div class="project-metric">
          <span class="project-metric-label">Head Loss</span>
          <span class="project-metric-value">${proj.metrics?.headLoss || "-"} %</span>
        </div>
      </div>
    `;

    // select card
    card.addEventListener("click", (e) => {
      if (e.target.closest(".project-card-action")) return;
      setCurrentProject(proj.id);
    });

    // edit / delete buttons
    card.querySelectorAll(".project-card-action").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === "delete") {
          projects = projects.filter((p) => p.id !== proj.id);
          if (currentProjectId === proj.id) {
            currentProjectId = null;
            updateCurrentProjectBadge(null);
          }
          renderProjectsGrid();
        } else if (action === "edit") {
          loadProjectToModal(proj);
        }
      });
    });

    grid.appendChild(card);
  });
}

function loadProjectToModal(project) {
  $("project-name-input").value = project.name;
  $("project-location-input").value = project.location || "";
  $("project-area-input").value = project.areaRai || 10;
  $("project-crop-input").value = project.cropType || "Sugarcane";

  const saveBtn = $("save-project-btn");
  saveBtn.textContent = "Save Changes";

  const defaultHandler = saveProjectFromModal;
  const editHandler = () => {
    project.name = $("project-name-input").value || "Untitled Project";
    project.location = $("project-location-input").value || "";
    project.areaRai = parseFloat($("project-area-input").value) || 10;
    project.cropType = $("project-crop-input").value || "Sugarcane";

    closeModal("new-project-modal");
    saveBtn.removeEventListener("click", editHandler);
    saveBtn.addEventListener("click", defaultHandler);
    saveBtn.textContent = "Create Project";

    renderProjectsGrid();
    setCurrentProject(project.id);
  };

  saveBtn.removeEventListener("click", defaultHandler);
  saveBtn.addEventListener("click", editHandler);

  openModal("new-project-modal");
}

function saveProjectFromModal() {
  const name = $("project-name-input").value.trim() || "Untitled Project";
  const location = $("project-location-input").value.trim();
  const areaRai = parseFloat($("project-area-input").value) || 10;
  const cropType = $("project-crop-input").value || "Sugarcane";

  const newProject = {
    id: generateId(),
    name,
    location,
    areaRai,
    cropType,
    metrics: {},
    validation: {
      valid: false,
      notes: "Not validated yet",
    },
  };

  projects.push(newProject);
  closeModal("new-project-modal");
  renderProjectsGrid();
  setCurrentProject(newProject.id);
}

function setCurrentProject(projectId) {
  currentProjectId = projectId;
  const project = projects.find((p) => p.id === projectId);
  updateSummaryFromProject(project);

  if (!project) return;

  $("crop-type").value = project.cropType || "Sugarcane";
  $("area").value = project.areaRai || 10;
  $("area-value").value = project.areaRai || 10;

  if (project.metrics) {
    $("water-demand").textContent = project.metrics.waterDemand || 0;
    $("pipe-length").textContent = project.metrics.pipeLength || 0;
    $("head-loss").textContent = project.metrics.headLoss || 0;
    $("max-lateral-output").textContent = project.metrics.maxLateral || 0;
  }

  if (project.validation) {
    applyValidationCard(project.validation.valid, project.validation.notes || "");
  }
}

function updateCurrentProjectBadge(project) {
  const badge = $("current-project-badge");
  const nameSpan = $("current-project-name");
  const summaryCard = $("project-summary-content");

  if (!project) {
    badge.style.display = "none";
    nameSpan.textContent = "No project selected";
    summaryCard.innerHTML =
      "<p>No project selected. Go to Dashboard to select or create a project.</p>";
    return;
  }

  badge.style.display = "inline-flex";
  nameSpan.textContent = project.name;

  summaryCard.innerHTML = `
    <p><strong>Project:</strong> ${project.name}</p>
    <p><strong>Location:</strong> ${project.location || "Not set"}</p>
    <p><strong>Area:</strong> ${project.areaRai || "-"} Rai</p>
    <p><strong>Crop Type:</strong> ${project.cropType || "-"}</p>
    <p><strong>Water Demand:</strong> ${project.metrics?.waterDemand || "-"} L/day</p>
    <p><strong>Pipe Length:</strong> ${project.metrics?.pipeLength || "-"} m</p>
    <p><strong>Head Loss:</strong> ${project.metrics?.headLoss || "-"} %</p>
    <p><strong>Total Cost:</strong> ${
      project.metrics?.totalCost ? `฿${project.metrics.totalCost}` : "-"
    }</p>
  `;
}

// -------------------------
// PLANNER INPUTS & CORE CALCULATION
// -------------------------

function getPlannerInputs() {
  const cropType = $("crop-type").value;
  const areaRai = getAreaRaiFromInput();
  const kc = parseFloat($("kc").value || "0.9"); // fallback single Kc
  const kcInitial = parseFloat($("kc-initial")?.value || $("kc")?.value || "0.3");
  const kcDevelopment = parseFloat($("kc-development")?.value || "0.7");
  const kcMid = parseFloat($("kc-mid")?.value || "1.0");
  const kcLate = parseFloat($("kc-late")?.value || "0.7");
  const eto = parseFloat($("eto").value || "5");
  const rainfall = parseFloat($("rainfall").value || "0");
  const efficiency = parseFloat($("efficiency")?.value || "80");
  const mainDiameter = parseInt($("main-diameter").value || "110", 10);
  const maxLateral = parseInt($("max-lateral").value || "100", 10);
  const hoursPerDay = parseFloat($("hoursPerDay")?.value || "8");
  const spacingX = parseFloat($("spacingX")?.value || "12"); // m spacing between sprinklers (row)
  const spacingY = parseFloat($("spacingY")?.value || "12"); // m spacing between laterals
  const layoutMode = $("layout-mode").value;

  return {
    cropType,
    areaRai,
    kc,
    kcInitial,
    kcDevelopment,
    kcMid,
    kcLate,
    eto,
    rainfall,
    efficiency,
    mainDiameter,
    maxLateral,
    hoursPerDay,
    spacingX,
    spacingY,
    layoutMode,
  };
}

// Weighted seasonal Kc using four stages (default durations mirror FAO tables)
function computeSeasonalKc(inputs) {
  const stageDays = DEFAULT_STAGE_DAYS;
  const totalDays = stageDays.initial + stageDays.development + stageDays.mid + stageDays.late;
  const weightedKc =
    (inputs.kcInitial * stageDays.initial +
      inputs.kcDevelopment * stageDays.development +
      inputs.kcMid * stageDays.mid +
      inputs.kcLate * stageDays.late) /
    totalDays;
  return weightedKc || inputs.kc || 1.0;
}

// FAO56/USDA-SCS effective rainfall (mm/day equivalent; using daily input directly)
function calculateEffectiveRainFAO56(rainfallMm) {
  const P = Math.max(0, rainfallMm);
  let Pe = 0;
  if (P <= 250) {
    Pe = (P * (125 - 0.2 * P)) / 125;
  } else {
    Pe = 125 + 0.1 * P;
  }
  return Math.max(0, Pe);
}

// Layout estimation for main + laterals from area and spacing
function calculateLayoutLengths(areaM2, spacingY, layoutMode) {
  const fieldSide = Math.sqrt(Math.max(1, areaM2)); // assume square
  const lateralSpacing = Math.max(0.5, spacingY || 12);
  const lateralCount = Math.max(1, Math.ceil(fieldSide / lateralSpacing));
  const baseLateralLength = fieldSide * lateralCount;
  const baseMainLength = fieldSide;

  // Simple layout-mode tweak: AI assumed 10% more efficient, heuristic adds 5% allowance
  const factor = layoutMode === "ai" ? 0.9 : 1.05;
  const mainLength = baseMainLength * factor;
  const lateralLength = baseLateralLength * factor;

  return {
    fieldSide,
    lateralCount,
    avgLateralLength: fieldSide,
    mainLength: Math.max(10, Math.round(mainLength)),
    lateralLength: Math.max(10, Math.round(lateralLength)),
    totalPipeLength: Math.max(20, Math.round(mainLength + lateralLength)),
  };
}

// Hazen–Williams hydraulic helper (returns head-loss %, velocity, total head)
function calculateHydraulics(flowM3s, totalPipeLength, mainDiameterMm, lateralLength, operatingHead = 30) {
  const diameterM = (mainDiameterMm || 110) / 1000; // m
  const length = Math.max(1, totalPipeLength || 100); // m
  const C = 150; // smooth PVC

  const hf =
    (10.67 * Math.pow(flowM3s, 1.852) * length) /
    (Math.pow(C, 1.852) * Math.pow(diameterM, 4.871)); // m

  const headLossPercent = (hf / operatingHead) * 100;
  const lateralHeadLossPercent =
    ((hf * (lateralLength || length) / length) / operatingHead) * 100;
  const area = Math.PI * Math.pow(diameterM, 2) * 0.25;
  const velocity = area > 0 ? flowM3s / area : 0;

  return {
    hf,
    headLossPercent: Math.max(0, Math.min(100, +headLossPercent.toFixed(2))),
    lateralHeadLossPercent: Math.max(0, Math.min(100, +lateralHeadLossPercent.toFixed(2))),
    velocity: +velocity.toFixed(3),
    withinLimit: headLossPercent <= 5 && lateralHeadLossPercent <= 5,
    totalHead: operatingHead + hf,
  };
}

function calculatePumpPowerHP(flowLps, totalHead, pumpEfficiency = 0.65) {
  // pumpPower = (Q (L/s) × head (m)) / (eff × 75)
  const hp = (flowLps * totalHead) / (pumpEfficiency * 75);
  return {
    hp: +hp.toFixed(2),
    kw: +((hp || 0) * 0.746).toFixed(2),
  };
}

// ✅ FAO-56 style water demand (input Rai → m²) with multi-stage Kc and effective rainfall
function calculateWaterDemandLperDay(inputs) {
  const areaRai = parseFloat(inputs.areaRai) || 0;
  const areaM2 = areaRai * 1600; // 1 Rai = 1,600 m²
  const seasonalKc = computeSeasonalKc(inputs);
  const etc = inputs.eto * seasonalKc; // mm/day
  const effectiveRain = calculateEffectiveRainFAO56(inputs.rainfall); // mm/day
  const netIrrigation = Math.max(0, etc - effectiveRain); // NIR (mm/day)
  const efficiency = Math.max(0.01, (parseFloat(inputs.efficiency) || 80) / 100);
  const appliedDepth = netIrrigation / efficiency; // GIR (mm/day applied)

  // 1 mm over 1 m² = 1 liter
  const waterDemand = appliedDepth * areaM2; // L/day

  // Example check for 10 Rai:
  // areaRai = 10, Kc = 0.3, ETo = 5, rainfall = 0
  // ETc = 1.5 mm/day → netIrrigation = 1.5
  // With efficiency = 80% (0.8):
  // appliedDepth = 1.5 / 0.8 = 1.875 mm/day
  // areaM2 = 10 * 1600 = 16,000 m²
  // waterDemand = 1.875 * 16,000 = 30,000 L/day
  return {
    areaM2,
    seasonalKc,
    etc,
    effectiveRain,
    netIrrigation,
    efficiency,
    appliedDepth,
    waterDemandLday: waterDemand,
  };
}

// ✅ Pipe length (approx.) – now based on spacing/layout and area
function calculatePipeLengthFromArea(inputs) {
  const areaM2 = (parseFloat(inputs.areaRai) || 0) * 1600;
  const layout = calculateLayoutLengths(areaM2, inputs.spacingY, inputs.layoutMode);
  return layout.totalPipeLength;
}

// ✅ Wrapper to keep legacy signature, but uses new hydraulic model
function calculateHeadLossPercent(waterDemandLday, pipeLength, mainDiameterMm, hoursPerDayOverride, lateralLengthOverride) {
  const hoursPerDay = parseFloat(
    hoursPerDayOverride ?? $("hoursPerDay")?.value ?? "24"
  );
  const secondsPerDay = Math.max(1, hoursPerDay) * 3600;
  const flowRateLps = waterDemandLday / secondsPerDay; // L/s based on operation hours
  const hydraulics = calculateHydraulics(
    flowRateLps / 1000,
    pipeLength,
    mainDiameterMm,
    lateralLengthOverride || pipeLength * 0.6
  );
  return hydraulics.headLossPercent;
}

// ✅ Max lateral length (friction limit ~5%) using Hazen–Williams on an assumed lateral share of total flow
function calculateMaxLateralLengthFromDemand(waterDemandLday, mainDiameterMm, userMaxLateral) {
  const diameter = parseFloat(mainDiameterMm || 110);
  const maxLateralSetting = parseFloat(userMaxLateral || 100);
  const hoursPerDay = parseFloat($("hoursPerDay")?.value || "24");

  const flowTotalLps = waterDemandLday / (Math.max(1, hoursPerDay) * 3600);
  const flowPerLateralLps = flowTotalLps / 10; // assume 10 laterals
  const flowRate = flowPerLateralLps / 1000; // m³/s

  const diameterM = diameter / 1000;
  const C = 150;
  const maxHeadLoss = 0.05 * 30; // 5% of 30 m

  const maxLength =
    (maxHeadLoss * Math.pow(C, 1.852) * Math.pow(diameterM, 4.871)) /
    (10.67 * Math.pow(flowRate, 1.852));

  return Math.min(maxLateralSetting, Math.max(20, +maxLength.toFixed(1)));
}

// Full design pipeline for Planner page
function buildDesignFromInputs(inputs) {
  const demand = calculateWaterDemandLperDay(inputs);
  const secondsPerDay = Math.max(1, inputs.hoursPerDay || 24) * 3600;
  const flowLps = demand.waterDemandLday / secondsPerDay;
  const flowM3s = flowLps / 1000;

  const spacingX = Math.max(0.5, inputs.spacingX || 12);
  const spacingY = Math.max(0.5, inputs.spacingY || 12);
  const sprinklerCount = Math.max(1, Math.ceil(demand.areaM2 / (spacingX * spacingY)));

  const layout = calculateLayoutLengths(demand.areaM2, spacingY, inputs.layoutMode);
  const hydraulics = calculateHydraulics(
    flowM3s,
    layout.totalPipeLength,
    inputs.mainDiameter,
    layout.lateralLength
  );

  const pumpPower = calculatePumpPowerHP(flowLps, hydraulics.totalHead);
  const valves = Math.max(1, Math.ceil(sprinklerCount / 100));

  return {
    ...demand,
    flowLps,
    flowM3s,
    spacingX,
    spacingY,
    sprinklerCount,
    valves,
    ...layout,
    headLossPercent: hydraulics.headLossPercent,
    lateralHeadLossPercent: hydraulics.lateralHeadLossPercent,
    velocity: hydraulics.velocity,
    totalHead: hydraulics.totalHead,
    hydraulics,
    pumpPowerHp: pumpPower.hp,
    pumpPowerKw: pumpPower.kw,
  };
}

function initPlannerInputs() {
  const areaRange = $("area");
  const areaValue = $("area-value");

  areaRange.addEventListener("input", () => {
    areaValue.value = areaRange.value;
  });

  areaValue.addEventListener("input", () => {
    let v = parseFloat(areaValue.value) || 1;
    if (v < 1) v = 1;
    if (v > 100) v = 100;
    areaValue.value = v;
    areaRange.value = v;
  });

  $("refresh-satellite").addEventListener("click", fillFakeSatelliteData);
  $("calculate-demand").addEventListener("click", onRecalculate);
  $("generate-layout").addEventListener("click", onGenerateLayout);
  $("validate-hydraulics").addEventListener("click", onValidateHydraulics);
  $("show-bom").addEventListener("click", onShowBOM);
  $("finalize-design").addEventListener("click", onFinalizeDesign);

  // Trigger recalculation when key planner fields change (including new efficiency/hours inputs)
  [
    "crop-type",
    "area",
    "area-value",
    "kc",
    "kc-initial",
    "kc-development",
    "kc-mid",
    "kc-late",
    "eto",
    "rainfall",
    "efficiency",
    "main-diameter",
    "max-lateral",
    "hoursPerDay",
    "spacingX",
    "spacingY",
    "layout-mode",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", onRecalculate);
  });
}

function fillFakeSatelliteData() {
  const ndvi = (0.3 + Math.random() * 0.5).toFixed(2);
  const slopeOptions = ["Flat", "Gentle", "Moderate", "Steep"];
  const soilOptions = ["Sandy loam", "Loam", "Clay loam", "Clay"];

  $("satellite-ndvi").textContent = `${ndvi} (healthy vegetation)`;
  $("satellite-slope").textContent = slopeOptions[Math.floor(Math.random() * slopeOptions.length)];
  $("satellite-soil").textContent = soilOptions[Math.floor(Math.random() * soilOptions.length)];
}

// Core planner recalculation (FAO + Hazen–Williams)
function onRecalculate() {
  const inputs = getPlannerInputs();

  const design = buildDesignFromInputs(inputs);
  lastPlannerDesign = design;

  $("water-demand").textContent = Math.round(design.waterDemandLday);
  $("pipe-length").textContent = design.totalPipeLength;
  $("head-loss").textContent = design.headLossPercent;
  $("max-lateral-output").textContent = design.avgLateralLength.toFixed(1);

  updateKPIFromPlanner(
    design.waterDemandLday,
    design.totalPipeLength,
    design.headLossPercent,
    design.avgLateralLength
  );

  updateSummaryFromDesign(design, inputs);

  if (currentProjectId) {
    const proj = projects.find((p) => p.id === currentProjectId);
    if (proj) {
      proj.areaRai = inputs.areaRai;
      proj.cropType = inputs.cropType;
      proj.metrics = {
        waterDemand: Math.round(design.waterDemandLday),
        pipeLength: design.totalPipeLength,
        headLoss: design.headLossPercent,
        maxLateral: design.avgLateralLength,
      };
      renderProjectsGrid();
      updateSummaryFromProject(proj);
    }
  }
}

// -------------------------
// HYDRAULIC VALIDATION & KPI CARDS
// -------------------------

function applyValidationCard(valid, notes) {
  const card = $("validation-card");
  const icon = $("validation-icon");
  const status = $("validation-status");
  const notesEl = $("validation-notes");

  card.classList.remove("valid", "invalid");

  if (valid) {
    card.classList.add("valid");
    icon.className = "fas fa-check-circle";
    status.textContent = "Valid";
  } else {
    card.classList.add("invalid");
    icon.className = "fas fa-exclamation-triangle";
    status.textContent = "Check Design";
  }
  notesEl.textContent = notes || "";
}

// Functional KPI #2: Hydraulic Validation Compliance (head-loss ≤ 5%)
function onValidateHydraulics() {
  const design = lastPlannerDesign || buildDesignFromInputs(getPlannerInputs());
  const headLoss = design.headLossPercent || 0;
  const lateralLoss = design.lateralHeadLossPercent || 0;

  const valid = headLoss <= 5 && lateralLoss <= 5; // target head-loss ≤5% for main and laterals
  const notes = valid
    ? "Head loss ≤ 5% and lateral length within limit."
    : "Head loss or lateral pipe length exceeds the allowable limit. Consider increasing the main pipe diameter or dividing the field into more zones to reduce lateral length.";

  applyValidationCard(valid, notes);

  if (currentProjectId) {
    const proj = projects.find((p) => p.id === currentProjectId);
    if (proj) {
      proj.validation = { valid, notes };
      renderProjectsGrid();
    }
  }
}

// KPI Cards (Functional KPIs)
function updateKPIFromPlanner(waterDemand, pipeLength, headLoss, maxLateralLength) {
  const head = isFinite(headLoss) ? headLoss : 0;
  const lateral = isFinite(maxLateralLength) ? maxLateralLength : 0;
  const pipe = isFinite(pipeLength) ? pipeLength : 0;

  $("kpi-headloss").textContent = head.toFixed(2) + "%";
  $("kpi-lateral").textContent = lateral.toFixed(1) + " m";
  $("kpi-pipelength").textContent = pipe + " m";

  const headLossPercentForBar = Math.min(100, (head / 10) * 100);
  const lateralPercent = Math.min(100, (lateral / 100) * 100);

  $("kpi-headloss-bar").style.width = headLossPercentForBar + "%";
  $("kpi-lateral-bar").style.width = lateralPercent + "%";
}

function buildCostItems(design, inputs) {
  const mainPipeLen = design.mainLength || 0;
  const lateralPipeLen = design.lateralLength || 0;
  const sprinklers = design.sprinklerCount || 0;
  const valves = Math.max(1, design.valves || Math.round((inputs?.areaRai || 0) / 4) || 1);
  const pumpHp = design.pumpPowerHp || 0;

  return [
    { name: `Main pipe Ø${inputs?.mainDiameter || 75} mm`, qty: mainPipeLen, unit: "m", unitPrice: 120 },
    { name: "Lateral pipe Ø32 mm", qty: lateralPipeLen, unit: "m", unitPrice: 70 },
    { name: "Sprinkler heads", qty: sprinklers, unit: "pcs", unitPrice: 85 },
    { name: "Control valves", qty: valves, unit: "pcs", unitPrice: 550 },
    { name: "Filter set", qty: 1, unit: "set", unitPrice: 9500 },
    { name: `Pump (approx ${pumpHp} hp)`, qty: 1, unit: "set", unitPrice: 45000 },
  ];
}

function updateSummaryFromDesign(design, inputs) {
  if (!design) return;
  const mainInputs = inputs || getPlannerInputs();

  updateKPIFromPlanner(
    design.waterDemandLday || 0,
    design.totalPipeLength || 0,
    design.headLossPercent || 0,
    design.avgLateralLength || 0
  );

  const items = buildCostItems(design, mainInputs);
  const totalCost = items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
  $("kpi-cost").textContent = "฿" + totalCost.toLocaleString();

  updateCostCharts(items, totalCost, design.totalPipeLength || 0);
}

// -------------------------
// BOM (COST IN THAI BAHT)
// -------------------------

function onShowBOM() {
  const inputs = getPlannerInputs();
  const design = lastPlannerDesign || buildDesignFromInputs(inputs);
  const pipeLength = design.totalPipeLength;

  const tbody = $("bom-tbody");
  tbody.innerHTML = "";

  const items = buildCostItems(design, inputs);

  let totalCost = 0;

  items.forEach((it) => {
    const row = document.createElement("tr");
    const total = it.qty * it.unitPrice;
    totalCost += total;

    row.innerHTML = `
      <td>${it.name}</td>
      <td>${it.qty}</td>
      <td>${it.unit}</td>
      <td>${it.unitPrice.toLocaleString()} Baht</td>
      <td>${total.toLocaleString()} Baht</td>
    `;
    tbody.appendChild(row);
  });

  const totalRow = document.createElement("tr");
  totalRow.innerHTML = `
    <td colspan="4" style="text-align:right;">Grand Total</td>
    <td>${totalCost.toLocaleString()} Baht</td>
  `;
  tbody.appendChild(totalRow);

  $("bom-container").style.display = "block";

  $("kpi-cost").textContent = "฿" + totalCost.toLocaleString();

  if (currentProjectId) {
    const proj = projects.find((p) => p.id === currentProjectId);
    if (proj) {
      proj.metrics = proj.metrics || {};
      proj.metrics.totalCost = totalCost.toFixed(0);
      renderProjectsGrid();
      updateSummaryFromProject(proj);
    }
  }

  updateCostCharts(items, totalCost, design.totalPipeLength || 0);
}

// -------------------------
// SEASONAL SIMULATION (KPIs #3 & #7)
// -------------------------

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTH_IDS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

// Build the monthly table (12 rows, no hard-coded HTML rows)
function setupMonthlyTable() {
  const tbody = document.getElementById("monthly-data-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (let i = 0; i < 12; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${MONTH_NAMES[i]}</td>
      <td><input type="number" step="0.1" value="5.0" class="number-input monthly-eto" data-month="${i}"></td>
      <td><input type="number" step="0.1" value="2.0" class="number-input monthly-rainfall" data-month="${i}"></td>
    `;
    tbody.appendChild(tr);
  }
}

function loadScenarioPreset(mode) {
  let tbody = document.getElementById("monthly-data-tbody");
  if (!tbody) {
    setupMonthlyTable();
    tbody = document.getElementById("monthly-data-tbody");
  }
  if (!tbody) return;

  const presets = {
    normal: {
      eto: [4.5, 4.6, 4.8, 5.0, 5.2, 5.1, 5.0, 4.9, 4.7, 4.6, 4.5, 4.4],
      rain: [2.5, 2.0, 2.0, 1.8, 1.5, 1.2, 1.0, 1.0, 2.2, 3.0, 3.5, 3.8],
    },
    dry: {
      eto: [4.8, 4.9, 5.2, 5.4, 5.6, 5.5, 5.4, 5.3, 5.0, 4.9, 4.8, 4.7],
      rain: [1.5, 1.2, 1.0, 0.8, 0.6, 0.5, 0.5, 0.6, 1.0, 1.5, 1.8, 2.0],
    },
    wet: {
      eto: [4.2, 4.3, 4.5, 4.7, 4.9, 4.8, 4.7, 4.6, 4.4, 4.3, 4.2, 4.1],
      rain: [3.5, 3.2, 3.0, 2.8, 2.5, 2.4, 2.3, 2.2, 3.0, 4.0, 4.5, 4.8],
    },
  };

  const preset = presets[mode] || presets.normal;

  const etoInputs = tbody.querySelectorAll(".monthly-eto");
  const rainInputs = tbody.querySelectorAll(".monthly-rainfall");
  etoInputs.forEach((input, idx) => {
    input.value = preset.eto[idx].toFixed(1);
  });
  rainInputs.forEach((input, idx) => {
    input.value = preset.rain[idx].toFixed(1);
  });
}

// Seasonal simulation using Thai units (Rai) and liters/month
function runSeasonalSimulation() {
  const areaRai = parseFloat($("area")?.value || "0");
  const areaM2 = areaRai * 1600; // 1 Rai = 1,600 m²

  const kcInitial = parseFloat($("kc-initial").value || "0.3");
  const kcMid = parseFloat($("kc-mid").value || "1.0");
  const kcLate = parseFloat($("kc-late").value || "0.7");

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const tbody = document.getElementById("monthly-data-tbody");
  const etoInputs = tbody ? tbody.querySelectorAll(".monthly-eto") : [];
  const rainInputs = tbody ? tbody.querySelectorAll(".monthly-rainfall") : [];

  if (!etoInputs.length || !rainInputs.length) return;

  const monthlyDemand = [];
  const monthlyEto = [];
  const monthlyRain = [];

  etoInputs.forEach((etoInput, idx) => {
    const eto = parseFloat(etoInput.value || "0");
    const rainfall = parseFloat(rainInputs[idx]?.value || "0");
    monthlyEto.push(eto);
    monthlyRain.push(rainfall);

    // Stage mapping: Jan–Feb Initial, Mar–Aug Mid, Sep–Dec Late
    let kc;
    if (idx <= 1) kc = kcInitial;
    else if (idx >= 2 && idx <= 7) kc = kcMid;
    else kc = kcLate;

    const etc = kc * eto; // mm/day
    const netIrrigation = Math.max(0, etc - rainfall); // mm/day
    const monthlyDepth = netIrrigation * daysInMonth[idx]; // mm/month
    const monthDemand = monthlyDepth * areaM2; // L/month (1 mm over 1 m² = 1 L)
    monthlyDemand.push(Math.round(monthDemand));
  });

  drawSeasonalCharts(monthlyDemand, monthlyEto, monthlyRain);
  updateSeasonalSummary(monthlyDemand, monthlyEto, monthlyRain);
}

function drawSeasonalCharts(monthlyDemand, monthlyEto, monthlyRain) {
  if (typeof Chart === "undefined") return;
  const ctx1 = $("seasonal-chart")?.getContext("2d");
  const ctx2 = $("seasonal-eto-chart")?.getContext("2d");

  if (!ctx1 || !ctx2) return;

  if (seasonalChart) seasonalChart.destroy();
  seasonalChart = new Chart(ctx1, {
    type: "line",
    data: {
      labels: MONTH_NAMES,
      datasets: [
        {
          label: "Water demand (L/month)",
          data: monthlyDemand,
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.15)",
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });

  if (seasonalEtoChart) seasonalEtoChart.destroy();
  seasonalEtoChart = new Chart(ctx2, {
    type: "bar",
    data: {
      labels: MONTH_NAMES,
      datasets: [
        {
          label: "ETo (mm/day)",
          data: monthlyEto,
          backgroundColor: "rgba(14,165,233,0.7)",
        },
        {
          label: "Rainfall (mm/day)",
          data: monthlyRain,
          backgroundColor: "rgba(34,197,94,0.7)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
    },
  });
}

function updateSeasonalSummary(monthlyDemand, monthlyEto, monthlyRain) {
  const totalDemand = monthlyDemand.reduce((a, b) => a + b, 0);
  if (!monthlyDemand.length) return;
  const maxDemand = Math.max(...monthlyDemand);
  const maxMonthIndex = monthlyDemand.indexOf(maxDemand);
  const avgEto =
    monthlyEto.length ? monthlyEto.reduce((a, b) => a + b, 0) / monthlyEto.length : 0;

  $("seasonal-summary-content").innerHTML = `
    <p><strong>Total seasonal demand:</strong> ${totalDemand.toLocaleString()} L</p>
    <p><strong>Peak month:</strong> ${MONTH_NAMES[maxMonthIndex]} (${maxDemand.toLocaleString()} L)</p>
    <p><strong>Average ET₀:</strong> ${avgEto.toFixed(1)} mm/day</p>
    <p>Units match Planner: area in Rai (1 Rai = 1,600 m²) and water in liters/month.</p>
  `;
}

// -------------------------
// COST & ZONE CHARTS
// -------------------------

function updateCostCharts(items, totalCost, totalPipeLengthOverride) {
  const costCtx = $("cost-chart")?.getContext("2d");
  const zoneCtx = $("zone-chart")?.getContext("2d");

  if (!costCtx || !zoneCtx) return;

  if (costChart) costChart.destroy();
  if (zoneChart) zoneChart.destroy();

  const labels = items.map((it) => it.name);
  const values = items.map((it) => it.qty * it.unitPrice);

  costChart = new Chart(costCtx, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: values,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });

  const pipeLength = totalPipeLengthOverride ?? parseFloat($("pipe-length").textContent || "0");
  const zoneLabels = ["Zone A", "Zone B", "Zone C"];
  const zoneValues = [
    +(pipeLength * 0.4).toFixed(1),
    +(pipeLength * 0.35).toFixed(1),
    +(pipeLength * 0.25).toFixed(1),
  ];

  zoneChart = new Chart(zoneCtx, {
    type: "bar",
    data: {
      labels: zoneLabels,
      datasets: [
        {
          label: "Pipe length (m)",
          data: zoneValues,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    },
  });
}

// -------------------------
// MAP (LEAFLET) – FIXED TO THAILAND FIELD BOUNDARY
// -------------------------

function clearLayoutAnimation() {
  if (flowAnimationInterval) {
    clearInterval(flowAnimationInterval);
    flowAnimationInterval = null;
  }
}

function initializeMap() {
  if (mapInitialized) return;
  const container = $("map-container");
  if (!container) return;

  map = L.map("map-container").setView([13.7563, 100.5018], 15); // Bangkok area

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  layoutLayerGroup = L.layerGroup().addTo(map);

  // default rectangular field boundary
  const defaultBoundary = [
    [13.7550, 100.5000],
    [13.7575, 100.5000],
    [13.7575, 100.5035],
    [13.7550, 100.5035],
    [13.7550, 100.5000],
  ];

  const boundary = L.polygon(defaultBoundary, {
    color: "#999",
    weight: 1,
    fillColor: "#e0f3e8",
    fillOpacity: 0.2,
  }).addTo(layoutLayerGroup);

  map.fitBounds(boundary.getBounds(), { padding: [40, 40] });

  mapInitialized = true;
}

function onGenerateLayout() {
  const inputs = getPlannerInputs();
  generateLayoutOnMap(inputs);
}

function generateLayoutOnMap(inputs) {
  if (!map || !layoutLayerGroup) return;

  clearLayoutAnimation();
  layoutLayerGroup.clearLayers();

  // draw boundary
  const defaultBoundary = [
    [13.7550, 100.5000],
    [13.7575, 100.5000],
    [13.7575, 100.5035],
    [13.7550, 100.5035],
    [13.7550, 100.5000],
  ];
  const boundaryLayer = L.polygon(defaultBoundary, {
    color: "#999",
    weight: 1,
    fillColor: "#e0f3e8",
    fillOpacity: 0.2,
  }).addTo(layoutLayerGroup);

  const bounds = boundaryLayer.getBounds();
  const center = bounds.getCenter();

  const pipeLength = calculatePipeLengthFromArea(inputs);
  const mainSpan = (pipeLength / 1000) * 0.003; // scale length on map

  // main pipe (north-south)
  const mainStart = [center.lat - mainSpan, center.lng];
  const mainEnd = [center.lat + mainSpan, center.lng];

  const mainPipe = L.polyline([mainStart, mainEnd], {
    color: "#2d8659",
    weight: 6,
    opacity: 0.9,
  }).addTo(layoutLayerGroup);

  const numLaterals = Math.min(10, Math.max(4, Math.round(inputs.areaRai / 5)));
  const latSpacing =
    (bounds.getNorth() - bounds.getSouth()) / (numLaterals + 1);

  const flowDots = [];

  for (let i = 1; i <= numLaterals; i++) {
    const y = bounds.getSouth() + latSpacing * i;
    const lateral = L.polyline(
      [
        [y, bounds.getWest()],
        [y, bounds.getEast()],
      ],
      {
        color: "#4a90e2",
        weight: 3,
        opacity: 0.9,
      }
    ).addTo(layoutLayerGroup);

    const dot = L.circleMarker([y, bounds.getWest()], {
      radius: 4,
      color: "#007bff",
      fillColor: "#007bff",
      fillOpacity: 1,
    }).addTo(layoutLayerGroup);

    flowDots.push({
      dot,
      y,
      xStart: bounds.getWest(),
      xEnd: bounds.getEast(),
      t: 0,
    });
  }

  flowAnimationInterval = setInterval(() => {
    flowDots.forEach((d) => {
      d.t += 0.02;
      if (d.t > 1) d.t = 0;
      const x = d.xStart + (d.xEnd - d.xStart) * d.t;
      d.dot.setLatLng([d.y, x]);
    });
  }, 80);

  map.fitBounds(bounds, { padding: [40, 40] });
}

// -------------------------
// DESIGN JSON & REPORT (Thai units)
// -------------------------

function buildDesignJSON() {
  const inputs = getPlannerInputs();
  const proj = currentProjectId
    ? projects.find((p) => p.id === currentProjectId)
    : null;

  const metrics = proj?.metrics || {};

  return {
    project: {
      id: proj?.id || null,
      name: proj?.name || "Unsaved design",
      location: proj?.location || "",
      areaRai: inputs.areaRai,
      cropType: inputs.cropType,
    },
    hydraulic: {
      mainDiameter: inputs.mainDiameter,
      maxLateral: inputs.maxLateral,
      layoutMode: inputs.layoutMode,
    },
    climate: {
      eto: inputs.eto,
      rainfall: inputs.rainfall,
      kc: inputs.kc,
    },
    outputs: {
      waterDemand: metrics.waterDemand || $("water-demand").textContent,
      pipeLength: metrics.pipeLength || $("pipe-length").textContent,
      headLoss: metrics.headLoss || $("head-loss").textContent,
      totalCost:
        metrics.totalCost ||
        $("kpi-cost").textContent.replace(/[฿,]/g, ""),
      validationStatus: $("validation-status").textContent,
      validationNotes: $("validation-notes").textContent,
    },
  };
}

function buildDesignResponseJSON() {
  const design = buildDesignJSON();
  const recs = [];

  const headLoss = parseFloat(design.outputs.headLoss) || 0;
  const diameter = design.hydraulic.mainDiameter;

  if (headLoss > 5) {
    recs.push("Increase main pipe diameter to reduce head loss below 5%");
  } else {
    recs.push("Head loss is within target (≤ 5%)");
  }

  if (diameter < 75 && design.project.areaRai > 20) {
    recs.push("For areas >20 Rai, use a main pipe at least Ø75 mm");
  }

  const waterDemand = parseFloat(design.outputs.waterDemand) || 0;
  if (waterDemand > 200000) {
    recs.push("Select a pump larger than 200 m³/day (≥ 7.5 kW)");
  } else {
    recs.push("A medium-size pump is sufficient for this design (~5.5 kW)");
  }

  if (!recs.length) {
    recs.push("Design meets key requirements; no major issues flagged");
  }

  return {
    recommendations: recs,
    pumpSelection: {
      suggestedPower: waterDemand > 200000 ? "7.5 kW" : "5.5 kW",
      suggestedHead: headLoss > 5 ? "40 m" : "30 m",
    },
  };
}

function initSummaryButtons() {
  $("show-design-json-btn").addEventListener("click", () => {
    const req = buildDesignJSON();
    const res = buildDesignResponseJSON();

    $("design-request-json").textContent = JSON.stringify(req, null, 2);
    $("design-response-json").textContent = JSON.stringify(res, null, 2);

    openModal("design-json-modal");
  });

  $("download-report-btn").addEventListener("click", downloadPDFReport);
}

function downloadPDFReport() {
  if (!window.jspdf) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const design = buildDesignJSON();
  const response = buildDesignResponseJSON();

  let y = 15;

  doc.setFontSize(16);
  doc.text("AI-Assisted Irrigation Planner - Report", 10, y);
  y += 10;

  doc.setFontSize(12);
  doc.text(`Project: ${design.project.name}`, 10, y);
  y += 6;
  doc.text(`Location: ${design.project.location}`, 10, y);
  y += 6;
  doc.text(`Area: ${design.project.areaRai} Rai`, 10, y);
  y += 6;
  doc.text(`Crop: ${design.project.cropType}`, 10, y);
  y += 10;

  doc.text("Hydraulic Settings:", 10, y);
  y += 6;
  doc.text(`Main pipe: Ø${design.hydraulic.mainDiameter} mm`, 10, y);
  y += 6;
  doc.text(`Max lateral length: ${design.hydraulic.maxLateral} m`, 10, y);
  y += 10;

  doc.text("Key Outputs:", 10, y);
  y += 6;
  doc.text(`Water demand: ${design.outputs.waterDemand} L/day`, 10, y);
  y += 6;
  doc.text(`Pipe length: ${design.outputs.pipeLength} m`, 10, y);
  y += 6;
  doc.text(`Head loss: ${design.outputs.headLoss} %`, 10, y);
  y += 6;
  doc.text(
    `Total cost: ฿${design.outputs.totalCost || "N/A"}`,
    10,
    y
  );
  y += 10;

  doc.text("Validation:", 10, y);
  y += 6;
  doc.text(`Status: ${design.outputs.validationStatus}`, 10, y);
  y += 6;
  const notes = doc.splitTextToSize(
    `Notes: ${design.outputs.validationNotes || "-"}`,
    190
  );
  doc.text(notes, 10, y);
  y += notes.length * 6 + 4;

  doc.text("Recommendations:", 10, y);
  y += 6;
  response.recommendations.forEach((r) => {
    const lines = doc.splitTextToSize("- " + r, 190);
    doc.text(lines, 10, y);
    y += lines.length * 6 + 2;
  });

  doc.save("irrigation_report_thai_units.pdf");
}

// -------------------------
// SUMMARY & KPI DESCRIPTION
// -------------------------

function updateSummaryFromProject(project) {
  if (!project) {
    updateCurrentProjectBadge(null);
    return;
  }
  updateCurrentProjectBadge(project);

  const metrics = project.metrics || {};
  const wd = parseFloat(metrics.waterDemand);
  const pl = parseFloat(metrics.pipeLength);
  const hl = parseFloat(metrics.headLoss);
  const ml = parseFloat(metrics.maxLateral);
  if (isFinite(wd) && isFinite(pl) && isFinite(hl) && isFinite(ml)) {
    updateKPIFromPlanner(wd, pl, hl, ml);
  } else if (lastPlannerDesign) {
    updateSummaryFromDesign(lastPlannerDesign, getPlannerInputs());
  }
}

// Inject KPI description (static text)
function injectKPIDescription() {
  const summaryContainer = document.querySelector(".summary-container");
  if (!summaryContainer) return;

  const kpiInfo = document.createElement("div");
  kpiInfo.className = "summary-card-large";
  kpiInfo.innerHTML = `
    <h3><i class="fas fa-bullseye"></i> System KPIs (Prototype)</h3>
    <p><strong>Functional KPIs</strong></p>
    <ul style="margin-left:1rem;">
      <li><strong>Layout Generation Accuracy</strong> – Deviation of total pipe length vs. baseline/manual (≤ 10%)</li>
      <li><strong>Hydraulic Validation Compliance</strong> – % of designs passing head loss ≤ 5% (≥ 95%)</li>
      <li><strong>Water Demand Accuracy</strong> – ETc deviation vs. FAO reference (±5%)</li>
      <li><strong>BOM Consistency</strong> – BOM correctness vs. real quantities</li>
    </ul>
    <p style="margin-top:0.5rem;"><strong>Performance KPIs</strong> (design targets)</p>
    <ul style="margin-left:1rem;">
      <li>Layout generation time (≤ 1 minute for ≤ 62 Rai / 10 ha)</li>
      <li>Hydraulic validation time (≤ 10 seconds)</li>
      <li>Seasonal simulation time (≤ 5 seconds)</li>
    </ul>
  `;
  summaryContainer.appendChild(kpiInfo);
}

// -------------------------
// MODAL: CLOSE WHEN CLICK BACKDROP
// -------------------------

function initModalCloseOnBackground() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
      }
    });
  });
}

// -------------------------
// INIT
// -------------------------

document.addEventListener("DOMContentLoaded", () => {
  initSidebar();
  initPlannerInputs();
  initializeMap();
  setupMonthlyTable();
  loadScenarioPreset("normal");
  initSummaryButtons();
  initModalCloseOnBackground();
  injectKPIDescription();

  // Initial design compute to populate dashboards/summary
  const initialInputs = getPlannerInputs();
  const initialDesign = buildDesignFromInputs(initialInputs);
  lastPlannerDesign = initialDesign;
  updateSummaryFromDesign(initialDesign, initialInputs);

  $("new-project-btn").addEventListener("click", () => {
    $("project-name-input").value = "";
    $("project-location-input").value = "";
    $("project-area-input").value = 10;
    $("project-crop-input").value = "Sugarcane";

    const saveBtn = $("save-project-btn");
    saveBtn.textContent = "Create Project";
    saveBtn.onclick = saveProjectFromModal;

    openModal("new-project-modal");
  });

  $("scenario-preset").addEventListener("change", (e) => {
    loadScenarioPreset(e.target.value);
  });

  $("run-seasonal-sim").addEventListener("click", runSeasonalSimulation);

  fillFakeSatelliteData();
  onRecalculate(); // initial calculation so outputs aren't zero
});
