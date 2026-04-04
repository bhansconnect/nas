/* ============================================================
   JRLA Fish Assistant — App
   Single state object. setState() is the only mutation path.
   All render functions use innerHTML — no DOM sync complexity.
   Depends on engine.js loaded first.
   ============================================================ */

const PERSIST_KEY = 'jrla-fish-state';

// ── State ─────────────────────────────────────────────────
let state = {
  season:    'Spring',
  inventory: [], // [{id, fishId, qty, form: 'raw'|'cooked'}]
};

// ── DOM helpers ───────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// ── Fish data ─────────────────────────────────────────────
let FISH_DATA = null;

// ── State management ──────────────────────────────────────
function setState(patch) {
  Object.assign(state, patch);
  saveState();
  render();
}

function saveState() {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify({
      season:    state.season,
      inventory: state.inventory,
    }));
  } catch (_) {}
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(PERSIST_KEY));
    if (!saved) return;
    if (saved.season)                   state.season    = saved.season;
    if (Array.isArray(saved.inventory)) state.inventory = saved.inventory;
  } catch (_) {}
}

// ── Bootstrap ─────────────────────────────────────────────
async function loadData() {
  const res = await fetch('fish-data.json');
  FISH_DATA = await res.json();
  init();
}

function init() {
  loadState();
  setupTheme();
  setupSeasonButtons();
  setupAutocomplete();
  setupFormToggle();
  setupAddFish();
  setupInventoryDelegation();
  render();
}

// ── Theme ─────────────────────────────────────────────────
function setupTheme() {
  const saved = localStorage.getItem('jrla-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  $('btn-theme').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jrla-theme', next);
  });
}

// ── Season — one-time listener setup ─────────────────────
function setupSeasonButtons() {
  $$('.season-btn').forEach(btn => {
    btn.addEventListener('click', () => setState({ season: btn.dataset.season }));
  });
}

function updateSeasonActiveClass() {
  $$('.season-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.season === state.season)
  );
}

// ── Autocomplete ──────────────────────────────────────────
let selectedItem    = null;
let selectedSpecial = false;
let acActiveIdx     = -1;

function allSearchItems() {
  return (FISH_DATA.fish || []).map(f => ({ ...f, _special: false }));
}

function setupAutocomplete() {
  const input = $('fish-search');
  const list  = $('autocomplete-list');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    selectedItem = null;
    if (!q) { closeAC(); return; }

    const matches = allSearchItems().filter(f => f.name.toLowerCase().includes(q));
    if (!matches.length) { closeAC(); return; }

    acActiveIdx  = -1;
    list.innerHTML = matches.map((f, i) => `
      <li data-id="${f.id}" data-special="${f._special}" data-idx="${i}">
        <span class="stars">${f._special ? '🍄' : starStr(f.stars)}</span>
        <span>${f.name}</span>
        ${!f._special && f.location.length ? `<span class="loc-tag">${f.location[0]}</span>` : ''}
      </li>
    `).join('');

    list.querySelectorAll('li').forEach(li => {
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectItem(li.dataset.id);
      });
    });
    list.classList.add('open');
  });

  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      acActiveIdx = Math.min(acActiveIdx + 1, items.length - 1);
      items.forEach((li, i) => li.classList.toggle('active', i === acActiveIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      acActiveIdx = Math.max(acActiveIdx - 1, -1);
      items.forEach((li, i) => li.classList.toggle('active', i === acActiveIdx));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (acActiveIdx >= 0) selectItem(items[acActiveIdx].dataset.id);
    } else if (e.key === 'Escape') {
      closeAC();
    }
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target)) closeAC();
  });
}

function selectItem(itemId) {
  const found = allSearchItems().find(x => x.id === itemId);
  if (!found) return;
  selectedItem    = found;
  selectedSpecial = false;
  $('fish-search').value      = found.name;
  $('toggle-cooked').disabled = !found.cookable;
  if (!found.cookable) setFormToggle('raw');
  closeAC();
  $('fish-qty').focus();
}

function closeAC() {
  $('autocomplete-list').classList.remove('open');
  acActiveIdx = -1;
}

// ── Form toggle ───────────────────────────────────────────
let currentForm = 'raw';

function setupFormToggle() {
  $$('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => { if (!btn.disabled) setFormToggle(btn.dataset.form); });
  });
}

function setFormToggle(form) {
  currentForm = form;
  $$('.toggle-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.form === form));
}

// ── Add item ──────────────────────────────────────────────
function setupAddFish() {
  $('btn-add-fish').addEventListener('click', addItem);
  $('fish-qty').addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
}

function addItem() {
  if (!selectedItem) {
    const q = $('fish-search').value.toLowerCase().trim();
    const found = allSearchItems().find(f => f.name.toLowerCase() === q);
    if (!found) return;
    selectItem(found.id, found._special || false);
  }

  const qty  = Math.max(1, parseInt($('fish-qty').value) || 1);
  const form = selectedItem.cookable ? currentForm : 'raw';
  const id   = selectedItem.id;

  const newInventory = [...state.inventory];
  const existing = newInventory.find(item => item.fishId === id && item.form === form);
  if (existing) {
    existing.qty += qty;
  } else {
    newInventory.push({ id: Date.now().toString(), fishId: id, qty, form });
  }

  // Reset form
  $('fish-search').value       = '';
  $('fish-qty').value          = 1;
  selectedItem                 = null;
  selectedSpecial              = false;
  $('toggle-cooked').disabled  = false;
  setFormToggle('raw');

  setState({ inventory: newInventory });
}

// ── Inventory event delegation ────────────────────────────
// One listener on the list handles all qty/remove interactions.
function setupInventoryDelegation() {
  $('inventory-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const itemId = btn.dataset.itemId;
    const action = btn.dataset.action;
    const newInventory = [...state.inventory];
    const idx = newInventory.findIndex(i => i.id === itemId);
    if (idx === -1) return;

    if (action === 'remove') {
      newInventory.splice(idx, 1);
    } else if (action === 'inc') {
      newInventory[idx] = { ...newInventory[idx], qty: newInventory[idx].qty + 1 };
    } else if (action === 'dec') {
      if (newInventory[idx].qty <= 1) {
        newInventory.splice(idx, 1);
      } else {
        newInventory[idx] = { ...newInventory[idx], qty: newInventory[idx].qty - 1 };
      }
    }
    setState({ inventory: newInventory });
  });

  $('btn-clear-all').addEventListener('click', () => {
    if (state.inventory.length) setState({ inventory: [] });
  });
}

// ── Helpers ───────────────────────────────────────────────
function starStr(n) {
  if (n === 0) return '✦';
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n));
}

function starsHTML(n) {
  if (n === 0) return '<span class="stars-row"><span class="star filled">✦</span></span>';
  let h = '<span class="stars-row">';
  for (let i = 1; i <= 4; i++)
    h += `<span class="star ${i <= n ? 'filled' : 'empty'}">${i <= n ? '★' : '☆'}</span>`;
  return h + '</span>';
}

function coin(n)   { return `¥${n.toLocaleString()}`; }
function esc(str)  { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function itemDisplayName(fishId, form) {
  const f = (FISH_DATA.fish || []).find(x => x.id === fishId);
  if (f) return form === 'cooked' && f.cookedDish ? f.cookedDish : f.name;
  const s = (FISH_DATA.specialItems || []).find(x => x.id === fishId);
  return s ? s.name : fishId;
}

const LOC_ICONS = { 'Above Waterfall': '🏔️', 'River': '🏞️', 'Below Waterfall': '🌿', 'Seaside': '🌊', 'Pond': '🪷' };
function locIcon(loc) { return LOC_ICONS[loc] || '📍'; }

// ── Main render ───────────────────────────────────────────
function render() {
  if (!FISH_DATA) return;
  updateSeasonActiveClass();
  renderInventoryList();
  renderSellPlan();
  renderBetterPairings();
  renderBeforeSell();
  renderCatch();
}

// ── Inventory list ────────────────────────────────────────
function renderInventoryList() {
  const emptyEl = $('inventory-empty');
  const list    = $('inventory-list');

  if (!state.inventory.length) {
    emptyEl.style.display = '';
    // Remove all item rows, keep emptyEl
    list.innerHTML = '';
    list.appendChild(emptyEl);
    return;
  }

  emptyEl.style.display = 'none';
  // Build all rows as HTML then set; append emptyEl back at end (hidden)
  const rows = state.inventory.map(item => {
    const name = esc(itemDisplayName(item.fishId, item.form));
    return `
      <li class="inventory-item">
        <span class="inventory-item-name">${name}</span>
        <span class="badge-form ${item.form}">${item.form}</span>
        <div class="qty-controls">
          <button class="btn-qty" data-action="dec" data-item-id="${item.id}" title="Decrease">−</button>
          <span class="inventory-item-qty">${item.qty}</span>
          <button class="btn-qty" data-action="inc" data-item-id="${item.id}" title="Increase">+</button>
        </div>
        <button class="btn-remove" data-action="remove" data-item-id="${item.id}" title="Remove">×</button>
      </li>
    `;
  }).join('');

  list.innerHTML = rows;
  list.appendChild(emptyEl); // keep in DOM, hidden
}

// ── Sell plan ─────────────────────────────────────────────
function renderSellPlan() {
  const plan = calculateSellPlan(state.inventory, FISH_DATA);

  // Stash plan on window so other sections can reuse it without recalculating
  window._lastPlan = plan;

  // Cooked
  const cookedTotal = plan.cookedSales.reduce((s, e) => s + e.totalPrice, 0);
  $('cooked-total').textContent = coin(cookedTotal);
  $('sell-cooked-list').innerHTML = plan.cookedSales.length
    ? plan.cookedSales.map(sale => {
        const dishes   = sale.dishes.join(' + ');
        const ingNote  = buildIngredientNote(sale.fish);
        return `
          <div class="sell-item">
            <div class="sell-item-name">
              <div class="sell-fish-name">${esc(dishes)}</div>
              <div class="sell-dish-name">×${sale.count}${ingNote ? ` · ${ingNote}` : ''}</div>
            </div>
            <div class="sell-item-price">
              <div class="sell-unit-price">${coin(sale.pricePerPair)} / pair</div>
              <div class="sell-total">${coin(sale.totalPrice)}</div>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="empty-state">Add cookable fish to see what to cook.</div>';

  // Raw
  const rawTotal = plan.rawSales.reduce((s, e) => s + e.totalPrice, 0)
                 + plan.soloRawSales.reduce((s, e) => s + e.totalPrice, 0);
  $('raw-total').textContent = coin(rawTotal);
  const rawRows = [
    ...plan.rawSales.map(sale => `
      <div class="sell-item">
        <div class="sell-item-name">
          <div class="sell-fish-name">${esc(sale.fish.map(f => f.name).join(' + '))}</div>
          <div class="sell-dish-name">×${sale.count} (raw pair)</div>
        </div>
        <div class="sell-item-price">
          <div class="sell-unit-price">${coin(sale.pricePerPair)} / pair</div>
          <div class="sell-total">${coin(sale.totalPrice)}</div>
        </div>
      </div>
    `),
    ...plan.soloRawSales.map(sale => `
      <div class="sell-item">
        <div class="sell-item-name">
          <div class="sell-fish-name">${esc(sale.fish.name)}</div>
          <div class="sell-dish-name">×${sale.qty}</div>
        </div>
        <div class="sell-item-price">
          <div class="sell-unit-price">${coin(sale.price)} each</div>
          <div class="sell-total">${coin(sale.totalPrice)}</div>
        </div>
      </div>
    `),
  ];
  $('sell-raw-list').innerHTML = rawRows.length
    ? rawRows.join('')
    : '<div class="empty-state">Non-cookable or unpaired fish appear here.</div>';

  // Leftover with catch opportunities
  renderLeftoverWithCatch(plan.leftover);

  // Grand total
  $('grand-total').textContent = coin(plan.grandTotal);
}

function buildIngredientNote(fishArr) {
  const all = [];
  for (const f of fishArr) {
    if (f && f.cookingIngredients && f.cookingIngredients.length) {
      all.push(...f.cookingIngredients);
    }
  }
  if (!all.length) return '';
  return `needs ${[...new Set(all)].join(' + ')}`;
}

// ── Leftover with catch opportunities ─────────────────────
function renderLeftoverWithCatch(leftover) {
  const section = $('leftover-section');
  const list    = $('leftover-list');

  if (!leftover || !leftover.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  const ops = getLeftoverCatchOpportunities(leftover, state.season, FISH_DATA);
  const opsByFishId = {};
  ops.forEach(op => {
    const id = op.haveItem.fish ? op.haveItem.fish.id : (op.haveItem.specialItem && op.haveItem.specialItem.id);
    if (id) opsByFishId[id] = op;
  });

  list.innerHTML = leftover.map(lo => {
    let name, catchHtml = '';
    if (lo.specialItem) {
      name = esc(lo.specialItem.name);
    } else {
      name = esc(lo.form === 'cooked' && lo.fish.cookedDish ? lo.fish.cookedDish : lo.fish.name);
      const op = opsByFishId[lo.fish.id];
      if (op) {
        const pairingRows = op.pairings.map((pairing, idx) => {
          const isBest = idx === 0;
          const label = isBest ? 'Best' : 'Alt';
          const pairLabel = pairing.type === 'cooked'
            ? `${esc(lo.fish.cookedDish || lo.fish.name)} (cooked)`
            : `${esc(lo.fish.name)} (raw)`;
          const partnerLines = pairing.needed.map(n => {
            const badge = n.catchableNow
              ? `<span class="catch-badge catch-yes">✓ ${esc(n.locations.join('/'))} now</span>`
              : `<span class="catch-badge catch-no">✗ ${esc(n.seasons.join('/'))} only</span>`;
            return `<span class="catch-partner">${esc(n.fish.name)}</span>${badge}`;
          }).join(' ');
          return `
            <div class="catch-pairing-row ${isBest ? 'catch-pairing-best' : 'catch-pairing-alt'}">
              <span class="catch-option-label">${label}</span>
              <span class="catch-pair-desc">${pairLabel} → ${coin(pairing.price)}/pair</span>
              <span class="catch-needs">needs: ${partnerLines}</span>
            </div>
          `;
        }).join('');
        catchHtml = `<div class="catch-opportunity">${pairingRows}</div>`;
      }
    }
    return `
      <div class="sell-item sell-item-leftover">
        <div class="sell-item-name">
          <div class="sell-fish-name">${name} ×${lo.qty}</div>
        </div>
        ${catchHtml}
      </div>
    `;
  }).join('');
}

// ── Better Pairings ───────────────────────────────────────
function renderBetterPairings() {
  const section  = $('better-pairings-section');
  const list     = $('better-pairings-list');
  const pairings = getBetterPairings(state.inventory, FISH_DATA);

  if (!pairings.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';

  list.innerHTML = pairings.map(entry => {
    const rows = entry.pairings.map((pairing, idx) => {
      const isBest = idx === 0;
      const dish = pairing.type === 'cooked'
        ? (entry.fish.cookedDish || entry.fish.name)
        : entry.fish.name;

      const partnerHtml = pairing.partners.map(p => {
        const inInv       = state.inventory.some(i => i.fishId === p.id);
        const catchable   = fishAvailableInSeason(p, state.season);
        const locs        = p.location.join('/');
        let badge;
        if (inInv) {
          badge = `<span class="catch-badge catch-yes">✓ in inventory</span>`;
        } else if (catchable) {
          badge = `<span class="catch-badge catch-yes">✓ ${esc(locs)} now</span>`;
        } else {
          badge = `<span class="catch-badge catch-no">✗ ${esc(p.seasons.join('/'))} only</span>`;
        }
        return `<span class="${inInv ? 'partner-have' : 'partner-need'}">${esc(p.name)}</span>${badge}`;
      }).join(' <span class="bp-plus">+</span> ');

      // Cooking ingredients only apply to cooked pairings
      const ingredients = pairing.type === 'cooked'
        ? [...new Set([entry.fish, ...pairing.partners].flatMap(f => f.cookingIngredients || []))]
        : [];
      const ingHtml = ingredients.length
        ? `<span class="bp-ing">🧂 ${ingredients.map(esc).join(', ')}</span>`
        : '';

      return `
        <div class="bp-pairing-row">
          <span class="bp-label ${isBest ? 'bp-label-best' : 'bp-label-alt'}">${isBest ? 'Best' : 'Alt'}</span>
          <span class="bp-dish">${esc(dish)}</span>
          <span class="bp-plus">+</span>
          <span class="bp-partners">${partnerHtml}</span>
          ${ingHtml}
          <span class="bp-price ${isBest ? '' : 'alt-price'}">${coin(pairing.price)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="better-pair-row">
        <div class="bp-fish">${esc(entry.fish.name)} ×${entry.qty}</div>
        ${rows}
      </div>
    `;
  }).join('');
}

// ── Before You Sell ───────────────────────────────────────
function renderBeforeSell() {
  $('before-sell-season-label').textContent = `Best to catch in ${state.season}`;
  const grid  = $('before-sell-grid');
  const pairs = bestPairsThisSeason(state.season, FISH_DATA).slice(0, 6);

  if (!pairs.length) {
    grid.innerHTML = '<div class="empty-state">No pairs available this season.</div>';
    return;
  }

  grid.innerHTML = pairs.map((p, i) => {
    const fishNames  = p.fish.map(f => f.name).join(' + ');
    const dishLine   = p.type === 'cooked'
      ? p.fish.map(f => f.cookedDish || f.name).join(' + ')
      : fishNames + ' (raw)';
    const availBadge = p.allAvailable
      ? `<span class="avail-badge avail-yes">✓ catchable now</span>`
      : `<span class="avail-badge avail-partial">⚠ partial</span>`;
    const locs = [...new Set(p.fish.flatMap(f => f.location))].join(', ');

    // Cooking ingredients only apply to cooked pairs
    const ingredients = p.type === 'cooked'
      ? [...new Set(p.fish.flatMap(f => f.cookingIngredients || []))]
      : [];
    const ingLine = ingredients.length
      ? `<div class="before-sell-ingredients">🧂 needs: ${ingredients.map(esc).join(', ')}</div>`
      : '';

    return `
      <div class="before-sell-card">
        <div class="before-sell-rank">#${i + 1} ${availBadge}</div>
        <div class="before-sell-name">${esc(fishNames)}</div>
        <div class="before-sell-loc">${esc(locs)}</div>
        <div class="before-sell-value">${coin(p.price)}</div>
        <div class="before-sell-dish">${esc(dishLine)}</div>
        ${ingLine}
      </div>
    `;
  }).join('');
}

// ── Available this season ─────────────────────────────────
function renderCatch() {
  $('catch-season-label').textContent = state.season;
  const container = $('catch-by-location');

  const seasonFish = FISH_DATA.fish.filter(f => !f.koi && fishAvailableInSeason(f, state.season));

  if (!seasonFish.length) {
    container.innerHTML = '<div class="empty-state">No regular fish available this season.</div>';
    return;
  }

  const byLoc = {};
  for (const fish of seasonFish) {
    for (const loc of fish.location) {
      if (!byLoc[loc]) byLoc[loc] = [];
      if (!byLoc[loc].find(f => f.id === fish.id)) byLoc[loc].push(fish);
    }
  }

  const locOrder = ['Above Waterfall', 'River', 'Below Waterfall', 'Seaside'];
  const maxVal = Math.max(0, ...seasonFish.map(f => {
    if (!f.cookedPairId) return f.rawPrice;
    const cp = FISH_DATA.cookedPairs.find(p => p.id === f.cookedPairId);
    return cp ? cp.price : f.rawPrice;
  }));

  container.innerHTML = locOrder.filter(l => byLoc[l]).map(loc => {
    const fishList = [...byLoc[loc]].sort((a, b) => {
      const av = a.cookedPairId ? (FISH_DATA.cookedPairs.find(p=>p.id===a.cookedPairId)||{price:0}).price : a.rawPrice;
      const bv = b.cookedPairId ? (FISH_DATA.cookedPairs.find(p=>p.id===b.cookedPairId)||{price:0}).price : b.rawPrice;
      return bv - av;
    });

    const cards = fishList.map(fish => {
      const cp     = fish.cookedPairId ? FISH_DATA.cookedPairs.find(p => p.id === fish.cookedPairId) : null;
      const rp     = fish.rawPairId    ? FISH_DATA.rawPairs.find(p => p.id === fish.rawPairId)       : null;
      const topVal = cp ? cp.price : (rp ? rp.price : fish.rawPrice);
      const isTop  = topVal >= maxVal * 0.75;

      let cookedLine = '';
      if (cp) {
        const partners = cp.fishIds.filter(id => id !== fish.id).map(id => {
          const pf = FISH_DATA.fish.find(f => f.id === id);
          return pf ? (pf.cookedDish || pf.name) : id;
        });
        if (cp.requiresItem) {
          const si = (FISH_DATA.specialItems||[]).find(s => s.id === cp.requiresItem);
          partners.push(si ? si.name : cp.requiresItem);
        }
        cookedLine = `<div class="catch-dish">${esc(fish.cookedDish)}${partners.length ? ' + ' + esc(partners.join(' + ')) : ''} = ${coin(cp.price)}</div>`;
      }

      let rawLine = '';
      if (rp && !cp) {
        const partners = rp.fishIds.filter(id => id !== fish.id).map(id => {
          const pf = FISH_DATA.fish.find(f => f.id === id);
          return pf ? pf.name : id;
        });
        rawLine = `<div class="catch-raw-price">raw pair w/ ${esc(partners.join(' + '))} = ${coin(rp.price)}</div>`;
      } else if (rp && cp) {
        // Show raw pair as alternative reference
        const partners = rp.fishIds.filter(id => id !== fish.id).map(id => {
          const pf = FISH_DATA.fish.find(f => f.id === id);
          return pf ? pf.name : id;
        });
        rawLine = `<div class="catch-raw-price">raw alt: w/ ${esc(partners.join(' + '))} = ${coin(rp.price)}</div>`;
      }

      return `
        <div class="catch-card ${isTop ? 'top-value' : ''}">
          ${starsHTML(fish.stars)}
          <div class="catch-card-info">
            <div class="catch-fish-name">${esc(fish.name)}</div>
            ${cookedLine}
            ${rawLine}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="location-group">
        <div class="location-header">
          <span class="location-icon">${locIcon(loc)}</span>
          <span class="location-name">${esc(loc)}</span>
        </div>
        <div class="catch-grid">${cards}</div>
      </div>
    `;
  }).join('');
}

// ── Start ─────────────────────────────────────────────────
loadData();
