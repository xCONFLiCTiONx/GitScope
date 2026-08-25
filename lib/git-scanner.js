const fs = require('fs-extra');
const path = require('path');

async function isGitRepo(dir) {
  try {
    return await fs.pathExists(path.join(dir, '.git'));
  } catch (e) {
    return false;
  }
}

function naturalSort(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

async function scanDirectory(rootPath) {
  if (await isGitRepo(rootPath)) {
    return {
      type: 'single',
      path: rootPath,
      name: path.basename(rootPath)
    };
  }

  const items = await fs.readdir(rootPath);
  const gitRepos = [];

  for (const item of items) {
    const fullPath = path.join(rootPath, item);
    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        if (await isGitRepo(fullPath)) {
          gitRepos.push({
            path: fullPath,
            name: item
          });
        }
      }
    } catch (e) {}
  }

  if (gitRepos.length > 0) {
    gitRepos.sort(naturalSort);
    return {
      type: 'multiple',
      repos: gitRepos
    };
  }

  return {
    type: 'none'
  };
}

const IGNORE_DIRS = ['.git', 'node_modules', 'dist', 'build'];

async function listDirectory(dirPath, showIgnored = true) {
  const items = await fs.readdir(dirPath);
  let result = [];

  for (const item of items) {
    if (IGNORE_DIRS.includes(item)) continue;

    const fullPath = path.join(dirPath, item);
    try {
      const stats = await fs.stat(fullPath);

      result.push({
        name: item,
        path: fullPath,
        isDirectory: stats.isDirectory()
      });
    } catch (e) {}
  }

  if (!showIgnored) {
    try {
      // Find the nearest git root to use simple-git
      let currentDir = dirPath;
      let gitRoot = null;
      while (currentDir !== path.parse(currentDir).root) {
        if (await fs.pathExists(path.join(currentDir, '.git'))) {
          gitRoot = currentDir;
          break;
        }
        currentDir = path.dirname(currentDir);
      }

      if (gitRoot) {
        const simpleGit = require('simple-git');
        const git = simpleGit(gitRoot);

        // Prepare paths for checking.
        // Directories need a trailing slash for Git to reliably recognize them as directories in .gitignore rules.
        const pathsToCheck = result.map(item => {
          let rel = path.relative(gitRoot, item.path).replace(/\\/g, '/');
          if (item.isDirectory && !rel.endsWith('/')) rel += '/';
          return rel;
        });

        const ignoredPathsSet = new Set();
        try {
          // checkIgnore can take an array of paths
          const ignored = await git.checkIgnore(pathsToCheck);
          const ignoredArray = Array.isArray(ignored) ? ignored : [ignored];

          ignoredArray.forEach(p => {
            if (!p) return;
            // Normalize path for comparison: remove trailing slash and resolve
            const cleanP = p.replace(/\/$/, '');
            ignoredPathsSet.add(path.resolve(gitRoot, cleanP).replace(/\\/g, '/').toLowerCase());
          });
        } catch (e) {
          // If checkIgnore fails (e.g. not in a repo or other git error), we might want to fallback or ignore
        }

        if (ignoredPathsSet.size > 0) {
          result = result.filter(item => !ignoredPathsSet.has(item.path.replace(/\\/g, '/').toLowerCase()));
        }
      }
    } catch (e) {
      console.error('Error filtering ignored files:', e);
    }
  }

  // Sort: directories first, then files, both using natural sort
  return result.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return naturalSort(a, b);
  });
}

async function getUnbornFolders(rootPath) {
  if (!rootPath) return [];
  try {
    const items = await fs.readdir(rootPath);
    const unborn = [];
    const simpleGit = require('simple-git');

    for (const item of items) {
      if (IGNORE_DIRS.includes(item) || (item.startsWith('.') && item !== '.idea' && item !== '.vs')) continue;
      const fullPath = path.join(rootPath, item);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          const gitDir = path.join(fullPath, '.git');
          if (!await fs.pathExists(gitDir)) {
            unborn.push({ name: item, path: fullPath, reason: 'No Git repository' });
          } else {
            // It is a git repo, check for commits
            const git = simpleGit(fullPath);
            try {
              const log = await git.log({ n: 1 });
              if (log.total === 0) {
                  unborn.push({ name: item, path: fullPath, reason: '0 Commits' });
              }
            } catch (e) {
              // No commits found or unborn head
              unborn.push({ name: item, path: fullPath, reason: 'No commits (unborn head)' });
            }
          }
        }
      } catch (e) {}
    }
    return unborn;
  } catch (e) {
    return [];
  }
}

module.exports = { scanDirectory, listDirectory, naturalSort, getUnbornFolders };
