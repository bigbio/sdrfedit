"""Named assistant skills invoked by slash commands like /sdrf-annotate."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent

# /sdrf-annotate PXD000547  or  /sdrf:annotate PXD000547
SLASH_RE = re.compile(
    r"^/(?P<name>sdrf-annotate|sdrf:annotate)(?:\s+(?P<args>.+))?\s*$",
    re.IGNORECASE,
)
PXD_RE = re.compile(r"\b(PXD\d+)\b", re.IGNORECASE)


@dataclass(frozen=True)
class SkillInvocation:
    name: str
    args: str
    accession: str | None
    instructions: str
    """Expanded user-facing prompt the model should treat as the request."""
    user_prompt: str


def parse_slash_command(text: str) -> SkillInvocation | None:
    """Return a skill invocation when the user message is a known slash command."""
    match = SLASH_RE.match((text or "").strip())
    if not match:
        return None

    raw_name = match.group("name").lower().replace(":", "-")
    args = (match.group("args") or "").strip()
    accession = _first_pxd(args)

    if raw_name == "sdrf-annotate":
        instructions = load_skill_markdown("sdrf_annotate.md")
        if accession:
            user_prompt = (
                f"Run the sdrf-annotate skill for {accession}. Fetch PRIDE metadata and the "
                f"paper, then propose wizard actions for the page I am on."
            )
        else:
            user_prompt = (
                "Run the sdrf-annotate skill. Ask me for a ProteomeXchange accession if none "
                "was provided, then annotate the current wizard page."
            )
        return SkillInvocation(
            name="sdrf-annotate",
            args=args,
            accession=accession,
            instructions=instructions,
            user_prompt=user_prompt,
        )

    return None


def load_skill_markdown(filename: str) -> str:
    path = SKILLS_DIR / filename
    if not path.is_file():
        return f"(Skill file {filename} is missing.)"
    text = path.read_text(encoding="utf-8")
    # Drop YAML frontmatter if present — the model only needs the body.
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            text = text[end + 4 :].lstrip("\n")
    return text.strip()


def _first_pxd(text: str) -> str | None:
    match = PXD_RE.search(text or "")
    return match.group(1).upper() if match else None
