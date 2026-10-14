#!/usr/bin/env python3
"""Mirror the OGS joseki tree rooted at node 15081."""

import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "joseki"
START = "15081"
WORKERS = 4
PAUSE = 0.12
UA = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}


def fetch(node_id):
    url = f"https://online-go.com/oje/positions?id={node_id}&mode=0"
    req = urllib.request.Request(url, headers=UA)
    last = None
    for i in range(6):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            last = exc
            time.sleep(20 if exc.code == 429 else 1.2 * (i + 1))
        except Exception as exc:
            last = exc
            time.sleep(1.2 * (i + 1))
    raise RuntimeError(f"{node_id}: {last}")


def compact(node):
    marks = node.get("marks")
    if isinstance(marks, str):
        try:
            marks = json.loads(marks)
        except json.JSONDecodeError:
            marks = None
    if marks in ([], {}, None, "", "[]", "{}"):
        marks = None
    tags = []
    for tag in node.get("tags") or []:
        if isinstance(tag, dict):
            name = tag.get("name") or tag.get("tagname") or ""
            if name:
                tags.append(name)
        elif isinstance(tag, str) and tag:
            tags.append(tag)
    nxt = []
    for child in node.get("next_moves") or []:
        nxt.append(
            {
                "id": str(child.get("node_id")),
                "mv": child.get("placement") or "",
                "cat": child.get("category") or "",
                "lb": child.get("variation_label") or "",
            }
        )
    return {
        "id": str(node.get("node_id")),
        "play": node.get("play") or "",
        "mv": node.get("placement") or "",
        "cat": node.get("category") or "",
        "lb": node.get("variation_label") or "",
        "desc": node.get("description") or "",
        "marks": marks,
        "see": [str(x) for x in (node.get("see_also") or [])],
        "tags": tags,
        "next": nxt,
    }


def path_for(node_id):
    folder = OUT / node_id[:2]
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{node_id}.json"


def save(node):
    path_for(node["id"]).write_text(
        json.dumps(node, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    done_path = OUT / "_expanded.txt"
    expanded = set()
    if done_path.exists():
        expanded = {line.strip() for line in done_path.read_text().splitlines() if line.strip()}
    queue = []
    queued = set(expanded)
    if START not in expanded:
        queue.append(START)
        queued.add(START)
    else:
        for file in OUT.glob("*/*.json"):
            node = json.loads(file.read_text(encoding="utf-8"))
            if node["id"] in expanded:
                continue
            if node["next"] and node["id"] not in queued:
                queue.append(node["id"])
                queued.add(node["id"])
    print("resume expanded", len(expanded), "queue", len(queue), flush=True)
    saved = 0
    samples = []
    with done_path.open("a", encoding="utf-8") as mark:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            while queue:
                batch = queue[:WORKERS]
                queue = queue[WORKERS:]
                futures = {pool.submit(fetch, node_id): node_id for node_id in batch}
                for future in as_completed(futures):
                    node_id = futures[future]
                    try:
                        payload = future.result()
                    except Exception as exc:
                        print("ERR", node_id, exc, flush=True)
                        queue.append(node_id)
                        continue
                    child_ids = []
                    for raw in payload:
                        node = compact(raw)
                        save(node)
                        saved += 1
                        if node["marks"] and len(samples) < 8:
                            samples.append({"id": node["id"], "marks": node["marks"]})
                        if str(raw.get("node_id")) != node_id and node["next"]:
                            child_ids.append(node["id"])
                    if node_id not in expanded:
                        expanded.add(node_id)
                        mark.write(node_id + "\n")
                        mark.flush()
                    for child in child_ids:
                        if child not in queued:
                            queued.add(child)
                            queue.append(child)
                time.sleep(PAUSE)
                if len(expanded) % 50 < WORKERS:
                    print(
                        f"expanded {len(expanded)} queued {len(queue)} saved_batch {saved}",
                        flush=True,
                    )
    if samples:
        (OUT / "_marks_sample.json").write_text(
            json.dumps(samples, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    files = list(OUT.glob("*/*.json"))
    meta = {"root": START, "nodes": len(files), "expanded": len(expanded)}
    (OUT / "_meta.json").write_text(json.dumps(meta), encoding="utf-8")
    print("done", meta, flush=True)


if __name__ == "__main__":
    main()
