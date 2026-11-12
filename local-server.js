/**
 * ============================================================
 * CBT BAHASA — Local Development Server (Node.js)
 * Memungkinkan pengujian lokal sebelum deploy ke Vercel
 * Jalankan dengan: node local-server.js
 * ============================================================
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Muat variabel lingkungan lokal jika ada
try {
  const envPath = fs.existsSync(path.join(__dirname, '.env.local'))
    ? path.join(__dirname, '.env.local')
    : path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [k, ...v] = trimmed.split('=');
        const val = v.join('=').replace(/^["']|["']$/g, '');
        if (!process.env[k.trim()]) process.env[k.trim()] = val.trim();
      }
    });
    console.log('✅ File environment termuat dari:', path.basename(envPath));
  }
} catch (e) {
  // Silent fallback
}

const cbtHandler = require('./api/cbt');

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // Route API
  if (urlPath === '/api/cbt' || urlPath === '/api/handler') {
    let body = [];
    req.on('data', (chunk) => body.push(chunk));
    req.on('end', async () => {
      req.body = Buffer.concat(body);

      // Shim res.status() dan res.json() untuk kompatibilitas Vercel
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };

      try {
        await cbtHandler(req, res);
      } catch (err) {
        console.error('[Server Error]', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, message: err.message }));
      }
    });
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, 'index.html');
    }

    const fileExt = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[fileExt] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 - Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n============================================================`);
  console.log(`🚀 CBT Bahasa berjalan secara lokal di: http://localhost:${PORT}`);
  console.log(`📡 API Endpoint: http://localhost:${PORT}/api/cbt`);
  console.log(`============================================================\n`);
});

