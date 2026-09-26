const fs = require('fs-extra');
const path = require('path');
const { execSync, exec } = require('child_process');

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

/**
 * INTELLIGENCE: Check if a directory is a protected OS system folder that should be ignored.
 */
function isSystemFolder(folderName) {
  if (!folderName) return false;
  const name = folderName.toUpperCase();
  const protectedNames = [
    '$RECYCLE.BIN',
    'SYSTEM VOLUME INFORMATION',
    'RECOVERY',
    'CONFIG.MSI',
    'MSDOWNLD.TMP',
    '.TRASH-',
    '.SPOTLIGHT-V100',
    '.FSEVENTSD',
    'THUMBNAILS',
    'DESKTOP.INI',
    'HIBERFIL.SYS',
    'PAGEFILE.SYS',
    'SWAPFILE.SYS',
  ];

  return protectedNames.some((p) => name === p || name.startsWith(p));
}

function getWindowsAttributes(fullPath) {
  if (process.platform !== 'win32') return { hidden: false, system: false };
  try {
    const output = execSync(`attrib "${fullPath}"`, { encoding: 'utf8' });
    const attrs = output.substring(0, 11).toUpperCase();
    return {
      hidden: attrs.includes('H'),
      system: attrs.includes('S'),
    };
  } catch (e) {
    return { hidden: false, system: false };
  }
}

function getDirectoryAttributes(dirPath) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve(new Map());
      return;
    }
    const normalizedDir = path.resolve(dirPath);
    exec(`attrib "${path.join(normalizedDir, '*')}" /D`, { encoding: 'utf8' }, (error, stdout) => {
      const attributeMap = new Map();
      if (error && !stdout) {
        resolve(attributeMap);
        return;
      }
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const idx = line.toLowerCase().indexOf(normalizedDir.toLowerCase());
        if (idx !== -1) {
          const attrs = line.substring(0, idx).toUpperCase();
          const itemPath = path.resolve(line.substring(idx).trim());
          attributeMap.set(itemPath.toLowerCase(), {
            hidden: attrs.includes('H'),
            system: attrs.includes('S'),
          });
        }
      }
      resolve(attributeMap);
    });
  });
}

async function scanDirectory(rootPath) {
  if (await isGitRepo(rootPath)) {
    const winAttrs = getWindowsAttributes(rootPath);
    if (winAttrs.system) {
      return { type: 'none' };
    }
    return {
      type: 'single',
      path: rootPath,
      name: path.basename(rootPath),
    };
  }

  const items = await fs.readdir(rootPath);
  const gitRepos = [];
  const attrMap = await getDirectoryAttributes(rootPath);

  for (const item of items) {
    if (item === '.git' || isSystemFolder(item)) continue;
    const fullPath = path.join(rootPath, item);
    const winAttrs = attrMap.get(fullPath.toLowerCase()) || { hidden: false, system: false };
    if (winAttrs.system) continue;

    try {
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        if (await isGitRepo(fullPath)) {
          gitRepos.push({
            path: fullPath,
            name: item,
          });
        }
      }
    } catch (e) {}
  }

  if (gitRepos.length > 0) {
    gitRepos.sort(naturalSort);
    return {
      type: 'multiple',
      repos: gitRepos,
    };
  }

  return {
    type: 'none',
  };
}

const IGNORE_DIRS = ['.git', 'node_modules', 'dist', 'build'];

async function listDirectory(dirPath, viewModeOrShowIgnored = true) {
  let viewMode = 'all';
  if (viewModeOrShowIgnored === true || viewModeOrShowIgnored === 'all') {
    viewMode = 'all';
  } else if (viewModeOrShowIgnored === false || viewModeOrShowIgnored === 'tracked') {
    viewMode = 'tracked';
  } else if (viewModeOrShowIgnored === 'default') {
    viewMode = 'default';
  }

  const items = await fs.readdir(dirPath);
  let result = [];
  const attrMap = viewMode === 'default' ? await getDirectoryAttributes(dirPath) : null;

  for (const item of items) {
    const fullPath = path.join(dirPath, item);

    // 1. Skip system folders always if not in 'all' mode
    if (viewMode !== 'all' && isSystemFolder(item)) continue;

    // Check windows attributes if viewMode is 'default'
    if (viewMode === 'default') {
      const winAttrs = attrMap ? (attrMap.get(fullPath.toLowerCase()) || { hidden: false, system: false }) : { hidden: false, system: false };
      if (winAttrs.hidden || winAttrs.system) {
        continue;
      }
      // Specifically skip .git in default view
      if (item === '.git') continue;
    }

    // 2. Skip hardcoded ignore dirs if viewMode is 'tracked'.
    if (viewMode === 'tracked' && IGNORE_DIRS.includes(item)) continue;

    try {
      const stats = await fs.stat(fullPath);

      result.push({
        name: item,
        path: fullPath,
        isDirectory: stats.isDirectory(),
      });
    } catch (e) {}
  }

  if (viewMode === 'tracked') {
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

        // We check with and without trailing slashes to ensure maximum compatibility with .gitignore patterns.
        // Rules like ".agent/" specifically require the trailing slash to match a directory.
        const pathsToCheck = [];
        result.forEach((item) => {
          const rel = path.relative(gitRoot, item.path).replace(/\\/g, '/');
          pathsToCheck.push(rel);
          if (item.isDirectory) pathsToCheck.push(rel + '/');
        });

        const ignoredPathsSet = new Set();
        try {
          // Use git.raw for more direct control. check-ignore returns the list of ignored paths.
          const output = await git.raw(['check-ignore', ...pathsToCheck]);
          if (output) {
            const lines = output.split('\n');
            lines.forEach((p) => {
              const trimmed = p.trim();
              if (!trimmed) return;
              // Normalize the returned path (remove quotes and trailing slash) for Set matching.
              const clean = trimmed.replace(/^"(.*)"$/, '$1').replace(/\/$/, '');
              ignoredPathsSet.add(path.resolve(gitRoot, clean).replace(/\\/g, '/').toLowerCase());
            });
          }
        } catch (e) {
          // git check-ignore exits with code 1 if NO files are ignored.
          // simple-git treats non-zero exits as errors, so we catch and ignore this.
        }

        if (ignoredPathsSet.size > 0) {
          result = result.filter((item) => {
            const normPath = item.path.replace(/\\/g, '/').toLowerCase();
            return !ignoredPathsSet.has(normPath);
          });
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
    const attrMap = await getDirectoryAttributes(rootPath);

    for (const item of items) {
      if (item === '.git' || isSystemFolder(item)) continue;
      const fullPath = path.join(rootPath, item);
      const winAttrs = attrMap.get(fullPath.toLowerCase()) || { hidden: false, system: false };
      if (winAttrs.system) continue;

      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          const gitDir = path.join(fullPath, '.git');
          if (!(await fs.pathExists(gitDir))) {
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

module.exports = { scanDirectory, listDirectory, naturalSort, getUnbornFolders, getWindowsAttributes, isSystemFolder };