import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { solveBasket, repairThresholds } from '../src/basket-solver.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// In-memory staples store
let userStaples = [
  { id: 'st_1', name: 'Amul Taaza Milk 500ml', price: 27, category: 'dairy', platform: 'zepto' },
  { id: 'st_2', name: 'Modern Brown Bread 400g', price: 45, category: 'bakery', platform: 'zepto' },
  { id: 'st_3', name: 'Surf Excel Easy Wash 1kg', price: 140, category: 'detergent', platform: 'instamart' },
  { id: 'st_4', name: 'Tata Salt 1kg', price: 28, category: 'staples', platform: 'blinkit' },
  { id: 'st_5', name: 'Maggi 2-Minute Noodles 4-Pack', price: 56, category: 'snacks', platform: 'zepto' }
];

// Load Fees Config
function loadFees() {
  const p = path.join(__dirname, '../config/fees.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// 1. Root: Serve HTML
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, '../public/compare.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send('QuickCompare Engine v2.0 Active');
  }
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

// 2. Fees API
app.get('/api/fees', (req, res) => {
  try {
    res.json(loadFees());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Basket Solver API (MILP + Split Gate)
app.post('/api/basket/solve', (req, res) => {
  try {
    const { items, offers, platforms = ['zepto', 'blinkit', 'instamart'], ctx = {}, options = {} } = req.body;
    if (!items || !offers) {
      return res.status(400).json({ error: 'Missing items or offers' });
    }

    const solution = solveBasket(items, offers, platforms, ctx, options);
    const activePlan = solution.show_split ? solution.overall_best : (solution.single_app || solution.overall_best);
    const thresholdRepairs = activePlan ? repairThresholds(activePlan, userStaples, ctx) : [];

    res.json({
      ...solution,
      threshold_repairs: thresholdRepairs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Staples API
app.get('/api/staples', (req, res) => res.json(userStaples));

app.post('/api/staples', (req, res) => {
  const { name, price, category, platform } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Name and price required' });
  const item = {
    id: `st_${Date.now()}`,
    name: name.trim(),
    price: Number(price),
    category: category || 'general',
    platform: platform || 'all'
  };
  userStaples.push(item);
  res.json({ success: true, staple: item, staples: userStaples });
});

// 5. Popular Categories
app.get('/api/popular-categories', (req, res) => {
  res.json([
    { id: 'dairy', name: 'Dairy & Breakfast', icon: '🥛', queries: ['Amul Butter', 'Amul Milk', 'Nandini Milk'] },
    { id: 'atta', name: 'Atta, Rice & Dal', icon: '🌾', queries: ['Aashirvaad Atta', 'Fortune Chakki Atta'] },
    { id: 'beverages', name: 'Cold Drinks', icon: '🥤', queries: ['Coca Cola', 'Thums Up', 'Sprite'] },
    { id: 'snacks', name: 'Instant Food', icon: '🍜', queries: ['Maggi', 'Lay\'s Chips'] },
    { id: 'oils', name: 'Edible Oils', icon: '🫒', queries: ['Fortune Oil', 'Saffola Gold'] }
  ]);
});

// 6. Verified Product Compare (Cloud Serverless Adapter)
const VERIFIED_GOLDEN_SNAPSHOTS = {
  'amul butter': [
    {
      canonical_title: 'Amul Butter - Pasteurized (Salted)',
      pack_size: '500 g',
      winner: 'zepto',
      savings_rupees: 5,
      unitRate: { unit: 'g', blinkitRate: '₹55.0 / 100g', zeptoRate: '₹54.0 / 100g' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Amul Butter - Pasteurized 500g', selling_price: 275, mrp: 275, weight: '500 g', url: 'https://blinkit.com/prn/1749', in_stock: true },
      zepto: { name: 'Amul Butter - Pasteurized 500g', selling_price: 270, mrp: 275, weight: '500 g', url: 'https://www.zepto.com/search?query=Amul%20Butter', in_stock: true }
    },
    {
      canonical_title: 'Amul Butter - Pasteurized (Salted)',
      pack_size: '100 g',
      winner: 'tied',
      savings_rupees: 0,
      unitRate: { unit: 'g', blinkitRate: '₹58.0 / 100g', zeptoRate: '₹58.0 / 100g' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Amul Butter - Pasteurized 100g', selling_price: 58, mrp: 60, weight: '100 g', url: 'https://blinkit.com/prn/1748', in_stock: true },
      zepto: { name: 'Amul Butter - Pasteurized 100g', selling_price: 58, mrp: 60, weight: '100 g', url: 'https://www.zepto.com/search?query=Amul%20Butter', in_stock: true }
    }
  ],
  'aashirvaad atta': [
    {
      canonical_title: 'Superior MP Wheat Atta, 0% Maida | Aashirvaad',
      pack_size: '10000 g',
      winner: 'blinkit',
      savings_rupees: 78,
      unitRate: { unit: 'g', blinkitRate: '₹4.57 / 100g', zeptoRate: '₹5.35 / 100g' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Aashirvaad Shudh Chakki Atta (100% Atta, 0% Maida)', selling_price: 457, mrp: 540, weight: '10 kg', url: 'https://blinkit.com/s/?q=Aashirvaad%20Atta', in_stock: true },
      zepto: { name: 'Superior MP Wheat Atta, 0% Maida | Aashirvaad', selling_price: 535, mrp: 654, weight: '10 kg', url: 'https://www.zepto.com/search?query=Aashirvaad%20Atta', in_stock: true }
    },
    {
      canonical_title: 'Superior MP Wheat Atta, 0% Maida | Aashirvaad',
      pack_size: '5000 g',
      winner: 'blinkit',
      savings_rupees: 54,
      unitRate: { unit: 'g', blinkitRate: '₹4.88 / 100g', zeptoRate: '₹5.96 / 100g' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Aashirvaad Shudh Chakki Atta (100% Atta, 0% Maida, 5 Kg)', selling_price: 244, mrp: 310, weight: '5 kg', url: 'https://blinkit.com/s/?q=Aashirvaad%20Atta', in_stock: true },
      zepto: { name: 'Superior MP Wheat Atta, 0% Maida | Aashirvaad', selling_price: 298, mrp: 350, weight: '5 kg', url: 'https://www.zepto.com/search?query=Aashirvaad%20Atta', in_stock: true }
    },
    {
      canonical_title: 'Aashirvaad Select 100% MP Sharbati Atta',
      pack_size: '5000 g',
      winner: 'zepto',
      savings_rupees: 15,
      unitRate: { unit: 'g', blinkitRate: '₹6.50 / 100g', zeptoRate: '₹6.20 / 100g' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Aashirvaad Select 100% MP Sharbati Atta', selling_price: 325, mrp: 360, weight: '5 kg', url: 'https://blinkit.com/s/?q=Aashirvaad%20Atta', in_stock: true },
      zepto: { name: 'Aashirvaad Select | Pure MP Sharbati Wheat Atta', selling_price: 310, mrp: 360, weight: '5 kg', url: 'https://www.zepto.com/search?query=Aashirvaad%20Atta', in_stock: true }
    }
  ],
  'coca cola': [
    {
      canonical_title: 'Coca-Cola PET Soft Drink',
      pack_size: '750 ml',
      winner: 'tied',
      savings_rupees: 0,
      unitRate: { unit: 'ml', blinkitRate: '₹5.33 / 100ml', zeptoRate: '₹5.33 / 100ml' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Coca-Cola Soft Drink 750ml', selling_price: 40, mrp: 40, weight: '750 ml', url: 'https://blinkit.com/s/?q=Coca%20Cola', in_stock: true },
      zepto: { name: 'Coca-Cola PET 750ml', selling_price: 40, mrp: 40, weight: '750 ml', url: 'https://www.zepto.com/search?query=Coca%20Cola', in_stock: true }
    }
  ],
  'maggi': [
    {
      canonical_title: 'Maggi 2-Minute Masala Instant Noodles',
      pack_size: '280 g (4-Pack)',
      winner: 'blinkit',
      savings_rupees: 2,
      unitRate: { unit: 'g', blinkitRate: '₹20.0 / 100g', zeptoRate: '₹20.71 / 100g' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Maggi 2-Minute Masala Instant Noodles 280g (4-Pack)', selling_price: 56, mrp: 60, weight: '280 g', url: 'https://blinkit.com/s/?q=Maggi', in_stock: true },
      zepto: { name: 'Maggi 2-Minute Masala Noodles 280g (4-Pack)', selling_price: 58, mrp: 60, weight: '280 g', url: 'https://www.zepto.com/search?query=Maggi', in_stock: true }
    }
  ],
  'fortune oil': [
    {
      canonical_title: 'Fortune Sunlite Refined Sunflower Oil',
      pack_size: '1 L',
      winner: 'zepto',
      savings_rupees: 8,
      unitRate: { unit: 'ml', blinkitRate: '₹14.9 / 100ml', zeptoRate: '₹14.1 / 100ml' },
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      blinkit: { name: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', selling_price: 149, mrp: 165, weight: '1 L', url: 'https://blinkit.com/s/?q=Fortune%20Oil', in_stock: true },
      zepto: { name: 'Fortune Sunlite Refined Sunflower Oil 1L Pouch', selling_price: 141, mrp: 165, weight: '1 L', url: 'https://www.zepto.com/search?query=Fortune%20Oil', in_stock: true }
    }
  ]
};

app.get('/api/compare', async (req, res) => {
  const query = req.query.q || 'Amul Butter';
  const loc = req.query.loc || 'Bengaluru (HSR Layout)';
  const q = query.toLowerCase().trim();

  // 1. If live scraper tunnel configured, proxy to live worker
  const tunnelUrl = process.env.SCRAPER_TUNNEL_URL;
  if (tunnelUrl) {
    try {
      const liveRes = await fetch(`${tunnelUrl.replace(/\/$/, '')}/api/compare?q=${encodeURIComponent(query)}&loc=${encodeURIComponent(loc)}`, {
        signal: AbortSignal.timeout(6500)
      });
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        return res.json(liveData);
      }
    } catch (e) {
      console.warn('[VercelAdapter] Live worker tunnel unreachable:', e.message);
    }
  }

  // 2. Pre-indexed snapshots with 100% honesty
  const matched = VERIFIED_GOLDEN_SNAPSHOTS[q];
  if (matched) {
    const maxSavings = matched.reduce((max, c) => Math.max(max, c.savings_rupees), 0);
    return res.json({
      query,
      location: loc,
      source: 'snapshot',
      freshness: 'stale',
      observed_at: '2026-10-20T06:00:00Z',
      from_cache: true,
      total_scanned_items: matched.length * 2,
      blinkit_count: matched.length,
      zepto_count: matched.length,
      matched_count: matched.length,
      max_potential_savings: maxSavings,
      comparisons: matched,
      note: 'Served from verified golden snapshot. For arbitrary live multi-platform scraping, connect local worker with Chrome debugging enabled.'
    });
  }

  // 3. Honest 404 for un-cached queries on serverless edge
  return res.status(404).json({
    error: 'Query not in pre-indexed snapshot',
    query,
    source: 'serverless-edge',
    freshness: 'unavailable',
    message: `Query "${query}" requires live browser scraping. No edge snapshot found. Run the local engine with Chrome port 9222 for live multi-platform searches. Available snapshots: ${Object.keys(VERIFIED_GOLDEN_SNAPSHOTS).join(', ')}.`
  });
});

export default app;
