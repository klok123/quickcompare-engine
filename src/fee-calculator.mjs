import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FEES_CONFIG_PATH = path.resolve(__dirname, '../config/fees.json');

let cachedConfig = null;
let lastMtime = 0;

/**
 * Load fees configuration from config/fees.json (auto-reloads on file change)
 */
export function loadFeesConfig(reload = false) {
  try {
    const stats = fs.statSync(FEES_CONFIG_PATH);
    if (!cachedConfig || reload || stats.mtimeMs > lastMtime) {
      const raw = fs.readFileSync(FEES_CONFIG_PATH, 'utf-8');
      cachedConfig = JSON.parse(raw);
      lastMtime = stats.mtimeMs;
    }
    return cachedConfig;
  } catch (err) {
    throw new Error(`Failed to load fees config from ${FEES_CONFIG_PATH}: ${err.message}`);
  }
}

/**
 * Calculate itemized fee breakdown and total for a platform given a subtotal and context
 * 
 * @param {string} platformId - 'blinkit', 'zepto', 'instamart', 'bbnow'
 * @param {number} subtotal - Item subtotal in INR
 * @param {object} ctx - Context options: { is_member: bool, is_peak: bool, is_surge: bool }
 * @returns {object} { delivery, handling, small_cart, platform, surge, total }
 */
export function calculatePlatformFee(platformId, subtotal, ctx = {}) {
  // Normalize subtotal to 2 decimal places to eliminate IEEE-754 float drift (e.g. 198.99999999999999 -> 199.00)
  subtotal = Math.round((subtotal || 0) * 100) / 100;
  if (subtotal <= 0) {
    return { delivery: 0, handling: 0, small_cart: 0, platform: 0, surge: 0, total: 0, free_delivery_threshold: 0 };
  }

  const config = loadFeesConfig();
  const p = config.platforms[platformId.toLowerCase()];
  if (!p) {
    throw new Error(`Platform '${platformId}' not found in fees config`);
  }

  // 1. Delivery fee threshold check
  let threshold = p.free_delivery_threshold;
  if (platformId.toLowerCase() === 'instamart') {
    threshold = ctx.is_member ? p.free_delivery_threshold_member : p.free_delivery_threshold_non_member;
  } else if (platformId.toLowerCase() === 'zepto' && ctx.is_peak) {
    threshold = p.free_delivery_threshold_peak || 299.0;
  }

  const delivery = subtotal >= threshold ? 0.0 : p.delivery_fee_standard;

  // 2. Handling fee
  const handling = p.handling_fee || 0.0;

  // 3. Small cart fee
  let small_cart = 0.0;
  if (p.small_cart_threshold && p.small_cart_threshold > 0 && subtotal < p.small_cart_threshold) {
    small_cart = p.small_cart_fee || 0.0;
  }

  // 4. Platform fee
  const platform = p.platform_fee || 0.0;

  // 5. Surge fee
  let surge = 0.0;
  if (ctx.is_surge) {
    if (platformId.toLowerCase() === 'instamart' && ctx.is_member) {
      surge = 0.0; // Swiggy One members have surge fee completely waived
    } else {
      surge = p.surge_fee_non_member || p.surge_fee_default || 0.0;
    }
  }

  const total = Number((delivery + handling + small_cart + platform + surge).toFixed(2));

  return {
    delivery,
    handling,
    small_cart,
    platform,
    surge,
    total,
    free_delivery_threshold: threshold
  };
}

/**
 * Quick scalar fee function for solver integration
 */
export function getFeeTotal(platformId, subtotal, ctx = {}) {
  return calculatePlatformFee(platformId, subtotal, ctx).total;
}
