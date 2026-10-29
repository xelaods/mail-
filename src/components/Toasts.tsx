import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Undo2, X } from "lucide-react";
import { useStore, type Toast } from "../lib/store";
import { spring } from "../lib/motion";
import { flyTo, visibleRect } from "../lib/fly";
import { cn } from "./ui";

/** EasyUI UndoToast / VelocityToast を元にしたトースト。ホバー中はカウントダウンが止まる */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed left-1/2 top-[56px] z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
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
  const landOtp = useStore((s) => s.landOtp);
  const cardRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
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
      if (left <= 0) {
        if (!done.current) {
          done.current = true;
          const target = t.morph ? visibleRect(document.querySelector(`[data-morph="${t.morph}"]`)) : null;
          if (t.morph && target && cardRef.current) {
            flyTo(cardRef.current, target, { duration: 520, arc: 10, onLand: landOtp });
            cardRef.current.style.visibility = "hidden";
          } else if (t.morph) landOtp();
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
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={spring.responsive}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      role="status"
      aria-live="polite"
      className="capsule pointer-events-auto relative flex min-w-[320px] max-w-[520px] items-center gap-3 overflow-hidden rounded-[18px] py-2.5 pl-4 pr-2"
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
          className="inline-flex h-7 cursor-default items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-blue transition-colors hover:bg-[color-mix(in_srgb,var(--blue)_12%,transparent)]"
        >
          <Undo2 className="size-3.5" />
          取り消す
          
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
    </motion.div>
  );
}
