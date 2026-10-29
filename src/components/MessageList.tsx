import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  ListFilter,
  Mail,
  MailOpen,
  Paperclip,
  SearchX,
  Star,
  Trash2,
  X,
  Inbox,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { Account, MessageSummary, View } from "../lib/types";
import { accountColor, displayName, listDate } from "../lib/format";
import { spring } from "../lib/motion";
import { Avatar, IconButton, RollingNumber, Spinner, Tooltip, cn } from "./ui";
import { CodeButton, CodesList } from "./Codes";

function viewTitle(view: View, accounts: Account[], mailboxName?: string): string {
  if (view.kind === "mailbox") {
    const acc = accounts.find((a) => a.id === view.accountId);
    return mailboxName ?? acc?.email ?? "";
  }
  return {
    inbox: "受信",
    unread: "未読",
    codes: "コード",
    flagged: "スター付き",
    attachments: "添付ファイル",
    sent: "送信済み",
    archive: "アーカイブ",
    trash: "ゴミ箱",
    junk: "迷惑メール",
    drafts: "下書き",
  }[view.role];
}

export function MessageList() {
  const messages = useStore((s) => s.messages);
  const hidden = useStore((s) => s.hidden);
  const leaving = useStore((s) => s.leaving);
  const loading = useStore((s) => s.listLoading);
  const hasMore = useStore((s) => s.hasMore);
  const view = useStore((s) => s.view);
  const search = useStore((s) => s.search);
  const accounts = useStore((s) => s.accounts);
  const mailboxes = useStore((s) => s.mailboxes);
  const selectedId = useStore((s) => s.selectedId);
  const checked = useStore((s) => s.checked);
  const settings = useStore((s) => s.settings);
  const loadMore = useStore((s) => s.loadMore);
  const [unreadOnly, setUnreadOnly] = useState(false);

  useEffect(() => setUnreadOnly(false), [view]);

  const items = useMemo(
    () => messages.filter((m) => !hidden.has(m.id) && (!unreadOnly || !m.seen || m.id === selectedId)),
    [messages, hidden, unreadOnly, selectedId],
  );
  const parentRef = useRef<HTMLDivElement>(null);
  const compact = settings.density === "compact";
  const rowHeight = compact ? 58 : settings.previewLines === 2 ? 104 : 82;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    getItemKey: (i) => items[i].id,
  });

  useEffect(() => {
    if (selectedId == null) return;
    const idx = items.findIndex((m) => m.id === selectedId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedId, items, virtualizer]);

  const vItems = virtualizer.getVirtualItems();
  const last = vItems[vItems.length - 1];
  const loadingMore = useRef(false);
  useEffect(() => {
    if (!last || !hasMore || loadingMore.current) return;
    if (last.index >= items.length - 8) {
      loadingMore.current = true;
      loadMore().finally(() => {
        loadingMore.current = false;
      });
    }
  }, [last, hasMore, items.length, loadMore]);

  const mailboxName =
    view.kind === "mailbox"
      ? (() => {
          const m = mailboxes.find((x) => x.accountId === view.accountId && x.path === view.path);
          if (!m) return undefined;
          const names: Record<string, string> = { inbox: "受信", sent: "送信済み", drafts: "下書き", archive: "アーカイブ", trash: "ゴミ箱", junk: "迷惑メール" };
          if (m.role === "all") return accounts.find((a) => a.id === view.accountId)?.provider === "gmail" ? "すべてのメール" : "アーカイブ";
          return names[m.role] ?? m.name;
        })()
      : undefined;
  const title = search ? "検索結果" : viewTitle(view, accounts, mailboxName);
  const unread = messages.filter((m) => !hidden.has(m.id) && !m.seen).length;
  const subtitle =
    view.kind === "mailbox" && !search ? accounts.find((a) => a.id === view.accountId)?.email : search ? `「${search}」` : undefined;
  const multiAccount = accounts.length > 1 && view.kind === "unified";
  const isSentView = view.kind === "unified" && view.role === "sent";

  return (
    <section className="relative flex w-[392px] shrink-0 flex-col border-r border-line-subtle max-[1280px]:w-[340px] max-[980px]:w-[300px]">
      <header className="flex shrink-0 items-end justify-between gap-3 px-5 pb-3 pt-5">
        <div className="min-w-0">
          <h1 className="truncate text-[26px] font-bold leading-[1.15] text-fg">{title}</h1>
          <p className="mt-1.5 flex items-center gap-1 truncate text-[12.5px] text-fg-3">
            {subtitle && <span className="truncate">{subtitle}　</span>}
            {loading ? (
              "読み込み中"
            ) : view.kind === "unified" && view.role === "codes" && !search ? (
              <>確認コード・認証リンク {items.length} 件</>
            ) : unread > 0 ? (
              <>
                未読 <RollingNumber value={unread} /> 件
              </>
            ) : (
              <>{messages.length === 0 ? "メールはありません" : "すべて既読です"}</>
            )}
          </p>
        </div>
        <Tooltip label={unreadOnly ? "すべて表示" : "未読だけ表示"}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={spring.snappy}
            onClick={() => setUnreadOnly(!unreadOnly)}
            className={cn(
              "grid size-8 cursor-default place-items-center rounded-full transition-colors duration-200",
              unreadOnly ? "bg-blue text-white" : "text-fg-3 hover:bg-pill-active hover:text-fg",
            )}
            aria-pressed={unreadOnly}
            aria-label="未読だけ表示"
          >
            <ListFilter className="size-4" />
          </motion.button>
        </Tooltip>
      </header>

      <div
        ref={parentRef}
        tabIndex={-1}
        className="msglist relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-2 focus:outline-none focus-visible:outline-none"
        role="listbox"
        aria-label={title}
      >
        {view.kind === "unified" && view.role === "codes" && !search ? (
          loading && items.length === 0 ? <ListSkeleton rowHeight={rowHeight} /> : <CodesList items={items} />
        ) : loading && items.length === 0 ? (
          <ListSkeleton rowHeight={rowHeight} />
        ) : items.length === 0 ? (
          <EmptyList searching={!!search} view={view} filtered={unreadOnly} />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {vItems.map((vi) => {
              const m = items[vi.index];
              const acc = multiAccount ? accounts.find((a) => a.id === m.accountId) : undefined;
              return (
                <div
                  key={vi.key}
                  className="vrow"
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <Row
                    m={m}
                    selected={m.id === selectedId}
                    beforeSelected={items[vi.index + 1]?.id === selectedId}
                    checked={checked.has(m.id)}
                    anyChecked={checked.size > 0}
                    compact={compact}
                    lines={settings.previewLines}
                    accountDot={acc ? accountColor(acc) : undefined}
                    isSentView={isSentView}
                    leaving={leaving.get(m.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
        {hasMore && items.length > 0 && (
          <div className="flex h-12 items-center justify-center text-fg-3">
            <Spinner />
          </div>
        )}
      </div>

      <SelectionBar />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 1行：Apple Mail の作法 + 2本指スワイプ                               */
/* ------------------------------------------------------------------ */

const SWIPE_COMMIT = 96;
const SWIPE_MAX = 150;

const Row = memo(function Row({
  m,
  selected,
  beforeSelected,
  checked,
  anyChecked,
  compact,
  lines,
  accountDot,
  isSentView,
  leaving,
}: {
  m: MessageSummary;
  selected: boolean;
  beforeSelected: boolean;
  checked: boolean;
  anyChecked: boolean;
  compact: boolean;
  lines: 1 | 2;
  accountDot?: string;
  isSentView: boolean;
  leaving?: "left" | "right";
}) {
  const select = useStore((s) => s.select);
  const toggleCheck = useStore((s) => s.toggleCheck);
  const triage = useStore((s) => s.triage);
  const unread = !m.seen;
  const [hovered, setHovered] = useState(false);
  const who = isSentView ? m.toPreview || "(宛先なし)" : displayName(m.fromName, m.fromAddr);

  // トラックパッドの横スワイプ：左へ＝アーカイブ、右へ＝既読/未読
  const x = useMotionValue(0);
  const idle = useRef<number>(undefined);
  const committed = useRef(false);
  const leftReveal = useTransform(x, [-SWIPE_MAX, -SWIPE_COMMIT, -16, 0], [1, 1, 0.4, 0]);
  const rightReveal = useTransform(x, [0, 16, SWIPE_COMMIT, SWIPE_MAX], [0, 0.4, 1, 1]);
  const iconScaleL = useTransform(x, [-SWIPE_COMMIT - 10, -SWIPE_COMMIT + 10], [1.15, 0.85]);
  const iconScaleR = useTransform(x, [SWIPE_COMMIT - 10, SWIPE_COMMIT + 10], [0.85, 1.15]);

  const onWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || committed.current) return;
    const next = Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, x.get() - e.deltaX * 0.9));
    x.set(next);
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(() => {
      const v = x.get();
      if (v <= -SWIPE_COMMIT) {
        committed.current = true;
        animate(x, -420, { duration: 0.22, ease: [0.4, 0, 1, 1] });
        triage("archive", [m.id]);
      } else if (v >= SWIPE_COMMIT) {
        animate(x, 0, spring.responsive);
        triage(unread ? "read" : "unread", [m.id]);
      } else {
        animate(x, 0, spring.responsive);
      }
    }, 140);
  };

  useEffect(() => {
    if (!leaving) {
      committed.current = false;
      if (x.get() !== 0) animate(x, 0, spring.responsive);
    }
  }, [leaving, x]);

  return (
    <motion.div
      role="option"
      aria-selected={selected}
      data-selected={selected}
      onWheel={onWheel}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || anyChecked) toggleCheck(m.id, e.shiftKey);
        else select(m.id);
      }}
      animate={leaving ? { opacity: 0, x: leaving === "left" ? -60 : 60, scale: 0.98 } : { opacity: 1, scale: 1 }}
      transition={leaving ? { duration: 0.22, ease: [0.4, 0, 1, 1] } : spring.smooth}
      className="group relative mx-2 h-full cursor-default"
    >
      {/* スワイプで出てくる下地 */}
      <motion.div style={{ opacity: leftReveal }} className="absolute inset-y-0.5 right-0 left-1/2 flex items-center justify-end rounded-[11px] bg-[#8e5bd9] pr-5 text-white">
        <motion.span style={{ scale: iconScaleL }} className="flex flex-col items-center gap-1 text-[11px] font-medium">
          <Archive className="size-5" />
          アーカイブ
        </motion.span>
      </motion.div>
      <motion.div style={{ opacity: rightReveal }} className="absolute inset-y-0.5 left-0 right-1/2 flex items-center rounded-[11px] bg-blue pl-5 text-white">
        <motion.span style={{ scale: iconScaleR }} className="flex flex-col items-center gap-1 text-[11px] font-medium">
          {unread ? <MailOpen className="size-5" /> : <Mail className="size-5" />}
          {unread ? "既読" : "未読"}
        </motion.span>
      </motion.div>

      <motion.div style={{ x }} className="row-surface relative h-full rounded-[11px] bg-content">
        {selected && <div className="row-pill absolute inset-y-0.5 inset-x-0 rounded-[11px]" />}
        {checked && !selected && <div className="absolute inset-y-0.5 inset-x-0 rounded-[11px] bg-pill-active" />}
        {!selected && !checked && (
          <div className="absolute inset-y-0.5 inset-x-0 rounded-[11px] opacity-0 transition-opacity duration-200 group-hover:bg-pill group-hover:opacity-100" />
        )}

        <div className={cn("relative flex h-full gap-3 pl-6 pr-3.5", compact ? "items-center" : "pt-[13px]")}>
          {/* 未読ドット */}
          <span
            className={cn(
              "row-dot absolute left-[9px] size-[9px] rounded-full bg-blue transition-[opacity,transform] duration-300",
              compact ? "top-1/2 -translate-y-1/2" : "top-[20px]",
              unread ? "scale-100 opacity-100" : "scale-50 opacity-0",
            )}
          />

          {!compact && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCheck(m.id, e.shiftKey);
              }}
              className="relative size-8 shrink-0 cursor-default"
              aria-label={checked ? "選択を解除" : "選択"}
            >
              <span className={cn("absolute inset-0 transition-opacity", checked || anyChecked ? "opacity-0" : "group-hover:opacity-0")}>
                <Avatar name={m.fromName} email={m.fromAddr} size={32} />
                {accountDot && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-[11px] rounded-full border-2 border-content" style={{ background: accountDot }} />
                )}
              </span>
              <span
                className={cn(
                  "absolute inset-0 grid place-items-center rounded-full border transition-all",
                  checked ? "border-blue bg-blue text-white" : "border-line-hover bg-content text-transparent",
                  checked || anyChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <DrawCheck on={checked} />
              </span>
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className={cn("row-fg min-w-0 flex-1 truncate text-[14px]", unread ? "font-bold" : "font-medium")}>
                {who}
                {m.threadCount > 1 && <span className="row-fg3 ml-1.5 text-[12px] font-normal tabular">{m.threadCount}</span>}
              </span>
              <span className="row-fg3 shrink-0 text-[12px] tabular transition-opacity duration-150 group-hover:opacity-0">{listDate(m.date)}</span>
            </div>
            <div className="mt-[2px] flex items-center gap-1.5">
              <span className={cn("row-fg min-w-0 flex-1 truncate text-[13px]", unread && "font-medium")}>{m.subject || "(件名なし)"}</span>
              {m.otpCode && Date.now() / 1000 - m.date < 86400 && (
                <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                  <CodeButton code={m.otpCode} size="sm" />
                </span>
              )}
              {m.hasAttach && <Paperclip className="row-fg3 size-3.5 shrink-0" />}
              {m.flagged && <Star className="size-3.5 shrink-0 fill-star text-star" />}
            </div>
            {!compact && (
              <p className={cn("row-fg3 mt-[3px] text-[13px] leading-[1.5]", lines === 2 ? "line-clamp-2" : "truncate")}>{m.snippet}</p>
            )}
          </div>

          {/* ホバーで出るクイック操作（ガラスのカプセル） */}
          {hovered && (
          <div
            className={cn(
              "capsule absolute right-2.5 flex items-center gap-0.5 rounded-full p-0.5",
              compact ? "top-1/2 -translate-y-1/2" : "top-2",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton size="sm" className="rounded-full" label="アーカイブ" shortcut="E" onClick={() => triage("archive", [m.id])}>
              <Archive />
            </IconButton>
            <IconButton size="sm" className="rounded-full" label="削除" shortcut="#" onClick={() => triage("trash", [m.id])}>
              <Trash2 />
            </IconButton>
            <IconButton size="sm" className="rounded-full" label={unread ? "既読にする" : "未読にする"} shortcut="U" onClick={() => triage(unread ? "read" : "unread", [m.id])}>
              {unread ? <MailOpen /> : <Mail />}
            </IconButton>
            <IconButton size="sm" className="rounded-full" label={m.flagged ? "スターを外す" : "スターを付ける"} shortcut="S" onClick={() => triage(m.flagged ? "unflag" : "flag", [m.id])}>
              <Star className={m.flagged ? "fill-star text-star" : ""} />
            </IconButton>
          </div>
          )}
        </div>

        {/* 区切り線：本文の頭から右端まで。選択行の上下では消す */}
        {!selected && !beforeSelected && !checked && (
          <span className="absolute bottom-0 left-[68px] right-3 h-px bg-line-subtle" />
        )}
      </motion.div>
    </motion.div>
  );
});

/** EasyUI DrawCheckbox：チェックが自分で描かれる */
function DrawCheck({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <motion.path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" initial={false} animate={{ pathLength: on ? 1 : 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} />
    </svg>
  );
}

/** 複数選択時に下から浮かび上がるガラスのバー */
function SelectionBar() {
  const checked = useStore((s) => s.checked);
  const clear = useStore((s) => s.clearChecks);
  const triage = useStore((s) => s.triage);
  const view = useStore((s) => s.view);
  const messages = useStore((s) => s.messages);
  const n = checked.size;
  const inArchive = view.kind === "mailbox" ? false : view.role === "archive" || view.role === "trash";
  const allUnread = [...checked].every((id) => !messages.find((m) => m.id === id)?.seen);
  return (
    <AnimatePresence>
      {n > 0 && (
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 16, opacity: 0 }}
          transition={spring.responsive}
          className="capsule absolute inset-x-4 bottom-4 z-10 flex items-center gap-0.5 rounded-full p-1 pl-4"
        >
          <span className="flex flex-1 items-center gap-1 text-[13px] font-semibold text-fg">
            <RollingNumber value={n} />
            件を選択
          </span>
          {inArchive ? (
            <IconButton className="rounded-full" label="受信トレイに戻す" onClick={() => triage("inbox")}>
              <ArchiveRestore />
            </IconButton>
          ) : (
            <IconButton className="rounded-full" label="アーカイブ" shortcut="E" onClick={() => triage("archive")}>
              <Archive />
            </IconButton>
          )}
          <IconButton className="rounded-full" label="削除" shortcut="#" onClick={() => triage("trash")}>
            <Trash2 />
          </IconButton>
          <IconButton className="rounded-full" label={allUnread ? "既読にする" : "未読にする"} onClick={() => triage(allUnread ? "read" : "unread")}>
            {allUnread ? <MailOpen /> : <Mail />}
          </IconButton>
          <IconButton className="rounded-full" label="スターを付ける" onClick={() => triage("flag")}>
            <Star />
          </IconButton>
          <IconButton className="rounded-full" label="選択を解除" shortcut="Esc" onClick={clear}>
            <X />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ListSkeleton({ rowHeight }: { rowHeight: number }) {
  return (
    <div className="px-5 pt-1">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex gap-3 pl-1" style={{ height: rowHeight }}>
          <div className="skeleton mt-3 size-8 shrink-0 rounded-full" />
          <div className="flex-1 pt-3.5">
            <div className="skeleton h-3 w-2/5" />
            <div className="skeleton mt-2.5 h-3 w-4/5" />
            <div className="skeleton mt-2 h-2.5 w-3/5 opacity-60" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 空の時。受信トレイが空になったら、ささやかに祝う */
function EmptyList({ searching, view, filtered }: { searching: boolean; view: View; filtered: boolean }) {
  const inbox = view.kind === "unified" && view.role === "inbox" && !filtered;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex h-full flex-col items-center justify-center px-10 pb-20 text-center"
    >
      {!inbox && (
        <div className="grid size-14 place-items-center rounded-full bg-pill text-fg-3">
          {searching ? <SearchX className="size-6" /> : <Inbox className="size-6" />}
        </div>
      )}
      <p className={cn("text-[15px] font-medium text-fg-3", !inbox && "mt-4")}>
        {searching ? "見つかりませんでした" : filtered ? "未読メッセージはありません" : "メッセージはありません"}
      </p>
    </motion.div>
  );
}
