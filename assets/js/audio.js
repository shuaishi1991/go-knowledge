/* Play the pre-generated Xiaoxiao mp3 that matches a speaker button. */
(function () {
  const MAX_AUDIO_NAME_BYTES = 180;
  const script = document.querySelector('script[src*="audio.js"]');
  const audioBase = script ? new URL("../../audio/", script.src) : new URL("audio/", location.href);
  let current = null;
  let currentButton = null;

  function utf8ByteLength(text) {
    return new TextEncoder().encode(text).length;
  }

  async function audioUrl(text) {
    let name;
    if (!text || text.indexOf("/") >= 0 || text.indexOf("\\") >= 0 || text === "." || text === "..") {
      name = await hashName(text);
    } else if (utf8ByteLength(text + ".mp3") > MAX_AUDIO_NAME_BYTES) {
      name = await hashName(text);
    } else {
      name = encodeURIComponent(text) + ".mp3";
    }
    return new URL(name, audioBase).href;
  }

  async function hashName(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const hex = Array.from(new Uint8Array(buf)).map(function (b) {
      return b.toString(16).padStart(2, "0");
    }).join("").slice(0, 16);
    return "h_" + hex + ".mp3";
  }

  function stop() {
    if (current) {
      try { current.pause(); } catch (e) {}
      current = null;
    }
    if (currentButton) {
      currentButton.classList.remove("playing");
      currentButton = null;
    }
  }

  async function play(text, button) {
    if (button && button.classList.contains("playing")) {
      stop();
      return;
    }
    stop();
    const audio = new Audio(await audioUrl(text));
    current = audio;
    currentButton = button || null;
    if (button) button.classList.add("playing");
    audio.onended = function () {
      if (current === audio) stop();
    };
    audio.onerror = function () {
      if (current === audio) stop();
    };
    const pending = audio.play();
    if (pending && pending.catch) pending.catch(function () { stop(); });
  }

  document.addEventListener("click", function (event) {
    const button = event.target.closest && event.target.closest(".speak");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const text = button.getAttribute("data-speak") || "";
    if (text) play(text, button);
  });

  window.GoAudio = { play: play, stop: stop };
})();
