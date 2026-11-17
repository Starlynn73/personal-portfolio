import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public/", import.meta.url));
const port = 5173;
const dev = process.argv.includes("--dev");
const clients = new Set();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon"
};

const reloadScript = `
<script>
  const updates = new EventSource("/__reload");
  updates.onmessage = () => location.reload();
</script>`;

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (dev && url.pathname === "/__reload") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    let file = path.resolve(root, "." + decodeURIComponent(url.pathname));
    const relative = path.relative(root, file);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if ((await stat(file)).isDirectory()) {
      file = path.join(file, "index.html");
    }

    let content = await readFile(file);
    const extension = path.extname(file).toLowerCase();

    if (dev && extension === ".html") {
      content = Buffer.from(
        content.toString().replace(/<\/body>/i, reloadScript + "</body>")
      );
    }

    res.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Page not found");
  }
});

if (dev) {
  let timer;
  watch(root, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clients) {
        client.write("data: refresh\n\n");
      }
    }, 150);
  });
}

server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the other server first.`
      : error.message
  );
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`\nPersonal portfolio: http://127.0.0.1:${port}`);
  if (dev) {
    console.log(
      "Development mode: save public/ files to refresh the browser automatically."
    );
  }
  console.log(
    "Press Ctrl+C to stop. Local changes do not publish to GitHub Pages."
  );
});
