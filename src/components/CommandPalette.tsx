import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Folder,
  Inbox,
  KeyRound,
  Keyboard,
  Mail,
  Moon,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Star,
  Sun,
  UserPlus,
} from "lucide-react";
import { useStore } from "../lib/store";
import { displayName, listDate } from "../lib/format";
import { ease, spring } from "../lib/motion";
import { Kbd, cn } from "./ui";

interface Item {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

/** EasyUI Spotlight Search：Ctrl+K で開くコマンドパレット */
export function CommandPalette() {
  const open = useStore((s) => s.dialog === "palette");
  const setDialog = useStore((s) => s.setDialog);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const store = useStore.getState();
  const close = () => setDialog(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const s = store;
    const base: Item[] = [
      { id: "compose", group: "操作", label: "メールを作成", icon: <PenLine />, shortcut: "C", keywords: "new compose 新規 作成", run: () => s.openComposer("new") },
      { id: "sync", group: "操作", label: "今すぐ同期", icon: <RefreshCw />, shortcut: "F5", keywords: "sync refresh 更新", run: () => s.syncNow() },
      {
        id: "theme",
        group: "操作",
        label: s.settings.theme === "light" ? "ダークモードにする" : "ライトモードにする",
        icon: s.settings.theme === "light" ? <Moon /> : <Sun />,
        keywords: "theme dark light テーマ",
        run: () => s.updateSettings({ theme: s.settings.theme === "light" ? "dark" : "light" }),
      },
      { id: "settings", group: "操作", label: "設定を開く", icon: <Settings2 />, shortcut: "Ctrl ,", keywords: "settings preferences", run: () => s.setDialog("settings") },
      { id: "account", group: "操作", label: "アカウントを追加", icon: <UserPlus />, keywords: "gmail icloud account", run: () => s.setDialog("addAccount") },
      { id: "keys", group: "操作", label: "キーボードショートカット", icon: <Keyboard />, shortcut: "?", keywords: "shortcut keys", run: () => s.setDialog("shortcuts") },
      { id: "v-inbox", group: "移動", label: "すべての受信", icon: <Inbox />, shortcut: "G I", keywords: "inbox", run: () => s.setView({ kind: "unified", role: "inbox" }) },
      { id: "v-unread", group: "移動", label: "未読", icon: <Mail />, keywords: "unread", run: () => s.setView({ kind: "unified", role: "unread" }) },
      { id: "v-codes", group: "移動", label: "コード", icon: <KeyRound />, shortcut: "G C", keywords: "otp code 認証 確認 コード", run: () => s.setView({ kind: "unified", role: "codes" }) },
      { id: "v-star", group: "移動", label: "スター付き", icon: <Star />, shortcut: "G S", keywords: "starred flagged", run: () => s.setView({ kind: "unified", role: "flagged" }) },
      { id: "v-att", group: "移動", label: "添付ファイルあり", icon: <Paperclip />, keywords: "attachment", run: () => s.setView({ kind: "unified", role: "attachments" }) },
      { id: "v-sent", group: "移動", label: "送信済み", icon: <Send />, shortcut: "G T", keywords: "sent", run: () => s.setView({ kind: "unified", role: "sent" }) },
    ];
    for (const m of s.mailboxes) {
      if (m.role === "flagged") continue;
      const acc = s.accounts.find((a) => a.id === m.accountId);
      base.push({
        id: `f-${m.accountId}-${m.path}`,
        group: "フォルダ",
        label: m.name,
        hint: acc?.email,
        icon: <Folder />,
        keywords: `${m.path} ${m.role}`,
        run: () => s.setView({ kind: "mailbox", accountId: m.accountId, path: m.path }),
      });
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const matched = query
      ? items.filter((i) => `${i.label} ${i.hint ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(query))
      : items.filter((i) => i.group !== "フォルダ");
    const mails: Item[] = query
      ? store.messages
          .filter((m) => `${m.subject} ${m.fromName} ${m.fromAddr}`.toLowerCase().includes(query))
          .slice(0, 5)
          .map((m) => ({
            id: `m-${m.id}`,
            group: "メール",
            label: m.subject || "(件名なし)",
            hint: `${displayName(m.fromName, m.fromAddr)}　${listDate(m.date)}`,
            icon: <Mail />,
            run: () => store.select(m.id),
          }))
      : [];
    const searchAll: Item[] = query
      ? [{ id: "search", group: "検索", label: `「${q.trim()}」をすべてのメールから検索`, icon: <Search />, run: () => store.setSearch(q.trim()) }]
      : [];
    return [...searchAll, ...mails, ...matched];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, items]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (i: Item) => {
    close();
    setTimeout(i.run, 0);
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[65] flex items-start justify-center pt-[14vh]">
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease.fast} onClick={close} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6, transition: { duration: 0.12 } }}
            transition={spring.snappy}
            className="relative w-[600px] max-w-[calc(100vw-48px)] overflow-hidden rounded-[20px] border border-line bg-surface shadow-float"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const it = results[active];
                if (it) run(it);
              } else if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
            }}
          >
            <div className="flex h-14 items-center gap-3 border-b border-line-subtle px-5">
              <Search className="size-4 text-fg-3" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="操作・フォルダ・メールを探す"
                className="h-full flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-3 focus:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <div ref={listRef} className="max-h-[400px] overflow-y-auto p-2">
              {results.length === 0 && <p className="px-3 py-8 text-center text-[13px] text-fg-3">見つかりませんでした</p>}
              {results.map((it, idx) => {
                const header = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                return (
                  <div key={it.id}>
                    {header && <p className="px-3 pb-1 pt-3 text-xs text-fg-3 first:pt-1">{header}</p>}
                    <button
                      data-idx={idx}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => run(it)}
                      className={cn("relative flex h-10 w-full cursor-default items-center gap-3 rounded-[10px] px-3 text-left", idx === active ? "text-fg" : "text-fg-2")}
                    >
                      {idx === active && (
                        <motion.span layoutId="palette-active" transition={spring.snappy} className="absolute inset-0 rounded-[10px] bg-pill-active" />
                      )}
                      <span className="relative text-fg-3 [&>svg]:size-4">{it.icon}</span>
                      <span className="relative min-w-0 flex-1 truncate text-[13.5px]">{it.label}</span>
                      {it.hint && <span className="relative max-w-[200px] truncate text-xs text-fg-3">{it.hint}</span>}
                      {it.shortcut && (
                        <span className="relative flex gap-1">
                          {it.shortcut.split(" ").map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
