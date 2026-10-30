import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { api, isTauri } from "./api";

type WidgetOTP = { code: string; sender: string; receivedAt: number };

/**
 * Synchronize short-lived OTP data to the native iOS WidgetKit extension.
 * The widget never has access to IMAP passwords, authentication links or message bodies.
 * On Windows or without the iOS bridge this is deliberately a no-op.
 */
export function startWidgetSync(): () => void {
  if (!isTauri || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return () => {};
  let stopped = false;
  const unlisteners: UnlistenFn[] = [];
  const publish = async () => {
    if (stopped) return;
    try {
      const otp = await api.latestWidgetOtp();
      if (stopped) return;
      if (otp && otp.receivedAt <= Date.now() / 1000 && Date.now() / 1000 - otp.receivedAt < 900) {
        await invoke("plugin:fumi-widget|publish", {
          code: otp.code,
          sender: otp.sender,
          receivedAt: otp.receivedAt,
        });
      } else {
        await invoke("plugin:fumi-widget|clear");
      }
    } catch (err) {
      // Widget integration is optional on desktop/dev builds.
      console.warn("Fumi widget sync unavailable", err instanceof Error ? err.message : "unknown");
    }
  };
  void publish();
  for (const event of ["mail-changed", "otp-received"]) {
    void listen(event, publish).then((unlisten) => {
      if (stopped) unlisten();
      else unlisteners.push(unlisten);
    });
  }
  const onVisible = () => { if (document.visibilityState === "visible") void publish(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    unlisteners.forEach((fn) => fn());
  };
}
