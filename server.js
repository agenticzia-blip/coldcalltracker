/**
 * APPOINT FUNNELS - DEVELOPMENT SERVER
 * 
 * A zero-dependency Node.js static file server designed to run the Cold Call Tracker
 * without requiring global npm packages or bypassing Windows execution policies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Normalize URL path and resolve file location
  let urlPath = req.url.split('?')[0]; // Remove query strings
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  
  // Safety check: Prevent directory traversal outside current workspace
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden: Access Denied');
  }

  const extname = path.extname(filePath);
  let contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Serve clean 404
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404 File Not Found</h1><p>The requested file does not exist in this workspace.</p>');
      } else {
        // Internal Server Error
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Internal Server Error: ${error.code}`);
      }
    } else {
      // Success: Serve requested content
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, 'localhost', () => {
  console.log('====================================================');
  console.log('  APPOINT FUNNELS - COLD CALLING TRACKER RUNNING');
  console.log(`  Local URL: http://localhost:${PORT}/`);
  console.log('====================================================');
  console.log('  Press Ctrl+C to shut down server.');
});
