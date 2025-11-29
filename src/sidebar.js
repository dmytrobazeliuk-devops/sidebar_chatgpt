(function() {
  'use strict';

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

  const aiFrame = document.getElementById('aiFrame');
  const refreshButton = document.getElementById('refreshButton');
  const settingsButton = document.getElementById('settingsButton');
  const openExternalButton = document.getElementById('openExternalButton');
  const headerTitle = document.getElementById('headerTitle');
  const titleText = document.getElementById('titleText');
  const providerDropdown = document.getElementById('providerDropdown');
  const loadingContainer = document.getElementById('loadingContainer');
  const mainContainer = document.getElementById('mainContainer');
  const menuButton = document.getElementById('menuButton');

  let currentProvider = 'chatgpt';
  let currentUrl = AI_PROVIDERS.chatgpt.url;
  let dropdownOpen = false;

  // Initialize
  async function init() {
    await loadConfig();
    setupEventListeners();
    loadAIProvider();
  }

  async function loadConfig() {
    try {
      const stored = await chrome.storage.sync.get({
        provider: 'chatgpt',
        customUrl: '',
        chatUrl: ''
      });

      currentProvider = stored.provider || 'chatgpt';
      
      if (stored.customUrl) {
        currentUrl = stored.customUrl;
      } else if (stored.chatUrl && stored.chatUrl !== AI_PROVIDERS[currentProvider]?.url) {
        currentUrl = stored.chatUrl;
      } else {
        currentUrl = AI_PROVIDERS[currentProvider]?.url || AI_PROVIDERS.chatgpt.url;
      }

      updateTitle();
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  function setupEventListeners() {
    // Refresh button
    refreshButton.addEventListener('click', () => {
      showLoading();
      aiFrame.src = currentUrl;
    });

    // Settings button
    settingsButton.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Open in external tab
    openExternalButton.addEventListener('click', () => {
      chrome.tabs.create({ url: currentUrl });
    });

    // Header title click - toggle dropdown
    headerTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Menu button - also toggles dropdown
    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDropdown();
    });

    // Dropdown items
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const provider = e.currentTarget.dataset.provider;
        if (provider && AI_PROVIDERS[provider]) {
          await switchProvider(provider);
        }
        closeDropdown();
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', () => {
      closeDropdown();
    });

    // Iframe load events
    aiFrame.addEventListener('load', () => {
      hideLoading();
    });

    aiFrame.addEventListener('error', () => {
      hideLoading();
      showError();
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.provider || changes.customUrl || changes.chatUrl) {
          loadConfig().then(() => {
            loadAIProvider();
          });
        }
      }
    });
  }

  function toggleDropdown() {
    dropdownOpen = !dropdownOpen;
    providerDropdown.classList.toggle('open', dropdownOpen);
    headerTitle.classList.toggle('active', dropdownOpen);
  }

  function closeDropdown() {
    dropdownOpen = false;
    providerDropdown.classList.remove('open');
    headerTitle.classList.remove('active');
  }

  async function switchProvider(provider) {
    currentProvider = provider;
    currentUrl = AI_PROVIDERS[provider].url;
    
    // Save to storage
    await chrome.storage.sync.set({
      provider: provider,
      chatUrl: currentUrl
    });

    updateTitle();
    loadAIProvider();
  }

  function updateTitle() {
    const providerInfo = AI_PROVIDERS[currentProvider];
    titleText.textContent = providerInfo ? providerInfo.name : 'AI Chat';
    
    // Update dropdown active state
    document.querySelectorAll('.dropdown-item').forEach(item => {
      item.classList.toggle('active', item.dataset.provider === currentProvider);
    });
  }

  function loadAIProvider() {
    showLoading();
    
    // Set iframe src
    if (aiFrame.src !== currentUrl) {
      aiFrame.src = currentUrl;
    } else {
      hideLoading();
    }
  }

  function showLoading() {
    loadingContainer.style.display = 'flex';
    mainContainer.style.opacity = '0.5';
  }

  function hideLoading() {
    loadingContainer.style.display = 'none';
    mainContainer.style.opacity = '1';
  }

  function showError() {
    // If iframe fails to load (likely due to X-Frame-Options),
    // show a message with option to open in new tab
    loadingContainer.innerHTML = `
      <div class="error-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <h3>Не вдалося завантажити</h3>
        <p>Цей сайт не дозволяє вбудовування.<br>Відкрийте його у новій вкладці.</p>
        <button class="open-tab-button" id="openTabButton">
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path d="M14 10V14C14 14.5304 13.7893 15.0391 13.4142 15.4142C13.0391 15.7893 12.5304 16 12 16H4C3.46957 16 2.96086 15.7893 2.58579 15.4142C2.21071 15.0391 2 14.5304 2 14V6C2 5.46957 2.21071 4.96086 2.58579 4.58579C2.96086 4.21071 3.46957 4 4 4H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M11 2H16V7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 11L16 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Відкрити у вкладці
        </button>
      </div>
    `;
    loadingContainer.style.display = 'flex';
    mainContainer.style.display = 'none';

    document.getElementById('openTabButton')?.addEventListener('click', () => {
      chrome.tabs.create({ url: currentUrl });
    });
  }

  // Notify background that sidebar is ready
  try {
    chrome.runtime.sendMessage({ type: 'SIDEBAR_PING' }).catch(() => {});
  } catch (_) {}

  // Initialize on load
  init().catch(console.error);
})();
