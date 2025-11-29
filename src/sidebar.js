(function() {
  'use strict';

  const chatInput = document.getElementById('chatInput');
  const sendButton = document.getElementById('sendButton');
  const chatMessages = document.getElementById('chatMessages');
  const welcomeMessage = document.getElementById('welcomeMessage');
  const chatContainer = document.getElementById('chatContainer');
  const chatgptFrame = document.getElementById('chatgptFrame');
  const refreshButton = document.getElementById('refreshButton');
  const menuButton = document.getElementById('menuButton');
  const newChatButton = document.getElementById('newChatButton');

  let chatgptTabId = null;
  let isProcessing = false;
  let messageQueue = [];

  // Initialize ChatGPT - ask background to set up
  async function initChatGPT() {
    try {
      // Ask background script to ensure ChatGPT tab is ready
      const response = await chrome.runtime.sendMessage({
        type: 'ENSURE_CHATGPT_TAB'
      });
      
      if (response && response.tabId) {
        chatgptTabId = response.tabId;
      }
    } catch (error) {
      console.error('Failed to initialize ChatGPT:', error);
      // Don't show error immediately, let background handle it
    }
  }

  // If this sidebar runs inside the browser side panel, ensure the background can open popup when needed
  (function setupAutoFallback() {
    try {
      console.debug('[HotkeySidebar] sidebar script loaded');
      // Listen for a quick ping from background to ensure connectivity
      chrome.runtime.sendMessage({ type: 'SIDEBAR_PING' }).catch(() => {});
    } catch (_) {}
  })();

  // Auto-resize textarea
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    sendButton.disabled = !this.value.trim() || isProcessing;
  });

  chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isProcessing && this.value.trim()) {
        sendMessage();
      }
    }
  });

  sendButton.addEventListener('click', sendMessage);

  refreshButton.addEventListener('click', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'REFRESH_CHATGPT_TAB' });
      showToast('Chat refreshed');
      await initChatGPT();
    } catch (error) {
      console.error('Failed to refresh:', error);
    }
  });

  newChatButton.addEventListener('click', () => {
    startNewChat();
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHATGPT_RESPONSE') {
      addMessage('assistant', message.text);
      isProcessing = false;
      sendButton.disabled = !chatInput.value.trim();
      sendResponse({ ok: true });
      return true;
    }
    if (message.type === 'CHATGPT_ERROR') {
      showError(message.error || 'Failed to get response');
      isProcessing = false;
      sendButton.disabled = !chatInput.value.trim();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || isProcessing) return;

    // Add user message to UI
    addMessage('user', text);
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendButton.disabled = true;
    isProcessing = true;

    // Hide welcome message, show chat
    if (welcomeMessage.style.display !== 'none') {
      welcomeMessage.style.display = 'none';
      chatMessages.style.display = 'flex';
    }

    // Show typing indicator
    showTypingIndicator();

    try {
      // Initialize ChatGPT if needed
      if (!chatgptTabId) {
        await initChatGPT();
      }

      // Send message to ChatGPT via background script
      const response = await chrome.runtime.sendMessage({
        type: 'SEND_TO_CHATGPT',
        prompt: text,
        tabId: chatgptTabId
      });

      if (!response || !response.ok) {
        throw new Error(response?.error || 'Failed to send message');
      }

      // If response came directly, use it
      if (response.response) {
        addMessage('assistant', response.response);
        isProcessing = false;
        sendButton.disabled = !chatInput.value.trim();
      }
      // Otherwise wait for CHATGPT_RESPONSE message
    } catch (error) {
      console.error('Error sending message:', error);
      hideTypingIndicator();
      showError('Failed to send message. Please try again.');
      isProcessing = false;
      sendButton.disabled = !chatInput.value.trim();
    }
  }

  function addMessage(role, text) {
    hideTypingIndicator();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString('uk-UA', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message message-assistant';
    typingDiv.id = 'typingIndicator';
    
    const indicatorDiv = document.createElement('div');
    indicatorDiv.className = 'typing-indicator';
    indicatorDiv.innerHTML = `
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    `;
    
    typingDiv.appendChild(indicatorDiv);
    chatMessages.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
      indicator.remove();
    }
  }

  function showError(message) {
    hideTypingIndicator();
    addMessage('assistant', `Error: ${message}`);
  }

  function showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      animation: fadeInOut 2s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 1700);
  }

  function startNewChat() {
    // Clear messages
    chatMessages.innerHTML = '';
    chatMessages.style.display = 'none';
    
    // Show welcome message
    welcomeMessage.style.display = 'flex';
    
    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendButton.disabled = true;
    
    // Reset processing state
    isProcessing = false;
    messageQueue = [];
    
    // Optionally start a new chat in ChatGPT
    if (chatgptTabId) {
      chrome.runtime.sendMessage({
        type: 'NEW_CHATGPT_CHAT',
        tabId: chatgptTabId
      }).catch(() => {});
    }
  }

  // Initialize on load
  initChatGPT().catch(console.error);

  // Handle messages from content script (for queued prompts)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ENQUEUE_PROMPT') {
      if (chatInput && !isProcessing) {
        chatInput.value = message.prompt;
        chatInput.dispatchEvent(new Event('input'));
        setTimeout(() => sendMessage(), 100);
      } else {
        messageQueue.push(message.prompt);
      }
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  // Process queued messages when ready
  setInterval(() => {
    if (!isProcessing && messageQueue.length > 0) {
      const prompt = messageQueue.shift();
      if (chatInput) {
        chatInput.value = prompt;
        chatInput.dispatchEvent(new Event('input'));
        setTimeout(() => sendMessage(), 100);
      }
    }
  }, 500);
})();
