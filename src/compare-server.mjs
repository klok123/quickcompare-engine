import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runComparison } from './compare-engine.mjs';
import { loadFeesConfig, calculatePlatformFee } from './fee-calculator.mjs';
import { solveBasket, repairThresholds } from './basket-solver.mjs';
import { runFeeDriftCheck } from '../harness/fee-drift-check.mjs';
import { runContractTests } from '../harness/contract-tests.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.COMPARE_PORT || 3050;

// Explicitly serve compare.html on root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/compare.html'));
});

// Suppress 404 for favicon
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'), { index: false }));

// In-memory staples store (seeded with verified household staples)
let userStaples = [
  { id: 'st_1', name: 'Amul Taaza Milk 500ml', price: 27, category: 'dairy', platform: 'zepto' },
  { id: 'st_2', name: 'Modern Brown Bread 400g', price: 45, category: 'bakery', platform: 'zepto' },
  { id: 'st_3', name: 'Surf Excel Easy Wash 1kg', price: 140, category: 'detergent', platform: 'instamart' },
  { id: 'st_4', name: 'Tata Salt 1kg', price: 28, category: 'staples', platform: 'blinkit' },
  { id: 'st_5', name: 'Maggi 2-Minute Noodles 4-Pack', price: 56, category: 'snacks', platform: 'zepto' }
];

// 1. API: Load versioned fees configuration (seeded with Oct 2026 values)
app.get('/api/fees', (req, res) => {
  try {
    const config = loadFeesConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. API: Solve basket using Aegis Branch-and-Bound / MILP formulation
app.post('/api/basket/solve', (req, res) => {
  try {
    const { items, offers, platforms = ['zepto', 'blinkit', 'instamart'], ctx = {}, options = {} } = req.body;
    if (!items || !offers) {
      return res.status(400).json({ error: 'Missing items or offers in request body' });
    }

    const solution = solveBasket(items, offers, platforms, ctx, options);
    
    // Automatically evaluate threshold repairs for the displayed plan
    const activePlan = solution.show_split ? solution.overall_best : (solution.single_app || solution.overall_best);
    const thresholdRepairs = activePlan ? repairThresholds(activePlan, userStaples, ctx) : [];

    res.json({
      ...solution,
      threshold_repairs: thresholdRepairs
    });
  } catch (err) {
    console.error('[API /api/basket/solve] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. API: User staples list management
app.get('/api/staples', (req, res) => {
  res.json(userStaples);
});

app.post('/api/staples', (req, res) => {
  const { name, price, category, platform } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' });
  }
  const newStaple = {
    id: `st_${Date.now()}`,
    name: name.trim(),
    price: Number(price),
    category: category || 'general',
    platform: platform || 'all'
  };
  userStaples.push(newStaple);
  res.json({ success: true, staple: newStaple, staples: userStaples });
});

// 4. API: Single product live compare (enhanced with normalized fields & freshness tags)
app.get('/api/compare', async (req, res) => {
  const query = req.query.q || 'Amul Butter';
  const loc = req.query.loc || 'Bengaluru (HSR Layout)';
  console.log(`[API /api/compare] Request for: "${query}" at [${loc}]`);
  try {
    const rawData = await runComparison(query, loc);
    const comparisons = (rawData.matched || []).map(m => {
      const bPrice = Number(m.blinkit?.price || 0);
      const zPrice = Number(m.zepto?.price || 0);
      // Retain the matcher's unit-rate anti-shrinkflation winner instead of overriding with sticker price!
      const winner = (m.winner || (bPrice < zPrice ? 'Blinkit' : (zPrice < bPrice ? 'Zepto' : 'Tied'))).toLowerCase();
      const savings = m.savings !== undefined ? m.savings : (m.savings_rupees !== undefined ? m.savings_rupees : Math.abs(bPrice - zPrice));

      return {
        canonical_title: m.canonical_title || m.title,
        pack_size: m.weight || 'Standard Pack',
        winner: winner,
        savings_rupees: savings,
        unitRate: m.unitRate || { unit: 'g', blinkitRate: null, zeptoRate: null },
        unit_price: m.unit_price || {
          unit: m.unitRate?.unit || 'g',
          blinkit: m.unitRate?.blinkitRate || null,
          zepto: m.unitRate?.zeptoRate || null
        },
        freshness: rawData.freshness || 'live',
        observed_at: rawData.timestamp || new Date().toISOString(),
        blinkit: {
          name: m.blinkit?.name || m.title,
          selling_price: bPrice,
          mrp: Number(m.blinkit?.mrp || bPrice),
          weight: m.blinkit?.weight || m.weight,
          unit_price: m.unit_price?.blinkit || m.unitRate?.blinkitRate || null,
          url: m.blinkit?.url || `https://blinkit.com/s/?q=${encodeURIComponent(m.title)}`,
          image: m.blinkit?.image || '',
          in_stock: true
        },
        zepto: {
          name: m.zepto?.name || m.title,
          selling_price: zPrice,
          mrp: Number(m.zepto?.mrp || zPrice),
          weight: m.zepto?.weight || m.weight,
          unit_price: m.unit_price?.zepto || m.unitRate?.zeptoRate || null,
          url: m.zepto?.url || `https://www.zepto.com/search?query=${encodeURIComponent(m.title)}`,
          image: m.zepto?.image || '',
          in_stock: true
        }
      };
    });

    const maxSavings = comparisons.reduce((max, c) => Math.max(max, c.savings_rupees), 0);

    res.json({
      query: rawData.query || query,
      location: loc,
      timestamp: rawData.timestamp || new Date().toISOString(),
      freshness: rawData.freshness || 'live',
      from_cache: rawData.from_cache || false,
      total_scanned_items: rawData.totalFound || (comparisons.length * 2),
      blinkit_count: rawData.blinkitCount || comparisons.length,
      zepto_count: rawData.zeptoCount || comparisons.length,
      matched_count: comparisons.length,
      max_potential_savings: maxSavings,
      comparisons: comparisons
    });
  } catch (err) {
    console.error(`[API /api/compare] Error:`, err);
    res.status(500).json({ error: err.message });
  }
});

// 5. API: Popular Categories & Curated Staples
app.get('/api/popular-categories', (req, res) => {
  res.json([
    {
      id: 'dairy',
      name: 'Dairy & Breakfast',
      icon: '🥛',
      queries: ['Amul Butter', 'Amul Milk', 'Nandini Milk', 'Curd', 'Paneer']
    },
    {
      id: 'atta_rice',
      name: 'Atta, Rice & Dal',
      icon: '🌾',
      queries: ['Aashirvaad Atta', 'Fortune Chakki Atta', 'Basmati Rice', 'Tata Sampann Toor Dal']
    },
    {
      id: 'oils',
      name: 'Edible Oils & Ghee',
      icon: '🫒',
      queries: ['Fortune Oil', 'Amul Ghee', 'Saffola Gold', 'Mustard Oil']
    },
    {
      id: 'beverages',
      name: 'Cold Drinks & Juices',
      icon: '🥤',
      queries: ['Coca Cola', 'Thums Up', 'Sprite', 'Diet Coke', 'Real Juice']
    },
    {
      id: 'snacks',
      name: 'Instant Food & Snacks',
      icon: '🍜',
      queries: ['Maggi', 'Lay\'s Chips', 'Kurkure', 'Britannia Biscuits']
    },
    {
      id: 'cleaning',
      name: 'Cleaning & Household',
      icon: '🧼',
      queries: ['Surf Excel', 'Vim Liquid', 'Dettol Soap', 'Harpic']
    }
  ]);
});

// 6. API: Harness status and contract test results (source='harness')
app.get('/api/harness/status', async (req, res) => {
  try {
    const drift = await runFeeDriftCheck();
    const contracts = await runContractTests();
    res.json({
      source: 'harness',
      fee_drift: drift,
      contracts: contracts
    });
  } catch (err) {
    res.status(500).json({ error: err.message, source: 'harness' });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Aegis QuickCompare Server running on http://localhost:${PORT}`);
  console.log(`⚡ Phase 1 Active: Versioned Fees, Basket MILP Solver,`);
  console.log(`   Threshold Repair & Freshness Gating Configured`);
  console.log(`======================================================\n`);
});
