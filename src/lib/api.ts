import type {
  Account,
  Address,
  MailboxInfo,
  MessageDetail,
  MessageSummary,
  OutgoingMail,
  Provider,
  SyncStatus,
  ViewQuery,
} from "./types";
import { mockBackend } from "./mock";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return mockBackend(cmd, args ?? {}) as Promise<T>;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const api = {
  listAccounts: () => call<Account[]>("list_accounts"),
  addAccount: (input: { provider: Provider; email: string; name: string; password: string }) =>
    call<Account>("add_account", { input }),
  addGoogleAccount: (name: string, hint?: string) => call<Account>("add_google_account", { name, hint: hint || null }),
  reauthGoogle: (id: string) => call<void>("reauth_google_account", { id }),
  updateAccount: (id: string, name: string, signature: string, color: number) =>
    call<void>("update_account", { id, name, signature, color }),
  removeAccount: (id: string) => call<void>("remove_account", { id }),
  listMailboxes: () => call<MailboxInfo[]>("list_mailboxes"),
  listMessages: (query: ViewQuery) => call<MessageSummary[]>("list_messages", { query }),
  getThread: (id: number) => call<MessageDetail[]>("get_thread", { id }),
  syncMailbox: (accountId: string, path: string) => call<void>("sync_mailbox", { accountId, path }),
  syncAll: () => call<void>("sync_all"),
  refreshFolders: (accountId: string) => call<void>("refresh_folders", { accountId }),
  loadMore: (accountId: string, path: string) => call<number>("load_more", { accountId, path }),
  setFlag: (ids: number[], flag: "seen" | "flagged" | "answered", value: boolean) =>
    call<void>("set_flag", { ids, flag, value }),
  moveMessages: (ids: number[], role: "archive" | "trash" | "junk" | "inbox") =>
    call<void>("move_messages", { ids, role }),
  sendMail: (mail: OutgoingMail) => call<void>("send_mail", { mail }),
  saveAttachment: (id: number, index: number, dest: string) => call<void>("save_attachment", { id, index, dest }),
  openAttachment: (id: number, index: number) => call<void>("open_attachment", { id, index }),
  searchContacts: (prefix: string) => call<Address[]>("search_contacts", { prefix }),
  getSetting: (key: string) => call<string | null>("get_setting", { key }),
  setSetting: (key: string, value: string) => call<void>("set_setting", { key, value }),
  isTrusted: (addr: string) => call<boolean>("is_trusted", { addr }),
  setTrusted: (addr: string, value: boolean) => call<void>("set_trusted", { addr, value }),
};

export async function onEvent<T>(name: string, handler: (payload: T) => void): Promise<() => void> {
  if (!isTauri) {
    const fn = (e: Event) => handler((e as CustomEvent<T>).detail);
    window.addEventListener(`mock:${name}`, fn);
    return () => window.removeEventListener(`mock:${name}`, fn);
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(name, (e) => handler(e.payload));
}

export type { SyncStatus };

export async function openExternal(url: string) {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

export async function pickFiles(): Promise<string[]> {
  if (!isTauri) return ["C:/Users/you/Documents/見積書_2026.pdf"];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, title: "添付するファイルを選択" });
  if (!r) return [];
  return Array.isArray(r) ? r : [r];
}

export async function pickSavePath(name: string): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: name, title: "添付ファイルを保存" });
}

export async function windowAction(action: "minimize" | "maximize" | "close") {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  if (action === "minimize") await w.minimize();
  else if (action === "maximize") await w.toggleMaximize();
  else await w.close();
}
