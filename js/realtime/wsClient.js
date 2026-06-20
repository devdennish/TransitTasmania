// WebSocket client with automatic reconnect (exponential backoff). It knows
// nothing about message contents - on connect it sends the configured init
// frame, then hands each raw frame's data to the supplied onMessage callback
// and reports connection status.

import { WS_URL, WS_INIT_MESSAGE, WS_RECONNECT_MIN, WS_RECONNECT_MAX } from "../config.js";
import { setConnection } from "../state/store.js";

export function connectVehicleStream(onMessage) {
  let ws = null;
  let backoff = WS_RECONNECT_MIN;
  let reconnectTimer = null;
  let closedByUs = false;

  function open() {
    setConnection("connecting");
    try {
      ws = new WebSocket(WS_URL);
    } catch (err) {
      console.error("WebSocket construction failed:", err);
      scheduleReconnect();
      return;
    }

    ws.addEventListener("open", () => {
      backoff = WS_RECONNECT_MIN; // reset backoff on a healthy connection
      setConnection("open");
      if (WS_INIT_MESSAGE) {
        try {
          ws.send(WS_INIT_MESSAGE);
        } catch (err) {
          console.error("Failed to send init message:", err);
        }
      }
    });

    ws.addEventListener("message", (ev) => {
      // The Tas feed is a text protocol, not plain JSON, so hand the raw frame
      // string straight to the feed parser. Ignore binary frames.
      if (typeof ev.data === "string") onMessage(ev.data);
    });

    ws.addEventListener("close", () => {
      setConnection("closed");
      if (!closedByUs) scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      // 'close' fires after 'error'; let it handle the reconnect.
      try {
        ws.close();
      } catch {
        /* noop */
      }
    });
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(open, backoff);
    backoff = Math.min(backoff * 2, WS_RECONNECT_MAX);
  }

  open();

  return {
    close() {
      closedByUs = true;
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    },
  };
}
