// Initialize Terminal with ResizeObserver for Native-Grade stability
const terminalContainer = document.getElementById('terminal-container');

const term = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontFamily: 'Consolas, "Courier New", monospace',
    allowProposedApi: true,
    windowsMode: window.electronAPI.isWindows,
    scrollSensitivity: 0.3, // Aggressive fix for Windows 3-line jump
    smoothScrollDuration: 200,
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
    if (e.type === 'keydown' && e.ctrlKey && e.shiftKey) {
        if (e.key === 'C') {
            const selection = term.getSelection();
            if (selection) {
                navigator.clipboard.writeText(selection);
                return false;
            }
        }
        if (e.key === 'V') {
            navigator.clipboard.readText().then(text => {
                window.electronAPI.terminalInput(text);
            });
            return false;
        }
    }
    return true;
});

// Enable selection and Context Menu
terminalContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const selectedText = term.getSelection();

    const menu = document.createElement('div');
    menu.style.position = 'fixed';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;
    menu.style.backgroundColor = '#252526';
    menu.style.border = '1px solid #454545';
    menu.style.zIndex = '1000';
    menu.style.padding = '5px 0';
    menu.style.fontSize = '12px';
    menu.style.color = '#ccc';
    menu.style.boxShadow = '0 4px 8px rgba(0,0,0,0.5)';

    const createItem = (label, action) => {
        const item = document.createElement('div');
        item.textContent = label;
        item.style.padding = '5px 20px';
        item.style.cursor = 'pointer';
        item.onmouseover = () => item.style.backgroundColor = '#094771';
        item.onmouseout = () => item.style.backgroundColor = 'transparent';
        item.onclick = () => {
            action();
            if (document.body.contains(menu)) document.body.removeChild(menu);
        };
        return item;
    };

    menu.appendChild(createItem('Copy', () => {
        if (selectedText) navigator.clipboard.writeText(selectedText);
    }));

    menu.appendChild(createItem('Paste', async () => {
        const text = await navigator.clipboard.readText();
        window.electronAPI.terminalInput(text);
    }));

    document.body.appendChild(menu);

    const closeMenu = (ev) => {
        if (!menu.contains(ev.target)) {
            if (document.body.contains(menu)) document.body.removeChild(menu);
            document.removeEventListener('mousedown', closeMenu);
        }
    };
    document.addEventListener('mousedown', closeMenu);
});

// Handle data flow
term.onData(data => window.electronAPI.terminalInput(data));
window.electronAPI.onTerminalData(data => {
    term.write(data);
    // Explicitly scroll to bottom on new data
    term.scrollToBottom();
});

// Expose terminal to app.js
window.terminal = {
    term,
    fitAddon,
    write: (data) => term.write(data),
    sendCommand: (cmd) => window.electronAPI.terminalInput(cmd + '\r')
};
