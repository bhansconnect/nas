/* ============================================================
   Temperature Blanket — App Engine v2
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const GEO_URL     = 'https://geocoding-api.open-meteo.com/v1/search';
const ROW_H       = 5; // px per day row (before auto-scaling)

const BUCKET_MODES = {
  dense12:       { name: 'Dense Middle · 12 zones', bounds: [0,1,10,20,30,42.5,50,57.5,70,80,90,99,100] },
  dense10:       { name: 'Dense Middle · 10 zones', bounds: [0,5,15,25,37.5,50,62.5,75,85,95,100] },
  'uniform-pct': { name: 'Uniform Percentile',      bounds: [0,10,20,30,40,50,60,70,80,90,100] },
  'uniform-temp':{ name: 'Uniform Temp',            bounds: null },
};

const ZONE_NAMES_12 = ['super extreme cold','extreme cold','cold','cool','mild-low','mid-low','mid-high','mild-high','warm','hot','extreme hot','super extreme hot']; // 12 names for 12 zones
// Note: zones map to bounds [0,1,10,20,30,42.5,50,57.5,70,80,90,99,100] — 12 bands
const ZONE_NAMES_10 = ['extreme cold','cold','cool','mild-low','mid-low','mid-high','mild-high','warm','hot','extreme hot'];
const ZONE_NAMES_UNIFORM = ['zone 1','zone 2','zone 3','zone 4','zone 5','zone 6','zone 7','zone 8','zone 9','zone 10'];

const PALETTES = {
  // ── Thermal: classic diverging blue → yellow → red
  thermal: {
    name: 'Thermal',
    colors12: [
      '#003a6d', '#0072c3', '#33b1ff', '#82cfff', '#bae6ff', '#f6f2c0',
      '#ffe57a', '#ff9f43', '#ff6b35', '#da1e28', '#750e13', '#2a0000',
    ],
    colors10: [
      '#0072c3', '#33b1ff', '#82cfff', '#bae6ff',
      '#f6f2c0', '#ffe57a', '#ff9f43', '#ff6b35', '#da1e28', '#750e13',
    ],
  },

  // ── Rainbow: classic weather-map rainbow, maximum contrast
  rainbow: {
    name: 'Rainbow',
    colors12: [
      '#4B0082', '#7B2D8E', '#2851A4', '#4682B4', '#2E8B8B', '#2E8B57',
      '#7CCD7C', '#FFD700', '#FFAA00', '#FF6B00', '#E23D28', '#990000',
    ],
    colors10: [
      '#7B2D8E', '#2851A4', '#4682B4', '#2E8B8B',
      '#2E8B57', '#FFD700', '#FFAA00', '#FF6B00', '#E23D28', '#990000',
    ],
  },

  // ── Jewel Tones: rich saturated gemstone colors
  jewel: {
    name: 'Jewel Tones',
    colors12: [
      '#2D1B69', '#0F52BA', '#0D7377', '#046307', '#6B8E23', '#E4A010',
      '#D49B3A', '#CC5500', '#9B111E', '#733635', '#913067', '#6C3082',
    ],
    colors10: [
      '#0F52BA', '#0D7377', '#046307', '#6B8E23',
      '#E4A010', '#CC5500', '#9B111E', '#733635', '#913067', '#6C3082',
    ],
  },

  // ── Ocean: deep abyss → teal → seafoam → warm sand → coral
  ocean: {
    name: 'Ocean',
    colors12: [
      '#0A1128', '#1A3E5D', '#1B4F72', '#2874A6', '#3A8D8D', '#48B5A0',
      '#7ECFC0', '#A8E6CF', '#D4EFE6', '#EDD9B4', '#F08080', '#E05555',
    ],
    colors10: [
      '#1A3E5D', '#1B4F72', '#2874A6', '#3A8D8D',
      '#48B5A0', '#A8E6CF', '#D4EFE6', '#EDD9B4', '#F08080', '#E05555',
    ],
  },

  // ── Sunset: twilight indigo → dusty rose → peach → amber → deep crimson
  sunset: {
    name: 'Sunset',
    colors12: [
      '#2C2449', '#5B3A6E', '#8E5B7E', '#C27C8E', '#E29B9B', '#F5C1A8',
      '#FDDCB5', '#F5B870', '#E89B3A', '#D1603D', '#C93C20', '#8B1A1A',
    ],
    colors10: [
      '#5B3A6E', '#8E5B7E', '#C27C8E', '#E29B9B',
      '#F5C1A8', '#F5B870', '#E89B3A', '#D1603D', '#C93C20', '#8B1A1A',
    ],
  },

  // ── Forest: frost → lichen → moss → bark → autumn red
  forest: {
    name: 'Forest',
    colors12: [
      '#E8E8E0', '#C5C5B8', '#8A9A7E', '#7A8B6E', '#5A7247', '#2E6F40',
      '#1E4D2B', '#6B4226', '#8B5A2B', '#B87333', '#B7410E', '#8B2500',
    ],
    colors10: [
      '#C5C5B8', '#8A9A7E', '#7A8B6E', '#5A7247',
      '#2E6F40', '#6B4226', '#8B5A2B', '#B87333', '#B7410E', '#8B2500',
    ],
  },

  // ── Pastel: soft watercolor tones, gentle progression
  pastel: {
    name: 'Pastel',
    colors12: [
      '#D6D0E8', '#B8B8DC', '#A8C8E8', '#B5D8E8', '#B5E8D5', '#C5E8D0',
      '#D8E8B5', '#F0E8B5', '#F5D5B8', '#F0C0C0', '#E0A8A8', '#D08888',
    ],
    colors10: [
      '#B8B8DC', '#A8C8E8', '#B5D8E8', '#B5E8D5',
      '#C5E8D0', '#F0E8B5', '#F5D5B8', '#F0C0C0', '#E0A8A8', '#D08888',
    ],
  },

  // ── Nordic: minimalist gray-toned Scandinavian palette
  nordic: {
    name: 'Nordic',
    colors12: [
      '#F2F3F6', '#D7E0E8', '#A9B9C7', '#6F7E8A', '#5A6670', '#8E8680',
      '#C4B7A6', '#C4A0A0', '#B87D6E', '#9C5656', '#7A3B4A', '#2F3B45',
    ],
    colors10: [
      '#D7E0E8', '#A9B9C7', '#6F7E8A', '#5A6670',
      '#8E8680', '#C4A0A0', '#B87D6E', '#9C5656', '#7A3B4A', '#2F3B45',
    ],
  },

  // ── Berry: monochromatic pink-purple ombre
  berry: {
    name: 'Berry',
    colors12: [
      '#E8D5E8', '#D4B0CC', '#C090B8', '#A870A0', '#8E4585', '#7B3070',
      '#722F37', '#9C1C3E', '#B5334B', '#D2355A', '#E04070', '#C82065',
    ],
    colors10: [
      '#D4B0CC', '#C090B8', '#A870A0', '#8E4585',
      '#7B3070', '#9C1C3E', '#B5334B', '#D2355A', '#E04070', '#C82065',
    ],
  },

  // ── Desert Southwest: warm earth + turquoise accent
  desert: {
    name: 'Desert SW',
    colors12: [
      '#F4E8D4', '#EDD9B4', '#DEC3A2', '#C4A882', '#8A9A6C', '#3AAFA9',
      '#5B7553', '#8B6F47', '#D08B5B', '#C95F3C', '#A0422A', '#7B2D26',
    ],
    colors10: [
      '#EDD9B4', '#DEC3A2', '#C4A882', '#8A9A6C',
      '#3AAFA9', '#8B6F47', '#D08B5B', '#C95F3C', '#A0422A', '#7B2D26',
    ],
  },

  // ── Autumn Harvest: gold → orange → burgundy → chocolate
  autumn: {
    name: 'Autumn',
    colors12: [
      '#F5F0E0', '#D4C088', '#6B6E23', '#556B2F', '#C5972C', '#DAA520',
      '#E87A24', '#CC5500', '#B7410E', '#8B1A2B', '#6B1525', '#3E1C14',
    ],
    colors10: [
      '#D4C088', '#6B6E23', '#556B2F', '#C5972C',
      '#DAA520', '#CC5500', '#B7410E', '#8B1A2B', '#6B1525', '#3E1C14',
    ],
  },

  // gradient and custom are computed dynamically
  gradient: {
    name: 'Gradient',
    colors12: [], // filled by interpolateGradient()
    colors10: [],
  },
  custom: {
    name: 'Custom',
    colors12: ['#003a6d','#0072c3','#33b1ff','#82cfff','#bae6ff','#f6f2c0','#ffe57a','#ff9f43','#ff6b35','#da1e28','#750e13','#2a0000'],
    colors10: ['#0072c3','#33b1ff','#82cfff','#bae6ff','#f6f2c0','#ffe57a','#ff9f43','#ff6b35','#da1e28','#750e13'],
  },
};

// ── State ───────────────────────────────────────────────────
const state = {
  cities: [],
  // Year presets: 'last-full' = last complete calendar year, or a specific year number
  yearPreset: 'last-full',
  customYear: null,        // for year picker
  dateStart: null,         // only used in 'custom-range' mode
  dateEnd:   null,
  dateMode: 'year',        // 'year' | 'custom-range'
  baselineMode: '5y-prior',
  scaleMode: 'pooled',
  anchorCityId: null,
  bucketMode: 'dense12',
  palette: 'thermal',
  customColors12: null, // set after PALETTES defined
  customColors10: null,
  baselineStart: null,
  baselineEnd:   null,
  gradientStart: '#003a6d',  // default: cold navy
  gradientEnd:   '#750e13',  // default: hot crimson
  shiftSH: true,
  fahrenheit: true,
  dataMetric: 'high',   // 'high' | 'low' | 'mean' | 'precip' | 'hourly'
  hourlyHour: 12,       // 0–23
  highlightZone: null,
  cache: {},
  rendered: [],
  zoom: 1,
  isPanning: false,
  panStartX: 0, panStartY: 0,
  panOriginX: 0, panOriginY: 0,
  generateDebounce: null,
  isGenerating: false,
};

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Helpers ──────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function lastYear() { return new Date().getFullYear() - 1; }
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function tempFmt(t) {
  if (t == null) return 'N/A';
  if (state.fahrenheit) return `${t.toFixed(1)}°F`;
  return `${((t - 32) * 5/9).toFixed(1)}°C`;
}

function precipFmt(mm) {
  if (mm == null) return 'N/A';
  if (state.fahrenheit) return `${(mm * 0.0394).toFixed(2)}"`;
  return `${mm.toFixed(1)} mm`;
}

function valueFmt(v, metric = state.dataMetric) {
  return metric === 'precip' ? precipFmt(v) : tempFmt(v);
}

const HOUR_LABELS = [
  '12 AM (midnight)', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM',
  '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
  '12 PM (noon)', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM',
  '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
];

function getMetricLabel(metric = state.dataMetric, hourlyHour = state.hourlyHour) {
  switch (metric) {
    case 'low':    return 'Low';
    case 'mean':   return 'Avg';
    case 'precip': return 'Precip';
    case 'hourly': {
      const h = hourlyHour;
      const period = h < 12 ? 'AM' : 'PM';
      const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
      return `${h12} ${period}`;
    }
    default: return 'High';
  }
}

// ── Date logic ───────────────────────────────────────────────
function getDateRange() {
  if (state.dateMode === 'custom-range') {
    return { start: state.dateStart, end: state.dateEnd };
  }
  const yr = state.customYear || lastYear();
  return { start: `${yr}-01-01`, end: `${yr}-12-31` };
}

function getBaselineRange(blanketRange) {
  if (state.baselineMode === 'same') return blanketRange;
  if (state.baselineMode === 'custom') {
    return { start: state.baselineStart, end: state.baselineEnd };
  }
  // numeric: '5', '10', '20' years prior to blanket start
  const yrs   = parseInt(state.baselineMode);
  const start = new Date(blanketRange.start + 'T12:00:00');
  const end   = new Date(blanketRange.start + 'T12:00:00');
  end.setDate(end.getDate() - 1);
  start.setFullYear(start.getFullYear() - yrs);
  return { start: fmt(start), end: fmt(end) };
}

// ── Per-city overrides ───────────────────────────────────────
function getCityEffective(city) {
  const ov = city.overrides || {};
  // Date / year
  let dateMode, dateStart, dateEnd;
  if (ov.dateMode) {
    dateMode  = ov.dateMode;
    dateStart = ov.dateStart || state.dateStart;
    dateEnd   = ov.dateEnd   || state.dateEnd;
    if (dateMode === 'year') {
      const yr = ov.year || state.customYear || lastYear();
      dateStart = `${yr}-01-01`;
      dateEnd   = `${yr}-12-31`;
    }
  } else if (ov.year != null) {
    dateMode  = 'year';
    dateStart = `${ov.year}-01-01`;
    dateEnd   = `${ov.year}-12-31`;
  } else {
    const global = getDateRange();
    dateMode  = state.dateMode;
    dateStart = global.start;
    dateEnd   = global.end;
  }
  return {
    dateMode,
    dateStart,
    dateEnd,
    palette:     ov.palette     || state.palette,
    bucketMode:  ov.bucketMode  || state.bucketMode,
    dataMetric:  ov.dataMetric  != null ? ov.dataMetric  : state.dataMetric,
    hourlyHour:  ov.hourlyHour  != null ? ov.hourlyHour  : state.hourlyHour,
  };
}

function getCityDateRange(city) {
  const eff = getCityEffective(city);
  return { start: eff.dateStart, end: eff.dateEnd };
}

function getCityNZones(city) {
  const eff = getCityEffective(city);
  const b = BUCKET_MODES[eff.bucketMode] || BUCKET_MODES.dense12;
  return b.bounds ? b.bounds.length - 1 : 10;
}

function getCityColors(city) {
  const eff = getCityEffective(city);
  const n   = getCityNZones(city);
  const pal = PALETTES[eff.palette] || PALETTES.thermal;
  return n === 12 ? pal.colors12 : pal.colors10;
}

function computeBoundsForMode(baselineHighs, bucketMode) {
  const mode  = BUCKET_MODES[bucketMode] || BUCKET_MODES.dense12;
  const valid = baselineHighs.filter(h => h != null);
  if (bucketMode === 'uniform-temp') {
    const mn = Math.min(...valid), mx = Math.max(...valid);
    return Array.from({length: 11}, (_,i) => mn + (mx-mn) * i / 10);
  }
  return computePercentiles(valid, mode.bounds);
}

// Precipitation-aware bounds: percentiles computed only on non-zero values,
// with bounds[0] forced to 0 so that dry days (h=0) land in zone 0.
function computePrecipBoundsForMode(baselineValues, bucketMode) {
  const mode    = BUCKET_MODES[bucketMode] || BUCKET_MODES.dense12;
  const nonZero = baselineValues.filter(h => h != null && h > 0);
  const nBounds = mode.bounds ? mode.bounds.length : 11;

  if (nonZero.length === 0) return Array(nBounds).fill(0);

  if (bucketMode === 'uniform-temp') {
    const mn = Math.min(...nonZero), mx = Math.max(...nonZero);
    const n  = nBounds - 1;
    return [0, ...Array.from({length: n}, (_, i) => mn + (mx - mn) * i / (n - 1))];
  }

  const bounds = computePercentiles(nonZero, mode.bounds);
  bounds[0] = 0;  // anchor bottom at 0 so dry days (h=0) fall into zone 0
  return bounds;
}

function updateDateDisplay() {
  const range = getDateRange();
  if (!range.start || !range.end) return;
  const opts = { year:'numeric', month:'short', day:'numeric' };
  const s = new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', opts);
  const e = new Date(range.end   + 'T12:00:00').toLocaleDateString('en-US', opts);
  $('date-range-text').textContent = `${s} → ${e}`;
}

// ── State Persistence ────────────────────────────────────────
const PERSIST_KEY = 'temp-blanket-state';
const PERSIST_FIELDS = [
  'cities','yearPreset','customYear','dateMode','dateStart','dateEnd',
  'baselineStart','baselineEnd','baselineMode',
  'scaleMode','anchorCityId','bucketMode',
  'palette','customColors12','customColors10','gradientStart','gradientEnd',
  'shiftSH','fahrenheit','dataMetric','hourlyHour',
];

function serializeState() {
  const obj = {};
  for (const k of PERSIST_FIELDS) obj[k] = state[k];
  // Strip transient city fields
  obj.cities = state.cities.map(c => ({
    name: c.name, country: c.country, admin: c.admin,
    lat: c.lat, lon: c.lon, tz: c.tz,
    id: c.id, isSH: c.isSH,
    overrides: c.overrides || {},
  }));
  return obj;
}

let _saveDebounce = null;
function saveToLocalStorage() {
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(() => {
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(serializeState())); } catch(e) {}
  }, 500);
}

function encodeState(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}
function decodeState(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str))));
}

function loadSavedState() {
  // Priority 1: URL hash
  if (window.location.hash.startsWith('#state=')) {
    try {
      const encoded = window.location.hash.slice(7);
      const obj = decodeState(encoded);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return obj;
    } catch(e) {}
  }
  // Priority 2: localStorage
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return null;
}

function resetAllState() {
  localStorage.removeItem(PERSIST_KEY);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  window.location.reload();
}

function applySavedState(saved) {
  if (!saved) return false;
  for (const k of PERSIST_FIELDS) {
    if (k in saved && saved[k] !== undefined) state[k] = saved[k];
  }
  // Validate palette, bucket mode, and data metric
  if (!PALETTES[state.palette]) state.palette = 'thermal';
  if (!BUCKET_MODES[state.bucketMode]) state.bucketMode = 'dense12';
  if (!['high','low','mean','precip','hourly'].includes(state.dataMetric)) state.dataMetric = 'high';
  if (state.hourlyHour < 0 || state.hourlyHour > 23 || !Number.isInteger(state.hourlyHour)) state.hourlyHour = 12;
  // Ensure cities have required fields
  state.cities = (state.cities || []).filter(c => c.name && c.lat != null && c.lon != null);
  return true;
}

function restoreUIFromState() {
  // Year pills
  const yearPills = document.querySelectorAll('#year-pills [data-year]');
  yearPills.forEach(b => b.classList.remove('active'));
  if (state.dateMode === 'custom-range') {
    const customBtn = document.querySelector('#year-pills [data-year="custom-range"]');
    if (customBtn) customBtn.classList.add('active');
    $('custom-range-inputs').classList.remove('hidden');
    if (state.dateStart) $('date-start').value = state.dateStart;
    if (state.dateEnd)   $('date-end').value   = state.dateEnd;
  } else {
    const yearVal = state.customYear ? String(state.customYear) : state.yearPreset;
    const btn = document.querySelector(`#year-pills [data-year="${yearVal}"]`);
    if (btn) btn.classList.add('active');
    $('custom-range-inputs').classList.add('hidden');
  }

  // Baseline pills
  const blPills = document.querySelectorAll('#baseline-pills [data-baseline]');
  blPills.forEach(b => b.classList.remove('active'));
  const blBtn = document.querySelector(`#baseline-pills [data-baseline="${state.baselineMode}"]`);
  if (blBtn) blBtn.classList.add('active');
  $('baseline-custom-inputs').classList.toggle('hidden', state.baselineMode !== 'custom');
  if (state.baselineStart) $('baseline-start').value = state.baselineStart;
  if (state.baselineEnd)   $('baseline-end').value   = state.baselineEnd;

  // Scale mode
  const scaleRadio = document.querySelector(`input[name="scale"][value="${state.scaleMode}"]`);
  if (scaleRadio) scaleRadio.checked = true;
  $('anchor-selector').classList.toggle('hidden', state.scaleMode !== 'anchor');

  // Bucket mode
  const bucketRadio = document.querySelector(`input[name="bucket"][value="${state.bucketMode}"]`);
  if (bucketRadio) bucketRadio.checked = true;

  // Palette
  document.querySelectorAll('#palette-grid .palette-option').forEach(b => {
    b.classList.toggle('active', b.dataset.palette === state.palette);
  });
  $('custom-colors').classList.toggle('hidden', state.palette !== 'custom');
  $('gradient-pickers').classList.toggle('hidden', state.palette !== 'gradient');

  // Custom palette colors
  if (state.customColors12) {
    PALETTES.custom.colors12 = [...state.customColors12];
    PALETTES.custom.colors10 = [...(state.customColors10 || state.customColors12.slice(0, 10))];
  }
  if (state.palette === 'custom' || state.palette === 'gradient') renderSwatchRow();

  // Gradient
  if (state.gradientStart) $('gradient-start').value = state.gradientStart;
  if (state.gradientEnd)   $('gradient-end').value   = state.gradientEnd;
  rebuildGradient();

  // Data metric
  const metricRadio = document.querySelector(`input[name="metric"][value="${state.dataMetric}"]`);
  if (metricRadio) metricRadio.checked = true;
  const hourPickerEl = $('hour-picker');
  if (hourPickerEl) hourPickerEl.value = state.hourlyHour;
  const hourRow = $('hour-picker-row');
  if (hourRow) hourRow.classList.toggle('hidden', state.dataMetric !== 'hourly');

  // Toggles
  $('toggle-sh').checked = state.shiftSH;
  $('toggle-fahrenheit').checked = state.fahrenheit;
  syncFahrenheitLabel();

  // Anchor selector
  updateAnchorSelector();

  // Legend + date display
  renderLegend();
  updateDateDisplay();

  // Hide empty state hint since we have cities
  const hint = $('city-hint');
  if (hint && state.cities.length > 0) hint.classList.add('hidden');
}

function initShareButton() {
  $('btn-share').addEventListener('click', () => {
    const encoded = encodeState(serializeState());
    const url = `${window.location.origin}${window.location.pathname}#state=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      const label = $('share-label');
      label.textContent = 'Copied!';
      setTimeout(() => { label.textContent = 'Share'; }, 2000);
    }).catch(() => {
      window.location.hash = `state=${encoded}`;
    });
  });
}

// ── Auto-trigger ─────────────────────────────────────────────
function scheduleGenerate(delay = 0) {
  clearTimeout(state.generateDebounce);
  state.generateDebounce = setTimeout(() => {
    if (state.cities.length > 0) generate();
  }, delay);
  saveToLocalStorage();
}

// ── Gradient interpolation ───────────────────────────────────
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r,g,b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
}
function interpolateGradient(colorA, colorB, n) {
  const a = hexToRgb(colorA), b = hexToRgb(colorB);
  return Array.from({length: n}, (_, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    return rgbToHex(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t);
  });
}
function rebuildGradient() {
  PALETTES.gradient.colors12 = interpolateGradient(state.gradientStart, state.gradientEnd, 12);
  PALETTES.gradient.colors10 = interpolateGradient(state.gradientStart, state.gradientEnd, 10);
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Init custom palette from thermal defaults
  state.customColors12 = [...PALETTES.thermal.colors12];
  state.customColors10 = [...PALETTES.thermal.colors10];
  PALETTES.custom.colors12 = [...state.customColors12];
  PALETTES.custom.colors10 = [...state.customColors10];
  // Init gradient
  rebuildGradient();

  initTheme();
  initDateControls();
  initCitySearch();
  initScaleMode();
  initBucketMode();
  initPaletteGrid();
  initOptions();
  initDataMetric();
  initZoomControls();
  initDownload();
  initPopover();
  initShareButton();
  $('btn-reset').addEventListener('click', resetAllState);

  // Reload state when URL hash changes (e.g. pasting a share link in same tab)
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#state=')) {
      const saved = loadSavedState();
      if (saved && applySavedState(saved)) {
        restoreUIFromState();
        if (state.cities.length > 0) scheduleGenerate();
      }
    }
  });

  // Try to restore saved state (URL hash > localStorage > defaults)
  const saved = loadSavedState();
  if (saved && applySavedState(saved)) {
    restoreUIFromState();
    if (state.cities.length > 0) {
      scheduleGenerate();
    } else {
      detectUserCity();
    }
  } else {
    renderLegend();
    updateDateDisplay();
    detectUserCity();
  }
});

// ── Theme ────────────────────────────────────────────────────
function initTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  $('btn-theme').addEventListener('click', () => {
    const t = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'light' : 'dark');
  });
}

// ── Date controls ────────────────────────────────────────────
function initDateControls() {
  // Build year selector pills: "Last full year", then previous 4 years, then "Custom range"
  buildYearPills();

  buildBaselinePills();

  $('baseline-start').addEventListener('change', e => { state.baselineStart = e.target.value; scheduleGenerate(400); });
  $('baseline-end').addEventListener('change',   e => { state.baselineEnd   = e.target.value; scheduleGenerate(400); });
  // set default custom baseline dates
  const ly = lastYear();
  $('baseline-start').value = `${ly - 5}-01-01`;
  $('baseline-end').value   = `${ly}-12-31`;
  state.baselineStart = $('baseline-start').value;
  state.baselineEnd   = $('baseline-end').value;

  $('date-start').addEventListener('change', e => {
    state.dateStart = e.target.value;
    updateDateDisplay();
    scheduleGenerate(400);
  });
  $('date-end').addEventListener('change', e => {
    state.dateEnd = e.target.value;
    updateDateDisplay();
    scheduleGenerate(400);
  });
}

function buildBaselinePills() {
  const container = $('baseline-pills');
  const options = [
    { label: '5yr prior', value: '5' },
    { label: '10yr prior', value: '10' },
    { label: '20yr prior', value: '20' },
    { label: 'Same as blanket', value: 'same' },
    { label: 'Custom', value: 'custom' },
  ];
  state.baselineMode = '5'; // default

  container.innerHTML = options.map((o, i) => `
    <button class="pill ${i === 0 ? 'active' : ''}" data-baseline="${o.value}">${o.label}</button>
  `).join('');

  container.querySelectorAll('[data-baseline]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-baseline]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.baselineMode = btn.dataset.baseline;
      $('baseline-custom-inputs').classList.toggle('hidden', state.baselineMode !== 'custom');
      scheduleGenerate();
    });
  });
}

function buildYearPills() {
  const container = $('year-pills');
  const ly = lastYear();
  const years = [];
  // Last 5 full calendar years
  for (let y = ly; y >= ly - 4; y--) {
    years.push({ label: String(y), value: String(y) });
  }
  years.push({ label: 'Custom range', value: 'custom-range' });

  // Default: most recent full year
  state.dateMode   = 'year';
  state.yearPreset = String(ly);
  state.customYear = ly;

  container.innerHTML = years.map((y, i) => `
    <button class="pill ${i === 0 ? 'active' : ''}" data-year="${y.value}">${y.label}</button>
  `).join('');

  container.querySelectorAll('[data-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-year]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.year;
      if (val === 'custom-range') {
        state.dateMode = 'custom-range';
        if (!state.dateStart) state.dateStart = `${ly}-01-01`;
        if (!state.dateEnd)   state.dateEnd   = `${ly}-12-31`;
        $('date-start').value = state.dateStart;
        $('date-end').value   = state.dateEnd;
        $('custom-range-inputs').classList.remove('hidden');
      } else {
        state.dateMode   = 'year';
        state.yearPreset = val;
        state.customYear = parseInt(val);
        $('custom-range-inputs').classList.add('hidden');
      }
      updateDateDisplay();
      scheduleGenerate();
    });
  });
}

// ── City Search ──────────────────────────────────────────────
let searchDebounce = null;

function initCitySearch() {
  const input   = $('city-search');
  const results = $('search-results');
  const clear   = $('search-clear');

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clear.classList.toggle('hidden', !q);
    clearTimeout(searchDebounce);
    if (q.length < 2) { results.classList.add('hidden'); return; }
    searchDebounce = setTimeout(() => searchCities(q), 300);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    clear.classList.add('hidden');
    results.classList.add('hidden');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.city-search-wrap')) results.classList.add('hidden');
  });
}

async function searchCities(query) {
  const results = $('search-results');
  results.innerHTML = '<div class="search-loading">Searching…</div>';
  results.classList.remove('hidden');
  try {
    const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.results?.length) {
      results.innerHTML = '<div class="search-loading">No results found</div>';
      return;
    }
    results.innerHTML = data.results.map(r => `
      <div class="search-result-item"
           data-lat="${r.latitude}" data-lon="${r.longitude}"
           data-name="${escHtml(r.name)}" data-country="${escHtml(r.country || '')}"
           data-admin="${escHtml(r.admin1 || '')}" data-tz="${escHtml(r.timezone || 'UTC')}">
        <span class="result-name">${escHtml(r.name)}${r.admin1 ? ', '+escHtml(r.admin1) : ''}</span>
        <span class="result-country">${escHtml(r.country || '')} · ${r.latitude.toFixed(2)}°, ${r.longitude.toFixed(2)}°</span>
      </div>
    `).join('');
    results.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        addCity({ name: el.dataset.name, country: el.dataset.country,
                  admin: el.dataset.admin, lat: +el.dataset.lat,
                  lon: +el.dataset.lon,   tz: el.dataset.tz });
        $('city-search').value = '';
        $('search-clear').classList.add('hidden');
        results.classList.add('hidden');
      });
    });
  } catch(e) {
    results.innerHTML = '<div class="search-loading">Search failed</div>';
  }
}

function addCity(city) {
  const id   = `city-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const isSH = city.lat < -15;
  state.cities.push({ ...city, id, isSH, overrides: {} });
  renderCityChips();
  updateAnchorSelector();
  const hint = $('city-hint'); if (hint) hint.classList.add('hidden');
  scheduleGenerate();
}

function removeCity(id) {
  state.cities = state.cities.filter(c => c.id !== id);
  if (state.anchorCityId === id) state.anchorCityId = null;
  renderCityChips();
  updateAnchorSelector();
  if (state.cities.length === 0) { showEmpty(); return; }
  scheduleGenerate();
}

function reorderCity(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const [moved] = state.cities.splice(fromIdx, 1);
  state.cities.splice(toIdx, 0, moved);
  // Reorder rendered data to match without re-fetching
  if (state.rendered.length > 0) {
    const [movedRd] = state.rendered.splice(fromIdx, 1);
    state.rendered.splice(toIdx, 0, movedRd);
  }
  renderBlankets();
  saveToLocalStorage();
}

function duplicateCity(id) {
  const city = state.cities.find(c => c.id === id);
  if (!city) return;
  const newId  = `city-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const newCity = {
    name: city.name, country: city.country, admin: city.admin,
    lat: city.lat, lon: city.lon, tz: city.tz,
    id: newId, isSH: city.isSH,
    overrides: JSON.parse(JSON.stringify(city.overrides || {})),
  };
  state.cities.push(newCity);
  renderCityChips();
  updateAnchorSelector();
  scheduleGenerate();
}

function renderCityChips() {
  // No-op: city chips removed from sidebar; cities shown as column headers in canvas
}

function updateAnchorSelector() {
  const sel = $('anchor-city');
  sel.innerHTML = '<option value="">Select anchor city…</option>' +
    state.cities.map(c => `<option value="${c.id}">${escHtml(c.name)}, ${escHtml(c.country)}</option>`).join('');
  if (state.anchorCityId) sel.value = state.anchorCityId;
}

// ── Scale / Bucket / Options ──────────────────────────────────
function initScaleMode() {
  $$('input[name="scale"]').forEach(r => {
    r.addEventListener('change', () => {
      state.scaleMode = r.value;
      $('anchor-selector').classList.toggle('hidden', r.value !== 'anchor');
      scheduleGenerate();
    });
  });
  $('anchor-city').addEventListener('change', e => {
    state.anchorCityId = e.target.value;
    scheduleGenerate();
  });
}

function initBucketMode() {
  $$('input[name="bucket"]').forEach(r => {
    r.addEventListener('change', () => {
      state.bucketMode = r.value;
      renderLegend();
      scheduleGenerate();
    });
  });
}

function syncFahrenheitLabel() {
  const row = document.querySelector('[data-testid="toggle-fahrenheit"]');
  if (!row) return;
  const spans = row.querySelectorAll('.toggle-label > span');
  if (state.dataMetric === 'precip') {
    spans[0].textContent = 'Display in inches';
    spans[1].textContent = 'Off = millimeters';
  } else {
    spans[0].textContent = 'Display in Fahrenheit';
    spans[1].textContent = 'Off = Celsius';
  }
}

function initOptions() {
  $('toggle-sh').addEventListener('change', e => {
    state.shiftSH = e.target.checked;
    scheduleGenerate();
  });
  $('toggle-fahrenheit').addEventListener('change', e => {
    state.fahrenheit = e.target.checked;
    // Redraw tooltips/legend only — no new fetch needed
    if (state.rendered.length) renderLegend(state.rendered[0]?.bounds);
    saveToLocalStorage();
  });
}

function initDataMetric() {
  // Populate hour picker (12-hour format)
  const hourPicker = $('hour-picker');
  hourPicker.innerHTML = HOUR_LABELS.map((lbl, h) =>
    `<option value="${h}"${h === state.hourlyHour ? ' selected' : ''}>${lbl}</option>`
  ).join('');

  function syncUI() {
    $('hour-picker-row').classList.toggle('hidden', state.dataMetric !== 'hourly');
    syncFahrenheitLabel();
  }

  $$('input[name="metric"]').forEach(r => {
    if (r.value === state.dataMetric) r.checked = true;
    r.addEventListener('change', () => {
      state.dataMetric = r.value;
      syncUI();
      scheduleGenerate();
    });
  });

  hourPicker.addEventListener('change', e => {
    state.hourlyHour = +e.target.value;
    scheduleGenerate();
  });

  syncUI();
}

// ── Palette ───────────────────────────────────────────────────
function initPaletteGrid() {
  const grid = $('palette-grid');
  grid.innerHTML = Object.entries(PALETTES).map(([key, p]) => `
    <button class="palette-option ${key === state.palette ? 'active' : ''}" data-palette="${key}">
      <div class="palette-preview">${previewSwatches(p.colors12)}</div>
      <span class="palette-name">${p.name}</span>
    </button>
  `).join('');

  grid.querySelectorAll('.palette-option').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.palette-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.palette = btn.dataset.palette;
      $('custom-colors').classList.toggle('hidden', state.palette !== 'custom');
      $('gradient-pickers').classList.toggle('hidden', state.palette !== 'gradient');
      renderSwatchRow();
      renderLegend(state.rendered[0]?.bounds);
      if (state.rendered.length) drawAllCanvases();
      saveToLocalStorage();
    });
  });

  // Gradient pickers
  const gStart = $('gradient-start');
  const gEnd   = $('gradient-end');
  if (gStart && gEnd) {
    gStart.value = state.gradientStart;
    gEnd.value   = state.gradientEnd;
    const updateGradientPreview = () => {
      const preview = $('gradient-preview');
      if (preview) preview.style.background = `linear-gradient(to right, ${state.gradientStart}, ${state.gradientEnd})`;
    };
    const onGradientChange = () => {
      state.gradientStart = gStart.value;
      state.gradientEnd   = gEnd.value;
      rebuildGradient();
      updateGradientPreview();
      renderLegend(state.rendered[0]?.bounds);
      if (state.rendered.length) drawAllCanvases();
      saveToLocalStorage();
    };
    gStart.addEventListener('input', onGradientChange);
    gEnd.addEventListener('input', onGradientChange);
    updateGradientPreview(); // init preview on load
  }
  renderSwatchRow();
}

function previewSwatches(colors) {
  const step = Math.max(1, Math.floor(colors.length / 8));
  return colors.filter((_,i) => i % step === 0).map(c => `<span style="background:${c}"></span>`).join('');
}

function renderSwatchRow() {
  const row = $('swatch-row');
  const colors = getCurrentColors();
  row.innerHTML = colors.map((c, i) => `
    <button class="swatch-btn" style="background:${c}" title="Zone ${i+1}" data-idx="${i}">
      <input type="color" style="opacity:0;position:absolute;inset:0;width:100%;height:100%;cursor:pointer" value="${c}" data-idx="${i}" />
    </button>
  `).join('');
  row.querySelectorAll('input[type="color"]').forEach(inp => {
    inp.addEventListener('input', e => {
      const i = +e.target.dataset.idx;
      const n = getCurrentNZones();
      if (n === 12) state.customColors12[i] = e.target.value;
      else          state.customColors10[i] = e.target.value;
      PALETTES.custom.colors12 = [...state.customColors12];
      PALETTES.custom.colors10 = [...state.customColors10];
      e.target.parentElement.style.background = e.target.value;
      renderLegend(state.rendered[0]?.bounds);
      if (state.rendered.length) drawAllCanvases();
      saveToLocalStorage();
    });
  });
}

function getCurrentNZones() {
  const b = BUCKET_MODES[state.bucketMode] || BUCKET_MODES.dense12;
  return b.bounds ? b.bounds.length - 1 : 10;
}

function getCurrentColors() {
  const n   = getCurrentNZones();
  const pal = PALETTES[state.palette] || PALETTES.thermal;
  return n === 12 ? pal.colors12 : pal.colors10;
}

// ── Legend ────────────────────────────────────────────────────
function renderLegend(fallbackBounds) {
  // Build legend groups from rendered cities (same logic as PNG export)
  let legendGroups = [];
  if (state.rendered.length) {
    const seen = new Map();
    state.rendered.forEach(rd => {
      const eff = getCityEffective(rd.city);
      const key = `${eff.palette}|${eff.bucketMode}|${eff.dataMetric}|${eff.hourlyHour}`;
      if (!seen.has(key)) {
        seen.set(key, legendGroups.length);
        legendGroups.push({
          palette:     eff.palette,
          bucketMode:  eff.bucketMode,
          dataMetric:  eff.dataMetric,
          hourlyHour:  eff.hourlyHour,
          colors:      getCityColors(rd.city),
          bounds:      rd.bounds,
          cityNames:   [rd.city.name],
        });
      } else {
        legendGroups[seen.get(key)].cityNames.push(rd.city.name);
      }
    });
  } else {
    // Fallback: use global state (before any cities are rendered)
    const colors = getCurrentColors();
    legendGroups = [{
      palette:    state.palette,
      bucketMode: state.bucketMode,
      dataMetric: state.dataMetric,
      hourlyHour: state.hourlyHour,
      colors,
      bounds:     fallbackBounds,
      cityNames:  [],
    }];
  }

  let html = '';
  const multiGroup = legendGroups.length > 1;
  legendGroups.forEach(g => {
    const mode  = BUCKET_MODES[g.bucketMode];
    const n     = g.colors.length;
    const names = n === 12 ? ZONE_NAMES_12
      : (g.bucketMode === 'uniform-pct' ? ZONE_NAMES_UNIFORM : ZONE_NAMES_10);

    if (multiGroup) {
      const palName = PALETTES[g.palette]?.name || g.palette;
      const modeName = BUCKET_MODES[g.bucketMode]?.name || g.bucketMode;
      html += `<div class="legend-group-header">${palName} · ${modeName}</div>`;
    }

    for (let i = 0; i < n; i++) {
      const pLo  = mode.bounds ? mode.bounds[i]   : i * 10;
      const pHi  = mode.bounds ? mode.bounds[i+1] : (i+1) * 10;
      const label = g.bounds
        ? `${valueFmt(g.bounds[i], g.dataMetric)}–${valueFmt(g.bounds[i+1], g.dataMetric)}`
        : `p${pLo}–${pHi}`;
      html += `
        <div class="legend-item" data-zone="${i}">
          <div class="legend-swatch" style="background:${g.colors[i]}"></div>
          <div class="legend-info">
            <span class="legend-range">${label}</span>
            <span class="legend-name">${names[i] || `zone ${i+1}`}</span>
          </div>
        </div>`;
    }
  });
  $('legend-items').innerHTML = html;
}

function toggleHighlight(zone) {
  state.highlightZone = state.highlightZone === zone ? null : zone;
  document.querySelectorAll('.legend-item').forEach((el, i) => {
    el.classList.toggle('highlighted', i === state.highlightZone);
    el.classList.toggle('dimmed', state.highlightZone !== null && i !== state.highlightZone);
  });
  if (state.rendered.length) drawAllCanvases();
}

// ── Geolocation ───────────────────────────────────────────────
async function detectUserCity() {
  setLocationHint('Detecting your location…');
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => resolveCity(pos.coords.latitude, pos.coords.longitude),
      ()  => setLocationHint(''),
      { timeout: 5000, maximumAge: 600000 }
    );
  } else {
    setLocationHint('');
  }
}

function setLocationHint(msg) {
  const hint = $('city-hint');
  if (!hint) return;
  if (msg) {
    hint.textContent = msg;
    hint.classList.remove('hidden');
  } else {
    hint.textContent = 'Search any city — blanket updates automatically';
  }
}

// Resolve coords + city name hint to a proper Open-Meteo geocoded result
async function resolveCity(lat, lon, cityHint, tzHint) {
  if (state.cities.length > 0) return; // already have cities
  try {
    if (!cityHint) {
      setLocationHint('');
      return;
    }
    const geoRes  = await fetch(`${GEO_URL}?name=${encodeURIComponent(cityHint)}&count=5&language=en&format=json`);
    const geoData = await geoRes.json();
    if (!geoData.results?.length) { setLocationHint(''); return; }

    // Pick closest result to the detected coords
    const best = geoData.results.reduce((a, b) =>
      Math.hypot(a.latitude - lat, a.longitude - lon) <
      Math.hypot(b.latitude - lat, b.longitude - lon) ? a : b
    );

    if (state.cities.length === 0) {
      addCity({
        name:    best.name,
        country: best.country  || '',
        admin:   best.admin1   || '',
        lat:     best.latitude,
        lon:     best.longitude,
        tz:      best.timezone || tzHint || 'UTC',
      });
    }
  } catch(e) { setLocationHint(''); }
}

// ── Data Fetching ─────────────────────────────────────────────
function cacheKey(lat, lon, start, end) {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}_${start}_${end}`;
}

async function fetchTemps(lat, lon, tz, start, end) {
  const key = 'daily:' + cacheKey(lat, lon, start, end);
  if (state.cache[key]) return state.cache[key];

  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    start_date: start, end_date: end,
    daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum',
    temperature_unit: 'fahrenheit',
    timezone: tz,
  });
  const res  = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status} for ${tz}`);
  const data = await res.json();
  const result = {
    dates:  data.daily.time,
    highs:  data.daily.temperature_2m_max,
    lows:   data.daily.temperature_2m_min,
    means:  data.daily.temperature_2m_mean,
    precip: data.daily.precipitation_sum,
  };
  state.cache[key] = result;
  return result;
}

// Fetches daily + raw hourly data in one request. rawHourly is used by
// getMetricValues to extract the chosen hour on demand (avoids re-fetching
// when the user changes the selected hour).
async function fetchTempsWithHourly(lat, lon, tz, start, end) {
  const key = 'hourly:' + cacheKey(lat, lon, start, end);
  if (state.cache[key]) return state.cache[key];

  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    start_date: start, end_date: end,
    daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum',
    hourly: 'temperature_2m',
    temperature_unit: 'fahrenheit',
    timezone: tz,
  });
  const res  = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status} for ${tz}`);
  const data = await res.json();
  const result = {
    dates:     data.daily.time,
    highs:     data.daily.temperature_2m_max,
    lows:      data.daily.temperature_2m_min,
    means:     data.daily.temperature_2m_mean,
    precip:    data.daily.precipitation_sum,
    rawHourly: data.hourly.temperature_2m,
  };
  state.cache[key] = result;
  return result;
}

// Returns the values array for the given metric from a data object.
function getMetricValues(dataObj, metric = state.dataMetric, hourlyHour = state.hourlyHour) {
  switch (metric) {
    case 'low':    return dataObj.lows;
    case 'mean':   return dataObj.means;
    case 'precip': return dataObj.precip;
    case 'hourly': {
      const raw   = dataObj.rawHourly;
      const nDays = dataObj.dates.length;
      return Array.from({length: nDays}, (_, d) => raw[d * 24 + hourlyHour] ?? null);
    }
    default: return dataObj.highs;
  }
}

// ── Zone computation ──────────────────────────────────────────
function computePercentiles(highs, pcts) {
  const sorted = highs.filter(h => h != null).sort((a,b) => a-b);
  const n = sorted.length;
  return pcts.map(p => {
    const i  = (p / 100) * (n - 1);
    const lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  });
}

function computeBounds(baselineHighs) {
  return computeBoundsForMode(baselineHighs, state.bucketMode);
}

function computePrecipBounds(baselineValues) {
  return computePrecipBoundsForMode(baselineValues, state.bucketMode);
}

function assignZones(highs, bounds) {
  return highs.map(h => {
    if (h == null) return -1;
    let z = bounds.length - 2;
    for (let i = 0; i < bounds.length - 1; i++) {
      if (h < bounds[i+1]) { z = i; break; }
    }
    return Math.max(0, Math.min(bounds.length - 2, z));
  });
}

// ── Generate ──────────────────────────────────────────────────
async function generate() {
  if (state.cities.length === 0) return;
  if (state.isGenerating) return; // don't stack
  state.isGenerating = true;

  showLoading('Fetching weather data…');
  setProgress(0);

  try {
    const globalBlanketRange  = getDateRange();
    const globalBaselineRange = getBaselineRange(globalBlanketRange);

    if (!globalBlanketRange.start || !globalBlanketRange.end) throw new Error('Invalid date range.');

    const total = state.cities.length * 2;
    let done = 0;

    const cityResults = [];
    for (const city of state.cities) {
      const eff = getCityEffective(city);
      const fetchFn = eff.dataMetric === 'hourly' ? fetchTempsWithHourly : fetchTemps;

      // Use per-city effective date range
      const cityRange     = getCityDateRange(city);
      const blanketRange  = (cityRange.start && cityRange.end) ? cityRange : globalBlanketRange;
      const baselineRange = getBaselineRange(blanketRange);

      $('loading-text').textContent = `${city.name}: baseline…`;
      const baseline = await fetchFn(city.lat, city.lon, city.tz, baselineRange.start, baselineRange.end);
      done++;
      setProgress(Math.round(done / total * 100));

      $('loading-text').textContent = `${city.name}: blanket year…`;
      const blanket = await fetchFn(city.lat, city.lon, city.tz, blanketRange.start, blanketRange.end);
      done++;
      setProgress(Math.round(done / total * 100));

      cityResults.push({ city, baseline, blanket, eff });
    }

    setProgress(100);
    $('loading-text').textContent = 'Computing zones…';

    // All temperature metrics (high, low, mean, hourly) are in °F/°C and share
    // one pooled scale. Precipitation is a different unit and gets its own pool.
    const isTemp = m => m !== 'precip';

    const allTempBaseline   = cityResults.flatMap(r =>
      isTemp(r.eff.dataMetric)
        ? getMetricValues(r.baseline, r.eff.dataMetric, r.eff.hourlyHour).filter(v => v != null)
        : []
    );
    const allPrecipBaseline = cityResults.flatMap(r =>
      r.eff.dataMetric === 'precip'
        ? getMetricValues(r.baseline, r.eff.dataMetric, r.eff.hourlyHour).filter(v => v != null)
        : []
    );

    // Anchor city sets the scale for whichever pool it belongs to.
    let sharedTempBounds, sharedPrecipBounds;
    if (state.scaleMode === 'anchor' && state.anchorCityId) {
      const anchor = cityResults.find(r => r.city.id === state.anchorCityId);
      if (anchor) {
        const anchorVals = getMetricValues(anchor.baseline, anchor.eff.dataMetric, anchor.eff.hourlyHour);
        if (isTemp(anchor.eff.dataMetric)) sharedTempBounds   = computeBounds(anchorVals);
        else                               sharedPrecipBounds = computePrecipBounds(anchorVals);
      }
    }
    if (!sharedTempBounds)   sharedTempBounds   = computeBounds(allTempBaseline.length   ? allTempBaseline   : [0]);
    if (!sharedPrecipBounds) sharedPrecipBounds = computePrecipBounds(allPrecipBaseline.length ? allPrecipBaseline : []);

    state.rendered = cityResults.map(r => {
      const eff = r.eff;
      let values = [...getMetricValues(r.blanket, eff.dataMetric, eff.hourlyHour)];
      let dates  = [...r.blanket.dates];
      if (state.shiftSH && r.city.isSH) {
        const shift = 182;
        values = [...values.slice(shift), ...values.slice(0, shift)];
      }
      const baselineValues = getMetricValues(r.baseline, eff.dataMetric, eff.hourlyHour);
      const sharedBounds   = isTemp(eff.dataMetric) ? sharedTempBounds : sharedPrecipBounds;
      const allPool        = isTemp(eff.dataMetric) ? allTempBaseline  : allPrecipBaseline;
      const precipMode = eff.dataMetric === 'precip';
      const cityBounds = precipMode
        ? computePrecipBoundsForMode(
            baselineValues.filter(v => v != null).length > 0 ? baselineValues : allPool,
            eff.bucketMode
          )
        : computeBoundsForMode(
            baselineValues.filter(v => v != null).length > 0 ? baselineValues : allPool,
            eff.bucketMode
          );
      // Only break from shared scale when the bucket mode is overridden.
      // Metric type (high/low/mean/hourly) and precipitation each have their own
      // pool already; within a pool everything shares the same scale.
      const boundsToUse = eff.bucketMode !== state.bucketMode ? cityBounds : sharedBounds;
      return {
        city: r.city,
        dates, highs: values,
        zones: assignZones(values, boundsToUse),
        bounds: boundsToUse,
        effectivePalette:    eff.palette,
        effectiveBucketMode: eff.bucketMode,
        effectiveDataMetric: eff.dataMetric,
        effectiveHourlyHour: eff.hourlyHour,
        baselineHighs: baselineValues,
      };
    });

    hideLoading();
    renderLegend(sharedTempBounds);
    renderBlankets();

  } catch(err) {
    hideLoading();
    showError(`Error: ${err.message}`);
    console.error(err);
  } finally {
    state.isGenerating = false;
  }
}

// ── Canvas rendering ──────────────────────────────────────────
function computeRowHeight() {
  // Fill available canvas area height across all days
  const canvasArea = $('canvas-area');
  const availH = canvasArea.clientHeight - 80; // subtract padding/labels
  const nDays  = state.rendered[0]?.dates.length || 365;
  // minimum 2px, maximum 12px, scaled to fit
  return Math.min(12, Math.max(2, Math.floor(availH / nDays)));
}

function computeColWidth() {
  // Fill available width evenly — month labels live outside in a fixed panel
  const canvasArea = $('canvas-area');
  const monthColW  = 36; // fixed month label column on the left
  const padding    = 32; // outer padding
  const gap        = 12; // gap between cities
  const nCities    = state.rendered.length;
  const availW     = canvasArea.clientWidth - padding - monthColW;
  const colW       = Math.floor((availW - gap * (nCities - 1)) / nCities);
  return Math.min(600, Math.max(40, colW));
}

function buildColHeader(rd, cityIdx) {
  const city = rd.city;
  const ov   = city.overrides || {};
  const eff  = getCityEffective(city);
  const isSH = city.isSH && state.shiftSH;

  // Determine display label for year chip
  let yearLabel;
  if (ov.dateMode === 'custom-range') {
    yearLabel = 'Custom';
  } else {
    const yr = ov.year != null ? ov.year : (state.customYear || lastYear());
    yearLabel = String(yr);
  }
  const globalYearLabel = state.dateMode === 'custom-range' ? 'Custom' : String(state.customYear || lastYear());
  const yearOverridden = ov.year != null || ov.dateMode === 'custom-range';

  const palLabel    = PALETTES[eff.palette]?.name || eff.palette;
  const palOverridden = !!ov.palette;

  const zoneLabel   = BUCKET_MODES[eff.bucketMode]?.name || eff.bucketMode;
  const zoneShort   = zoneLabel.replace('Dense Middle · ', 'Dense·').replace('Uniform Percentile', 'Uni-Pct').replace('Uniform Temp', 'Uni-°');
  const zoneOverridden = !!ov.bucketMode;

  const header = document.createElement('div');
  header.className = 'col-header';
  header.draggable = true;
  header.dataset.cityId = city.id;

  header.innerHTML = `
    <div class="col-header-main">
      <div class="col-header-info">
        <span class="col-city-name">${escHtml(city.name)}, ${escHtml(city.country)}${isSH ? ' <span class="sh-badge-sm">+6mo</span>' : ''}</span>
        <div class="col-override-chips">
          <span class="col-chip col-chip-year${yearOverridden ? ' col-chip-overridden' : ''}" title="Year">${escHtml(yearLabel)}</span>
          <span class="col-chip col-chip-palette${palOverridden ? ' col-chip-overridden' : ''}" title="Palette">${escHtml(palLabel)}</span>
          <span class="col-chip col-chip-zone${zoneOverridden ? ' col-chip-overridden' : ''}" title="Zone scheme">${escHtml(zoneShort)}</span>
        </div>
      </div>
      <div class="col-header-actions">
        <button class="col-btn col-btn-dupe" title="Duplicate" data-action="dupe" data-city-id="${city.id}">⊕</button>
        <button class="col-btn col-btn-remove" title="Remove" data-action="remove" data-city-id="${city.id}">×</button>
      </div>
    </div>
  `;

  // Drag-to-reorder
  header.addEventListener('dragstart', e => {
    if (e.target.closest('.col-btn')) { e.preventDefault(); return; }
    const col = header.closest('.blanket-city-col');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cityIdx);
    requestAnimationFrame(() => col.classList.add('is-dragging'));
  });
  header.addEventListener('dragend', () => {
    const col = header.closest('.blanket-city-col');
    col.classList.remove('is-dragging');
    document.querySelectorAll('.blanket-city-col.drag-over').forEach(el => el.classList.remove('drag-over'));
  });

  // Open popover on click (not on button clicks)
  header.addEventListener('click', e => {
    if (e.target.closest('.col-btn')) return;
    openCityPopover(city.id, header);
  });

  // Action buttons
  header.querySelector('.col-btn-dupe').addEventListener('click', e => {
    e.stopPropagation();
    duplicateCity(city.id);
  });
  header.querySelector('.col-btn-remove').addEventListener('click', e => {
    e.stopPropagation();
    removeCity(city.id);
  });

  return header;
}

function renderBlankets() {
  const container = $('blanket-columns');
  container.innerHTML = '';

  const rowH    = computeRowHeight();
  const colW    = computeColWidth();

  // Build shared month labels column (sits left of all blankets, scrolls in sync)
  const monthCol = document.createElement('div');
  monthCol.className = 'month-labels-panel';
  // spacer to align with headers
  const monthSpacer = document.createElement('div');
  monthSpacer.className = 'month-header-spacer';
  monthCol.appendChild(monthSpacer);
  const monthLabelsInner = document.createElement('div');
  monthLabelsInner.className = 'month-labels-col';
  const refDates = state.rendered[0]?.dates || [];
  let lastMonth = null;
  refDates.forEach((d, i) => {
    const dt = new Date(d + 'T12:00:00');
    const m  = dt.getMonth();
    const item = document.createElement('div');
    item.className = 'month-label-item';
    item.style.height     = `${rowH}px`;
    item.style.lineHeight = `${rowH}px`;
    if (m !== lastMonth) {
      item.textContent = dt.toLocaleDateString('en-US', {month:'short'});
      if (m === 0) item.textContent += ` '${String(dt.getFullYear()).slice(2)}`;
      lastMonth = m;
    }
    monthLabelsInner.appendChild(item);
  });
  monthCol.appendChild(monthLabelsInner);
  container.appendChild(monthCol);

  state.rendered.forEach((rd, cityIdx) => {
    const col = document.createElement('div');
    col.className = 'blanket-city-col';
    col.dataset.cityIdx = cityIdx;
    col.dataset.cityId  = rd.city.id;
    col.style.width     = colW + 'px';

    // Rich column header
    const header = buildColHeader(rd, cityIdx);
    col.appendChild(header);

    // Drop-target events for drag-to-reorder
    col.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIdx = cityIdx;
      if (!isNaN(fromIdx)) reorderCity(fromIdx, toIdx);
    });

    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'blanket-canvas-wrap';
    // Month labels are now in the shared panel — no per-column labels needed

    const canvas = document.createElement('canvas');
    canvas.className = 'city-canvas';
    canvas.width  = colW;
    canvas.height = rd.dates.length * rowH;
    canvas.dataset.cityIdx = cityIdx;
    canvas.dataset.cityId  = rd.city.id;
    canvas.dataset.rowH    = rowH;
    canvasWrap.appendChild(canvas);
    col.appendChild(canvasWrap);
    container.appendChild(col);

    const colors = getCityColors(rd.city);
    const nZones = colors.length;
    drawCanvas(canvas, rd, colors, nZones, rowH);
    bindCanvasEvents(canvas, rd, rowH);
  });

  showBlanket();
  applyZoom(state.zoom);

  // Sync month-spacer height to actual col-header height
  requestAnimationFrame(() => {
    const firstHeader = container.querySelector('.col-header');
    if (firstHeader) {
      const h = firstHeader.offsetHeight;
      document.documentElement.style.setProperty('--col-header-h', `${h}px`);
    }
  });
}

function drawAllCanvases() {
  document.querySelectorAll('.city-canvas').forEach(canvas => {
    const idx  = +canvas.dataset.cityIdx;
    const rowH = +canvas.dataset.rowH || ROW_H;
    if (!state.rendered[idx]) return;
    const rd     = state.rendered[idx];
    const colors = getCityColors(rd.city);
    const nZones = colors.length;
    drawCanvas(canvas, rd, colors, nZones, rowH);
  });
}

function drawCanvas(canvas, rd, colors, nZones, rowH) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  rd.zones.forEach((zone, i) => {
    if (zone < 0) { ctx.fillStyle = '#2a2a2a'; }
    else {
      ctx.globalAlpha = (state.highlightZone !== null && zone !== state.highlightZone) ? 0.15 : 1;
      ctx.fillStyle   = colors[Math.min(zone, nZones - 1)];
    }
    ctx.fillRect(0, i * rowH, canvas.width, rowH);
  });
  ctx.globalAlpha = 1;

  // Year / mid-year dividers
  rd.dates.forEach((d, i) => {
    const dt = new Date(d + 'T12:00:00');
    if (dt.getMonth() === 0 && dt.getDate() === 1 && i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, i * rowH, canvas.width, 1);
    } else if (dt.getMonth() === 6 && dt.getDate() === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, i * rowH, canvas.width, 1);
    }
  });
}

// ── Hover tooltip ─────────────────────────────────────────────
function bindCanvasEvents(canvas, rd, rowH) {
  const tooltip = $('tooltip');

  canvas.addEventListener('mousemove', e => {
    const rect   = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const y      = (e.clientY - rect.top) * scaleY;
    const dayIdx = Math.min(Math.floor(y / rowH), rd.dates.length - 1);
    if (dayIdx < 0) return;

    const d     = rd.dates[dayIdx];
    const value = rd.highs[dayIdx];
    const zone  = rd.zones[dayIdx];
    const colors = getCityColors(rd.city);
    const n      = colors.length;
    const eff    = getCityEffective(rd.city);
    const names  = n === 12 ? ZONE_NAMES_12 : (eff.bucketMode === 'uniform-pct' ? ZONE_NAMES_UNIFORM : ZONE_NAMES_10);

    const effMetric  = getCityEffective(rd.city);
    const dt         = new Date(d + 'T12:00:00');
    const dateStr    = dt.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
    const valueStr   = value != null
      ? `${getMetricLabel(effMetric.dataMetric, effMetric.hourlyHour)}: ${valueFmt(value, effMetric.dataMetric)}`
      : 'No data';
    const color    = zone >= 0 ? colors[Math.min(zone, n-1)] : '#888';
    const zoneLbl  = zone >= 0 ? `Zone ${zone+1} · ${names[Math.min(zone, names.length-1)]}` : 'no data';

    // City name in tooltip
    $('tooltip-city').textContent  = `${rd.city.name}, ${rd.city.country}`;
    $('tooltip-date').textContent  = dateStr;
    $('tooltip-temp').textContent  = valueStr;
    $('tooltip-temp').style.color  = color;
    $('tooltip-zone').textContent  = zoneLbl;

    tooltip.classList.remove('hidden');
    positionTooltip(tooltip, e.clientX, e.clientY);
  });

  canvas.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));

  canvas.addEventListener('click', e => {
    const rect   = canvas.getBoundingClientRect();
    const scaleY = canvas.height / rect.height;
    const y      = (e.clientY - rect.top) * scaleY;
    const dayIdx = Math.min(Math.floor(y / (rowH)), rd.dates.length - 1);
    const zone   = rd.zones[dayIdx];
    if (zone >= 0) toggleHighlight(zone);
  });
}

function positionTooltip(tooltip, cx, cy) {
  const tw = tooltip.offsetWidth  || 180;
  const th = tooltip.offsetHeight || 90;
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = cx + 14, y = cy - 10;
  if (x + tw > vw - 8) x = cx - tw - 14;
  if (y + th > vh - 8) y = vh - th - 8;
  if (y < 8) y = 8;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

// ── reRenderCity (palette/zone-only, no fetch) ──────────────────────
function reRenderCity(cityId) {
  const rdIdx = state.rendered.findIndex(r => r.city.id === cityId);
  if (rdIdx < 0) return;
  const rd  = state.rendered[rdIdx];
  const eff = getCityEffective(rd.city);

  // Recompute bounds using cached baseline highs
  const baselineHighs = rd.baselineHighs || rd.highs;
  const bounds = computeBoundsForMode(baselineHighs.filter(h => h != null), eff.bucketMode);
  rd.zones  = assignZones(rd.highs, bounds);
  rd.bounds = bounds;
  rd.effectivePalette    = eff.palette;
  rd.effectiveBucketMode = eff.bucketMode;

  // Redraw the canvas
  const canvas = document.querySelector(`.city-canvas[data-city-id="${cityId}"]`);
  if (canvas) {
    const colors = getCityColors(rd.city);
    const nZones = colors.length;
    const rowH   = +canvas.dataset.rowH || ROW_H;
    drawCanvas(canvas, rd, colors, nZones, rowH);
  }

  // Refresh the column header chips
  const header = document.querySelector(`.col-header[data-city-id="${cityId}"]`);
  if (header) {
    const newHeader = buildColHeader(rd, rdIdx);
    header.replaceWith(newHeader);
  }

  // Update legend (per-city overrides can change legend groups)
  renderLegend(rd.bounds);
  saveToLocalStorage();
}

// ── City Popover ────────────────────────────────────────────────
let popoverCityId = null;

function openCityPopover(cityId, anchorEl) {
  const popover = $('col-popover');
  if (!popover) return;

  // If already open for same city, close it
  if (popoverCityId === cityId && !popover.classList.contains('hidden')) {
    closePopover();
    return;
  }

  popoverCityId = cityId;
  const city = state.cities.find(c => c.id === cityId);
  if (!city) return;

  fillPopover(city);
  popover.classList.remove('hidden');
  positionPopover(popover, anchorEl);
}

function closePopover() {
  const popover = $('col-popover');
  if (popover) popover.classList.add('hidden');
  popoverCityId = null;
}

function positionPopover(popover, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const pw   = popover.offsetWidth  || 280;
  const ph   = popover.offsetHeight || 320;
  const vw   = window.innerWidth;
  const vh   = window.innerHeight;

  let top  = rect.bottom + 6;
  let left = rect.left;

  if (left + pw > vw - 8) left = vw - pw - 8;
  if (left < 8) left = 8;
  if (top + ph > vh - 8) top = rect.top - ph - 6;
  if (top < 8) top = 8;

  popover.style.top  = top  + 'px';
  popover.style.left = left + 'px';
}

function fillPopover(city) {
  const ov  = city.overrides || {};
  const eff = getCityEffective(city);

  // ── City search in popover ──
  let citySearchEl = $('popover-city-search');
  if (citySearchEl) {
    citySearchEl.value = `${city.name}, ${city.country}`;
    let citySearchDebounce = null;
    const cityResultsEl = $('popover-city-results');
    citySearchEl.oninput = () => {
      const q = citySearchEl.value.trim();
      if (q.length < 2) { cityResultsEl.classList.add('hidden'); return; }
      clearTimeout(citySearchDebounce);
      citySearchDebounce = setTimeout(async () => {
        try {
          const res  = await fetch(`${GEO_URL}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
          const data = await res.json();
          if (!data.results?.length) { cityResultsEl.classList.add('hidden'); return; }
          cityResultsEl.innerHTML = data.results.map(r => `
            <div class="search-result-item" data-lat="${r.latitude}" data-lon="${r.longitude}"
                 data-name="${escHtml(r.name)}" data-country="${escHtml(r.country||'')}"
                 data-admin="${escHtml(r.admin1||'')}" data-tz="${escHtml(r.timezone||'UTC')}">
              <span class="result-name">${escHtml(r.name)}${r.admin1 ? ', '+escHtml(r.admin1) : ''}</span>
              <span class="result-country">${escHtml(r.country||'')} · ${r.latitude.toFixed(2)}°, ${r.longitude.toFixed(2)}°</span>
            </div>`).join('');
          cityResultsEl.classList.remove('hidden');
          cityResultsEl.querySelectorAll('.search-result-item').forEach(el => {
            el.addEventListener('click', () => {
              // Update city in place — keep id and overrides
              const idx = state.cities.findIndex(c => c.id === city.id);
              if (idx < 0) return;
              state.cities[idx] = {
                ...state.cities[idx],
                name: el.dataset.name, country: el.dataset.country,
                admin: el.dataset.admin, lat: +el.dataset.lat,
                lon: +el.dataset.lon, tz: el.dataset.tz,
                isSH: +el.dataset.lat < -15,
              };
              citySearchEl.value = `${el.dataset.name}, ${el.dataset.country}`;
              cityResultsEl.classList.add('hidden');
              closePopover();
              scheduleGenerate();
            });
          });
        } catch(e) { cityResultsEl.classList.add('hidden'); }
      }, 300);
    };
  }

  // ── Year pills ──
  const yearPillsEl = $('popover-year-pills');
  const ly = lastYear();
  const years = [];
  for (let y = ly; y >= ly - 4; y--) years.push({ label: String(y), value: String(y) });
  years.push({ label: 'Custom range', value: 'custom-range' });

  const activeYear = ov.dateMode === 'custom-range'
    ? 'custom-range'
    : (ov.year != null ? String(ov.year) : null); // null means using global

  yearPillsEl.innerHTML = years.map(y => {
    const isActive = activeYear === y.value ||
      (activeYear === null && y.value === String(state.customYear || ly) && state.dateMode !== 'custom-range');
    return `<button class="pill pill-sm${isActive ? ' active' : ''}" data-pop-year="${y.value}">${y.label}</button>`;
  }).join('');

  const customDatesEl = $('popover-custom-dates');
  customDatesEl.classList.toggle('hidden', ov.dateMode !== 'custom-range');

  if (ov.dateMode === 'custom-range') {
    $('popover-date-start').value = ov.dateStart || '';
    $('popover-date-end').value   = ov.dateEnd   || '';
  }

  yearPillsEl.querySelectorAll('[data-pop-year]').forEach(btn => {
    btn.addEventListener('click', () => {
      yearPillsEl.querySelectorAll('[data-pop-year]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.popYear;
      if (val === 'custom-range') {
        city.overrides.dateMode  = 'custom-range';
        city.overrides.year      = null;
        city.overrides.dateStart = city.overrides.dateStart || `${ly}-01-01`;
        city.overrides.dateEnd   = city.overrides.dateEnd   || `${ly}-12-31`;
        $('popover-date-start').value = city.overrides.dateStart;
        $('popover-date-end').value   = city.overrides.dateEnd;
        customDatesEl.classList.remove('hidden');
      } else {
        city.overrides.dateMode  = 'year';
        city.overrides.year      = parseInt(val);
        city.overrides.dateStart = null;
        city.overrides.dateEnd   = null;
        customDatesEl.classList.add('hidden');
      }
      scheduleGenerate(100);
    });
  });

  $('popover-date-start').addEventListener('change', e => {
    city.overrides.dateStart = e.target.value;
    scheduleGenerate(400);
  });
  $('popover-date-end').addEventListener('change', e => {
    city.overrides.dateEnd = e.target.value;
    scheduleGenerate(400);
  });

  // ── Palette grid ──
  const palGridEl = $('popover-palette-grid');
  palGridEl.innerHTML = Object.entries(PALETTES).map(([key, p]) => `
    <button class="palette-option palette-option-sm ${key === eff.palette ? 'active' : ''}" data-pop-palette="${key}">
      <div class="palette-preview">${previewSwatches(p.colors12)}</div>
      <span class="palette-name">${p.name}</span>
    </button>
  `).join('');

  palGridEl.querySelectorAll('[data-pop-palette]').forEach(btn => {
    btn.addEventListener('click', () => {
      palGridEl.querySelectorAll('[data-pop-palette]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      city.overrides.palette = btn.dataset.popPalette;
      reRenderCity(city.id);
    });
  });

  // ── Zone scheme radios ──
  const zonesEl = $('popover-zones');
  zonesEl.innerHTML = Object.entries(BUCKET_MODES).map(([key, bm]) => `
    <label class="radio-option radio-option-sm">
      <input type="radio" name="popover-bucket-${city.id}" value="${key}" ${key === eff.bucketMode ? 'checked' : ''} />
      <span class="radio-label">
        <span class="radio-title">${bm.name}</span>
      </span>
    </label>
  `).join('');

  zonesEl.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('change', () => {
      city.overrides.bucketMode = r.value;
      reRenderCity(city.id);
    });
  });

  // ── Data metric ──
  const METRIC_OPTIONS = [
    { value: 'high',   label: 'Daily high' },
    { value: 'low',    label: 'Daily low' },
    { value: 'mean',   label: 'Daily average' },
    { value: 'hourly', label: 'Specific hour' },
    { value: 'precip', label: 'Precipitation' },
  ];
  const metricEl = $('popover-metric');
  metricEl.innerHTML = METRIC_OPTIONS.map(m => `
    <label class="radio-option radio-option-sm${m.value === 'hourly' ? ' radio-option-hourly' : ''}">
      <input type="radio" name="popover-metric-${city.id}" value="${m.value}" ${m.value === eff.dataMetric ? 'checked' : ''} />
      <span class="radio-label"><span class="radio-title">${m.label}</span></span>
      ${m.value === 'hourly' ? `
        <div class="hour-picker-row${eff.dataMetric !== 'hourly' ? ' hidden' : ''}" id="popover-hour-picker-row">
          <select class="input" id="popover-hour-picker">
            ${HOUR_LABELS.map((lbl, h) => `<option value="${h}"${h === eff.hourlyHour ? ' selected' : ''}>${lbl}</option>`).join('')}
          </select>
        </div>` : ''}
    </label>
  `).join('');

  metricEl.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('change', () => {
      city.overrides.dataMetric = r.value;
      const row = $('popover-hour-picker-row');
      if (row) row.classList.toggle('hidden', r.value !== 'hourly');
      scheduleGenerate(100);
    });
  });

  const popoverHourPicker = $('popover-hour-picker');
  if (popoverHourPicker) {
    popoverHourPicker.addEventListener('change', e => {
      city.overrides.hourlyHour = +e.target.value;
      scheduleGenerate(100);
    });
  }

  // ── Reset button ──
  $('popover-reset').onclick = () => {
    city.overrides = {};
    closePopover();
    scheduleGenerate(100);
  };
}

function initPopover() {
  // Close on click outside
  document.addEventListener('click', e => {
    const popover = $('col-popover');
    if (!popover || popover.classList.contains('hidden')) return;
    if (e.target.closest('#col-popover') || e.target.closest('.col-header')) return;
    closePopover();
  });
  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePopover();
  });
}

// ── Pan & Zoom ────────────────────────────────────────────────
function initZoomControls() {
  const wrap = $('canvas-scroll-wrap');
  $('btn-zoom-in').addEventListener('click',    () => applyZoom(state.zoom * 1.25));
  $('btn-zoom-out').addEventListener('click',   () => applyZoom(state.zoom / 1.25));
  $('btn-zoom-reset').addEventListener('click', () => { applyZoom(1); wrap.scrollLeft = 0; wrap.scrollTop = 0; });

  wrap.addEventListener('wheel', e => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      applyZoom(state.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
    }
  }, { passive: false });

  // Drag pan
  wrap.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    state.isPanning = true;
    state.panStartX = e.clientX; state.panStartY = e.clientY;
    state.panOriginX = wrap.scrollLeft; state.panOriginY = wrap.scrollTop;
    wrap.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!state.isPanning) return;
    wrap.scrollLeft = state.panOriginX - (e.clientX - state.panStartX);
    wrap.scrollTop  = state.panOriginY - (e.clientY - state.panStartY);
  });
  window.addEventListener('mouseup', () => { state.isPanning = false; wrap.style.cursor = 'grab'; });

  // Touch pan
  let lx = 0, ly = 0;
  wrap.addEventListener('touchstart', e => { if (e.touches.length === 1) { lx = e.touches[0].clientX; ly = e.touches[0].clientY; } }, { passive: true });
  wrap.addEventListener('touchmove',  e => {
    if (e.touches.length === 1) {
      wrap.scrollLeft -= e.touches[0].clientX - lx;
      wrap.scrollTop  -= e.touches[0].clientY - ly;
      lx = e.touches[0].clientX; ly = e.touches[0].clientY;
    }
  }, { passive: true });
}

function applyZoom(z) {
  state.zoom = Math.min(Math.max(z, 0.2), 6);
  $('canvas-transform-wrap').style.transform = `scale(${state.zoom})`;
  $('zoom-level').textContent = Math.round(state.zoom * 100) + '%';
}

// ── Download ──────────────────────────────────────────────────
function initDownload() {
  $('btn-download').addEventListener('click', downloadPNG);
}

function downloadPNG() {
  if (!state.rendered.length) return;

  const rowH   = +document.querySelector('.city-canvas')?.dataset.rowH || ROW_H;
  const nDays  = state.rendered[0].dates.length;
  const nCities = state.rendered.length;

  // Layout constants
  const pad        = 20;
  const headerH    = 60;   // city name + chip labels
  const monthColW  = 50;   // month labels on left
  const legendW    = 180;  // legend panel on right
  const colW       = 120;  // per-city column width
  const colGap     = 12;

  const blanketW   = nCities * colW + (nCities - 1) * colGap;
  const blanketH   = nDays * rowH;

  // Build legend groups: unique (palette, bucketMode) combos
  const legendGroups = [];
  const seenLegend = new Map();
  state.rendered.forEach(rd => {
    const eff = getCityEffective(rd.city);
    const key = `${eff.palette}|${eff.bucketMode}|${eff.dataMetric}|${eff.hourlyHour}`;
    if (!seenLegend.has(key)) {
      seenLegend.set(key, legendGroups.length);
      legendGroups.push({
        palette:    eff.palette,
        bucketMode: eff.bucketMode,
        dataMetric: eff.dataMetric,
        colors:     getCityColors(rd.city),
        bounds:     rd.bounds,
        cityNames:  [rd.city.name],
      });
    } else {
      legendGroups[seenLegend.get(key)].cityNames.push(rd.city.name);
    }
  });

  // Compute legend height
  const lineH = 36;
  const groupGap = 20;
  const groupHeaderH = 20;
  let legendContentH = 0;
  legendGroups.forEach(g => {
    legendContentH += groupHeaderH + g.colors.length * lineH + groupGap;
  });

  const totalW     = pad + monthColW + blanketW + pad + legendW + pad;
  const totalH     = pad + headerH + Math.max(blanketH, legendContentH) + pad;

  const off = document.createElement('canvas');
  off.width = totalW; off.height = totalH;
  const ctx = off.getContext('2d');

  // Background
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, totalW, totalH);

  const blanketTop = pad + headerH;
  const blanketLeft = pad + monthColW;

  // ── Column headers + blanket data ──
  state.rendered.forEach((rd, i) => {
    const city   = rd.city;
    const eff    = getCityEffective(city);
    const colors = getCityColors(city);
    const nZones = colors.length;
    const x      = blanketLeft + i * (colW + colGap);

    // City name
    ctx.fillStyle = '#e8eaf0';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${city.name}, ${city.country}`, x + colW / 2, pad + 16);

    // Metadata chips: year, palette, zone
    const ov = city.overrides || {};
    let yearLabel;
    if (ov.dateMode === 'custom-range') {
      yearLabel = 'Custom';
    } else {
      const yr = ov.year != null ? ov.year : (state.customYear || lastYear());
      yearLabel = String(yr);
    }
    const palLabel  = PALETTES[eff.palette]?.name || eff.palette;
    const zoneLabel = (BUCKET_MODES[eff.bucketMode]?.name || eff.bucketMode)
      .replace('Dense Middle · ', 'Dense·')
      .replace('Uniform Percentile', 'Uni-Pct')
      .replace('Uniform Temp', 'Uni-°');

    ctx.fillStyle = '#9aa0b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${yearLabel}  ·  ${palLabel}  ·  ${zoneLabel}`, x + colW / 2, pad + 34);

    // Blanket rows
    rd.zones.forEach((zone, dayIdx) => {
      ctx.fillStyle = zone >= 0 ? colors[Math.min(zone, nZones - 1)] : '#2a2a2a';
      ctx.fillRect(x, blanketTop + dayIdx * rowH, colW, rowH);
    });
  });

  // ── Month labels (left side) ──
  const refDates = state.rendered[0]?.dates || [];
  let lastMonth = null;
  ctx.fillStyle = '#9aa0b8';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  refDates.forEach((d, i) => {
    const dt = new Date(d + 'T12:00:00');
    const m  = dt.getMonth();
    if (m !== lastMonth) {
      let label = dt.toLocaleDateString('en-US', { month: 'short' });
      if (m === 0) label += ` '${String(dt.getFullYear()).slice(2)}`;
      const y = blanketTop + i * rowH + rowH * 0.5 + 4;
      ctx.fillText(label, pad + monthColW - 8, y);
      lastMonth = m;
    }
  });

  // ── Legend panel (right side) ──
  const legendX = pad + monthColW + blanketW + pad;
  let legendY = blanketTop;
  const swatchSize = 16;

  legendGroups.forEach((g, gi) => {
    const gColors = g.colors;
    const nZones  = gColors.length;
    const mode    = BUCKET_MODES[g.bucketMode];
    const names   = nZones === 12
      ? ZONE_NAMES_12
      : (g.bucketMode === 'uniform-pct' ? ZONE_NAMES_UNIFORM : ZONE_NAMES_10);

    // Group header
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#9aa0b8';
    ctx.textAlign = 'left';
    const header = legendGroups.length === 1
      ? 'Legend'
      : g.cityNames.join(', ');
    ctx.fillText(header, legendX, legendY + 14);
    legendY += groupHeaderH;

    for (let i = 0; i < nZones; i++) {
      const y = legendY + i * lineH;

      // Swatch
      ctx.fillStyle = gColors[i];
      ctx.beginPath();
      ctx.roundRect(legendX, y, swatchSize, swatchSize, 3);
      ctx.fill();

      // Range label
      const pLo = mode.bounds ? mode.bounds[i] : i * 10;
      const pHi = mode.bounds ? mode.bounds[i + 1] : (i + 1) * 10;
      const rangeLabel = g.bounds
        ? `${valueFmt(g.bounds[i], g.dataMetric)}–${valueFmt(g.bounds[i + 1], g.dataMetric)}`
        : `p${pLo}–${pHi}`;

      ctx.fillStyle = '#e8eaf0';
      ctx.font = '11px sans-serif';
      ctx.fillText(rangeLabel, legendX + swatchSize + 8, y + 8);

      // Zone name
      ctx.fillStyle = '#9aa0b8';
      ctx.font = '11px sans-serif';
      ctx.fillText(names[i] || `zone ${i + 1}`, legendX + swatchSize + 8, y + 22);
    }

    legendY += nZones * lineH + groupGap;
  });

  const link = document.createElement('a');
  link.download = `blanket-${getDateRange().start?.slice(0, 4) || 'custom'}.png`;
  link.href = off.toDataURL('image/png');
  link.click();
}

// ── UI helpers ────────────────────────────────────────────────
function showEmpty() {
  $('empty-state').classList.remove('hidden');
  $('blanket-container').classList.add('hidden');
  $('error-state').classList.add('hidden');
}

function showBlanket() {
  $('empty-state').classList.add('hidden');
  $('blanket-container').classList.remove('hidden');
  $('error-state').classList.add('hidden');
}

function showLoading(msg) {
  $('loading-text').textContent = msg || 'Loading…';
  $('loading-overlay').classList.remove('hidden');
}

function hideLoading() { $('loading-overlay').classList.add('hidden'); }
function setProgress(p) { $('progress-bar').style.width = p + '%'; }

function showError(msg) {
  $('error-text').textContent = msg;
  $('error-state').classList.remove('hidden');
  $('empty-state').classList.add('hidden');
  $('blanket-container').classList.add('hidden');
}

// Expose for inline handlers
window.removeCity      = removeCity;
window.duplicateCity   = duplicateCity;
window.toggleHighlight = toggleHighlight;
window.openCityPopover = openCityPopover;
window.closePopover    = closePopover;
window.reRenderCity    = reRenderCity;
