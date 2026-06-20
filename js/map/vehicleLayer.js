// Live vehicle markers. Subscribes to the store's vehicle events but does NOT
// redraw per message. Instead it collects a "dirty" set and flushes once per
// animation frame, moving existing markers rather than recreating them. This
// keeps the map at 60fps even under bursty WebSocket traffic.

import { getLayer } from "./mapView.js";
import { state, on, selectVehicle } from "../state/store.js";
import {
  VEHICLE_STALE_MS,
  VEHICLE_SWEEP_INTERVAL_MS,
  OPERATOR_COLORS,
  OPERATOR_COLOR_DEFAULT,
} from "../config.js";

// Material "directions_bus" glyph, rendered upright (a bus shouldn't rotate to
// face its heading the way the old arrow did).
const BUS_SVG =
  '<svg class="vehicle-marker__bus" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 ' +
  ".55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 " +
  ".5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 " +
  "17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM18 " +
  '11H6V6h12v5z"/></svg>';

const markers = new Map(); // vehicleId -> L.Marker
const dirty = new Set(); // ids needing a render this frame
let frameRequested = false;

export function initVehicleLayer() {
  on("vehicles:changed", (changed) => {
    for (const id of changed) dirty.add(id);
    requestFlush();
  });
  on("vehicles:removed", (removed) => {
    for (const id of removed) removeMarker(id);
  });
  // Re-filter visible markers when the selected route changes.
  on("selection:changed", () => {
    for (const id of markers.keys()) dirty.add(id);
    requestFlush();
  });
  // Re-style markers when the highlighted vehicle changes.
  on("vehicleSelection:changed", () => {
    for (const id of markers.keys()) dirty.add(id);
    requestFlush();
  });

  setInterval(sweepStale, VEHICLE_SWEEP_INTERVAL_MS);
}

function requestFlush() {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(flush);
}

function shouldShow(vehicle) {
  const sel = state.selectedRouteId;
  if (!sel) return true;
  return vehicle.routeId === sel;
}

// Color a bus by its operator (GTFS agency), resolved via the vehicle's route.
function colorForVehicle(vehicle) {
  const route = vehicle.routeId ? state.routesById.get(vehicle.routeId) : null;
  return (route && OPERATOR_COLORS[route.agency]) || OPERATOR_COLOR_DEFAULT;
}

function makeIcon(selected = false, color = OPERATOR_COLOR_DEFAULT) {
  // 34x34 container gives a comfortable touch target; the visible bus badge is
  // centered inside via CSS. The operator color is passed as a CSS variable so
  // the selected-state gold (a more specific rule) can still override it.
  return L.divIcon({
    className: `vehicle-marker${selected ? " vehicle-marker--selected" : ""}`,
    html: `<span class="vehicle-marker__badge" style="--bus-color:${color}">${BUS_SVG}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

// Update an existing marker's selection/color by mutating its live DOM node
// instead of calling setIcon(). Recreating the icon on every feed update would
// destroy the element mid-tap on touch devices, losing clicks.
function applyMarkerStyle(marker, selected, color) {
  const iconEl = marker._icon;
  if (!iconEl) return;
  iconEl.classList.toggle("vehicle-marker--selected", selected);
  if (color) {
    const badge = iconEl.querySelector(".vehicle-marker__badge");
    // Operator may only resolve after the marker is first created, so keep it
    // in sync here too.
    if (badge) badge.style.setProperty("--bus-color", color);
  }
}

function flush() {
  frameRequested = false;
  const layer = getLayer("vehicles");

  for (const id of dirty) {
    const v = state.vehicles.get(id);
    if (!v) {
      removeMarker(id);
      continue;
    }

    if (!shouldShow(v)) {
      removeMarker(id);
      continue;
    }

    let marker = markers.get(id);
    const latlng = [v.lat, v.lon];

    const selected = id === state.selectedVehicleId;
    const color = colorForVehicle(v);
    if (!marker) {
      marker = L.marker(latlng, {
        icon: makeIcon(selected, color),
        keyboard: false,
        pane: "vehiclePane",
      });
      marker.on("click", () => selectVehicle(id));
      marker.addTo(layer);
      markers.set(id, marker);
      applyMarkerStyle(marker, selected, color);
    } else {
      marker.setLatLng(latlng);
      applyMarkerStyle(marker, selected, color);
    }
  }
  dirty.clear();
}

function removeMarker(id) {
  const marker = markers.get(id);
  if (marker) {
    getLayer("vehicles").removeLayer(marker);
    markers.delete(id);
  }
}

// Drop markers for vehicles we haven't heard from recently.
function sweepStale() {
  const now = Date.now();
  const stale = [];
  for (const [id, v] of state.vehicles) {
    if (now - v.ts > VEHICLE_STALE_MS) stale.push(id);
  }
  for (const id of stale) {
    state.vehicles.delete(id);
    removeMarker(id);
  }
}
