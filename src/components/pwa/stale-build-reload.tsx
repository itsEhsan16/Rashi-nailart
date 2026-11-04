"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** When we last auto-reloaded, so a server that truly lacks an action can't loop us. */
const RELOAD_KEY = "stale-build-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * Recovers a tab that is running JavaScript from an older deployment.
 *
 * Server Action IDs are re-hashed on every build, so a page loaded before a
 * deploy — a tab left open, or the installed PWA resumed from the background —
 * calls IDs the new server no longer knows. Next answers those POSTs with a 404
 * and the `x-nextjs-action-not-found: 1` header, and nothing on the page works
 * again (booking, slot lookup, dashboard actions) until a full reload.
 *
 * Next's action client calls the global `fetch` at call time, so wrapping it
 * here sees every action response in one place. On that header we reload once
 * to pick up the current build. The original response is still returned, so
 * the caller fails exactly as before; the reload just replaces the page.
 */
export function StaleBuildReload() {
  useEffect(() => {
    const original = window.fetch;
    let reloading = false;

    window.fetch = async (...args) => {
      const res = await original(...args);
      if (!reloading && res.headers.get("x-nextjs-action-not-found") === "1") {
        reloading = reloadOnce();
      }
      return res;
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}

function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload. A real missing action would loop only if
    // the fresh page hits it again immediately, and storage-less browsers are rare.
  }
  toast.info("The site was just updated — refreshing…");
  setTimeout(() => window.location.reload(), 1200);
  return true;
}
