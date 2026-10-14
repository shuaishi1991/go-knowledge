#!/usr/bin/env python3
"""Download the Chinese Go Magic glossary, including board records."""

import base64
import json
import re
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "terms"
INDEX = "https://gomagic.org/zh/glossary-of-go-terms/"
KEY = b"Vq7tBd2xKp9zRf4mWc6nJh8sLg3yQe5u"
UA = {"User-Agent": "Mozilla/5.0"}

GROUPS = {
    "moves": "行棋手段",
    "shape": "棋形与模样",
    "life": "死活对杀",
    "rules": "规则胜负",
    "rank": "段位赛事",
    "history": "历史头衔",
}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    last = None
    for i in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:
            last = exc
            time.sleep(0.6 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def decode_gmb(token):
    token = token.replace("\\/", "/").strip()
    if token.startswith("GMB1:"):
        token = token[5:]
    pad = "=" * ((4 - len(token) % 4) % 4)
    raw = base64.b64decode(token + pad)
    return bytes(b ^ KEY[i % len(KEY)] for i, b in enumerate(raw)).decode("utf-8")


def js_object_at(html, start):
    if html[start] != "{":
        return None
    depth = 0
    in_str = False
    esc = False
    for k in range(start, len(html)):
        c = html[k]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
        else:
            if c == '"':
                in_str = True
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return html[start : k + 1]
    return None


def boards_in(html):
    found = []
    key = "new GMBoard("
    pos = 0
    while True:
        i = html.find(key, pos)
        if i < 0:
            break
        blob = js_object_at(html, i + len(key))
        if not blob:
            pos = i + len(key)
            continue
        pos = i + len(key) + len(blob)
        try:
            cfg = json.loads(blob)
        except json.JSONDecodeError:
            continue
        sgfs = []
        for item in cfg.get("sgf") or []:
            if isinstance(item, str) and item.startswith("GMB1:"):
                sgfs.append(decode_gmb(item))
            elif isinstance(item, str) and item.startswith("(;"):
                sgfs.append(item)
        found.append(
            {
                "mode": cfg.get("mode") or "Problem_Clean",
                "goto": str(cfg.get("goto") or "0"),
                "sgfs": sgfs,
            }
        )
    return found


class Keep(HTMLParser):
    ALLOW = {"strong", "em", "b", "i", "br", "p", "ul", "ol", "li", "h2", "h3", "h4", "blockquote"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in {"script", "style"}:
            self.skip += 1
            return
        if self.skip or tag not in self.ALLOW:
            return
        if tag == "br":
            self.parts.append("<br>")
            return
        self.parts.append(f"<{tag}>")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in {"script", "style"} and self.skip:
            self.skip -= 1
            return
        if self.skip or tag not in self.ALLOW or tag == "br":
            return
        self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        if self.skip:
            return
        self.parts.append(
            data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )


def entry_html(html):
    i = html.find('class="entry-content"')
    if i < 0:
        return ""
    start = html.find(">", i) + 1
    pos = start
    depth = 1
    end = start
    while pos < len(html) and depth:
        n1 = html.find("<div", pos)
        n2 = html.find("</div>", pos)
        if n2 < 0:
            break
        if n1 != -1 and n1 < n2:
            depth += 1
            pos = n1 + 4
        else:
            depth -= 1
            end = n2
            pos = n2 + 6
    return html[start:end]


def blocks_from(chunk):
    boards = boards_in(chunk)
    pieces = re.split(r'<div class="board_loader"', chunk)
    blocks = []
    # text before the first board, then one board-group per following piece
    for index, piece in enumerate(pieces):
        if index:
            end = piece.find("</script>")
            piece = piece[end + len("</script>") :] if end >= 0 else ""
            board = boards[index - 1] if index - 1 < len(boards) else None
            if board:
                for sgf in board["sgfs"]:
                    blocks.append(
                        {
                            "type": "board",
                            "sgf": sgf,
                            "goto": board["goto"],
                            "mode": board["mode"],
                        }
                    )
        parser = Keep()
        parser.feed(piece)
        html_block = "".join(parser.parts)
        html_block = re.sub(r"(?:<p>\s*</p>)+", "", html_block)
        html_block = re.sub(r"\s+\n", "\n", html_block).strip()
        if html_block:
            blocks.append({"type": "html", "html": html_block})
    return blocks


def text_of(cell):
    return re.sub(r"<[^>]+>", "", cell).strip()


def classify(name, meaning):
    blob = f"{name} {meaning}"
    rules = [
        ("history", ["本因坊", "名人", "棋圣", "王座", "十段", "棋院", "院生", "碁所", "棋社", "棋道", "手谈", "新布局"]),
        ("rank", ["级位", "段位", "初段", "互先", "先相先", "定先", "联棋", "快棋", "十番", "角番"]),
        ("rules", ["贴目", "半目", "和棋", "持棋", "猜先", "读秒", "黑棋", "白棋", "棋盘", "棋盒", "棋石", "提子", "先手", "后手", "双先", "逆先", "见合", "官子", "收官", "收后", "中盘", "转换", "让子", "单官", "胜负"]),
        ("life", ["死活", "诘棋", "劫", "双活", "共活", "对杀", "气紧", "两眼", "点眼", "长生", "治孤", "接不归", "有眼"]),
        ("shape", ["模样", "厚势", "厚", "空三角", "凝形", "星位", "小目", "三三", "目外", "高目", "天元", "连星", "大场", "定式", "大斜", "雪崩", "金柜", "斗方", "守角", "无忧角", "漏风", "袖空", "余味", "味道", "余形", "布局", "实地"]),
    ]
    # short names that must not be swallowed by a broader bucket
    exact = {
        "气": "life",
        "目": "rules",
        "地": "rules",
        "角": "shape",
        "围棋": "rules",
        "棋": "rules",
        "气合": "moves",
        "筋": "moves",
    }
    if name in exact:
        return exact[name]
    for cat, keys in rules:
        if any(k in blob for k in keys):
            return cat
    return "moves"


def parse_index(html):
    rows = re.findall(r"<tr>(.*?)</tr>", html, flags=re.S | re.I)
    terms = []
    for row in rows:
        if "go-term/" not in row:
            continue
        slug_m = re.search(r"/zh/go-term/([^/]+)/", row)
        if not slug_m:
            continue
        slug = slug_m.group(1)
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S | re.I)
        if len(cells) < 7:
            continue
        chars = re.search(r'class="gm-chars">([^<]*)', cells[3])
        cn = chars.group(1).strip() if chars else ""
        title = text_of(cells[0])
        if not cn:
            m = re.match(r"([\u4e00-\u9fff].*?)(?:（|\()", title)
            cn = m.group(1).strip() if m else ""
        meaning = text_of(cells[5])
        stars = text_of(cells[6]).count("★")
        value = re.search(r'data-value="(\d+)"', cells[6])
        if value and not stars:
            stars = int(value.group(1))
        name = cn or meaning or title
        terms.append(
            {
                "slug": slug,
                "name": name,
                "meaning": meaning,
                "importance": stars,
                "category": classify(name, meaning),
            }
        )
    # unique, keep first
    seen = set()
    out = []
    for term in terms:
        if term["slug"] in seen:
            continue
        seen.add(term["slug"])
        out.append(term)
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    index = fetch(INDEX)
    terms = parse_index(index)
    print(f"index terms {len(terms)}")
    for n, term in enumerate(terms, 1):
        dest = OUT / f"{term['slug']}.json"
        if dest.exists():
            print(f"[{n}/{len(terms)}] skip {term['slug']}")
            continue
        url = f"https://gomagic.org/zh/go-term/{term['slug']}/"
        try:
            html = fetch(url)
            term["blocks"] = blocks_from(entry_html(html))
        except Exception as exc:
            print(" FAIL", term["slug"], exc)
            term["blocks"] = []
        dest.write_text(json.dumps(term, ensure_ascii=False, indent=2), encoding="utf-8")
        boards = sum(1 for b in term["blocks"] if b["type"] == "board")
        print(f"[{n}/{len(terms)}] {term['name']} boards={boards}")
        time.sleep(0.15)
    catalog = []
    for term in terms:
        path = OUT / f"{term['slug']}.json"
        if not path.exists():
            continue
        saved = json.loads(path.read_text(encoding="utf-8"))
        catalog.append(
            {
                "slug": saved["slug"],
                "name": saved["name"],
                "meaning": saved["meaning"],
                "importance": saved["importance"],
                "category": saved["category"],
                "boards": sum(1 for b in saved.get("blocks", []) if b["type"] == "board"),
            }
        )
    (ROOT / "data" / "glossary.json").write_text(
        json.dumps({"groups": GROUPS, "terms": catalog}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    review = ROOT / "data" / "glossary-review.tsv"
    lines = ["category\timportance\tname\tmeaning\tslug"]
    for item in catalog:
        lines.append(
            f"{item['category']}\t{item['importance']}\t{item['name']}\t{item['meaning']}\t{item['slug']}"
        )
    review.write_text("\n".join(lines), encoding="utf-8")
    print("wrote", len(catalog))


if __name__ == "__main__":
    main()
