# Decision model demos

Small, self-contained demos of **decision models**: models that answer a question about some input with calibrated probabilities instead of generated text.

The demos use [Jev](https://docs.typesafe.ai) from TypeSafe AI. You give Jev some *state* (text or JSON) and one or more *questions*. For each question it returns structured numbers:

| Question type | You ask | Jev returns |
| --- | --- | --- |
| `noul` | A yes/no question | The probability that the answer is yes, e.g. `0.95` |
| `choice` | Pick one category from a list you define | The chosen category, plus a probability for every category |
| `score` | Rate the input on ordered levels you define | A weighted score, plus a probability for every level |

The answer is always one of the options you offered, so there's no free text to parse.

## Demos

| Demo | What it shows |
| --- | --- |
| [01 · Jev basics](01-jev-basics/) | Pick from preset prompts covering `noul`, `choice` (category) and `score` questions. Each answer is shown as text and a bar chart of the probabilities. |
| [02 · Tic-Tak-Jev](02-tic-tak-jev/) | Play tic-tac-toe against Jev. Each Jev move is a `choice` over the empty squares, and the page shows the probabilities and the raw request and response for every move. |

## Quick start

You need [Node.js](https://nodejs.org) 18 or later and a TypeSafe API key. There are no npm packages to install.

```bash
git clone https://github.com/jimbobbennett/decision-models-talk.git
cd decision-models-talk
cp .env.example .env        # then edit .env and set TYPESAFE_API_KEY
```

Run a demo:

```bash
node 01-jev-basics/server.mjs     # http://localhost:3000
node 02-tic-tak-jev/server.mjs    # http://localhost:3001
```

The demos use different ports, so you can run both at the same time.

## Configuration

Each server reads its settings from environment variables. It also loads them from a `.env` file in the demo folder or the repo root, in that order. A variable that is already set in your shell takes priority over both files.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `TYPESAFE_API_KEY` | Yes | — | Your TypeSafe API key |
| `JEV_MODEL` | No | `jev-latest` | The Jev model to call |
| `PORT` | No | `3000` (demo 01), `3001` (demo 02) | The port the server listens on |

`.env` files are git-ignored. Only `.env.example` is checked in.

## How the demos are built

Every demo has the same shape: a tiny Node server built only from Node's standard library, plus a static page.

```
browser  ──►  local Node server  ──►  https://api.typesafe.ai/v1/systemone
 (page)        (holds the API key)         (Jev)
```

- The page never sees your API key. It calls the local server, and the server adds the `Authorization: Bearer` header and forwards the request to Jev.
- The server sends the exact request body back to the page along with Jev's response, so you can see both in the UI.
- There is no build step and no framework. Each demo is plain HTML, CSS and JavaScript that you can read top to bottom.

## Calling Jev directly

You can also call the API without the demos. This is the shape every demo uses:

```bash
curl https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev-latest",
    "state": "I got charged twice this month and now I cannot log in.",
    "questions": {
      "team": {
        "type": "choice",
        "instructions": "Which team should handle this support ticket?",
        "criteria": {
          "billing": "Charges, refunds, invoices or payment methods",
          "account": "Logins, passwords, permissions or profile settings"
        }
      }
    }
  }'
```

The response has an answer for each question, keyed by the name you gave it:

```json
{
  "model": "jev-1.14.0",
  "answers": {
    "team": {
      "type": "choice",
      "choice": "account",
      "confidence": 0.12,
      "probabilities": { "billing": 0.44, "account": 0.56 }
    }
  },
  "usage": { "input_tokens": 337, "output_tokens": 31 }
}
```

This ticket is genuinely ambiguous, so Jev splits its probability between the two teams and reports low confidence. Exact values can vary slightly between calls. See the [TypeSafe docs](https://docs.typesafe.ai) for the full API reference.

## Repository layout

```
.env.example          Template for your API key
01-jev-basics/        Demo 01: noul, choice and score questions
02-tic-tak-jev/       Demo 02: tic-tac-toe against Jev
```

Each demo folder has its own README explaining how its code works.
