/* GoMagic-style board.
   View mode is the shared record bar: first, jump, previous, next, end. */

(function () {
  const COLS = "ABCDEFGHJKLMNOPQRST";
  const WOOD = document.querySelector('script[src*="board.js"]');
  const WOOD_URL = WOOD ? new URL("../img/goban.jpg", WOOD.src).href : "";
  let woodImage = null;
  let woodReady = false;
  if (WOOD_URL) {
    woodImage = new Image();
    woodImage.onload = function () {
      woodReady = true;
      document.querySelectorAll(".gm-host").forEach(function (host) {
        if (host._board) host._board.draw();
      });
    };
    woodImage.src = WOOD_URL;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function sgfPoint(value) {
    if (!value || value.length < 2) return null;
    return { x: value.charCodeAt(0) - 97, y: value.charCodeAt(1) - 97 };
  }

  function gtpPoint(value, size) {
    if (!value || value === "pass" || value === "root") return null;
    const x = COLS.indexOf(value[0].toUpperCase());
    const row = parseInt(value.slice(1), 10);
    if (x < 0 || !row) return null;
    return { x: x, y: size - row };
  }

  function parseSGF(text) {
    const s = String(text || "").trim();
    let i = 0;
    function node() {
      const props = {};
      while (s[i] && s[i] !== ";" && s[i] !== "(" && s[i] !== ")") {
        let id = "";
        while (s[i] && /[A-Za-z]/.test(s[i])) id += s[i++];
        if (!id || s[i] !== "[") break;
        const vals = [];
        while (s[i] === "[") {
          i++;
          let v = "";
          while (s[i] && s[i] !== "]") {
            if (s[i] === "\\") {
              i++;
              v += s[i] || "";
              i++;
              continue;
            }
            v += s[i++];
          }
          if (s[i] === "]") i++;
          vals.push(v);
        }
        props[id.toUpperCase()] = (props[id.toUpperCase()] || []).concat(vals);
      }
      return { props: props, children: [] };
    }
    function tree() {
      if (s[i] !== "(") return null;
      i++;
      const seq = [];
      while (s[i] === ";") {
        i++;
        seq.push(node());
      }
      for (let k = 0; k < seq.length - 1; k++) seq[k].children.push(seq[k + 1]);
      const last = seq[seq.length - 1];
      while (s[i] === "(") {
        const child = tree();
        if (child && last) last.children.push(child);
      }
      if (s[i] === ")") i++;
      return seq[0] || null;
    }
    return tree();
  }

  function commentInfo(props) {
    const raw = (props.C || []).join("\n");
    const re = /__([A-Za-z]+):\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(raw))) marks.push({ key: m[1].toLowerCase(), at: m.index, end: re.lastIndex });
    if (!marks.length) return { text: raw.trim(), solution: null };
    const bag = {};
    let solution = null;
    for (let n = 0; n < marks.length; n++) {
      const end = n + 1 < marks.length ? marks[n + 1].at : raw.length;
      const val = raw.slice(marks[n].end, end).trim();
      if (marks[n].key === "solution") solution = /^true$/i.test(val);
      else if (val) bag[marks[n].key] = val;
    }
    return { text: bag.zh || bag.en || "", solution: solution };
  }

  function moveOf(node) {
    const p = node.props;
    if (p.B) return { c: "B", pt: sgfPoint(p.B[0] || "") };
    if (p.W) return { c: "W", pt: sgfPoint(p.W[0] || "") };
    return null;
  }

  function marksOf(props) {
    const out = [];
    function add(kind, values, labeled) {
      (values || []).forEach(function (v) {
        const bits = labeled ? v.split(":") : [v];
        const pt = sgfPoint(bits[0]);
        if (!pt) return;
        out.push({ x: pt.x, y: pt.y, kind: kind, text: bits[1] || "" });
      });
    }
    add("letter", props.LB, true);
    add("circle", props.CR, false);
    add("square", props.SQ, false);
    add("triangle", props.TR, false);
    add("cross", props.MA, false);
    add("dot", props.SL, false);
    return out;
  }

  function neighbors(x, y, size) {
    const out = [];
    if (x > 0) out.push([x - 1, y]);
    if (y > 0) out.push([x, y - 1]);
    if (x + 1 < size) out.push([x + 1, y]);
    if (y + 1 < size) out.push([x, y + 1]);
    return out;
  }

  function removeIfDead(stones, x, y, size) {
    const start = stones.get(x + "," + y);
    if (!start) return;
    const color = start.c;
    const seen = {};
    const stack = [[x, y]];
    const group = [];
    while (stack.length) {
      const cur = stack.pop();
      const id = cur[0] + "," + cur[1];
      if (seen[id]) continue;
      seen[id] = true;
      const stone = stones.get(id);
      if (!stone || stone.c !== color) continue;
      group.push(id);
      const adj = neighbors(cur[0], cur[1], size);
      for (let i = 0; i < adj.length; i++) {
        const nx = adj[i][0];
        const ny = adj[i][1];
        const nid = nx + "," + ny;
        if (seen[nid]) continue;
        const other = stones.get(nid);
        if (!other) return;
        if (other.c === color) stack.push([nx, ny]);
      }
    }
    group.forEach(function (id) { stones.delete(id); });
  }

  function captureAround(stones, x, y, size) {
    const played = stones.get(x + "," + y);
    if (!played) return;
    const enemy = played.c === "B" ? "W" : "B";
    neighbors(x, y, size).forEach(function (n) {
      const stone = stones.get(n[0] + "," + n[1]);
      if (stone && stone.c === enemy) removeIfDead(stones, n[0], n[1], size);
    });
    removeIfDead(stones, x, y, size);
  }

  function buildPosition(path) {
    let size = 19;
    const stones = new Map();
    let moveNo = 0;
    let marks = [];
    let comment = "";
    path.forEach(function (node) {
      const p = node.props;
      if (p.SZ) size = parseInt(p.SZ[0], 10) || size;
      ["AB", "AW", "AE"].forEach(function (key) {
        (p[key] || []).forEach(function (v) {
          const pt = sgfPoint(v);
          if (!pt) return;
          const id = pt.x + "," + pt.y;
          if (key === "AE") stones.delete(id);
          else stones.set(id, { x: pt.x, y: pt.y, c: key === "AB" ? "B" : "W", n: null });
        });
      });
      const mv = moveOf(node);
      if (mv && mv.pt) {
        moveNo += 1;
        stones.set(mv.pt.x + "," + mv.pt.y, { x: mv.pt.x, y: mv.pt.y, c: mv.c, n: moveNo });
        captureAround(stones, mv.pt.x, mv.pt.y, size);
      } else if (mv && !mv.pt) {
        moveNo += 1;
      }
      marks = marksOf(p);
      comment = commentInfo(p).text;
    });
    const last = path[path.length - 1];
    const kids = last.children || [];
    let toPlay = "B";
    const kidMove = kids.map(moveOf).find(Boolean);
    if (kidMove) toPlay = kidMove.c;
    else if (moveOf(last)) toPlay = moveOf(last).c === "B" ? "W" : "B";
    return {
      size: size,
      stones: Array.from(stones.values()),
      marks: marks,
      comment: comment,
      toPlay: toPlay,
    };
  }

  function allPoints(root) {
    const pts = [];
    (function walk(node) {
      const p = node.props;
      ["AB", "AW", "AE", "B", "W", "LB", "CR", "SQ", "TR", "MA"].forEach(function (key) {
        (p[key] || []).forEach(function (v) {
          const pt = sgfPoint(String(v).split(":")[0]);
          if (pt) pts.push(pt);
        });
      });
      (node.children || []).forEach(walk);
    })(root);
    return pts;
  }

  function viewportFor(size, pts) {
    if (!pts.length) return { x: 0, y: 0, w: size, h: size };
    let x0 = size, y0 = size, x1 = -1, y1 = -1;
    pts.forEach(function (p) {
      if (p.x < 0 || p.y < 0 || p.x >= size || p.y >= size) return;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    });
    if (x1 < 0) return { x: 0, y: 0, w: size, h: size };
    const indent = 2;
    x0 = Math.max(0, x0 - indent);
    y0 = Math.max(0, y0 - indent);
    x1 = Math.min(size - 1, x1 + indent);
    y1 = Math.min(size - 1, y1 + indent);
    let side = Math.max(9, x1 - x0 + 1, y1 - y0 + 1);
    side = Math.min(size, side);
    let x = x0;
    let y = y0;
    if (x + side > size) x = size - side;
    if (y + side > size) y = size - side;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    x = Math.round(cx - (side - 1) / 2);
    y = Math.round(cy - (side - 1) / 2);
    x = Math.max(0, Math.min(size - side, x));
    y = Math.max(0, Math.min(size - side, y));
    return { x: x, y: y, w: side, h: side };
  }

  function readSettings() {
    try {
      return JSON.parse(localStorage.getItem("go-knowledge-board") || "{}");
    } catch (e) {
      return {};
    }
  }
  function writeSettings(patch) {
    const cur = readSettings();
    Object.keys(patch).forEach(function (k) { cur[k] = patch[k]; });
    try { localStorage.setItem("go-knowledge-board", JSON.stringify(cur)); } catch (e) {}
  }

  function icon(name) {
    const common = 'viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"';
    const paths = {
      start: '<path fill="currentColor" d="M6 5h2v14H6zm3.5 7 8.5 6V6z"/>',
      fastPrev: '<path fill="currentColor" d="M11 6v12l-8.5-6zm9 0v12l-8.5-6z"/>',
      prev: '<path fill="currentColor" d="M16 6v12L7.5 12z"/>',
      next: '<path fill="currentColor" d="M8 6v12l8.5-6z"/>',
      fastNext: '<path fill="currentColor" d="M4 6v12l8.5-6zm9 0v12l8.5-6z"/>',
      end: '<path fill="currentColor" d="M6 6v12l8.5-6zM16 5h2v14h-2z"/>',
      back: '<path fill="currentColor" d="M12 5V2L7 7l5 5V9c3.3 0 6 2.7 6 6 0 .7-.1 1.4-.3 2l1.5 1.5A8 8 0 0 0 12 5z"/>',
      hint: '<path fill="currentColor" d="M9 21h6v-1.5H9zm3-19a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
      pass: '<path fill="currentColor" d="M12 4a8 8 0 1 0 8 8h-2a6 6 0 1 1-1.8-4.2L14 10h6V4l-2.2 2.2A8 8 0 0 0 12 4z"/>',
      more: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
    };
    return '<svg ' + common + '>' + (paths[name] || "") + "</svg>";
  }

  function btn(cls, name, title) {
    return '<button type="button" class="gm-btn ' + cls + '" title="' + title + '" aria-label="' + title + '">' + icon(name) + "</button>";
  }

  function GoBoard(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.mode = opts.mode || "view";
    this.settings = readSettings();
    this.showCoords = this.settings.coordinates != null ? !!this.settings.coordinates : false;
    this.showNumbers = this.settings.numbers != null ? !!this.settings.numbers : !!opts.numbers;
    this.menuOpen = false;
    this.hint = null;
    this.status = "";
    this.flash = "";
    this.busy = false;
    this.position = null;
    this.view = { x: 0, y: 0, w: 19, h: 19 };
    this.fixedView = null;
    host._board = this;
    host.innerHTML = this.shell();
    this.canvas = host.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.commentEl = host.querySelector(".gm-comment");
    this.menuEl = host.querySelector(".gm-menu");
    this.bind();
    bindCommentDrag(this.commentEl);
    if (opts.sgf) {
      this.root = parseSGF(opts.sgf);
      this.path = this.root ? [this.root] : [];
      if (this.root) {
        const size = parseInt((this.root.props.SZ || ["19"])[0], 10) || 19;
        this.fixedView = opts.full ? { x: 0, y: 0, w: 19, h: 19 } : viewportFor(size, allPoints(this.root));
      }
      if (this.mode === "view" && opts.at === "end") this.toEnd();
      else this.refresh();
    } else if (opts.position) {
      this.setPosition(opts.position);
    }
    const board = this;
    requestAnimationFrame(function () { board.draw(); });
  }

  GoBoard.prototype.shell = function () {
    const problem = this.mode === "problem";
    const view = this.mode === "view" || this.mode === "explore";
    const still = this.mode === "still";
    const menu = '<div class="gm-menu" hidden>' +
      '<button type="button" data-act="coords" aria-pressed="false">坐标</button>' +
      '<button type="button" data-act="numbers" aria-pressed="false">手数</button>' +
      (problem ? '<button type="button" data-act="restart">重做本题</button>' : "") +
      "</div>";
    const more = '<div class="gm-more">' + btn("more", "more", "菜单") + menu + "</div>";
    let bar = "";
    if (problem) {
      bar = '<div class="gm-problembar">' +
        btn("back", "back", "后退一手") +
        btn("hint", "hint", "查看答案") +
        btn("pass", "pass", "虚手") +
        more +
        "</div>";
    } else if (view) {
      bar = '<div class="gm-navbar">' +
        btn("start", "start", "第一手") +
        btn("fprev", "fastPrev", "快退") +
        btn("prev", "prev", "上一手") +
        btn("next", "next", "下一手") +
        btn("fnext", "fastNext", "快进") +
        btn("end", "end", "最后一手") +
        more +
        "</div>";
    }
    return '<div class="gm">' +
      '<div class="gm-board">' +
      '<div class="gm-stage"><canvas></canvas><div class="gm-flash"></div></div>' +
      bar +
      "</div>" +
      (still ? '<div class="gm-comment" hidden></div>' : '<div class="gm-comment"></div>') +
      "</div>";
  };

  GoBoard.prototype.bind = function () {
    const self = this;
    this.canvas.addEventListener("pointerdown", function (e) {
      GoBoard.active = self;
      self.onPoint(e);
    });
    this.host.querySelectorAll(".gm-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        GoBoard.active = self;
        self.onControl(b);
      });
    });
    if (this.menuEl) {
      this.menuEl.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () { self.onMenu(b.dataset.act); });
      });
      this.syncMenu();
    }
    document.addEventListener("pointerdown", function (e) {
      if (!self.menuOpen || !self.menuEl) return;
      const wrap = self.menuEl.parentElement;
      if (wrap && wrap.contains(e.target)) return;
      self.closeMenu();
    });
    bindKeys();
  };

  GoBoard.prototype.closeMenu = function () {
    this.menuOpen = false;
    if (this.menuEl) this.menuEl.hidden = true;
  };

  GoBoard.prototype.syncMenu = function () {
    if (!this.menuEl) return;
    const coords = this.menuEl.querySelector('[data-act="coords"]');
    const numbers = this.menuEl.querySelector('[data-act="numbers"]');
    if (coords) coords.setAttribute("aria-pressed", this.showCoords ? "true" : "false");
    if (numbers) numbers.setAttribute("aria-pressed", this.showNumbers ? "true" : "false");
  };

  GoBoard.prototype.onMenu = function (act) {
    if (act === "coords") {
      this.showCoords = !this.showCoords;
      writeSettings({ coordinates: this.showCoords });
    } else if (act === "numbers") {
      this.showNumbers = !this.showNumbers;
      writeSettings({ numbers: this.showNumbers });
    } else if (act === "restart") {
      this.restart();
      this.closeMenu();
    }
    this.syncMenu();
    this.draw();
  };

  GoBoard.prototype.onControl = function (button) {
    if (button.classList.contains("more")) {
      this.menuOpen = !this.menuOpen;
      this.menuEl.hidden = !this.menuOpen;
      return;
    }
    const map = { start: "start", fprev: "fastprev", prev: "prev", next: "next", fnext: "fastnext", end: "end", back: "back", hint: "hint", pass: "pass" };
    let name = "";
    button.classList.forEach(function (c) { if (map[c]) name = map[c]; });
    if (this.mode === "explore" && this.opts.onNav && name !== "hint" && name !== "pass") {
      this.opts.onNav(name);
      return;
    }
    if (name === "start") this.toStart();
    else if (name === "prev" || name === "back") this.back();
    else if (name === "next") this.forward(1);
    else if (name === "fastprev") this.back(8);
    else if (name === "fastnext") this.forward(8);
    else if (name === "end") this.toEnd();
    else if (name === "hint") this.showHint();
    else if (name === "pass") this.play(null);
  };

  function bindCommentDrag(comment) {
    if (!comment) return;
    let lastY = 0;
    let lastT = 0;
    let vy = 0;
    let raf = 0;
    let active = false;
    comment.addEventListener("touchstart", function (event) {
      if (event.touches.length !== 1) return;
      active = true;
      lastY = event.touches[0].clientY;
      lastT = performance.now();
      vy = 0;
      if (raf) cancelAnimationFrame(raf);
    }, { passive: true });
    comment.addEventListener("touchmove", function (event) {
      if (!active || event.touches.length !== 1) return;
      if (comment.scrollHeight <= comment.clientHeight + 1) return;
      const y = event.touches[0].clientY;
      const now = performance.now();
      const dy = lastY - y;
      const dt = Math.max(8, now - lastT);
      lastY = y;
      lastT = now;
      vy = dy / dt * 16;
      comment.scrollTop += dy;
      event.preventDefault();
    }, { passive: false });
    function end() {
      active = false;
      function glide() {
        if (Math.abs(vy) < 0.5) return;
        comment.scrollTop += vy;
        vy *= 0.9;
        raf = requestAnimationFrame(glide);
      }
      glide();
    }
    comment.addEventListener("touchend", end);
    comment.addEventListener("touchcancel", end);
  }

  function pageZoomed() {
    return !!(window.visualViewport && window.visualViewport.scale > 1.01);
  }

  GoBoard.prototype.fit = function () {
    const column = this.canvas && this.canvas.closest(".gm-board");
    const gm = column && column.parentElement;
    if (!column || !gm || document.querySelector(".prose")) return;
    if (pageZoomed()) return;
    const portrait = window.matchMedia("(max-width: 820px) and (orientation: portrait)").matches;
    if (portrait) {
      column.style.width = "";
      this.canvas.style.width = "";
      return;
    }
    const bar = column.querySelector(".gm-navbar, .gm-problembar");
    const gap = parseFloat(getComputedStyle(gm).columnGap) || 0;
    const inner = Math.max(0, gm.clientWidth - gap);
    const maxByRatio = Math.floor(inner * 0.75);
    const barH = bar ? bar.offsetHeight : 0;
    const maxByHeight = Math.floor(gm.clientHeight - barH);
    const size = Math.max(0, Math.min(maxByRatio, maxByHeight > 0 ? maxByHeight : maxByRatio));
    column.style.width = size + "px";
    this.canvas.style.width = "100%";
    this.canvas.style.height = size + "px";
  };

  GoBoard.prototype.fitComment = function () {
    const comment = this.commentEl;
    const column = this.canvas && this.canvas.closest(".gm-board");
    if (!comment || !column || document.querySelector(".prose") || pageZoomed()) return;
    const view = window.visualViewport;
    const viewH = view ? view.height : window.innerHeight;
    const portrait = window.matchMedia("(max-width: 820px) and (orientation: portrait)").matches;
    const columnBox = column.getBoundingClientRect();
    let height = portrait
      ? Math.floor(viewH - columnBox.bottom - 8)
      : Math.floor(columnBox.height);
    height = Math.max(72, height);
    comment.style.height = height + "px";
    comment.style.maxHeight = height + "px";
  };

  GoBoard.prototype.metrics = function () {
    const view = this.view;
    const coord = this.showCoords ? 22 : 0;
    this.fit();
    const css = this.canvas.clientWidth || this.opts.width || 520;
    const dpr = window.devicePixelRatio || 1;
    const cell = (css - coord * 2) / view.w;
    const margin = cell / 2;
    return { css: css, dpr: dpr, cell: cell, margin: margin, coord: coord, view: view };
  };

  GoBoard.prototype.pointAt = function (event) {
    const rect = this.canvas.getBoundingClientRect();
    const m = this.metrics();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const gx = Math.round((x - m.coord - m.margin) / m.cell);
    const gy = Math.round((y - m.coord - m.margin) / m.cell);
    if (gx < 0 || gy < 0 || gx >= m.view.w || gy >= m.view.h) return null;
    return { x: gx + m.view.x, y: gy + m.view.y };
  };

  GoBoard.prototype.onPoint = function (event) {
    if (this.busy) return;
    const pt = this.pointAt(event);
    if (!pt) return;
    if (this.mode === "explore") {
      const hit = (this.position.next || []).find(function (n) {
        return n.x === pt.x && n.y === pt.y;
      });
      if (hit && this.opts.onPlay) this.opts.onPlay(hit);
      return;
    }
    if (this.mode === "problem") this.play(pt);
    else if (this.mode === "view") this.playVariation(pt);
  };

  GoBoard.prototype.current = function () {
    return this.path[this.path.length - 1];
  };

  GoBoard.prototype.accepted = function (node, siblings) {
    const flag = commentInfo(node.props).solution;
    if (flag === true) return true;
    if (flag === false) return false;
    return !siblings.some(function (s) { return commentInfo(s.props).solution === true; });
  };

  GoBoard.prototype.play = function (pt) {
    const node = this.current();
    if (!node) return;
    const kids = node.children || [];
    const match = kids.find(function (child) {
      const mv = moveOf(child);
      if (!mv) return false;
      if (!pt) return !mv.pt;
      return mv.pt && mv.pt.x === pt.x && mv.pt.y === pt.y;
    });
    if (!match) {
      this.fail();
      return;
    }
    const ok = this.accepted(match, kids);
    this.path.push(match);
    this.hint = null;
    this.status = "";
    if (!ok) this.pulse("wrong");
    else this.pulse("right");
    this.refresh();
    this.maybeAuto();
  };

  GoBoard.prototype.playVariation = function (pt) {
    const node = this.current();
    if (!node) return;
    const match = (node.children || []).find(function (child) {
      const mv = moveOf(child);
      return mv && mv.pt && mv.pt.x === pt.x && mv.pt.y === pt.y;
    });
    if (!match) return;
    this.path.push(match);
    this.refresh();
  };

  GoBoard.prototype.maybeAuto = function () {
    const self = this;
    const node = this.current();
    const kids = (node && node.children) || [];
    const just = node && moveOf(node);
    if (!just || !kids.length) return;
    const replies = kids.map(moveOf).filter(Boolean);
    if (!replies.length || replies.some(function (mv) { return mv.c === just.c; })) return;
    this.busy = true;
    setTimeout(function () {
      self.busy = false;
      if (self.current() !== node) return;
      self.path.push(kids[0]);
      self.refresh();
      self.maybeAuto();
    }, 500);
  };

  GoBoard.prototype.fail = function () {
    this.status = "好像不太对，再试一次。";
    this.pulse("wrong");
    this.renderComment();
  };

  GoBoard.prototype.pulse = function (kind) {
    const el = this.host.querySelector(".gm-flash");
    el.className = "gm-flash " + kind;
    clearTimeout(this._flashTimer);
    const self = this;
    this._flashTimer = setTimeout(function () { el.className = "gm-flash"; }, 420);
  };

  GoBoard.prototype.showHint = function () {
    const node = this.current();
    if (!node) return;
    const kids = node.children || [];
    const good = kids.find(function (child) { return commentInfo(child.props).solution === true; }) || kids[0];
    const mv = good && moveOf(good);
    if (!mv) return;
    if (!mv.pt) {
      this.status = "这一手是虚手。";
      this.renderComment();
      return;
    }
    if (this.hint && this.hint.x === mv.pt.x && this.hint.y === mv.pt.y) {
      this.play(mv.pt);
      return;
    }
    this.hint = mv.pt;
    this.status = "查看答案";
    this.draw();
    this.renderComment();
  };

  GoBoard.prototype.back = function (steps) {
    const n = steps || 1;
    const floor = 1;
    for (let i = 0; i < n && this.path.length > floor; i++) this.path.pop();
    this.hint = null;
    this.status = "";
    this.busy = false;
    this.refresh();
  };

  GoBoard.prototype.forward = function (steps) {
    for (let i = 0; i < (steps || 1); i++) {
      const node = this.current();
      if (!node || !node.children || !node.children.length) break;
      this.path.push(node.children[0]);
    }
    this.refresh();
  };

  GoBoard.prototype.toStart = function () {
    if (this.path.length) this.path = [this.path[0]];
    this.hint = null;
    this.status = "";
    this.refresh();
  };

  GoBoard.prototype.toEnd = function () {
    let guard = 0;
    while (this.current() && this.current().children && this.current().children.length && guard < 400) {
      this.path.push(this.current().children[0]);
      guard++;
    }
    this.refresh();
  };

  GoBoard.prototype.restart = function () {
    this.toStart();
  };

  GoBoard.prototype.refresh = function () {
    if (!this.path.length) return;
    this.position = buildPosition(this.path);
    if (this.opts.full) this.position.size = 19;
    this.view = this.fixedView || viewportFor(this.position.size, this.position.stones.concat(this.position.marks));
    if (this.mode === "view") {
      const kids = this.current().children || [];
      if (kids.length > 1) {
        this.position.next = kids.map(function (child) {
          const mv = moveOf(child);
          if (!mv || !mv.pt) return null;
          return { x: mv.pt.x, y: mv.pt.y, c: mv.c };
        }).filter(Boolean);
      }
    }
    const node = this.current();
    const kids = node.children || [];
    if (!this.position.comment && this.path.length > 1) {
      const ok = this.accepted(node, this.path[this.path.length - 2].children);
      const more = kids.some(function (child) {
        const mv = moveOf(child);
        return mv && mv.c === this.position.toPlay;
      }, this);
      if (ok && more) this.status = this.status || "答对了！继续找出其余答案。";
      else if (ok && !kids.length) this.status = this.status || "答对了。";
    }
    this.renderComment();
    this.draw();
  };

  GoBoard.prototype.setPosition = function (pos) {
    this.position = pos;
    const pts = (pos.stones || []).concat(pos.next || []).concat(pos.marks || []);
    this.view = pts.length ? viewportFor(pos.size || 19, pts) : { x: 0, y: 0, w: pos.size || 19, h: pos.size || 19 };
    if ((pos.size || 19) > 13 && this.spread(pts) > 12) this.view = { x: 0, y: 0, w: pos.size || 19, h: pos.size || 19 };
    this.renderComment();
    this.draw();
  };

  GoBoard.prototype.spread = function (pts) {
    if (!pts.length) return 0;
    let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
    pts.forEach(function (p) {
      if (p.x == null) return;
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    });
    return Math.max(x1 - x0, y1 - y0);
  };

  GoBoard.prototype.renderComment = function () {
    if (!this.commentEl) return;
    const raw = (this.position && this.position.comment) || "";
    const status = this.status || "";
    const shown = status || raw;
    this.commentEl.innerHTML = esc(shown).replace(/\n/g, "<br>");
    this.commentEl.hidden = !shown;
  };

  GoBoard.prototype.draw = function () {
    const pos = this.position;
    if (!pos || !this.canvas) return;
    const m = this.metrics();
    const px = Math.round(m.css * m.dpr);
    this.canvas.width = px;
    this.canvas.height = px;
    this.canvas.style.height = m.css + "px";
    const ctx = this.ctx;
    ctx.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
    ctx.fillStyle = "#efb000";
    ctx.fillRect(0, 0, m.css, m.css);
    if (woodReady) ctx.drawImage(woodImage, 0, 0, m.css, m.css);
    const v = m.view;
    function xy(ix, iy) {
      return [m.coord + m.margin + (ix - v.x) * m.cell, m.coord + m.margin + (iy - v.y) * m.cell];
    }
    ctx.strokeStyle = "#17191c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < v.w; i++) {
      const a = xy(v.x + i, v.y);
      const b = xy(v.x + i, v.y + v.h - 1);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      const c = xy(v.x, v.y + i);
      const d = xy(v.x + v.w - 1, v.y + i);
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();
    const size = pos.size || 19;
    const hoshi = starPoints(size);
    ctx.fillStyle = "#17191c";
    hoshi.forEach(function (p) {
      if (p.x < v.x || p.y < v.y || p.x >= v.x + v.w || p.y >= v.y + v.h) return;
      const at = xy(p.x, p.y);
      ctx.beginPath();
      ctx.arc(at[0], at[1], Math.max(2, m.cell * 0.12), 0, Math.PI * 2);
      ctx.fill();
    });
    if (this.showCoords) {
      ctx.fillStyle = "#333";
      ctx.font = "12px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let i = 0; i < v.w; i++) {
        const at = xy(v.x + i, v.y);
        const label = COLS[v.x + i] || "";
        ctx.fillText(label, at[0], 11);
        const left = xy(v.x, v.y + i);
        ctx.fillText(String(size - (v.y + i)), 11, left[1]);
      }
    }
    const r = m.cell * 0.47;
    (pos.next || []).forEach(function (n) {
      if (n.x == null) return;
      const at = xy(n.x, n.y);
      ctx.save();
      ctx.globalAlpha = 0.38;
      drawStone(ctx, at[0], at[1], r, n.c || pos.toPlay || "B");
      ctx.restore();
      if (n.cat) {
        ctx.strokeStyle = catColor(n.cat);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(at[0], at[1], r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    let last = null;
    (pos.stones || []).forEach(function (s) {
      const at = xy(s.x, s.y);
      drawStone(ctx, at[0], at[1], r, s.c);
      if (s.n) last = s;
      if (this.showNumbers && s.n) {
        ctx.fillStyle = s.c === "B" ? "#fff" : "#222";
        ctx.font = "600 " + Math.max(10, r * 0.85) + "px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(s.n), at[0], at[1] + 0.5);
      }
    }, this);
    if (last && !this.showNumbers) {
      const at = xy(last.x, last.y);
      ctx.fillStyle = last.c === "B" ? "#fff" : "#202020";
      ctx.beginPath();
      ctx.arc(at[0], at[1], Math.max(2.5, r * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    (pos.marks || []).forEach(function (mk) { drawMark(ctx, xy(mk.x, mk.y), mk, r, false); });
    if (this.hint) drawMark(ctx, xy(this.hint.x, this.hint.y), { kind: "triangle" }, r, true);
    this.fitComment();
  };

  function catColor(cat) {
    if (cat === "IDEAL") return "#089c39";
    if (cat === "GOOD") return "#007cff";
    if (cat === "TRICK") return "#d4890b";
    if (cat === "MISTAKE") return "#e3051e";
    return "#333";
  }

  function starPoints(size) {
    if (size === 19) {
      const a = [3, 9, 15];
      const pts = [];
      a.forEach(function (x) { a.forEach(function (y) { pts.push({ x: x, y: y }); }); });
      return pts;
    }
    if (size === 13) return [{ x: 3, y: 3 }, { x: 9, y: 3 }, { x: 3, y: 9 }, { x: 9, y: 9 }, { x: 6, y: 6 }];
    if (size === 9) return [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 2, y: 6 }, { x: 6, y: 6 }, { x: 4, y: 4 }];
    return [];
  }

  function drawStone(ctx, x, y, r, color) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.28)";
    ctx.shadowBlur = r * 0.35;
    ctx.shadowOffsetY = r * 0.12;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    if (color === "W") {
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "#d5d5d5");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#999";
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      g.addColorStop(0, "#555");
      g.addColorStop(1, "#000");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.strokeStyle = "#6c737b";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMark(ctx, at, mk, r, hint) {
    const x = at[0], y = at[1];
    ctx.save();
    ctx.strokeStyle = hint ? "#bf452a" : "#1d4e89";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 1.6;
    if (mk.kind === "triangle") {
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.55);
      ctx.lineTo(x + r * 0.55, y + r * 0.42);
      ctx.lineTo(x - r * 0.55, y + r * 0.42);
      ctx.closePath();
      ctx.stroke();
    } else if (mk.kind === "square") {
      ctx.strokeRect(x - r * 0.42, y - r * 0.42, r * 0.84, r * 0.84);
    } else if (mk.kind === "circle") {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mk.kind === "cross") {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.4, y - r * 0.4);
      ctx.lineTo(x + r * 0.4, y + r * 0.4);
      ctx.moveTo(x + r * 0.4, y - r * 0.4);
      ctx.lineTo(x - r * 0.4, y + r * 0.4);
      ctx.stroke();
    } else if (mk.kind === "letter" || mk.text) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
      ctx.fillStyle = "#f7f1e4";
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "#1d4e89";
      ctx.stroke();
      ctx.fillStyle = "#1d4e89";
      ctx.font = "700 " + Math.max(12, r * 0.9) + "px Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(mk.text || "A", x, y + 1);
    } else if (mk.kind === "dot") {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  let keysBound = false;
  function bindKeys() {
    if (keysBound) return;
    keysBound = true;
    document.addEventListener("keydown", function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const board = GoBoard.active;
      if (!board || board.mode === "still") return;
      const k = e.key;
      if (board.mode === "problem") {
        if (k === "ArrowLeft") { board.back(); e.preventDefault(); }
        else if (k === "h" || k === "H") { board.showHint(); e.preventDefault(); }
        else if (k === "p" || k === "P") { board.play(null); e.preventDefault(); }
        else if (k === "r" || k === "R") { board.restart(); e.preventDefault(); }
      } else if (board.mode === "explore") {
        const nav = { ArrowLeft: "prev", ArrowRight: "next", Home: "start", End: "end" };
        if (nav[k] && board.opts.onNav) { board.opts.onNav(nav[k]); e.preventDefault(); }
      } else {
        if (k === "ArrowLeft") { board.back(); e.preventDefault(); }
        else if (k === "ArrowRight") { board.forward(1); e.preventDefault(); }
        else if (k === "Home") { board.toStart(); e.preventDefault(); }
        else if (k === "End") { board.toEnd(); e.preventDefault(); }
      }
    });
  }

  function mount(host) {
    if (host._board) return;
    const sgfEl = host.querySelector("script");
    const sgf = sgfEl ? sgfEl.textContent.trim() : host.getAttribute("data-sgf");
    const mode = host.getAttribute("data-mode") || "view";
    const numbersAttr = host.getAttribute("data-numbers");
    new GoBoard(host, {
      mode: mode,
      sgf: sgf,
      at: host.getAttribute("data-at") || "",
      numbers: numbersAttr == null ? null : numbersAttr === "1",
      width: parseInt(host.getAttribute("data-width") || "520", 10),
      full: host.getAttribute("data-full") === "1",
    });
    host.setAttribute("data-ready", "1");
  }

  function mountAll() {
    const hosts = document.querySelectorAll(".gm-host:not([data-ready])");
    if (!("IntersectionObserver" in window)) {
      hosts.forEach(mount);
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        mount(entry.target);
        io.unobserve(entry.target);
      });
    }, { rootMargin: "240px" });
    hosts.forEach(function (host) { io.observe(host); });
  }

  function studyPage() {
    return document.querySelector(".gm-host") && !document.querySelector(".prose");
  }

  function redrawBoards() {
    document.querySelectorAll(".gm-host").forEach(function (host) {
      if (host._board) host._board.draw();
    });
  }

  function placeStudy() {
    if (!studyPage() || pageZoomed()) return;
    const view = window.visualViewport;
    if (!view) return;
    document.body.style.top = Math.max(0, view.offsetTop) + "px";
    document.body.style.left = Math.max(0, view.offsetLeft) + "px";
    document.body.style.width = view.width + "px";
    document.body.style.height = view.height + "px";
  }

  function settleStudy() {
    if (!studyPage() || pageZoomed()) return;
    const y = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const off = window.visualViewport ? window.visualViewport.offsetTop : 0;
    if (y > 0 || off > 1) {
      if (off > 1) window.scrollTo(0, off);
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
    placeStudy();
  }

  window.GoBoard = GoBoard;
  window.gtpPoint = gtpPoint;
  window.addEventListener("resize", function () {
    if (pageZoomed()) return;
    settleStudy();
    redrawBoards();
  });
  placeStudy();
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", function () {
      if (pageZoomed()) return;
      settleStudy();
      redrawBoards();
    });
    visualViewport.addEventListener("scroll", settleStudy);
  }
  document.addEventListener("touchend", function () {
    setTimeout(function () {
      if (pageZoomed()) return;
      settleStudy();
    }, 350);
  }, { passive: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
  else mountAll();
})();
