import os
import time
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import (
    AgentConfig,
    Message,
    ReplyRequest,
    app,
    authorize,
    choose_call_language,
    offline_reply,
    stream_token_valid,
)


def request(language: str = "English + Shona", content: str = "hello") -> ReplyRequest:
    return ReplyRequest(
        workspace_id="ws_test",
        agent=AgentConfig(
            id="ag_test", name="Test", type="voice", language=language,
            personality="helpful", greeting="Hello from Test", businessHours="Mon-Fri",
            escalation="Offer a human", systemPrompt="Be accurate",
        ),
        messages=[Message(role="user", content=content)],
        knowledge="HOURS: Monday to Friday 09:00 to 17:00\nSERVICES: Repairs",
        channel="voice",
    )


class BotEngineTests(unittest.TestCase):
    def test_health_and_host_validation(self) -> None:
        client = TestClient(app)
        self.assertEqual(client.get("/health").status_code, 200)
        self.assertEqual(client.get("/health", headers={"host": "bad/host"}).status_code, 400)

    def test_language_locks_and_explicit_switches(self) -> None:
        self.assertEqual(choose_call_language("Makadii henyu", "auto"), "shona")
        self.assertEqual(choose_call_language("I need help", "auto"), "english")
        self.assertEqual(choose_call_language("taura chirungu", "shona"), "english")
        self.assertEqual(choose_call_language("hello", "shona"), "shona")

    def test_offline_reply_does_not_dump_entire_knowledge(self) -> None:
        self.assertEqual(offline_reply(request()), "Hello from Test")
        hours = offline_reply(request(content="What are your hours?"))
        self.assertIn("HOURS:", hours)
        self.assertNotIn("SERVICES:", hours)

    def test_production_auth_fails_closed(self) -> None:
        with patch.dict(os.environ, {"RAILWAY_ENVIRONMENT": "production", "VOX_BOT_SERVICE_TOKEN": ""}):
            with self.assertRaises(HTTPException) as context:
                authorize(None)
            self.assertEqual(context.exception.status_code, 503)

    def test_stream_token_is_scoped_and_expires(self) -> None:
        params = {
            "callSid": "CA1", "workspaceId": "ws", "agentId": "ag",
            "expires": str(int(time.time()) + 60),
        }
        with patch.dict(os.environ, {"VOX_BOT_SERVICE_TOKEN": "secret"}):
            import hashlib, hmac
            payload = ".".join([params["callSid"], params["workspaceId"], params["agentId"], params["expires"]])
            params["token"] = hmac.new(b"secret", payload.encode(), hashlib.sha256).hexdigest()
            self.assertTrue(stream_token_valid(params))
            self.assertFalse(stream_token_valid({**params, "agentId": "other"}))


if __name__ == "__main__":
    unittest.main()
