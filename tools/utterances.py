"""Texts that get a speaker button and a matching mp3."""

import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIO_DIR = ROOT / "audio"
MAX_AUDIO_NAME_BYTES = 180

SPEAKER_SVG = (
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">'
    '<path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4zm11.5 3a3.5 3.5 0 0 0-1.8-3.1v6.2A3.5 3.5 0 0 0 15.5 12z"/>'
    "</svg>"
)

BLOCK = re.compile(r"<(p|h2|h3|li)(\s[^>]*)?>(.*?)</\1>", re.I | re.S)


def norm(text):
    text = (text or "").replace("\u00a0", " ")
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">")
    return re.sub(r"\s+", " ", text).strip()


def tidy(text):
    text = re.sub(r"\s+", " ", text or "").strip()
    return re.sub(r"\s*[\(（][^)）]*[\)）]", "", text).strip()


def visible_text(fragment):
    text = re.sub(r"<br\s*/?>", " ", fragment or "", flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return norm(text)


def audio_filename(text):
    text = norm(text)
    if not text or "/" in text or "\\" in text or text in (".", ".."):
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        return f"h_{digest}.mp3"
    raw = f"{text}.mp3"
    if len(raw.encode("utf-8")) > MAX_AUDIO_NAME_BYTES:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
        return f"h_{digest}.mp3"
    return raw


def speak_button(text):
    text = norm(text)
    if not text:
        return ""
    return (
        f'<button type="button" class="speak" data-speak="{html.escape(text, quote=True)}" '
        f'aria-label="朗读">{SPEAKER_SVG}</button>'
    )


def prose_with_speech(fragment):
    found = []

    def repl(match):
        tag, attrs, inner = match.group(1), match.group(2) or "", match.group(3)
        text = visible_text(inner)
        if not text:
            return match.group(0)
        found.append(text)
        return f"<{tag}{attrs}>{inner}{speak_button(text)}</{tag}>"

    return BLOCK.sub(repl, fragment), found


def _json(path):
    file = ROOT / path
    if not file.exists():
        return {}
    return json.loads(file.read_text(encoding="utf-8"))


def collect():
    texts = set()
    catalog = _json("data/glossary.json")
    for item in catalog.get("terms") or []:
        slug = item.get("slug")
        path = ROOT / "data" / "terms" / f"{slug}.json"
        term = _json(f"data/terms/{slug}.json") if path.exists() else item
        name = norm(tidy(term.get("name")))
        meaning = norm(tidy(term.get("meaning")))
        if name:
            texts.add(name)
        if meaning:
            texts.add(meaning)
        for block in term.get("blocks") or []:
            if block.get("type") == "html":
                _, found = prose_with_speech(block.get("html") or "")
                texts.update(found)
    for value in _json("data/glossary-zh.json").values():
        text = norm(value)
        if text:
            texts.add(text)
    for value in _json("data/joseki-zh.json").values():
        text = norm(value)
        if text and "Empty Goban" not in text:
            texts.add(text)
    fuseki = _json("data/fuseki.json")
    for code, page in fuseki.items():
        if code != "root":
            title = norm(page.get("name") or "")
            if title and title != "围棋布局":
                texts.add(title)
        for item in page.get("items") or []:
            name = norm(item.get("name") or "")
            if name:
                texts.add(name)
    texts.discard("")
    return sorted(texts)
