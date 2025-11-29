const defaultConfig = {
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

// Queue for prompts destined to ChatGPT
const sendQueue = [];
let processing = false;
const waiters = new Map(); // jobId -> {resolve, reject}

chrome.runtime.onInstalled.addListener(async () => {
  await loadConfig();
  await setupSidePanel();
  // Single context menu item: "Send to ChatGPT"
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: "chatgpt_send", title: "Send to ChatGPT", contexts: ["selection"] });
    });
  } catch (_) {
    // ignore
  }
});
loadConfig();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info || !tab) return;
  if (!info.selectionText) return;

  const text = info.selectionText.trim();
  if (!text) return;

  let prompt;
  if (info.menuItemId === "chatgpt_send") {
    prompt = `Summarize the following text in up to 5 bullet points.\n\n${text}`;
  } else {
    return;
  }

  await notifyTab(tab.id, { type: "SHOW_TOAST", text: "Sending to ChatGPT…" });
  enqueuePrompt(prompt);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  config = { ...config };
  Object.entries(changes).forEach(([key, { newValue }]) => {
    config[key] = newValue ?? defaultConfig[key];
  });
  debugMode = !!config.debugMode;
  updateBadge();
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
    case "summarize-selection":
      await handleSelectionCommand("summarize");
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
  updateBadge();
}

async function handleSelectionCommand(intent) {
  const activeTab = await getActiveTab();
  if (!activeTab?.id) {
    return;
  }

  const result = await chrome.tabs
    .sendMessage(activeTab.id, {
      type: "PREPARE_SELECTION",
      intent
    })
    .catch(() => null);

  if (!result || !result.ok || !result.prompt) {
    await notifyTab(activeTab.id, {
      type: "SHOW_TOAST",
      text: result?.errorMessage || "Couldn't process the selection."
    });
    return;
  }

  await notifyTab(activeTab.id, { type: "SHOW_TOAST", text: "Sending to ChatGPT…" });
  enqueuePrompt(result.prompt);
}

async function toggleSidebarWindow() {
  // Always use integrated side panel if available
  if (await tryOpenSidePanel()) return;

  // Fallback: only use popup window if side panel is not available
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

  const createData = {
    url: config.chatUrl || defaultConfig.chatUrl,
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

// no dynamic menu titles needed

function enqueuePrompt(prompt) {
  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  sendQueue.push({ id: jobId, prompt });
  debugLog('enqueue', jobId, prompt.slice(0, 60));
  processQueue().catch(() => {});
}

async function processQueue() {
  if (processing) return;
  processing = true;
  updateBadge();
  try {
    while (sendQueue.length) {
      const job = sendQueue[0];
      debugLog('processQueue start', job.id);
      await openSidebarWindow();
      const tabId = await getSidebarTabId();
      if (!tabId) {
        // Could not reach ChatGPT window; break to avoid tight loop
        debugLog('no sidebar tab');
        break;
      }
      const ready = await pingChatInjector(tabId, 20, 500);
      if (!ready) {
        // Try reloading the tab
        try { await chrome.tabs.reload(tabId); } catch (_) {}
        await new Promise(r => setTimeout(r, 1500));
      }

      await submitToChatGPT(tabId, job.id, job.prompt);
      await waitForJob(job.id, 90000); // wait up to 90s for completion
      sendQueue.shift();
      updateBadge();
    }
  } finally {
    processing = false;
    updateBadge();
  }
}

async function getSidebarTabId() {
  if (!sidebarWindowId) return null;
  const tabs = await chromeAsync.tabsQuery({ windowId: sidebarWindowId });
  return tabs && tabs[0] ? tabs[0].id : null;
}

async function pingChatInjector(tabId, attempts = 10, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    const pong = await chrome.tabs
      .sendMessage(tabId, { type: "PING_CHATGPT" })
      .catch(() => null);
    if (pong && pong.ok) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  debugLog('pingChatInjector timeout');
  return false;
}

async function submitToChatGPT(tabId, jobId, prompt) {
  try {
    debugLog('submitToChatGPT', jobId);
    await chrome.tabs.sendMessage(tabId, { type: "CHATGPT_SUBMIT_PROMPT", jobId, prompt });
  } catch (error) {
    // If injection fails, try to focus and retry once after short delay
    try { await chrome.tabs.update(tabId, { active: true }); } catch (_) {}
    await new Promise(r => setTimeout(r, 700));
    await chrome.tabs.sendMessage(tabId, { type: "CHATGPT_SUBMIT_PROMPT", jobId, prompt }).catch(() => {});
  }
}

function waitForJob(jobId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      waiters.delete(jobId);
      resolve(''); // fallback: continue even on timeout
    }, timeoutMs);
    waiters.set(jobId, {
      resolve: (response) => { clearTimeout(t); waiters.delete(jobId); resolve(response || ''); },
      reject: (err) => { clearTimeout(t); waiters.delete(jobId); resolve(''); }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'CHATGPT_GENERATION_DONE' && msg.jobId) {
    debugLog('GENERATION_DONE', msg.jobId);
    const waiter = waiters.get(msg.jobId);
    if (waiter) {
      waiter.resolve(msg.response);
    }
    // Send response to sidebar if available
    sendResponseToSidebar(msg.response);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'ENQUEUE_PROMPT' && msg.prompt) {
    debugLog('ENQUEUE_PROMPT (from content)', msg.prompt.slice(0, 60));
    enqueuePrompt(msg.prompt);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'SEND_TO_CHATGPT' && msg.prompt) {
    handleSidebarMessage(msg.prompt, msg.tabId)
      .then((response) => sendResponse({ ok: true, response }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (msg.type === 'ENSURE_CHATGPT_TAB') {
    ensureChatGPTTab()
      .then((tabId) => sendResponse({ ok: true, tabId }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'REFRESH_CHATGPT_TAB') {
    refreshChatGPTTab()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'NEW_CHATGPT_CHAT' && msg.tabId) {
    startNewChatGPTChat(msg.tabId)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'OPEN_SIDEBAR_POPUP') {
    debugLog('OPEN_SIDEBAR_POPUP requested', msg.source || 'unknown');
    openSidebarWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => { debugLog('openSidebarWindow failed', err); sendResponse({ ok: false, error: String(err) }); });
    return true;
  }
});

async function startNewChatGPTChat(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'NEW_CHAT' });
  } catch (error) {
    debugLog('Failed to start new chat:', error);
  }
}

async function ensureChatGPTTab() {
  // Try to find existing ChatGPT tab
  const tabs1 = await chromeAsync.tabsQuery({ url: 'https://chatgpt.com/*' });
  const tabs2 = await chromeAsync.tabsQuery({ url: 'https://chat.openai.com/*' });
  const tabs = [...(tabs1 || []), ...(tabs2 || [])];
  
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    // Make sure injector is loaded
    const ready = await pingChatInjector(tab.id, 5, 200);
    if (ready) {
      return tab.id;
    }
  }
  
  // Create new tab
  const stored = await chromeAsync.storageGet({ chatUrl: 'https://chatgpt.com/' });
  const chatUrl = stored?.chatUrl || 'https://chatgpt.com/';
  const newTab = await chrome.tabs.create({ url: chatUrl, active: false });
  
  // Wait for load and inject
  await waitForTabLoad(newTab.id);
  await injectChatScript(newTab.id);
  
  return newTab.id;
}

async function waitForTabLoad(tabId, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && tab.status === 'complete') {
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function injectChatScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/chatInjector.js']
    });
  } catch (error) {
    debugLog('Failed to inject script:', error);
  }
}

async function refreshChatGPTTab() {
  const tabs1 = await chromeAsync.tabsQuery({ url: 'https://chatgpt.com/*' });
  const tabs2 = await chromeAsync.tabsQuery({ url: 'https://chat.openai.com/*' });
  const tabs = [...(tabs1 || []), ...(tabs2 || [])];
  
  if (tabs && tabs.length > 0) {
    const tab = tabs[0];
    await chromeAsync.tabsReload(tab.id);
    await waitForTabLoad(tab.id);
    await injectChatScript(tab.id);
  }
}

async function handleSidebarMessage(prompt, providedTabId) {
  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  let tabId = providedTabId;
  
  // If no tab provided, use or create sidebar tab
  if (!tabId) {
    tabId = await getSidebarTabId();
    if (!tabId) {
      await openSidebarWindow();
      tabId = await getSidebarTabId();
    }
  }
  
  if (!tabId) {
    throw new Error('Could not access ChatGPT tab');
  }
  
  // Wait for injector to be ready
  const ready = await pingChatInjector(tabId, 20, 500);
  if (!ready) {
    try { await chrome.tabs.reload(tabId); } catch (_) {}
    await new Promise(r => setTimeout(r, 1500));
  }
  
  // Submit prompt
  await submitToChatGPT(tabId, jobId, prompt);
  
  // Wait for response
  const response = await waitForJob(jobId, 90000);
  return response || 'Response received';
}

async function sendResponseToSidebar(response) {
  if (!response) return;
  try {
    // Try to send to sidebar if it exists
    const sidebars = await chrome.tabs.query({ url: chrome.runtime.getURL('src/sidebar.html') });
    for (const tab of sidebars) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'CHATGPT_RESPONSE',
          text: response
        });
      } catch (_) {}
    }
    // Also send as a runtime message (fallback for side panel views)
    try {
      chrome.runtime.sendMessage({ type: 'CHATGPT_RESPONSE', text: response });
    } catch (_) {}
  } catch (_) {}
}

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
  try { console.log('[HotkeySidebar]', ...args); } catch (_) {}
}

async function updateBadge() {
  if (!debugMode) {
    try { await chrome.action.setBadgeText({ text: '' }); } catch (_) {}
    return;
  }
  const text = sendQueue.length ? String(sendQueue.length) : '';
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#3c82f6' });
    await chrome.action.setBadgeText({ text });
  } catch (_) {}
}
