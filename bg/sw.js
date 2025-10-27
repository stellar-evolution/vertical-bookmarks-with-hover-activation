// merged service worker
(function(){
// --- Hover worker code ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "getBookmarks") {
    chrome.bookmarks.getTree().then(tree => sendResponse({ tree }));
    return true; // async
  }
  
});

// --- Favicon processing and caching ---
const TARGET_PX = 96;

function parseSizes(s) {
  return String(s || "")
    .split(/\s+/)
    .map(x => x.trim())
    .map(x => (/^(\d+)x(\d+)$/i.test(x) ? parseInt(x.split("x")[0], 10) : 0))
    .filter(n => n > 0)
    .sort((a,b) => a - b);
}

function scoreIcon(meta) {
  const maxDim = Math.max(meta.width || 0, meta.height || 0);
  const isSquareish = meta.width && meta.height
    ? Math.abs(meta.width - meta.height) / Math.max(meta.width, meta.height) <= 0.12
    : true; // treat SVG as squareish

  let score = 0;

  // 1) Size: bigger is better up to 256
  score += Math.min(maxDim, 256);

  // 2) Format preference
  const type = (meta.mime || '').toLowerCase();
  if (meta.isVector || type.includes('svg')) score += 220;       // vector bonus
  else if (type.includes('png') || type.includes('webp')) score += 180;
  else if (type.includes('ico')) score += 80;
  else if (type.includes('jpeg') || type.includes('jpg')) score += 30;

  // 3) Purpose (manifest)
  const p = (meta.purpose || '').toLowerCase();
  if (p.includes('any')) score += 60;
  else if (p.includes('maskable')) score += 40;
  else if (p.includes('monochrome')) score -= 40; // not ideal for bookmarks

  // 4) rel weight
  const r = (meta.rel || '').toLowerCase();
  if (r.includes('apple-touch')) score += 25;
  else if (r.includes('icon')) score += 15;

  // 5) Shape: square-ish preferred (but allow circles from brand)
  if (isSquareish) score += 15;

  // 6) Generic fallback penalty
  const url = (meta.url || '').toLowerCase();
  if (url.endsWith('/favicon.ico')) score -= 15;

  return score;
}

async function fetchAsDataUrl(url) {
  const r = await fetch(url, { credentials: "omit" });
  const ct = r.headers.get("content-type") || "";
  const buf = await r.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return { dataUrl: `data:${ct};base64,${b64}`, mime: ct };
}

async function rasterizeSVG(svgDataUrl, px = TARGET_PX) {
  const blob = await (await fetch(svgDataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(px, px);
  const ctx = canvas.getContext("2d");
  const scale = Math.min(px / bmp.width, px / bmp.height);
  const w = bmp.width * scale, h = bmp.height * scale;
  ctx.clearRect(0, 0, px, px);
  ctx.drawImage(bmp, (px - w)/2, (px - h)/2, w, h);
  const png = await canvas.convertToBlob({ type: "image/png" });
  const arr = new Uint8Array(await png.arrayBuffer());
  const b64 = btoa(String.fromCharCode(...arr));
  return `data:image/png;base64,${b64}`;
}

async function measureIcon(blob, url) {
  try {
    const bitmap = await createImageBitmap(blob);
    return {
      width: bitmap.width,
      height: bitmap.height,
      isVector: false
    };
  } catch (e) {
    // If createImageBitmap fails, it might be SVG
    const text = await blob.text();
    if (text.includes('<svg') || url.toLowerCase().includes('.svg')) {
      return {
        width: 0,
        height: 0,
        isVector: true
      };
    }
    return {
      width: 0,
      height: 0,
      isVector: false
    };
  }
}

async function pickAndCache(hostname, candidates) {
  const uniq = Object.values(
    candidates.reduce((m, c) => { 
      m[c.src] = m[c.src] || c; 
      return m; 
    }, {})
  );

  // Fetch and measure all candidates
  const measuredCandidates = [];
  for (const c of uniq) {
    try {
      const response = await fetch(c.src, { credentials: "omit" });
      const blob = await response.blob();
      const mime = blob.type || response.headers.get("content-type") || "";
      const measurement = await measureIcon(blob, c.src);
      
      measuredCandidates.push({
        ...c,
        mime,
        ...measurement,
        url: c.src
      });
    } catch (e) {
      // Skip failed candidates
    }
  }

  // Sort by score and pick the best
  measuredCandidates.sort((a,b) => scoreIcon(b) - scoreIcon(a));
  
  for (const c of measuredCandidates) {
    try {
      const { dataUrl, mime } = await fetchAsDataUrl(c.src);
      let finalDataUrl = dataUrl;
      
      if (c.isVector || mime.includes("svg")) {
        finalDataUrl = await rasterizeSVG(dataUrl, TARGET_PX);
      }
      
      const s = await chrome.storage.local.get("iconCache");
      const cache = s.iconCache || {};
      cache[hostname] = {
        dataUrl: finalDataUrl,
        size: TARGET_PX,
        src: c.src,
        purpose: c.purpose || "any",
        ts: Date.now(),
        score: scoreIcon(c)
      };
              await chrome.storage.local.set({ iconCache: cache });
              
              // Send message to all tabs that might be listening
              try {
                const tabs = await chrome.tabs.query({});
                for (const tab of tabs) {
                  try {
                    await chrome.tabs.sendMessage(tab.id, { type: "FAVICON_UPDATED", hostname });
                  } catch (e) {
                    // Ignore errors for tabs that don't have the content script
                  }
                }
              } catch (e) {
                // Fallback to broadcast if tab query fails
                try {
                  chrome.runtime.sendMessage({ type: "FAVICON_UPDATED", hostname });
                } catch (e) {
                  // Ignore connection errors - content scripts may not be active
                }
              }
              return;
    } catch (e) {
      // Continue to next candidate if this one fails
    }
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "FAVICON_CANDIDATES" && msg.hostname) {
    const { hostname, linkIcons = [], manifestIcons = [] } = msg;
    const candidates = [
      ...manifestIcons.map((i) => ({
        src: i.src, 
        sizes: i.sizes, 
        type: i.type, 
        purpose: i.purpose
      })),
      ...linkIcons.map((l) => ({
        src: l.href, 
        sizes: l.sizes, 
        type: "", 
        purpose: "any"
      }))
    ];
    pickAndCache(hostname, candidates);
  }
});

})();
