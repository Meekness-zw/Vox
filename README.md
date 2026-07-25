# Vox — AI Voice & Chat Platform

An AI-powered customer engagement platform: AI voice agents, AI chat agents,
WhatsApp, SMS follow-up, real appointment booking (Google Calendar), invoicing,
knowledge-base training, multi-language support, and conversation analytics.

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
channels behave identically. The dialed number is looked up in `phone_numbers`
(`src/lib/repository.ts`'s `getRoutingForNumber`) to resolve the right
workspace + agent, so each business's own number reaches its own agent,
knowledge base, calendar, and invoices — not a shared demo workspace.

**3. WhatsApp** — `POST /api/whatsapp/incoming` runs the same agent brain over
a Twilio WhatsApp sender. Since WhatsApp has no call-session concept, each
turn loads/saves the conversation thread from Postgres (`wa_<workspace>_<from>`)
instead of an in-memory session, and replies synchronously via TwiML
`<Message>` — no separate Twilio REST call needed. Threads show up in the
Conversations dashboard automatically (channel: "whatsapp").

**4. Real appointment booking (Google Calendar)** — agents can actually book,
not just talk about it. `src/lib/agent-tools.ts` exposes `check_availability`
and `book_appointment` as AI SDK tool calls (`src/lib/agent-runtime.ts`); Google
account **OAuth** is per-workspace (`/api/integrations/google/connect` +
`/callback`, wired into Settings → Integrations). Without a connected
calendar, availability falls back to a naive 9–5 slot generator against
already-booked `appointments` rows, so booking works with zero config and
upgrades to real Google Calendar sync — plus a real calendar event — the
moment a workspace connects one. See `/dashboard/appointments`.

**5. Invoices (PDF + email)** — once a service/price is agreed, agents call
`create_invoice` (`src/lib/agent-tools.ts`) to generate a PDF (`pdf-lib`) and
email it (`resend`) to the client. Without `RESEND_API_KEY` the invoice is
still created and downloadable from `/dashboard/invoices` (or
`/api/invoices/[id]/pdf`), just not auto-emailed. These are **client-facing**
invoices (`client_invoices` table / `ClientInvoice` type) — distinct from
Vox's own Stripe subscription invoices on the Billing page.

Tool-calling is only enabled for authenticated workspace conversations (real
phone calls, WhatsApp, and signed-in dashboard chat) — the public marketing
`/demo` stays read-only so an anonymous visitor can't create real appointments
or invoices.

**6. Database** — set `DATABASE_URL` (e.g. Neon Postgres from the Vercel
Marketplace) and the dashboard reads agents and conversations from Postgres; the
Agent Builder's **Save** writes through a server action. Initialize + seed with:

```bash
curl -X POST http://localhost:3000/api/admin/seed
```

Without `DATABASE_URL`, the same repository (`src/lib/repository.ts`) transparently
returns in-memory demo data. The live **System status** panel on the dashboard
overview shows which services are connected vs. running in demo mode.

**7. RAG knowledge base** — the Knowledge page ingests URLs or pasted content:
text is fetched/cleaned, chunked, embedded, and stored in Postgres with
**pgvector** + a generated `tsvector`. `src/lib/rag.ts` retrieves the most
relevant chunks per turn — **vector similarity** when embeddings are available,
**full-text search (OR-ranked)** as the always-on fallback — and injects them
into the agent's system prompt. So agents answer from *your* content, on both
chat and voice.

**8. Real conversations & analytics** — completed voice calls and authenticated
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

See `.env.example` for the full list. Set `AI_GATEWAY_API_KEY` to route agents
through a real model, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
`TWILIO_PHONE_NUMBER`/`TWILIO_WHATSAPP_NUMBER` for voice + WhatsApp,
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`TOKEN_ENCRYPTION_KEY` for Google
Calendar booking, `RESEND_API_KEY` to email invoices, and the `STRIPE_*` keys
to enable real checkout on the Billing page.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** with a custom token-based design system (light/dark ready)
- **Vercel AI SDK v6** + AI Gateway for the chat agent
- **Recharts** for analytics
- **lucide-react** icons
- **Python 3.12 + FastAPI** for the bot reasoning and generation engine

## Managed bot-building workflow

Vox now separates the product UI from the bots. Next.js owns onboarding,
accounts, the admin review queue, channels, and records. The Python service in
`bot-service/` owns prompt construction, multilingual behavior, model calls,
and bot generation.

Clients submit a brief at `/dashboard/request-bot`. Vox staff listed in
`VOX_ADMIN_EMAILS` review it at `/dashboard/admin/requests`, generate a draft
through Python, test and improve it in the existing Agent Builder, and then
publish it. The lifecycle is `submitted → under review → building → testing →
approved → live`, with `changes requested` available when client input is
needed.

Run both processes locally. The first command is only needed once:

```bash
npm run bot:setup
npm run dev:all
```

`dev:all` starts Next.js on port 3000 and the Python bot engine on port 8000.
Running only `npm run dev` does not start the bot engine. For model-generated
answers rather than the fast offline responder, set `AI_GATEWAY_API_KEY` (or
`OPENAI_API_KEY`) in `.env` before starting both services.

## Deploying to Vercel

```bash
vercel
```

Add `AI_GATEWAY_API_KEY` (and any `STRIPE_*` keys) in Project → Settings →
Environment Variables. On Vercel, the AI Gateway also works via the platform's
OIDC token without an explicit key.

## Implementation notes & next steps

Auth + multi-tenancy, the RAG knowledge base, conversation capture, real
analytics, the voice loop, WhatsApp, Google Calendar booking, invoicing,
Postgres persistence, and Stripe checkout are all wired end-to-end. Remaining
production hardening:

- **Voice state at scale** — call sessions live in an in-memory `Map` keyed by
  `CallSid` (`src/lib/voice/twiml.ts`); move to Redis/Postgres for multi-instance
  deploys. (WhatsApp already sidesteps this — its thread state is DB-backed.)
- **Webhook security** — `TWILIO_AUTH_TOKEN` enables `X-Twilio-Signature`
  validation (`src/lib/twilio-signature.ts`) on all three Twilio webhooks, but
  it's skipped when unset; set it before production. Protect/remove
  `/api/admin/seed` after first run.
- **Model-generated summaries** — `analyzeConversation` is heuristic; swap in a
  model pass (the seam is `src/lib/conversation.ts`) when the gateway is funded.
- **PDF ingestion** — the knowledge base ingests URLs and text today; add a PDF
  parser (e.g. `unpdf`) for the PDF/Document tiles.
- **Stripe metering** — checkout completion and invoice payment state are
  synchronized, but usage-based limits still need enforcement and reporting.
- **KPI reconciliation** — the Overview's `appointmentsBooked` KPI still comes
  from the `analyzeConversation` heuristic, not the real `appointments` table;
  worth swapping to a real count now that appointments are real.
- **Real-time voice** — the phone loop is turn-based (`<Gather>`); barge-in/
  interruption would need Twilio Media Streams, a bigger integration.
- **Rate limiting** — no per-contact throttling on AI Gateway calls yet; worth
  adding now that a call/message can trigger real calendar writes and emails.

> Intentionally **not** built (per the requirements): website builder, lead
> finder, proposal generator, agency/reseller/affiliate programs, white-label
> dashboards, revenue tracking, and other "make money" / marketplace features.
