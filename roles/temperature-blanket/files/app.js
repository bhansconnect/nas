/* ============================================================
   Temperature Blanket — App Engine v2
   ============================================================ */

'use strict';

// ── Constants ──────────────────────────────────────────────
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const GEO_URL     = 'https://geocoding-api.open-meteo.com/v1/search';
const IP_GEO_URL  = 'https://ipwho.is/'; // CORS-friendly, returns city+lat+lon+timezone
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
  // ── Thermal: deep navy → cyan → green-yellow → amber → deep crimson
  // Rich, symmetric diverging scale. Cold end goes to true navy, hot end to
  // near-black red. Midpoint is a warm neutral yellow-green.
  thermal: {
    name: 'Thermal',
    colors12: [
      '#003a6d', // deep navy          — super extreme cold
      '#0072c3', // strong blue         — extreme cold
      '#33b1ff', // sky blue            — cold
      '#82cfff', // light blue          — cool
      '#bae6ff', // pale blue           — mild-low
      '#f6f2c0', // warm cream          — mid-low
      '#ffe57a', // golden yellow       — mid-high
      '#ff9f43', // amber               — mild-high
      '#ff6b35', // orange-red          — warm
      '#da1e28', // true red            — hot
      '#750e13', // deep crimson        — extreme hot
      '#2a0000', // near-black red      — super extreme hot
    ],
    colors10: [
      '#0072c3', '#33b1ff', '#82cfff', '#bae6ff',
      '#f6f2c0', '#ffe57a', '#ff9f43', '#ff6b35', '#da1e28', '#750e13',
    ],
  },

  // ── Earthy: true earth tones — slate → clay → wheat → terracotta → umber
  // Inspired by landscape: blue-grey winter soil, sage spring, dry wheat summer,
  // terracotta fall, deep umber heat.
  earthy: {
    name: 'Earthy',
    colors12: [
      '#2d3a4a', // dark slate           — super extreme cold
      '#4a6378', // steel blue-grey      — extreme cold
      '#6b8fa3', // weathered blue       — cold
      '#8aab8c', // sage green           — cool
      '#b5c99a', // light sage           — mild-low
      '#d9c88a', // dry wheat            — mid-low
      '#c9a84c', // golden straw         — mid-high
      '#b8763a', // warm clay            — mild-high
      '#964028', // terracotta           — warm
      '#6e2318', // burnt sienna         — hot
      '#4a1208', // deep umber           — extreme hot
      '#1e0500', // charred              — super extreme hot
    ],
    colors10: [
      '#4a6378', '#6b8fa3', '#8aab8c', '#b5c99a',
      '#d9c88a', '#c9a84c', '#b8763a', '#964028', '#6e2318', '#4a1208',
    ],
  },

  // ── Pastel: soft washed tones — lavender fog → mint → butter → peach → rose
  // Like a watercolor painting of seasons. Gentle enough for cozy knitting.
  pastel: {
    name: 'Pastel',
    colors12: [
      '#4a5080', // deep periwinkle      — super extreme cold (darkest cold)
      '#7080c0', // medium periwinkle    — extreme cold
      '#9daee0', // soft cornflower      — cold
      '#a8d4e8', // powder blue          — cool
      '#b8e8d0', // seafoam mint         — mild-low
      '#e8f0b0', // pale green-yellow    — mid-low
      '#f5e898', // soft butter          — mid-high
      '#f5cc88', // warm peach           — mild-high
      '#f0a890', // coral                — warm
      '#e87890', // rose                 — hot
      '#c04870', // deep rose            — extreme hot
      '#802050', // plum (darkest hot)   — super extreme hot
    ],
    colors10: [
      '#7080c0', '#9daee0', '#a8d4e8', '#b8e8d0',
      '#e8f0b0', '#f5e898', '#f5cc88', '#f0a890', '#e87890', '#c04870',
    ],
  },

  // ── Sunset: indigo night → purple dusk → magenta → gold → ivory noon
  // Reversed: cool is deep indigo/night, warm is blazing gold/ivory.
  // Dramatic and beautiful for a single-city blanket.
  sunset: {
    name: 'Sunset',
    colors12: [
      '#0d0221', // midnight indigo      — super extreme cold
      '#2d1b69', // deep violet          — extreme cold
      '#5e30a0', // purple               — cold
      '#9b4dca', // amethyst             — cool
      '#d466cc', // orchid               — mild-low
      '#f07fb0', // hot pink             — mid-low
      '#f5a05a', // amber orange         — mid-high
      '#f5c842', // golden yellow        — mild-high
      '#f5e87a', // pale gold            — warm
      '#fff5c0', // ivory                — hot
      '#fffae8', // near white           — extreme hot
      '#ffffff', // white hot            — super extreme hot
    ],
    colors10: [
      '#2d1b69', '#5e30a0', '#9b4dca', '#d466cc',
      '#f07fb0', '#f5a05a', '#f5c842', '#f5e87a', '#fff5c0', '#fffae8',
    ],
  },

  // ── Ocean: abyssal trench → deep sea → reef → tropics → bleached
  // Deep ocean bottom (near-black) rises through deep navy, teal, turquoise,
  // to the bleached white of shallow tropical water in heat.
  ocean: {
    name: 'Ocean',
    colors12: [
      '#000d1a', // abyssal black        — super extreme cold
      '#001f3f', // midnight navy        — extreme cold
      '#003d7a', // deep ocean           — cold
      '#0066a8', // ocean blue           — cool
      '#0090c0', // mid-ocean            — mild-low
      '#00b8c8', // teal                 — mid-low
      '#00c8a0', // deep reef            — mid-high
      '#40d890', // reef green           — mild-high
      '#88e8a0', // tropical shallow     — warm
      '#d0f5c0', // sandy lagoon         — hot
      '#f5f0c0', // sun-bleached sand    — extreme hot
      '#fff8e8', // bleached coral       — super extreme hot
    ],
    colors10: [
      '#001f3f', '#003d7a', '#0066a8', '#0090c0',
      '#00b8c8', '#00c8a0', '#40d890', '#88e8a0', '#d0f5c0', '#f5f0c0',
    ],
  },

  // ── Desert: dark umber night → dusty brown → sand → ochre → bleached bone
  // Pure desert palette, zero blue. Cold = dark desert night, warm = blazing noon.
  desert: {
    name: 'Desert',
    colors12: [
      '#1a0f08', // near-black umber     — super extreme cold
      '#3d2010', // dark umber           — extreme cold
      '#6b3a1f', // deep brown           — cold
      '#8c5230', // warm chestnut        — cool
      '#b07240', // clay brown           — mild-low
      '#c99060', // dusty tan            — mid-low
      '#d4aa78', // dry sand             — mid-high
      '#e0c08a', // warm sand            — mild-high
      '#eacf9a', // pale sand            — warm
      '#f2dfa8', // bleached sand        — hot
      '#f8eece', // bone                 — extreme hot
      '#fffbf0', // sun-bleached white   — super extreme hot
    ],
    colors10: [
      '#3d2010', '#6b3a1f', '#8c5230', '#b07240',
      '#c99060', '#d4aa78', '#e0c08a', '#eacf9a', '#f2dfa8', '#f8eece',
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
    palette:    ov.palette    || state.palette,
    bucketMode: ov.bucketMode || state.bucketMode,
  };
}

function getCityDateRange(city) {
  const eff = getCityEffective(city);
  return { start: eff.dateStart, end: eff.dateEnd };
}

function getCityNZones(city) {
  const eff = getCityEffective(city);
  const b = BUCKET_MODES[eff.bucketMode];
  return b.bounds ? b.bounds.length - 1 : 10;
}

function getCityColors(city) {
  const eff = getCityEffective(city);
  const n   = getCityNZones(city);
  const pal = PALETTES[eff.palette];
  return n === 12 ? pal.colors12 : pal.colors10;
}

function computeBoundsForMode(baselineHighs, bucketMode) {
  const mode  = BUCKET_MODES[bucketMode];
  const valid = baselineHighs.filter(h => h != null);
  if (bucketMode === 'uniform-temp') {
    const mn = Math.min(...valid), mx = Math.max(...valid);
    return Array.from({length: 11}, (_,i) => mn + (mx-mn) * i / 10);
  }
  return computePercentiles(valid, mode.bounds);
}

function updateDateDisplay() {
  const range = getDateRange();
  if (!range.start || !range.end) return;
  const opts = { year:'numeric', month:'short', day:'numeric' };
  const s = new Date(range.start + 'T12:00:00').toLocaleDateString('en-US', opts);
  const e = new Date(range.end   + 'T12:00:00').toLocaleDateString('en-US', opts);
  $('date-range-text').textContent = `${s} → ${e}`;
}

// ── Auto-trigger ─────────────────────────────────────────────
function scheduleGenerate(delay = 0) {
  clearTimeout(state.generateDebounce);
  state.generateDebounce = setTimeout(() => {
    if (state.cities.length > 0) generate();
  }, delay);
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
  initZoomControls();
  initDownload();
  initPopover();
  renderLegend();
  updateDateDisplay();
  detectUserCity(); // will auto-generate once a city is added
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

function initOptions() {
  $('toggle-sh').addEventListener('change', e => {
    state.shiftSH = e.target.checked;
    scheduleGenerate();
  });
  $('toggle-fahrenheit').addEventListener('change', e => {
    state.fahrenheit = e.target.checked;
    // Redraw tooltips/legend only — no new fetch needed
    if (state.rendered.length) renderLegend(state.rendered[0]?.bounds);
  });
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
    });
  });
}

function getCurrentNZones() {
  const b = BUCKET_MODES[state.bucketMode];
  return b.bounds ? b.bounds.length - 1 : 10;
}

function getCurrentColors() {
  const n   = getCurrentNZones();
  const pal = PALETTES[state.palette];
  return n === 12 ? pal.colors12 : pal.colors10;
}

// ── Legend ────────────────────────────────────────────────────
function renderLegend(bounds) {
  const colors = getCurrentColors();
  const mode   = BUCKET_MODES[state.bucketMode];
  const n      = colors.length;
  const names  = n === 12 ? ZONE_NAMES_12 : (state.bucketMode === 'uniform-pct' ? ZONE_NAMES_UNIFORM : ZONE_NAMES_10);

  let items = '';
  for (let i = 0; i < n; i++) {
    const pLo  = mode.bounds ? mode.bounds[i]   : i * 10;
    const pHi  = mode.bounds ? mode.bounds[i+1] : (i+1) * 10;
    const label = bounds
      ? `${tempFmt(bounds[i])}–${tempFmt(bounds[i+1])}`
      : `p${pLo}–${pHi}`;
    items += `
      <div class="legend-item" data-zone="${i}" onclick="toggleHighlight(${i})">
        <div class="legend-swatch" style="background:${colors[i]}"></div>
        <div class="legend-info">
          <span class="legend-range">${label}</span>
          <span class="legend-name">${names[i] || `zone ${i+1}`}</span>
        </div>
      </div>`;
  }
  $('legend-items').innerHTML = items;
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
  // Try ipwho.is first (CORS-friendly, works in iframes, no key needed)
  // Returns city, lat, lon and timezone.id directly
  try {
    const res  = await fetch(IP_GEO_URL);
    const data = await res.json();
    if (data.success !== false && data.city && data.latitude && data.longitude) {
      const tz = data.timezone?.id || data.timezone || 'UTC';
      await resolveCity(data.latitude, data.longitude, data.city, tz);
      return;
    }
  } catch(e) { /* fall through */ }

  // Fallback: browser GPS (may be blocked in sandboxed iframes)
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
  const key = cacheKey(lat, lon, start, end);
  if (state.cache[key]) return state.cache[key];

  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    start_date: start, end_date: end,
    daily: 'temperature_2m_max',
    temperature_unit: 'fahrenheit',
    timezone: tz,
  });
  const res  = await fetch(`${ARCHIVE_URL}?${params}`);
  if (!res.ok) throw new Error(`API error ${res.status} for ${tz}`);
  const data = await res.json();
  const result = { dates: data.daily.time, highs: data.daily.temperature_2m_max };
  state.cache[key] = result;
  return result;
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
      // Use per-city effective date range
      const cityRange     = getCityDateRange(city);
      const blanketRange  = (cityRange.start && cityRange.end) ? cityRange : globalBlanketRange;
      const baselineRange = getBaselineRange(blanketRange);

      $('loading-text').textContent = `${city.name}: baseline…`;
      const baseline = await fetchTemps(city.lat, city.lon, city.tz, baselineRange.start, baselineRange.end);
      done++;
      setProgress(Math.round(done / total * 100));

      $('loading-text').textContent = `${city.name}: blanket year…`;
      const blanket = await fetchTemps(city.lat, city.lon, city.tz, blanketRange.start, blanketRange.end);
      done++;
      setProgress(Math.round(done / total * 100));

      cityResults.push({ city, baseline, blanket });
    }

    setProgress(100);
    $('loading-text').textContent = 'Computing zones…';

    // Pool baseline highs for shared bounds (using global bucket mode)
    const allHighs = cityResults.flatMap(r => r.baseline.highs.filter(h => h != null));

    let sharedBounds;
    if (state.scaleMode === 'anchor' && state.anchorCityId) {
      const anchor = cityResults.find(r => r.city.id === state.anchorCityId);
      sharedBounds = computeBounds(anchor ? anchor.baseline.highs : allHighs);
    } else {
      sharedBounds = computeBounds(allHighs);
    }

    state.rendered = cityResults.map(r => {
      let highs = [...r.blanket.highs];
      let dates = [...r.blanket.dates];
      if (state.shiftSH && r.city.isSH) {
        const shift = 182;
        highs = [...highs.slice(shift), ...highs.slice(0, shift)];
      }
      const eff         = getCityEffective(r.city);
      const cityBounds  = computeBoundsForMode(r.baseline.highs.filter(h => h != null).length > 0
        ? r.baseline.highs : allHighs, eff.bucketMode);
      // Use city-specific bounds for zone assignment if bucket mode differs from global
      const boundsToUse = (eff.bucketMode !== state.bucketMode) ? cityBounds : sharedBounds;
      return {
        city: r.city,
        dates, highs,
        zones: assignZones(highs, boundsToUse),
        bounds: boundsToUse,
        sharedBounds,
        effectivePalette:    eff.palette,
        effectiveBucketMode: eff.bucketMode,
        baselineHighs: r.baseline.highs,
      };
    });

    hideLoading();
    renderLegend(sharedBounds);
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

    // Rich column header
    const header = buildColHeader(rd, cityIdx);
    col.appendChild(header);

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

    const d    = rd.dates[dayIdx];
    const temp = rd.highs[dayIdx];
    const zone = rd.zones[dayIdx];
    const colors = getCityColors(rd.city);
    const n      = colors.length;
    const eff    = getCityEffective(rd.city);
    const names  = n === 12 ? ZONE_NAMES_12 : (eff.bucketMode === 'uniform-pct' ? ZONE_NAMES_UNIFORM : ZONE_NAMES_10);

    const dt      = new Date(d + 'T12:00:00');
    const dateStr = dt.toLocaleDateString('en-US', {weekday:'short', month:'short', day:'numeric', year:'numeric'});
    const tempStr = temp != null ? tempFmt(temp) : 'No data';
    const color   = zone >= 0 ? colors[Math.min(zone, n-1)] : '#888';
    const zoneLbl = zone >= 0 ? `Zone ${zone+1} · ${names[Math.min(zone, names.length-1)]}` : 'no data';

    // City name in tooltip
    $('tooltip-city').textContent  = `${rd.city.name}, ${rd.city.country}`;
    $('tooltip-date').textContent  = dateStr;
    $('tooltip-temp').textContent  = tempStr;
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
  const totalW     = pad + monthColW + blanketW + pad + legendW + pad;
  const totalH     = pad + headerH + blanketH + pad;

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
  const legendTop = blanketTop;

  // Use first city's bounds as representative
  const bounds = state.rendered[0]?.bounds;
  const colors = getCurrentColors();
  const nZones = colors.length;
  const names  = nZones === 12
    ? ZONE_NAMES_12
    : (state.bucketMode === 'uniform-pct' ? ZONE_NAMES_UNIFORM : ZONE_NAMES_10);
  const mode = BUCKET_MODES[state.bucketMode];

  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#9aa0b8';
  ctx.textAlign = 'left';
  ctx.fillText('Legend', legendX, legendTop + 14);

  const swatchSize = 16;
  const lineH = 36;
  const startY = legendTop + 30;

  for (let i = 0; i < nZones; i++) {
    const y = startY + i * lineH;

    // Swatch
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.roundRect(legendX, y, swatchSize, swatchSize, 3);
    ctx.fill();

    // Range label
    const pLo = mode.bounds ? mode.bounds[i] : i * 10;
    const pHi = mode.bounds ? mode.bounds[i + 1] : (i + 1) * 10;
    const rangeLabel = bounds
      ? `${tempFmt(bounds[i])}–${tempFmt(bounds[i + 1])}`
      : `p${pLo}–${pHi}`;

    ctx.fillStyle = '#e8eaf0';
    ctx.font = '11px sans-serif';
    ctx.fillText(rangeLabel, legendX + swatchSize + 8, y + 8);

    // Zone name
    ctx.fillStyle = '#9aa0b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(names[i] || `zone ${i + 1}`, legendX + swatchSize + 8, y + 22);
  }

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
