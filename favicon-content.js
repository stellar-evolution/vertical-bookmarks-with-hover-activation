// Favicon discovery content script
// Discovers favicons from visited pages and sends candidates to background script

function abs(u) {
  try { 
    return new URL(u, location.origin).toString(); 
  } catch { 
    return ""; 
  }
}

async function collectCandidates() {
  const links = Array.from(document.querySelectorAll(
    'link[rel~="icon" i], link[rel="apple-touch-icon" i], link[rel="apple-touch-icon-precomposed" i]'
  ));

  const manifestLink = document.querySelector('link[rel="manifest" i]');
  let manifestIcons = [];
  
  if (manifestLink?.href) {
    try {
      const r = await fetch(abs(manifestLink.href), { credentials: "omit" });
      const mf = await r.json();
      if (Array.isArray(mf?.icons)) {
        manifestIcons = mf.icons.map((i) => ({
          src: abs(i.src),
          sizes: String(i.sizes || ""),
          type: String(i.type || ""),
          purpose: String(i.purpose || "any")
        }));
      }
    } catch (e) {
      // Ignore manifest fetch errors
    }
  }

  const linkIcons = links
    .map(l => ({ 
      href: abs(l.href), 
      sizes: l.getAttribute("sizes") || "", 
      rel: l.rel 
    }))
    .filter(x => x.href);

  // Send candidates to background script
  chrome.runtime.sendMessage({
    type: "FAVICON_CANDIDATES",
    hostname: location.hostname,
    linkIcons,
    manifestIcons
  });
}

// Run favicon discovery when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', collectCandidates);
} else {
  collectCandidates();
}

// Also run on navigation (for SPAs)
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    setTimeout(collectCandidates, 1000); // Delay to let page settle
  }
}).observe(document, { subtree: true, childList: true });
