const defaultConfig = {
  chatUrl: "https://chatgpt.com/",
  targetLanguage: "Ukrainian",
  debugMode: false
};

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("options-form");
  const urlInput = document.getElementById("chat-url");
  const languageInput = document.getElementById("target-language");
  const debugCheckbox = document.getElementById("debug-mode");
  const statusEl = document.getElementById("status");

  loadConfig();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      chatUrl: sanitizeUrl(urlInput.value.trim()) || defaultConfig.chatUrl,
      targetLanguage: languageInput.value.trim() || defaultConfig.targetLanguage,
      debugMode: !!debugCheckbox.checked
    };
    await chrome.storage.sync.set(payload);
    setStatus("Saved", statusEl);
  });

  async function loadConfig() {
    const stored = await chrome.storage.sync.get(defaultConfig);
    urlInput.value = stored.chatUrl || defaultConfig.chatUrl;
    languageInput.value = stored.targetLanguage || defaultConfig.targetLanguage;
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
