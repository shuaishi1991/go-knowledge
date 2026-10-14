#!/usr/bin/env python3
"""Generate Xiaoxiao mp3s for every speaker button. Skips files that already exist."""

import argparse
import asyncio
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    sys.exit("Please install edge-tts: pip install edge-tts")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from utterances import AUDIO_DIR, audio_filename, collect, norm

VOICE = "zh-CN-XiaoxiaoNeural"


def rate_for(text: str) -> str:
    if len(text) <= 1:
        return "-10%"
    if len(text) <= 4 and not any(p in text for p in "。！？；"):
        return "-5%"
    return "+0%"


async def synth_one(sem, text: str, force: bool, stats: dict):
    path = AUDIO_DIR / audio_filename(text)
    if path.exists() and path.stat().st_size > 0 and not force:
        stats["skip"] += 1
        return
    last = None
    for attempt in range(4):
        async with sem:
            try:
                communicate = edge_tts.Communicate(norm(text), VOICE, rate=rate_for(text))
                await communicate.save(str(path))
                stats["ok"] += 1
                if stats["ok"] % 100 == 0:
                    print(f"  generated {stats['ok']} …", flush=True)
                return
            except Exception as exc:
                last = exc
        await asyncio.sleep(1.5 * (attempt + 1))
    stats["fail"] += 1
    print(f"FAIL {text[:40]!r}: {last}", flush=True)


async def main_async(force: bool, concurrency: int):
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    texts = collect()
    print(f"Voice: {VOICE}", flush=True)
    print(f"Utterances: {len(texts)}  (force={force})", flush=True)
    sem = asyncio.Semaphore(concurrency)
    stats = {"ok": 0, "skip": 0, "fail": 0}
    await asyncio.gather(*(synth_one(sem, text, force, stats) for text in texts))
    print(f"Done. ok={stats['ok']} skip={stats['skip']} fail={stats['fail']}", flush=True)
    print(f"Audio dir: {AUDIO_DIR}", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--concurrency", type=int, default=6)
    args = parser.parse_args()
    asyncio.run(main_async(args.force, args.concurrency))


if __name__ == "__main__":
    main()
