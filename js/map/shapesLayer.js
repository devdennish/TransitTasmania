// Draws route shape polylines. To avoid rendering all 545 shapes at once (heavy
// and visually noisy), only the selected route's shapes are drawn. With no
// selection the layer is empty, keeping the map readable.

import { getLayer, getMap } from "./mapView.js";
import { state, on } from "../state/store.js";

let shapesById = new Map(); // shapeId -> coordinates ([lon,lat][])

export function initShapesLayer(shapesGeojson) {
  for (const f of shapesGeojson.features) {
    shapesById.set(f.properties.shapeId, f.geometry.coordinates);
  }
  on("selection:changed", render);
  // Shapes load in the background, so a route may already be selected by the
  // time we get here; draw it immediately rather than waiting for re-selection.
  render();
}

function render() {
  const layer = getLayer("shapes");
  layer.clearLayers();

  const routeId = state.selectedRouteId;
  if (!routeId) return;

  const route = state.routesById.get(routeId);
  const color = route?.color ? `#${route.color}` : "#4da3ff";
  const shapeIds = state.shapesByRoute.get(routeId);
  if (!shapeIds) return;

  const bounds = [];
  for (const shapeId of shapeIds) {
    const coords = shapesById.get(shapeId);
    if (!coords) continue;
    // GeoJSON is [lon,lat]; Leaflet wants [lat,lon].
    const latlngs = coords.map(([lon, lat]) => [lat, lon]);
    L.polyline(latlngs, { color, weight: 4, opacity: 0.85 }).addTo(layer);
    bounds.push(...latlngs);
  }

  if (bounds.length) {
    getMap().fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
  }
}
