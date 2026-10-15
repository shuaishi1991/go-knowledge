(function () {
  const rail = document.getElementById("rail");
  const toggle = document.querySelector(".nav-toggle");
  if (!rail || !toggle) return;

  const docked = window.matchMedia("(min-width: 1024px) and (min-height: 640px)");
  const scrim = document.querySelector(".nav-scrim");
  let open = false;

  const path = document.createElement("nav");
  path.className = "nav-path";
  path.setAttribute("aria-label", "路径");
  const list = document.createElement("div");
  list.className = "nav-list";
  rail.append(path, list);
  renderParts(path, pathParts());
  fill();

  function setOpen(next) {
    if (docked.matches) return;
    open = next;
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      revealCurrent();
      const current = rail.querySelector(".nav-list [aria-current='page']");
      const target = current || rail.querySelector("a");
      if (target) target.focus({ preventScroll: true });
    } else {
      toggle.focus({ preventScroll: true });
    }
  }

  toggle.addEventListener("click", function () { setOpen(!open); });
  if (scrim) scrim.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) setOpen(false);
  });
  docked.addEventListener("change", function () {
    if (docked.matches) {
      open = false;
      document.body.classList.remove("nav-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });

  function here(href) {
    const url = new URL(href, location.href);
    return url.pathname === location.pathname && url.hash === location.hash;
  }

  function addLink(parent, href, text) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = String(text || "").replace(/\s+/g, " ").trim();
    if (here(href)) a.setAttribute("aria-current", "page");
    parent.appendChild(a);
    return a;
  }

  function pathParts() {
    const parts = [];
    const brand = document.querySelector(".brand");
    if (brand) parts.push({ href: brand.href, text: brand.textContent });
    const crumb = document.querySelector(".crumb");
    const book = document.querySelector(".book");
    if (!crumb) {
      if (book && book.textContent.trim()) parts.push({ text: book.textContent, current: true });
      return parts;
    }
    crumb.childNodes.forEach(function (node) {
      if (node.nodeType === 1 && node.tagName === "A") {
        parts.push({ href: node.href, text: node.textContent });
      } else if (node.nodeType === 3) {
        const text = node.textContent.replace(/·/g, " ").replace(/\s+/g, " ").trim();
        if (text) parts.push({ text: text });
      }
    });
    return parts;
  }

  function renderParts(parent, parts) {
    parts.forEach(function (part) {
      if (part.href) addLink(parent, part.href, part.text);
      else {
        const span = document.createElement("span");
        span.textContent = part.text;
        if (part.current) span.setAttribute("aria-current", "page");
        parent.appendChild(span);
      }
    });
  }

  function labelFor(node) {
    if (node.classList.contains("chapter")) {
      const num = node.querySelector(".num");
      return (num || node).textContent;
    }
    let text = node.textContent.replace(/\s+/g, " ").trim();
    const li = node.closest("li");
    if (!li) return text;
    const extra = li.querySelector(".seq, .meaning");
    if (extra && !node.contains(extra)) {
      const more = extra.textContent.replace(/\s+/g, " ").trim();
      if (more) text += " · " + more;
    }
    return text;
  }

  function appendNodes(nodes, base) {
    nodes.forEach(function (node) {
      if (node.tagName === "H2") {
        const label = document.createElement("p");
        label.className = "rail-label";
        label.textContent = node.textContent.replace(/\s+/g, " ").trim();
        list.appendChild(label);
        return;
      }
      const ul = list.lastElementChild && list.lastElementChild.tagName === "UL"
        ? list.lastElementChild
        : list.appendChild(document.createElement("ul"));
      const li = document.createElement("li");
      const href = new URL(node.getAttribute("href"), base).href;
      addLink(li, href, labelFor(node));
      ul.appendChild(li);
    });
  }

  function revealCurrent() {
    const current = rail.querySelector('[aria-current="page"]');
    if (!current) return;
    const railOverflow = getComputedStyle(rail).overflowY;
    if (railOverflow !== "auto" && railOverflow !== "scroll") return;
    if (rail.scrollHeight <= rail.clientHeight + 1) return;
    const railTop = rail.getBoundingClientRect().top;
    const itemTop = current.getBoundingClientRect().top;
    rail.scrollTop += itemTop - railTop - rail.clientHeight / 3;
  }

  function categoryName() {
    const crumb = document.querySelector(".crumb");
    if (!crumb) return "";
    const clone = crumb.cloneNode(true);
    clone.querySelectorAll("a").forEach(function (a) { a.remove(); });
    return clone.textContent.replace(/·/g, " ").replace(/\s+/g, " ").trim();
  }

  function outline(doc) {
    const chapters = doc.querySelectorAll("a.chapter, .chapter > .num > a");
    if (chapters.length) return chapters;
    return doc.querySelectorAll("main h2, main .lines > li > a, main .terms > li > a");
  }

  function fill() {
    if (document.querySelector(".chapters")) {
      appendNodes(document.querySelectorAll("a.chapter, .chapter > .num > a"), location.href);
      revealCurrent();
      return;
    }

    if (document.querySelector("main section[id] > h2") && !document.querySelector(".lines")) {
      const links = [];
      document.querySelectorAll("main section[id] > h2").forEach(function (h2) {
        const a = document.createElement("a");
        a.href = "#" + h2.parentElement.id;
        a.textContent = h2.textContent;
        links.push(a);
      });
      appendNodes(links, location.href);
      return;
    }

    const study = document.querySelector(".gm-host") && !document.querySelector(".prose");
    const crumbs = document.querySelectorAll(".crumb a");
    const parent = crumbs[crumbs.length - 1];
    if (study && parent) {
      loadFrom(parent.href, function (doc) { return outline(doc); });
      return;
    }

    const name = categoryName();
    if (name && crumbs[0] && document.querySelector(".prose, .gm-host")) {
      loadFrom(crumbs[0].href, function (doc) {
        const nodes = [];
        doc.querySelectorAll("main section").forEach(function (section) {
          const h2 = section.querySelector("h2");
          if (!h2 || h2.textContent.replace(/\s+/g, " ").trim() !== name) return;
          section.querySelectorAll(".terms > li > a").forEach(function (a) { nodes.push(a); });
        });
        return nodes;
      });
      return;
    }

    if (parent) loadFrom(parent.href, function (doc) { return outline(doc); });
  }

  function loadFrom(url, pick) {
    const note = document.createElement("p");
    note.className = "rail-note";
    note.textContent = "正在读取这一级…";
    list.appendChild(note);
    fetch(url).then(function (res) { return res.text(); }).then(function (text) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      note.remove();
      appendNodes(pick(doc), url);
      revealCurrent();
    }).catch(function () {
      note.textContent = "这一级没有读出来";
    });
  }
})();