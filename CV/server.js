const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse path & sanitize
  let reqPath = decodeURI(req.url.split('?')[0]);

  // =========================================================
  // API: Save Portfolio Data directly to physical files on disk
  // =========================================================
  if (req.method === 'POST' && (reqPath === '/api/save-portfolio-data' || reqPath === '/api/save')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        // 1. Write to assets/js/portfolio-data.json
        const jsonPath = path.join(ROOT_DIR, 'assets', 'js', 'portfolio-data.json');
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');

        // 2. Also update DEFAULT_PORTFOLIO_DATA inside assets/js/portfolio-data.js
        const jsPath = path.join(ROOT_DIR, 'assets', 'js', 'portfolio-data.js');
        if (fs.existsSync(jsPath)) {
          let jsContent = fs.readFileSync(jsPath, 'utf8');
          const markerStart = 'const DEFAULT_PORTFOLIO_DATA = ';
          const markerEnd = ';\n\nconst STORAGE_KEY = "gamal_portfolio_data_v1";';
          const sIdx = jsContent.indexOf(markerStart);
          const eIdx = jsContent.indexOf(markerEnd);
          if (sIdx !== -1 && eIdx !== -1) {
            const before = jsContent.substring(0, sIdx + markerStart.length);
            const after = jsContent.substring(eIdx);
            jsContent = before + JSON.stringify(data, null, 2) + after;
            fs.writeFileSync(jsPath, jsContent, 'utf8');
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Data saved to disk successfully!' }));
        console.log(`[${new Date().toLocaleTimeString()}] ✓ Portfolio data saved directly to files on disk!`);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // =========================================================
  // API: Upload Image Directly to assets/images/uploads/
  // =========================================================
  if (req.method === 'POST' && reqPath === '/api/upload-image') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const dataUrl = payload.dataUrl || payload.image;
        const customName = payload.fileName || '';

        if (!dataUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'No image data provided' }));
          return;
        }

        const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        let ext = 'jpg';
        let buffer;
        if (matches) {
          ext = matches[1].replace('jpeg', 'jpg');
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(dataUrl, 'base64');
        }

        const uploadsDir = path.join(ROOT_DIR, 'assets', 'images', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const safePrefix = customName ? customName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30) : 'thumb';
        const fileName = `${safePrefix}_${Date.now()}.${ext}`;
        const targetPath = path.join(uploadsDir, fileName);
        fs.writeFileSync(targetPath, buffer);

        const relativeUrl = `assets/images/uploads/${fileName}`;
        console.log(`[${new Date().toLocaleTimeString()}] ✓ Image uploaded & saved to: ${relativeUrl}`);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, url: relativeUrl, fileName }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(ROOT_DIR, safePath);

  // Check if directory, try index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>404 - غير موجود</title></head>
        <body style="background:#0b0c10;color:#fff;font-family:sans-serif;text-align:center;padding:50px;">
          <h1 style="color:#00BC91;">404 - الصفحة غير موجودة</h1>
          <p>الملف المطلوب (${escapeHtml(reqPath)}) غير موجود.</p>
          <a href="/" style="color:#00BC91;text-decoration:none;font-weight:bold;">العودة للرئيسية</a>
        </body>
        </html>
      `);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // No-cache for active development
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('='.repeat(55));
  console.log('🚀 Portfolio LAN Server is Running!');
  console.log('='.repeat(55));
  console.log(`💻 Local (على نفس الجهاز):`);
  console.log(`   http://localhost:${PORT}/`);
  console.log(`   http://localhost:${PORT}/admin.html`);
  console.log('');
  console.log(`📱 LAN Network (لأي جهاز أو موبايل على نفس شبكة الواي فاي):`);
  ips.forEach(ip => {
    console.log(`   http://${ip.address}:${PORT}/`);
    console.log(`   http://${ip.address}:${PORT}/admin.html (لوحة التحكم)`);
  });
  console.log('='.repeat(55));
});
