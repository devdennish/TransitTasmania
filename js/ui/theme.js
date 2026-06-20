// Light/dark theme toggle. The initial theme is applied by a tiny inline script
// in index.html (before first paint) to avoid a flash; this module just wires
// up the toggle button and persists the user's choice.

const STORAGE_KEY = "tas-transit-theme";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage may be unavailable (private mode); theme still applies for the session */
  }
  // Let non-CSS consumers (e.g. the Leaflet base tiles) react to the change.
  document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

export function initTheme() {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  });
}
