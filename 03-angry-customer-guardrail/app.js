// Angry customer guardrail: a scripted support bot with Jev checking every message.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (p) => `${Math.round(p * 100)}%`;
const ROUTE_LABEL = { bot: "Bot", watch: "Watch", human: "Human" };

// Canned messages, roughly from calm to furious, plus a couple of trick ones.
const CANNED = [
  "Hi, where's my order #4821?",
  "I'm a bit disappointed it's late, but no rush.",
  "This is the third time I've asked. Still no update?",
  "Great, just great. Another delay. Fantastic service.",
  "lol my package arrived in a box that looked like it went through a war 😂 but the mug is fine",
  "Can I talk to someone about upgrading to the business plan?",
  "Honestly, I'm done. Cancel my account.",
  "This is ridiculous. I want to speak to a real person NOW.",
  "WHY IS NOTHING EVER WORKING WITH YOU PEOPLE",
];

// The bot is scripted, standing in for whatever LLM or flow you'd really use.
// Each topic has a few replies, used in turn so repeat questions don't get the same answer.
const REPLIES = {
  order: [
    "Order #4821 left our warehouse on Monday and is with the courier. The latest estimate is delivery on Thursday.",
    "I've checked again: order #4821 is still with the courier, and Thursday is the current estimate.",
    "I've raised a delivery query with the courier for order #4821. You'll get an email as soon as they reply.",
  ],
  cancel: ["I can help with that. Can you confirm the email address on your account?"],
  plan: ["The Business plan adds SSO and priority support. Would you like a comparison of the plans?"],
  other: ["Thanks for getting in touch. Can you tell me a little more so I can help?"],
};
const used = {};

function botReply(text, route) {
  const t = text.toLowerCase();
  const topic = /cancel|refund|done/.test(t) ? "cancel"
    : /plan|upgrade|pricing|business/.test(t) ? "plan"
    : /order|package|deliver|track|late|delay|update|box|mug/.test(t) ? "order"
    : "other";
  const list = REPLIES[topic];
  const reply = list[Math.min((used[topic] = (used[topic] ?? -1) + 1), list.length - 1)];
  return route === "watch" ? `I'm sorry about the frustration. ${reply}` : reply;
}

let conversation = [];
let handedOff = false;
let sentCount = 0;

// ---------------------------------------------------------------- rendering helpers

function signalClass(value, watch, human) {
  return value >= human ? "human" : value >= watch ? "watch" : "";
}

function signalsHTML(data) {
  const { route_to_human, anger, wants_human, threatens_to_leave } = data.response.answers;
  const t = data.thresholds;
  const level = data.levels[Math.min(data.levels.length - 1, Math.round(anger.score))];
  const row = (name, width, cls, val) => `
    <div class="signal">
      <span class="name">${name}</span>
      <div class="track"><div class="fill ${cls}" data-w="${width.toFixed(1)}"></div></div>
      <span class="val">${val}</span>
    </div>`;
  return `
    <div class="signals">
      <div class="direct">
        ${row("Route to human", route_to_human.noul * 100, signalClass(route_to_human.noul, t.DIRECT_WATCH, t.DIRECT_HUMAN), pct(route_to_human.noul))}
      </div>
      <div>
        ${row("Anger", (anger.score / 3) * 100, signalClass(anger.score, t.ANGER_WATCH, t.ANGER_HUMAN), `${anger.score.toFixed(2)} / 3`)}
        <div class="level">${esc(level)} · confidence ${anger.confidence.toFixed(2)}</div>
      </div>
      ${row("Wants a human", wants_human.noul * 100, signalClass(wants_human.noul, t.NOUL_WATCH, t.NOUL_HUMAN), pct(wants_human.noul))}
      ${row("Threatens to leave", threatens_to_leave.noul * 100, signalClass(threatens_to_leave.noul, t.NOUL_WATCH, t.NOUL_HUMAN), pct(threatens_to_leave.noul))}
    </div>`;
}

// Set bar widths after insertion so they animate (forced reflow, works in background tabs too).
function animateBars(root, from) {
  const fills = root.querySelectorAll(".fill");
  fills.forEach((f, i) => (f.style.width = (from?.[i] ?? 0) + "%"));
  void root.offsetWidth;
  fills.forEach((f) => (f.style.width = f.dataset.w + "%"));
}

const pill = (route, ms) => `<span class="pill ${route}">${ROUTE_LABEL[route]}${ms != null ? ` <span class="ms">${ms} ms</span>` : ""}</span>`;

function rawSections(request, response) {
  return `
    <details><summary>Raw request</summary><pre>${esc("POST https://api.typesafe.ai/v1/systemone\n\n" + JSON.stringify(request, null, 2))}</pre></details>
    <details><summary>Raw response</summary><pre>${esc(JSON.stringify(response, null, 2))}</pre></details>`;
}

function addMessage(role, text, extra = "") {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = `<div class="bubble">${esc(text)}</div>${extra}`;
  $("messages").append(el);
  $("messages").scrollTop = $("messages").scrollHeight;
  return el;
}

function addLog(html) {
  const empty = $("log").querySelector(".empty");
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = "entry";
  el.innerHTML = html;
  $("log").prepend(el);
  return el;
}

async function check(message, signal) {
  const res = await fetch("/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation, message }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail)), { data });
  return data;
}

// ---------------------------------------------------------------- live check while typing

let liveTimer, liveAbort, liveSeq = 0;

function scheduleLive() {
  clearTimeout(liveTimer);
  const text = $("input").value.trim();
  if (text.length < 3 || handedOff) return;
  liveTimer = setTimeout(() => runLive(text), 250);
}

async function runLive(text) {
  liveAbort?.abort();
  liveAbort = new AbortController();
  const seq = ++liveSeq;
  if (!$("livePill").innerHTML) $("livePill").innerHTML = `<span class="spinner"></span>`;
  try {
    const data = await check(text, liveAbort.signal);
    if (seq !== liveSeq) return;
    const prev = [...$("liveBody").querySelectorAll(".fill")].map((f) => f.style.width.replace("%", ""));
    $("livePill").innerHTML = pill(data.route, data.latencyMs);
    $("liveBody").innerHTML = signalsHTML(data);
    animateBars($("liveBody"), prev.length ? prev : null);
  } catch (err) {
    if (err.name !== "AbortError" && seq === liveSeq) $("liveBody").innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

function clearLive() {
  clearTimeout(liveTimer);
  liveAbort?.abort();
  liveSeq++;
  $("livePill").innerHTML = "";
  $("liveBody").innerHTML = `<p class="hint">Start typing to see Jev score the message in real time.</p>`;
}

// ---------------------------------------------------------------- sending a message

async function send(text) {
  text = text.trim();
  if (!text || handedOff) return;
  clearLive();
  $("input").value = "";
  setBusy(true);
  const n = ++sentCount;
  const msg = addMessage("customer", text, `<span class="pill pending">Checking…</span>`);
  try {
    const data = await check(text);
    msg.querySelector(".pill").outerHTML = pill(data.route, data.latencyMs);
    const entry = addLog(`
      <div class="entry-head"><span class="entry-title">Message ${n}</span>${pill(data.route, data.latencyMs)}</div>
      <p class="quote">“${esc(text)}”</p>
      ${signalsHTML(data)}
      <p class="reasons">${esc(data.reasons.join(" · "))}</p>
      ${rawSections(data.request, data.response)}`);
    animateBars(entry);

    conversation.push({ role: "customer", text });
    if (data.route === "human") {
      handedOff = true;
      const el = document.createElement("div");
      el.className = "handoff";
      el.innerHTML = `<b>Handed off to a human agent</b><br>${esc(data.reasons.join(" · "))}`;
      $("messages").append(el);
      $("messages").scrollTop = $("messages").scrollHeight;
      $("input").placeholder = "Handed off to a human. Start over to try again.";
    } else {
      const reply = botReply(text, data.route);
      conversation.push({ role: "bot", text: reply });
      addMessage("bot", reply, `<span class="who">Support bot</span>`);
    }
  } catch (err) {
    msg.querySelector(".pill").outerHTML = `<span class="pill human">Error</span>`;
    addLog(`<div class="entry-head"><span class="entry-title">Message ${n}</span></div>
      <p class="error">${esc(err.message)}</p>${err.data?.request ? rawSections(err.data.request, err.data.response) : ""}`);
  }
  setBusy(false);
}

function setBusy(busy) {
  const off = busy || handedOff;
  $("input").disabled = off;
  $("send").disabled = off;
  document.querySelectorAll(".chips button").forEach((b) => (b.disabled = off));
  if (!off) $("input").focus();
}

function reset() {
  conversation = [];
  handedOff = false;
  sentCount = 0;
  for (const k in used) delete used[k];
  clearLive();
  $("messages").innerHTML = "";
  $("input").value = "";
  $("input").placeholder = "Type a message…";
  $("log").innerHTML = `<p class="empty">Each message you send is checked by Jev before the bot replies.</p>`;
  addMessage("bot", "Hi! I'm the support bot. How can I help today?", `<span class="who">Support bot</span>`);
  setBusy(false);
}

// ---------------------------------------------------------------- wiring

$("chips").innerHTML = CANNED.map((c, i) => `<button type="button" data-i="${i}">${esc(c)}</button>`).join("");
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-i]");
  if (b && !b.disabled) send(CANNED[b.dataset.i]);
});
$("composer").addEventListener("submit", (e) => { e.preventDefault(); send($("input").value); });
$("input").addEventListener("input", () => ($("input").value.trim() ? scheduleLive() : clearLive()));
$("reset").addEventListener("click", reset);
reset();
