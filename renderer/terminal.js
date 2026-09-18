// Initialize Terminal with ResizeObserver for Native-Grade stability
const terminalContainer = document.getElementById('terminal-container');

function getTerminalTheme() {
  const root = document.documentElement;
  let dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (root.classList.contains('theme-dark')) dark = true;
  if (root.classList.contains('theme-light')) dark = false;

  return dark
    ? {
        background: '#1a1a1a', // Windows Native Dark Background
        foreground: '#ffffff',
        cursor: '#0078d4',
        selectionBackground: 'rgba(0, 120, 212, 0.3)',
      }
    : {
        background: '#ffffff', // Windows Native Light Background
        foreground: '#000000', // Rich contrast black text for terminal stability
        cursor: '#0078d4',
        selectionBackground: 'rgba(0, 120, 212, 0.25)',
        // Deepen ANSI escape colors for extreme clarity on light canvas backgrounds
        black: '#000000',
        red: '#cd2026',
        green: '#00a600',
        yellow: '#947100', // Deepened from light yellow to rich high-contrast amber/brown
        blue: '#0451a5',
        magenta: '#bc05bc',
        cyan: '#0598bc',
        white: '#555555',
        brightBlack: '#666666',
        brightRed: '#d74348',
        brightGreen: '#14ca14',
        brightYellow: '#b58900', // Boosted contrast amber for clear readability
        brightBlue: '#2379de',
        brightMagenta: '#d833d8',
        brightCyan: '#12b5e1',
        brightWhite: '#333333',
      };
}

const term = new Terminal({
  cursorBlink: true,
  fontSize: 12,
  fontWeight: '500', // Boost base font weight for clean line rendering
  drawBoldTextInBrightColors: false, // Prevent washing out bold text variants into high-brightness scales
  fontFamily: 'Consolas, "Courier New", monospace',
  allowProposedApi: true,
  windowsMode: window.electronAPI.isWindows,
  theme: getTerminalTheme(),
});

// Sync terminal theme dynamically on system theme changes or custom theme overrides
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  term.options.theme = getTerminalTheme();
});

const themeMutationObserver = new MutationObserver(() => {
  term.options.theme = getTerminalTheme();
});
themeMutationObserver.observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class'],
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

term.open(terminalContainer);

// Initial fit with a small delay to ensure DOM is ready
setTimeout(() => {
  fitAddon.fit();
  window.electronAPI.terminalResize(term.cols, term.rows);
}, 100);

// CRITICAL: ResizeObserver ensures the backend PTY and frontend XTerm are ALWAYS in sync
const resizeObserver = new ResizeObserver(() => {
  if (terminalContainer.offsetWidth > 0 && terminalContainer.offsetHeight > 0) {
    requestAnimationFrame(() => {
      fitAddon.fit();
      window.electronAPI.terminalResize(term.cols, term.rows);
    });
  }
});
resizeObserver.observe(terminalContainer);

// Keyboard support for Copy/Paste
term.attachCustomKeyEventHandler((e) => {
  if (e.type === 'keydown' && e.ctrlKey) {
    const key = e.key.toLowerCase();
    // Copy only if there is a selection
    if (key === 'c' && term.hasSelection()) {
      const selection = term.getSelection();
      navigator.clipboard.writeText(selection);
      return false;
    }
    // Let Ctrl+V fall through to the 'paste' event listener below
    if (key === 'v') return true;
    // Select All
    if (key === 'a') {
      term.selectAll();
      return false;
    }
  }
  return true;
});

// Single point of truth for all paste operations (Ctrl+V, Menu, etc.)
terminalContainer.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData.getData('text');
  if (text) term.paste(text);
});

// Enable selection and Context Menu
terminalContainer.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.electronAPI.showContextMenu({ type: 'terminal' });
});

// High-Precision Terminal Scrolling (Fix for full page scrolling, scroll one line at a time)
terminalContainer.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.deltaY > 0) {
      term.scrollLines(1);
    } else if (e.deltaY < 0) {
      term.scrollLines(-1);
    }
  },
  { passive: false, capture: true },
);

window.electronAPI.onTerminalCommand((command) => {
  if (command === 'copy') {
    const selection = term.getSelection();
    if (selection) navigator.clipboard.writeText(selection);
  } else if (command === 'paste') {
    navigator.clipboard.readText().then((text) => {
      if (text) term.paste(text);
    });
  } else if (command === 'select-all') {
    term.selectAll();
  } else if (command === 'clear') {
    term.clear();
    window.electronAPI.terminalInput('\f');
  }
});

// Handle data flow
term.onData((data) => window.electronAPI.terminalInput(data));
window.electronAPI.onTerminalData((data) => {
  term.write(data);
  requestAnimationFrame(() => {
    term.scrollToBottom();
  });
});

// Expose terminal to app.js
window.terminal = {
  term,
  fitAddon,
  write: (data) => term.write(data),
  sendCommand: (cmd) => window.electronAPI.terminalInput(cmd + '\r'),
};
