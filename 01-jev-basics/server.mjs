// Minimal zero-dependency server: serves the demo page and proxies
// decision requests to TypeSafe's Jev API so the key never reaches the browser.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

// Load a local .env if present (KEY=value lines).
const envPath = path.join(dir, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.TYPESAFE_API_KEY;
const MODEL = process.env.JEV_MODEL || "jev-latest";
const API_URL = "https://api.typesafe.ai/v1/systemone";

if (!API_KEY) {
  console.error("TYPESAFE_API_KEY is not set (export it or add it to 01-jev-basics/.env)");
  process.exit(1);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
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
    send(res, 500, { detail: String(err?.message || err) });
  }
});

server.listen(PORT, () => console.log(`Jev demo → http://localhost:${PORT}  (model: ${MODEL})`));
