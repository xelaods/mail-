import type { Account, Address } from "./types";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 一覧用：今日は時刻、昨日は「昨日」、今年は「10月28日」、それ以前は「2025/10/28」 */
export function listDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays <= 0) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "昨日";
  if (diffDays < 7) return `${"日月火水木金土"[d.getDay()]}曜`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 本文ヘッダー用：2026年10月28日(水) 14:05 */
export function fullDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const w = "日月火水木金土"[d.getDay()];
  const t = d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${w}) ${t}`;
}

export function relativeShort(ts: number): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return listDate(ts);
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
}

export function displayName(name: string, email: string): string {
  return name?.trim() || email.split("@")[0] || email;
}

export function formatAddress(a: Address): string {
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

/** アバター用の頭文字（日本語は1文字、英字は2文字まで） */
export function initials(name: string, email: string): string {
  const src = (name || email).trim();
  if (!src) return "?";
  if (/^[\x00-\x7F]/.test(src)) {
    const parts = src.replace(/[<>"]/g, "").split(/[\s._@-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return [...src][0];
}

/**
 * アカウントの識別色。EasyUI のモノクローム基調を崩さないよう彩度を抑えた6色。
 * 小さなドットとアバターにだけ使う。
 */
export const accountHues = ["#e5484d", "#f5a623", "#46a758", "#3b82f6", "#8e4ec6", "#a1a1a6"];

export function accountColor(a: Pick<Account, "color"> | undefined): string {
  return accountHues[((a?.color ?? 0) % accountHues.length + accountHues.length) % accountHues.length];
}

/** 送信者ごとに安定した、落ち着いたアバター背景色 */
export function avatarTone(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  void hue;
  return {
    bg: "linear-gradient(180deg, #a5a9b1, #868a92)",
    fg: "#ffffff",
  };
}

export function providerLabel(p: string): string {
  return p === "gmail" ? "Gmail" : "iCloud";
}

export function stripRe(subject: string): string {
  return subject.replace(/^(\s*(re|fw|fwd|aw|tr|回答|返信|転送)\s*[:：]\s*)+/i, "").trim();
}

export function quoteText(text: string): string {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
}
