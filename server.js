// Minimal static file server for this project.
// Usage: node tools/build.js && node server.js [port]   (default 8085)
//
// Serves dist/, the build output, and resolves /<test-id> to that directory's
// index.html the way Cloudflare Pages does — so what you see locally matches
// what ships.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'dist');
const PORT = parseInt(process.argv[2], 10) || 8085;
const HOST = '0.0.0.0';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf'
};

/* Resolve a URL path to a file: exact match first, then directory index. */
function resolveFile(urlPath) {
    const candidate = path.normalize(path.join(ROOT, urlPath));
    if (!candidate.startsWith(ROOT)) return null; // path traversal

    try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) return candidate;
        if (stat.isDirectory()) {
            const index = path.join(candidate, 'index.html');
            if (fs.existsSync(index)) return index;
        }
    } catch (err) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw err;
    }
    return null;
}

function send(res, status, filePath, body) {
    const ext = path.extname(filePath || '').toLowerCase();
    res.writeHead(status, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8' });
    res.end(body);
}

if (!fs.existsSync(ROOT)) {
    console.error('dist/ does not exist. Run: node tools/build.js');
    process.exit(1);
}

http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const filePath = resolveFile(urlPath);

    if (!filePath) {
        const notFound = path.join(ROOT, '404.html');
        if (fs.existsSync(notFound)) {
            return send(res, 404, notFound, fs.readFileSync(notFound));
        }
        return send(res, 404, null, 'Not Found');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) return send(res, 500, null, 'Internal Server Error');
        send(res, 200, filePath, data);
    });
}).listen(PORT, HOST, () => {
    console.log(`Serving ${ROOT} at http://${HOST}:${PORT}`);
});