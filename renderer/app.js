// State management
let repositories = [];
let activeRepo = null;
let isRendering = false;
let hideIgnoredFiles = false;
let settings = { shell: 'powershell.exe', rootRepoDir: '', githubToken: '', obsidianIni: '' };
let selectedNodes = new Set();
let expandedNodes = new Set();
let tokenExpiration = null;
let monacoEditor = null;
let isSyncingFromPreview = false;
let themeEditor = null;
let currentEditingPath = null;
let originalFileContent = null;
let currentFileEncoding = 'UTF-8';
let activeTasks = 0;
let lastSelectedPath = null;
let currentDashboardFilter = 'all';
let feedMessages = [];
let currentFeedIndex = 0;
let feedTimer = null;
let lastKnownStats = null;
let repoVisibilityCache = new Map(); // Session-level cache for Public/Private status

// Global Error Handling for Total Visibility
window.onerror = function(message, source, lineno, colno, error) {
    // Ignore harmless ResizeObserver loop limit errors which are common with Monaco/Flexbox
    if (message.includes('ResizeObserver loop limit exceeded')) return;

    const errorMsg = `[Global Error] ${message}\nAt: ${source}:${lineno}:${colno}`;
    console.error(errorMsg, error);
    if (typeof showError === 'function') {
        showError(errorMsg, 'Unhandled Application Error');
    } else {
        alert(errorMsg);
    }
    return false;
};

window.onunhandledrejection = function(event) {
    const errorMsg = `[Unhandled Promise Rejection] ${event.reason}`;
    console.error(errorMsg);
    if (typeof showError === 'function') {
        showError(errorMsg, 'Async Logic Error');
    } else {
        alert(errorMsg);
    }
};

function setTaskState(running) {
    activeTasks = running ? activeTasks + 1 : Math.max(0, activeTasks - 1);
    if (elements.globalProgress) {
        elements.globalProgress.style.display = activeTasks > 0 ? 'block' : 'none';
    }
}

function updateProgress(percent) {
    const bar = document.getElementById('global-progress-bar');
    if (bar) {
        bar.classList.remove('looping');
        bar.style.width = percent + '%';
    }
}

/**
 * Checks if a font is available on the system or loaded via @font-face.
 */
function checkFontAvailability(fontName) {
    if (!fontName || ['monospace', 'sans-serif', 'serif'].includes(fontName.toLowerCase())) return true;

    // Modern check for loaded fonts (works best for project-bundled fonts)
    try {
        if (document.fonts && document.fonts.check) {
            // Check for the font with a fallback to ensure it's specifically the font we want
            // If the browser hasn't loaded it yet, check() returns false
            if (document.fonts.check(`12px "${fontName}"`)) return true;
        }
    } catch (e) {}

    const text = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Test against monospace
    context.font = '72px monospace';
    const baselineMono = context.measureText(text).width;
    context.font = `72px "${fontName}", monospace`;
    const testMono = context.measureText(text).width;

    // Test against serif
    context.font = '72px serif';
    const baselineSerif = context.measureText(text).width;
    context.font = `72px "${fontName}", serif`;
    const testSerif = context.measureText(text).width;

    // If it differs from generic fallbacks, it's installed
    return (testMono !== baselineMono) || (testSerif !== baselineSerif);
}

// Re-render theme controls when fonts finish loading to update (Not Installed) labels
if (document.fonts) {
    // Force browser to start loading project fonts by checking/requesting them
    const projectFonts = ['Fira Code', 'JetBrains Mono', 'Source Code Pro', 'Cascadia Code'];
    projectFonts.forEach(f => document.fonts.load(`12px "${f}"`));

    document.fonts.ready.then(() => {
        if (elements.themeEditorView && elements.themeEditorView.style.display !== 'none' && themeEditor) {
            renderThemeVisualControls(themeEditor.getValue());
        }
    });
}

// Global Custom Modals (Dark themed replacements for alert/confirm)
function showAlert(message, title = 'Notification') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        if (!modal || !titleEl || !msgEl || !okBtn) {
            alert(title + ": " + message);
            resolve(true);
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        if (cancelBtn) cancelBtn.style.display = 'none';
        modal.style.display = 'flex';

        okBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };
    });
}

function showConfirm(message, title = 'Confirm Action') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        if (!modal || !titleEl || !msgEl || !okBtn || !cancelBtn) {
            const res = confirm(title + "\n\n" + message);
            resolve(res);
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        cancelBtn.style.display = 'block';
        modal.style.display = 'flex';

        okBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(true);
        };
        cancelBtn.onclick = () => {
            modal.style.display = 'none';
            resolve(false);
        };
    });
}

function showError(message, title = 'Error') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        if (!modal || !titleEl || !msgEl || !okBtn) {
            alert("ERROR: " + title + "\n\n" + message);
            resolve(true);
            return;
        }

        titleEl.textContent = title;
        titleEl.style.color = 'var(--accent-red)';
        msgEl.textContent = message;
        if (cancelBtn) cancelBtn.style.display = 'none';
        modal.style.display = 'flex';

        okBtn.onclick = () => {
            titleEl.style.color = '';
            modal.style.display = 'none';
            resolve(true);
        };
    });
}

// DOM Elements Mapping (Getter-based for total resilience)
const elements = {
    get navHome() { return document.getElementById('nav-home'); },
    get navGithub() { return document.getElementById('nav-github'); },
    get navNew() { return document.getElementById('nav-new'); },
    get navAdd() { return document.getElementById('nav-add'); },
    get navGitConfig() { return document.getElementById('nav-git-config'); },
    get navTheme() { return document.getElementById('nav-theme'); },
    get navSettings() { return document.getElementById('nav-settings'); },
    get appLogoBox() { return document.getElementById('app-logo-box'); },
    get repoTree() { return document.getElementById('repo-tree'); },
    get repoFilter() { return document.getElementById('repo-filter'); },
    get mainContent() { return document.getElementById('main-content'); },
    get dashboardView() { return document.getElementById('dashboard-view'); },
    get dashboardSummary() { return document.getElementById('dashboard-summary'); },
    get dashboardGrid() { return document.getElementById('dashboard-grid'); },
    get repoView() { return document.getElementById('repo-view'); },
    get repoLeftPanel() { return document.getElementById('repo-left-panel'); },
    get repoRightPanel() { return document.getElementById('repo-right-panel'); },
    get repoRefreshBtn() { return document.getElementById('repo-refresh-btn'); },
    get stagedList() { return document.getElementById('staged-list'); },
    get unstagedList() { return document.getElementById('unstaged-list'); },
    get messageView() { return document.getElementById('message-view'); },
    get diffView() { return document.getElementById('diff-view'); },
    get diffContainer() { return document.getElementById('diff-container'); },
    get diffFileName() { return document.getElementById('diff-file-name'); },
    get diffEditBtn() { return document.getElementById('diff-edit-btn'); },
    get diffBackBtn() { return document.getElementById('diff-back-btn'); },
    get statusView() { return document.getElementById('status-view'); },
    get statusContainer() { return document.getElementById('status-container'); },
    get statusBackBtn() { return document.getElementById('status-back-btn'); },
    get repoStatusBtn() { return document.getElementById('repo-status-btn'); },
    get repoStashBtn() { return document.getElementById('repo-stash-btn'); },
    get editorView() { return document.getElementById('editor-view'); },
    get editorFileName() { return document.getElementById('editor-file-name'); },
    get editorFileInfo() { return document.getElementById('editor-file-info'); },
    get editorSaveBtn() { return document.getElementById('editor-save-btn'); },
    get editorRestoreBtn() { return document.getElementById('editor-restore-btn'); },
    get editorUndoBtn() { return document.getElementById('editor-undo-btn'); },
    get editorRedoBtn() { return document.getElementById('editor-redo-btn'); },
    get editorWrapBtn() { return document.getElementById('editor-wrap-btn'); },
    get editorFolderBtn() { return document.getElementById('editor-folder-btn'); },
    get editorFormatBtn() { return document.getElementById('editor-format-btn'); },
    get editorCommentBtn() { return document.getElementById('editor-comment-btn'); },
    get editorFindBtn() { return document.getElementById('editor-find-btn'); },
    get editorTransformBtn() { return document.getElementById('editor-transform-btn'); },
    get transformMenu() { return document.getElementById('transform-menu'); },
    get editorCloseBtn() { return document.getElementById('editor-close-btn'); },
    get editorPreviewToggle() { return document.getElementById('editor-preview-toggle'); },
    get editorContainerWrapper() { return document.getElementById('editor-container-wrapper'); },
    get gitignoreScanBtn() { return document.getElementById('gitignore-scan-btn'); },
    get markdownPreview() { return document.getElementById('markdown-preview'); },
    get htmlPreview() { return document.getElementById('html-preview'); },
    get imagePreview() { return document.getElementById('image-preview'); },
    get previewImg() { return document.getElementById('preview-img'); },
    get monacoContainer() { return document.getElementById('monaco-container'); },
    get settingsView() { return document.getElementById('settings-view'); },
    get gitConfigView() { return document.getElementById('git-config-view'); },
    get themeEditorView() { return document.getElementById('theme-editor-view'); },
    get themeVisualControls() { return document.getElementById('theme-visual-controls'); },
    get themeDynamicControls() { return document.getElementById('theme-dynamic-controls'); },
    get themeMonacoContainer() { return document.getElementById('theme-monaco-container'); },
    get themeSaveBtn() { return document.getElementById('theme-save-btn'); },
    get themeExportIniBtn() { return document.getElementById('theme-export-ini-btn'); },
    get themeImportIniBtn() { return document.getElementById('theme-import-ini-btn'); },
    get themeUndoBtn() { return document.getElementById('theme-undo-btn'); },
    get themeResetBtn() { return document.getElementById('theme-reset-btn'); },
    get themeCloseBtn() { return document.getElementById('theme-close-btn'); },
    get themePresetsSelect() { return document.getElementById('theme-presets-select'); },
    get newThemeNameInput() { return document.getElementById('new-theme-name'); },
    get themeSavePresetBtn() { return document.getElementById('theme-save-preset-btn'); },
    get themeDeletePresetBtn() { return document.getElementById('theme-delete-preset-btn'); },
    get exportSettingsBtn() { return document.getElementById('export-settings-btn'); },
    get importSettingsBtn() { return document.getElementById('import-settings-btn'); },
    get branchSelect() { return document.getElementById('branch-select'); },
    get remoteSelect() { return document.getElementById('remote-select'); },
    get openRemoteBtn() { return document.getElementById('open-remote-btn'); },
    get restoreAllBtn() { return document.getElementById('restore-all-btn'); },
    get stageAllBtn() { return document.getElementById('stage-all-btn'); },
    get unstageAllBtn() { return document.getElementById('unstage-all-btn'); },
    get createBranchBtn() { return document.getElementById('create-branch-btn'); },
    get deleteBranchBtn() { return document.getElementById('delete-branch-btn'); },
    get renameBranchBtn() { return document.getElementById('rename-branch-btn'); },
    get magicCommitBtn() { return document.getElementById('magic-commit-btn'); },
    get commitMsgArea() { return document.getElementById('commit-msg'); },
    get commitBtn() { return document.getElementById('commit-btn'); },
    get commitPushBtn() { return document.getElementById('commit-push-btn'); },
    get revertChangesBtnTop() { return document.getElementById('revert-changes-btn-top'); },
    get nukeReinitBtn() { return document.getElementById('nuke-reinit-btn'); },
    get restoreFileBtn() { return document.getElementById('restore-file-btn'); },
    get consoleOutput() { return document.getElementById('console-output'); },
    get sidebarCollapse() { return document.getElementById('sidebar-collapse'); },
    get sidebarUnstageAll() { return document.getElementById('sidebar-unstage-all'); },
    get sidebarToggleIgnored() { return document.getElementById('sidebar-toggle-ignored'); },
    get sidebarRefresh() { return document.getElementById('sidebar-refresh'); },
    get sidebar() { return document.getElementById('sidebar'); },
    get sidebarResizer() { return document.getElementById('sidebar-resizer'); },
    get consolePanel() { return document.getElementById('console-panel'); },
    get consoleResizer() { return document.getElementById('console-resizer'); },
    get globalProgress() { return document.getElementById('global-progress-container'); },
    get dashboardProgressContainer() { return document.getElementById('dashboard-progress-container'); },
    get dashboardProgressBar() { return document.getElementById('dashboard-progress-bar'); },
    get dashboardRefreshBtn() { return document.getElementById('dashboard-refresh-btn'); },
    get dashboardBulkPullBtn() { return document.getElementById('dashboard-bulk-pull-btn'); },
    get dashboardBulkCommitBtn() { return document.getElementById('dashboard-bulk-commit-btn'); },
    get dashboardBulkRestoreBtn() { return document.getElementById('dashboard-bulk-restore-btn'); },
    get bulkCommitModal() { return document.getElementById('bulk-commit-modal'); },
    get bulkCommitRepoList() { return document.getElementById('bulk-commit-repo-list'); },
    get bulkCommitSelectAll() { return document.getElementById('bulk-commit-select-all'); },
    get bulkCommitMsg() { return document.getElementById('bulk-commit-msg'); },
    get bulkCommitAutoMsg() { return document.getElementById('bulk-commit-auto-msg'); },
    get notifRepoChanges() { return document.getElementById('notif-repo-changes'); },
    get bulkCommitConfirm() { return document.getElementById('bulk-commit-confirm'); },
    get bulkCommitCancel() { return document.getElementById('bulk-commit-cancel'); },
    get bulkRestoreModal() { return document.getElementById('bulk-restore-modal'); },
    get bulkRestoreRepoList() { return document.getElementById('bulk-restore-repo-list'); },
    get bulkRestoreSelectAll() { return document.getElementById('bulk-restore-select-all'); },
    get bulkRestoreConfirm() { return document.getElementById('bulk-restore-confirm'); },
    get bulkRestoreCancel() { return document.getElementById('bulk-restore-cancel'); },
    get bulkPullModal() { return document.getElementById('bulk-pull-modal'); },
    get bulkPullRepoList() { return document.getElementById('bulk-pull-repo-list'); },
    get bulkPullSelectAll() { return document.getElementById('bulk-pull-select-all'); },
    get bulkPullConfirm() { return document.getElementById('bulk-pull-confirm'); },
    get bulkPullCancel() { return document.getElementById('bulk-pull-cancel'); },
    get dashboardBulkFetchBtn() { return document.getElementById('dashboard-bulk-fetch-btn'); },
    get bulkFetchModal() { return document.getElementById('bulk-fetch-modal'); },
    get bulkFetchRepoList() { return document.getElementById('bulk-fetch-repo-list'); },
    get bulkFetchSelectAll() { return document.getElementById('bulk-fetch-select-all'); },
    get bulkFetchConfirm() { return document.getElementById('bulk-fetch-confirm'); },
    get bulkFetchCancel() { return document.getElementById('bulk-fetch-cancel'); },
    get protocolModal() { return document.getElementById('protocol-modal'); },
    get protocolRepoList() { return document.getElementById('protocol-repo-list'); },
    get protocolSelectAll() { return document.getElementById('protocol-select-all'); },
    get protocolSelectSSH() { return document.getElementById('protocol-select-ssh'); },
    get protocolSelectHTTPS() { return document.getElementById('protocol-select-https'); },
    get protocolConfirm() { return document.getElementById('protocol-confirm'); },
    get protocolCancel() { return document.getElementById('protocol-cancel'); },
    get protocolTrustGithub() { return document.getElementById('protocol-trust-github'); },
    get subtreeHubModal() { return document.getElementById('subtree-hub-modal'); },
    get subtreeMappingList() { return document.getElementById('subtree-mapping-list'); },
    get subtreeMappingSelectAll() { return document.getElementById('subtree-mapping-select-all'); },
    get addSubtreeBtn() { return document.getElementById('add-subtree-mapping-btn'); },
    get subtreePullSelectedBtn() { return document.getElementById('subtree-pull-selected-btn'); },
    get subtreePushSelectedBtn() { return document.getElementById('subtree-push-selected-btn'); },
    get subtreeDeleteSelectedBtn() { return document.getElementById('subtree-delete-selected-btn'); },
    get subtreeClearAllBtn() { return document.getElementById('subtree-clear-all-btn'); },
    get subtreeGitHubFetchBtn() { return document.getElementById('subtree-github-fetch-btn'); },
    get subtreeGitHubModal() { return document.getElementById('subtree-github-modal'); },
    get subtreeGitHubList() { return document.getElementById('subtree-github-list'); },
    get subtreeGitHubSelectAll() { return document.getElementById('subtree-github-select-all'); },
    get subtreeGitHubConfirm() { return document.getElementById('subtree-github-confirm'); },
    get subtreeGitHubCancel() { return document.getElementById('subtree-github-cancel'); },
    get prefixPickerModal() { return document.getElementById('prefix-picker-modal'); },
    get prefixFolderList() { return document.getElementById('prefix-folder-list'); },
    get prefixPickerCancel() { return document.getElementById('prefix-picker-cancel'); },
    get subtreeModalClose() { return document.getElementById('subtree-modal-close'); },
    get repoSubtreeBtn() { return document.getElementById('repo-subtree-btn'); },
    get gitForceToggle() { return document.getElementById('git-force-toggle'); },
    get gitAutoFetchToggle() { return document.getElementById('git-auto-fetch-toggle'); },
    get unbornFoldersModal() { return document.getElementById('unborn-folders-modal'); },
    get unbornFoldersList() { return document.getElementById('unborn-folders-list'); },
    get unbornFoldersClose() { return document.getElementById('unborn-folders-close'); },
    get rootRepoDirInput() { return document.getElementById('root-repo-dir'); },
    get githubPatInput() { return document.getElementById('github-pat'); },
    get syncTokenToGitBtn() { return document.getElementById('sync-token-to-git-btn'); },
    get clearGitCredsBtn() { return document.getElementById('clear-git-creds-btn'); },
    get shellSelect() { return document.getElementById('shell-select'); },
    get saveSettingsBtn() { return document.getElementById('save-settings-btn'); },
    get resetAppBtn() { return document.getElementById('reset-app-btn'); },
    get newItemModal() { return document.getElementById('new-item-modal'); },
    get newItemName() { return document.getElementById('new-item-name'); },
    get newItemPathDisplay() { return document.getElementById('new-item-path-display'); },
    get mdListBtn() { return document.getElementById('md-list-btn'); },
    get mdTaskBtn() { return document.getElementById('md-task-btn'); },
    get mdImageBtn() { return document.getElementById('md-image-btn'); },
    get mdViewControls() { return document.getElementById('md-view-controls'); },
    get mdViewCodeBtn() { return document.getElementById('md-view-code'); },
    get mdViewSplitBtn() { return document.getElementById('md-view-split'); },
    get mdViewPreviewBtn() { return document.getElementById('md-view-preview'); },
    get newBranchModal() { return document.getElementById('new-branch-modal'); },
    get newBranchName() { return document.getElementById('new-branch-name'); },
    get newRemoteModal() { return document.getElementById('new-remote-modal'); },
    get newRemoteName() { return document.getElementById('new-remote-name'); },
    get newRemoteUrl() { return document.getElementById('new-remote-url'); },
    get addRemoteBtn() { return document.getElementById('add-remote-btn'); },
    get editRemoteBtn() { return document.getElementById('edit-remote-btn'); },
    get removeRemoteBtn() { return document.getElementById('remove-remote-btn'); },
    get editRemoteModal() { return document.getElementById('edit-remote-modal'); },
    get editRemoteName() { return document.getElementById('edit-remote-name'); },
    get editRemoteUrl() { return document.getElementById('edit-remote-url'); },
    get gitignoreModal() { return document.getElementById('gitignore-modal'); },
    get gitignoreList() { return document.getElementById('gitignore-list'); },
    get gitignoreSearch() { return document.getElementById('gitignore-search'); },
    get gitignoreConfirm() { return document.getElementById('gitignore-confirm'); },
    get gitignoreCancel() { return document.getElementById('gitignore-cancel'); },
    get deleteGitHubBtn() { return document.getElementById('delete-github-btn'); },
    get publishGitHubBtn() { return document.getElementById('publish-github-btn'); },
    get githubVisibilityBtn() { return document.getElementById('github-visibility-btn'); },
    get publishGitHubModal() { return document.getElementById('publish-github-modal'); },
    get publishRepoName() { return document.getElementById('publish-repo-name'); },
    get publishRepoPrivate() { return document.getElementById('publish-repo-private'); },
    get publishConfirm() { return document.getElementById('publish-confirm'); },
    get publishCancel() { return document.getElementById('publish-cancel'); },
    get renameModal() { return document.getElementById('rename-modal'); },
    get renamePathDisplay() { return document.getElementById('rename-path-display'); },
    get renameNewName() { return document.getElementById('rename-new-name'); },
    get renameConfirm() { return document.getElementById('rename-confirm'); },
    get renameCancel() { return document.getElementById('rename-cancel'); },
    get gitConfigSections() { return document.getElementById('git-config-sections'); },
    get gitConfigPathDisplay() { return document.getElementById('git-config-path-display'); },
    get saveGitConfigBtn() { return document.getElementById('save-git-config-btn'); },
    get addConfigEntryBtn() { return document.getElementById('add-config-entry-btn'); },
    get newConfigEntryModal() { return document.getElementById('new-config-entry-modal'); },
    get newConfigSection() { return document.getElementById('new-config-section'); },
    get newConfigKey() { return document.getElementById('new-config-key'); },
    get newConfigVal() { return document.getElementById('new-config-val'); },
    get newConfigConfirm() { return document.getElementById('new-config-confirm'); },
    get newConfigCancel() { return document.getElementById('new-config-cancel'); },
    get renameBranchModal() { return document.getElementById('rename-branch-modal'); },
    get renameBranchNewName() { return document.getElementById('rename-branch-new-name'); },
    get renameBranchConfirm() { return document.getElementById('rename-branch-confirm'); },
    get renameBranchCancel() { return document.getElementById('rename-branch-cancel'); },
    get stashModal() { return document.getElementById('stash-modal'); },
    get stashMessageInput() { return document.getElementById('stash-message-input'); },
    get stashSaveBtn() { return document.getElementById('stash-save-btn'); },
    get stashListContainer() { return document.getElementById('stash-list-container'); },
    get stashCloseBtn() { return document.getElementById('stash-close-btn'); }
};

// Initialize app
window.onload = async () => {
    try {
        // 1. Setup UI Mechanics (Instant - No async work here)
        initResizers();
        initEventListeners();
    } catch (e) {
        console.error("CRITICAL UI INIT FAILURE:", e);
    }

    try {
        if (!window.electronAPI) {
            throw new Error("window.electronAPI is undefined. Preload script failure.");
        }

        // 2. Parallel Data Loading
        const settingsPromise = window.electronAPI.getSettings();
        const reposPromise = window.electronAPI.getRepositories();

        // 3. Initialize Background Components
        initEditor();

        // 4. Populate Shell with Settings
        settings = await settingsPromise;
        if (elements.rootRepoDirInput) elements.rootRepoDirInput.value = settings.rootRepoDir || '';
        if (elements.githubPatInput) elements.githubPatInput.value = settings.githubToken || '';
        if (elements.notifRepoChanges) elements.notifRepoChanges.checked = !!settings.notifRepoChanges;

        // Note: Project-specific toggles (Force/AutoFetch) are hydrated in selectRepo()

        // Intelligence: If Obsidian theme is empty, use the new simplified default
        if (!settings.obsidianIni) {
            settings.obsidianIni = DEFAULT_THEME_INI;
            window.electronAPI.saveSettings(settings);
        }

        // 5. Hydrate Repositories
        const savedRepos = await reposPromise;
        repositories = (savedRepos || []).map(r => ({
            name: r.name || 'Unnamed Project',
            path: String(r.path || '').replace(/\\/g, '/'),
            expanded: false,
            subtrees: r.subtrees || []
        }));

        sortRepositories();

        // 6. Initial Render (Deferred to next tick to let browser finish loading script)
        setTimeout(() => {
            renderTree();
            showDashboard();
            console.log("Initial render complete.");
        }, 0);

        // 7. Non-critical Background tasks (Deferred for speed)
        setTimeout(() => {
            if (settings.rootRepoDir) {
                autoImportFromRoot(settings.rootRepoDir);
            }

            if (settings.githubToken) {
                checkGitHubTokenLife();
            }

            window.electronAPI.getAvailableShells().then(shells => {
                if (elements.shellSelect) {
                    elements.shellSelect.innerHTML = shells.map(s => `<option value="${s.path}" ${s.path === settings.shell ? 'selected' : ''}>${s.name}</option>`).join('');
                }
            });
        }, 500);
    } catch (e) {
        console.error('FATAL STARTUP ERROR:', e);
        showError(e.message, 'Fatal Startup Error');
    }
};

function initEditor() {
    if (typeof require !== 'undefined') {
        require.config({ paths: { 'vs': '../node_modules/monaco-editor/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            // 1. Define the theme BEFORE creating any editor instances
            if (settings.obsidianIni) {
                applyObsidianTheme(settings.obsidianIni);
            }

            // Register Custom Language for Themes to prevent "Split Color" bug
            monaco.languages.register({ id: 'green-latern' });
            monaco.languages.setMonarchTokensProvider('green-latern', {
                tokenizer: {
                    root: [
                        [/^\[.*\]/, 'header'],
                        [/^;.*$/, 'comment'],
                        [/^#.*$/, 'comment'],
                        [/^([^=]+)(=)(.*)$/, [
                            { token: 'key' },
                            { token: 'operator' },
                            { token: 'value' }
                        ]]
                    ]
                }
            });

            // Resolve initial font stack
            const initialTheme = parseObsidianIni(settings.obsidianIni || DEFAULT_THEME_INI);
            const initialFont = (initialTheme.fontFamily && !initialTheme.fontFamily.includes(','))
                ? `"${initialTheme.fontFamily}", Cascadia Code, Cascadia Mono, Consolas, monospace`
                : (initialTheme.fontFamily || 'Cascadia Code, Cascadia Mono, Consolas, monospace');

            // 2. Create the editor with the 'obsidian' theme already active
            monacoEditor = monaco.editor.create(elements.monacoContainer, {
                theme: settings.obsidianIni ? 'obsidian' : 'vs-dark',
                automaticLayout: false, // Turned off to prevent ResizeObserver loop errors
                bracketPairColorization: { enabled: true },
                tabSize: 4,
                insertSpaces: true,
                formatOnPaste: true,
                formatOnType: true,
                minimap: { enabled: false },
                wordWrap: 'on',
                fontFamily: initialFont,
                fontWeight: initialTheme.fontWeight || 'normal',
                fontLigatures: true,
                fontSize: 13,
                detectIndentation: true,
                tabFocusMode: false // INTELLIGENCE: Explicitly disable tab focus cycling to keep Tab in editor
            });

            // PRO FEATURE: Save with Ctrl+S
            monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                saveCurrentFile();
            });

            logToConsole('Code Editor ready.', 'info');
        });
    }
}

function applyObsidianTheme(iniContent) {
    if (!iniContent || typeof monaco === 'undefined') return;
    try {
        const themeData = parseObsidianIni(iniContent);

        // Define or Update the 'obsidian' theme
        monaco.editor.defineTheme('obsidian', {
            base: 'vs-dark',
            inherit: true,
            rules: themeData.rules,
            colors: themeData.colors
        });

        // FORCE APPLY to all editor instances
        if (monaco.editor.setTheme) {
            monaco.editor.setTheme('obsidian');
        }

        const rawFont = themeData.fontFamily;
        const fontStack = (rawFont && !rawFont.includes(','))
            ? `"${rawFont}", Cascadia Code, Cascadia Mono, Consolas, monospace`
            : (rawFont || 'Cascadia Code, Cascadia Mono, Consolas, monospace');

        const weight = themeData.fontWeight || 'normal';

        if (monacoEditor) {
            monacoEditor.updateOptions({
                fontFamily: fontStack,
                fontWeight: weight,
                fontLigatures: true
            });
        }

        // Apply font to Theme Editor as well
        if (themeEditor) {
            themeEditor.updateOptions({
                fontFamily: fontStack,
                fontWeight: weight,
                fontLigatures: true
            });
        }

        // Intelligence: Update the Dashboard/UI to match the theme background for a unified feel
        const bg = themeData.colors['editor.background'];
        if (bg) {
            document.body.style.backgroundColor = bg;
            document.querySelectorAll('.dashboard-card, .summary-card, .settings-card').forEach(el => {
                el.style.backgroundColor = 'rgba(255,255,255,0.02)';
            });
        }
    } catch (e) {
        console.error('Failed to apply theme:', e);
    }
}

const DEFAULT_THEME_INI = `[Theme]
; Global Workspace Colors
Font=Cascadia Code
FontWeight=normal
Ligatures=true
Background=#121314
Foreground=#d4d4d4
LineNumbers=#858585
Selection=#264f78
Cursor=#569cd6

[Syntax]
; Code Element Colors
Comment=#008000
String=#3ADB00
Integer=#AFE1A2
Keyword=#46AFAD
Operator=#d4d4d4
Identifier=#9cdcfe
Preprocessor=#8EC587
Tag=#569cd6
Attribute=#9cdcfe
Bracket1=#ffd700
Bracket2=#71DA94
Bracket3=#179fff`;

const BUILTIN_THEMES = {
    "Red Lantern": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#0e0a0b\nForeground=#e0e0e0\nLineNumbers=#7a5c5c\nSelection=#541212\nCursor=#ff3333\n\n[Syntax]\n; Code Element Colors\nComment=#803b3b\nString=#ff5555\nInteger=#ff8866\nKeyword=#ff2222\nOperator=#e0e0e0\nIdentifier=#ff9999\nPreprocessor=#cc4444\nTag=#ff4444\nAttribute=#ff9999\nBracket1=#ffcc00\nBracket2=#ff6600\nBracket3=#ff1a1a",
    "Green lantern": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#141513\nForeground=#d4d4d4\nLineNumbers=#858585\nSelection=#264f78\nCursor=#569cd6\n\n[Syntax]\n; Code Element Colors\nComment=#008000\nString=#3ADB00\nInteger=#AFE1A2\nKeyword=#46AFAD\nOperator=#d4d4d4\nIdentifier=#9cdcfe\nPreprocessor=#8EC587\nTag=#569cd6\nAttribute=#9cdcfe\nBracket1=#ffd700\nBracket2=#71DA94\nBracket3=#179fff",
    "Blue Lantern": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#0b0e14\nForeground=#d4d8e2\nLineNumbers=#5a6b82\nSelection=#1d3b59\nCursor=#3388ff\n\n[Syntax]\n; Code Element Colors\nComment=#4a7090\nString=#3ad8ff\nInteger=#8ae2ff\nKeyword=#2299ff\nOperator=#d4d8e2\nIdentifier=#75c9ff\nPreprocessor=#52b0ef\nTag=#2288ff\nAttribute=#75c9ff\nBracket1=#ffd700\nBracket2=#3affcc\nBracket3=#66a3ff",
    "Yellow Lantern": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#0f0e0b\nForeground=#e0e0dc\nLineNumbers=#7a725c\nSelection=#544412\nCursor=#ffcc00\n\n[Syntax]\n; Code Element Colors\nComment=#80733b\nString=#ffea55\nInteger=#fffaa2\nKeyword=#ffb700\nOperator=#e0e0dc\nIdentifier=#ffe175\nPreprocessor=#d4a337\nTag=#ffc400\nAttribute=#ffe175\nBracket1=#ff5555\nBracket2=#71DA94\nBracket3=#ff9900",
    "Cyberpunk Void": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#0a0812\nForeground=#e0def4\nLineNumbers=#6e6a86\nSelection=#403d52\nCursor=#ebbcba\n\n[Syntax]\n; Code Element Colors\nComment=#6b5b95\nString=#eb6f92\nInteger=#f6c177\nKeyword=#31748f\nOperator=#e0def4\nIdentifier=#9ccfd8\nPreprocessor=#c4a7e7\nTag=#ea9a97\nAttribute=#9ccfd8\nBracket1=#f6c177\nBracket2=#31748f\nBracket3=#ebbcba",
    "Deep Trench": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#070b12\nForeground=#c5d1de\nLineNumbers=#3f536e\nSelection=#132b47\nCursor=#00f0ff\n\n[Syntax]\n; Code Element Colors\nComment=#335c67\nString=#00f5d4\nInteger=#70c1b3\nKeyword=#00bbf9\nOperator=#c5d1de\nIdentifier=#48cae4\nPreprocessor=#90e0ef\nTag=#0096c7\nAttribute=#48cae4\nBracket1=#f77f00\nBracket2=#00f5d4\nBracket3=#90e0ef",
    "Supernova": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#080608\nForeground=#f2eeef\nLineNumbers=#6b5c63\nSelection=#421d31\nCursor=#ff2a85\n\n[Syntax]\n; Code Element Colors\nComment=#7a4f65\nString=#ff5588\nInteger=#ffaa55\nKeyword=#ff2a55\nOperator=#f2eeef\nIdentifier=#ff88bb\nPreprocessor=#ffa500\nTag=#ff3366\nAttribute=#ff88bb\nBracket1=#ffe600\nBracket2=#ff5588\nBracket3=#00ffff",
    "Cryptic Moss": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#0d1110\nForeground=#d0dcd7\nLineNumbers=#4a5c55\nSelection=#1d362e\nCursor=#53b692\n\n[Syntax]\n; Code Element Colors\nComment=#3e6b5a\nString=#73d085\nInteger=#a2f689\nKeyword=#2fb988\nOperator=#d0dcd7\nIdentifier=#80cdc1\nPreprocessor=#4db6ac\nTag=#38a169\nAttribute=#80cdc1\nBracket1=#f6c177\nBracket2=#73d085\nBracket3=#53b692",
    "Obsidian Amethyst": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#0d0b12\nForeground=#dcd6f7\nLineNumbers=#5b5270\nSelection=#31224d\nCursor=#b892ff\n\n[Syntax]\n; Code Element Colors\nComment=#6a5a8a\nString=#c4b5fd\nInteger=#f3e8ff\nKeyword=#9333ea\nOperator=#dcd6f7\nIdentifier=#d8b4fe\nPreprocessor=#a855f7\nTag=#7c3aed\nAttribute=#d8b4fe\nBracket1=#f43f5e\nBracket2=#c4b5fd\nBracket3=#38bdf8",
    "Solar Flare": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#120f0a\nForeground=#f5edd6\nLineNumbers=#6b5c43\nSelection=#4a3512\nCursor=#ffb700\n\n[Syntax]\n; Code Element Colors\nComment=#7a602c\nString=#ffcc00\nInteger=#ffe680\nKeyword=#ff9900\nOperator=#f5edd6\nIdentifier=#ffdb4d\nPreprocessor=#ffaa33\nTag=#ff8800\nAttribute=#ffdb4d\nBracket1=#ff4444\nBracket2=#ffcc00\nBracket3=#33ccff",
    "Vaporwave Sunset": "[Theme]\n; Global Workspace Colors\nFont=Cascadia Code\nFontWeight=normal\nLigatures=true\nBackground=#100c1c\nForeground=#f1eff8\nLineNumbers=#61527c\nSelection=#432b63\nCursor=#ff71ce\n\n[Syntax]\n; Code Element Colors\nComment=#8b78af\nString=#01cdfe\nInteger=#05ffa1\nKeyword=#ff71ce\nOperator=#f1eff8\nIdentifier=#b967ff\nPreprocessor=#01cdfe\nTag=#ff71ce\nAttribute=#b967ff\nBracket1=#fffb96\nBracket2=#05ffa1\nBracket3=#01cdfe"
};

function parseObsidianIni(ini) {
    const lines = ini.split('\n');
    const sections = {};
    let currentSection = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith(';') || line.startsWith('#')) continue;
        if (line.startsWith('[') && line.endsWith(']')) {
            currentSection = line.substring(1, line.length - 1).toLowerCase();
            sections[currentSection] = {};
            continue;
        }
        if (currentSection) {
            const eqIdx = line.indexOf('=');
            if (eqIdx !== -1) {
                const key = line.substring(0, eqIdx).trim().toLowerCase();
                const value = line.substring(eqIdx + 1).trim();
                sections[currentSection][key] = value;
            }
        }
    }

    const theme = sections['theme'] || {};
    const syntax = sections['syntax'] || {};

    const rules = [
        { token: 'comment', foreground: syntax['comment'] || '#6a9955' },
        { token: 'string', foreground: syntax['string'] || '#ce9178' },
        { token: 'string.key.json', foreground: syntax['string'] || '#ce9178' },
        { token: 'string.value.json', foreground: syntax['string'] || '#ce9178' },
        { token: 'number', foreground: syntax['integer'] || syntax['number'] || '#b5cea8' },
        { token: 'keyword', foreground: syntax['keyword'] || '#569cd6' },
        { token: 'constant', foreground: syntax['keyword'] || '#569cd6' },
        { token: 'operator', foreground: syntax['operator'] || '#d4d4d4' },
        { token: 'identifier', foreground: theme['foreground'] || '#d4d4d4' },
        { token: 'type', foreground: theme['foreground'] || '#d4d4d4' },
        { token: 'class', foreground: theme['foreground'] || '#d4d4d4' },
        { token: 'namespace', foreground: syntax['keyword'] || '#569cd6' },
        { token: 'metatag', foreground: syntax['preprocessor'] || '#c586c0' },
        { token: 'tag', foreground: syntax['tag'] || '#569cd6' },
        { token: 'attribute.name', foreground: theme['foreground'] || '#d4d4d4' },
        { token: 'attribute.value', foreground: syntax['string'] || '#ce9178' },
        { token: 'delimiter', foreground: syntax['operator'] || '#d4d4d4' },
        // INI specific tokens
        { token: 'header', foreground: syntax['keyword'] || '#569cd6' },
        { token: 'key', foreground: theme['foreground'] || '#d4d4d4' },
        { token: 'value', foreground: syntax['string'] || '#ce9178' }
    ];

    const colors = {
        'editor.background': theme['background'] || '#121314',
        'editor.foreground': theme['foreground'] || '#d4d4d4',
        'editorLineNumber.foreground': theme['linenumbers'] || '#858585',
        'editor.selectionBackground': theme['selection'] || '#264f78',
        'editorCursor.foreground': theme['cursor'] || '#569cd6',
        'editor.lineHighlightBackground': (theme['background'] || '#121314') + '44',
        'editorBracketHighlight.foreground1': syntax['bracket1'] || '#ffd700',
        'editorBracketHighlight.foreground2': syntax['bracket2'] || '#da70d6',
        'editorBracketHighlight.foreground3': syntax['bracket3'] || '#179fff',
    };

    return {
        rules,
        colors,
        fontFamily: theme['font'] || 'Cascadia Code',
        fontWeight: theme['fontweight'] || 'normal',
        fontLigatures: theme['ligatures'] !== 'false'
    };
}

function initResizers() {
    if (elements.sidebarResizer) {
        elements.sidebarResizer.onmousedown = (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = elements.sidebar.offsetWidth;
            const onMouseMove = (ev) => {
                const newWidth = startWidth + (ev.clientX - startX);
                if (newWidth > 150 && newWidth < 600) {
                    elements.sidebar.style.width = newWidth + 'px';
                }
            };
            const onMouseUp = () => {
                localStorage.setItem('sidebar-width', elements.sidebar.offsetWidth);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        const savedWidth = localStorage.getItem('sidebar-width');
        if (savedWidth) elements.sidebar.style.width = savedWidth + 'px';
    }

    if (elements.consoleResizer) {
        elements.consoleResizer.onmousedown = (e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startHeight = elements.consolePanel.offsetHeight;
            const onMouseMove = (ev) => {
                const newHeight = startHeight - (ev.clientY - startY);
                if (newHeight > 100 && newHeight < window.innerHeight - 200) {
                    elements.consolePanel.style.height = newHeight + 'px';
                    // Smooth refit during drag
                    if (window.terminal) window.terminal.fitAddon.fit();
                }
            };
            const onMouseUp = () => {
                localStorage.setItem('console-height', elements.consolePanel.offsetHeight);
                if (window.terminal) window.terminal.fitAddon.fit();
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        const savedHeight = localStorage.getItem('console-height');
        if (savedHeight) elements.consolePanel.style.height = savedHeight + 'px';
    }
}

function initEventListeners() {
    // Navigation Rail
    if (elements.navHome) elements.navHome.onclick = () => {
        currentDashboardFilter = 'all'; // Reset filter when coming from nav
        setActiveNavItem(elements.navHome);
        showDashboard(true);
    };
    if (elements.appLogoBox) elements.appLogoBox.onclick = () => {
        currentDashboardFilter = 'all'; // Reset filter when coming from logo
        setActiveNavItem(elements.navHome);
        showDashboard(true);
    };
    if (elements.navGithub) elements.navGithub.onclick = () => showGitHubImportModal();
    if (elements.navNew) elements.navNew.onclick = () => showCreateRepoModal();
    if (elements.navAdd) elements.navAdd.onclick = () => handleAddRepo();
    if (elements.navSettings) elements.navSettings.onclick = () => showSettings();
    if (elements.navGitConfig) elements.navGitConfig.onclick = () => {
        setActiveNavItem(elements.navGitConfig);
        showGitConfigView();
    };
    if (elements.navTheme) elements.navTheme.onclick = () => {
        setActiveNavItem(elements.navTheme);
        showThemeEditor();
    };
    if (elements.themeSaveBtn) elements.themeSaveBtn.onclick = () => saveThemeFromEditor();
    if (elements.themeExportIniBtn) elements.themeExportIniBtn.onclick = () => exportThemeToIni();
    if (elements.themeImportIniBtn) elements.themeImportIniBtn.onclick = () => importThemeFromIni();
    if (elements.themeUndoBtn) elements.themeUndoBtn.onclick = () => {
        if (themeEditor) themeEditor.trigger('keyboard', 'undo', null);
    };
    if (elements.themeResetBtn) elements.themeResetBtn.onclick = async () => {
        if (themeEditor) {
            themeEditor.setValue(DEFAULT_THEME_INI);
            await saveThemeFromEditor();
        }
    };
    if (elements.themeCloseBtn) elements.themeCloseBtn.onclick = () => {
        elements.themeEditorView.style.display = 'none';
        showDashboard();
    };

    // Sidebar Header Actions
    if (elements.sidebarRefresh) elements.sidebarRefresh.onclick = () => renderTree(elements.repoFilter.value);
    if (elements.sidebarUnstageAll) elements.sidebarUnstageAll.onclick = () => handleUnstageAll();
    if (elements.sidebarToggleIgnored) {
        elements.sidebarToggleIgnored.onclick = () => {
            hideIgnoredFiles = !hideIgnoredFiles;
            elements.sidebarToggleIgnored.textContent = hideIgnoredFiles ? '👓' : '👁';
            elements.sidebarToggleIgnored.title = hideIgnoredFiles ? 'Show All Files' : 'Show Tracked Files Only';
            logToConsole(hideIgnoredFiles ? 'Filter: Only showing tracked/non-ignored files.' : 'Filter: Showing all files.', 'info');
            renderTree(elements.repoFilter.value);
        };
    }
    if (elements.dashboardRefreshBtn) elements.dashboardRefreshBtn.onclick = () => showDashboard();
    if (elements.dashboardBulkFetchBtn) elements.dashboardBulkFetchBtn.onclick = () => handleBulkFetch();
    if (elements.dashboardBulkPullBtn) elements.dashboardBulkPullBtn.onclick = () => handleBulkPull();
    if (elements.dashboardBulkCommitBtn) elements.dashboardBulkCommitBtn.onclick = () => showBulkCommitModal();
    if (elements.dashboardBulkRestoreBtn) elements.dashboardBulkRestoreBtn.onclick = () => handleBulkRestore();
    if (elements.repoRefreshBtn) elements.repoRefreshBtn.onclick = () => { if (activeRepo) selectRepo(activeRepo); };
    if (elements.repoStatusBtn) elements.repoStatusBtn.onclick = () => showGitStatus();
    if (elements.repoStashBtn) elements.repoStashBtn.onclick = () => handleStashModal();
    if (elements.stashSaveBtn) elements.stashSaveBtn.onclick = () => saveStash();
    if (elements.stashCloseBtn) elements.stashCloseBtn.onclick = () => elements.stashModal.style.display = 'none';
    if (elements.statusBackBtn) elements.statusBackBtn.onclick = () => {
        elements.statusView.style.display = 'none';
        elements.messageView.style.display = 'flex';
    };
    if (elements.sidebarCollapse) elements.sidebarCollapse.onclick = () => {
        const containers = elements.repoTree.querySelectorAll('.children-container');
        containers.forEach(c => c.remove());
        elements.repoTree.querySelectorAll('.chevron').forEach(ch => { if (ch.textContent !== '') ch.textContent = '▸'; });
        expandedNodes.clear();
    };

    let filterTimeout;
    if (elements.repoFilter) {
        elements.repoFilter.oninput = () => {
            clearTimeout(filterTimeout);
            filterTimeout = setTimeout(() => renderTree(elements.repoFilter.value), 300);
        };
    }

    // Git Control Panel
    document.querySelectorAll('.git-btn').forEach(btn => {
        btn.onclick = (e) => { e.stopPropagation(); quickGitAction(btn.dataset.action); };
    });

    if (elements.commitBtn) elements.commitBtn.onclick = () => handleCommit(false);
    if (elements.commitPushBtn) elements.commitPushBtn.onclick = () => handleCommit(true);
    if (elements.revertChangesBtnTop) elements.revertChangesBtnTop.onclick = () => showRevertModal();
    if (elements.restoreFileBtn) elements.restoreFileBtn.onclick = () => handleRestoreFile();
    if (elements.magicCommitBtn) elements.magicCommitBtn.onclick = () => generateMagicMsg();
    if (elements.stageAllBtn) elements.stageAllBtn.onclick = () => handleStageAll();
    if (elements.unstageAllBtn) elements.unstageAllBtn.onclick = () => handleUnstageAll();
    if (elements.restoreAllBtn) elements.restoreAllBtn.onclick = () => handleRestoreHead();
    if (elements.branchSelect) elements.branchSelect.onchange = () => handleBranchChange();
    if (elements.createBranchBtn) elements.createBranchBtn.onclick = () => handleCreateBranch();
    if (elements.deleteBranchBtn) elements.deleteBranchBtn.onclick = () => handleDeleteBranch();
    if (elements.renameBranchBtn) elements.renameBranchBtn.onclick = () => handleRenameBranch();
    if (elements.addRemoteBtn) elements.addRemoteBtn.onclick = () => handleAddRemoteModal();
    if (elements.editRemoteBtn) elements.editRemoteBtn.onclick = () => handleEditRemoteModal();
    if (elements.removeRemoteBtn) elements.removeRemoteBtn.onclick = () => handleRemoveRemote();
    if (elements.openRemoteBtn) elements.openRemoteBtn.onclick = () => handleOpenRemote();
    if (elements.publishGitHubBtn) elements.publishGitHubBtn.onclick = () => handlePublishGitHub();
    if (elements.githubVisibilityBtn) elements.githubVisibilityBtn.onclick = () => handleToggleGitHubVisibility();
    if (elements.repoSubtreeBtn) elements.repoSubtreeBtn.onclick = () => showSubtreeHubModal();
    if (elements.repoRefreshBtn) elements.repoRefreshBtn.onclick = () => { if (activeRepo) selectRepo(activeRepo); };

    // Project-specific Git Operation Toggles
    if (elements.gitForceToggle) {
        elements.gitForceToggle.onchange = (e) => {
            if (activeRepo) {
                activeRepo.gitForce = e.target.checked;
                window.electronAPI.saveRepositories(repositories);
                logToConsole(`FORCE mode ${activeRepo.gitForce ? 'ENABLED' : 'DISABLED'} for ${activeRepo.name}`, 'info');
            }
        };
    }
    if (elements.gitAutoFetchToggle) {
        elements.gitAutoFetchToggle.onchange = (e) => {
            if (activeRepo) {
                activeRepo.gitAutoFetch = e.target.checked;
                window.electronAPI.saveRepositories(repositories);
                logToConsole(`AUTO-FETCH ${activeRepo.gitAutoFetch ? 'ENABLED' : 'DISABLED'} for ${activeRepo.name}`, 'info');
            }
        };
    }

    // Editor Actions
    if (elements.mdListBtn) elements.mdListBtn.onclick = () => insertMarkdownSnippet('list');
    if (elements.mdTaskBtn) elements.mdTaskBtn.onclick = () => insertMarkdownSnippet('task');
    if (elements.mdImageBtn) elements.mdImageBtn.onclick = () => insertMarkdownSnippet('image');

    if (elements.editorSaveBtn) elements.editorSaveBtn.onclick = () => saveCurrentFile();
    if (elements.editorRestoreBtn) elements.editorRestoreBtn.onclick = () => handleRestoreFile();
    if (elements.editorUndoBtn) elements.editorUndoBtn.onclick = () => {
        if (monacoEditor) {
            const isPreview = elements.editorContainerWrapper.classList.contains('editor-mode-preview');
            if (isPreview) {
                monacoEditor.trigger('source', 'undo');
            } else {
                monacoEditor.focus();
                monacoEditor.trigger('source', 'undo');
            }
        }
    };
    if (elements.editorRedoBtn) elements.editorRedoBtn.onclick = () => {
        if (monacoEditor) {
            const isPreview = elements.editorContainerWrapper.classList.contains('editor-mode-preview');
            if (isPreview) {
                monacoEditor.trigger('source', 'redo');
            } else {
                monacoEditor.focus();
                monacoEditor.trigger('source', 'redo');
            }
        }
    };
    if (elements.editorWrapBtn) elements.editorWrapBtn.onclick = () => {
        if (!monacoEditor) return;
        const current = monacoEditor.getRawOptions().wordWrap;
        const next = current === 'on' ? 'off' : 'on';
        monacoEditor.updateOptions({ wordWrap: next });
        elements.editorWrapBtn.classList.toggle('button-blue', next === 'on');
        logToConsole(`Word wrap: ${next.toUpperCase()}`, 'info');
    };
    if (elements.editorFolderBtn) elements.editorFolderBtn.onclick = () => {
        if (currentEditingPath) window.electronAPI.revealInExplorer(currentEditingPath);
    };
    if (elements.editorFormatBtn) elements.editorFormatBtn.onclick = () => {
        if (monacoEditor) {
            monacoEditor.focus();
            monacoEditor.trigger('editor', 'editor.action.formatDocument');
            logToConsole('Ran code formatter.', 'info');
        }
    };
    if (elements.editorCommentBtn) elements.editorCommentBtn.onclick = () => {
        if (monacoEditor) {
            monacoEditor.focus();
            monacoEditor.trigger('editor', 'editor.action.commentLine');
        }
    };
    if (elements.editorFindBtn) elements.editorFindBtn.onclick = () => {
        if (monacoEditor) {
            monacoEditor.focus();
            monacoEditor.trigger('editor', 'actions.find');
        }
    };
    if (elements.editorTransformBtn) elements.editorTransformBtn.onclick = (e) => {
        e.stopPropagation();
        const menu = elements.transformMenu;
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    };
    document.querySelectorAll('.menu-item[data-transform]').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            applyTextTransformation(item.dataset.transform);
            elements.transformMenu.style.display = 'none';
        };
    });
    document.addEventListener('click', () => {
        if (elements.transformMenu) elements.transformMenu.style.display = 'none';
    });
    if (elements.editorCloseBtn) elements.editorCloseBtn.onclick = () => closeEditor();
    if (elements.mdViewCodeBtn) elements.mdViewCodeBtn.onclick = () => setMarkdownViewMode('code');
    if (elements.mdViewSplitBtn) elements.mdViewSplitBtn.onclick = () => setMarkdownViewMode('split');
    if (elements.mdViewPreviewBtn) elements.mdViewPreviewBtn.onclick = () => setMarkdownViewMode('preview');
    if (elements.gitignoreScanBtn) elements.gitignoreScanBtn.onclick = () => runGitignoreScan();

    if (elements.unbornFoldersClose) elements.unbornFoldersClose.onclick = () => {
        elements.unbornFoldersModal.style.display = 'none';
    };

    // Close Views
    if (elements.diffEditBtn) elements.diffEditBtn.onclick = async () => {
        if (!currentEditingPath) return;
        const path = currentEditingPath;
        await openFileInEditor(path);
        await revealInTree(path);
    };
    if (elements.diffBackBtn) elements.diffBackBtn.onclick = () => {
        elements.diffView.style.display = 'none';
        elements.messageView.style.display = 'flex';
        document.querySelectorAll('.change-item').forEach(el => el.classList.remove('active'));
    };

    // Console Management
    document.querySelectorAll('.console-tab').forEach(tab => {
        tab.onclick = () => switchConsoleTab(tab);
    });

    // High-Precision Console Scrolling (Fix for Windows 3-line jump)
    if (elements.consoleOutput) {
        elements.consoleOutput.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 30 : -30; // Scroll roughly one line at a time
            elements.consoleOutput.scrollTop += delta;
        }, { passive: false });

        // Enable Context Menu for Copy/Clear
        elements.consoleOutput.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            window.electronAPI.showContextMenu({ type: 'console' });
        });
    }

    window.electronAPI.onConsoleCommand((command) => {
        if (!elements.consoleOutput) return;
        if (command === 'copy') {
            const selection = window.getSelection().toString();
            if (selection) navigator.clipboard.writeText(selection);
        } else if (command === 'select-all') {
            const range = document.createRange();
            range.selectNodeContents(elements.consoleOutput);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        } else if (command === 'clear') {
            elements.consoleOutput.innerHTML = '';
            logToConsole('Console output cleared.', 'info');
        }
    });

    // Settings Panel
    if (elements.saveSettingsBtn) elements.saveSettingsBtn.onclick = () => saveGlobalSettings();
    if (elements.syncTokenToGitBtn) {
        elements.syncTokenToGitBtn.onclick = async () => {
            const token = elements.githubPatInput.value.trim();
            if (!token) return showAlert('Please enter a Personal Access Token first.', 'Token Required');

            logToConsole('Attempting to sync token to system Git...', 'info');
            try {
                const res = await window.electronAPI.syncTokenToGit(token);
                if (res.success) {
                    logToConsole(res.message, 'success');
                    showAlert(res.message, 'Success');
                } else {
                    logToConsole(`Failed to sync token: ${res.error}`, 'error');
                    showError(res.error, 'Sync Failed');
                }
            } catch (err) {
                logToConsole(`System Error: ${err.message}`, 'error');
            }
        };
    }
    if (elements.clearGitCredsBtn) {
        elements.clearGitCredsBtn.onclick = async () => {
            if (await showConfirm('This will remove all cached GitHub credentials from your system. You will need to log in again. Proceed?', 'Confirm Reset')) {
                logToConsole('Clearing system GitHub credentials...', 'info');
                try {
                    const res = await window.electronAPI.clearGitCreds();
                    if (res.success) {
                        logToConsole(res.message, 'success');
                        showAlert(res.message, 'Reset Complete');
                    } else {
                        logToConsole(`Failed to clear credentials: ${res.error}`, 'error');
                    }
                } catch (err) {
                    logToConsole(`System Error: ${err.message}`, 'error');
                }
            }
        };
    }
    if (elements.resetAppBtn) elements.resetAppBtn.onclick = () => handleResetApp();
    if (elements.exportSettingsBtn) elements.exportSettingsBtn.onclick = () => handleExportSettings();
    if (elements.importSettingsBtn) elements.importSettingsBtn.onclick = () => handleImportSettings();

    if (elements.themeSavePresetBtn) elements.themeSavePresetBtn.onclick = () => saveThemePreset();
    if (elements.themeDeletePresetBtn) elements.themeDeletePresetBtn.onclick = () => deleteThemePreset();
    if (elements.themePresetsSelect) elements.themePresetsSelect.onchange = () => loadSelectedThemePreset();

    if (elements.renameCancel) elements.renameCancel.onclick = () => {
        elements.renameModal.style.display = 'none';
    };

    const browseShellBtn = document.getElementById('browse-custom-shell');
    if (browseShellBtn) browseShellBtn.onclick = async () => {
        const path = await window.electronAPI.openFile();
        if (path) {
            const customShellInput = document.getElementById('custom-shell-path');
            if (customShellInput) customShellInput.value = path;
            const customOpt = document.createElement('option');
            customOpt.value = path;
            customOpt.textContent = 'Custom: ' + path.split(/[\\\/]/).pop();
            customOpt.selected = true;
            elements.shellSelect.appendChild(customOpt);
        }
    };

    const browseBtn = document.getElementById('browse-root-dir');
    if (browseBtn) browseBtn.onclick = async () => {
        const path = await window.electronAPI.openDirectory();
        if (path) elements.rootRepoDirInput.value = path;
    };

    // Global click listener for deselection & Markdown Link Interception
    document.addEventListener('click', (e) => {
        // Markdown link interception
        const link = e.target.closest('#markdown-preview a');
        if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            if (href) window.electronAPI.openExternal(href);
            return;
        }

        if (!e.target.closest('.tree-node') && !e.target.closest('.nav-item') && !e.target.closest('.modal-content') && !e.target.closest('.console-tab') && !e.target.closest('.sidebar-action-icon')) {
            if (selectedNodes.size > 0) {
                selectedNodes.clear();
                updateTreeSelectionUI();
            }
        }
    });

    // Background System Listeners
    window.electronAPI.onExternalChange((changedPath) => {
        if (changedPath) {
            // Find which repo this change belongs to
            const normPath = changedPath.replace(/\\/g, '/').toLowerCase();
            const repo = repositories.find(r => normPath.startsWith(r.path.replace(/\\/g, '/').toLowerCase()));
            if (repo) {
                console.log(`External change detected in ${repo.name}: ${changedPath}`);
                updateTreeHighlights(repo.path);

                // Intelligence: Notify user if settings enabled and window is backgrounded
                if (settings.notifRepoChanges) {
                    triggerRepoChangeNotification(repo);
                }

                if (activeRepo && activeRepo.path === repo.path) {
                    refreshActiveRepoUI(true); // Silent refresh
                }
            }
        } else {
            updateTreeHighlights();
        }
    });

    const pendingNotifications = new Map();
    function triggerRepoChangeNotification(repo) {
        if (pendingNotifications.has(repo.path)) {
            clearTimeout(pendingNotifications.get(repo.path));
        }

        pendingNotifications.set(repo.path, setTimeout(async () => {
            pendingNotifications.delete(repo.path);
            if (!settings.notifRepoChanges) return;

            try {
                const status = await window.electronAPI.gitStatus(repo.path);
                const total = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0);

                if (total > 0) {
                    window.electronAPI.sendNotification({
                        title: `Changes in ${repo.name}`,
                        body: `${total} files changed. Open GitScope to review.`
                    });
                }
            } catch (e) {}
        }, 5000));
    }
    window.electronAPI.onContextMenuCommand(async (data) => handleContextMenuCommand(data));
    window.electronAPI.onShowError((data) => {
        if (data && data.message) showError(data.message, data.title || 'Error');
    });

    // Keyboard Listeners
    window.onkeydown = (e) => {
        if (e.key === 'Delete') {
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
            if (!isInput && selectedNodes.size > 0) {
                const selection = Array.from(selectedNodes);
                // ALWAYS show the confirmation modal for the recycle bin as requested
                showDeleteModal(selection);
            }
        }
        if (e.key === 'F2') {
            const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
            if (!isInput && selectedNodes.size === 1) {
                handleRename(Array.from(selectedNodes)[0]);
            }
        }
    };

    // Modal background click handler
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };
}

function setActiveNavItem(item) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (item) item.classList.add('active');

    // Reset all scrollable view containers to top
    const scrollableViews = [
        elements.dashboardView,
        elements.settingsView,
        elements.gitConfigView,
        elements.themeEditorView,
        elements.mainContent
    ];
    scrollableViews.forEach(view => {
        if (view) view.scrollTop = 0;
    });

    elements.dashboardView.style.display = 'none';
    elements.repoView.style.display = 'none';
    elements.editorView.style.display = 'none';
    elements.settingsView.style.display = 'none';
    elements.gitConfigView.style.display = 'none';
    elements.themeEditorView.style.display = 'none';
    elements.statusView.style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function showSettings() {
    setActiveNavItem(elements.navSettings);
    elements.settingsView.style.display = 'flex';
}

function switchConsoleTab(tab) {
    const targetId = tab.dataset.target;
    document.querySelectorAll('.console-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#console-body > div').forEach(d => d.classList.remove('active'));
    tab.classList.add('active');
    const target = document.getElementById(targetId);
    if (target) {
        target.classList.add('active');
        if (targetId === 'terminal-container' && window.terminal) {
            setTimeout(() => {
                window.terminal.fitAddon.fit();
                window.terminal.term.focus();
            }, 50);
        }
    }
}

async function autoImportFromRoot(rootPath) {
    try {
        // CLEANUP: Deduplicate existing list first to handle any prior bugs
        const unique = [];
        const seen = new Set();
        repositories.forEach(r => {
            const norm = r.path.replace(/\\/g, '/').toLowerCase();
            if (!seen.has(norm)) {
                seen.add(norm);
                unique.push(r);
            }
        });
        repositories = unique;

        const children = await window.electronAPI.listDirectory(rootPath, true); // Always show all for auto-import
        let addedCount = 0;

        for (const dir of children.filter(c => c.isDirectory)) {
            // Small pause to keep UI responsive during mass scan
            await new Promise(r => setTimeout(resolve => r(), 10));

            const scan = await window.electronAPI.scanDirectory(dir.path);
            if (scan.type === 'single') {
                const normPath = scan.path.replace(/\\/g, '/');
                const alreadyExists = repositories.some(r =>
                    r.path.replace(/\\/g, '/').toLowerCase() === normPath.toLowerCase()
                );

                if (!alreadyExists) {
                    repositories.push({ ...scan, path: normPath, expanded: false });
                    addedCount++;
                }
            }
        }
        if (addedCount > 0) {
            logToConsole(`Auto-imported ${addedCount} projects.`, 'success');
            sortRepositories();
            window.electronAPI.saveRepositories(repositories);
            renderTree(elements.repoFilter ? elements.repoFilter.value : '');
        }
    } catch (e) { logToConsole(e.message, 'error'); }
}

async function quickGitAction(action) {
    if (!activeRepo) return;

    // Safety Check: If pushing, check if we are behind
    if (action === 'push') {
        try {
            const status = await window.electronAPI.gitStatus(activeRepo.path);
            if (status.behind > 0) {
                const proceed = await showConfirm(
                    `You have ${status.behind} incoming commits from remote. It is highly recommended to PULL first.\n\nAre you sure you want to PUSH anyway?`,
                    'Incoming Changes Detected'
                );
                if (!proceed) return;
            }
        } catch (e) {
            console.warn('Push safety check failed:', e);
        }
    }

    setTaskState(true);

    // VISIBILITY: Use the terminal as the execution engine for core git commands
    if (window.terminal) {
        logToConsole(`Launching Git ${action.toUpperCase()} in terminal...`, 'info');

        // Ensure terminal is in correct directory
        window.terminal.sendCommand(`cd "${activeRepo.path}"`);

        const forceFlag = (action === 'push' || action === 'pull') && activeRepo.gitForce ? ' --force' : '';
        const upstream = (action === 'push') ? ' -u origin HEAD' : '';

        // Construct the command
        const cmd = `git ${action}${forceFlag}${upstream}`;
        window.terminal.sendCommand(cmd);

        // Switch to terminal tab for visibility
        const termTab = document.querySelector('.console-tab[data-target="terminal-container"]');
        if (termTab) switchConsoleTab(termTab);

        // UI Refresh loop: Since we can't easily "wait" for terminal finish,
        // we'll refresh after a few seconds and then again later.
        setTimeout(async () => {
            if (action === 'pull' || action === 'fetch') await smartRefreshTree();
            // Force visibility check after push/pull/fetch as requested
            await refreshActiveRepoUI(true);
            setTaskState(false);
        }, 4000);
        return;
    }

    // Fallback: Background execution (Non-visible)
    logToConsole(`Git ${action.toUpperCase()} in progress (background)...`, 'info');
    try {
        const method = `git${action.charAt(0).toUpperCase() + action.slice(1)}`;
        const needsForce = (action === 'pull' || action === 'push');
        const res = await window.electronAPI[method](activeRepo.path, needsForce ? activeRepo.gitForce : undefined);
        logToConsole(res.output, res.success ? 'success' : 'error');
        if (!res.success) showError(res.output, `Git ${action.toUpperCase()} Failed`);

        if (action === 'pull' || action === 'fetch') {
            await smartRefreshTree();
        }
        // Force visibility check after push/pull/fetch
        await refreshActiveRepoUI(false);
    } catch (e) {
        logToConsole(e.message, 'error');
        showError(e.message, 'System Error');
    }
    finally { setTaskState(false); }
}

/**
 * Quick Commit from Dashboard: Stages all and commits as "update".
 */
async function handleDashboardCommit(repo) {
    if (!repo) return;
    activeRepo = repo;
    setTaskState(true);
    logToConsole(`🚀 Quick Commit: ${repo.name}`, 'info');

    try {
        // 1. Stage everything
        logToConsole('Staging all changes...', 'info');
        await window.electronAPI.gitStageAll(repo.path);

        // 2. Commit with auto-message
        logToConsole('Committing...', 'info');
        const commitRes = await window.electronAPI.gitCommit(repo.path, 'update');
        if (commitRes.success) {
            logToConsole('Commit successful.', 'success');
        } else if (commitRes.output.toLowerCase().includes('nothing to commit')) {
            logToConsole('Nothing new to commit.', 'info');
        } else {
            logToConsole(`Commit Warning: ${commitRes.output}`, 'warn');
        }
        await showDashboard();
    } catch (e) {
        logToConsole(`Commit Error: ${e.message}`, 'error');
        showError(e.message, 'Quick Commit Failed');
    } finally {
        setTaskState(false);
    }
}

/**
 * Dashboard Push: Only pushes to remote.
 */
async function handleDashboardPush(repo) {
    if (!repo) return;
    activeRepo = repo;
    setTaskState(true);
    logToConsole(`🚀 Quick Push: ${repo.name}`, 'info');

    try {
        logToConsole('Pushing to origin...', 'info');
        if (window.terminal) {
            // CRITICAL: Ensure terminal is in the correct directory before pushing
            window.terminal.sendCommand(`cd "${repo.path}"`);
            // Use -u origin HEAD to ensure upstream is set automatically
            const forceFlag = repo.gitForce ? ' --force' : '';
            window.terminal.sendCommand(`git push -u origin HEAD${forceFlag}`);
            setTimeout(async () => {
                await showDashboard();
                setTaskState(false);
            }, 3000);
        } else {
            const pushRes = await window.electronAPI.gitPush(repo.path, repo.gitForce);
            logToConsole(pushRes.output, pushRes.success ? 'success' : 'error');
            if (!pushRes.success) showError(pushRes.output, `Git Push Failed`);
            await showDashboard();
            setTaskState(false);
        }
    } catch (e) {
        logToConsole(`Push Error: ${e.message}`, 'error');
        showError(e.message, 'Quick Push Failed');
    } finally {
        setTaskState(false);
    }
}

/**
 * Dashboard Restore: Wipes all changes to HEAD for a project.
 */
async function handleDashboardRestore(repo) {
    if (!repo) return;
    const warning = `DANGER: WIPE ALL CHANGES?\n\nThis will restore ${repo.name} to HEAD state.\n\nSTAGED and UNSTAGED changes will be PERMANENTLY LOST.`;
    if (await showConfirm(warning, "Restore Project to HEAD")) {
        setTaskState(true);
        logToConsole(`Restoring ${repo.name} to HEAD...`, 'info');
        try {
            const res = await window.electronAPI.gitRestoreToHead(repo.path);
            if (res.success) {
                logToConsole(`Successfully restored ${repo.name}`, 'success');
                await showDashboard();
            } else {
                logToConsole(`Restore failed: ${res.output}`, 'error');
                showError(res.output, 'Restore Failed');
            }
        } catch (e) {
            logToConsole(`Restore error: ${e.message}`, 'error');
            showError(e.message, 'System Error');
        } finally {
            setTaskState(false);
        }
    }
}

async function handleStageAll() {
    if (!activeRepo) return;
    setTaskState(true);
    logToConsole('Staging all changes (git add .)...', 'info');
    try {
        const res = await window.electronAPI.gitStageAll(activeRepo.path);
        if (res.success) {
            logToConsole(res.output, 'success');
            await smartRefreshTree();
            await refreshActiveRepoUI();
        } else {
            logToConsole(`Stage Failed: ${res.output}`, 'error');
            showError(res.output, 'Stage Failed');
        }
    } catch (e) {
        logToConsole(`System Error: ${e.message}`, 'error');
        showError(e.message, 'System Error');
    } finally { setTaskState(false); }
}

async function handleUnstageAll() {
    if (!activeRepo) return;
    setTaskState(true);
    logToConsole('Unstaging all changes (git reset .)...', 'info');
    try {
        const res = await window.electronAPI.gitUnstageAll(activeRepo.path);
        if (res.success) {
            logToConsole(res.output, 'success');
            await smartRefreshTree();
            await refreshActiveRepoUI();
        } else {
            logToConsole(`Unstage Failed: ${res.output}`, 'error');
            showError(res.output, 'Unstage Failed');
        }
    } catch (e) {
        logToConsole(`System Error: ${e.message}`, 'error');
        showError(e.message, 'System Error');
    } finally { setTaskState(false); }
}

async function handleCommit(pushAfter = false) {
    logToConsole(`Commit action triggered (pushAfter: ${pushAfter})...`, 'info');
    if (!activeRepo) {
        logToConsole("Error: No active project for commit.", "error");
        return;
    }
    const msg = elements.commitMsgArea.value.trim();
    if (!msg) {
        logToConsole("Commit blocked: Message is empty.", "error");
        showAlert('Please enter a commit message.', 'Missing Info');
        elements.commitMsgArea.focus();
        return;
    }

    // Safety Check: If pushing after commit, check if we are behind
    if (pushAfter) {
        try {
            const status = await window.electronAPI.gitStatus(activeRepo.path);
            if (status.behind > 0) {
                const proceed = await showConfirm(
                    `You have ${status.behind} incoming commits from remote. It is highly recommended to PULL first.\n\nAre you sure you want to COMMIT and PUSH anyway?`,
                    'Incoming Changes Detected'
                );
                if (!proceed) return;
            }
        } catch (e) {
            console.warn('Push safety check failed:', e);
        }
    }

    setTaskState(true);
    elements.commitBtn.disabled = true;
    if (elements.commitPushBtn) elements.commitPushBtn.disabled = true;
    try {
        const res = await window.electronAPI.gitCommit(activeRepo.path, msg);
        if (res && res.success) {
            logToConsole('Commit Successful.', 'success');
            logToConsole(res.output, 'info');
            elements.commitMsgArea.value = '';

            if (pushAfter) {
                logToConsole('Pushing changes...', 'info');
                if (window.terminal) {
                    window.terminal.sendCommand(`cd "${activeRepo.path}"`);
                    const forceFlag = activeRepo.gitForce ? ' --force' : '';
                    window.terminal.sendCommand(`git push${forceFlag}`);
                } else await window.electronAPI.gitPush(activeRepo.path, activeRepo.gitForce);
            }

            await smartRefreshTree(); // Structural refresh (handles deleted files)
            await refreshActiveRepoUI();

        } else {
            const errorMsg = res ? res.output : 'Unknown backend error';
            logToConsole(`Commit Failed: ${errorMsg}`, 'error');
            if (errorMsg.includes('nothing to commit')) {
                showAlert("Nothing to commit. Make some changes first!", "Clean Tree");
            } else {
                showError(errorMsg, 'Commit Failed');
            }
        }
    } catch (e) {
        logToConsole(`System Error during commit: ${e.message}`, 'error');
        showError(e.message, 'System Error');
    }
    finally {
        elements.commitBtn.disabled = false;
        if (elements.commitPushBtn) elements.commitPushBtn.disabled = false;
        setTaskState(false);
    }
}

async function generateMagicMsg() {
    if (!activeRepo) return;
    elements.magicCommitBtn.disabled = true;
    try {
        // Intelligence: Only generate message based on STAGED changes if they exist
        let diff = await window.electronAPI.getStagedDiff(activeRepo.path);

        // Fallback to full diff only if absolutely nothing is staged
        if (!diff || diff.trim() === '') {
            diff = await window.electronAPI.getFullDiff(activeRepo.path);
        }

        const msg = await window.electronAPI.generateCommitMsg(diff);
        elements.commitMsgArea.value = msg;
    } catch (e) { logToConsole(e.message, 'error'); }
    finally { elements.magicCommitBtn.disabled = false; }
}

async function handleBranchChange() {
    if (!activeRepo) return;
    const branch = elements.branchSelect.value;
    try {
        const res = await window.electronAPI.switchBranch(activeRepo.path, branch);
        logToConsole(res.output, res.success ? 'success' : 'error');
        if (!res.success) showError(res.output, 'Branch Switch Failed');
        await refreshActiveRepoUI();
    } catch (e) {
        logToConsole(e.message, 'error');
        showError(e.message, 'System Error');
    }
}

async function handleCreateBranch() {
    if (!activeRepo) {
        logToConsole("Error: No active project selected for branch creation.", "error");
        return;
    }

    elements.newBranchModal.style.display = 'flex';
    elements.newBranchName.value = '';
    elements.newBranchName.focus();

    const confirmBtn = document.getElementById('new-branch-confirm');
    const cancelBtn = document.getElementById('new-branch-cancel');

    const execute = async () => {
        const name = elements.newBranchName.value.trim();
        if (!name) return;

        logToConsole(`Initializing creation for branch "${name}"...`, 'info');
        try {
            const res = await window.electronAPI.gitCreateBranch(activeRepo.path, name);
            if (res.success) {
                logToConsole(res.output, 'success');
                elements.newBranchModal.style.display = 'none';
                await refreshActiveRepoUI();
            } else {
                logToConsole(`Creation failed: ${res.output}`, 'error');
                showError(`Creation Error: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`System Error: ${e.message}`, 'error');
            showError(e.message, 'System Error');
        }
    };

    confirmBtn.onclick = execute;
    cancelBtn.onclick = () => elements.newBranchModal.style.display = 'none';

    elements.newBranchName.onkeydown = (e) => {
        if (e.key === 'Enter') execute();
        if (e.key === 'Escape') elements.newBranchModal.style.display = 'none';
    };
}

async function handleDeleteBranch() {
    if (!activeRepo) return;
    const branchToDelete = elements.branchSelect.value;

    logToConsole(`Checking branch status for "${branchToDelete}"...`, 'info');
    const branches = await window.electronAPI.getBranches(activeRepo.path);

    if (branches.all.length <= 1) {
        showAlert("Cannot delete the only remaining branch.", "Action Blocked");
        return;
    }

    if (await showConfirm(`PERMANENTLY DELETE branch "${branchToDelete}"?\n\nThis will use a FORCE delete.`, 'DANGER: Delete Branch')) {
        try {
            // 1. If deleting the branch we are currently standing on, we MUST switch first
            if (branchToDelete === branches.current) {
                const otherBranch = branches.all.find(b => b !== branchToDelete);
                logToConsole(`Branch "${branchToDelete}" is active. Switching to "${otherBranch}" first...`, 'info');

                const switchRes = await window.electronAPI.switchBranch(activeRepo.path, otherBranch);
                if (!switchRes.success) {
                    throw new Error(`Failed to switch branches: ${switchRes.output}`);
                }
                logToConsole(`Switch successful. Proceeding with deletion...`, 'success');
                // Give Git a tiny moment to release any locks
                await new Promise(r => setTimeout(r, 100));
            }

            // 2. Perform the deletion
            logToConsole(`Deleting branch "${branchToDelete}"...`, 'info');
            const res = await window.electronAPI.gitDeleteBranch(activeRepo.path, branchToDelete);

            if (res.success) {
                logToConsole(res.output, 'success');
                await refreshActiveRepoUI();
            } else {
                logToConsole(`Delete failed: ${res.output}`, 'error');
                showError(`Delete Error: ${res.output}\n\nThis can happen if the branch is open in another Git worktree or IDE.`, 'Error');
            }
        } catch (e) {
            logToConsole(`System Error: ${e.message}`, 'error');
            showError(`Error: ${e.message}`, 'Error');
        }
    }
}

async function handleRenameBranch() {
    if (!activeRepo) return;
    const oldName = elements.branchSelect.value;
    if (!oldName) return;

    elements.renameBranchModal.style.display = 'flex';
    elements.renameBranchNewName.value = oldName;
    elements.renameBranchNewName.focus();
    elements.renameBranchNewName.select();

    elements.renameBranchNewName.onkeydown = (e) => {
        if (e.key === 'Enter') {
            elements.renameBranchConfirm.click();
        } else if (e.key === 'Escape') {
            elements.renameBranchModal.style.display = 'none';
        }
    };

    elements.renameBranchCancel.onclick = () => elements.renameBranchModal.style.display = 'none';

    elements.renameBranchConfirm.onclick = async () => {
        const newName = elements.renameBranchNewName.value.trim();
        if (!newName || newName === oldName) {
            elements.renameBranchModal.style.display = 'none';
            return;
        }

        elements.renameBranchModal.style.display = 'none';
        logToConsole(`Renaming branch "${oldName}" to "${newName}"...`, 'info');
        setTaskState(true);

        try {
            const res = await window.electronAPI.gitRenameBranch(activeRepo.path, oldName, newName);
            if (res.success) {
                logToConsole(res.output, 'success');
                await refreshActiveRepoUI();
            } else {
                logToConsole(`Rename failed: ${res.output}`, 'error');
                showError(`Rename Error: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`System Error: ${e.message}`, 'error');
            showError(e.message, 'System Error');
        } finally {
            setTaskState(false);
        }
    };
}

async function saveGlobalSettings() {
    const customShellInput = document.getElementById('custom-shell-path');
    const customPath = customShellInput ? customShellInput.value : '';
    const selectedPath = elements.shellSelect.value;
    settings.rootRepoDir = elements.rootRepoDirInput.value;
    settings.githubToken = elements.githubPatInput.value;
    settings.shell = customPath || selectedPath;
    settings.notifRepoChanges = elements.notifRepoChanges ? elements.notifRepoChanges.checked : false;

    try {
        await window.electronAPI.saveSettings(settings);
        logToConsole('Settings saved.', 'success');
        if (settings.githubToken) checkGitHubTokenLife();
        if (settings.rootRepoDir) await autoImportFromRoot(settings.rootRepoDir);
        applyObsidianTheme(settings.obsidianIni);
        renderTree();
    } catch (e) { logToConsole(e.message, 'error'); }
}

async function loadThemePresets() {
    try {
        const userThemes = await window.electronAPI.getThemes();
        const themes = { ...BUILTIN_THEMES, ...userThemes };

        if (elements.themePresetsSelect) {
            elements.themePresetsSelect.innerHTML = '<option value="">-- Select Preset --</option>' +
                Object.keys(themes).sort().map(name => `<option value="${name}">${name}</option>`).join('');
            elements.newThemeNameInput.value = '';
            elements.themeDeletePresetBtn.style.display = 'none';
        }
    } catch (e) {
        logToConsole(`Failed to load themes: ${e.message}`, 'error');
    }
}

async function saveThemePreset() {
    const name = elements.newThemeNameInput.value.trim();
    if (!name) {
        showAlert('Please enter a name for the theme.', 'Invalid Name');
        return;
    }

    if (!themeEditor) return;
    const ini = themeEditor.getValue();

    try {
        await window.electronAPI.saveTheme(name, ini);
        logToConsole(`Theme "${name}" saved to presets.`, 'success');
        await loadThemePresets();
    } catch (e) {
        logToConsole(`Failed to save theme: ${e.message}`, 'error');
    }
}

async function deleteThemePreset() {
    const name = elements.themePresetsSelect.value;
    if (!name) return;

    if (name === 'Green lantern') {
        showAlert('The default "Green lantern" theme cannot be deleted.', 'Action Blocked');
        return;
    }

    if (await showConfirm(`Delete theme preset "${name}"?`, 'Confirm Delete')) {
        try {
            await window.electronAPI.deleteTheme(name);
            logToConsole(`Theme "${name}" deleted.`, 'info');
            await loadThemePresets();
        } catch (e) {
            logToConsole(`Failed to delete theme: ${e.message}`, 'error');
        }
    }
}

async function loadSelectedThemePreset() {
    const name = elements.themePresetsSelect.value;
    if (!name) {
        elements.themeDeletePresetBtn.style.display = 'none';
        return;
    }

    elements.themeDeletePresetBtn.style.display = BUILTIN_THEMES[name] ? 'none' : 'block';

    try {
        const userThemes = await window.electronAPI.getThemes();
        const themes = { ...BUILTIN_THEMES, ...userThemes };
        const ini = themes[name];

        if (ini && themeEditor) {
            themeEditor.setValue(ini);
            elements.newThemeNameInput.value = name;
        }
    } catch (e) {
        logToConsole(`Failed to load theme: ${e.message}`, 'error');
    }
}

async function handleExportSettings() {
    try {
        const res = await window.electronAPI.exportSettings();
        if (res.success) {
            logToConsole(`Settings exported successfully to: ${res.path}`, 'success');
            showAlert(`Settings exported successfully to:\n${res.path}`, 'Export Complete');
        }
    } catch (e) {
        logToConsole(`Export failed: ${e.message}`, 'error');
    }
}

async function handleImportSettings() {
    if (await showConfirm("⚠ WARNING ⚠\n\nImporting settings will OVERWRITE your current configuration and RESTART the application. Continue?", "Confirm Import")) {
        try {
            await window.electronAPI.importSettings();
            // App will restart via main process
        } catch (e) {
            logToConsole(`Import failed: ${e.message}`, 'error');
        }
    }
}

async function handleResetApp() {
    if (await showConfirm("⚠ DANGER ZONE ⚠\n\nReset everything?", "Reset Application")) {
        if (await showConfirm("FINAL WARNING: Proceed?", "Nuclear Reset")) await window.electronAPI.resetApp();
    }
}

async function showRevertModal() {
    if (!activeRepo) return;
    const modal = document.getElementById('revert-modal');
    const list = document.getElementById('commit-history-list');
    const confirmBtn = document.getElementById('revert-confirm');
    const wipeBtn = document.getElementById('revert-wipe-uncommitted');

    modal.style.display = 'flex';
    list.scrollTop = 0;
    list.innerHTML = '<p style="padding: 20px; color: var(--text-muted); text-align: center;">Fetching history...</p>';
    confirmBtn.disabled = true;

    if (wipeBtn) {
        wipeBtn.onclick = () => {
            modal.style.display = 'none';
            handleRestoreHead();
        };
    }

    if (elements.nukeReinitBtn) {
        elements.nukeReinitBtn.onclick = () => {
            modal.style.display = 'none';
            handleNukeReinit();
        };
    }

    try {
        logToConsole(`Fetching commit history for ${activeRepo.name}...`, 'info');
        const commits = await window.electronAPI.gitGetCommits(activeRepo.path);

        if (commits.length === 0) {
            list.innerHTML = '<p style="padding: 20px; color: var(--text-muted); text-align: center;">No commit history found.</p>';
            return;
        }

        list.innerHTML = '';
        let selectedHash = null;

        commits.forEach(commit => {
            const item = document.createElement('div');
            item.className = 'tree-node';
            item.style.padding = '12px';
            item.style.borderBottom = '1px solid var(--border-color)';

            const date = new Date(commit.date).toLocaleString();

            item.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px; pointer-events: none;">
                    <span style="font-weight: 700; color: var(--accent-blue); font-family: monospace;">${commit.hash.substring(0, 7)}</span>
                    <span style="font-size: 11px; color: var(--text-muted);">${date}</span>
                </div>
                <div style="font-size: 13px; color: #fff; margin-bottom: 4px; pointer-events: none;">${commit.message}</div>
                <div style="font-size: 11px; color: var(--text-muted); pointer-events: none;">Author: ${commit.author_name}</div>
            `;

            item.onclick = () => {
                Array.from(list.children).forEach(child => child.classList.remove('active'));
                item.classList.add('active');
                selectedHash = commit.hash;
                confirmBtn.disabled = false;
            };

            list.appendChild(item);
        });

        confirmBtn.onclick = async () => {
            if (!selectedHash) return;

            const warning = `ARE YOU SURE?\n\nThis will revert ${activeRepo.name} to commit ${selectedHash.substring(0, 7)}.\n\nALL uncommitted changes will be PERMANENTLY DELETED.`;
            if (await showConfirm(warning, "Confirm Revert")) {
                logToConsole(`Reverting ${activeRepo.name} to ${selectedHash.substring(0, 7)}...`, 'info');
                modal.style.display = 'none';

                setTaskState(true);
                try {
                    const res = await window.electronAPI.gitRevertToCommit(activeRepo.path, selectedHash);
                    if (res.success) {
                        logToConsole(res.output, 'success');
                        await selectRepo(activeRepo);
                        await smartRefreshTree();
                    } else {
                        logToConsole(`Revert failed: ${res.output}`, 'error');
                        showAlert(`Revert Error: ${res.output}`, 'Error');
                    }
                } catch(err) {
                    logToConsole(`System Error during revert: ${err.message}`, 'error');
                } finally {
                    setTaskState(false);
                }
            }
        };

    } catch (e) {
        logToConsole(`History error: ${e.message}`, 'error');
        list.innerHTML = `<p style="padding: 20px; color: var(--accent-red); text-align: center;">Error: ${e.message}</p>`;
    }

    document.getElementById('revert-cancel').onclick = () => modal.style.display = 'none';
}

async function handleRestoreHead() {
    if (!activeRepo) return;
    const warning = `DANGER: WIPE ALL CHANGES?\n\nThis will restore ${activeRepo.name} to HEAD state.\n\nEVERY uncommitted local edit will be PERMANENTLY DELETED.`;
    if (await showConfirm(warning, "Restore to HEAD")) {
        setTaskState(true);
        logToConsole(`Restoring ${activeRepo.name} to HEAD...`, 'info');
        try {
            const res = await window.electronAPI.gitRestoreToHead(activeRepo.path);
            if (res.success) {
                logToConsole(res.output, 'success');
                await refreshActiveRepoUI();
                await smartRefreshTree();
            } else {
                logToConsole(`Restore failed: ${res.output}`, 'error');
            }
        } catch (e) {
            logToConsole(`Restore error: ${e.message}`, 'error');
        } finally { setTaskState(false); }
    }
}

async function handleRestoreFile() {
    if (!activeRepo || !currentEditingPath) return;

    // Determine the relative path for git
    const repoBase = activeRepo.path.replace(/\\/g, '/').toLowerCase();
    const fullPath = currentEditingPath.replace(/\\/g, '/').toLowerCase();

    let relPath = fullPath.replace(repoBase, '');
    if (relPath.startsWith('/')) relPath = relPath.substring(1);

    const fileName = fullPath.split('/').pop();
    const warning = `RESTORE FILE?\n\nThis will wipe all uncommitted edits in ${fileName} and restore it to the last committed state.`;

    if (await showConfirm(warning, "Restore File")) {
        setTaskState(true);
        logToConsole(`Restoring ${fileName}...`, 'info');
        try {
            const res = await window.electronAPI.gitRestoreFile(activeRepo.path, relPath);
            if (res.success) {
                logToConsole(res.output, 'success');

                // 1. If we are in Diff View, refresh it
                if (elements.diffView.style.display !== 'none') {
                    await showFileDiff(currentEditingPath);
                }

                // 2. If we are in Editor View, reload the file content
                if (elements.editorView.style.display !== 'none') {
                    await openFileInEditor(currentEditingPath);
                }

                await refreshActiveRepoUI();
                await smartRefreshTree();
            } else {
                logToConsole(`File restore failed: ${res.output}`, 'error');
            }
        } catch (e) {
            logToConsole(`File restore error: ${e.message}`, 'error');
        } finally { setTaskState(false); }
    }
}

async function handleAddRemoteModal() {
    if (!activeRepo) return;
    elements.newRemoteModal.style.display = 'flex';
    elements.newRemoteName.value = '';
    elements.newRemoteUrl.value = '';
    elements.newRemoteName.focus();

    const confirmBtn = document.getElementById('new-remote-confirm');
    const cancelBtn = document.getElementById('new-remote-cancel');

    const execute = async () => {
        const name = elements.newRemoteName.value.trim();
        const url = elements.newRemoteUrl.value.trim();
        if (!name || !url) return showAlert('Name and URL are required.', 'Missing Fields');

        logToConsole(`Adding remote "${name}"...`, 'info');
        try {
            const res = await window.electronAPI.addRemote(activeRepo.path, name, url);
            if (res.success) {
                logToConsole(res.output, 'success');
                elements.newRemoteModal.style.display = 'none';
                await refreshActiveRepoUI();
            } else {
                logToConsole(`Failed to add remote: ${res.output}`, 'error');
                showAlert(`Error: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`Remote addition error: ${e.message}`, 'error');
        }
    };

    confirmBtn.onclick = execute;
    cancelBtn.onclick = () => elements.newRemoteModal.style.display = 'none';
}

async function handleEditRemoteModal() {
    if (!activeRepo) return;
    const select = elements.remoteSelect;
    const remoteName = select.value;
    if (!remoteName || remoteName === 'none') return showAlert('Please select a remote to edit.', 'Selection Required');

    // Get current URL for this remote
    const remotes = await window.electronAPI.getRemotes(activeRepo.path);
    const remote = remotes.find(r => r.name === remoteName);
    if (!remote) return showAlert('Could not find information for the selected remote.', 'Error');

    elements.editRemoteModal.style.display = 'flex';
    elements.editRemoteName.value = remoteName;
    elements.editRemoteUrl.value = remote.url;
    elements.editRemoteUrl.focus();

    const confirmBtn = document.getElementById('edit-remote-confirm');
    const cancelBtn = document.getElementById('edit-remote-cancel');

    const execute = async () => {
        const url = elements.editRemoteUrl.value.trim();
        if (!url) return showAlert('URL is required.', 'Missing Field');

        logToConsole(`Updating remote "${remoteName}" URL...`, 'info');
        try {
            const res = await window.electronAPI.setRemoteUrl(activeRepo.path, remoteName, url);
            if (res.success) {
                logToConsole(res.output, 'success');
                elements.editRemoteModal.style.display = 'none';
                await refreshActiveRepoUI();
            } else {
                logToConsole(`Failed to update remote: ${res.output}`, 'error');
                showAlert(`Error: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`Remote update error: ${e.message}`, 'error');
        }
    };

    confirmBtn.onclick = execute;
    cancelBtn.onclick = () => elements.editRemoteModal.style.display = 'none';
}

async function handleRemoveRemote() {
    if (!activeRepo) return;
    const select = elements.remoteSelect;
    const currentRemote = select.value;
    if (!currentRemote || currentRemote === 'none') return;

    const selectedOption = select.options[select.selectedIndex];
    const remoteUrl = selectedOption ? selectedOption.getAttribute('data-url') : '';
    const isGithub = remoteUrl && remoteUrl.toLowerCase().includes('github.com');

    if (await showConfirm(`Remove remote reference "${currentRemote}"?`, "Confirm Remove")) {
        logToConsole(`Removing remote "${currentRemote}"...`, 'info');
        try {
            const res = await window.electronAPI.removeRemote(activeRepo.path, currentRemote);
            if (res.success) {
                logToConsole(res.output, 'success');

                // INTELLIGENCE: If it was a GitHub remote, ask if they want to delete it from GitHub too
                if (isGithub && settings.githubToken) {
                    const regex = /github\.com[\/|:]([^\/]+)\/([^\/.]+)(\.git)?$/i;
                    const match = remoteUrl.match(regex);
                    if (match) {
                        const owner = match[1];
                        const repoName = match[2];
                        if (await showConfirm(`This was a GitHub repository. Would you like to PERMANENTLY DELETE "${owner}/${repoName}" from GitHub as well?`, "Nuclear Option")) {
                            setTaskState(true);
                            logToConsole(`Deleting ${owner}/${repoName} from GitHub...`, 'info');
                            const delRes = await window.electronAPI.deleteGitHubRepo(settings.githubToken, owner, repoName);
                            if (delRes.success) {
                                logToConsole(`Successfully deleted repository from GitHub.`, 'success');
                            } else {
                                logToConsole(`GitHub deletion failed: ${delRes.output}`, 'error');
                                showAlert(`GitHub deletion failed: ${delRes.output}`, 'Error');
                            }
                            setTaskState(false);
                        }
                    }
                }

                await refreshActiveRepoUI();
            } else {
                logToConsole(`Failed to remove remote: ${res.output}`, 'error');
                showAlert(`Error: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`Remote removal error: ${e.message}`, 'error');
        }
    }
}

async function handleOpenRemote() {
    const selected = elements.remoteSelect.options[elements.remoteSelect.selectedIndex];
    if (!selected) return;
    const url = selected.getAttribute('data-url');
    if (!url) return;

    const browserUrl = normalizeGitUrl(url);
    if (browserUrl) {
        window.electronAPI.openExternal(browserUrl);
    }
}

async function getRepoSubtreeMappings(repoPath) {
    const repo = repositories.find(r => r.path === repoPath);
    // Prioritize internal memory if it has data
    if (repo && repo.subtrees && repo.subtrees.length > 0) return [...repo.subtrees];

    try {
        const mappingPath = `${repoPath}/.gitsubtree.json`;
        const exists = await window.electronAPI.pathExists(mappingPath);
        if (exists) {
            const result = await window.electronAPI.readFile(mappingPath);
            const content = result.content;
            const parsed = JSON.parse(content);
            if (repo) repo.subtrees = parsed;
            return parsed;
        }
    } catch (e) {}
    return repo ? (repo.subtrees || []) : [];
}

async function handleAddSubtreeFromTree(folderPath) {
    // 1. Normalize and identify parent repo
    const targetPath = folderPath.replace(/\\/g, '/');
    const repo = repositories
        .filter(r => targetPath.toLowerCase().startsWith(r.path.toLowerCase()))
        .sort((a, b) => b.path.length - a.path.length)[0];

    if (!repo) {
        logToConsole(`Error: Could not identify parent repository for selection.`, 'error');
        return;
    }

    activeRepo = repo;

    // 2. Calculate relative path (prefix)
    let relPath = targetPath.substring(repo.path.length).replace(/^[\\\/]/, '');
    if (!relPath) {
        showAlert('You cannot map the repository root as a subtree prefix. Please select a subfolder.', 'Invalid Selection');
        return;
    }

    // 3. Load existing and add new mapping
    currentSubtreeMappings = await getRepoSubtreeMappings(repo.path);
    if (!currentSubtreeMappings.some(m => m.prefix === relPath)) {
        currentSubtreeMappings.push({ prefix: relPath, url: '', branch: 'main', force: false });
        await saveSubtreeMappings();
        logToConsole(`Added subtree mapping for folder: ${relPath}`, 'success');
    } else {
        logToConsole(`Folder "${relPath}" is already mapped. Opening manager...`, 'info');
    }

    // 4. Trigger UI display
    await showSubtreeHubModal();
}

async function handlePushSubtreeFromTree(folderPath) {
    const repo = repositories.find(r => folderPath.toLowerCase().startsWith(r.path.toLowerCase()));
    if (!repo) return;
    activeRepo = repo;
    const relPath = folderPath.substring(repo.path.length).replace(/^[\\\/]/, '').replace(/\\/g, '/');
    const mappings = await getRepoSubtreeMappings(repo.path);
    const mapping = mappings.find(m => m.prefix === relPath);
    if (mapping) handleSubtreePush(mapping);
}

// --- SUBTREE HUB HUB LOGIC ---

let currentSubtreeMappings = [];

async function attemptAutoMatchMapping(m, folderNames = null) {
    if (!activeRepo || !m.url) return;

    if (!folderNames) {
        const projectFolders = await scanFoldersRecursive(activeRepo.path);
        folderNames = projectFolders.map(f => ({
            path: f,
            name: f.substring(activeRepo.path.length + 1).replace(/\\/g, '/').toLowerCase()
        }));
    }

    const urlParts = m.url.split('/');
    const rawRepoName = urlParts[urlParts.length - 1].replace('.git', '');
    const repoName = rawRepoName.toLowerCase();
    const repoNameClean = repoName.replace(/[-_]/g, ' ');

    const match = folderNames.find(f =>
        f.name === repoName ||
        f.name === repoNameClean ||
        f.name.replace(/ /g, '') === repoName.replace(/[-_]/g, '') ||
        repoName.includes(f.name) ||
        f.name.includes(repoName)
    );

    if (match) {
        m.prefix = match.path.substring(activeRepo.path.length + 1).replace(/\\/g, '/');
        return true;
    } else {
        m.prefix = rawRepoName; // Fallback to repo name
        return false;
    }
}

async function showSubtreeHubModal() {
    if (!activeRepo) return;
    elements.subtreeHubModal.style.display = 'flex';

    try {
        currentSubtreeMappings = await getRepoSubtreeMappings(activeRepo.path);
    } catch (e) {
        currentSubtreeMappings = [];
        console.error('Error loading subtree mappings:', e);
    }

    renderSubtreeMappings();
    const hasMappings = currentSubtreeMappings.length > 0;
    updateSubtreeActionButtonsState();
    if (elements.subtreeClearAllBtn) elements.subtreeClearAllBtn.disabled = !hasMappings;

    elements.subtreeGitHubFetchBtn.onclick = () => showSubtreeGitHubModal();

    if (elements.subtreeMappingSelectAll) {
        elements.subtreeMappingSelectAll.checked = false;
        elements.subtreeMappingSelectAll.onchange = (e) => {
            const cbs = elements.subtreeMappingList.querySelectorAll('.mapping-item-cb');
            cbs.forEach(cb => cb.checked = e.target.checked);
            updateSubtreeActionButtonsState();
        };
    }

    if (elements.subtreeDeleteSelectedBtn) {
        elements.subtreeDeleteSelectedBtn.onclick = async () => {
            const checked = Array.from(elements.subtreeMappingList.querySelectorAll('.mapping-item-cb:checked'));
            if (checked.length === 0) return;

            if (await showConfirm(`Remove ${checked.length} selected subtree mappings?`, "Confirm Delete")) {
                const indicesToDelete = checked.map(cb => parseInt(cb.dataset.index)).sort((a, b) => b - a);
                indicesToDelete.forEach(idx => currentSubtreeMappings.splice(idx, 1));

                await saveSubtreeMappings();
                renderSubtreeMappings();

                const hasMappings = currentSubtreeMappings.length > 0;
                updateSubtreeActionButtonsState();
                if (elements.subtreeMappingSelectAll) elements.subtreeMappingSelectAll.checked = false;
            }
        };
    }

    if (elements.subtreeClearAllBtn) {
        elements.subtreeClearAllBtn.onclick = async () => {
            if (currentSubtreeMappings.length === 0) return;
            if (await showConfirm("Permanently remove ALL subtree mappings for this project?", "Confirm Clear All")) {
                currentSubtreeMappings = [];
                await saveSubtreeMappings();
                renderSubtreeMappings();
                updateSubtreeActionButtonsState();
                if (elements.subtreeMappingSelectAll) elements.subtreeMappingSelectAll.checked = false;
                logToConsole('All subtree mappings cleared.', 'info');
            }
        };
    }
}

function updateSubtreeActionButtonsState() {
    const checkedCount = elements.subtreeMappingList ? elements.subtreeMappingList.querySelectorAll('.mapping-item-cb:checked').length : 0;
    const disabled = checkedCount === 0;

    if (elements.subtreeDeleteSelectedBtn) elements.subtreeDeleteSelectedBtn.disabled = disabled;
    if (elements.subtreePullSelectedBtn) elements.subtreePullSelectedBtn.disabled = disabled;
    if (elements.subtreePushSelectedBtn) elements.subtreePushSelectedBtn.disabled = disabled;
}

async function showSubtreeGitHubModal(targetIndex = -1) {
    if (!settings.githubToken) return showAlert('GitHub token is required to fetch repositories.', 'Auth Error');
    elements.subtreeGitHubModal.style.display = 'flex';
    const list = elements.subtreeGitHubList;
    list.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Loading GitHub repositories...</div>';

    if (elements.subtreeGitHubConfirm) elements.subtreeGitHubConfirm.disabled = true;

    try {
        const res = await window.electronAPI.fetchGitHubRepos(settings.githubToken);
        if (res.expiration) updateTokenExpirationUI(res.expiration);

        const repos = res.repos || [];
        if (repos.length === 0) {
            list.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">No repositories found on your account.</div>';
        } else {
            if (elements.subtreeGitHubConfirm) {
                elements.subtreeGitHubConfirm.disabled = false;
                elements.subtreeGitHubConfirm.textContent = targetIndex >= 0 ? 'Update Remote URL' : 'Add Selected Repos';
            }

            list.innerHTML = repos.map(r => `
                <label style="display:flex; align-items:center; gap:10px; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:4px; border:1px solid transparent; cursor:pointer; transition:all 0.2s;">
                    <input type="${targetIndex >= 0 ? 'radio' : 'checkbox'}" class="gh-repo-item-cb" name="gh-repo-selection" value="${r.clone_url}" data-name="${r.name}">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; font-size:13px; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.full_name}</div>
                        <div style="font-size:11px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${r.clone_url}</div>
                    </div>
                </label>
            `).join('');

            // Select All logic (only for bulk add)
            if (elements.subtreeGitHubSelectAll) {
                elements.subtreeGitHubSelectAll.parentElement.style.display = targetIndex >= 0 ? 'none' : 'block';
                elements.subtreeGitHubSelectAll.checked = false;
                elements.subtreeGitHubSelectAll.onchange = (e) => {
                    list.querySelectorAll('.gh-repo-item-cb').forEach(cb => cb.checked = e.target.checked);
                };
            }

            if (elements.subtreeGitHubConfirm) {
                elements.subtreeGitHubConfirm.onclick = async () => {
                    const selected = Array.from(list.querySelectorAll('.gh-repo-item-cb:checked'));
                    if (selected.length === 0) return showAlert('Select at least one repository.', 'Selection Required');

                    const projectFolders = await scanFoldersRecursive(activeRepo.path);
                    const folderNames = projectFolders.map(f => ({
                        path: f,
                        name: f.substring(activeRepo.path.length + 1).replace(/\\/g, '/').toLowerCase()
                    }));

                    if (targetIndex >= 0) {
                        // Editing single row
                        const m = currentSubtreeMappings[targetIndex];
                        m.url = selected[0].value;
                        await attemptAutoMatchMapping(m, folderNames);
                    } else {
                        // Bulk adding
                        for (const item of selected) {
                            const m = { prefix: '', url: item.value, branch: 'main' };
                            await attemptAutoMatchMapping(m, folderNames);
                            currentSubtreeMappings.push(m);
                        }
                    }

                    elements.subtreeGitHubModal.style.display = 'none';
                    saveSubtreeMappings();
                    renderSubtreeMappings();
                    logToConsole(`Added/Updated ${selected.length} GitHub repositories in subtree mappings.`, 'success');
                };
            }
        }
    } catch (e) {
        list.innerHTML = `<div style="padding:20px; color:var(--accent-red); text-align:center;">API Error: ${e.message}</div>`;
    }
}

elements.subtreeGitHubCancel.onclick = () => elements.subtreeGitHubModal.style.display = 'none';

async function showPrefixPickerModal(targetIndex) {
    if (!activeRepo) return;
    elements.prefixPickerModal.style.display = 'flex';
    const list = elements.prefixFolderList;
    list.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Scanning project folders...</div>';

    try {
        // We use a simplified recursive scanner to find all subdirectories
        const folders = await scanFoldersRecursive(activeRepo.path);

        if (folders.length === 0) {
            list.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">No subfolders found in project.</div>';
        } else {
            list.innerHTML = folders.map(f => {
                const relPath = f.substring(activeRepo.path.length + 1).replace(/\\/g, '/');
                return `
                    <div class="folder-picker-item" style="padding:8px 12px; border-bottom:1px solid var(--border-color); cursor:pointer; transition:background 0.2s;" data-path="${relPath}">
                        <div style="font-size:13px; color:#fff;">📁 ${relPath}</div>
                    </div>
                `;
            }).join('');

            list.querySelectorAll('.folder-picker-item').forEach(item => {
                item.onclick = () => {
                    currentSubtreeMappings[targetIndex].prefix = item.dataset.path;
                    elements.prefixPickerModal.style.display = 'none';
                    saveSubtreeMappings();
                    renderSubtreeMappings();
                };
            });
        }
    } catch (e) {
        list.innerHTML = `<div style="padding:20px; color:var(--accent-red); text-align:center;">Scan Error: ${e.message}</div>`;
    }
}

async function scanFoldersRecursive(dir, results = []) {
    const items = await window.electronAPI.listDirectory(dir, false);
    for (const item of items) {
        if (item.isDirectory) {
            results.push(item.path);
            // Limit depth to 3 for performance in bulk manager
            const parts = item.path.substring(activeRepo.path.length).split(/[\\\/]/).filter(p => p);
            if (parts.length < 3) {
                await scanFoldersRecursive(item.path, results);
            }
        }
    }
    return results;
}

elements.prefixPickerCancel.onclick = () => elements.prefixPickerModal.style.display = 'none';

function renderSubtreeMappings() {
    const list = elements.subtreeMappingList;
    if (currentSubtreeMappings.length === 0) {
        list.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:20px;">No subtree mappings defined yet.</div>';
        return;
    }

    list.innerHTML = currentSubtreeMappings.map((m, index) => `
        <div class="subtree-mapping-row" style="display:flex; gap:12px; align-items:flex-end; background:rgba(255,255,255,0.02); padding:12px; border-radius:6px; border:1px solid var(--border-color); min-width: 0;">
            <div style="flex-shrink:0; align-self:center;">
                <input type="checkbox" class="mapping-item-cb" data-index="${index}" style="width: 16px; height: 16px; cursor: pointer;">
            </div>
            <div style="flex:1; min-width: 0;">
                <label style="font-size:9px; font-weight:800; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:4px;">Prefix (Folder)</label>
                <div style="display:flex; gap:4px;">
                    <input type="text" class="settings-input mapping-prefix" data-index="${index}" value="${m.prefix}" style="padding:4px 8px; height:28px; flex:1;">
                    <button class="button browse-prefix-btn" data-index="${index}" title="Select folder from project" style="height:28px; width:28px; padding:0;">📁</button>
                </div>
            </div>
            <div style="flex:2; min-width: 0;">
                <label style="font-size:9px; font-weight:800; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:4px;">Remote Repository URL</label>
                <div style="display:flex; gap:6px;">
                    <input type="text" class="settings-input mapping-url" data-index="${index}" value="${m.url}" style="padding:4px 8px; height:28px; flex:1;">
                    <button class="button gh-select-btn" data-index="${index}" title="Select from GitHub" style="height:28px; width:28px; padding:0; border-color:var(--accent-blue);">G</button>
                </div>
            </div>
            <div style="width: 80px; flex-shrink: 0;">
                <label style="font-size:9px; font-weight:800; color:var(--text-muted); text-transform:uppercase; display:block; margin-bottom:4px;">Branch</label>
                <input type="text" class="settings-input mapping-branch" data-index="${index}" value="${m.branch || 'main'}" style="padding:4px 8px; height:28px; width: 100%;">
            </div>
            <div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 32px;">
                <label style="font-size: 8px; font-weight: 800; color: var(--accent-red); text-transform: uppercase;">Force</label>
                <input type="checkbox" class="mapping-force" data-index="${index}" ${m.force ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer;">
            </div>
            <div style="display: flex; gap: 6px; flex-shrink: 0;">
                <button class="button button-danger remove-mapping-btn" data-index="${index}" style="height:28px; width:28px; padding:0;" title="Remove Mapping">×</button>
                <button class="button pull-subtree-btn" data-index="${index}" style="height:28px; width:28px; padding:0; color:var(--accent-blue);" title="Pull this subtree only (updates parent project)">↓</button>
                <button class="button button-primary push-subtree-btn" data-index="${index}" style="height:28px; width:28px; padding:0;" title="Push this subtree only">↑</button>
            </div>
        </div>
    `).join('');

    // Attach listeners
    list.querySelectorAll('.mapping-prefix').forEach(input => {
        input.onchange = (e) => {
            currentSubtreeMappings[parseInt(e.target.dataset.index)].prefix = e.target.value.trim();
            saveSubtreeMappings();
        };
    });
    list.querySelectorAll('.mapping-url').forEach(input => {
        input.onchange = async (e) => {
            const index = parseInt(e.target.dataset.index);
            const mapping = currentSubtreeMappings[index];
            mapping.url = e.target.value.trim();

            // Only auto-match if prefix is empty (likely just added)
            if (!mapping.prefix) {
                await attemptAutoMatchMapping(mapping);
                renderSubtreeMappings();
            }
            saveSubtreeMappings();
        };
    });
    list.querySelectorAll('.gh-select-btn').forEach(btn => {
        btn.onclick = (e) => {
            showSubtreeGitHubModal(parseInt(btn.dataset.index));
        };
    });
    list.querySelectorAll('.browse-prefix-btn').forEach(btn => {
        btn.onclick = (e) => {
            showPrefixPickerModal(parseInt(btn.dataset.index));
        };
    });
    list.querySelectorAll('.mapping-branch').forEach(input => {
        input.onchange = (e) => {
            currentSubtreeMappings[parseInt(e.target.dataset.index)].branch = e.target.value.trim();
            saveSubtreeMappings();
        };
    });
    list.querySelectorAll('.mapping-force').forEach(input => {
        input.onchange = (e) => {
            currentSubtreeMappings[parseInt(e.target.dataset.index)].force = e.target.checked;
            saveSubtreeMappings();
        };
    });
    list.querySelectorAll('.mapping-item-cb').forEach(cb => {
        cb.onchange = () => updateSubtreeActionButtonsState();
    });
    list.querySelectorAll('.remove-mapping-btn').forEach(btn => {
        btn.onclick = async (e) => {
            const index = parseInt(e.target.dataset.index);
            if (await showConfirm(`Remove mapping for "${currentSubtreeMappings[index].prefix}"?`, "Confirm Delete")) {
                currentSubtreeMappings.splice(index, 1);
                saveSubtreeMappings();
                renderSubtreeMappings();
                updateSubtreeActionButtonsState();
            }
        };
    });
    list.querySelectorAll('.push-subtree-btn').forEach(btn => {
        btn.onclick = (e) => {
            const index = parseInt(e.target.dataset.index);
            elements.subtreeHubModal.style.display = 'none';
            handleSubtreePush(currentSubtreeMappings[index]);
        };
    });
}

async function saveSubtreeMappings() {
    if (!activeRepo) return;
    activeRepo.subtrees = currentSubtreeMappings;

    // Persist to main app config
    window.electronAPI.saveRepositories(repositories);

    try {
        const mappingPath = `${activeRepo.path}/.gitsubtree.json`;
        await window.electronAPI.writeFile(mappingPath, JSON.stringify(currentSubtreeMappings, null, 2));
    } catch (e) {
        console.error('Failed to save subtree mappings to file:', e);
    }
}

elements.addSubtreeBtn.onclick = () => {
    currentSubtreeMappings.push({ prefix: '', url: '', branch: 'main' });
    renderSubtreeMappings();
    updateSubtreeActionButtonsState();
};

if (elements.subtreePushSelectedBtn) {
    elements.subtreePushSelectedBtn.onclick = async () => {
        const checked = Array.from(elements.subtreeMappingList.querySelectorAll('.mapping-item-cb:checked'));
        if (checked.length === 0) return;

        if (await showConfirm(`Push ${checked.length} selected subtrees to their remotes?`, "Confirm Push")) {
            elements.subtreeHubModal.style.display = 'none';
            setTaskState(true);
            logToConsole(`🚀 Starting Selective Subtree Push sequence...`, 'info');

            let successCount = 0;
            for (const cb of checked) {
                const index = parseInt(cb.dataset.index);
                const m = currentSubtreeMappings[index];
                if (!m || !m.prefix || !m.url) continue;
                const res = await handleSubtreePush(m, true);
                if (res) successCount++;
            }

            logToConsole(`Selective sequence complete. ${successCount}/${checked.length} successful.`, successCount === checked.length ? 'success' : 'warn');
            setTaskState(false);
        }
    };
}

if (elements.subtreePullSelectedBtn) {
    elements.subtreePullSelectedBtn.onclick = async () => {
        const checked = Array.from(elements.subtreeMappingList.querySelectorAll('.mapping-item-cb:checked'));
        if (checked.length === 0) return;

        if (await showConfirm(`Pull updates for ${checked.length} selected subtrees? This will merge remote changes into your local folders.`, "Confirm Pull")) {
            elements.subtreeHubModal.style.display = 'none';
            setTaskState(true);
            logToConsole(`🚀 Starting Selective Subtree Pull sequence...`, 'info');

            let successCount = 0;
            for (const cb of checked) {
                const index = parseInt(cb.dataset.index);
                const m = currentSubtreeMappings[index];
                if (!m || !m.prefix || !m.url) continue;
                const res = await handleSubtreePull(m, true);
                if (res) successCount++;
            }

            logToConsole(`Selective sequence complete. ${successCount}/${checked.length} successful.`, successCount === checked.length ? 'success' : 'warn');
            setTaskState(false);
        }
    };
}

elements.subtreeModalClose.onclick = () => {
    elements.subtreeHubModal.style.display = 'none';
};

async function handleSubtreePush(mapping, isBulk = false) {
    if (!activeRepo) return false;
    if (!mapping.prefix || !mapping.url) {
        if (!isBulk) showAlert('Please specify both folder prefix and remote URL.', 'Missing Info');
        return false;
    }

    if (!isBulk) setTaskState(true);

    try {
        // 1. AUTOMATIC SYNC BEFORE PUSH
        // We must pull first to prevent non-fast-forward rejections
        logToConsole(`🔄 [${mapping.prefix}]: Pulling remote changes before push...`, 'info');
        const pullRes = await window.electronAPI.gitSubtreePull(
            activeRepo.path,
            mapping.prefix,
            mapping.url,
            mapping.branch || 'main'
        );

        if (!pullRes.success) {
            // Check if it's just "already up to date" or a real failure
            if (pullRes.output.includes('up to date') || pullRes.output.includes('no new commits')) {
                logToConsole(`   ✅ [${mapping.prefix}]: Already up to date.`, 'info');
            } else {
                logToConsole(`   ❌ [${mapping.prefix}]: Pull failed. Push aborted to prevent non-fast-forward error.`, 'error');
                logToConsole(`      Reason: ${pullRes.output}`, 'error');
                if (!isBulk) showError(pullRes.output, `Pull Failed: ${mapping.prefix}`);
                return false;
            }
        } else {
            logToConsole(`   ✅ [${mapping.prefix}]: Remote changes merged.`, 'success');
        }

        // 2. THE PUSH
        logToConsole(`🚀 [${mapping.prefix}]: Pushing to remote...`, 'info');
        const res = await window.electronAPI.gitSubtreePush(
            activeRepo.path,
            mapping.prefix,
            mapping.url,
            mapping.branch || 'main',
            !!mapping.force
        );

        if (res.success) {
            logToConsole(`   ✅ [${mapping.prefix}]: Push successful!`, 'success');
            if (!isBulk) showAlert(`Subtree [${mapping.prefix}] successfully pushed to remote.`, 'Success');
            return true;
        } else {
            logToConsole(`   ❌ [${mapping.prefix}]: Push failed: ${res.output}`, 'error');
            if (!isBulk) showError(res.output, `Push Failed: ${mapping.prefix}`);
            return false;
        }
    } catch (e) {
        logToConsole(`⚠️ [${mapping.prefix}]: System Error: ${e.message}`, 'error');
        return false;
    } finally {
        if (!isBulk) setTaskState(false);
    }
}

async function handleSubtreePull(mapping, isBulk = false) {
    if (!activeRepo) return false;
    if (!mapping.prefix || !mapping.url) {
        if (!isBulk) showAlert('Please specify both folder prefix and remote URL.', 'Missing Info');
        return false;
    }

    if (!isBulk) setTaskState(true);
    logToConsole(`Subtree PULL: [${mapping.prefix}] <- ${mapping.url}...`, 'info');

    try {
        const res = await window.electronAPI.gitSubtreePull(
            activeRepo.path,
            mapping.prefix,
            mapping.url,
            mapping.branch || 'main'
        );

        if (res.success) {
            logToConsole(`✅ Subtree [${mapping.prefix}] pull successful!`, 'success');
            if (!isBulk) showAlert(`Subtree [${mapping.prefix}] successfully updated from remote.`, 'Success');
            await refreshActiveRepoUI();
            return true;
        } else {
            logToConsole(`❌ Subtree [${mapping.prefix}] pull failed: ${res.output}`, 'error');
            if (!isBulk) showError(res.output, `Pull Failed: ${mapping.prefix}`);
            return false;
        }
    } catch (e) {
        logToConsole(`System Error during subtree pull: ${e.message}`, 'error');
        return false;
    } finally {
        if (!isBulk) setTaskState(false);
    }
}

function normalizeGitUrl(url) {
    if (!url) return '';
    let normalized = url.trim();

    // Handle SSH format: git@github.com:user/repo.git -> https://github.com/user/repo
    if (normalized.startsWith('git@')) {
        normalized = normalized.replace(':', '/').replace('git@', 'https://');
    }

    // Remove .git suffix if present
    if (normalized.toLowerCase().endsWith('.git')) {
        normalized = normalized.substring(0, normalized.length - 4);
    }

    return normalized;
}

async function handlePublishGitHub() {
    if (!activeRepo) return;
    if (!settings.githubToken) {
        showAlert('Please set your Personal Access Token (PAT) in Settings.', 'Auth Required');
        showSettings();
        return;
    }

    elements.publishGitHubModal.style.display = 'flex';
    elements.publishRepoName.value = activeRepo.name.replace(/\s+/g, '-'); // Web-safe name
    elements.publishRepoName.focus();

    elements.publishCancel.onclick = () => elements.publishGitHubModal.style.display = 'none';

    elements.publishConfirm.onclick = async () => {
        const repoName = elements.publishRepoName.value.trim();
        const isPrivate = elements.publishRepoPrivate.checked;

        elements.publishGitHubModal.style.display = 'none';
        setTaskState(true);
        logToConsole(`Publishing ${activeRepo.name} to GitHub...`, 'info');

        try {
            // 1. Create repo on GitHub via REST API
            logToConsole(`Creating GitHub repository: ${repoName}...`, 'info');
            let ghRes;
            try {
                ghRes = await window.electronAPI.createGitHubRepo(settings.githubToken, repoName, isPrivate);
                if (ghRes.expiration) updateTokenExpirationUI(ghRes.expiration);
                ghRepo = ghRes.repo;
            } catch (err) {
                if (err.message.includes('422')) {
                    logToConsole('Repository already exists on GitHub. Attempting to link and push anyway...', 'warn');
                    // Fetch the existing repo URL
                    const userRes = await fetch('https://api.github.com/user', {
                        headers: { 'Authorization': `token ${settings.githubToken}` }
                    });
                    const userData = await userRes.json();
                    ghRepo = { clone_url: `https://github.com/${userData.login}/${repoName}.git` };
                } else {
                    throw err;
                }
            }

            const cloneUrl = ghRepo.clone_url;
            logToConsole(`Target GitHub URL: ${cloneUrl}`, 'success');

            // 2. Perform Link and Push via Robust Git Sequence
            logToConsole('Starting high-stability Git link & push sequence...', 'info');
            const publishRes = await window.electronAPI.gitPublishSequence(activeRepo.path, cloneUrl);

            if (publishRes.success) {
                logToConsole('Project successfully published and pushed to GitHub!', 'success');
                await refreshActiveRepoUI();
                showAlert(`Successfully published ${activeRepo.name} to GitHub.`, 'Success');
            } else {
                logToConsole(`Push sequence failed: ${publishRes.output}`, 'error');
                logToConsole('The repository exists on GitHub, but the push failed. You can retry anytime.', 'warn');
                showError(`Link successful but push failed: ${publishRes.output}`, 'Publish Partially Failed');
                await refreshActiveRepoUI();
            }
        } catch (e) {
            logToConsole(`Publish failed: ${e.message}`, 'error');
            let friendlyMsg = e.message;
            if (e.message.includes('403')) {
                friendlyMsg = "GitHub API Error 403: Permission Denied.\n\nThis usually means your Personal Access Token (PAT) is missing the 'repo' scope (Classic) or isn't set to 'All Repositories' with 'Administration: Read & Write' (Fine-grained).";
            }
            showError(friendlyMsg, 'Error Publishing Project');
        } finally {
            setTaskState(false);
        }
    };
}

async function handleToggleGitHubVisibility() {
    const btn = elements.githubVisibilityBtn;
    const owner = btn.dataset.owner;
    const repo = btn.dataset.repo;
    const isPrivate = btn.dataset.isPrivate === 'true';
    const nextPrivate = !isPrivate;

    const message = nextPrivate
        ? `Are you sure you want to make the repository "${owner}/${repo}" PRIVATE?\n\nThis will hide it from the public.`
        : `Are you sure you want to make the repository "${owner}/${repo}" PUBLIC?\n\nThis will make your code visible to everyone on the internet.`;

    if (await showConfirm(message, nextPrivate ? "Make Private" : "Make Public")) {
        setTaskState(true);
        btn.classList.add('btn-loading');
        try {
            const res = await window.electronAPI.updateGitHubRepoVisibility(settings.githubToken, owner, repo, nextPrivate);
            if (res.expiration) updateTokenExpirationUI(res.expiration);
            logToConsole(`Successfully changed visibility to ${nextPrivate ? 'PRIVATE' : 'PUBLIC'} for ${owner}/${repo}`, 'success');

            // Update Cache immediately
            if (activeRepo) {
                repoVisibilityCache.set(activeRepo.path, { owner, repo, isPrivate: nextPrivate });
            }

            await refreshActiveRepoUI(true); // Silent refresh
        } catch (e) {
            logToConsole(`Failed to change visibility: ${e.message}`, 'error');
            showError(e.message, 'GitHub API Error');
        } finally {
            setTaskState(false);
            btn.classList.remove('btn-loading');
        }
    }
}

async function handleNukeReinit() {
    if (!activeRepo) return;
    const warning = `NUCLEAR OPTION: START FRESH?\n\nThis will PERMANENTLY DELETE the .git folder for ${activeRepo.name}.\n\nYour history will be WIPED and a new repository will be initialized. Local files remain safe.`;

    if (await showConfirm(warning, "Start Fresh")) {
        if (await showConfirm("FINAL WARNING: This cannot be undone. Wipe Git history?", "DANGER: Nuclear Wipe")) {
            setTaskState(true);
            logToConsole(`Nuking .git for ${activeRepo.name}...`, 'info');
            try {
                const res = await window.electronAPI.gitNukeReinit(activeRepo.path);
                if (res.success) {
                    logToConsole(res.output, 'success');
                    await refreshActiveRepoUI();
                    renderTree();
                } else {
                    logToConsole(`Nuke failed: ${res.output}`, 'error');
                    showError(res.output, 'Nuke Failed');
                }
            } catch (e) {
                logToConsole(`Nuke error: ${e.message}`, 'error');
                showError(e.message, 'System Error');
            } finally { setTaskState(false); }
        }
    }
}

async function renderTree(filter = '') {
    if (isRendering) return;
    isRendering = true;

    try {
        const search = (filter || '').trim().toLowerCase();
        if (!elements.repoTree) return;

        // Performance: Parallel search across all repositories
        const searchPromises = repositories.map(async repo => {
            if (!repo || !repo.name) return { repo, fileMatches: [] };
            let fileMatches = [];
            if (search.length >= 1) {
                fileMatches = await window.electronAPI.searchFiles(repo.path, search);
            }
            return { repo, fileMatches };
        });

        const results = await Promise.all(searchPromises);
        const fragment = document.createDocumentFragment();

        for (const { repo, fileMatches } of results) {
            const nameMatch = repo.name.toLowerCase().includes(search);

            if (!search || nameMatch || fileMatches.length > 0) {
                const nodeContainer = createTreeNode(repo.name, repo.path, true, 0, repo);
                fragment.appendChild(nodeContainer);

                // If searching and found files, show them as direct children
                if (search && fileMatches.length > 0) {
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = 'children-container';

                    // Show top 100 matches to keep UI snappy
                    for (const relPath of fileMatches.slice(0, 100)) {
                        const fullPath = `${repo.path}/${relPath}`.replace(/\\/g, '/');
                        // Use the relative path as name so user knows location
                        childrenContainer.appendChild(createTreeNode(relPath, fullPath, false, 1, repo));
                    }

                    if (fileMatches.length > 100) {
                        const more = document.createElement('div');
                        more.style.padding = '4px 30px';
                        more.style.fontSize = '10px';
                        more.style.color = 'var(--text-muted)';
                        more.style.fontStyle = 'italic';
                        more.textContent = `+ ${fileMatches.length - 100} more matches...`;
                        childrenContainer.appendChild(more);
                    }

                    nodeContainer.appendChild(childrenContainer);
                    const chevron = nodeContainer.querySelector('.chevron');
                    if (chevron) chevron.textContent = '▾';
                }

                // Metadata hydration (Status dots, missing indicators, online/offline status)
                (async () => {
                    try {
                        const exists = await window.electronAPI.pathExists(repo.path);
                        if (!exists) {
                            const nameEl = nodeContainer.querySelector('.node-name');
                            if (nameEl) {
                                nameEl.style.color = 'var(--accent-red)';
                                nameEl.textContent += ' (MISSING)';
                            }
                        } else {
                            const [changes, remotes] = await Promise.all([
                                window.electronAPI.getDetailedChanges(repo.path),
                                window.electronAPI.getRemotes(repo.path)
                            ]);

                            const hasRemotes = remotes.length > 0;
                            const normBase = repo.path.replace(/\\/g, '/').toLowerCase();
                            repo.changedFiles = [...changes.staged, ...changes.unstaged, ...changes.untracked].map(f => `${normBase}/${f.replace(/\\/g, '/')}`.toLowerCase());
                            repo.notTrackedFiles = [...(changes.untracked || []), ...(changes.ignored || [])].map(f => `${normBase}/${f.replace(/\\/g, '/')}`.toLowerCase());

                            const hasChanges = (changes.staged.length + changes.unstaged.length + (changes.untracked || []).length) > 0;
                            const nameEl = nodeContainer.querySelector('.node-name');

                            if (nameEl) {
                                if (hasChanges) {
                                    nameEl.style.color = 'var(--accent-red)';
                                } else if (!hasRemotes) {
                                    nameEl.style.color = '#e3b341'; // Light yellow for offline/local-only
                                } else {
                                    nameEl.style.color = ''; // Reset to default (white) for online/clean
                                }
                            }
                        }
                    } catch (e) {}
                })();
            }
        }

        if (fragment.children.length === 0) {
            elements.repoTree.innerHTML = `<div style="padding:20px; color:var(--text-muted); text-align:center;">No matches for "${filter}"</div>`;
        } else {
            // Save scroll position
            const scrollPos = elements.repoTree.scrollTop;

            elements.repoTree.innerHTML = '';
            elements.repoTree.appendChild(fragment);

            // Only restore normal tree expansions if NOT searching
            if (!search) {
                await restoreAllExpansions();

                // Keep active project visible if requested, otherwise restore scroll
                if (activeRepo) {
                    const repoPath = activeRepo.path.replace(/\\/g, '/').toLowerCase();
                    const repoRoot = Array.from(elements.repoTree.querySelectorAll('.repo-root')).find(el =>
                        el.dataset.path.replace(/\\/g, '/').toLowerCase() === repoPath
                    );
                    if (repoRoot) repoRoot.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                } else {
                    elements.repoTree.scrollTop = scrollPos;
                }
            }

            updateTreeSelectionUI();
        }
    } catch (fatal) {
        console.error('FATAL TREE RENDER ERROR:', fatal);
    } finally {
        isRendering = false;
    }
}

function createTreeNode(name, fullPath, isDirectory, depth, repo) {
    const container = document.createElement('div');
    container.id = 'node-' + Math.random().toString(36).substr(2, 9);
    const item = document.createElement('div');
    const normPath = fullPath.replace(/\\/g, '/').toLowerCase();
    let isChanged = false;
    if (repo && repo.changedFiles) {
        if (!isDirectory) {
            isChanged = repo.changedFiles.includes(normPath);
        } else {
            const normPathWithSlash = normPath.endsWith('/') ? normPath : normPath + '/';
            isChanged = repo.changedFiles.some(f => f.startsWith(normPathWithSlash));
        }
    }
    item.className = `tree-node ${depth === 0 ? 'repo-root' : ''} ${isDirectory ? 'is-directory' : 'is-file'} ${isChanged ? 'changed-file' : ''}`;
    item.style.paddingLeft = '8px';
    if (selectedNodes.has(fullPath)) item.classList.add('active');
    const ext = name.split('.').pop().toLowerCase();
    const fileClass = !isDirectory ? `file-type-${ext.replace(/[^a-z0-9]/g, '-')}` : '';
    item.innerHTML = `<span class="chevron">${isDirectory ? '▸' : ''}</span><span class="node-name ${fileClass}">${name}</span>`;
    item.dataset.path = fullPath;
    item.dataset.isDirectory = isDirectory;
    item.oncontextmenu = async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedNodes.has(fullPath)) { selectedNodes.clear(); selectedNodes.add(fullPath); updateTreeSelectionUI(); }

        const selection = Array.from(selectedNodes);
        const repoPaths = selection.filter(p => repositories.some(r => r.path.replace(/\\/g, '/').toLowerCase() === p.replace(/\\/g, '/').toLowerCase()));
        const filePaths = selection.filter(p => !repoPaths.includes(p));

        let isTracked = true;
        const isRepoRoot = repositories.some(r => r.path.replace(/\\/g, '/').toLowerCase() === fullPath.replace(/\\/g, '/').toLowerCase());
        let isSubtreeMapped = false;

        if (!isRepoRoot && repo) {
            const relPath = fullPath.substring(repo.path.length).replace(/^[\\\/]/, '').replace(/\\/g, '/');
            try {
                isTracked = await window.electronAPI.gitIsTracked(repo.path, relPath);

                // Check if this folder is a mapped subtree
                const mappings = await getRepoSubtreeMappings(repo.path);
                isSubtreeMapped = mappings.some(m => m.prefix === relPath);
            } catch (err) { isTracked = false; }
        }

        window.electronAPI.showContextMenu({
            paths: selection,
            repoPaths,
            filePaths,
            repoPath: repo.path,
            isTracked,
            hideIgnoredFiles,
            isRepoRoot,
            isDirectory,
            isSubtreeMapped
        });
    };
    item.onclick = (e) => {
        e.stopPropagation();

        if (e.shiftKey && lastSelectedPath) {
            const nodes = Array.from(document.querySelectorAll('.tree-node'));
            const lastIdx = nodes.findIndex(n => n.dataset.path === lastSelectedPath);
            const currIdx = nodes.findIndex(n => n.dataset.path === fullPath);

            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);
                if (!e.ctrlKey) selectedNodes.clear();
                for (let i = start; i <= end; i++) {
                    selectedNodes.add(nodes[i].dataset.path);
                }
                updateTreeSelectionUI();
                return;
            }
        }

        lastSelectedPath = fullPath;

        if (e.ctrlKey) { if (selectedNodes.has(fullPath)) selectedNodes.delete(fullPath); else selectedNodes.add(fullPath); updateTreeSelectionUI(); return; }
        selectedNodes.clear(); selectedNodes.add(fullPath); updateTreeSelectionUI();
        if (isDirectory) { if (depth === 0) selectRepo(repo, false); toggleFolder(container, fullPath, depth, repo); }
        else openFileInEditor(fullPath);
    };
    if (isDirectory) {
        item.ondragover = (e) => { e.preventDefault(); item.style.backgroundColor = 'var(--hover-bg)'; };
        item.ondragleave = () => item.style.backgroundColor = '';
        item.ondrop = (e) => {
            e.preventDefault(); item.style.backgroundColor = '';
            handleFileDrop(e.dataTransfer.getData('text/plain'), fullPath, container, depth, e.dataTransfer.getData('source-container-id'));
        };
    } else {
        item.draggable = true;
        item.ondragstart = (e) => {
            // If the dragged item is part of the selection, drag all selected items
            // Otherwise, just drag the single item
            const paths = selectedNodes.has(fullPath) ? Array.from(selectedNodes) : [fullPath];
            e.dataTransfer.setData('text/plain', JSON.stringify(paths));
            e.dataTransfer.setData('source-container-id', container.id);
        };
    }
    container.appendChild(item); return container;
}

async function toggleFolder(container, dirPath, depth, repo) {
    const item = container.querySelector('.tree-node');
    const chevron = item.querySelector('.chevron');
    const existing = container.querySelector('.children-container');
    const normPath = dirPath.replace(/\\/g, '/').toLowerCase();

    if (existing) {
        existing.remove();
        if (chevron) chevron.textContent = '▸';
        expandedNodes.delete(normPath);
        return;
    }

    if (chevron) chevron.textContent = '▾';
    expandedNodes.add(normPath);

    try {
        const children = await window.electronAPI.listDirectory(dirPath, !hideIgnoredFiles);
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children-container';
        for (const child of children) {
            childrenContainer.appendChild(await createTreeNode(child.name, child.path, child.isDirectory, depth + 1, repo));
        }
        container.appendChild(childrenContainer);
    } catch (e) { logToConsole(e.message, 'error'); }
}

async function restoreAllExpansions() {
    const rootNodes = Array.from(elements.repoTree.querySelectorAll(':scope > div'));
    const tasks = rootNodes.map(root => {
        const node = root.querySelector('.tree-node');
        if (!node) return Promise.resolve();
        const repoPath = node.dataset.path;
        const repo = repositories.find(r => r.path === repoPath);
        return restoreExpansionRecursive(root, 0, repo);
    });
    await Promise.all(tasks);
}

async function restoreExpansionRecursive(container, depth, repo) {
    const node = container.querySelector('.tree-node');
    if (!node) return;
    const path = node.dataset.path.replace(/\\/g, '/').toLowerCase();

    if (expandedNodes.has(path)) {
        if (!container.querySelector('.children-container')) {
            await toggleFolder(container, node.dataset.path, depth, repo);
        }

        const childrenContainer = container.querySelector('.children-container');
        if (childrenContainer) {
            const children = Array.from(childrenContainer.querySelectorAll(':scope > div'));
            const tasks = children.map(child => restoreExpansionRecursive(child, depth + 1, repo));
            await Promise.all(tasks);
        }
    }
}

async function showDashboard(forceRefresh = true) {
    setActiveNavItem(elements.navHome);
    elements.dashboardView.style.display = 'flex';
    elements.dashboardView.scrollTop = 0;

    // If not a force refresh and we already have content, just filter the UI
    if (!forceRefresh && elements.dashboardGrid.children.length > 0) {
        filterDashboardUI();
        updateDashboardSummary(null); // Just update active state in summary
        return;
    }

    elements.dashboardGrid.innerHTML = ''; // Clear and start fresh

    if (elements.dashboardBulkPullBtn) elements.dashboardBulkPullBtn.classList.remove('highlight-pull');

    let stats = { total: repositories.length, attention: 0, sync: 0, local: 0, unborn: 0 };
    let unbornList = [];

    // Setup Progress Bar
    const totalRepos = repositories.length;
    let loadedCount = 0;
    if (totalRepos > 0) {
        elements.dashboardProgressContainer.style.display = 'block';
        elements.dashboardProgressBar.style.width = '0%';
        elements.dashboardProgressBar.style.opacity = '1';
    }

    const updateProgressBar = () => {
        loadedCount++;
        const percent = Math.min(100, (loadedCount / totalRepos) * 100);
        elements.dashboardProgressBar.style.width = `${percent}%`;

        if (loadedCount >= totalRepos) {
            setTimeout(() => {
                elements.dashboardProgressBar.style.opacity = '0';
                setTimeout(() => {
                    elements.dashboardProgressContainer.style.display = 'none';
                }, 500);
            }, 500);
        }
    };

    // Fetch unborn folder list from root directory (Non-blocking)
    (async () => {
        if (settings.rootRepoDir) {
            try {
                const wsStats = await window.electronAPI.getWorkspaceStats(settings.rootRepoDir);
                unbornList = wsStats.unborn || [];
                stats.unborn = unbornList.length;

                // Render Unborn Folders as virtual cards
                unbornList.forEach(folder => {
                    const card = createUnbornCard(folder);
                    card.dataset.isUnborn = 'true';
                    elements.dashboardGrid.appendChild(card);
                });

                updateDashboardSummary(stats);
                filterDashboardUI(); // Apply filter after unborns added
            } catch (e) {}
        }
    })();

    const dashboardRepos = [...repositories];

    // 1. Instant Rendering of Repo Cards
    dashboardRepos.forEach(repo => {
        const card = document.createElement('div');
        card.className = 'dashboard-card';
        card.dataset.repoPath = repo.path;

        card.innerHTML = `
            <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="card-title" style="font-weight:600; color:var(--accent-blue); font-size:15px;">${repo.name}</div>
            </div>
            <div class="card-branch" style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">Loading status...</div>
            <div style="padding: 20px; text-align: center; opacity: 0.5;">
                <div class="spinner-mini"></div>
            </div>
        `;

        elements.dashboardGrid.appendChild(card);

        // 2. Background Hydration (Staggered to prevent rate limiting/login flood)
        const index = dashboardRepos.indexOf(repo);
        setTimeout(async () => {
            try {
                const exists = await window.electronAPI.pathExists(repo.path);
                if (!exists) {
                    card.innerHTML = `<div class="card-header"><span class="card-title">${repo.name}</span></div><p style="color:var(--accent-red); padding:10px;">Directory Missing</p>`;
                    return;
                }

                const status = await window.electronAPI.gitQuickStatus(repo.path);

                const isLocal = status.isLocal;
                const needsSync = (status.ahead || 0) > 0 || (status.behind || 0) > 0;
                const hasChanges = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0) + (status.staged || 0) > 0;

                if (isLocal) stats.local++;
                if (hasChanges) stats.attention++;
                if (needsSync) stats.sync++;

                // Tag the card for filtering
                card.dataset.hasChanges = hasChanges;
                card.dataset.needsSync = needsSync;
                card.dataset.isLocal = isLocal;
                card.dataset.isUnborn = 'false';

                card.className = `dashboard-card ${hasChanges || needsSync ? 'has-changes' : 'is-clean'}`;
                card.onclick = () => selectRepo(repo, true);
                card.innerHTML = `
                    <div class="card-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                        <div style="flex:1; min-width:0;">
                            <div class="card-title" style="font-weight:600; color:var(--accent-blue); font-size:15px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-bottom: 2px;">${repo.name}</div>
                            <div class="card-branch" style="font-size:11px; color:var(--text-muted); display: flex; align-items: center; gap: 4px;">
                                branch: ${status.current || 'unknown'}
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                            <div style="font-size: 8px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; opacity: 0.6;">
                                ${isLocal ? 'LOCAL' : 'REMOTE'}
                            </div>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:8px; flex:1;">
                        <div class="stat-row" style="display:flex; justify-content:space-between; align-items: center; font-size:12px;">
                            <span style="color:var(--text-muted);">Uncommitted Changes</span>
                            <span style="font-weight:600; color:${hasChanges ? 'var(--accent-red)' : 'var(--text-muted)'}">${(status.modified || 0) + (status.not_added || 0)}</span>
                        </div>
                        <div class="stat-row" style="display:flex; justify-content:space-between; align-items: center; font-size:12px;">
                            <span style="color:var(--text-muted);">Sync Status</span>
                            <span style="font-weight:600; color:${needsSync ? '#e3b341' : 'var(--text-muted)'}">↑ ${status.ahead || 0}  ↓ ${status.behind || 0}</span>
                        </div>
                    </div>

                    <div class="quick-actions" style="display:flex; gap:6px; margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color);">
                        <button class="button quick-btn pull-btn" title="Pull" style="flex:1; padding:4px; font-size:11px;">PULL</button>
                        <button class="button quick-btn restore-btn" title="Wipe all changes to HEAD" style="flex:1; padding:4px; font-size:11px; color:var(--accent-red); border-color:var(--accent-red);">RESTORE</button>
                        <button class="button quick-btn commit-btn" title="Quick Commit (Stages all)" style="flex:1; padding:4px; font-size:11px;">COMMIT</button>
                        <button class="button quick-btn button-primary push-btn" title="Push" style="flex:1; padding:4px; font-size:11px;">PUSH</button>
                    </div>`;

                const cardPullBtn = card.querySelector('.pull-btn');
                const cardPushBtn = card.querySelector('.push-btn');
                const cardCommitBtn = card.querySelector('.commit-btn');
                if (cardPullBtn) {
                    cardPullBtn.onclick = (e) => { e.stopPropagation(); handlePull(repo); };
                }
                if (cardPushBtn) {
                    cardPushBtn.onclick = (e) => { e.stopPropagation(); handlePush(repo); };
                }
                if (cardCommitBtn) {
                    cardCommitBtn.onclick = (e) => { e.stopPropagation(); handleQuickCommit(repo); };
                }

                if ((status.behind || 0) > 0) {
                    cardPullBtn.classList.add('highlight-pull');
                    if (elements.dashboardBulkPullBtn) elements.dashboardBulkPullBtn.classList.add('highlight-pull');
                }

                cardPullBtn.onclick = (e) => {
                    e.stopPropagation();
                    activeRepo = repo;
                    quickGitAction('pull');
                };

                card.querySelector('.commit-btn').onclick = (e) => {
                    e.stopPropagation();
                    handleDashboardCommit(repo);
                };

                card.querySelector('.push-btn').onclick = (e) => {
                    e.stopPropagation();
                    handleDashboardPush(repo);
                };

                card.querySelector('.restore-btn').onclick = (e) => {
                    e.stopPropagation();
                    handleDashboardRestore(repo);
                };

                updateDashboardSummary(stats);
                updateStatusFeed(stats);
                updateProgressBar();
                filterDashboardUI(); // Re-apply filter as results come in

                // Keep Tree View in sync with Dashboard findings (Status dots/colors)
                updateTreeHighlights(repo.path);
            } catch (e) {
                console.error(`Error hydrating dashboard card for ${repo.name}:`, e);
                updateProgressBar();
            }
        }, index * 20); // 20ms stagger between each repo check
    });

    if (dashboardRepos.length === 0 && unbornList.length === 0) {
        elements.dashboardGrid.innerHTML = `<div style="padding:40px; color:var(--text-muted); text-align:center; width:100%;">No projects found. Use the sidebar to add some.</div>`;
    }

    updateDashboardSummary(stats);
}

function filterDashboardUI() {
    const cards = Array.from(elements.dashboardGrid.children);
    cards.forEach(card => {
        const hasChanges = card.dataset.hasChanges === 'true';
        const needsSync = card.dataset.needsSync === 'true';
        const isLocal = card.dataset.isLocal === 'true';
        const isUnborn = card.dataset.isUnborn === 'true';

        let show = false;
        if (currentDashboardFilter === 'all') show = true;
        else if (currentDashboardFilter === 'attention' && hasChanges) show = true;
        else if (currentDashboardFilter === 'sync' && needsSync) show = true;
        else if (currentDashboardFilter === 'local' && isLocal) show = true;
        else if (currentDashboardFilter === 'unborn' && isUnborn) show = true;

        card.style.display = show ? 'flex' : 'none';
    });
}

function createUnbornCard(folder) {
    const card = document.createElement('div');
    card.className = 'dashboard-card has-changes';
    card.style.borderTopColor = 'var(--accent-blue)';

    const isRepo = folder.reason.toLowerCase().includes('commits');
    const btnText = isRepo ? 'DETAILS' : 'INIT GIT';

    card.innerHTML = `
        <div class="card-header">
            <span class="card-title">${folder.name}</span>
            <span class="card-branch" style="color:var(--accent-blue);">UNBORN</span>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:12px;">${folder.reason}</div>
        <div style="text-align:right;">
            <button class="button button-primary" style="font-size:10px; width:100%;">${btnText}</button>
        </div>
    `;

    const btn = card.querySelector('button');
    btn.onclick = async (e) => {
        e.stopPropagation();
        if (isRepo) {
            addRepository({ name: folder.name, path: folder.path }, false, false);
            const repo = repositories.find(r => r.path.replace(/\\/g, '/').toLowerCase() === folder.path.replace(/\\/g, '/').toLowerCase());
            if (repo) selectRepo(repo);
        } else {
            btn.disabled = true;
            btn.textContent = 'INIT...';
            const res = await window.electronAPI.gitInit(folder.path);
            if (res.success) { showDashboard(); }
            else { btn.disabled = false; btn.textContent = 'RETRY'; }
        }
    };
    return card;
}

async function showThemeEditor() {
    setActiveNavItem(null);
    elements.themeEditorView.style.display = 'flex';

    // Intelligence: If the current theme is in the old massive format, offer to clean it
    let currentIni = settings.obsidianIni || DEFAULT_THEME_INI;
    if (currentIni.includes('[Common Base]') || currentIni.length > 5000) {
        const confirm = await showConfirm("Your current theme is in the old complex format. Would you like to migrate it to the new clean format?", "Theme Migration");
        if (confirm) {
            currentIni = migrateOldIniToNew(currentIni);
            settings.obsidianIni = currentIni;
            window.electronAPI.saveSettings(settings);
        }
    }

    const initOrUpdate = () => {
        if (!themeEditor && typeof monaco !== 'undefined') {
            const currentTheme = parseObsidianIni(currentIni);
            const initialFont = (currentTheme.fontFamily && !currentTheme.fontFamily.includes(','))
                ? `"${currentTheme.fontFamily}", Cascadia Code, Cascadia Mono, Consolas, monospace`
                : (currentTheme.fontFamily || 'Cascadia Code, Cascadia Mono, Consolas, monospace');

            themeEditor = monaco.editor.create(elements.themeMonacoContainer, {
                value: currentIni,
                language: 'green-latern',
                theme: 'obsidian',
                automaticLayout: true,
                bracketPairColorization: { enabled: true },
                minimap: { enabled: false },
                fontFamily: initialFont,
                fontWeight: currentTheme.fontWeight || 'normal',
                fontLigatures: true,
                fontSize: 13,
                tabFocusMode: false
            });

            themeEditor.onDidChangeModelContent(() => {
                if (isSyncingTheme) return;
                const val = themeEditor.getValue();
                renderThemeVisualControls(val, true);
                applyObsidianTheme(val); // Live preview
            });
        } else if (themeEditor) {
            themeEditor.setValue(currentIni);
            themeEditor.layout();
        }

        renderThemeVisualControls(currentIni);
        loadThemePresets(); // Load saved presets
    };

    setTimeout(initOrUpdate, 50);
}

let isSyncingTheme = false;

function renderThemeVisualControls(ini, fromEditor = false) {
    const container = elements.themeVisualControls;
    if (!container) return;

    // Defined set of supported keys to keep things clean
    const supported = {
        'theme': ['Background', 'Foreground', 'LineNumbers', 'Selection', 'Cursor'],
        'syntax': ['Integer', 'String', 'Comment', 'Keyword', 'Operator', 'Identifier', 'Preprocessor', 'Tag', 'Attribute', 'Bracket1', 'Bracket2', 'Bracket3']
    };

    // Unified Fallbacks for UI display
    const fallbacks = {
        'Background': '#121314', 'Foreground': '#d4d4d4', 'LineNumbers': '#858585', 'Selection': '#264f78', 'Cursor': '#569cd6',
        'Comment': '#6a9955', 'String': '#ce9178', 'Integer': '#b5cea8', 'Keyword': '#569cd6', 'Operator': '#d4d4d4', 'Identifier': '#9cdcfe',
        'Preprocessor': '#c586c0', 'Tag': '#569cd6', 'Attribute': '#9cdcfe', 'Bracket1': '#ffd700', 'Bracket2': '#da70d6', 'Bracket3': '#179fff'
    };

    // Parse INI
    const lines = ini.split('\n');
    const data = { 'theme': {}, 'syntax': {} };
    let currentSection = null;

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            currentSection = trimmed.substring(1, trimmed.length - 1).toLowerCase();
        } else if (currentSection && trimmed.includes('=') && !trimmed.startsWith(';') && !trimmed.startsWith('#')) {
            const eqIdx = trimmed.indexOf('=');
            const key = trimmed.substring(0, eqIdx).trim();
            const val = trimmed.substring(eqIdx + 1).trim();
            const lowerKey = key.toLowerCase();

            // Normalize case for matching
            const match = (supported[currentSection] || []).find(k => k.toLowerCase() === lowerKey);
            if (match && val.startsWith('#')) {
                data[currentSection][match] = val;
            }
        }
    });

    if (fromEditor && container.querySelectorAll('input:focus').length > 0) return;

    const dynamicContainer = elements.themeDynamicControls;
    if (!dynamicContainer) return;
    dynamicContainer.innerHTML = '';

    const themeData = parseObsidianIni(ini);
    const fontVal = themeData.fontFamily;
    const weightVal = themeData.fontWeight;
    const ligaturesEnabled = themeData.fontLigatures;

    const supportedFonts = [
        'Cascadia Code',
        'Cascadia Mono',
        'JetBrains Mono',
        'Consolas',
        'Courier New',
        'Lucida Console',
        'Fira Code',
        'Source Code Pro'
    ];

    const fontSection = document.createElement('div');
    fontSection.className = 'settings-section';
    fontSection.style.marginBottom = '20px';

    // Cache availability for this render to ensure consistency between labels and status
    const availabilityMap = {};
    supportedFonts.forEach(f => availabilityMap[f] = checkFontAvailability(f));

    const optionsHtml = supportedFonts.map(f => {
        const isAvailable = availabilityMap[f];
        const label = isAvailable ? f : `${f} (Not Installed)`;
        const style = isAvailable ? '' : 'opacity: 0.6;';
        // Case-insensitive check for selection
        const isSelected = fontVal.trim().toLowerCase() === f.toLowerCase();
        return `<option value="${f}" ${isSelected ? 'selected' : ''} style="${style} font-family: '${f}', monospace;">${label}</option>`;
    }).join('');

    fontSection.innerHTML = `
        <h3 style="margin-bottom: 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent-blue);">Workspace Font</h3>
        <select id="theme-font-select" class="settings-input" style="width: 100%;">
            ${optionsHtml}
            <option value="custom" ${!supportedFonts.some(f => fontVal.includes(f)) ? 'selected' : ''}>-- Custom Font --</option>
        </select>
        <div id="font-status-msg" style="font-size: 10px; margin-top: 6px; display: none;"></div>
        <input type="text" id="theme-font-custom" class="settings-input" style="width: 100%; margin-top: 8px; display: ${supportedFonts.some(f => fontVal.includes(f)) ? 'none' : 'block'};" value="${fontVal}" placeholder="Enter font name...">

        <div style="margin-top: 12px; display: flex; gap: 16px;">
            <div style="flex: 1;">
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Weight</label>
                <select id="theme-weight-select" class="settings-input" style="width: 100%;">
                    <option value="300" ${weightVal === '300' || weightVal === 'light' ? 'selected' : ''}>Light (300)</option>
                    <option value="normal" ${weightVal === 'normal' || weightVal === '400' ? 'selected' : ''}>Normal (400)</option>
                    <option value="500" ${weightVal === '500' || weightVal === 'medium' ? 'selected' : ''}>Medium (500)</option>
                    <option value="600" ${weightVal === '600' || weightVal === 'semibold' ? 'selected' : ''}>Semi-Bold (600)</option>
                    <option value="bold" ${weightVal === 'bold' || weightVal === '700' ? 'selected' : ''}>Bold (700)</option>
                </select>
            </div>
        </div>
    `;

    const fontSelect = fontSection.querySelector('#theme-font-select');
    const weightSelect = fontSection.querySelector('#theme-weight-select');
    const fontCustom = fontSection.querySelector('#theme-font-custom');
    const fontStatus = fontSection.querySelector('#font-status-msg');

    const updateFontStatus = (fontName) => {
        if (fontName === 'custom') {
            fontStatus.style.display = 'none';
            return;
        }
        const available = checkFontAvailability(fontName);
        if (!available) {
            fontStatus.textContent = '⚠️ This font is not installed on your system. It will fallback to Cascadia Mono or Consolas.';
            fontStatus.style.color = 'var(--accent-red)';
            fontStatus.style.display = 'block';
        } else {
            fontStatus.textContent = '✓ Font detected and active.';
            fontStatus.style.color = 'var(--accent-green)';
            fontStatus.style.display = 'block';
            // If the UI was showing "Not Installed" but now it's active, force a refresh of the labels
            if (availabilityMap[fontName] === false) {
                renderThemeVisualControls(ini);
            }
            setTimeout(() => { fontStatus.style.display = 'none'; }, 3000);
        }
    };

    // Initial check
    if (supportedFonts.includes(fontVal)) updateFontStatus(fontVal);

    fontSelect.onchange = (e) => {
        updateFontStatus(e.target.value);
        if (e.target.value === 'custom') {
            fontCustom.style.display = 'block';
            fontCustom.focus();
        } else {
            fontCustom.style.display = 'none';
            updateIniFromGui('Theme', 'Font', e.target.value, false);
        }
    };

    fontCustom.oninput = (e) => {
        updateIniFromGui('Theme', 'Font', e.target.value, false);
    };

    weightSelect.onchange = (e) => {
        updateIniFromGui('Theme', 'FontWeight', e.target.value, false);
    };

    fontCustom.onchange = (e) => {
        updateIniFromGui('Theme', 'Font', e.target.value, false);
    };

    dynamicContainer.appendChild(fontSection);

    // 2. Add Color Controls
    Object.keys(supported).forEach(sectionId => {
        const sectionName = sectionId === 'theme' ? 'UI Elements' : 'Syntax Colors';
        const sectionEl = document.createElement('div');
        sectionEl.className = 'settings-section';
        sectionEl.style.marginBottom = '20px';
        sectionEl.innerHTML = `<h3 style="margin-bottom: 12px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--accent-blue);">${sectionName}</h3>`;

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '12px';

        supported[sectionId].forEach(key => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.flexDirection = 'column';
            row.style.gap = '4px';

            const label = document.createElement('label');
            label.style.fontSize = '11px';
            label.style.color = 'var(--text-muted)';
            label.textContent = key;

            const input = document.createElement('input');
            input.type = 'color';
            input.value = data[sectionId][key] || fallbacks[key] || '#cccccc';
            input.style.width = '100%';
            input.style.height = '28px';
            input.style.padding = '0';
            input.style.border = '1px solid var(--border-color)';
            input.style.borderRadius = '4px';
            input.style.background = 'transparent';
            input.style.cursor = 'pointer';

            input.oninput = () => {
                isSyncingTheme = true;
                const newVal = input.value.toUpperCase();
                data[sectionId][key] = newVal;

                // Update Monaco
                const currentVal = themeEditor.getValue();
                const lines = currentVal.split('\n');
                let inSection = false;

                const updatedLines = [];
                const targetKey = key.toLowerCase();
                const secHeader = `[${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}]`;

                for (let l of lines) {
                    const t = l.trim();
                    if (t === secHeader) { inSection = true; updatedLines.push(l); continue; }
                    else if (t.startsWith('[') && t.endsWith(']')) { inSection = false; updatedLines.push(l); continue; }

                    if (inSection) {
                        const currentLower = t.toLowerCase();
                        // If setting Integer, purge legacy Number/Value lines
                        if (key === 'Integer' && (currentLower.startsWith('number=') || currentLower.startsWith('value='))) {
                            continue;
                        }
                        if (currentLower.startsWith(targetKey + '=')) {
                            updatedLines.push(`${key}=${newVal}`);
                            continue;
                        }
                    }
                    updatedLines.push(l);
                }

                const finalIni = updatedLines.join('\n');
                themeEditor.setValue(finalIni);
                applyObsidianTheme(finalIni);
                isSyncingTheme = false;
            };

            row.appendChild(label);
            row.appendChild(input);
            grid.appendChild(row);
        });

        sectionEl.appendChild(grid);
        dynamicContainer.appendChild(sectionEl);
    });

    // Add extra space at the bottom to ensure color pickers don't get cut off by screen edges
    const spacer = document.createElement('div');
    spacer.style.height = '100px';
    dynamicContainer.appendChild(spacer);
}

function updateIniFromGui(section, key, value, isColor = true) {
    if (!themeEditor) return;
    isSyncingTheme = true;
    let content = themeEditor.getValue();
    const lines = content.split('\n');
    let inSection = false;
    let found = false;

    const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.toLowerCase() === `[${section.toLowerCase()}]`) {
            inSection = true;
            return line;
        }
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            inSection = false;
            return line;
        }
        if (inSection && trimmed.toLowerCase().startsWith(key.toLowerCase() + '=')) {
            found = true;
            return `${line.split('=')[0]}=${value}`;
        }
        return line;
    });

    if (!found) {
        // Find the section again and append the new key
        let finalLines = [];
        let sectionFound = false;
        for (let i = 0; i < newLines.length; i++) {
            finalLines.push(newLines[i]);
            if (newLines[i].trim().toLowerCase() === `[${section.toLowerCase()}]`) {
                finalLines.push(`${key}=${value}`);
                sectionFound = true;
            }
        }
        if (!sectionFound) {
            finalLines.push(`[${section}]`);
            finalLines.push(`${key}=${value}`);
        }
        themeEditor.setValue(finalLines.join('\n'));
    } else {
        themeEditor.setValue(newLines.join('\n'));
    }

    applyObsidianTheme(themeEditor.getValue());
    isSyncingTheme = false;
}

function migrateOldIniToNew(oldIni) {
    const lines = oldIni.split('\n');
    const sections = {};
    let currentSection = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) continue;
        const sMatch = line.match(/^\[([^\]]+)\]/);
        if (sMatch) {
            currentSection = sMatch[1];
            sections[currentSection] = {};
            continue;
        }
        if (currentSection) {
            const eqIdx = line.indexOf('=');
            if (eqIdx !== -1) {
                const key = line.substring(0, eqIdx).trim();
                const value = line.substring(eqIdx + 1).trim();
                sections[currentSection][key] = value;
            }
        }
    }

    const getVal = (sec, key) => (sections[sec] || {})[key] || (sections['Common Base'] || {})[key] || '';
    const getFore = (style) => (style.match(/fore:(#[0-9a-fA-F]{3,6})/) || [null, ''])[1];
    const getBack = (style) => (style.match(/back:(#[0-9a-fA-F]{3,6})/) || [null, ''])[1];

    let bg = getBack(getVal('Common Base', 'Default Style')) || '#121314';
    if (bg === '#000000' || bg === '#000') bg = '#121314';

    return `[Theme]
; Essential Workspace Styling
Font=${getVal('Common Base', 'Default Style').match(/font:([^;]+)/)?.[1] || 'Cascadia Mono'}
Background=${bg}
Foreground=${getFore(getVal('Common Base', 'Default Style')) || '#d4d4d4'}
LineNumbers=${getFore(getVal('Common Base', 'Margins and Line Numbers')) || '#858585'}
Selection=${getBack(getVal('Common Base', 'Selected Text (Colors)')) || '#264f78'}
Cursor=${getFore(getVal('Common Base', 'Caret (Color, Size 1-3)')) || '#569cd6'}

[Syntax]
; Code Element Highlighting
Comment=${getFore(getVal('JavaScript', 'Comment')) || '#6a9955'}
String=${getFore(getVal('JavaScript', 'String')) || '#ce9178'}
Integer=${getFore(getVal('JavaScript', 'Number')) || '#b5cea8'}
Keyword=${getFore(getVal('JavaScript', 'Keyword')) || '#569cd6'}
Operator=${getFore(getVal('JavaScript', 'Operator')) || '#d4d4d4'}
Identifier=${getFore(getVal('JavaScript', 'Identifier')) || '#9cdcfe'}
Preprocessor=${getFore(getVal('JavaScript', 'Preprocessor')) || '#c586c0'}
Tag=${getFore(getVal('XML Document', 'XML Tag')) || '#569cd6'}
Attribute=${getFore(getVal('XML Document', 'XML Attribute')) || '#9cdcfe'}
Bracket1=${syntax['bracket1'] || '#ffd700'}
Bracket2=${syntax['bracket2'] || '#da70d6'}
Bracket3=${syntax['bracket3'] || '#179fff'}`;
}

async function saveThemeFromEditor() {
    if (!themeEditor) return;
    const newIni = themeEditor.getValue();
    settings.obsidianIni = newIni;
    try {
        await window.electronAPI.saveSettings(settings);
        applyObsidianTheme(newIni);
        logToConsole('Theme updated and applied.', 'success');
    } catch (e) { logToConsole(e.message, 'error'); }
}

async function exportThemeToIni() {
    if (!themeEditor) return;
    const content = themeEditor.getValue();
    const filePath = await window.electronAPI.showSaveDialog({
        title: 'Export Theme as .ini',
        defaultPath: 'my_theme.ini',
        filters: [{ name: 'INI Files', extensions: ['ini'] }]
    });

    if (filePath) {
        try {
            await window.electronAPI.writeFile(filePath, content);
            logToConsole(`Theme exported to ${filePath}`, 'success');
        } catch (e) { logToConsole(`Export failed: ${e.message}`, 'error'); }
    }
}

async function importThemeFromIni() {
    const filePath = await window.electronAPI.showOpenDialog({
        title: 'Import Theme from .ini',
        filters: [{ name: 'INI Files', extensions: ['ini'] }]
    });

    if (filePath) {
        try {
            const result = await window.electronAPI.readFile(filePath);
            const content = result.content;
            if (themeEditor) {
                themeEditor.setValue(content);
                applyObsidianTheme(content);
                logToConsole(`Theme imported from ${filePath}`, 'success');
            }
        } catch (e) { logToConsole(`Import failed: ${e.message}`, 'error'); }
    }
}

async function showGitConfigView() {
    elements.gitConfigView.style.display = 'flex';
    elements.gitConfigSections.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">Loading configuration...</div>';

    try {
        const res = await window.electronAPI.getGitConfig();
        if (res.success) {
            elements.gitConfigPathDisplay.textContent = res.path;
            renderGitConfig(res.content);
        } else {
            elements.gitConfigSections.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">Error: ${res.error}</div>`;
        }
    } catch (e) {
        elements.gitConfigSections.innerHTML = `<div style="color: var(--accent-red); padding: 20px;">System Error: ${e.message}</div>`;
    }
}

const RECOMMENDED_GIT_CONFIG = {
    'user': { 'name': '', 'email': '' },
    'core': { 'pager': 'less', 'autocrlf': 'false' },
    'http': {
        'postBuffer': '524288000',
        'version': 'HTTP/1.1',
        'lowSpeedLimit': '0',
        'lowSpeedTime': '999999'
    },
    'init': { 'defaultBranch': 'main' },
    'pull': { 'rebase': 'true' },
    'color': { 'ui': 'auto' },
    'diff': { 'algorithm': 'histogram', 'colorMoved': 'default' },
    'merge': { 'conflictStyle': 'zdiff3' },
    'credential': { 'helper': 'manager' },
    'push': { 'autoSetupRemote': 'true', 'default': 'simple' }
};

function renderGitConfig(content) {
    const container = elements.gitConfigSections;
    container.innerHTML = '';

    // Simple INI Parser
    const lines = content.split(/\r?\n/);
    let currentSection = null;
    let sections = {};

    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) return;

        const sectionMatch = line.match(/^\[(.+)\]$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].trim();
            if (!sections[currentSection]) sections[currentSection] = [];
            return;
        }

        if (currentSection) {
            const eqIdx = line.indexOf('=');
            if (eqIdx !== -1) {
                const key = line.substring(0, eqIdx).trim();
                const val = line.substring(eqIdx + 1).trim();
                sections[currentSection].push({ key, val });
            }
        }
    });

    // 1. Render Recommendations (Smart Header)
    const missingRecs = [];
    Object.keys(RECOMMENDED_GIT_CONFIG).forEach(s => {
        Object.keys(RECOMMENDED_GIT_CONFIG[s]).forEach(k => {
            const existing = sections[s] ? sections[s].find(e => e.key === k) : null;
            if (!existing) {
                missingRecs.push({ section: s, key: k, val: RECOMMENDED_GIT_CONFIG[s][k] });
            }
        });
    });

    if (missingRecs.length > 0) {
        const recDiv = document.createElement('div');
        recDiv.style.padding = '16px';
        recDiv.style.background = 'rgba(31, 111, 235, 0.1)';
        recDiv.style.border = '1px solid var(--accent-blue)';
        recDiv.style.borderRadius = '8px';
        recDiv.style.marginBottom = '24px';

        recDiv.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; color:#fff; font-size:13px;">💡 Recommended Settings Missing</h4>
                <button id="add-all-recommended" class="button button-blue" style="font-size:10px;">Apply All Recommendations</button>
            </div>
            <div id="recommended-items-list" style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;"></div>
        `;

        const recList = recDiv.querySelector('#recommended-items-list');
        missingRecs.forEach(r => {
            const item = document.createElement('div');
            item.style.fontSize = '11px';
            item.style.color = 'var(--text-muted)';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.justifyContent = 'space-between';
            item.style.padding = '4px 8px';
            item.style.background = 'rgba(255,255,255,0.02)';
            item.style.borderRadius = '4px';

            item.innerHTML = `
                <span>[${r.section}] <b>${r.key}</b> = ${r.val || '(blank)'}</span>
                <button class="button" style="height:20px; font-size:9px; padding:0 6px;">+ Add</button>
            `;

            item.querySelector('button').onclick = () => {
                addConfigEntry(r.section, r.key, r.val);
                item.remove();
                if (recList.children.length === 0) recDiv.remove();
            };

            recList.appendChild(item);
        });

        recDiv.querySelector('#add-all-recommended').onclick = () => {
            missingRecs.forEach(r => addConfigEntry(r.section, r.key, r.val));
            recDiv.remove();
        };

        container.appendChild(recDiv);
    }

    // 2. Render Existing Sections
    Object.keys(sections).forEach(sectionName => {
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'config-section';
        sectionDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; font-size: 14px; color: var(--accent-blue);">[${sectionName}]</h3>
            </div>
            <div class="config-entries"></div>
        `;

        const entriesDiv = sectionDiv.querySelector('.config-entries');
        sections[sectionName].forEach(entry => {
            const row = document.createElement('div');
            row.className = 'config-entry-row';
            row.innerHTML = `
                <div class="config-key">${entry.key}</div>
                <input type="text" class="settings-input config-val-input" value="${entry.val}" data-section="${sectionName}" data-key="${entry.key}">
                <button class="button button-danger remove-entry-btn" style="height: 28px; width: 28px; padding: 0;">×</button>
            `;

            row.querySelector('.remove-entry-btn').onclick = () => {
                row.remove();
                if (entriesDiv.children.length === 0) sectionDiv.remove();
            };

            entriesDiv.appendChild(row);
        });

        container.appendChild(sectionDiv);
    });

    function addConfigEntry(s, k, v) {
        let sectionDiv = Array.from(container.querySelectorAll('.config-section')).find(d => d.querySelector('h3').textContent === `[${s}]`);
        if (!sectionDiv) {
            sectionDiv = document.createElement('div');
            sectionDiv.className = 'config-section';
            sectionDiv.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 14px; color: var(--accent-blue);">[${s}]</h3>
                </div>
                <div class="config-entries"></div>
            `;
            container.appendChild(sectionDiv);
        }
        const entriesDiv = sectionDiv.querySelector('.config-entries');
        const row = document.createElement('div');
        row.className = 'config-entry-row';
        row.innerHTML = `
            <div class="config-key">${k}</div>
            <input type="text" class="settings-input config-val-input" value="${v}" data-section="${s}" data-key="${k}">
            <button class="button button-danger remove-entry-btn" style="height: 28px; width: 28px; padding: 0;">×</button>
        `;
        row.querySelector('.remove-entry-btn').onclick = () => {
            row.remove();
            if (entriesDiv.children.length === 0) sectionDiv.remove();
        };
        entriesDiv.appendChild(row);
    }

    // Save Logic
    elements.saveGitConfigBtn.onclick = async () => {
        const inputs = Array.from(container.querySelectorAll('.config-val-input'));
        let newConfig = {};

        inputs.forEach(input => {
            const s = input.dataset.section;
            const k = input.dataset.key;
            const v = input.value;
            if (!newConfig[s]) newConfig[s] = [];
            newConfig[s].push(`${k} = ${v}`);
        });

        let output = '';
        Object.keys(newConfig).forEach(s => {
            output += `[${s}]\n`;
            newConfig[s].forEach(line => {
                output += `\t${line}\n`;
            });
            output += '\n';
        });

        setTaskState(true);
        try {
            const res = await window.electronAPI.saveGitConfig(output);
            if (res.success) {
                logToConsole('Global .gitconfig updated successfully.', 'success');
                showAlert('Global Git configuration has been saved.', 'Success');
            } else {
                showError(`Failed to save: ${res.error}`, 'Error');
            }
        } catch (e) {
            showError(`System Error: ${e.message}`, 'Error');
        } finally {
            setTaskState(false);
        }
    };

    // Add Entry Logic
    elements.addConfigEntryBtn.onclick = () => {
        elements.newConfigEntryModal.style.display = 'flex';
        elements.newConfigSection.value = '';
        elements.newConfigKey.value = '';
        elements.newConfigVal.value = '';
        elements.newConfigSection.focus();
    };

    elements.newConfigCancel.onclick = () => elements.newConfigEntryModal.style.display = 'none';
    elements.newConfigConfirm.onclick = () => {
        const s = elements.newConfigSection.value.trim();
        const k = elements.newConfigKey.value.trim();
        const v = elements.newConfigVal.value.trim();
        if (!s || !k) return showAlert('Section and Key are required.', 'Missing Info');
        addConfigEntry(s, k, v);
        elements.newConfigEntryModal.style.display = 'none';
    };
}

async function checkGitHubTokenLife() {
    if (!settings.githubToken) return;
    try {
        const res = await window.electronAPI.fetchGitHubRepos(settings.githubToken);
        if (res.expiration) {
            updateTokenExpirationUI(res.expiration);
        }
    } catch (e) {
        console.warn('Token life check failed:', e);
    }
}

function updateTokenExpirationUI(expiration) {
    if (!expiration) return;
    tokenExpiration = expiration;
    const date = new Date(expiration);
    const now = new Date();
    const timeRemainingMs = date - now;
    const days = Math.floor(timeRemainingMs / (1000 * 60 * 60 * 24));

    const displayStr = days > 0 ? `${days} days left` : (days === 0 ? 'Expiring today!' : 'Expired!');
    const fullDateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

    // Update Settings UI
    const containerSettings = document.getElementById('token-expiry-container-settings');
    const linkSettings = document.getElementById('token-expiry-link-settings');
    if (containerSettings && linkSettings) {
        containerSettings.style.display = 'block';
        linkSettings.textContent = `${displayStr} (${fullDateStr})`;
        if (days < 7) linkSettings.style.color = 'var(--accent-red)';
        else linkSettings.style.color = 'var(--accent-blue)';
    }

    // Passively Refresh Feed (don't force a full dashboard refresh)
    if (elements.dashboardView.style.display !== 'none') {
        updateStatusFeed();
    }
}

function updateStatusFeed(stats = null) {
    const banner = document.getElementById('status-feed-banner');
    const content = document.getElementById('feed-content-area');
    const actions = document.getElementById('feed-action-area');
    if (!banner || !content) return;

    if (stats) lastKnownStats = stats;
    const currentStats = stats || lastKnownStats;

    // 1. Collect potential messages
    const messages = [];

    // GitHub Token (High Priority)
    if (tokenExpiration) {
        const date = new Date(tokenExpiration);
        const days = Math.floor((date - new Date()) / (1000 * 60 * 60 * 24));
        if (days < 7) {
            messages.push({
                text: `⚠ Warning: GitHub token is expiring in ${days === 0 ? 'less than a day' : days + ' days'}!`,
                color: 'var(--accent-red)',
                action: { label: 'RENEW NOW', url: 'https://github.com/settings/tokens' }
            });
        } else {
            messages.push({
                text: `GitHub connection is healthy. Token expires in ${days} days.`,
                color: 'var(--accent-blue)',
                action: { label: 'UPDATE', url: 'https://github.com/settings/tokens' }
            });
        }
    }

    // Project Statuses (Only if stats provided)
    if (currentStats) {
        if (currentStats.attention > 0) {
            messages.push({
                text: `${currentStats.attention} projects have uncommitted changes that need review.`,
                color: 'var(--accent-red)',
                action: { label: 'VIEW ALL', filter: 'attention' }
            });
        }
        if (currentStats.sync > 0) {
            messages.push({
                text: `${currentStats.sync} projects are out of sync with their origin remotes.`,
                color: '#e3b341',
                action: { label: 'SYNC NOW', filter: 'sync' }
            });
        }
        if (currentStats.local > 0) {
            messages.push({
                text: `You have ${currentStats.local} local-only projects that haven't been published yet.`,
                color: 'var(--accent-green)',
                action: { label: 'PUBLISH', filter: 'local' }
            });
        }

        // Intelligence: Always ensure a "Good News" message if everything is clean/synced
        if (currentStats.attention === 0 && currentStats.sync === 0) {
            messages.push({
                text: "Workspace Status: All tracked projects are clean and synced with remote.",
                color: 'var(--accent-green)'
            });
        }
    }

    // Default if no specific news
    if (messages.length === 0) {
        messages.push({ text: "All projects are clean and synced. Good work!", color: 'var(--text-muted)' });
    }

    // 2. State Management for Feed
    feedMessages = messages;
    if (currentFeedIndex >= feedMessages.length) currentFeedIndex = 0;

    // 3. Display Logic
    banner.style.display = 'flex';

    const showMessage = (idx) => {
        const msg = feedMessages[idx];

        // Transition: Fade out
        content.style.opacity = '0';
        content.style.transform = 'translateY(5px)';

        setTimeout(() => {
            content.textContent = msg.text;
            content.style.color = msg.color || 'var(--text-main)';

            // Render Action
            actions.innerHTML = '';
            if (msg.action) {
                const btn = document.createElement('button');
                btn.className = 'button';
                btn.style.fontSize = '10px';
                btn.style.padding = '2px 8px';
                btn.style.borderColor = msg.color || 'var(--border-color)';
                btn.style.color = msg.color || 'var(--text-main)';
                btn.textContent = msg.action.label;
                btn.onclick = () => {
                    if (msg.action.url) window.electronAPI.openExternal(msg.action.url);
                    if (msg.action.filter) {
                        currentDashboardFilter = msg.action.filter;
                        showDashboard();
                    }
                };
                actions.appendChild(btn);
            }

            // Transition: Fade in
            content.style.opacity = '1';
            content.style.transform = 'translateY(0)';
        }, 300);
    };

    // Initial show
    showMessage(currentFeedIndex);

    // 4. Start Cycling if more than 1 message
    if (feedTimer) clearInterval(feedTimer);
    if (feedMessages.length > 1) {
        feedTimer = setInterval(() => {
            currentFeedIndex = (currentFeedIndex + 1) % feedMessages.length;
            showMessage(currentFeedIndex);
        }, 10000); // 10 seconds per message
    }
}

function updateDashboardSummary(stats) {
    const summary = elements.dashboardSummary;
    summary.style.display = 'flex';
    summary.style.padding = '0';
    summary.style.background = 'transparent';
    summary.style.border = 'none';
    summary.style.gap = '12px';

    // Use cached UI update if stats not provided (just updating active state)
    if (!stats) {
        summary.querySelectorAll('.summary-card').forEach(card => {
            const isActive = currentDashboardFilter === card.dataset.filter;
            card.classList.toggle('active', isActive);
            card.style.borderColor = isActive ? card.dataset.color : 'var(--border-color)';
            const indicator = card.querySelector('.active-indicator');
            if (indicator) indicator.style.display = isActive ? 'block' : 'none';
        });
        return;
    }

    const items = [
        { id: 'all', label: 'Total Projects', value: stats.total, color: 'var(--accent-blue)' },
        { id: 'attention', label: 'Needs Attention', value: stats.attention, color: 'var(--accent-red)' },
        { id: 'sync', label: 'Out of Sync', value: stats.sync, color: '#e3b341' },
        { id: 'local', label: 'Offline Only', value: stats.local, color: 'var(--accent-green)' },
        { id: 'unborn', label: 'Empty Repos', value: stats.unborn, color: '#8b949e' }
    ];

    summary.innerHTML = items.map(item => {
        const isActive = currentDashboardFilter === item.id;
        const hasValue = (item.value !== 0 && item.value !== '0' && item.value !== '0d');
        const valColor = hasValue ? item.color : 'var(--text-muted)';

        return `
            <div class="summary-card ${isActive ? 'active' : ''}" data-filter="${item.id}" data-color="${item.color}"
                 style="flex:1; background:var(--bg-surface); border:1px solid ${isActive ? item.color : 'var(--border-color)'}; border-radius:12px; padding:16px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden; min-width: 120px;">

                <div style="font-size:9px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; white-space: nowrap; margin-bottom: 12px;">${item.label}</div>

                <div style="font-size:24px; font-weight:700; color:${valColor}; line-height:1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">${item.value}</div>

                <div class="active-indicator" style="position:absolute; bottom:0; left:0; right:0; height:3px; background:${item.color}; display: ${isActive ? 'block' : 'none'};"></div>
            </div>
        `;
    }).join('');

    summary.querySelectorAll('.summary-card').forEach(card => {
        card.onclick = () => {
            currentDashboardFilter = card.dataset.filter;
            showDashboard(true);
        };
    });
}

async function showBulkCommitModal() {
    elements.bulkCommitModal.style.display = 'flex';
    elements.bulkCommitMsg.value = '';
    elements.bulkCommitRepoList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Analyzing workspace...</div>';

    // Fetch fresh status for all projects to see who actually has changes
    const projectsWithChanges = [];
    for (const repo of repositories) {
        try {
            const status = await window.electronAPI.gitStatus(repo.path);
            const hasChanges = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0) > 0;
            if (hasChanges) projectsWithChanges.push({ repo, status });
        } catch(e) {}
    }

    if (projectsWithChanges.length === 0) {
        elements.bulkCommitRepoList.innerHTML = '<div style="color:var(--accent-green); font-size:11px; padding:10px;">Everything is clean! Nothing to commit.</div>';
        elements.bulkCommitConfirm.disabled = true;
    } else {
        elements.bulkCommitConfirm.disabled = false;
        elements.bulkCommitRepoList.innerHTML = projectsWithChanges.map(({ repo, status }) => {
            const total = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0);
            const isBehind = (status.behind || 0) > 0;
            const behindWarning = isBehind ? `<div style="font-size:10px; color:var(--accent-red); font-weight:700;">⚠️ Needs Pull (${status.behind} commits behind)</div>` : '';

            return `
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:rgba(255,255,255,0.02); border-radius:4px; margin-bottom:4px; border: 1px solid ${isBehind ? 'rgba(255, 82, 82, 0.2)' : 'transparent'};">
                    <input type="checkbox" class="bulk-commit-item-cb" value="${repo.path}" data-name="${repo.name}" checked>
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; justify-content:space-between;">
                            <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${repo.name}</div>
                            <div style="font-size:10px; color:var(--text-muted);">${total} changes</div>
                        </div>
                        ${behindWarning}
                    </div>
                </label>
            `;
        }).join('');
    }

    elements.bulkCommitSelectAll.onchange = (e) => {
        elements.bulkCommitRepoList.querySelectorAll('.bulk-commit-item-cb').forEach(cb => cb.checked = e.target.checked);
    };

    elements.bulkCommitCancel.onclick = () => elements.bulkCommitModal.style.display = 'none';
    elements.bulkCommitConfirm.onclick = async () => {
        const selectedCbs = Array.from(elements.bulkCommitRepoList.querySelectorAll('.bulk-commit-item-cb:checked'));
        if (selectedCbs.length === 0) return showAlert('Select at least one project to commit.', 'Selection Required');

        const globalMsg = elements.bulkCommitMsg.value.trim();
        const useAI = elements.bulkCommitAutoMsg.checked;

        if (!globalMsg && !useAI) return showAlert('Please enter a message or enable AI.', 'Missing Info');

        elements.bulkCommitModal.style.display = 'none';
        logToConsole(`🚀 Launching Bulk Commit & Push for ${selectedCbs.length} projects...`, 'info');
        setTaskState(true);

        let successCount = 0;
        let failCount = 0;

        try {
            for (const cb of selectedCbs) {
                const path = cb.value;
                const name = cb.dataset.name;
                try {
                    // 1. Force Stage Everything (git add .)
                    await window.electronAPI.gitStageAll(path);

                    logToConsole(`📦 [${name}]: Processing...`, 'info');

                    let commitMsg = globalMsg;
                    if (useAI) {
                        try {
                            const diff = await window.electronAPI.getFullDiff(path);
                            if (diff) commitMsg = await window.electronAPI.generateCommitMsg(diff);
                        } catch(aiErr) {
                            console.warn(`AI failed for ${name}:`, aiErr);
                        }
                    }

                    // 2. Commit
                    const commitRes = await window.electronAPI.gitCommit(path, commitMsg || 'chore: bulk update');
                    if (commitRes.success) {
                        logToConsole(`   ✅ Committed: ${name}`, 'success');

                        // 3. Push
                        logToConsole(`   ⬆️ Pushing: ${name}...`, 'info');
                        const repo = repositories.find(r => r.path === path);
                        const pushRes = await window.electronAPI.gitPush(path, repo ? repo.gitForce : false);

                        if (pushRes.success) {
                            logToConsole(`   🚀 Pushed: ${name}`, 'success');
                            successCount++;
                        } else {
                            logToConsole(`   ❌ Push Failed [${name}]: ${pushRes.output}`, 'error');
                            failCount++;
                        }
                    } else {
                        logToConsole(`   ❌ Commit Failed [${name}]: ${commitRes.output}`, 'error');
                        failCount++;
                    }
                } catch (repoErr) {
                    logToConsole(`   ⚠️ Fatal Error [${name}]: ${repoErr.message}`, 'error');
                    failCount++;
                }
            }

            logToConsole('🏁 Bulk Sequence Finished.', 'info');
            if (failCount > 0) {
                showAlert(`Bulk update finished with ${failCount} errors.`, 'Sync Completed with Errors');
            } else if (successCount > 0) {
                showAlert(`Successfully updated ${successCount} projects!`, 'Bulk Update Success');
                await smartRefreshTree();
                showDashboard();
            } else {
                showAlert(`All projects are already up to date.`, 'Nothing to Update');
            }
        } finally {
            setTaskState(false);
        }
    };
}

async function handleBulkRestore() {
    elements.bulkRestoreModal.style.display = 'flex';
    elements.bulkRestoreRepoList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Analyzing workspace...</div>';

    // Fetch fresh status for all projects to see who actually has changes
    const projectsWithChanges = [];
    for (const repo of repositories) {
        try {
            const status = await window.electronAPI.gitStatus(repo.path);
            const hasChanges = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0) > 0;
            if (hasChanges) projectsWithChanges.push({ repo, status });
        } catch(e) {}
    }

    if (projectsWithChanges.length === 0) {
        elements.bulkRestoreRepoList.innerHTML = '<div style="color:var(--accent-green); font-size:11px; padding:10px;">All projects are already clean.</div>';
        elements.bulkRestoreConfirm.disabled = true;
    } else {
        elements.bulkRestoreConfirm.disabled = false;
        elements.bulkRestoreRepoList.innerHTML = projectsWithChanges.map(({ repo, status }) => {
            const total = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0);
            return `
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:rgba(255,255,255,0.02); border-radius:4px; margin-bottom:4px;">
                    <input type="checkbox" class="bulk-restore-item-cb" value="${repo.path}" data-name="${repo.name}" checked>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${repo.name}</div>
                        <div style="font-size:10px; color:var(--accent-red);">${total} dirty files will be wiped</div>
                    </div>
                </label>
            `;
        }).join('');
    }

    elements.bulkRestoreSelectAll.onchange = (e) => {
        elements.bulkRestoreRepoList.querySelectorAll('.bulk-restore-item-cb').forEach(cb => cb.checked = e.target.checked);
    };

    elements.bulkRestoreCancel.onclick = () => elements.bulkRestoreModal.style.display = 'none';
    elements.bulkRestoreConfirm.onclick = async () => {
        const selectedCbs = Array.from(elements.bulkRestoreRepoList.querySelectorAll('.bulk-restore-item-cb:checked'));
        if (selectedCbs.length === 0) return showAlert('Select at least one project to restore.', 'Selection Required');

        if (!(await showConfirm(`Are you sure you want to wipe all local changes in ${selectedCbs.length} projects?\n\nThis cannot be undone.`, "Confirm Bulk Restore"))) return;

        elements.bulkRestoreModal.style.display = 'none';
        logToConsole(`Launching Bulk Restore sequence for ${selectedCbs.length} projects...`, 'info');
        setTaskState(true);

        let success = 0; let fail = 0;
        try {
            for (const cb of selectedCbs) {
                const path = cb.value;
                const name = cb.dataset.name;
                try {
                    const res = await window.electronAPI.gitRestoreToHead(path);
                    if (res.success) {
                        logToConsole(`   ✅ Restored: ${name}`, 'success');
                        success++;
                    } else {
                        logToConsole(`   ❌ Restore Failed [${name}]: ${res.output}`, 'error');
                        fail++;
                    }
                } catch (e) {
                    logToConsole(`   ⚠️ Error [${name}]: ${e.message}`, 'error');
                    fail++;
                }
            }
            logToConsole(`Bulk Restore Complete. Success: ${success}, Failed: ${fail}`, 'info');
            await smartRefreshTree();
            showDashboard();
        } finally { setTaskState(false); }
    };
}

async function handleBulkFetch() {
    if (repositories.length === 0) return showAlert('No projects found in workspace.', 'Action Blocked');

    elements.bulkFetchModal.style.display = 'flex';
    elements.bulkFetchRepoList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Listing repositories...</div>';
    elements.bulkFetchConfirm.disabled = false;

    elements.bulkFetchRepoList.innerHTML = repositories.map((repo) => {
        return `
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:rgba(255,255,255,0.02); border-radius:4px; margin-bottom:4px; border: 1px solid transparent;">
                <input type="checkbox" class="bulk-fetch-item-cb" value="${repo.path}" data-name="${repo.name}" checked>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${repo.name}</div>
                    <div style="font-size:10px; color:var(--text-muted);">${repo.path}</div>
                </div>
            </label>
        `;
    }).join('');

    elements.bulkFetchSelectAll.checked = true;
    elements.bulkFetchSelectAll.onchange = (e) => {
        elements.bulkFetchRepoList.querySelectorAll('.bulk-fetch-item-cb').forEach(cb => cb.checked = e.target.checked);
    };

    elements.bulkFetchCancel.onclick = () => elements.bulkFetchModal.style.display = 'none';

    elements.bulkFetchConfirm.onclick = async () => {
        const selectedCbs = Array.from(elements.bulkFetchRepoList.querySelectorAll('.bulk-fetch-item-cb:checked'));
        if (selectedCbs.length === 0) return showAlert('Select at least one project to fetch.', 'Selection Required');

        elements.bulkFetchModal.style.display = 'none';
        logToConsole(`🚀 Launching Bulk Fetch sequence for ${selectedCbs.length} projects...`, 'info');
        setTaskState(true);

        let success = 0; let fail = 0;
        try {
            for (const cb of selectedCbs) {
                const path = cb.value;
                const name = cb.dataset.name;
                try {
                    logToConsole(`   📡 Fetching: ${name}...`, 'info');
                    const res = await window.electronAPI.gitFetch(path);
                    if (res.success) {
                        logToConsole(`   ✅ Fetched: ${name}`, 'success');
                        success++;
                    } else {
                        logToConsole(`   ❌ Fetch Failed [${name}]: ${res.output}`, 'error');
                        fail++;
                    }
                } catch (e) {
                    logToConsole(`   ⚠️ Error [${name}]: ${e.message}`, 'error');
                    fail++;
                }
            }
            logToConsole(`Bulk Fetch Complete. Success: ${success}, Failed: ${fail}`, 'info');
            showDashboard();
        } finally { setTaskState(false); }
    };
}

async function handleBulkPull() {
    if (repositories.length === 0) return showAlert('No projects found in workspace.', 'Action Blocked');

    elements.bulkPullModal.style.display = 'flex';
    elements.bulkPullRepoList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Analyzing remote status...</div>';
    elements.bulkPullConfirm.disabled = true;

    // Fetch status for all repos in parallel to see who is behind
    const repoStatuses = await Promise.all(repositories.map(async (repo) => {
        try {
            const status = await window.electronAPI.gitStatus(repo.path);
            return { repo, status, isBehind: (status.behind || 0) > 0 };
        } catch (e) {
            return { repo, status: null, isBehind: false };
        }
    }));

    elements.bulkPullConfirm.disabled = false;
    elements.bulkPullRepoList.innerHTML = repoStatuses.map(({ repo, status, isBehind }) => {
        const behindCount = status ? (status.behind || 0) : 0;
        const subtext = isBehind ? `<span style="color:#e3b341;">↓ ${behindCount} incoming commits</span>` : `<span style="color:var(--text-muted);">Up to date</span>`;

        return `
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:rgba(255,255,255,0.02); border-radius:4px; margin-bottom:4px; border: 1px solid ${isBehind ? 'rgba(227, 179, 65, 0.2)' : 'transparent'};">
                <input type="checkbox" class="bulk-pull-item-cb" value="${repo.path}" data-name="${repo.name}" checked>
                <div style="flex:1; min-width:0;">
                    <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${repo.name}</div>
                    <div style="font-size:10px;">${subtext}</div>
                </div>
            </label>
        `;
    }).join('');

    elements.bulkPullSelectAll.checked = true;
    elements.bulkPullSelectAll.onchange = (e) => {
        elements.bulkPullRepoList.querySelectorAll('.bulk-pull-item-cb').forEach(cb => cb.checked = e.target.checked);
    };

    elements.bulkPullCancel.onclick = () => elements.bulkPullModal.style.display = 'none';

    elements.bulkPullConfirm.onclick = async () => {
        const selectedCbs = Array.from(elements.bulkPullRepoList.querySelectorAll('.bulk-pull-item-cb:checked'));
        if (selectedCbs.length === 0) return showAlert('Select at least one project to pull.', 'Selection Required');

        elements.bulkPullModal.style.display = 'none';
        logToConsole(`🚀 Launching Bulk Pull sequence for ${selectedCbs.length} projects...`, 'info');
        setTaskState(true);

        let success = 0; let fail = 0;
        try {
            for (const cb of selectedCbs) {
                const path = cb.value;
                const name = cb.dataset.name;
                try {
                    logToConsole(`   📥 Pulling: ${name}...`, 'info');
                    const repo = repositories.find(r => r.path === path);
                    const res = await window.electronAPI.gitPull(path, repo ? repo.gitForce : false);
                    if (res.success) {
                        logToConsole(`   ✅ Pulled: ${name}`, 'success');
                        success++;
                    } else {
                        logToConsole(`   ❌ Pull Failed [${name}]: ${res.output}`, 'error');
                        fail++;
                    }
                } catch (e) {
                    logToConsole(`   ⚠️ Error [${name}]: ${e.message}`, 'error');
                    fail++;
                }
            }
            logToConsole(`Bulk Pull Complete. Success: ${success}, Failed: ${fail}`, 'info');
            await smartRefreshTree();
            showDashboard();
        } finally { setTaskState(false); }
    };
}

async function handleProtocolConverter() {
    if (repositories.length === 0) return showAlert('No projects found in workspace.', 'Action Blocked');

    elements.protocolModal.style.display = 'flex';
    elements.protocolRepoList.innerHTML = '<div style="color:var(--text-muted); font-size:11px; padding:10px;">Analyzing remotes...</div>';
    elements.protocolConfirm.disabled = true;

    // Fetch remotes for all repos
    const repoRemotes = await Promise.all(repositories.map(async (repo) => {
        try {
            const remotes = await window.electronAPI.getRemotes(repo.path);
            const origin = remotes.find(r => r.name === 'origin') || remotes[0];
            return { repo, remote: origin };
        } catch (e) {
            return { repo, remote: null };
        }
    }));

    elements.protocolConfirm.disabled = false;
    elements.protocolRepoList.innerHTML = repoRemotes.map(({ repo, remote }) => {
        if (!remote) return '';

        const isSSH = remote.url.startsWith('git@') || remote.url.startsWith('ssh://');
        const isHTTPS = remote.url.startsWith('https://');
        const type = isSSH ? 'SSH' : isHTTPS ? 'HTTPS' : 'Other';

        return `
            <div class="protocol-item" style="display:flex; flex-direction:column; gap:6px; padding:10px; background:rgba(255,255,255,0.02); border-radius:6px; border: 1px solid var(--border-color);">
                <div style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" class="protocol-item-cb" value="${repo.path}" data-name="${repo.name}" data-url="${remote.url}" checked>
                    <div style="flex:1; font-weight:600; font-size:13px;">${repo.name}</div>
                    <div style="font-size:10px; padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.05); color:var(--text-muted);">${type}</div>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-left:24px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${remote.url}</div>
                <div style="margin-left:24px; margin-top:4px; display:flex; gap:15px; align-items:center;">
                    <span style="font-size:10px; font-weight:700; color:var(--accent-blue);">TARGET:</span>
                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                        <input type="radio" name="protocol-${repo.name}" value="ssh" ${!isSSH ? 'checked' : ''} style="margin:0;"> SSH
                    </label>
                    <label style="display:flex; align-items:center; gap:4px; font-size:11px; cursor:pointer;">
                        <input type="radio" name="protocol-${repo.name}" value="https" ${isSSH ? 'checked' : ''} style="margin:0;"> HTTPS
                    </label>
                </div>
            </div>
        `;
    }).join('');

    elements.protocolSelectAll.checked = true;
    elements.protocolSelectAll.onchange = (e) => {
        elements.protocolRepoList.querySelectorAll('.protocol-item-cb').forEach(cb => cb.checked = e.target.checked);
    };

    elements.protocolSelectSSH.onclick = () => {
        elements.protocolRepoList.querySelectorAll('input[type="radio"][value="ssh"]').forEach(r => r.checked = true);
    };

    elements.protocolSelectHTTPS.onclick = () => {
        elements.protocolRepoList.querySelectorAll('input[type="radio"][value="https"]').forEach(r => r.checked = true);
    };

    elements.protocolCancel.onclick = () => elements.protocolModal.style.display = 'none';

    elements.protocolConfirm.onclick = async () => {
        const checkedBoxes = Array.from(elements.protocolRepoList.querySelectorAll('.protocol-item-cb:checked'));

        if (checkedBoxes.length === 0) return showAlert('Select at least one project to convert.', 'Selection Required');

        elements.protocolModal.style.display = 'none';
        logToConsole(`🚀 Starting Protocol Conversion for ${checkedBoxes.length} projects...`, 'info');
        setTaskState(true);

        // SSH Fingerprint Trust Check
        if (elements.protocolTrustGithub.checked) {
            logToConsole('🔍 Checking GitHub SSH fingerprint trust...', 'info');
            try {
                const trustRes = await window.electronAPI.ensureGithubSSHTrust();
                if (trustRes.success) {
                    if (trustRes.alreadyTrusted) {
                        logToConsole('   ✅ GitHub fingerprint is already trusted.', 'info');
                    } else {
                        logToConsole('   ✅ Successfully added GitHub fingerprint to known_hosts.', 'success');
                    }
                } else {
                    logToConsole(`   ⚠️ SSH Trust Warning: ${trustRes.error}`, 'error');
                }
            } catch (err) {
                logToConsole(`   ⚠️ SSH Trust System Error: ${err.message}`, 'error');
            }
        }

        let success = 0; let fail = 0;

        for (const cb of checkedBoxes) {
            const path = cb.value;
            const name = cb.dataset.name;
            const oldUrl = cb.dataset.url;

            const targetRadio = elements.protocolRepoList.querySelector(`input[name="protocol-${name}"]:checked`);
            if (!targetRadio) continue;

            const targetType = targetRadio.value;
            const newUrl = convertGitUrl(oldUrl, targetType);

            if (newUrl === oldUrl) {
                logToConsole(`   ⏩ Skipping: ${name} (already using ${targetType.toUpperCase()})`, 'info');
                continue;
            }

            try {
                logToConsole(`   🔄 Converting ${name} to ${targetType.toUpperCase()}...`, 'info');
                const res = await window.electronAPI.setRemoteUrl(path, 'origin', newUrl);
                if (res.success) {
                    logToConsole(`   ✅ Success: ${name}`, 'success');
                    success++;
                } else {
                    logToConsole(`   ❌ Failed [${name}]: ${res.output}`, 'error');
                    fail++;
                }
            } catch (e) {
                logToConsole(`   ⚠️ Error [${name}]: ${e.message}`, 'error');
                fail++;
            }
        }

        logToConsole(`Protocol Conversion Complete. Success: ${success}, Failed: ${fail}`, 'info');
        setTaskState(false);
        showDashboard();
    };
}

function convertGitUrl(url, targetType) {
    if (targetType === 'ssh') {
        if (url.startsWith('https://')) {
            return url.replace(/^https:\/\/([^\/]+)\/(.+)$/, 'git@$1:$2');
        }
    } else if (targetType === 'https') {
        if (url.startsWith('git@')) {
            return url.replace(/^git@([^:]+):(.+)$/, 'https://$1/$2');
        } else if (url.startsWith('ssh://git@')) {
             return url.replace(/^ssh:\/\/git@([^\/]+)\/(.+)$/, 'https://$1/$2');
        }
    }
    return url;
}

async function showUnbornFoldersModal(unbornList) {
    elements.unbornFoldersModal.style.display = 'flex';
    elements.unbornFoldersList.innerHTML = '';

    if (unbornList.length === 0) {
        elements.unbornFoldersList.innerHTML = '<p style="padding:20px; color:var(--text-muted); text-align:center;">All folders have Git repositories.</p>';
        return;
    }

    unbornList.forEach(folder => {
        const item = document.createElement('div');
        item.style.padding = '12px';
        item.style.borderBottom = '1px solid var(--border-color)';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';

        const isRepo = folder.reason.toLowerCase().includes('commits');
        const btnText = isRepo ? 'PROJECT DETAILS' : 'INITIALIZE GIT';

        item.innerHTML = `
            <div>
                <div style="font-weight: 600; color: #fff;">${folder.name}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${folder.reason}</div>
            </div>
            <button class="button ${isRepo ? 'button-secondary' : 'button-primary'}" style="font-size: 10px; padding: 4px 8px;">${btnText}</button>
        `;

        const actionBtn = item.querySelector('button');
        actionBtn.onclick = async () => {
            if (isRepo) {
                // Navigate to details
                elements.unbornFoldersModal.style.display = 'none';

                // Ensure it's in our tracked repositories list first
                addRepository({ name: folder.name, path: folder.path }, false, false);

                // Find it in our state (it will be there now)
                const repo = repositories.find(r => r.path.replace(/\\/g, '/').toLowerCase() === folder.path.replace(/\\/g, '/').toLowerCase());
                if (repo) selectRepo(repo);
            } else {
                // Initialize
                actionBtn.disabled = true;
                actionBtn.textContent = 'INIT...';
                logToConsole(`Initializing Git in ${folder.path}...`, 'info');
                try {
                    const res = await window.electronAPI.gitInit(folder.path);
                    if (res.success) {
                        logToConsole(`Initialized ${folder.name}`, 'success');
                        showDashboard();
                        const wsStats = await window.electronAPI.getWorkspaceStats(settings.rootRepoDir);
                        showUnbornFoldersModal(wsStats.unborn || []);
                    } else {
                        logToConsole(`Failed to init ${folder.name}: ${res.output}`, 'error');
                        actionBtn.disabled = false;
                        actionBtn.textContent = 'RETRY';
                    }
                } catch (e) {
                    logToConsole(`Init Error: ${e.message}`, 'error');
                }
            }
        };

        elements.unbornFoldersList.appendChild(item);
    });
}

async function selectRepo(repo, fromDashboard = false) {
    activeRepo = repo;
    setActiveNavItem(null);
    elements.repoView.style.display = 'flex';

    // Default Layout: Commit message visible, Diffs hidden
    elements.messageView.style.display = 'flex';
    elements.diffView.style.display = 'none';
    elements.statusView.style.display = 'none';

    document.getElementById('active-repo-name').textContent = repo.name;

    if (window.terminal) window.terminal.sendCommand(`cd "${repo.path}"`);

    // Hydrate project-specific toggles
    if (elements.gitForceToggle) elements.gitForceToggle.checked = !!repo.gitForce;
    if (elements.gitAutoFetchToggle) elements.gitAutoFetchToggle.checked = !!repo.gitAutoFetch;

    // Auto-Fetch Feature
    if (repo.gitAutoFetch) {
        logToConsole(`Auto-fetching for ${repo.name}...`, 'info');
        window.electronAPI.gitFetch(repo.path).then(() => {
            logToConsole(`Auto-fetch complete for ${repo.name}`, 'success');
            refreshActiveRepoUI(true); // Silent refresh to update ahead/behind
        }).catch(err => {
            logToConsole(`Auto-fetch failed: ${err.message}`, 'error');
        });
    }

    await refreshActiveRepoUI();
    if (fromDashboard) { selectedNodes.clear(); selectedNodes.add(repo.path); updateTreeSelectionUI(); scrollToRepoInTree(repo.path); }
}

async function refreshActiveRepoUI(silent = false) {
    if (!activeRepo) return;
    const title = document.getElementById('active-repo-name');
    const originalText = activeRepo.name;

    // Visual feedback: Syncing state
    if (title && !silent) title.innerHTML = `${originalText} <span style="font-size: 10px; color: var(--accent-blue); font-weight: normal; margin-left: 8px; opacity: 0.8;">(SYNCING...)</span>`;

    try {
        const status = await window.electronAPI.gitStatus(activeRepo.path);
        const changes = await window.electronAPI.getDetailedChanges(activeRepo.path);

        // Update state
        activeRepo.changedFiles = [...changes.staged, ...changes.unstaged, ...changes.untracked].map(f => `${activeRepo.path.replace(/\\/g, '/')}/${f.replace(/\\/g, '/')}`.toLowerCase());

        // Update individual UI components
        await updateRepoStatus(status);
        await updateBranchSelector(activeRepo.path);
        await updateRemoteSelector(activeRepo.path);

        // Smart GitHub Button Visibility
        const remotes = await window.electronAPI.getRemotes(activeRepo.path);
        const hasAnyRemote = remotes.length > 0;
        const githubRemote = remotes.find(r => r.url.toLowerCase().includes('github.com'));
        const hasGitHub = !!githubRemote;

        if (elements.publishGitHubBtn) elements.publishGitHubBtn.style.display = hasAnyRemote ? 'none' : 'inline-flex';

        if (elements.githubVisibilityBtn) {
            elements.githubVisibilityBtn.style.display = 'inline-flex';
            elements.githubVisibilityBtn.classList.remove('button-danger', 'button-blue', 'btn-loading');
            elements.githubVisibilityBtn.onclick = null;
            elements.githubVisibilityBtn.disabled = false;
            elements.githubVisibilityBtn.style.opacity = '1';

            if (hasGitHub) {
                if (!settings.githubToken) {
                    elements.githubVisibilityBtn.textContent = 'Auth Required';
                    elements.githubVisibilityBtn.title = 'Set GitHub PAT in Settings to toggle visibility';
                    elements.githubVisibilityBtn.classList.add('button-danger');
                    elements.githubVisibilityBtn.onclick = () => showSettings();
                } else {
                    elements.githubVisibilityBtn.onclick = () => handleToggleGitHubVisibility();

                    const cached = repoVisibilityCache.get(activeRepo.path);

                    if (!cached) {
                        elements.githubVisibilityBtn.classList.add('btn-loading');
                        elements.githubVisibilityBtn.textContent = 'Checking...';
                        try {
                            const url = githubRemote.url.replace(/\.git\/?$/, '');
                            let match = url.match(/github\.com[\/|:]([^\/]+)\/([^\/]+)$/);
                            if (match) {
                                const owner = match[1];
                                const repo = match[2];
                                const res = await window.electronAPI.getGitHubRepo(settings.githubToken, owner, repo);
                                const isPrivate = res.repo.private;

                                // Update Cache
                                repoVisibilityCache.set(activeRepo.path, { owner, repo, isPrivate });

                                elements.githubVisibilityBtn.textContent = isPrivate ? 'Private' : 'Public';
                                elements.githubVisibilityBtn.title = isPrivate ? 'Click to make Public' : 'Click to make Private';
                                if (isPrivate) elements.githubVisibilityBtn.classList.add('button');
                                else elements.githubVisibilityBtn.classList.add('button-blue');

                                elements.githubVisibilityBtn.dataset.owner = owner;
                                elements.githubVisibilityBtn.dataset.repo = repo;
                                elements.githubVisibilityBtn.dataset.isPrivate = isPrivate;
                            } else {
                                elements.githubVisibilityBtn.textContent = 'Invalid URL';
                                elements.githubVisibilityBtn.disabled = true;
                            }
                        } catch (err) {
                            console.warn('Failed to fetch GitHub repo status:', err);
                            elements.githubVisibilityBtn.textContent = 'Offline';
                            elements.githubVisibilityBtn.title = err.message;
                        } finally {
                            elements.githubVisibilityBtn.classList.remove('btn-loading');
                        }
                    } else {
                        // Use session-cached state
                        const { owner, repo, isPrivate } = cached;
                        elements.githubVisibilityBtn.textContent = isPrivate ? 'Private' : 'Public';
                        elements.githubVisibilityBtn.title = isPrivate ? 'Click to make Public' : 'Click to make Private';
                        if (isPrivate) elements.githubVisibilityBtn.classList.add('button');
                        else elements.githubVisibilityBtn.classList.add('button-blue');

                        elements.githubVisibilityBtn.dataset.owner = owner;
                        elements.githubVisibilityBtn.dataset.repo = repo;
                        elements.githubVisibilityBtn.dataset.isPrivate = isPrivate;
                    }
                }
            } else {
                elements.githubVisibilityBtn.textContent = 'Local Only';
                elements.githubVisibilityBtn.title = 'This project is not linked to GitHub';
                elements.githubVisibilityBtn.disabled = true;
                elements.githubVisibilityBtn.style.opacity = '0.5';
            }
        }

        renderChangesList(activeRepo, changes);
        await updateTreeHighlights(activeRepo.path);
    } catch (e) {
        if (!silent) logToConsole(`Refresh error: ${e.message}`, 'error');
    } finally {
        if (title && !silent) title.textContent = originalText;
        if (elements.editorView.style.display !== 'none') updateEditorButtonStates();
    }
}

function insertMarkdownSnippet(type) {
    if (!monacoEditor) return;
    const selection = monacoEditor.getSelection();
    const model = monacoEditor.getModel();
    if (!model) return;

    let range = selection;
    let snippet = '';

    if (type === 'image') {
        const text = model.getValueInRange(selection) || 'alt text';
        snippet = `![${text}](https://)`;
        monacoEditor.executeEdits('markdown', [{
            range: selection,
            text: snippet,
            forceMoveMarkers: true
        }]);
        // Position cursor inside the parentheses for URL
        const startLine = selection.startLineNumber;
        const startCol = selection.startColumn + text.length + 4; // after ![] (
        monacoEditor.setSelection(new monaco.Selection(startLine, startCol, startLine, startCol));

        const isPreview = elements.editorContainerWrapper.classList.contains('editor-mode-preview');
        if (!isPreview) {
            monacoEditor.focus();
        }
        return;
    }

    // For list and task, we process each line in the selection
    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const edits = [];
    const prefix = type === 'list' ? '- ' : '- [ ] ';

    for (let i = startLine; i <= endLine; i++) {
        const lineText = model.getLineContent(i);
        // If line already starts with the prefix, maybe toggle it off?
        // For now, just prepend it if it doesn't exist, or always prepend.
        // Let's just prepend for simplicity.
        edits.push({
            range: new monaco.Range(i, 1, i, 1),
            text: prefix
        });
    }

    monacoEditor.executeEdits('markdown', edits);

    const isPreview = elements.editorContainerWrapper.classList.contains('editor-mode-preview');
    if (!isPreview) {
        monacoEditor.focus();
    }
}

async function openFileInEditor(filePath) {
    if (!monacoEditor) return;
    try {
        const ext = filePath.split('.').pop().toLowerCase();
        const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg'];

        currentEditingPath = filePath;
        setActiveNavItem(null);
        elements.editorView.style.display = 'flex';
        elements.editorFileName.textContent = filePath.split(/[\\\/]/).pop();

        // RESET UI States (Relying on classes now)
        if (elements.mdViewControls) elements.mdViewControls.style.display = 'none';
        elements.gitignoreScanBtn.style.display = 'none';
        elements.editorSaveBtn.style.display = 'block';

        // Essential: Clear inline display styles so CSS classes can take over
        if (elements.monacoContainer) elements.monacoContainer.style.display = '';
        if (elements.markdownPreview) elements.markdownPreview.style.display = '';
        if (elements.htmlPreview) elements.htmlPreview.style.display = 'none';
        if (elements.imagePreview) elements.imagePreview.style.display = 'none';

        if (elements.editorContainerWrapper) {
            elements.editorContainerWrapper.classList.remove('editor-mode-code', 'editor-mode-split', 'editor-mode-preview', 'editor-mode-standard');
        }

        if (imageExts.includes(ext)) {
            // Handle Image Preview
            const base64 = await window.electronAPI.readFileBase64(filePath);
            const mimeMap = { 'svg': 'image/svg+xml', 'ico': 'image/x-icon', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp' };
            elements.previewImg.src = `data:${mimeMap[ext] || 'image/' + ext};base64,${base64}`;
            elements.imagePreview.style.display = 'flex';
            elements.editorSaveBtn.style.display = 'none'; // Can't save images in text editor
        } else {
            // Handle Text Editor
            const result = await window.electronAPI.readFile(filePath);
            const content = result.content;
            currentFileEncoding = result.encoding;
            originalFileContent = content; // Store for change detection

            const langMap = {
                'js': 'javascript',
                'ts': 'typescript',
                'html': 'html',
                'css': 'css',
                'md': 'markdown',
                'json': 'json',
                'txt': 'plaintext',
                'cs': 'csharp',
                'kt': 'kotlin',
                'py': 'python',
                'xml': 'xml',
                'yaml': 'yaml',
                'yml': 'yaml',
                'php': 'php',
                'ini': 'green-latern',
                'inf': 'green-latern',
                'bat': 'bat',
                'cmd': 'bat',
                'ps1': 'powershell',
                'psm1': 'powershell',
                'psd1': 'powershell'
            };

            const isMarkdown = ext === 'md' || ext === 'markdown' || langMap[ext] === 'markdown';
            const isHTML = ext === 'html' || ext === 'htm';
            const isRenderable = isMarkdown || isHTML;

            if (elements.mdViewControls) elements.mdViewControls.style.display = isRenderable ? 'flex' : 'none';
            elements.gitignoreScanBtn.style.display = (filePath.endsWith('.gitignore')) ? 'block' : 'none';

            // Memory Management: Dispose of the old model if it exists
            const oldModel = monacoEditor.getModel();
            if (oldModel) oldModel.dispose();

            const model = monaco.editor.createModel(content, langMap[ext] || 'plaintext');
            monacoEditor.setModel(model);

            // Intelligence: Now that the content is loaded into the editor, we can safely trigger the preview
            if (isRenderable) {
                setMarkdownViewMode('preview');
            } else {
                setMarkdownViewMode('standard');
            }

            // Intelligence: Track changes to enable/disable buttons
            model.onDidChangeContent(() => {
                const currentContent = monacoEditor.getValue();
                const hasChanges = currentContent !== originalFileContent;
                updateEditorButtonStates(hasChanges);

                // Real-time Markdown/HTML Preview
                if (isRenderable && elements.editorContainerWrapper) {
                    const isShowingPreview = elements.editorContainerWrapper.classList.contains('editor-mode-split') ||
                                           elements.editorContainerWrapper.classList.contains('editor-mode-preview');
                    if (isShowingPreview) {
                        updateMarkdownPreviewContent();
                    }
                }
            });

            // Initial state
            updateEditorButtonStates(false);
            updateEditorFileInfo();

            monacoEditor.layout();
        }
    } catch (e) { logToConsole(e.message, 'error'); }
}

function updateEditorButtonStates(hasChanges) {
    if (hasChanges === undefined && monacoEditor) {
        hasChanges = monacoEditor.getValue() !== originalFileContent;
    }

    const isFileChangedInGit = activeRepo && currentEditingPath &&
                               activeRepo.changedFiles &&
                               activeRepo.changedFiles.includes(currentEditingPath.replace(/\\/g, '/').toLowerCase());

    const canRestore = hasChanges || isFileChangedInGit;

    if (elements.editorSaveBtn) {
        elements.editorSaveBtn.disabled = !hasChanges;
        elements.editorSaveBtn.style.opacity = hasChanges ? '1' : '0.5';
    }
    if (elements.editorRestoreBtn) {
        elements.editorRestoreBtn.disabled = !canRestore;
        elements.editorRestoreBtn.style.opacity = canRestore ? '1' : '0.5';
    }
    if (elements.editorUndoBtn) {
        elements.editorUndoBtn.disabled = !hasChanges;
        elements.editorUndoBtn.style.opacity = hasChanges ? '1' : '0.5';
    }
    if (elements.editorRedoBtn) {
        elements.editorRedoBtn.disabled = !hasChanges;
        elements.editorRedoBtn.style.opacity = hasChanges ? '1' : '0.5';
    }
}

function updateEditorFileInfo() {
    if (!monacoEditor || !elements.editorFileInfo) return;
    const model = monacoEditor.getModel();
    if (!model) return;

    const eol = model.getEOL();
    const eolText = eol === '\r\n' ? 'CRLF' : 'LF';
    elements.editorFileInfo.textContent = `${currentFileEncoding} | ${eolText}`;
}

function applyTextTransformation(type) {
    if (!monacoEditor) return;
    const model = monacoEditor.getModel();
    if (!model) return;

    if (type === 'crlf') {
        model.setEOL(1); // 1 = CRLF, 0 = LF
        logToConsole('Converted line endings to CRLF (\\r\\n)', 'success');
        updateEditorFileInfo();
        updateEditorButtonStates(true);
        return;
    }

    if (type === 'utf8') {
        // Intelligence: We already write as UTF-8, but this ensures the editor model and future saves use it.
        currentFileEncoding = 'UTF-8';
        logToConsole('File will be saved as UTF-8 encoded.', 'success');
        updateEditorFileInfo();
        updateEditorButtonStates(true);
        return;
    }

    const selection = monacoEditor.getSelection();
    if (selection.isEmpty()) {
        logToConsole('No text selected for transformation.', 'warn');
        return;
    }

    const text = model.getValueInRange(selection);
    let newText = '';

    switch (type) {
        case 'uppercase':
            newText = text.toUpperCase();
            break;
        case 'lowercase':
            newText = text.toLowerCase();
            break;
        case 'snake':
            newText = text.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "").replace(/\s+/g, "_");
            break;
        case 'camel':
            newText = text.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase());
            break;
        case 'sort':
            newText = text.split(/\r?\n/).sort((a, b) => a.localeCompare(b)).join('\n');
            break;
    }

    if (newText !== text) {
        monacoEditor.executeEdits('transform', [
            { range: selection, text: newText, forceMoveMarkers: true }
        ]);
        logToConsole(`Applied transformation: ${type}`, 'info');
    }
}

async function saveCurrentFile() {
    if (!currentEditingPath || !monacoEditor) return;
    try {
        const newContent = monacoEditor.getValue();
        await window.electronAPI.writeFile(currentEditingPath, newContent);
        logToConsole('Saved.', 'success');

        // Reset original content to new saved state
        originalFileContent = newContent;
        updateEditorButtonStates(false);

        updateTreeHighlights();
    } catch (e) {
        logToConsole(e.message, 'error');
        showError(e.message, 'Save Failed');
    }
}

function closeEditor() { elements.editorView.style.display = 'none'; if (activeRepo) elements.repoView.style.display = 'flex'; else showDashboard(); }

function logToConsole(msg, type = 'info') {
    if (!elements.consoleOutput) return;
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${timestamp}] ${msg}`;
    elements.consoleOutput.appendChild(entry);
    elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;
}

function updateTreeSelectionUI() { document.querySelectorAll('.tree-node').forEach(n => { if (selectedNodes.has(n.dataset.path)) n.classList.add('active'); else n.classList.remove('active'); }); }

async function updateTreeHighlights(specificRepoPath = null) {
    const allNodes = Array.from(document.querySelectorAll('.tree-node'));

    const normSpecific = specificRepoPath ? specificRepoPath.replace(/\\/g, '/').toLowerCase() : null;
    const targetRepos = normSpecific
        ? repositories.filter(r => r.path.replace(/\\/g, '/').toLowerCase() === normSpecific)
        : repositories;

    for (const repo of targetRepos) {
        try {
            const [changes, remotes] = await Promise.all([
                window.electronAPI.getDetailedChanges(repo.path),
                window.electronAPI.getRemotes(repo.path)
            ]);

            const hasRemotes = remotes.length > 0;
            const normBase = repo.path.replace(/\\/g, '/').toLowerCase();
            const normBaseSlash = normBase.endsWith('/') ? normBase : normBase + '/';
            repo.changedFiles = [...changes.staged, ...changes.unstaged, ...changes.untracked].map(f => `${normBase}/${f.replace(/\\/g, '/')}`.toLowerCase());
            repo.notTrackedFiles = [...(changes.untracked || []), ...(changes.ignored || [])].map(f => `${normBase}/${f.replace(/\\/g, '/')}`.toLowerCase());

            const isRepoChanged = (changes.staged.length + changes.unstaged.length + (changes.untracked || []).length) > 0;

            allNodes.forEach(node => {
                const nodePath = node.dataset.path.replace(/\\/g, '/').toLowerCase();
                const nameEl = node.querySelector('.node-name');

                if (nodePath === normBase) {
                    // Update the root repo node
                    const exists = changes.current !== 'missing';

                    if (!exists) {
                        node.classList.add('changed-file');
                        if (nameEl) {
                            nameEl.style.color = 'var(--accent-red)';
                            if (!nameEl.textContent.includes('(MISSING)')) {
                                nameEl.textContent += ' (MISSING)';
                            }
                        }
                    } else if (isRepoChanged) {
                        node.classList.add('changed-file');
                        if (nameEl) nameEl.style.color = 'var(--accent-red)';
                    } else {
                        node.classList.remove('changed-file');
                        if (nameEl) {
                            nameEl.textContent = repo.name;
                            if (!hasRemotes) {
                                nameEl.style.color = '#e3b341';
                            } else {
                                nameEl.style.color = '';
                            }
                        }
                    }
                } else if (nodePath.startsWith(normBaseSlash)) {
                    // Update children (files/folders inside)
                    const isDir = node.classList.contains('is-directory');

                    // Normalize notTrackedFiles to remove trailing slashes for exact matching
                    const cleanNotTracked = repo.notTrackedFiles.map(f => f.replace(/\/$/, ''));

                    const isDirectlyChanged = repo.changedFiles.includes(nodePath);
                    const containsChangedFile = isDir && repo.changedFiles.some(f => f.startsWith(nodePath + '/'));

                    const isNotTracked = cleanNotTracked.includes(nodePath);
                    // A folder is only considered "untracked" if IT is in the list,
                    // not just because it contains something untracked.

                    if (isDirectlyChanged || containsChangedFile) {
                        node.classList.add('changed-file');
                        if (nameEl) nameEl.style.color = 'var(--accent-red)';
                    } else if (isNotTracked) {
                        node.classList.remove('changed-file');
                        if (nameEl) nameEl.style.color = '#aaaaaa';
                    } else {
                        node.classList.remove('changed-file');
                        if (nameEl) nameEl.style.color = '';
                    }
                }
            });
        } catch (e) {}
    }
    if (elements.editorView.style.display !== 'none') updateEditorButtonStates();
}

async function smartRefreshTree() {
    logToConsole('Syncing tree structure...', 'info');
    const savedSelection = Array.from(selectedNodes);
    await renderTree(elements.repoFilter ? elements.repoFilter.value : '');

    for (const path of savedSelection) {
        try {
            const exists = await window.electronAPI.pathExists(path);
            if (exists) {
                await revealInTree(path);
            }
        } catch (e) {}
    }
}

async function handleContextMenuCommand({ command, paths, path, repoPath }) {
    const targets = paths || [path];
    if (command === 'new-file') handleNewItem('file', targets[0]);
    else if (command === 'new-folder') handleNewItem('folder', targets[0]);
    else if (command === 'execute') window.electronAPI.openPath(targets[0]);
    else if (command === 'open-vscode') targets.forEach(p => window.electronAPI.openVSCode(p));
    else if (command === 'open-android-studio') targets.forEach(p => window.electronAPI.openAndroidStudio(p));
    else if (command === 'open-default') targets.forEach(p => window.electronAPI.openPath(p));
    else if (command === 'reveal-in-explorer') targets.forEach(p => window.electronAPI.revealInExplorer(p));
    else if (command === 'open-editor') openFileInEditor(targets[0]);
    else if (command === 'rename') handleRename(targets[0]);
    else if (command === 'manage-subtrees') {
        const repo = repositories.find(r => targets[0].toLowerCase().startsWith(r.path.toLowerCase()));
        if (repo) activeRepo = repo;
        showSubtreeHubModal();
    }
    else if (command === 'add-subtree') handleAddSubtreeFromTree(targets[0]);
    else if (command === 'apply-patch') showPatchModal(targets[0]);
    else if (command === 'unstage-all') {
        const repo = repositories.find(r => targets[0].replace(/\\/g, '/').toLowerCase() === r.path.replace(/\\/g, '/').toLowerCase());
        if (repo) {
            activeRepo = repo;
            handleUnstageAll();
        }
    }
    else if (command === 'see-changes') showFileDiff(targets[0]);
    else if (command === 'create-readme') handleCreateReadme(targets[0]);
    else if (command === 'generate-gitignore') handleGenerateGitignore(targets[0]);
    else if (command === 'delete') showDeleteModal(targets);
    else if (command === 'stop-tracking') handleStopTracking(targets[0], repoPath);
    else if (command === 'start-tracking') handleStartTracking(targets[0], repoPath);
    else if (command === 'remove') {
        logToConsole(`Context Menu: Removing ${targets.length} items...`, 'info');
        removeRepositories(targets);
    }
}

async function handleCreateReadme(repoPath) {
    const name = repoPath.split(/[\\\/]/).pop();
    const readmePath = `${repoPath}/README.md`.replace(/\\/g, '/');

    try {
        const exists = await window.electronAPI.pathExists(readmePath);
        if (exists) {
            if (!(await showConfirm('README.md already exists. Overwrite?', 'File Exists'))) return;
        }

        const content = `# ${name}`;
        await window.electronAPI.writeFile(readmePath, content);
        logToConsole(`Created README.md for ${name}`, 'success');

        renderTree(elements.repoFilter.value);
        openFileInEditor(readmePath);
    } catch (e) {
        logToConsole(`Failed to create README: ${e.message}`, 'error');
        showError(e.message, 'Create README Failed');
    }
}

async function handleGenerateGitignore(repoPath) {
    const modal = document.getElementById('gitignore-modal');
    const list = document.getElementById('gitignore-list');
    const search = document.getElementById('gitignore-search');
    const confirmBtn = document.getElementById('gitignore-confirm');
    const cancelBtn = document.getElementById('gitignore-cancel');
    const blankBtn = document.getElementById('gitignore-blank');
    const blankConfigBtn = document.getElementById('gitignore-blank-config');

    modal.style.display = 'flex';
    list.innerHTML = '<p style="padding:20px; color:var(--text-muted); text-align:center;">Loading GitHub templates...</p>';
    confirmBtn.disabled = true;
    search.value = '';

    const createBlankFile = async (filename) => {
        const filePath = `${repoPath}/${filename}`.replace(/\\/g, '/');
        const exists = await window.electronAPI.pathExists(filePath);
        if (exists) {
            if (!(await showConfirm(`${filename} already exists. Overwrite with a blank file?`, 'File Exists'))) return;
        }

        modal.style.display = 'none';
        try {
            await window.electronAPI.writeFile(filePath, '');
            logToConsole(`Successfully generated blank ${filename}`, 'success');
            renderTree(elements.repoFilter.value);
            openFileInEditor(filePath);
        } catch (err) {
            logToConsole(`Failed to create blank file: ${err.message}`, 'error');
            showError(err.message, 'File Creation Failed');
        }
    };

    blankBtn.onclick = () => createBlankFile('.gitignore');
    blankConfigBtn.onclick = () => createBlankFile('.gitconfig');



    let templates = [];
    let selectedTemplate = null;

    try {
        templates = await window.electronAPI.fetchGitignoreTemplates();

        const renderList = (filter = '') => {
            list.innerHTML = '';
            const filtered = templates.filter(t => t.toLowerCase().includes(filter.toLowerCase()));

            filtered.forEach(name => {
                const item = document.createElement('div');
                item.className = 'tree-node';
                item.style.padding = '8px 12px';
                item.style.borderBottom = '1px solid var(--border-color)';
                item.textContent = name;

                item.onclick = () => {
                    Array.from(list.children).forEach(el => el.classList.remove('active'));
                    item.classList.add('active');
                    selectedTemplate = name;
                    confirmBtn.disabled = false;
                };

                list.appendChild(item);
            });
        };

        renderList();
        search.oninput = () => renderList(search.value);
        search.focus();

        confirmBtn.onclick = async () => {
            if (!selectedTemplate) return;

            const gitignorePath = `${repoPath}/.gitignore`.replace(/\\/g, '/');
            const exists = await window.electronAPI.pathExists(gitignorePath);
            if (exists) {
                if (!(await showConfirm('A .gitignore already exists. Overwrite with official template?', 'File Exists'))) return;
            }

            modal.style.display = 'none';
            setTaskState(true);
            logToConsole(`Downloading ${selectedTemplate} template...`, 'info');

            try {
                const content = await window.electronAPI.fetchGitignoreContent(selectedTemplate);
                await window.electronAPI.writeFile(gitignorePath, content);
                logToConsole(`Successfully generated official .gitignore for ${selectedTemplate}`, 'success');

                renderTree(elements.repoFilter.value);
                openFileInEditor(gitignorePath);
            } catch (err) {
                logToConsole(`Failed to fetch template: ${err.message}`, 'error');
                showError(err.message, 'Template Fetch Failed');
            } finally {
                setTaskState(false);
            }
        };

    } catch (e) {
        logToConsole(`GitHub API error: ${e.message}`, 'error');
        list.innerHTML = `<p style="padding:20px; color:var(--accent-red); text-align:center;">Error: ${e.message}</p>`;
    }

    cancelBtn.onclick = () => modal.style.display = 'none';
}

async function handleStopTracking(fullPath, providedRepoPath = null) {
    // 1. Determine the repository
    let repo = null;
    if (providedRepoPath) {
        repo = repositories.find(r => r.path === providedRepoPath);
    }

    // Fallback: search by path with normalization
    if (!repo) {
        const normFull = fullPath.replace(/\\/g, '/').toLowerCase();
        repo = repositories.find(r => {
            const normRepo = r.path.replace(/\\/g, '/').toLowerCase();
            return normFull.startsWith(normRepo);
        });
    }

    if (!repo) {
        logToConsole(`Stop Tracking Failed: Could not find repo for ${fullPath}`, 'error');
        showAlert('Could not determine the repository for this item.', 'Error');
        return;
    }

    // 2. Calculate relative path with normalization
    const normFull = fullPath.replace(/\\/g, '/').toLowerCase();
    const normRepo = repo.path.replace(/\\/g, '/').toLowerCase();

    // Ensure we take the relative part from the original path to preserve casing if possible
    // though git usually doesn't care much about casing on Windows for relative paths
    const relativePath = fullPath.substring(repo.path.length).replace(/^[\\\/]/, '').replace(/\\/g, '/');

    if (!(await showConfirm(`Stop tracking "${relativePath}"?\n\nThis will remove it from Git (cached) but keep the physical file, and add it to your .gitignore.`, 'Stop Tracking'))) {
        return;
    }

    try {
        setTaskState(true);
        const res = await window.electronAPI.gitStopTracking(repo.path, relativePath);
        if (res.success) {
            logToConsole(res.output, 'success');
            await smartRefreshTree();
        } else {
            showAlert(`Failed to stop tracking: ${res.output}`, 'Git Error');
        }
    } catch (e) {
        logToConsole(`Stop Tracking Error: ${e.message}`, 'error');
    } finally {
        setTaskState(false);
    }
}

async function handleStartTracking(fullPath, providedRepoPath = null) {
    let repo = null;
    if (providedRepoPath) {
        repo = repositories.find(r => r.path === providedRepoPath);
    }

    if (!repo) {
        const normFull = fullPath.replace(/\\/g, '/').toLowerCase();
        repo = repositories.find(r => r.path.replace(/\\/g, '/').toLowerCase().startsWith(normFull));
    }

    if (!repo) {
        showAlert('Could not determine the repository for this item.', 'Error');
        return;
    }

    const relativePath = fullPath.substring(repo.path.length).replace(/^[\\\/]/, '').replace(/\\/g, '/');

    try {
        setTaskState(true);
        const res = await window.electronAPI.gitStartTracking(repo.path, relativePath);
        if (res.success) {
            logToConsole(res.output, 'success');
            await smartRefreshTree();
        } else {
            showAlert(`Failed to start tracking: ${res.output}`, 'Git Error');
        }
    } catch (e) {
        logToConsole(`Start Tracking Error: ${e.message}`, 'error');
    } finally {
        setTaskState(false);
    }
}

async function handleRename(oldPath) {
    const fileName = oldPath.split(/[\\\/]/).pop();
    elements.renameModal.style.display = 'flex';
    elements.renamePathDisplay.textContent = fileName;
    elements.renameNewName.value = fileName;
    elements.renameNewName.focus();
    elements.renameNewName.select();

    elements.renameNewName.onkeydown = (e) => {
        if (e.key === 'Enter') {
            elements.renameConfirm.click();
        } else if (e.key === 'Escape') {
            elements.renameModal.style.display = 'none';
        }
    };

    elements.renameConfirm.onclick = async () => {
        const newName = elements.renameNewName.value.trim();
        if (!newName || newName === fileName) {
            elements.renameModal.style.display = 'none';
            return;
        }

        const parentDir = oldPath.substring(0, Math.max(oldPath.lastIndexOf('/'), oldPath.lastIndexOf('\\')));
        const newPath = `${parentDir}/${newName}`.replace(/\\/g, '/');

        try {
            const res = await window.electronAPI.renameItem(oldPath, newPath);
            if (res.success) {
                logToConsole(`Renamed ${fileName} to ${newName}`, 'success');
                elements.renameModal.style.display = 'none';
                selectedNodes.clear();
                selectedNodes.add(newPath); // Stay on the renamed item
                await smartRefreshTree();
            } else {
                logToConsole(`Rename failed: ${res.error}`, 'error');
                showAlert(`Error renaming: ${res.error}`, 'Error');
            }
        } catch (e) {
            logToConsole(`Rename error: ${e.message}`, 'error');
        }
    };
}

function sortRepositories() {
    if (!repositories || !Array.isArray(repositories)) return;
    repositories.sort((a, b) => {
        const nameA = (a && a.name) ? String(a.name) : '';
        const nameB = (b && b.name) ? String(b.name) : '';
        return nameA.localeCompare(nameB, undefined, { numeric: true });
    });
}

async function revealInTree(fullPath) {
    const normTarget = fullPath.replace(/\\/g, '/').toLowerCase();
    const repo = repositories.find(r => normTarget.startsWith(r.path.replace(/\\/g, '/').toLowerCase()));
    if (!repo) return;

    // 1. Ensure the repo itself is selected and visible
    const repoPath = repo.path.replace(/\\/g, '/');
    const repoNode = Array.from(document.querySelectorAll('.repo-root')).find(n => n.dataset.path.replace(/\\/g, '/').toLowerCase() === repoPath.toLowerCase());
    if (!repoNode) return;

    repoNode.scrollIntoView({ behavior: 'auto', block: 'start' });

    // 2. Break down the relative path into segments
    const relPath = normTarget.replace(repoPath.toLowerCase(), '');
    const segments = relPath.split('/').filter(s => s);

    let currentPath = repoPath;
    let currentContainer = repoNode.parentElement; // The container holding the .tree-node

    for (const segment of segments) {
        // Expand the current folder if not already expanded
        const treeNode = currentContainer.querySelector('.tree-node');
        const existingChildren = currentContainer.querySelector('.children-container');

        if (!existingChildren) {
            const depth = parseInt(treeNode.style.paddingLeft) / 12 - 1.33; // Rough depth calculation
            await toggleFolder(currentContainer, currentPath, isNaN(depth) ? 0 : depth, repo);
        }

        // Find the next segment's container
        const nextContainer = Array.from(currentContainer.querySelectorAll(':scope > .children-container > div')).find(div => {
            const node = div.querySelector('.tree-node');
            return node && node.dataset.path.split(/[\\\/]/).pop().toLowerCase() === segment;
        });

        if (!nextContainer) break;

        currentContainer = nextContainer;
        currentPath = currentContainer.querySelector('.tree-node').dataset.path;
    }

    // Highlight the final node
    const finalNode = currentContainer.querySelector('.tree-node');
    if (finalNode) {
        selectedNodes.clear();
        selectedNodes.add(finalNode.dataset.path);
        updateTreeSelectionUI();
    }
}

function scrollToRepoInTree(path) {
    const node = Array.from(document.querySelectorAll('.repo-root')).find(n => n.dataset.path.replace(/\\/g, '/').toLowerCase() === path.replace(/\\/g, '/').toLowerCase());
    if (node) node.scrollIntoView({ behavior: 'auto', block: 'start' });
}

async function updateBranchSelector(path) { try { const res = await window.electronAPI.getBranches(path); elements.branchSelect.innerHTML = res.all.map(b => `<option value="${b}" ${b === res.current ? 'selected' : ''}>${b}</option>`).join(''); } catch(e) {} }

async function updateRemoteSelector(path) {
    try {
        const remotes = await window.electronAPI.getRemotes(path);

        if (remotes.length === 0) {
            elements.remoteSelect.innerHTML = '<option value="">none</option>';
            if (elements.openRemoteBtn) elements.openRemoteBtn.style.display = 'none';
        } else {
            elements.remoteSelect.innerHTML = remotes.map(r => `<option value="${r.name}" data-url="${r.url}">${r.name}</option>`).join('');

            const updateZone = () => {
                const selected = elements.remoteSelect.options[elements.remoteSelect.selectedIndex];
                const url = selected ? selected.getAttribute('data-url') : '';
                if (elements.openRemoteBtn) {
                    elements.openRemoteBtn.style.display = url ? 'block' : 'none';
                }
            };

            elements.remoteSelect.onchange = updateZone;
            updateZone(); // Initial check
        }
    } catch(e) {}
}

async function updateRepoStatus(providedStatus) {
    if (!activeRepo) return;
    const status = providedStatus || await window.electronAPI.gitStatus(activeRepo.path);

    // Highlight Pull button if behind
    const pullBtn = document.querySelector('.git-btn[data-action="pull"]');
    if (pullBtn) {
        if (status.behind > 0) {
            pullBtn.classList.add('highlight-pull');
            pullBtn.title = `Pull ${status.behind} incoming commits`;
        } else {
            pullBtn.classList.remove('highlight-pull');
            pullBtn.title = 'Pull changes';
        }
    }
}

function renderChangesList(repo, detailedChanges) {
    const { staged, unstaged, untracked } = detailedChanges;

    // Clear lists
    elements.stagedList.innerHTML = '';
    elements.unstagedList.innerHTML = '';

    // Helper to add items
    const createChangeItem = (file, type) => {
        const item = document.createElement('div');
        item.className = 'change-item';
        const isUntracked = type === 'untracked';
        const isStaged = type === 'staged';

        item.innerHTML = `
            <span class="change-icon">${isUntracked ? '➕' : '📄'}</span>
            <span class="change-name" title="${file}">${file}</span>
            <div class="change-actions">
                ${isStaged ?
                    `<button class="button mini-action-btn btn-unstage" title="Unstage">⊖</button>` :
                    `<button class="button mini-action-btn btn-stage" title="Stage">⊕</button>`
                }
                <button class="button mini-action-btn btn-restore" title="${isUntracked ? 'Delete' : 'Restore'}">✕</button>
            </div>
        `;

        item.onclick = () => {
            document.querySelectorAll('.change-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            showFileDiff(`${repo.path}/${file}`);
        };

        const actionBtn = item.querySelector(isStaged ? '.btn-unstage' : '.btn-stage');
        actionBtn.onclick = async (e) => {
            e.stopPropagation();
            setTaskState(true);
            try {
                const res = isStaged ?
                    await window.electronAPI.gitUnstageFile(repo.path, file) :
                    await window.electronAPI.gitStageFile(repo.path, file);
                if (res.success) await refreshActiveRepoUI();
                else logToConsole(res.output, 'error');
            } catch(err) { logToConsole(err.message, 'error'); }
            finally { setTaskState(false); }
        };

        const restoreBtn = item.querySelector('.btn-restore');
        restoreBtn.onclick = async (e) => {
            e.stopPropagation();
            const action = isUntracked ? 'Permanently DELETE' : 'RESTORE (wipe changes)';
            if (await showConfirm(`${action} ${file}?`, 'Confirm Restoration')) {
                setTaskState(true);
                try {
                    const res = await window.electronAPI.gitRestoreFile(repo.path, file);
                    if (res.success) {
                        await smartRefreshTree();
                        await refreshActiveRepoUI();
                    }
                    else logToConsole(res.output, 'error');
                } catch(err) { logToConsole(err.message, 'error'); }
                finally { setTaskState(false); }
            }
        };

        return item;
    };

    staged.forEach(f => elements.stagedList.appendChild(createChangeItem(f, 'staged')));
    unstaged.forEach(f => elements.unstagedList.appendChild(createChangeItem(f, 'unstaged')));
    untracked.forEach(f => elements.unstagedList.appendChild(createChangeItem(f, 'untracked')));

    // Show/Hide sections if empty
    document.getElementById('staged-section').style.display = staged.length ? 'flex' : 'none';
    if (!staged.length && !unstaged.length && !untracked.length) {
        elements.unstagedList.innerHTML = '<div class="empty-state" style="padding:20px;">No changes detected. Workspace is clean.</div>';
    }
}

async function showGitStatus() {
    if (!activeRepo) return;

    // Switch right panel to Status View
    elements.messageView.style.display = 'none';
    elements.diffView.style.display = 'none';
    elements.statusView.style.display = 'flex';
    elements.statusContainer.textContent = 'Fetching status...';

    try {
        const res = await window.electronAPI.gitRawStatus(activeRepo.path);
        if (res.success) {
            elements.statusContainer.textContent = res.output || 'No status output.';
        } else {
            elements.statusContainer.textContent = 'Error fetching status: ' + res.output;
        }
    } catch (e) {
        elements.statusContainer.textContent = 'System Error: ' + e.message;
    }
}


async function handleStashModal() {
    if (!activeRepo) return;
    elements.stashModal.style.display = 'flex';
    elements.stashMessageInput.value = '';
    await listStashes();
}

async function saveStash() {
    if (!activeRepo) return;
    const msg = elements.stashMessageInput.value.trim();

    logToConsole(`Saving stash for ${activeRepo.name}...`, 'info');
    setTaskState(true);
    try {
        const res = await window.electronAPI.gitStashSave(activeRepo.path, msg);
        if (res.success) {
            logToConsole('Stash saved successfully.', 'success');
            elements.stashMessageInput.value = '';
            await listStashes();
            await refreshActiveRepoUI();
        } else {
            showAlert(`Stash failed: ${res.output}`, 'Error');
        }
    } catch (e) {
        logToConsole(`Stash Error: ${e.message}`, 'error');
    } finally {
        setTaskState(false);
    }
}

async function listStashes() {
    if (!activeRepo) return;
    const container = elements.stashListContainer;
    container.innerHTML = '<div style="padding:10px; color:var(--text-muted);">Loading stashes...</div>';

    try {
        const res = await window.electronAPI.gitStashList(activeRepo.path);
        if (!res.success) throw new Error(res.output);

        container.innerHTML = '';
        if (res.stashes.length === 0) {
            container.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">No stashes found for this project.</div>';
            return;
        }

        res.stashes.forEach((s, idx) => {
            const div = document.createElement('div');
            div.style.padding = '10px 12px';
            div.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'space-between';

            div.innerHTML = `
                <div style="flex:1; overflow:hidden;">
                    <div style="font-size:12px; color:#fff; font-weight:600; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${s.message}</div>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${s.hash.substring(0,7)} • stash@{${idx}}</div>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="button apply-btn" style="font-size:10px; height:24px;" title="Apply changes but keep stash">Apply</button>
                    <button class="button button-blue pop-btn" style="font-size:10px; height:24px;" title="Apply and remove stash">Pop</button>
                    <button class="button button-danger drop-btn" style="font-size:10px; height:24px; width:24px; padding:0;">×</button>
                </div>
            `;

            div.querySelector('.apply-btn').onclick = async () => {
                logToConsole(`Applying stash@{${idx}}...`, 'info');
                const res = await window.electronAPI.gitStashApply(activeRepo.path, idx);
                if (res.success) { logToConsole('Stash applied.', 'success'); await refreshActiveRepoUI(); }
                else showError(res.output, 'Apply Error');
            };

            div.querySelector('.pop-btn').onclick = async () => {
                logToConsole(`Popping stash@{${idx}}...`, 'info');
                const res = await window.electronAPI.gitStashPop(activeRepo.path, idx);
                if (res.success) {
                    logToConsole('Stash popped.', 'success');
                    await listStashes();
                    await refreshActiveRepoUI();
                } else showError(res.output, 'Pop Error');
            };

            div.querySelector('.drop-btn').onclick = async () => {
                if (await showConfirm(`Delete stash@{${idx}} permanently?`, 'Confirm Drop')) {
                    const res = await window.electronAPI.gitStashDrop(activeRepo.path, idx);
                    if (res.success) await listStashes();
                    else showError(res.output, 'Drop Error');
                }
            };

            container.appendChild(div);
        });
    } catch (e) {
        container.innerHTML = `<div style="color:var(--accent-red); padding:10px;">${e.message}</div>`;
    }
}

async function showFileDiff(filePath) {
    const normPath = filePath.replace(/\\/g, '/').toLowerCase();
    const repo = repositories.find(r => normPath.startsWith(r.path.replace(/\\/g, '/').toLowerCase()));
    if (!repo) return;

    currentEditingPath = filePath;

    // Ensure we are in Repo View and hide Editor
    elements.editorView.style.display = 'none';
    elements.repoView.style.display = 'flex';

    // Switch right panel to Diff View
    elements.messageView.style.display = 'none';
    elements.statusView.style.display = 'none';
    elements.diffView.style.display = 'flex';
    elements.diffFileName.textContent = filePath.split(/[\\\/]/).pop();

    try {
        const repoBase = repo.path.replace(/\\/g, '/');
        const fPath = filePath.replace(/\\/g, '/');
        let relPath = fPath.substring(repoBase.length);
        if (relPath.startsWith('/')) relPath = relPath.substring(1);

        const diffLines = await window.electronAPI.getFileDiff(repo.path, relPath);
        elements.diffContainer.innerHTML = diffLines.length ? '' : '<div class="diff-line info" style="padding:20px;">No uncommitted changes to show. This file might be staged or identical to HEAD.</div>';

        diffLines.forEach(line => {
            const el = document.createElement('div');
            el.className = `diff-line ${line.type}`;
            el.textContent = line.text || ' ';
            elements.diffContainer.appendChild(el);
        });
    } catch (e) {
        logToConsole(e.message, 'error');
    }
}

async function runGitignoreScan() {
    if (!currentEditingPath || !monacoEditor) return;
    const projectPath = currentEditingPath.substring(0, Math.max(currentEditingPath.lastIndexOf('/'), currentEditingPath.lastIndexOf('\\')));
    try {
        const children = await window.electronAPI.listDirectory(projectPath, true);
        const currentContent = monacoEditor.getValue();
        let newRules = [];
        const patterns = { 'node_modules': 'node_modules/', '.idea': '.idea/', '.vscode': '.vscode/', 'dist': 'dist/', 'build': 'build/', 'out': 'out/', '.env': '.env', 'package-lock.json': 'package-lock.json', '.DS_Store': '.DS_Store', 'thumbs.db': 'thumbs.db' };
        for (const child of children) { if (patterns[child.name] && !currentContent.includes(patterns[child.name])) newRules.push(patterns[child.name]); }
        if (newRules.length > 0) { monacoEditor.setValue(currentContent.trim() + (currentContent.trim() ? '\n\n' : '') + '# Auto-detected\n' + newRules.join('\n')); logToConsole('Rules added.', 'success'); }
    } catch (e) { logToConsole(e.message, 'error'); }
}

async function handleNewItem(type, parentPath) {
    const targetDir = parentPath || (activeRepo ? activeRepo.path : null);
    if (!targetDir) return;
    elements.newItemModal.style.display = 'flex';
    elements.newItemPathDisplay.textContent = targetDir;
    elements.newItemName.value = '';
    elements.newItemName.focus();

    document.getElementById('new-item-title').textContent = `New ${type.charAt(0).toUpperCase() + type.slice(1)}`;

    const confirmBtn = document.getElementById('new-item-confirm');
    const cancelBtn = document.getElementById('new-item-cancel');

    const execute = async () => {
        const name = elements.newItemName.value.trim();
        if (!name) return;
        const full = `${targetDir}/${name}`.replace(/\\/g, '/');

        // Ensure parent is in expandedNodes so it stays open after refresh
        expandedNodes.add(targetDir.replace(/\\/g, '/').toLowerCase());

        try {
            setTaskState(true);
            if (type === 'file') {
                await window.electronAPI.writeFile(full, '');
                elements.newItemModal.style.display = 'none';
                await renderTree(elements.repoFilter.value);
                openFileInEditor(full);
            } else {
                const res = await window.electronAPI.createDirectory(full);
                if (res.success) {
                    elements.newItemModal.style.display = 'none';
                    // Force the new folder itself to be expanded too so user sees it empty
                    expandedNodes.add(full.toLowerCase());
                    await renderTree(elements.repoFilter.value);
                } else {
                    showError(res.error, 'Folder Creation Failed');
                }
            }
        } catch (e) {
            logToConsole(e.message, 'error');
            showError(e.message, 'System Error');
        } finally {
            setTaskState(false);
        }
    };

    confirmBtn.onclick = execute;
    cancelBtn.onclick = () => elements.newItemModal.style.display = 'none';

    elements.newItemName.onkeydown = (e) => {
        if (e.key === 'Enter') execute();
        if (e.key === 'Escape') elements.newItemModal.style.display = 'none';
    };
}

async function handleAddRepo() {
    const path = await window.electronAPI.openDirectory();
    if (path) { const res = await window.electronAPI.scanDirectory(path); if (res.type === 'multiple') showMultiRepoModal(res.repos); else showAddChoiceModal(path, res.type === 'single'); }
}

function showAddChoiceModal(path, isRepo) {
    const modal = document.getElementById('add-choice-modal'); modal.style.display = 'flex';
    document.getElementById('choice-single').onclick = () => { addRepository({ type: 'single', path, name: path.split(/[\\\/]/).pop() }); modal.style.display = 'none'; };
    document.getElementById('choice-bulk').onclick = async () => {
        modal.style.display = 'none'; const children = await window.electronAPI.listDirectory(path); const gitRepos = [];
        for (const dir of children.filter(c => c.isDirectory)) { const scan = await window.electronAPI.scanDirectory(dir.path); gitRepos.push(scan.type === 'single' ? scan : { type: 'single', path: dir.path, name: dir.name }); }
        if (gitRepos.length > 0) showMultiRepoModal(gitRepos);
    };
    document.getElementById('choice-cancel').onclick = () => modal.style.display = 'none';
}

function showMultiRepoModal(repos) {
    const modal = document.getElementById('multi-repo-modal'); const list = document.getElementById('repo-list-container');
    const selectAll = document.getElementById('multi-repo-select-all');
    list.innerHTML = ''; repos.forEach((r, i) => { const div = document.createElement('div'); div.innerHTML = `<label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" value="${i}" checked> ${r.name}</label>`; list.appendChild(div); });

    if (selectAll) {
        selectAll.checked = true;
        selectAll.onchange = () => {
            list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = selectAll.checked);
        };
    }

    document.getElementById('modal-add').onclick = async () => {
        const checked = Array.from(list.querySelectorAll('input:checked')).map(i => repos[parseInt(i.value)]);
        checked.forEach(r => addRepository(r, true, true)); // skip individual renders
        sortRepositories();
        window.electronAPI.saveRepositories(repositories);

        // Final UI sync
        modal.style.display = 'none';
        await renderTree(elements.repoFilter.value);
        if (elements.dashboardView.style.display !== 'none') showDashboard();
    };
    document.getElementById('modal-cancel').onclick = () => modal.style.display = 'none'; modal.style.display = 'flex';
}

async function showGitHubImportModal() {
    if (!settings.githubToken) {
        showAlert('Please set your Personal Access Token (PAT) in Settings.', 'Auth Required');
        showSettings();
        return;
    }
    const modal = document.getElementById('github-import-modal'); const list = document.getElementById('github-repo-list');
    modal.style.display = 'flex'; list.innerHTML = '<p>Connecting...</p>';
    try {
        const res = await window.electronAPI.fetchGitHubRepos(settings.githubToken);
        const repos = res.repos || [];
        if (res.expiration) updateTokenExpirationUI(res.expiration);

        list.innerHTML = ''; repos.forEach(r => { const div = document.createElement('div'); div.style.padding = '8px'; div.style.borderBottom = '1px solid var(--border-color)'; div.innerHTML = `<label style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;"><div><div style="font-weight: 600; color: #fff;">${r.full_name}</div><div style="font-size: 11px; color: var(--text-muted);">${r.description || 'No description'}</div></div><input type="checkbox" name="github-repo" value="${r.clone_url}" data-name="${r.name}"></label>`; list.appendChild(div); });
        document.getElementById('import-confirm').disabled = false;
        document.getElementById('import-confirm').onclick = async () => {
            const selected = Array.from(list.querySelectorAll('input:checked'));
            if (selected.length === 0) return showAlert('Select at least one repository.', 'Selection Required');
            if (!settings.rootRepoDir) return showAlert('Set a Root Repository Folder in Settings.', 'Config Missing');
            modal.style.display = 'none';
            for (const input of selected) { const dest = `${settings.rootRepoDir}/${input.dataset.name}`; logToConsole(`Cloning ${input.dataset.name}...`, 'info'); await window.electronAPI.gitClone(input.value, dest); addRepository({ type: 'single', path: dest, name: input.dataset.name }, true); }
            sortRepositories(); window.electronAPI.saveRepositories(repositories); renderTree();
        };
    } catch (e) {
        logToConsole(e.message, 'error');
        showError(e.message, 'GitHub API Error');
    }
    document.getElementById('import-cancel').onclick = () => modal.style.display = 'none';
}

function showCreateRepoModal() {
    const modal = document.getElementById('create-repo-modal');
    if (settings.rootRepoDir) document.getElementById('new-repo-path').value = settings.rootRepoDir;
    modal.style.display = 'flex';

    document.getElementById('browse-new-repo-path').onclick = async () => {
        const p = await window.electronAPI.openDirectory();
        if (p) document.getElementById('new-repo-path').value = p;
    };

    document.getElementById('create-confirm').onclick = async () => {
        const name = document.getElementById('new-repo-name').value.trim();
        const parent = document.getElementById('new-repo-path').value.trim();
        const skipRemote = document.getElementById('skip-remote').checked;

        if (!name || !parent) return showAlert('Repository name and parent path are required.', 'Missing Fields');
        const full = `${parent}/${name}`.replace(/\\/g, '/');

        modal.style.display = 'none';
        logToConsole(`Creating repository: ${name}...`, 'info');
        setTaskState(true);

        try {
            // 1. Initialize Git Locally
            const res = await window.electronAPI.gitInit(full);
            if (res.success) {
                logToConsole(`Successfully initialized Git in ${full}`, 'success');

                // 2. Initial Staging and Commit (to have something to push)
                logToConsole('Performing initial local commit...', 'info');
                await window.electronAPI.gitCommit(full, 'Initial commit');

                // 3. Add to GitScope Workspace
                const newRepo = { type: 'single', path: full, name: name };
                addRepository(newRepo);
                await smartRefreshTree();

                // 4. Handle GitHub Upload if requested
                if (!skipRemote) {
                    logToConsole('Unchecked "Skip remote" - Opening GitHub Wizard...', 'info');
                    // We must select it as active first so handlePublishGitHub knows what to target
                    const repoObj = repositories.find(r => r.path.toLowerCase() === full.toLowerCase());
                    if (repoObj) {
                        await selectRepo(repoObj, true);
                        await handlePublishGitHub();
                    }
                }
            } else {
                logToConsole(`Failed to create repository: ${res.output}`, 'error');
                showError(`Error creating repository: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`Creation Error: ${e.message}`, 'error');
            showError(e.message, 'System Error');
        } finally {
            setTaskState(false);
        }
    };
    document.getElementById('create-cancel').onclick = () => modal.style.display = 'none';
}

async function showPatchModal(sourcePath) {
    const modal = document.getElementById('patch-modal');
    const list = document.getElementById('patch-repo-list');
    const selectAll = document.getElementById('patch-select-all');
    list.innerHTML = '';

    repositories.forEach(r => {
        const div = document.createElement('div');
        div.innerHTML = `<label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:2px 0;"><input type="checkbox" value="${r.path}" data-name="${r.name}"> <span style="font-size:12px;">${r.name}</span></label>`;
        list.appendChild(div);
    });

    if (selectAll) {
        selectAll.checked = false;
        selectAll.onchange = () => {
            list.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = selectAll.checked);
        };
    }

    document.getElementById('patch-apply').onclick = async () => {
        const targets = Array.from(list.querySelectorAll('input:checked')).map(i => i.value);
        if (targets.length === 0) return showAlert('Select at least one project.', 'Selection Required');

        modal.style.display = 'none';
        logToConsole(`Extracting patch from ${sourcePath.split(/[\\\/]/).pop()}...`, 'info');

        try {
            // Find which repo this file belongs to
            const normPath = sourcePath.replace(/\\/g, '/').toLowerCase();
            const sourceRepo = repositories.find(r => normPath.startsWith(r.path.replace(/\\/g, '/').toLowerCase()));
            if (!sourceRepo) throw new Error('Source repository not found.');

            const repoBase = sourceRepo.path.replace(/\\/g, '/').toLowerCase();
            let relPath = normPath.replace(repoBase, '');
            if (relPath.startsWith('/')) relPath = relPath.substring(1);

            const patch = await window.electronAPI.getFilePatch(sourceRepo.path, relPath);
            if (!patch || patch.trim() === '') throw new Error('File has no uncommitted changes to patch.');

            for (const targetPath of targets) {
                logToConsole(`Applying patch to ${targetPath}...`, 'info');
                const res = await window.electronAPI.applyPatch(targetPath, patch);
                if (res.success) logToConsole(`Applied to ${targetPath}`, 'success');
                else logToConsole(`Fail on ${targetPath}: ${res.output}`, 'error');
            }
            await smartRefreshTree();
        } catch (e) {
            logToConsole(e.message, 'error');
            showError(e.message, 'Patch Failed');
        }
    };

    document.getElementById('patch-cancel').onclick = () => modal.style.display = 'none';
    modal.style.display = 'flex';
}

async function handleFileDrop(data, destDir, destContainer, depth, sourceId) {
    let srcPaths = [];
    try {
        srcPaths = JSON.parse(data);
    } catch (e) {
        srcPaths = [data]; // Fallback for single path
    }

    if (!Array.isArray(srcPaths)) srcPaths = [srcPaths];

    const modal = document.getElementById('drop-action-modal');
    modal.style.display = 'flex';

    const perform = async (type) => {
        modal.style.display = 'none';
        setTaskState(true);

        for (const srcPath of srcPaths) {
            const fileName = srcPath.split(/[\\\/]/).pop();
            const destPath = `${destDir}/${fileName}`;
            if (srcPath === destPath) continue;

            try {
                let res = type === 'move' ?
                    await window.electronAPI.moveFile(srcPath, destPath) :
                    await window.electronAPI.copyFile(srcPath, destPath);

                if (!res.success && res.error === 'exists') {
                    if (await showConfirm(`"${fileName}" already exists. Overwrite?`, "File Conflict")) {
                        res = type === 'move' ?
                            await window.electronAPI.moveFileForce(srcPath, destPath) :
                            await window.electronAPI.copyFileForce(srcPath, destPath);
                    } else {
                        continue; // Skip this file
                    }
                }

                if (!res.success) {
                    showError(res.error || 'Unknown Error', `${type.charAt(0).toUpperCase() + type.slice(1)} Failed`);
                    break; // Stop on error
                }
            } catch (e) {
                showError(e.message, 'System Error');
                break;
            }
        }

        setTaskState(false);
        renderTree();
    };

    document.getElementById('drop-move').onclick = () => perform('move');
    document.getElementById('drop-copy').onclick = () => perform('copy');
    document.getElementById('drop-cancel').onclick = () => modal.style.display = 'none';
}

function setMarkdownViewMode(mode) {
    if (!elements.editorContainerWrapper) return;

    const ext = currentEditingPath ? currentEditingPath.split('.').pop().toLowerCase() : '';
    const isHTML = ext === 'html' || ext === 'htm';

    // Reset classes
    [elements.editorView, elements.editorContainerWrapper].forEach(el => {
        if (el) {
            el.classList.remove('editor-mode-code', 'editor-mode-split', 'editor-mode-preview', 'editor-mode-standard');
            el.classList.add(`editor-mode-${mode}`);
        }
    });

    // Intelligence: Specific visibility for HTML iframe vs Markdown div
    if (mode === 'preview' || mode === 'split') {
        if (isHTML) {
            if (elements.markdownPreview) elements.markdownPreview.style.display = 'none';
            if (elements.htmlPreview) {
                elements.htmlPreview.style.display = 'block';
                elements.htmlPreview.style.flex = '1';
            }
        } else {
            if (elements.markdownPreview) {
                elements.markdownPreview.style.display = 'block';
                elements.markdownPreview.style.flex = '1';
            }
            if (elements.htmlPreview) elements.htmlPreview.style.display = 'none';
        }
    } else {
        if (elements.markdownPreview) elements.markdownPreview.style.display = 'none';
        if (elements.htmlPreview) elements.htmlPreview.style.display = 'none';
    }

    // Update button states
    [elements.mdViewCodeBtn, elements.mdViewSplitBtn, elements.mdViewPreviewBtn].forEach(btn => {
        if (btn) btn.classList.remove('active', 'button-primary');
    });

    const activeBtn = mode === 'code' ? elements.mdViewCodeBtn : (mode === 'split' ? elements.mdViewSplitBtn : (mode === 'preview' ? elements.mdViewPreviewBtn : null));
    if (activeBtn) {
        activeBtn.classList.add('active', 'button-primary');
    }

    // INTELLIGENCE: Disable non-functional buttons in preview mode
    const isPreview = mode === 'preview';
    const toolbarButtons = {
        'editorWrapBtn': !isPreview,
        'mdListBtn': !isPreview,
        'mdTaskBtn': !isPreview,
        'mdImageBtn': !isPreview,
        'editorFormatBtn': !isPreview,
        'editorCommentBtn': !isPreview,
        'editorFindBtn': !isPreview,
        'editorTransformBtn': !isPreview
    };

    Object.entries(toolbarButtons).forEach(([key, enabled]) => {
        const btn = elements[key];
        if (btn) {
            btn.disabled = !enabled;
            btn.style.opacity = enabled ? '1' : '0.4';
            btn.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    });

    if (mode === 'split' || mode === 'preview') {
        updateMarkdownPreviewContent();
    }

    if (monacoEditor) {
        // Essential: Layout the editor after view switch to prevent blank space
        // We handle this manually now to avoid ResizeObserver loops
        setTimeout(() => monacoEditor.layout(), 10);
    }
}

const PREVIEW_STYLES = `
    :host {
        display: block;
        height: 100%;
        overflow: auto;
        background: transparent;
        color: var(--text-main, #c9d1d9);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
    }
    #content {
        padding: 20px;
        min-height: 100%;
        outline: none;
        overflow-wrap: break-word;
        word-wrap: break-word;
        word-break: break-word;
    }
    #content p, #content ul, #content ol, #content pre, #content blockquote {
        margin-top: 0;
        margin-bottom: 8px;
    }
    #content li {
        margin-bottom: 0;
    }
    #content li > p {
        margin-top: 0;
        margin-bottom: 4px;
    }
    #content p:last-child, #content ul:last-child, #content ol:last-child, #content pre:last-child, #content blockquote:last-child {
        margin-bottom: 0;
    }
    #content p, #content li { white-space: normal !important; }
    #content pre {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        background: rgba(255,255,255,0.05);
        padding: 12px;
        border-radius: 4px;
        border: 1px solid var(--border-color, #30363d);
        overflow-x: auto;
    }
    #content code {
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        background: rgba(255,255,255,0.08);
        padding: 2px 4px;
        border-radius: 3px;
        font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
    }
    #content blockquote {
        border-left: 4px solid #1f6feb;
        margin-left: 0;
        padding-left: 16px;
        color: #8b949e;
    }
    #content img { max-width: 100%; height: auto; }
    #content h1, #content h2, #content h3 { color: #fff; margin-top: 24px; margin-bottom: 16px; font-weight: 600; }
    #content a { color: #58a6ff; text-decoration: none; }
    #content a:hover { text-decoration: underline; }
`;

function getPreviewContentArea() {
    if (!elements.markdownPreview) return null;

    if (!elements.markdownPreview.shadowRoot) {
        const shadow = elements.markdownPreview.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = PREVIEW_STYLES;
        const content = document.createElement('div');
        content.id = 'content';
        content.contentEditable = 'true';

        // Sync back on input
        content.oninput = () => {
            if (isSyncingFromPreview) return;
            syncPreviewToEditor();
        };

        // Tab and Shortcut handling
        content.onkeydown = (e) => {
            if (e.key === 'Tab') {
                handleIndentationAction(e, 'preview');
            } else if (e.ctrlKey || e.metaKey) {
                if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    if (e.shiftKey) {
                        if (monacoEditor) monacoEditor.trigger('source', 'redo');
                    } else {
                        if (monacoEditor) monacoEditor.trigger('source', 'undo');
                    }
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    if (monacoEditor) monacoEditor.trigger('source', 'redo');
                } else if (e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    saveCurrentFile();
                }
            }
        };

        shadow.appendChild(style);
        shadow.appendChild(content);

        // Disable contenteditable on the host itself
        elements.markdownPreview.contentEditable = 'false';
        elements.markdownPreview.style.padding = '0'; // Shadow content handles padding
    }

    return elements.markdownPreview.shadowRoot.getElementById('content');
}

function updateMarkdownPreviewContent() {
    if (!monacoEditor || isSyncingFromPreview) return;

    const content = monacoEditor.getValue();
    const ext = currentEditingPath ? currentEditingPath.split('.').pop().toLowerCase() : '';
    const isHTML = ext === 'html' || ext === 'htm';

    if (isHTML) {
        if (!elements.htmlPreview) return;

        // INTELLIGENCE: Inject content into iframe with base href for local resources
        const lastSlash = Math.max(currentEditingPath.lastIndexOf('/'), currentEditingPath.lastIndexOf('\\'));
        const dir = currentEditingPath.substring(0, lastSlash);
        const baseUrl = 'file:///' + dir.replace(/\\/g, '/') + '/';

        let fullHtml = content;
        if (!content.toLowerCase().includes('<html')) {
            fullHtml = `<!DOCTYPE html><html><head><base href="${baseUrl}"></head><body>${content}</body></html>`;
        } else if (!content.toLowerCase().includes('<base')) {
            // Robust injection: Try head, then html, then prepend
            if (/<head>/i.test(fullHtml)) {
                fullHtml = fullHtml.replace(/<head>/i, `<head><base href="${baseUrl}">`);
            } else if (/<html>/i.test(fullHtml)) {
                fullHtml = fullHtml.replace(/<html>/i, `<html><head><base href="${baseUrl}"></head>`);
            } else {
                fullHtml = `<base href="${baseUrl}">${fullHtml}`;
            }
        }

        elements.htmlPreview.srcdoc = fullHtml;
        return;
    }

    const contentArea = getPreviewContentArea();
    if (!contentArea) return;

    let html = typeof marked !== 'undefined' ? marked.parse(content) : '<p>Parser fail.</p>';

    // INTELLIGENCE: Use DOMParser for safer path resolution and to isolate body content if needed
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    if (currentEditingPath) {
        const lastSlash = Math.max(currentEditingPath.lastIndexOf('/'), currentEditingPath.lastIndexOf('\\'));
        const dir = currentEditingPath.substring(0, lastSlash);

        doc.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src');
            if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:')) {
                const absolutePath = dir + '/' + src;
                img.src = 'file:///' + absolutePath.replace(/\\/g, '/');
            }
        });

        doc.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#')) {
                const absolutePath = dir + '/' + href;
                link.href = 'file:///' + absolutePath.replace(/\\/g, '/');
            }
        });
    }

    // If it's a full HTML page, we only want the body content for the editable area
    // but we can also inject styles if they exist.
    if (isHTML) {
        // Move styles from head to body so they live in our shadow root content area
        const headStyles = doc.querySelectorAll('head style, head link[rel="stylesheet"]');
        headStyles.forEach(s => doc.body.prepend(s));
        contentArea.innerHTML = doc.body.innerHTML;
    } else {
        contentArea.innerHTML = doc.body.innerHTML;
    }
}

/**
 * INTELLIGENCE: Sync editable preview back to Monaco.
 * Since we don't have Turndown, we use a basic recursive HTML-to-MD converter.
 */
function syncPreviewToEditor() {
    const ext = currentEditingPath ? currentEditingPath.split('.').pop().toLowerCase() : '';
    if (ext === 'html' || ext === 'htm') return; // Don't sync from HTML preview iframe

    const contentArea = getPreviewContentArea();
    if (!monacoEditor || !contentArea) return;
    isSyncingFromPreview = true;

    try {
        const ext = currentEditingPath ? currentEditingPath.split('.').pop().toLowerCase() : '';
        const isHTML = ext === 'html' || ext === 'htm';

        let finalValue = '';
        if (isHTML) {
            finalValue = contentArea.innerHTML;
        } else {
            const toMarkdown = (node) => {
                if (node.nodeType === 3) {
                    const text = node.textContent.replace(/\u00A0/g, ' ').replace(/\u200B/g, '');
                    // Intelligence: Ignore whitespace-only text nodes between block elements in lists
                    const parentTag = node.parentNode ? node.parentNode.tagName.toLowerCase() : '';
                    if (['ul', 'ol'].includes(parentTag) && !text.trim()) return '';
                    return text;
                }
                if (node.nodeType !== 1) return '';

                const tag = node.tagName.toLowerCase();
                const children = Array.from(node.childNodes).map(toMarkdown).join('');

                switch(tag) {
                    case 'h1': return `# ${children.trim()}\n\n`;
                    case 'h2': return `## ${children.trim()}\n\n`;
                    case 'h3': return `### ${children.trim()}\n\n`;
                    case 'h4': return `#### ${children.trim()}\n\n`;
                    case 'p': return `${children.trim()}\n\n`;
                    case 'strong': case 'b': return `**${children}**`;
                    case 'em': case 'i': return `*${children}*`;
                    case 'ul': return children.trim() + '\n\n';
                    case 'ol': return children.trim() + '\n\n';
                    case 'li': {
                        const parent = node.parentNode ? node.parentNode.tagName.toLowerCase() : '';
                        if (parent === 'ul') return `- ${children.trim()}\n`;
                        if (parent === 'ol') {
                            const idx = Array.from(node.parentNode.children).indexOf(node) + 1;
                            return `${idx}. ${children.trim()}\n`;
                        }
                        return `- ${children.trim()}\n`;
                    }
                    case 'a': {
                        const href = node.getAttribute('href');
                        // Strip the file:/// prefix if we added it for previewing
                        const cleanHref = (href && href.startsWith('file:///')) ? href.substring(8) : href;
                        return `[${children}](${cleanHref || ''})`;
                    }
                    case 'img': {
                        const src = node.getAttribute('src');
                        const cleanSrc = (src && src.startsWith('file:///')) ? src.substring(8) : src;
                        return `![${node.getAttribute('alt') || ''}](${cleanSrc || ''})`;
                    }
                    case 'code': return `\`${children}\``;
                    case 'pre': return `\`\`\`\n${children}\n\`\`\`\n\n`;
                    case 'blockquote': return `> ${children.replace(/\n/g, '\n> ')}\n\n`;
                    case 'br': return '\n';
                    case 'div': return `${children}\n`;
                    default: return children;
                }
            };

            finalValue = Array.from(contentArea.childNodes).map(toMarkdown).join('');
            // Clean up excessive newlines
            finalValue = finalValue.replace(/\n{3,}/g, '\n\n').trim();
        }

        const model = monacoEditor.getModel();
        if (model) {
            // Apply as a single edit to preserve undo stack as much as possible
            model.pushEditOperations([], [{
                range: model.getFullModelRange(),
                text: finalValue
            }], () => null);
        }
    } catch (e) {
        console.error('Preview sync failed:', e);
    } finally {
        // Delay resetting the flag to ensure Monaco's onDidChangeContent is ignored
        setTimeout(() => { isSyncingFromPreview = false; }, 100);
    }
}

/**
 * INTELLIGENCE: Unified Tab/Shift-Tab handler for Editors and Preview
 */
function handleIndentationAction(e, targetType) {
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();

    const isShift = e.shiftKey;
    const model = monacoEditor ? monacoEditor.getModel() : null;
    const tabSize = model ? model.getOptions().tabSize : 4;
    const spaces = ' '.repeat(tabSize);

    if (targetType === 'monaco' || targetType === 'theme') {
        const editor = targetType === 'monaco' ? monacoEditor : themeEditor;
        if (editor) {
            if (isShift) {
                editor.trigger('keyboard', 'outdent', null);
            } else {
                editor.trigger('keyboard', 'tab', null);
            }
        }
    } else if (targetType === 'preview') {
        const contentArea = getPreviewContentArea();
        if (!contentArea) return;

        const selection = window.getSelection();
        if (selection.rangeCount === 0) return;
        const range = selection.getRangeAt(0);

        // Intelligence: Determine if we are inside a list (LI/UL/OL)
        let container = range.commonAncestorContainer;
        let isList = false;
        while (container && container !== contentArea) {
            if (['LI', 'UL', 'OL'].includes(container.nodeName)) {
                isList = true;
                break;
            }
            container = container.parentNode;
        }

        if (isList) {
            // Lists have special nesting requirements, native indent/outdent is best
            document.execCommand(isShift ? 'outdent' : 'indent', false, null);
        } else {
            if (isShift) {
                // Outdent logic: remove up to tabSize leading spaces
                if (range.collapsed) {
                    let container = range.startContainer;
                    let offset = range.startOffset;

                    // If at start of a block, look at previous text node
                    if (container.nodeType === 1 && offset === 0 && container.previousSibling && container.previousSibling.nodeType === 3) {
                        container = container.previousSibling;
                        offset = container.textContent.length;
                    }

                    if (container.nodeType === 3) {
                        const content = container.textContent;
                        let toRemove = 0;
                        // Find how many spaces we can remove to the left
                        while (toRemove < tabSize && (offset - toRemove - 1) >= 0 && content[offset - toRemove - 1] === ' ') {
                            toRemove++;
                        }

                        if (toRemove > 0) {
                            const newRange = document.createRange();
                            newRange.setStart(container, offset - toRemove);
                            newRange.setEnd(container, offset);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                            document.execCommand('delete', false, null);
                        }
                    }
                } else {
                    // Multi-selection outdent: fallback to native outdent for simplicity
                    // which usually removes margins or blockquotes.
                    document.execCommand('outdent', false, null);
                }
            } else {
                // Indent logic: insert spaces
                // If it's a single line, just insert. If it's multi-line, native indent.
                if (range.collapsed) {
                    document.execCommand('insertText', false, spaces);
                } else {
                    document.execCommand('indent', false, null);
                }
            }
        }
    }
}

function addRepository(repo, skipSave = false, skipRender = false) {
    const normNew = repo.path.replace(/\\/g, '/').toLowerCase();
    const exists = repositories.find(r => r.path.replace(/\\/g, '/').toLowerCase() === normNew);
    if (!exists) {
        repositories.push({ ...repo, path: repo.path.replace(/\\/g, '/'), expanded: false });
        sortRepositories();
        if (!skipSave) window.electronAPI.saveRepositories(repositories);
        if (!skipRender) renderTree(elements.repoFilter ? elements.repoFilter.value : '');
    } else {
        logToConsole(`Skipped duplicate project: ${repo.name}`, 'info');
    }
}

async function removeRepositories(paths, skipConfirm = false) {
    const targets = Array.isArray(paths) ? paths : [paths];

    const count = targets.length;
    const msg = count === 1 ? `Remove this project from the workspace?\n\n(It will remain on your computer)` : `Remove ${count} projects from the workspace?\n\n(They will remain on your computer)`;

    if (!skipConfirm && !(await showConfirm(msg, 'Remove from Workspace'))) return;

    let removedAny = false;
    targets.forEach(path => {
        const normPath = String(path || '').replace(/\\/g, '/').toLowerCase();
        logToConsole(`Attempting to remove project at: ${normPath}`, 'info');

        const idx = repositories.findIndex(r => String(r.path || '').replace(/\\/g, '/').toLowerCase() === normPath);
        if (idx !== -1) {
            const removed = repositories.splice(idx, 1)[0];
            removedAny = true;
            if (activeRepo && activeRepo.path.replace(/\\/g, '/').toLowerCase() === normPath) {
                activeRepo = null;
            }
            logToConsole(`Successfully removed ${removed.name} from workspace configuration.`, 'success');
        } else {
            logToConsole(`Could not find project matching path: ${normPath}`, 'warn');
        }
    });

    if (removedAny) {
        if (!activeRepo && elements.repoView.style.display !== 'none') {
            showDashboard();
        }
        window.electronAPI.saveRepositories(repositories);
        renderTree();
        if (elements.dashboardView.style.display !== 'none') showDashboard();
    }
}

function showDeleteModal(paths) {
    const modal = document.getElementById('delete-modal');
    const pathDisplay = document.getElementById('delete-item-path');
    pathDisplay.textContent = paths.length > 1 ? `${paths.length} items` : paths[0];
    modal.style.display = 'flex';

    document.getElementById('delete-confirm').onclick = async () => {
        logToConsole(`Moving ${paths.length} items to Recycle Bin...`, 'info');
        let successCount = 0;
        for (const p of paths) {
            const res = await window.electronAPI.trashItem(p);
            if (res.success) {
                successCount++;
            } else {
                logToConsole(`Failed to delete ${p}: ${res.error}`, 'error');
                showError(`Failed to delete ${p}: ${res.error}`, 'Delete Error');
            }
        }
        if (successCount > 0) logToConsole(`Successfully moved ${successCount} items to Recycle Bin.`, 'success');
        modal.style.display = 'none';
        selectedNodes.clear();
        await smartRefreshTree();
    };
    document.getElementById('delete-cancel').onclick = () => modal.style.display = 'none';
}

// INTELLIGENCE: Force Tab key indentation/outdent for ALL editors
// We use the Capture Phase (true) to intercept the event before the browser steals it for focus cycling
window.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        if (document.activeElement.closest('#monaco-container')) {
            handleIndentationAction(e, 'monaco');
        } else if (document.activeElement.closest('#theme-monaco-container')) {
            handleIndentationAction(e, 'theme');
        }
    }
}, true);

console.log('GitScope Professional logic loaded.');


