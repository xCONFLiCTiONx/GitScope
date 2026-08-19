// State management
let repositories = [];
let activeRepo = null;
let isRendering = false;
let hideIgnoredFiles = false;
let settings = { shell: 'powershell.exe', rootRepoDir: '', githubToken: '' };
let selectedNodes = new Set();
let expandedNodes = new Set();
let tokenExpiration = null;
let monacoEditor = null;
let currentEditingPath = null;
let activeTasks = 0;
let lastSelectedPath = null;
let currentDashboardFilter = 'all';
let feedMessages = [];
let currentFeedIndex = 0;
let feedTimer = null;
let lastKnownStats = null;

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

// Global Custom Modals (Dark themed replacements for alert/confirm)
function showAlert(message, title = 'Notification') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        titleEl.textContent = title;
        msgEl.textContent = message;
        cancelBtn.style.display = 'none';
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

// DOM Elements Mapping (Getter-based for total resilience)
const elements = {
    get navHome() { return document.getElementById('nav-home'); },
    get navGithub() { return document.getElementById('nav-github'); },
    get navNew() { return document.getElementById('nav-new'); },
    get navAdd() { return document.getElementById('nav-add'); },
    get navSettings() { return document.getElementById('nav-settings'); },
    get appLogoBox() { return document.getElementById('app-logo-box'); },
    get repoTree() { return document.getElementById('repo-tree'); },
    get repoFilter() { return document.getElementById('repo-filter'); },
    get mainContent() { return document.getElementById('main-content'); },
    get dashboardView() { return document.getElementById('dashboard-view'); },
    get dashboardSummary() { return document.getElementById('dashboard-summary'); },
    get dashboardGrid() { return document.getElementById('dashboard-grid'); },
    get repoView() { return document.getElementById('repo-view'); },
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
    get editorView() { return document.getElementById('editor-view'); },
    get editorFileName() { return document.getElementById('editor-file-name'); },
    get editorSaveBtn() { return document.getElementById('editor-save-btn'); },
    get editorRestoreBtn() { return document.getElementById('editor-restore-btn'); },
    get editorCloseBtn() { return document.getElementById('editor-close-btn'); },
    get editorPreviewToggle() { return document.getElementById('editor-preview-toggle'); },
    get gitignoreScanBtn() { return document.getElementById('gitignore-scan-btn'); },
    get markdownPreview() { return document.getElementById('markdown-preview'); },
    get monacoContainer() { return document.getElementById('monaco-container'); },
    get settingsView() { return document.getElementById('settings-view'); },
    get branchSelect() { return document.getElementById('branch-select'); },
    get remoteSelect() { return document.getElementById('remote-select'); },
    get openRemoteBtn() { return document.getElementById('open-remote-btn'); },
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
    get clearConsole() { return document.getElementById('clear-console'); },
    get sidebarCollapse() { return document.getElementById('sidebar-collapse'); },
    get sidebarToggleIgnored() { return document.getElementById('sidebar-toggle-ignored'); },
    get sidebarRefresh() { return document.getElementById('sidebar-refresh'); },
    get sidebar() { return document.getElementById('sidebar'); },
    get sidebarResizer() { return document.getElementById('sidebar-resizer'); },
    get consolePanel() { return document.getElementById('console-panel'); },
    get consoleResizer() { return document.getElementById('console-resizer'); },
    get globalProgress() { return document.getElementById('global-progress-container'); },
    get dashboardRefreshBtn() { return document.getElementById('dashboard-refresh-btn'); },
    get dashboardBulkCommitBtn() { return document.getElementById('dashboard-bulk-commit-btn'); },
    get dashboardBulkRestoreBtn() { return document.getElementById('dashboard-bulk-restore-btn'); },
    get bulkCommitModal() { return document.getElementById('bulk-commit-modal'); },
    get bulkCommitRepoList() { return document.getElementById('bulk-commit-repo-list'); },
    get bulkCommitSelectAll() { return document.getElementById('bulk-commit-select-all'); },
    get bulkCommitMsg() { return document.getElementById('bulk-commit-msg'); },
    get bulkCommitAutoMsg() { return document.getElementById('bulk-commit-auto-msg'); },
    get bulkCommitConfirm() { return document.getElementById('bulk-commit-confirm'); },
    get bulkCommitCancel() { return document.getElementById('bulk-commit-cancel'); },

    get bulkRestoreModal() { return document.getElementById('bulk-restore-modal'); },
    get bulkRestoreRepoList() { return document.getElementById('bulk-restore-repo-list'); },
    get bulkRestoreSelectAll() { return document.getElementById('bulk-restore-select-all'); },
    get bulkRestoreConfirm() { return document.getElementById('bulk-restore-confirm'); },
    get bulkRestoreCancel() { return document.getElementById('bulk-restore-cancel'); },
    get unbornFoldersModal() { return document.getElementById('unborn-folders-modal'); },
    get unbornFoldersList() { return document.getElementById('unborn-folders-list'); },
    get unbornFoldersClose() { return document.getElementById('unborn-folders-close'); },
    get rootRepoDirInput() { return document.getElementById('root-repo-dir'); },
    get githubPatInput() { return document.getElementById('github-pat'); },
    get shellSelect() { return document.getElementById('shell-select'); },
    get saveSettingsBtn() { return document.getElementById('save-settings-btn'); },
    get resetAppBtn() { return document.getElementById('reset-app-btn'); },
    get newItemModal() { return document.getElementById('new-item-modal'); },
    get newItemName() { return document.getElementById('new-item-name'); },
    get newItemPathDisplay() { return document.getElementById('new-item-path-display'); },
    get newBranchModal() { return document.getElementById('new-branch-modal'); },
    get newBranchName() { return document.getElementById('new-branch-name'); },
    get newRemoteModal() { return document.getElementById('new-remote-modal'); },
    get newRemoteName() { return document.getElementById('new-remote-name'); },
    get newRemoteUrl() { return document.getElementById('new-remote-url'); },
    get addRemoteBtn() { return document.getElementById('add-remote-btn'); },
    get removeRemoteBtn() { return document.getElementById('remove-remote-btn'); },
    get gitignoreModal() { return document.getElementById('gitignore-modal'); },
    get gitignoreList() { return document.getElementById('gitignore-list'); },
    get gitignoreSearch() { return document.getElementById('gitignore-search'); },
    get gitignoreConfirm() { return document.getElementById('gitignore-confirm'); },
    get gitignoreCancel() { return document.getElementById('gitignore-cancel'); },
    get deleteGitHubBtn() { return document.getElementById('delete-github-btn'); },
    get publishGitHubBtn() { return document.getElementById('publish-github-btn'); },
    get publishGitHubModal() { return document.getElementById('publish-github-modal'); },
    get publishRepoName() { return document.getElementById('publish-repo-name'); },
    get publishRepoPrivate() { return document.getElementById('publish-repo-private'); },
    get publishConfirm() { return document.getElementById('publish-confirm'); },
    get publishCancel() { return document.getElementById('publish-cancel'); },
    get renameModal() { return document.getElementById('rename-modal'); },
    get renamePathDisplay() { return document.getElementById('rename-path-display'); },
    get renameCancel() { return document.getElementById('rename-cancel'); },
    get smartSyncModal() { return document.getElementById('smart-sync-modal'); },
    get smartSyncSourceList() { return document.getElementById('smart-sync-source-list'); },
    get smartSyncTargetList() { return document.getElementById('smart-sync-target-list'); },
    get smartSyncSourceAll() { return document.getElementById('smart-sync-source-all'); },
    get smartSyncTargetAll() { return document.getElementById('smart-sync-target-all'); },
    get smartSyncFuzzy() { return document.getElementById('smart-sync-fuzzy'); },
    get smartSyncOverwrite() { return document.getElementById('smart-sync-overwrite'); },
    get smartSyncRun() { return document.getElementById('smart-sync-run'); },
    get smartSyncCancel() { return document.getElementById('smart-sync-cancel'); },
    get navGitConfig() { return document.getElementById('nav-git-config'); },
    get gitConfigView() { return document.getElementById('git-config-view'); },
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
    get repoStashBtn() { return document.getElementById('repo-stash-btn'); },
    get stashModal() { return document.getElementById('stash-modal'); },
    get stashMessageInput() { return document.getElementById('stash-message-input'); },
    get stashSaveBtn() { return document.getElementById('stash-save-btn'); },
    get stashListContainer() { return document.getElementById('stash-list-container'); },
    get stashCloseBtn() { return document.getElementById('stash-close-btn'); }
};

// Initialize app
window.onload = async () => {
    // 1. Setup UI Mechanics (Instant - No async work here)
    initResizers();
    initEventListeners();

    try {
        // 2. Parallel Data Loading
        const settingsPromise = window.electronAPI.getSettings();
        const reposPromise = window.electronAPI.getRepositories();

        // 3. Initialize Background Components
        initEditor();

        // 4. Populate Shell with Settings
        settings = await settingsPromise;
        if (elements.rootRepoDirInput) elements.rootRepoDirInput.value = settings.rootRepoDir || '';
        if (elements.githubPatInput) elements.githubPatInput.value = settings.githubToken || '';

        // 5. Hydrate Repositories
        const savedRepos = await reposPromise;
        repositories = (savedRepos || []).map(r => ({
            name: r.name || 'Unnamed Project',
            path: String(r.path || '').replace(/\\/g, '/'),
            expanded: false
        }));

        sortRepositories();

        // 6. Initial Render (Shell is already visible)
        await renderTree();
        await showDashboard();

        // 7. Non-critical Background tasks
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
    } catch (e) {
        console.error('FATAL STARTUP ERROR:', e);
    }
};

function initEditor() {
    if (typeof require !== 'undefined') {
        require.config({ paths: { 'vs': '../node_modules/monaco-editor/min/vs' } });
        require(['vs/editor/editor.main'], function () {
            monacoEditor = monaco.editor.create(elements.monacoContainer, {
                theme: 'vs-dark',
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
                formatOnPaste: true,
                formatOnType: true,
                minimap: { enabled: false }
            });
            logToConsole('Code Editor ready.', 'info');
        });
    }
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
        showDashboard();
    };
    if (elements.appLogoBox) elements.appLogoBox.onclick = () => {
        currentDashboardFilter = 'all'; // Reset filter when coming from logo
        setActiveNavItem(elements.navHome);
        showDashboard();
    };
    if (elements.navGithub) elements.navGithub.onclick = () => showGitHubImportModal();
    if (elements.navNew) elements.navNew.onclick = () => showCreateRepoModal();
    if (elements.navAdd) elements.navAdd.onclick = () => handleAddRepo();
    if (elements.navSettings) elements.navSettings.onclick = () => {
        setActiveNavItem(elements.navSettings);
        elements.settingsView.style.display = 'flex';
    };
    if (elements.navGitConfig) elements.navGitConfig.onclick = () => {
        setActiveNavItem(elements.navGitConfig);
        showGitConfigView();
    };

    // Sidebar Header Actions
    if (elements.sidebarRefresh) elements.sidebarRefresh.onclick = () => renderTree(elements.repoFilter.value);
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

    if (elements.repoFilter) elements.repoFilter.oninput = () => renderTree(elements.repoFilter.value);

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
    if (elements.branchSelect) elements.branchSelect.onchange = () => handleBranchChange();
    if (elements.createBranchBtn) elements.createBranchBtn.onclick = () => handleCreateBranch();
    if (elements.deleteBranchBtn) elements.deleteBranchBtn.onclick = () => handleDeleteBranch();
    if (elements.renameBranchBtn) elements.renameBranchBtn.onclick = () => handleRenameBranch();
    if (elements.addRemoteBtn) elements.addRemoteBtn.onclick = () => handleAddRemoteModal();
    if (elements.removeRemoteBtn) elements.removeRemoteBtn.onclick = () => handleRemoveRemote();
    if (elements.openRemoteBtn) elements.openRemoteBtn.onclick = () => handleOpenRemote();
    if (elements.publishGitHubBtn) elements.publishGitHubBtn.onclick = () => handlePublishGitHub();
    if (elements.repoRefreshBtn) elements.repoRefreshBtn.onclick = () => { if (activeRepo) selectRepo(activeRepo); };

    // Editor Actions
    if (elements.editorSaveBtn) elements.editorSaveBtn.onclick = () => saveCurrentFile();
    if (elements.editorRestoreBtn) elements.editorRestoreBtn.onclick = () => handleRestoreFile();
    if (elements.editorCloseBtn) elements.editorCloseBtn.onclick = () => closeEditor();
    if (elements.editorPreviewToggle) elements.editorPreviewToggle.onclick = () => toggleMarkdownPreview();
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
    }

    // Settings Panel
    if (elements.saveSettingsBtn) elements.saveSettingsBtn.onclick = () => saveGlobalSettings();
    if (elements.resetAppBtn) elements.resetAppBtn.onclick = () => handleResetApp();

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

    // Global click listener for deselection
    document.addEventListener('click', (e) => {
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
                if (activeRepo && activeRepo.path === repo.path) {
                    refreshActiveRepoUI(true); // Silent refresh
                }
            }
        } else {
            updateTreeHighlights();
        }
    });
    window.electronAPI.onContextMenuCommand(async (data) => handleContextMenuCommand(data));

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
    elements.mainContent.scrollTop = 0;
    elements.dashboardView.style.display = 'none';
    elements.repoView.style.display = 'none';
    elements.editorView.style.display = 'none';
    elements.settingsView.style.display = 'none';
    elements.gitConfigView.style.display = 'none';
    elements.statusView.style.display = 'none';
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
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
    setTaskState(true);
    if (action === 'push') {
        logToConsole('Sending push command to terminal for reliability...', 'info');
        if (window.terminal) {
            // Use -u origin HEAD to ensure upstream is set automatically
            window.terminal.sendCommand('git push -u origin HEAD');
            setTimeout(async () => {
                await refreshActiveRepoUI();
                setTaskState(false);
            }, 3000);
            return;
        }
    }
    logToConsole(`Git ${action.toUpperCase()} in progress...`, 'info');
    try {
        const res = await window.electronAPI[`git${action.charAt(0).toUpperCase() + action.slice(1)}`](activeRepo.path);
        logToConsole(res.output, res.success ? 'success' : 'error');
        await refreshActiveRepoUI();
    } catch (e) { logToConsole(e.message, 'error'); }
    finally { setTaskState(false); }
}

async function handleStageAll() {
    if (!activeRepo) return;
    setTaskState(true);
    logToConsole('Staging all changes (git add .)...', 'info');
    try {
        const res = await window.electronAPI.gitStageAll(activeRepo.path);
        if (res.success) {
            logToConsole(res.output, 'success');
            await refreshActiveRepoUI();
        } else {
            logToConsole(`Stage Failed: ${res.output}`, 'error');
        }
    } catch (e) {
        logToConsole(`System Error: ${e.message}`, 'error');
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
            await refreshActiveRepoUI();
        } else {
            logToConsole(`Unstage Failed: ${res.output}`, 'error');
        }
    } catch (e) {
        logToConsole(`System Error: ${e.message}`, 'error');
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
                if (window.terminal) window.terminal.sendCommand('git push');
                else await window.electronAPI.gitPush(activeRepo.path);
            }

            await smartRefreshTree(); // Structural refresh (handles deleted files)
            await refreshActiveRepoUI();

        } else {
            const errorMsg = res ? res.output : 'Unknown backend error';
            logToConsole(`Commit Failed: ${errorMsg}`, 'error');
            if (errorMsg.includes('nothing to commit')) {
                showAlert("Nothing to commit. Make some changes first!", "Clean Tree");
            }
        }
    } catch (e) {
        logToConsole(`System Error during commit: ${e.message}`, 'error');
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
        await refreshActiveRepoUI();
    } catch (e) { logToConsole(e.message, 'error'); }
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
                alert(`Creation Error: ${res.output}`);
            }
        } catch (e) {
            logToConsole(`System Error: ${e.message}`, 'error');
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
                showAlert(`Delete Error: ${res.output}\n\nThis can happen if the branch is open in another Git worktree or IDE.`, 'Error');
            }
        } catch (e) {
            logToConsole(`System Error: ${e.message}`, 'error');
            showAlert(`Error: ${e.message}`, 'Error');
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
                showAlert(`Rename Error: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`System Error: ${e.message}`, 'error');
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
    try {
        await window.electronAPI.saveSettings(settings);
        logToConsole('Settings saved.', 'success');
        if (settings.githubToken) checkGitHubTokenLife();
        if (settings.rootRepoDir) await autoImportFromRoot(settings.rootRepoDir);
        renderTree();
    } catch (e) { logToConsole(e.message, 'error'); }
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

async function handleRemoveRemote() {
    if (!activeRepo) return;
    const currentRemote = elements.remoteSelect.value;
    if (!currentRemote || currentRemote === 'none') return;

    if (await showConfirm(`Remove remote "${currentRemote}"?`, "Confirm Remove")) {
        logToConsole(`Removing remote "${currentRemote}"...`, 'info');
        try {
            const res = await window.electronAPI.removeRemote(activeRepo.path, currentRemote);
            if (res.success) {
                logToConsole(res.output, 'success');
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
        setActiveNavItem(elements.navSettings);
        elements.settingsView.style.display = 'flex';
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
                await refreshActiveRepoUI();
            }
        } catch (e) {
            logToConsole(`Publish failed: ${e.message}`, 'error');
            let friendlyMsg = e.message;
            if (e.message.includes('403')) {
                friendlyMsg = "GitHub API Error 403: Permission Denied.\n\nThis usually means your Personal Access Token (PAT) is missing the 'repo' scope (Classic) or isn't set to 'All Repositories' with 'Administration: Read & Write' (Fine-grained).";
            }
            showAlert(friendlyMsg, 'Error Publishing Project');
        } finally {
            setTaskState(false);
        }
    };
}

async function handleDeleteGitHubRepo() {
    if (!activeRepo) return;
    if (!settings.githubToken) {
        showAlert('Please set your Personal Access Token (PAT) in Settings.', 'Auth Required');
        return;
    }

    try {
        const remotes = await window.electronAPI.getRemotes(activeRepo.path);
        const githubRemote = remotes.find(r => r.url.toLowerCase().includes('github.com'));

        if (!githubRemote) {
            showAlert('This project does not have a GitHub remote linked.', 'No GitHub Remote');
            return;
        }

        // Parse owner and repo from URL
        // Regex to handle both https and ssh formats
        const regex = /github\.com[\/|:]([^\/]+)\/([^\/.]+)(\.git)?$/i;
        const match = githubRemote.url.match(regex);

        if (!match) {
            showAlert('Could not determine GitHub owner/repository from the remote URL.', 'Parse Error');
            return;
        }

        const owner = match[1];
        const repoName = match[2];

        const warning = `☢ DANGER: DELETE FROM GITHUB? ☢\n\nThis will PERMANENTLY DELETE the repository "${owner}/${repoName}" from GitHub.\n\nTHIS CANNOT BE UNDONE.`;

        if (await showConfirm(warning, "Nuclear GitHub Deletion")) {
            if (await showConfirm(`FINAL CONFIRMATION: Are you absolutely sure you want to delete "${repoName}" from the internet?`, "Are you REALLY sure?")) {
                setTaskState(true);
                logToConsole(`Deleting ${owner}/${repoName} from GitHub...`, 'info');

                try {
                    const res = await window.electronAPI.deleteGitHubRepo(settings.githubToken, owner, repoName);
                    if (res.expiration) updateTokenExpirationUI(res.expiration);
                    if (res.success) {
                        logToConsole(`Successfully deleted repository from GitHub.`, 'success');

                        // Optionally remove the local remote too
                        if (await showConfirm("Would you like to remove the local remote reference as well?", "Clean Local Links")) {
                            await window.electronAPI.removeRemote(activeRepo.path, githubRemote.name);
                        }

                        await refreshActiveRepoUI();
                        showAlert(`"${repoName}" has been removed from GitHub.`, 'Deletion Successful');
                    }
                } catch (e) {
                    logToConsole(`GitHub Deletion failed: ${e.message}`, 'error');
                    let friendlyMsg = e.message;
                    if (e.message.includes('403')) {
                        friendlyMsg = "GitHub API Error 403: Permission Denied.\n\nTo delete repositories, your token MUST have the 'delete_repo' scope (Classic) or 'Administration: Read & Write' (Fine-grained).";
                    } else if (e.message.includes('404')) {
                        friendlyMsg = "GitHub API Error 404: Repository not found.\n\nThe repository might have already been deleted or your token doesn't have permission to see it.";
                    }
                    showAlert(friendlyMsg, 'Error Deleting Repository');
                } finally {
                    setTaskState(false);
                }
            }
        }
    } catch (e) {
        logToConsole(`System Error: ${e.message}`, 'error');
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
                }
            } catch (e) {
                logToConsole(`Nuke error: ${e.message}`, 'error');
            } finally { setTaskState(false); }
        }
    }
}

async function renderTree(filter = '') {
    if (isRendering) return;
    isRendering = true;
    const search = (filter || '').toLowerCase();
    const filtered = repositories.filter(r => {
        if (!r || !r.name) return false;
        return r.name.toLowerCase().includes(search);
    });

    elements.repoTree.innerHTML = '';
    if (filtered.length === 0) {
        elements.repoTree.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">No projects found.</div>';
    } else {
        const fragment = document.createDocumentFragment();
        // High-Performance Instant Rendering
        for (const repo of filtered) {
            try {
                // Check if directory exists first
                const exists = await window.electronAPI.pathExists(repo.path);

                // 1. Create the node immediately (Sync)
                const node = createTreeNode(repo.name, repo.path, true, 0, repo);
                if (node) {
                    fragment.appendChild(node);

                    if (!exists) {
                        node.querySelector('.node-name').style.color = '#da3633';
                        node.querySelector('.node-name').textContent += ' (MISSING)';
                    }
                }

                // 2. Fetch status in background (Async) - only if exists
                if (exists) {
                    (async () => {
                        try {
                            const changes = await window.electronAPI.getDetailedChanges(repo.path);
                            repo.changedFiles = [...changes.staged, ...changes.unstaged, ...changes.untracked].map(f => `${repo.path.replace(/\\/g, '/')}/${f.replace(/\\/g, '/')}`.toLowerCase());

                            if (changes.staged.length || changes.unstaged.length || changes.untracked.length) {
                                const statusDot = node.querySelector('.status-dot-mini');
                                if (statusDot) {
                                    statusDot.classList.add('active');
                                    statusDot.style.opacity = '1';
                                }
                                const nameEl = node.querySelector('.node-name');
                                if (nameEl) nameEl.style.color = '#f85149';
                            }
                        } catch (e) {}
                    })();
                }
            } catch (err) {
                console.error(`Error rendering node for ${repo.name}:`, err);
            }
        }
        elements.repoTree.appendChild(fragment);

        // PERSISTENCE: Restore previous expansion state
        await restoreAllExpansions();

        // SCROLL: Bring active project to the top
        if (activeRepo) {
            const repoPath = activeRepo.path.replace(/\\/g, '/').toLowerCase();
            const repoRoot = Array.from(elements.repoTree.querySelectorAll('.repo-root')).find(el =>
                el.dataset.path.replace(/\\/g, '/').toLowerCase() === repoPath
            );
            if (repoRoot) {
                repoRoot.scrollIntoView({ behavior: 'auto', block: 'start' });
            }
        }
    }
    isRendering = false;
}

function createTreeNode(name, fullPath, isDirectory, depth, repo) {
    const container = document.createElement('div');
    container.id = 'node-' + Math.random().toString(36).substr(2, 9);
    const item = document.createElement('div');
    const normPath = fullPath.replace(/\\/g, '/').toLowerCase();
    let isChanged = false; if (!isDirectory && repo && repo.changedFiles) isChanged = repo.changedFiles.includes(normPath);
    item.className = `tree-node ${depth === 0 ? 'repo-root' : ''} ${isChanged ? 'changed-file' : ''}`;
    if (isChanged) item.style.color = '#f85149';
    item.style.paddingLeft = `${depth * 12 + 16}px`;
    if (selectedNodes.has(fullPath)) item.classList.add('active');
    const ext = name.split('.').pop().toLowerCase();
    const badges = { 'js': 'JS', 'ts': 'TS', 'html': 'HT', 'css': 'CS', 'md': 'MD' };
    const badge = (!isDirectory && badges[ext]) ? `<span class="file-badge badge-${ext}">${badges[ext]}</span>` : '';
    item.innerHTML = `<span class="chevron">${isDirectory ? '▸' : ''}</span>${badge}<span class="node-name">${name}</span>${(isDirectory && isChanged) ? '<span class="status-dot-mini active"></span>' : ''}`;
    item.dataset.path = fullPath;
    item.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!selectedNodes.has(fullPath)) { selectedNodes.clear(); selectedNodes.add(fullPath); updateTreeSelectionUI(); }

        const selection = Array.from(selectedNodes);
        const repoPaths = selection.filter(p => repositories.some(r => r.path.replace(/\\/g, '/').toLowerCase() === p.replace(/\\/g, '/').toLowerCase()));
        const filePaths = selection.filter(p => !repoPaths.includes(p));

        window.electronAPI.showContextMenu({
            paths: selection,
            repoPaths,
            filePaths,
            isRepoRoot: repositories.some(r => r.path.replace(/\\/g, '/').toLowerCase() === fullPath.replace(/\\/g, '/').toLowerCase())
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
        item.draggable = true; item.ondragstart = (e) => { e.dataTransfer.setData('text/plain', fullPath); e.dataTransfer.setData('source-container-id', container.id); };
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
    for (const root of rootNodes) {
        const repoPath = root.querySelector('.tree-node').dataset.path;
        const repo = repositories.find(r => r.path === repoPath);
        await restoreExpansionRecursive(root, 0, repo);
    }
}

async function restoreExpansionRecursive(container, depth, repo) {
    const node = container.querySelector('.tree-node');
    if (!node) return;
    const path = node.dataset.path.replace(/\\/g, '/').toLowerCase();

    if (expandedNodes.has(path)) {
        if (!container.querySelector('.children-container')) {
            // Need to avoid infinite recursion since toggleFolder adds to expandedNodes
            // But expandedNodes is a Set, so adding same path is fine.
            await toggleFolder(container, node.dataset.path, depth, repo);
        }

        const childrenContainer = container.querySelector('.children-container');
        if (childrenContainer) {
            const children = Array.from(childrenContainer.querySelectorAll(':scope > div'));
            for (const child of children) {
                await restoreExpansionRecursive(child, depth + 1, repo);
            }
        }
    }
}

async function showDashboard() {
    setActiveNavItem(elements.navHome);
    elements.dashboardView.style.display = 'flex';
    elements.dashboardGrid.innerHTML = '<div style="color: var(--text-muted);">Syncing workspace...</div>';

    let stats = { total: repositories.length, attention: 0, sync: 0, local: 0, unborn: 0 };
    let unbornList = [];

    // Fetch unborn folder list from root directory
    if (settings.rootRepoDir) {
        try {
            const wsStats = await window.electronAPI.getWorkspaceStats(settings.rootRepoDir);
            unbornList = wsStats.unborn || [];
            stats.unborn = unbornList.length;
        } catch (e) {}
    }

    const allCards = [];
    const dashboardRepos = [...repositories];

    // Create cards for real repositories
    const repoPromises = dashboardRepos.map(async (repo) => {
        try {
            const exists = await window.electronAPI.pathExists(repo.path);
            const card = document.createElement('div');
            card.className = 'dashboard-card';

            if (!exists) {
                return { type: 'missing' };
            }

            const status = await window.electronAPI.gitStatus(repo.path);
            const remotes = await window.electronAPI.getRemotes(repo.path);

            const isLocal = remotes.length === 0;
            const needsSync = (status.ahead || 0) > 0 || (status.behind || 0) > 0;
            const hasChanges = (status.modified || 0) + (status.not_added || 0) + (status.deleted || 0) > 0;

            if (isLocal) stats.local++;
            if (hasChanges) stats.attention++;
            if (needsSync) stats.sync++;

            const matchesFilter =
                currentDashboardFilter === 'all' ||
                (currentDashboardFilter === 'attention' && hasChanges) ||
                (currentDashboardFilter === 'sync' && needsSync) ||
                (currentDashboardFilter === 'local' && isLocal);

            if (matchesFilter) {
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
                        <div style="font-size: 10px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; opacity: 0.6;">
                            ${isLocal ? 'LOCAL' : 'REMOTE'}
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
                        <button class="button quick-btn explorer-btn" title="Open in Explorer" style="flex:1; padding:4px; font-size:11px;">EXPLORE</button>
                        <button class="button quick-btn pull-btn" title="Pull" style="flex:1; padding:4px; font-size:11px;">PULL</button>
                        <button class="button quick-btn button-primary push-btn" title="Push" style="flex:1; padding:4px; font-size:11px;">PUSH</button>
                    </div>`;

                card.querySelector('.explorer-btn').onclick = (e) => {
                    e.stopPropagation();
                    // This opens the explorer directly INSIDE the project directory
                    window.electronAPI.openPath(repo.path);
                };

                card.querySelector('.pull-btn').onclick = (e) => {
                    e.stopPropagation();
                    activeRepo = repo;
                    quickGitAction('pull');
                };

                card.querySelector('.push-btn').onclick = (e) => {
                    e.stopPropagation();
                    activeRepo = repo;
                    quickGitAction('push');
                };

                return { card, type: 'repo' };
            }
            return { type: 'repo' };
        } catch (e) {
            return null;
        }
    });

    const results = await Promise.all(repoPromises);
    results.forEach(res => { if (res && res.card) allCards.push(res.card); });

    // Handle Unborn Folders as virtual cards if filtered
    if (currentDashboardFilter === 'all' || currentDashboardFilter === 'unborn') {
        unbornList.forEach(folder => {
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
            allCards.push(card);
        });
    }

    elements.dashboardGrid.innerHTML = '';
    if (allCards.length === 0) {
        elements.dashboardGrid.innerHTML = `<div style="padding:40px; color:var(--text-muted); text-align:center; width:100%;">No projects match the "${currentDashboardFilter}" filter.</div>`;
    } else {
        allCards.forEach(c => elements.dashboardGrid.appendChild(c));
    }

    updateDashboardSummary(stats);
    updateStatusFeed(stats);
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
                showAlert(`Failed to save: ${res.error}`, 'Error');
            }
        } catch (e) {
            showAlert(`System Error: ${e.message}`, 'Error');
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
                text: `You have ${currentStats.local} local-only projects that haven't been published to GitHub yet.`,
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
            <div class="summary-card ${isActive ? 'active' : ''}" data-filter="${item.id}"
                 style="flex:1; background:var(--bg-surface); border:1px solid ${isActive ? item.color : 'var(--border-color)'}; border-radius:12px; padding:16px; cursor:pointer; transition:all 0.2s; position:relative; overflow:hidden; min-width: 120px;">

                <div style="font-size:9px; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; white-space: nowrap; margin-bottom: 12px;">${item.label}</div>

                <div style="font-size:24px; font-weight:700; color:${valColor}; line-height:1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">${item.value}</div>

                ${isActive ? `<div style="position:absolute; bottom:0; left:0; right:0; height:3px; background:${item.color};"></div>` : ''}
            </div>
        `;
    }).join('');

    summary.querySelectorAll('.summary-card').forEach(card => {
        card.onclick = () => {
            currentDashboardFilter = card.dataset.filter;
            showDashboard();
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
            return `
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:8px; background:rgba(255,255,255,0.02); border-radius:4px; margin-bottom:4px;">
                    <input type="checkbox" class="bulk-commit-item-cb" value="${repo.path}" data-name="${repo.name}" checked>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${repo.name}</div>
                        <div style="font-size:10px; color:var(--text-muted);">${total} changes pending</div>
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
                        const pushRes = await window.electronAPI.gitPush(path);

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
    elements.messageView.style.display = 'flex';
    elements.diffView.style.display = 'none';
    elements.statusView.style.display = 'none';
    document.getElementById('active-repo-name').textContent = repo.name;

    if (window.terminal) window.terminal.sendCommand(`cd "${repo.path}"`);
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
        const hasGitHub = remotes.some(r => r.url.toLowerCase().includes('github.com'));

        if (elements.publishGitHubBtn) elements.publishGitHubBtn.style.display = hasAnyRemote ? 'none' : 'inline-flex';
        if (elements.deleteGitHubBtn) elements.deleteGitHubBtn.style.display = hasGitHub ? 'inline-flex' : 'none';

        renderChangesList(activeRepo, changes);
        await updateTreeHighlights(activeRepo.path);
    } catch (e) {
        if (!silent) logToConsole(`Refresh error: ${e.message}`, 'error');
    } finally {
        if (title && !silent) title.textContent = originalText;
    }
}

async function openFileInEditor(filePath) {
    if (!monacoEditor) return;
    try {
        const content = await window.electronAPI.readFile(filePath);
        currentEditingPath = filePath;
        setActiveNavItem(null);
        elements.editorView.style.display = 'flex';
        elements.editorFileName.textContent = filePath.split(/[\\\/]/).pop();

        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = { 'js': 'javascript', 'ts': 'typescript', 'html': 'html', 'css': 'css', 'md': 'markdown', 'json': 'json', 'txt': 'plaintext' };

        elements.editorPreviewToggle.style.display = (ext === 'md') ? 'block' : 'none';
        elements.gitignoreScanBtn.style.display = (filePath.endsWith('.gitignore')) ? 'block' : 'none';

        // RESET: Always switch back to editor mode when opening a new file
        elements.markdownPreview.style.display = 'none';
        elements.monacoContainer.style.display = 'block';
        elements.editorPreviewToggle.textContent = 'Preview';
        elements.markdownPreview.innerHTML = '';

        const model = monaco.editor.createModel(content, langMap[ext] || 'plaintext');
        monacoEditor.setModel(model);
        monacoEditor.layout();
    } catch (e) { logToConsole(e.message, 'error'); }
}

async function saveCurrentFile() {
    if (!currentEditingPath || !monacoEditor) return;
    try { await window.electronAPI.writeFile(currentEditingPath, monacoEditor.getValue()); logToConsole('Saved.', 'success'); updateTreeHighlights(); } catch (e) { logToConsole(e.message, 'error'); }
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

    // Also mirror Git commands and results to the Terminal view for total transparency
    if (window.terminal && (type === 'success' || type === 'error' || msg.startsWith('Git'))) {
        const color = type === 'error' ? '\x1b[31m' : type === 'success' ? '\x1b[32m' : '\x1b[36m';
        const reset = '\x1b[0m';
        window.terminal.write(`\r\n${color}[${timestamp}] GITSCOPE: ${msg}${reset}\r\n`);
    }
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
            const changes = await window.electronAPI.getDetailedChanges(repo.path);
            const normBase = repo.path.replace(/\\/g, '/').toLowerCase();
            const normBaseSlash = normBase.endsWith('/') ? normBase : normBase + '/';
            repo.changedFiles = [...changes.staged, ...changes.unstaged, ...changes.untracked].map(f => `${normBase}/${f.replace(/\\/g, '/')}`.toLowerCase());

            const isRepoChanged = (changes.staged.length + changes.unstaged.length + changes.untracked.length) > 0;

            allNodes.forEach(node => {
                const nodePath = node.dataset.path.replace(/\\/g, '/').toLowerCase();
                const nameEl = node.querySelector('.node-name');

                if (nodePath === normBase) {
                    // Update the root repo node
                    const exists = changes.current !== 'missing';

                    if (!exists) {
                        // Project is missing, keep it red/danger
                        node.classList.add('changed-file');
                        if (nameEl) {
                            nameEl.style.color = '#da3633';
                            if (!nameEl.textContent.includes('(MISSING)')) {
                                nameEl.textContent += ' (MISSING)';
                            }
                        }
                    } else if (isRepoChanged) {
                        node.classList.add('changed-file');
                        if (nameEl) nameEl.style.color = '#f85149';
                    } else {
                        node.classList.remove('changed-file');
                        if (nameEl) {
                            nameEl.style.color = '';
                            nameEl.textContent = repo.name; // Restore name if it was missing
                        }
                    }

                    const dot = node.querySelector('.status-dot-mini');
                    if (dot) {
                        if (isRepoChanged) {
                            dot.classList.add('active');
                            dot.style.opacity = '1';
                        } else {
                            dot.classList.remove('active');
                            dot.style.opacity = '0.5';
                        }
                    }
                } else if (nodePath.startsWith(normBaseSlash)) {
                    // Update children (files/folders inside)
                    if (repo.changedFiles.includes(nodePath)) {
                        node.classList.add('changed-file');
                        if (nameEl) nameEl.style.color = '#f85149';
                    } else {
                        node.classList.remove('changed-file');
                        if (nameEl) nameEl.style.color = '';
                    }
                }
            });
        } catch (e) {}
    }
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

async function handleContextMenuCommand({ command, paths, path }) {
    const targets = paths || [path];
    if (command === 'new-file') handleNewItem('file', targets[0]);
    else if (command === 'new-folder') handleNewItem('folder', targets[0]);
    else if (command === 'open-vscode') targets.forEach(p => window.electronAPI.openVSCode(p));
    else if (command === 'open-android-studio') targets.forEach(p => window.electronAPI.openAndroidStudio(p));
    else if (command === 'open-default') targets.forEach(p => window.electronAPI.openPath(p));
    else if (command === 'reveal-in-explorer') targets.forEach(p => window.electronAPI.revealInExplorer(p));
    else if (command === 'open-editor') openFileInEditor(targets[0]);
    else if (command === 'rename') handleRename(targets[0]);
    else if (command === 'copy-move-bulk') showBulkOpModal(targets[0]);
    else if (command === 'smart-sync-wizard') showSmartSyncModal(targets[0]);
    else if (command === 'apply-patch') showPatchModal(targets[0]);
    else if (command === 'see-changes') showFileDiff(targets[0]);
    else if (command === 'create-readme') handleCreateReadme(targets[0]);
    else if (command === 'generate-gitignore') handleGenerateGitignore(targets[0]);
    else if (command === 'delete') showDeleteModal(targets);
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
    }
}

async function handleGenerateGitignore(repoPath) {
    const modal = document.getElementById('gitignore-modal');
    const list = document.getElementById('gitignore-list');
    const search = document.getElementById('gitignore-search');
    const confirmBtn = document.getElementById('gitignore-confirm');
    const cancelBtn = document.getElementById('gitignore-cancel');

    modal.style.display = 'flex';
    list.innerHTML = '<p style="padding:20px; color:var(--text-muted); text-align:center;">Loading GitHub templates...</p>';
    confirmBtn.disabled = true;
    search.value = '';

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

async function handleRename(oldPath) {
    const fileName = oldPath.split(/[\\\/]/).pop();
    elements.renameModal.style.display = 'flex';
    elements.renamePathDisplay.textContent = fileName;
    elements.renameNewName.value = fileName;
    elements.renameNewName.focus();

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
        const dangerZone = document.getElementById('github-danger-zone');
        const deleteBtn = document.getElementById('delete-github-btn');

        if (remotes.length === 0) {
            elements.remoteSelect.innerHTML = '<option value="">none</option>';
            if (dangerZone) dangerZone.style.display = 'none';
            if (elements.openRemoteBtn) elements.openRemoteBtn.style.display = 'none';
        } else {
            elements.remoteSelect.innerHTML = remotes.map(r => `<option value="${r.name}" data-url="${r.url}">${r.name}</option>`).join('');

            // INTELLIGENCE: Show GitHub Danger Zone if a GitHub remote is selected
            const updateZone = () => {
                const selected = elements.remoteSelect.options[elements.remoteSelect.selectedIndex];
                const url = selected ? selected.getAttribute('data-url') : '';
                const isGithub = url && url.toLowerCase().includes('github.com');

                if (dangerZone) {
                    dangerZone.style.display = isGithub ? 'flex' : 'none';
                }

                if (elements.openRemoteBtn) {
                    elements.openRemoteBtn.style.display = url ? 'block' : 'none';
                }
            };

            elements.remoteSelect.onchange = updateZone;
            updateZone(); // Initial check
        }

        // Add "Cool" hover effect to the Nuclear icon
        if (deleteBtn) {
            deleteBtn.onmouseenter = () => {
                deleteBtn.style.opacity = '1';
                deleteBtn.style.color = '#ff4444';
                deleteBtn.style.transform = 'scale(1.3) rotate(180deg)';
                deleteBtn.style.textShadow = '0 0 8px rgba(255, 68, 68, 0.4)';
            };
            deleteBtn.onmouseleave = () => {
                deleteBtn.style.opacity = '0.4';
                deleteBtn.style.color = 'var(--accent-red)';
                deleteBtn.style.transform = 'scale(1) rotate(0deg)';
                deleteBtn.style.textShadow = 'none';
            };
            deleteBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteGitHubRepo();
            };
        }
    } catch(e) {}
}

async function updateRepoStatus(providedStatus) {
    if (!activeRepo) return;
    // Status panel removed in redesign - logic kept for future status indicators if needed
    const status = providedStatus || await window.electronAPI.gitStatus(activeRepo.path);
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
                else showAlert(res.output, 'Apply Error');
            };

            div.querySelector('.pop-btn').onclick = async () => {
                logToConsole(`Popping stash@{${idx}}...`, 'info');
                const res = await window.electronAPI.gitStashPop(activeRepo.path, idx);
                if (res.success) {
                    logToConsole('Stash popped.', 'success');
                    await listStashes();
                    await refreshActiveRepoUI();
                } else showAlert(res.output, 'Pop Error');
            };

            div.querySelector('.drop-btn').onclick = async () => {
                if (await showConfirm(`Delete stash@{${idx}} permanently?`, 'Confirm Drop')) {
                    const res = await window.electronAPI.gitStashDrop(activeRepo.path, idx);
                    if (res.success) await listStashes();
                    else showAlert(res.output, 'Drop Error');
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

    elements.messageView.style.display = 'none';
    elements.diffView.style.display = 'flex';
    elements.statusView.style.display = 'none';
    elements.diffFileName.textContent = filePath.split(/[\\\/]/).pop();

    try {
        const repoBase = repo.path.replace(/\\/g, '/').toLowerCase();
        let relPath = normPath.replace(repoBase, '');
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
        try {
            if (type === 'file') { await window.electronAPI.writeFile(full, ''); openFileInEditor(full); }
            else await window.electronAPI.terminalInput(`mkdir "${full}"\r`);
            elements.newItemModal.style.display = 'none';
            await renderTree(elements.repoFilter.value);
            // Reveal and scroll logic
            const repo = repositories.find(r => full.toLowerCase().startsWith(r.path.toLowerCase()));
            if (repo) {
                const rootNode = Array.from(document.querySelectorAll('.repo-root')).find(n => n.dataset.path.toLowerCase() === repo.path.toLowerCase());
                // We'd need a more complex recursive reveal here, but the refresh will show it
            }
        } catch (e) { logToConsole(e.message, 'error'); }
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
        setActiveNavItem(elements.navSettings);
        elements.settingsView.style.display = 'flex';
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
    } catch (e) { logToConsole(e.message, 'error'); }
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
                showAlert(`Error creating repository: ${res.output}`, 'Error');
            }
        } catch (e) {
            logToConsole(`Creation Error: ${e.message}`, 'error');
        } finally {
            setTaskState(false);
        }
    };
    document.getElementById('create-cancel').onclick = () => modal.style.display = 'none';
}

async function showBulkOpModal(sourcePath) {
    const modal = document.getElementById('bulk-op-modal');
    const sourceList = document.getElementById('bulk-source-list');
    const targetTree = document.getElementById('bulk-target-tree');
    const switchToSmart = document.getElementById('switch-to-smart-sync');

    modal.style.display = 'flex';
    sourceList.innerHTML = '<div style="padding:10px; color:var(--text-muted);">Scanning source...</div>';
    targetTree.innerHTML = '<div style="padding:10px; color:var(--text-muted);">Loading targets...</div>';

    // 1. Populate Source (Project A) - Tree View with Single-Select Checkboxes
    try {
        const normSource = sourcePath.replace(/\\/g, '/').toLowerCase();
        const sourceRepo = repositories.find(r => normSource === r.path.toLowerCase() || normSource.startsWith(r.path.toLowerCase() + '/'));
        if (!sourceRepo) throw new Error('Source project not found.');

        sourceList.innerHTML = '';
        await buildBulkSourceTree(sourceRepo.path, sourceList, 0);

        // Ensure single selection logic for source checkboxes
        sourceList.addEventListener('change', (e) => {
            if (e.target.classList.contains('bulk-source-cb') && e.target.checked) {
                sourceList.querySelectorAll('.bulk-source-cb').forEach(cb => {
                    if (cb !== e.target) cb.checked = false;
                });
            }
        });
    } catch (e) {
        sourceList.innerHTML = `<div style="color:var(--accent-red); padding:10px;">${e.message}</div>`;
    }

    async function buildBulkSourceTree(dirPath, container, depth) {
        try {
            const children = await window.electronAPI.listDirectory(dirPath, !hideIgnoredFiles);
            for (const f of children) {
                const itemDiv = document.createElement('div');
                itemDiv.style.margin = '2px 0';
                itemDiv.style.paddingLeft = `${depth * 12}px`;

                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';

                row.innerHTML = `
                    <input type="checkbox" class="bulk-source-cb" value="${f.path}" data-name="${f.name}">
                    <span style="font-size:12px; color:#fff;">${f.isDirectory ? '📁' : '📄'} ${f.name}</span>
                `;

                itemDiv.appendChild(row);
                container.appendChild(itemDiv);

                if (f.isDirectory) {
                    const subContainer = document.createElement('div');
                    itemDiv.appendChild(subContainer);
                    await buildBulkSourceTree(f.path, subContainer, depth + 1);
                }
            }
        } catch (e) {}
    }

    // 2. Populate Target Folder Tree (All Projects) - Checkboxes
    targetTree.innerHTML = '';
    for (const repo of repositories) {
        const repoContainer = document.createElement('div');
        repoContainer.style.marginBottom = '8px';

        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.gap = '8px';
        item.style.padding = '2px 4px';

        item.innerHTML = `
            <input type="checkbox" class="bulk-target-cb" value="${repo.path}" data-repo="${repo.name}">
            <span style="font-size:12px; font-weight:600; color:var(--accent-blue);">📦 ${repo.name}</span>
            <span class="bulk-expand-trigger" style="cursor:pointer; font-size:10px; color:var(--text-muted); margin-left:auto;">[expand folders]</span>
        `;

        const expandBtn = item.querySelector('.bulk-expand-trigger');
        const childrenContainer = document.createElement('div');
        childrenContainer.style.marginLeft = '20px';
        childrenContainer.style.display = 'none';

        expandBtn.onclick = async () => {
            if (childrenContainer.style.display === 'none') {
                expandBtn.textContent = '[collapse]';
                childrenContainer.style.display = 'block';
                if (childrenContainer.innerHTML === '') {
                    await buildBulkFolderTree(repo.path, childrenContainer);
                }
            } else {
                expandBtn.textContent = '[expand folders]';
                childrenContainer.style.display = 'none';
            }
        };

        repoContainer.appendChild(item);
        repoContainer.appendChild(childrenContainer);
        targetTree.appendChild(repoContainer);
    }

    async function buildBulkFolderTree(dirPath, container) {
        try {
            const children = await window.electronAPI.listDirectory(dirPath, !hideIgnoredFiles);
            const folders = children.filter(c => c.isDirectory);

            for (const f of folders) {
                const folderDiv = document.createElement('div');
                folderDiv.style.margin = '4px 0';

                const row = document.createElement('div');
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.gap = '8px';

                row.innerHTML = `
                    <input type="checkbox" class="bulk-target-cb" value="${f.path}">
                    <span style="font-size:12px; color:#ccc;">📁 ${f.name}</span>
                `;

                const subContainer = document.createElement('div');
                subContainer.style.marginLeft = '16px';

                folderDiv.appendChild(row);
                folderDiv.appendChild(subContainer);
                container.appendChild(folderDiv);

                await buildBulkFolderTree(f.path, subContainer);
            }
        } catch (e) {}
    }

    if (switchToSmart) {
        switchToSmart.onclick = () => {
            modal.style.display = 'none';
            showSmartSyncModal(sourcePath);
        };
    }

    const perform = async (action) => {
        const selectedCb = sourceList.querySelector('input.bulk-source-cb:checked');
        if (!selectedCb) return showAlert('Select a source item to transfer.', 'Source Required');

        const srcPath = selectedCb.value;
        const srcName = selectedCb.dataset.name;

        const targets = Array.from(targetTree.querySelectorAll('input.bulk-target-cb:checked')).map(i => i.value);
        if (targets.length === 0) return showAlert('Select at least one target folder.', 'Selection Required');

        modal.style.display = 'none';
        logToConsole(`Bulk ${action} starting for ${targets.length} targets...`, 'info');
        setTaskState(true);

        try {
            for (const destDir of targets) {
                const destPath = `${destDir}/${srcName}`;
                logToConsole(`  ${action.toUpperCase()}: ${srcName} -> ${destDir}`, 'info');

                if (action === 'move') await window.electronAPI.moveFileForce(srcPath, destPath);
                else await window.electronAPI.copyFileForce(srcPath, destPath);
            }
            logToConsole(`Bulk ${action} complete.`, 'success');
        } catch (e) {
            logToConsole(`Bulk operation fatal error: ${e.message}`, 'error');
        } finally {
            setTaskState(false);
            selectedNodes.clear();
            await smartRefreshTree();
        }
    };

    document.getElementById('bulk-copy').onclick = () => perform('copy');
    document.getElementById('bulk-move').onclick = () => perform('move');
    document.getElementById('bulk-cancel').onclick = () => modal.style.display = 'none';
    modal.style.display = 'flex';
}

async function showSmartSyncModal(sourcePath) {
    const modal = elements.smartSyncModal;
    const sourceList = elements.smartSyncSourceList;
    const targetList = elements.smartSyncTargetList;
    const runBtn = elements.smartSyncRun;
    const cancelBtn = elements.smartSyncCancel;
    const sourceAll = elements.smartSyncSourceAll;
    const targetAll = elements.smartSyncTargetAll;
    const fuzzyToggle = elements.smartSyncFuzzy;

    modal.style.display = 'flex';
    sourceList.innerHTML = '<div style="padding:10px; color:var(--text-muted);">Scanning source...</div>';
    targetList.innerHTML = '';

    let sourceFolders = [];
    const targetProjects = [...repositories];

    // Helper: Logic to check matches and update UI states
    const performAutoMatch = () => {
        const useFuzzy = fuzzyToggle.checked;
        const normalize = (n) => useFuzzy ? n.toLowerCase().replace(/[\s\.\-_]/g, '') : n.toLowerCase();

        const targetNorms = targetProjects.map(p => ({ original: p, norm: normalize(p.name) }));
        const sourceNorms = sourceFolders.map(f => ({ original: f, norm: normalize(f.name) }));

        // 1. Update Target Checkboxes
        targetList.querySelectorAll('input[type="checkbox"]').forEach(input => {
            const name = input.dataset.name;
            const hasMatch = sourceNorms.some(s => s.norm === normalize(name));
            input.checked = hasMatch;
        });

        // 2. Update Source Checkboxes
        sourceList.querySelectorAll('input[type="checkbox"]').forEach(input => {
            const name = input.dataset.name;
            const hasMatch = targetNorms.some(t => t.norm === normalize(name));
            input.checked = hasMatch;
        });

        // 3. Update Select All states
        if (targetAll) {
            const allTargets = targetList.querySelectorAll('input[type="checkbox"]');
            const checkedTargets = targetList.querySelectorAll('input:checked');
            targetAll.checked = allTargets.length > 0 && allTargets.length === checkedTargets.length;
        }
        if (sourceAll) {
            const allSources = sourceList.querySelectorAll('input[type="checkbox"]');
            const checkedSources = sourceList.querySelectorAll('input:checked');
            sourceAll.checked = allSources.length > 0 && allSources.length === checkedSources.length;
        }
    };

    // 1. Populate Target Projects (Right)
    targetProjects.forEach(r => {
        const div = document.createElement('div');
        div.innerHTML = `<label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;"><input type="checkbox" value="${r.path}" data-name="${r.name}"> <span style="font-size:12px;">${r.name}</span></label>`;
        targetList.appendChild(div);
    });

    if (targetAll) {
        targetAll.onchange = () => {
            targetList.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = targetAll.checked);
        };
    }

    // 2. Populate Source Folders (Left)
    try {
        const children = await window.electronAPI.listDirectory(sourcePath, !hideIgnoredFiles);
        sourceFolders = children.filter(c => c.isDirectory);
        sourceList.innerHTML = '';

        if (sourceFolders.length === 0) {
            sourceList.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">No subfolders found in source.</div>';
        } else {
            sourceFolders.forEach(f => {
                const div = document.createElement('div');
                div.innerHTML = `<label style="display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;"><input type="checkbox" value="${f.path}" data-name="${f.name}"> <span style="font-size:12px;">${f.name}</span></label>`;
                sourceList.appendChild(div);
            });
        }

        if (sourceAll) {
            sourceAll.onchange = () => {
                sourceList.querySelectorAll('input[type="checkbox"]').forEach(i => i.checked = sourceAll.checked);
            };
        }

        // INITIAL MATCHING
        performAutoMatch();

        // RE-MATCH on fuzzy toggle
        fuzzyToggle.onchange = () => performAutoMatch();

    } catch (e) {
        sourceList.innerHTML = `<div style="color:var(--accent-red); padding:10px;">Error: ${e.message}</div>`;
    }

    cancelBtn.onclick = () => modal.style.display = 'none';

    runBtn.onclick = async () => {
        const selectedSources = Array.from(sourceList.querySelectorAll('input:checked')).map(i => ({ path: i.value, name: i.dataset.name }));
        const selectedTargets = Array.from(targetList.querySelectorAll('input:checked')).map(i => ({ path: i.value, name: i.dataset.name }));

        if (selectedSources.length === 0) return showAlert('Select at least one source folder.', 'Selection Required');
        if (selectedTargets.length === 0) return showAlert('Select at least one target project.', 'Selection Required');

        const useFuzzy = fuzzyToggle.checked;
        const useForce = elements.smartSyncOverwrite.checked;

        modal.style.display = 'none';
        logToConsole('🚀 Launching Smart Sync Distribution Engine...', 'info');
        setTaskState(true);

        try {
            const normalize = (n) => useFuzzy ? n.toLowerCase().replace(/[\s\.\-_]/g, '') : n.toLowerCase();

            for (const t of selectedTargets) {
                const targetNorm = normalize(t.name);

                // Find matching folder among SELECTED sources
                const match = selectedSources.find(src => normalize(src.name) === targetNorm);

                if (match) {
                    logToConsole(`  Match Found: ${match.name} -> ${t.name}`, 'success');
                    const contents = await window.electronAPI.listDirectory(match.path, !hideIgnoredFiles);

                    for (const item of contents) {
                        const dest = `${t.path}/${item.name}`;
                        logToConsole(`    Syncing: ${item.name} -> ${t.name} root`, 'info');

                        if (useForce) await window.electronAPI.copyFileForce(item.path, dest);
                        else await window.electronAPI.copyFile(item.path, dest);
                    }
                } else {
                    logToConsole(`  No selected folder matching "${t.name}" found in source.`, 'warn');
                }
            }
            logToConsole('Smart Sync Distribution complete.', 'success');
        } catch (e) {
            logToConsole(`Smart Sync Fatal Error: ${e.message}`, 'error');
        } finally {
            setTaskState(false);
            selectedNodes.clear();
            await smartRefreshTree();
        }
    };
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
        }
    };

    document.getElementById('patch-cancel').onclick = () => modal.style.display = 'none';
    modal.style.display = 'flex';
}

async function handleFileDrop(srcPath, destDir, destContainer, depth, sourceId) {
    const modal = document.getElementById('drop-action-modal'); modal.style.display = 'flex';
    const perform = async (type) => {
        modal.style.display = 'none'; const fileName = srcPath.split(/[\\\/]/).pop(); const destPath = `${destDir}/${fileName}`; if (srcPath === destPath) return;
        try { const res = type === 'move' ? await window.electronAPI.moveFile(srcPath, destPath) : await window.electronAPI.copyFile(srcPath, destPath); if (res.success) renderTree(); } catch (e) {}
    };
    document.getElementById('drop-move').onclick = () => perform('move'); document.getElementById('drop-copy').onclick = () => perform('copy'); document.getElementById('drop-cancel').onclick = () => modal.style.display = 'none';
}

async function toggleMarkdownPreview() {
    if (elements.monacoContainer.style.display !== 'none') {
        const content = monacoEditor.getValue();
        let html = typeof marked !== 'undefined' ? marked.parse(content) : '<p>Parser fail.</p>';

        // INTELLIGENCE: Resolve relative image paths
        if (currentEditingPath) {
            // Get directory of the current file
            const lastSlash = Math.max(currentEditingPath.lastIndexOf('/'), currentEditingPath.lastIndexOf('\\'));
            const dir = currentEditingPath.substring(0, lastSlash);

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;

            const images = tempDiv.querySelectorAll('img');
            images.forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:')) {
                    // It's a relative path, convert to absolute file URL
                    const absolutePath = dir + '/' + src;
                    img.src = 'file:///' + absolutePath.replace(/\\/g, '/');
                    img.style.maxWidth = '100%'; // Pro styling: ensure large banners don't overflow
                }
            });
            html = tempDiv.innerHTML;
        }

        elements.markdownPreview.innerHTML = html;
        elements.monacoContainer.style.display = 'none';
        elements.markdownPreview.style.display = 'block';
        elements.editorPreviewToggle.textContent = 'Source';
    } else {
        elements.markdownPreview.style.display = 'none'; elements.monacoContainer.style.display = 'block';
        elements.editorPreviewToggle.textContent = 'Preview'; monacoEditor.layout();
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
            }
        }
        if (successCount > 0) logToConsole(`Successfully moved ${successCount} items to Recycle Bin.`, 'success');
        modal.style.display = 'none';
        selectedNodes.clear();
        await smartRefreshTree();
    };
    document.getElementById('delete-cancel').onclick = () => modal.style.display = 'none';
}

console.log('GitScope Professional logic loaded.');


