import { spawn } from 'child_process';

let isBooting = false;

/**
 * Ensures a Chrome browser instance with --remote-debugging-port=9222 is active.
 * Proactively spawns Chrome if not already running.
 */
export async function ensureChromeRunning() {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    if (res.ok) {
      return true;
    }
  } catch (e) {
    // Port not open, need to spawn
  }

  if (isBooting) {
    // Wait for in-progress boot
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const check = await fetch('http://127.0.0.1:9222/json/version');
        if (check.ok) return true;
      } catch (err) {}
    }
    return false;
  }

  isBooting = true;
  console.log('⚡ [ChromeLauncher] Proactively spawning autonomous Chrome instance on port 9222...');
  
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeProc = spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\ChromeDebug',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank' // Keep a blank tab alive so Chrome never auto-exits
  ], { detached: true, stdio: 'ignore' });
  
  chromeProc.unref();

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 400));
    try {
      const check = await fetch('http://127.0.0.1:9222/json/version');
      if (check.ok) {
        console.log('✓ [ChromeLauncher] Chrome instance active on port 9222.');
        isBooting = false;
        return true;
      }
    } catch (err) {}
  }

  isBooting = false;
  throw new Error('Failed to start Chrome debugging on port 9222');
}
