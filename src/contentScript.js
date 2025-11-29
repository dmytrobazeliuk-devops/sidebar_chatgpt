(() => {
  const TOAST_ID = "ai-sidebar-toast";
  const defaultSettings = { targetLanguage: "Ukrainian", provider: "chatgpt" };
  let settings = { ...defaultSettings };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PREPARE_SELECTION") {
      buildSelection(message.intent)
        .then(sendResponse)
        .catch((error) => {
          console.error("AI Sidebar selection error", error);
          sendResponse({ ok: false, errorMessage: "Failed to process text." });
        });
      return true;
    }

    if (message.type === "SHOW_TOAST") {
      showToast(message.text || "Done");
    }

    return false;
  });

  // Load settings
  try {
    chrome.storage?.sync?.get(defaultSettings, (stored) => {
      settings = { ...defaultSettings, ...(stored || {}) };
    });
  } catch (_) {}

  // Selection hint menu
  const SELECT_MENU_ID = "ai-sidebar-selectmenu";
  const QUICK_ACTIONS = [
    { id: "ask", intent: "ask", label: "Ask AI", variant: "primary" },
    { id: "explain", intent: "explain", label: "Explain" },
    { id: "improve", intent: "improve", label: "Improve" },
    { id: "translate", intent: "translate", label: "Translate" }
  ];
  const quickActionById = QUICK_ACTIONS.reduce((acc, action) => {
    acc[action.id] = action;
    return acc;
  }, {});
  let selectMenu;
  let selectMenuVisibleFor = "";

  document.addEventListener("mouseup", () => setTimeout(maybeShowSelectMenu, 0));
  document.addEventListener("keyup", (e) => {
    if (e.key === "Escape") hideSelectMenu();
    else setTimeout(maybeShowSelectMenu, 0);
  });
  document.addEventListener("scroll", hideSelectMenu, true);
  window.addEventListener("resize", hideSelectMenu);

  function maybeShowSelectMenu() {
    const sel = window.getSelection();
    const value = sel?.toString().trim();
    if (!value) {
      hideSelectMenu();
      return;
    }

    const range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range) {
      hideSelectMenu();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideSelectMenu();
      return;
    }

    ensureSelectMenu();
    positionSelectMenu(rect);
    selectMenuVisibleFor = value;
    selectMenu.setAttribute("data-visible", "true");
    updateSelectMenuLabels();
  }

  function ensureSelectMenu() {
    if (selectMenu) return;
    selectMenu = document.createElement("div");
    selectMenu.id = SELECT_MENU_ID;
    selectMenu.className = "ai-sidebar-selectmenu";
    selectMenu.innerHTML = `
      <div class="ai-sidebar-selectmenu__actions">
        ${QUICK_ACTIONS.map(
          (action) => `<button data-action="${action.id}" data-variant="${action.variant || "default"}">${action.label}</button>`
        ).join("")}
      </div>
    `;
    selectMenu.addEventListener("mousedown", (e) => e.preventDefault());
    selectMenu.addEventListener("click", onSelectMenuClick);
    hostElement().appendChild(selectMenu);
  }

  function positionSelectMenu(rect) {
    const margin = 12;
    const top = window.scrollY + rect.top - 40 - margin;
    let left = window.scrollX + rect.left + rect.width / 2 - 80;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - 160 - 8;
    left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));
    selectMenu.style.top = `${Math.max(top, window.scrollY + 8)}px`;
    selectMenu.style.left = `${left}px`;
  }

  function hideSelectMenu() {
    if (!selectMenu) return;
    selectMenu.setAttribute("data-visible", "false");
    selectMenuVisibleFor = "";
  }

  function updateSelectMenuLabels() {
    if (!selectMenu) return;
    const translateBtn = selectMenu.querySelector('button[data-action="translate"]');
    if (translateBtn) {
      translateBtn.textContent = `Translate to ${settings.targetLanguage}`;
    }
  }

  async function onSelectMenuClick(e) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute("data-action");
    const selText = selectMenuVisibleFor;
    hideSelectMenu();
    if (!selText) return;
    const actionConfig = action ? quickActionById[action] : null;
    if (!actionConfig) return;

    // Open sidebar
    try {
      await chrome.runtime.sendMessage({ type: "OPEN_SIDEBAR_POPUP" });
      showToast("Opening AI sidebar…");
    } catch (_) {
      showToast("Couldn't open sidebar");
    }
  }

  async function buildSelection(intent) {
    const selection = window.getSelection()?.toString().trim();
    if (!selection) {
      const message = "Please select text first.";
      showToast(message);
      return { ok: false, errorMessage: message };
    }

    const prompt = buildPrompt(intent, selection);
    return { ok: true, prompt, length: prompt.length };
  }

  function buildPrompt(intent, selection) {
    switch (intent) {
      case "ask":
        return `You are a helpful assistant. Use the selected text as context and provide a helpful response.\n\n${selection}`;
      case "explain":
        return `Explain the following text in simple, easy-to-understand language.\n\n${selection}`;
      case "improve":
        return `Improve the clarity, style, and correctness of this text. Respond with the polished version only.\n\n${selection}`;
      case "summarize":
        return `Summarize the following text in up to 5 bullet points.\n\n${selection}`;
      case "translate":
        return `Translate the following text into ${settings.targetLanguage}.\n\n${selection}`;
      default:
        return `Summarize the following text in up to 5 bullet points.\n\n${selection}`;
    }
  }

  function showToast(text) {
    if (!text) {
      return;
    }
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.className = "ai-sidebar-toast";
      hostElement().appendChild(toast);
    }
    toast.textContent = text;
    toast.setAttribute("data-visible", "true");
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => {
      toast?.setAttribute("data-visible", "false");
    }, 3200);
  }

  function hostElement() {
    return document.body || document.documentElement;
  }
})();
