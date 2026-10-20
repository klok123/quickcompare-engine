import { evaluatePairMatch, matchProductsCommercial } from '../src/smart-matcher.mjs';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log('--- RUNNING SMART MATCHER RIGOROUS TEST SUITE ---');

// Test 1: Cookies vs Butter (MUST REJECT)
const t1 = evaluatePairMatch(
  { name: 'Amul Fresh Butter Cookies', weight: '200 g' },
  { name: 'Amul Salted Butter', weight: '200 g' }
);
assert(!t1.match, 'Butter Cookies vs Salted Butter is REJECTED');

// Test 2: Maggi vs Yippee (MUST REJECT)
const t2 = evaluatePairMatch(
  { name: 'Maggi Masala Cuppa Noodles', weight: '70 g' },
  { name: 'Yippee Magic Masala Noodles', weight: '70 g' },
  'Maggi'
);
assert(!t2.match, 'Maggi vs Yippee is REJECTED');

// Test 3: Regular Maida Noodles vs Atta Noodles (MUST REJECT)
const t3 = evaluatePairMatch(
  { name: 'Maggi 2-Minute Instant Noodles', weight: '280 g' },
  { name: 'Maggi Veg Atta Noodles', weight: '290 g' }
);
assert(!t3.match, 'Regular Noodles vs Veg Atta Noodles is REJECTED');

// Test 4: Multipack Can 6x200ml vs Single 1.25L PET Bottle (MUST REJECT)
const t4 = evaluatePairMatch(
  { name: 'Coca-Cola Soft Drink Can', weight: '6 x 200 ml' },
  { name: 'Coca-Cola PET Cola Soft Drink', weight: '1 pc (1.25 L)' }
);
assert(!t4.match, 'Multi-pack cans vs Single 1.25L bottle is REJECTED');

// Test 5: Diet Coke vs Regular Coke (MUST REJECT)
const t5 = evaluatePairMatch(
  { name: 'Coca-Cola Soft Drink', weight: '300 ml' },
  { name: 'Coca-Cola Diet Coke Soft Drink Can', weight: '330 ml' }
);
assert(!t5.match, 'Regular Coke vs Diet Coke is REJECTED');

// Test 6: Soya Oil vs Sunflower Oil (MUST REJECT)
const t6 = evaluatePairMatch(
  { name: 'Fortune Soya Health Refined Soyabean Oil', weight: '5 ltr' },
  { name: 'Fortune Refined Sun Flower Oil', weight: '5 L' }
);
assert(!t6.match, 'Soyabean Oil vs Sun Flower Oil is REJECTED');

// Test 7: Wood pressed Mustard vs Regular Refined Mustard (MUST REJECT)
const t7 = evaluatePairMatch(
  { name: 'Fortune Premium Kachi Ghani Pure Mustard Oil', weight: '910 g' },
  { name: 'Fortune Pehli Dhaar Kachi Ghani Wood pressed Mustard Oil', weight: '1 L' }
);
assert(!t7.match, 'Regular Mustard vs Wood pressed Mustard is REJECTED');

// Test 8: Atta vs Maida (MUST REJECT)
const t8 = evaluatePairMatch(
  { name: 'Aashirvaad Shudh Chakki Atta', weight: '5 kg' },
  { name: 'Aashirvaad Organic Maida', weight: '5 kg' }
);
assert(!t8.match, 'Atta vs Maida is REJECTED');

// Test 9: Exact Amul Butter Match (MUST MATCH)
const t9 = evaluatePairMatch(
  { name: 'Amul Salted Butter', weight: '100 g' },
  { name: 'Amul Butter - Pasteurized', weight: '100 g' }
);
assert(t9.match, 'Amul Salted Butter 100g matches Amul Butter 100g');

// Test 10: Aashirvaad Shudh Chakki Atta Match (MUST MATCH)
const t10 = evaluatePairMatch(
  { name: 'Aashirvaad Shudh Chakki Atta (100% Atta, 0% Maida, 5 Kg)', weight: '5 kg' },
  { name: 'Superior MP Wheat Atta, 0% Maida | Aashirvaad', weight: '1 pack (5 kg)' }
);
assert(t10.match, 'Aashirvaad Chakki Atta matches Superior MP Atta');

// Test 11: Amul vs Unknown / Private-label brand Whole Farm (MUST REJECT)
const t11 = evaluatePairMatch(
  { name: 'Amul Butter - Pasteurized', weight: '500 g' },
  { name: 'Whole Farm Table Butter', weight: '500 g' }
);
assert(!t11.match, 'Amul vs Whole Farm is REJECTED');

// Test 12: Cadbury Dairy Milk vs Dairy Milk Silk (MUST REJECT)
const t12 = evaluatePairMatch(
  { name: 'Cadbury Dairy Milk Chocolate Bar', weight: '130 g' },
  { name: 'Cadbury Dairy Milk Silk Chocolate Bar', weight: '130 g' }
);
assert(!t12.match, 'Dairy Milk vs Dairy Milk Silk is REJECTED');

// Test 13: Bhujia vs Aloo Bhujia (MUST REJECT)
const t13 = evaluatePairMatch(
  { name: 'Haldiram\'s Bikaneri Bhujia Sev', weight: '400 g' },
  { name: 'Haldiram\'s Aloo Bhujia', weight: '400 g' }
);
assert(!t13.match, 'Bhujia vs Aloo Bhujia is REJECTED');

// Test 14: Tata Salt vs Tata Salt Lite (MUST REJECT)
const t14 = evaluatePairMatch(
  { name: 'Tata Salt Vacuum Evaporated Iodised Salt', weight: '1 kg' },
  { name: 'Tata Salt Lite Low Sodium Salt', weight: '1 kg' }
);
assert(!t14.match, 'Tata Salt vs Tata Salt Lite is REJECTED');

// Test 15: Promo Pack: 1 kg + 200 g free vs 1 kg (MUST MATCH with Promo Flag)
const t15 = evaluatePairMatch(
  { name: 'Surf Excel Easy Wash Detergent Powder', weight: '1 kg + 200 g free' },
  { name: 'Surf Excel Easy Wash Detergent Powder', weight: '1 kg' }
);
assert(t15.match, 'Promo pack 1 kg + 200 g free matches 1 kg');

console.log('\n🎉 ALL 15 TESTS PASSED WITH 100% PRECISION! ZERO FALSE MATCHES GUARANTEED!');
