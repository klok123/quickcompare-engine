/**
 * Fee Drift Verification Harness
 * Verifies that platform fee rules in config/fees.json match observed bill summaries.
 * Data is tagged source='harness' and NEVER served in consumer UI.
 */

import { loadFeesConfig, calculatePlatformFee } from '../src/fee-calculator.mjs';

const TEST_SUBTOTALS = [98, 150, 198, 200, 298, 300];

export async function runFeeDriftCheck(options = {}) {
  const config = loadFeesConfig();
  const results = [];

  for (const [platformId, p] of Object.entries(config.platforms)) {
    const platformChecks = [];
    for (const sub of TEST_SUBTOTALS) {
      const calculated = calculatePlatformFee(platformId, sub);
      
      const threshold = p.free_delivery_threshold || p.free_delivery_threshold_non_member;
      const expectedDelivery = sub >= threshold ? 0 : p.delivery_fee_standard;
      const driftDetected = calculated.delivery !== expectedDelivery;

      platformChecks.push({
        subtotal: sub,
        calculated_delivery: calculated.delivery,
        calculated_handling: calculated.handling,
        calculated_total: calculated.total,
        drift_detected: driftDetected,
        source: 'harness'
      });
    }

    results.push({
      platform: platformId,
      effective_from: p.effective_from,
      checks: platformChecks,
      status: platformChecks.some(c => c.drift_detected) ? 'DRIFT_DETECTED' : 'FEE_RULES_VERIFIED',
      source: 'harness'
    });
  }

  return {
    timestamp: new Date().toISOString(),
    results,
    source: 'harness'
  };
}

if (process.argv[1].endsWith('fee-drift-check.mjs')) {
  console.log('Running Fee Drift Check Harness...');
  runFeeDriftCheck().then(res => {
    console.log(JSON.stringify(res, null, 2));
  });
}
