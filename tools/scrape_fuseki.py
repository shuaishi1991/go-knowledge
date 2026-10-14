#!/usr/bin/env python3
"""Download weiqiok opening classifications, diagrams included."""

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "fuseki.json"
UA = {"User-Agent": "Mozilla/5.0"}
LETTERS = "abcdefghijklmnopqrstuvwxyz"


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    last = None
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                raw = resp.read()
            for enc in ("gbk", "gb18030", "utf-8"):
                try:
                    return raw.decode(enc)
                except UnicodeDecodeError:
                    continue
            return raw.decode("gbk", "replace")
        except Exception as exc:
            last = exc
            time.sleep(0.5 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def clean(text):
    text = re.sub(r"<[^>]+>", "", text)
    text = text.replace("&nbsp;", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def moves_to_sgf(moves):
    chunks = []
    for i, (x, y) in enumerate(moves):
        color = "B" if i % 2 == 0 else "W"
        chunks.append(f";{color}[{LETTERS[x]}{LETTERS[y]}]")
    if not chunks:
        return None
    return "(" + "".join(chunks) + ")"


def parse_table(table_html):
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", table_html, flags=re.S | re.I)
    grid = []
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S | re.I)
        if len(cells) < 15:
            continue
        grid.append(cells[:19])
    if len(grid) < 15:
        return []
    grid = grid[:19]
    numbered = []
    for y, row in enumerate(grid):
        for x, cell in enumerate(row):
            m = re.search(r">(\d+)<", cell)
            if not m:
                m = re.search(r"(\d+)", clean(cell))
            if m:
                numbered.append((int(m.group(1)), x, y))
    numbered.sort()
    return [(x, y) for _, x, y in numbered]


def parse_stats(text):
    kifus = None
    win = None
    m = re.search(r"(?:共\s*)?(\d+)\s*(?:个棋谱|谱)", text)
    if not m:
        m = re.search(r"Total Kifus\s*:\s*(\d+)", text, re.I)
    if m:
        kifus = int(m.group(1))
    m = re.search(r"黑(?:方)?胜(?:率)?\s*([0-9]+(?:\.[0-9]+)?)\s*%", text)
    if not m:
        m = re.search(r"Black Win\s*([0-9]+(?:\.[0-9]+)?)\s*%", text, re.I)
    if m:
        win = float(m.group(1))
    return kifus, win


def split_name(text):
    text = re.sub(r"，?\s*继续分类", "", text)
    en = ""
    m = re.search(r"\(([A-Za-z][^)]*)\)", text)
    if m:
        en = re.sub(r"\s+", " ", m.group(1)).strip()
    text = re.split(r"[\(（]", text)[0]
    text = re.sub(r"^围棋布局\s*\d+\s*[：:]\s*", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ：:")
    return text, en


def page_items(html):
    # Pair each 285px diagram table with the anchor that follows it.
    parts = re.split(r"(?i)<table[^>]*width=285", html)
    items = []
    for part in parts[1:]:
        close = re.search(r"</table>", part, flags=re.I)
        if not close:
            continue
        table, rest = part[: close.start()], part[close.end() :]
        link = re.search(r"(?i)<a\s+href=([^\s>]+)[^>]*>(.*?)</a>", rest, flags=re.S)
        if not link:
            continue
        href = urllib.parse.unquote(link.group(1).strip("'\""))
        if not href.lower().startswith("http"):
            href = "http://www.weiqiok.com/asp/" + href.lstrip("/")
        if "SGFString=" in href:
            base, sgf = href.split("SGFString=", 1)
            href = base + "SGFString=" + urllib.parse.quote(urllib.parse.unquote(sgf), safe="")
        label = clean(link.group(2))
        sgf_m = re.search(r"SGFString=(\([^&\s]+)", href, re.I)
        sgf = sgf_m.group(1) if sgf_m else moves_to_sgf(parse_table(table))
        code_m = re.search(r"BigCode=([A-Za-z0-9]+)", href, re.I)
        code = code_m.group(1) if code_m else ""
        continues = "继续分类" in label or "ShowOpen.asp" in href
        # Leaves point at the game table. Keep the diagram, do not crawl games.
        if "ShowOpenTable" in href:
            continues = False
        kifus, win = parse_stats(label)
        name, en = split_name(label)
        if not name or any(bad in name for bad in ("ICP", "版权", "联系我们")):
            continue
        items.append(
            {
                "code": code,
                "name": name,
                "en": en,
                "kifus": kifus,
                "win": win,
                "sgf": sgf,
                "continues": continues and "ShowOpen.asp" in href,
                "url": href if continues and "ShowOpen.asp" in href else "",
            }
        )
    title = ""
    m = re.search(r"围棋布局类型\s*[:：]\s*([^<(]+)", clean(html))
    if m:
        title = m.group(1).strip()
    return title, items


def main():
    seen = {}

    def crawl(code, url, fallback_name=""):
        if code in seen:
            return
        print("fetch", code, url[:140], flush=True)
        try:
            html = fetch(url)
        except Exception as exc:
            print("  skip", exc, flush=True)
            seen[code] = {"code": code, "name": fallback_name or code, "items": []}
            return
        title, items = page_items(html)
        seen[code] = {
            "code": code,
            "name": title or fallback_name or code,
            "items": items,
        }
        print(f"  {seen[code]['name']} items={len(items)}", flush=True)
        OUT.write_text(json.dumps(seen, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.15)
        for item in items:
            if item["continues"] and item["code"] and item["url"] and item["code"] not in seen:
                crawl(item["code"], item["url"], item["name"])

    root_html = fetch("http://www.weiqiok.com/asp/ShowOpen.asp")
    title, items = page_items(root_html)
    seen["root"] = {"code": "root", "name": "围棋布局", "items": items}
    print("root", len(items))
    for item in items:
        if item["code"]:
            crawl(item["code"], "http://www.weiqiok.com/asp/ShowOpen.asp?BigCode=" + item["code"], item["name"])
    OUT.write_text(json.dumps(seen, ensure_ascii=False), encoding="utf-8")
    leaves = 0
    for page in seen.values():
        for item in page["items"]:
            if not item["continues"]:
                leaves += 1
    print("pages", len(seen), "leaf patterns", leaves, "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
