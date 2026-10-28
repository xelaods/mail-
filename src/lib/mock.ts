// ブラウザだけで UI を確認するためのデモ用バックエンド（Tauri 上では使われない）
import type { Account, MailboxInfo, MessageDetail, Role, ViewQuery } from "./types";

const now = Math.floor(Date.now() / 1000);
const h = 3600;
const d = 86400;

const accounts: Account[] = [
  { id: "g", provider: "gmail", email: "you@gmail.com", name: "あなた", color: 0, signature: "" },
  { id: "i", provider: "icloud", email: "you@icloud.com", name: "あなた", color: 3, signature: "" },
];

const mailboxes: MailboxInfo[] = [
  { accountId: "g", path: "INBOX", name: "受信トレイ", role: "inbox", unread: 0, total: 0 },
  { accountId: "g", path: "[Gmail]/Sent Mail", name: "送信済み", role: "sent", unread: 0, total: 0 },
  { accountId: "g", path: "[Gmail]/Drafts", name: "下書き", role: "drafts", unread: 0, total: 0 },
  { accountId: "g", path: "[Gmail]/All Mail", name: "すべてのメール", role: "all", unread: 0, total: 0 },
  { accountId: "g", path: "[Gmail]/Spam", name: "迷惑メール", role: "junk", unread: 0, total: 0 },
  { accountId: "g", path: "[Gmail]/Trash", name: "ゴミ箱", role: "trash", unread: 0, total: 0 },
  { accountId: "g", path: "ゼミ", name: "ゼミ", role: "custom", unread: 0, total: 0 },
  { accountId: "g", path: "バイト", name: "バイト", role: "custom", unread: 0, total: 0 },
  { accountId: "i", path: "INBOX", name: "受信", role: "inbox", unread: 0, total: 0 },
  { accountId: "i", path: "Sent Messages", name: "送信済み", role: "sent", unread: 0, total: 0 },
  { accountId: "i", path: "Archive", name: "アーカイブ", role: "archive", unread: 0, total: 0 },
  { accountId: "i", path: "Junk", name: "迷惑メール", role: "junk", unread: 0, total: 0 },
  { accountId: "i", path: "Deleted Messages", name: "ゴミ箱", role: "trash", unread: 0, total: 0 },
];

type Seed = {
  acc: string;
  box: string;
  from: [string, string];
  subject: string;
  ago: number;
  text: string;
  html?: string;
  seen?: boolean;
  flagged?: boolean;
  attach?: { name: string; mime: string; size: number }[];
  thread?: string;
};

const newsletter = (title: string, lead: string) => `
<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:0 auto;color:#1d1d1f">
  <div style="background:#f5f5f7;border-radius:14px;padding:36px 32px">
    <p style="font-size:13px;color:#6e6e73;margin:0 0 8px">週刊ニュースレター</p>
    <h1 style="font-size:28px;line-height:1.2;margin:0 0 14px">${title}</h1>
    <p style="font-size:16px;line-height:1.7;margin:0 0 22px;color:#3a3a3c">${lead}</p>
    <a href="https://example.com" style="display:inline-block;background:#1d1d1f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">続きを読む</a>
  </div>
  <img src="https://example.com/banner.png" width="600" height="200" alt="" style="display:block;margin-top:16px;border-radius:12px;background:#e5e5ea">
  <p style="font-size:12px;color:#86868b;margin-top:24px">配信停止は<a href="https://example.com/unsub" style="color:#86868b">こちら</a></p>
</div>`;

const seeds: Seed[] = [
  {
    acc: "g", box: "INBOX", from: ["佐藤 美咲", "misaki.sato@example.ac.jp"], subject: "来週のゼミ発表の順番について",
    ago: 5 * h, thread: "seminar", seen: true,
    text: "みなさん\n\nお疲れさまです、佐藤です。\n来週月曜のゼミですが、発表順を以下のようにしたいと思っています。\n\n1. 田中さん（生成AIの利用実態）\n2. 鈴木さん（アンケート集計の途中経過）\n3. 佐藤（先行研究のまとめ）\n\n各15分＋質疑5分の予定です。スライドは前日の21時までに共有フォルダへお願いします。\n都合が悪ければ今週中に教えてください。\n\n佐藤",
  },
  {
    acc: "g", box: "[Gmail]/Sent Mail", from: ["あなた", "you@gmail.com"], subject: "Re: 来週のゼミ発表の順番について",
    ago: 3 * h, thread: "seminar", seen: true,
    text: "佐藤さん\n\n了解です。2番目で大丈夫です。\nアンケートは回答が80件を超えたので、グラフにまとめて持っていきます。\n\n鈴木",
  },
  {
    acc: "g", box: "INBOX", from: ["佐藤 美咲", "misaki.sato@example.ac.jp"], subject: "Re: 来週のゼミ発表の順番について",
    ago: 0.4 * h, thread: "seminar",
    text: "ありがとうございます！グラフ楽しみにしてます。共有フォルダのリンクを貼っておきます。",
  },
  {
    acc: "i", box: "INBOX", from: ["ソウル ステイ", "booking@seoulstay.example"], subject: "ご予約確定：11月4日〜6日 明洞 2泊",
    ago: 5 * h, flagged: true,
    text: "ご予約ありがとうございます。\nチェックイン：2026年11月4日（水）15:00以降\nチェックアウト：2026年11月6日（金）11:00まで\n部屋タイプ：スタンダードツイン\n\n予約番号は添付のPDFをご確認ください。",
    attach: [{ name: "予約確認書.pdf", mime: "application/pdf", size: 182_400 }],
  },
  {
    acc: "g", box: "INBOX", from: ["シフト管理", "noreply@shift.example"], subject: "11月前半のシフトが公開されました",
    ago: 7 * h,
    text: "11月1日〜15日のシフトが確定しました。アプリから確認してください。\n変更希望は11月3日までに店長へ連絡してください。",
  },
  {
    acc: "g", box: "INBOX", from: ["Design Weekly", "hello@designweekly.example"], subject: "動きのあるUIをつくる7つの原則",
    ago: 20 * h,
    text: "スプリング物理を使ったモーションの考え方を特集しました。",
    html: newsletter("動きのあるUIをつくる7つの原則", "ばねの硬さ・減衰・質量。この3つの数字だけで、インターフェースの手触りは大きく変わります。今週は実例とともに解説します。"),
  },
  {
    acc: "i", box: "INBOX", from: ["田中 健", "ken.tanaka@icloud.example"], subject: "スキー旅行の新幹線パック、申し込みました",
    ago: 1 * d + 2 * h,
    text: "みんなの分まとめて申し込んでおいた！\n2月2日 東京 8:08発 → ガーラ湯沢 9:36着\nレンタルは現地で受け取り。\n\n一人あたりの金額は確定したらまた連絡します。",
  },
  {
    acc: "g", box: "INBOX", from: ["教務課", "kyomu@example.ac.jp"], subject: "【重要】後期定期試験の時間割について",
    ago: 1 * d + 6 * h, seen: true, flagged: true,
    text: "学生各位\n\n後期定期試験の時間割を掲示しました。\n試験期間：2027年1月25日（月）〜2月1日（月）\n履修中の科目の試験日時を必ず確認してください。",
    attach: [{ name: "試験時間割.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 48_200 }],
  },
  {
    acc: "g", box: "INBOX", from: ["ビルド通知", "ci@builds.example"], subject: "[xelaods/batteries] ビルドが完了しました",
    ago: 2 * d, seen: true,
    text: "ワークフロー「Build ipa」が成功しました。成果物をダウンロードできます。",
  },
  {
    acc: "i", box: "INBOX", from: ["ベータプログラム", "beta@devprogram.example"], subject: "新しいベータ版が利用可能です",
    ago: 2 * d + 5 * h, seen: true,
    text: "最新のベータ版がダウンロード可能になりました。リリースノートをご確認ください。",
  },
  {
    acc: "g", box: "INBOX", from: ["山本 ゆい", "yui.yamamoto@example.com"], subject: "アンケート協力のお願い（3分で終わります）",
    ago: 3 * d, seen: true,
    text: "ゼミの課題で、生成AIの使い方についてのアンケートを取っています。\n3分ほどで終わるので、協力してもらえると嬉しいです！",
  },
  {
    acc: "g", box: "INBOX", from: ["ジム運営事務局", "info@gym.example"], subject: "11月の休館日のお知らせ",
    ago: 4 * d, seen: true,
    text: "11月18日（水）は設備点検のため休館いたします。",
  },
  {
    acc: "i", box: "INBOX", from: ["航空券予約センター", "noreply@air.example"], subject: "eチケットお控え（成田 → 仁川）",
    ago: 5 * d, seen: true, flagged: true,
    text: "ご搭乗便：11月4日 成田 9:30発 → 仁川 12:05着\n座席指定はオンラインチェックインで行えます。",
    attach: [{ name: "eticket.pdf", mime: "application/pdf", size: 96_000 }],
  },
  {
    acc: "g", box: "INBOX", from: ["フリマアプリ", "info@flea.example"], subject: "商品が発送されました",
    ago: 6 * d, seen: true,
    text: "購入した商品が発送されました。到着まで今しばらくお待ちください。",
  },
  {
    acc: "g", box: "ゼミ", from: ["佐藤 美咲", "misaki.sato@example.ac.jp"], subject: "先行研究リスト（共有）",
    ago: 8 * d, seen: true,
    text: "先行研究のリストをまとめました。追加があれば追記してください。",
  },
  {
    acc: "i", box: "Archive", from: ["田中 健", "ken.tanaka@icloud.example"], subject: "旅行の集合場所",
    ago: 12 * d, seen: true,
    text: "東京駅の日本橋口改札に7:45集合でどう？",
  },
  {
    acc: "g", box: "[Gmail]/Spam", from: ["当選事務局", "prize@spam.example"], subject: "おめでとうございます！あなたが選ばれました",
    ago: 2 * d, seen: false,
    text: "今すぐ受け取り手続きを…",
  },
];

let nextId = 1;
const store: (MessageDetail & { box: string })[] = seeds.map((s) => {
  const id = nextId++;
  return {
    id,
    accountId: s.acc,
    mailbox: s.box,
    box: s.box,
    uid: id,
    subject: s.subject,
    fromName: s.from[0],
    fromAddr: s.from[1],
    toPreview: s.acc === "g" ? "you@gmail.com" : "you@icloud.com",
    date: now - Math.round(s.ago),
    snippet: s.text.replace(/\s+/g, " ").slice(0, 200),
    seen: s.seen ?? false,
    flagged: s.flagged ?? false,
    answered: false,
    hasAttach: !!s.attach?.length,
    threadKey: s.thread ?? `t${id}`,
    threadCount: 1,
    messageId: `m${id}@example`,
    to: [{ name: "", email: s.acc === "g" ? "you@gmail.com" : "you@icloud.com" }],
    cc: [],
    replyTo: [],
    text: s.text,
    html: s.html ?? "",
    attachments: (s.attach ?? []).map((a, index) => ({ ...a, index, inline: false })),
    references: "",
    listUnsubscribe: s.html ? "<https://example.com/unsub>" : "",
    mailboxRole: mailboxes.find((m) => m.accountId === s.acc && m.path === s.box)?.role ?? "custom",
  };
});

function roleOf(acc: string, box: string): Role {
  return mailboxes.find((m) => m.accountId === acc && m.path === box)?.role ?? "custom";
}

function recount() {
  for (const m of mailboxes) {
    const items = store.filter((s) => s.accountId === m.accountId && s.mailbox === m.path);
    m.total = items.length;
    m.unread = items.filter((s) => !s.seen).length;
  }
}
recount();

function emit(name: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(`mock:${name}`, { detail }));
}

function list(q: ViewQuery) {
  const s = q.search?.trim().toLowerCase();
  let items = store.filter((m) => {
    const role = roleOf(m.accountId, m.mailbox);
    if (q.kind === "mailbox") return m.accountId === q.accountId && m.mailbox === q.path;
    if (s) return role !== "trash" && role !== "junk";
    if (q.accountId && m.accountId !== q.accountId) return false;
    switch (q.role) {
      case "flagged":
        return m.flagged && role !== "trash" && role !== "junk";
      case "unread":
        return !m.seen && role === "inbox";
      case "attachments":
        return m.hasAttach && role !== "trash";
      default:
        return role === (q.role === "archive" ? (m.accountId === "g" ? "all" : "archive") : q.role);
    }
  });
  if (s) {
    items = items.filter((m) =>
      [m.subject, m.fromName, m.fromAddr, m.text].some((f) => f.toLowerCase().includes(s)),
    );
  }
  const groups = new Map<string, typeof items>();
  for (const m of items) {
    const k = `${m.accountId}:${m.threadKey}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return [...groups.values()]
    .map((g) => {
      g.sort((a, b) => b.date - a.date);
      const top = g[0];
      return {
        ...top,
        seen: g.every((x) => x.seen),
        flagged: g.some((x) => x.flagged),
        threadCount: g.length,
      };
    })
    .sort((a, b) => b.date - a.date)
    .slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? 200));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockBackend(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  await wait(cmd === "get_thread" ? 120 : 40);
  switch (cmd) {
    case "list_accounts":
      return accounts;
    case "list_mailboxes":
      recount();
      return mailboxes;
    case "list_messages":
      return list(args.query as ViewQuery);
    case "get_thread": {
      const base = store.find((m) => m.id === args.id);
      if (!base) throw new Error("メッセージが見つかりません");
      return store
        .filter((m) => m.accountId === base.accountId && m.threadKey === base.threadKey)
        .sort((a, b) => a.date - b.date)
        .map((m) => ({ ...m, mailboxRole: roleOf(m.accountId, m.mailbox) }));
    }
    case "set_flag": {
      const ids = args.ids as number[];
      for (const m of store) if (ids.includes(m.id)) (m as unknown as Record<string, boolean>)[args.flag as string] = args.value as boolean;
      recount();
      emit("mail-changed", { accountId: "", mailbox: "", newMessages: 0 });
      return null;
    }
    case "move_messages": {
      const ids = args.ids as number[];
      const role = args.role as string;
      for (const m of store) {
        if (!ids.includes(m.id)) continue;
        const target =
          role === "archive" ? (m.accountId === "g" ? "all" : "archive") : role;
        const box = mailboxes.find((b) => b.accountId === m.accountId && b.role === target);
        if (box) m.mailbox = box.path;
      }
      recount();
      emit("mail-changed", { accountId: "", mailbox: "", newMessages: 0 });
      return null;
    }
    case "send_mail": {
      await wait(600);
      return null;
    }
    case "sync_all":
    case "sync_mailbox":
    case "refresh_folders":
      await wait(500);
      return null;
    case "load_more":
      return 0;
    case "search_contacts": {
      const p = String(args.prefix).toLowerCase();
      const seen = new Map<string, { name: string; email: string }>();
      for (const m of store)
        if (m.fromAddr.includes(p) || m.fromName.toLowerCase().includes(p))
          seen.set(m.fromAddr, { name: m.fromName, email: m.fromAddr });
      return [...seen.values()].slice(0, 6);
    }
    case "get_setting":
      return localStorage.getItem(`fumi:${args.key}`);
    case "set_setting":
      localStorage.setItem(`fumi:${args.key}`, String(args.value));
      return null;
    case "is_trusted":
      return false;
    case "add_account":
      await wait(900);
      throw new Error("デモ表示ではアカウントを追加できません。Windows アプリ版で追加してください。");
    default:
      return null;
  }
}
