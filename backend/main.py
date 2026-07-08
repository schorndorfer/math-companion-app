"""Local backend for the Math Academy study companion.

Runs on 127.0.0.1 only. The Chrome side-panel extension talks to this
instead of calling Anthropic directly, so the API key never has to live
in extension code.
"""
import json
import re
from typing import List, Optional

import anthropic
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import vault
from config import ANTHROPIC_API_KEY, ANTHROPIC_MODEL, HOST, PORT, get_system_prompt

app = FastAPI(title="Math Academy Companion Backend")

# Bound to localhost only (see HOST in config.py) — CORS is left permissive
# here because the risk is limited to processes already running on your own
# machine. Do not change HOST to 0.0.0.0 without tightening this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[str] = None  # pinned topic/problem text from the side panel


class ChatResponse(BaseModel):
    reply: str


class DraftRequest(BaseModel):
    messages: List[ChatMessage]


class SaveTopicRequest(BaseModel):
    topic: str
    explanation: str = ""
    mistake: str = ""
    prerequisites: List[str] = []
    lean_snippet: str = ""
    status: str = "learning"
    tags: List[str] = ["math-academy"]


def _require_client():
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY is not set. Add it to backend/.env and restart.",
        )


@app.get("/health")
def health():
    return {"status": "ok", "vault": str(vault.VAULT_PATH)}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    _require_client()

    system = get_system_prompt()
    if req.context:
        system += f"\n\n## Current context (from the student)\n{req.context}"

    try:
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": m.role, "content": m.content} for m in req.messages],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {e}")

    reply_text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    )
    return ChatResponse(reply=reply_text)


@app.post("/draft-topic-log")
def draft_topic_log(req: DraftRequest):
    _require_client()

    draft_instructions = (
        "Based on the conversation so far, draft a topic-log entry. "
        "Respond with ONLY a JSON object (no prose, no markdown fences) with exactly "
        "these keys: topic (string), explanation (string, plain-language, in the "
        "student's own words as best you can infer), mistake (string, a common "
        "mistake made or empty string if none came up), prerequisites (array of "
        "strings, topic names this depends on), lean_snippet (string, empty if not "
        "applicable), status (one of: learning, reviewing, mastered), tags "
        "(array of strings)."
    )

    # The API rejects a message list that ends on "assistant" (unsupported
    # prefill) and also rejects two "user" turns in a row, so the trigger
    # below either extends an existing trailing user turn or starts a new one.
    history = [{"role": m.role, "content": m.content} for m in req.messages]
    trigger = "The conversation above is complete. Draft the topic-log JSON now."
    if history and history[-1]["role"] == "user":
        history[-1] = {"role": "user", "content": f"{history[-1]['content']}\n\n{trigger}"}
    else:
        history.append({"role": "user", "content": trigger})

    try:
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1024,
            system=draft_instructions,
            messages=history,
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {e}")

    raw_text = "".join(
        block.text for block in response.content if getattr(block, "type", None) == "text"
    ).strip()

    # Model may still wrap the JSON in a code fence despite instructions; strip it.
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw_text, re.DOTALL)
    json_text = fenced.group(1) if fenced else raw_text

    try:
        draft = json.loads(json_text)
    except json.JSONDecodeError:
        return {"error": "Could not parse a draft from the model.", "raw": raw_text}

    return draft


@app.post("/save-topic")
def save_topic(req: SaveTopicRequest):
    filepath = vault.write_topic_note(
        topic=req.topic,
        explanation=req.explanation,
        mistake=req.mistake,
        prerequisites=req.prerequisites,
        lean_snippet=req.lean_snippet,
        status=req.status,
        tags=req.tags,
    )
    return {"path": str(filepath)}


@app.get("/topics")
def topics():
    return {"topics": vault.list_topics()}


if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
