# 01 · Jev basics

A single page that sends preset prompts to TypeSafe's Jev decision model and shows each answer as text plus a bar chart.

Each preset is one of Jev's question types:

- **Noul**: a yes/no question. Jev returns P(yes).
- **Category** (`choice`): pick one of several labels. Jev returns a probability for each label.
- **Score**: rate on ordered levels. Jev returns a weighted score and a probability for each level.

## Run

```bash
export TYPESAFE_API_KEY=...   # or put it in 01-jev-basics/.env
node server.mjs
```

Open http://localhost:3000. Requires Node 18 or later. There are no dependencies.

Optional environment variables: `PORT` (default 3000) and `JEV_MODEL` (default `jev-latest`).

The API key stays on the server. The page calls `/api/decide`, and the server forwards the request to `https://api.typesafe.ai/v1/systemone`.

To deep-link to a prompt (from a slide, for example), use `http://localhost:3000/#routing-ambiguous`. Add `?run` to run it on load: `http://localhost:3000/?run#routing-ambiguous`.

To add or change prompts, edit `prompts.js`. You can also edit the question and text in the page before you run it.
