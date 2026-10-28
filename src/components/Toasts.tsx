import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Undo2, X } from "lucide-react";
import { useStore, type Toast } from "../lib/store";
import { spring } from "../lib/motion";
import { Kbd, cn } from "./ui";

/** EasyUI UndoToast / VelocityToast を元にしたトースト。ホバー中はカウントダウンが止まる */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col-reverse items-center gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t, i) => (
          <ToastCard key={t.id} t={t} latest={i === toasts.length - 1} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ t, latest }: { t: Toast; latest: boolean }) {
  const resolve = useStore((s) => s.resolveToast);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(1);
  const remaining = useRef(t.duration);
  const done = useRef(false);

  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const total = remaining.current;
    let raf = 0;
    const tick = (now: number) => {
      const left = Math.max(0, total - (now - start));
      remaining.current = left;
      setProgress(left / t.duration);
      if (left <= 0) {
        if (!done.current) {
          done.current = true;
          resolve(t.id, "commit");
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, t.id, t.duration, resolve]);

  // Ctrl+Z で直近の操作を取り消す
  useEffect(() => {
    if (!latest || !t.undo) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        done.current = true;
        resolve(t.id, "undo");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [latest, t, resolve]);

  const icon =
    t.tone === "error" ? (
      <AlertCircle className="size-4 text-danger" />
    ) : t.tone === "success" ? (
      <Check className="size-4 text-[#46a758]" />
    ) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.94, transition: { duration: 0.16 } }}
      transition={spring.responsive}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
      className="pointer-events-auto relative flex min-w-[320px] max-w-[520px] items-center gap-3 overflow-hidden rounded-[14px] border border-line bg-surface py-2.5 pl-3.5 pr-2 shadow-float"
    >
      {icon && <span className="grid size-7 shrink-0 place-items-center rounded-lg border border-line-subtle bg-surface-raised">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-fg">{t.title}</p>
        {t.description && <p className={cn("mt-0.5 text-xs text-fg-3", t.tone === "error" ? "line-clamp-3 select-text" : "truncate")}>{t.description}</p>}
      </div>
      {t.undo && (
        <button
          onClick={() => {
            done.current = true;
            resolve(t.id, "undo");
          }}
          className="inline-flex h-7 cursor-default items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2.5 text-xs font-medium text-fg transition-colors hover:border-line-hover"
        >
          <Undo2 className="size-3.5 text-fg-2" />
          取り消す
          {latest && <Kbd className="ml-0.5 h-4">Ctrl Z</Kbd>}
        </button>
      )}
      <button
        onClick={() => {
          done.current = true;
          resolve(t.id, t.undo ? "commit" : "dismiss");
        }}
        className="grid size-7 shrink-0 cursor-default place-items-center rounded-md text-fg-3 hover:bg-pill hover:text-fg"
        aria-label="閉じる"
      >
        <X className="size-3.5" />
      </button>
      {t.commit && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-line-subtle">
          <div className="h-full bg-fg-2" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </motion.div>
  );
}
