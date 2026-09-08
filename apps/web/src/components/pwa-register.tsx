"use client";

import { useEffect } from "react";

const CACHE_PREFIX = "couchlist-";

/**
 * Keep service workers out of local development.
 *
 * Next dev/HMR changes server and client output constantly, while a service
 * worker can outlive those builds. If an older Couchlist worker is still
 * controlling localhost, remove it, clear its caches, then reload once so the
 * current Next.js client and server start from the same build.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          const hadWorker = registrations.length > 0;

          await Promise.all(
            registrations.map((registration) => registration.unregister()),
          );

          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((key) => key.startsWith(CACHE_PREFIX))
                .map((key) => caches.delete(key)),
            );
          }

          // An unregistered worker can still control the page that removed it.
          // Reload once so subsequent HMR/navigation requests bypass it entirely.
          if (hadWorker) window.location.reload();
        } catch {
          // PWA cleanup is best-effort and must never block Couchlist.
        }
      })();
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // PWA support is optional. A registration failure must never break Couchlist.
      });
  }, []);

  return null;
}
