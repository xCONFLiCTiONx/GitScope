const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs-extra');

function clearGitLock(repoPath) {
  if (!fs.existsSync(repoPath)) return;
  const lockFile = path.join(repoPath, '.git', 'index.lock');
  if (fs.existsSync(lockFile)) {
    try {
      fs.removeSync(lockFile);
      console.log(`Cleared stale lock: ${lockFile}`);
    } catch (e) {
      console.warn(`Failed to clear lock: ${lockFile}`, e);
    }
  }
}

async function getStatus(repoPath, options = { includeIgnored: true }) {
  try {
    if (!fs.existsSync(repoPath)) {
      return {
        modified: 0,
        not_added: 0,
        deleted: 0,
        staged: 0,
        ahead: 0,
        behind: 0,
        current: 'MISSING',
        error: 'Directory not found',
      };
    }

    const details = await getDetailedChanges(repoPath, options);

    return {
      modified: details.unstaged.length,
      not_added: details.untracked.length,
      deleted: details.deleted ? details.deleted.length : 0,
      staged: details.staged.length,
      ahead: details.ahead,
      behind: details.behind,
      current: details.current,
      details: details,
    };
  } catch (e) {
    console.error('getStatus failed:', e);
    return {
      modified: 0,
      not_added: 0,
      deleted: 0,
      staged: 0,
      ahead: 0,
      behind: 0,
      current: 'error',
      error: e.message,
    };
  }
}

async function getRawStatus(repoPath) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    const status = await git.raw(['status']);
    return { success: true, output: status };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function pull(repoPath, force = false) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    const options = force ? ['--force'] : [];
    const response = await git.pull(undefined, undefined, options);
    return { success: true, output: JSON.stringify(response, null, 2) };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function fetch(repoPath) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    const response = await git.fetch();
    return { success: true, output: JSON.stringify(response, null, 2) };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function merge(repoPath) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    // Standard git merge with no arguments merges the tracking branch
    const res = await git.raw(['merge']);
    return { success: true, output: res };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function push(repoPath, force = false) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    const status = await git.status();
    // Use raw push with -u to set upstream tracking automatically
    const args = ['push', '-u', 'origin', status.current];
    if (force) args.push('--force');

    const res = await git.raw(args);
    return {
      success: true,
      output: `Pushed to origin/${status.current} and set as upstream.\n${res}`,
    };
  } catch (e) {
    try {
      // Fallback: Just simple push
      const options = force ? ['--force'] : [];
      const res = await git.push(undefined, undefined, options);
      return { success: true, output: JSON.stringify(res, null, 2) };
    } catch (e2) {
      return { success: false, output: e.message };
    }
  }
}

async function commit(repoPath, message, amend = false) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    console.log(`Backend: Starting commit in ${repoPath} (amend: ${amend})`);

    // Force clear Git index lock (Windows specific safety)
    clearGitLock(repoPath);

    // Commit using raw command for maximum Windows reliability
    console.log(`Backend: Executing commit with message: ${message}`);

    const args = ['commit'];
    if (amend) args.push('--amend');

    if (message) {
      args.push('-m', message);
    } else if (amend) {
      args.push('--no-edit');
    }

    const res = await git.raw(args);

    console.log('Backend: Commit successful');
    return { success: true, output: res };
  } catch (e) {
    console.error('Backend: Commit Error:', e);
    // If it's just "nothing to commit", return as error but with clean message
    if (e.message.includes('nothing to commit')) {
      return { success: false, output: 'Nothing to commit (working tree clean).' };
    }
    return { success: false, output: e.message };
  }
}

async function getBranches(repoPath) {
  if (!fs.existsSync(repoPath)) return { current: 'missing', all: [] };
  const git = simpleGit(repoPath);
  try {
    // Get all branches (local and remote)
    const summary = await git.branch();

    let current = summary.current;
    let all = summary.all;

    // Handle unborn repository state (e.g., immediately after git init)
    if (all.length === 0) {
      try {
        // Check what HEAD is pointing to
        const head = await git.raw(['rev-parse', '--abbrev-ref', 'HEAD']);
        current = head.trim();
        all = [current];
      } catch (e) {
        // If even rev-parse fails, default to 'main' for the UI
        current = current || 'main';
        all = [current];
      }
    }

    // INTELLIGENT DEDUPLICATION
    // Filter out redundant remote tracking entries (e.g., 'remotes/origin/main' if 'main' exists)
    const cleaned = new Set();
    all.forEach((b) => {
      // Remove common prefixes
      let name = b.replace(/^remotes\/[^\/]+\//, '');
      cleaned.add(name);
    });

    return {
      current: current,
      all: Array.from(cleaned).sort(),
    };
  } catch (e) {
    console.error('Error fetching branches:', e);
    return { current: 'main', all: ['main'] };
  }
}

async function switchBranch(repoPath, branchName) {
  if (!fs.existsSync(repoPath)) return { success: false, output: 'Directory not found' };
  const git = simpleGit(repoPath);
  try {
    // Check if we need to stash changes
    const status = await git.status();
    const hasChanges =
      status.modified.length > 0 || status.deleted.length > 0 || status.staged.length > 0;

    if (hasChanges) {
      await git.stash();
    }

    await git.checkout(branchName);

    if (hasChanges) {
      try {
        await git.stash(['pop']);
      } catch (e) {
        // Stash pop might fail due to conflicts, which is a valid git state
        return {
          success: true,
          output: `Switched to ${branchName} but encountered conflicts when popping stash.`,
        };
      }
    }

    return { success: true, output: `Switched to branch ${branchName}` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function getFullDiff(repoPath) {
  const git = simpleGit(repoPath);
  try {
    // Get diff of staged and unstaged changes
    const staged = await git.diff(['--cached']);
    const unstaged = await git.diff();
    return staged + '\n' + unstaged;
  } catch (e) {
    return '';
  }
}

async function getStagedDiff(repoPath) {
  const git = simpleGit(repoPath);
  try {
    return await git.diff(['--cached']);
  } catch (e) {
    return '';
  }
}

async function getChangedFiles(repoPath) {
  const git = simpleGit(repoPath);
  try {
    // 1. Uncommitted changes (Modified, Untracked, Staged)
    const status = await git.status();
    const uncommitted = [
      ...status.modified,
      ...status.not_added,
      ...status.deleted,
      ...status.staged,
    ];

    // 2. Ahead changes (Committed but not pushed)
    // Compare local branch with its remote tracking branch
    let ahead = [];
    try {
      const aheadFiles = await git.raw(['diff', '--name-only', '@{u}..HEAD']);
      ahead = aheadFiles.split('\n').filter((f) => f.trim() !== '');
    } catch (e) {
      // Handle cases where there's no upstream yet
    }

    // Return unique set of changed files
    return Array.from(new Set([...uncommitted, ...ahead]));
  } catch (e) {
    console.error('Error getting changed files:', e);
    return [];
  }
}

async function getFileDiff(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    // 1. Check if repo has any commits
    let hasCommits = true;
    try {
      await git.raw(['rev-parse', 'HEAD']);
    } catch (e) {
      hasCommits = false;
    }

    let diff = '';
    if (hasCommits) {
      // Standard diff against HEAD (includes staged and unstaged)
      diff = await git.diff(['HEAD', '--', filePath]);
    }

    // 2. If diff is empty (could be untracked or unborn), try to get it manually
    if (!diff || diff.trim() === '') {
      try {
        // Check if it's staged
        const staged = await git.diff(['--cached', '--', filePath]);
        // Then check if it's unstaged
        const unstaged = await git.diff(['--', filePath]);

        if (!staged && !unstaged) {
          // Handle untracked files by reading the file content if it exists
          const fullPath = path.join(repoPath, filePath);
          if (await fs.pathExists(fullPath)) {
            const stats = await fs.stat(fullPath);
            // Only show diff for files, not directories
            if (stats.isFile()) {
              const content = await fs.readFile(fullPath, 'utf8');
              diff =
                `--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${content.split('\n').length} @@\n` +
                content
                  .split('\n')
                  .map((l) => '+' + l)
                  .join('\n');
            }
          }
        } else {
          diff = (staged || '') + '\n' + (unstaged || '');
        }
      } catch (e) {
        console.warn('Fallback diff failed:', e);
      }
    }

    if (!diff || diff.trim() === '') {
      return [{ text: 'No uncommitted changes in this file.', type: 'info' }];
    }

    const lines = diff.split(/\r?\n/);
    return lines.map((line) => {
      let type = 'unchanged';
      if (
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++') ||
        line.startsWith('@@')
      ) {
        type = 'header';
      } else if (line.startsWith('+')) {
        type = 'addition';
      } else if (line.startsWith('-')) {
        type = 'deletion';
      }
      return { text: line, type };
    });
  } catch (e) {
    return [{ text: 'Error loading diff: ' + e.message, type: 'deletion' }];
  }
}

async function getCommitDiff(repoPath, hash) {
  const git = simpleGit(repoPath);
  try {
    const res = await git.show([hash, '--patch', '--format=%b']);
    const lines = res.split(/\r?\n/);

    // We want to skip the commit message part and only show the actual diff
    let startIdx = lines.findIndex((l) => l.startsWith('diff --git'));
    if (startIdx === -1) startIdx = 0;

    const diffLines = lines.slice(startIdx);

    return diffLines.map((line) => {
      let type = 'unchanged';
      if (
        line.startsWith('diff --git') ||
        line.startsWith('index ') ||
        line.startsWith('---') ||
        line.startsWith('+++') ||
        line.startsWith('@@')
      ) {
        type = 'header';
      } else if (line.startsWith('+')) {
        type = 'addition';
      } else if (line.startsWith('-')) {
        type = 'deletion';
      }
      return { text: line, type };
    });
  } catch (e) {
    return [{ text: 'Error loading commit diff: ' + e.message, type: 'deletion' }];
  }
}

async function getFilePatch(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    // Generate a patch for the specific file
    // This includes uncommitted changes
    return await git.diff(['--', filePath]);
  } catch (e) {
    throw new Error(`Failed to generate patch: ${e.message}`);
  }
}

async function applyPatch(repoPath, patchString) {
  const git = simpleGit(repoPath);
  const fs = require('fs-extra');
  const path = require('path');
  const os = require('os');

  const tempPatchPath = path.join(os.tmpdir(), `gitscope_${Date.now()}.patch`);

  try {
    await fs.writeFile(tempPatchPath, patchString);
    await git.raw(['apply', tempPatchPath]);
    return { success: true };
  } catch (e) {
    return { success: false, output: e.message };
  } finally {
    if (await fs.pathExists(tempPatchPath)) {
      await fs.remove(tempPatchPath);
    }
  }
}

async function getDetailedChanges(repoPath, options = { includeIgnored: true }) {
  try {
    if (!fs.existsSync(repoPath)) {
      return { staged: [], unstaged: [], untracked: [], ahead: 0, behind: 0, current: 'missing' };
    }
    const git = simpleGit(repoPath);

    const staged = [];
    const unstaged = [];
    const untracked = [];
    const ignored = [];
    const deleted = [];
    let current = 'unknown';
    let ahead = 0;
    let behind = 0;

    // Use git.raw for faster/more exhaustive status info including branch info
    const args = ['status', '-b', '--porcelain'];
    if (options.includeIgnored) args.push('--ignored');

    const statusRaw = await git.raw(args);
    const lines = statusRaw.split('\n').filter((l) => l.trim() !== '');

    lines.forEach((line) => {
      // 0. Parse Branch info
      if (line.startsWith('## ')) {
        const branchLine = line.substring(3);
        const parts = branchLine.split('...');
        current = parts[0].split(' ')[0];

        if (branchLine.includes('[')) {
          const aheadMatch = branchLine.match(/ahead (\d+)/);
          const behindMatch = branchLine.match(/behind (\d+)/);
          if (aheadMatch) ahead = parseInt(aheadMatch[1], 10);
          if (behindMatch) behind = parseInt(behindMatch[1], 10);
        }
        return;
      }

      const X = line[0];
      const Y = line[1];
      let path = line.substring(3);
      if (path.includes(' -> ')) {
        path = path.split(' -> ').pop();
      }
      if (path.startsWith('"') && path.endsWith('"')) {
        path = path.substring(1, path.length - 1);
      }

      // 1. Check for Conflicts
      const isConflict =
        (X === 'U' || Y === 'U') ||
        (X === 'A' && Y === 'A') ||
        (X === 'D' && Y === 'D');

      if (isConflict) {
        unstaged.push(path + ' (CONFLICT)');
        return;
      }

      // 2. Check for Staged
      if (X !== ' ' && X !== '?' && X !== '!') {
        staged.push(path);
      }

      // 3. Check for Unstaged
      if (Y !== ' ' && Y !== '?' && Y !== '!') {
        unstaged.push(path);
        if (Y === 'D') deleted.push(path);
      }

      // 4. Check for Untracked
      if (X === '?' && Y === '?') {
        untracked.push(path);
      }

      // 5. Check for Ignored
      if (X === '!' && Y === '!') {
        ignored.push(path);
      }
    });

    return {
      staged,
      unstaged,
      untracked,
      ignored,
      deleted,
      ahead,
      behind,
      current,
    };
  } catch (e) {
    console.error('Error getting detailed changes:', e);
    return { staged: [], unstaged: [], untracked: [], ahead: 0, behind: 0, current: 'error' };
  }
}

async function getQuickDashboardStatus(repoPath) {
  try {
    if (!fs.existsSync(repoPath)) {
      return {
        modified: 0,
        not_added: 0,
        deleted: 0,
        staged: 0,
        ahead: 0,
        behind: 0,
        current: 'MISSING',
        error: 'Directory not found',
      };
    }

    const git = simpleGit(repoPath);

    // 1. Silent Fetch tracking info with Timeout
    // We race the fetch against a 3s timeout to ensure the dashboard remains fast.
    try {
      const fetchTask = git
        .env({
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
        })
        .raw(['fetch', '--quiet', '--depth=1']);

      await Promise.race([fetchTask, new Promise((resolve) => setTimeout(resolve, 3000))]);
    } catch (e) {
      // Ignore fetch errors in quick status
    }

    // 2. Get status (Fresh instance to ensure clean environment)
    const statusResult = await simpleGit(repoPath).status();
    const remotes = await simpleGit(repoPath).getRemotes();

    let ahead = statusResult.ahead || 0;
    let behind = statusResult.behind || 0;

    // Fallback sync check for shallow clones
    if (ahead === 0 && behind === 0 && statusResult.current) {
      try {
        const tracking = await simpleGit(repoPath).raw([
          'rev-parse',
          '--abbrev-ref',
          `${statusResult.current}@{u}`,
        ]);
        if (tracking.trim() && !tracking.includes('@{u}')) {
          const aheadRaw = await simpleGit(repoPath).raw([
            'rev-list',
            '--count',
            `${tracking.trim()}..HEAD`,
          ]);
          const behindRaw = await simpleGit(repoPath).raw([
            'rev-list',
            '--count',
            `HEAD..${tracking.trim()}`,
          ]);
          ahead = parseInt(aheadRaw.trim()) || 0;
          behind = parseInt(behindRaw.trim()) || 0;
        }
      } catch (e) {}
    }

    return {
      modified: (statusResult.modified || []).length,
      not_added: (statusResult.not_added || []).length,
      deleted: (statusResult.deleted || []).length,
      staged: (statusResult.staged || []).length,
      ahead: ahead,
      behind: behind,
      current: statusResult.current || 'detached',
      isLocal: remotes.length === 0,
    };
  } catch (e) {
    console.error(`Quick status failed for ${repoPath}:`, e);
    return {
      modified: 0,
      not_added: 0,
      deleted: 0,
      staged: 0,
      ahead: 0,
      behind: 0,
      current: 'error',
    };
  }
}

async function stageFile(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    await git.add(filePath);
    return { success: true, output: `Staged ${filePath}` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function unstageFile(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    await git.raw(['reset', 'HEAD', '--', filePath]);
    return { success: true, output: `Unstaged ${filePath}` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function getCommits(repoPath, limit = 20) {
  const git = simpleGit(repoPath);
  try {
    const log = await git.log({ n: limit });
    return log.all.map((commit) => ({
      hash: commit.hash,
      date: commit.date,
      message: commit.message,
      author_name: commit.author_name,
    }));
  } catch (e) {
    console.error('Error fetching commits:', e);
    return [];
  }
}

async function revertToCommit(repoPath, hash) {
  const git = simpleGit(repoPath);
  try {
    // Force clear any current index/workspace lock files
    clearGitLock(repoPath);

    // Perform the hard reset using raw command for maximum Windows compatibility
    await git.raw(['reset', '--hard', hash]);

    // Clean untracked files to ensure a truly identical state
    await git.clean('f', ['-d']);

    return { success: true, output: `Successfully reverted to commit ${hash.substring(0, 7)}` };
  } catch (e) {
    console.error('Revert Logic Error:', e);
    return { success: false, output: e.message };
  }
}

async function restoreToHead(repoPath) {
  const git = simpleGit(repoPath);
  try {
    // 1. Check if we have any commits yet (unborn repo check)
    let hasCommits = true;
    try {
      await git.raw(['rev-parse', 'HEAD']);
    } catch (e) {
      hasCommits = false;
    }

    if (hasCommits) {
      // Standard hard reset
      await git.raw(['reset', '--hard', 'HEAD']);
    } else {
      // Unborn repo: just unstage everything
      try {
        await git.raw(['rm', '-r', '--cached', '.']);
      } catch (e) {
        // Might fail if nothing is staged, which is fine
      }
    }

    // 2. Remove untracked files in both cases
    await git.clean('f', ['-d']);

    return {
      success: true,
      output: hasCommits
        ? 'Successfully restored project to HEAD'
        : 'Successfully cleared uncommitted changes (Unborn Repository)',
    };
  } catch (e) {
    console.error('Restore HEAD Error:', e);
    return { success: false, output: e.message };
  }
}

async function restoreFile(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    const status = await git.status();

    // Find the actual case-sensitive path from the git status
    // We check modified, deleted, and untracked (not_added)
    const allChanged = [
      ...status.modified,
      ...status.deleted,
      ...status.not_added,
      ...status.staged,
    ];

    const actualPath =
      allChanged.find((p) => p.toLowerCase() === filePath.toLowerCase()) || filePath;
    const isUntracked = status.not_added.includes(actualPath);

    if (isUntracked) {
      // For untracked files, "restoring" means deleting them to return to clean HEAD state
      const fullPath = path.join(repoPath, actualPath);
      await fs.remove(fullPath);
      return { success: true, output: `Successfully removed untracked file ${actualPath}` };
    }

    // Forcefully restore tracked file from HEAD (discard both staged and unstaged changes)
    try {
      // Modern Git command to wipe both index and worktree
      await git.raw(['restore', '--source=HEAD', '--staged', '--worktree', actualPath]);
      return { success: true, output: `Successfully restored ${actualPath} to HEAD` };
    } catch (e) {
      // Fallback for older git versions or new files (staged but not in HEAD)
      try {
        await git.raw(['checkout', 'HEAD', '--', actualPath]);
        return { success: true, output: `Successfully restored ${actualPath} from HEAD (via checkout)` };
      } catch (e2) {
        // If checkout also fails, it's likely a new file or unborn repository
        // Only delete if it's truly not in HEAD to avoid accidental data loss of tracked files
        let existsInHead = true;
        try {
          await git.raw(['rev-parse', `HEAD:${actualPath}`]);
        } catch (revErr) {
          existsInHead = false;
        }

        if (!existsInHead) {
          try {
            await git.raw(['reset', 'HEAD', '--', actualPath]);
          } catch (resetErr) {}

          const fullPath = path.join(repoPath, actualPath);
          if (await fs.pathExists(fullPath)) {
            await fs.remove(fullPath);
            return { success: true, output: `Successfully removed new file ${actualPath}` };
          }
        }

        // If it IS in HEAD, something else failed (e.g. file lock)
        return { success: false, output: `Restore failed: ${e.message}` };
      }
    }
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function createBranch(repoPath, branchName) {
  const git = simpleGit(repoPath);
  try {
    // Check if repo has any commits
    let hasCommits = true;
    try {
      await git.log({ n: 1 });
    } catch (e) {
      hasCommits = false;
    }

    if (!hasCommits) {
      // For unborn repos, use raw checkout to initialize the first branch
      await git.raw(['checkout', '-b', branchName]);
    } else {
      await git.checkoutLocalBranch(branchName);
    }
    return { success: true, output: `Created and switched to branch "${branchName}"` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function deleteBranch(repoPath, branchName) {
  const git = simpleGit(repoPath);
  try {
    // -D forces deletion even if not merged
    await git.raw(['branch', '-D', branchName]);
    return { success: true, output: `Permanently deleted branch "${branchName}"` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function renameBranch(repoPath, oldName, newName) {
  const git = simpleGit(repoPath);
  try {
    // 1. Rename locally
    await git.raw(['branch', '-m', oldName, newName]);

    // 2. Check if we have an 'origin' remote
    const remotes = await git.getRemotes();
    const hasOrigin = remotes.some((r) => r.name === 'origin');

    if (hasOrigin) {
      try {
        // 3. Push the new branch
        await git.push('origin', newName, ['-u']);
        // 4. Delete the old branch from remote
        await git.push('origin', oldName, ['--delete']);
      } catch (remoteErr) {
        return {
          success: true,
          output: `Branch renamed locally to "${newName}", but remote update failed: ${remoteErr.message}`,
        };
      }
    }

    return { success: true, output: `Branch "${oldName}" renamed to "${newName}"` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function initRepository(repoPath) {
  try {
    // 1. Ensure the directory exists first (Critical for simple-git)
    await fs.ensureDir(repoPath);

    const git = simpleGit(repoPath);

    // 2. Initialize the repo
    clearGitLock(repoPath);
    await git.init();

    // Force initialize the 'main' branch
    try {
      await git.raw(['checkout', '-b', 'main']);
    } catch (e) {
      await git.raw(['symbolic-ref', 'HEAD', 'refs/heads/main']);
    }

    return { success: true, output: 'Successfully initialized repository with "main" branch.' };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function nukeAndReinit(repoPath) {
  try {
    // Force clear any current index/workspace lock files
    clearGitLock(repoPath);

    // Nuke the .git directory
    const gitDir = path.join(repoPath, '.git');
    if (await fs.pathExists(gitDir)) {
      await fs.remove(gitDir);
    }

    // Use the robust init function
    return await initRepository(repoPath);
  } catch (e) {
    console.error('Nuke Error:', e);
    return { success: false, output: e.message };
  }
}

async function stageAllChanges(repoPath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    // Use -A to ensure all changes (modifications, additions, and deletions) are staged
    await git.raw(['add', '-A']);
    return { success: true, output: 'Successfully staged all changes.' };
  } catch (e) {
    const errorMsg = e.message || '';
    if (errorMsg.includes('Permission denied') || errorMsg.includes('locked')) {
      console.warn(
        'Backend: Full stage failed due to locked files. Attempting partial stage of tracked files...',
      );
      try {
        // Fallback: Stage only tracked changes (git add -u)
        await git.raw(['add', '-u']);
        return {
          success: true,
          partial: true,
          output:
            'Partial Stage: Staged all tracked changes. Some untracked files are locked by another process (e.g., Visual Studio) and were skipped.',
        };
      } catch (e2) {
        return { success: false, output: e.message };
      }
    }
    return { success: false, output: e.message };
  }
}

async function addToGitignore(repoPath, entry) {
  try {
    const gitignorePath = path.join(repoPath, '.gitignore');
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }

    // Normalize entry: forward slashes, ensure no trailing slash for files, etc.
    const normalizedEntry = entry.replace(/\\/g, '/');
    const lines = content.split('\n').map((l) => l.trim());

    if (!lines.includes(normalizedEntry)) {
      const separator = content.endsWith('\n') || content === '' ? '' : '\n';
      fs.appendFileSync(gitignorePath, `${separator}${normalizedEntry}\n`);
      return { success: true, output: `Added "${normalizedEntry}" to .gitignore` };
    }
    return { success: true, output: `"${normalizedEntry}" is already in .gitignore` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function unstageAllChanges(repoPath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    // git reset HEAD -- . is the standard way to unstage everything
    await git.raw(['reset', 'HEAD', '--', '.']);
    return { success: true, output: 'Successfully unstaged all changes.' };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function getRemotes(repoPath) {
  const git = simpleGit(repoPath);
  try {
    const remotes = await git.getRemotes(true);
    return remotes.map((r) => ({ name: r.name, url: r.refs.fetch || r.refs.push }));
  } catch (e) {
    console.error('Error fetching remotes:', e);
    return [];
  }
}

async function addRemote(repoPath, name, url) {
  const git = simpleGit(repoPath);
  try {
    await git.addRemote(name, url);
    return { success: true, output: `Successfully added remote "${name}"` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function removeRemote(repoPath, name) {
  const git = simpleGit(repoPath);
  try {
    await git.removeRemote(name);
    return { success: true, output: `Successfully removed remote "${name}"` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function setRemoteUrl(repoPath, name, url) {
  const git = simpleGit(repoPath);
  try {
    await git.remote(['set-url', name, url]);
    return { success: true, output: `Successfully updated remote "${name}" URL to ${url}` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function publishSequence(repoPath, cloneUrl) {
  const git = simpleGit(repoPath);

  try {
    // 1. git init (in case it wasn't)
    await git.init();

    // 1.5 Harden connection for large initial push (fix for RPC/Timeout failures)
    await git.addConfig('http.postBuffer', '524288000'); // 500MB
    await git.addConfig('http.version', 'HTTP/1.1'); // Use HTTP/1.1 for better stability on large uploads
    await git.addConfig('http.lowSpeedLimit', '0'); // Disable low speed limit
    await git.addConfig('http.lowSpeedTime', '999999'); // Allow long duration for slow uploads

    // Check if the directory is effectively empty (only has .git)
    const files = await fs.readdir(repoPath);
    const nonGitFiles = files.filter((f) => f !== '.git');

    if (nonGitFiles.length === 0) {
      // Create a basic README so the repo isn't empty (Git can't push an empty repo)
      const name = path.basename(repoPath);
      await fs.writeFile(
        path.join(repoPath, 'README.md'),
        `# ${name}\n\nProject initialized via GitScope.`,
      );
      console.log(`Created placeholder README.md in empty repo: ${repoPath}`);
    }

    // 2. git add .
    await git.add('.');

    // 3. git commit -m "Initial commit"
    try {
      await git.raw(['commit', '-m', 'Initial commit']);
    } catch (e) {
      // If it fails, check if we already have commits
      try {
        await git.raw(['rev-parse', 'HEAD']);
      } catch (headErr) {
        // Truly no commits and commit failed, this is an error
        throw new Error(`Failed to create initial commit: ${e.message}`);
      }
    }

    // 4. git branch -M main
    await git.raw(['branch', '-M', 'main']);

    // 5. git remote add origin ... (handle if exists)
    try {
      await git.addRemote('origin', cloneUrl);
    } catch (e) {
      await git.remote(['set-url', 'origin', cloneUrl]);
    }

    // 6. git push -u origin main
    // We use progress flag to ensure Git outputs progress data to stderr
    const pushRes = await git.raw(['push', '--progress', '-u', 'origin', 'main']);

    return { success: true, output: pushRes };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function stashSave(repoPath, message) {
  const git = simpleGit(repoPath);
  try {
    const res = await git.stash(['push', '-m', message || `Stash ${new Date().toLocaleString()}`]);
    return { success: true, output: res };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function stashList(repoPath) {
  const git = simpleGit(repoPath);
  try {
    const res = await git.stashList();
    return { success: true, stashes: res.all };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function stashPop(repoPath, index = 0) {
  const git = simpleGit(repoPath);
  try {
    const res = await git.stash(['pop', `stash@{${index}}`]);
    return { success: true, output: res };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function stashApply(repoPath, index = 0) {
  const git = simpleGit(repoPath);
  try {
    const res = await git.stash(['apply', `stash@{${index}}`]);
    return { success: true, output: res };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function stashDrop(repoPath, index = 0) {
  const git = simpleGit(repoPath);
  try {
    const res = await git.stash(['drop', `stash@{${index}}`]);
    return { success: true, output: res };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function isTracked(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    // ls-files --error-unmatch returns exit code 1 if file is not tracked
    await git.raw(['ls-files', '--error-unmatch', filePath]);
    return true;
  } catch (e) {
    return false;
  }
}

async function stopTracking(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    // git rm -r --cached -- <file> removes the file from the index but keeps it on disk
    await git.raw(['rm', '-r', '--cached', '--', filePath]);

    // Optional: Add to .gitignore
    const gitignorePath = path.join(repoPath, '.gitignore');
    let content = '';
    if (await fs.pathExists(gitignorePath)) {
      content = await fs.readFile(gitignorePath, 'utf8');
    }

    // Normalize path for .gitignore (forward slashes, relative to repo root)
    const relativePath = filePath.replace(/\\/g, '/');
    if (!content.split('\n').some((line) => line.trim() === relativePath)) {
      const separator = content.endsWith('\n') || content === '' ? '' : '\n';
      await fs.appendFile(gitignorePath, `${separator}${relativePath}\n`);
    }

    return { success: true, output: `Stopped tracking ${filePath} and added to .gitignore` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function getIgnoredCachedFiles(repoPath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    // git ls-files -z -i --exclude-standard --cached
    // -z outputs NUL-separated paths to safely handle spaces and special characters
    const output = await git.raw(['ls-files', '-z', '-i', '--exclude-standard', '--cached']);
    if (!output || !output.trim()) {
      return [];
    }
    const files = output.split('\0').filter((f) => f && f.trim().length > 0);
    return files;
  } catch (e) {
    console.error(`Error getting ignored cached files for ${repoPath}:`, e);
    return [];
  }
}

async function removeCachedFiles(repoPath, filePaths) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const validPaths = paths.filter((p) => p && typeof p === 'string' && p.trim().length > 0);
    if (validPaths.length === 0) return { success: true, count: 0 };

    await git.raw(['rm', '-r', '--cached', '--', ...validPaths]);
    return { success: true, count: validPaths.length };
  } catch (e) {
    console.error(`Error removing cached files for ${repoPath}:`, e);
    return { success: false, error: e.message };
  }
}

async function startTracking(repoPath, filePath) {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    // 1. git add the file
    await git.add(filePath);

    // 2. Remove from .gitignore if present
    const gitignorePath = path.join(repoPath, '.gitignore');
    if (await fs.pathExists(gitignorePath)) {
      const content = await fs.readFile(gitignorePath, 'utf8');
      const relativePath = filePath.replace(/\\/g, '/');
      const lines = content.split('\n');
      const filteredLines = lines.filter((line) => line.trim() !== relativePath);

      if (lines.length !== filteredLines.length) {
        await fs.writeFile(gitignorePath, filteredLines.join('\n'));
      }
    }

    return { success: true, output: `Started tracking ${filePath}` };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function subtreePush(repoPath, prefix, remoteUrl, branch = 'main', force = false) {
  const git = simpleGit(repoPath);
  const fullPath = path.join(repoPath, prefix);

  try {
    console.log(`Subtree Push: ${prefix} -> ${remoteUrl} (branch: ${branch}, force: ${force})`);

    if (!fs.existsSync(fullPath)) {
      return { success: false, output: `Directory ${prefix} not found. Cannot push subtree.` };
    }

    const performPush = async () => {
      if (force) {
        // Logic for Force Push Subtree: split it first to get the commit hash, then push that hash forcefully
        const splitHash = await git.raw(['subtree', 'split', `--prefix=${prefix}`]);
        return await git.raw([
          'push',
          remoteUrl,
          `${splitHash.trim()}:refs/heads/${branch}`,
          '--force',
        ]);
      } else {
        // Standard Subtree Push
        return await git.raw(['subtree', 'push', `--prefix=${prefix}`, remoteUrl, branch]);
      }
    };

    try {
      const res = await performPush();
      return { success: true, output: res };
    } catch (e) {
      const errorMsg = e.message.toLowerCase();
      if (errorMsg.includes('was never added')) {
        console.log(`Subtree metadata missing for ${prefix}, attempting to initialize...`);
        // Use add --squash to initialize the metadata
        await git.raw(['subtree', 'add', `--prefix=${prefix}`, remoteUrl, branch, '--squash']);
        // Retry push
        const res = await performPush();
        return { success: true, output: `Subtree initialized and pushed successfully.\n${res}` };
      }
      throw e;
    }
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function subtreePull(repoPath, prefix, remoteUrl, branch = 'main') {
  const git = simpleGit(repoPath);
  const fullPath = path.join(repoPath, prefix);

  try {
    console.log(`Subtree Pull: ${prefix} <- ${remoteUrl} (branch: ${branch})`);

    // If directory doesn't exist, we must add it first
    if (!fs.existsSync(fullPath)) {
      console.log(`Subtree directory missing. Running initial subtree add for ${prefix}...`);
      const res = await git.raw([
        'subtree',
        'add',
        `--prefix=${prefix}`,
        remoteUrl,
        branch,
        '--squash',
      ]);
      return { success: true, output: `Subtree successfully initialized at ${prefix}.\n${res}` };
    }

    // Standard Pull
    try {
      const res = await git.raw([
        'subtree',
        'pull',
        `--prefix=${prefix}`,
        remoteUrl,
        branch,
        '--squash',
      ]);
      return { success: true, output: res };
    } catch (e) {
      const errorMsg = e.message.toLowerCase();
      if (errorMsg.includes('was never added') || errorMsg.includes('does not refer to a commit')) {
        console.log(
          `Detected missing subtree metadata during pull. Attempting to add for ${prefix}...`,
        );
        const res = await git.raw([
          'subtree',
          'add',
          `--prefix=${prefix}`,
          remoteUrl,
          branch,
          '--squash',
        ]);
        return { success: true, output: `Subtree initialized after failed pull.\n${res}` };
      }
      throw e;
    }
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function blame(repoPath, filePath, commitHash = null, lineRange = null) {
  const git = simpleGit(repoPath);
  try {
    const args = ['blame', '-w'];
    if (lineRange && lineRange.start && lineRange.end) {
      args.push('-L', `${lineRange.start},${lineRange.end}`);
    }
    if (commitHash) {
      let cleanHash = commitHash.startsWith('^') ? commitHash.substring(1) : commitHash;
      args.push(`${cleanHash}^`);
    }
    args.push('--', filePath);

    let raw;
    try {
      raw = await git.raw(args);
    } catch (err) {
      if (err.message.includes('bad revision')) {
        // Fallback: If cleanHash^ fails, blame at the commit itself since it's likely a boundary/root commit
        let fallbackArgs = ['blame', '-w'];
        if (lineRange && lineRange.start && lineRange.end) {
          fallbackArgs.push('-L', `${lineRange.start},${lineRange.end}`);
        }
        let cleanHash = commitHash.startsWith('^') ? commitHash.substring(1) : commitHash;
        fallbackArgs.push(cleanHash, '--', filePath);
        raw = await git.raw(fallbackArgs);
      } else {
        throw err;
      }
    }
    const lines = raw.split('\n');
    const result = [];

    for (let line of lines) {
      if (!line && line !== '') continue;
      const openParen = line.indexOf('(');
      const closeParen = line.indexOf(')');
      if (openParen !== -1 && closeParen !== -1 && openParen < closeParen) {
        const commit = line.substring(0, openParen).trim();
        const infoStr = line.substring(openParen + 1, closeParen);
        const content = line.substring(closeParen + 1);

        const parts = infoStr.trim().split(/\s+/);
        const lineNum = parts.pop();
        const tz = parts.pop();
        const time = parts.pop();
        const date = parts.pop();
        const author = parts.join(' ');

        result.push({
          commit,
          author,
          date: `${date} ${time}`,
          lineNum,
          content
        });
      } else {
        if (line.trim() !== '' || result.length > 0) {
          result.push({
            commit: '',
            author: '',
            date: '',
            lineNum: '',
            content: line
          });
        }
      }
    }
    return { success: true, blame: result };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function getCommitSummary(repoPath, hash) {
  const git = simpleGit(repoPath);
  try {
    if (!hash || hash.startsWith('00000000')) {
      return { success: false, output: 'Uncommitted changes' };
    }
    const message = await git.raw(['show', '-s', '--format=%B', hash]);
    const files = await git.raw(['show', '--name-only', '--format=', hash]);
    return {
      success: true,
      message: message.trim(),
      files: files.trim().split('\n').filter(Boolean)
    };
  } catch (e) {
    return { success: false, output: e.message };
  }
}

async function optimizeRepository(repoPath, level = 'standard') {
  const git = simpleGit(repoPath);
  try {
    clearGitLock(repoPath);
    let output = '';

    switch (level) {
      case 'standard':
        output = await git.raw(['gc']);
        break;
      case 'aggressive':
        output = await git.raw(['gc', '--aggressive', '--prune=now']);
        break;
      case 'deep':
        await git.raw(['reflog', 'expire', '--expire=now', '--all']);
        output = await git.raw(['gc', '--prune=now', '--aggressive']);
        break;
      case 'hardcore':
        output = await git.raw(['repack', '-a', '-d', '-f', '--depth=250', '--window=250']);
        break;
      default:
        throw new Error(`Unknown optimization level: ${level}`);
    }

    return { success: true, output: output || 'Optimization completed successfully.' };
  } catch (e) {
    console.error('Optimization Error:', e);
    return { success: false, output: e.message };
  }
}

module.exports = {
  getStatus,
  getRawStatus,
  pull,
  fetch,
  merge,
  push,
  commit,
  getBranches,
  switchBranch,
  getFullDiff,
  getStagedDiff,
  getChangedFiles,
  getDetailedChanges,
  getQuickDashboardStatus,
  getFileDiff,
  getFilePatch,
  applyPatch,
  getCommits,
  revertToCommit,
  restoreToHead,
  restoreFile,
  initRepository,
  nukeAndReinit,
  createBranch,
  deleteBranch,
  renameBranch,
  stageAllChanges,
  unstageAllChanges,
  getRemotes,
  addRemote,
  removeRemote,
  setRemoteUrl,
  stageFile,
  unstageFile,
  publishSequence,
  stashSave,
  stashList,
  stashPop,
  stashApply,
  stashDrop,
  stopTracking,
  startTracking,
  getIgnoredCachedFiles,
  removeCachedFiles,
  isTracked,
  subtreePush,
  subtreePull,
  getCommitDiff,
  addToGitignore,
  blame,
  getCommitSummary,
  optimizeRepository,
};
