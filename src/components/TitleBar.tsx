import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, RefreshCw, Search, Settings2, Square, X } from "lucide-react";
import { useStore } from "../lib/store";
import { useShallow } from "zustand/react/shallow";
import { windowAction } from "../lib/api";
import { spring } from "../lib/motion";
import { IconButton, Kbd, cn } from "./ui";

export const searchInputRef = { current: null as HTMLInputElement | null };

async function closeWindow() {
  // 取り消し待ちの操作は閉じる前に確定させる
  const { toasts, resolveToast } = useStore.getState();
  const pending = toasts.filter((t) => t.commit);
  await Promise.all(pending.map(async (t) => resolveToast(t.id, "commit")));
  await new Promise((r) => setTimeout(r, pending.length ? 1200 : 0));
  windowAction("close");
}

export function TitleBar() {
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const setDialog = useStore((s) => s.setDialog);
  const syncNow = useStore((s) => s.syncNow);
  const syncing = useStore((s) => Object.values(s.sync).some((x) => x.state === "syncing"));
  const errors = useStore(useShallow((s) => Object.values(s.sync).filter((x) => x.state === "error")));
  const [value, setValue] = useState(search);
  const [focused, setFocused] = useState(false);
  const [manual, setManual] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  searchInputRef.current = ref.current;

  useEffect(() => setValue(search), [search]);
  useEffect(() => {
    searchInputRef.current = ref.current;
  });

  useEffect(() => {
    if (value === search) return;
    const t = window.setTimeout(() => setSearch(value), 180);
    return () => window.clearTimeout(t);
  }, [value, search, setSearch]);

  const busy = syncing || manual;

  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-11 shrink-0 items-center gap-3 border-b border-line-subtle bg-bg pl-4"
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).hasAttribute("data-tauri-drag-region")) windowAction("maximize");
      }}
    >
      <div data-tauri-drag-region className="flex w-[218px] shrink-0 items-center gap-2.5">
        <Logo />
        <span data-tauri-drag-region className="text-[13px] font-semibold tracking-[-0.02em] text-fg">
          Fumi
        </span>
      </div>

      {/* 検索 — EasyUI iOS-style Search Bar：フォーカスで幅が広がる */}
      <div data-tauri-drag-region className="flex flex-1 justify-center">
        <motion.label
          animate={{ width: focused || value ? 560 : 380 }}
          transition={spring.snappy}
          className={cn(
            "relative flex h-[30px] max-w-full cursor-text items-center gap-2 rounded-full border px-3 transition-colors duration-200",
            focused ? "border-line-hover bg-surface" : "border-line-subtle bg-surface-raised hover:border-line",
          )}
        >
          <Search className="size-3.5 shrink-0 text-fg-3" />
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setValue("");
                setSearch("");
                ref.current?.blur();
              }
              if (e.key === "Enter") setSearch(value);
            }}
            placeholder="メールを検索"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-3 focus:outline-none"
            spellCheck={false}
          />
          <AnimatePresence initial={false} mode="popLayout">
            {value ? (
              <motion.button
                key="clear"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={spring.snappy}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setValue("");
                  setSearch("");
                }}
                className="grid size-4 place-items-center rounded-full bg-fg-4 text-bg"
                aria-label="検索をクリア"
              >
                <X className="size-2.5" strokeWidth={3} />
              </motion.button>
            ) : (
              <motion.span key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.label>
      </div>

      <div className="flex items-center gap-0.5">
        {errors.length > 0 && (
          <button
            onClick={() => setDialog("settings")}
            className="mr-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-pill"
            title={errors.map((e) => e.message).join("\n")}
          >
            接続エラー
          </button>
        )}
        <IconButton
          label={busy ? "同期中" : "今すぐ同期"}
          shortcut="F5"
          onClick={async () => {
            setManual(true);
            await syncNow();
            setManual(false);
          }}
        >
          <RefreshCw className={cn(busy && "animate-spin [animation-duration:1.1s]")} />
        </IconButton>
        <IconButton label="設定" shortcut="Ctrl ," onClick={() => setDialog("settings")}>
          <Settings2 />
        </IconButton>
      </div>

      <div className="ml-1 flex h-full items-stretch">
        <WinButton label="最小化" onClick={() => windowAction("minimize")}>
          <Minus className="size-4" strokeWidth={1.5} />
        </WinButton>
        <WinButton label="最大化" onClick={() => windowAction("maximize")}>
          <Square className="size-3" strokeWidth={1.5} />
        </WinButton>
        <WinButton label="閉じる" danger onClick={closeWindow}>
          <X className="size-4" strokeWidth={1.5} />
        </WinButton>
      </div>
    </header>
  );
}

function WinButton({ children, label, onClick, danger }: { children: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid w-[46px] cursor-default place-items-center text-fg-2 transition-colors duration-100",
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-pill-active hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Logo() {
  return (
    <svg data-tauri-drag-region viewBox="0 0 24 24" className="size-[18px]" aria-hidden>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="var(--surface-raised)" stroke="var(--border-hover)" />
      <rect x="5" y="7.2" width="14" height="9.8" rx="2" fill="var(--text-primary)" />
      <path d="M5.8 8 L12 12.6 L18.2 8" fill="none" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.4" cy="6.6" r="2.2" fill="var(--indicator)" stroke="var(--surface-raised)" strokeWidth="1" />
    </svg>
  );
}
