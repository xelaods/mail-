import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  BellOff,
  ChevronDown,
  ChevronUp,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  Forward,
  Mail,
  Reply,
  ReplyAll,
  ShieldAlert,
  Star,
  Trash2,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api, openExternal, pickSavePath } from "../lib/api";
import type { AttachmentInfo, MessageDetail } from "../lib/types";
import { accountColor, displayName, fileSize, formatAddress, fullDate, listDate, providerLabel } from "../lib/format";
import { spring } from "../lib/motion";
import { Avatar, Button, IconButton, Spinner, Tooltip, cn } from "./ui";
import { BlockedBanner, HtmlFrame, TextBody } from "./EmailBody";

export function Reader() {
  const thread = useStore((s) => s.thread);
  const selectedId = useStore((s) => s.selectedId);
  const loading = useStore((s) => s.threadLoading);
  const error = useStore((s) => s.threadError);
  const accounts = useStore((s) => s.accounts);
  const messages = useStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll({ container: scrollRef });
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 8));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  if (selectedId == null) return <ReaderEmpty />;

  const current = thread?.find((m) => m.id === selectedId) ?? thread?.[thread.length - 1];
  const summary = messages.find((m) => m.id === selectedId);
  const account = accounts.find((a) => a.id === (current?.accountId ?? summary?.accountId));
  const subject = current?.subject || summary?.subject || "(件名なし)";

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      <Toolbar current={current} scrolled={scrolled} subject={subject} />

      {/* スクロールの縁：ツールバーの下で本文が柔らかくぼけて消える */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-[76px] transition-opacity duration-300",
          scrolled ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: "linear-gradient(to bottom, var(--content) 30%, color-mix(in srgb, var(--content) 60%, transparent) 70%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          maskImage: "linear-gradient(to bottom, black 45%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 45%, transparent)",
        }}
      />

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedId}
            initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={spring.gentle}
            className="relative mx-auto w-full max-w-[860px] px-10 pb-32 pt-[72px]"
          >
            <h2 className="selectable text-[28px] font-bold leading-[1.4] text-fg">{subject}</h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[12.5px] text-fg-3">
              {account && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: accountColor(account) }} />
                  {providerLabel(account.provider)}
                </span>
              )}
              {thread && thread.length > 1 && <span>{thread.length}件のメッセージ</span>}
            </div>

            <div className="mt-7">
              {error ? (
                <div className="rounded-[14px] bg-pill p-5 text-sm">
                  <p className="font-bold text-fg">本文を読み込めませんでした</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-fg-3">{error}</p>
                  <Button className="mt-3" size="sm" onClick={() => useStore.getState().select(selectedId)}>
                    もう一度読み込む
                  </Button>
                </div>
              ) : loading && !thread ? (
                <ReaderSkeleton />
              ) : (
                thread?.map((m, i) => (
                  <ThreadMessage
                    key={m.id}
                    m={m}
                    first={i === 0}
                    defaultOpen={i === thread.length - 1 || !m.seen || m.id === selectedId}
                    isLast={i === thread.length - 1}
                  />
                ))
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {current && !error && <QuickReply m={current} />}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ツールバー：役割ごとにまとめたガラスのカプセル                         */
/* ------------------------------------------------------------------ */

function Capsule({ children }: { children: ReactNode }) {
  return <div className="capsule flex items-center gap-0.5 rounded-full p-[3px]">{children}</div>;
}

function Toolbar({ current, scrolled, subject }: { current?: MessageDetail; scrolled: boolean; subject: string }) {
  const triage = useStore((s) => s.triage);
  const openComposer = useStore((s) => s.openComposer);
  const moveSelection = useStore((s) => s.moveSelection);
  const thread = useStore((s) => s.thread);
  const role = current?.mailboxRole;
  const inArchive = role === "archive" || role === "all" || role === "trash" || role === "junk";
  const flagged = thread?.some((m) => m.flagged);
  const btn = "rounded-full";

  return (
    <div className="absolute inset-x-0 top-0 z-20 flex h-[60px] items-center gap-2 px-4">
      <Capsule>
        <IconButton className={btn} label="前のメール" shortcut="K" onClick={() => moveSelection(-1)}>
          <ChevronUp />
        </IconButton>
        <IconButton className={btn} label="次のメール" shortcut="J" onClick={() => moveSelection(1)}>
          <ChevronDown />
        </IconButton>
      </Capsule>

      {/* スクロールすると件名がツールバーに上がってくる */}
      <div className="min-w-0 flex-1 px-2">
        <AnimatePresence>
          {scrolled && (
            <motion.p
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: 6, filter: "blur(4px)" }}
              transition={spring.snappy}
              className="truncate text-center text-[13.5px] font-bold text-fg"
            >
              {subject}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <Capsule>
        {inArchive ? (
          <IconButton className={btn} label="受信トレイに戻す" shortcut="Shift I" onClick={() => triage("inbox")}>
            <ArchiveRestore />
          </IconButton>
        ) : (
          <IconButton className={btn} label="アーカイブ" shortcut="E" onClick={() => triage("archive")}>
            <Archive />
          </IconButton>
        )}
        <IconButton className={btn} label={role === "trash" ? "完全に削除" : "削除"} shortcut="#" onClick={() => triage("trash")}>
          <Trash2 />
        </IconButton>
        <IconButton className={btn} label="迷惑メール" shortcut="!" onClick={() => triage("junk")}>
          <ShieldAlert />
        </IconButton>
      </Capsule>
      <Capsule>
        <IconButton className={btn} label="未読にする" shortcut="U" onClick={() => triage("unread")}>
          <Mail />
        </IconButton>
        <IconButton className={btn} label={flagged ? "スターを外す" : "スターを付ける"} shortcut="S" onClick={() => triage(flagged ? "unflag" : "flag")}>
          <motion.span key={String(flagged)} initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring.responsive} className="grid">
            <Star className={cn("size-4", flagged && "fill-star text-star")} />
          </motion.span>
        </IconButton>
      </Capsule>
      <Capsule>
        <IconButton className={btn} label="返信" shortcut="R" disabled={!current} onClick={() => current && openComposer("reply", current)}>
          <Reply />
        </IconButton>
        <IconButton className={btn} label="全員に返信" shortcut="A" disabled={!current} onClick={() => current && openComposer("replyAll", current)}>
          <ReplyAll />
        </IconButton>
        <IconButton className={btn} label="転送" shortcut="F" disabled={!current} onClick={() => current && openComposer("forward", current)}>
          <Forward />
        </IconButton>
      </Capsule>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* スレッドの1通：枠を持たず、髪の毛ほどの線で区切る                       */
/* ------------------------------------------------------------------ */

function ThreadMessage({ m, first, defaultOpen, isLast }: { m: MessageDetail; first: boolean; defaultOpen: boolean; isLast: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [details, setDetails] = useState(false);
  const [allowRemote, setAllowRemote] = useState(false);
  const [blocked, setBlocked] = useState(0);
  const accounts = useStore((s) => s.accounts);
  const me = accounts.some((a) => a.email.toLowerCase() === m.fromAddr.toLowerCase());

  useEffect(() => {
    if (!m.html) return;
    api.isTrusted(m.fromAddr).then((t) => t && setAllowRemote(true)).catch(() => undefined);
  }, [m.fromAddr, m.html]);

  const onBlocked = useCallback((n: number) => setBlocked(n), []);
  const attachments = m.attachments.filter((a) => !a.inline);
  const unsubscribe = m.listUnsubscribe.match(/<(https?:[^>]+)>/)?.[1];
  const name = me ? "自分" : displayName(m.fromName, m.fromAddr);

  if (!open) {
    return (
      <motion.button
        layout="position"
        transition={spring.gentle}
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex w-full cursor-default items-center gap-3 rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-pill",
          !first && "mt-px",
        )}
      >
        <Avatar name={m.fromName} email={m.fromAddr} size={28} />
        <span className="w-[120px] shrink-0 truncate text-[13.5px] font-bold text-fg">{name}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-3">{m.snippet}</span>
        <span className="shrink-0 text-[12px] text-fg-3 tabular">{listDate(m.date)}</span>
        <span className="absolute inset-x-3 -bottom-px h-px bg-line-subtle group-hover:opacity-0" />
      </motion.button>
    );
  }

  return (
    <motion.article layout="position" transition={spring.gentle} className={cn("relative", !first && "mt-2 pt-6")}>
      {!first && <span className="absolute inset-x-0 top-0 h-px bg-line-subtle" />}
      <header
        onClick={() => !isLast && setOpen(false)}
        className={cn("flex items-start gap-3.5", !isLast && "cursor-default")}
      >
        <Avatar name={m.fromName} email={m.fromAddr} size={42} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[15px] font-bold text-fg">{name}</span>
            <span className="selectable truncate text-[12.5px] text-fg-3">{m.fromAddr}</span>
            <span className="ml-auto shrink-0 text-[12.5px] text-fg-3 tabular">{fullDate(m.date)}</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDetails(!details);
            }}
            className="mt-0.5 flex max-w-full cursor-default items-center gap-1 text-left text-[12.5px] text-fg-3 hover:text-fg-2"
          >
            <span className="truncate">
              宛先：{m.to.map((a) => displayName(a.name, a.email)).join("、") || "(なし)"}
              {m.cc.length ? `　CC：${m.cc.map((a) => displayName(a.name, a.email)).join("、")}` : ""}
            </span>
            <motion.span animate={{ rotate: details ? 180 : 0 }} transition={spring.snappy}>
              <ChevronDown className="size-3" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {details && (
              <motion.dl
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={spring.gentle}
                className="selectable grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 overflow-hidden pt-2 text-[12.5px]"
              >
                <dt className="text-fg-3">差出人</dt>
                <dd className="text-fg-2">{formatAddress({ name: m.fromName, email: m.fromAddr })}</dd>
                <dt className="text-fg-3">宛先</dt>
                <dd className="text-fg-2">{m.to.map(formatAddress).join(", ") || "(なし)"}</dd>
                {m.cc.length > 0 && (
                  <>
                    <dt className="text-fg-3">CC</dt>
                    <dd className="text-fg-2">{m.cc.map(formatAddress).join(", ")}</dd>
                  </>
                )}
                {m.replyTo.length > 0 && (
                  <>
                    <dt className="text-fg-3">返信先</dt>
                    <dd className="text-fg-2">{m.replyTo.map(formatAddress).join(", ")}</dd>
                  </>
                )}
              </motion.dl>
            )}
          </AnimatePresence>
        </div>
      </header>

      <div className="mt-6">
        {m.html ? (
          <>
            <BlockedBanner
              count={blocked}
              onShow={() => setAllowRemote(true)}
              onTrust={() => {
                setAllowRemote(true);
                api.setTrusted(m.fromAddr, true).catch(() => undefined);
              }}
            />
            <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_0.5px_var(--paper-edge),0_2px_6px_rgba(0,0,0,0.12),0_30px_60px_-34px_rgba(0,0,0,0.6)]">
              <HtmlFrame html={m.html} allowRemote={allowRemote} onBlocked={onBlocked} />
            </div>
          </>
        ) : (
          <TextBody text={m.text || m.snippet} />
        )}

        {attachments.length > 0 && <Attachments m={m} items={attachments} />}

        {unsubscribe && (
          <button
            onClick={() => openExternal(unsubscribe)}
            className="mt-4 inline-flex cursor-default items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-fg-3 transition-colors hover:bg-pill hover:text-fg"
          >
            <BellOff className="size-3.5" />
            このメールの配信を停止
          </button>
        )}
      </div>
      <div className="h-8" />
    </motion.article>
  );
}

function attachmentIcon(a: AttachmentInfo) {
  if (a.mime.startsWith("image/")) return <FileImage />;
  if (a.mime.includes("pdf") || a.mime.startsWith("text/")) return <FileText />;
  if (a.mime.includes("sheet") || a.mime.includes("excel") || a.name.endsWith(".csv")) return <FileSpreadsheet />;
  return <File />;
}

function Attachments({ m, items }: { m: MessageDetail; items: AttachmentInfo[] }) {
  const [busy, setBusy] = useState<number | null>(null);
  const pushToast = useStore((s) => s.pushToast);
  const run = async (index: number, fn: () => Promise<void>) => {
    setBusy(index);
    try {
      await fn();
    } catch (e) {
      pushToast({ title: "添付ファイルを開けませんでした", description: String(e), tone: "error" });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-6 flex flex-wrap gap-2.5">
      {items.map((a) => (
        <motion.div
          key={a.index}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={spring.snappy}
          onClick={() => run(a.index, () => api.openAttachment(m.id, a.index))}
          className="group flex w-[240px] cursor-default items-center gap-3 rounded-[14px] bg-pill p-2.5 pr-2 transition-colors hover:bg-pill-active"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-content text-blue shadow-subtle [&>svg]:size-[18px]">
            {busy === a.index ? <Spinner /> : attachmentIcon(a)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-fg" title={a.name}>
              {a.name}
            </span>
            <span className="block text-[11.5px] text-fg-3 tabular">{fileSize(a.size)}</span>
          </span>
          <span onClick={(e) => e.stopPropagation()} className="opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton
              size="sm"
              className="rounded-full"
              label="保存"
              onClick={() =>
                run(a.index, async () => {
                  const dest = await pickSavePath(a.name);
                  if (dest) {
                    await api.saveAttachment(m.id, a.index, dest);
                    pushToast({ title: "保存しました", description: dest, tone: "success" });
                  }
                })
              }
            >
              <Download />
            </IconButton>
          </span>
        </motion.div>
      ))}
    </div>
  );
}

/** 画面下に浮かぶ返信のカプセル */
function QuickReply({ m }: { m: MessageDetail }) {
  const openComposer = useStore((s) => s.openComposer);
  const composerOpen = useStore((s) => !!s.composer && !s.composer.minimized);
  const multi = m.to.length + m.cc.length > 1;
  return (
    <AnimatePresence>
      {!composerOpen && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={spring.smooth}
          className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-8"
        >
          <Tooltip label="返信" shortcut="R" side="top">
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              transition={spring.snappy}
              onClick={() => openComposer(multi ? "replyAll" : "reply", m)}
              className="capsule pointer-events-auto flex h-11 w-[min(560px,calc(100vw-760px))] min-w-[300px] cursor-text items-center gap-3 rounded-full px-5 text-left text-[13.5px] text-fg-3"
            >
              <Reply className="size-4 text-blue" />
              <span className="flex-1 truncate">{displayName(m.fromName, m.fromAddr)} さんに返信</span>
            </motion.button>
          </Tooltip>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ReaderSkeleton() {
  return (
    <div>
      <div className="flex gap-3.5">
        <div className="skeleton size-[42px] rounded-full" />
        <div className="flex-1 pt-1">
          <div className="skeleton h-3.5 w-1/3" />
          <div className="skeleton mt-2 h-3 w-1/4 opacity-60" />
        </div>
      </div>
      <div className="mt-8 space-y-3">
        <div className="skeleton h-3 w-full" />
        <div className="skeleton h-3 w-11/12" />
        <div className="skeleton h-3 w-4/5" />
        <div className="skeleton h-3 w-2/3" />
      </div>
    </div>
  );
}

function ReaderEmpty() {
  const unread = useStore((s) => s.mailboxes.filter((m) => m.role === "inbox").reduce((n, m) => n + m.unread, 0));
  const accounts = useStore((s) => s.accounts);
  const setDialog = useStore((s) => s.setDialog);
  return (
    <section className="relative flex min-w-0 flex-1 items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={spring.gentle}
        className="max-w-[340px] text-center"
      >
        <EnvelopeArt />
        {accounts.length === 0 ? (
          <>
            <p className="mt-6 text-[17px] font-bold text-fg">アカウントを追加して始めましょう</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">Gmail と iCloud メールを、ひとつの受信箱で。</p>
            <Button variant="primary" className="mt-5" onClick={() => setDialog("addAccount")}>
              アカウントを追加
            </Button>
          </>
        ) : (
          <>
            <p className="mt-6 text-[17px] font-bold text-fg">{unread > 0 ? `未読が ${unread} 件あります` : "メッセージが選択されていません"}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">
              J と K で移動、E でアーカイブ。
              <br />
              トラックパッドの横スワイプでも整理できます。
            </p>
            <button
              onClick={() => setDialog("shortcuts")}
              className="mt-4 cursor-default rounded-full px-3 py-1 text-[12.5px] font-medium text-blue transition-colors hover:bg-[color-mix(in_srgb,var(--blue)_10%,transparent)]"
            >
              キーボードショートカット
            </button>
          </>
        )}
      </motion.div>
    </section>
  );
}

function EnvelopeArt() {
  return (
    <svg viewBox="0 0 160 112" className="mx-auto h-[96px] w-auto" aria-hidden>
      <motion.g initial={{ y: 14 }} animate={{ y: 0 }} transition={{ ...spring.gentle, delay: 0.1 }}>
        <rect x="40" y="10" width="80" height="64" rx="7" fill="var(--paper)" stroke="var(--border)" />
        <rect x="52" y="24" width="44" height="4" rx="2" fill="#c7c7cc" />
        <rect x="52" y="34" width="56" height="4" rx="2" fill="#e5e5ea" />
        <rect x="52" y="44" width="36" height="4" rx="2" fill="#e5e5ea" />
      </motion.g>
      <path d="M24 46 L80 82 L136 46 V98 a7 7 0 0 1 -7 7 H31 a7 7 0 0 1 -7 -7 Z" fill="var(--surface)" stroke="var(--border)" />
      <path d="M24 98 L66 70 M136 98 L94 70" stroke="var(--border)" fill="none" />
      <circle cx="132" cy="44" r="7" fill="var(--blue)" stroke="var(--content)" strokeWidth="3" />
    </svg>
  );
}
