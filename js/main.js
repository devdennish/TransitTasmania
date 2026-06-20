// Application bootstrap.
// Flow: load static GTFS -> index it -> seed the store -> init map layers and
// sidebar (both subscribe to the store) -> connect the live vehicle feed.

import { loadCoreGtfs, loadShapes } from "./data/gtfsLoader.js";
import { buildIndex } from "./data/gtfsIndex.js";
import { setStaticData } from "./state/store.js";
import { initMap } from "./map/mapView.js";
import { initShapesLayer } from "./map/shapesLayer.js";
import { initStopsLayer } from "./map/stopsLayer.js";
import { initVehicleLayer } from "./map/vehicleLayer.js";
import { initSidebar } from "./ui/sidebar.js";
import { initVehiclePanel } from "./ui/vehiclePanel.js";
import { initStopPanel } from "./ui/stopPanel.js";
import { initTheme } from "./ui/theme.js";
import { startVehicleFeed } from "./realtime/vehicleFeed.js";

async function boot() {
  // 0. Theme toggle (initial theme is set pre-paint by an inline script).
  initTheme();

  // 1. Map first so the user sees something immediately.
  initMap("map");

  // 2. Wire up all UI immediately, BEFORE loading data. The sidebar (and its
  //    hamburger menu), panels and layers only subscribe to the store, so they
  //    work right away and populate once data arrives. This keeps the menu
  //    responsive instead of frozen during the initial data download.
  initStopsLayer();
  initVehicleLayer();
  initSidebar();
  initVehiclePanel(document.getElementById("vehicle-panel"));
  initStopPanel(document.getElementById("stop-panel"));

  // The floating panels are DOM descendants of the Leaflet container, so by
  // default scrolling/clicking inside them bubbles up and zooms/pans the map.
  // Tell Leaflet to swallow those events on each panel.
  for (const id of ["vehicle-panel", "stop-panel"]) {
    const node = document.getElementById(id);
    if (node) {
      L.DomEvent.disableScrollPropagation(node);
      L.DomEvent.disableClickPropagation(node);
    }
  }

  // 3. Load the lightweight core data (routes/stops/trips ~2 MB), index it and
  //    seed the store. This populates the sidebar and lets us resolve live
  //    vehicles to routes.
  const core = await loadCoreGtfs();
  const index = buildIndex(core);
  setStaticData({
    routes: core.routes,
    stops: core.stops,
    trips: core.trips,
    ...index,
  });

  // 4. Start live positions as soon as the route mapping is available, so buses
  //    appear without waiting for the heavy shapes file.
  startVehicleFeed();

  console.info(
    "Tas Transit core ready:",
    core.routes.length,
    "routes,",
    core.stops.length,
    "stops"
  );

  // 5. Load the heavy route geometry (~16 MB) in the background. Polylines are
  //    only drawn for a selected route, so the app is fully usable before this
  //    resolves; initShapesLayer draws the current selection once it's ready.
  loadShapes()
    .then((shapes) => {
      initShapesLayer(shapes);
      console.info("Tas Transit shapes ready:", shapes.features.length, "shapes");
    })
    .catch((err) => console.error("Failed to load route shapes:", err));
}

boot().catch((err) => {
  console.error("Failed to start app:", err);
  const label = document.getElementById("conn-label");
  if (label) label.textContent = "Failed to load data";
});
