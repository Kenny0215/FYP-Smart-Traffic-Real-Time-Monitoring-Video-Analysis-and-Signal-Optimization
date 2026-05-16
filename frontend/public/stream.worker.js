let intervalId = null;
let laneKey    = null;
let flaskUrl   = null;
let pollMs     = 150;

self.onmessage = (e) => {
  const { type, lane, url, ms } = e.data;

  if (type === 'start') {
    laneKey  = lane;
    flaskUrl = url;
    if (ms) pollMs = ms;
    startPolling();
  }

  if (type === 'stop') {
    stopPolling();
  }
};

function startPolling() {
  stopPolling();
  poll(); // immediate first fetch
}

function stopPolling() {
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }
}

async function poll() {
  try {
    const res = await fetch(
      `${flaskUrl}/api/snapshot/${laneKey}?t=${Date.now()}`,
      { cache: 'no-store' }
    );
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      // Transfer the buffer to the main thread (zero-copy)
      self.postMessage({ type: 'frame', buffer }, [buffer]);
    }
  } catch {
    // Network error — keep retrying
  }
  // Schedule next poll
  intervalId = setTimeout(poll, pollMs);
}