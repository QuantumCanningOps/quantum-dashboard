"use client";

import { useEffect } from "react";

/** One-shot cleanup for stale service workers that can full-reload localhost. */
export function ClearServiceWorkers() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void (async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    })();
  }, []);
  return null;
}
