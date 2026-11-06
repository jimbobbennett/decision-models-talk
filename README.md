# Decision models talk: demos

Demos for a talk on decision models: models that return calibrated probabilities instead of generated text.

| Demo | What it shows |
| --- | --- |
| [01-jev-basics](01-jev-basics/) | TypeSafe's Jev model answering **noul** (yes/no), **category** (`choice`) and **score** questions, with each answer shown as text plus a bar chart. |

## Requirements

- Node 18 or later. The demos have no npm dependencies.
- A TypeSafe API key in `TYPESAFE_API_KEY`.

## Run a demo

```bash
export TYPESAFE_API_KEY=...
cd 01-jev-basics
node server.mjs
```

Then open http://localhost:3000. Each demo folder has its own README with more detail.

API keys stay on the local server and are never sent to the browser. Keep keys in a `.env` file inside the demo folder; `.env` files are git-ignored.
