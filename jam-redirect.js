(() => {
  "use strict";

  const type = document.body.dataset.jamType;
  const hostLabel = document.body.dataset.hostLabel;
  const status = document.getElementById("jam-status");
  const link = document.getElementById("jam-link");
  const retry = document.getElementById("jam-retry");
  const allowedSpotifyHosts = ["spotify.com", "spotify.link"];

  function isSpotifyUrl(value) {
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
      const url = new URL(value);
      const hostname = url.hostname.toLowerCase();
      return url.protocol === "https:" && allowedSpotifyHosts.some(
        (allowedHost) => hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
      );
    } catch {
      return false;
    }
  }

  function showError(message) {
    status.textContent = message;
    link.hidden = true;
    retry.hidden = false;
  }

  async function openJam() {
    status.textContent = "Opening Spotify…";
    link.hidden = true;
    retry.hidden = true;
    const apiBase = window.SPOTIFY_JAM_CONFIG?.apiBase?.replace(/\/$/, "");
    if (!apiBase || !apiBase.startsWith("https://")) {
      showError("Couldn't load the current Jam. Try again in a moment.");
      return;
    }
    try {
      const response = await fetch(`${apiBase}/api/jam/${type}`, { cache: "no-store" });
      if (response.status === 404) {
        status.textContent = `No active ${type === "house" ? "House" : "Car"} Jam right now. Ask the ${hostLabel} to start one.`;
        retry.hidden = false;
        return;
      }
      if (!response.ok) throw new Error("Jam API unavailable");
      const data = await response.json();
      if (data.type !== type || !isSpotifyUrl(data.url)) throw new Error("Invalid Jam response");
      link.href = data.url;
      link.hidden = false;
      window.location.replace(data.url);
    } catch {
      showError("Couldn't load the current Jam. Try again in a moment.");
    }
  }

  retry.addEventListener("click", openJam);
  openJam();
})();
