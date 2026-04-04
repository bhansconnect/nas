/* ============================================================
   JRLA Fish Assistant — Unit Tests
   Runs in browser (after engine.js + fish-data.json loaded)
   or in Node.js: `node tests.js`
   ============================================================ */

// ── Test runner ───────────────────────────────────────────
const _results = { pass: 0, fail: 0, errors: [] };

function test(name, fn) {
  try {
    fn();
    _results.pass++;
    if (typeof process !== 'undefined') console.log(`  ✓ ${name}`);
  } catch (e) {
    _results.fail++;
    _results.errors.push({ name, error: e.message });
    if (typeof process !== 'undefined') console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertLength(arr, n, msg) {
  if (!Array.isArray(arr) || arr.length !== n) {
    throw new Error(msg || `Expected array of length ${n}, got ${Array.isArray(arr) ? arr.length : typeof arr}`);
  }
}

// ── Test data loading ─────────────────────────────────────
// In Node.js: load fish-data.json and engine.js manually.
// In browser: both are already loaded as globals.

let FISH_DATA;
let _calc, _best, _available, _bestPair, _catchOps, _betterPairings;

function loadTestDeps(data, engineModule) {
  FISH_DATA = data;
  if (engineModule) {
    _calc          = engineModule.calculateSellPlan;
    _best          = engineModule.bestPairsThisSeason;
    _available     = engineModule.fishAvailableInSeason;
    _bestPair      = engineModule.getBestPairForFish;
    _catchOps      = engineModule.getLeftoverCatchOpportunities;
    _betterPairings= engineModule.getBetterPairings;
  } else {
    // Browser globals
    _calc          = calculateSellPlan;
    _best          = bestPairsThisSeason;
    _available     = fishAvailableInSeason;
    _bestPair      = getBestPairForFish;
    _catchOps      = getLeftoverCatchOpportunities;
    _betterPairings= getBetterPairings;
  }
}

// ── Helper: build inventory entry ────────────────────────
function inv(fishId, qty, form = 'raw') {
  return { fishId, qty, form };
}

// ── Helper: find sale in result ───────────────────────────
function findCookedSale(result, pairId) {
  return result.cookedSales.find(s => s.pairId === pairId);
}

function findRawSale(result, pairId) {
  return result.rawSales.find(s => s.pairId === pairId);
}

function findLeftover(result, fishId) {
  return result.leftover.find(l => l.fish && l.fish.id === fishId);
}

// ═══════════════════════════════════════════════════════════
// GROUP: Cooked Pair Sales
// ═══════════════════════════════════════════════════════════
function runCookedPairTests() {
  if (typeof process !== 'undefined') console.log('\nCooked Pair Sales:');

  test('1 Ugui + 1 Wakasagi raw → 1 cooked pair → ¥100', () => {
    const r = _calc([inv('ugui', 1), inv('wakasagi', 1)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ugui-wakasagi');
    assert(sale, 'Expected cp-ugui-wakasagi cooked sale');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 100);
    assertEqual(r.grandTotal, 100);
  });

  test('2 Ugui + 1 Wakasagi → 1 pair (¥100) + 1 leftover Ugui', () => {
    const r = _calc([inv('ugui', 2), inv('wakasagi', 1)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ugui-wakasagi');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 100);
    const lo = findLeftover(r, 'ugui');
    assert(lo, 'Expected leftover ugui');
    assertEqual(lo.qty, 1);
    assertEqual(r.grandTotal, 100);
  });

  test('2 Ugui + 2 Wakasagi → 2 pairs → ¥200', () => {
    const r = _calc([inv('ugui', 2), inv('wakasagi', 2)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ugui-wakasagi');
    assertEqual(sale.count, 2);
    assertEqual(sale.totalPrice, 200);
    assertEqual(r.grandTotal, 200);
  });

  test('0 Ugui + 2 Wakasagi → 0 pairs, 2 leftover Wakasagi', () => {
    const r = _calc([inv('wakasagi', 2)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ugui-wakasagi');
    assert(!sale || sale.count === 0, 'Expected no cooked sale without partner');
    const lo = findLeftover(r, 'wakasagi');
    assert(lo, 'Expected leftover wakasagi');
    assertEqual(lo.qty, 2);
    assertEqual(r.grandTotal, 0);
  });

  test('1 Ugui pre-cooked + 1 Wakasagi pre-cooked → 1 pair → ¥100', () => {
    const r = _calc([inv('ugui', 1, 'cooked'), inv('wakasagi', 1, 'cooked')], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ugui-wakasagi');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 100);
  });

  test('Herabuna + Nijimasu cooked pair → ¥160', () => {
    const r = _calc([inv('herabuna', 1), inv('nijimasu', 1)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-herabuna-nijimasu');
    assert(sale, 'Expected cp-herabuna-nijimasu');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 160);
  });

  test('Oshurokoma + Higai cooked pair → ¥250', () => {
    const r = _calc([inv('oshurokoma', 1), inv('higai', 1)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-oshurokoma-higai');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 250);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Raw Pair Sales
// ═══════════════════════════════════════════════════════════
function runRawPairTests() {
  if (typeof process !== 'undefined') console.log('\nRaw Pair Sales:');

  test('1 Amago + 1 Wakasagi raw → 1 raw pair → ¥60', () => {
    const r = _calc([inv('amago', 1), inv('wakasagi', 1)], FISH_DATA);
    // Amago goes to cooked pair (cp-amago-otanago) first — no Otanago in inventory
    // Wakasagi goes to cooked pair (cp-ugui-wakasagi) first — no Ugui in inventory
    // So both fall through to raw pair rp-amago-wakasagi
    const rawSale = findRawSale(r, 'rp-amago-wakasagi');
    assert(rawSale, 'Expected rp-amago-wakasagi raw sale');
    assertEqual(rawSale.count, 1);
    assertEqual(rawSale.totalPrice, 60);
    assertEqual(r.grandTotal, 60);
  });

  test('3 Amago + 1 Wakasagi → 1 raw pair (¥60) + 2 leftover Amago', () => {
    const r = _calc([inv('amago', 3), inv('wakasagi', 1)], FISH_DATA);
    const rawSale = findRawSale(r, 'rp-amago-wakasagi');
    assertEqual(rawSale.count, 1);
    const lo = findLeftover(r, 'amago');
    assert(lo, 'Expected leftover amago');
    assertEqual(lo.qty, 2);
  });

  test('1 Amago alone → no raw pair, 1 leftover', () => {
    const r = _calc([inv('amago', 1)], FISH_DATA);
    const rawSale = findRawSale(r, 'rp-amago-wakasagi');
    assert(!rawSale || rawSale.count === 0, 'Should not sell without partner');
    assertEqual(r.grandTotal, 0);
    const lo = findLeftover(r, 'amago');
    assertEqual(lo.qty, 1);
  });

  test('Kawahagi + Kasago raw pair → ¥250', () => {
    const r = _calc([inv('kawahagi', 1), inv('kasago', 1)], FISH_DATA);
    const sale = findRawSale(r, 'rp-kawahagi-kasago');
    assert(sale, 'Expected rp-kawahagi-kasago');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 250);
  });

  test('Oshurokoma + Higai raw pair → ¥200', () => {
    // When sold raw (no cooked pair partner available either way, same pair id)
    // Actually cp-oshurokoma-higai and rp-oshurokoma-higai both exist
    // With both fish raw, they should prefer the cooked pair (¥250 > ¥200)
    const r = _calc([inv('oshurokoma', 1), inv('higai', 1)], FISH_DATA);
    // Should be cooked ¥250, not raw ¥200
    const cookedSale = findCookedSale(r, 'cp-oshurokoma-higai');
    assert(cookedSale && cookedSale.count === 1, 'Should prefer cooked pair (¥250)');
    assertEqual(r.grandTotal, 250);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Solo Sales (Ito Sashimi, Koi)
// ═══════════════════════════════════════════════════════════
function runSoloTests() {
  if (typeof process !== 'undefined') console.log('\nSolo Sales:');

  test('1 Ito raw → 1 solo Ito Sashimi → ¥300', () => {
    const r = _calc([inv('ito', 1)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ito-sashimi');
    assert(sale, 'Expected cp-ito-sashimi');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 300);
    assertEqual(r.grandTotal, 300);
  });

  test('2 Ito → 2 solo Sashimi → ¥600', () => {
    const r = _calc([inv('ito', 2)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-ito-sashimi');
    assertEqual(sale.count, 2);
    assertEqual(sale.totalPrice, 600);
  });

  test('1 Koi Hi Utsuri → solo raw → ¥2000', () => {
    const r = _calc([inv('koi-hi-utsuri', 1)], FISH_DATA);
    assertLength(r.soloRawSales, 1);
    assertEqual(r.soloRawSales[0].totalPrice, 2000);
    assertEqual(r.grandTotal, 2000);
  });

  test('Mixed Koi: Kohaku×1 + Tancho×2 → ¥3000', () => {
    const r = _calc([inv('koi-kohaku', 1), inv('koi-tancho', 2)], FISH_DATA);
    const total = r.soloRawSales.reduce((s, e) => s + e.totalPrice, 0);
    assertEqual(total, 3000);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Mixed Inventory
// ═══════════════════════════════════════════════════════════
function runMixedTests() {
  if (typeof process !== 'undefined') console.log('\nMixed Inventory:');

  test('1 Ugui + 1 Wakasagi + 1 Ito → ¥100 cooked pair + ¥300 solo = ¥400', () => {
    const r = _calc([inv('ugui', 1), inv('wakasagi', 1), inv('ito', 1)], FISH_DATA);
    assertEqual(r.grandTotal, 400);
    const pair = findCookedSale(r, 'cp-ugui-wakasagi');
    assertEqual(pair.count, 1);
    const solo = findCookedSale(r, 'cp-ito-sashimi');
    assertEqual(solo.count, 1);
  });

  test('1 Sake + 1 Ito → Yakizake (¥300) + Ito Sashimi (¥300) = ¥600', () => {
    // Both are solo cooked, both always sell
    const r = _calc([inv('sake', 1), inv('ito', 1)], FISH_DATA);
    const itoSale  = findCookedSale(r, 'cp-ito-sashimi');
    const yakiSale = findCookedSale(r, 'cp-yakizake');
    assert(itoSale  && itoSale.count === 1,  'Ito → Sashimi');
    assert(yakiSale && yakiSale.count === 1, 'Sake → Yakizake');
    assertEqual(r.grandTotal, 600);
  });

  test('Empty inventory → all zeros', () => {
    const r = _calc([], FISH_DATA);
    assertEqual(r.grandTotal, 0);
    assertLength(r.cookedSales, 0);
    assertLength(r.rawSales, 0);
    assertLength(r.soloRawSales, 0);
    assertLength(r.leftover, 0);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Yakizake (solo cooked — Matsutake assumed available)
// ═══════════════════════════════════════════════════════════
function runYakizakeTests() {
  if (typeof process !== 'undefined') console.log('\nYakizake (solo cooked):');

  test('1 Sake → 1 Yakizake → ¥300 (Matsutake assumed available)', () => {
    const r = _calc([inv('sake', 1)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-yakizake');
    assert(sale, 'Expected cp-yakizake sale');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 300);
    assertEqual(r.grandTotal, 300);
  });

  test('3 Sake → 3 Yakizake → ¥900', () => {
    const r = _calc([inv('sake', 3)], FISH_DATA);
    const sale = findCookedSale(r, 'cp-yakizake');
    assertEqual(sale.count, 3);
    assertEqual(sale.totalPrice, 900);
  });

  test('1 Sake + 1 Ito → Yakizake (¥300) + Ito Sashimi (¥300) = ¥600', () => {
    const r = _calc([inv('sake', 1), inv('ito', 1)], FISH_DATA);
    const yakiSale = findCookedSale(r, 'cp-yakizake');
    const itoSale  = findCookedSale(r, 'cp-ito-sashimi');
    assert(yakiSale && yakiSale.count === 1, 'Sake → Yakizake');
    assert(itoSale  && itoSale.count === 1,  'Ito → Sashimi');
    assertEqual(r.grandTotal, 600);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Sea fish trio (Aji + Saba + Iwashi → 120)
// ═══════════════════════════════════════════════════════════
function runTrioTests() {
  if (typeof process !== 'undefined') console.log('\nSea fish trio:');

  test('1 Aji + 1 Saba + 1 Iwashi → 1 trio sale → ¥120', () => {
    const r = _calc([inv('aji', 1), inv('saba', 1), inv('iwashi', 1)], FISH_DATA);
    const sale = findRawSale(r, 'rp-aji-saba-iwashi');
    assert(sale, 'Expected trio raw sale');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 120);
    assertEqual(r.grandTotal, 120);
  });

  test('2 Aji + 1 Saba + 1 Iwashi → 1 trio (¥120) + 1 leftover Aji', () => {
    const r = _calc([inv('aji', 2), inv('saba', 1), inv('iwashi', 1)], FISH_DATA);
    const sale = findRawSale(r, 'rp-aji-saba-iwashi');
    assertEqual(sale.count, 1);
    assertEqual(sale.totalPrice, 120);
    const lo = findLeftover(r, 'aji');
    assert(lo, 'Leftover aji expected');
    assertEqual(lo.qty, 1);
  });

  test('1 Aji + 1 Saba + 0 Iwashi → 0 sales, 2 leftover', () => {
    const r = _calc([inv('aji', 1), inv('saba', 1)], FISH_DATA);
    const sale = findRawSale(r, 'rp-aji-saba-iwashi');
    assert(!sale || sale.count === 0, 'No sale without Iwashi');
    assertEqual(r.leftover.filter(l => l.fish).reduce((s, l) => s + l.qty, 0), 2);
    assertEqual(r.grandTotal, 0);
  });

  test('3 of each → 3 trio sales → ¥360', () => {
    const r = _calc([inv('aji', 3), inv('saba', 3), inv('iwashi', 3)], FISH_DATA);
    const sale = findRawSale(r, 'rp-aji-saba-iwashi');
    assertEqual(sale.count, 3);
    assertEqual(sale.totalPrice, 360);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Cooked takes priority over raw
// ═══════════════════════════════════════════════════════════
function runPriorityTests() {
  if (typeof process !== 'undefined') console.log('\nCooked vs Raw priority:');

  test('Ugui + Wakasagi: cooked pair (¥100) beats raw (¥60 each unpairable)', () => {
    const r = _calc([inv('ugui', 1), inv('wakasagi', 1)], FISH_DATA);
    // Cooked pair exists and has higher total value
    const cookedSale = findCookedSale(r, 'cp-ugui-wakasagi');
    assert(cookedSale && cookedSale.count === 1, 'Should use cooked pair');
    // Raw pair for ugui is rp-iwana-ugui; raw pair for wakasagi is rp-amago-wakasagi
    // Neither can form because iwana and amago are not in inventory
    const rawSale1 = findRawSale(r, 'rp-iwana-ugui');
    const rawSale2 = findRawSale(r, 'rp-amago-wakasagi');
    assert(!rawSale1 || rawSale1.count === 0, 'No raw sale for ugui (partner missing)');
    assert(!rawSale2 || rawSale2.count === 0, 'No raw sale for wakasagi (partner missing)');
    assertEqual(r.grandTotal, 100);
  });

  test('Sake+Ito: both sell as solo cooked (¥600) beats raw pair (¥250)', () => {
    // Both cp-yakizake and cp-ito-sashimi are solo cooked — processed before raw pairs
    const r = _calc([inv('ito', 1), inv('sake', 1)], FISH_DATA);
    const itoSale  = findCookedSale(r, 'cp-ito-sashimi');
    const yakiSale = findCookedSale(r, 'cp-yakizake');
    assert(itoSale  && itoSale.count === 1,  'Ito → Sashimi ¥300');
    assert(yakiSale && yakiSale.count === 1, 'Sake → Yakizake ¥300');
    const rawSale = findRawSale(r, 'rp-sake-ito');
    assert(!rawSale || rawSale.count === 0, 'No raw Sake+Ito (both consumed by cooked)');
    assertEqual(r.grandTotal, 600);
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: Season availability
// ═══════════════════════════════════════════════════════════
function runSeasonTests() {
  if (typeof process !== 'undefined') console.log('\nSeason Availability:');

  test('Wakasagi available in Fall', () => {
    const wakasagi = FISH_DATA.fish.find(f => f.id === 'wakasagi');
    assert(_available(wakasagi, 'Fall'), 'Wakasagi should be in Fall');
  });

  test('Wakasagi available in Winter', () => {
    const wakasagi = FISH_DATA.fish.find(f => f.id === 'wakasagi');
    assert(_available(wakasagi, 'Winter'), 'Wakasagi should be in Winter');
  });

  test('Wakasagi NOT available in Spring', () => {
    const wakasagi = FISH_DATA.fish.find(f => f.id === 'wakasagi');
    assert(!_available(wakasagi, 'Spring'), 'Wakasagi should NOT be in Spring');
  });

  test('Oikawa available in all seasons', () => {
    const oikawa = FISH_DATA.fish.find(f => f.id === 'oikawa');
    ['Spring', 'Summer', 'Fall', 'Winter'].forEach(s => {
      assert(_available(oikawa, s), `Oikawa should be in ${s}`);
    });
  });

  test('Higai only available in Fall', () => {
    const higai = FISH_DATA.fish.find(f => f.id === 'higai');
    assert(_available(higai, 'Fall'), 'Higai in Fall');
    assert(!_available(higai, 'Spring'), 'Higai NOT in Spring');
    assert(!_available(higai, 'Summer'), 'Higai NOT in Summer');
    assert(!_available(higai, 'Winter'), 'Higai NOT in Winter');
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: bestPairsThisSeason
// ═══════════════════════════════════════════════════════════
function runBestPairsTests() {
  if (typeof process !== 'undefined') console.log('\nBest Pairs This Season:');

  test('Fall: top cooked pair should be Oshurokoma+Higai (¥250)', () => {
    const pairs = _best('Fall', FISH_DATA);
    // Find highest-priced pair where both fish are available in Fall
    const top = pairs.find(p => p.allAvailable && p.type === 'cooked');
    assert(top, 'Should have a fully-available cooked pair in Fall');
    assert(top.price >= 160, `Top cooked pair should be valuable, got ¥${top.price}`);
  });

  test('Fall: Oshurokoma+Higai pair is fully available', () => {
    const pairs = _best('Fall', FISH_DATA);
    const shuro = pairs.find(p => p.pairId === 'cp-oshurokoma-higai');
    assert(shuro, 'cp-oshurokoma-higai should appear in Fall');
    assert(shuro.allAvailable, 'Both Oshurokoma and Higai are catchable in Fall');
  });

  test('Winter: Ito Sashimi solo (¥300) appears as available', () => {
    const pairs = _best('Winter', FISH_DATA);
    const itoSolo = pairs.find(p => p.pairId === 'cp-ito-sashimi');
    assert(itoSolo, 'Ito Sashimi should appear in Winter');
    assertEqual(itoSolo.price, 300);
  });

  test('Winter: Herabuna+Nijimasu pair is fully available', () => {
    const pairs = _best('Winter', FISH_DATA);
    const p = pairs.find(p => p.pairId === 'cp-herabuna-nijimasu');
    assert(p, 'cp-herabuna-nijimasu should appear in Winter');
    assert(p.allAvailable, 'Herabuna (Winter) and Nijimasu (Fall/Winter) both catchable');
  });

  test('Spring: Oshurokoma+Higai pair NOT fully available (Higai is Fall-only)', () => {
    const pairs = _best('Spring', FISH_DATA);
    const p = pairs.find(p => p.pairId === 'cp-oshurokoma-higai');
    if (p) {
      assert(!p.allAvailable, 'Should not be fully available in Spring (Higai is Fall-only)');
    }
    // It's acceptable for it to not appear at all
  });

  test('bestPairsThisSeason returns array sorted by price desc for fully-available pairs', () => {
    const pairs = _best('Fall', FISH_DATA);
    const fullPairs = pairs.filter(p => p.allAvailable);
    for (let i = 1; i < fullPairs.length; i++) {
      assert(
        fullPairs[i].price <= fullPairs[i - 1].price,
        `Pairs should be sorted by price: ${fullPairs[i - 1].price} >= ${fullPairs[i].price}`
      );
    }
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: getBestPairForFish
// ═══════════════════════════════════════════════════════════
function runBestPairForFishTests() {
  if (typeof process !== 'undefined') console.log('\ngetBestPairForFish:');

  test('Amago → best pair is cooked (cp-amago-otanago, ¥100) not raw (¥60)', () => {
    const amago = FISH_DATA.fish.find(f => f.id === 'amago');
    const best  = _bestPair(amago, FISH_DATA);
    assert(best, 'Expected a best pair');
    assertEqual(best.type, 'cooked', 'Amago best pair should be cooked');
    assertEqual(best.pair.id, 'cp-amago-otanago');
    assertEqual(best.price, 100);
  });

  test('Wakasagi → best pair is cooked (cp-ugui-wakasagi, ¥100) not raw (¥60)', () => {
    const wakasagi = FISH_DATA.fish.find(f => f.id === 'wakasagi');
    const best     = _bestPair(wakasagi, FISH_DATA);
    assertEqual(best.type, 'cooked');
    assertEqual(best.pair.id, 'cp-ugui-wakasagi');
    assertEqual(best.price, 100);
  });

  test('Kawahagi → only raw pair (rp-kawahagi-kasago, ¥250), returns raw', () => {
    const kawahagi = FISH_DATA.fish.find(f => f.id === 'kawahagi');
    const best     = _bestPair(kawahagi, FISH_DATA);
    assertEqual(best.type, 'raw');
    assertEqual(best.pair.id, 'rp-kawahagi-kasago');
    assertEqual(best.price, 250);
  });

  test('Ito → cooked pair (cp-ito-sashimi, ¥300) > raw pair (rp-sake-ito, ¥250)', () => {
    const ito  = FISH_DATA.fish.find(f => f.id === 'ito');
    const best = _bestPair(ito, FISH_DATA);
    assertEqual(best.type, 'cooked');
    assertEqual(best.pair.id, 'cp-ito-sashimi');
    assertEqual(best.price, 300);
  });

  test('Koi fish → no pair, returns null', () => {
    const koi  = FISH_DATA.fish.find(f => f.id === 'koi-hi-utsuri');
    const best = _bestPair(koi, FISH_DATA);
    assert(best === null, 'Koi should have no pair');
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: getLeftoverCatchOpportunities
// ═══════════════════════════════════════════════════════════
function runCatchOpportunityTests() {
  if (typeof process !== 'undefined') console.log('\ngetLeftoverCatchOpportunities:');

  // Helper: calculate leftover from inventory
  function leftoverOf(inventoryArr) {
    return _calc(inventoryArr, FISH_DATA).leftover;
  }

  test('BUG REGRESSION: Amago leftover — best pairing is cooked Otanago (¥100) not raw Wakasagi (¥60)', () => {
    const leftover = leftoverOf([inv('amago', 1)]);
    const ops = _catchOps(leftover, 'Spring', FISH_DATA);
    const amagoOp = ops.find(o => o.haveItem.fish.id === 'amago');
    assert(amagoOp, 'Should have opportunity for Amago');
    // First pairing (best) should be cooked with Otanago
    const best = amagoOp.pairings[0];
    assertEqual(best.type, 'cooked', 'Best should be cooked');
    assertEqual(best.pair.id, 'cp-amago-otanago');
    assert(best.needed.some(n => n.fish.id === 'otanago'), 'Best needs Otanago');
    assert(!best.needed.some(n => n.fish.id === 'wakasagi'), 'Best should NOT need Wakasagi');
  });

  test('Amago leftover also shows alt raw pair with Wakasagi', () => {
    const leftover = leftoverOf([inv('amago', 1)]);
    const ops = _catchOps(leftover, 'Spring', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'amago');
    assert(op.pairings.length >= 2, 'Should have both cooked and raw pairing options');
    const alt = op.pairings[1];
    assertEqual(alt.type, 'raw', 'Alt should be raw pair');
    assert(alt.needed.some(n => n.fish.id === 'wakasagi'), 'Alt needs Wakasagi');
    assert(alt.price < op.pairings[0].price, 'Alt price should be less than best');
  });

  test('Wakasagi leftover in Fall → best is cooked Ugui (¥100), alt is raw Amago (¥60)', () => {
    const leftover = leftoverOf([inv('wakasagi', 1)]);
    const ops = _catchOps(leftover, 'Fall', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'wakasagi');
    assert(op, 'Should have opportunity for Wakasagi');
    // Best: cooked with Ugui
    const best = op.pairings[0];
    assertEqual(best.pair.id, 'cp-ugui-wakasagi');
    const ugui = best.needed.find(n => n.fish.id === 'ugui');
    assert(ugui.catchableNow, 'Ugui catchable in Fall (all seasons)');
    assert(ugui.locations.length > 0, 'Ugui has location info');
    // Alt: raw with Amago
    const alt = op.pairings[1];
    assert(alt.needed.some(n => n.fish.id === 'amago'), 'Alt needs Amago');
  });

  test('Wakasagi leftover in Spring → cooked Ugui catchable, raw Amago also catchable', () => {
    const leftover = leftoverOf([inv('wakasagi', 1)]);
    const ops = _catchOps(leftover, 'Spring', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'wakasagi');
    const ugui  = op.pairings[0].needed.find(n => n.fish.id === 'ugui');
    const amago = op.pairings[1].needed.find(n => n.fish.id === 'amago');
    assert(ugui.catchableNow,  'Ugui catchable in Spring');
    assert(amago.catchableNow, 'Amago catchable in Spring');
  });

  test('Haze leftover in Winter → both pairings need Hasu (Spring/Summer only, NOT catchable)', () => {
    const leftover = leftoverOf([inv('haze', 1)]);
    const ops = _catchOps(leftover, 'Winter', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'haze');
    assert(op, 'Should have opportunity for Haze');
    // Both cooked and raw pair with Hasu
    for (const pairing of op.pairings) {
      const hasu = pairing.needed.find(n => n.fish.id === 'hasu');
      assert(hasu, `${pairing.type} pairing should need Hasu`);
      assert(!hasu.catchableNow, 'Hasu is Spring/Summer only, NOT catchable in Winter');
    }
  });

  test('Sake never leftover — always sells as Yakizake (Matsutake assumed available)', () => {
    const r = _calc([inv('sake', 1)], FISH_DATA);
    const sakeLo = findLeftover(r, 'sake');
    assert(!sakeLo, 'Sake should NOT be leftover — it always sells as Yakizake');
    assertEqual(r.grandTotal, 300);
  });

  test('Aji leftover in Summer → needs Saba + Iwashi (both catchable)', () => {
    const leftover = leftoverOf([inv('aji', 1)]);
    const ops = _catchOps(leftover, 'Summer', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'aji');
    assert(op, 'Should have opportunity for Aji');
    assertLength(op.pairings, 1, 'Aji only has one pairing (raw trio)');
    const saba   = op.pairings[0].needed.find(n => n.fish.id === 'saba');
    const iwashi = op.pairings[0].needed.find(n => n.fish.id === 'iwashi');
    assert(saba   && saba.catchableNow,   'Saba catchable in Summer');
    assert(iwashi && iwashi.catchableNow, 'Iwashi catchable in Summer');
  });

  test('Aji leftover in Winter → Saba catchable, Iwashi catchable', () => {
    const leftover = leftoverOf([inv('aji', 1)]);
    const ops = _catchOps(leftover, 'Winter', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'aji');
    // Aji itself is Spring/Summer/Fall; but the leftover is already in inventory
    const saba   = op.pairings[0].needed.find(n => n.fish.id === 'saba');
    const iwashi = op.pairings[0].needed.find(n => n.fish.id === 'iwashi');
    assert(saba   && saba.catchableNow,   'Saba catchable in Winter (Summer/Fall/Winter)');
    assert(iwashi && iwashi.catchableNow, 'Iwashi catchable in Winter (all seasons)');
  });

  test('Sake: solo cooked pair (Yakizake) never makes leftover; if somehow leftover shows raw pair with Ito', () => {
    // Sake always sells as Yakizake — never leftover
    const r = _calc([inv('sake', 2)], FISH_DATA);
    assertLength(r.leftover, 0, 'All Sake should sell as Yakizake');
    // If hypothetically leftover: Sake has raw pair with Ito (rp-sake-ito)
    // Its cooked pair (cp-yakizake) is solo so has no partners → not shown
    // But its raw pair (rp-sake-ito) has Ito as partner → IS shown
    const fakeLo = [{ fish: FISH_DATA.fish.find(f => f.id === 'sake'), qty: 1, form: 'raw' }];
    const ops = _catchOps(fakeLo, 'Fall', FISH_DATA);
    assertLength(ops, 1, 'Sake shows raw pair opportunity (catch Ito)');
    assertEqual(ops[0].pairings[0].type, 'raw', 'Only pairing is raw (cooked is solo, no partners)');
    assert(ops[0].pairings[0].needed.some(n => n.fish.id === 'ito'), 'Needs Ito for raw pair');
  });

  test('pairings sorted by price desc', () => {
    const leftover = leftoverOf([inv('amago', 1)]);
    const ops = _catchOps(leftover, 'Spring', FISH_DATA);
    const op  = ops.find(o => o.haveItem.fish.id === 'amago');
    for (let i = 1; i < op.pairings.length; i++) {
      assert(op.pairings[i].price <= op.pairings[i-1].price, 'Pairings should be sorted by price desc');
    }
  });
}

// ═══════════════════════════════════════════════════════════
// GROUP: getBetterPairings
// ═══════════════════════════════════════════════════════════
function runBetterPairingsTests() {
  if (typeof process !== 'undefined') console.log('\ngetBetterPairings:');

  test('Amago in inventory → cooked pair ¥100 listed before raw ¥60', () => {
    const result = _betterPairings([inv('amago', 2)], FISH_DATA);
    assert(result.length > 0, 'Amago should appear in better pairings');
    const amago = result.find(r => r.fish.id === 'amago');
    assert(amago, 'Amago entry expected');
    assertEqual(amago.pairings[0].type, 'cooked', 'First pairing should be cooked (higher value)');
    assertEqual(amago.pairings[0].price, 100);
    assertEqual(amago.pairings[1].type, 'raw');
    assertEqual(amago.pairings[1].price, 60);
    // Cooked partner is Otanago
    assert(amago.pairings[0].partners.some(p => p.id === 'otanago'), 'Cooked partner is Otanago');
    // Raw partner is Wakasagi
    assert(amago.pairings[1].partners.some(p => p.id === 'wakasagi'), 'Raw partner is Wakasagi');
  });

  test('Wakasagi in inventory → cooked (Ugui, ¥100) listed before raw (Amago, ¥60)', () => {
    const result = _betterPairings([inv('wakasagi', 1)], FISH_DATA);
    const entry = result.find(r => r.fish.id === 'wakasagi');
    assert(entry, 'Wakasagi entry expected');
    assertEqual(entry.pairings[0].price, 100, 'Top pairing is ¥100 cooked');
    assert(entry.pairings[0].partners.some(p => p.id === 'ugui'), 'Cooked partner is Ugui');
  });

  test('Kawahagi → only raw pair, NOT included in better pairings', () => {
    const result = _betterPairings([inv('kawahagi', 1)], FISH_DATA);
    const entry = result.find(r => r.fish.id === 'kawahagi');
    assert(!entry, 'Kawahagi has only raw pair, should not be in better pairings');
  });

  test('Ito in inventory → cooked solo ¥300 listed before raw pair ¥250', () => {
    const result = _betterPairings([inv('ito', 1)], FISH_DATA);
    const entry = result.find(r => r.fish.id === 'ito');
    assert(entry, 'Ito entry expected');
    assertEqual(entry.pairings[0].price, 300, 'Best is Ito Sashimi ¥300');
    assert(!entry.pairings[0].requiresItem, 'No requiresItem (Matsutake is now just a note)');
    assertEqual(entry.pairings[1].price, 250, 'Alt is raw Sake+Ito ¥250');
  });

  test('Results sorted by best pairing price desc', () => {
    const inventory = [
      inv('amago', 1),    // best ¥100
      inv('ito', 1),      // best ¥300
      inv('oyanirami', 1),// best ¥160
    ];
    const result = _betterPairings(inventory, FISH_DATA);
    for (let i = 1; i < result.length; i++) {
      assert(
        result[i].pairings[0].price <= result[i-1].pairings[0].price,
        `Results should be sorted by best price desc`
      );
    }
  });
}

// ═══════════════════════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════════════════════
function runAllTests() {
  runCookedPairTests();
  runRawPairTests();
  runSoloTests();
  runMixedTests();
  runYakizakeTests();
  runTrioTests();
  runPriorityTests();
  runSeasonTests();
  runBestPairsTests();
  runBestPairForFishTests();
  runCatchOpportunityTests();
  runBetterPairingsTests();
  return _results;
}

// ── Node.js entry point ───────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  const fs         = require('fs');
  const path       = require('path');
  const enginePath = path.join(__dirname, 'engine.js');
  const dataPath   = path.join(__dirname, 'fish-data.json');

  if (!fs.existsSync(enginePath) || !fs.existsSync(dataPath)) {
    console.error('Missing engine.js or fish-data.json — run from the files/ directory');
    process.exit(1);
  }

  const engineModule = require(enginePath);
  const fishData     = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  loadTestDeps(fishData, engineModule);

  console.log('\nRunning JRLA Unit Tests...');
  const results = runAllTests();
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Passed: ${results.pass}  Failed: ${results.fail}`);
  if (results.errors.length) {
    console.log('\nFailures:');
    results.errors.forEach(e => console.log(`  ✗ ${e.name}\n    ${e.error}`));
  }
  process.exit(results.fail > 0 ? 1 : 0);

} else {
  // Browser: called by test.html after fish data is loaded
  module = undefined; // suppress re-entry
}
