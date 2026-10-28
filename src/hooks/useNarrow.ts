import { useSyncExternalStore } from "react";

/** ウィンドウが狭いとき（サイドバーを重ねて表示する幅）は true */
const QUERY = "(max-width: 1099px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useNarrow(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
