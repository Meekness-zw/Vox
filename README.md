# Vox — AI Voice & Chat Platform

An AI-powered customer engagement platform: AI voice agents, AI chat agents,
SMS follow-up, appointment booking, knowledge-base training, multi-language
support, and conversation analytics.

This repository is the **MVP** described in the product requirements — a
focused Voice + Chat SaaS — built with the Next.js App Router and deployable to
Vercel.

## What's built

**Marketing site** (`/`)
- Landing page, `/features`, `/pricing` (Starter $99 · Growth $299 · Pro $799 · Enterprise custom)
- `/demo` — a **live, working AI chat agent**

**Product dashboard** (`/dashboard`)
- **Overview** — analytics: calls answered, conversion rate, appointments booked,
  avg. call duration, chat engagement, CSAT, agent utilization + volume and
  outcome charts (Recharts)
- **Agents** — list + **Agent Builder** (prompt editor, voice, personality,
  language, business hours, escalation) with a **live test panel**
- **Conversations** — transcripts, AI summaries, action items, sentiment
- **Knowledge Base** — sources (PDF, Document, FAQ, URL, CSV, Manual Q&A) with
  auto-sync, version control, citations, confidence scoring
- **SMS Automation** — confirmations, reminders, follow-ups, re-engagement
- **Settings** — team roles/permissions, integrations (CRM, calendar,
  telephony), audit log
- **Billing** — current plan, usage meters, plan switching via Stripe Checkout,
  invoices

### Accounts & auth (multi-tenant)

Email/password auth with signed, HTTP-only session cookies. `middleware.ts`
protects `/dashboard`, and every database query is scoped to the signed-in
user's **workspace**, so data is isolated per tenant. Sign up creates a
workspace + owner; without a database the app accepts a demo login
(`demo@vox.ai` / `demo1234`).

### The functional core

Everything below works locally with **zero configuration** (demo mode) and
upgrades to production services the moment you add the matching env var.

**1. AI Chat Agent** — `/api/chat` is a real streaming endpoint on the **Vercel
AI SDK (v6)**. It builds a system prompt from the selected agent's config and
grounds answers in a knowledge base. With `AI_GATEWAY_API_KEY` it streams from a
real model (default `anthropic/claude-haiku-4-5`) via the **Vercel AI Gateway**;
without a key it uses a built-in knowledge-base responder. The frontend
(`ChatPanel`, `useChat`) powers `/demo` and the Agent Builder live preview.

**2. AI Voice Agent** — a full **STT → LLM → TTS** phone loop over Twilio:
- `POST /api/voice/incoming` greets the caller and opens a `<Gather>` for speech
- `POST /api/voice/respond` takes the transcribed speech, runs it through the
  same agent brain (`generateReply`), speaks the reply, and listens again —
  ending the call gracefully on "goodbye"

Point a Twilio number's Voice webhook at `/api/voice/incoming` and call it. It
shares `buildSystemPrompt` and the knowledge base with the chat agent, so both
channels behave identically.

**3. Database** — set `DATABASE_URL` (e.g. Neon Postgres from the Vercel
Marketplace) and the dashboard reads agents and conversations from Postgres; the
Agent Builder's **Save** writes through a server action. Initialize + seed with:

```bash
curl -X POST http://localhost:3000/api/admin/seed
```

Without `DATABASE_URL`, the same repository (`src/lib/repository.ts`) transparently
returns in-memory demo data. The live **System status** panel on the dashboard
overview shows which services are connected vs. running in demo mode.

**4. RAG knowledge base** — the Knowledge page ingests URLs or pasted content:
text is fetched/cleaned, chunked, embedded, and stored in Postgres with
**pgvector** + a generated `tsvector`. `src/lib/rag.ts` retrieves the most
relevant chunks per turn — **vector similarity** when embeddings are available,
**full-text search (OR-ranked)** as the always-on fallback — and injects them
into the agent's system prompt. So agents answer from *your* content, on both
chat and voice.

**5. Real conversations & analytics** — completed voice calls and authenticated
chats are persisted as `conversations` (transcript + heuristic summary,
sentiment, outcome, action items; see `src/lib/conversation.ts`). The dashboard
overview's KPIs and charts are computed live from those rows via SQL
aggregations (`src/lib/analytics.ts`) — calls answered, conversion rate,
appointments booked, avg. duration, chat engagement, CSAT, utilization, plus a
14-day volume series and outcome breakdown.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — app runs in demo mode without it
npm run dev                  # http://localhost:3000
```

Build: `npm run build` · Start: `npm start`

## Configuration (all optional)

See `.env.example`. Set `AI_GATEWAY_API_KEY` to route the chat agent through a
real model, and the `STRIPE_*` keys to enable real checkout on the Billing page.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** with a custom token-based design system (light/dark ready)
- **Vercel AI SDK v6** + AI Gateway for the chat agent
- **Recharts** for analytics
- **lucide-react** icons

## Deploying to Vercel

```bash
vercel
```

Add `AI_GATEWAY_API_KEY` (and any `STRIPE_*` keys) in Project → Settings →
Environment Variables. On Vercel, the AI Gateway also works via the platform's
OIDC token without an explicit key.

## Implementation notes & next steps

Auth + multi-tenancy, the RAG knowledge base, conversation capture, real
analytics, the voice loop, Postgres persistence, and Stripe checkout are all
wired end-to-end. Remaining production hardening:

- **Voice state at scale** — call sessions live in an in-memory `Map` keyed by
  `CallSid` (`src/lib/voice/twiml.ts`); move to Redis/Postgres for multi-instance
  deploys. Voice agents also serve a single default workspace today; map inbound
  numbers → workspace for true per-tenant voice.
- **Webhook security** — validate the `X-Twilio-Signature` header on voice
  webhooks, and protect/remove `/api/admin/seed` after first run.
- **Model-generated summaries** — `analyzeConversation` is heuristic; swap in a
  model pass (the seam is `src/lib/conversation.ts`) when the gateway is funded.
- **PDF ingestion** — the knowledge base ingests URLs and text today; add a PDF
  parser (e.g. `unpdf`) for the PDF/Document tiles.
- **Stripe webhooks** — handle `checkout.session.completed` and
  `customer.subscription.updated` to sync plan + usage, and meter usage limits.
- **Channel expansion** — WhatsApp / Messenger / Instagram adapters; CRM OAuth;
  real Google Calendar booking tool.

> Intentionally **not** built (per the requirements): website builder, lead
> finder, proposal generator, agency/reseller/affiliate programs, white-label
> dashboards, revenue tracking, and other "make money" / marketplace features.
