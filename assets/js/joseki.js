(function () {
  const COLS = "ABCDEFGHJKLMNOPQRST";
  const CAT = { IDEAL: "理想", GOOD: "好棋", TRICK: "骗着", MISTAKE: "恶手" };
  const rootId = "15081";
  const host = document.getElementById("joseki-board");
  const comment = document.getElementById("joseki-comment");
  const movesEl = document.getElementById("joseki-moves");
  const pathEl = document.getElementById("joseki-path");
  const seeEl = document.getElementById("joseki-see");
  if (!host) return;

  const stack = [];
  let board = null;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function url(id) {
    return "../data/joseki/" + id.slice(0, 2) + "/" + id + ".json";
  }

  function gtp(mv, size) {
    if (!mv || mv === "pass" || mv === "root") return null;
    const x = COLS.indexOf(mv[0].toUpperCase());
    const row = parseInt(mv.slice(1), 10);
    if (x < 0 || !row) return null;
    return { x: x, y: size - row };
  }

  function stonesFrom(play, size) {
    const parts = String(play || "").split(".").filter(Boolean);
    const stones = [];
    let n = 0;
    parts.forEach(function (mv) {
      if (mv === "root" || mv === "pass") {
        if (mv === "pass") n += 1;
        return;
      }
      const pt = gtp(mv, size);
      if (!pt) return;
      n += 1;
      stones.push({ x: pt.x, y: pt.y, c: n % 2 ? "B" : "W", n: n });
    });
    return stones;
  }

  function marksFrom(raw, size) {
    if (!raw || typeof raw !== "object") return [];
    const out = [];
    Object.keys(raw).forEach(function (key) {
      const val = raw[key];
      const kind = /tri/i.test(key) ? "triangle"
        : /squ/i.test(key) ? "square"
        : /cir/i.test(key) ? "circle"
        : /cross|x\b|mark/i.test(key) ? "cross"
        : /letter|label|char/i.test(key) ? "letter"
        : "dot";
      const list = Array.isArray(val) ? val : typeof val === "string" ? [val] : [];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        Object.keys(val).forEach(function (coord) {
          const pt = gtp(coord, size);
          if (!pt) return;
          out.push({ x: pt.x, y: pt.y, kind: "letter", text: String(val[coord]) });
        });
        return;
      }
      list.forEach(function (coord) {
        const pt = gtp(coord, size);
        if (!pt) return;
        out.push({ x: pt.x, y: pt.y, kind: kind, text: "" });
      });
    });
    return out;
  }

  function md(src) {
    const lines = esc(src || "").split(/\n/);
    return lines.map(function (line) {
      let t = line.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      if (/^### /.test(t)) return "<h3>" + t.slice(4) + "</h3>";
      if (/^## /.test(t)) return "<h3>" + t.slice(3) + "</h3>";
      if (/^# /.test(t)) return "<h3>" + t.slice(2) + "</h3>";
      if (!t.trim()) return "";
      return "<p>" + t + "</p>";
    }).join("");
  }

  function render(node) {
    const size = 19;
    const stones = stonesFrom(node.play, size);
    const next = (node.next || []).map(function (item) {
      const pt = gtp(item.mv, size);
      return {
        id: item.id,
        mv: item.mv,
        cat: item.cat,
        lb: item.lb,
        c: (stones.length % 2 === 0) ? "B" : "W",
        x: pt && pt.x,
        y: pt && pt.y,
      };
    });
    const pos = {
      size: size,
      stones: stones,
      marks: marksFrom(node.marks, size),
      next: next.filter(function (n) { return n.x != null; }),
      comment: "",
    };
    if (!board) {
      board = new GoBoard(host, {
        mode: "explore",
        width: 640,
        numbers: false,
        position: pos,
        onNav: onNav,
        onPlay: onPlay,
      });
    } else {
      board.setPosition(pos);
    }
    comment.innerHTML = md(node.desc);
    const labels = stack.map(function (n) {
      if (!n.mv || n.mv === "root") return "空盘";
      return (CAT[n.cat] ? CAT[n.cat] + " " : "") + n.mv;
    });
    pathEl.textContent = labels.join("  ·  ");
    movesEl.innerHTML = next.map(function (item) {
      const name = item.mv === "pass" ? "虚手" : item.mv;
      const tag = CAT[item.cat] || item.cat || "";
      const lb = item.lb && item.lb !== "_" ? " " + item.lb : "";
      return '<li><button type="button" data-id="' + item.id + '"><span class="tag">' + esc(tag) + "</span>" + esc(name + lb) + "</button></li>";
    }).join("") || "<li>这一变到此为止。</li>";
    movesEl.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { openId(b.getAttribute("data-id"), true); });
    });
    const sees = (node.see || []).filter(function (id) { return id && id !== node.id; });
    seeEl.innerHTML = sees.length
      ? "参见 " + sees.map(function (id) {
        return '<button type="button" data-id="' + id + '">' + id + "</button>";
      }).join(" ")
      : "";
    seeEl.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () { openId(b.getAttribute("data-id"), false); });
    });
    history.replaceState(null, "", "#n=" + node.id);
  }

  function openId(id, keep) {
    return fetch(url(id)).then(function (res) {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    }).then(function (node) {
      if (!keep) stack.length = 0;
      stack.push(node);
      render(node);
    }).catch(function () {
      comment.innerHTML = "<p>这一手的记录还没有拿到。若是直接打开了文件，请在项目目录运行 python3 -m http.server 后再访问。</p>";
    });
  }

  function onPlay(hit) { openId(hit.id, true); }

  function onNav(action) {
    if (action === "start") {
      openId(rootId, false);
      return;
    }
    if (action === "prev") {
      if (stack.length > 1) {
        stack.pop();
        render(stack[stack.length - 1]);
      }
      return;
    }
    const cur = stack[stack.length - 1];
    if (!cur || !cur.next || !cur.next.length) return;
    if (action === "next" || action === "fastnext" || action === "end") {
      const steps = action === "next" ? 1 : action === "fastnext" ? 8 : 40;
      let left = steps;
      function step() {
        const node = stack[stack.length - 1];
        if (!node.next || !node.next.length || left <= 0) return;
        left -= 1;
        openId(node.next[0].id, true).then(step);
      }
      step();
    }
  }

  const hash = (location.hash.match(/n=(\d+)/) || [])[1] || rootId;
  openId(hash, false);
})();
