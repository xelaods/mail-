import { useEffect } from "react";
import { useStore } from "../lib/store";
import { searchInputRef } from "../components/TitleBar";

/** Gmail / Superhuman と同じ感覚のキーボード操作 */
export function useShortcuts() {
  useEffect(() => {
    let gPressed = 0;
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // どこからでも使えるもの
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.setDialog(s.dialog === "palette" ? null : "palette");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        s.setDialog("settings");
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        s.syncNow();
        return;
      }
      if (typing || s.dialog) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const now = Date.now();
      if (now - gPressed < 900) {
        gPressed = 0;
        const map: Record<string, () => void> = {
          i: () => s.setView({ kind: "unified", role: "inbox" }),
          s: () => s.setView({ kind: "unified", role: "flagged" }),
          t: () => s.setView({ kind: "unified", role: "sent" }),
          u: () => s.setView({ kind: "unified", role: "unread" }),
          c: () => s.setView({ kind: "unified", role: "codes" }),
          p: () => s.setView({ kind: "unified", role: "parcels" }),
        };
        map[e.key.toLowerCase()]?.();
        return;
      }

      const current = s.thread?.find((m) => m.id === s.selectedId) ?? s.thread?.[s.thread.length - 1];
      const flagged = s.thread?.some((m) => m.flagged) ?? s.messages.find((m) => m.id === s.selectedId)?.flagged;
      const seen = s.messages.find((m) => m.id === s.selectedId)?.seen ?? true;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          s.moveSelection(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          s.moveSelection(-1);
          break;
        case "e":
        case "y":
          s.triage("archive");
          break;
        case "#":
        case "Delete":
          s.triage("trash");
          break;
        case "!":
          s.triage("junk");
          break;
        case "I":
          s.triage("inbox");
          break;
        case "u":
          s.triage(seen ? "unread" : "read");
          break;
        case "s":
          s.triage(flagged ? "unflag" : "flag");
          break;
        case "x":
          if (s.selectedId != null) s.toggleCheck(s.selectedId);
          break;
        case "r":
          if (current) {
            e.preventDefault();
            s.openComposer("reply", current);
          }
          break;
        case "a":
          if (current) {
            e.preventDefault();
            s.openComposer("replyAll", current);
          }
          break;
        case "f":
          if (current) {
            e.preventDefault();
            s.openComposer("forward", current);
          }
          break;
        case "c":
          e.preventDefault();
          s.openComposer("new");
          break;
        case "/":
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case "?":
          s.setDialog("shortcuts");
          break;
        case "g":
          gPressed = now;
          break;
        case "Escape":
          if (s.checked.size) s.clearChecks();
          else if (s.search) s.setSearch("");
          else if (s.selectedId != null) s.select(null);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
