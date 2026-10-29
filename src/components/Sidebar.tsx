import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  ChevronRight,
  File,
  Folder,
  Inbox,
  Mail,
  Paperclip,
  PenLine,
  Plus,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  Layers,
  KeyRound,
  Package,
} from "lucide-react";
import { useStore } from "../lib/store";
import type { Account, MailboxInfo, Role, View } from "../lib/types";
import { accountColor } from "../lib/format";
import { spring } from "../lib/motion";
import { RollingNumber, cn } from "./ui";

const roleIcon: Record<string, ReactNode> = {
  inbox: <Inbox />,
  sent: <Send />,
  drafts: <File />,
  archive: <Archive />,
  all: <Layers />,
  trash: <Trash2 />,
  junk: <ShieldAlert />,
  flagged: <Star />,
  important: <Tag />,
  custom: <Folder />,
};

const roleOrder: Role[] = ["inbox", "flagged", "important", "drafts", "sent", "archive", "all", "junk", "trash"];

const roleName = (m: MailboxInfo, a?: Account): string => {
  switch (m.role) {
    case "inbox":
      return "受信トレイ";
    case "sent":
      return "送信済み";
    case "drafts":
      return "下書き";
    case "archive":
      return "アーカイブ";
    case "all":
      return a?.provider === "gmail" ? "すべてのメール" : "アーカイブ";
    case "trash":
      return "ゴミ箱";
    case "junk":
      return "迷惑メール";
    case "flagged":
      return "スター付き";
    case "important":
      return "重要";
    default:
      return m.name;
  }
};

function viewKey(v: View): string {
  return v.kind === "mailbox" ? `m:${v.accountId}:${v.path}` : `u:${v.role}:${v.accountId ?? ""}`;
}

export function Sidebar() {
  const accounts = useStore((s) => s.accounts);
  const mailboxes = useStore((s) => s.mailboxes);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const openComposer = useStore((s) => s.openComposer);
  const setDialog = useStore((s) => s.setDialog);
  const sync = useStore((s) => s.sync);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const active = viewKey(view);
  const inboxUnread = mailboxes.filter((m) => m.role === "inbox").reduce((n, m) => n + m.unread, 0);

  const byAccount = useMemo(() => {
    const map = new Map<string, MailboxInfo[]>();
    for (const m of mailboxes) map.set(m.accountId, [...(map.get(m.accountId) ?? []), m]);
    for (const [k, list] of map) {
      list.sort((a, b) => {
        const ia = roleOrder.indexOf(a.role);
        const ib = roleOrder.indexOf(b.role);
        if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.name.localeCompare(b.name, "ja");
      });
      // Gmail の「スター付き」「重要」は統合ビューと重複するので隠す
      map.set(
        k,
        list.filter((m) => m.role !== "flagged"),
      );
    }
    return map;
  }, [mailboxes]);

  const item = (key: string, v: View, label: string, icon: ReactNode, count?: number, dot?: string) => (
    <NavItem
      key={key}
      id={key}
      active={active === key}
      label={label}
      icon={icon}
      count={count}
      dot={dot}
      onSelect={() => setView(v)}
    />
  );

  return (
    <nav className="liquid flex w-[232px] shrink-0 flex-col overflow-hidden rounded-[18px]">
      <div className="px-2.5 pb-2 pt-2.5">
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={spring.snappy}
          onClick={() => openComposer("new")}
          data-compose="new"
          className="group flex h-9 w-full cursor-default items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium text-fg transition-colors duration-200 hover:bg-pill-active"
        >
          <span className="grid size-6 place-items-center rounded-[7px] bg-blue text-white">
            <PenLine className="size-3.5" strokeWidth={2} />
          </span>
          <span className="flex-1 text-left">新規メッセージ</span>
        </motion.button>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >

        <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold text-fg-3">メールボックス</p>
        <div className="space-y-px">
          {item("u:inbox:", { kind: "unified", role: "inbox" }, "すべての受信", <Inbox />, inboxUnread)}
          {item("u:unread:", { kind: "unified", role: "unread" }, "未読", <Mail />)}
          {item("u:codes:", { kind: "unified", role: "codes" }, "コード", <KeyRound />)}
          {item("u:parcels:", { kind: "unified", role: "parcels" }, "荷物", <Package />)}
          {item("u:flagged:", { kind: "unified", role: "flagged" }, "スター付き", <Star />)}
          {item("u:attachments:", { kind: "unified", role: "attachments" }, "添付ファイルあり", <Paperclip />)}
          {item("u:sent:", { kind: "unified", role: "sent" }, "送信済み", <Send />)}
        </div>

        {accounts.map((a) => {
          const list = byAccount.get(a.id) ?? [];
          const isCollapsed = collapsed[a.id];
          const st = sync[a.id];
          return (
            <section key={a.id} className="mt-4">
              <button
                onClick={() => setCollapsed({ ...collapsed, [a.id]: !isCollapsed })}
                className="group relative z-10 flex w-full cursor-default items-center gap-2 rounded-md px-2.5 pb-1.5 pt-1 text-left"
              >
                <span className="size-[7px] shrink-0 rounded-full" style={{ background: accountColor(a) }} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-fg-3 transition-colors group-hover:text-fg-2" title={a.email}>
                  {a.email}
                </span>
                {st?.state === "syncing" && <span className="breathe size-1.5 rounded-full bg-fg-3" />}
                {st?.state === "error" && (
                  <span className="text-[11px] text-danger" title={st.message}>
                    エラー
                  </span>
                )}
                <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }} transition={spring.snappy} className="text-fg-4">
                  <ChevronRight className="size-3.5" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={spring.gentle}
                    className="space-y-px overflow-hidden"
                  >
                    {list.length === 0 && (
                      <p className="px-2.5 py-1.5 text-xs text-fg-4">フォルダを読み込み中…</p>
                    )}
                    {list.map((m) => {
                      const key = `m:${a.id}:${m.path}`;
                      const count = m.role === "inbox" || m.role === "custom" || m.role === "important" ? m.unread : m.role === "drafts" ? m.total : 0;
                      return item(
                        key,
                        { kind: "mailbox", accountId: a.id, path: m.path },
                        roleName(m, a),
                        roleIcon[m.role] ?? roleIcon.custom,
                        count,
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>

      <div className="p-2">
        <button
          onClick={() => setDialog("addAccount")}
          className="flex h-8 w-full cursor-default items-center gap-2.5 rounded-lg px-2.5 text-[13px] text-fg-3 transition-colors hover:bg-pill hover:text-fg"
        >
          <Plus className="size-4" />
          <span className="flex-1 text-left">アカウントを追加</span>
        </button>
      </div>
    </nav>
  );
}

function NavItem({
  id,
  active,
  label,
  icon,
  count,
  dot,
  onSelect,
}: {
  id: string;
  active: boolean;
  label: string;
  icon: ReactNode;
  count?: number;
  dot?: string;
  onSelect: () => void;
}) {
  return (
    <button
      data-nav={id}
      onClick={onSelect}
      className={cn(
        "relative flex h-[30px] w-full cursor-default items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] text-fg hover:bg-pill",
        active && "font-medium",
      )}
    >
      {active && <span className="absolute inset-0 rounded-[8px] bg-pill-active" />}
      <span className="relative grid size-4 shrink-0 place-items-center text-blue [&>svg]:size-[17px]">
        {icon}
      </span>
      {dot && <span className="relative size-1.5 rounded-full" style={{ background: dot }} />}
      <span className="relative min-w-0 flex-1 truncate text-left">{label}</span>
      {!!count && count > 0 && (
        <span className="relative text-[12px] text-fg-3">
          <RollingNumber value={Math.min(count, 999)} />
        </span>
      )}
    </button>
  );
}
