(() => {
  "use strict";

  const BASE_CLONE_NAMES = ["祖先克隆", "分支 A", "分支 B", "适应性克隆", "应激生态位"];
  const themeVars = getComputedStyle(document.documentElement);
  const themeColor = (name, fallback) => themeVars.getPropertyValue(name).trim() || fallback;
  const CLONE_COLORS = [
    themeColor("--clone-1", "#c15f3c"),
    themeColor("--clone-2", "#d9a05b"),
    themeColor("--clone-3", "#7da088"),
    themeColor("--clone-4", "#6b8cae"),
    themeColor("--clone-5", "#a2678e"),
    themeColor("--clone-6", "#8a8f5c")
  ];
  const STRATEGY_COLORS = [
    themeColor("--strategy-1", "#c15f3c"),
    themeColor("--strategy-2", "#d9a05b"),
    themeColor("--strategy-3", "#6b8cae"),
    themeColor("--strategy-4", "#7da088")
  ];
  const STRATEGIES = {
    random: { name: "随机芯针", short: "随机" },
    center: { name: "中心偏置", short: "中心" },
    "center-edge": { name: "中心 + 边缘", short: "中+边" },
    dispersed: { name: "空间分散", short: "分散" }
  };
  const ARCH_NAMES = {
    branched: "分支演化",
    patchwork: "斑块生态位",
    gradient: "方向性梯度",
    "rare-edge": "边缘稀有生态位"
  };
  const ASSAY_NAMES = {
    "per-core": "逐芯针独立检测",
    pooled: "合并检测"
  };
  const RUN_OPTIONS = [1000, 3000, 10000, 20000];
  const DEFAULTS = Object.freeze({
    seed: 1837,
    architecture: "branched",
    cloneCount: 5,
    rarePct: 5,
    clustering: 72,
    strategy: "random",
    biopsyCount: 3,
    coreLength: 42,
    coreWidth: 6,
    detectFloor: 2,
    assayMode: "per-core",
    mcRuns: 3000
  });

  const state = {
    ...DEFAULTS,
    gridRes: 118,
    cells: [],
    grid: null,
    prevalence: [],
    manualCores: [],
    lastMc: null,
    benchmark: null,
    curveData: null,
    curveRuns: 0,
    tumorCache: null,
    hover: null,
    busy: false,
    placementNonce: 0,
    replayNonce: 0,
    heroVisible: true
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const fmtPct = (value, digits = 1) => Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
  const fmtPp = (value) => `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(1)} pp`;

  function cloneName(index) {
    if (index === state.cloneCount - 1) return "稀有耐药克隆";
    return BASE_CLONE_NAMES[index] || `克隆 ${index + 1}`;
  }

  function hashString(text) {
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function mulberry32(seed) {
    return function random() {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rngFor(tag = "") {
    return mulberry32((state.seed ^ hashString(String(tag))) >>> 0);
  }

  function normal(rng) {
    let u = 0;
    let v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.remove("show"), 1900);
  }

  function currentConfig() {
    return {
      model: "CloneCatch-1.1",
      seed: state.seed,
      architecture: state.architecture,
      cloneCount: state.cloneCount,
      rarePct: state.rarePct,
      clustering: state.clustering,
      strategy: state.strategy,
      biopsyCount: state.biopsyCount,
      coreLength: state.coreLength,
      coreWidth: state.coreWidth,
      detectFloor: state.detectFloor,
      assayMode: state.assayMode,
      mcRuns: state.mcRuns,
      integrationGrid: "17x7"
    };
  }

  function canonicalConfig() {
    const config = currentConfig();
    return JSON.stringify(Object.keys(config).sort().reduce((acc, key) => {
      acc[key] = config[key];
      return acc;
    }, {}));
  }

  let fingerprintSeq = 0;
  async function updateFingerprint() {
    const seq = ++fingerprintSeq;
    const text = canonicalConfig();
    let fingerprint = "";
    try {
      if (globalThis.crypto?.subtle) {
        const data = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest("SHA-256", data);
        fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch (error) {
      console.warn("SHA-256 unavailable", error);
    }
    if (!fingerprint) {
      const a = hashString(text).toString(16).padStart(8, "0");
      const b = hashString([...text].reverse().join("")).toString(16).padStart(8, "0");
      fingerprint = `fallback-${a}${b}${a}${b}`.slice(0, 64);
    }
    if (seq !== fingerprintSeq) return;
    $("#fingerprint").textContent = fingerprint;
    updateMethods(fingerprint);
  }

  function architectureCenters(rng, cloneIndex) {
    const clustering = state.clustering / 100;
    const count = clustering > 0.72 ? 1 : clustering > 0.4 ? 2 : 3;
    const centers = [];

    for (let j = 0; j < count; j += 1) {
      let x;
      let y;
      if (state.architecture === "gradient") {
        x = -0.62 + (cloneIndex / Math.max(1, state.cloneCount - 2)) * 1.24 + normal(rng) * 0.10;
        y = (rng() - 0.5) * 0.75;
      } else if (state.architecture === "branched") {
        const angle = cloneIndex * 1.77 + j * 0.55 + rng() * 0.45;
        const radius = 0.20 + rng() * 0.55;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      } else if (state.architecture === "rare-edge" && cloneIndex === state.cloneCount - 1) {
        const angle = rng() * Math.PI * 2;
        const radius = 0.70 + rng() * 0.13;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      } else {
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * 0.68;
        x = Math.cos(angle) * radius;
        y = Math.sin(angle) * radius;
      }
      centers.push({ x, y, weight: 0.8 + rng() * 0.55 });
    }
    return centers;
  }

  function makeField(cells, centers, sigma, rng, radialBias = 0) {
    const field = new Float32Array(cells.length);
    const denom = 2 * sigma * sigma;
    for (let i = 0; i < cells.length; i += 1) {
      const point = cells[i];
      let score = 0;
      for (const center of centers) {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        score += center.weight * Math.exp(-(dx * dx + dy * dy) / denom);
      }
      score += 0.035 * normal(rng) + radialBias * Math.hypot(point.x, point.y);
      field[i] = score;
    }
    return field;
  }

  function buildTumor() {
    const rng = rngFor("tumor");
    const resolution = state.gridRes;
    const cells = [];
    const grid = new Int32Array(resolution * resolution).fill(-1);

    for (let gy = 0; gy < resolution; gy += 1) {
      for (let gx = 0; gx < resolution; gx += 1) {
        const x = ((gx + 0.5) / resolution) * 2 - 1;
        const y = ((gy + 0.5) / resolution) * 2 - 1;
        const angle = Math.atan2(y, x);
        const boundaryWobble = 0.018 * Math.sin(7 * angle + 1.3) + 0.010 * Math.sin(13 * angle);
        if (Math.hypot(x, y) < 0.91 + boundaryWobble) {
          grid[gy * resolution + gx] = cells.length;
          cells.push({ x, y, gx, gy, clone: 0 });
        }
      }
    }

    state.cells = cells;
    state.grid = grid;
    const sigma = 0.16 + (1 - state.clustering / 100) * 0.38;
    const fields = [new Float32Array(cells.length).fill(0.54)];

    for (let k = 1; k < state.cloneCount; k += 1) {
      fields.push(makeField(
        cells,
        architectureCenters(rng, k),
        sigma,
        rng,
        state.architecture === "rare-edge" && k === state.cloneCount - 1 ? 0.18 : 0
      ));
    }

    const rareIndex = state.cloneCount - 1;
    const rareCount = Math.max(1, Math.round(cells.length * state.rarePct / 100));
    const rareOrder = [...cells.keys()].sort((a, b) => fields[rareIndex][b] - fields[rareIndex][a]);
    const rareSet = new Set(rareOrder.slice(0, rareCount));

    for (let i = 0; i < cells.length; i += 1) {
      if (rareSet.has(i)) {
        cells[i].clone = rareIndex;
        continue;
      }
      let bestClone = 0;
      let bestScore = fields[0][i] + 0.12 * (rng() - 0.5);
      for (let k = 1; k < rareIndex; k += 1) {
        let score = fields[k][i];
        if (state.architecture === "branched") score += 0.05 * Math.sin((cells[i].x + cells[i].y) * 8 + k);
        if (score > bestScore) {
          bestScore = score;
          bestClone = k;
        }
      }
      cells[i].clone = bestClone;
    }

    const initialCounts = new Array(state.cloneCount).fill(0);
    cells.forEach((point) => initialCounts[point.clone] += 1);
    for (let k = 0; k < rareIndex; k += 1) {
      if (initialCounts[k] < Math.max(8, cells.length * 0.01)) {
        const candidates = [...cells.keys()]
          .filter((index) => !rareSet.has(index))
          .sort((a, b) => fields[k][b] - fields[k][a])
          .slice(0, Math.max(12, Math.round(cells.length * 0.025)));
        candidates.forEach((index) => { cells[index].clone = k; });
      }
    }

    const counts = new Array(state.cloneCount).fill(0);
    cells.forEach((point) => counts[point.clone] += 1);
    state.prevalence = counts.map((count) => count / cells.length);
    state.manualCores = [];
    state.lastMc = null;
    state.benchmark = null;
    state.curveData = null;
    state.curveRuns = 0;
    state.placementNonce = 0;
    buildTumorCache();
    resetBenchmarkDom();
    renderAll();
    updateFingerprint();
  }

  function buildTumorCache() {
    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 720;
    const context = canvas.getContext("2d");
    const centerX = 360;
    const centerY = 360;
    const radius = 326;
    context.clearRect(0, 0, 720, 720);
    context.save();
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.clip();
    const cellPixels = 720 / state.gridRes;
    for (const point of state.cells) {
      const x = centerX + point.x * radius;
      const y = centerY + point.y * radius;
      context.globalAlpha = 0.94;
      context.fillStyle = CLONE_COLORS[point.clone];
      context.fillRect(x - cellPixels * 0.56, y - cellPixels * 0.56, cellPixels * 1.18, cellPixels * 1.18);
    }
    const gradient = context.createRadialGradient(centerX - 80, centerY - 95, 50, centerX, centerY, radius);
    gradient.addColorStop(0, "rgba(255,255,255,.075)");
    gradient.addColorStop(0.6, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(0,0,0,.28)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 720, 720);
    context.restore();
    context.strokeStyle = "rgba(36,34,31,.25)";
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    state.tumorCache = canvas;
  }

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(2, Math.round(rect.width * dpr));
    const height = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      return true;
    }
    return false;
  }

  function roundRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawTumor() {
    const canvas = $("#tumorCanvas");
    resizeCanvas(canvas);
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    context.clearRect(0, 0, width, height);
    if (!state.tumorCache) return;

    const size = Math.min(width, height) * 0.86;
    const x = (width - size) / 2;
    const y = (height - size) / 2;
    context.drawImage(state.tumorCache, x, y, size, size);
    const radius = size * 326 / 720;
    const centerX = width / 2;
    const centerY = height / 2;
    state.canvasGeom = { centerX, centerY, radius, dpr, size };

    state.manualCores.forEach((core, index) => {
      const px = centerX + core.x * radius;
      const py = centerY + core.y * radius;
      context.save();
      context.translate(px, py);
      context.rotate(core.angle);
      const length = core.len * radius;
      const coreWidth = core.width * radius;
      context.fillStyle = "rgba(36,34,31,.08)";
      context.strokeStyle = index === state.manualCores.length - 1 ? "rgba(36,34,31,.9)" : "rgba(36,34,31,.55)";
      context.lineWidth = 1.2 * dpr;
      roundRectPath(context, -length / 2, -coreWidth / 2, length, coreWidth, coreWidth / 2);
      context.fill();
      context.stroke();
      context.restore();
    });

    if (state.hover?.clone >= 0) {
      const px = centerX + state.hover.x * radius;
      const py = centerY + state.hover.y * radius;
      context.beginPath();
      context.arc(px, py, 5 * dpr, 0, Math.PI * 2);
      context.fillStyle = "#fff";
      context.fill();
      context.strokeStyle = "rgba(0,0,0,.55)";
      context.lineWidth = 2 * dpr;
      context.stroke();
    }
  }

  let heroLastFrame = 0;
  function drawHeroFrame(timestamp = 0) {
    if (!state.heroVisible || !state.tumorCache) return;
    if (timestamp && timestamp - heroLastFrame < 33) return;
    heroLastFrame = timestamp;
    const canvas = $("#heroCanvas");
    resizeCanvas(canvas);
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const size = Math.min(width * 0.9, height * 0.92);
    const x = (width - size) / 2;
    const y = (height - size) / 2 + 4;
    context.globalAlpha = 0.92;
    context.drawImage(state.tumorCache, x, y, size, size);
    context.globalAlpha = 1;

    const time = (timestamp || performance.now()) / 1900;
    const radius = size * 326 / 720;
    const centerX = width / 2;
    const centerY = y + size / 2;
    for (let i = 0; i < 3; i += 1) {
      const angle = time * 0.32 + i * 2.15;
      const ring = 0.16 + 0.26 * i;
      const bx = centerX + Math.cos(angle) * radius * ring;
      const by = centerY + Math.sin(angle * 0.87) * radius * ring;
      context.save();
      context.translate(bx, by);
      context.rotate(-0.62 + angle * 0.08);
      context.strokeStyle = "rgba(36,34,31,.55)";
      context.fillStyle = "rgba(36,34,31,.05)";
      context.lineWidth = 1.2;
      roundRectPath(context, -radius * 0.18, -radius * 0.025, radius * 0.36, radius * 0.05, radius * 0.025);
      context.fill();
      context.stroke();
      context.restore();
    }
  }

  function startHeroAnimation() {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let heroRafId = 0;
    const loop = (timestamp) => {
      heroRafId = 0;
      drawHeroFrame(timestamp);
      if (state.heroVisible && !document.hidden) heroRafId = requestAnimationFrame(loop);
    };
    const startLoop = () => {
      if (!reduceMotion && !heroRafId && state.heroVisible && !document.hidden) heroRafId = requestAnimationFrame(loop);
    };
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        state.heroVisible = entries.some((entry) => entry.isIntersecting);
        if (state.heroVisible && reduceMotion) drawHeroFrame(performance.now());
        if (state.heroVisible) startLoop();
      }, { threshold: 0.05 });
      observer.observe($(".hero-visual"));
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) startLoop();
    });
    if (reduceMotion) {
      drawHeroFrame(performance.now());
      return;
    }
    startLoop();
  }

  function lookupClone(x, y) {
    const resolution = state.gridRes;
    const gx = Math.floor((x + 1) * 0.5 * resolution);
    const gy = Math.floor((y + 1) * 0.5 * resolution);
    if (gx < 0 || gy < 0 || gx >= resolution || gy >= resolution) return -1;
    const index = state.grid[gy * resolution + gx];
    return index >= 0 ? state.cells[index].clone : -1;
  }

  function coreGeometry(x, y, angle) {
    return {
      x,
      y,
      angle,
      len: (state.coreLength / 100) * 1.34,
      width: (state.coreWidth / 100) * 1.15
    };
  }

  function randomPointInCircle(rng, minRadius = 0, maxRadius = 0.82) {
    const angle = rng() * Math.PI * 2;
    const u = rng();
    const radius = Math.sqrt(minRadius * minRadius + u * (maxRadius * maxRadius - minRadius * minRadius));
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  function generateCores(strategy, rng, count = state.biopsyCount) {
    const cores = [];
    if (strategy === "dispersed") {
      const candidates = [];
      for (let i = 0; i < Math.max(40, count * 16); i += 1) {
        const point = randomPointInCircle(rng, 0, 0.84);
        candidates.push({ ...point, angle: rng() * Math.PI });
      }
      cores.push(candidates.splice(Math.floor(rng() * candidates.length), 1)[0]);
      while (cores.length < count) {
        let best = null;
        let bestDistance = -1;
        let bestIndex = 0;
        candidates.forEach((point, index) => {
          const distance = Math.min(...cores.map((core) => (point.x - core.x) ** 2 + (point.y - core.y) ** 2));
          if (distance > bestDistance) {
            bestDistance = distance;
            best = point;
            bestIndex = index;
          }
        });
        cores.push(best);
        candidates.splice(bestIndex, 1);
      }
    } else {
      for (let i = 0; i < count; i += 1) {
        let point;
        if (strategy === "center") point = randomPointInCircle(rng, 0, 0.38);
        else if (strategy === "center-edge") point = i % 2 === 0 ? randomPointInCircle(rng, 0, 0.28) : randomPointInCircle(rng, 0.62, 0.84);
        else point = randomPointInCircle(rng, 0, 0.84);
        cores.push({ ...point, angle: rng() * Math.PI });
      }
    }
    return cores.map((core) => coreGeometry(core.x, core.y, core.angle));
  }

  function sampleCoreGrid(core) {
    const counts = new Array(state.cloneCount).fill(0);
    let total = 0;
    const alongSteps = 17;
    const acrossSteps = 7;
    const cos = Math.cos(core.angle);
    const sin = Math.sin(core.angle);

    for (let ai = 0; ai < alongSteps; ai += 1) {
      const along = (((ai + 0.5) / alongSteps) - 0.5) * core.len;
      for (let wi = 0; wi < acrossSteps; wi += 1) {
        const across = (((wi + 0.5) / acrossSteps) - 0.5) * core.width;
        const x = core.x + along * cos - across * sin;
        const y = core.y + along * sin + across * cos;
        const clone = lookupClone(x, y);
        if (clone >= 0) {
          counts[clone] += 1;
          total += 1;
        }
      }
    }
    return { counts, total };
  }

  function sampleCoreExact(core) {
    const counts = new Array(state.cloneCount).fill(0);
    let total = 0;
    const cos = Math.cos(core.angle);
    const sin = Math.sin(core.angle);
    for (const point of state.cells) {
      const dx = point.x - core.x;
      const dy = point.y - core.y;
      const along = dx * cos + dy * sin;
      const across = -dx * sin + dy * cos;
      if (Math.abs(along) <= core.len / 2 && Math.abs(across) <= core.width / 2) {
        counts[point.clone] += 1;
        total += 1;
      }
    }
    return { counts, total };
  }

  function evaluateCores(cores, exact = false) {
    const coreSamples = cores.map((core) => exact ? sampleCoreExact(core) : sampleCoreGrid(core));
    const pooledCounts = new Array(state.cloneCount).fill(0);
    let pooledTotal = 0;
    coreSamples.forEach((sample) => {
      pooledTotal += sample.total;
      sample.counts.forEach((count, index) => pooledCounts[index] += count);
    });
    const pooledFractions = pooledCounts.map((count) => pooledTotal ? count / pooledTotal : 0);
    const floor = state.detectFloor / 100;

    let detected;
    if (state.assayMode === "per-core") {
      detected = new Array(state.cloneCount).fill(false);
      coreSamples.forEach((sample) => {
        if (!sample.total) return;
        sample.counts.forEach((count, index) => {
          if (count / sample.total >= floor) detected[index] = true;
        });
      });
    } else {
      detected = pooledFractions.map((fraction) => fraction >= floor);
    }

    const truthPresent = state.prevalence.map((fraction) => fraction > 0);
    const truthCount = truthPresent.filter(Boolean).length || 1;
    let recovered = 0;
    let missAny = false;
    truthPresent.forEach((present, index) => {
      if (!present) return;
      if (detected[index]) recovered += 1;
      else missAny = true;
    });

    const totalVariation = 0.5 * pooledFractions.reduce((sum, fraction, index) => sum + Math.abs(fraction - state.prevalence[index]), 0);
    const rareIndex = state.cloneCount - 1;
    const perCoreRareFractions = coreSamples.map((sample) => sample.total ? sample.counts[rareIndex] / sample.total : 0);

    return {
      counts: pooledCounts,
      total: pooledTotal,
      frac: pooledFractions,
      detected,
      rareDetected: detected[rareIndex],
      rarePeak: perCoreRareFractions.length ? Math.max(...perCoreRareFractions) : 0,
      recovery: recovered / truthCount,
      missAny,
      representativeness: clamp(1 - totalVariation, 0, 1)
    };
  }

  function wilsonInterval(successes, total, z = 1.96) {
    if (!total) return [NaN, NaN];
    const p = successes / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denom;
    const half = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total) / denom;
    return [clamp(center - half, 0, 1), clamp(center + half, 0, 1)];
  }

  function simulationSeedTag(seedTag, strategy, count) {
    return [
      "sim", seedTag, strategy, count, state.coreLength, state.coreWidth,
      state.detectFloor, state.assayMode, state.architecture, state.cloneCount,
      state.rarePct, state.clustering
    ].join("|");
  }

  async function runSimulationAsync(strategy, runs, count, seedTag, onProgress) {
    const rng = rngFor(simulationSeedTag(seedTag, strategy, count));
    const rareIndex = state.cloneCount - 1;
    let rareMisses = 0;
    let anyMisses = 0;
    let recoverySum = 0;
    let representativenessSum = 0;
    const batchSize = 120;

    for (let i = 0; i < runs; i += 1) {
      const cores = generateCores(strategy, rng, count);
      const evaluation = evaluateCores(cores, false);
      if (!evaluation.detected[rareIndex]) rareMisses += 1;
      if (evaluation.missAny) anyMisses += 1;
      recoverySum += evaluation.recovery;
      representativenessSum += evaluation.representativeness;

      if ((i + 1) % batchSize === 0 || i === runs - 1) {
        onProgress?.((i + 1) / runs);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    const ci = wilsonInterval(rareMisses, runs);
    return {
      strategy,
      runs,
      n: count,
      assayMode: state.assayMode,
      rareMisses,
      rareMiss: rareMisses / runs,
      rareMissCiLow: ci[0],
      rareMissCiHigh: ci[1],
      anyMiss: anyMisses / runs,
      recovery: recoverySum / runs,
      representativeness: representativenessSum / runs
    };
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderLegend() {
    const container = $("#legend");
    const fragment = document.createDocumentFragment();
    state.prevalence.forEach((fraction, index) => {
      const row = makeElement("div", "legend-item");
      const name = makeElement("span", "legend-name");
      const swatch = makeElement("span", "swatch");
      swatch.style.background = CLONE_COLORS[index];
      name.append(swatch, document.createTextNode(cloneName(index)));
      const value = makeElement("b", "", fmtPct(fraction));
      row.append(name, value);
      fragment.append(row);
    });
    container.replaceChildren(fragment);
  }

  function renderCloneBars(evaluation = null) {
    const container = $("#cloneBars");
    const fragment = document.createDocumentFragment();
    state.prevalence.forEach((truth, index) => {
      const sampled = evaluation ? evaluation.frac[index] || 0 : truth;
      const row = makeElement("div", "bar-row");
      const label = makeElement("div", "bar-label");
      const left = makeElement("span", "", cloneName(index));
      const right = makeElement(
        "span",
        "",
        evaluation ? `样本 ${fmtPct(sampled)} · 全肿瘤 ${fmtPct(truth)}` : `全肿瘤 ${fmtPct(truth)}`
      );
      label.append(left, right);
      const track = makeElement("div", "track");
      const fill = makeElement("div", "fill");
      fill.style.width = `${clamp(sampled * 100, 0, 100)}%`;
      fill.style.background = CLONE_COLORS[index];
      track.append(fill);
      row.append(label, track);
      fragment.append(row);
    });
    container.replaceChildren(fragment);
  }

  function renderManual() {
    const evaluation = state.manualCores.length ? evaluateCores(state.manualCores, true) : null;
    $("#manualCountPill").textContent = `已放置 ${state.manualCores.length} 根芯针`;
    $("#coresPlaced").textContent = String(state.manualCores.length);
    const rare = $("#rareDetected");
    rare.textContent = evaluation ? (evaluation.rareDetected ? "已捕获" : "未捕获") : "—";
    rare.style.color = evaluation ? (evaluation.rareDetected ? "var(--good)" : "var(--danger)") : "";
    $("#manualRecovery").textContent = evaluation ? fmtPct(evaluation.recovery, 0) : "—";
    $("#manualRep").textContent = evaluation ? fmtPct(evaluation.representativeness, 0) : "—";
    renderCloneBars(evaluation);
    drawTumor();
  }

  function renderMc() {
    const result = state.lastMc;
    $("#mcRareMiss").textContent = result ? fmtPct(result.rareMiss) : "—";
    $("#heroMiss").textContent = result ? fmtPct(result.rareMiss) : "待计算";
    $("#heroVisibility").textContent = result ? fmtPct(1 - result.rareMiss) : "待计算";

    if (result) {
      $("#mcExplain").textContent = `在 ${result.runs.toLocaleString("zh-CN")} 次虚拟重复中，${STRATEGIES[result.strategy].name}漏掉稀有克隆的比例为 ${fmtPct(result.rareMiss)}。`;
      $("#mcCi").textContent = `95% Monte Carlo 区间：${fmtPct(result.rareMissCiLow)} – ${fmtPct(result.rareMissCiHigh)}（仅反映有限重复次数造成的模拟误差）`;
      const capture = 1 - result.rareMiss;
      const conflict = 2 * capture * (1 - capture);
      $("#conflictPct").textContent = fmtPct(conflict);
      $("#conflictText").textContent = `若两家实验室在同一设计下独立取样，按当前捕获概率估计，稀有克隆判定一阳一阴的概率约为 ${fmtPct(conflict)}。`;
    } else {
      $("#mcExplain").textContent = "运行模拟后，将估计当前取样设计漏掉最稀有克隆的概率。";
      $("#mcCi").textContent = "95% Monte Carlo 区间：—";
      $("#conflictPct").textContent = "—";
      $("#conflictText").textContent = "运行 Monte Carlo 后，根据同一设计下的捕获概率估计两次独立取样一阳一阴的概率。";
    }
  }

  function riskClass(value) {
    if (value >= 0.5) return "high";
    if (value >= 0.2) return "med";
    return "low";
  }

  function resetBenchmarkDom() {
    const rows = $("#strategyTable")?.querySelectorAll(".strategy-row:not(.header)") || [];
    rows.forEach((row) => {
      [...row.children].slice(1).forEach((cell) => { cell.textContent = "—"; });
    });
    const summary = $("#benchmarkSummary")?.querySelectorAll("b") || [];
    summary.forEach((item) => { item.textContent = "—"; });
    renderRiskSvg();
  }

  function renderBenchmark() {
    if (!state.benchmark) return;
    const keys = Object.keys(STRATEGIES);
    const rows = $("#strategyTable").querySelectorAll(".strategy-row:not(.header)");
    keys.forEach((key, index) => {
      const result = state.benchmark[key];
      const cells = rows[index].children;
      cells[1].replaceChildren();
      const risk = makeElement("span", `risk ${riskClass(result.rareMiss)}`, fmtPct(result.rareMiss));
      const track = makeElement("div", "mini-track");
      const fill = makeElement("span");
      fill.style.width = `${clamp(result.rareMiss * 100, 0, 100)}%`;
      track.append(fill);
      cells[1].append(risk, track);
      cells[2].textContent = fmtPct(result.anyMiss);
      cells[3].textContent = fmtPct(result.recovery);
      cells[4].textContent = fmtPct(result.representativeness);
    });

    const bestCapture = keys.reduce((best, key) => state.benchmark[key].rareMiss < state.benchmark[best].rareMiss ? key : best, keys[0]);
    const bestRepresentative = keys.reduce((best, key) => state.benchmark[key].representativeness > state.benchmark[best].representativeness ? key : best, keys[0]);
    const summary = $("#benchmarkSummary").querySelectorAll("b");
    summary[0].textContent = STRATEGIES[bestCapture].name;
    summary[1].textContent = STRATEGIES[bestRepresentative].name;

    if (state.curveData && state.biopsyCount < 8) {
      const currentRisk = state.curveData[state.strategy][state.biopsyCount - 1];
      const nextRisk = state.curveData[state.strategy][state.biopsyCount];
      summary[2].textContent = fmtPp(nextRisk - currentRisk);
    } else if (state.biopsyCount >= 8) {
      summary[2].textContent = "已到 8 根上限";
    } else {
      summary[2].textContent = "—";
    }
  }

  function renderRiskSvg() {
    const svg = $("#riskSvg");
    if (!svg) return;
    const width = 650;
    const height = 240;
    const left = 46;
    const right = 18;
    const top = 18;
    const bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    let output = `<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>`;

    for (let y = 0; y <= 4; y += 1) {
      const yy = top + plotHeight * y / 4;
      const value = 100 - y * 25;
      output += `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}" style="stroke:var(--line)"/>`;
      output += `<text x="${left - 8}" y="${yy + 4}" style="fill:var(--muted2)" text-anchor="end" font-size="10">${value}%</text>`;
    }
    for (let n = 1; n <= 8; n += 1) {
      const x = left + plotWidth * (n - 1) / 7;
      output += `<text x="${x}" y="${height - 10}" style="fill:var(--muted2)" text-anchor="middle" font-size="10">${n}</text>`;
    }

    if (state.curveData) {
      const colors = STRATEGY_COLORS;
      Object.keys(STRATEGIES).forEach((key, strategyIndex) => {
        const values = state.curveData[key];
        const points = values.map((value, index) => `${left + plotWidth * index / 7},${top + plotHeight * (1 - value)}`).join(" ");
        output += `<polyline points="${points}" fill="none" stroke="${colors[strategyIndex]}" stroke-width="2.2" opacity=".92"/>`;
        values.forEach((value, index) => {
          output += `<circle cx="${left + plotWidth * index / 7}" cy="${top + plotHeight * (1 - value)}" r="2.7" fill="${colors[strategyIndex]}"/>`;
        });
      });
      let legendX = left;
      Object.keys(STRATEGIES).forEach((key, strategyIndex) => {
        output += `<circle cx="${legendX}" cy="11" r="3" fill="${colors[strategyIndex]}"/>`;
        output += `<text x="${legendX + 8}" y="14" style="fill:var(--muted)" font-size="9">${STRATEGIES[key].short}</text>`;
        legendX += strategyIndex === 2 ? 80 : 72;
      });
    } else {
      output += `<text x="${width / 2}" y="${height / 2}" style="fill:var(--muted2)" text-anchor="middle" font-size="12">运行策略基准后生成风险曲线</text>`;
    }
    svg.innerHTML = output;
  }

  function renderAssayMode() {
    $("#benchmarkModeBadge").textContent = ASSAY_NAMES[state.assayMode];
    const note = $("#assayNote");
    if (state.assayMode === "per-core") {
      note.textContent = "当前按“逐芯针独立检测”计算：只要任意一根芯针中某克隆比例达到阈值，就视为已捕获该克隆。";
      note.classList.remove("warning-note");
    } else {
      note.textContent = "当前按“合并检测”计算：先把全部芯针合并，再对总体克隆比例判阈值。此模式可能出现增加芯针后稀有克隆被比例稀释的情况。";
      note.classList.add("warning-note");
    }
  }

  function renderAll() {
    renderLegend();
    renderManual();
    renderMc();
    renderAssayMode();
    $("#heroRare").textContent = `${state.rarePct.toFixed(1)}%`;
    drawTumor();
    renderRiskSvg();
    updateMethods($("#fingerprint").textContent);
  }

  function updateMethods(fingerprint) {
    const config = currentConfig();
    const aggregation = config.assayMode === "per-core"
      ? "每根芯针独立评估；任意一根芯针中某克隆比例达到阈值即判定该克隆被捕获"
      : "将全部芯针的合成克隆计数合并后，再对总体克隆比例应用统一检测阈值";
    $("#methodsText").value = `CloneCatch 合成空间取样实验\n\n` +
      `使用 CloneCatch 科研模拟沙盒生成二维合成肿瘤网格（随机种子 ${config.seed}）。模型包含 ${config.cloneCount} 个空间克隆类别，稀有克隆目标总体占比为 ${config.rarePct.toFixed(1)}%，空间聚集度参数为 ${config.clustering}/100，空间结构为“${ARCH_NAMES[config.architecture]}”。` +
      `虚拟活检采用“${STRATEGIES[config.strategy].name}”策略，共 ${config.biopsyCount} 根芯针；芯针相对长度为 ${config.coreLength}%，相对宽度为 ${config.coreWidth}%。` +
      `芯针组成使用固定 17×7 规则网格近似积分。克隆检测阈值设为 ${config.detectFloor.toFixed(1)}%，检测聚合规则为：${aggregation}。` +
      `Monte Carlo 风险估计计划使用 ${config.mcRuns.toLocaleString("zh-CN")} 次重复虚拟取样；肿瘤空间结构在固定随机种子下保持不变，随机性仅来自芯针位置与方向。` +
      `整体代表性定义为 1 减去样本克隆组成与全肿瘤克隆组成之间的总变差距离。稀有克隆漏检率同时报告 Wilson 95% Monte Carlo 区间，该区间仅描述有限模拟次数造成的数值误差，不是生物学或临床置信区间。\n\n` +
      `实验配置指纹：${fingerprint || "待计算"}\n\n` +
      `本模拟仅用于研究与教学中的空间取样偏差演示，不建模患者特异性 VAF、肿瘤纯度、倍体状态、测序深度、病理诊断、治疗反应、预后或临床决策。`;
  }

  function download(name, text, type = "text/plain;charset=utf-8") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }

  function exportPng() {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    context.fillStyle = themeColor("--bg", "#f3eee5");
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = themeColor("--text", "#24221f");
    context.font = '700 54px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    context.fillText("CloneCatch", 72, 92);
    context.fillStyle = themeColor("--muted", "#6f6a62");
    context.font = '30px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    context.fillText("看看你的活检漏掉了什么。", 72, 140);
    const side = 1120;
    const radius = side * 326 / 720;
    const centerX = 140 + side / 2;
    const centerY = 205 + side / 2;
    // 直接从缓存与芯针数据绘制，避免依赖可能被隐藏/清空的屏幕画布
    if (state.tumorCache) context.drawImage(state.tumorCache, 140, 205, side, side);
    state.manualCores.forEach((core) => {
      const px = centerX + core.x * radius;
      const py = centerY + core.y * radius;
      context.save();
      context.translate(px, py);
      context.rotate(core.angle);
      const length = core.len * radius;
      const coreWidth = core.width * radius;
      context.fillStyle = "rgba(36,34,31,.08)";
      context.strokeStyle = "rgba(36,34,31,.55)";
      context.lineWidth = 1.2;
      roundRectPath(context, -length / 2, -coreWidth / 2, length, coreWidth, coreWidth / 2);
      context.fill();
      context.stroke();
      context.restore();
    });
    context.fillStyle = themeColor("--text", "#24221f");
    context.font = '24px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    context.fillText(`${STRATEGIES[state.strategy].name} · ${state.biopsyCount} 根芯针 · 检测阈值 ${state.detectFloor.toFixed(1)}%`, 72, 1375);
    context.fillStyle = themeColor("--muted", "#6f6a62");
    context.font = '21px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    context.fillText(`${ASSAY_NAMES[state.assayMode]} · 合成肿瘤 · 种子 ${state.seed}`, 72, 1415);
    context.fillStyle = themeColor("--muted2", "#938b80");
    context.font = '18px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    context.fillText("仅用于科研与教学，不用于患者诊疗决策", 72, 1450);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `clonecatch_seed-${state.seed}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    }, "image/png");
  }

  function mcCsv() {
    const header = "strategy_code,strategy_zh,assay_mode,runs,cores,rare_miss,rare_miss_ci_low,rare_miss_ci_high,any_clone_missed,recovery,representativeness\n";
    if (!state.lastMc) return `\ufeff${header}`;
    const result = state.lastMc;
    const row = [
      result.strategy,
      STRATEGIES[result.strategy].name,
      result.assayMode,
      result.runs,
      result.n,
      result.rareMiss,
      result.rareMissCiLow,
      result.rareMissCiHigh,
      result.anyMiss,
      result.recovery,
      result.representativeness
    ].join(",");
    return `\ufeff${header}${row}\n`;
  }

  function encodeBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decodeBase64Url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function numeric(value, fallback, min, max, integer = false) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const bounded = clamp(parsed, min, max);
    return integer ? Math.round(bounded) : bounded;
  }

  function sanitizeConfig(input = {}) {
    const config = { ...DEFAULTS };
    config.seed = numeric(input.seed, DEFAULTS.seed, 1, 99999999, true);
    config.architecture = Object.prototype.hasOwnProperty.call(ARCH_NAMES, input.architecture) ? input.architecture : DEFAULTS.architecture;
    config.cloneCount = numeric(input.cloneCount, DEFAULTS.cloneCount, 3, 6, true);
    config.rarePct = numeric(input.rarePct, DEFAULTS.rarePct, 0.5, 18);
    config.clustering = numeric(input.clustering, DEFAULTS.clustering, 10, 95, true);
    config.strategy = Object.prototype.hasOwnProperty.call(STRATEGIES, input.strategy) ? input.strategy : DEFAULTS.strategy;
    config.biopsyCount = numeric(input.biopsyCount, DEFAULTS.biopsyCount, 1, 8, true);
    config.coreLength = numeric(input.coreLength, DEFAULTS.coreLength, 18, 62, true);
    config.coreWidth = numeric(input.coreWidth, DEFAULTS.coreWidth, 3, 13, true);
    config.detectFloor = numeric(input.detectFloor, DEFAULTS.detectFloor, 0.5, 10);
    config.assayMode = Object.prototype.hasOwnProperty.call(ASSAY_NAMES, input.assayMode) ? input.assayMode : DEFAULTS.assayMode;
    const runs = numeric(input.mcRuns, DEFAULTS.mcRuns, 1000, 20000, true);
    config.mcRuns = RUN_OPTIONS.includes(runs) ? runs : DEFAULTS.mcRuns;
    return config;
  }

  function sanitizeCore(core) {
    if (!core || typeof core !== "object") return null;
    const x = Number(core.x);
    const y = Number(core.y);
    const angle = Number(core.angle);
    const len = Number(core.len);
    const width = Number(core.width);
    if (![x, y, angle, len, width].every(Number.isFinite)) return null;
    if (x < -1.1 || x > 1.1 || y < -1.1 || y > 1.1) return null;
    if (Math.hypot(x, y) > 1.05) return null;
    if (len < 0.1 || len > 1.1 || width < 0.02 || width > 0.3) return null;
    return { x, y, angle: clamp(angle, -Math.PI * 4, Math.PI * 4), len, width };
  }

  function makeShare() {
    const payload = {
      version: 1,
      config: currentConfig(),
      manualCores: state.manualCores.slice(0, 8),
      placementNonce: state.placementNonce
    };
    location.hash = `cc=${encodeBase64Url(JSON.stringify(payload))}`;
    toast("分享状态已写入当前 URL");
  }

  function readShareState() {
    try {
      const match = location.hash.match(/(?:^#|&)cc=([^&]+)/);
      if (!match) return null;
      const decoded = JSON.parse(decodeBase64Url(match[1]));
      const rawConfig = decoded?.config && typeof decoded.config === "object" ? decoded.config : decoded;
      const config = sanitizeConfig(rawConfig);
      const manualCores = Array.isArray(decoded?.manualCores)
        ? decoded.manualCores.slice(0, 8).map(sanitizeCore).filter(Boolean)
        : [];
      const placementNonce = numeric(decoded?.placementNonce, 0, 0, 1000000, true);
      return { config, manualCores, placementNonce };
    } catch (error) {
      console.warn("Invalid shared state", error);
      toast("分享链接状态无效，已使用安全默认参数");
      return null;
    }
  }

  function applyConfig(config) {
    Object.assign(state, sanitizeConfig(config));
  }

  function syncControls() {
    $("#architecture").value = state.architecture;
    $("#cloneCount").value = state.cloneCount;
    $("#rarePct").value = state.rarePct;
    $("#clustering").value = state.clustering;
    $("#seedInput").value = state.seed;
    $("#strategy").value = state.strategy;
    $("#biopsyCount").value = state.biopsyCount;
    $("#coreLength").value = state.coreLength;
    $("#coreWidth").value = state.coreWidth;
    $("#detectFloor").value = state.detectFloor;
    $("#assayMode").value = state.assayMode;
    $("#cloneCountOut").value = state.cloneCount;
    $("#rarePctOut").value = `${state.rarePct.toFixed(1)}%`;
    $("#clusteringOut").value = state.clustering;
    $("#biopsyCountOut").value = state.biopsyCount;
    $("#coreLengthOut").value = `${state.coreLength}%`;
    $("#coreWidthOut").value = `${state.coreWidth}%`;
    $("#detectFloorOut").value = `${state.detectFloor.toFixed(1)}%`;
    $$("#runsSeg button").forEach((button) => button.classList.toggle("active", Number(button.dataset.runs) === state.mcRuns));
    $("#labAStrategy").textContent = STRATEGIES[state.strategy].name;
    $("#labBStrategy").textContent = STRATEGIES[state.strategy].name;
    renderAssayMode();
  }

  function invalidateSampling() {
    state.manualCores = [];
    state.lastMc = null;
    state.benchmark = null;
    state.curveData = null;
    state.curveRuns = 0;
    resetBenchmarkDom();
    renderAll();
    updateFingerprint();
  }

  function setTab(name, focus = false) {
    $$(".tab").forEach((button) => {
      const selected = button.dataset.tab === name;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      if (selected && focus) button.focus();
    });
    $$(".view").forEach((view) => {
      const active = view.id === `view-${name}`;
      view.classList.toggle("active", active);
      view.hidden = !active;
    });
    if (name === "benchmark") renderRiskSvg();
  }

  function setBusy(busy) {
    state.busy = busy;
    const selectors = [
      ".controls input", ".controls select", ".controls button", ".tabs button",
      "#autoPlaceBtn", "#clearCoresBtn", "#runMcBtn", "#runBenchmarkBtn",
      "#labsMcBtn", "#replayLabsBtn", "#newSeedBtn", "#regenerateBtn"
    ];
    $$(selectors.join(",")).forEach((element) => { element.disabled = busy; });
    $("#tumorCanvas").setAttribute("aria-busy", String(busy));
  }

  function autoPlace() {
    state.placementNonce += 1;
    const rng = rngFor(`autoplace|${state.placementNonce}|${state.strategy}|${state.biopsyCount}`);
    state.manualCores = generateCores(state.strategy, rng, state.biopsyCount);
    renderManual();
    toast("已按当前策略放置芯针");
  }

  function canvasPoint(event) {
    const canvas = $("#tumorCanvas");
    const rect = canvas.getBoundingClientRect();
    const geometry = state.canvasGeom;
    if (!geometry) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (event.clientX - rect.left) * scaleX;
    const py = (event.clientY - rect.top) * scaleY;
    const x = (px - geometry.centerX) / geometry.radius;
    const y = (py - geometry.centerY) / geometry.radius;
    return { x, y, inside: lookupClone(x, y) >= 0 };
  }

  function placeManualCore(x, y) {
    if (lookupClone(x, y) < 0) return;
    if (state.manualCores.length >= 8) {
      state.manualCores.shift();
      toast("已达到 8 根芯针上限，最早放置的芯针已被移除");
    }
    state.placementNonce += 1;
    const rng = rngFor(`manual-angle|${state.placementNonce}|${x.toFixed(4)}|${y.toFixed(4)}`);
    state.manualCores.push(coreGeometry(x, y, -0.5 + rng() * Math.PI));
    renderManual();
  }

  async function runMc() {
    if (state.busy) return;
    setBusy(true);
    const button = $("#runMcBtn");
    const progress = $("#mcProgress");
    const status = $("#runStatus");
    const statusPct = $("#runStatusPct");
    button.textContent = "正在模拟…";
    status.textContent = `正在运行 ${state.mcRuns.toLocaleString("zh-CN")} 次虚拟取样`;
    statusPct.textContent = "0%";
    progress.style.width = "0%";

    try {
      state.lastMc = await runSimulationAsync(
        state.strategy,
        state.mcRuns,
        state.biopsyCount,
        "main",
        (fraction) => {
          const percent = Math.round(fraction * 100);
          progress.style.width = `${percent}%`;
          statusPct.textContent = `${percent}%`;
        }
      );
      renderMc();
      await updateFingerprint();
      status.textContent = `完成 · ${state.lastMc.runs.toLocaleString("zh-CN")} 次重复`;
      statusPct.textContent = "100%";
      toast("Monte Carlo 模拟完成");
    } catch (error) {
      console.error(error);
      status.textContent = "模拟失败，请刷新后重试";
      statusPct.textContent = "";
      toast("模拟发生错误");
    } finally {
      button.textContent = "运行 Monte Carlo";
      setBusy(false);
      setTimeout(() => { progress.style.width = "0%"; }, 550);
    }
  }

  async function runBenchmark() {
    if (state.busy) return;
    setBusy(true);
    const button = $("#runBenchmarkBtn");
    const keys = Object.keys(STRATEGIES);
    const mainRuns = Math.min(state.mcRuns, 5000);
    const curveRuns = state.mcRuns >= 10000 ? 800 : 600;
    const totalJobs = keys.length + keys.length * 8;
    let completedJobs = 0;
    button.textContent = `基准分析 0/${totalJobs}`;

    try {
      const results = {};
      for (const key of keys) {
        results[key] = await runSimulationAsync(key, mainRuns, state.biopsyCount, `benchmark-main|${key}`);
        completedJobs += 1;
        button.textContent = `基准分析 ${completedJobs}/${totalJobs}`;
      }
      state.benchmark = results;

      const curve = {};
      for (const key of keys) {
        curve[key] = [];
        for (let count = 1; count <= 8; count += 1) {
          const result = await runSimulationAsync(key, curveRuns, count, `benchmark-curve|${key}|${count}`);
          curve[key].push(result.rareMiss);
          completedJobs += 1;
          button.textContent = `基准分析 ${completedJobs}/${totalJobs}`;
        }
      }
      state.curveData = curve;
      state.curveRuns = curveRuns;
      renderBenchmark();
      renderRiskSvg();
      toast("策略基准分析完成");
    } catch (error) {
      console.error(error);
      toast("策略基准分析失败");
    } finally {
      button.textContent = "运行策略基准";
      setBusy(false);
    }
  }

  function replayLabs() {
    if (state.busy) return;
    state.replayNonce += 1;
    const rngA = rngFor(`lab-A|${state.replayNonce}`);
    const rngB = rngFor(`lab-B|${state.replayNonce}`);
    const a = evaluateCores(generateCores(state.strategy, rngA, state.biopsyCount), false);
    const b = evaluateCores(generateCores(state.strategy, rngB, state.biopsyCount), false);
    const rareIndex = state.cloneCount - 1;

    const setResult = (prefix, evaluation) => {
      const result = $(`#${prefix}Result`);
      result.textContent = evaluation.detected[rareIndex] ? "已捕获" : "未捕获";
      result.style.color = evaluation.detected[rareIndex] ? "var(--good)" : "var(--danger)";
      const metric = state.assayMode === "per-core"
        ? `最高单芯针稀有克隆比例 ${fmtPct(evaluation.rarePeak)}`
        : `合并样本稀有克隆比例 ${fmtPct(evaluation.frac[rareIndex])}`;
      $(`#${prefix}Detail`).textContent = `${metric}；克隆景观恢复率 ${fmtPct(evaluation.recovery, 0)}；代表性 ${fmtPct(evaluation.representativeness, 0)}。`;
    };

    setResult("labA", a);
    setResult("labB", b);
  }

  async function estimateLabs() {
    if (state.busy) return;
    setBusy(true);
    const button = $("#labsMcBtn");
    button.textContent = "正在估计…";
    try {
      state.lastMc = await runSimulationAsync(state.strategy, state.mcRuns, state.biopsyCount, "two-labs");
      renderMc();
      await updateFingerprint();
      toast("双实验室冲突率已估计");
    } finally {
      button.textContent = "立即估计冲突率";
      setBusy(false);
    }
  }

  function bindRange(id, stateKey, outputId, formatter = (value) => value) {
    const input = $(id);
    input.addEventListener("input", (event) => {
      state[stateKey] = Number(event.target.value);
      $(outputId).value = formatter(state[stateKey]);
      if (["coreLength", "coreWidth", "detectFloor", "biopsyCount"].includes(stateKey)) invalidateSampling();
    });
  }

  async function copyMethods() {
    const text = $("#methodsText").value;
    try {
      await navigator.clipboard.writeText(text);
      toast("Methods 已复制");
    } catch (error) {
      const area = $("#methodsText");
      area.focus();
      area.select();
      const ok = document.execCommand?.("copy");
      toast(ok ? "Methods 已复制" : "请手动复制 Methods 文本");
    }
  }

  function bindTabs() {
    const tabs = $$(".tab");
    tabs.forEach((button, index) => {
      button.addEventListener("click", () => setTab(button.dataset.tab));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        setTab(tabs[nextIndex].dataset.tab, true);
      });
    });
  }

  function bindEvents() {
    bindTabs();
    $("#jumpBtn").addEventListener("click", () => $("#simulator").scrollIntoView({ behavior: "smooth" }));
    $("#heroStart").addEventListener("click", () => $("#simulator").scrollIntoView({ behavior: "smooth" }));
    $("#heroBenchmark").addEventListener("click", () => {
      setTab("benchmark");
      $("#simulator").scrollIntoView({ behavior: "smooth" });
    });

    $("#architecture").addEventListener("change", (event) => {
      state.architecture = event.target.value;
      buildTumor();
    });
    $("#strategy").addEventListener("change", (event) => {
      state.strategy = event.target.value;
      syncControls();
      invalidateSampling();
    });
    $("#assayMode").addEventListener("change", (event) => {
      state.assayMode = event.target.value;
      syncControls();
      invalidateSampling();
    });

    bindRange("#cloneCount", "cloneCount", "#cloneCountOut");
    bindRange("#rarePct", "rarePct", "#rarePctOut", (value) => `${value.toFixed(1)}%`);
    bindRange("#clustering", "clustering", "#clusteringOut");
    bindRange("#biopsyCount", "biopsyCount", "#biopsyCountOut");
    bindRange("#coreLength", "coreLength", "#coreLengthOut", (value) => `${value}%`);
    bindRange("#coreWidth", "coreWidth", "#coreWidthOut", (value) => `${value}%`);
    bindRange("#detectFloor", "detectFloor", "#detectFloorOut", (value) => `${value.toFixed(1)}%`);

    $("#cloneCount").addEventListener("change", buildTumor);
    $("#rarePct").addEventListener("change", buildTumor);
    $("#clustering").addEventListener("change", buildTumor);
    $("#seedInput").addEventListener("change", (event) => {
      state.seed = numeric(event.target.value, DEFAULTS.seed, 1, 99999999, true);
      syncControls();
      buildTumor();
    });
    $("#regenerateBtn").addEventListener("click", () => {
      state.seed = numeric($("#seedInput").value, DEFAULTS.seed, 1, 99999999, true);
      syncControls();
      buildTumor();
    });
    $("#newSeedBtn").addEventListener("click", () => {
      const random = globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.floor(Math.random() * 0xffffffff);
      state.seed = 1 + (random % 99999998);
      syncControls();
      buildTumor();
    });

    $$("#runsSeg button").forEach((button) => {
      button.addEventListener("click", () => {
        state.mcRuns = Number(button.dataset.runs);
        state.lastMc = null;
        syncControls();
        renderMc();
        updateFingerprint();
      });
    });

    $("#autoPlaceBtn").addEventListener("click", autoPlace);
    $("#clearCoresBtn").addEventListener("click", () => {
      state.manualCores = [];
      renderManual();
    });
    $("#runMcBtn").addEventListener("click", runMc);
    $("#runBenchmarkBtn").addEventListener("click", runBenchmark);
    $("#toBenchmarkBtn").addEventListener("click", () => setTab("benchmark"));
    $("#labsMcBtn").addEventListener("click", estimateLabs);
    $("#replayLabsBtn").addEventListener("click", replayLabs);

    const tumorCanvas = $("#tumorCanvas");
    tumorCanvas.addEventListener("click", (event) => {
      const point = canvasPoint(event);
      if (point?.inside) placeManualCore(point.x, point.y);
    });
    tumorCanvas.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        placeManualCore(0, 0);
      }
    });
    tumorCanvas.addEventListener("mousemove", (event) => {
      const point = canvasPoint(event);
      const tooltip = $("#canvasTooltip");
      if (point?.inside) {
        const clone = lookupClone(point.x, point.y);
        state.hover = { x: point.x, y: point.y, clone };
        tooltip.textContent = `${cloneName(clone)} · x=${point.x.toFixed(2)}, y=${point.y.toFixed(2)}`;
        tooltip.classList.add("show");
      } else {
        state.hover = null;
        tooltip.classList.remove("show");
      }
      drawTumor();
    });
    tumorCanvas.addEventListener("mouseleave", () => {
      state.hover = null;
      $("#canvasTooltip").classList.remove("show");
      drawTumor();
    });

    $("#snapshotBtn").addEventListener("click", exportPng);
    $("#downloadPngBtn2").addEventListener("click", exportPng);
    $("#downloadJsonBtn").addEventListener("click", () => download(`clonecatch_seed-${state.seed}.json`, JSON.stringify({ version: 1, config: currentConfig(), manualCores: state.manualCores }, null, 2), "application/json;charset=utf-8"));
    $("#downloadCsvBtn").addEventListener("click", () => download(`clonecatch_mc_seed-${state.seed}.csv`, mcCsv(), "text/csv;charset=utf-8"));
    $("#downloadMethodsBtn").addEventListener("click", () => download(`clonecatch_methods_seed-${state.seed}.txt`, $("#methodsText").value));
    $("#copyMethodsBtn").addEventListener("click", copyMethods);
    $("#shareBtn2").addEventListener("click", makeShare);

    window.addEventListener("resize", () => {
      drawTumor();
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) drawHeroFrame(performance.now());
    });
  }

  function init() {
    const shared = readShareState();
    applyConfig(shared?.config || DEFAULTS);
    bindEvents();
    syncControls();
    buildTumor();
    if (shared) {
      state.manualCores = shared.manualCores;
      state.placementNonce = shared.placementNonce;
      renderManual();
      toast("已载入并校验分享实验状态");
    }
    startHeroAnimation();
    setTab("explore");
  }

  init();
})();
