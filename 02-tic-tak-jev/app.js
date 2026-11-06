// Tic-Tak-Jev: human vs Jev at tic-tac-toe. X always moves first; the toggle decides who is X.
const $ = (id) => document.getElementById(id);
// Rows A-C top to bottom, columns 1-3 left to right.
const SQUARES = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (p) => `${Math.round(p * 100)}%`;

let first = "human";
let game;
const score = { human: 0, jev: 0, draw: 0 };

function winLine(board) {
  return LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) || null;
}

function newGame() {
  const humanMark = first === "human" ? "X" : "O";
  game = {
    board: Array(9).fill(""),
    turn: "X",
    human: humanMark,
    jev: humanMark === "X" ? "O" : "X",
    over: false,
    thinking: false,
    last: -1,
    id: (game?.id || 0) + 1,
  };
  $("log").innerHTML = `<p class="empty">${first === "human" ? "Make a move to start." : "Jev is opening."} Each Jev move shows up here with its request and response.</p>`;
  render();
  if (game.turn === game.jev) jevMove();
}

function render() {
  const line = game.over ? winLine(game.board) : null;
  const canClick = !game.over && !game.thinking && game.turn === game.human;
  $("board").innerHTML = game.board.map((mark, i) => {
    const cls = ["cell", line?.includes(i) ? "win" : "", i === game.last && !line ? "last" : ""].join(" ");
    const inner = mark ? `<span class="mark ${mark}">${mark}</span>` : `<span class="letter">${SQUARES[i]}</span>`;
    return `<button class="${cls}" data-i="${i}" ${mark || !canClick ? "disabled" : ""} aria-label="Square ${SQUARES[i]}${mark ? " " + mark : ""}">${inner}</button>`;
  }).join("");

  let status;
  if (game.over) {
    const w = line ? game.board[line[0]] : "";
    status = !w ? "Draw" : w === game.human ? "You win" : "Jev wins";
  } else if (game.thinking) status = "Jev is thinking…";
  else status = `Your move (${game.human})`;
  $("status").textContent = status;
  $("spinner").className = game.thinking ? "spinner" : "";
  $("scoreHuman").textContent = score.human;
  $("scoreJev").textContent = score.jev;
  $("scoreDraw").textContent = score.draw;
}

function place(i, mark) {
  game.board[i] = mark;
  game.last = i;
  game.turn = mark === "X" ? "O" : "X";
  const line = winLine(game.board);
  if (line || game.board.every(Boolean)) {
    game.over = true;
    const w = line ? game.board[line[0]] : "";
    score[!w ? "draw" : w === game.human ? "human" : "jev"]++;
  }
}

function addEntry(html, cls = "") {
  const empty = $("log").querySelector(".empty");
  if (empty) empty.remove();
  const el = document.createElement("div");
  el.className = `entry ${cls}`;
  el.innerHTML = html;
  $("log").prepend(el);
  return el;
}

function rawSections(request, response) {
  return `
    <details><summary>Raw request</summary><pre>${esc("POST https://api.typesafe.ai/v1/systemone\n\n" + JSON.stringify(request, null, 2))}</pre></details>
    <details><summary>Raw response</summary><pre>${esc(JSON.stringify(response, null, 2))}</pre></details>`;
}

async function jevMove() {
  const id = game.id;
  const moveNo = game.board.filter(Boolean).length + 1;
  game.thinking = true;
  render();
  try {
    const res = await fetch("/api/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: game.board, mark: game.jev }),
    });
    const data = await res.json();
    if (id !== game.id) return; // a new game started while we waited
    if (!res.ok) {
      addEntry(`<div class="entry-head"><span class="entry-title">Move ${moveNo} · Jev</span></div>
        <p class="error">${esc(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail))}</p>
        ${data.request ? rawSections(data.request, data.response) : ""}`);
      game.thinking = false;
      render();
      return;
    }
    const a = data.response.answers.move;
    const rows = Object.entries(a.probabilities || {}).sort((x, y) => y[1] - x[1]);
    const el = addEntry(`
      <div class="entry-head">
        <span class="entry-title">Move ${moveNo} · Jev plays ${game.jev} on <span class="mono">${esc(a.choice)}</span></span>
        <span class="entry-meta"><b>${pct(a.probabilities?.[a.choice] ?? a.confidence)}</b> · <b>${data.latencyMs} ms</b></span>
      </div>
      <div class="bars">
        ${rows.map(([sq, p]) => `
          <div class="bar ${sq === a.choice ? "top" : ""}">
            <span class="name">${esc(sq)}</span>
            <div class="track"><div class="fill" data-w="${(p * 100).toFixed(1)}"></div></div>
            <span class="pct">${pct(p)}</span>
          </div>`).join("")}
      </div>
      ${rawSections(data.request, data.response)}`);
    void el.offsetWidth; // reflow so the bars animate from 0
    el.querySelectorAll(".fill").forEach((f) => (f.style.width = f.dataset.w + "%"));
    game.thinking = false;
    place(data.index, game.jev);
  } catch (err) {
    if (id !== game.id) return;
    addEntry(`<p class="error">Move ${moveNo}: ${esc(err.message)}</p>`);
    game.thinking = false;
  }
  render();
}

$("board").addEventListener("click", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell || cell.disabled) return;
  const i = Number(cell.dataset.i);
  const moveNo = game.board.filter(Boolean).length + 1;
  place(i, game.human);
  addEntry(`Move ${moveNo} · You play ${game.human} on <span class="mono">${SQUARES[i]}</span>`, "human");
  render();
  if (!game.over) jevMove();
});

document.querySelectorAll(".segmented button").forEach((b) => b.addEventListener("click", () => {
  first = b.dataset.first;
  document.querySelectorAll(".segmented button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  newGame();
}));

$("newGame").addEventListener("click", newGame);

// Deep link: #jev-first starts with Jev as X.
if (location.hash === "#jev-first") {
  first = "jev";
  document.querySelectorAll(".segmented button").forEach((x) => x.setAttribute("aria-pressed", x.dataset.first === "jev"));
}
newGame();
