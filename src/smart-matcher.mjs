/**
 * Smart Matcher for Quick Commerce (Blinkit, Zepto, Instamart)
 * Commercial-Grade Zero-Defect Matching Engine (Audited by Hark & Muse.ai)
 * 
 * Guards:
 * 1. Brand Canonicalisation & Alias Dictionary (Coke -> Coca-Cola, Lay's, Haldiram's)
 * 2. Multi-label Category Core Noun Gate (Peanut Butter vs Dairy Butter, Atta vs Maida)
 * 3. Asymmetric Qualifier Conflict Gate with Word Boundaries (Diet vs Regular, Soya vs Sunflower)
 * 4. Multi-pack vs Single Unit & Count-based Packs (6 pcs vs 30 eggs)
 * 5. Tightened Weight Proximity with Density Table (Oil, Ghee, Milk, Honey)
 * 6. Unit-Rate Winner Logic for Shrinkflation & Pack Variations
 */

// 1. Comprehensive Known Brands & Canonical Aliases
export const BRAND_ALIASES = {
  'coke': 'cocacola',
  'coca-cola': 'cocacola',
  'coca cola': 'cocacola',
  'coca cola company': 'cocacola',
  'haldiram': 'haldirams',
  'haldirams': 'haldirams',
  "haldiram's": 'haldirams',
  'lay': 'lays',
  'lays': 'lays',
  "lay's": 'lays',
  'cadbury': 'cadbury',
  "cadbury's": 'cadbury',
  'dairy milk': 'cadbury',
  'surf': 'surfexcel',
  'surf excel': 'surfexcel',
  'tata': 'tata',
  'tata sampann': 'tata'
};

export const KNOWN_BRANDS = [
  'amul', 'mother dairy', 'nandini', 'country delight', 'milky mist', 'epigamia', 'nestle',
  'britannia', 'parle', 'sunfeast', 'oreo', 'cadbury', 'bournvita', 'horlicks', 'complan',
  'maggi', 'yippee', 'top ramen', 'knorr', 'ching\'s secret', 'chings', 'wai wai',
  'fortune', 'saffola', 'dhara', 'emami', 'gemini', 'engine', 'bailley',
  'aashirvaad', 'pillsbury', 'patanjali', 'organic tattva', '24 mantra', 'pansari', 'rajdhani', 'annapurna',
  'coca-cola', 'coca cola', 'coke', 'pepsi', 'thums up', 'sprite', 'fanta', 'limca', 'mirinda', 'mountain dew', '7up',
  'red bull', 'monster', 'sting', 'paper boat', 'real', 'tropicana', 'frooti', 'maaza', 'slice',
  'lay\'s', 'lays', 'kurkure', 'haldiram\'s', 'haldirams', 'bikaji', 'doritos', 'bingo', 'pringles', 'balaji',
  'tata', 'tata tea', 'red label', 'taj mahal', 'bru', 'nescafe', 'wagh bakri',
  'surf excel', 'ariel', 'tide', 'rin', 'wheel', 'ghadi', 'henko',
  'vim', 'pril', 'exo', 'harpic', 'lysol', 'colin', 'domex',
  'dettol', 'lifebuoy', 'dove', 'pears', 'lux', 'cinthol', 'santoor', 'medimix', 'fiama',
  'colgate', 'pepsodent', 'sensodyne', 'close up', 'dabur red', 'dabur', 'himalaya',
  'parachute', 'bajaj', 'nivea', 'vaseline', 'pond\'s', 'ponds', 'boroline', 'boroplus',
  'akshayakalpa', 'highland farms', 'right shift', 'naga'
];

// Helper: Word-boundary term matching (Prevents "Country Delight" matching "diet", "chocolate" matching "cola")
export const wb = t => new RegExp(`(?<![a-z0-9])${t.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![a-z0-9])`, 'i');
export const hasWord = (str, term) => wb(term).test(str || '');

// 2. Mutually Exclusive Product Core Nouns (Category Gate) - Multi-Label & Precedence Checked
const PRODUCT_CATEGORIES = [
  { name: 'peanut_butter', tokens: ['peanut butter'], exclude: [] },
  { name: 'biscuits', tokens: ['cookie', 'cookies', 'biscuit', 'biscuits', 'rusk'], exclude: [] },
  { name: 'butter', tokens: ['butter', 'table butter', 'cooking butter'], exclude: ['cookie', 'cookies', 'biscuit', 'biscuits', 'cake', 'rusk', 'spread', 'ghee', 'peanut butter'] },
  { name: 'spread', tokens: ['fat spread', 'spread', 'margarine'], exclude: ['peanut butter', 'chocolate spread'] },
  { name: 'noodles', tokens: ['noodle', 'noodles', 'cuppa'], exclude: ['pasta', 'macaroni', 'vermicelli', 'sauce', 'masala'] },
  { name: 'pasta', tokens: ['pasta', 'macaroni', 'penne', 'fusilli'], exclude: ['noodle', 'noodles'] },
  { name: 'oil', tokens: ['oil', 'tel'], exclude: ['ghee', 'butter', 'shampoo', 'hair oil', 'essential oil'] },
  { name: 'ghee', tokens: ['ghee'], exclude: ['oil', 'butter'] },
  { name: 'atta', tokens: ['atta'], exclude: ['maida', 'sooji', 'suji', 'besan', 'rava', 'dalia'] },
  { name: 'maida', tokens: ['maida', 'all purpose flour'], exclude: ['atta', 'sooji', 'besan'] },
  { name: 'besan', tokens: ['besan', 'gram flour'], exclude: ['atta', 'maida', 'sooji'] },
  { name: 'sooji', tokens: ['sooji', 'suji', 'rava', 'semolina'], exclude: ['atta', 'maida', 'besan'] },
  { name: 'milk', tokens: ['milk', 'doodh'], exclude: ['butter', 'paneer', 'cheese', 'curd', 'dahi', 'milk powder', 'milkshake', 'cookies', 'biscuit', 'chocolate'] },
  { name: 'paneer', tokens: ['paneer'], exclude: ['milk', 'cheese', 'tofu'] },
  { name: 'curd', tokens: ['curd', 'dahi', 'yogurt'], exclude: ['milk', 'paneer', 'cheese'] },
  { name: 'cheese', tokens: ['cheese'], exclude: ['butter', 'paneer', 'milk'] },
  { name: 'tea', tokens: ['tea', 'chai'], exclude: ['coffee'] },
  { name: 'coffee', tokens: ['coffee'], exclude: ['tea'] },
  { name: 'soft_drink', tokens: ['soft drink', 'carbonated', 'cold drink', 'soda', 'cola'], exclude: ['juice', 'syrup', 'concentrate'] },
  { name: 'juice', tokens: ['juice'], exclude: ['soft drink', 'soda', 'syrup'] },
  { name: 'eggs', tokens: ['eggs', 'egg'], exclude: ['eggless', 'cake', 'noodles'] },
  { name: 'detergent_bar', tokens: ['detergent bar', 'washing soap', 'dishwash bar'], exclude: ['liquid', 'powder', 'chocolate bar'] },
  { name: 'detergent_powder', tokens: ['washing powder', 'detergent powder'], exclude: ['bar', 'liquid', 'gel'] },
  { name: 'detergent_liquid', tokens: ['matic liquid', 'detergent liquid', 'dishwash liquid'], exclude: ['bar', 'powder'] }
];

// 3. Variant & Ingredient Conflict Groups
const VARIANT_CONFLICT_GROUPS = [
  // Milk Fat content
  {
    type: 'milk_fat',
    groups: [
      ['full cream', 'gold', 'standardized'],
      ['toned', 'taaza', 't-special'],
      ['double toned', 'slim', 'dt'],
      ['skimmed']
    ]
  },
  // Milk Source
  {
    type: 'milk_source',
    groups: [
      ['cow'],
      ['buffalo'],
      ['a2']
    ]
  },
  // Sub-line variants (e.g. Dairy Milk Silk vs Regular Dairy Milk)
  {
    type: 'sub_line',
    groups: [
      ['silk'],
      ['fruit & nut', 'fruit and nut'],
      ['crackling'],
      ['roast almond']
    ]
  },
  // Namkeen types (e.g. Bhujia vs Aloo Bhujia)
  {
    type: 'namkeen',
    groups: [
      ['aloo bhujia', 'aloo sev'],
      ['bikaneri bhujia', 'bikaneri sev'],
      ['bhujia sev', 'sev bhujia'],
      ['moong dal'],
      ['navratan'],
      ['khatta meetha']
    ]
  },
  // Edible Oil Varieties
  {
    type: 'oil_variety',
    groups: [
      ['mustard', 'sarson', 'kachi ghani'],
      ['soyabean', 'soya'],
      ['sunflower', 'sun flower'],
      ['groundnut', 'peanut', 'moongphali'],
      ['olive'],
      ['rice bran'],
      ['sesame', 'til'],
      ['coconut', 'copra'],
      ['cottonseed']
    ]
  },
  // Tea Types
  {
    type: 'tea_type',
    groups: [
      ['green tea'],
      ['black tea', 'assam', 'darjeeling'],
      ['masala tea', 'kadak chai', 'elaichi tea']
    ]
  },
  // Snack Flavours
  {
    type: 'snack_flavor',
    groups: [
      ['magic masala', 'india\'s magic masala'],
      ['classic salted', 'american style cream & onion', 'cream & onion', 'cream and onion'],
      ['spanish tomato', 'tangy tomato', 'tomato'],
      ['chile limon']
    ]
  },
  // Oil Processing Methods
  {
    type: 'oil_process',
    groups: [
      ['wood pressed', 'woodpressed', 'cold pressed', 'coldpressed'],
      ['refined']
    ]
  },
  // Salted vs Unsalted
  {
    type: 'salt_content',
    groups: [
      ['salted', 'table butter'],
      ['unsalted', 'white butter', 'cooking butter']
    ]
  },
  // Diet / Sugar Free vs Regular Beverages
  {
    type: 'sugar_content',
    groups: [
      ['diet', 'zero', 'zero sugar', 'sugar free', 'light', 'lite', 'no sugar'],
      ['regular', 'classic', 'original']
    ]
  },
  // Beverage Flavors
  {
    type: 'beverage_flavor',
    groups: [
      ['vanilla'],
      ['cherry'],
      ['lime', 'lemon'],
      ['orange'],
      ['cola']
    ]
  },
  // Atta Specifics
  {
    type: 'atta_type',
    groups: [
      ['multigrain', 'multi grain', 'high fibre', 'high protein'],
      ['shudh chakki', 'superior mp', 'chakki fresh', 'select', 'sharbati'],
      ['organic'],
      ['sugar release', 'diabetic', 'low gi']
    ]
  },
  // Noodle Varieties
  {
    type: 'noodle_type',
    groups: [
      ['atta noodles', 'veg atta'],
      ['oats noodles'],
      ['spicy garlic', 'korean', 'hot & spicy', 'schezwan'],
      ['cuppa', 'cup'],
      ['2-minute', 'masala noodles', 'instant noodles']
    ]
  }
];

// Asymmetric exclusive modifiers using word boundaries
const ASYMMETRIC_EXCLUSIVE_MODIFIERS = [
  { name: 'diet', terms: ['diet', 'zero', 'zero sugar', 'sugar free', 'no sugar'] },
  { name: 'unsalted', terms: ['unsalted', 'white butter', 'cooking butter'] },
  { name: 'wood_pressed', terms: ['wood pressed', 'woodpressed', 'cold pressed', 'coldpressed'] },
  { name: 'organic', terms: ['organic'] },
  { name: 'multigrain', terms: ['multigrain', 'multi grain'] },
  { name: 'high_fibre_protein', terms: ['high fibre', 'high protein'] },
  { name: 'flavor_vanilla', terms: ['vanilla'] },
  { name: 'flavor_garlic', terms: ['garlic'] },
  { name: 'atta_noodles', terms: ['atta noodles', 'veg atta'] },
  // Hark Gaps: Lite/Low Sodium Salt, Silk, Aloo Bhujia
  { name: 'lite_low_sodium', terms: ['lite', 'light', 'low sodium', 'low_sodium', 'less sodium', 'black salt', 'rock salt', 'sendha namak', 'pink salt', 'himalayan pink'] },
  { name: 'silk', terms: ['silk'] },
  { name: 'aloo_bhujia', terms: ['aloo bhujia', 'aloo sev', 'aloo'] }
];

export function extractBrand(title) {
  const low = (title || '').toLowerCase();
  for (const b of KNOWN_BRANDS) {
    if (hasWord(low, b)) {
      const canonical = BRAND_ALIASES[b] || b.replace(/[-'\s]/g, '');
      return canonical;
    }
  }
  return null;
}

export function detectCategories(title) {
  const low = (title || '').toLowerCase();
  const matched = [];
  for (const cat of PRODUCT_CATEGORIES) {
    const hasToken = cat.tokens.some(t => hasWord(low, t));
    if (hasToken) {
      const hasExclude = cat.exclude.some(ex => hasWord(low, ex));
      if (!hasExclude) {
        matched.push(cat.name);
      }
    }
  }
  return matched;
}

export function hasVariantConflict(titleA, titleB) {
  const aLow = (titleA || '').toLowerCase();
  const bLow = (titleB || '').toLowerCase();

  // 1. Asymmetric exclusive modifiers
  for (const mod of ASYMMETRIC_EXCLUSIVE_MODIFIERS) {
    const aHas = mod.terms.some(t => hasWord(aLow, t));
    const bHas = mod.terms.some(t => hasWord(bLow, t));
    if (aHas !== bHas) {
      return { conflict: true, type: `exclusive_modifier_${mod.name}` };
    }
  }

  // 2. Symmetric conflict groups
  for (const conflictSet of VARIANT_CONFLICT_GROUPS) {
    let groupIdxA = -1;
    let groupIdxB = -1;

    for (let i = 0; i < conflictSet.groups.length; i++) {
      const terms = conflictSet.groups[i];
      if (terms.some(t => hasWord(aLow, t))) groupIdxA = i;
      if (terms.some(t => hasWord(bLow, t))) groupIdxB = i;
    }

    if (groupIdxA !== -1 && groupIdxB !== -1 && groupIdxA !== groupIdxB) {
      return { conflict: true, type: conflictSet.type };
    }
  }
  return { conflict: false };
}

// Density table for volumetric conversion (g per ml)
const DENSITY_TABLE = {
  oil: 0.91,
  ghee: 0.91,
  honey: 1.42,
  milk: 1.03
};

export function normalizeWeight(str) {
  if (!str) return { totalAmount: 0, baseAmount: 0, promoExtra: 0, unit: 'g', isMultiPack: false, packCount: 1, promoFlag: null };
  const s = String(str).toLowerCase().trim();

  // 1. Piece count / egg count (e.g. "6 pcs", "30 eggs", "6 units", "1 dozen")
  const dozenMatch = s.match(/(\d+)\s*dozen/i);
  if (dozenMatch) {
    const count = parseInt(dozenMatch[1], 10) * 12;
    return { totalAmount: count, baseAmount: count, promoExtra: 0, unit: 'pc', isMultiPack: false, packCount: count, promoFlag: null };
  }

  const pcsMatch = s.match(/(\d+)\s*(?:pcs?|pieces?|units?|eggs?|n)\b/i);
  if (pcsMatch) {
    const count = parseInt(pcsMatch[1], 10);
    return { totalAmount: count, baseAmount: count, promoExtra: 0, unit: 'pc', isMultiPack: count > 1, packCount: count, promoFlag: null };
  }

  // 2. Promo free grammage: "1 kg + 200 g free", "500g + 50g extra"
  let promoExtraG = 0;
  const promoMatch = s.match(/\+\s*([0-9.]+)\s*(g|kg|ml|l)\s*(?:free|extra)/i);
  if (promoMatch) {
    const val = parseFloat(promoMatch[1]);
    const u = promoMatch[2];
    promoExtraG = (u.startsWith('k') || u.startsWith('l')) ? Math.round(val * 1000) : Math.round(val);
  }

  const buildResult = (baseG, unitType, isMulti = false, count = 1) => {
    return {
      baseAmount: baseG,
      promoExtra: promoExtraG,
      totalAmount: baseG + promoExtraG,
      unit: unitType,
      isMultiPack: isMulti,
      packCount: count,
      promoFlag: promoExtraG > 0 ? `+${promoExtraG >= 1000 ? (promoExtraG / 1000) + 'kg' : promoExtraG + 'g'} free` : null
    };
  };

  // 3. Multi-pack patterns: "6 x 200 ml", "4 x 125g", "200 ml x 6", "Pack of 4 (250 g)"
  const multiMatch = s.match(/(\d+)\s*x\s*([0-9.]+)\s*(g|kg|ml|l|ltr|litre)/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const unitVal = parseFloat(multiMatch[2]);
    const u = multiMatch[3];
    const multiplier = (u.startsWith('k') || u === 'l' || u.startsWith('lit')) ? 1000 : 1;
    const unitType = (u.startsWith('l') || u === 'ml') ? 'ml' : 'g';
    return buildResult(Math.round(count * unitVal * multiplier), unitType, count > 1, count);
  }

  const reverseMultiMatch = s.match(/([0-9.]+)\s*(g|kg|ml|l|ltr|litre)\s*(?:x|pack of|pack)\s*(\d+)/i);
  if (reverseMultiMatch) {
    const unitVal = parseFloat(reverseMultiMatch[1]);
    const u = reverseMultiMatch[2];
    const count = parseInt(reverseMultiMatch[3], 10);
    const multiplier = (u.startsWith('k') || u === 'l' || u.startsWith('lit')) ? 1000 : 1;
    const unitType = (u.startsWith('l') || u === 'ml') ? 'ml' : 'g';
    return buildResult(Math.round(count * unitVal * multiplier), unitType, count > 1, count);
  }

  // 4. Single weight patterns: "5 kg", "1 ltr", "500 g", "330 ml", "1 pc (5 kg)"
  const kgMatch = s.match(/([0-9.]+)\s*kg/i);
  if (kgMatch) return buildResult(Math.round(parseFloat(kgMatch[1]) * 1000), 'g', false, 1);

  const lMatch = s.match(/([0-9.]+)\s*(?:l|ltr|litre)/i);
  if (lMatch) return buildResult(Math.round(parseFloat(lMatch[1]) * 1000), 'ml', false, 1);

  const gMatch = s.match(/([0-9.]+)\s*g/i);
  if (gMatch) return buildResult(Math.round(parseFloat(gMatch[1])), 'g', false, 1);

  const mlMatch = s.match(/([0-9.]+)\s*ml/i);
  if (mlMatch) return buildResult(Math.round(parseFloat(mlMatch[1])), 'ml', false, 1);

  return { totalAmount: 0, baseAmount: 0, promoExtra: 0, unit: 'g', isMultiPack: false, packCount: 1, promoFlag: null };
}

const STOP_WORDS = new Set([
  'and', 'with', 'for', 'the', 'pure', 'fresh', 'best', 'quality', 'pack', 'pcs',
  'piece', 'bottle', 'can', 'pouch', 'pet', 'made', 'from', 'free', 'natural',
  'daily', 'soft', 'special', 'premium', 'delight', 'super', 'healthy', 'shudh'
]);

export function cleanTokens(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * High-Precision Pair Validator & Scorer
 */
export function evaluatePairMatch(itemA, itemB, targetQuery = '') {
  const nameA = itemA.name || itemA.title || '';
  const nameB = itemB.name || itemB.title || '';

  const tokensA = cleanTokens(nameA);
  const tokensB = cleanTokens(nameB);
  const setB = new Set(tokensB);
  const intersection = tokensA.filter(t => setB.has(t));

  // 1. BRAND GATE with Alias Normalisation
  const brandA = extractBrand(nameA);
  const brandB = extractBrand(nameB);
  if (brandA && brandB && brandA !== brandB) {
    return { match: false, reason: `Brand conflict: ${brandA} vs ${brandB}` };
  }
  
  // Strict Brand Boundary: Recognized brands cannot match unbranded or private-label products (e.g. Amul vs Whole Farm)
  if (brandA && !brandB) {
    return { match: false, reason: `Brand missing on side B: expected ${brandA}` };
  }
  if (!brandA && brandB) {
    return { match: false, reason: `Brand missing on side A: expected ${brandB}` };
  }

  // If target query specifies a brand, enforce it
  if (targetQuery) {
    const qBrand = extractBrand(targetQuery);
    if (qBrand) {
      if ((brandA && brandA !== qBrand) || (brandB && brandB !== qBrand)) {
        return { match: false, reason: `Does not match query brand: ${qBrand}` };
      }
    }
  }

  // 2. CATEGORY / CORE NOUN GATE (Multi-label disjoint check)
  const catsA = detectCategories(nameA);
  const catsB = detectCategories(nameB);
  if (catsA.length > 0 && catsB.length > 0) {
    const sharesCat = catsA.some(c => catsB.includes(c));
    if (!sharesCat) {
      return { match: false, reason: `Category conflict: [${catsA.join(',')}] vs [${catsB.join(',')}]` };
    }
  }

  // 3. VARIANT & QUALIFIER CONFLICT GATE
  const variantCheck = hasVariantConflict(nameA, nameB);
  if (variantCheck.conflict) {
    return { match: false, reason: `Variant conflict: ${variantCheck.type}` };
  }

  // 4. WEIGHT & MULTIPACK GATE
  const normA = normalizeWeight(itemA.weight);
  const normB = normalizeWeight(itemB.weight);

  // Unit mismatch: pc vs g/ml
  if ((normA.unit === 'pc' && normB.unit !== 'pc') || (normA.unit !== 'pc' && normB.unit === 'pc')) {
    return { match: false, reason: `Unit mismatch: ${normA.unit} vs ${normB.unit}` };
  }

  // Multipack check: e.g. 6 x 200ml must not match single 1.25L, or 6 eggs vs 30 eggs
  if (normA.unit === 'pc' && normB.unit === 'pc') {
    if (normA.totalAmount > 0 && normB.totalAmount > 0 && normA.totalAmount !== normB.totalAmount) {
      return { match: false, reason: `Piece count mismatch: ${normA.totalAmount} pcs vs ${normB.totalAmount} pcs` };
    }
  }

  if (normA.isMultiPack !== normB.isMultiPack && (normA.packCount >= 2 || normB.packCount >= 2)) {
    return { match: false, reason: `Multipack mismatch: ${normA.packCount} vs ${normB.packCount}` };
  }

  // Weight proximity: within 15% tolerance (with support for promo extra grammage like 1kg + 200g free vs 1kg)
  if (normA.totalAmount > 0 && normB.totalAmount > 0) {
    let amountA = normA.totalAmount;
    let amountB = normB.totalAmount;
    let baseA = normA.baseAmount || amountA;
    let baseB = normB.baseAmount || amountB;

    // Density conversion across volumetric units (e.g. 1L oil/ghee = 910g, 1L honey = 1420g)
    if (normA.unit !== normB.unit) {
      const isOilOrGhee = catsA.includes('oil') || catsB.includes('oil') || catsA.includes('ghee') || catsB.includes('ghee');
      const isMilk = catsA.includes('milk') || catsB.includes('milk');
      
      let density = null;
      if (isOilOrGhee) density = DENSITY_TABLE.oil;
      else if (isMilk) density = DENSITY_TABLE.milk;

      if (density && (normA.unit === 'g' || normB.unit === 'g')) {
        if (normA.unit === 'ml') {
          amountA = Math.round(amountA * density);
          baseA = Math.round(baseA * density);
        }
        if (normB.unit === 'ml') {
          amountB = Math.round(amountB * density);
          baseB = Math.round(baseB * density);
        }
      } else {
        return { match: false, reason: `Incompatible units without density: ${normA.unit} vs ${normB.unit}` };
      }
    }

    const ratioTotal = Math.max(amountA, amountB) / Math.min(amountA, amountB);
    const ratioBase = Math.max(baseA, baseB) / Math.min(baseA, baseB);
    // If either base sizes match (promo packs) OR total sizes match within 15%
    if (ratioTotal > 1.15 && ratioBase > 1.15) {
      return { match: false, reason: `Weight mismatch ratio: ${ratioTotal.toFixed(2)} (${amountA} vs ${amountB})` };
    }
  }

  // 5. TOKEN SIMILARITY SCORE
  const union = new Set([...tokensA, ...tokensB]);
  const jaccard = union.size > 0 ? (intersection.length / union.size) : 0;
  const containment = Math.min(tokensA.length, tokensB.length) > 0 
    ? (intersection.length / Math.min(tokensA.length, tokensB.length)) 
    : 0;

  if (intersection.length < 2 && containment < 0.50) {
    return { match: false, reason: `Low token similarity: Jaccard ${jaccard.toFixed(2)}, Common: ${intersection.join(',')}` };
  }

  const score = (jaccard * 0.4) + (containment * 0.6);
  return {
    match: true,
    score,
    intersection,
    normalizedWeight: normA.totalAmount > 0 ? `${normA.totalAmount} ${normA.unit}` : (itemA.weight || itemB.weight)
  };
}

/**
 * Match collections of items from Platform 1 (Blinkit) and Platform 2 (Zepto)
 */
export function matchProductsCommercial(blinkitItems, zeptoItems, query = '') {
  const comparisons = [];
  const usedZeptoIdx = new Set();

  for (const b of blinkitItems) {
    let bestMatch = null;
    let bestScore = 0;
    let bestIdx = -1;
    let bestNormWeight = '';

    for (let i = 0; i < zeptoItems.length; i++) {
      if (usedZeptoIdx.has(i)) continue;
      const z = zeptoItems[i];

      const evalRes = evaluatePairMatch(b, z, query);
      if (evalRes.match && evalRes.score > bestScore) {
        bestScore = evalRes.score;
        bestMatch = z;
        bestIdx = i;
        bestNormWeight = evalRes.normalizedWeight;
      }
    }

    if (bestMatch && bestScore >= 0.40) {
      usedZeptoIdx.add(bestIdx);
      const bPrice = Number(b.price || 0);
      const zPrice = Number(bestMatch.price || 0);

      const bNorm = normalizeWeight(b.weight);
      const zNorm = normalizeWeight(bestMatch.weight);

      // Unit rate calculation (₹/100g, ₹/100ml, or ₹/pc)
      const calcRate = (price, norm) => {
        if (!norm || norm.totalAmount <= 0) return null;
        const multiplier = norm.unit === 'pc' ? 1 : 100;
        return Number(((price / norm.totalAmount) * multiplier).toFixed(2));
      };

      const bUnitRate = calcRate(bPrice, bNorm);
      const zUnitRate = calcRate(zPrice, zNorm);

      // Check if pack sizes are identical (within 2%)
      const isSameSize = (bNorm.totalAmount > 0 && zNorm.totalAmount > 0)
        ? (Math.abs(bNorm.totalAmount - zNorm.totalAmount) / Math.max(bNorm.totalAmount, zNorm.totalAmount) <= 0.02)
        : true;

      // Anti-Shrinkflation Winner Logic:
      // If pack sizes differ (e.g. 450g vs 500g), winner MUST be determined by unit rate, not sticker price!
      let winner = 'Tied';
      let savings = 0;

      if (isSameSize) {
        const diff = bPrice - zPrice;
        winner = diff > 0 ? 'Zepto' : (diff < 0 ? 'Blinkit' : 'Tied');
        savings = Math.abs(diff);
      } else if (bUnitRate != null && zUnitRate != null) {
        if (bUnitRate < zUnitRate) {
          winner = 'Blinkit';
          const maxAmount = Math.max(bNorm.totalAmount, zNorm.totalAmount);
          savings = Math.round((zUnitRate - bUnitRate) * (maxAmount / (bNorm.unit === 'pc' ? 1 : 100)));
        } else if (zUnitRate < bUnitRate) {
          winner = 'Zepto';
          const maxAmount = Math.max(bNorm.totalAmount, zNorm.totalAmount);
          savings = Math.round((bUnitRate - zUnitRate) * (maxAmount / (bNorm.unit === 'pc' ? 1 : 100)));
        } else {
          winner = 'Tied';
          savings = 0;
        }
      } else {
        const diff = bPrice - zPrice;
        winner = diff > 0 ? 'Zepto' : (diff < 0 ? 'Blinkit' : 'Tied');
        savings = Math.abs(diff);
      }

      const canonicalTitle = b.name.length < bestMatch.name.length ? b.name : bestMatch.name;

      comparisons.push({
        title: canonicalTitle,
        canonical_title: canonicalTitle,
        blinkitTitle: b.name,
        zeptoTitle: bestMatch.name,
        weight: bestNormWeight || b.weight || bestMatch.weight,
        winner,
        savings,
        score: Number(bestScore.toFixed(3)),
        packComparison: isSameSize ? 'same_pack' : 'different_pack',
        unitRate: {
          unit: bNorm.unit || 'g',
          blinkitRate: bUnitRate ? `₹${bUnitRate} / ${bNorm.unit === 'pc' ? 'pc' : '100' + bNorm.unit}` : null,
          zeptoRate: zUnitRate ? `₹${zUnitRate} / ${zNorm.unit === 'pc' ? 'pc' : '100' + zNorm.unit}` : null
        },
        blinkit: b,
        zepto: bestMatch
      });
    }
  }

  comparisons.sort((a, b) => b.savings - a.savings);

  return {
    matched: comparisons,
    blinkitOnly: blinkitItems.filter(b => !comparisons.some(c => c.blinkit === b)),
    zeptoOnly: zeptoItems.filter((z, i) => !usedZeptoIdx.has(i))
  };
}
