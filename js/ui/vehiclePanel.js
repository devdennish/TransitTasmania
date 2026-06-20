// Floating details panel shown when a live vehicle is clicked. Displays the
// route, operator (agency), destination, vehicle/trip info, and the upcoming
// stops with their scheduled times and ETA.
//
// ETAs are SCHEDULE-based (derived from GTFS stop_times vs the current
// Tasmania local time), since the live feed only provides positions, not
// stop-level predictions.

import { el, clear, contrastText } from "../utils/dom.js";
import { state, on, clearVehicleSelection } from "../state/store.js";
import { getTripStops } from "../data/tripStops.js";
import { UPCOMING_STOP_COUNT, OPERATOR_COLORS, OPERATOR_COLOR_DEFAULT } from "../config.js";
import { computeProgress } from "../data/tripProgress.js";

let panelEl = null;
let refreshTimer = null;
let currentTripStops = null; // cached [stopId, arrSec][] for the selected trip
let currentTripId = null;

export function initVehiclePanel(rootEl) {
  panelEl = rootEl;
  on("vehicleSelection:changed", onSelectionChanged);
  // Keep the panel fresh as the bus moves and as time passes (ETA countdown).
  on("vehicles:changed", (changed) => {
    if (state.selectedVehicleId && changed.has(state.selectedVehicleId)) render();
  });
  on("vehicles:removed", (removed) => {
    if (state.selectedVehicleId && removed.has(state.selectedVehicleId)) {
      clearVehicleSelection();
    }
  });
}

async function onSelectionChanged(vehicleId) {
  clearInterval(refreshTimer);
  refreshTimer = null;

  if (!vehicleId) {
    hide();
    return;
  }

  const vehicle = state.vehicles.get(vehicleId);
  currentTripId = vehicle?.tripId || null;
  currentTripStops = null;

  // Show immediately with what we know, then enrich with the schedule.
  render();

  if (currentTripId) {
    try {
      currentTripStops = await getTripStops(currentTripId);
    } catch (err) {
      console.error("Failed to load trip stops:", err);
      currentTripStops = null;
    }
    // Bail if the selection changed while we were fetching.
    if (state.selectedVehicleId !== vehicleId) return;
    render();
  }

  refreshTimer = setInterval(render, 15000); // tick the ETA countdown
}

// --- Time helpers -------------------------------------------------------- //

// Seconds since midnight in Tasmania local time, matching GTFS schedule clock.
function nowSecondsTas() {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Hobart",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
}

function fmtClock(sec) {
  const h = Math.floor(sec / 3600) % 24;
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtEta(deltaSec) {
  if (deltaSec <= 30) return "due";
  const mins = Math.round(deltaSec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

// --- Render -------------------------------------------------------------- //

function render() {
  const vehicleId = state.selectedVehicleId;
  if (!vehicleId || !panelEl) return hide();

  const vehicle = state.vehicles.get(vehicleId);
  if (!vehicle) return hide();

  const route = vehicle.routeId ? state.routesById.get(vehicle.routeId) : null;
  const trip = vehicle.tripId ? state.trips[vehicle.tripId] : null;
  const agency = route?.agencyId ? state.agenciesById.get(route.agencyId) : null;
  const destination = trip?.headsign || "";
  const badgeBg = route?.color ? `#${route.color}` : "#4da3ff";

  clear(panelEl);

  // Header: route badge + destination + close.
  const header = el("div", { class: "vpanel__header" }, [
    el("span", {
      class: "route-badge",
      text: route?.shortName || vehicle.lineNumber || "?",
      style: `background:${badgeBg};color:${contrastText(route?.color)}`,
    }),
    el("div", { class: "vpanel__title" }, [
      el("div", { class: "vpanel__route", text: route?.longName || "Route" }),
      el("div", {
        class: "vpanel__dest",
        text: destination ? `To ${destination}` : "",
      }),
    ]),
    el("button", {
      class: "vpanel__close",
      text: "\u00d7",
      title: "Close",
      onClick: clearVehicleSelection,
    }),
  ]);
  panelEl.append(header);

  // Meta rows.
  const meta = el("div", { class: "vpanel__meta" }, [
    operatorRow(route, agency),
    agency?.phone ? phoneRow(agency.phone) : null,
    metaRow("Vehicle", vehicle.id),
    metaRow(
      "Heading",
      vehicle.bearing != null ? `${Math.round(vehicle.bearing)}\u00b0` : "-"
    ),
    metaRow("Updated", new Date(vehicle.ts).toLocaleTimeString()),
  ]);
  panelEl.append(meta);

  // Work out where the bus actually is along its trip (position-based), so
  // running late/early doesn't break the "upcoming" calculation.
  const progress = computeProgress(vehicle, currentTripStops);

  // Delay status banner.
  if (progress && progress.delaySec != null) {
    panelEl.append(renderStatus(progress.delaySec));
  }

  // Upcoming stops.
  panelEl.append(el("div", { class: "vpanel__section-title", text: "Upcoming stops" }));
  panelEl.append(renderUpcoming(progress));

  panelEl.append(
    el("div", {
      class: "vpanel__note",
      text: progress
        ? "ETA estimated from the bus position and timetable."
        : "ETA is based on the timetable.",
    })
  );

  panelEl.hidden = false;
}

function renderStatus(delaySec) {
  const mins = Math.round(Math.abs(delaySec) / 60);
  let text, cls;
  if (delaySec > 60) {
    text = `Running ~${mins} min late`;
    cls = "vpanel__status--late";
  } else if (delaySec < -60) {
    text = `Running ~${mins} min early`;
    cls = "vpanel__status--early";
  } else {
    text = "On time";
    cls = "vpanel__status--ontime";
  }
  return el("div", { class: `vpanel__status ${cls}`, text });
}

function metaRow(label, value) {
  return el("div", { class: "vpanel__row" }, [
    el("span", { class: "vpanel__label", text: label }),
    el("span", { class: "vpanel__value", text: String(value) }),
  ]);
}

// "Operated by" with an operator-color dot and a link to the agency website.
function operatorRow(route, agency) {
  const name = agency?.name || route?.agency || "Unknown operator";
  const color = (route && OPERATOR_COLORS[route.agency]) || OPERATOR_COLOR_DEFAULT;
  const dot = el("span", { class: "vpanel__op-dot", style: `background:${color}` });
  const nameNode = agency?.url
    ? el("a", {
        class: "vpanel__op-link",
        href: agency.url,
        target: "_blank",
        rel: "noopener noreferrer",
        text: name,
      })
    : el("span", { text: name });
  return el("div", { class: "vpanel__row" }, [
    el("span", { class: "vpanel__label", text: "Operated by" }),
    el("span", { class: "vpanel__value vpanel__op" }, [dot, nameNode]),
  ]);
}

function phoneRow(phone) {
  return el("div", { class: "vpanel__row" }, [
    el("span", { class: "vpanel__label", text: "Phone" }),
    el("a", {
      class: "vpanel__value vpanel__op-link",
      href: `tel:${phone.replace(/\s+/g, "")}`,
      text: phone,
    }),
  ]);
}

function renderUpcoming(progress) {
  if (currentTripStops === null) {
    const msg = currentTripId
      ? "Loading schedule..."
      : "No trip information for this vehicle.";
    return el("div", { class: "vpanel__empty", text: msg });
  }
  if (!currentTripStops.length) {
    return el("div", { class: "vpanel__empty", text: "No scheduled stops." });
  }

  // Preferred path: position-anchored upcoming stops + live ETAs, each tagged
  // with its predicted punctuality (on time / late / early) vs the timetable.
  if (progress) {
    const { pts, nextIdx, etaToNextSec } = progress;
    const upcoming = pts.slice(nextIdx, nextIdx + UPCOMING_STOP_COUNT);
    if (!upcoming.length) {
      return el("div", { class: "vpanel__empty", text: "Approaching final stop." });
    }
    const now = nowSecondsTas();
    const baseArr = pts[nextIdx].arr;
    const list = el("ul", { class: "vpanel__stops" });
    for (const p of upcoming) {
      const stop = state.stopsById.get(p.stopId);
      const etaSec = etaToNextSec + (p.arr - baseArr);
      const estSec = now + etaSec; // predicted arrival, clock seconds
      list.append(liveStopRow(stop?.name || p.stopId, p.arr, estSec, etaSec));
    }
    return list;
  }

  // Fallback: schedule-only (used when stops lack coordinates / no live fix).
  const now = nowSecondsTas();
  const upcoming = currentTripStops
    .filter(([, arr]) => arr >= now - 60)
    .slice(0, UPCOMING_STOP_COUNT);
  if (!upcoming.length) {
    return el("div", { class: "vpanel__empty", text: "No upcoming stops scheduled." });
  }
  const list = el("ul", { class: "vpanel__stops" });
  for (const [stopId, arr] of upcoming) {
    const stop = state.stopsById.get(stopId);
    list.append(schedStopRow(stop?.name || stopId, arr, fmtEta(arr - now)));
  }
  return list;
}

// Punctuality of a predicted arrival vs the scheduled time.
function delayInfo(estSec, schedSec) {
  const delta = estSec - schedSec;
  const mins = Math.round(Math.abs(delta) / 60);
  if (delta > 60) return { text: `${mins} min late`, cls: "vpanel__stop-status--late" };
  if (delta < -60) return { text: `${mins} min early`, cls: "vpanel__stop-status--early" };
  return { text: "On time", cls: "vpanel__stop-status--ontime" };
}

// Live row: name + "in X" countdown, predicted arrival time (scheduled struck
// when it differs), and an on time / late / early status chip.
function liveStopRow(name, schedSec, estSec, etaSec) {
  const status = delayInfo(estSec, schedSec);
  const drifted = Math.abs(estSec - schedSec) > 60;

  const clockChildren = [];
  if (drifted) {
    clockChildren.push(el("span", { class: "vpanel__stop-sched-strike", text: fmtClock(schedSec) }));
  }
  clockChildren.push(el("span", { text: fmtClock(estSec) }));

  return el("li", { class: "vpanel__stop" }, [
    el("span", { class: "vpanel__stop-dot" }),
    el("span", { class: "vpanel__stop-text" }, [
      el("span", { class: "vpanel__stop-name", text: name }),
      el("span", { class: "vpanel__stop-sub", text: `in ${fmtEta(etaSec)}` }),
    ]),
    el("span", { class: "vpanel__stop-right" }, [
      el("span", { class: "vpanel__stop-clock" }, clockChildren),
      el("span", { class: `vpanel__stop-status ${status.cls}`, text: status.text }),
    ]),
  ]);
}

// Schedule-only row (no live position): scheduled time + countdown.
function schedStopRow(name, schedSec, etaText) {
  return el("li", { class: "vpanel__stop" }, [
    el("span", { class: "vpanel__stop-dot" }),
    el("span", { class: "vpanel__stop-name", text: name }),
    el("span", { class: "vpanel__stop-times" }, [
      el("span", { class: "vpanel__stop-sched", text: fmtClock(schedSec) }),
      el("span", { class: "vpanel__stop-eta", text: etaText }),
    ]),
  ]);
}

function hide() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  currentTripStops = null;
  currentTripId = null;
  if (panelEl) {
    clear(panelEl);
    panelEl.hidden = true;
  }
}
