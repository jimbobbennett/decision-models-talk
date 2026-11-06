# 03 · Angry customer guardrail

A support chat with a Jev guardrail on every customer message. The guardrail decides whether the bot keeps handling the conversation or hands it to a person.

- **As you type,** a live check scores your draft in real time, so you can watch the signals move with every word.
- **When you send,** Jev checks the message before the bot replies. The guardrail log shows the signals, the routing decision, the latency, and the raw request and response.

The idea comes from [LLM guardrails with Jev](https://arize.com/blog/llm-guardrails-jev/) and its demo repo [typesafe-guardrails](https://github.com/jimbobbennett/typesafe-guardrails). The pattern is a fast decision model at a trust boundary, with three outcomes rather than a simple pass or fail.

## Run

From the repo root, after setting up `.env` (see the [main README](../README.md#quick-start)):

```bash
node 03-angry-customer-guardrail/server.mjs
```

Open http://localhost:3002.

Pick a message from the list on the left, or type your own. The list runs from calm to furious, and includes a few tricky ones:

- **Sarcasm:** "Great, just great… Fantastic service." This reads as positive on the surface but is frustrated.
- **Happy but negative words:** a joke about a battered box, which is negative-sounding but calm.
- **Calm request for a person:** asking to talk to someone about upgrading, which isn't angry at all.

Click **Start over** to reset the conversation.

## The guardrail

Every check is a single Jev call with four questions. The `state` is the conversation so far plus the latest message. The questions point at the part they judge with backticked paths:

| Question | Type | What it asks |
| --- | --- | --- |
| `route_to_human` | `noul` | The direct question: should this customer be handed to a human agent now, rather than continuing with the bot? Its `criteria` describe what "yes" and "no" look like. |
| `anger` | `score` | How angry or frustrated is the customer in `` `latest_message` ``? Levels: calm, mildly annoyed, clearly frustrated, angry or hostile (0–3). |
| `wants_human` | `noul` | Does `` `latest_message` `` ask for a human, a manager, or a real person? |
| `threatens_to_leave` | `noul` | Does `` `latest_message` `` threaten to cancel or leave? |

Because `conversation` is part of the state, the same message can score differently depending on what came before. For example, a third "still no update?" reads angrier than the first.

## Routing

`route()` in `server.mjs` turns Jev's answers into one of three outcomes:

| Route | When | What happens |
| --- | --- | --- |
| **Human** | Route to human ≥ 75%, anger ≥ 2.5 (angry), or wants a human / threatens to leave ≥ 60% | The bot stops and the conversation is handed to a person |
| **Watch** | Route to human ≥ 50%, anger ≥ 1.5 (frustrated), or wants a human / threatens to leave ≥ 35% | The bot replies with an apology, and the message is flagged |
| **Bot** | Anything else | The bot carries on as normal |

`route_to_human` is Jev's overall judgment, and the other three are the signals behind it. Asking both ways is cheap, because all four questions go in the same call. The direct question is deliberately the most eager to escalate, so it has its own, higher thresholds. The individual signals catch clear cases on their own. For example, an angry customer always goes to a human, even if the overall judgment is borderline.

Anger escalates without a confidence check. A `score` answer comes with a `confidence` showing how peaked Jev's distribution is, and you could require high confidence before acting. Here the stakes don't justify it: putting an angry customer in front of a person costs little, and leaving them with a bot costs a lot. `noul` answers don't carry a confidence, so they're banded on the probability itself.

All the thresholds are constants at the top of `route()`, so you can tune them.

## How the code works

| File | What it does |
| --- | --- |
| `server.mjs` | Holds the guardrail questions and thresholds, calls Jev at `POST /api/check`, and returns the route, the reasons, the latency, and the full request and response. |
| `app.js` | The chat UI, the scripted bot, the debounced live check, and the guardrail log. |
| `index.html` | Page layout and styles. |

- **The bot is scripted.** It stands in for whatever LLM or flow you would really use, so the demo needs only a TypeSafe key. The guardrail is the point: it runs before the bot does anything.
- **The live check** fires 250 ms after you stop typing. Each new check cancels any earlier one that's still in flight, so the panel always reflects the latest draft. Live checks aren't added to the log; only sent messages are.
- **Speed:** in testing, each check took about 50–150 ms. That's fast enough to run on every keystroke pause and every message without the user noticing.
