const { app, BrowserWindow, Menu, dialog, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const { scanDirectory, listDirectory, getUnbornFolders } = require('./lib/git-scanner');
const gitActions = require('./lib/git-actions');
const githubApi = require('./lib/github-api');
const chokidar = require('chokidar');
const pty = require('node-pty');
const os = require('os');

let mainWindow;
let watcher;
let ptyProcess;
const configPath = path.join(app.getPath('userData'), 'config.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');
const themesPath = path.join(app.getPath('userData'), 'themes.json');

function getThemes() {
  try {
    if (fs.existsSync(themesPath)) {
      return fs.readJsonSync(themesPath);
    }
  } catch (e) {
    console.error('Failed to get themes:', e);
  }
  return {};
}

function saveThemes(themes) {
  fs.writeJsonSync(themesPath, themes);
}

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return fs.readJsonSync(settingsPath);
    }
  } catch (e) {
    console.error('Failed to get settings:', e);
  }
  return {
    shell: process.platform === 'win32' ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' : '/bin/bash',
    rootRepoDir: '',
    githubToken: ''
  };
}

function saveSettings(settings) {
  fs.writeJsonSync(settingsPath, settings);
}

function getWindowState() {
  try {
    if (fs.existsSync(windowStatePath)) {
      return fs.readJsonSync(windowStatePath);
    }
  } catch (e) {
    console.error('Failed to get window state:', e);
  }
  return { width: 1200, height: 800 };
}

function saveWindowState() {
  const bounds = mainWindow.getBounds();
  const state = {
    ...bounds,
    isMaximized: mainWindow.isMaximized()
  };
  fs.writeJsonSync(windowStatePath, state);
}

function createWindow() {
  const state = getWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    show: false, // Don't show until content is ready to prevent white flash
    backgroundColor: '#0d1117', // Match app's dark theme
    icon: path.join(__dirname, 'ICON.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false, // Tiny perf boost
    },
  });

  // Performance: Show window as soon as content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();

    // Defer heavy background work until window is visible
    setTimeout(() => {
        setupPTY();
        try {
            if (fs.existsSync(configPath)) {
                const config = fs.readJsonSync(configPath);
                if (config.repositories) setupWatcher(config.repositories);
            }
        } catch(e) {}
    }, 100);
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Intelligence: Open all external links in the default browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const indexPath = path.join(__dirname, 'renderer', 'index.html').replace(/\\/g, '/');
    const normalizedUrl = url.replace(/\\/g, '/');

    if (!normalizedUrl.includes(indexPath) && url !== 'about:blank') {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const indexPath = path.join(__dirname, 'renderer', 'index.html').replace(/\\/g, '/');
    const normalizedUrl = url.replace(/\\/g, '/');

    if (!normalizedUrl.includes(indexPath)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('close', saveWindowState);
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Repo',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            mainWindow.webContents.send('trigger-add-repo');
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  // Menu.setApplicationMenu(menu); // Disable native menu to use custom nav
  mainWindow.setMenuBarVisibility(false);
}

function getAvailableShells() {
  const shells = [];
  const win = process.platform === 'win32';

  if (win) {
    shells.push({ name: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' });
    shells.push({ name: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' });
  } else {
    shells.push({ name: 'Bash', path: '/bin/bash' });
  }
  return shells;
}

ipcMain.handle('get-available-shells', () => {
  return getAvailableShells();
});

ipcMain.handle('heartbeat', () => "OK");

ipcMain.handle('send-notification', (event, { title, body }) => {
  if (mainWindow && !mainWindow.isFocused()) {
    if (Notification.isSupported()) {
      new Notification({
        title,
        body,
        icon: path.join(__dirname, 'ICON.png')
      }).show();
      return true;
    }
  }
  return false;
});

function setupPTY() {
  const settings = getSettings();
  const defaultShell = process.platform === 'win32'
    ? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    : '/bin/bash';
  const shell = settings.shell || defaultShell;

  if (ptyProcess) {
    try { ptyProcess.kill(); } catch(e) {}
  }

  // Determine and validate CWD to prevent Error 267 (Invalid Directory)
  let workingDir = settings.rootRepoDir || process.env.HOME || process.env.USERPROFILE || process.cwd();

  // Final safety check: If the path doesn't exist, fallback to the app's current directory
  if (!fs.existsSync(workingDir)) {
    console.warn(`PTY: Directory ${workingDir} not found, falling back to process.cwd()`);
    workingDir = process.cwd();
  }

  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workingDir,
      env: process.env,
      useConpty: true // Force official Windows ConPTY engine
    });

    ptyProcess.on('data', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('terminal-data', data);
      }
    });

    // Re-bind input
    ipcMain.removeAllListeners('terminal-input');
    ipcMain.on('terminal-input', (event, data) => {
      if (ptyProcess) ptyProcess.write(data);
    });

    ipcMain.removeAllListeners('terminal-resize');
    ipcMain.on('terminal-resize', (event, data) => {
      const { cols, rows } = data || {};
      if (ptyProcess && cols > 0 && rows > 0) {
          try {
              ptyProcess.resize(cols, rows);
          } catch (e) {
              console.error('Terminal resize failed:', e);
          }
      }
    });
  } catch (err) {
    console.error('Failed to spawn PTY:', err);
    // Notify the renderer so the user knows why the terminal is dead
    if (mainWindow) {
      mainWindow.webContents.send('terminal-data', `\r\n\x1b[31m[ERROR] Failed to start terminal: ${err.message}\x1b[0m\r\n`);
    }
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers
ipcMain.handle('open-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Executables', extensions: ['exe', 'cmd', 'bat'] }]
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, options);
  return canceled ? null : filePath;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, options);
  return canceled ? null : filePaths[0];
});

ipcMain.handle('scan-directory', async (event, path) => {
  return await scanDirectory(path);
});

ipcMain.handle('list-directory', async (event, path, showIgnored) => {
  return await listDirectory(path, showIgnored);
});

ipcMain.handle('search-files', async (event, repoPath, query) => {
    try {
        const simpleGit = require('simple-git');
        const git = simpleGit(repoPath);
        // Use ls-files for speed (tracked files)
        // Also use --others --exclude-standard to get untracked but non-ignored files
        const files = await git.raw(['ls-files', '-c', '-o', '--exclude-standard']);
        const allFiles = files.split('\n').filter(f => f.trim() !== '');

        const lowerQuery = query.toLowerCase();
        const matches = allFiles.filter(f => f.toLowerCase().includes(lowerQuery));

        // Return max 100 matches per repo for performance
        return matches.slice(0, 100);
    } catch (e) {
        console.error('Search failed:', e);
        return [];
    }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (e) {
    throw e;
  }
});

ipcMain.handle('create-directory', async (event, path) => {
  try {
    await fs.ensureDir(path);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-file-base64', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  } catch (e) {
    throw e;
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (e) {
    throw e;
  }
});

ipcMain.handle('move-file', async (event, src, dest) => {
  try {
    await fs.move(src, dest, { overwrite: false });
    return { success: true };
  } catch (err) {
    if (err.message.includes('already exists') || err.code === 'EEXIST') {
      return { success: false, error: 'exists', src, dest };
    }
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-file-force', async (event, src, dest) => {
  await fs.move(src, dest, { overwrite: true });
  return { success: true };
});

ipcMain.handle('copy-file', async (event, src, dest) => {
    try {
      await fs.copy(src, dest, { overwrite: false, errorOnExist: true });
      return { success: true };
    } catch (err) {
      if (err.message.includes('already exists') || err.code === 'EEXIST') {
        return { success: false, error: 'exists', src, dest };
      }
      return { success: false, error: err.message };
    }
});

ipcMain.handle('copy-file-force', async (event, src, dest) => {
  await fs.copy(src, dest, { overwrite: true });
  return { success: true };
});

ipcMain.handle('git-status', async (event, path) => {
  return await gitActions.getStatus(path);
});

ipcMain.handle('git-raw-status', async (event, path) => {
  return await gitActions.getRawStatus(path);
});

ipcMain.handle('git-stash-save', async (event, path, message) => {
  return await gitActions.stashSave(path, message);
});

ipcMain.handle('git-stash-list', async (event, path) => {
  return await gitActions.stashList(path);
});

ipcMain.handle('git-stash-pop', async (event, path, index) => {
  return await gitActions.stashPop(path, index);
});

ipcMain.handle('git-stash-apply', async (event, path, index) => {
  return await gitActions.stashApply(path, index);
});

ipcMain.handle('git-stash-drop', async (event, path, index) => {
  return await gitActions.stashDrop(path, index);
});

ipcMain.handle('git-pull', async (event, path) => {
  return await gitActions.pull(path);
});

ipcMain.handle('git-fetch', async (event, path) => {
  return await gitActions.fetch(path);
});

ipcMain.handle('git-push', async (event, path) => {
  return await gitActions.push(path);
});

ipcMain.handle('git-publish-sequence', async (event, path, cloneUrl) => {
  return await gitActions.publishSequence(path, cloneUrl);
});

ipcMain.handle('git-get-commits', async (event, path) => {
  return await gitActions.getCommits(path);
});

ipcMain.handle('git-revert-to-commit', async (event, path, hash) => {
  return await gitActions.revertToCommit(path, hash);
});

ipcMain.handle('git-create-branch', async (event, path, branchName) => {
  return await gitActions.createBranch(path, branchName);
});

ipcMain.handle('git-delete-branch', async (event, path, branchName) => {
  return await gitActions.deleteBranch(path, branchName);
});

ipcMain.handle('git-rename-branch', async (event, path, oldName, newName) => {
  return await gitActions.renameBranch(path, oldName, newName);
});

ipcMain.handle('git-restore-to-head', async (event, path) => {
  return await gitActions.restoreToHead(path);
});

ipcMain.handle('git-nuke-reinit', async (event, path) => {
  return await gitActions.nukeAndReinit(path);
});

ipcMain.handle('git-restore-file', async (event, path, filePath) => {
  return await gitActions.restoreFile(path, filePath);
});

ipcMain.handle('git-commit', async (event, path, message) => {
  return await gitActions.commit(path, message);
});

ipcMain.handle('rename-item', async (event, oldPath, newPath) => {
  try {
    await fs.rename(oldPath, newPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('git-stage-all', async (event, path) => {
  return await gitActions.stageAllChanges(path);
});

ipcMain.handle('git-stage-file', async (event, path, filePath) => {
  return await gitActions.stageFile(path, filePath);
});

ipcMain.handle('git-unstage-all', async (event, path) => {
  return await gitActions.unstageAllChanges(path);
});

ipcMain.handle('git-unstage-file', async (event, path, filePath) => {
  return await gitActions.unstageFile(path, filePath);
});

ipcMain.handle('git-stop-tracking', async (event, path, filePath) => {
  return await gitActions.stopTracking(path, filePath);
});

ipcMain.handle('git-start-tracking', async (event, path, filePath) => {
  return await gitActions.startTracking(path, filePath);
});

ipcMain.handle('git-is-tracked', async (event, path, filePath) => {
  return await gitActions.isTracked(path, filePath);
});

ipcMain.handle('git-subtree-push', async (event, path, prefix, remoteUrl, branch, force) => {
  return await gitActions.subtreePush(path, prefix, remoteUrl, branch, force);
});

ipcMain.handle('git-get-branches', async (event, path) => {
  return await gitActions.getBranches(path);
});

ipcMain.handle('git-get-remotes', async (event, path) => {
  return await gitActions.getRemotes(path);
});

ipcMain.handle('git-add-remote', async (event, path, name, url) => {
  return await gitActions.addRemote(path, name, url);
});

ipcMain.handle('git-remove-remote', async (event, path, name) => {
  return await gitActions.removeRemote(path, name);
});

ipcMain.handle('git-switch-branch', async (event, path, branchName) => {
  return await gitActions.switchBranch(path, branchName);
});

ipcMain.handle('git-get-full-diff', async (event, path) => {
  return await gitActions.getFullDiff(path);
});

ipcMain.handle('git-get-staged-diff', async (event, path) => {
  return await gitActions.getStagedDiff(path);
});

ipcMain.handle('generate-commit-msg', async (event, diff) => {
  if (!diff || diff.trim() === '') return 'chore: minor updates';

  const lines = diff.split('\n');
  const filesChanged = new Set();
  let additions = 0;
  let deletions = 0;
  let hasLogicChanges = false;
  let hasStyleChanges = false;
  let hasDocChanges = false;
  let hasConfigChanges = false;

  const typeKeywords = {
    fix: ['fix', 'bug', 'error', 'crash', 'issue', 'handle', 'catch'],
    feat: ['add', 'new', 'implement', 'create', 'setup'],
    refactor: ['cleanup', 'rename', 'move', 'optimize', 'refactor']
  };

  let detectedType = 'chore';
  let foundKeywords = [];

  lines.forEach(line => {
    const lowerLine = line.toLowerCase();

    if (line.startsWith('+++ b/')) {
      const fileName = line.replace('+++ b/', '').trim();
      filesChanged.add(fileName);
      if (fileName.endsWith('.js') || fileName.endsWith('.ts') || fileName.endsWith('.kt') || fileName.endsWith('.java')) hasLogicChanges = true;
      if (fileName.endsWith('.css') || fileName.endsWith('.scss') || fileName.endsWith('.html')) hasStyleChanges = true;
      if (fileName.endsWith('.md') || fileName.endsWith('.txt')) hasDocChanges = true;
      if (fileName.includes('package.json') || fileName.includes('config')) hasConfigChanges = true;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
      for (const [type, keys] of Object.entries(typeKeywords)) {
        if (keys.some(k => lowerLine.includes(k))) {
          foundKeywords.push(type);
        }
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  });

  if (hasDocChanges && filesChanged.size === 1) detectedType = 'docs';
  else if (hasStyleChanges && !hasLogicChanges) detectedType = 'style';
  else if (foundKeywords.includes('fix')) detectedType = 'fix';
  else if (foundKeywords.includes('feat') || additions > deletions * 2) detectedType = 'feat';
  else if (foundKeywords.includes('refactor') || (additions > 0 && additions === deletions)) detectedType = 'refactor';
  else if (hasConfigChanges) detectedType = 'chore';

  const fileList = Array.from(filesChanged);
  const styles = [
    () => {
      let summary = '';
      if (fileList.length === 1) summary = `modify ${path.basename(fileList[0])}`;
      else {
        const dirs = new Set(fileList.map(f => path.dirname(f).split(path.sep).pop()));
        const dirList = Array.from(dirs).filter(d => d && d !== '.');
        summary = dirList.length === 1 ? `update components in ${dirList[0]}` : `update ${fileList.length} files`;
      }
      return `${detectedType}: ${summary} (+${additions}/-${deletions})`;
    },
    () => {
      const action = detectedType === 'feat' ? 'Implement' : detectedType === 'fix' ? 'Resolve issue in' : 'Update';
      const target = fileList.length === 1 ? path.basename(fileList[0]) : `${fileList.length} resources`;
      return `${detectedType}: ${action} ${target} with ${additions} changes`;
    },
    () => {
      return `${detectedType}: atomic update to ${fileList.length} modules (${additions} insertions)`;
    }
  ];

  // Pick a random style for variety if called multiple times
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  return randomStyle();
});

ipcMain.handle('git-changed-files', async (event, path) => {
  return await gitActions.getChangedFiles(path);
});

ipcMain.handle('git-detailed-changes', async (event, path) => {
  return await gitActions.getDetailedChanges(path);
});

ipcMain.handle('git-file-diff', async (event, repoPath, filePath) => {
  return await gitActions.getFileDiff(repoPath, filePath);
});

ipcMain.handle('git-get-patch', async (event, repoPath, filePath) => {
  return await gitActions.getFilePatch(repoPath, filePath);
});

ipcMain.handle('git-apply-patch', async (event, repoPath, patchString) => {
  return await gitActions.applyPatch(repoPath, patchString);
});

ipcMain.handle('get-workspace-stats', async (event, rootPath) => {
  const unborn = await getUnbornFolders(rootPath);
  return { unborn };
});

ipcMain.handle('get-repositories', async () => {
  try {
    if (fs.existsSync(configPath)) {
      const config = await fs.readJson(configPath);
      return config.repositories || [];
    }
  } catch (e) {}
  return [];
});

ipcMain.handle('save-repositories', async (event, repos) => {
  await fs.writeJson(configPath, { repositories: repos });
  setupWatcher(repos);
});

function setupWatcher(repos) {
  if (watcher) watcher.close();
  const pathsToWatch = repos.map(r => r.path);
  if (pathsToWatch.length === 0) return;

  // We watch the whole project but with specific exclusions.
  // CRITICAL: We DO NOT ignore .git entirely, we need to see .git/index changes to detect commits/staging
  watcher = chokidar.watch(pathsToWatch, {
    ignored: (p) => {
        // Ignore heavy folders that never contain relevant git source
        if (p.includes('node_modules') || p.includes('dist') || p.includes('build') || p.includes('.vs') || p.includes('.idea')) return true;
        // Ignore .git subfolders EXCEPT for index and refs (where commit/stage info lives)
        if (p.includes('.git') && !p.endsWith('index') && !p.includes('refs')) return true;
        return false;
    },
    persistent: true,
    ignoreInitial: true,
    depth: 10 // Increase depth to catch changes in subfolders
  });

  const handleChange = (p) => {
    if (mainWindow) mainWindow.webContents.send('external-change', p);
  };

  watcher.on('add', handleChange).on('change', handleChange).on('unlink', handleChange);
}

ipcMain.handle('path-exists', async (event, path) => {
  return fs.existsSync(path);
});

ipcMain.handle('get-settings', async () => {
  return getSettings();
});

ipcMain.handle('save-settings', async (event, settings) => {
  const oldSettings = getSettings();
  saveSettings(settings);

  // If shell changed, restart PTY
  if (oldSettings.shell !== settings.shell) {
    setupPTY();
  }
  return { success: true };
});

ipcMain.handle('git-init', async (event, targetPath) => {
    return await gitActions.initRepository(targetPath);
});

ipcMain.handle('git-clone', async (event, url, dest) => {
    try {
      const simpleGit = require('simple-git');
      const git = simpleGit();
      await git.clone(url, dest);
      return { success: true };
    } catch (e) {
      return { success: false, output: e.message };
    }
});

ipcMain.handle('github-fetch-repos', async (event, token) => {
  try {
    return await githubApi.fetchUserRepos(token);
  } catch (e) {
    throw e;
  }
});

ipcMain.handle('github-fetch-gitignore-templates', async () => {
  return await githubApi.fetchGitignoreTemplates();
});

ipcMain.handle('github-fetch-gitignore-content', async (event, name) => {
  return await githubApi.fetchGitignoreTemplateContent(name);
});

ipcMain.handle('github-create-repo', async (event, token, name, isPrivate) => {
  return await githubApi.createRepo(token, name, isPrivate);
});

ipcMain.handle('github-delete-repo', async (event, token, owner, repo) => {
  return await githubApi.deleteRepo(token, owner, repo);
});

ipcMain.handle('get-git-config', async () => {
  const gitconfigPath = path.join(os.homedir(), '.gitconfig');
  try {
    if (await fs.pathExists(gitconfigPath)) {
      const content = await fs.readFile(gitconfigPath, 'utf8');
      return { success: true, content, path: gitconfigPath };
    }

    // Default recommended config template
    const defaultContent = `[user]
	name =
	email =

[core]
	pager = less
	autocrlf = false

[init]
	defaultBranch = main

[pull]
	rebase = true

[color]
	ui = auto

[diff]
	algorithm = histogram
	colorMoved = default

[merge]
	conflictStyle = zdiff3

[credential]
	helper = manager

[push]
	autoSetupRemote = true
	default = simple
`;
    return { success: true, content: defaultContent, path: gitconfigPath, isNew: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('save-git-config', async (event, content) => {
  const gitconfigPath = path.join(os.homedir(), '.gitconfig');
  const tempPath = gitconfigPath + '.GS_TEMP';

  let lastError;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      // Step 1: Force attributes off (Windows specific)
      if (process.platform === 'win32') {
        try {
          const { execSync } = require('child_process');
          execSync(`attrib -r -s -h "${gitconfigPath}"`);
        } catch (e) {}
      }

      // Step 2: Use an atomic write-then-rename strategy
      // This is more reliable on Windows when other tools are watching the file
      await fs.writeFile(tempPath, content, 'utf8');

      // Step 3: Replace original (Move/Rename is often allowed even if open for reading)
      await fs.move(tempPath, gitconfigPath, { overwrite: true });

      return { success: true };
    } catch (e) {
      lastError = e;
      console.error(`GitConfig Write Attempt ${attempt} failed: ${e.code}`);

      // Cleanup temp if it exists
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e2) {}

      if (e.code === 'EPERM' || e.code === 'EBUSY') {
        // Wait longer on later attempts
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      break;
    }
  }

  return { success: false, error: lastError ? `${lastError.code}: ${lastError.message}` : 'Access Denied' };
});

ipcMain.handle('reset-app', async () => {
  try {
    if (fs.existsSync(configPath)) await fs.remove(configPath);
    if (fs.existsSync(settingsPath)) await fs.remove(settingsPath);
    if (fs.existsSync(windowStatePath)) await fs.remove(windowStatePath);
    if (fs.existsSync(themesPath)) await fs.remove(themesPath);
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('get-themes', async () => {
  return getThemes();
});

ipcMain.handle('save-theme', async (event, { name, ini }) => {
  const themes = getThemes();
  themes[name] = ini;
  saveThemes(themes);
  return { success: true };
});

ipcMain.handle('delete-theme', async (event, name) => {
  const themes = getThemes();
  delete themes[name];
  saveThemes(themes);
  return { success: true };
});

ipcMain.handle('export-settings', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export GitScope Settings',
    defaultPath: 'gitscope_settings_backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (canceled) return { success: false };

  try {
    const backup = {
      settings: getSettings(),
      repositories: fs.existsSync(configPath) ? fs.readJsonSync(configPath).repositories : [],
      themes: getThemes()
    };
    await fs.writeJson(filePath, backup, { spaces: 2 });
    return { success: true, path: filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('import-settings', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import GitScope Settings',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (canceled) return { success: false };

  try {
    const backup = await fs.readJson(filePaths[0]);
    if (backup.settings) saveSettings(backup.settings);
    if (backup.repositories) await fs.writeJson(configPath, { repositories: backup.repositories });
    if (backup.themes) saveThemes(backup.themes);

    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-in-vscode', async (event, filePath) => {
  const { exec } = require('child_process');
  exec(`code "${filePath}"`, (error) => {
    if (error) console.error('VS Code launch failed:', error);
  });
});

ipcMain.handle('open-in-android-studio', async (event, filePath) => {
  const { exec } = require('child_process');
  const nativePath = path.win32.normalize(filePath);

  // Strategy: Try command first, then known common installation paths
  const commands = [
    `studio64 "${nativePath}"`,
    `studio "${nativePath}"`,
    `"C:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe" "${nativePath}"`,
    `"%LOCALAPPDATA%\\Android\\Android Studio\\bin\\studio64.exe" "${nativePath}"`
  ];

  const tryNext = (index) => {
    if (index >= commands.length) {
      console.error('Android Studio could not be located or launched.');
      return;
    }
    exec(commands[index], (error) => {
      if (error) {
        console.warn(`Attempt ${index + 1} failed: ${commands[index]}`);
        tryNext(index + 1);
      }
    });
  };

  tryNext(0);
});

ipcMain.handle('open-external-terminal', async (event, repoPath) => {
  const { spawn } = require('child_process');
  // -d sets the starting directory to the repository path
  spawn('wt.exe', ['-d', repoPath], {
      detached: true,
      stdio: 'ignore',
      shell: true
  }).unref();
});

ipcMain.handle('open-path', async (event, filePath) => {
  const nativePath = path.win32.normalize(filePath);
  shell.openPath(nativePath);
});

ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('reveal-in-explorer', async (event, filePath) => {
  const nativePath = path.win32.normalize(filePath);
  shell.showItemInFolder(nativePath);
});

ipcMain.handle('trash-item', async (event, filePath) => {
  try {
    // Ensure path is absolute and uses native separators for Electron shell API
    const nativePath = path.resolve(filePath);
    await shell.trashItem(nativePath);
    return { success: true };
  } catch (e) {
    console.error('Trash Error:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('show-context-menu', (event, options) => {
  if (options.type === 'terminal') {
    const template = [
      { label: 'Copy', click: () => event.sender.send('terminal-command', 'copy') },
      { label: 'Paste', click: () => event.sender.send('terminal-command', 'paste') },
      { type: 'separator' },
      { label: 'Select All', click: () => event.sender.send('terminal-command', 'select-all') },
      { type: 'separator' },
      { label: 'Clear Terminal', click: () => event.sender.send('terminal-command', 'clear') }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup(BrowserWindow.fromWebContents(event.sender));
    return;
  }

  if (options.type === 'console') {
    const template = [
      { label: 'Copy', click: () => event.sender.send('console-command', 'copy') },
      { label: 'Select All', click: () => event.sender.send('console-command', 'select-all') },
      { type: 'separator' },
      { label: 'Clear Console Output', click: () => event.sender.send('console-command', 'clear') }
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup(BrowserWindow.fromWebContents(event.sender));
    return;
  }

  const paths = options.paths || [options.path];

  // Intelligence: Categorize the selection to provide accurate labels
  const repoPaths = options.repoPaths || [];
  const filePaths = options.filePaths || [];

  const repoCount = repoPaths.length;
  const fileCount = filePaths.length;
  const totalCount = paths.length;
  const isMulti = totalCount > 1;

  const template = [];

  if (options.isDirectory || options.isRepoRoot) {
    template.push({
      label: 'New',
      submenu: [
        {
          label: 'File',
          click: () => event.sender.send('context-menu-command', { command: 'new-file', path: paths[0] })
        },
        {
          label: 'Folder',
          click: () => event.sender.send('context-menu-command', { command: 'new-folder', path: paths[0] })
        }
      ]
    });
    template.push({ type: 'separator' });
  }

  template.push(
    {
      label: 'Open',
      submenu: [
        {
          label: isMulti ? `In Android Studio (${totalCount})` : 'In Android Studio',
          click: () => event.sender.send('context-menu-command', { command: 'open-android-studio', paths })
        },
        {
          label: isMulti ? `In VS Code (${totalCount})` : 'In VS Code',
          click: () => event.sender.send('context-menu-command', { command: 'open-vscode', paths })
        },
        { type: 'separator' },
        {
          label: isMulti ? `With Default App (${totalCount})` : 'With Default App',
          click: () => event.sender.send('context-menu-command', { command: 'open-default', paths })
        },
        {
          label: isMulti ? `Show in Folder (${totalCount})` : 'Show in Folder',
          click: () => event.sender.send('context-menu-command', { command: 'reveal-in-explorer', paths })
        }
      ]
    }
  );

  if (!options.isRepoRoot) {
    template.push({ type: 'separator' });
    template.push({
      label: options.isTracked ? 'Stop Tracking' : 'Start Tracking',
      click: () => event.sender.send('context-menu-command', {
        command: options.isTracked ? 'stop-tracking' : 'start-tracking',
        path: paths[0],
        repoPath: options.repoPath
      })
    });
    template.push({ type: 'separator' });
    if (!isMulti) {
      template.push({
        label: 'See Changes',
        click: () => event.sender.send('context-menu-command', { command: 'see-changes', path: paths[0] })
      });

      const subtreeSubmenu = [
        {
          label: 'Manage Subtrees...',
          click: () => event.sender.send('context-menu-command', { command: 'manage-subtrees', path: paths[0] })
        }
      ];

      if (options.isDirectory) {
          subtreeSubmenu.push({
            label: 'Add as Subtree Mapping',
            click: () => event.sender.send('context-menu-command', { command: 'add-subtree', path: paths[0] })
          });
      }

      template.push({
        label: 'Subtrees',
        submenu: subtreeSubmenu
      });

      template.push({
        label: 'Rename',
        click: () => event.sender.send('context-menu-command', { command: 'rename', path: paths[0] })
      });
    }
    template.push({
      label: isMulti ? `Delete ${totalCount} items to Recycle Bin` : 'Delete to Recycle Bin',
      click: () => event.sender.send('context-menu-command', { command: 'delete', paths })
    });
  } else {
    template.push({ type: 'separator' });
    template.push({
      label: 'Git & Maintenance',
      submenu: [
        {
          label: 'Manage Subtrees...',
          click: () => event.sender.send('context-menu-command', { command: 'manage-subtrees', path: paths[0] })
        },
        { type: 'separator' },
        {
          label: 'Create README.md',
          click: () => event.sender.send('context-menu-command', { command: 'create-readme', path: paths[0] })
        },
        {
          label: 'Generate .gitignore',
          click: () => event.sender.send('context-menu-command', { command: 'generate-gitignore', path: paths[0] })
        }
      ]
    });
    template.push({ type: 'separator' });
    template.push({
      label: repoCount > 1 ? `Remove ${repoCount} projects from Workspace` : 'Remove from Workspace',
      click: () => event.sender.send('context-menu-command', { command: 'remove', paths: repoPaths })
    });
  }

  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});
