import { loadFeesConfig, calculatePlatformFee, getFeeTotal } from './fee-calculator.mjs';

/**
 * Generate all combinations of array elements of length r
 */
function combinations(arr, r) {
  if (r === 0) return [[]];
  if (arr.length < r) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, r - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, r);
  return [...withFirst, ...withoutFirst];
}

/**
 * Basket Optimization Solver (ESM Port of Aegis Reference MILP / Branch & Bound)
 * Evaluates all 15 non-empty platform subsets with aggressive branch-and-bound pruning.
 *
 * @param {Array<string>} items - List of item IDs or names
 * @param {Object} offers - { [itemId]: Array<{ platform: string, price: number, in_stock: boolean, title?: string, freshness?: string }> }
 * @param {Array<string>} platformList - Array of platform IDs (e.g. ['zepto', 'blinkit', 'instamart'])
 * @param {Object} ctx - Context { is_member?: boolean, is_peak?: boolean, is_surge?: boolean }
 * @param {Object} options - { lam?: number, abs_floor?: number, pct?: number, eta_weight?: number }
 */
export function solveBasket(items, offers, platformList = ['zepto', 'blinkit', 'instamart'], ctx = {}, options = {}) {
  const feesConfig = loadFeesConfig();
  const lam = options.lam !== undefined ? options.lam : (feesConfig.friction_penalty_per_extra_order || 25.0);
  const etaWeight = options.eta_weight !== undefined ? options.eta_weight : 0.0;
  const absFloor = options.abs_floor !== undefined ? options.abs_floor : (feesConfig.split_trigger?.abs_floor || 40.0);
  const pct = options.pct !== undefined ? options.pct : (feesConfig.split_trigger?.pct || 0.08);

  const pmap = {};
  for (const pid of platformList) {
    const pConf = feesConfig.platforms[pid.toLowerCase()];
    pmap[pid] = {
      name: pid,
      eta_min: pConf?.eta_min || 12,
      fee: (sub) => getFeeTotal(pid, sub, ctx),
      feeBreakdown: (sub) => calculatePlatformFee(pid, sub, ctx)
    };
  }

  // 1. Find cheapest in-stock candidate per (item, platform) with exact integer paise
  const best = {};
  for (const it of items) {
    const itOffers = offers[it] || [];
    for (const o of itOffers) {
      if (!o.in_stock) continue;
      const key = `${it}:::${o.platform}`;
      const priceNum = Math.round(Number(o.price) * 100) / 100;
      const pricePaise = Math.round(priceNum * 100);
      if (!best[key] || pricePaise < best[key].pricePaise) {
        best[key] = {
          item: it,
          platform: o.platform,
          price: priceNum,
          pricePaise: pricePaise,
          title: o.title || it,
          freshness: o.freshness || 'live',
          unit_rate: o.unit_rate || null
        };
      }
    }
  }

  // 2. Sort items by price spread (largest first) so the lower bound bites early
  function spread(it) {
    const ps = platformList.filter(p => best[`${it}:::${p}`]).map(p => best[`${it}:::${p}`].pricePaise);
    return ps.length > 1 ? -(Math.max(...ps) - Math.min(...ps)) : 0;
  }
  const sortedItems = [...items].sort((a, b) => spread(a) - spread(b));

  let globalIncumbent = Infinity;

  // 3. Evaluate a specific platform subset S using integer paise to prevent float drift
  function evaluateSubset(S) {
    // Availability check: every item must be available in at least one platform in S
    const choices = sortedItems.map(it => S.filter(p => best[`${it}:::${p}`]));
    if (choices.some(c => c.length === 0)) {
      return null; // Availability is a hard constraint
    }

    // Fixed lower bound: minimum fee floors + friction penalty
    const fixedFloor = S.reduce((sum, p) => sum + pmap[p].fee(1e9), 0) + lam * (S.length - 1);

    // Precalculate cumulative minimum remaining prices in paise
    const n = sortedItems.length;
    const minRestPaise = new Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      const minChoicePaise = Math.min(...choices[i].map(p => best[`${sortedItems[i]}:::${p}`].pricePaise));
      minRestPaise[i] = minRestPaise[i + 1] + minChoicePaise;
    }

    const subPaise = {};
    const itemCounts = {};
    for (const p of S) {
      subPaise[p] = 0;
      itemCounts[p] = 0;
    }
    const pick = new Array(n);
    let topPlan = null;

    function rec(i, accPaise) {
      // Branch-and-bound pruning: lower bound >= best known cost
      const currentTopCost = topPlan ? topPlan.cost : Infinity;
      const accRupees = accPaise / 100;
      const minRestRupees = minRestPaise[i] / 100;
      if (accRupees + minRestRupees + fixedFloor >= Math.min(currentTopCost, globalIncumbent)) {
        return;
      }

      if (i === n) {
        // Every platform in S must receive at least one item
        if (S.some(p => itemCounts[p] === 0)) {
          return;
        }

        let feesTotal = 0;
        const feeBreakdowns = {};
        const subtotals = {};
        for (const p of S) {
          const subtotalRupees = subPaise[p] / 100;
          subtotals[p] = subtotalRupees;
          const breakdown = pmap[p].feeBreakdown(subtotalRupees);
          feesTotal += breakdown.total;
          feeBreakdowns[p] = breakdown;
        }

        const maxEta = Math.max(...S.map(p => pmap[p].eta_min));
        const frictionCharge = lam * (S.length - 1);
        const cost = Number((accRupees + feesTotal + frictionCharge + etaWeight * maxEta).toFixed(2));

        if (cost < currentTopCost) {
          globalIncumbent = Math.min(globalIncumbent, cost);
          const assignment = {};
          for (let k = 0; k < n; k++) {
            const it = sortedItems[k];
            const p = pick[k];
            assignment[it] = {
              platform: p,
              price: best[`${it}:::${p}`].price,
              title: best[`${it}:::${p}`].title,
              freshness: best[`${it}:::${p}`].freshness
            };
          }

          topPlan = {
            cost: cost,
            payable_total: Number((accRupees + feesTotal).toFixed(2)),
            item_subtotal: Number(accRupees.toFixed(2)),
            fees_total: Number(feesTotal.toFixed(2)),
            friction_charge: frictionCharge,
            platforms: S,
            subtotals: subtotals,
            item_counts: { ...itemCounts },
            fee_breakdowns: feeBreakdowns,
            assignments: assignment
          };
        }
        return;
      }

      for (const p of choices[i]) {
        const prPaise = best[`${sortedItems[i]}:::${p}`].pricePaise;
        subPaise[p] += prPaise;
        itemCounts[p]++;
        pick[i] = p;
        rec(i + 1, accPaise + prPaise);
        subPaise[p] -= prPaise;
        itemCounts[p]--;
      }
    }

    rec(0, 0);
    return topPlan;
  }

  // 4. Enumerate all non-empty subsets
  let overall = null;
  let single = null;

  for (let r = 1; r <= platformList.length; r++) {
    for (const S of combinations(platformList, r)) {
      const pl = evaluateSubset(S);
      if (pl) {
        if (!overall || pl.cost < overall.cost) {
          overall = pl;
        }
        if (r === 1) {
          if (!single || pl.cost < single.cost) {
            single = pl;
          }
        }
      }
    }
  }

  // 5. Evaluate Split Trigger Condition
  const splitDecision = evaluateSplitTrigger(overall, single, absFloor, pct);

  return {
    single_app: single,
    overall_best: overall,
    show_split: splitDecision.show_split,
    savings: splitDecision.savings,
    friction_adjusted_savings: splitDecision.friction_adjusted_savings,
    split_trigger_threshold: splitDecision.trigger_threshold,
    reason: splitDecision.reason,
    all_prices_fresh_or_live: checkFreshness(overall, single)
  };
}

/**
 * Brute-force solver implementation used exclusively for oracle testing / verification
 */
export function solveBruteForce(items, offers, platformList, ctx = {}, options = {}) {
  const feesConfig = loadFeesConfig();
  const lam = options.lam !== undefined ? options.lam : (feesConfig.friction_penalty_per_extra_order || 25.0);

  const best = {};
  for (const it of items) {
    for (const o of offers[it] || []) {
      if (!o.in_stock) continue;
      const key = `${it}:::${o.platform}`;
      if (!best[key] || o.price < best[key].price) {
        best[key] = o.price;
      }
    }
  }

  // Enumerate all platform assignments for all items
  const validPlatformsPerItem = items.map(it => platformList.filter(p => best[`${it}:::${p}`] !== undefined));
  if (validPlatformsPerItem.some(vp => vp.length === 0)) return { overall: null, single: null };

  let bestOverall = null;
  let bestSingle = null;

  function cartesian(arr) {
    return arr.reduce((acc, curr) => acc.flatMap(c => curr.map(n => [...c, n])), [[]]);
  }

  const allAssignments = cartesian(validPlatformsPerItem);

  for (const assign of allAssignments) {
    const usedPlatforms = Array.from(new Set(assign));
    const subPaise = {};
    for (const p of usedPlatforms) subPaise[p] = 0;
    let itemTotalPaise = 0;

    for (let i = 0; i < items.length; i++) {
      const p = assign[i];
      const prPaise = Math.round(best[`${items[i]}:::${p}`] * 100);
      subPaise[p] += prPaise;
      itemTotalPaise += prPaise;
    }

    let feesTotal = 0;
    const sub = {};
    for (const p of usedPlatforms) {
      const subtotalRupees = subPaise[p] / 100;
      sub[p] = subtotalRupees;
      feesTotal += getFeeTotal(p, subtotalRupees, ctx);
    }

    const itemTotal = itemTotalPaise / 100;
    const friction = lam * (usedPlatforms.length - 1);
    const cost = Number((itemTotal + feesTotal + friction).toFixed(2));

    const plan = {
      cost,
      payable_total: Number((itemTotal + feesTotal).toFixed(2)),
      platforms: usedPlatforms,
      subtotals: sub
    };

    if (!bestOverall || cost < bestOverall.cost) {
      bestOverall = plan;
    }
    if (usedPlatforms.length === 1) {
      if (!bestSingle || cost < bestSingle.cost) {
        bestSingle = plan;
      }
    }
  }

  return { overall: bestOverall, single: bestSingle };
}

/**
 * Check if the split should be shown according to rule:
 * Net saving (after friction) > max(abs_floor, min(pct * single.cost, 120.0))
 */
export function evaluateSplitTrigger(overall, single, absFloor = 40.0, pct = 0.08) {
  if (!overall) {
    return {
      show_split: false,
      savings: 0,
      friction_adjusted_savings: 0,
      trigger_threshold: absFloor,
      reason: 'Some items are unavailable across all selected platforms'
    };
  }

  if (!single) {
    return {
      show_split: true,
      savings: 0,
      friction_adjusted_savings: 0,
      trigger_threshold: absFloor,
      reason: 'No single platform has all items in stock'
    };
  }

  const pctComponent = Math.min(pct * single.payable_total, 120.0);
  const triggerThreshold = Number(Math.max(absFloor, pctComponent).toFixed(2));

  if (overall.platforms.length <= 1) {
    return {
      show_split: false,
      savings: 0,
      friction_adjusted_savings: 0,
      trigger_threshold: triggerThreshold,
      reason: 'Single platform is already cheapest'
    };
  }

  const cashSavings = Math.round((single.payable_total - overall.payable_total) * 100) / 100;
  const frictionAdjustedSavings = Math.round((single.cost - overall.cost) * 100) / 100;

  const showSplit = frictionAdjustedSavings > triggerThreshold;

  return {
    show_split: showSplit,
    savings: cashSavings,
    friction_adjusted_savings: frictionAdjustedSavings,
    trigger_threshold: triggerThreshold,
    reason: showSplit
      ? `Split saves ₹${cashSavings} (₹${frictionAdjustedSavings} after ₹${overall.friction_charge} friction), exceeding ₹${triggerThreshold} threshold`
      : `Split saving of ₹${cashSavings} (₹${frictionAdjustedSavings} net) does not justify multiple deliveries (threshold ₹${triggerThreshold})`
  };
}

/**
 * Verify if all winning prices are live or fresh
 */
function checkFreshness(overall, single) {
  const plan = overall || single;
  if (!plan || !plan.assignments) return false;
  return Object.values(plan.assignments).every(a => a.freshness === 'live' || a.freshness === 'fresh');
}

/**
 * Threshold Repair Engine
 * Suggests items strictly from user's staples/history to clear free delivery thresholds
 * when additional spend is lower than the fee saved.
 *
 * @param {Object} plan - Generated plan from solveBasket (displayed plan)
 * @param {Array<Object>} userStaples - [{ name: string, price: number, platform?: string, ... }]
 * @param {Object} ctx - Context { is_member, is_peak, is_surge }
 * @returns {Array<Object>} Array of repair suggestions per platform
 */
export function repairThresholds(plan, userStaples = [], ctx = {}) {
  if (!plan || !plan.subtotals) return [];

  const feesConfig = loadFeesConfig();
  const suggestions = [];

  for (const [platformId, subtotal] of Object.entries(plan.subtotals)) {
    const feeInfo = calculatePlatformFee(platformId, subtotal, ctx);
    // If delivery fee is being paid (> 0), threshold repair is applicable
    if (feeInfo.delivery > 0 && feeInfo.free_delivery_threshold > subtotal) {
      const deficit = Number((feeInfo.free_delivery_threshold - subtotal).toFixed(2));

      // Filter user staples available on this platform (or platform === 'all')
      const candidates = userStaples.filter(s => {
        const pMatch = !s.platform || s.platform.toLowerCase() === 'all' || s.platform.toLowerCase() === platformId.toLowerCase();
        return pMatch && s.price >= deficit;
      });

      if (candidates.length === 0) continue;

      // Pick the staple that minimizes excess spend over deficit
      candidates.sort((a, b) => (a.price - deficit) - (b.price - deficit));
      const bestStaple = candidates[0];

      const newSubtotal = Number((subtotal + bestStaple.price).toFixed(2));
      const newFeeInfo = calculatePlatformFee(platformId, newSubtotal, ctx);

      // Fee reduction
      const feeSaved = Number((feeInfo.total - newFeeInfo.total).toFixed(2));
      const additionalCashOut = Number((newSubtotal + newFeeInfo.total - (subtotal + feeInfo.total)).toFixed(2));
      const effectiveItemCost = additionalCashOut; // Real incremental spend to get this staple today

      // Honest, non-tautological qualification:
      // Must unlock real delivery fee savings (feeSaved > 0), deficit must be positive, and feeSaved must significantly offset item cost (at least 30% discount or >= ₹20 savings)
      if (feeSaved > 0 && deficit > 0 && (effectiveItemCost <= 0 || feeSaved >= 20 || (feeSaved / bestStaple.price) >= 0.30)) {
        const netVerdict = effectiveItemCost <= 0 
          ? `Add ${bestStaple.name} (₹${bestStaple.price}) to waive ₹${feeInfo.delivery} delivery fee — FREE with net cash savings of ₹${Math.abs(effectiveItemCost)}!`
          : `Add ${bestStaple.name} (₹${bestStaple.price}) to waive ₹${feeInfo.delivery} delivery fee — you get a ₹${bestStaple.price} staple for just ₹${effectiveItemCost}!`;

        suggestions.push({
          platform: platformId,
          platform_name: feesConfig.platforms[platformId]?.name || platformId,
          current_subtotal: subtotal,
          delivery_fee: feeInfo.delivery,
          deficit_to_free_delivery: deficit,
          suggested_staple: {
            name: bestStaple.name,
            normal_price: bestStaple.price,
            price: bestStaple.price,
            platform: platformId,
            effective_cost: effectiveItemCost,
            discount_unlocked: feeSaved
          },
          new_subtotal: newSubtotal,
          new_delivery_fee: newFeeInfo.delivery,
          total_before: Number((subtotal + feeInfo.total).toFixed(2)),
          total_after: Number((newSubtotal + newFeeInfo.total).toFixed(2)),
          net_verdict: netVerdict
        });
      }
    }
  }

  return suggestions;
}
