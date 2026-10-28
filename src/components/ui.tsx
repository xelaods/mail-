import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { spring, ease } from "../lib/motion";
import { avatarTone, initials } from "../lib/format";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Tooltip — EasyUI DirectionalTooltip：出てくる方向からスッと現れる      */
/* ------------------------------------------------------------------ */

export function Tooltip({
  label,
  shortcut,
  side = "bottom",
  children,
}: {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom" | "right" | "left";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number>(undefined);
  const offset = { top: { y: 6 }, bottom: { y: -6 }, right: { x: -6 }, left: { x: 6 } }[side];
  const pos = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
  }[side];
  return (
    <span
      className="relative inline-flex"
      onPointerEnter={() => {
        timer.current = window.setTimeout(() => setOpen(true), 420);
      }}
      onPointerLeave={() => {
        window.clearTimeout(timer.current);
        setOpen(false);
      }}
      onPointerDown={() => {
        window.clearTimeout(timer.current);
        setOpen(false);
      }}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.96, ...offset }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.08 } }}
            transition={spring.snappy}
            className={cn(
              "pointer-events-none absolute z-[80] flex items-center gap-2 whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-fg shadow-card",
              pos,
            )}
          >
            {label}
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-surface-raised px-1 font-mono text-[10px] font-normal leading-none text-fg-3",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons — EasyUI Button / PressButton（押すと少し沈む）               */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, loading, className, children, disabled, ...rest },
  ref,
) {
  const variants: Record<Variant, string> = {
    primary: "bg-accent text-accent-fg hover:opacity-90 shadow-[0_0_20px_-3px_var(--accent-glow)]",
    secondary: "bg-surface-raised text-fg border border-line hover:border-line-hover hover:bg-surface-hover",
    outline: "border border-line text-fg hover:border-line-hover hover:bg-pill",
    ghost: "text-fg-2 hover:text-fg hover:bg-pill",
    danger: "border border-line text-danger hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]",
  };
  const sizes: Record<Size, string> = {
    sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
    md: "h-8.5 px-3.5 text-[13px] gap-2 rounded-lg",
  };
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={spring.snappy}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex shrink-0 cursor-default select-none items-center justify-center font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
      {...(rest as object)}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </motion.button>
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; shortcut?: string; side?: "top" | "bottom" | "right" | "left"; active?: boolean; size?: "sm" | "md" }
>(function IconButton({ label, shortcut, side, active, size = "md", className, children, ...rest }, ref) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={side}>
      <motion.button
        ref={ref}
        aria-label={label}
        whileTap={{ scale: 0.92 }}
        transition={spring.snappy}
        className={cn(
          "inline-flex cursor-default items-center justify-center rounded-lg text-fg-3 transition-colors duration-150 hover:bg-pill hover:text-fg disabled:opacity-30",
          size === "md" ? "size-8 [&>svg]:size-4" : "size-7 [&>svg]:size-[15px]",
          active && "bg-pill-active text-fg",
          className,
        )}
        {...(rest as object)}
      >
        {children}
      </motion.button>
    </Tooltip>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5 animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

export function Avatar({ name, email, size = 32, ring }: { name: string; email: string; size?: number; ring?: string }) {
  const tone = avatarTone(email || name);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full font-medium"
      style={{
        width: size,
        height: size,
        background: tone.bg,
        color: tone.fg,
        fontSize: Math.round(size * 0.4),
        boxShadow: ring ? `0 0 0 2px var(--bg), 0 0 0 3.5px ${ring}` : "inset 0 0 0 1px rgba(255,255,255,0.06)",
      }}
      aria-hidden
    >
      {initials(name, email)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog — EasyUI SettleModal：0.94 → 1.02 → 1.0 で落ち着く               */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = 480,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  width?: number;
  dismissable?: boolean;
}) {
  const id = useId();
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, dismissable]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" role="dialog" aria-modal aria-labelledby={id}>
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={ease.soft}
            onClick={dismissable ? onClose : undefined}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: [0.94, 1.02, 1], y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6, transition: { duration: 0.14 } }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1], times: [0, 0.6, 1] }}
            className="relative flex max-h-[min(720px,calc(100vh-48px))] w-full flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-float"
            style={{ maxWidth: width }}
          >
            {title && (
              <div className="flex items-start justify-between gap-4 px-6 pt-5">
                <div>
                  <h2 id={id} className="text-[17px] font-semibold tracking-[-0.02em] text-fg">
                    {title}
                  </h2>
                  {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{description}</p>}
                </div>
                {dismissable && (
                  <IconButton label="閉じる" size="sm" onClick={onClose} className="-mr-2 -mt-1">
                    <X />
                  </IconButton>
                )}
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.gentle, delay: 0.05 }}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {children}
            </motion.div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Switch — EasyUI StretchSwitch：押すとつまみが少し伸びる               */
/* ------------------------------------------------------------------ */

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 cursor-default items-center rounded-full border transition-colors duration-200",
        checked ? "border-transparent bg-accent" : "border-line bg-surface-raised",
      )}
    >
      <motion.span
        layout
        transition={spring.snappy}
        className={cn("absolute top-[2px] h-4 rounded-full shadow-sm", checked ? "bg-accent-fg" : "bg-fg-3")}
        style={{ left: checked ? undefined : 2, right: checked ? 2 : undefined }}
        animate={{ width: pressed ? 20 : 16 }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented — EasyUI AnimatedTabs：ピルが滑って移動する                  */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div className="inline-flex rounded-lg border border-line-subtle bg-surface-raised p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative cursor-default rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
            value === o.value ? "text-fg" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              transition={spring.morph}
              className="absolute inset-0 rounded-md border border-line bg-surface shadow-subtle"
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-fg-3">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border border-line bg-surface-raised px-3 text-[13px] text-fg placeholder:text-fg-4 transition-colors focus:border-line-hover focus:bg-surface focus:outline-none";
