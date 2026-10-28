import { memo, useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ArchiveRestore,
  Check,
  Inbox,
  Mail,
  MailOpen,
  Paperclip,
  SearchX,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { Account, MessageSummary, View } from "../lib/types";
import { accountColor, displayName, listDate } from "../lib/format";
import { spring } from "../lib/motion";
import { Avatar, IconButton, Spinner, cn } from "./ui";

function viewTitle(view: View, accounts: Account[], mailboxName?: string): string {
  if (view.kind === "mailbox") {
    const acc = accounts.find((a) => a.id === view.accountId);
    return mailboxName ?? acc?.email ?? "";
  }
  return {
    inbox: "すべての受信",
    unread: "未読",
    flagged: "スター付き",
    attachments: "添付ファイルあり",
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

  const items = useMemo(() => messages.filter((m) => !hidden.has(m.id)), [messages, hidden]);
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

  useEffect(() => virtualizer.measure(), [rowHeight, virtualizer]);

  // 選択が変わったらスクロールして見える位置へ
  useEffect(() => {
    if (selectedId == null) return;
    const idx = items.findIndex((m) => m.id === selectedId);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedId, items, virtualizer]);

  // 無限スクロール
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
          const names: Record<string, string> = { inbox: "受信トレイ", sent: "送信済み", drafts: "下書き", archive: "アーカイブ", trash: "ゴミ箱", junk: "迷惑メール" };
          if (m.role === "all") return accounts.find((a) => a.id === view.accountId)?.provider === "gmail" ? "すべてのメール" : "アーカイブ";
          return names[m.role] ?? m.name;
        })()
      : undefined;
  const title = search ? `「${search}」の検索結果` : viewTitle(view, accounts, mailboxName);
  const unread = items.filter((m) => !m.seen).length;
  const subtitle =
    view.kind === "mailbox" && !search ? accounts.find((a) => a.id === view.accountId)?.email : undefined;
  const multiAccount = accounts.length > 1 && view.kind === "unified";

  return (
    <section className="relative flex w-[400px] shrink-0 flex-col border-r border-line-subtle bg-bg max-[1180px]:w-[340px]">
      <header className="flex h-[60px] shrink-0 items-end justify-between gap-3 px-5 pb-3">
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold leading-tight tracking-[-0.02em] text-fg">{title}</h1>
          <p className="mt-0.5 truncate text-xs text-fg-3">
            {subtitle ? `${subtitle}　` : ""}
            {loading ? "読み込み中" : items.length === 0 ? "メールはありません" : unread > 0 ? `未読 ${unread}件` : `${items.length}件`}
          </p>
        </div>
      </header>

      <div ref={parentRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden" role="listbox" aria-label={title}>
        {loading && items.length === 0 ? (
          <ListSkeleton rowHeight={rowHeight} />
        ) : items.length === 0 ? (
          <EmptyList searching={!!search} view={view} />
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {vItems.map((vi) => {
              const m = items[vi.index];
              const acc = multiAccount ? accounts.find((a) => a.id === m.accountId) : undefined;
              return (
                <div
                  key={vi.key}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: vi.size, transform: `translateY(${vi.start}px)` }}
                >
                  <Row
                    m={m}
                    selected={m.id === selectedId}
                    checked={checked.has(m.id)}
                    anyChecked={checked.size > 0}
                    compact={compact}
                    lines={settings.previewLines}
                    accountDot={acc ? accountColor(acc) : undefined}
                    isSentView={view.kind === "unified" && view.role === "sent"}
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

const Row = memo(function Row({
  m,
  selected,
  checked,
  anyChecked,
  compact,
  lines,
  accountDot,
  isSentView,
}: {
  m: MessageSummary;
  selected: boolean;
  checked: boolean;
  anyChecked: boolean;
  compact: boolean;
  lines: 1 | 2;
  accountDot?: string;
  isSentView: boolean;
}) {
  const select = useStore((s) => s.select);
  const toggleCheck = useStore((s) => s.toggleCheck);
  const triage = useStore((s) => s.triage);
  const unread = !m.seen;
  const who = isSentView ? `宛先: ${m.toPreview || "(なし)"}` : displayName(m.fromName, m.fromAddr);

  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || anyChecked) toggleCheck(m.id, e.shiftKey);
        else select(m.id);
      }}
      className="group relative mx-2 h-[calc(100%-2px)] cursor-default rounded-xl"
    >
      {selected && (
        <motion.div
          layoutId="row-active"
          transition={spring.morph}
          className="absolute inset-0 rounded-xl border border-line bg-surface shadow-subtle"
        />
      )}
      {checked && !selected && <div className="absolute inset-0 rounded-xl bg-pill-active" />}
      {!selected && !checked && (
        <div className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-150 group-hover:bg-pill group-hover:opacity-100" />
      )}

      <div className={cn("relative flex h-full gap-3 px-3", compact ? "items-center" : "pt-3")}>
        {/* 未読ドット */}
        <span
          className={cn(
            "absolute left-[3px] size-[6px] rounded-full bg-indicator transition-opacity",
            compact ? "top-1/2 -translate-y-1/2" : "top-[25px]",
            unread ? "opacity-100" : "opacity-0",
          )}
        />

        {/* アバター／チェックボックス */}
        {!compact && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCheck(m.id, e.shiftKey);
            }}
            className="relative mt-0.5 size-8 shrink-0 cursor-default"
            aria-label={checked ? "選択を解除" : "選択"}
          >
            <span className={cn("absolute inset-0 transition-opacity", (checked || anyChecked) ? "opacity-0" : "group-hover:opacity-0")}>
              <Avatar name={m.fromName} email={m.fromAddr} size={32} />
              {accountDot && (
                <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg" style={{ background: accountDot }} />
              )}
            </span>
            <span
              className={cn(
                "absolute inset-0 grid place-items-center rounded-full border transition-all",
                checked ? "border-accent bg-accent text-accent-fg" : "border-line-hover bg-surface text-transparent",
                checked || anyChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
            >
              <DrawCheck on={checked} />
            </span>
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[13.5px]", unread ? "font-semibold text-fg" : "font-medium text-fg-2")}>
              {who}
              {m.threadCount > 1 && <span className="ml-1.5 text-xs font-normal text-fg-3 tabular">{m.threadCount}</span>}
            </span>
            <span className={cn("shrink-0 text-[11.5px] tabular transition-opacity group-hover:opacity-0", unread ? "text-fg-2" : "text-fg-3")}>
              {listDate(m.date)}
            </span>
          </div>
          <div className="mt-[3px] flex items-center gap-1.5">
            <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-medium text-fg" : "text-fg-2")}>
              {m.subject || "(件名なし)"}
            </span>
            {m.hasAttach && <Paperclip className="size-3.5 shrink-0 text-fg-3" />}
            {m.flagged && <Star className="size-3.5 shrink-0 fill-[#f5a623] text-[#f5a623]" />}
          </div>
          {!compact && (
            <p
              className={cn("mt-[3px] text-[12.5px] leading-[1.5] text-fg-3", lines === 2 ? "line-clamp-2" : "truncate")}
            >
              {m.snippet}
            </p>
          )}
        </div>

        {/* ホバー時のクイック操作 */}
        <div
          className={cn(
            "pointer-events-none absolute right-2 flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 opacity-0 shadow-elevated transition-all duration-150 group-hover:pointer-events-auto group-hover:opacity-100",
            compact ? "top-1/2 -translate-y-1/2" : "top-2",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <IconButton size="sm" label="アーカイブ" shortcut="E" onClick={() => triage("archive", [m.id])}>
            <Archive />
          </IconButton>
          <IconButton size="sm" label="削除" shortcut="#" onClick={() => triage("trash", [m.id])}>
            <Trash2 />
          </IconButton>
          <IconButton size="sm" label={unread ? "既読にする" : "未読にする"} shortcut="U" onClick={() => triage(unread ? "read" : "unread", [m.id])}>
            {unread ? <MailOpen /> : <Mail />}
          </IconButton>
          <IconButton size="sm" label={m.flagged ? "スターを外す" : "スターを付ける"} shortcut="S" onClick={() => triage(m.flagged ? "unflag" : "flag", [m.id])}>
            <Star className={m.flagged ? "fill-[#f5a623] text-[#f5a623]" : ""} />
          </IconButton>
        </div>
      </div>
    </div>
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

/** EasyUI SelectionBasket：複数選択時に下から上がってくる一括操作バー */
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
          initial={{ y: 24, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 24, opacity: 0, scale: 0.96 }}
          transition={spring.responsive}
          className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-1 rounded-2xl border border-line bg-surface p-1.5 pl-3 shadow-float"
        >
          <span className="flex-1 text-[13px] font-medium text-fg tabular">{n}件を選択</span>
          {inArchive ? (
            <IconButton label="受信トレイに戻す" onClick={() => triage("inbox")}>
              <ArchiveRestore />
            </IconButton>
          ) : (
            <IconButton label="アーカイブ" shortcut="E" onClick={() => triage("archive")}>
              <Archive />
            </IconButton>
          )}
          <IconButton label="削除" shortcut="#" onClick={() => triage("trash")}>
            <Trash2 />
          </IconButton>
          <IconButton label={allUnread ? "既読にする" : "未読にする"} onClick={() => triage(allUnread ? "read" : "unread")}>
            {allUnread ? <MailOpen /> : <Mail />}
          </IconButton>
          <IconButton label="スターを付ける" onClick={() => triage("flag")}>
            <Star />
          </IconButton>
          <span className="mx-1 h-5 w-px bg-line" />
          <IconButton label="選択を解除" shortcut="Esc" onClick={clear}>
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
        <div key={i} className="flex gap-3" style={{ height: rowHeight }}>
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

function EmptyList({ searching, view }: { searching: boolean; view: View }) {
  const inbox = view.kind === "unified" && view.role === "inbox";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className="flex h-full flex-col items-center justify-center px-10 pb-16 text-center"
    >
      <div className="grid size-12 place-items-center rounded-2xl border border-line bg-surface text-fg-3 shadow-subtle">
        {searching ? <SearchX className="size-5" /> : inbox ? <Check className="size-5" /> : <Inbox className="size-5" />}
      </div>
      <p className="mt-4 text-sm font-medium text-fg">
        {searching ? "一致するメールはありません" : inbox ? "受信トレイは空です" : "このフォルダは空です"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-fg-3">
        {searching
          ? "差出人・件名・本文の一部で検索できます。同期済みのメールが対象です"
          : inbox
            ? "新しいメールが届くとすぐにここに表示されます"
            : "メールを移動するとここに表示されます"}
      </p>
    </motion.div>
  );
}
