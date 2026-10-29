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
  /** 確認コード・認証コード（なければ空） */
  otpCode: string;
  /** 認証リンク（なければ空） */
  otpLink: string;
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
  parcel: ParcelInfo | null;
}

export type Carrier = "yamato" | "sagawa" | "japanpost" | "amazon" | "seino" | "fukuyama" | "ups" | "fedex" | "dhl" | "";

/** 発送メールから読み取った荷物 */
export interface ParcelInfo {
  id: number;
  accountId: string;
  fromName: string;
  fromAddr: string;
  subject: string;
  date: number;
  carrier: Carrier;
  number: string;
  /** YYYY-MM-DD（不明なら空） */
  eta: string;
  status: "shipped" | "out" | "delivered" | "";
  link: string;
  firstDate: number;
}

export type View =
  | { kind: "unified"; role: "inbox" | "flagged" | "unread" | "codes" | "parcels" | "attachments" | "sent" | "archive" | "trash" | "junk" | "drafts"; accountId?: string }
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

/** 認証コードが届いた時のイベント */
export interface OtpEvent {
  id: number;
  accountId: string;
  from: string;
  subject: string;
  code: string;
  link: string;
  copied: boolean;
  at: number;
  /** 通知からタイトルバーへ飛んできて、着地したか */
  landed?: boolean;
}
