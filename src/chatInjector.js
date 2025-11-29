(() => {
  // Content script injected only on chatgpt.com/chat.openai.com
  const state = {
    activeJob: null
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'PING_CHATGPT') {
      // respond synchronously; no need to keep channel open
      sendResponse({ ok: true });
      return false;
    }

    if (message.type === 'CHATGPT_SUBMIT_PROMPT') {
      const { jobId, prompt } = message;
      if (!prompt) {
        try { console.warn('[HotkeySidebar] No prompt'); } catch (_) {}
        sendResponse({ ok: false, error: 'NO_PROMPT' });
        return true;
      }
      submit(jobId, prompt)
        .then((response) => sendResponse({ ok: true, response }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || 'FAILED' }));
      return true; // keep the channel open for async response
    }
    
    if (message.type === 'GET_LAST_RESPONSE') {
      getLastResponse()
        .then((response) => sendResponse({ ok: true, response }))
        .catch(() => sendResponse({ ok: false, response: '' }));
      return true;
    }
    
    if (message.type === 'NEW_CHAT') {
      startNewChat()
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }
  });
  
  async function startNewChat() {
    // Try to find and click "New Chat" button
    const newChatSelectors = [
      'button[aria-label*="New chat" i]',
      'button[aria-label*="Новий чат" i]',
      'a[href*="/new"]',
      '[data-testid*="new-chat"]',
      'button:contains("New chat")'
    ];
    
    for (const selector of newChatSelectors) {
      try {
        const buttons = Array.from(document.querySelectorAll(selector));
        for (const button of buttons) {
          const text = (button.textContent || button.getAttribute('aria-label') || '').toLowerCase();
          if (text.includes('new chat') || text.includes('новий чат')) {
            if (isVisible(button)) {
              button.click();
              await sleep(500);
              return;
            }
          }
        }
      } catch (_) {}
    }
    
    // Fallback: try to navigate to new chat URL
    try {
      const currentUrl = window.location.href;
      if (!currentUrl.endsWith('/')) {
        window.location.href = window.location.origin + '/';
        await sleep(1000);
      }
    } catch (_) {}
  }

  async function submit(jobId, prompt) {
    state.activeJob = jobId;
    const input = await waitForComposer(40, 250); // up to 10s
    if (!input) throw new Error('Composer not found');

    await setComposerValue(input, prompt);
    await sleep(80);
    await triggerSend(input);

    // Wait until generation completes (heuristic)
    await waitUntilGenerationFinished(90_000); // up to 90s

    // Get the response text
    const responseText = await getLastResponse();
    
    // Notify background with response
    try {
      await chrome.runtime.sendMessage({ 
        type: 'CHATGPT_GENERATION_DONE', 
        jobId,
        response: responseText 
      });
    } catch (_) {}
    state.activeJob = null;
  }

  async function getLastResponse() {
    // Best-effort: use the extraction heuristic
    try {
      const txt = extractLatestAssistantText();
      if (txt && txt.trim()) return txt.trim();
    } catch (_) {}
    return '';
  }

  function extractTextFromElement(el) {
    if (!el) return '';
    // Clone to avoid modifying the original
    const clone = el.cloneNode(true);
    // Remove buttons and other UI elements
    clone.querySelectorAll('button, [role="button"], svg, img').forEach(n => n.remove());
    return clone.textContent || clone.innerText || '';
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function waitForComposer(attempts, delayMs) {
    for (let i = 0; i < attempts; i++) {
      const el = findComposer();
      if (el) return el;
      await sleep(delayMs);
    }
    return null;
  }

  function findComposer() {
    // Prefer a textarea with common ids/placeholders
    const candidates = [
      'textarea#prompt-textarea',
      'textarea[placeholder*="Message" i]',
      'textarea[placeholder*="повідомлення" i]',
      'textarea:not([disabled])',
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][data-id]'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (isVisible(el)) return el;
    }
    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return !!(rect && rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden');
  }

  async function setComposerValue(el, text) {
    if (el.tagName === 'TEXTAREA') {
      el.focus();
      el.value = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      return;
    }
    // contenteditable fallback
    el.focus();
    try {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    } catch (_) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  async function triggerSend(el) {
    // Try Enter key
    const down = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
    const up = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
    el.dispatchEvent(down);
    el.dispatchEvent(up);

    // Also try clicking Send button if exists
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
      if (label.includes('send') || label.includes('надіслати')) {
        try { b.click(); } catch (_) {}
        break;
      }
    }
  }

  async function waitUntilGenerationFinished(timeoutMs) {
    const startedAt = Date.now();
    // If there is a stop button visible, wait for it to disappear
    while (Date.now() - startedAt < timeoutMs) {
      if (!isGenerating()) return;
      await sleep(500);
    }
  }

  function isGenerating() {
    // Heuristics: presence of a stop button or disabled composer
    const stopButton = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find((b) => {
        const t = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();
        return t.includes('stop generating') || t === 'stop' || t.includes('зупинити');
      });
    if (stopButton) return true;

    const composer = findComposer();
    if (composer && (composer.hasAttribute('disabled') || composer.getAttribute('aria-disabled') === 'true')) {
      return true;
    }
    return false;
  }

  function extractLatestAssistantText() {
    // Heuristics to find the latest assistant message in the chat UI.
    // Try several selectors used by common chat UIs. Return joined text.
    const candidateSelectors = [
      '.message',
      '.group',
      '[data-testid*="message"]',
      '.chat-message',
      '.markdown',
      'article div' // broad fallback
    ];

    for (const sel of candidateSelectors) {
      const nodes = Array.from(document.querySelectorAll(sel)).filter(n => n && n.innerText && n.innerText.trim().length > 0);
      if (nodes.length) {
        const last = nodes[nodes.length - 1];
        // Clean up the text a bit
        const txt = last.innerText.trim();
        if (txt) return txt;
      }
    }

    // As a last resort, try to find all text nodes in the main thread and pick the last
    try {
      const main = document.querySelector('main') || document.body;
      const texts = Array.from(main.querySelectorAll('*')).map(n => n.innerText).filter(Boolean);
      if (texts.length) return texts[texts.length - 1].trim();
    } catch (_) {}

    return '';
  }
})();
