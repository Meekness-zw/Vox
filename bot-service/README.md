# Vox Python bot engine

This service owns bot prompting, language behavior, and model inference. The
Next.js application owns the UI, tenants, integrations, and business records.

```bash
cd bot-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Set the same `VOX_BOT_SERVICE_TOKEN` in both services. Use either
`AI_GATEWAY_API_KEY` for Vercel AI Gateway or `OPENAI_API_KEY` to call OpenAI
directly. Direct OpenAI calls default to the low-latency `gpt-4.1-mini` model
and can be changed with `VOX_OPENAI_MODEL`. Without either credential the
service remains testable with its Python offline responder.

Business Copilot research is stricter: it always requires `OPENAI_API_KEY`
because `/v1/business-analysis` uses the OpenAI Responses API web-search tool.
Set `VOX_RESEARCH_MODEL` to override the default `gpt-5.4-mini`. Every saved
report must contain at least one verifiable URL citation.

For Railway, also set `VOX_APP_URL` to the public Vercel origin and configure
`ELEVENLABS_API_KEY`. `OPENAI_API_KEY` provides both the model/STT fallback and
an emergency TTS fallback if ElevenLabs is temporarily unavailable. The image
runs as an unprivileged user and exposes a Docker health check at `/health`.
