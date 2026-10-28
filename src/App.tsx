import { useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { useStore } from "./lib/store";
import { useShortcuts } from "./hooks/useShortcuts";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { MessageList } from "./components/MessageList";
import { Reader } from "./components/Reader";
import { Composer } from "./components/Composer";
import { Toasts } from "./components/Toasts";
import { CommandPalette } from "./components/CommandPalette";
import { AddAccountDialog } from "./components/AddAccountDialog";
import { SettingsDialog, ShortcutsDialog } from "./components/SettingsDialog";

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  useShortcuts();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const stop = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    const noMenu = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("input, textarea, .selectable")) e.preventDefault();
    };
    window.addEventListener("contextmenu", noMenu);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
      window.removeEventListener("contextmenu", noMenu);
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <div className="wallpaper" />
      <div className={`relative z-[1] flex h-full flex-col transition-opacity duration-150 ${ready ? "opacity-100" : "opacity-0"}`}>
        <TitleBar />
        <main className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          <Sidebar />
          <div className="relative flex min-w-0 flex-1 overflow-hidden rounded-[16px] bg-content shadow-panel">
            <MessageList />
            <Reader />
          </div>
        </main>
      </div>
      <Composer />
      <Toasts />
      <CommandPalette />
      <AddAccountDialog />
      <SettingsDialog />
      <ShortcutsDialog />
    </MotionConfig>
  );
}
