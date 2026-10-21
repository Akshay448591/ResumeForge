import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/** Serves the built client (client/dist) so the print page can be opened without the API or MongoDB. */
export async function serveDist(dir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = path.join(dir, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(body);
    } catch {
      // Single-page app: unknown paths (like /print) get index.html.
      res.writeHead(200, { 'Content-Type': TYPES['.html'] });
      res.end(await readFile(path.join(dir, 'index.html')));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
