import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".woff2": "font/woff2", ".png": "image/png", ".webp": "image/webp", ".riv": "application/octet-stream" };
createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const file = resolve(root, `.${path === "/" ? "/index.html" : path === "/pricing" || path === "/pricing/" ? "/pricing/index.html" : path}`);
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(4173, "0.0.0.0", () => console.log("CawCo site: http://localhost:4173"));
