const presets = {
  conservative: {
    activeUsers: 8000,
    requestsPerUserPerDay: 10,
    inputTokensPerRequest: 1800,
    outputTokensPerRequest: 700,
    baselineInferenceWatts: 22000,
    akamaiEdgeOffloadPct: 20,
    semanticCacheHitRatePct: 8,
    powerReductionPct: 25,
    peakStressFactor: 1.3
  },
  base: {
    activeUsers: 12000,
    requestsPerUserPerDay: 14,
    inputTokensPerRequest: 2200,
    outputTokensPerRequest: 900,
    baselineInferenceWatts: 18500,
    akamaiEdgeOffloadPct: 35,
    semanticCacheHitRatePct: 18,
    powerReductionPct: 42,
    peakStressFactor: 1.2
  },
  aggressive: {
    activeUsers: 18000,
    requestsPerUserPerDay: 18,
    inputTokensPerRequest: 2600,
    outputTokensPerRequest: 1100,
    baselineInferenceWatts: 20000,
    akamaiEdgeOffloadPct: 55,
    semanticCacheHitRatePct: 32,
    powerReductionPct: 58,
    peakStressFactor: 1.15
  }
};

const inputConfig = [
  {
    key: "activeUsers",
    label: "ACTIVE USERS",
    min: 1000,
    max: 250000,
    step: 1000,
    format: v => fmtInt(v),
    help: "Modeled daily active user envelope for the constrained workload."
  },
  {
    key: "requestsPerUserPerDay",
    label: "REQUESTS / USER / DAY",
    min: 1,
    max: 100,
    step: 1,
    format: v => fmtInt(v),
    help: "Average user-path interactions per day for the modeled workflow."
  },
  {
    key: "inputTokensPerRequest",
    label: "INPUT TOKENS / REQUEST",
    min: 100,
    max: 10000,
    step: 100,
    format: v => fmtInt(v),
    help: "Average prompt/context volume served into each request."
  },
  {
    key: "outputTokensPerRequest",
    label: "OUTPUT TOKENS / REQUEST",
    min: 50,
    max: 5000,
    step: 50,
    format: v => fmtInt(v),
    help: "Average generated response volume per request."
  },
  {
    key: "baselineInferenceWatts",
    label: "BASELINE INFERENCE WATTS",
    min: 1000,
    max: 100000,
    step: 500,
    format: v => `${fmtInt(v)} W`,
    help: "Directional centralized inference watt envelope before convergence-layer optimization."
  },
  {
    key: "akamaiEdgeOffloadPct",
    label: "AKAMAI EDGE OFFLOAD",
    min: 0,
    max: 80,
    step: 1,
    format: v => `${fmtInt(v)}%`,
    help: "Modeled share of work absorbed, coordinated, or shifted by the edge-layer posture."
  },
  {
    key: "semanticCacheHitRatePct",
    label: "SEMANTIC CACHE HIT RATE",
    min: 0,
    max: 70,
    step: 1,
    format: v => `${fmtInt(v)}%`,
    help: "Repeatable query share served through semantic reuse rather than fresh full-path execution."
  },
  {
    key: "powerReductionPct",
    label: "POWER REDUCTION ON OFFLOADED / CACHED WORK",
    min: 0,
    max: 90,
    step: 1,
    format: v => `${fmtInt(v)}%`,
    help: "Modeled power compression for work that is offloaded or served via semantic reuse."
  },
  {
    key: "peakStressFactor",
    label: "PEAK-HOUR STRESS FACTOR",
    min: 1,
    max: 3,
    step: 0.05,
    format: v => `${Number(v).toFixed(2)}x`,
    help: "Stress multiplier applied to baseline centralized delivery during peak contention."
  }
];

let state = { ...presets.base };

function fmtInt(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmt1(n) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
}

function fmtPct(n) {
  return `${n >= 0 ? "+" : ""}${fmt1(n)}%`;
}

function calcTokenWattUserModel({
  activeUsers,
  requestsPerUserPerDay,
  inputTokensPerRequest,
  outputTokensPerRequest,
  baselineInferenceWatts,
  akamaiEdgeOffloadPct,
  semanticCacheHitRatePct,
  powerReductionPct,
  peakStressFactor
}) {
  const offload = akamaiEdgeOffloadPct / 100;
  const cacheHit = semanticCacheHitRatePct / 100;
  const powerReduction = powerReductionPct / 100;

  const totalTokensPerRequest = inputTokensPerRequest + outputTokensPerRequest;
  const tokensPerUserPerDay = requestsPerUserPerDay * totalTokensPerRequest;
  const totalRequestsPerDay = activeUsers * requestsPerUserPerDay;
  const totalTokensPerDay = activeUsers * tokensPerUserPerDay;

  const optimizedShare = Math.min(0.95, offload + cacheHit - (offload * cacheHit * 0.5));

  const baselineWattsStressed = baselineInferenceWatts * peakStressFactor;
  const effectiveWatts = baselineWattsStressed * (1 - optimizedShare * powerReduction);

  const wattsPerUser = effectiveWatts / activeUsers;
  const tokensPerWatt = totalTokensPerDay / effectiveWatts;
  const tokensPerWattPerUser = tokensPerUserPerDay / wattsPerUser;

  const baselineWattsPerUser = baselineWattsStressed / activeUsers;
  const baselineTokensPerWatt = totalTokensPerDay / baselineWattsStressed;
  const baselineTokensPerWattPerUser = tokensPerUserPerDay / baselineWattsPerUser;

  const efficiencyLiftPct =
    ((tokensPerWattPerUser - baselineTokensPerWattPerUser) / baselineTokensPerWattPerUser) * 100;

  const wattSavingsPct =
    ((baselineWattsStressed - effectiveWatts) / baselineWattsStressed) * 100;

  return {
    totalTokensPerRequest,
    tokensPerUserPerDay,
    totalRequestsPerDay,
    totalTokensPerDay,
    optimizedShare,
    effectiveWatts,
    wattsPerUser,
    tokensPerWatt,
    tokensPerWattPerUser,
    efficiencyLiftPct,
    wattSavingsPct
  };
}

function createInputRow(config) {
  const wrapper = document.createElement("div");
  wrapper.className = "input-group";

  const top = document.createElement("div");
  top.className = "input-top";

  const label = document.createElement("label");
  label.setAttribute("for", config.key);
  label.textContent = config.label;

  const value = document.createElement("span");
  value.className = "input-value";
  value.id = `${config.key}Value`;

  top.append(label, value);

  const help = document.createElement("p");
  help.className = "input-help";
  help.textContent = config.help;

  const input = document.createElement("input");
  input.type = "range";
  input.id = config.key;
  input.min = config.min;
  input.max = config.max;
  input.step = config.step;
  input.value = state[config.key];

  input.addEventListener("input", e => {
    state[config.key] = Number(e.target.value);
    updatePresetButtonState(null);
    render();
  });

  wrapper.append(top, help, input);
  return wrapper;
}

function renderInputs() {
  const root = document.getElementById("inputs");
  root.innerHTML = "";
  inputConfig.forEach(config => root.appendChild(createInputRow(config)));
}

function updatePresetButtonState(activePreset) {
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.preset === activePreset);
  });
}

function bindPresetButtons() {
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const presetName = btn.dataset.preset;
      state = { ...presets[presetName] };
      syncInputs();
      updatePresetButtonState(presetName);
      render();
    });
  });
}

function syncInputs() {
  inputConfig.forEach(config => {
    const el = document.getElementById(config.key);
    if (el) el.value = state[config.key];
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function render() {
  inputConfig.forEach(config => {
    setText(`${config.key}Value`, config.format(state[config.key]));
  });

  const model = calcTokenWattUserModel(state);

  setText("tokensPerUserPerDay", fmtInt(model.tokensPerUserPerDay));
  setText("wattsPerUser", `${fmt1(model.wattsPerUser)} W`);
  setText("tokensPerWatt", fmtInt(model.tokensPerWatt));
  setText("tokensPerWattPerUser", fmtInt(model.tokensPerWattPerUser));
  setText("efficiencyLift", fmtPct(model.efficiencyLiftPct));
  setText("wattSavings", fmtPct(model.wattSavingsPct));

  setText("totalTokensPerRequest", fmtInt(model.totalTokensPerRequest));
  setText("totalRequestsPerDay", fmtInt(model.totalRequestsPerDay));
  setText("totalTokensPerDay", fmtInt(model.totalTokensPerDay));
  setText("optimizedShare", `${fmt1(model.optimizedShare * 100)}%`);
}

function init() {
  renderInputs();
  bindPresetButtons();
  syncInputs();
  updatePresetButtonState("base");
  render();
}

init();
