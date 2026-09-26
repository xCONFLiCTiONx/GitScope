const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const url = require('url');
const chokidar = require('chokidar');

// Map of projectRoot -> { server, port, projectRoot, watcher, clientsSet }
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
 * Finds the project root directory starting from a file path.
 * Checks for .git, package.json, or common static entry files.
 */
function findProjectRoot(filePath) {
  if (!filePath) return process.cwd();
  let currentDir = fs.statSync(filePath).isDirectory()
    ? filePath
    : path.dirname(filePath);

  const rootBoundary = path.parse(currentDir).root;

  while (currentDir && currentDir !== rootBoundary) {
    if (
      fs.existsSync(path.join(currentDir, '.git')) ||
      fs.existsSync(path.join(currentDir, 'package.json'))
    ) {
      return currentDir;
    }

    const commonEntry = [
      'index.html',
      'index.htm',
      'default.html',
      'home.html',
      'public/index.html',
    ].some((f) => fs.existsSync(path.join(currentDir, f)));

    if (commonEntry) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return fs.statSync(filePath).isDirectory()
    ? filePath
    : path.dirname(filePath);
}

/**
 * Smart search for standard HTML entry points within a project root.
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
 * Gets or starts an HTTP preview server for the given project root.
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
    let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
    let fileOnDisk = path.join(normalizedRoot, safePath);

    // Prevent directory traversal escape
    if (!fileOnDisk.startsWith(normalizedRoot)) {
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
          <!Buffer>
          <html>
            <head><title>404 Not Found</title></head>
            <body style="font-family: sans-serif; padding: 40px; background: #121314; color: #fff;">
              <h2>404 - File Not Found</h2>
              <p>The requested path <code>${pathname}</code> was not found on the Web Preview server.</p>
              <p>Project Root: <code>${normalizedRoot}</code></p>
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
  const projectRoot = findProjectRoot(absoluteFilePath);
  const serverEntry = await getOrStartServer(projectRoot);

  const relativePath = findEntryPoint(projectRoot, absoluteFilePath);
  let urlPath = '';

  if (relativePath) {
    urlPath = '/' + relativePath.replace(/\\/g, '/');
  } else {
    const directRel = path.relative(projectRoot, absoluteFilePath).replace(/\\/g, '/');
    urlPath = '/' + directRel;
  }

  const url = `http://127.0.0.1:${serverEntry.port}${urlPath}`;

  return {
    url,
    port: serverEntry.port,
    projectRoot,
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
  findProjectRoot,
  findEntryPoint,
  getOrStartServer,
  resolvePreviewUrl,
  stopAllServers,
};
