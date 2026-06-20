// Renders stop markers. There are ~3400 stops, so we only draw the ones inside
// the current viewport and only once zoomed in past STOP_RENDER_MIN_ZOOM.
// A selected stop is always drawn and highlighted regardless of zoom.

import { getLayer, getMap } from "./mapView.js";
import { state, on, selectStop } from "../state/store.js";
import { STOP_RENDER_MIN_ZOOM } from "../config.js";
import { debounce } from "../utils/dom.js";

const drawn = new Map(); // stopId -> L.Marker

export function initStopsLayer() {
  const map = getMap();
  const refresh = debounce(render, 120);
  map.on("moveend zoomend", refresh);
  on("selection:changed", render);
  render();
}

function makeStopIcon(highlight) {
  return L.divIcon({
    className: "",
    html: `<div class="stop-dot" style="${
      highlight ? "border-color:#4da3ff;width:13px;height:13px;" : ""
    }"></div>`,
    iconSize: highlight ? [13, 13] : [9, 9],
    iconAnchor: highlight ? [6, 6] : [4, 4],
  });
}

function render() {
  const map = getMap();
  const layer = getLayer("stops");
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const selectedId = state.selectedStopId;

  // Determine which stops should be visible.
  const wanted = new Set();
  if (zoom >= STOP_RENDER_MIN_ZOOM) {
    for (const s of state.stops) {
      if (s.locationType === 1) continue; // skip parent stations
      if (bounds.contains([s.lat, s.lon])) wanted.add(s.id);
    }
  }
  if (selectedId) wanted.add(selectedId);

  // Remove markers no longer wanted.
  for (const [id, marker] of drawn) {
    if (!wanted.has(id)) {
      layer.removeLayer(marker);
      drawn.delete(id);
    }
  }

  // Add / update wanted markers.
  for (const id of wanted) {
    const stop = state.stopsById.get(id);
    if (!stop) continue;
    const highlight = id === selectedId;
    let marker = drawn.get(id);
    if (!marker) {
      marker = L.marker([stop.lat, stop.lon], { icon: makeStopIcon(highlight) });
      marker.bindPopup(
        `<strong>${stop.name}</strong><br><span style="color:#888">Stop ${stop.code || stop.id}</span>`
      );
      marker.on("click", () => selectStop(id));
      marker.addTo(layer);
      drawn.set(id, marker);
    } else {
      marker.setIcon(makeStopIcon(highlight));
    }
  }
}

// Pan/zoom to a stop and open its popup (used by the sidebar stop list).
export function focusStop(stopId) {
  const stop = state.stopsById.get(stopId);
  if (!stop) return;
  const map = getMap();
  map.flyTo([stop.lat, stop.lon], Math.max(map.getZoom(), 15), { duration: 0.6 });
  const marker = drawn.get(stopId);
  if (marker) setTimeout(() => marker.openPopup(), 650);
}
