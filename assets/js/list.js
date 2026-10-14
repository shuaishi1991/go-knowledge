(function () {
  const input = document.querySelector("[data-filter]");
  if (!input) return;
  input.addEventListener("input", function () {
    const q = input.value.trim();
    document.querySelectorAll("[data-name]").forEach(function (el) {
      el.hidden = !!(q && el.getAttribute("data-name").indexOf(q) === -1);
    });
  });
})();
