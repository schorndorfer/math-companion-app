"""Writes topic-log entries as Obsidian-flavored markdown files.

Each topic becomes one note. Prerequisites are written as [[wikilinks]] so
Obsidian's built-in graph view renders the prerequisite structure as an
actual knowledge graph, without any custom graph-rendering code here.
"""
import re
from datetime import date
from pathlib import Path
from typing import List, Optional

from config import VAULT_PATH


def slugify_filename(topic: str) -> str:
    # Obsidian is fine with most characters, but strip the ones that are
    # awkward across filesystems (/, :, etc.) and collapse whitespace.
    cleaned = re.sub(r'[\\/:*?"<>|]', "", topic).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or "Untitled Topic"


def ensure_vault_exists() -> Path:
    VAULT_PATH.mkdir(parents=True, exist_ok=True)
    return VAULT_PATH


def list_topics() -> List[str]:
    ensure_vault_exists()
    return sorted(p.stem for p in VAULT_PATH.glob("*.md"))


def _yaml_list(items: List[str]) -> str:
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{i}"' for i in items) + "]"


def write_topic_note(
    topic: str,
    explanation: str,
    mistake: str = "",
    prerequisites: Optional[List[str]] = None,
    lean_snippet: str = "",
    status: str = "learning",
    tags: Optional[List[str]] = None,
) -> Path:
    prerequisites = prerequisites or []
    tags = tags or ["math-academy"]

    ensure_vault_exists()
    filename = slugify_filename(topic) + ".md"
    filepath = VAULT_PATH / filename

    frontmatter = (
        "---\n"
        f'title: "{topic}"\n'
        f"date: {date.today().isoformat()}\n"
        f"status: {status}\n"
        f"tags: {_yaml_list(tags)}\n"
        f"prerequisites: {_yaml_list(prerequisites)}\n"
        "---\n"
    )

    body_parts = [frontmatter, f"\n# {topic}\n"]

    if explanation:
        body_parts.append(f"\n## In my own words\n\n{explanation}\n")

    if mistake:
        body_parts.append(f"\n## Common mistake\n\n{mistake}\n")

    if lean_snippet:
        body_parts.append(f"\n## Lean snippet\n\n```lean\n{lean_snippet}\n```\n")

    if prerequisites:
        links = "\n".join(f"- [[{p}]]" for p in prerequisites)
        body_parts.append(f"\n## Prerequisites\n\n{links}\n")

    filepath.write_text("".join(body_parts), encoding="utf-8")
    return filepath
