"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Slim, YouTube-style progress bar pinned to the very top of the viewport.
 *
 * It exists to give instant "your click registered, a new page is opening"
 * feedback: the bar appears the moment a user starts navigating and completes
 * once the URL settles on the new route.
 *
 * Navigation *start* is detected by listening (in the capture phase, so we run
 * before <Link>'s own handler calls preventDefault) for clicks on internal
 * <a> links — this covers every Link in the app without wiring each one up.
 * *Completion* is detected when the pathname changes. A safety timeout releases
 * the bar if a navigation never lands (e.g. clicking the current page).
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const running = useRef(false);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const stopTrickle = () => {
    if (trickle.current) {
      clearInterval(trickle.current);
      trickle.current = null;
    }
  };
  const clearAll = () => {
    stopTrickle();
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const start = () => {
    if (running.current) return;
    running.current = true;
    clearAll();
    setVisible(true);
    setProgress(8);
    // Creep toward 90% while we wait — never reach 100 until navigation lands.
    trickle.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const step = p < 25 ? 8 : p < 55 ? 4 : p < 80 ? 1.5 : 0.4;
        return Math.min(90, p + step);
      });
    }, 350);
    // Safety net: same-page clicks / blocked navs never change the URL.
    timers.current.push(setTimeout(finish, 10_000));
  };

  const finish = () => {
    if (!running.current) return;
    running.current = false;
    stopTrickle();
    setProgress(100);
    timers.current.push(
      setTimeout(() => {
        setVisible(false);
        // Reset width only after the fade-out so it doesn't visibly rewind.
        timers.current.push(setTimeout(() => setProgress(0), 250));
      }, 220),
    );
  };

  // Detect the start of a navigation from any internal link click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest?.("a");
      if (!anchor) return;

      const target = anchor.getAttribute("target");
      if ((target && target !== "_self") || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let dest: URL;
      try {
        dest = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      // Ignore external links and clicks that don't change the path/query.
      if (dest.origin !== window.location.origin) return;
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) {
        return;
      }
      start();
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Complete whenever the URL settles on a new path.
  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Clean up any pending timers on unmount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => clearAll(), []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 250ms ease" }}
    >
      <div
        className="h-full rounded-r-full bg-primary"
        style={{
          width: `${progress}%`,
          transition: "width 250ms ease",
          boxShadow: "0 0 10px var(--primary-glow), 0 0 4px var(--primary)",
        }}
      />
    </div>
  );
}
