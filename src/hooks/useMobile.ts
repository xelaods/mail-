import { useSyncExternalStore } from "react";

// Single-column phone layout. Desktop keeps its existing three-pane UI.
const QUERY = "(max-width: 600px)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function useMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
