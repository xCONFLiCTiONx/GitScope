const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const url = require('url');

// Map of websiteRoot -> { server, port, projectRoot, websiteRoot }
const activeServers = new Map();

let logListener = null;

function setLogListener(fn) {
  logListener = fn;
}

function isClientAbortError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    msg.includes('aborted') ||
    msg.includes('socket hang up') ||
    msg.includes('write after end') ||
    msg.includes('stream destroy') ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'ECANCELED' ||
    code === 'ERR_STREAM_WRITE_AFTER_END' ||
    code === 'ECONNABORTED'
  );
}

function logInfo(msg) {
  console.log(`[Web Preview] ${msg}`);
  if (typeof logListener === 'function') {
    try { logListener('info', msg); } catch (e) {}
  }
}

function logWarn(msg) {
  console.warn(`[Web Preview] ${msg}`);
  if (typeof logListener === 'function') {
    try { logListener('warn', msg); } catch (e) {}
  }
}

function logError(msg, err) {
  if (isClientAbortError(err)) return;
  const fullMsg = err && err.stack ? `${msg}\nStack: ${err.stack}` : msg;
  console.error(`[Web Preview] ${fullMsg}`);
  if (typeof logListener === 'function') {
    try { logListener('error', fullMsg, err); } catch (e) {}
  }
}

/**
 * Retries reading a file from disk if transient filesystem locks occur (atomic saves).
 */
async function readFileWithRetry(filePath, encoding = null, maxRetries = 5, delayMs = 40) {
  let lastError = null;
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (encoding) {
        return fs.readFileSync(filePath, encoding);
      } else {
        return fs.readFileSync(filePath);
      }
    } catch (err) {
      lastError = err;
      if (['ENOENT', 'EBUSY', 'EPERM', 'EACCES', 'EAGAIN'].includes(err.code)) {
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Checks if a file/directory exists on disk with retry for transient file swaps.
 */
async function checkFileExistsWithRetry(filePath, maxRetries = 4, delayMs = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        return { exists: true, isDirectory: stat.isDirectory(), stat };
      }
    } catch (e) {}
    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { exists: false, isDirectory: false, stat: null };
}

// Supported MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.bat': 'text/plain; charset=utf-8',
  '.cmd': 'text/plain; charset=utf-8',
  '.ps1': 'text/plain; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.ini': 'text/plain; charset=utf-8',
  '.cfg': 'text/plain; charset=utf-8',
  '.conf': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.yaml': 'text/plain; charset=utf-8',
  '.xml': 'text/plain; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
  '.tsx': 'text/plain; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.gitignore': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Generates error HTML page.
 */
function renderErrorHtml(statusCode, title, message, websiteRoot) {
  return `<!DOCTYPE html>
<html>
  <head>
    <title>${statusCode} ${title}</title>
    <meta charset="utf-8">
  </head>
  <body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #121314; color: #fff;">
    <h2 style="color: #f85149; margin-top: 0;">${statusCode} - ${title}</h2>
    <p style="color: #c9d1d9; font-size: 15px;">${message}</p>
    <p style="color: #8b949e; font-size: 13px; margin-top: 20px;">Website Root: <code>${websiteRoot}</code></p>
  </body>
</html>`;
}

/**
 * Helper: Finds the lowest common ancestor directory between two absolute paths.
 */
function getCommonAncestor(pathA, pathB) {
  const normA = path.resolve(pathA);
  const normB = path.resolve(pathB);

  const rootA = path.parse(normA).root;
  const rootB = path.parse(normB).root;

  if (rootA.toLowerCase() !== rootB.toLowerCase()) {
    return normA;
  }

  let dirA = normA;
  try {
    if (fs.existsSync(normA) && !fs.statSync(normA).isDirectory()) {
      dirA = path.dirname(normA);
    }
  } catch (e) {
    dirA = path.dirname(normA);
  }

  let dirB = normB;
  try {
    if (fs.existsSync(normB) && !fs.statSync(normB).isDirectory()) {
      dirB = path.dirname(normB);
    }
  } catch (e) {
    dirB = path.dirname(normB);
  }

  while (dirA && dirA.toLowerCase() !== rootA.toLowerCase()) {
    const rel = path.relative(dirA, dirB);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return dirA;
    }
    const parent = path.dirname(dirA);
    if (parent === dirA) break;
    dirA = parent;
  }

  return rootA;
}

/**
 * Helper: Extracts relative and root-relative asset URLs from HTML content.
 */
function extractAssetUrlsFromHtml(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') return [];

  const urls = new Set();

  // 1. Match href="...", src="...", data="..."
  const attrRegex = /(?:href|src|data|action)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attrRegex.exec(htmlContent)) !== null) {
    if (match[1]) {
      urls.add(match[1].trim());
    }
  }

  // 2. Match unquoted href=... or src=...
  const unquotedRegex = /(?:href|src)\s*=\s*([^\s>]+)/gi;
  while ((match = unquotedRegex.exec(htmlContent)) !== null) {
    let val = match[1].replace(/['">]/g, '').trim();
    if (val) urls.add(val);
  }

  // 3. Match CSS url(...) or @import "..."
  const cssUrlRegex = /url\s*\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi;
  while ((match = cssUrlRegex.exec(htmlContent)) !== null) {
    const urlVal = match[1] || match[2];
    if (urlVal) urls.add(urlVal.trim());
  }

  const cleanUrls = [];
  for (const rawUrl of urls) {
    // Strip query parameters and hashes
    let clean = rawUrl.split('?')[0].split('#')[0].trim();
    if (!clean) continue;

    // Decode URL entities
    try {
      clean = decodeURIComponent(clean);
    } catch (e) {}

    // Ignore remote protocols and special schemas
    if (
      /^(https?:|file:|data:|blob:|javascript:|mailto:|tel:|ftp:|\/\/)/i.test(clean)
    ) {
      continue;
    }

    cleanUrls.push(clean);
  }

  return cleanUrls;
}

/**
 * Finds the true website root directory starting from a file path.
 * Reads the HTML file, extracts stylesheets/scripts/assets to build a layout model,
 * and determines the root directory to serve from.
 */
function findWebsiteRoot(filePath) {
  if (!filePath) return process.cwd();

  const absoluteFilePath = path.resolve(filePath);
  let stat;
  try {
    stat = fs.statSync(absoluteFilePath);
  } catch (e) {
    return process.cwd();
  }

  const htmlDir = stat.isDirectory()
    ? absoluteFilePath
    : path.dirname(absoluteFilePath);

  const isHtml =
    !stat.isDirectory() &&
    /\.(html|htm|xhtml|php|asp|aspx|ejs|njk|handlebars|hbs|svelte|vue)$/i.test(
      absoluteFilePath
    );

  let minAssetRoot = htmlDir;
  const rootRelativePaths = [];

  if (isHtml && fs.existsSync(absoluteFilePath)) {
    try {
      const content = fs.readFileSync(absoluteFilePath, 'utf8');
      const assetUrls = extractAssetUrlsFromHtml(content);

      for (const assetUrl of assetUrls) {
        if (assetUrl.startsWith('/')) {
          // Root-relative asset (e.g. /css/style.css)
          rootRelativePaths.push(assetUrl);
        } else {
          // Relative asset (e.g. ../css/style.css or ./js/app.js)
          const resolvedAssetPath = path.resolve(htmlDir, assetUrl);
          const ancestor = getCommonAncestor(htmlDir, resolvedAssetPath);
          minAssetRoot = getCommonAncestor(minAssetRoot, ancestor);
        }
      }
    } catch (err) {
      console.warn('Error analyzing HTML for website root:', err);
    }
  }

  // If root-relative paths like /css/style.css were found, find the ancestor directory
  // where those assets actually exist on disk.
  let candidateForRootRel = null;
  if (rootRelativePaths.length > 0) {
    let checkDir = minAssetRoot;
    const driveRoot = path.parse(checkDir).root;

    while (checkDir && checkDir.toLowerCase() !== driveRoot.toLowerCase()) {
      const exists = rootRelativePaths.some((relP) => {
        const fullP = path.join(checkDir, relP);
        return fs.existsSync(fullP);
      });

      if (exists) {
        candidateForRootRel = checkDir;
        break;
      }

      const parent = path.dirname(checkDir);
      if (parent === checkDir) break;
      checkDir = parent;
    }
  }

  if (candidateForRootRel) {
    minAssetRoot = getCommonAncestor(minAssetRoot, candidateForRootRel);
  }

  // Walk up from minAssetRoot to discover website/project root indicators
  let currentDir = minAssetRoot;
  const driveRoot = path.parse(currentDir).root;
  let bestWebsiteRoot = minAssetRoot;

  while (currentDir && currentDir.toLowerCase() !== driveRoot.toLowerCase()) {
    const hasIndex = [
      'index.html',
      'index.htm',
      'default.html',
      'home.html',
      'public/index.html',
    ].some((f) => fs.existsSync(path.join(currentDir, f)));

    const hasProjectMarker =
      fs.existsSync(path.join(currentDir, '.git')) ||
      fs.existsSync(path.join(currentDir, 'package.json'));

    const hasWebFolders = [
      'css',
      'js',
      'assets',
      'images',
      'img',
      'styles',
      'scripts',
      'public',
      'www',
      'static',
    ].some((folder) => {
      const p = path.join(currentDir, folder);
      return fs.existsSync(p) && fs.statSync(p).isDirectory();
    });

    if (hasIndex) {
      bestWebsiteRoot = currentDir;
      if (hasProjectMarker) {
        break;
      }
    } else if (hasProjectMarker) {
      if (
        bestWebsiteRoot === minAssetRoot &&
        (hasWebFolders || currentDir !== minAssetRoot)
      ) {
        bestWebsiteRoot = currentDir;
      }
      break;
    } else if (hasWebFolders && bestWebsiteRoot === minAssetRoot) {
      bestWebsiteRoot = currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return bestWebsiteRoot;
}

/**
 * Backward compatibility alias for findWebsiteRoot.
 */
function findProjectRoot(filePath) {
  return findWebsiteRoot(filePath);
}

/**
 * Smart search for standard HTML entry points within a website root.
 */
function findEntryPoint(projectRoot, preferredFile) {
  if (preferredFile && preferredFile.toLowerCase().endsWith('.html')) {
    if (fs.existsSync(preferredFile)) {
      return path.relative(projectRoot, preferredFile);
    }
  }

  const candidates = [
    'index.html',
    'index.htm',
    'default.html',
    'home.html',
    'public/index.html',
    'dist/index.html',
    'build/index.html',
  ];

  for (const candidate of candidates) {
    const fullPath = path.join(projectRoot, candidate);
    if (fs.existsSync(fullPath)) {
      return candidate;
    }
  }

  if (preferredFile && fs.existsSync(preferredFile)) {
    return path.relative(projectRoot, preferredFile);
  }

  return null;
}

/**
 * Gets or starts an HTTP preview server for the given website root.
 */
async function getOrStartServer(projectRoot) {
  const normalizedRoot = path.resolve(projectRoot);

  if (activeServers.has(normalizedRoot)) {
    return activeServers.get(normalizedRoot);
  }

  const serverEntry = {
    server: null,
    port: 0,
    projectRoot: normalizedRoot,
    websiteRoot: normalizedRoot,
  };

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    req.on('error', (err) => {
      logError(`Request error for "${pathname}": ${err.message}`, err);
    });
    res.on('error', (err) => {
      logError(`Response error for "${pathname}": ${err.message}`, err);
    });

    // Resolve file on disk safely
    let cleanPathname = pathname;
    try {
      cleanPathname = decodeURIComponent(pathname);
    } catch (e) {}

    let safePath = path
      .normalize(cleanPathname)
      .replace(/^(\.\.[\/\\])+/, '');
    let fileOnDisk = path.join(normalizedRoot, safePath);

    // Prevent directory traversal escape
    const rel = path.relative(normalizedRoot, fileOnDisk);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      logWarn(`403 Forbidden directory traversal attempt: "${pathname}" in "${normalizedRoot}"`);
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderErrorHtml(403, 'Forbidden', 'Directory traversal attempt denied.', normalizedRoot));
      return;
    }

    try {
      let fileCheck = await checkFileExistsWithRetry(fileOnDisk);

      if (fileCheck.exists && fileCheck.isDirectory) {
        const defaultIndex = ['index.html', 'index.htm'].find((idx) =>
          fs.existsSync(path.join(fileOnDisk, idx))
        );
        if (defaultIndex) {
          fileOnDisk = path.join(fileOnDisk, defaultIndex);
          fileCheck = await checkFileExistsWithRetry(fileOnDisk);
        }
      }

      if (!fileCheck.exists || fileCheck.isDirectory) {
        const isBrowserProbe =
          pathname.startsWith('/.well-known/') ||
          pathname === '/favicon.ico' ||
          pathname.startsWith('/apple-touch-icon') ||
          pathname.endsWith('.map');

        if (!isBrowserProbe) {
          logWarn(`404 Not Found: "${pathname}" (Disk path: "${fileOnDisk}")`);
        }

        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          renderErrorHtml(
            404,
            'File Not Found',
            `The requested path <code>${pathname}</code> was not found on the Web Preview server.`,
            normalizedRoot
          )
        );
        return;
      }

      const ext = path.extname(fileOnDisk).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      if (ext === '.html' || ext === '.htm') {
        try {
          const content = await readFileWithRetry(fileOnDisk, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        } catch (readErr) {
          logError(`Failed reading HTML file "${fileOnDisk}": ${readErr.message}`, readErr);
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            renderErrorHtml(
              500,
              'Internal Server Error',
              `Could not read HTML file: ${readErr.message}`,
              normalizedRoot
            )
          );
          return;
        }
      } else {
        try {
          const buffer = await readFileWithRetry(fileOnDisk, null);
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': buffer.length,
          });
          res.end(buffer);
        } catch (readErr) {
          logError(`Stream error serving file "${fileOnDisk}": ${readErr.message}`, readErr);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`500 Internal Server Error: ${readErr.message}`);
          }
        }
      }
    } catch (e) {
      logError(`500 Internal Server Error serving "${pathname}": ${e.message}`, e);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          renderErrorHtml(
            500,
            'Internal Server Error',
            `Server error: ${e.message}`,
            normalizedRoot
          )
        );
      }
    }
  });

  serverEntry.server = server;

  // Listen on free random port
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
    server.once('error', (err) => {
      logError(`Failed to start server on 127.0.0.1 for root "${normalizedRoot}": ${err.message}`, err);
      reject(err);
    });
  });

  const port = server.address().port;
  serverEntry.port = port;
  logInfo(`Server running at http://127.0.0.1:${port} for website root "${normalizedRoot}"`);

  // Runtime error handling for server crashes/errors after listen
  server.on('error', (err) => {
    logError(`Runtime server error for root "${normalizedRoot}": ${err.stack || err.message}`, err);
    activeServers.delete(normalizedRoot);
  });

  server.on('close', () => {
    logInfo(`Server closed for root "${normalizedRoot}"`);
    activeServers.delete(normalizedRoot);
  });

  activeServers.set(normalizedRoot, serverEntry);
  return serverEntry;
}

/**
 * Returns full URL for previewing a file through the local web server.
 */
async function resolvePreviewUrl(filePath) {
  if (!filePath) {
    const err = new Error('No file path provided for web preview.');
    logError(err.message, err);
    throw err;
  }

  try {
    const absoluteFilePath = path.resolve(filePath);
    const websiteRoot = findWebsiteRoot(absoluteFilePath);
    logInfo(`Resolving web preview URL for file: "${absoluteFilePath}" (Website Root: "${websiteRoot}")`);
    const serverEntry = await getOrStartServer(websiteRoot);

    const relativePath = findEntryPoint(websiteRoot, absoluteFilePath);
    let urlPath = '';

    if (relativePath) {
      urlPath = '/' + relativePath.replace(/\\/g, '/');
    } else {
      const directRel = path
        .relative(websiteRoot, absoluteFilePath)
        .replace(/\\/g, '/');
      urlPath = '/' + directRel;
    }

    const previewUrl = `http://127.0.0.1:${serverEntry.port}${urlPath}`;
    logInfo(`Resolved preview URL: ${previewUrl}`);

    return {
      url: previewUrl,
      port: serverEntry.port,
      projectRoot: websiteRoot,
      websiteRoot,
      entryFile: relativePath || path.basename(absoluteFilePath),
    };
  } catch (err) {
    logError(`Failed to resolve web preview URL for "${filePath}": ${err.message}`, err);
    throw err;
  }
}

/**
 * Stops all running preview servers.
 */
function stopAllServers() {
  for (const [root, entry] of activeServers.entries()) {
    try {
      if (entry.server) {
        if (typeof entry.server.closeAllConnections === 'function') {
          entry.server.closeAllConnections();
        }
        entry.server.close();
      }
      logInfo(`Stopped web preview server for root "${root}"`);
    } catch (e) {
      logError(`Error stopping preview server for "${root}": ${e.message}`, e);
    }
  }
  activeServers.clear();
}

module.exports = {
  setLogListener,
  findWebsiteRoot,
  findProjectRoot,
  findEntryPoint,
  getOrStartServer,
  resolvePreviewUrl,
  stopAllServers,
  extractAssetUrlsFromHtml,
  getCommonAncestor,
};
