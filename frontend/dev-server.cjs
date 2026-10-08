/**
 * MediChain+ — Front-end dev server (zéro dépendance npm).
 *
 *  - Sert les fichiers statiques du dossier `frontend/`.
 *  - Reverse-proxy : /api/*  et  /health  →  http://127.0.0.1:3001
 *
 * Le proxy supprime les soucis de CORS (le navigateur ne voit que
 * la même origine) et évite de modifier le backend du groupe.
 *
 * Usage :   node frontend/dev-server.cjs [port]   (défaut : 5500)
 */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 5500);
const API_TARGET = process.env.API_TARGET || "http://127.0.0.1:3001";
const TARGET = url.parse(API_TARGET);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".ico":  "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".map":  "application/json"
};

function safeJoin(root, reqPath) {
  const clean = decodeURIComponent(reqPath.split("?")[0].split("#")[0]);
  const resolved = path.normalize(path.join(root, clean));
  if (!resolved.startsWith(root)) return null; // path traversal guard
  return resolved;
}

function isApiPath(p) {
  return p === "/health" || p.startsWith("/api/");
}

function proxy(clientReq, clientRes) {
  const opts = {
    protocol: TARGET.protocol,
    hostname: TARGET.hostname,
    port:     TARGET.port,
    method:   clientReq.method,
    path:     clientReq.url,
    headers:  Object.assign({}, clientReq.headers, { host: TARGET.host })
  };

  const upstream = http.request(opts, (upRes) => {
    clientRes.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(clientRes);
  });

  upstream.on("error", (err) => {
    clientRes.statusCode = 502;
    clientRes.setHeader("Content-Type", "application/json; charset=utf-8");
    clientRes.end(JSON.stringify({
      error: "Backend injoignable sur " + API_TARGET,
      details: err.message,
      hint: "Lancez le backend :  npm run api"
    }));
  });

  clientReq.pipe(upstream);
}

function serveStatic(req, res) {
  let filePath = safeJoin(ROOT, req.url);
  if (!filePath) { res.statusCode = 400; return res.end("Bad Request"); }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      return fs.stat(filePath, (e2, s2) => {
        if (e2 || !s2.isFile()) return notFound(res);
        return streamFile(filePath, res);
      });
    }
    if (err) {
      // Fallback : si le chemin demandé n'existe pas et n'a pas d'extension,
      // tenter `.html` (utile pour /app -> /app.html).
      if (!path.extname(filePath)) {
        const html = filePath + ".html";
        return fs.stat(html, (e2, s2) => {
          if (e2 || !s2.isFile()) return notFound(res);
          return streamFile(html, res);
        });
      }
      return notFound(res);
    }
    return streamFile(filePath, res);
  });
}

function streamFile(filePath, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-cache");
  fs.createReadStream(filePath)
    .on("error", () => { res.statusCode = 500; res.end("read error"); })
    .pipe(res);
}

function notFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("404 Not Found");
}

const server = http.createServer((req, res) => {
  const t0 = Date.now();
  res.on("finish", () => {
    const dt = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${res.statusCode} (${dt}ms)`);
  });

  if (isApiPath(req.url.split("?")[0])) return proxy(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    return res.end("Method Not Allowed (front-end statique)");
  }
  return serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("──────────────────────────────────────────────────────");
  console.log(" MediChain+ Frontend dev-server");
  console.log("──────────────────────────────────────────────────────");
  console.log(" Static  :  http://127.0.0.1:" + PORT + "/");
  console.log(" Proxy   :  /api/*  +  /health  →  " + API_TARGET);
  console.log(" Cible   :  " + (TARGET.host || (TARGET.hostname + ":" + TARGET.port)));
  console.log(" Stop    :  Ctrl+C");
  console.log("──────────────────────────────────────────────────────");
});
