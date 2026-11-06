# 02 · Tic-Tak-Jev

Play tic-tac-toe against Jev. Jev isn't a game engine. For each of its moves it gets a description of the board and picks a square from the empty ones. The move log shows Jev's probability for every square it could have played, plus the exact request and response for that move.

This demo is adapted from the text mode of [can-ai-play](https://github.com/jimbobbennett/can-ai-play).

## Run

From the repo root, after setting up `.env` (see the [main README](../README.md#quick-start)):

```bash
node 02-tic-tak-jev/server.mjs
```

Open http://localhost:3001.

Use the toggle to choose who goes first. X always moves first, so whoever goes first plays X. To open the page with Jev already playing first, use http://localhost:3001/#jev-first.

## The board

Rows are labelled **A–C** from top to bottom, and columns **1–3** from left to right:

```
 A1 | A2 | A3
----+----+----
 B1 | B2 | B3
----+----+----
 C1 | C2 | C3
```

The same names are used on the board, in the move log, and in the request sent to Jev.

## How a Jev move works

1. The page posts the board (an array of 9 cells) and Jev's mark to `POST /api/move`.
2. The server builds the request in `buildRequest()` in `server.mjs`:
   - `state` holds the rules, the strategy (win if you can, otherwise block, otherwise play for a draw) and the current board as text:
     ```
     Row A: A1=X | A2=X | A3=empty
     Row B: B1=empty | B2=O | B3=empty
     Row C: C1=empty | C2=empty | C3=empty
     ```
   - `questions.move` is a `choice` question. Its `criteria` has one option per empty square, e.g. `"A3": "Place O in square A3."`
3. The server sends the request to `https://api.typesafe.ai/v1/systemone`. It checks that Jev's `choice` is an empty square, then returns the move, the latency, and the full request and response.
4. The page places Jev's mark and adds an entry to the move log. Each entry shows a bar for each square from `probabilities`, and the raw request and response.

Because the only options offered are the empty squares, Jev can't make an illegal move. The server checks the answer anyway.

## Files

| File | What it does |
| --- | --- |
| `server.mjs` | Serves the page, builds each Jev request, calls Jev, and validates the answer. |
| `index.html` | Page layout and styles. |
| `app.js` | Game state, win detection, rendering the board, and the move log. |
