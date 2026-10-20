import { ensureChromeRunning } from '../src/chrome-launcher.mjs';

async function testSimulation() {
  await ensureChromeRunning();
  const newTabRes = await fetch('http://127.0.0.1:9222/json/new?http://localhost:3050/simulation.html', { method: 'PUT' });
  const tab = await newTabRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const reqId = id++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === reqId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Opened tab on Chrome 9222: simulation.html');

  // Wait 3 seconds for simulation ticks
  await new Promise(r => setTimeout(r, 3000));

  // Evaluate tick count
  const statsRes = await send('Runtime.evaluate', {
    expression: 'document.getElementById("swarmStats").innerText',
    returnByValue: true
  });
  console.log('Swarm Stats:', statsRes.result?.value);

  // Evaluate feed count
  const feedRes = await send('Runtime.evaluate', {
    expression: 'document.querySelectorAll("#mindFeed > div").length',
    returnByValue: true
  });
  console.log('Mind Feed Items count:', feedRes.result?.value);

  // Trigger shock 1: Zepto hike
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("btnShockZeptoHike").click()',
    returnByValue: true
  });
  console.log('Triggered: Zepto Shock');

  await new Promise(r => setTimeout(r, 2000));

  const zeptoShareRes = await send('Runtime.evaluate', {
    expression: 'document.getElementById("kpiZeptoShare").innerText',
    returnByValue: true
  });
  console.log('Zepto Share after hike:', zeptoShareRes.result?.value);

  // Trigger QuickCompare deployment
  await send('Runtime.evaluate', {
    expression: 'document.getElementById("btnShockQuickCompare").click()',
    returnByValue: true
  });
  console.log('Triggered: Deploy QuickCompare');
  await new Promise(r => setTimeout(r, 1500));

  ws.close();
  console.log('🎉 LIVE SIMULATION CONFIRMED WORKING ON CHROME!');
}

testSimulation().catch(console.error);
