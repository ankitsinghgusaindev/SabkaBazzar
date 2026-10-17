import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export interface Coords {
  lat: number;
  lng: number;
}

const PUSH_EVERY_MS = 30_000;

/**
 * Tracks the customer's live position while the app is open (foreground).
 * Stops watching when the tab/app is hidden to save battery and respect privacy.
 * Location is pushed to the server at most every 30 seconds.
 */
export function useLiveLocation(enabled: boolean) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastPush = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (!navigator.geolocation) {
      setError("This device does not support location");
      return;
    }

    let watchId: number | null = null;

    const start = () => {
      if (watchId !== null) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setCoords(c);
          setError(null);
          const now = Date.now();
          if (now - lastPush.current >= PUSH_EVERY_MS) {
            lastPush.current = now;
            api("/me/location", { method: "PUT", body: JSON.stringify(c) }).catch(() => {});
          }
        },
        (err) => setError(err.message),
        { enableHighAccuracy: true, maximumAge: 10_000 },
      );
    };

    const stop = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
    };

    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [enabled]);

  return { coords, error };
}
