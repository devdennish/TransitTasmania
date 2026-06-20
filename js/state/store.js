// Single source of truth + tiny pub/sub.
//
// Views subscribe to named events and re-render when the store emits them.
// Data and realtime modules mutate state through the action helpers below and
// emit the relevant event. Nothing imports a view directly, so the map and the
// sidebar stay fully decoupled.

const listeners = new Map(); // event -> Set<fn>

export const state = {
  // Static GTFS (set once at boot).
  agenciesById: new Map(), // agency_id -> { id, name, url, phone }
  routes: [], // Route[]
  routesById: new Map(),
  routesByShortName: new Map(), // shortName -> routeId
  stops: [], // Stop[]
  stopsById: new Map(),
  trips: {}, // tripId -> trip record
  tripsByRoute: new Map(), // routeId -> tripId[]
  shapesByRoute: new Map(), // routeId -> Set<shapeId>

  // Live data.
  vehicles: new Map(), // vehicleId -> { id, lat, lon, bearing, tripId, routeId, ts }

  // UI selection.
  selectedRouteId: null,
  selectedStopId: null,
  selectedVehicleId: null,

  // Connection status: 'connecting' | 'open' | 'closed'.
  connection: "connecting",
};

export function on(event, fn) {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  set.add(fn);
  return () => set.delete(fn); // unsubscribe
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`listener for "${event}" threw:`, err);
    }
  }
}

// --- Actions ------------------------------------------------------------- //

export function setStaticData({ agenciesById, routes, routesById, routesByShortName, stops, stopsById, trips, tripsByRoute, shapesByRoute }) {
  state.agenciesById = agenciesById || new Map();
  state.routes = routes;
  state.routesById = routesById;
  state.routesByShortName = routesByShortName || new Map();
  state.stops = stops;
  state.stopsById = stopsById;
  state.trips = trips;
  state.tripsByRoute = tripsByRoute;
  state.shapesByRoute = shapesByRoute;
  emit("static:loaded", state);
}

// Merge a batch of normalized vehicles into the store. Returns the set of
// affected ids so renderers can do incremental updates.
export function upsertVehicles(vehicles) {
  const changed = new Set();
  for (const v of vehicles) {
    if (!v || v.id == null) continue;
    // Resolve routeId: prefer the exact trip, fall back to the line number
    // (route short name) which the live feed always provides.
    if (v.routeId == null && v.tripId != null) {
      const trip = state.trips[v.tripId];
      if (trip) v.routeId = trip.routeId;
    }
    if (v.routeId == null && v.lineNumber != null) {
      v.routeId = state.routesByShortName.get(v.lineNumber) || null;
    }
    state.vehicles.set(v.id, { ...state.vehicles.get(v.id), ...v });
    changed.add(v.id);
  }
  if (changed.size) emit("vehicles:changed", changed);
  return changed;
}

export function removeVehicles(ids) {
  const removed = new Set();
  for (const id of ids) {
    if (state.vehicles.delete(id)) removed.add(id);
  }
  if (removed.size) emit("vehicles:removed", removed);
  return removed;
}

export function selectRoute(routeId) {
  if (state.selectedRouteId === routeId) return;
  state.selectedRouteId = routeId;
  state.selectedStopId = null;
  emit("selection:changed", { routeId, stopId: null });
}

export function selectStop(stopId) {
  if (state.selectedStopId === stopId) return;
  state.selectedStopId = stopId;
  // A stop and a vehicle panel shouldn't be open at once.
  if (stopId != null && state.selectedVehicleId != null) {
    state.selectedVehicleId = null;
    emit("vehicleSelection:changed", null);
  }
  emit("selection:changed", { routeId: state.selectedRouteId, stopId });
}

export function clearSelection() {
  if (state.selectedRouteId == null && state.selectedStopId == null) return;
  state.selectedRouteId = null;
  state.selectedStopId = null;
  emit("selection:changed", { routeId: null, stopId: null });
}

export function selectVehicle(vehicleId) {
  if (state.selectedVehicleId === vehicleId) return;
  state.selectedVehicleId = vehicleId;
  // Close the stop panel when opening a vehicle panel.
  if (vehicleId != null && state.selectedStopId != null) {
    state.selectedStopId = null;
    emit("selection:changed", { routeId: state.selectedRouteId, stopId: null });
  }
  emit("vehicleSelection:changed", vehicleId);
}

export function clearVehicleSelection() {
  if (state.selectedVehicleId == null) return;
  state.selectedVehicleId = null;
  emit("vehicleSelection:changed", null);
}

export function setConnection(status) {
  if (state.connection === status) return;
  state.connection = status;
  emit("connection:changed", status);
}
