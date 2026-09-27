#!/usr/bin/env node
// A tiny static file server for local batch-command testing, standing in for a real company
// website. The brief notes: "The company sites used with this command may be served from a
// local address, so your retrieval code must not assume a particular host and must follow
// relative links" — this fixture exercises exactly that path, with the hiring page deliberately
// buried at a non-obvious /engineering/join path rather than the predictable /careers.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "pages");
const PORT = process.env.FIXTURE_PORT || 8099;

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(ROOT, decodeURIComponent(urlPath.split("?")[0]));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/html" });
      return res.end("<html><body>404 Not Found</body></html>");
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Fixture company site running at http://localhost:${PORT}/`);
});
