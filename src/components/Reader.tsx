import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { EASE_OUT, reducedMotion, takeOpen } from "../lib/fly";
import { Avatar, Button, IconButton, Spinner, cn } from "./ui";
import { BlockedBanner, HtmlFrame, TextBody } from "./EmailBody";
import { CodeBanner } from "./Codes";
import { ParcelBanner } from "./Parcels";

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

  // j/k で次へ進んだら下から、前へ戻ったら上から本文が入ってくる
  const prevSel = useRef<number | null>(null);
  const dir = useRef(0);
  if (prevSel.current !== selectedId) {
    const a = messages.findIndex((m) => m.id === prevSel.current);
    const b = messages.findIndex((m) => m.id === selectedId);
    dir.current = a < 0 || b < 0 ? 0 : b > a ? 1 : -1;
    prevSel.current = selectedId;
  }

  // 一覧で押した行の件名が、そのまま本文の見出しへ移動して大きくなる
  const titleRef = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (selectedId == null || !el) return;
    const p = takeOpen(selectedId);
    if (!p || reducedMotion()) return;
    // 本文側は横にはみ出すと切れるので、画面の一番上に写しを置いて動かす
    const to = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const g = el.cloneNode(true) as HTMLElement;
    Object.assign(g.style, {
      position: "fixed",
      left: `${to.left}px`,
      top: `${to.top}px`,
      width: `${to.width}px`,
      margin: "0",
      zIndex: "60",
      pointerEvents: "none",
      transformOrigin: "0 0",
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
    });
    document.body.appendChild(g);
    el.style.visibility = "hidden";
    const s = p.fontSize / (parseFloat(cs.fontSize) || 28);
    const anim = g.animate(
      [
        { transform: `translate(${p.rect.left - to.left}px, ${p.rect.top - to.top}px) scale(${s})`, opacity: 0.7 },
        { opacity: 1, offset: 0.4 },
        { transform: "none", opacity: 1 },
      ],
      { duration: 480, easing: EASE_OUT },
    );
    const done = () => {
      g.remove();
      el.style.visibility = "";
    };
    anim.finished.then(done, done);
    return () => {
      anim.cancel();
      done();
    };
  }, [selectedId]);

  if (selectedId == null) return <ReaderEmpty />;

  const current = thread?.find((m) => m.id === selectedId) ?? thread?.[thread.length - 1];
  const summary = messages.find((m) => m.id === selectedId);
  const account = accounts.find((a) => a.id === (current?.accountId ?? summary?.accountId));
  const subject = current?.subject || summary?.subject || "(件名なし)";

  return (
    <section className="@container relative flex min-w-0 flex-1 flex-col">
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
          maskImage: "linear-gradient(to bottom, black 45%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black 45%, transparent)",
        }}
      />

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
          <div
            key={selectedId}
            className="relative mx-auto w-full max-w-[860px] px-5 pb-16 pt-[68px] @min-[640px]:px-10 @min-[640px]:pt-[72px]"
          >
            <h2 ref={titleRef} className="selectable origin-top-left text-[22px] font-bold leading-[1.4] text-fg @min-[640px]:text-[28px]">{subject}</h2>
            <motion.div
              initial={{ opacity: 0, y: dir.current * 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring.smooth, opacity: { duration: 0.18, delay: 0.04 } }}
            >
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
          </div>
      </div>

    </section>
  );
}

/* ------------------------------------------------------------------ */
/* ツールバー：役割ごとにまとめたガラスのカプセル                         */
/* ------------------------------------------------------------------ */

function Capsule({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("capsule flex items-center gap-0.5 rounded-full p-[3px]", className)}>{children}</div>;
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
    <div className="absolute inset-x-0 top-0 z-20 flex h-[60px] items-center gap-2 px-3 @min-[640px]:px-4">
      <Capsule className="hidden @min-[520px]:flex">
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
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
        <span className="hidden @min-[700px]:contents">
          <IconButton className={btn} label="迷惑メール" shortcut="!" onClick={() => triage("junk")}>
            <ShieldAlert />
          </IconButton>
        </span>
      </Capsule>
      <Capsule className="hidden @min-[600px]:flex">
        <IconButton className={btn} label="未読にする" shortcut="U" onClick={() => triage("unread")}>
          <Mail />
        </IconButton>
        <IconButton className={btn} label={flagged ? "スターを外す" : "スターを付ける"} shortcut="S" onClick={() => triage(flagged ? "unflag" : "flag")}>
          <Star className={cn("size-4", flagged && "fill-star text-star")} />
        </IconButton>
      </Capsule>
      <Capsule>
        <IconButton className={btn} label="返信" shortcut="R" data-compose="reply" disabled={!current} onClick={() => current && openComposer("reply", current)}>
          <Reply />
        </IconButton>
        <IconButton className={btn} label="全員に返信" shortcut="A" data-compose="replyAll" disabled={!current} onClick={() => current && openComposer("replyAll", current)}>
          <ReplyAll />
        </IconButton>
        <IconButton className={btn} label="転送" shortcut="F" data-compose="forward" disabled={!current} onClick={() => current && openComposer("forward", current)}>
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
  const [open, setOpenState] = useState(defaultOpen);
  const [details, setDetails] = useState(false);
  // 開閉した時だけ、前の高さから今の高さへ伸び縮みさせる（下のメールが押し下げられる）
  const boxRef = useRef<HTMLElement>(null);
  const fromH = useRef<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const setOpen = (v: boolean) => {
    fromH.current = boxRef.current?.offsetHeight ?? null;
    setAnimating(true);
    setOpenState(v);
  };
  const grow = fromH.current != null && !reducedMotion();
  const sizeProps = {
    initial: grow ? { height: fromH.current! } : false,
    animate: { height: "auto" },
    transition: spring.gentle,
    onAnimationComplete: () => {
      fromH.current = null;
      setAnimating(false);
    },
  } as const;
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
        ref={boxRef as React.RefObject<HTMLButtonElement>}
        {...sizeProps}
        onClick={() => setOpen(true)}
        className={cn(
          "group relative flex w-full cursor-default items-center gap-3 overflow-hidden rounded-[12px] px-3 py-3 text-left transition-colors hover:bg-pill",
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
    <motion.article
      ref={boxRef}
      {...sizeProps}
      className={cn("relative", !first && "mt-2 pt-6", animating && "overflow-hidden")}
    >
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
        <CodeBanner code={m.otpCode} link={m.otpLink} />
        <ParcelBanner p={m.parcel} />
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
        className="max-w-[340px] text-center"
      >
        {accounts.length === 0 ? (
          <>
            <p className="text-[15px] font-medium text-fg-3">アカウントがありません</p>
            <Button variant="primary" className="mt-5" onClick={() => setDialog("addAccount")}>
              アカウントを追加
            </Button>
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium text-fg-3">メッセージが選択されていません</p>
            {unread > 0 && <p className="mt-1 text-[13px] text-fg-4">未読 {unread} 件</p>}
          </>
        )}
      </motion.div>
    </section>
  );
}
