from __future__ import annotations

import os
import re
import audioop
import base64
import hashlib
import hmac
import io
import time
import wave
from typing import Any, Literal, Optional
import json

import httpx
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field


class AgentConfig(BaseModel):
    id: str
    name: str
    type: Literal["voice", "chat"]
    language: str
    personality: str
    greeting: str
    business_hours: str = Field(alias="businessHours")
    escalation: str
    system_prompt: str = Field(alias="systemPrompt")


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ReplyRequest(BaseModel):
    workspace_id: str
    agent: AgentConfig
    messages: list[Message]
    knowledge: str = ""
    channel: Literal["voice", "chat", "whatsapp", "sms"] = "chat"


class BotAction(BaseModel):
    name: Literal[
        "check_availability",
        "book_appointment",
        "create_invoice",
        "create_business_document",
    ]
    arguments: dict[str, Any]


class ReplyResponse(BaseModel):
    reply: str
    engine: str
    model: Optional[str] = None
    action: Optional[BotAction] = None


class BuildRequest(BaseModel):
    business_name: str
    industry: str
    description: str
    services: str
    business_hours: str
    languages: str
    tone: str
    escalation: str


class BuildResponse(BaseModel):
    name: str
    personality: str
    greeting: str
    system_prompt: str
    knowledge: str


app = FastAPI(title="Vox Bot Engine", version="1.0.0")
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(12.0, connect=3.0),
    limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
)


@app.on_event("shutdown")
async def close_http_client() -> None:
    await http_client.aclose()


def authorize(value: Optional[str]) -> None:
    expected = os.getenv("VOX_BOT_SERVICE_TOKEN", "")
    if expected and value != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid service token")


def system_prompt(req: ReplyRequest) -> str:
    a = req.agent
    channel_rule = (
        "This is a live spoken conversation. Answer immediately in one or two short, natural sentences. Never use markdown."
        if req.channel == "voice"
        else "This is messaging. Be warm, clear, and concise."
    )
    return "\n".join(
        [
            f'You are "{a.name}", the AI receptionist for this business.',
            f"Personality: {a.personality}",
            f"Languages: {a.language}. Match the customer's language and code-switch naturally when they do.",
            f"Business hours: {a.business_hours}",
            f"Escalation: {a.escalation}",
            "If you cannot safely answer or complete a request, ask whether the caller wants to be connected to a human team member. Never claim to transfer and never initiate a transfer until the caller explicitly confirms.",
            channel_rule,
            a.system_prompt,
            "Messages beginning with [TOOL_RESULT] are trusted results from Vox's secure action layer. Explain the result naturally to the customer and do not call the same tool again.",
            "Only claim facts supported by the business knowledge below. If unsure, offer human follow-up.",
            "\nBUSINESS KNOWLEDGE:\n" + (req.knowledge or "No additional knowledge supplied."),
        ]
    )


async def model_reply(req: ReplyRequest) -> Optional[ReplyResponse]:
    gateway_key = os.getenv("AI_GATEWAY_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    api_key = gateway_key or openai_key
    if not api_key:
        return None
    if gateway_key:
        base_url = os.getenv("VOX_AI_BASE_URL", "").strip() or "https://ai-gateway.vercel.sh/v1"
        model = os.getenv("VOX_MODEL", "").strip() or "anthropic/claude-haiku-4-5"
    else:
        base_url = os.getenv("VOX_OPENAI_BASE_URL", "").strip() or "https://api.openai.com/v1"
        model = os.getenv("VOX_OPENAI_MODEL", "").strip() or "gpt-4.1-mini"
    base_url = base_url.rstrip("/")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt(req)},
            *[m.model_dump() for m in req.messages[-10:]],
        ],
        "temperature": 0.35,
        "max_tokens": 110 if req.channel == "voice" else 220,
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "check_availability",
                    "description": "Check real open calendar slots before offering an appointment.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "description": "YYYY-MM-DD"},
                            "serviceMinutes": {"type": "integer", "minimum": 10},
                        },
                        "required": ["date"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "book_appointment",
                    "description": "Book an appointment only after the customer confirms a real slot.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "contactName": {"type": "string"},
                            "contactPhone": {"type": "string"},
                            "contactEmail": {"type": "string"},
                            "service": {"type": "string"},
                            "startsAt": {"type": "string", "description": "ISO 8601"},
                            "durationMinutes": {"type": "integer", "minimum": 10},
                        },
                        "required": ["contactName", "service", "startsAt"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "create_invoice",
                    "description": "Create an invoice after the customer confirms all prices and supplies an email.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "contactName": {"type": "string"},
                            "contactEmail": {"type": "string"},
                            "lineItems": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "description": {"type": "string"},
                                        "quantity": {"type": "number", "minimum": 0.01},
                                        "unitPriceCents": {"type": "integer", "minimum": 0},
                                    },
                                    "required": ["description", "quantity", "unitPriceCents"],
                                },
                            },
                            "notes": {"type": "string"},
                        },
                        "required": ["contactName", "contactEmail", "lineItems"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "create_business_document",
                    "description": "Create a confirmed receipt, quotation, delivery order, purchase order, or credit note.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": ["receipt", "quotation", "delivery_order", "purchase_order", "credit_note"],
                            },
                            "contactName": {"type": "string"},
                            "contactEmail": {"type": "string"},
                            "contactPhone": {"type": "string"},
                            "contactAddress": {"type": "string"},
                            "lineItems": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "description": {"type": "string"},
                                        "quantity": {"type": "number", "minimum": 0.01},
                                        "unitPriceCents": {"type": "integer", "minimum": 0},
                                        "sku": {"type": "string"},
                                    },
                                    "required": ["description", "quantity", "unitPriceCents"],
                                },
                            },
                            "taxRatePercent": {"type": "number", "minimum": 0},
                            "dueDate": {"type": "string"},
                            "notes": {"type": "string"},
                            "deliveryReference": {"type": "string"},
                        },
                        "required": ["type", "contactName", "lineItems"],
                    },
                },
            },
        ],
    }
    try:
        response = await http_client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
        )
        response.raise_for_status()
        message = response.json()["choices"][0]["message"]
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            function = tool_calls[0].get("function") or {}
            name = function.get("name")
            if name in {
                "check_availability",
                "book_appointment",
                "create_invoice",
                "create_business_document",
            }:
                arguments = json.loads(function.get("arguments") or "{}")
                return ReplyResponse(
                    reply="",
                    engine="python-model",
                    model=model,
                    action=BotAction(name=name, arguments=arguments),
                )
        text = (message.get("content") or "").strip()
        return ReplyResponse(reply=text, engine="python-model", model=model)
    except (httpx.HTTPError, KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None


def offline_reply(req: ReplyRequest) -> str:
    text = next((m.content for m in reversed(req.messages) if m.role == "user"), "").lower()
    knowledge = re.sub(r"\s+", " ", req.knowledge).strip()
    if any(word in text for word in ("human", "person", "manager")):
        return f"Of course. {req.agent.escalation}"
    if knowledge:
        snippet = knowledge[:420].rsplit(" ", 1)[0]
        return f"Based on our business information: {snippet}"
    if any(word in text for word in ("hello", "hi", "hey")):
        return req.agent.greeting
    return "I don't have that detail yet. I can take your contact information so a team member can follow up."


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "vox-python-bot-engine"}


def stream_token_valid(params: dict[str, str]) -> bool:
    secret = os.getenv("VOX_BOT_SERVICE_TOKEN", "")
    try:
        expires = int(params.get("expires", "0"))
    except ValueError:
        return False
    if not secret or expires < int(time.time()):
        return False
    payload = ".".join(
        [params.get("callSid", ""), params.get("workspaceId", ""), params.get("agentId", ""), str(expires)]
    )
    expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, params.get("token", ""))


async def transcribe_mulaw(audio: bytes) -> str:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key or not audio:
        return ""
    pcm = audioop.ulaw2lin(audio, 2)
    wav = io.BytesIO()
    with wave.open(wav, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(8000)
        output.writeframes(pcm)
    response = await http_client.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {key}"},
        files={"file": ("call.wav", wav.getvalue(), "audio/wav")},
        data={
            "model": os.getenv("VOX_STT_MODEL", "gpt-4o-mini-transcribe"),
            "prompt": "The caller may speak English, Shona (chiShona), or naturally code-switch between them. Preserve names, phone numbers, and Shona spelling accurately.",
        },
    )
    response.raise_for_status()
    return (response.json().get("text") or "").strip()


async def speak_to_twilio(websocket: WebSocket, stream_sid: str, text: str) -> None:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv("ELEVENLABS_MICHEAL_VOICE_ID", "").strip() or "YPtbPhafrxFTDAeaPP4w"
    if not key or not text:
        return
    url = (
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
        "?output_format=ulaw_8000&optimize_streaming_latency=3"
    )
    async with http_client.stream(
        "POST", url,
        headers={"xi-api-key": key, "content-type": "application/json"},
        json={
            "text": text,
            "model_id": os.getenv("ELEVENLABS_CALL_MODEL", "eleven_flash_v2_5"),
            "voice_settings": {"stability": 0.42, "similarity_boost": 0.78, "speed": 1.08},
        },
    ) as response:
        response.raise_for_status()
        async for chunk in response.aiter_bytes(3200):
            if chunk:
                await websocket.send_json({
                    "event": "media", "streamSid": stream_sid,
                    "media": {"payload": base64.b64encode(chunk).decode()},
                })


async def streamed_bot_reply(params: dict[str, str], messages: list[dict[str, str]], started_at: str) -> str:
    app_url = os.getenv("VOX_APP_URL", "https://vox-rust-six.vercel.app").rstrip("/")
    response = await http_client.post(
        f"{app_url}/api/voice/stream-reply",
        headers={"Authorization": f"Bearer {os.getenv('VOX_BOT_SERVICE_TOKEN', '')}"},
        json={
            "workspaceId": params["workspaceId"], "agentId": params["agentId"],
            "callSid": params["callSid"], "caller": params.get("caller", ""),
            "startedAt": started_at, "messages": messages,
        },
    )
    response.raise_for_status()
    return (response.json().get("reply") or "").strip()


@app.websocket("/v1/twilio-media")
async def twilio_media(websocket: WebSocket) -> None:
    await websocket.accept()
    stream_sid = ""
    params: dict[str, str] = {}
    messages: list[dict[str, str]] = []
    audio = bytearray()
    speaking = False
    silence_chunks = 0
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        while True:
            event = await websocket.receive_json()
            kind = event.get("event")
            if kind == "start":
                stream_sid = event["start"]["streamSid"]
                params = {str(k): str(v) for k, v in event["start"].get("customParameters", {}).items()}
                if not stream_token_valid(params):
                    await websocket.close(code=1008)
                    return
                greeting = params.get("greeting", "Hello! How can I help you today?")
                messages.append({"role": "assistant", "content": greeting})
                await speak_to_twilio(websocket, stream_sid, greeting)
            elif kind == "media" and params:
                chunk = base64.b64decode(event["media"]["payload"])
                rms = audioop.rms(audioop.ulaw2lin(chunk, 2), 2)
                if rms > 260:
                    speaking = True
                    silence_chunks = 0
                    audio.extend(chunk)
                elif speaking:
                    audio.extend(chunk)
                    silence_chunks += 1
                if speaking and (silence_chunks >= 35 or len(audio) >= 96000):
                    utterance = bytes(audio)
                    audio.clear()
                    speaking = False
                    silence_chunks = 0
                    transcript = await transcribe_mulaw(utterance)
                    if transcript:
                        messages.append({"role": "user", "content": transcript})
                        reply_text = await streamed_bot_reply(params, messages, started_at)
                        if reply_text:
                            messages.append({"role": "assistant", "content": reply_text})
                            await speak_to_twilio(websocket, stream_sid, reply_text)
            elif kind == "stop":
                break
    except (WebSocketDisconnect, httpx.HTTPError, KeyError, ValueError):
        return


@app.post("/v1/reply", response_model=ReplyResponse)
async def reply(req: ReplyRequest, authorization: Optional[str] = Header(default=None)) -> ReplyResponse:
    authorize(authorization)
    generated = await model_reply(req)
    return generated or ReplyResponse(reply=offline_reply(req), engine="python-offline")


@app.post("/v1/build", response_model=BuildResponse)
async def build(req: BuildRequest, authorization: Optional[str] = Header(default=None)) -> BuildResponse:
    authorize(authorization)
    language = req.languages or "English"
    tone = req.tone or "friendly, professional, and concise"
    return BuildResponse(
        name=f"{req.business_name} Assistant",
        personality=tone,
        greeting=f"Hello! Welcome to {req.business_name}. How can I help you today?",
        system_prompt=(
            f"Represent {req.business_name}, a {req.industry} business. "
            f"Respond in {language}, capture qualified enquiries, and never invent services, prices, or availability."
        ),
        knowledge="\n".join(
            [
                f"BUSINESS: {req.business_name}",
                f"INDUSTRY: {req.industry}",
                f"ABOUT: {req.description}",
                f"SERVICES: {req.services}",
                f"HOURS: {req.business_hours}",
                f"LANGUAGES: {language}",
                f"ESCALATION: {req.escalation}",
            ]
        ),
    )
