/**
 * Aegis CDP Test Harness
 * Role: Contract tests, golden basket validation, and fee-drift checks.
 *
 * Strict Principles:
 * - Tagged source='harness' exclusively.
 * - Never served directly to consumer UI.
 * - Low frequency, human volume, zero fingerprint evasion.
 */

export async function createHarnessSession(url) {
  const tabsRes = await fetch('http://127.0.0.1:9222/json/new?' + encodeURIComponent(url), { method: 'PUT' });
  if (!tabsRes.ok) {
    throw new Error('Chrome debugging port 9222 not reachable for harness');
  }
  const tab = await tabsRes.json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const pendingRequests = new Map();
  const customListeners = new Set();

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      if (data.id && pendingRequests.has(data.id)) {
        const { resolve, reject } = pendingRequests.get(data.id);
        pendingRequests.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
      for (const listener of customListeners) {
        listener(data);
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

  function addCdpListener(fn) {
    customListeners.add(fn);
    return () => customListeners.delete(fn);
  }

  return {
    tabId: tab.id,
    ws,
    sendCDP,
    addCdpListener,
    close: async () => {
      try { ws.close(); } catch (e) {}
      try {
        await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`);
      } catch (e) {}
    }
  };
}
