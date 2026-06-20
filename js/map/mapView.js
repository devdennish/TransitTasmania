// Owns the Leaflet map instance and the named layer groups other modules draw
// into. Created once at boot and shared via the returned handle.

import {
  MAP_CENTER,
  MAP_ZOOM,
  TILE_URL_DARK,
  TILE_URL_LIGHT,
  TILE_ATTRIBUTION,
} from "../config.js";

let map = null;
let baseTiles = null;
const layers = {};

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function tileUrlForTheme(theme) {
  return theme === "light" ? TILE_URL_LIGHT : TILE_URL_DARK;
}

export function initMap(elementId = "map") {
  map = L.map(elementId, {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    zoomControl: true,
    preferCanvas: true, // canvas renderer scales far better for many vectors
  });

  baseTiles = L.tileLayer(tileUrlForTheme(currentTheme()), {
    attribution: TILE_ATTRIBUTION,
    maxZoom: 19,
    subdomains: "abcd",
  }).addTo(map);

  // Swap base tiles when the user toggles the theme.
  document.addEventListener("themechange", (e) => {
    const theme = e.detail?.theme || currentTheme();
    if (baseTiles) baseTiles.setUrl(tileUrlForTheme(theme));
  });

  // On mobile the menu button lives top-left, so move zoom controls aside.
  if (window.matchMedia("(max-width: 768px)").matches) {
    map.zoomControl.setPosition("topright");
  }

  // Dedicated pane so vehicle markers always sit above stop markers (which
  // otherwise stack by latitude and can intercept taps on a bus).
  map.createPane("vehiclePane");
  map.getPane("vehiclePane").style.zIndex = 650; // above default markerPane (600)

  // Draw order: shapes (bottom) -> stops -> vehicles (top).
  layers.shapes = L.layerGroup().addTo(map);
  layers.stops = L.layerGroup().addTo(map);
  layers.vehicles = L.layerGroup().addTo(map);

  return { map, layers };
}

export function getMap() {
  return map;
}

export function getLayer(name) {
  return layers[name];
}
