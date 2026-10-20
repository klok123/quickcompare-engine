import { spawn } from 'child_process';
import path from 'path';
import { ensureChromeRunning } from '../src/chrome-launcher.mjs';

/**
 * Autonomous Live Browser E2E QA & Health Tester (Production Suite v2.0)
 * Drives Chrome directly via CDP without taking dumb static screenshots.
 * Tests Location Selector, Single Search, "+ Add to Basket", Floating Cart Bar,
 * Basket Solver, Itemized Receipt Modal, and Threshold Repair interaction.
 */

async function getBrowserSession() {
  await ensureChromeRunning();

  const tabsRes = await fetch('http://127.0.0.1:9222/json/list');
  const tabs = await tabsRes.json();
  
  // Find or create a tab for our app
  let appTab = tabs.find(t => t.url && t.url.includes('3050'));
  if (!appTab) {
    const newTabRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:3050', { method: 'PUT' });
    appTab = await newTabRes.json();
  }

  const ws = new WebSocket(appTab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  const pendingRequests = new Map();
  const consoleLogs = [];
  const jsExceptions = [];
  const networkErrors = [];

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.id && pendingRequests.has(msg.id)) {
        const { resolve, reject } = pendingRequests.get(msg.id);
        pendingRequests.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map(a => a.value || a.description || '').join(' ');
        consoleLogs.push({ type: msg.params.type, text });
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        jsExceptions.push(msg.params.exceptionDetails);
      }
      if (msg.method === 'Network.responseReceived') {
        if (msg.params.response.status >= 400) {
          networkErrors.push({
            url: msg.params.response.url,
            status: msg.params.response.status
          });
        }
      }
    } catch (e) {}
  };

  function sendCDP(method, params = {}) {
    const id = Math.floor(Math.random() * 1000000);
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Enable runtime, network and page listeners
  await sendCDP('Runtime.enable');
  await sendCDP('Network.enable');
  await sendCDP('Page.enable');

  return {
    appTab,
    sendCDP,
    evalJs: async (expression) => {
      const res = await sendCDP('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      return res?.result?.value;
    },
    getLogs: () => ({ consoleLogs, jsExceptions, networkErrors }),
    close: async () => {
      try { ws.close(); } catch (e) {}
      try { await fetch(`http://127.0.0.1:9222/json/close/${appTab.id}`); } catch (e) {}
    }
  };
}

async function runLiveAutonomousTest() {
  console.log('⚡ [Autonomous QA] Connecting directly to Chrome browser engine via CDP...');
  const session = await getBrowserSession();

  console.log('🌐 [Autonomous QA] Navigating to http://localhost:3050 and waiting for DOM readiness...');
  await session.sendCDP('Page.navigate', { url: 'http://localhost:3050/' });
  await new Promise(r => setTimeout(r, 1500));

  const testResults = [];

  // TEST 1: Page Header & Title
  const pageTitle = await session.evalJs('document.title');
  console.log(`✓ Test 1: Page Title = "${pageTitle}"`);
  testResults.push({ test: 'Page Title', passed: pageTitle && pageTitle.includes('QuickCompare') });

  // TEST 2: Location Switcher Modal & Pincode update
  console.log('📍 Test 2: Testing Location Picker & Modal...');
  const locTest = await session.evalJs(`(() => {
    const btn = document.getElementById('btnLocationPicker');
    btn.click();
    const modalVisible = !document.getElementById('locationModal').classList.contains('hidden');
    // Select Mumbai
    const mumbaiBtn = document.querySelector('.loc-option[data-pin="400050"]');
    if (mumbaiBtn) mumbaiBtn.click();
    const modalHidden = document.getElementById('locationModal').classList.contains('hidden');
    const label = document.getElementById('currentLocationLabel').innerText;
    return { modalVisible, modalHidden, label };
  })()`);
  console.log('✓ Test 2 Result:', locTest);
  testResults.push({
    test: 'Location Switcher Interaction',
    passed: locTest?.modalVisible && locTest?.modalHidden && locTest.label.includes('Mumbai')
  });

  // TEST 3: Single Search Tab & Add to Basket Click
  console.log('🔍 Test 3: Running Single Search & Adding product to Basket...');
  const clickRes = await session.evalJs(`(() => {
    const input = document.getElementById('queryInput');
    const btn = document.getElementById('searchBtn');
    if (!input || !btn) return { error: 'elements not found' };
    input.value = 'Amul Butter';
    btn.click();
    return { clicked: true, val: input.value, btnDisabled: btn.disabled };
  })()`);
  console.log('  Click trigger:', clickRes);

  // Wait for live search cards to populate (poll up to 10s)
  let addBasketTest = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const state = await session.evalJs(`(() => {
      const btns = document.querySelectorAll('.btn-add-to-basket');
      const err = document.querySelector('#resultsContainer .text-rose-400');
      const spinner = document.getElementById('btnSpinner');
      const isSpinning = spinner ? !spinner.classList.contains('hidden') : false;
      if (btns.length > 0) {
        btns[0].click();
        const pill = document.getElementById('floatingCartPill');
        const pillVisible = pill ? !pill.classList.contains('hidden') : false;
        const pillText = document.getElementById('floatCartCount')?.innerText || '';
        return { success: true, count: btns.length, pillVisible, pillText };
      }
      return { btnsCount: btns.length, isSpinning, hasErr: !!err, errMsg: err?.innerText };
    })()`);
    if (state?.success) {
      addBasketTest = state;
      break;
    }
    if (i % 4 === 0) console.log(`  Waiting for search cards [${(i+1)*500}ms]:`, state);
  }
  console.log('✓ Test 3 Result:', addBasketTest);
  testResults.push({ test: 'Search & Add-to-Basket Button', passed: !!addBasketTest?.success });

  // TEST 4: Tab Switching to Basket Optimizer via Floating Pill
  console.log('🛒 Test 4: Switching to Basket Optimizer Tab...');
  const basketSwitch = await session.evalJs(`(() => {
    document.getElementById('floatingCartPill').click();
    const basketVisible = !document.getElementById('basketView').classList.contains('hidden');
    const itemsCount = parseInt(document.getElementById('basketCount').innerText || '0');
    return { basketVisible, itemsCount };
  })()`);
  console.log('✓ Test 4 Result:', basketSwitch);
  testResults.push({ test: 'Floating Cart Navigation', passed: basketSwitch?.basketVisible && basketSwitch.itemsCount > 0 });

  // TEST 5: Load Hark Worked Example (8 items)
  console.log('📄 Test 5: Loading Hark Worked Example preset...');
  const workedExampleTest = await session.evalJs(`(() => {
    const btn = document.getElementById('btnLoadWorkedExample');
    if (btn) btn.click();
    return {
      count: document.getElementById('basketCount').innerText,
      itemsLength: document.querySelectorAll('#basketItemsTable > div').length
    };
  })()`);
  console.log('✓ Test 5 Result:', workedExampleTest);
  testResults.push({ test: 'Load Worked Example Preset', passed: workedExampleTest?.itemsLength === 8 });

  await new Promise(r => setTimeout(r, 1000));

  // TEST 6: Solver Output Verification (Single App vs Split Decision)
  console.log('🧠 Test 6: Verifying Solver UI Render & Split Gate...');
  const solverRender = await session.evalJs(`(() => {
    const winnerTitle = document.getElementById('winnerTitle').innerText;
    const winnerPayable = document.getElementById('winnerPayable').innerText;
    const splitMsg = document.getElementById('splitMessage').innerText;
    const isBoxVisible = !document.getElementById('basketResultBox').classList.contains('hidden');
    return { isBoxVisible, winnerTitle, winnerPayable, splitMsg };
  })()`);
  console.log('✓ Test 6 Result:', solverRender);
  testResults.push({
    test: 'Solver Output Verification',
    passed: solverRender?.isBoxVisible && (solverRender.winnerPayable === '₹837.80' || solverRender.winnerPayable === '₹889.00')
  });

  // TEST 7: Itemized Bill Breakdown Modal
  console.log('🧾 Test 7: Testing Itemized Bill Breakdown Modal...');
  const receiptModalTest = await session.evalJs(`(() => {
    document.getElementById('btnViewBillBreakdown').click();
    const modalVisible = !document.getElementById('receiptModal').classList.contains('hidden');
    const content = document.getElementById('receiptModalContent').innerText;
    document.getElementById('btnCloseReceiptModal').click();
    const modalClosed = document.getElementById('receiptModal').classList.contains('hidden');
    return { modalVisible, modalClosed, hasDelivery: content.includes('Delivery Fee') };
  })()`);
  console.log('✓ Test 7 Result:', receiptModalTest);
  testResults.push({ test: 'Itemized Receipt Modal', passed: receiptModalTest?.modalVisible && receiptModalTest?.hasDelivery });

  // TEST 8: Threshold Repair Interaction (Small Cart Rs 156)
  console.log('💡 Test 8: Loading Small Cart & Testing Threshold Repair 1-Click Add...');
  await session.evalJs(`(() => {
    const btn = document.getElementById('btnLoadSmallCart');
    if (btn) btn.click();
  })()`);
  await new Promise(r => setTimeout(r, 1000));

  const repairBannerState = await session.evalJs(`(() => {
    const banner = document.getElementById('thresholdRepairBanner');
    const isVisible = banner ? !banner.classList.contains('hidden') : false;
    const text = document.getElementById('repairText')?.innerText || '';
    // Click add staple button
    const addStapleBtn = document.getElementById('btnAddRepairStaple');
    if (addStapleBtn) addStapleBtn.click();
    return { isVisible, text, newCount: document.getElementById('basketCount').innerText };
  })()`);
  console.log('✓ Test 8 Result:', repairBannerState);
  testResults.push({
    test: 'Threshold Repair 1-Click Add',
    passed: repairBannerState?.isVisible && repairBannerState?.text.includes('delivery fee')
  });

  // TEST 9: Health Diagnostics (Console & Network)
  const { jsExceptions, networkErrors } = session.getLogs();
  console.log(`\n📊 [Health Diagnostics] JS Exceptions: ${jsExceptions.length} | Network Errors: ${networkErrors.length}`);
  if (jsExceptions.length > 0) {
    console.error('JS Exceptions caught:', jsExceptions);
  }
  if (networkErrors.length > 0) {
    console.error('Network Errors caught:', networkErrors);
  }

  const allPassed = testResults.every(t => t.passed) && jsExceptions.length === 0;
  console.log('\n======================================================');
  console.log(`🎯 Overall Autonomous QA Result: ${allPassed ? 'ALL FEATURES WORKING SMOOTHLY (100% PASS)' : 'ISSUES DETECTED'}`);
  console.log('======================================================\n');

  await session.close();
  return { allPassed, testResults, jsExceptions, networkErrors };
}

runLiveAutonomousTest().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
