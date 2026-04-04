/* ============================================================
   JRLA Fish Assistant — Pure Calculation Engine
   No DOM dependencies — testable in Node.js or browser.
   ============================================================ */

/**
 * Check whether a fish (or special item) is available in a given season.
 * @param {object} fish - fish entry from fish-data.json
 * @param {string} season - "Spring"|"Summer"|"Fall"|"Winter"
 */
function fishAvailableInSeason(fish, season) {
  return fish.seasons.includes(season);
}

/**
 * Calculate the optimal sell plan for the current inventory.
 *
 * Algorithm (highest-value first):
 *   1. Solo cooked with no special item required (Ito Sashimi)
 *   2. Item-paired cooked (Yakizake + Roasted Matsutake)
 *   3. Cooked fish-fish pairs (Ugui Suyaki + Wakasagi Suyaki, etc.)
 *   4. Raw pairs (Amago + Wakasagi, etc.)
 *   5. Solo raw (Koi — no pair defined)
 *   6. Remaining → leftover
 *
 * @param {Array}  inventory  - [{fishId, qty, form: 'raw'|'cooked'}]
 *                              fishId may be a fish id OR a specialItem id
 * @param {object} fishData   - full fish-data.json object
 * @returns {{ cookedSales, rawSales, soloRawSales, leftover, grandTotal }}
 */
function calculateSellPlan(inventory, fishData) {
  const { fish = [], cookedPairs = [], rawPairs = [] } = fishData;

  // ── Build lookup maps ──────────────────────────────────────
  const fishById = {};
  fish.forEach(f => { fishById[f.id] = f; });

  // ── Working inventory copies (mutated during calculation) ──
  const rawQty    = {};  // {fishId: qty}
  const cookedQty = {};  // {fishId: qty}

  for (const item of inventory) {
    const id = item.fishId;
    if (!fishById[id]) continue; // ignore unknown ids
    if (item.form === 'cooked') {
      cookedQty[id] = (cookedQty[id] || 0) + item.qty;
    } else {
      rawQty[id] = (rawQty[id] || 0) + item.qty;
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  // How many of fishId are available for cooking?
  // (raw cookable fish + pre-cooked fish)
  function availableForCooked(fishId) {
    const f = fishById[fishId];
    if (!f) return 0;
    if (!f.cookable) return cookedQty[fishId] || 0;
    return (rawQty[fishId] || 0) + (cookedQty[fishId] || 0);
  }

  // Deduct `count` from cooked pool (prefer cooked stock first, then raw).
  function deductCooked(fishId, count) {
    let remaining = count;
    const fromCooked = Math.min(remaining, cookedQty[fishId] || 0);
    cookedQty[fishId] = (cookedQty[fishId] || 0) - fromCooked;
    remaining -= fromCooked;
    const fromRaw = Math.min(remaining, rawQty[fishId] || 0);
    rawQty[fishId] = (rawQty[fishId] || 0) - fromRaw;
  }

  const cookedSales  = [];
  const rawSales     = [];
  const soloRawSales = [];

  // ── Step 1: Solo cooked (Ito Sashimi, Yakizake) ──────────
  for (const pair of cookedPairs) {
    if (pair.fishIds.length === 1) {
      const fishId = pair.fishIds[0];
      const f = fishById[fishId];
      if (!f) continue;
      const count = availableForCooked(fishId);
      if (count > 0) {
        cookedSales.push({
          pairId:       pair.id,
          count,
          pricePerPair: pair.price,
          totalPrice:   count * pair.price,
          dishes:       [f.cookedDish],
          fish:         [f],
        });
        deductCooked(fishId, count);
      }
    }
  }

  // ── Step 2: Cooked fish-fish pairs ────────────────────────
  for (const pair of cookedPairs) {
    if (pair.fishIds.length < 2) continue;
    const qtys  = pair.fishIds.map(id => availableForCooked(id));
    const count = Math.min(...qtys);
    if (count > 0) {
      const fishInPair = pair.fishIds.map(id => fishById[id]);
      cookedSales.push({
        pairId:       pair.id,
        count,
        pricePerPair: pair.price,
        totalPrice:   count * pair.price,
        dishes:       fishInPair.map(f => f.cookedDish),
        fish:         fishInPair,
      });
      pair.fishIds.forEach(id => deductCooked(id, count));
    }
  }

  // ── Step 4: Raw pairs ─────────────────────────────────────
  for (const pair of rawPairs) {
    const qtys  = pair.fishIds.map(id => rawQty[id] || 0);
    const count = Math.min(...qtys);
    if (count > 0) {
      const fishInPair = pair.fishIds.map(id => fishById[id]);
      rawSales.push({
        pairId:       pair.id,
        count,
        pricePerPair: pair.price,
        totalPrice:   count * pair.price,
        fish:         fishInPair,
      });
      pair.fishIds.forEach(id => { rawQty[id] = (rawQty[id] || 0) - count; });
    }
  }

  // ── Step 5: Solo raw (Koi — rawPairId is null) ────────────
  for (const f of fish) {
    if (f.koi && !f.rawPairId) {
      const qty = rawQty[f.id] || 0;
      if (qty > 0) {
        soloRawSales.push({ fish: f, qty, price: f.rawPrice, totalPrice: qty * f.rawPrice });
        rawQty[f.id] = 0;
      }
    }
  }

  // ── Step 6: Collect leftover ──────────────────────────────
  const leftover = [];

  for (const f of fish) {
    const r = rawQty[f.id] || 0;
    const c = cookedQty[f.id] || 0;
    if (r > 0) leftover.push({ fish: f, qty: r, form: 'raw' });
    if (c > 0) leftover.push({ fish: f, qty: c, form: 'cooked' });
  }

  // ── Grand total ───────────────────────────────────────────
  const grandTotal =
    cookedSales.reduce((s, e) => s + e.totalPrice, 0) +
    rawSales.reduce((s, e) => s + e.totalPrice, 0) +
    soloRawSales.reduce((s, e) => s + e.totalPrice, 0);

  return { cookedSales, rawSales, soloRawSales, leftover, grandTotal };
}

/**
 * Return pairs ranked by sell value for the given season.
 * Pairs where ALL fish are available in season are "ready".
 * Pairs where SOME fish are available are "partial".
 * Pairs where NO fish are available are omitted (koi excluded).
 *
 * @param {string} season
 * @param {object} fishData
 * @returns {Array} ranked pair recommendations
 */
function bestPairsThisSeason(season, fishData) {
  const { fish = [], cookedPairs = [], rawPairs = [] } = fishData;
  const fishById = {};
  fish.forEach(f => { fishById[f.id] = f; });

  const results = [];

  // Cooked pairs
  for (const pair of cookedPairs) {
    const fishInPair = pair.fishIds.map(id => fishById[id]).filter(Boolean);
    // Skip if any fish in pair is a koi
    if (fishInPair.some(f => f.koi)) continue;

    const available = fishInPair.filter(f => fishAvailableInSeason(f, season));
    // Skip if no fish from this pair are available this season
    if (available.length === 0 && !pair.requiresItem) continue;

    results.push({
      pairId:        pair.id,
      type:          'cooked',
      price:         pair.price,
      fish:          fishInPair,
      availableCount: available.length,
      totalInPair:   fishInPair.length,
      allAvailable:  available.length === fishInPair.length,
    });
  }

  // Raw pairs
  for (const pair of rawPairs) {
    const fishInPair = pair.fishIds.map(id => fishById[id]).filter(Boolean);
    if (fishInPair.some(f => f.koi)) continue;

    const available = fishInPair.filter(f => fishAvailableInSeason(f, season));
    if (available.length === 0) continue;

    // Skip raw pair if ALL fish in it have a cooked pair at higher value
    // (we'll show the cooked pair instead)
    const allHaveCookedPair = fishInPair.every(f => f.cookedPairId);
    if (allHaveCookedPair) {
      // Only include raw pair if price is meaningfully different from cooked
      // (i.e., when the cooked pair partner is seasonal and may be unavailable)
      const cookedPairPrices = fishInPair.map(f => {
        const cp = cookedPairs.find(p => p.id === f.cookedPairId);
        return cp ? cp.price : 0;
      });
      const maxCookedPrice = Math.max(...cookedPairPrices);
      if (maxCookedPrice >= pair.price) continue; // cooked is always better
    }

    results.push({
      pairId:        pair.id,
      type:          'raw',
      price:         pair.price,
      fish:          fishInPair,
      availableCount: available.length,
      totalInPair:   fishInPair.length,
      allAvailable:  available.length === fishInPair.length,
    });
  }

  // Sort: all-available pairs first, then by price desc
  results.sort((a, b) => {
    if (b.allAvailable !== a.allAvailable) return b.allAvailable - a.allAvailable;
    return b.price - a.price;
  });

  return results;
}

/**
 * Returns the highest-value pair option for a fish regardless of form.
 * Used to show the best sell option in leftover + better-pairings UI.
 *
 * @param {object} fish     - fish entry
 * @param {object} fishData - full fish-data.json object
 * @returns {{ pair, type: 'cooked'|'raw', price } | null}
 */
function getBestPairForFish(fish, fishData) {
  const { cookedPairs = [], rawPairs = [] } = fishData;
  const cp = fish.cookedPairId ? cookedPairs.find(p => p.id === fish.cookedPairId) : null;
  const rp = fish.rawPairId    ? rawPairs.find(p => p.id === fish.rawPairId)       : null;
  if (!cp && !rp) return null;
  if (!cp) return { pair: rp, type: 'raw',    price: rp.price };
  if (!rp) return { pair: cp, type: 'cooked', price: cp.price };
  return cp.price >= rp.price
    ? { pair: cp, type: 'cooked', price: cp.price }
    : { pair: rp, type: 'raw',    price: rp.price };
}

/**
 * For each leftover item, find what needs to be caught (or obtained) to complete
 * its best-value pair, and whether that partner is catchable this season.
 *
 * @param {Array}  leftover  - from calculateSellPlan().leftover
 * @param {string} season
 * @param {object} fishData
 * @returns {Array} [{
 *   haveItem:     { fish, qty, form } | { specialItem, qty },
 *   bestPair:     { pair, type, price },
 *   needed:       [{ fish, catchableNow, locations, seasons }],
 *   requiresItem: { id, name } | null,
 * }]
 */
function getLeftoverCatchOpportunities(leftover, season, fishData) {
  const { fish: allFish = [], cookedPairs = [], rawPairs = [] } = fishData;
  const fishById = {};
  allFish.forEach(f => { fishById[f.id] = f; });

  const results = [];

  for (const lo of leftover) {
    const fish = lo.fish;
    if (!fish) continue;

    const pairings = [];

    // Helper: build needed-partners array for a pair definition
    function buildNeeded(pair) {
      return pair.fishIds
        .filter(id => id !== fish.id)
        .map(id => {
          const pf = fishById[id];
          if (!pf) return null;
          return {
            fish:         pf,
            catchableNow: fishAvailableInSeason(pf, season),
            locations:    pf.location,
            seasons:      pf.seasons,
          };
        })
        .filter(Boolean);
    }

    // Cooked pair option (skip solo-cooked — no partners to catch)
    if (fish.cookedPairId) {
      const cp = cookedPairs.find(p => p.id === fish.cookedPairId);
      if (cp) {
        const needed = buildNeeded(cp);
        if (needed.length > 0) {
          pairings.push({ pair: cp, type: 'cooked', price: cp.price, needed });
        }
      }
    }

    // Raw pair option
    if (fish.rawPairId) {
      const rp = rawPairs.find(p => p.id === fish.rawPairId);
      if (rp) {
        pairings.push({ pair: rp, type: 'raw', price: rp.price, needed: buildNeeded(rp) });
      }
    }

    if (pairings.length === 0) continue;

    // Sort by price desc so pairings[0] is always the best option
    pairings.sort((a, b) => b.price - a.price);

    results.push({ haveItem: lo, pairings });
  }

  return results;
}

/**
 * For each distinct fish in inventory that has BOTH a cooked pair AND a raw pair,
 * return all pairing options sorted by price desc. This powers the "Better Pairings"
 * section showing that e.g. Wakasagi cooked with Ugui (¥100) beats raw with Amago (¥60).
 *
 * @param {Array}  inventory - [{fishId, qty, form}]
 * @param {object} fishData
 * @returns {Array} [{
 *   fish,
 *   qty,
 *   pairings: [{ type, pair, price, partners: [fish], requiresItem: {id,name}|null }],
 * }]
 */
function getBetterPairings(inventory, fishData) {
  const { fish: allFish = [], cookedPairs = [], rawPairs = [] } = fishData;
  const fishById = {};
  allFish.forEach(f => { fishById[f.id] = f; });

  const results = [];
  const seen    = new Set();

  for (const item of inventory) {
    const fishId = item.fishId;
    if (seen.has(fishId)) continue;

    const fish = fishById[fishId];
    if (!fish || fish.koi) continue;

    // Only include fish that have BOTH a cooked pair AND a raw pair
    if (!fish.cookedPairId || !fish.rawPairId) continue;

    seen.add(fishId);

    const cp = cookedPairs.find(p => p.id === fish.cookedPairId);
    const rp = rawPairs.find(p => p.id === fish.rawPairId);
    if (!cp || !rp) continue;

    const pairings = [];

    // Cooked pairing
    const cookedPartners = cp.fishIds
      .filter(id => id !== fish.id)
      .map(id => fishById[id])
      .filter(Boolean);
    pairings.push({ type: 'cooked', pair: cp, price: cp.price, partners: cookedPartners });

    // Raw pairing
    const rawPartners = rp.fishIds
      .filter(id => id !== fish.id)
      .map(id => fishById[id])
      .filter(Boolean);
    pairings.push({ type: 'raw', pair: rp, price: rp.price, partners: rawPartners });

    // Sort by price desc
    pairings.sort((a, b) => b.price - a.price);

    // Total qty of this fish across all inventory entries
    const qty = inventory.filter(i => i.fishId === fishId).reduce((s, i) => s + i.qty, 0);

    results.push({ fish, qty, pairings });
  }

  // Sort by best pairing value desc
  results.sort((a, b) => b.pairings[0].price - a.pairings[0].price);
  return results;
}

// ── Node.js compat ───────────────────���─────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    calculateSellPlan,
    bestPairsThisSeason,
    fishAvailableInSeason,
    getBestPairForFish,
    getLeftoverCatchOpportunities,
    getBetterPairings,
  };
}
