import assert from 'assert';
import { solveBasket, solveBruteForce, evaluateSplitTrigger, repairThresholds } from '../src/basket-solver.mjs';
import { loadFeesConfig, calculatePlatformFee } from '../src/fee-calculator.mjs';

console.log('=== AEGIS BASKET SOLVER TEST SUITE ===\n');

// ----------------------------------------------------
// TEST 1: Config loading & fee schedule verification
// ----------------------------------------------------
console.log('Test 1: Verifying fees.json Oct 2026 schedule...');
const config = loadFeesConfig();
assert.strictEqual(config.version, '2026.10.18', 'Config version should match');
assert.strictEqual(config.platforms.blinkit.handling_fee, 11.0, 'Blinkit handling fee must be Rs 11');
assert.strictEqual(config.platforms.zepto.free_delivery_threshold, 199.0, 'Zepto free delivery must be Rs 199');
assert.strictEqual(config.platforms.instamart.handling_fee, 9.80, 'Instamart handling fee must be Rs 9.80');

const blinkitFee150 = calculatePlatformFee('blinkit', 150);
assert.strictEqual(blinkitFee150.delivery, 30.0, 'Blinkit delivery below 199 is Rs 30');
assert.strictEqual(blinkitFee150.handling, 11.0, 'Blinkit handling is Rs 11');
assert.strictEqual(blinkitFee150.total, 41.0, 'Blinkit total fee for Rs 150 is Rs 41');

const zeptoFee250 = calculatePlatformFee('zepto', 250);
assert.strictEqual(zeptoFee250.delivery, 0.0, 'Zepto free delivery at Rs 250');
assert.strictEqual(zeptoFee250.total, 0.0, 'Zepto total fee is 0 at Rs 250');
console.log('  [PASS] fees.json verified.\n');

// ----------------------------------------------------
// TEST 2: Worked Example from Hark Blueprint (Page 10)
// Rs 889 single vs Rs 837.80 split MUST output Zepto only
// ----------------------------------------------------
console.log('Test 2: Blueprint Worked Example (Rs 889 single vs Rs 837.80 split)...');
const workedItems = ['milk', 'atta', 'maggi', 'bananas', 'eggs', 'oil', 'surf', 'coke'];
const workedOffers = {
  milk: [
    { platform: 'zepto', price: 30, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 32, in_stock: true, freshness: 'live' }
  ],
  atta: [
    { platform: 'zepto', price: 250, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 260, in_stock: true, freshness: 'live' }
  ],
  maggi: [
    { platform: 'zepto', price: 60, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 60, in_stock: true, freshness: 'live' }
  ],
  bananas: [
    { platform: 'zepto', price: 50, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 55, in_stock: true, freshness: 'live' }
  ],
  eggs: [
    { platform: 'zepto', price: 120, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 120, in_stock: false, freshness: 'live' } // Out of stock on Instamart
  ],
  oil: [
    { platform: 'zepto', price: 150, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 120, in_stock: true, freshness: 'live' } // Instamart cheaper
  ],
  surf: [
    { platform: 'zepto', price: 140, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 110, in_stock: true, freshness: 'live' } // Instamart cheaper
  ],
  coke: [
    { platform: 'zepto', price: 89, in_stock: true, freshness: 'live' },
    { platform: 'instamart', price: 88, in_stock: true, freshness: 'live' }  // Instamart cheaper
  ]
};

const workedResult = solveBasket(workedItems, workedOffers, ['zepto', 'instamart'], {}, { lam: 25.0, abs_floor: 40.0, pct: 0.08 });

console.log('  Single App Best:', workedResult.single_app.platforms, 'Payable Total: Rs', workedResult.single_app.payable_total);
console.log('  Overall Split Best:', workedResult.overall_best.platforms, 'Payable Total: Rs', workedResult.overall_best.payable_total);
console.log('  Cash Savings: Rs', workedResult.savings);
console.log('  Friction-Adjusted Savings: Rs', workedResult.friction_adjusted_savings);
console.log('  Split Trigger Threshold: Rs', workedResult.split_trigger_threshold);
console.log('  Show Split Decision:', workedResult.show_split);
console.log('  Reason:', workedResult.reason);

assert.strictEqual(workedResult.single_app.platforms[0], 'zepto', 'Single app winner must be Zepto');
assert.strictEqual(workedResult.single_app.payable_total, 889.0, 'Zepto single app payable must be Rs 889');
assert.strictEqual(workedResult.overall_best.payable_total, 837.80, 'Split payable must be Rs 837.80');
assert.strictEqual(workedResult.savings, 51.20, 'Gross savings must be Rs 51.20');
assert.strictEqual(workedResult.friction_adjusted_savings, 26.20, 'Net savings must be Rs 26.20 (after Rs 25 friction)');
assert.strictEqual(workedResult.show_split, false, 'MUST OUTPUT ZEPTO ONLY (show_split must be false)');
console.log('  [PASS] Blueprint Worked Example passed: Output is Zepto only!\n');

// ----------------------------------------------------
// TEST 3: Brute Force Equivalence & Paise Fuzzing Oracle (10,000 instances)
// ----------------------------------------------------
console.log('Test 3: Testing 10,000 random baskets with threshold-edge prices (49.9, 99.99, 149.01, etc.) against Brute Force oracle...');
const testPlatforms = ['zepto', 'blinkit', 'instamart', 'bbnow'];
const thresholdEdgePrices = [49.90, 99.99, 149.01, 198.99, 199.00, 199.01, 99.50, 49.99, 100.01];

for (let trial = 1; trial <= 10000; trial++) {
  const numItems = 1 + Math.floor(Math.random() * 4); // 1 to 4 items
  const numPlatforms = 2 + Math.floor(Math.random() * 3); // 2 to 4 platforms
  const activePlatforms = testPlatforms.slice(0, numPlatforms);

  const trialItems = [];
  const trialOffers = {};

  for (let i = 0; i < numItems; i++) {
    const it = `item_${i}`;
    trialItems.push(it);
    trialOffers[it] = [];
    for (const p of activePlatforms) {
      // 10% out of stock
      const inStock = Math.random() > 0.10;
      let price;
      if (Math.random() < 0.4) {
        // 40% probability: pick explicit threshold edge price
        price = thresholdEdgePrices[Math.floor(Math.random() * thresholdEdgePrices.length)];
      } else {
        // Random price with fractional paise
        const paiseOptions = [0, 1, 10, 25, 33, 49, 50, 67, 75, 90, 99];
        const randomPaise = paiseOptions[Math.floor(Math.random() * paiseOptions.length)];
        price = 10 + Math.floor(Math.random() * 200) + (randomPaise / 100);
      }
      trialOffers[it].push({ platform: p, price, in_stock: inStock });
    }
  }

  const pruned = solveBasket(trialItems, trialOffers, activePlatforms);
  const brute = solveBruteForce(trialItems, trialOffers, activePlatforms);

  if (brute.overall === null) {
    assert.strictEqual(pruned.overall_best, null, `Trial ${trial}: Both should agree when impossible`);
  } else {
    assert(pruned.overall_best !== null, `Trial ${trial}: Pruned should find a solution`);
    const diffOverall = Math.abs(pruned.overall_best.cost - brute.overall.cost);
    assert(diffOverall < 0.01, `Trial ${trial} Overall mismatch: pruned=${pruned.overall_best.cost}, brute=${brute.overall.cost}`);

    if (brute.single !== null) {
      assert(pruned.single_app !== null, `Trial ${trial}: Single app solution should exist`);
      const diffSingle = Math.abs(pruned.single_app.cost - brute.single.cost);
      assert(diffSingle < 0.01, `Trial ${trial} Single mismatch: pruned=${pruned.single_app.cost}, brute=${brute.single.cost}`);
    }
  }
}
console.log('  [PASS] All 10,000 threshold-edge instances matched Brute Force oracle with 0 mismatches.\n');

// ----------------------------------------------------
// TEST 3B: Exact Threshold Edge Case (Hark Repro Bug)
// ----------------------------------------------------
console.log('Test 3B: Exact Rs 199 Threshold Float Accumulation Bug...');
const thresholdItems = ['item_a', 'item_b'];
const thresholdOffers = {
  item_a: [{ platform: 'zepto', price: 99.50, in_stock: true, freshness: 'live' }],
  item_b: [{ platform: 'zepto', price: 99.50, in_stock: true, freshness: 'live' }]
};
// 99.50 + 99.50 = 199.00 exactly. Must trigger free delivery (delivery fee = Rs 0).
const thresholdResult = solveBasket(thresholdItems, thresholdOffers, ['zepto']);
assert.strictEqual(thresholdResult.overall_best.subtotals.zepto, 199.00, 'Subtotal must be 199.00');
assert.strictEqual(thresholdResult.overall_best.fee_breakdowns.zepto.delivery, 0.0, 'Zepto delivery fee must be Rs 0 at exact 199 threshold');
assert.strictEqual(thresholdResult.overall_best.payable_total, 199.00, 'Payable total must be Rs 199.00, NOT Rs 229.00');
console.log('  [PASS] Hark float accumulation repro passed: Exact Rs 199 gets Rs 0 delivery fee!\n');

// ----------------------------------------------------
// TEST 4: Worst-Case 4x10 Basket Performance Benchmark (< 50 ms)
// ----------------------------------------------------
console.log('Test 4: Worst-case 4 platforms x 10 items performance benchmark...');
const advPlatforms = ['zepto', 'blinkit', 'instamart', 'bbnow'];
const advItems = Array.from({ length: 10 }, (_, i) => `item_${i}`);
const advOffers = {};

// Uniformly random prices with all 4 platforms in stock
for (const it of advItems) {
  advOffers[it] = advPlatforms.map(p => ({
    platform: p,
    price: 30 + Math.floor(Math.random() * 250),
    in_stock: true,
    freshness: 'live'
  }));
}

const t0 = performance.now();
const advResult = solveBasket(advItems, advOffers, advPlatforms);
const t1 = performance.now();
const elapsedMs = t1 - t0;

console.log(`  4x10 Basket solved in: ${elapsedMs.toFixed(2)} ms (Limit: 50 ms)`);
console.log(`  Assigned Platforms:`, advResult.overall_best.platforms);
assert(elapsedMs < 50, `Worst case 4x10 solve time (${elapsedMs} ms) exceeded 50 ms threshold!`);
console.log('  [PASS] Performance benchmark passed (< 50 ms).\n');

// ----------------------------------------------------
// TEST 5: Threshold Repair (Example 4 from Blueprint)
// ----------------------------------------------------
console.log('Test 5: Threshold Repair (The Rs 199 unlock rule)...');
const smallItems = ['milk', 'maggi', 'bananas'];
const smallOffers = {
  milk: [{ platform: 'zepto', price: 60, in_stock: true, freshness: 'live' }],
  maggi: [{ platform: 'zepto', price: 56, in_stock: true, freshness: 'live' }],
  bananas: [{ platform: 'zepto', price: 40, in_stock: true, freshness: 'live' }]
};
// Subtotal = 156 on Zepto. Delivery fee = Rs 30. Total = Rs 186. Deficit = 199 - 156 = Rs 43.
const smallResult = solveBasket(smallItems, smallOffers, ['zepto']);
assert.strictEqual(smallResult.overall_best.payable_total, 186.0, 'Small cart payable should be Rs 186');

const userStaples = [
  { name: 'Amul Taaza Milk 500ml', price: 27, platform: 'zepto' }, // Too small (27 < 43)
  { name: 'Brown Bread 400g', price: 45, platform: 'zepto' },      // Clears threshold (45 >= 43)
  { name: 'Surf Excel Quick Wash 1kg', price: 140, platform: 'zepto' }
];

const repairs = repairThresholds(smallResult.overall_best, userStaples);
console.log('  Repairs suggested:', repairs.length);
assert.strictEqual(repairs.length, 1, 'Should find 1 valid threshold repair');
const r = repairs[0];
console.log('  Verdict:', r.net_verdict);
assert.strictEqual(r.suggested_staple.name, 'Brown Bread 400g');
assert.strictEqual(r.delivery_fee, 30.0);
assert.strictEqual(r.new_delivery_fee, 0.0);
assert.strictEqual(r.total_before, 186.0);
assert.strictEqual(r.total_after, 201.0); // 156 + 45 = 201, 0 delivery fee
assert.strictEqual(r.suggested_staple.effective_cost, 15.0); // 201 - 186 = 15!
console.log('  [PASS] Threshold Repair passed: Rs 45 staple costs net Rs 15!\n');

// ----------------------------------------------------
// TEST 6: Freshness Gating
// ----------------------------------------------------
console.log('Test 6: Freshness Gating...');
const staleOffers = {
  milk: [{ platform: 'zepto', price: 30, in_stock: true, freshness: 'stale' }]
};
const staleResult = solveBasket(['milk'], staleOffers, ['zepto']);
assert.strictEqual(staleResult.all_prices_fresh_or_live, false, 'Stale price should mark all_prices_fresh_or_live false');

const freshOffers = {
  milk: [{ platform: 'zepto', price: 30, in_stock: true, freshness: 'fresh' }]
};
const freshResult = solveBasket(['milk'], freshOffers, ['zepto']);
assert.strictEqual(freshResult.all_prices_fresh_or_live, true, 'Fresh price should mark all_prices_fresh_or_live true');
console.log('  [PASS] Freshness gating verified.\n');

// ----------------------------------------------------
// TEST 7: Infeasible Basket Guard & Split Gate Cap (< Rs 120)
// ----------------------------------------------------
console.log('Test 7: Infeasible Basket Guard & Split Gate Cap...');
const infeasibleTrigger = evaluateSplitTrigger(null, null);
assert.strictEqual(infeasibleTrigger.show_split, false, 'Infeasible basket must return show_split: false');
assert(infeasibleTrigger.reason.includes('unavailable'), 'Should state items unavailable');

// High cart split trigger cap test (Cart = Rs 2500, 8% = Rs 200, but cap must bite at Rs 120)
const mockSingleHigh = { payable_total: 2500, cost: 2500 };
const mockOverallHigh = { payable_total: 2360, cost: 2385, platforms: ['zepto', 'blinkit'], friction_charge: 25 };
// Cash saving = 140, friction net saving = 115. Threshold = 120. Net 115 < 120 -> false
const highResult1 = evaluateSplitTrigger(mockOverallHigh, mockSingleHigh, 40.0, 0.08);
assert.strictEqual(highResult1.trigger_threshold, 120.0, 'Trigger threshold at Rs 2500 cart must cap at Rs 120 (not Rs 200)');
assert.strictEqual(highResult1.show_split, false, 'Net 115 < 120 threshold -> show_split: false');

// If net saving is 125 > 120 -> true!
const mockOverallWinning = { payable_total: 2350, cost: 2375, platforms: ['zepto', 'blinkit'], friction_charge: 25 };
const highResult2 = evaluateSplitTrigger(mockOverallWinning, mockSingleHigh, 40.0, 0.08);
assert.strictEqual(highResult2.show_split, true, 'Net 125 > 120 threshold -> show_split: true');
console.log('  [PASS] Infeasible guard and Rs 120 cap verified.\n');

console.log('=== ALL BASKET SOLVER TESTS PASSED (7/7) ===');
