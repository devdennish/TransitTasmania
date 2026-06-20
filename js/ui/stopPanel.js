// Floating "departures board" shown when a stop is selected (clicked on the map
// or chosen from the stop list/search). Lists the next departures from that
// stop today, with route, destination, scheduled time, and a live countdown.
// A "LIVE" badge marks trips a vehicle is currently operating.

import { el, clear, contrastText, debounce } from "../utils/dom.js";
import { state, on, selectStop } from "../state/store.js";
import { getStopDepartures } from "../data/stopSchedule.js";
import { formatClock, formatCountdown } from "../utils/time.js";

let panelEl = null;
let refreshTimer = null;
let currentStopId = null;
let departures = null; // cached result or null while loading

export function initStopPanel(rootEl) {
  panelEl = rootEl;
  on("selection:changed", ({ stopId }) => onStopChanged(stopId));
  // Recompute live ETAs as vehicles move (debounced to coalesce bursts).
  const debounced = debounce(() => {
    if (currentStopId) refresh(currentStopId);
  }, 2000);
  on("vehicles:changed", debounced);
}

async function onStopChanged(stopId) {
  clearInterval(refreshTimer);
  refreshTimer = null;

  if (!stopId) {
    hide();
    return;
  }

  currentStopId = stopId;
  departures = null;
  render(); // loading state

  await refresh(stopId);
  // Re-pull departures + live ETAs periodically (also ticks the countdowns).
  refreshTimer = setInterval(() => refresh(currentStopId), 15000);
}

async function refresh(stopId) {
  if (!stopId) return;
  try {
    const result = await getStopDepartures(stopId);
    if (currentStopId !== stopId) return; // selection changed mid-load
    departures = result;
  } catch (err) {
    console.error("Failed to load stop departures:", err);
    departures = { departures: [], now: null, error: true };
  }
  render();
}

function render() {
  const stopId = currentStopId;
  if (!stopId || !panelEl) return hide();
  const stop = state.stopsById.get(stopId);
  if (!stop) return hide();

  clear(panelEl);

  panelEl.append(
    el("div", { class: "vpanel__header" }, [
      el("div", { class: "vpanel__title" }, [
        el("div", { class: "vpanel__route", text: stop.name }),
        el("div", { class: "vpanel__dest", text: `Stop ${stop.code || stop.id}` }),
      ]),
      el("button", {
        class: "vpanel__close",
        text: "\u00d7",
        title: "Close",
        onClick: () => selectStop(null),
      }),
    ])
  );

  panelEl.append(el("div", { class: "vpanel__section-title", text: "Departures today" }));
  panelEl.append(renderDepartures());
  panelEl.append(
    el("div", { class: "vpanel__note", text: "Scheduled times. LIVE marks a tracked bus." })
  );

  panelEl.hidden = false;
}

function renderDepartures() {
  if (departures === null) {
    return el("div", { class: "vpanel__empty", text: "Loading departures..." });
  }
  if (departures.error) {
    return el("div", { class: "vpanel__empty", text: "Couldn't load departures." });
  }
  const { departures: list, now } = departures;
  if (!list.length) {
    return el("div", { class: "vpanel__empty", text: "No more departures today." });
  }

  const ul = el("ul", { class: "vpanel__stops" });
  for (const d of list) {
    const route = d.routeId ? state.routesById.get(d.routeId) : null;
    const badgeBg = route?.color ? `#${route.color}` : "#4da3ff";

    // Live trips use the real-time, delay-aware ETA; others use the timetable.
    const isLive = d.live && d.liveEtaSec != null;
    const etaSec = isLive ? d.liveEtaSec : now ? d.sec - now.seconds : null;
    const shownSec = isLive && now != null ? now.seconds + d.liveEtaSec : d.sec;
    const countdown = etaSec != null ? formatCountdown(etaSec) : "";
    // Show the scheduled time struck through when the live estimate has
    // drifted from it by more than a minute (i.e. the bus is running late/early).
    const delayed = isLive && Math.abs(shownSec - d.sec) > 60;

    const clockChildren = [];
    if (isLive) clockChildren.push(el("span", { class: "live-badge", text: "LIVE" }));
    if (delayed) {
      clockChildren.push(el("span", { class: "vpanel__dep-sched", text: formatClock(d.sec) }));
    }
    clockChildren.push(el("span", { text: formatClock(shownSec) }));

    ul.append(
      el("li", { class: "vpanel__dep" }, [
        el("span", {
          class: "route-badge route-badge--sm",
          text: route?.shortName || "?",
          style: `background:${badgeBg};color:${contrastText(route?.color)}`,
        }),
        el("span", { class: "vpanel__dep-dest", text: d.headsign || route?.longName || "" }),
        el("span", { class: "vpanel__dep-times" }, [
          el("span", { class: "vpanel__dep-clock" }, clockChildren),
          el("span", {
            class: `vpanel__dep-eta${isLive ? " vpanel__dep-eta--live" : ""}`,
            text: countdown,
          }),
        ]),
      ])
    );
  }
  return ul;
}

function hide() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  currentStopId = null;
  departures = null;
  if (panelEl) {
    clear(panelEl);
    panelEl.hidden = true;
  }
}
