import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, ExternalLink, KeyRound, Link2 } from "lucide-react";
import { useStore } from "../lib/store";
import { openExternal } from "../lib/api";
import type { MessageSummary } from "../lib/types";
import { displayName, relativeShort } from "../lib/format";
import { spring } from "../lib/motion";
import { cn } from "./ui";

/** 認証コードの有効期限はたいてい 5〜15 分。それを過ぎたものは薄く表示する */
const FRESH_SECONDS = 15 * 60;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 読みやすいよう 3 桁・4 桁ごとに区切る（コピーする値は区切らない） */
export function spacedCode(code: string): string {
  if (!/^\d+$/.test(code) || code.length < 6) return code;
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

/** 毎分再描画して「◯分前」と期限切れの表示を更新する */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() / 1000), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** コードを表示し、押すとコピーするボタン */
export function CodeButton({ code, size = "md", onCopied }: { code: string; size?: "sm" | "md" | "lg"; onCopied?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (await copyText(code)) {
          setCopied(true);
          onCopied?.();
          window.setTimeout(() => setCopied(false), 1600);
        }
      }}
      title="クリックでコピー"
      className={cn(
        "group/code relative inline-flex cursor-default items-center gap-2 rounded-[10px] font-semibold tabular text-fg transition-colors",
        size === "lg" && "h-12 bg-pill px-4 text-[26px] tracking-[0.08em] hover:bg-pill-active",
        size === "md" && "h-9 bg-pill px-3 text-[18px] tracking-[0.06em] hover:bg-pill-active",
        size === "sm" && "h-6 bg-pill px-2 text-[12.5px] tracking-[0.04em] hover:bg-pill-active",
      )}
    >
      <span>{spacedCode(code)}</span>
      <span className={cn("grid place-items-center text-fg-3 group-hover/code:text-fg", size === "sm" ? "[&_svg]:size-3" : size === "md" ? "[&_svg]:size-3.5" : "[&_svg]:size-4")}>
        <AnimatePresence mode="popLayout" initial={false}>
          {copied ? (
            <motion.span key="ok" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={spring.snappy} className="grid text-green">
              <Check />
            </motion.span>
          ) : (
            <motion.span key="copy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid">
              <Copy />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}

/** 「コード」ビュー：確認コード・認証リンクの届いたメールを、コードを大きく並べて表示 */
export function CodesList({ items }: { items: MessageSummary[] }) {
  const select = useStore((s) => s.select);
  const selectedId = useStore((s) => s.selectedId);
  const now = useNow();

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 pb-20 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-pill text-fg-3">
          <KeyRound className="size-6" />
        </div>
        <p className="mt-4 text-[15px] font-medium text-fg-3">確認コードはまだありません</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-4">
          認証コードや確認リンクのメールが届くと、ここにまとまります
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 pb-4 pt-1">
      {items.map((m) => {
        const age = now - m.date;
        // コードは15分、リンクは24時間を目安に「期限切れの可能性」を出す
        const fresh = m.otpCode ? age < FRESH_SECONDS : age < 86400;
        return (
          <div
            key={m.id}
            onClick={() => select(m.id)}
            className={cn(
              "cursor-default rounded-[14px] p-3.5 transition-colors",
              m.id === selectedId ? "bg-select" : "hover:bg-pill",
              !fresh && "opacity-70",
            )}
          >
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-fg">{displayName(m.fromName, m.fromAddr)}</span>
              <span className={cn("shrink-0 text-[12px] tabular", fresh ? "font-semibold text-blue" : "text-fg-3")}>
                {fresh ? relativeShort(m.date) : `${relativeShort(m.date)}・期限切れの可能性`}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12.5px] text-fg-3">{m.subject}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {m.otpCode && <CodeButton code={m.otpCode} size={fresh ? "md" : "sm"} />}
              {m.otpLink && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openExternal(m.otpLink);
                  }}
                  className="inline-flex h-9 cursor-default items-center gap-1.5 rounded-[10px] bg-blue px-3 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
                >
                  <Link2 className="size-4" />
                  認証リンクを開く
                  <ExternalLink className="size-3.5 opacity-70" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 本文の上に出す帯：このメールのコード／リンク */
export function CodeBanner({ code, link }: { code: string; link: string }) {
  if (!code && !link) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-[14px] bg-pill p-3 pl-4">
      <KeyRound className="size-[18px] shrink-0 text-blue" />
      <span className="text-[13px] font-medium text-fg-2">{code ? "確認コード" : "認証リンク"}</span>
      <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
        {code && <CodeButton code={code} size="lg" />}
        {link && (
          <button
            onClick={() => openExternal(link)}
            className="inline-flex h-10 cursor-default items-center gap-1.5 rounded-[10px] bg-blue px-4 text-[13.5px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            <Link2 className="size-4" />
            認証リンクを開く
          </button>
        )}
      </div>
    </div>
  );
}

/** タイトルバーに出す、直近10分以内に届いたコード */
export function LatestCodePill() {
  const latest = useStore((s) => s.latestOtp);
  const dismiss = useStore((s) => s.dismissOtp);
  const select = useStore((s) => s.select);
  const now = useNow(10_000);
  const visible = !!latest && now * 1000 - latest.at < 10 * 60 * 1000;
  return (
    <AnimatePresence>
      {visible && latest && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={spring.snappy}
          className="capsule mr-2 flex h-[30px] items-center gap-1 rounded-full pl-2.5 pr-1"
          title={`${latest.from}：${latest.subject}`}
        >
          <KeyRound className="size-3.5 text-blue" />
          {latest.code ? (
            <CodeButton code={latest.code} size="sm" />
          ) : (
            <button onClick={() => openExternal(latest.link)} className="cursor-default px-1.5 text-[12.5px] font-semibold text-blue hover:underline">
              認証リンクを開く
            </button>
          )}
          <button
            onClick={() => select(latest.id)}
            className="cursor-default rounded-full px-1.5 text-[11.5px] text-fg-3 hover:text-fg"
          >
            メールを表示
          </button>
          <button onClick={dismiss} aria-label="閉じる" className="grid size-5 cursor-default place-items-center rounded-full text-fg-4 hover:bg-pill-active hover:text-fg">
            ×
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
