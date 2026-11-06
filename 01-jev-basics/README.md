# 01 · Jev basics

A single page for trying out Jev's question types. Pick a preset prompt, edit the question or the text if you like, and run it. The page shows Jev's answer as text and as a bar chart of the probabilities. You can also open the exact request that was sent and the response that came back.

## Run

From the repo root, after setting up `.env` (see the [main README](../README.md#quick-start)):

```bash
node 01-jev-basics/server.mjs
```

Open http://localhost:3000.

## The presets

The presets are grouped by question type. Each type has at least one clear-cut example and one ambiguous example. The ambiguous ones are the more interesting results, because the probability is split across several answers.

| Type | What Jev returns | Example presets |
| --- | --- | --- |
| **Noul** | P(yes), from 0 to 1 | Is this a complaint? Is this spam? Is it sarcastic? |
| **Category** (`choice`) | The chosen category, its confidence, and a probability for each category | Route a support ticket, classify sentiment, detect intent |
| **Score** | A weighted score, plus a probability for each level | Rate urgency on four levels |

For a `score` question, the score is the probability-weighted average of the level numbers. That's why it can fall between levels, e.g. `1.18 / 3`.

## How the code works

| File | What it does |
| --- | --- |
| `prompts.js` | The preset prompts. Each one has a `type`, `instructions` (the question), `state` (the text), and `criteria` for `choice` and `score`. |
| `index.html` | The page: the prompt list, the editor and the results. All the CSS and JavaScript is inline. |
| `server.mjs` | Serves the page and proxies `POST /api/decide` to Jev. |

When you click **Decide**:

1. The page posts `{ state, questions: { q: { type, instructions, criteria } } }` to `/api/decide`.
2. The server adds `model` and your API key and forwards the request to `https://api.typesafe.ai/v1/systemone`. It times the call.
3. The server returns Jev's response plus `latencyMs` and the exact `request` it sent.
4. The page renders the result. How it does that depends on the answer type:
   - **noul:** yes and no bars from `noul`.
   - **choice:** one bar per category from `probabilities`, sorted from highest to lowest.
   - **score:** one bar per level, in order, with `legend` providing the level names.

## Customize

- **Add or change prompts:** edit `prompts.js`. The page groups prompts by their `group` field.
- **Deep links:** `http://localhost:3000/#routing-ambiguous` opens a specific preset. Add `?run` to run it as soon as the page loads: `http://localhost:3000/?run#routing-ambiguous`.
- **Shortcut:** press ⌘+Enter or Ctrl+Enter to run the current prompt.
