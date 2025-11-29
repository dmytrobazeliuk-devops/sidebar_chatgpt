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
  customUrl: "",
  debugMode: false
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("options-form");
  const customUrlInput = document.getElementById("custom-url");
  const debugCheckbox = document.getElementById("debug-mode");
  const statusEl = document.getElementById("status");
  const resetBtn = document.getElementById("reset-btn");

  loadConfig();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    
    const selectedProvider = document.querySelector('input[name="provider"]:checked');
    const provider = selectedProvider ? selectedProvider.value : defaultConfig.provider;
    
    const payload = {
      provider: provider,
      customUrl: sanitizeUrl(customUrlInput.value.trim()),
      debugMode: !!debugCheckbox.checked
    };
    
    // Also save the chat URL for backward compatibility
    if (payload.customUrl) {
      payload.chatUrl = payload.customUrl;
    } else {
      payload.chatUrl = AI_PROVIDERS[provider]?.url || AI_PROVIDERS.chatgpt.url;
    }
    
    await chrome.storage.sync.set(payload);
    setStatus("✓ Збережено", statusEl);
  });

  resetBtn.addEventListener("click", async () => {
    await chrome.storage.sync.set({
      ...defaultConfig,
      chatUrl: AI_PROVIDERS.chatgpt.url
    });
    loadConfig();
    setStatus("✓ Скинуто до налаштувань за замовчуванням", statusEl);
  });

  async function loadConfig() {
    const stored = await chrome.storage.sync.get(defaultConfig);
    
    // Set provider radio
    const provider = stored.provider || defaultConfig.provider;
    const providerRadio = document.getElementById(`provider-${provider}`);
    if (providerRadio) {
      providerRadio.checked = true;
    }
    
    customUrlInput.value = stored.customUrl || "";
    debugCheckbox.checked = !!stored.debugMode;
  }
});

function sanitizeUrl(value) {
  if (!value) {
    return "";
  }
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString();
  } catch (error) {
    return "";
  }
}

function setStatus(message, el) {
  el.textContent = message;
  clearTimeout(setStatus.timeoutId);
  setStatus.timeoutId = setTimeout(() => {
    el.textContent = "";
  }, 2500);
}
