import { Suspense, lazy, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useNarrow } from "./hooks/useNarrow";
import { useMobile } from "./hooks/useMobile";
import { useStore } from "./lib/store";
import { useShortcuts } from "./hooks/useShortcuts";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { MessageList } from "./components/MessageList";
import { Reader } from "./components/Reader";
import { Toasts } from "./components/Toasts";
import { Welcome } from "./components/Welcome";

// めったに開かない画面は、最初に必要になった時に読み込む（起動を軽くする）
const Composer = lazy(() => import("./components/Composer").then((m) => ({ default: m.Composer })));
const CommandPalette = lazy(() => import("./components/CommandPalette").then((m) => ({ default: m.CommandPalette })));
const AddAccountDialog = lazy(() => import("./components/AddAccountDialog").then((m) => ({ default: m.AddAccountDialog })));
const SettingsDialog = lazy(() => import("./components/SettingsDialog").then((m) => ({ default: m.SettingsDialog })));
const ShortcutsDialog = lazy(() => import("./components/SettingsDialog").then((m) => ({ default: m.ShortcutsDialog })));

/** 一度でも true になったら、その後もずっと true（閉じるアニメーションのため描画を残す） */
function useEver(cond: boolean) {
  const [ever, setEver] = useState(cond);
  useEffect(() => {
    if (cond) setEver(true);
  }, [cond]);
  return ever || cond;
}

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const narrow = useNarrow();
  const mobile = useMobile();
  const selectedId = useStore((s) => s.selectedId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const dialog = useStore((s) => s.dialog);
  const hasComposer = useStore((s) => !!s.composer);
  const composerEver = useEver(hasComposer);
  const paletteEver = useEver(dialog === "palette");
  const addEver = useEver(dialog === "addAccount");
  const settingsEver = useEver(dialog === "settings");
  const shortcutsEver = useEver(dialog === "shortcuts");
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
        {mobile && selectedId != null && (
          <button type="button" onClick={() => useStore.getState().select(null)} className="flex min-h-11 items-center px-5 text-sm font-semibold text-fg" aria-label="メール一覧に戻る">‹ 受信一覧に戻る</button>
        )}
        <main className={`flex min-h-0 flex-1 gap-2 px-2 pb-2 ${mobile ? "flex-col" : ""}`}>
          {!narrow && <Sidebar />}
          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-[16px] bg-content shadow-panel">
            {(!mobile || selectedId == null) && <MessageList />}
            {(!mobile || selectedId != null) && <Reader />}
          </div>
        </main>
      </div>
      {/* 狭いウィンドウでは、サイドバーを上に重ねて出す */}
      <AnimatePresence>
        {narrow && sidebarOpen && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              key="drawer"
              className="fixed bottom-2 left-2 top-[48px] z-50 flex"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
              <Sidebar />
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <Toasts />
      <Welcome />
      <Suspense fallback={null}>
        {composerEver && <Composer />}
        {paletteEver && <CommandPalette />}
        {addEver && <AddAccountDialog />}
        {settingsEver && <SettingsDialog />}
        {shortcutsEver && <ShortcutsDialog />}
      </Suspense>
    </MotionConfig>
  );
}
