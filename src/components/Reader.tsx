import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
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
  BellOff,
} from "lucide-react";
import { useStore } from "../lib/store";
import { api, openExternal, pickSavePath } from "../lib/api";
import type { AttachmentInfo, MessageDetail } from "../lib/types";
import { accountColor, displayName, fileSize, formatAddress, fullDate, listDate, providerLabel } from "../lib/format";
import { spring } from "../lib/motion";
import { Avatar, Button, IconButton, Spinner, cn } from "./ui";
import { BlockedBanner, HtmlFrame, TextBody } from "./EmailBody";

export function Reader() {
  const thread = useStore((s) => s.thread);
  const selectedId = useStore((s) => s.selectedId);
  const loading = useStore((s) => s.threadLoading);
  const error = useStore((s) => s.threadError);
  const accounts = useStore((s) => s.accounts);
  const messages = useStore((s) => s.messages);

  if (selectedId == null) return <ReaderEmpty />;

  const current = thread?.find((m) => m.id === selectedId) ?? thread?.[thread.length - 1];
  const summary = messages.find((m) => m.id === selectedId);
  const account = accounts.find((a) => a.id === (current?.accountId ?? summary?.accountId));

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_0%,var(--ambient),transparent_70%)]" />
      <Toolbar current={current} />
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={selectedId}
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={spring.gentle}
            className="relative mx-auto w-full max-w-[880px] px-10 pb-28 pt-4"
          >
            <h2 className="selectable text-[27px] font-bold leading-[1.45] text-fg">
              {current?.subject || summary?.subject || "(件名なし)"}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs text-fg-3">
              {account && (
                <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-pill px-2.5">
                  <span className="size-1.5 rounded-full" style={{ background: accountColor(account) }} />
                  {providerLabel(account.provider)}　{account.email}
                </span>
              )}
              {thread && thread.length > 1 && <span>{thread.length}件のメッセージ</span>}
            </div>

            <div className="mt-8 space-y-3">
              {error ? (
                <div className="rounded-xl border border-line bg-surface p-5 text-sm">
                  <p className="font-medium text-fg">本文を読み込めませんでした</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-3">{error}</p>
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
                    defaultOpen={i === thread.length - 1 || !m.seen || m.id === selectedId}
                    isLast={i === thread.length - 1}
                  />
                ))
              )}
            </div>

            {current && !error && <QuickReply m={current} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function Toolbar({ current }: { current?: MessageDetail }) {
  const triage = useStore((s) => s.triage);
  const openComposer = useStore((s) => s.openComposer);
  const moveSelection = useStore((s) => s.moveSelection);
  const thread = useStore((s) => s.thread);
  const role = current?.mailboxRole;
  const inArchive = role === "archive" || role === "all" || role === "trash" || role === "junk";
  const flagged = thread?.some((m) => m.flagged);

  return (
    <div className="relative z-10 flex h-[56px] shrink-0 items-center gap-0.5 px-5">
      {inArchive ? (
        <IconButton label="受信トレイに戻す" shortcut="Shift I" onClick={() => triage("inbox")}>
          <ArchiveRestore />
        </IconButton>
      ) : (
        <IconButton label="アーカイブ" shortcut="E" onClick={() => triage("archive")}>
          <Archive />
        </IconButton>
      )}
      <IconButton label={role === "trash" ? "完全に削除" : "削除"} shortcut="#" onClick={() => triage("trash")}>
        <Trash2 />
      </IconButton>
      <IconButton label="迷惑メール" shortcut="!" onClick={() => triage("junk")}>
        <ShieldAlert />
      </IconButton>
      <span className="mx-1.5 h-5 w-px bg-line-subtle" />
      <IconButton label="未読にする" shortcut="U" onClick={() => triage("unread")}>
        <Mail />
      </IconButton>
      <IconButton label={flagged ? "スターを外す" : "スターを付ける"} shortcut="S" onClick={() => triage(flagged ? "unflag" : "flag")}>
        <Star className={cn(flagged && "fill-star text-star")} />
      </IconButton>
      <span className="mx-1.5 h-5 w-px bg-line-subtle" />
      <IconButton label="返信" shortcut="R" disabled={!current} onClick={() => current && openComposer("reply", current)}>
        <Reply />
      </IconButton>
      <IconButton label="全員に返信" shortcut="A" disabled={!current} onClick={() => current && openComposer("replyAll", current)}>
        <ReplyAll />
      </IconButton>
      <IconButton label="転送" shortcut="F" disabled={!current} onClick={() => current && openComposer("forward", current)}>
        <Forward />
      </IconButton>
      <div className="flex-1" />
      <IconButton label="前のメール" shortcut="K" onClick={() => moveSelection(-1)}>
        <ChevronUp />
      </IconButton>
      <IconButton label="次のメール" shortcut="J" onClick={() => moveSelection(1)}>
        <ChevronDown />
      </IconButton>
    </div>
  );
}

function ThreadMessage({ m, defaultOpen, isLast }: { m: MessageDetail; defaultOpen: boolean; isLast: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [details, setDetails] = useState(false);
  const [allowRemote, setAllowRemote] = useState(false);
  const [blocked, setBlocked] = useState(0);
  const accounts = useStore((s) => s.accounts);
  const openComposer = useStore((s) => s.openComposer);
  const me = accounts.some((a) => a.email.toLowerCase() === m.fromAddr.toLowerCase());

  useEffect(() => {
    if (!m.html) return;
    api.isTrusted(m.fromAddr).then((t) => t && setAllowRemote(true)).catch(() => undefined);
  }, [m.fromAddr, m.html]);

  const onBlocked = useCallback((n: number) => setBlocked(n), []);
  const attachments = m.attachments.filter((a) => !a.inline);
  const unsubscribe = m.listUnsubscribe.match(/<(https?:[^>]+)>/)?.[1];

  return (
    <motion.article
      layout="position"
      transition={spring.gentle}
      className={cn(
        "overflow-hidden rounded-[18px] border transition-[border-color,background] duration-300",
        open ? "border-line bg-surface shadow-card" : "border-line-subtle bg-pill hover:border-line hover:bg-pill-active",
      )}
    >
      <header
        onClick={() => !isLast || !open ? setOpen(!open) : undefined}
        className={cn("flex items-start gap-3.5 px-6 py-5", (!isLast || !open) && "cursor-default")}
      >
        <Avatar name={m.fromName} email={m.fromAddr} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[14.5px] font-bold text-fg">
              {me ? "自分" : displayName(m.fromName, m.fromAddr)}
            </span>
            {open && <span className="selectable truncate text-xs text-fg-3">{m.fromAddr}</span>}
            <span className="ml-auto shrink-0 text-xs text-fg-3 tabular" title={fullDate(m.date)}>
              {open ? fullDate(m.date) : listDate(m.date)}
            </span>
          </div>
          {open ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDetails(!details);
              }}
              className="mt-0.5 flex max-w-full cursor-default items-center gap-1 text-left text-xs text-fg-3 hover:text-fg-2"
            >
              <span className="truncate">宛先: {m.to.map((a) => displayName(a.name, a.email)).join(", ") || "(なし)"}{m.cc.length ? `、CC: ${m.cc.map((a) => displayName(a.name, a.email)).join(", ")}` : ""}</span>
              <motion.span animate={{ rotate: details ? 180 : 0 }} transition={spring.snappy}>
                <ChevronDown className="size-3" />
              </motion.span>
            </button>
          ) : (
            <p className="mt-0.5 truncate text-[13px] text-fg-3">{m.snippet}</p>
          )}
          <AnimatePresence initial={false}>
            {open && details && (
              <motion.dl
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={spring.gentle}
                className="selectable grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 overflow-hidden pt-2 text-xs"
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
                <dt className="text-fg-3">日時</dt>
                <dd className="text-fg-2">{fullDate(m.date)}</dd>
              </motion.dl>
            )}
          </AnimatePresence>
        </div>
      </header>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.gentle}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6">
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
                  {/* HTML メールは「紙」の上に表示する：送り手の意図どおりの白背景で */}
                  <div className="overflow-hidden rounded-[12px] bg-white shadow-[0_0_0_1px_var(--paper-edge),0_2px_4px_rgba(0,0,0,0.2),0_30px_60px_-30px_rgba(0,0,0,0.85)]">
                    <HtmlFrame html={m.html} allowRemote={allowRemote} onBlocked={onBlocked} />
                  </div>
                </>
              ) : (
                <TextBody text={m.text || m.snippet} />
              )}

              {attachments.length > 0 && <Attachments m={m} items={attachments} />}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" icon={<Reply className="size-3.5" />} onClick={() => openComposer("reply", m)}>
                  返信
                </Button>
                {m.to.length + m.cc.length > 1 && (
                  <Button size="sm" variant="outline" icon={<ReplyAll className="size-3.5" />} onClick={() => openComposer("replyAll", m)}>
                    全員に返信
                  </Button>
                )}
                <Button size="sm" variant="outline" icon={<Forward className="size-3.5" />} onClick={() => openComposer("forward", m)}>
                  転送
                </Button>
                {unsubscribe && (
                  <Button size="sm" variant="ghost" className="ml-auto" icon={<BellOff className="size-3.5" />} onClick={() => openExternal(unsubscribe)}>
                    配信を停止
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
    <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
      {items.map((a) => (
        <div
          key={a.index}
          onClick={() => run(a.index, () => api.openAttachment(m.id, a.index))}
          className="group flex cursor-default items-center gap-3 rounded-[10px] border border-line bg-surface-raised p-2.5 transition-colors hover:border-line-hover"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-subtle bg-surface text-fg-2 [&>svg]:size-4">
            {busy === a.index ? <Spinner /> : attachmentIcon(a)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-fg" title={a.name}>
              {a.name}
            </span>
            <span className="block text-[11px] text-fg-3 tabular">{fileSize(a.size)}</span>
          </span>
          <span onClick={(e) => e.stopPropagation()} className="opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton
              size="sm"
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
        </div>
      ))}
    </div>
  );
}

function QuickReply({ m }: { m: MessageDetail }) {
  const openComposer = useStore((s) => s.openComposer);
  const multi = m.to.length + m.cc.length > 1;
  return (
    <button
      onClick={() => openComposer(multi ? "replyAll" : "reply", m)}
      className="mt-4 flex h-12 w-full cursor-text items-center gap-3 rounded-[14px] border border-line-subtle bg-surface-raised px-4 text-left text-[13px] text-fg-3 transition-colors hover:border-line hover:text-fg-2"
    >
      <Reply className="size-4" />
      <span className="flex-1">{displayName(m.fromName, m.fromAddr)} さんに返信…</span>
      <span className="text-xs text-fg-4">R</span>
    </button>
  );
}

function ReaderSkeleton() {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-5">
      <div className="flex gap-3">
        <div className="skeleton size-9 rounded-full" />
        <div className="flex-1">
          <div className="skeleton h-3.5 w-1/3" />
          <div className="skeleton mt-2 h-3 w-1/4 opacity-60" />
        </div>
      </div>
      <div className="mt-6 space-y-2.5">
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
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.gentle} className="max-w-[340px] text-center">
        <EnvelopeArt />
        {accounts.length === 0 ? (
          <>
            <p className="mt-6 text-[15px] font-medium text-fg">アカウントを追加して始めましょう</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">Gmail と iCloud メールを同じ受信トレイで読めます。</p>
            <Button variant="primary" className="mt-5" onClick={() => setDialog("addAccount")}>
              アカウントを追加
            </Button>
          </>
        ) : (
          <>
            <p className="mt-6 text-[15px] font-medium text-fg">{unread > 0 ? `未読が ${unread}件あります` : "すべて読み終わりました"}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">
              メールを選ぶとここに表示されます。<span className="whitespace-nowrap">J / K で移動、E でアーカイブ。</span>
            </p>
            <button onClick={() => setDialog("shortcuts")} className="mt-3 cursor-default text-xs text-fg-3 underline decoration-line-hover underline-offset-4 hover:text-fg">
              キーボードショートカット一覧
            </button>
          </>
        )}
      </motion.div>
    </section>
  );
}

/** 何も選んでいない時の、紙が封筒から少しのぞくイラスト */
function EnvelopeArt() {
  return (
    <svg viewBox="0 0 160 112" className="mx-auto h-[96px] w-auto" aria-hidden>
      <motion.g initial={{ y: 12 }} animate={{ y: 0 }} transition={{ ...spring.gentle, delay: 0.1 }}>
        <rect x="40" y="10" width="80" height="64" rx="6" fill="var(--paper)" stroke="var(--border)" />
        <rect x="52" y="24" width="44" height="4" rx="2" fill="#d4d4d8" />
        <rect x="52" y="34" width="56" height="4" rx="2" fill="#e4e4e7" />
        <rect x="52" y="44" width="36" height="4" rx="2" fill="#e4e4e7" />
      </motion.g>
      <path d="M24 46 L80 82 L136 46 V98 a6 6 0 0 1 -6 6 H30 a6 6 0 0 1 -6 -6 Z" fill="var(--surface)" stroke="var(--border)" />
      <path d="M24 98 L66 70 M136 98 L94 70" stroke="var(--border)" fill="none" />
      <circle cx="132" cy="44" r="6" fill="var(--indicator)" stroke="var(--bg)" strokeWidth="3" />
    </svg>
  );
}
