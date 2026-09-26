const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const url = require('url');
const chokidar = require('chokidar');

// Map of websiteRoot -> { server, port, projectRoot, watcher, clientsSet }
const activeServers = new Map();

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

// Injection script for SSE live-reload
const LIVE_RELOAD_SCRIPT = `
<!-- GitScope Live Reload -->
<script>
(function() {
  if (window.__gitscope_livereload) return;
  window.__gitscope_livereload = true;
  function connect() {
    const es = new EventSource('/__gitscope_livereload');
    es.onmessage = function(e) {
      if (e.data === 'reload') {
        console.log('[GitScope] File change detected - Reloading page...');
        location.reload();
      }
    };
    es.onerror = function() {
      es.close();
      setTimeout(connect, 2000);
    };
  }
  connect();
})();
</script>
`;

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

  const clientsSet = new Set();

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Handle Live Reload EventStream
    if (pathname === '/__gitscope_livereload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(':connected\n\n');
      clientsSet.add(res);

      req.on('close', () => {
        clientsSet.delete(res);
      });
      return;
    }

    // Resolve file on disk
    let safePath = path
      .normalize(decodeURIComponent(pathname))
      .replace(/^(\.\.[\/\\])+/, '');
    let fileOnDisk = path.join(normalizedRoot, safePath);

    // Prevent directory traversal escape
    const rel = path.relative(normalizedRoot, fileOnDisk);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    try {
      if (fs.existsSync(fileOnDisk) && fs.statSync(fileOnDisk).isDirectory()) {
        const defaultIndex = ['index.html', 'index.htm'].find((idx) =>
          fs.existsSync(path.join(fileOnDisk, idx))
        );
        if (defaultIndex) {
          fileOnDisk = path.join(fileOnDisk, defaultIndex);
        }
      }

      if (!fs.existsSync(fileOnDisk) || fs.statSync(fileOnDisk).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>404 Not Found</title></head>
            <body style="font-family: sans-serif; padding: 40px; background: #121314; color: #fff;">
              <h2>404 - File Not Found</h2>
              <p>The requested path <code>${pathname}</code> was not found on the Web Preview server.</p>
              <p>Website Root: <code>${normalizedRoot}</code></p>
            </body>
          </html>
        `);
        return;
      }

      const ext = path.extname(fileOnDisk).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

      if (ext === '.html' || ext === '.htm') {
        let content = fs.readFileSync(fileOnDisk, 'utf8');

        // Inject SSE script before </body> or at end
        if (content.includes('</body>')) {
          content = content.replace('</body>', `${LIVE_RELOAD_SCRIPT}\n</body>`);
        } else {
          content += LIVE_RELOAD_SCRIPT;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(fileOnDisk);
        stream.pipe(res);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`500 Internal Server Error: ${e.message}`);
    }
  });

  // Listen on free random port
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
    server.on('error', reject);
  });

  const port = server.address().port;

  // File watcher for Live Reloading
  let debounceTimer = null;
  const watcher = chokidar.watch(normalizedRoot, {
    ignored: /(^|[\/\\])(\..|node_modules|dist[\/\\]win-unpacked)/,
    persistent: true,
    ignoreInitial: true,
    usePolling: process.platform === 'win32',
    interval: 2000,
  });

  const triggerReload = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      for (const clientRes of clientsSet) {
        try {
          clientRes.write('data: reload\n\n');
        } catch (e) {
          clientsSet.delete(clientRes);
        }
      }
    }, 100);
  };

  watcher.on('change', triggerReload);
  watcher.on('add', triggerReload);
  watcher.on('unlink', triggerReload);

  const serverEntry = {
    server,
    port,
    projectRoot: normalizedRoot,
    websiteRoot: normalizedRoot,
    watcher,
    clientsSet,
  };

  activeServers.set(normalizedRoot, serverEntry);
  return serverEntry;
}

/**
 * Returns full URL for previewing a file through the local web server.
 */
async function resolvePreviewUrl(filePath) {
  if (!filePath) {
    throw new Error('No file path provided for web preview.');
  }

  const absoluteFilePath = path.resolve(filePath);
  const websiteRoot = findWebsiteRoot(absoluteFilePath);
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

  const url = `http://127.0.0.1:${serverEntry.port}${urlPath}`;

  return {
    url,
    port: serverEntry.port,
    projectRoot: websiteRoot,
    websiteRoot,
    entryFile: relativePath || path.basename(absoluteFilePath),
  };
}

/**
 * Stops all running preview servers and watchers.
 */
function stopAllServers() {
  for (const [root, entry] of activeServers.entries()) {
    try {
      if (entry.watcher) {
        entry.watcher.close();
      }
      for (const res of entry.clientsSet) {
        try {
          res.end();
          if (res.socket && !res.socket.destroyed) {
            res.socket.destroy();
          }
        } catch (e) {}
      }
      entry.clientsSet.clear();

      if (entry.server) {
        if (typeof entry.server.closeAllConnections === 'function') {
          entry.server.closeAllConnections();
        }
        entry.server.close();
      }
    } catch (e) {
      console.error(`Error stopping preview server for ${root}:`, e);
    }
  }
  activeServers.clear();
}

module.exports = {
  findWebsiteRoot,
  findProjectRoot,
  findEntryPoint,
  getOrStartServer,
  resolvePreviewUrl,
  stopAllServers,
  extractAssetUrlsFromHtml,
  getCommonAncestor,
};
