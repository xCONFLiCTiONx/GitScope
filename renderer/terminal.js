// Initialize Terminal with ResizeObserver for Native-Grade stability
const terminalContainer = document.getElementById('terminal-container');

const term = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontFamily: 'Consolas, "Courier New", monospace',
    allowProposedApi: true,
    windowsMode: window.electronAPI.isWindows,
    theme: {
        background: '#000000',
        foreground: '#cccccc',
        cursor: '#1f6feb',
        selectionBackground: 'rgba(31, 111, 235, 0.3)'
    }
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

window.electronAPI.onTerminalCommand((command) => {
    if (command === 'copy') {
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection);
    } else if (command === 'paste') {
        navigator.clipboard.readText().then(text => {
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
term.onData(data => window.electronAPI.terminalInput(data));
window.electronAPI.onTerminalData(data => {
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
    sendCommand: (cmd) => window.electronAPI.terminalInput(cmd + '\r')
};
