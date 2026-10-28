export type Provider = "gmail" | "icloud";

export interface Account {
  id: string;
  provider: Provider;
  email: string;
  name: string;
  color: number;
  signature: string;
}

export type Role =
  | "inbox"
  | "sent"
  | "drafts"
  | "archive"
  | "all"
  | "trash"
  | "junk"
  | "flagged"
  | "important"
  | "custom";

export interface MailboxInfo {
  accountId: string;
  path: string;
  name: string;
  role: Role;
  unread: number;
  total: number;
}

export interface Address {
  name: string;
  email: string;
}

export interface AttachmentInfo {
  index: number;
  name: string;
  mime: string;
  size: number;
  inline: boolean;
}

export interface MessageSummary {
  id: number;
  accountId: string;
  mailbox: string;
  uid: number;
  subject: string;
  fromName: string;
  fromAddr: string;
  toPreview: string;
  date: number;
  snippet: string;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttach: boolean;
  threadKey: string;
  threadCount: number;
}

export interface MessageDetail extends MessageSummary {
  messageId: string;
  to: Address[];
  cc: Address[];
  replyTo: Address[];
  text: string;
  html: string;
  attachments: AttachmentInfo[];
  references: string;
  listUnsubscribe: string;
  mailboxRole: Role;
}

export type View =
  | { kind: "unified"; role: "inbox" | "flagged" | "unread" | "attachments" | "sent" | "archive" | "trash" | "junk" | "drafts"; accountId?: string }
  | { kind: "mailbox"; accountId: string; path: string };

export interface ViewQuery {
  kind: "unified" | "mailbox";
  role?: string;
  accountId?: string;
  path?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface OutgoingMail {
  accountId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html?: string;
  attachments: string[];
  replyToId?: number;
  inReplyTo?: string;
  references?: string;
}

export interface SyncStatus {
  accountId: string;
  state: "syncing" | "idle" | "error";
  message?: string;
}
