# Hotkey Sidebar for ChatGPT

A lightweight extension that opens the official ChatGPT site in a slim popup and runs entirely via hotkeys or the right‑click menu. All answers come from chatgpt.com (or any URL you set), so no API keys are needed.

## Features

- `Ctrl/Cmd + Shift + Y` — open/close the ChatGPT popup sidebar.
- `Ctrl/Cmd + Shift + U` — send selected text with a “summarize” instruction.
- Context menu on selection: Send to ChatGPT.
 - Toolbar icon (pin it in Chrome): click to toggle the sidebar popup.
- Auto‑insert + auto‑send (simulate Enter) in the official ChatGPT UI.
- Sequential queue: add many prompts; they send one after another.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Log into ChatGPT in a normal tab so the popup reuses your session.
5. Optional: open **Details → Extension options** to change the ChatGPT URL, default translate language, and the three quick translate languages.

## Usage

1. Select text on any regular site (not Chrome Web Store or chrome:// pages).
2. Use a hotkey or right‑click → a ChatGPT action.
3. The extension opens the popup (if not already), inserts the prompt into ChatGPT, and “presses Enter”.
4. If you add multiple prompts quickly, they queue and send in order.

Shortcuts can be remapped at `chrome://extensions/shortcuts`.

## Development

- Manifest V3 service worker handles hotkeys/queue; content scripts handle selection, toasts, and ChatGPT injection.
- No build step needed; edit files and reload the extension.
- Icons live in `assets/` (16–256 px).
