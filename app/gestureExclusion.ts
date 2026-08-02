import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

const GestureExclusion = registerPlugin<{
  set(options: { rects: number[][] }): Promise<void>;
}>("GestureExclusion");

/**
 * Tells Android to ignore its edge Back gesture over every `[data-no-back-gesture]` element,
 * so drags starting near the screen edge aren't swallowed. No-op off native.
 * Android honors at most 200dp per edge, bottom-most rects first.
 */
export function useNoBackGesture(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let raf = 0;
    function push(): void {
      raf = 0;
      const dpr = window.devicePixelRatio;
      const rects = Array.from(document.querySelectorAll("[data-no-back-gesture]"), (el) => {
        const r = el.getBoundingClientRect();
        return [r.left * dpr, r.top * dpr, r.right * dpr, r.bottom * dpr].map(Math.round);
      });
      void GestureExclusion.set({ rects });
    }
    function schedule(): void {
      if (!raf) raf = requestAnimationFrame(push);
    }

    schedule();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    // ponytail: body-level observer instead of tracking each row's mount/unmount
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      void GestureExclusion.set({ rects: [] });
    };
  }, []);
}
