import { create } from "zustand";
import { api, isTauri, onEvent } from "./api";
import type {
  Account,
  MailboxInfo,
  MessageDetail,
  MessageSummary,
  SyncStatus,
  View,
  ViewQuery,
} from "./types";
import { formatAddress, quoteText, stripRe, fullDate, displayName } from "./format";

export type ComposerMode = "new" | "reply" | "replyAll" | "forward";

export interface Composer {
  key: number;
  mode: ComposerMode;
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  showCc: boolean;
  subject: string;
  body: string;
  quoted: string;
  attachments: string[];
  replyToId?: number;
  inReplyTo?: string;
  references?: string;
  minimized: boolean;
  expanded: boolean;
}

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone?: "default" | "error" | "success";
  /** 取り消し可能な操作。期限が来たら commit、取り消されたら undo */
  undo?: () => void;
  commit?: () => void | Promise<void>;
  duration: number;
}

export type Theme = "system" | "dark" | "light";
export type Density = "comfortable" | "compact";

export interface Settings {
  theme: Theme;
  density: Density;
  undoSeconds: number;
  markReadOnOpen: boolean;
  notifications: boolean;
  previewLines: 1 | 2;
}

const defaultSettings: Settings = {
  theme: "dark",
  density: "comfortable",
  undoSeconds: 5,
  markReadOnOpen: true,
  notifications: true,
  previewLines: 2,
};

type TriageAction = "archive" | "trash" | "junk" | "inbox" | "read" | "unread" | "flag" | "unflag";

interface State {
  ready: boolean;
  accounts: Account[];
  mailboxes: MailboxInfo[];
  sync: Record<string, SyncStatus>;
  view: View;
  search: string;
  messages: MessageSummary[];
  listLoading: boolean;
  hasMore: boolean;
  hidden: Set<number>;
  /** 一覧から滑って消えていく途中のメール */
  leaving: Map<number, "left" | "right">;
  selectedId: number | null;
  checked: Set<number>;
  thread: MessageDetail[] | null;
  threadLoading: boolean;
  threadError: string | null;
  composer: Composer | null;
  toasts: Toast[];
  settings: Settings;
  dialog: null | "addAccount" | "settings" | "palette" | "shortcuts";
  /** 狭いウィンドウでサイドバーを重ねて表示しているか */
  sidebarOpen: boolean;
  /** 初めて起動した時だけ true（ようこそ画面を出す） */
  firstRun: boolean;
  finishWelcome: () => void;
  setSidebarOpen: (v: boolean) => void;

  init: () => Promise<void>;
  reloadMeta: () => Promise<void>;
  setView: (v: View) => void;
  setSearch: (q: string) => void;
  refreshList: (opts?: { keepLimit?: boolean }) => Promise<void>;
  loadMore: () => Promise<void>;
  select: (id: number | null) => Promise<void>;
  moveSelection: (delta: number) => void;
  toggleCheck: (id: number, range?: boolean) => void;
  clearChecks: () => void;
  triage: (action: TriageAction, ids?: number[]) => void;
  openComposer: (mode: ComposerMode, source?: MessageDetail) => void;
  updateComposer: (patch: Partial<Composer>) => void;
  closeComposer: () => void;
  sendComposer: () => void;
  pushToast: (t: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  resolveToast: (id: number, how: "commit" | "undo" | "dismiss") => void;
  setDialog: (d: State["dialog"]) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  syncNow: () => Promise<void>;
}

let initialized = false;
let toastSeq = 1;
let composerSeq = 1;
let listToken = 0;
let threadToken = 0;
const PAGE = 200;
let pageLimit = PAGE;

export function viewQuery(view: View, search: string): ViewQuery {
  const q: ViewQuery =
    view.kind === "mailbox"
      ? { kind: "mailbox", accountId: view.accountId, path: view.path }
      : { kind: "unified", role: view.role, accountId: view.accountId };
  if (search.trim()) q.search = search.trim();
  return q;
}

function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  accounts: [],
  mailboxes: [],
  sync: {},
  view: { kind: "unified", role: "inbox" },
  search: "",
  messages: [],
  listLoading: true,
  hasMore: false,
  hidden: new Set(),
  leaving: new Map(),
  selectedId: null,
  checked: new Set(),
  thread: null,
  threadLoading: false,
  threadError: null,
  composer: null,
  toasts: [],
  settings: defaultSettings,
  dialog: null,
  sidebarOpen: false,
  firstRun: false,
  finishWelcome: () => {
    set({ firstRun: false });
    api.setSetting("welcomed", "1").catch(() => undefined);
    if (get().accounts.length === 0) set({ dialog: "addAccount" });
  },
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  init: async () => {
    if (initialized) return;
    initialized = true;
    // 設定
    try {
      const raw = await api.getSetting("ui");
      if (raw) set({ settings: { ...defaultSettings, ...JSON.parse(raw) } });
    } catch {
      /* 既定値のまま */
    }
    applyTheme(get().settings.theme);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(get().settings.theme));

    const [welcomed] = await Promise.all([api.getSetting("welcomed").catch(() => "1"), get().reloadMeta()]);
    const forced = !isTauri && new URLSearchParams(location.search).has("welcome");
    const firstRun = forced || (!welcomed && get().accounts.length === 0);
    set({ ready: true, firstRun });
    if (!firstRun && get().accounts.length === 0) set({ dialog: "addAccount" });
    await get().refreshList();

    let pending: number | undefined;
    onEvent<{ accountId: string; mailbox: string; newMessages: number }>("mail-changed", () => {
      // 連続したイベントはまとめて1回だけ再読込
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        get().reloadMeta();
        get().refreshList({ keepLimit: true });
      }, 150);
    });
    onEvent<SyncStatus>("sync-status", (s) => set({ sync: { ...get().sync, [s.accountId]: s } }));
  },

  reloadMeta: async () => {
    const [accounts, mailboxes] = await Promise.all([api.listAccounts(), api.listMailboxes()]);
    set({ accounts, mailboxes });
  },

  setView: (v) => {
    pageLimit = PAGE;
    set({ view: v, selectedId: null, thread: null, checked: new Set(), messages: [], listLoading: true, sidebarOpen: false });
    get().refreshList();
    if (v.kind === "mailbox") {
      api.syncMailbox(v.accountId, v.path).catch((e) =>
        get().pushToast({ title: "同期できませんでした", description: String(e), tone: "error" }),
      );
    }
  },

  setSearch: (q) => {
    pageLimit = PAGE;
    set({ search: q });
    get().refreshList();
  },

  refreshList: async (opts) => {
    const token = ++listToken;
    if (!opts?.keepLimit) pageLimit = PAGE;
    const q = { ...viewQuery(get().view, get().search), limit: pageLimit + 1 };
    try {
      const rows = await api.listMessages(q);
      if (token !== listToken) return;
      const hasMore = rows.length > pageLimit;
      const messages = rows.slice(0, pageLimit);
      const { selectedId } = get();
      set({
        messages,
        hasMore: hasMore || get().view.kind === "mailbox",
        listLoading: false,
      });
      // 選択中のメールが一覧から消えたら（他端末でアーカイブ等）閉じる
      if (selectedId && !messages.some((m) => m.id === selectedId) && !get().thread?.some((t) => t.id === selectedId)) {
        set({ selectedId: null, thread: null });
      }
    } catch (e) {
      if (token === listToken) set({ listLoading: false });
      get().pushToast({ title: "一覧を読み込めませんでした", description: String(e), tone: "error" });
    }
  },

  loadMore: async () => {
    const { view, messages } = get();
    if (messages.length >= pageLimit) {
      pageLimit += PAGE;
      await get().refreshList({ keepLimit: true });
      return;
    }
    if (view.kind === "mailbox") {
      const added = await api.loadMore(view.accountId, view.path).catch(() => 0);
      if (added === 0) set({ hasMore: false });
      await get().refreshList({ keepLimit: true });
    } else {
      set({ hasMore: false });
    }
  },

  select: async (id) => {
    const token = ++threadToken;
    set({ selectedId: id, threadError: null });
    if (id == null) {
      set({ thread: null, threadLoading: false });
      return;
    }
    const summary = get().messages.find((m) => m.id === id);
    set({ threadLoading: true });
    try {
      const thread = await api.getThread(id);
      if (token !== threadToken) return;
      set({ thread, threadLoading: false });
      // 開いたら既読に
      const unseen = thread.filter((m) => !m.seen).map((m) => m.id);
      if (get().settings.markReadOnOpen && (unseen.length || (summary && !summary.seen))) {
        const ids = unseen.length ? unseen : [id];
        set({
          messages: get().messages.map((m) => (m.id === id ? { ...m, seen: true } : m)),
          thread: thread.map((m) => ({ ...m, seen: true })),
        });
        api.setFlag(ids, "seen", true).catch(() => undefined);
      }
    } catch (e) {
      if (token !== threadToken) return;
      set({ threadLoading: false, threadError: String(e) });
    }
  },

  moveSelection: (delta) => {
    const list = get().messages.filter((m) => !get().hidden.has(m.id));
    if (!list.length) return;
    const idx = list.findIndex((m) => m.id === get().selectedId);
    const next = idx < 0 ? (delta > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, idx + delta));
    get().select(list[next].id);
  },

  toggleCheck: (id, range) => {
    const checked = new Set(get().checked);
    if (range && checked.size) {
      const list = get().messages;
      const last = [...checked].pop()!;
      const a = list.findIndex((m) => m.id === last);
      const b = list.findIndex((m) => m.id === id);
      const [from, to] = a < b ? [a, b] : [b, a];
      for (let i = from; i <= to; i++) checked.add(list[i].id);
    } else if (checked.has(id)) checked.delete(id);
    else checked.add(id);
    set({ checked });
  },

  clearChecks: () => set({ checked: new Set() }),

  triage: (action, explicit) => {
    const state = get();
    const ids =
      explicit ?? (state.checked.size ? [...state.checked] : state.selectedId != null ? [state.selectedId] : []);
    if (!ids.length) return;

    // スレッド単位：選択中スレッドのメッセージすべてに適用
    const expand = (list: number[]) => {
      if (state.thread && list.includes(state.selectedId ?? -1)) {
        return [...new Set([...list, ...state.thread.map((m) => m.id)])];
      }
      return list;
    };

    if (action === "read" || action === "unread" || action === "flag" || action === "unflag") {
      const flag = action === "read" || action === "unread" ? "seen" : "flagged";
      const value = action === "read" || action === "flag";
      const targets = flag === "seen" ? expand(ids) : ids;
      set({
        messages: state.messages.map((m) => (ids.includes(m.id) ? { ...m, [flag]: value } : m)),
        thread: state.thread?.map((m) => (targets.includes(m.id) ? { ...m, [flag]: value } : m)) ?? null,
      });
      api.setFlag(targets, flag, value).catch((e) =>
        get().pushToast({ title: "フラグを変更できませんでした", description: String(e), tone: "error" }),
      );
      if (action === "unread" && state.selectedId && ids.includes(state.selectedId)) set({ selectedId: null, thread: null });
      return;
    }

    // 移動系：すぐに一覧から消し、取り消し期間が過ぎたらサーバーへ
    const visible = state.messages.filter((m) => !state.hidden.has(m.id));
    const idx = visible.findIndex((m) => m.id === state.selectedId);
    const remaining = visible.filter((m) => !ids.includes(m.id));
    const nextSel = state.selectedId != null && ids.includes(state.selectedId)
      ? remaining[Math.min(idx, remaining.length - 1)]?.id ?? null
      : state.selectedId;

    const targets = expand(ids);
    // まず行を横へ滑らせ、消え終わってから一覧から外す（下の行が詰まってくる）
    const leaving = new Map(state.leaving);
    const dir = action === "inbox" ? "right" : "left";
    ids.forEach((i) => leaving.set(i, dir));
    set({ leaving, checked: new Set() });
    window.setTimeout(() => {
      const l = new Map(get().leaving);
      const hidden = new Set(get().hidden);
      ids.forEach((i) => {
        l.delete(i);
        hidden.add(i);
      });
      set({ leaving: l, hidden });
    }, 230);
    if (nextSel !== state.selectedId) get().select(nextSel);

    const label = { archive: "アーカイブしました", trash: "ゴミ箱に移動しました", junk: "迷惑メールに移動しました", inbox: "受信トレイに戻しました" }[action];
    const count = ids.length > 1 ? `${ids.length}件を` : "";
    get().pushToast({
      title: `${count}${label}`,
      undo: () => {
        const h = new Set(get().hidden);
        ids.forEach((i) => h.delete(i));
        set({ hidden: h });
      },
      commit: async () => {
        try {
          await api.moveMessages(targets, action);
        } catch (e) {
          get().pushToast({ title: "移動できませんでした", description: String(e), tone: "error" });
        } finally {
          const h = new Set(get().hidden);
          ids.forEach((i) => h.delete(i));
          set({ hidden: h });
          get().refreshList({ keepLimit: true });
          get().reloadMeta();
        }
      },
    });
  },

  openComposer: (mode, src) => {
    const { accounts, view } = get();
    const defaultAccount =
      (src && accounts.find((a) => a.id === src.accountId)) ||
      (view.kind === "mailbox" ? accounts.find((a) => a.id === view.accountId) : undefined) ||
      ("accountId" in view && view.accountId ? accounts.find((a) => a.id === view.accountId) : undefined) ||
      accounts[0];
    if (!defaultAccount) {
      set({ dialog: "addAccount" });
      return;
    }
    const me = new Set(accounts.map((a) => a.email.toLowerCase()));
    const c: Composer = {
      key: composerSeq++,
      mode,
      accountId: defaultAccount.id,
      to: [],
      cc: [],
      bcc: [],
      showCc: false,
      subject: "",
      body: defaultAccount.signature ? `\n\n${defaultAccount.signature}` : "",
      quoted: "",
      attachments: [],
      minimized: false,
      expanded: false,
    };
    if (src) {
      const header = `${fullDate(src.date)} ${displayName(src.fromName, src.fromAddr)} <${src.fromAddr}>:`;
      const original = src.text || src.snippet;
      if (mode === "forward") {
        c.subject = `Fwd: ${stripRe(src.subject)}`;
        c.quoted = [
          "---------- 転送メッセージ ----------",
          `差出人: ${formatAddress({ name: src.fromName, email: src.fromAddr })}`,
          `日時: ${fullDate(src.date)}`,
          `件名: ${src.subject}`,
          `宛先: ${src.to.map(formatAddress).join(", ")}`,
          "",
          original,
        ].join("\n");
      } else {
        const sentByMe = me.has(src.fromAddr.toLowerCase());
        const primary = sentByMe
          ? src.to
          : src.replyTo.length
            ? src.replyTo
            : [{ name: src.fromName, email: src.fromAddr }];
        c.to = primary.map(formatAddress);
        if (mode === "replyAll") {
          const others = [...src.to, ...src.cc].filter(
            (a) => !me.has(a.email.toLowerCase()) && !primary.some((p) => p.email === a.email),
          );
          c.cc = others.map(formatAddress);
          c.showCc = c.cc.length > 0;
        }
        c.subject = /^re[:：]/i.test(src.subject) ? src.subject : `Re: ${src.subject}`;
        c.quoted = `${header}\n${quoteText(original)}`;
        c.replyToId = src.id;
        c.inReplyTo = src.messageId;
        c.references = [src.references, src.messageId ? `<${src.messageId}>` : ""].filter(Boolean).join(" ");
      }
    }
    set({ composer: c });
  },

  updateComposer: (patch) => {
    const c = get().composer;
    if (c) set({ composer: { ...c, ...patch } });
  },

  closeComposer: () => set({ composer: null }),

  sendComposer: () => {
    const c = get().composer;
    if (!c) return;
    const all = [...c.to, ...c.cc, ...c.bcc];
    if (!all.length) {
      get().pushToast({ title: "宛先を入力してください", tone: "error" });
      return;
    }
    const text = c.quoted ? `${c.body.trimEnd()}\n\n${c.quoted}` : c.body;
    const mail = {
      accountId: c.accountId,
      to: c.to,
      cc: c.cc,
      bcc: c.bcc,
      subject: c.subject,
      text,
      attachments: c.attachments,
      replyToId: c.replyToId,
      inReplyTo: c.inReplyTo,
      references: c.references,
    };
    set({ composer: null });
    const seconds = get().settings.undoSeconds;
    const doSend = async () => {
      try {
        await api.sendMail(mail);
        get().pushToast({ title: "送信しました", tone: "success", duration: 2500 });
        get().refreshList({ keepLimit: true });
      } catch (e) {
        set({ composer: c });
        get().pushToast({ title: "送信できませんでした", description: String(e), tone: "error", duration: 8000 });
      }
    };
    if (seconds <= 0) {
      doSend();
      return;
    }
    get().pushToast({
      title: "送信しています",
      description: c.subject || "(件名なし)",
      duration: seconds * 1000,
      undo: () => set({ composer: c }),
      commit: doSend,
    });
  },

  pushToast: (t) => {
    const id = toastSeq++;
    const toast: Toast = { duration: t.undo ? get().settings.undoSeconds * 1000 || 5000 : 4000, ...t, id };
    set({ toasts: [...get().toasts, toast].slice(-4) });
    return id;
  },

  resolveToast: (id, how) => {
    const t = get().toasts.find((x) => x.id === id);
    set({ toasts: get().toasts.filter((x) => x.id !== id) });
    if (!t) return;
    if (how === "undo") t.undo?.();
    else t.commit?.();
  },

  setDialog: (d) => set({ dialog: d }),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    applyTheme(settings.theme);
    api.setSetting("ui", JSON.stringify(settings)).catch(() => undefined);
    if (patch.notifications !== undefined) api.setSetting("notifications", patch.notifications ? "on" : "off").catch(() => undefined);
  },

  syncNow: async () => {
    const { view } = get();
    try {
      if (view.kind === "mailbox") await api.syncMailbox(view.accountId, view.path);
      else await api.syncAll();
    } catch (e) {
      get().pushToast({ title: "同期できませんでした", description: String(e), tone: "error", duration: 8000 });
    }
    await get().reloadMeta();
    await get().refreshList({ keepLimit: true });
  },
}));

// 終了前に保留中の操作を確定させる
window.addEventListener("beforeunload", () => {
  for (const t of useStore.getState().toasts) t.commit?.();
});
