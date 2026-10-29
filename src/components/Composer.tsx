import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Maximize2, Minimize2, Minus, MoreHorizontal, Paperclip, Send, Trash2, X } from "lucide-react";
import { useStore } from "../lib/store";
import { api, pickFiles } from "../lib/api";
import type { Address } from "../lib/types";
import { accountColor, displayName, formatAddress } from "../lib/format";
import { spring } from "../lib/motion";
import { growFrom, reducedMotion, shrinkInto, visibleRect } from "../lib/fly";
import { Button, IconButton, Kbd, cn } from "./ui";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function emailOf(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

export function Composer() {
  const c = useStore((s) => s.composer);
  const update = useStore((s) => s.updateComposer);
  const close = useStore((s) => s.closeComposer);
  const send = useStore((s) => s.sendComposer);
  const accounts = useStore((s) => s.accounts);
  const [showQuote, setShowQuote] = useState(false);
  const [fromOpen, setFromOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const originOf = (mode: string) => visibleRect(document.querySelector(`[data-compose="${mode}"]`));

  // 押したボタン（返信・新規メッセージ）の位置から広がって出てくる
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!c || !el || reducedMotion()) return;
    const origin = originOf(c.mode);
    if (origin) growFrom(el, origin, { duration: 460 });
    else
      el.animate(
        [
          { transform: "translateY(40px) scale(0.96)", opacity: 0 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 360, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.key]);

  // 開いた時のフォーカス：宛先が空なら宛先、それ以外は本文の先頭
  useEffect(() => {
    if (!c) return;
    setShowQuote(false);
    const t = window.setTimeout(() => {
      if (c.to.length === 0) toRef.current?.focus();
      else {
        bodyRef.current?.focus();
        bodyRef.current?.setSelectionRange(0, 0);
      }
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.key]);

  if (!c) return null;
  const account = accounts.find((a) => a.id === c.accountId);
  const title = c.subject || { new: "新規メッセージ", reply: "返信", replyAll: "全員に返信", forward: "転送" }[c.mode];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      update({ minimized: true });
    }
  };

  const discard = () => {
    const hasContent = c.body.trim() || c.subject.trim() || c.attachments.length;
    if (hasContent && !window.confirm("この下書きを破棄しますか？")) return;
    // 出てきたボタンへ吸い込まれて閉じる
    const el = boxRef.current;
    const origin = originOf(c.mode);
    if (el && origin && !c.minimized) shrinkInto(el, origin);
    close();
  };

  return (
      <div
        key={c.key}
        ref={boxRef}
        data-composer
        onKeyDown={onKeyDown}
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden bg-surface shadow-float",
          c.minimized
            ? "bottom-0 right-6 h-11 w-[340px] rounded-t-[16px]"
            : c.expanded
              ? "bottom-[6vh] left-1/2 top-[10vh] w-[min(860px,calc(100vw-64px))] -translate-x-1/2 rounded-[22px]"
              : "bottom-5 right-6 h-[min(600px,calc(100vh-96px))] w-[580px] rounded-[22px]",
        )}
        role="dialog"
        aria-label={title}
      >
        {/* ヘッダー */}
        <div
          className={cn("flex h-11 shrink-0 cursor-default items-center gap-2 pl-4 pr-2", !c.minimized && "border-b border-line-subtle")}
          onClick={() => c.minimized && update({ minimized: false })}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{title}</span>
          <IconButton size="sm" label={c.minimized ? "元に戻す" : "最小化"} shortcut="Esc" onClick={(e) => { e.stopPropagation(); update({ minimized: !c.minimized }); }}>
            <Minus />
          </IconButton>
          {!c.minimized && (
            <IconButton size="sm" label={c.expanded ? "小さくする" : "大きくする"} onClick={() => update({ expanded: !c.expanded })}>
              {c.expanded ? <Minimize2 /> : <Maximize2 />}
            </IconButton>
          )}
          <IconButton size="sm" label="閉じる" onClick={(e) => { e.stopPropagation(); discard(); }}>
            <X />
          </IconButton>
        </div>

        {!c.minimized && (
          <>
            <div className="shrink-0 px-4">
              {accounts.length > 1 && (
                <Row label="差出人">
                  <div className="relative">
                    <button
                      onClick={() => setFromOpen(!fromOpen)}
                      className="flex h-7 cursor-default items-center gap-2 rounded-md px-1.5 text-[13px] text-fg hover:bg-pill"
                    >
                      <span className="size-1.5 rounded-full" style={{ background: accountColor(account) }} />
                      {account?.name ? `${account.name} <${account.email}>` : account?.email}
                      <ChevronDown className="size-3.5 text-fg-3" />
                    </button>
                    <AnimatePresence>
                      {fromOpen && (
                        <motion.ul
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={spring.snappy}
                          style={{ transformOrigin: "top left" }}
                          className="absolute left-0 top-8 z-10 min-w-[260px] rounded-xl border border-line bg-surface p-1 shadow-float"
                        >
                          {accounts.map((a) => (
                            <li key={a.id}>
                              <button
                                onClick={() => {
                                  update({ accountId: a.id });
                                  setFromOpen(false);
                                }}
                                className={cn("flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-pill", a.id === c.accountId ? "text-fg" : "text-fg-2")}
                              >
                                <span className="size-1.5 rounded-full" style={{ background: accountColor(a) }} />
                                {a.email}
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                </Row>
              )}
              <Row label="宛先" trailing={!c.showCc && (
                <button onClick={() => update({ showCc: true })} className="cursor-default rounded px-1.5 py-0.5 text-xs text-fg-3 hover:bg-pill hover:text-fg">
                  CC / BCC
                </button>
              )}>
                <RecipientField inputRef={toRef} value={c.to} onChange={(to) => update({ to })} />
              </Row>
              {c.showCc && (
                <>
                  <Row label="CC">
                    <RecipientField value={c.cc} onChange={(cc) => update({ cc })} />
                  </Row>
                  <Row label="BCC">
                    <RecipientField value={c.bcc} onChange={(bcc) => update({ bcc })} />
                  </Row>
                </>
              )}
              <Row label="件名">
                <input
                  value={c.subject}
                  onChange={(e) => update({ subject: e.target.value })}
                  className="h-9 w-full bg-transparent text-[13.5px] font-medium text-fg placeholder:text-fg-4 focus:outline-none"
                  placeholder="件名"
                />
              </Row>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
              <textarea
                ref={bodyRef}
                value={c.body}
                onChange={(e) => update({ body: e.target.value })}
                placeholder="本文を入力"
                className="min-h-[180px] w-full resize-none bg-transparent text-[14px] leading-[1.8] text-fg placeholder:text-fg-4 focus:outline-none"
                style={{ height: Math.max(180, (c.body.split("\n").length + 1) * 25) }}
              />
              {c.quoted && (
                <div className="pb-2">
                  <button
                    onClick={() => setShowQuote(!showQuote)}
                    className="flex h-5 cursor-default items-center rounded-full border border-line bg-surface-raised px-2 text-fg-3 hover:border-line-hover hover:text-fg"
                    aria-label={showQuote ? "引用を隠す" : "引用を表示"}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {showQuote && (
                    <pre className="selectable mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 font-sans text-[13px] leading-[1.7] text-fg-3">{c.quoted}</pre>
                  )}
                </div>
              )}
              {c.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pb-2 pt-1">
                  {c.attachments.map((p) => (
                    <span key={p} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-lg border border-line bg-surface-raised py-1 pl-2.5 pr-1 text-xs text-fg-2">
                      <Paperclip className="size-3 shrink-0 text-fg-3" />
                      <span className="truncate">{p.split(/[\\/]/).pop()}</span>
                      <button
                        onClick={() => update({ attachments: c.attachments.filter((x) => x !== p) })}
                        className="grid size-5 cursor-default place-items-center rounded text-fg-3 hover:bg-pill hover:text-fg"
                        aria-label="添付を外す"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1 border-t border-line-subtle px-3 py-2.5">
              <Button variant="primary" icon={<Send className="size-3.5" />} onClick={send}>
                送信
              </Button>
              <span className="ml-1 flex items-center gap-1 text-[11px] text-fg-4">
                <Kbd>Ctrl</Kbd>
                <Kbd>Enter</Kbd>
              </span>
              <div className="flex-1" />
              <IconButton
                label="ファイルを添付"
                side="top"
                onClick={async () => {
                  const files = await pickFiles();
                  if (files.length) update({ attachments: [...new Set([...c.attachments, ...files])] });
                }}
              >
                <Paperclip />
              </IconButton>
              <IconButton label="下書きを破棄" side="top" onClick={discard}>
                <Trash2 />
              </IconButton>
            </div>
          </>
        )}
      </div>
  );
}

function Row({ label, children, trailing }: { label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-line-subtle">
      <span className="w-12 shrink-0 text-[13px] text-fg-3">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
      {trailing}
    </div>
  );
}

function RecipientField({
  value,
  onChange,
  inputRef,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const [suggest, setSuggest] = useState<Address[]>([]);
  const [hi, setHi] = useState(0);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 1) {
      setSuggest([]);
      return;
    }
    const t = window.setTimeout(() => {
      api.searchContacts(q).then((r) => {
        setSuggest(r.filter((a) => !value.some((v) => emailOf(v).toLowerCase() === a.email.toLowerCase())));
        setHi(0);
      }).catch(() => setSuggest([]));
    }, 90);
    return () => window.clearTimeout(t);
  }, [text, value]);

  const commit = (raw: string) => {
    const parts = raw.split(/[,;、，\n]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setText("");
    setSuggest([]);
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1 py-1.5">
      {value.map((v) => {
        const valid = EMAIL_RE.test(emailOf(v));
        const name = v.includes("<") ? v.split("<")[0].trim().replace(/^"|"$/g, "") : "";
        return (
          <motion.span
            key={v}
            layout
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring.snappy}
            title={v}
            className={cn(
              "inline-flex h-6 max-w-[240px] items-center gap-1 rounded-md border pl-2 pr-0.5 text-[12.5px]",
              valid ? "border-line bg-surface-raised text-fg" : "border-danger/50 bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] text-danger",
            )}
          >
            <span className="truncate">{name ? displayName(name, emailOf(v)) : emailOf(v)}</span>
            <button
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="grid size-[18px] cursor-default place-items-center rounded text-fg-3 hover:bg-pill hover:text-fg"
              aria-label={`${v} を削除`}
            >
              <X className="size-3" />
            </button>
          </motion.span>
        );
      })}
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;、，]$/.test(v)) commit(v);
          else setText(v);
        }}
        onPaste={(e) => {
          const t = e.clipboardData.getData("text");
          if (/[,;\n、]/.test(t)) {
            e.preventDefault();
            commit(t);
          }
        }}
        onKeyDown={(e) => {
          if (suggest.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setHi((h) => (h + (e.key === "ArrowDown" ? 1 : -1) + suggest.length) % suggest.length);
          } else if ((e.key === "Enter" || e.key === "Tab") && (suggest.length || text.trim())) {
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            if (suggest.length) commit(formatAddress(suggest[hi]));
            else commit(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && commit(text)}
        className="h-6 min-w-[120px] flex-1 bg-transparent text-[13px] text-fg placeholder:text-fg-4 focus:outline-none"
        placeholder={value.length ? "" : "名前またはメールアドレス"}
        spellCheck={false}
      />
      <AnimatePresence>
        {suggest.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={spring.snappy}
            style={{ transformOrigin: "top left" }}
            className="absolute left-0 top-full z-20 mt-1 w-[340px] rounded-xl border border-line bg-surface p-1 shadow-float"
          >
            {suggest.map((a, i) => (
              <li key={a.email}>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(formatAddress(a));
                  }}
                  onMouseEnter={() => setHi(i)}
                  className={cn("relative flex w-full cursor-default flex-col rounded-lg px-2.5 py-1.5 text-left", i === hi && "bg-pill-active")}
                >
                  <span className="truncate text-[13px] text-fg">{displayName(a.name, a.email)}</span>
                  <span className="truncate text-xs text-fg-3">{a.email}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
