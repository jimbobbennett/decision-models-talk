// Tic-Tak-Jev: human vs Jev at tic-tac-toe. Zero-dependency server: serves the page and builds
// each Jev request server-side so the API key never reaches the browser.
// Ported from the text mode of https://github.com/jimbobbennett/can-ai-play
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

const PORT = Number(process.env.PORT || 3001);
// Listen on this machine only by default, so nobody else on the network can use your key.
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.TYPESAFE_API_KEY;
const MODEL = process.env.JEV_MODEL || "jev-latest";
const API_URL = "https://api.typesafe.ai/v1/systemone";

if (!API_KEY) {
  console.error("TYPESAFE_API_KEY is not set (copy .env.example to .env in the repo root and add your key)");
  process.exit(1);
}

// Squares are named row then column: rows A-C top to bottom, columns 1-3 left to right.
const SQUARES = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];

// Board as text, e.g. "Row A: A1=X | A2=empty | A3=O"
function boardText(board) {
  return [0, 1, 2]
    .map((r) => `Row ${"ABC"[r]}: ` + [0, 1, 2].map((c) => {
      const i = r * 3 + c;
      return `${SQUARES[i]}=${board[i] || "empty"}`;
    }).join(" | "))
    .join("\n");
}

function buildRequest(board, mark) {
  const rules =
    "Use the textual board state as the complete tic-tac-toe board. " +
    "Rows are labelled A, B and C from top to bottom; columns are labelled 1, 2 and 3 from left to right. " +
    "Each square is named by its row then its column, so A1 is top-left and C3 is bottom-right. " +
    "Each square is marked with X, O, or empty. " +
    "A player wins by placing three of their marks in a horizontal, vertical, or diagonal line; " +
    `filling the board without a line is a draw. You are playing ${mark}. ` +
    "Choose a legal square that wins immediately if possible, otherwise block an immediate opponent win, " +
    "otherwise choose a move that preserves a draw against perfect play.";
  const criteria = {};
  board.forEach((cell, i) => { if (!cell) criteria[SQUARES[i]] = `Place ${mark} in square ${SQUARES[i]}.`; });
  return {
    model: MODEL,
    state: `${rules}\n\nCurrent board:\n${boardText(board)}`,
    questions: {
      move: {
        type: "choice",
        instructions: "Choose the single best legal square from the offered options.",
        criteria,
      },
    },
  };
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

const STATIC = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js" };

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && STATIC[url]) {
      const file = STATIC[url];
      const type = file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
      return send(res, 200, await readFile(path.join(dir, file), "utf8"), type);
    }
    if (req.method === "POST" && url === "/api/move") {
      const { board, mark } = await readBody(req);
      if (!Array.isArray(board) || board.length !== 9 || !["X", "O"].includes(mark)) {
        return send(res, 400, { detail: "Expected { board: [9 cells], mark: 'X' | 'O' }" });
      }
      if (!board.some((c) => !c)) return send(res, 400, { detail: "The board is full." });

      const request = buildRequest(board, mark);
      const started = performance.now();
      const upstream = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const latencyMs = Math.round(performance.now() - started);
      const response = await upstream.json().catch(() => ({ detail: "Invalid JSON from upstream" }));
      if (!upstream.ok) return send(res, upstream.status, { detail: response.detail || response, request, response, latencyMs });

      const answer = response.answers?.move;
      const index = answer ? SQUARES.indexOf(answer.choice) : -1;
      if (answer?.type !== "choice" || index < 0 || board[index]) {
        return send(res, 502, { detail: "Jev did not return one of the offered squares.", request, response, latencyMs });
      }
      return send(res, 200, { index, request, response, latencyMs });
    }
    send(res, 404, { detail: "Not found" });
  } catch (err) {
    send(res, err?.status || 500, { detail: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => console.log(`Tic-Tak-Jev → http://localhost:${PORT}  (model: ${MODEL})`));
