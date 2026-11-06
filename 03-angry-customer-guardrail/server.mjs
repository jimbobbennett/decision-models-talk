// Angry customer guardrail. Zero-dependency server: serves the page, asks Jev about
// each customer message, and decides where the conversation should go.
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

const PORT = Number(process.env.PORT || 3002);
const API_KEY = process.env.TYPESAFE_API_KEY;
const MODEL = process.env.JEV_MODEL || "jev-latest";
const API_URL = "https://api.typesafe.ai/v1/systemone";

if (!API_KEY) {
  console.error("TYPESAFE_API_KEY is not set (copy .env.example to .env in the repo root and add your key)");
  process.exit(1);
}

// ------------------------------------------------------------------------------------
// The guardrail questions. All four are asked in one Jev call. The instructions point
// at parts of the state with backticked paths, so Jev knows which part to judge.
// ------------------------------------------------------------------------------------
const ANGER_LEVELS = ["Calm, neutral or positive", "Mildly annoyed", "Clearly frustrated", "Angry or hostile"];

const QUESTIONS = {
  // The direct question: should this go to a person? The other three are the signals behind it.
  route_to_human: {
    type: "noul",
    instructions:
      "Based on `latest_message` and `conversation`, this customer should be handed to a human support agent now instead of continuing with the bot.",
    criteria: {
      true: "The customer is angry, has asked for a person, is threatening to leave, or has a problem the bot is clearly failing to resolve.",
      false: "The bot can keep helping: the customer is calm or only mildly annoyed and the request is routine.",
    },
  },
  anger: {
    type: "score",
    instructions: "How angry or frustrated is the customer in `latest_message`? Use `conversation` for context.",
    criteria: ANGER_LEVELS,
  },
  wants_human: {
    type: "noul",
    instructions: "In `latest_message` the customer asks to speak to a human, a manager, or a real person.",
  },
  threatens_to_leave: {
    type: "noul",
    instructions: "In `latest_message` the customer threatens to cancel, leave, or take their business elsewhere.",
  },
};

// ------------------------------------------------------------------------------------
// Routing thresholds. Three outcomes, not a binary tripwire:
//   human: hand the conversation to a person
//   watch: the bot keeps going, but the conversation is flagged
//   bot:   carry on as normal
// ------------------------------------------------------------------------------------
const ANGER_HUMAN = 2.5;       // score 0..3; at or above this the customer is angry and goes
                               // to a human. No confidence gate: putting an angry customer in
                               // front of a person is cheap, and leaving them with the bot isn't.
const ANGER_WATCH = 1.5;       // frustrated, but not angry yet
const NOUL_HUMAN = 0.6;        // probability at or above which a yes/no signal escalates
const NOUL_WATCH = 0.35;       // probability at or above which a yes/no signal flags
const DIRECT_HUMAN = 0.75;     // route_to_human probability that escalates on its own
const DIRECT_WATCH = 0.5;      // route_to_human probability that flags. Higher than NOUL_*
                               // because this question is deliberately the most eager.

function route(answers) {
  const anger = answers.anger;
  const human = answers.wants_human.noul;
  const leave = answers.threatens_to_leave.noul;
  const direct = answers.route_to_human.noul;
  const reasons = [];

  if (direct >= DIRECT_HUMAN) reasons.push("Jev recommends a human");
  if (anger.score >= ANGER_HUMAN) reasons.push("Customer is angry");
  if (human >= NOUL_HUMAN) reasons.push("Customer asked for a person");
  if (leave >= NOUL_HUMAN) reasons.push("Customer is threatening to leave");
  if (reasons.length) return { route: "human", reasons };

  if (anger.score >= ANGER_WATCH) reasons.push("Customer is frustrated");
  if (human >= NOUL_WATCH) reasons.push("May want a person");
  if (leave >= NOUL_WATCH) reasons.push("May be thinking of leaving");
  if (direct >= DIRECT_WATCH) reasons.push("Jev leans towards a human");
  if (reasons.length) return { route: "watch", reasons };

  return { route: "bot", reasons: ["No sign of anger"] };
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

const STATIC = { "/": "index.html", "/index.html": "index.html", "/app.js": "app.js" };

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && STATIC[url]) {
      const file = STATIC[url];
      const type = file.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8";
      return send(res, 200, await readFile(path.join(dir, file), "utf8"), type);
    }
    if (req.method === "POST" && url === "/api/check") {
      const { conversation = [], message } = await readBody(req);
      if (typeof message !== "string" || !message.trim()) return send(res, 400, { detail: "Expected { conversation, message }" });

      const request = {
        model: MODEL,
        state: { conversation, latest_message: message },
        questions: QUESTIONS,
      };
      const started = performance.now();
      const upstream = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const latencyMs = Math.round(performance.now() - started);
      const response = await upstream.json().catch(() => ({ detail: "Invalid JSON from upstream" }));
      if (!upstream.ok) return send(res, upstream.status, { detail: response.detail || response, request, response, latencyMs });

      const thresholds = { ANGER_HUMAN, ANGER_WATCH, NOUL_HUMAN, NOUL_WATCH, DIRECT_HUMAN, DIRECT_WATCH };
      return send(res, 200, { ...route(response.answers), levels: ANGER_LEVELS, thresholds, request, response, latencyMs });
    }
    send(res, 404, { detail: "Not found" });
  } catch (err) {
    send(res, 500, { detail: String(err?.message || err) });
  }
});

server.listen(PORT, () => console.log(`Angry customer guardrail → http://localhost:${PORT}  (model: ${MODEL})`));
