// Sidebar container: tab switching, the shared search box, connection status,
// vehicle count, and clear-selection. Delegates list rendering to routeList and
// stopList, and reacts to store events.

import { initRouteList, setRouteFilter } from "./routeList.js";
import { initStopList, setStopFilter } from "./stopList.js";
import { state, on, clearSelection } from "../state/store.js";

let activeTab = "routes";

export function initSidebar() {
  initRouteList(document.getElementById("route-list"));
  initStopList(document.getElementById("stop-list"));

  wireTabs();
  wireSearch();
  wireClearSelection();
  wireDrawer();

  on("connection:changed", updateConnection);
  on("vehicles:changed", updateVehicleCount);
  on("vehicles:removed", updateVehicleCount);
  on("selection:changed", updateClearButton);
  // On mobile, close the drawer once something is selected so the map and
  // detail panels are visible (inert on desktop, where the sidebar is static).
  on("selection:changed", ({ routeId, stopId }) => {
    if (routeId || stopId) closeDrawer();
  });
  on("vehicleSelection:changed", (id) => {
    if (id) closeDrawer();
  });

  updateConnection(state.connection);
}

const sidebarEl = () => document.getElementById("sidebar");
const backdropEl = () => document.getElementById("sidebar-backdrop");

function openDrawer() {
  sidebarEl().classList.add("sidebar--open");
  backdropEl().hidden = false;
}

function closeDrawer() {
  sidebarEl().classList.remove("sidebar--open");
  backdropEl().hidden = true;
}

// Mobile left drawer: hamburger opens it; the close button and backdrop tap
// close it. On desktop the drawer classes are inert (sidebar is always shown).
function wireDrawer() {
  document
    .getElementById("sidebar-toggle")
    .addEventListener("click", openDrawer);
  document
    .getElementById("sidebar-close")
    .addEventListener("click", closeDrawer);
  backdropEl().addEventListener("click", closeDrawer);
}

function wireTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle("tab--active", t === tab));
      document
        .getElementById("panel-routes")
        .classList.toggle("panel--active", activeTab === "routes");
      document
        .getElementById("panel-stops")
        .classList.toggle("panel--active", activeTab === "stops");
      // Re-apply the current search box value to the now-active list.
      applyFilter(document.getElementById("search-input").value);
    });
  });
}

function wireSearch() {
  const input = document.getElementById("search-input");
  input.addEventListener("input", () => applyFilter(input.value));
}

function applyFilter(value) {
  if (activeTab === "routes") setRouteFilter(value);
  else setStopFilter(value);
}

function wireClearSelection() {
  document.getElementById("clear-selection").addEventListener("click", clearSelection);
}

function updateConnection(status) {
  const dot = document.getElementById("conn-dot");
  const label = document.getElementById("conn-label");
  const map = {
    open: ["Live", "conn-dot--on"],
    connecting: ["Connecting...", "conn-dot--off"],
    closed: ["Disconnected - retrying", "conn-dot--off"],
  };
  const [text, cls] = map[status] || map.connecting;
  label.textContent = text;
  dot.className = `conn-dot ${cls}`;
}

function updateVehicleCount() {
  const n = state.vehicles.size;
  document.getElementById("vehicle-count").textContent =
    `${n} vehicle${n === 1 ? "" : "s"}`;
}

function updateClearButton() {
  const btn = document.getElementById("clear-selection");
  btn.hidden = state.selectedRouteId == null && state.selectedStopId == null;
}
