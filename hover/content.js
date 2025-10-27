(() => {
  if (window.__edgeHoverBookmarksInjected__) return;
  window.__edgeHoverBookmarksInjected__ = true;

  // defaults
  const DEFAULTS = {
    side: "right",                  // "left" | "right"
    edgeSizePx: 2,                  // hover trigger band
    sidebarWidth: 280,
    hideDelayMs: 180,              // close delay: 180ms after cursor leaves
    openDwellMs: 140,              // open dwell: 140ms after mouse hits edge
    scrollbarGutterPx: 0,          // keep scrollbar usable on right
    passThroughEdgePx: 10,         // band to treat mousedown as scrollbar grab
    scrollIdleMs: 200,
    hysteresisPx: 10,              // hysteresis: 10px outside panel edge to close
  };

  // state loaded from storage then init
  chrome.storage.sync.get(DEFAULTS, (cfg) => init(cfg || DEFAULTS));

  function init(cfg) {
    // === FONT CONFIGURATION (edit here to change all sidebar fonts) ===
    const SIDEBAR_FONT_FAMILY = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif';
    
    let visible = false;
    let hideTimer = null;
    let dwellTimer = null;
    let isScrolling = false;
    let scrollIdleTimer = null;
    let draggingScrollbar = false;
    let passthrough = false;
    let rafId = null;
    let lastMouseX = 0;
    let prewarmed = false;
    let showingAllBookmarks = false;

    // === DOM: sidebar ===
    const sidebar = document.createElement("div");
    sidebar.id = "ehb-sidebar";
    sidebar.setAttribute("aria-label", "Bookmarks Sidebar");
    sidebar.style.cssText = `
      position: fixed;
      top: 0;
      ${cfg.side}: ${cfg.side === "right" ? cfg.scrollbarGutterPx + "px" : "0"};
      height: 100vh;
      width: ${cfg.sidebarWidth}px;
      transform: translateX(${cfg.side === "left" ? "-100%" : "100%"});
      opacity: 0;
      transition: transform 140ms cubic-bezier(.2,.9,.2,1), opacity 140ms cubic-bezier(.2,.9,.2,1);
      will-change: transform, opacity;
      z-index: 2147483646;
      background: #FFFEFE;
      color: #222222;
      font: 12px/1.4 ${SIDEBAR_FONT_FAMILY} !important;
      font-weight: 500;
      border-${cfg.side === "left" ? "right" : "left"}: 1px solid rgba(0,0,0,0.1);
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      padding: 8px 10px;
      font-weight: 550;
      font-size: 16px;
      letter-spacing: .2px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
    `;
    const title = document.createElement("div");
    title.textContent = "Bookmarks";
    
    // Add bookmarks button with gradient (more red)
    const bookmarksBtn = document.createElement("div");
    bookmarksBtn.innerHTML = `<svg width="28" height="28" xmlns="http://www.w3.org/2000/svg" style="margin-right: 2px;  transform: scale(0.9);transform-origin: center;"><defs><linearGradient id="bookmarksGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#B37CF0;stop-opacity:1" /><stop offset="55%" style="stop-color:#F8219C;stop-opacity:1" /><stop offset="100%" style="stop-color:#FA7351;stop-opacity:1" /></linearGradient></defs><path d="M19.61 17.472a7.471 7.471 0 0 0 .042 2.778h.598a.75.75 0 1 1 0 1.5H6.042c-1.678 0-3.042-1.339-3.042-3V4.615C3 3.294 4.132 2.25 5.5 2.25h13.382c.752 0 1.368.6 1.368 1.352V15.75a.75.75 0 1 1 0 1.5h-.21a.748.748 0 0 1-.43.222zm-1.484-.222H6.042c-.856 0-1.542.674-1.542 1.5s.686 1.5 1.542 1.5h12.084a8.965 8.965 0 0 1 0-3zM4.5 16.163c.452-.263.98-.413 1.542-.413H18.75v-12h-3v6.75a.75.75 0 0 1-1.226.58L12 9.009l-2.524 2.07A.75.75 0 0 1 8.25 10.5V3.75H5.5c-.566 0-1 .4-1 .864v11.549zM9.75 3.75v5.165l1.774-1.456a.75.75 0 0 1 .952 0l1.774 1.456V3.75h-4.5z" fill="url(#bookmarksGradient)" fill-rule="evenodd"/></svg>`;
    bookmarksBtn.style.cssText = `display: flex; align-items: center;  justify-content: center; height: 100%; transform: translateY(2.5px); /* fine-tune vertical centering */`;

    const bookmarksToggleBtn = document.createElement("button");
    bookmarksToggleBtn.setAttribute("aria-label", "Toggle All Bookmarks");
    bookmarksToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path fill="#47464B" fill-rule="evenodd" d="M8.643 8.155a2.8 2.8 0 0 1 2.8-2.8H18.2a2.8 2.8 0 0 1 2.8 2.8v11.928c0 1.457-1.64 2.31-2.834 1.473l-3.23-2.265a.2.2 0 0 0-.23 0l-3.23 2.265c-1.193.837-2.833-.016-2.833-1.473zm2.8-1.2a1.2 1.2 0 0 0-1.2 1.2v11.928a.2.2 0 0 0 .314.163l3.23-2.265a1.8 1.8 0 0 1 2.068 0l3.23 2.265a.2.2 0 0 0 .315-.163V8.155a1.2 1.2 0 0 0-1.2-1.2zM3 4.8A2.8 2.8 0 0 1 5.8 2h8.757a.8.8 0 0 1 0 1.6H5.8a1.2 1.2 0 0 0-1.2 1.2v11.928a.2.2 0 0 0 .315.164l.59-.414a.8.8 0 1 1 .919 1.31l-.59.414C4.64 19.038 3 18.185 3 16.728z" clip-rule="evenodd"/></svg>`;
    bookmarksToggleBtn.style.cssText = `
      background: transparent; color: #222222; border: 0; cursor: pointer;
      font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px;
    `;
    
    function updateToggleButtonState() {
      if (showingAllBookmarks) {
        bookmarksToggleBtn.style.background = "#DBDADA";
      } else {
        bookmarksToggleBtn.style.background = "transparent";
      }
    }
    
    bookmarksToggleBtn.addEventListener("mouseenter", () => {
      if (!showingAllBookmarks) {
        bookmarksToggleBtn.style.background = "#F3F2F2";
      }
    });
    bookmarksToggleBtn.addEventListener("mouseleave", () => {
      updateToggleButtonState();
    });
    bookmarksToggleBtn.addEventListener("click", () => {
      showingAllBookmarks = !showingAllBookmarks;
      updateToggleButtonState();
      
      chrome.runtime.sendMessage({ type: "getBookmarks" }, (resp) => {
        if (!resp?.tree) return;
        listWrap.innerHTML = "";
        const rootChildren = resp.tree[0]?.children || [];
        
        if (showingAllBookmarks) {
          // Show all bookmarks
          renderTree(rootChildren, listWrap, true);
        } else {
          // Show Other Bookmarks (ID 2) - default view
          const otherBookmarks = rootChildren.find(node => 
            node.title === "Other bookmarks" || node.title === "Other Bookmarks" || node.id === "2"
          );
          
          if (otherBookmarks && otherBookmarks.children) {
            renderTree(otherBookmarks.children, listWrap, true);
          } else {
            renderTree(rootChildren, listWrap, true);
          }
        }
        prewarmed = true;
      });
    });

    const gear = document.createElement("button");
    gear.setAttribute("aria-label", "Settings");
    gear.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style="width: 16px; height: 16px;"><path fill="#47464B" fill-rule="evenodd" d="M8.75 3.63C8.907 2.69 9.72 2 10.675 2h2.65c.955 0 1.769.69 1.925 1.63l.219 1.31c.017.104.095.23.256.319q.127.07.25.145c.157.095.306.1.405.062L17.624 5a1.95 1.95 0 0 1 2.374.852l1.325 2.296a1.95 1.95 0 0 1-.45 2.482l-1.026.845c-.081.067-.151.198-.148.38a8 8 0 0 1 0 .29c-.003.182.067.313.148.38l1.027.845c.736.606.926 1.656.45 2.482l-1.326 2.296a1.95 1.95 0 0 1-2.375.852l-1.243-.466c-.099-.037-.248-.033-.405.062q-.123.075-.25.145c-.16.089-.24.215-.256.32l-.219 1.309A1.95 1.95 0 0 1 13.326 22h-2.652c-.953 0-1.767-.69-1.924-1.63l-.218-1.31c-.018-.104-.096-.23-.256-.319a8 8 0 0 1-.251-.145c-.157-.095-.306-.1-.405-.062L6.377 19a1.95 1.95 0 0 1-2.375-.852l-1.325-2.296a1.95 1.95 0 0 1 .45-2.482l1.026-.845.51.619-.51-.619c.081-.067.151-.198.148-.38a8 8 0 0 1 0-.29c.003-.182-.067-.313-.148-.38l-1.027-.845a1.95 1.95 0 0 1-.45-2.482l1.326-2.296A1.95 1.95 0 0 1 6.377 5l1.243.466c.1.037.248.033.405-.062q.124-.075.25-.145c.161-.089.24-.215.257-.32zm1.925-.027a.35.35 0 0 0-.344.29l-.218 1.31c-.11.66-.543 1.171-1.061 1.458a6 6 0 0 0-.199.115c-.507.306-1.167.426-1.795.191l-1.244-.466a.35.35 0 0 0-.424.152L4.065 8.95a.35.35 0 0 0 .08.444l1.027.845c.516.425.742 1.054.731 1.647a6 6 0 0 0 0 .23c.011.593-.215 1.222-.731 1.647l-1.027.845-.51-.618.51.618a.35.35 0 0 0-.08.444l1.325 2.296a.35.35 0 0 0 .424.152l1.244-.466c.628-.235 1.288-.115 1.795.191q.099.06.199.115c.518.287.95.797 1.06 1.458l.219 1.31a.35.35 0 0 0 .344.29h2.65a.35.35 0 0 0 .344-.29l.219-1.31c.11-.66.543-1.171 1.06-1.458a6 6 0 0 0 .199-.115c.508-.306 1.167-.426 1.795-.191l1.244.466c.16.06.339-.005.424-.152l1.325-2.296a.35.35 0 0 0-.08-.444l-1.026-.845c-.517-.425-.743-1.054-.732-1.647a6 6 0 0 0 0-.23c-.011-.593.215-1.222.732-1.647l1.026-.845a.35.35 0 0 0 .08-.444L18.61 6.653a.35.35 0 0 0-.424-.152l-1.244.466c-.628.235-1.287.115-1.795-.191a6 6 0 0 0-.199-.115c-.518-.287-.95-.797-1.06-1.458l-.219-1.31a.35.35 0 0 0-.343-.29zM12 9.735a2.265 2.265 0 1 0 0 4.53 2.265 2.265 0 0 0 0-4.53M8.132 12a3.868 3.868 0 1 1 7.735 0 3.868 3.868 0 0 1-7.735 0" clip-rule="evenodd"/></svg>`;
    gear.style.cssText = `
      background: transparent; color: #222222; border: 0; cursor: pointer;
      font-size: 16px; line-height: 1; padding: 2px 6px; border-radius: 6px;
    `;
    gear.addEventListener("mouseenter", () => gear.style.background = "rgba(0,0,0,0.08)");
    gear.addEventListener("mouseleave", () => gear.style.background = "transparent");

    // Create a container for title and bookmarks button (button on left)
    const titleContainer = document.createElement("div");
    titleContainer.style.cssText = `display: flex; align-items: center;`;
    titleContainer.appendChild(bookmarksBtn);
    titleContainer.appendChild(title);
    
    header.appendChild(titleContainer);
    
    // Create a container for the bookmarks toggle button and settings gear
    const controlsContainer = document.createElement("div");
    controlsContainer.style.cssText = `display: flex; align-items: center; gap: 4px;`;
    controlsContainer.appendChild(bookmarksToggleBtn);
    controlsContainer.appendChild(gear);
    
    header.appendChild(controlsContainer);

    const listWrap = document.createElement("div");
    listWrap.style.cssText = `
      height: calc(100vh - 42px);
      overflow: auto;
      padding: 6px 4px 10px 6px;
      overscroll-behavior: contain;
    `;

    sidebar.appendChild(header);
    sidebar.appendChild(listWrap);
    document.documentElement.appendChild(sidebar);

    // === Independent scrolling for sidebar ===
    listWrap.addEventListener("wheel", (e) => {
      e.stopPropagation();
      // Allow natural scrolling within the sidebar
    }, { passive: false });

    listWrap.addEventListener("scroll", (e) => {
      e.stopPropagation();
      // Prevent scroll events from bubbling to main page
    }, { passive: false });

    // === Settings popover ===
    const pop = document.createElement("div");
    pop.id = "ehb-settings-popover";
    pop.style.cssText = `
      position: fixed;
      ${cfg.side}: ${cfg.side === "right" ? (cfg.scrollbarGutterPx + 20) + "px" : "20px"};
      top: 40px;
      width: 240px;
      max-width: 240px;
      padding: 16px;
      box-sizing: border-box;
      border-radius: 12px;
      background: #FFFEFE;
      border: 1px solid rgba(0,0,0,0.08);
      box-shadow: 0 8px 28px rgba(0,0,0,0.45);
      z-index: 2147483647;
      display: none;
      color: #222222;
      font-size: 13px;
      font-family: ${SIDEBAR_FONT_FAMILY} !important;
      font-weight: 500;
    `;
    pop.innerHTML = `
      <style>
        .ehb-toggle {
          position: relative;
          width: 44px;
          height: 24px;
          border-radius: 12px;
          cursor: pointer;
          transition: background-color 0.3s ease;
          flex-shrink: 0;
        }
        .ehb-toggle.off {
          background-color: #C6C6CC;
        }
        .ehb-toggle.on {
          background-color: #444ECE;
        }
        .ehb-toggle-circle {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background-color: white;
          top: 4px;
          transition: left 0.3s ease;
        }
        .ehb-toggle.off .ehb-toggle-circle {
          left: 4px;
        }
        .ehb-toggle.on .ehb-toggle-circle {
          left: 24px;
        }
        .ehb-segmented-control {
          display: flex;
          background: #f0f0f0;
          border-radius: 8px;
          padding: 2px;
          width: 120px;
        }
        .ehb-segment {
          flex: 1;
          padding: 6px 12px;
          text-align: center;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
          font-weight: 500;
          border: none;
          background: transparent;
          color: #666;
        }
        .ehb-segment.active {
          background: #444ECE;
          color: white;
        }
        .ehb-section {
          margin-bottom: 16px;
        }
        .ehb-section-header {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }
        .ehb-advanced-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          padding: 8px 0;
          margin-bottom: 8px;
        }
        .ehb-advanced-content {
          overflow: hidden;
          transition: max-height 0.3s ease;
        }
        .ehb-advanced-content.collapsed {
          max-height: 0;
        }
        .ehb-advanced-content.expanded {
          max-height: 500px;
        }
        .ehb-chevron {
          transition: transform 0.3s ease;
          font-size: 12px;
          color: #666;
        }
        .ehb-chevron.expanded {
          transform: rotate(90deg);
        }
        .ehb-slider-group {
          margin-bottom: 12px;
        }
        .ehb-slider-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .ehb-slider-value {
          font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          font-size: 12px;
          color: #666;
          font-weight: 500;
        }
        #ehb-settings-popover input[type="range"] {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          background: transparent !important;
          width: 100% !important;
          height: 20px !important;
          margin: 0 !important;
          padding: 0 !important;
          outline: none !important;
        }
        #ehb-settings-popover input[type="range"]::-webkit-slider-container {
          background: transparent !important;
        }
        #ehb-settings-popover input[type="range"]::-webkit-slider-runnable-track {
          width: 100% !important;
          height: 6px !important;
          background: #e0e0e0 !important;
          border-radius: 3px !important;
          border: 1px solid #444ECE !important;
          border-top: 1px solid #444ECE !important;
          border-bottom: 1px solid #444ECE !important;
          border-left: 1px solid #444ECE !important;
          border-right: 1px solid #444ECE !important;
        }
        #ehb-settings-popover input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none !important;
          appearance: none !important;
          width: 16px !important;
          height: 16px !important;
          border-radius: 50% !important;
          background: white !important;
          border: 2px solid #444ECE !important;
          cursor: pointer !important;
          margin-top: -6px !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
        }
        #ehb-settings-popover input[type="range"]::-moz-range-track {
          width: 100% !important;
          height: 6px !important;
          background: #e0e0e0 !important;
          border-radius: 3px !important;
          border: 1px solid #444ECE !important;
          border-top: 1px solid #444ECE !important;
          border-bottom: 1px solid #444ECE !important;
          border-left: 1px solid #444ECE !important;
          border-right: 1px solid #444ECE !important;
        }
        #ehb-settings-popover input[type="range"]::-moz-range-thumb {
          -moz-appearance: none !important;
          width: 12px !important;
          height: 12px !important;
          border-radius: 50% !important;
          background: white !important;
          border: 2px solid #444ECE !important;
          cursor: pointer !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
        }
        /* Additional browser-specific overrides */
        #ehb-settings-popover input[type="range"]::-ms-track {
          width: 100% !important;
          height: 6px !important;
          background: #e0e0e0 !important;
          border-radius: 3px !important;
          border: 1px solid #444ECE !important;
        }
        #ehb-settings-popover input[type="range"]::-ms-thumb {
          width: 16px !important;
          height: 16px !important;
          border-radius: 50% !important;
          background: white !important;
          border: 2px solid #444ECE !important;
          cursor: pointer !important;
        }
      </style>
      
      <div style="font-weight:600;font-size:16px;margin-bottom:20px;color:#222">Edge Hover Bookmarks</div>
      
      <!-- Position Section -->
      <div class="ehb-section">
        <div class="ehb-section-header">Position</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
               <span style="font-size:11px;color:#333">Side</span>
          <div class="ehb-segmented-control">
            <button class="ehb-segment ${cfg.side === 'left' ? 'active' : ''}" data-side="left">Left</button>
            <button class="ehb-segment ${cfg.side === 'right' ? 'active' : ''}" data-side="right">Right</button>
          </div>
        </div>
      </div>
      
      <!-- Advanced Section -->
      <div class="ehb-section">
        <div class="ehb-advanced-header" id="ehb-advanced-toggle">
          <div class="ehb-section-header" style="margin:0">Advanced</div>
          <div class="ehb-chevron" id="ehb-chevron">▶</div>
        </div>
        <div class="ehb-advanced-content collapsed" id="ehb-advanced-content">
          <div class="ehb-slider-group">
            <div class="ehb-slider-label">
               <span style="font-size:11px;color:#333">Width</span>
              <span class="ehb-slider-value" id="ehb-width-val">${cfg.sidebarWidth}</span>
            </div>
            <input id="ehb-width" type="range" min="240" max="480" step="10" value="${cfg.sidebarWidth}">
          </div>
          <div class="ehb-slider-group">
            <div class="ehb-slider-label">
               <span style="font-size:11px;color:#333">Edge band</span>
              <span class="ehb-slider-value" id="ehb-edge-val">${cfg.edgeSizePx}px</span>
            </div>
            <input id="ehb-edge" type="range" min="1" max="8" step="1" value="${cfg.edgeSizePx}">
          </div>
          <div class="ehb-slider-group">
            <div class="ehb-slider-label">
               <span style="font-size:11px;color:#333">Dwell</span>
              <span class="ehb-slider-value" id="ehb-dwell-val">${cfg.openDwellMs}ms</span>
            </div>
            <input id="ehb-dwell" type="range" min="0" max="500" step="20" value="${cfg.openDwellMs}">
          </div>
          <div class="ehb-slider-group">
            <div class="ehb-slider-label">
               <span style="font-size:11px;color:#333">Scroll idle</span>
              <span class="ehb-slider-value" id="ehb-idle-val">${cfg.scrollIdleMs}ms</span>
            </div>
            <input id="ehb-idle" type="range" min="100" max="800" step="20" value="${cfg.scrollIdleMs}">
          </div>
          <div class="ehb-slider-group">
            <div class="ehb-slider-label">
               <span style="font-size:11px;color:#333">Right gutter</span>
              <span class="ehb-slider-value" id="ehb-gutter-val">${cfg.scrollbarGutterPx}px</span>
            </div>
            <input id="ehb-gutter" type="range" min="0" max="20" step="1" value="${cfg.scrollbarGutterPx}">
          </div>
        </div>
      </div>
      
      <div style="display:flex;gap:12px;margin-top:20px;justify-content:flex-end">
        <button id="ehb-reset" style="background:#f0f0f0;border:1px solid #ccc;color:#222222;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500">Reset</button>
        <button id="ehb-close" style="background:#444ECE;border:0;color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500">Close</button>
      </div>
    `;
    document.documentElement.appendChild(pop);

    const $ = (id) => pop.querySelector(id);
    
    // Initialize advanced section state
    let advancedExpanded = false;

    function persist(newCfg) {
      cfg = { ...cfg, ...newCfg };
      chrome.storage.sync.set(cfg);
    }
    function applyVisuals() {
      sidebar.style.width = cfg.sidebarWidth + "px";
      // relocate sidebar and border side
      sidebar.style.removeProperty("left");
      sidebar.style.removeProperty("right");
      sidebar.style.setProperty(cfg.side, cfg.side === "right" ? cfg.scrollbarGutterPx + "px" : "0");
      sidebar.style.borderLeft = "";
      sidebar.style.borderRight = "";
      if (cfg.side === "left") {
        sidebar.style.borderRight = "1px solid rgba(255,255,255,0.08)";
        sidebar.style.transform = "translateX(-100%)";
      } else {
        sidebar.style.borderLeft = "1px solid rgba(255,255,255,0.08)";
        sidebar.style.transform = "translateX(100%)";
      }
      // pop position
      pop.style.removeProperty("left");
      pop.style.removeProperty("right");
      pop.style.setProperty(cfg.side, cfg.side === "right" ? (cfg.scrollbarGutterPx + 20) + "px" : "20px");
    }

    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      pop.style.display = pop.style.display === "none" ? "block" : "none";
    });
    $("#ehb-close").addEventListener("click", () => pop.style.display = "none");
    $("#ehb-reset").addEventListener("click", () => {
      persist(DEFAULTS);
      ({...cfg} = DEFAULTS);
      
      // Reset segmented control
      segments.forEach(s => s.classList.remove('active'));
      const activeSegment = pop.querySelector(`[data-side="${cfg.side}"]`);
      if (activeSegment) activeSegment.classList.add('active');
      
      // Reset sliders
      $("#ehb-width").value = cfg.sidebarWidth; $("#ehb-width-val").textContent = cfg.sidebarWidth;
      $("#ehb-edge").value = cfg.edgeSizePx; $("#ehb-edge-val").textContent = cfg.edgeSizePx + "px";
      $("#ehb-dwell").value = cfg.openDwellMs; $("#ehb-dwell-val").textContent = cfg.openDwellMs + "ms";
      $("#ehb-idle").value = cfg.scrollIdleMs; $("#ehb-idle-val").textContent = cfg.scrollIdleMs + "ms";
      $("#ehb-gutter").value = cfg.scrollbarGutterPx; $("#ehb-gutter-val").textContent = cfg.scrollbarGutterPx + "px";
      
      
      
      // Reset advanced section to collapsed
      advancedExpanded = false;
      advancedContent.classList.remove('expanded');
      advancedContent.classList.add('collapsed');
      chevron.classList.remove('expanded');
      
      applyVisuals();
    });

    // Segmented control for side selection
    const segments = pop.querySelectorAll('.ehb-segment');
    segments.forEach(segment => {
      segment.addEventListener('click', () => {
        const side = segment.dataset.side;
        segments.forEach(s => s.classList.remove('active'));
        segment.classList.add('active');
        persist({ side });
      applyVisuals();
      });
    });
    
    // Advanced section toggle
    const advancedToggle = $("#ehb-advanced-toggle");
    const advancedContent = $("#ehb-advanced-content");
    const chevron = $("#ehb-chevron");
    
    advancedToggle.addEventListener('click', () => {
      advancedExpanded = !advancedExpanded;
      if (advancedExpanded) {
        advancedContent.classList.remove('collapsed');
        advancedContent.classList.add('expanded');
        chevron.classList.add('expanded');
      } else {
        advancedContent.classList.remove('expanded');
        advancedContent.classList.add('collapsed');
        chevron.classList.remove('expanded');
      }
    });
    $("#ehb-width").addEventListener("input", (e) => { $("#ehb-width-val").textContent = " " + e.target.value; });
    $("#ehb-width").addEventListener("change", (e) => { persist({ sidebarWidth: +e.target.value }); applyVisuals(); });
    $("#ehb-edge").addEventListener("input", (e) => { $("#ehb-edge-val").textContent = e.target.value + "px"; });
    $("#ehb-edge").addEventListener("change", (e) => { persist({ edgeSizePx: +e.target.value }); });
    $("#ehb-dwell").addEventListener("input", (e) => { $("#ehb-dwell-val").textContent = e.target.value + "ms"; });
    $("#ehb-dwell").addEventListener("change", (e) => { persist({ openDwellMs: +e.target.value }); });
    $("#ehb-idle").addEventListener("input", (e) => { $("#ehb-idle-val").textContent = e.target.value + "ms"; });
    $("#ehb-idle").addEventListener("change", (e) => { persist({ scrollIdleMs: +e.target.value }); });
    $("#ehb-gutter").addEventListener("input", (e) => { $("#ehb-gutter-val").textContent = e.target.value + "px"; });
    $("#ehb-gutter").addEventListener("change", (e) => { persist({ scrollbarGutterPx: +e.target.value }); applyVisuals(); });
    
    

    applyVisuals();
    
    // Force apply slider styles after DOM is ready
    setTimeout(() => {
      const sliders = pop.querySelectorAll('input[type="range"]');
      sliders.forEach(slider => {
        slider.style.setProperty('-webkit-appearance', 'none', 'important');
        slider.style.setProperty('-moz-appearance', 'none', 'important');
        slider.style.setProperty('appearance', 'none', 'important');
        slider.style.setProperty('background', 'transparent', 'important');
        slider.style.setProperty('width', '100%', 'important');
        slider.style.setProperty('height', '20px', 'important');
        slider.style.setProperty('margin', '0', 'important');
        slider.style.setProperty('padding', '0', 'important');
        slider.style.setProperty('outline', 'none', 'important');
      });
    }, 100);

    // === helpers ===
    function show() {
      if (visible || passthrough || draggingScrollbar || isScrolling) return;
      visible = true;
      sidebar.style.transform = "translateX(0)";
      sidebar.style.opacity = "1";
    }
    function hideSoon() {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        visible = false;
        sidebar.style.transform = `translateX(${cfg.side === "left" ? "-100%" : "100%"})`;
        sidebar.style.opacity = "0";
      }, cfg.hideDelayMs);
    }
    
    function setScrollingActive() {
      isScrolling = true;
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
      scrollIdleTimer = setTimeout(() => { isScrolling = false; }, cfg.scrollIdleMs);
    }

    function crossedInnerEdge(mouseX) {
  const rect = sidebar.getBoundingClientRect();
  if (cfg.side === "right") {
    return mouseX < (rect.left - cfg.hysteresisPx);
  } else {
    return mouseX > (rect.right + cfg.hysteresisPx);
  }
}

sidebar.addEventListener("mouseenter", () => {
  if (hideTimer) clearTimeout(hideTimer);
});

// === edge hover with dwell, suppressed during scroll/drag ===
function handleMouseMove(e) {
  if (rafId) cancelAnimationFrame(rafId);

  rafId = requestAnimationFrame(() => {
    const nearLeft = e.clientX <= cfg.edgeSizePx;
    const nearRight = (window.innerWidth - e.clientX) <= cfg.edgeSizePx;
    const onEdge = cfg.side === "left" ? nearLeft : nearRight;
    lastMouseX = e.clientX;

    if (onEdge && !isScrolling && !draggingScrollbar && !passthrough) {
      if (!dwellTimer) {
        dwellTimer = setTimeout(() => { show(); dwellTimer = null; }, cfg.openDwellMs);
      }
    } else {
      if (dwellTimer) { clearTimeout(dwellTimer); dwellTimer = null; }

      if (visible) {
        if (crossedInnerEdge(e.clientX)) {
          hideSoon();
        } else if (hideTimer) {
          clearTimeout(hideTimer);
        }
      }
    }

    rafId = null;
  });
}
    
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // === scroll detection ===
    window.addEventListener("wheel", setScrollingActive, { passive: true });
    window.addEventListener("scroll", setScrollingActive, { passive: true });
    window.addEventListener("touchmove", setScrollingActive, { passive: true });
    window.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "PageDown" || k === "PageUp" || k === "Home" || k === "End" ||
          k === "ArrowDown" || k === "ArrowUp" || k === " ") setScrollingActive();
    }, { passive: true });

    // === pass-through for scrollbar drags ===
    window.addEventListener("mousedown", (e) => {
      const nearLeftClick  = e.clientX <= cfg.passThroughEdgePx;
      const nearRightClick = (window.innerWidth - e.clientX) <= cfg.passThroughEdgePx;
      const nearEdge = cfg.side === "left" ? nearLeftClick : nearRightClick;

      if (nearEdge) {
        const de = document.documentElement;
        const scrollable = (de.scrollHeight - de.clientHeight) > 0;
        if (scrollable) {
          draggingScrollbar = true;
          passthrough = true;
          sidebar.style.pointerEvents = "none";
          hideSoon();
        }
      }
    }, { capture: true });

    window.addEventListener("mouseup", () => {
      if (draggingScrollbar) {
        draggingScrollbar = false;
        setTimeout(() => {
          sidebar.style.pointerEvents = "";
          passthrough = false;
        }, 50);
      }
    }, { capture: true });

    // === build bookmarks tree with favicon support ===
    async function getFaviconUrl(url) {
      if (!url) return null;
      try {
        const hostname = new URL(url).hostname;
        const result = await chrome.storage.local.get("iconCache");
        const cachedIcon = result.iconCache?.[hostname];
        
        // If we have a cached icon, use it
        if (cachedIcon?.dataUrl) {
          return cachedIcon.dataUrl;
        }
        
        // Fallback to Google S2 for unvisited sites
        return `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
      } catch {
        return null;
      }
    }

    function createPlaceholderTile(host) {
      const ch = (host.replace(/^www\./,'')[0] || '?').toUpperCase();
      return `data:image/svg+xml;utf8,${encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='100%' height='100%' fill='#EEE'/><text x='50%' y='55%' font-family='Helvetica Neue,Helvetica,Arial' font-size='48' font-weight='500' text-anchor='middle'>" + ch + "</text></svg>"
      )}`;
    }
    
    // ...existing code...
function renderTree(nodes, parent, isPrewarm = false) {
  const ul = document.createElement("ul");
  ul.style.cssText = `list-style:none; margin:0; padding:0 0 0 6px;`;
  
  for (const n of nodes) {
    const li = document.createElement("li");
    li.style.cssText = `margin:2px 0;`;

    if (n.url) {
      const a = document.createElement("a");
      a.textContent = n.title || n.url;
      a.href = n.url;
      a.style.cssText = `
        display:flex; align-items:center; padding:6px 8px; border-radius:8px;
        text-decoration:none; color:inherit; font-weight:500;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        font-family: ${SIDEBAR_FONT_FAMILY} !important;
      `;
      
      // Add favicon with rounded frame
      const faviconContainer = document.createElement("div");
      faviconContainer.style.cssText = `width:24px; height:24px; margin-right:8px; background:#F1F0F5; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden;`;
      
      const img = document.createElement("img");
      img.style.cssText = `width:18px; height:18px; object-fit:cover; border-radius:0.5px; display:block;`;
      
      // Get favicon URL (cached or Google S2 fallback)
      getFaviconUrl(n.url).then(faviconUrl => {
        if (faviconUrl) {
          img.src = faviconUrl;
        }
      }).catch(() => {
        // If all else fails, use placeholder
        try {
          const hostname = new URL(n.url).hostname;
          img.src = createPlaceholderTile(hostname);
        } catch {
          img.src = createPlaceholderTile('?');
        }
      });
      
      faviconContainer.appendChild(img);
      a.insertBefore(faviconContainer, a.firstChild);
      
      a.addEventListener("mouseenter", () => a.style.background = "rgba(0,0,0,0.08)");
      a.addEventListener("mouseleave", () => a.style.background = "transparent");
      a.addEventListener("click", () => { hideSoon(); });
      li.appendChild(a);
    } else {
      const details = document.createElement("details");
      details.open = false;
      const summary = document.createElement("summary");
      summary.style.cssText = `cursor:pointer; padding:6px 8px; border-radius:8px; font-weight:500; display:flex; align-items:center; font-family: ${SIDEBAR_FONT_FAMILY} !important;`;
      
      // Add folder icon with background (rounded)
      const folderIcon = document.createElement("div");
      folderIcon.style.cssText = `width:24px; height:24px; margin-right:8px; background:#DFE0FF; border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0; overflow:hidden;`;
      folderIcon.innerHTML = `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#0E0662" stroke-width="2"><path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/></svg>`;
      
      const folderText = document.createElement("span");
      folderText.textContent = n.title || "Folder";
      folderText.style.cssText = `font-family: ${SIDEBAR_FONT_FAMILY} !important;`;
      
      summary.appendChild(folderIcon);
      summary.appendChild(folderText);
      details.appendChild(summary);
      
      // Make folder header highlight on hover like links
      summary.addEventListener("mouseenter", () => summary.style.background = "rgba(0,0,0,0.08)");
      summary.addEventListener("mouseleave", () => summary.style.background = "transparent");

      // For prewarming, only render first level children
      if (n.children?.length && (!isPrewarm || n.children.length <= 50)) {
        details.appendChild(renderTree(n.children, details, isPrewarm));
      }
      li.appendChild(details);
    }
    ul.appendChild(li);
  }
  parent.appendChild(ul);
  return ul;
}
// ...existing code...

    // Listen for favicon updates
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === "FAVICON_UPDATED") {
        // Refresh favicons for the updated hostname
        const hostname = msg.hostname;
        const faviconImages = listWrap.querySelectorAll('img[src*="data:image"]');
        faviconImages.forEach(img => {
          const link = img.closest('a');
          if (link) {
            try {
              const url = new URL(link.href);
              if (url.hostname === hostname) {
                getFaviconUrl(link.href).then(faviconUrl => {
                  if (faviconUrl) {
                    img.src = faviconUrl;
                  }
                });
              }
            } catch (e) {
              // Ignore URL parsing errors
            }
          }
        });
      }
    });

    // Prewarm bookmarks on first load for smooth first open
    chrome.runtime.sendMessage({ type: "getBookmarks" }, (resp) => {
      if (!resp?.tree) return;
      listWrap.innerHTML = "";
      const rootChildren = resp.tree[0]?.children || [];
      
      // Show Other Bookmarks (ID 2) by default
      const otherBookmarks = rootChildren.find(node => 
        node.title === "Other bookmarks" || node.title === "Other Bookmarks" || node.id === "2"
      );
      
      if (otherBookmarks && otherBookmarks.children) {
        // Only show Other Bookmarks items
        renderTree(otherBookmarks.children, listWrap, true); // prewarm = true
        prewarmed = true;
      } else {
        // Fallback to all bookmarks if Other Bookmarks not found
        renderTree(rootChildren, listWrap, true); // prewarm = true
        prewarmed = true;
      }
    });
  }
})();
