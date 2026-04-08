"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    // Unregister any existing service workers — the SW was causing stale
    // page caching issues in this local dev tool. PWA offline support is
    // not needed for a localhost app.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
        }
      });
      // Clear any leftover caches
      if ("caches" in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
    }
  }, []);

  return null;
}
