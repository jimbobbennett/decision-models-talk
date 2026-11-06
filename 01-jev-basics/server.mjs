// Minimal zero-dependency server: serves the demo page and proxies
// decision requests to TypeSafe's Jev API so the key never reaches the browser.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Load .env files if present (KEY=value lines). The demo folder's .env wins over the
// repo root's .env, and real environment variables win over both.
for (const envPath of [path.join(dir, ".env"), path.join(dir, "..", ".env")]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = Number(process.env.PORT || 3000);
// Listen on this machine only by default, so nobody else on the network can use your key.
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.TYPESAFE_API_KEY;
const MODEL = process.env.JEV_MODEL || "jev-latest";
const API_URL = "https://api.typesafe.ai/v1/systemone";

if (!API_KEY) {
  console.error("TYPESAFE_API_KEY is not set (copy .env.example to .env in the repo root and add your key)");
  process.exit(1);
}

const MAX_BODY_BYTES = 1_000_000;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body too large"), { status: 413 });
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("Request body is not valid JSON"), { status: 400 });
  }
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      return send(res, 200, await readFile(path.join(dir, "index.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url === "/prompts.js") {
      return send(res, 200, await readFile(path.join(dir, "prompts.js"), "utf8"), "text/javascript; charset=utf-8");
    }
    if (req.method === "POST" && url === "/api/decide") {
      const { state, questions } = await readBody(req);
      const request = { model: MODEL, state, questions };
      const started = performance.now();
      const upstream = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const latencyMs = Math.round(performance.now() - started);
      const data = await upstream.json().catch(() => ({ detail: "Invalid JSON from upstream" }));
      // Echo the exact body sent to Jev so the page can show it.
      return send(res, upstream.status, { ...data, latencyMs, request });
    }
    send(res, 404, { detail: "Not found" });
  } catch (err) {
    send(res, err?.status || 500, { detail: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => console.log(`Jev demo → http://localhost:${PORT}  (model: ${MODEL})`));
