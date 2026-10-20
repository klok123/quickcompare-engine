/**
 * Store-Keyed In-Memory LRU Cache Manager
 * 
 * Strict Freshness Rules (from Hark Blueprint):
 * - < 5 minutes: 'live' (100% fresh, winner and split chips active)
 * - 5 - 30 minutes: 'fresh' (high confidence, winner chips active)
 * - > 30 minutes: 'stale' (historical estimate)
 * - Max TTL: 6 hours (pruned)
 */

class CacheManager {
  constructor(maxEntries = 500) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }

  _makeKey(platform, loc, query) {
    const p = (platform || 'all').toLowerCase();
    const l = (loc || 'default').toLowerCase().replace(/\s+/g, '_');
    const q = (query || '').toLowerCase().trim();
    return `${p}:${l}:${q}`;
  }

  get(platform, loc, query) {
    const key = this._makeKey(platform, loc, query);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const ageMs = Date.now() - entry.timestamp;
    const ageMinutes = ageMs / (1000 * 60);

    // Evict if older than 6 hours
    if (ageMinutes > 360) {
      this.cache.delete(key);
      return null;
    }

    // LRU Promotion: delete and re-set to mark as most recently used
    this.cache.delete(key);
    this.cache.set(key, entry);

    let freshness = 'live';
    if (ageMinutes >= 30) {
      freshness = 'stale';
    } else if (ageMinutes >= 5) {
      freshness = 'fresh';
    }

    return {
      data: entry.data,
      freshness,
      ageMs,
      cachedAt: entry.timestamp
    };
  }

  set(platform, loc, query, data) {
    const key = this._makeKey(platform, loc, query);
    
    // If key exists, delete first to refresh position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry (least recently used)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      timestamp: Date.now(),
      data
    });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export const comparisonCache = new CacheManager(1000);
