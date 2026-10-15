#!/usr/bin/env python3
"""Build the three-hall static site from scraped JSON."""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ("moves", "行棋手段", "局部手段、接触战和手筋。"),
    ("shape", "棋形与模样", "棋形、点位、模样和定式名称。"),
    ("life", "死活对杀", "眼、气、劫、对杀。"),
    ("rules", "规则胜负", "胜负、先后手、用时和棋具。"),
    ("rank", "段位赛事", "段级、手合和对局形式。"),
    ("history", "历史头衔", "头衔、棋院和棋史。"),
]

# Reviewed by hand against the Chinese glossary. Keyword guesses stay as fallback.
OVERRIDES = {
    "weiqi": "rules",
    "baduk": "rules",
    "igo": "rules",
    "ki": "rules",
    "goishi": "rules",
    "goke": "rules",
    "goban": "rules",
    "komi": "rules",
    "gyaku-komi": "rules",
    "moku": "rules",
    "ji": "rules",
    "jigo": "rules",
    "hanmoku": "rules",
    "nigiri": "rules",
    "byoyomi": "rules",
    "kuro": "rules",
    "shiro": "rules",
    "nuki": "rules",
    "sente": "rules",
    "gote": "rules",
    "ryou-sente": "rules",
    "gyaku-sente": "rules",
    "miai": "rules",
    "yose": "rules",
    "tedomari": "rules",
    "chuban": "rules",
    "furikawari": "rules",
    "dame": "life",
    "damezumari": "life",
    "ko": "life",
    "koudate": "life",
    "hanami-ko": "life",
    "seki": "life",
    "semeai": "life",
    "shikatsu": "life",
    "tsumego": "life",
    "nigan": "life",
    "nakade": "life",
    "chosei": "life",
    "shinogi": "life",
    "oiotoshi": "life",
    "me-ari-me-nashi": "life",
    "aji": "shape",
    "aji-keshi": "shape",
    "moyo": "shape",
    "oomoyo": "shape",
    "atsumi": "shape",
    "akisankaku": "shape",
    "korigatachi": "shape",
    "amarigatachi": "shape",
    "susoaki": "shape",
    "hoshi": "shape",
    "komoku": "shape",
    "sansan": "shape",
    "mokuhazushi": "shape",
    "takamoku": "shape",
    "tengen": "shape",
    "sanrensei": "shape",
    "nirensei": "shape",
    "ooba": "shape",
    "sumi": "shape",
    "joseki": "shape",
    "taisha": "shape",
    "nadare": "shape",
    "ichigomasu": "life",
    "shimari": "shape",
    "oogeima-jimari": "shape",
    "keima-shimari": "shape",
    "fuseki": "shape",
    "kyu": "rank",
    "dan": "rank",
    "shodan": "rank",
    "tagai-sen": "rank",
    "sen-ai-sen": "rank",
    "josen": "rank",
    "rengo": "rank",
    "hayago": "rank",
    "jubango": "rank",
    "kadoban": "rank",
    "honinbo": "history",
    "meijin": "history",
    "kisei": "history",
    "oza": "history",
    "judan": "history",
    "nihon-ki-in": "history",
    "kansai-ki-in": "history",
    "insei": "history",
    "godokoro": "history",
    "gokaisho": "history",
    "kido": "history",
    "shudan": "history",
    "shin-fuseki": "history",
    "semedori": "moves",
    "ponnuki": "shape",
    "kikashi": "moves",
    "kifu": "rules",
    "ishi-no-shita": "moves",
    "keshi": "moves",
    "atari": "moves",
    "gokaku": "rules",
    "tewari": "moves",
}


def tidy(text):
    text = re.sub(r"\s+", " ", text or "").strip()
    return re.sub(r"\s*[\(（][^)）]*[\)）]", "", text).strip()


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


# 增删一本书：改这份清单。id 对应站点目录和下面的 build 函数。
BOOKS = [
    {
        "id": "glossary",
        "title": "术语",
        "num": "壹",
        "source": "术语取自 Go Magic 中文术语表，只保留中文。",
    },
    {
        "id": "joseki",
        "title": "定式",
        "num": "贰",
        "source": "定式取自 OGS 定式字典。",
    },
    {
        "id": "fuseki",
        "title": "布局",
        "num": "叁",
        "source": "布局取自围棋学研网的布局分类、谱数和黑胜率。",
    },
]


def chrome(title, body, depth, book=None, extra=""):
    pre = "../" * depth
    label = ""
    footer = "棋盘按 GoMagic 的木纹棋盘和落子操作。"
    if book:
        meta = next(item for item in BOOKS if item["id"] == book)
        label = f'<span class="book">{html.escape(meta["title"])}</span>'
        footer = html.escape(meta["source"])
    return f"""<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="{pre}assets/css/site.css">
<link rel="stylesheet" href="{pre}assets/css/board.css">
</head>
<body>
<header class="top">
  <a class="brand" href="{pre}index.html">围棋书房</a>
  {label}
</header>
<main class="wrap">
{body}
</main>
<footer class="foot">{footer}</footer>
<script src="{pre}assets/js/board.js"></script>
{extra}
</body>
</html>
"""


def with_zh_comments(sgf):
    path = ROOT / "data" / "glossary-zh.json"
    if not path.exists() or not sgf or "__en:" not in sgf:
        return sgf
    zh = json.loads(path.read_text(encoding="utf-8"))

    def repl(match):
        en = match.group(1).strip()
        chinese = zh.get(en)
        if not chinese:
            return match.group(0)
        return f"__zh: {chinese}\n__en: {en}"

    return re.sub(r"__en:\s*(.*?)(?=__|\])", repl, sgf, flags=re.S)


def board_html(sgf, mode="view", at="", numbers=None, full=False):
    attrs = [f'data-mode="{mode}"']
    if at:
        attrs.append(f'data-at="{at}"')
    if numbers is not None:
        attrs.append(f'data-numbers="{1 if numbers else 0}"')
    if full:
        attrs.append('data-full="1"')
    safe = (sgf or "").replace("</", "<\\/")
    return f'<div class="gm-host" {" ".join(attrs)}><script type="text/plain">{safe}</script></div>'


def normalize_sgf(sgf):
    if not sgf:
        return None
    sgf = sgf.strip()
    if sgf.startswith("(;SZ"):
        return sgf
    if sgf.startswith("(;"):
        return "(;SZ[19]" + sgf[1:]
    return sgf


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def book_blurb(book_id, counts):
    if book_id == "glossary":
        return f"{counts['terms']} 条中文术语，分成六类。带谱的条目可以一手一手翻看。"
    if book_id == "joseki":
        return f"{counts['lines']} 条变化，每条单独成页，只含这一条手顺。"
    if book_id == "fuseki":
        return f"{counts['fuseki']} 个大类，其下 {counts['patterns']} 个开局型，每型单独成页。"
    return ""


def build_home(counts):
    cards = []
    for book in BOOKS:
        cards.append(
            f'<a class="chapter" href="{book["id"]}/index.html">'
            f'<span class="num">{html.escape(book["num"])}</span>'
            f'<strong>{html.escape(book["title"])}</strong>'
            f'<span>{html.escape(book_blurb(book["id"], counts))}</span></a>'
        )
    body = f"""
<h1>围棋书房</h1>
<p class="colophon">每本书单独成册。从这里进入一本之后，只在这本书里查阅。</p>
<div class="chapters">{''.join(cards)}</div>
"""
    write(ROOT / "index.html", chrome("围棋书房", body, 0, None))


def build_glossary():
    catalog = load_json(ROOT / "data" / "glossary.json")
    terms = []
    for item in catalog["terms"]:
        path = ROOT / "data" / "terms" / f"{item['slug']}.json"
        if path.exists():
            full = load_json(path)
        else:
            full = item
        full["category"] = OVERRIDES.get(full["slug"], full.get("category") or "moves")
        full["name"] = tidy(full.get("name"))
        full["meaning"] = tidy(full.get("meaning"))
        terms.append(full)
    by_cat = {key: [] for key, _, _ in GROUPS}
    for term in terms:
        by_cat.setdefault(term["category"], []).append(term)
    sections = []
    for key, title, blurb in GROUPS:
        rows = []
        for term in sorted(by_cat.get(key, []), key=lambda t: (-t.get("importance", 0), t["name"])):
            stars = "★" * int(term.get("importance") or 0)
            rows.append(
                f'<li data-name="{html.escape(term["name"] + term.get("meaning",""), quote=True)}" data-stars="{term.get("importance") or 0}">'
                f'<a href="{html.escape(term["slug"])}.html">{html.escape(term["name"])}</a>'
                f'<span class="stars">{stars}</span>'
                f'<span class="meaning">{html.escape(term.get("meaning",""))}</span></li>'
            )
        sections.append(f'<section id="{key}"><h2>{title}</h2><p class="colophon">{blurb}</p><ul class="terms">{"".join(rows)}</ul></section>')
    body = f"""
<h1>术语</h1>
<p class="lead">只收中文名和中文释义。重要的条目星更多。点进去可以一手一手翻看原谱。</p>
<div class="tools">
  <input type="search" id="q" placeholder="搜索术语" aria-label="搜索术语">
  <button type="button" id="by-star">按重要性</button>
  <button type="button" id="by-name">按拼音</button>
</div>
{''.join(sections)}
<script>
const q = document.getElementById("q");
function items() {{ return Array.from(document.querySelectorAll(".terms li")); }}
q.addEventListener("input", () => {{
  const n = q.value.trim();
  items().forEach(li => {{ li.hidden = n && !li.dataset.name.includes(n); }});
}});
document.getElementById("by-star").onclick = () => {{
  document.querySelectorAll(".terms").forEach(ul => {{
    const lis = Array.from(ul.children);
    lis.sort((a,b) => Number(b.dataset.stars) - Number(a.dataset.stars) || a.dataset.name.localeCompare(b.dataset.name, "zh"));
    lis.forEach(li => ul.appendChild(li));
  }});
}};
document.getElementById("by-name").onclick = () => {{
  document.querySelectorAll(".terms").forEach(ul => {{
    const lis = Array.from(ul.children);
    lis.sort((a,b) => a.dataset.name.localeCompare(b.dataset.name, "zh"));
    lis.forEach(li => ul.appendChild(li));
  }});
}};
</script>
"""
    write(ROOT / "glossary" / "index.html", chrome("术语 · 围棋书房", body, 1, "glossary"))
    for term in terms:
        bits = []
        stars = "★" * int(term.get("importance") or 0)
        bits.append(f'<p class="crumb"><a href="index.html">术语</a> · {dict((k,t) for k,t,_ in GROUPS).get(term["category"], "")}</p>')
        bits.append(f'<h1>{html.escape(term["name"])}</h1>')
        if stars:
            bits.append(f'<p class="stars">{stars}</p>')
        if term.get("meaning"):
            bits.append(f'<p class="lead">{html.escape(term["meaning"])}</p>')
        for block in term.get("blocks") or []:
            if block["type"] == "html":
                bits.append(f'<div class="prose">{block["html"]}</div>')
            elif block["type"] == "board" and block.get("sgf"):
                bits.append(board_html(with_zh_comments(block["sgf"]), mode="view", at="end", numbers=True, full=True))
        write(ROOT / "glossary" / f'{term["slug"]}.html', chrome(f'{term["name"]} · 术语', "\n".join(bits), 1, "glossary"))
    return len(terms)


def sgf_moves(sgf):
    letters = "ABCDEFGHJKLMNOPQRST"
    moves = []
    for color, pt in re.findall(r";([BW])\[([a-s]{2})\]", sgf or ""):
        x = ord(pt[0]) - 97
        y = ord(pt[1]) - 97
        if not (0 <= x < 19 and 0 <= y < 19):
            continue
        who = "黑" if color == "B" else "白"
        moves.append(f"{who}{letters[x]}{19 - y}")
    return moves


def fuseki_stats(item):
    bits = []
    if item.get("kifus") is not None:
        bits.append(f'共 {item["kifus"]} 谱')
    if item.get("win") is not None:
        bits.append(f'黑胜 {item["win"]}%')
    return " · ".join(bits)


def build_fuseki():
    import shutil

    data = load_json(ROOT / "data" / "fuseki.json")
    pages = {code: page for code, page in data.items()}
    parent = {}
    for code, page in pages.items():
        if code == "root":
            continue
        for item in page.get("items") or []:
            if item.get("code"):
                parent[item["code"]] = code

    def is_branch(item):
        code = item.get("code")
        return bool(item.get("continues") and code and code in pages)

    def leaf_count(code):
        total = 0
        for item in pages.get(code, {}).get("items") or []:
            if is_branch(item):
                total += leaf_count(item["code"])
            else:
                total += 1
        return total

    def crumb(codes, leaf=False):
        parts = ['<a href="{0}index.html">布局</a>'.format("../" if leaf else "")]
        for code in codes:
            name = html.escape((pages.get(code) or {}).get("name") or code)
            href = f"../{code}.html" if leaf else f"{code}.html"
            parts.append(f'<a href="{href}">{name}</a>')
        return '<p class="crumb">' + " · ".join(parts) + "</p>"

    def ancestors(code):
        chain = []
        seen = set()
        while code and code not in seen and code != "root":
            seen.add(code)
            chain.append(code)
            code = parent.get(code)
        chain.reverse()
        return chain

    pdir = ROOT / "fuseki" / "p"
    shutil.rmtree(pdir, ignore_errors=True)
    pdir.mkdir(parents=True, exist_ok=True)
    used_ids = set()

    def leaf_id(page_code, item, index):
        code = item.get("code") or ""
        base = code if code and code != page_code else f"{page_code}-{index + 1}"
        ident = base
        n = 2
        while ident in used_ids:
            ident = f"{base}-{n}"
            n += 1
        used_ids.add(ident)
        return ident

    root_items = pages.get("root", {}).get("items", [])
    cards = []
    for item in root_items:
        code = item.get("code") or ""
        name = item.get("name") or code
        count = leaf_count(code) if is_branch(item) else 1
        stats = fuseki_stats(item)
        cards.append(
            f'<div class="chapter" data-name="{html.escape(name, quote=True)}">'
            f'<span class="num"><a href="{html.escape(code)}.html">{html.escape(name)}</a></span>'
            f'<a href="{html.escape(code)}.html"><strong>{count} 型</strong>'
            f'<span>{html.escape(stats) if stats else "点进去看各型。"}</span></a></div>'
        )
    body = f"""
<h1>布局</h1>
<p class="lead">四十个大类。点进一类，再点到具体的型。每一型单独一页，页里只有这一条手顺。</p>
<div class="chapters">{''.join(cards)}</div>
"""
    write(ROOT / "fuseki" / "index.html", chrome("布局 · 围棋书房", body, 1, "fuseki"))

    patterns = 0
    for code, page in pages.items():
        if code == "root":
            continue
        items = page.get("items") or []
        rows = []
        for index, item in enumerate(items):
            name = item.get("name") or item.get("code") or ""
            child = item.get("code") or ""
            stats = fuseki_stats(item)
            if is_branch(item):
                href = f"{child}.html"
                note = f"继续分类 · {leaf_count(child)} 型"
                if stats:
                    note = stats + " · " + note
            else:
                patterns += 1
                child = leaf_id(code, item, index)
                href = f"p/{child}.html"
                moves = sgf_moves(normalize_sgf(item.get("sgf")) or "")
                note = f"{len(moves)} 手" if moves else "没有手顺"
                if stats:
                    note = f"{note} · {stats}"
                chain = ancestors(code)
                links = []
                for i, step in enumerate(chain):
                    step_name = html.escape((pages.get(step) or {}).get("name") or step)
                    links.append(f'<a href="../{step}.html">{step_name}</a>')
                trail = '<p class="crumb"><a href="../index.html">布局</a> · ' + " · ".join(links) + "</p>"
                lead = html.escape(note)
                seq = f'<p class="seq">{html.escape(" ".join(moves))}</p>' if moves else ""
                board = ""
                sgf = normalize_sgf(item.get("sgf"))
                if sgf:
                    board = board_html(sgf, mode="view", at="end", numbers=True, full=True)
                leaf = f"""
{trail}
<h1>{html.escape(name)}</h1>
<p class="lead">{lead}</p>
{seq}
{board}
"""
                write(
                    pdir / f"{child}.html",
                    chrome(f"{name} · 布局", leaf, 2, "fuseki"),
                )
            rows.append(
                f'<li data-name="{html.escape(name + note, quote=True)}">'
                f'<a href="{html.escape(href)}">{html.escape(name)}</a>'
                f' <span class="seq">{html.escape(note)}</span></li>'
            )
        chain = ancestors(parent.get(code))
        trail = crumb(chain) if chain else '<p class="crumb"><a href="index.html">布局</a></p>'
        title = page.get("name") or code
        body = f"""
{trail}
<h1>{html.escape(title)}</h1>
<p class="lead">{len(items)} 项。点开一型，单独看这一条手顺。标着继续分类的，还能再往下分。</p>
<div class="tools"><input type="search" data-filter placeholder="在本类中搜索" aria-label="搜索"></div>
<ul class="lines">{''.join(rows)}</ul>
"""
        write(
            ROOT / "fuseki" / f"{code}.html",
            chrome(f"{title} · 布局", body, 1, "fuseki", '<script src="../assets/js/list.js"></script>'),
        )
    return len(root_items), patterns


COLS = "ABCDEFGHJKLMNOPQRST"
POINT_NAMES = {
    (4, 4): "星",
    (3, 4): "小目",
    (4, 3): "小目",
    (3, 3): "三三",
    (3, 5): "目外",
    (5, 3): "目外",
    (4, 5): "高目",
    (5, 4): "高目",
    (5, 5): "五五",
    (2, 2): "二二",
    (10, 10): "天元",
}
OPENINGS = [
    ("Q16", "star", "星位"),
    ("R16", "komoku", "小目"),
    ("R17", "sansan", "三三"),
    ("R15", "mokuhazushi", "目外"),
    ("Q15", "takamoku", "高目"),
    ("P15", "five", "五五"),
    ("K10", "tengen", "天元"),
    ("S18", "two", "二二"),
    ("pass", "tenuki", "脱先"),
]
QUALITIES = [("IDEAL", "理想"), ("GOOD", "好棋"), ("TRICK", "骗着"), ("MISTAKE", "恶手")]


def nearest_corner(mv):
    col = COLS.find(mv[0].upper())
    row = int(mv[1:])
    corners = {
        "右上": (19 - col, 20 - row),
        "左上": (col + 1, 20 - row),
        "右下": (19 - col, row),
        "左下": (col + 1, row),
    }
    name, pair = min(corners.items(), key=lambda item: item[1][0] + item[1][1])
    return name, pair


def point_label(mv):
    if mv == "pass":
        return "脱先"
    _, pair = nearest_corner(mv)
    if pair in POINT_NAMES:
        return POINT_NAMES[pair]
    return f"{pair[0]}-{pair[1]}"


# Second-move names are taken from the same corner as Black's first stone.
APPROACHES = {
    (3, 3): ("点三三", "san-san"),
    (3, 6): ("小飞挂", "keima"),
    (6, 3): ("小飞挂", "keima"),
    (3, 7): ("大飞挂", "ogeima"),
    (7, 3): ("大飞挂", "ogeima"),
    (3, 8): ("二间高挂", "niken-high"),
    (8, 3): ("二间高挂", "niken-high"),
    (3, 5): ("挂目外", "mokuhazushi"),
    (5, 3): ("挂目外", "mokuhazushi"),
    (4, 5): ("挂高目", "takamoku"),
    (5, 4): ("挂高目", "takamoku"),
    (3, 4): ("靠小目", "komoku"),
    (4, 3): ("靠小目", "komoku"),
    (4, 6): ("一间跳", "ikken"),
    (6, 4): ("一间跳", "ikken"),
    (5, 6): ("大飞", "large-knight"),
    (6, 5): ("大飞", "large-knight"),
    (4, 7): ("高位一间", "high-ikken"),
    (7, 4): ("高位一间", "high-ikken"),
    (2, 4): ("低位", "low"),
    (4, 2): ("低位", "low"),
    (2, 5): ("二路", "second"),
    (5, 2): ("二路", "second"),
    (5, 5): ("五五", "five"),
    (2, 2): ("二二", "two"),
}


def approach_of(first, second):
    if second == "pass":
        return "pass", "白脱先"
    c1, _ = nearest_corner(first)
    c2, pair = nearest_corner(second)
    if c1 != c2 or pair[0] > 9 or pair[1] > 9:
        return "tenuki", "白转投"
    named = APPROACHES.get(pair)
    if named:
        return named[1], "白" + named[0]
    if pair in POINT_NAMES:
        return POINT_NAMES[pair], "白" + POINT_NAMES[pair]
    return f"{pair[0]}-{pair[1]}", f"白{pair[0]}-{pair[1]}"


def sgf_escape(text):
    return text.replace("\\", "\\\\").replace("]", "\\]")


def plain_desc(text):
    text = re.sub(r"^#+\s*", "", text or "", flags=re.M)
    text = text.replace("**", "")
    return text.strip()


def load_zh_comments():
    path = ROOT / "data" / "joseki-zh.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def gtp_sgf(mv):
    if not mv or mv == "pass":
        return ""
    col = COLS.find(mv[0].upper())
    row = int(mv[1:])
    if col < 0 or row <= 0:
        return ""
    y = 19 - row
    return "abcdefghijklmnopqrstuvwxyz"[col] + "abcdefghijklmnopqrstuvwxyz"[y]


def mark_sgf(step):
    bits = []
    for mark in step.get("marks") or []:
        label = (mark.get("label") or "").strip()
        coord = gtp_sgf(mark.get("position") or "")
        if not label or not coord or any(ch in label for ch in "]:\\"):
            continue
        bits.append(f"[{coord}:{label}]")
    if not bits:
        return ""
    return "LB" + "".join(bits)


def load_joseki_nodes():
    nodes = {}
    base = ROOT / "data" / "joseki"
    if not base.exists():
        return nodes
    for path in base.glob("*/*.json"):
        if path.name.startswith("_"):
            continue
        node = json.loads(path.read_text(encoding="utf-8"))
        nodes[node.get("play") or ""] = node
    return nodes


def collect_lines():
    nodes = load_joseki_nodes()
    zh = load_zh_comments()
    lines = []
    for play, node in nodes.items():
        if node.get("next"):
            continue
        parts = [p for p in (play or "").split(".") if p and p != "root"]
        if not parts:
            continue
        prefixes = []
        cur = ".root"
        ok = True
        for mv in parts:
            cur += "." + mv
            if cur not in nodes:
                ok = False
                break
            prefixes.append(nodes[cur])
        if not ok:
            continue
        chunks = ["(;SZ[19]"]
        for i, step in enumerate(prefixes):
            color = "B" if i % 2 == 0 else "W"
            coord = gtp_sgf(step.get("mv") or parts[i])
            chunks.append(f";{color}[{coord}]{mark_sgf(step)}")
            raw = step.get("desc") or ""
            desc = zh[raw] if raw in zh else plain_desc(raw)
            desc = (desc or "").strip()
            if desc and "Empty Goban" not in desc:
                chunks.append(f"C[{sgf_escape(desc)}]")
        first = parts[0]
        opening = next((item for item in OPENINGS if item[0] == first), None)
        if opening:
            open_id, open_name = opening[1], opening[2]
        else:
            open_id, open_name = "other", "其他起手"
        if len(parts) == 1:
            ap_id, ap_name = "stop", "占角即止"
        else:
            ap_id, ap_name = approach_of(parts[0], parts[1])
        quality = node.get("cat") if node.get("cat") in dict(QUALITIES) else "OTHER"
        qname = dict(QUALITIES).get(quality, "其他")
        seq = []
        for i, mv in enumerate(parts):
            who = "黑" if i % 2 == 0 else "白"
            seq.append(who + ("虚手" if mv == "pass" else mv))
        lines.append(
            {
                "id": node["id"],
                "open_id": open_id,
                "open_name": open_name,
                "ap_id": ap_id,
                "ap_name": ap_name,
                "quality": quality or "OTHER",
                "qname": qname,
                "moves": parts,
                "seq": " ".join(seq),
                "n": len(parts),
                "sgf": "".join(chunks) + ")",
            }
        )
    return lines


def build_joseki():
    import shutil

    lines = collect_lines()
    vdir = ROOT / "joseki" / "v"
    odir = ROOT / "joseki" / "open"
    shutil.rmtree(vdir, ignore_errors=True)
    shutil.rmtree(odir, ignore_errors=True)
    vdir.mkdir(parents=True, exist_ok=True)
    odir.mkdir(parents=True, exist_ok=True)

    openings = {}
    for line in lines:
        openings.setdefault(line["open_id"], {"name": line["open_name"], "approaches": {}})
        ap = openings[line["open_id"]]["approaches"].setdefault(
            line["ap_id"], {"name": line["ap_name"], "lines": []}
        )
        ap["lines"].append(line)

    order = [item[1] for item in OPENINGS] + ["other"]
    names = {item[1]: item[2] for item in OPENINGS}
    names["other"] = "其他起手"

    cards = []
    for oid in order:
        if oid not in openings:
            continue
        count = sum(len(ap["lines"]) for ap in openings[oid]["approaches"].values())
        cards.append(
            f'<a class="chapter" href="open/{oid}.html"><span class="num">{html.escape(names[oid])}</span>'
            f"<strong>{count} 条</strong><span>按白棋应手再分成各条直线变化。</span></a>"
        )
    body = f"""
<h1>定式</h1>
<p class="lead">每一条变化单独一页，页里只有这一条手顺，没有分枝。先按黑棋起手归类，再按白棋应手，最后按这一条的结果分成理想、好棋、骗着、恶手。</p>
<div class="chapters">{''.join(cards)}</div>
"""
    write(ROOT / "joseki" / "index.html", chrome("定式 · 围棋书房", body, 1, "joseki"))

    q_order = [q[0] for q in QUALITIES] + ["OTHER"]
    q_names = dict(QUALITIES)
    q_names["OTHER"] = "其他"
    total = 0
    for oid in order:
        if oid not in openings:
            continue
        approaches = openings[oid]["approaches"]
        blocks = []
        for ap in sorted(approaches.values(), key=lambda a: (-len(a["lines"]), a["name"])):
            sample = ap["lines"][0]
            href = f"{oid}-{sample['ap_id']}.html"
            blocks.append(
                f'<li><a href="{href}">{html.escape(ap["name"])}</a>'
                f'<span class="stars"></span><span class="meaning">{len(ap["lines"])} 条</span></li>'
            )
            groups = {key: [] for key in q_order}
            for line in sorted(ap["lines"], key=lambda item: (item["n"], item["seq"])):
                groups.setdefault(line["quality"], []).append(line)
                total += 1
                page = f"""
<p class="crumb"><a href="../index.html">定式</a> · <a href="../open/{oid}.html">{html.escape(names[oid])}</a> · <a href="../open/{href}">{html.escape(ap["name"])}</a></p>
<h1>{html.escape(names[oid])} · {html.escape(ap["name"])}</h1>
<p class="lead">{line["n"]} 手 · {html.escape(line["qname"])}</p>
<p class="seq">{html.escape(line["seq"])}</p>
{board_html(line["sgf"], mode="view", at="end", numbers=True, full=True)}
"""
                write(
                    vdir / f"{line['id']}.html",
                    chrome(f"{names[oid]} · {ap['name']} · 定式", page, 2, "joseki"),
                )
            sections = []
            for key in q_order:
                bucket = groups.get(key) or []
                if not bucket:
                    continue
                rows = []
                for line in bucket:
                    rows.append(
                        f'<li data-name="{html.escape(line["seq"], quote=True)}">'
                        f'<a href="../v/{line["id"]}.html"><span class="tag">{html.escape(line["qname"])}</span> '
                        f'{line["n"]} 手</a> <span class="seq">{html.escape(line["seq"])}</span></li>'
                    )
                sections.append(f'<h2>{html.escape(q_names.get(key, "其他"))}</h2><ul class="lines">{"".join(rows)}</ul>')
            ap_page = f"""
<p class="crumb"><a href="../index.html">定式</a> · <a href="{oid}.html">{html.escape(names[oid])}</a></p>
<h1>{html.escape(names[oid])} · {html.escape(ap["name"])}</h1>
<p class="lead">{len(ap["lines"])} 条变化，每条单独打开，里面只走这一条。</p>
<div class="tools"><input type="search" data-filter placeholder="按手数或坐标搜索" aria-label="搜索"></div>
{''.join(sections)}
"""
            write(
                odir / f"{oid}-{sample['ap_id']}.html",
                chrome(f"{names[oid]} · {ap['name']} · 定式", ap_page, 2, "joseki", '<script src="../../assets/js/list.js"></script>'),
            )
        open_page = f"""
<p class="crumb"><a href="../index.html">定式</a></p>
<h1>{html.escape(names[oid])}</h1>
<p class="lead">按白棋的应手分开。点进应手后，每一条变化都是单独的一页。</p>
<ul class="terms">{''.join(blocks)}</ul>
"""
        write(odir / f"{oid}.html", chrome(f"{names[oid]} · 定式", open_page, 2, "joseki"))
    print("joseki lines", total)
    return total


def main():
    terms = build_glossary()
    fuseki_n, patterns = build_fuseki()
    lines = build_joseki()
    build_home({"terms": terms, "fuseki": fuseki_n, "patterns": patterns, "lines": lines})
    print("built", terms, "terms", fuseki_n, "fuseki classes", patterns, "patterns", lines, "lines")


if __name__ == "__main__":
    main()
