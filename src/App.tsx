import { useEffect, useState, type ReactNode } from "react";
import { MotionConfig, motion } from "framer-motion";
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
import { Intro } from "./components/Intro";

const CINEMA = [0.22, 1, 0.36, 1] as const;

/** 幕が上がった後、各ペインが少しずつ時間差でピントを合わせて現れる */
function Reveal({ show, delay, className, children }: { show: boolean; delay: number; className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 14, filter: "blur(10px)" }}
      animate={
        show
          ? {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              // 終わったら filter / transform を外す（子のガラス効果や固定配置を妨げないように）
              transitionEnd: { filter: "none", transform: "none" },
            }
          : undefined
      }
      transition={{ duration: 0.9, ease: CINEMA, delay }}
    >
      {children}
    </motion.div>
  );
}

export default function App() {
  const init = useStore((s) => s.init);
  const ready = useStore((s) => s.ready);
  const [introDone, setIntroDone] = useState(false);
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

  const pane = (delay: number, className: string, node: ReactNode) => (
    <Reveal show={introDone} delay={delay} className={className}>
      {node}
    </Reveal>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="wallpaper" />
      <div className="relative z-[1] flex h-full flex-col">
        {pane(0, "relative z-30", <TitleBar />)}
        <main className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          {pane(0.05, "flex", <Sidebar />)}
          {pane(
            0.12,
            "relative flex min-w-0 flex-1 overflow-hidden rounded-[16px] bg-content shadow-panel",
            <>
              <MessageList />
              <Reader />
            </>,
          )}
        </main>
      </div>
      <Composer />
      <Toasts />
      <CommandPalette />
      <AddAccountDialog />
      <SettingsDialog />
      <ShortcutsDialog />
      {!introDone && <Intro ready={ready} onDone={() => setIntroDone(true)} />}
    </MotionConfig>
  );
}
