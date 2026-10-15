(function () {
  const header = document.querySelector(".top");
  if (!header) return;
  document.documentElement.classList.add("nav-ready");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "nav-toggle";
  toggle.setAttribute("aria-label", "目录");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M4 7h16v2H4zm0 4h16v2H4zm0 4h16v2H4z"/></svg>';
  header.insertBefore(toggle, header.firstChild);

  const topPath = document.createElement("nav");
  topPath.className = "top-path";
  topPath.setAttribute("aria-label", "路径");
  header.appendChild(topPath);

  const scrim = document.createElement("div");
  scrim.className = "nav-scrim";
  const drawer = document.createElement("aside");
  drawer.className = "nav-drawer";
  drawer.setAttribute("aria-label", "目录");
  document.body.append(scrim, drawer);

  let filled = false;
  let open = false;
  const parts = pathParts();
  renderParts(topPath, parts);

  function setOpen(next) {
    open = next;
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && !filled) {
      filled = true;
      fill();
    }
  }

  toggle.addEventListener("click", function () { setOpen(!open); });
  scrim.addEventListener("click", function () { setOpen(false); });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) setOpen(false);
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
    parts.forEach(function (part, index) {
      if (index) parent.appendChild(document.createTextNode(" · "));
      if (part.href) addLink(parent, part.href, part.text);
      else {
        const span = document.createElement("span");
        span.textContent = part.text;
        if (part.current) span.setAttribute("aria-current", "page");
        parent.appendChild(span);
      }
    });
  }

  function appendNodes(list, nodes, base) {
    nodes.forEach(function (node) {
      if (node.tagName === "H2") {
        const h2 = document.createElement("h2");
        h2.textContent = node.textContent.replace(/\s+/g, " ").trim();
        list.appendChild(h2);
        return;
      }
      const ul = list.lastElementChild && list.lastElementChild.tagName === "UL"
        ? list.lastElementChild
        : list.appendChild(document.createElement("ul"));
      const li = document.createElement("li");
      const href = new URL(node.getAttribute("href"), base).href;
      addLink(li, href, node.textContent);
      ul.appendChild(li);
    });
  }

  function categoryName() {
    const crumb = document.querySelector(".crumb");
    if (!crumb) return "";
    const clone = crumb.cloneNode(true);
    clone.querySelectorAll("a").forEach(function (a) { a.remove(); });
    return clone.textContent.replace(/·/g, " ").replace(/\s+/g, " ").trim();
  }

  function fill() {
    const path = document.createElement("nav");
    path.className = "nav-path";
    parts.forEach(function (part) {
      if (part.href) addLink(path, part.href, part.text);
      else {
        const span = document.createElement("span");
        span.textContent = part.text;
        path.appendChild(span);
      }
    });
    drawer.appendChild(path);

    const list = document.createElement("div");
    list.className = "nav-list";
    drawer.appendChild(list);

    if (document.querySelector(".chapters")) {
      const ul = document.createElement("ul");
      document.querySelectorAll("a.chapter, .chapter > .num > a").forEach(function (a) {
        const num = a.querySelector(".num");
        const li = document.createElement("li");
        addLink(li, a.href, num ? num.textContent : a.textContent);
        ul.appendChild(li);
      });
      if (ul.childElementCount) list.appendChild(ul);
      return;
    }

    if (document.querySelector("main section[id] > h2") && !document.querySelector(".lines")) {
      const ul = document.createElement("ul");
      document.querySelectorAll("main section[id] > h2").forEach(function (h2) {
        const li = document.createElement("li");
        addLink(li, "#" + h2.parentElement.id, h2.textContent);
        ul.appendChild(li);
      });
      list.appendChild(ul);
      return;
    }

    const localNodes = document.querySelectorAll("main h2, main .lines > li > a, main .terms > li > a");
    if (localNodes.length && !document.querySelector(".gm-host")) {
      appendNodes(list, localNodes, location.href);
      return;
    }

    const boardPage = document.querySelector(".gm-host") && !document.querySelector(".prose");
    const crumbs = document.querySelectorAll(".crumb a");
    const parent = crumbs[crumbs.length - 1];
    if (boardPage && parent) {
      loadFrom(parent.href, list, function (doc) {
        return doc.querySelectorAll("h2, .lines > li > a, .terms > li > a");
      });
      return;
    }

    const name = categoryName();
    const index = crumbs[0];
    if (name && index) {
      loadFrom(index.href, list, function (doc) {
        const nodes = [];
        doc.querySelectorAll("main section").forEach(function (section) {
          const h2 = section.querySelector("h2");
          if (!h2 || h2.textContent.replace(/\s+/g, " ").trim() !== name) return;
          section.querySelectorAll(".terms > li > a").forEach(function (a) { nodes.push(a); });
        });
        return nodes;
      });
    }
  }

  function loadFrom(url, list, pick) {
    const note = document.createElement("p");
    note.className = "colophon";
    note.textContent = "正在读取这一类…";
    list.appendChild(note);
    fetch(url).then(function (res) { return res.text(); }).then(function (text) {
      const doc = new DOMParser().parseFromString(text, "text/html");
      note.remove();
      appendNodes(list, pick(doc), url);
      const current = list.querySelector('[aria-current="page"]');
      if (current) current.scrollIntoView({ block: "center" });
    }).catch(function () {
      note.textContent = "";
    });
  }
})();
