const AI_PROVIDERS = {
  chatgpt: {
    name: "ChatGPT",
    url: "https://chatgpt.com/"
  },
  copilot: {
    name: "GitHub Copilot",
    url: "https://github.com/copilot"
  },
  gemini: {
    name: "Gemini",
    url: "https://gemini.google.com/"
  },
  claude: {
    name: "Claude AI",
    url: "https://claude.ai/"
  }
};

const defaultConfig = {
  provider: "chatgpt",
  chatUrl: "https://chatgpt.com/"
};

let config = { ...defaultConfig };
let debugMode = false;
let sidebarWindowId = null;
let lastSidebarBounds = null;
let dockAnchorWindowId = null;

// Small helper wrappers to make callback-based chrome APIs return Promises
const chromeAsync = {
  storageGet: (keys) => new Promise((resolve) => {
    try { chrome.storage.sync.get(keys, resolve); } catch (_) { resolve({}); }
  }),
  windowsGetLastFocused: (opts) => new Promise((resolve) => {
    try { chrome.windows.getLastFocused(opts, resolve); } catch (_) { resolve(null); }
  }),
  windowsCreate: (createData) => new Promise((resolve) => {
    try { chrome.windows.create(createData, resolve); } catch (_) { resolve(null); }
  }),
  windowsGet: (id) => new Promise((resolve) => {
    try { chrome.windows.get(id, resolve); } catch (_) { resolve(null); }
  }),
  windowsUpdate: (id, info) => new Promise((resolve) => {
    try { chrome.windows.update(id, info, resolve); } catch (_) { resolve(null); }
  }),
  windowsRemove: (id) => new Promise((resolve) => {
    try { chrome.windows.remove(id, resolve); } catch (_) { resolve(null); }
  }),
  tabsQuery: (q) => new Promise((resolve) => {
    try { chrome.tabs.query(q, resolve); } catch (_) { resolve([]); }
  }),
  tabsSendMessage: (tabId, payload) => new Promise((resolve) => {
    try { chrome.tabs.sendMessage(tabId, payload, (resp) => resolve(resp)); } catch (_) { resolve(null); }
  }),
  tabsUpdate: (id, info) => new Promise((resolve) => {
    try { chrome.tabs.update(id, info, resolve); } catch (_) { resolve(null); }
  }),
  tabsReload: (id) => new Promise((resolve) => {
    try { chrome.tabs.reload(id, resolve); } catch (_) { resolve(null); }
  })
};

chrome.runtime.onInstalled.addListener(async () => {
  await loadConfig();
  await setupSidePanel();
  await updateContextMenu();
});

loadConfig();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info || !tab) return;
  if (!info.selectionText) return;

  const text = info.selectionText.trim();
  if (!text) return;

  if (info.menuItemId === "ai_send") {
    // Open sidebar with the selected text
    await toggleSidebarWindow();
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "sync") {
    return;
  }
  
  const stored = await chromeAsync.storageGet(defaultConfig);
  config = { ...defaultConfig, ...stored };
  debugMode = !!config.debugMode;
  
  await updateContextMenu();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === sidebarWindowId) {
    sidebarWindowId = null;
    dockAnchorWindowId = null;
  }
});

chrome.windows.onBoundsChanged.addListener((windowId) => {
  handleWindowBoundsChanged(windowId).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case "toggle-sidebar":
      await toggleSidebarWindow();
      break;
    default:
      break;
  }
});

// Toolbar button click toggles the sidebar
chrome.action.onClicked.addListener(async () => {
  await toggleSidebarWindow();
});

// Set up side panel on install and startup
chrome.runtime.onInstalled.addListener(async () => {
  await setupSidePanel();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupSidePanel();
  await loadConfig();
});

async function setupSidePanel() {
  try {
    if (chrome.sidePanel) {
      await chrome.sidePanel.setOptions({
        path: 'src/sidebar.html',
        enabled: true
      });
      debugLog('Side panel configured');
    }
  } catch (err) {
    debugLog('setupSidePanel error:', err);
  }
}

async function loadConfig() {
  const stored = await chromeAsync.storageGet(defaultConfig);
  config = { ...defaultConfig, ...(stored || {}) };
  debugMode = !!config.debugMode;
}

async function updateContextMenu() {
  try {
    const providerName = AI_PROVIDERS[config.provider]?.name || 'AI';
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ 
        id: "ai_send", 
        title: `Надіслати до ${providerName}`, 
        contexts: ["selection"] 
      });
    });
  } catch (_) {
    // ignore
  }
}

function getCurrentProviderUrl() {
  if (config.customUrl) {
    return config.customUrl;
  }
  return AI_PROVIDERS[config.provider]?.url || AI_PROVIDERS.chatgpt.url;
}

async function toggleSidebarWindow() {
  // Try to use embedded sidebar in content script first
  const activeTab = await getActiveTab();
  if (activeTab && activeTab.id) {
    try {
      const response = await chromeAsync.tabsSendMessage(activeTab.id, { type: "TOGGLE_SIDEBAR" });
      if (response && response.ok) {
        debugLog('Embedded sidebar toggled');
        return;
      }
    } catch (error) {
      debugLog('Content script not available, trying side panel:', error);
    }
  }

  // Fallback: try browser side panel if available
  if (await tryOpenSidePanel()) return;

  // Last resort: use popup window if side panel is not available
  if (sidebarWindowId) {
    await closeSidebarWindow();
  } else {
    await openSidebarWindow();
  }
}

async function tryOpenSidePanel() {
  // Prefer browser sidePanel API - this creates an integrated sidebar
  try {
    if (chrome.sidePanel) {
      // Get the current window
      const window = await chromeAsync.windowsGetLastFocused({ windowTypes: ["normal"] }).catch(() => null);
      const windowId = window?.id;
      
      if (windowId) {
        // Set options for the side panel
        try {
          await chrome.sidePanel.setOptions({
            path: 'src/sidebar.html',
            enabled: true
          });
        } catch (err) {
          debugLog('setOptions error:', err);
        }
        
        // Open the side panel in the current window
        try {
          await chrome.sidePanel.open({ windowId });
          debugLog('Side panel opened');
          return true;
        } catch (err) {
          debugLog('open error:', err);
          // Try alternative method
          try {
            await chrome.sidePanel.open({});
            return true;
          } catch (err2) {
            debugLog('open alternative error:', err2);
          }
        }
      }
    }
    
    // Firefox sidebar fallback
    if (chrome.sidebarAction && typeof chrome.sidebarAction.open === 'function') {
      try {
        await chrome.sidebarAction.open({});
        return true;
      } catch (_) {}
    }
  } catch (err) {
    debugLog('tryOpenSidePanel error:', err);
  }
  return false;
}

async function openSidebarWindow() {
  if (sidebarWindowId) {
    try {
      await chrome.windows.update(sidebarWindowId, { focused: true, drawAttention: true });
      return;
    } catch (error) {
      sidebarWindowId = null;
    }
  }

  const anchorWindow = await chromeAsync.windowsGetLastFocused({ windowTypes: ["normal"] }).catch(() => null);
  const dockBounds = calculateDockBounds(anchorWindow);

  // Open sidebar.html instead of the AI provider URL directly
  const createData = {
    url: chrome.runtime.getURL('src/sidebar.html'),
    type: "popup",
    focused: true,
    width: dockBounds.width,
    height: dockBounds.height,
    left: dockBounds.left,
    top: dockBounds.top
  };

  const newWindow = await chromeAsync.windowsCreate(createData);
  sidebarWindowId = newWindow.id || null;
  dockAnchorWindowId = anchorWindow?.id || null;
  rememberSidebarBounds(newWindow);
  if (dockAnchorWindowId) {
    await alignSidebarToAnchor(anchorWindow);
  }
}

async function closeSidebarWindow() {
  if (!sidebarWindowId) {
    return;
  }
  try {
    const existing = await chromeAsync.windowsGet(sidebarWindowId);
    rememberSidebarBounds(existing);
    await chromeAsync.windowsRemove(sidebarWindowId);
  } catch (error) {
    // Window might already be closed; ignore.
  } finally {
    sidebarWindowId = null;
    dockAnchorWindowId = null;
  }
}

async function getActiveTab() {
  const tabs = await chromeAsync.tabsQuery({ active: true, lastFocusedWindow: true });
  const activeTab = tabs && tabs[0] ? tabs[0] : null;
  return activeTab;
}

async function notifyTab(tabId, payload) {
  try {
    debugLog('notifyTab', tabId, payload?.type);
    await chromeAsync.tabsSendMessage(tabId, payload);
  } catch (error) {
    // Tab may not accept messages (e.g., chrome:// pages); ignore.
    debugLog('notifyTab failed', String(error));
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  
  if (msg.type === 'SIDEBAR_PING') {
    sendResponse({ ok: true });
    return true;
  }
  
  if (msg.type === 'OPEN_SIDEBAR_POPUP') {
    debugLog('OPEN_SIDEBAR_POPUP requested', msg.source || 'unknown');
    // Try embedded sidebar first
    getActiveTab().then(async (tab) => {
      if (tab && tab.id) {
        try {
          const response = await chromeAsync.tabsSendMessage(tab.id, { type: "OPEN_SIDEBAR" });
          if (response && response.ok) {
            sendResponse({ ok: true });
            return;
          }
        } catch (error) {
          debugLog('Content script not available, using popup window:', error);
        }
      }
      // Fallback to popup window
      openSidebarWindow()
        .then(() => sendResponse({ ok: true }))
        .catch((err) => { debugLog('openSidebarWindow failed', err); sendResponse({ ok: false, error: String(err) }); });
    });
    return true;
  }
  
  if (msg.type === 'GET_PROVIDER_INFO') {
    sendResponse({
      ok: true,
      provider: config.provider,
      url: getCurrentProviderUrl(),
      name: AI_PROVIDERS[config.provider]?.name || 'AI'
    });
    return true;
  }
});

async function handleWindowBoundsChanged(windowId) {
  if (windowId === sidebarWindowId) {
    const sidebarInfo = await chrome.windows.get(windowId).catch(() => null);
    rememberSidebarBounds(sidebarInfo);
    return;
  }
  if (dockAnchorWindowId && windowId === dockAnchorWindowId && sidebarWindowId) {
    await alignSidebarToAnchor();
  }
}

function rememberSidebarBounds(bounds) {
  if (!bounds) return;
  lastSidebarBounds = {
    left: bounds.left ?? lastSidebarBounds?.left ?? 0,
    top: bounds.top ?? lastSidebarBounds?.top ?? 0,
    width: bounds.width ?? lastSidebarBounds?.width ?? 460,
    height: bounds.height ?? lastSidebarBounds?.height ?? 900
  };
}

function calculateDockBounds(anchorWindow) {
  const defaultWidth = lastSidebarBounds?.width ?? 460;
  const defaultHeight = lastSidebarBounds?.height ?? 900;
  if (!anchorWindow || anchorWindow.type !== "normal") {
    return {
      width: defaultWidth,
      height: defaultHeight,
      left: lastSidebarBounds?.left ?? 0,
      top: lastSidebarBounds?.top ?? 0
    };
  }
  const anchorWidth = anchorWindow.width ?? defaultWidth * 2;
  const sidebarWidth = Math.min(Math.max(defaultWidth, 320), Math.max(anchorWidth - 80, 360));
  const left = (anchorWindow.left ?? 0) + Math.max(0, anchorWidth - sidebarWidth);
  const top = anchorWindow.top ?? 0;
  return {
    width: sidebarWidth,
    height: anchorWindow.height ?? defaultHeight,
    left,
    top
  };
}

async function alignSidebarToAnchor(presetAnchor) {
  if (!sidebarWindowId || !dockAnchorWindowId) {
    return;
  }
  const [anchorWindow, sidebarWindow] = await Promise.all([
    presetAnchor ? Promise.resolve(presetAnchor) : chrome.windows.get(dockAnchorWindowId).catch(() => null),
    chrome.windows.get(sidebarWindowId).catch(() => null)
  ]);
  if (!anchorWindow || !sidebarWindow) {
    return;
  }
  const sidebarWidth = sidebarWindow.width ?? lastSidebarBounds?.width ?? 460;
  const dockBounds = calculateDockBounds({
    ...anchorWindow,
    width: anchorWindow.width ?? sidebarWidth,
    height: anchorWindow.height ?? sidebarWindow.height ?? lastSidebarBounds?.height ?? 900
  });
  try {
    await chrome.windows.update(sidebarWindowId, {
      left: dockBounds.left,
      top: dockBounds.top,
      height: dockBounds.height
    });
  } catch (_) {}
}

function debugLog(...args) {
  if (!debugMode) return;
  try { console.log('[AISidebar]', ...args); } catch (_) {}
}
