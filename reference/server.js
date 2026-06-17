import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root   = fileURLToPath(new URL('.', import.meta.url));
const parent = join(root, '..');
const port   = Number(process.env.PORT || 3002);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.webm': 'video/webm',
  '.mp4':  'video/mp4',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.webp': 'image/webp',
  '.lottie': 'application/zip',
  '.wasm': 'application/wasm',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0]))
    .replace(/^\.\.(\/|\\|$)/, '');

  // /public/* → project-root/public/*
  if (clean.startsWith('/public/')) {
    return join(parent, clean);
  }

  // /dotlottie/* → node_modules/@lottiefiles/dotlottie-web/dist/*
  if (clean.startsWith('/dotlottie/')) {
    return join(parent, 'node_modules/@lottiefiles/dotlottie-web/dist', clean.slice('/dotlottie/'.length));
  }

  // /gsap/* → node_modules/gsap/dist/*
  if (clean.startsWith('/gsap/')) {
    return join(parent, 'node_modules/gsap/dist', clean.slice('/gsap/'.length));
  }

  return join(root, clean === '/' ? 'index.html' : clean);
}

const server = createServer(async (req, res) => {
  try {
    const filePath = resolvePath(req.url || '/');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    });
    res.end(body);
  } catch {
    const fallback = await readFile(join(root, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fallback);
  }
});

server.listen(port, () => {
  console.log(`New UI running at http://localhost:${port}`);
});
