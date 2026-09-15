import { useEffect } from "react";
import { useGame } from "../state/store.ts";

const SHOW_MS = 3600;

/** Short announcements from the world ("Quest started: ..."), shown one after another at the top of the screen. */
export function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismissToast = useGame((s) => s.dismissToast);
  const first = toasts[0];

  useEffect(() => {
    if (!first) return;
    const timer = window.setTimeout(() => {
      dismissToast(first.id);
    }, SHOW_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [first, dismissToast]);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.slice(0, 3).map((toast) => (
        <div key={toast.id} className="toast">
          {toast.text}
        </div>
      ))}
    </div>
  );
}
