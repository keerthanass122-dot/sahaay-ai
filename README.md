# TriageBridge

**PromptWars × Techverse — "Build a Gemini-powered app that bridges human intent and complex systems"**

TriageBridge takes messy, real-world medical input — spoken symptoms, pasted
prescription notes, a photo of a rash or pill bottle — and turns it into a
structured, verified, plain-language action plan with an urgency rating.

## Why this problem

The brief calls out, almost verbatim, "a messy stack of medical history" →
"structured, verified, and life-saving actions." Health triage is also one of
the clearest real-world cases where *unstructured input → verified structured
output* actually matters: getting it wrong has consequences, so "verified" has
to mean something, not just be a UI label.

## Architecture: three narrow Gemini stages, not one big prompt

```
[voice / text / photo / pasted history]
              │
              ▼
   STAGE 1 — EXTRACTION
   messy multimodal input → structured JSON facts
              │
              ▼
   STAGE 2 — VERIFICATION
   structured facts → interaction / allergy / conflict flags
              │
              ▼
   STAGE 3 — ACTION PLAN
   facts + flags → urgency level + plain-language plan
```

Each stage is a **separate Gemini call with a narrow job and a strict JSON
schema** (enforced via `responseMimeType: "application/json"`), rather than
one prompt asking for everything at once. This is the core of the prompt
strategy:

| Stage | Job | Key constraint |
|---|---|---|
| Extraction | Turn messy multimodal input into facts | Never invent a value; unknown fields are explicit, not guessed |
| Verification | Check facts against known conflict types | Only flag genuine interactions; omit rather than fabricate |
| Action plan | Turn verified facts into a plan a non-expert can follow | Forced into 3 urgency buckets; never states a diagnosis |

Chaining narrow stages (rather than one prompt) means:
- Each stage's output can be inspected/debugged independently (visible in the UI as it runs).
- Stage 3 never touches raw user text — it only sees already-*verified* structured data, so the "verified" claim in the brief is actually enforced by the pipeline, not just asserted.
- Errors are traceable to a specific stage instead of being buried in one long response.

## Prompt engineering techniques used

- **Role framing** — each system instruction opens by defining the model's narrow job ("extraction engine", "verification engine", "action-planning engine"), not "you are a helpful assistant."
- **Strict output schema** — every stage must return JSON matching an exact shape; no prose, no markdown fences (enforced by `responseMimeType`).
- **Explicit uncertainty handling** — "if unknown, say unknown" / "if not confident, omit it" — this stops the model from hallucinating medications or interactions it wasn't given.
- **Forced categorical outputs** — severity levels and urgency buckets are constrained to fixed enums so the UI can render deterministic color-coded banners instead of parsing free text.
- **Grounding later stages in earlier structured output only** — stage 3's prompt receives stage 1 + stage 2 JSON, never the original raw text, so downstream reasoning can't drift from what was actually verified.
- **Plain-language constraint** — the final stage is explicitly told the reader may be "under stress," which shapes tone, not just content.

## Running it

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Open `script.js` and set it near the top:
   ```js
   const API_KEY = "your-key-here";
   ```
3. Open `index.html` in a browser (or deploy the folder as a static site — no build step needed).
4. Describe symptoms (type or use the mic), optionally paste messy medical history, optionally attach a photo.
5. Click **Run TriageBridge** and watch the three pipeline stages fill in.

**Note:** the key lives directly in the client-side JS, so it's visible to
anyone who views the page source. That's an acceptable trade-off for a
hackathon demo, but not for a real deployment — see Limitations below.

## Deploying

Static site, zero build step — works on any static host:

```bash
# Netlify
netlify deploy --prod --dir .

# Vercel
vercel --prod

# GitHub Pages
# just push to a repo and enable Pages on the root
```

## Stack

- Vanilla HTML/CSS/JS — no framework, no template, built from scratch for this event
- Gemini API (`gemini-2.5-flash`, multimodal) called directly from the browser
- Web Speech API for voice input

## Limitations / honesty for the demo

- This is a hackathon prototype, not a medical device — the UI says so.
- Verification stage checks common interaction *types* via the model's own knowledge; it is not backed by a licensed drug-interaction database. In a real product, Stage 2 would call a real interaction-checking API (e.g. RxNorm/DrugBank) with Gemini used to interpret and explain results, not to be the source of truth.
- The API key is hardcoded client-side for demo simplicity; a production version would proxy calls through a backend so the key never touches the browser.
