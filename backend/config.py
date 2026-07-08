"""Configuration loaded from environment variables / .env file."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parent

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

# Check https://docs.claude.com for the current model slug if this stops working.
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

# Where topic-log markdown files get written. Point this at (a subfolder of)
# your real Obsidian vault. Defaults to a local folder next to the backend
# so the app works out of the box before you've configured anything.
VAULT_PATH = Path(os.environ.get("VAULT_PATH", BACKEND_DIR / "vault")).expanduser()

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8420"))

SYSTEM_PROMPT_PATH = BACKEND_DIR / "prompts" / "system_prompt.md"


def get_system_prompt() -> str:
    return SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
