//! ローカルキャッシュ（SQLite）。一覧表示・検索はすべてここから行うので瞬時に動く。

use std::path::Path;

use anyhow::{Context, Result};
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::mime::{self, ParsedMail};
use crate::model::*;

pub struct Db {
    conn: Mutex<Connection>,
}

pub struct Flags {
    pub seen: bool,
    pub flagged: bool,
    pub answered: bool,
    pub draft: bool,
}

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  color INTEGER NOT NULL DEFAULT 0,
  signature TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mailboxes (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'custom',
  uidvalidity INTEGER NOT NULL DEFAULT 0,
  uidnext INTEGER NOT NULL DEFAULT 0,
  unread INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  exhausted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, path)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mailbox TEXT NOT NULL,
  uid INTEGER NOT NULL,
  message_id TEXT NOT NULL DEFAULT '',
  thread_key TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT '',
  from_addr TEXT NOT NULL DEFAULT '',
  to_json TEXT NOT NULL DEFAULT '[]',
  cc_json TEXT NOT NULL DEFAULT '[]',
  reply_to_json TEXT NOT NULL DEFAULT '[]',
  date INTEGER NOT NULL DEFAULT 0,
  snippet TEXT NOT NULL DEFAULT '',
  seen INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  answered INTEGER NOT NULL DEFAULT 0,
  draft INTEGER NOT NULL DEFAULT 0,
  has_attach INTEGER NOT NULL DEFAULT 0,
  size INTEGER NOT NULL DEFAULT 0,
  has_body INTEGER NOT NULL DEFAULT 0,
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  attachments_json TEXT NOT NULL DEFAULT '[]',
  in_reply_to TEXT NOT NULL DEFAULT '',
  refs TEXT NOT NULL DEFAULT '',
  list_unsubscribe TEXT NOT NULL DEFAULT '',
  UNIQUE (account_id, mailbox, uid)
);
CREATE INDEX IF NOT EXISTS idx_messages_view ON messages(account_id, mailbox, date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(account_id, thread_key);
CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_mid ON messages(account_id, message_id);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(subject, people, body, tokenize = 'trigram');

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trusted_senders (addr TEXT PRIMARY KEY);
"#;

const SUMMARY_COLS: &str = "id, account_id, mailbox, uid, subject, from_name, from_addr, to_json, date, snippet, seen, flagged, answered, has_attach, thread_key";

fn to_preview(to_json: &str) -> String {
    let list: Vec<AddressInfo> = serde_json::from_str(to_json).unwrap_or_default();
    list.iter()
        .map(|a| if a.name.is_empty() { a.email.clone() } else { a.name.clone() })
        .collect::<Vec<_>>()
        .join(", ")
}

fn summary_from_row(row: &Row<'_>, thread_count: i64) -> rusqlite::Result<MessageSummary> {
    let to_json: String = row.get(7)?;
    Ok(MessageSummary {
        id: row.get(0)?,
        account_id: row.get(1)?,
        mailbox: row.get(2)?,
        uid: row.get(3)?,
        subject: row.get(4)?,
        from_name: row.get(5)?,
        from_addr: row.get(6)?,
        to_preview: to_preview(&to_json),
        date: row.get(8)?,
        snippet: row.get(9)?,
        seen: row.get::<_, i64>(10)? != 0,
        flagged: row.get::<_, i64>(11)? != 0,
        answered: row.get::<_, i64>(12)? != 0,
        has_attach: row.get::<_, i64>(13)? != 0,
        thread_key: row.get(14)?,
        thread_count,
    })
}

/// FTS5 のフレーズとして安全に埋め込む
fn fts_phrase(q: &str) -> String {
    format!("\"{}\"", q.replace('"', "\"\""))
}

impl Db {
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).with_context(|| format!("DBを開けません: {}", path.display()))?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    #[cfg(test)]
    pub fn memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    // ---------- アカウント ----------

    pub fn accounts(&self) -> Result<Vec<Account>> {
        let conn = self.conn.lock();
        let mut st = conn.prepare(
            "SELECT id, provider, email, name, color, signature FROM accounts ORDER BY sort, rowid",
        )?;
        let rows = st.query_map([], |r| {
            Ok(Account {
                id: r.get(0)?,
                provider: Provider::parse(&r.get::<_, String>(1)?).unwrap_or(Provider::Gmail),
                email: r.get(2)?,
                name: r.get(3)?,
                color: r.get(4)?,
                signature: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn account(&self, id: &str) -> Result<Account> {
        self.accounts()?
            .into_iter()
            .find(|a| a.id == id)
            .context("アカウントが見つかりません")
    }

    pub fn insert_account(&self, a: &Account) -> Result<()> {
        let conn = self.conn.lock();
        let sort: i64 = conn.query_row("SELECT COALESCE(MAX(sort),0)+1 FROM accounts", [], |r| r.get(0))?;
        conn.execute(
            "INSERT INTO accounts (id, provider, email, name, color, signature, sort) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            params![a.id, a.provider.as_str(), a.email, a.name, a.color, a.signature, sort],
        )?;
        Ok(())
    }

    pub fn update_account(&self, id: &str, name: &str, signature: &str, color: i64) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE accounts SET name=?2, signature=?3, color=?4 WHERE id=?1",
            params![id, name, signature, color],
        )?;
        Ok(())
    }

    pub fn delete_account(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE account_id=?1)",
            params![id],
        )?;
        conn.execute("DELETE FROM messages WHERE account_id=?1", params![id])?;
        conn.execute("DELETE FROM mailboxes WHERE account_id=?1", params![id])?;
        conn.execute("DELETE FROM accounts WHERE id=?1", params![id])?;
        Ok(())
    }

    // ---------- メールボックス ----------

    pub fn replace_mailboxes(&self, account_id: &str, list: &[(String, String, String)]) -> Result<()> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        {
            let mut up = tx.prepare(
                "INSERT INTO mailboxes (account_id, path, name, role) VALUES (?1,?2,?3,?4)
                 ON CONFLICT(account_id, path) DO UPDATE SET name=excluded.name, role=excluded.role",
            )?;
            for (path, name, role) in list {
                up.execute(params![account_id, path, name, role])?;
            }
        }
        // サーバーから消えたフォルダを削除
        let existing: Vec<String> = {
            let mut st = tx.prepare("SELECT path FROM mailboxes WHERE account_id=?1")?;
            let v = st
                .query_map(params![account_id], |r| r.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            v
        };
        for path in existing {
            if !list.iter().any(|(p, _, _)| *p == path) {
                tx.execute(
                    "DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE account_id=?1 AND mailbox=?2)",
                    params![account_id, path],
                )?;
                tx.execute("DELETE FROM messages WHERE account_id=?1 AND mailbox=?2", params![account_id, path])?;
                tx.execute("DELETE FROM mailboxes WHERE account_id=?1 AND path=?2", params![account_id, path])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn mailboxes(&self) -> Result<Vec<MailboxInfo>> {
        let conn = self.conn.lock();
        let mut st = conn.prepare(
            "SELECT m.account_id, m.path, m.name, m.role, m.unread, m.total FROM mailboxes m
             JOIN accounts a ON a.id = m.account_id ORDER BY a.sort, m.path",
        )?;
        let rows = st.query_map([], |r| {
            Ok(MailboxInfo {
                account_id: r.get(0)?,
                path: r.get(1)?,
                name: r.get(2)?,
                role: r.get(3)?,
                unread: r.get(4)?,
                total: r.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    pub fn mailbox_by_role(&self, account_id: &str, role: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .lock()
            .query_row(
                "SELECT path FROM mailboxes WHERE account_id=?1 AND role=?2 LIMIT 1",
                params![account_id, role],
                |r| r.get(0),
            )
            .optional()?)
    }

    pub fn mailbox_role(&self, account_id: &str, path: &str) -> Result<String> {
        Ok(self
            .conn
            .lock()
            .query_row(
                "SELECT role FROM mailboxes WHERE account_id=?1 AND path=?2",
                params![account_id, path],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or_else(|| "custom".into()))
    }

    /// (uidvalidity, exhausted)
    pub fn mailbox_state(&self, account_id: &str, path: &str) -> Result<(u32, bool)> {
        Ok(self
            .conn
            .lock()
            .query_row(
                "SELECT uidvalidity, exhausted FROM mailboxes WHERE account_id=?1 AND path=?2",
                params![account_id, path],
                |r| Ok((r.get::<_, i64>(0)? as u32, r.get::<_, i64>(1)? != 0)),
            )
            .optional()?
            .unwrap_or((0, false)))
    }

    pub fn set_mailbox_state(&self, account_id: &str, path: &str, uidvalidity: u32, uidnext: u32) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE mailboxes SET uidvalidity=?3, uidnext=?4 WHERE account_id=?1 AND path=?2",
            params![account_id, path, uidvalidity as i64, uidnext as i64],
        )?;
        Ok(())
    }

    pub fn set_exhausted(&self, account_id: &str, path: &str, v: bool) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE mailboxes SET exhausted=?3 WHERE account_id=?1 AND path=?2",
            params![account_id, path, v as i64],
        )?;
        Ok(())
    }

    pub fn set_counts(&self, account_id: &str, path: &str, unread: u32, total: u32) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE mailboxes SET unread=?3, total=?4 WHERE account_id=?1 AND path=?2",
            params![account_id, path, unread as i64, total as i64],
        )?;
        Ok(())
    }

    pub fn adjust_unread(&self, account_id: &str, path: &str, delta: i64) -> Result<()> {
        self.conn.lock().execute(
            "UPDATE mailboxes SET unread=MAX(0, unread + ?3) WHERE account_id=?1 AND path=?2",
            params![account_id, path, delta],
        )?;
        Ok(())
    }

    pub fn clear_mailbox(&self, account_id: &str, path: &str) -> Result<()> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE account_id=?1 AND mailbox=?2)",
            params![account_id, path],
        )?;
        conn.execute("DELETE FROM messages WHERE account_id=?1 AND mailbox=?2", params![account_id, path])?;
        conn.execute(
            "UPDATE mailboxes SET exhausted=0 WHERE account_id=?1 AND path=?2",
            params![account_id, path],
        )?;
        Ok(())
    }

    // ---------- メッセージ（同期） ----------

    pub fn cached_uids(&self, account_id: &str, path: &str) -> Result<Vec<u32>> {
        let conn = self.conn.lock();
        let mut st = conn.prepare("SELECT uid FROM messages WHERE account_id=?1 AND mailbox=?2 ORDER BY uid")?;
        let v = st
            .query_map(params![account_id, path], |r| Ok(r.get::<_, i64>(0)? as u32))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(v)
    }

    pub fn insert_message(
        &self,
        account_id: &str,
        path: &str,
        uid: u32,
        flags: &Flags,
        size: u32,
        p: &ParsedMail,
    ) -> Result<i64> {
        let thread_key = mime::thread_key(p);
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        tx.execute(
            "INSERT INTO messages (account_id, mailbox, uid, message_id, thread_key, subject, from_name, from_addr,
               to_json, cc_json, reply_to_json, date, snippet, seen, flagged, answered, draft, has_attach, size,
               has_body, text_body, html_body, attachments_json, in_reply_to, refs, list_unsubscribe)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24,?25,?26)
             ON CONFLICT(account_id, mailbox, uid) DO NOTHING",
            params![
                account_id,
                path,
                uid as i64,
                p.message_id,
                thread_key,
                p.subject,
                p.from_name,
                p.from_addr,
                serde_json::to_string(&p.to)?,
                serde_json::to_string(&p.cc)?,
                serde_json::to_string(&p.reply_to)?,
                p.date,
                p.snippet,
                flags.seen as i64,
                flags.flagged as i64,
                flags.answered as i64,
                flags.draft as i64,
                p.attachments.iter().any(|a| !a.inline) as i64,
                size as i64,
                p.has_body as i64,
                p.text,
                p.html,
                serde_json::to_string(&p.attachments)?,
                p.in_reply_to,
                p.references,
                p.list_unsubscribe,
            ],
        )?;
        let id = tx.last_insert_rowid();
        if tx.changes() > 0 {
            Self::index_fts(&tx, id, p)?;
        }
        tx.commit()?;
        Ok(id)
    }

    fn index_fts(conn: &Connection, id: i64, p: &ParsedMail) -> Result<()> {
        let people = std::iter::once(format!("{} {}", p.from_name, p.from_addr))
            .chain(p.to.iter().chain(p.cc.iter()).map(|a| format!("{} {}", a.name, a.email)))
            .collect::<Vec<_>>()
            .join(" ");
        let body_src = if !p.text.is_empty() {
            p.text.clone()
        } else if !p.html.is_empty() {
            mail_parser::decoders::html::html_to_text(&p.html)
        } else {
            p.snippet.clone()
        };
        let body: String = body_src.chars().take(30_000).collect();
        conn.execute("DELETE FROM messages_fts WHERE rowid=?1", params![id])?;
        conn.execute(
            "INSERT INTO messages_fts (rowid, subject, people, body) VALUES (?1,?2,?3,?4)",
            params![id, p.subject, people, body],
        )?;
        Ok(())
    }

    pub fn update_body(&self, id: i64, p: &ParsedMail) -> Result<()> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE messages SET has_body=1, text_body=?2, html_body=?3, attachments_json=?4, snippet=?5,
               has_attach=?6 WHERE id=?1",
            params![
                id,
                p.text,
                p.html,
                serde_json::to_string(&p.attachments)?,
                p.snippet,
                p.attachments.iter().any(|a| !a.inline) as i64
            ],
        )?;
        Self::index_fts(&tx, id, p)?;
        tx.commit()?;
        Ok(())
    }

    /// サーバー側のフラグを反映。戻り値は変化があったか
    pub fn sync_flags(&self, account_id: &str, path: &str, uid: u32, f: &Flags) -> Result<bool> {
        let n = self.conn.lock().execute(
            "UPDATE messages SET seen=?4, flagged=?5, answered=?6
             WHERE account_id=?1 AND mailbox=?2 AND uid=?3 AND (seen<>?4 OR flagged<>?5 OR answered<>?6)",
            params![account_id, path, uid as i64, f.seen as i64, f.flagged as i64, f.answered as i64],
        )?;
        Ok(n > 0)
    }

    pub fn delete_uids(&self, account_id: &str, path: &str, uids: &[u32]) -> Result<()> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        for uid in uids {
            tx.execute(
                "DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE account_id=?1 AND mailbox=?2 AND uid=?3)",
                params![account_id, path, *uid as i64],
            )?;
            tx.execute(
                "DELETE FROM messages WHERE account_id=?1 AND mailbox=?2 AND uid=?3",
                params![account_id, path, *uid as i64],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn delete_ids(&self, ids: &[i64]) -> Result<()> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        for id in ids {
            tx.execute("DELETE FROM messages_fts WHERE rowid=?1", params![id])?;
            tx.execute("DELETE FROM messages WHERE id=?1", params![id])?;
        }
        tx.commit()?;
        Ok(())
    }

    // ---------- メッセージ（UI） ----------

    /// (id, account_id, mailbox, uid, seen, flagged)
    pub fn locate(&self, id: i64) -> Result<(String, String, u32, bool, bool)> {
        self.conn
            .lock()
            .query_row(
                "SELECT account_id, mailbox, uid, seen, flagged FROM messages WHERE id=?1",
                params![id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get::<_, i64>(2)? as u32,
                        r.get::<_, i64>(3)? != 0,
                        r.get::<_, i64>(4)? != 0,
                    ))
                },
            )
            .optional()?
            .context("メッセージが見つかりません")
    }

    pub fn has_body(&self, id: i64) -> Result<bool> {
        Ok(self
            .conn
            .lock()
            .query_row("SELECT has_body FROM messages WHERE id=?1", params![id], |r| r.get::<_, i64>(0))?
            != 0)
    }

    pub fn set_local_flag(&self, ids: &[i64], column: &str, value: bool) -> Result<()> {
        let col = match column {
            "seen" | "flagged" | "answered" => column,
            _ => anyhow::bail!("unknown flag"),
        };
        let conn = self.conn.lock();
        for id in ids {
            conn.execute(&format!("UPDATE messages SET {col}=?2 WHERE id=?1"), params![id, value as i64])?;
        }
        Ok(())
    }

    pub fn detail(&self, id: i64) -> Result<MessageDetail> {
        let conn = self.conn.lock();
        let row = conn.query_row(
            &format!(
                "SELECT {SUMMARY_COLS}, message_id, to_json, cc_json, reply_to_json, text_body, html_body,
                   attachments_json, refs, list_unsubscribe, in_reply_to FROM messages WHERE id=?1"
            ),
            params![id],
            |r| {
                let summary = summary_from_row(r, 1)?;
                Ok((
                    summary,
                    r.get::<_, String>(15)?,
                    r.get::<_, String>(16)?,
                    r.get::<_, String>(17)?,
                    r.get::<_, String>(18)?,
                    r.get::<_, String>(19)?,
                    r.get::<_, String>(20)?,
                    r.get::<_, String>(21)?,
                    r.get::<_, String>(22)?,
                    r.get::<_, String>(23)?,
                    r.get::<_, String>(24)?,
                ))
            },
        )?;
        let (summary, message_id, to, cc, reply_to, text, html, att, refs, unsub, irt) = row;
        let role: String = conn
            .query_row(
                "SELECT role FROM mailboxes WHERE account_id=?1 AND path=?2",
                params![summary.account_id, summary.mailbox],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or_else(|| "custom".into());
        // 返信用の References：自分の References + 自分の Message-ID
        let mut references = refs;
        if references.is_empty() && !irt.is_empty() {
            references = format!("<{irt}>");
        }
        Ok(MessageDetail {
            summary,
            message_id,
            to: serde_json::from_str(&to).unwrap_or_default(),
            cc: serde_json::from_str(&cc).unwrap_or_default(),
            reply_to: serde_json::from_str(&reply_to).unwrap_or_default(),
            text,
            html,
            attachments: serde_json::from_str(&att).unwrap_or_default(),
            references,
            list_unsubscribe: unsub,
            mailbox_role: role,
        })
    }

    /// 同じスレッドのメッセージID（重複は Message-ID 単位で除外、古い順）
    pub fn thread_ids(&self, id: i64) -> Result<Vec<i64>> {
        let conn = self.conn.lock();
        let (account_id, key): (String, String) = conn.query_row(
            "SELECT account_id, thread_key FROM messages WHERE id=?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let mut st = conn.prepare(
            "SELECT m.id FROM messages m
             LEFT JOIN mailboxes b ON b.account_id = m.account_id AND b.path = m.mailbox
             WHERE m.account_id=?1 AND (m.thread_key=?2 OR m.message_id=?2)
               AND COALESCE(b.role,'custom') NOT IN ('trash','junk')
             ORDER BY m.date ASC,
               CASE b.role WHEN 'inbox' THEN 0 WHEN 'sent' THEN 1 WHEN 'all' THEN 3 ELSE 2 END",
        )?;
        let ids: Vec<i64> = st
            .query_map(params![account_id, key], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        // Message-ID の重複を除く（Gmail の受信トレイとすべてのメール等）
        let mut seen = std::collections::HashSet::new();
        let mut out = Vec::new();
        for i in ids {
            let mid: String = conn.query_row("SELECT message_id FROM messages WHERE id=?1", params![i], |r| r.get(0))?;
            if mid.is_empty() || seen.insert(mid) {
                out.push(i);
            }
        }
        if !out.contains(&id) {
            out.push(id);
        }
        Ok(out)
    }

    pub fn list(&self, q: &ViewQuery) -> Result<Vec<MessageSummary>> {
        let limit = q.limit.unwrap_or(200).clamp(1, 2000);
        let offset = q.offset.unwrap_or(0).max(0);
        let search = q.search.as_deref().map(str::trim).filter(|s| !s.is_empty());

        let mut where_: Vec<String> = Vec::new();
        let mut args: Vec<rusqlite::types::Value> = Vec::new();
        // メールボックスの役割は JOIN で引く（行ごとの副問い合わせは件数が増えると重い）
        let role_of = "b.role";

        if q.kind == "mailbox" {
            where_.push("m.account_id = ?".into());
            args.push(q.account_id.clone().unwrap_or_default().into());
            where_.push("m.mailbox = ?".into());
            args.push(q.path.clone().unwrap_or_default().into());
        } else if search.is_some() {
            where_.push(format!("COALESCE({role_of},'custom') NOT IN ('trash','junk')"));
        } else {
            match q.role.as_deref().unwrap_or("inbox") {
                "flagged" => {
                    where_.push("m.flagged = 1".into());
                    where_.push(format!("COALESCE({role_of},'custom') NOT IN ('trash','junk')"));
                }
                "unread" => {
                    where_.push("m.seen = 0".into());
                    where_.push(format!("{role_of} = 'inbox'"));
                }
                "attachments" => {
                    where_.push("m.has_attach = 1".into());
                    where_.push(format!("COALESCE({role_of},'custom') NOT IN ('trash','junk')"));
                }
                role => {
                    where_.push(format!("{role_of} = ?"));
                    args.push(role.to_string().into());
                }
            }
            if let Some(acc) = &q.account_id {
                where_.push("m.account_id = ?".into());
                args.push(acc.clone().into());
            }
        }

        if let Some(s) = search {
            let chars = s.chars().count();
            if chars >= 3 {
                where_.push("m.id IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)".into());
                args.push(fts_phrase(s).into());
            } else {
                where_.push(
                    "(m.subject LIKE ? OR m.from_name LIKE ? OR m.from_addr LIKE ? OR m.snippet LIKE ?)".into(),
                );
                let like = format!("%{}%", s.replace('%', "\\%"));
                for _ in 0..4 {
                    args.push(like.clone().into());
                }
            }
        }

        let where_sql = if where_.is_empty() { "1=1".to_string() } else { where_.join(" AND ") };

        // 1) Message-ID 単位で重複除去 2) スレッド単位で最新1件に集約
        let sql = format!(
            "WITH v AS (
               SELECT m.*, ROW_NUMBER() OVER (
                 PARTITION BY m.account_id, CASE WHEN m.message_id='' THEN 'id:'||m.id ELSE m.message_id END
                 ORDER BY CASE {role_of} WHEN 'inbox' THEN 0 WHEN 'all' THEN 2 ELSE 1 END) AS dup
               FROM messages m LEFT JOIN mailboxes b ON b.account_id = m.account_id AND b.path = m.mailbox
               WHERE {where_sql}
             ),
             t AS (
               SELECT v.*,
                 ROW_NUMBER() OVER (PARTITION BY account_id, thread_key ORDER BY date DESC) AS rn,
                 COUNT(*) OVER (PARTITION BY account_id, thread_key) AS cnt,
                 MIN(seen) OVER (PARTITION BY account_id, thread_key) AS all_seen,
                 MAX(flagged) OVER (PARTITION BY account_id, thread_key) AS any_flag,
                 MAX(has_attach) OVER (PARTITION BY account_id, thread_key) AS any_att
               FROM v WHERE dup = 1
             )
             SELECT id, account_id, mailbox, uid, subject, from_name, from_addr, to_json, date, snippet,
                    all_seen, any_flag, answered, any_att, thread_key, cnt
             FROM t WHERE rn = 1 ORDER BY date DESC LIMIT {limit} OFFSET {offset}"
        );

        let conn = self.conn.lock();
        let mut st = conn.prepare(&sql)?;
        let rows = st.query_map(rusqlite::params_from_iter(args.iter()), |r| {
            let cnt: i64 = r.get(15)?;
            summary_from_row(r, cnt)
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// 宛先候補（過去にやり取りした相手）
    pub fn contacts(&self, prefix: &str) -> Result<Vec<AddressInfo>> {
        let like = format!("%{}%", prefix.replace('%', "\\%"));
        let conn = self.conn.lock();
        let mut st = conn.prepare(
            "SELECT from_name, from_addr, COUNT(*) c FROM messages
             WHERE from_addr <> '' AND (from_addr LIKE ?1 OR from_name LIKE ?1)
             GROUP BY lower(from_addr) ORDER BY c DESC LIMIT 8",
        )?;
        let rows = st.query_map(params![like], |r| {
            Ok(AddressInfo { name: r.get(0)?, email: r.get(1)? })
        })?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    // ---------- 設定 ----------

    pub fn setting(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .lock()
            .query_row("SELECT value FROM settings WHERE key=?1", params![key], |r| r.get(0))
            .optional()?)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.lock().execute(
            "INSERT INTO settings (key, value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn trusted(&self, addr: &str) -> Result<bool> {
        Ok(self
            .conn
            .lock()
            .query_row(
                "SELECT 1 FROM trusted_senders WHERE addr=lower(?1)",
                params![addr],
                |_| Ok(()),
            )
            .optional()?
            .is_some())
    }

    pub fn set_trusted(&self, addr: &str, v: bool) -> Result<()> {
        let conn = self.conn.lock();
        if v {
            conn.execute("INSERT OR IGNORE INTO trusted_senders (addr) VALUES (lower(?1))", params![addr])?;
        } else {
            conn.execute("DELETE FROM trusted_senders WHERE addr=lower(?1)", params![addr])?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mail(subject: &str, mid: &str, refs: &str, date: i64) -> ParsedMail {
        ParsedMail {
            message_id: mid.into(),
            subject: subject.into(),
            from_name: "山田 太郎".into(),
            from_addr: "taro@example.jp".into(),
            date,
            snippet: "本文のプレビューです".into(),
            text: "来週の打ち合わせについてご相談です".into(),
            references: refs.into(),
            has_body: true,
            ..Default::default()
        }
    }

    #[test]
    fn list_groups_threads_and_searches_japanese() {
        let db = Db::memory().unwrap();
        db.insert_account(&Account {
            id: "a".into(),
            provider: Provider::Gmail,
            email: "me@gmail.com".into(),
            name: "Me".into(),
            color: 0,
            signature: String::new(),
        })
        .unwrap();
        db.replace_mailboxes(
            "a",
            &[
                ("INBOX".into(), "受信".into(), "inbox".into()),
                ("[Gmail]/All Mail".into(), "すべて".into(), "all".into()),
            ],
        )
        .unwrap();
        let f = Flags { seen: false, flagged: false, answered: false, draft: false };
        db.insert_message("a", "INBOX", 1, &f, 10, &mail("打ち合わせ", "m1", "", 100)).unwrap();
        db.insert_message("a", "INBOX", 2, &f, 10, &mail("Re: 打ち合わせ", "m2", "<m1>", 200)).unwrap();
        // 同じメールが すべてのメール にもある
        db.insert_message("a", "[Gmail]/All Mail", 9, &f, 10, &mail("Re: 打ち合わせ", "m2", "<m1>", 200)).unwrap();
        db.insert_message("a", "INBOX", 3, &f, 10, &mail("別件", "m3", "", 150)).unwrap();

        let q = ViewQuery {
            kind: "unified".into(),
            role: Some("inbox".into()),
            account_id: None,
            path: None,
            search: None,
            limit: None,
            offset: None,
        };
        let list = db.list(&q).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].subject, "Re: 打ち合わせ");
        assert_eq!(list[0].thread_count, 2);

        let mut s = q.clone();
        s.search = Some("別件".into());
        let found = db.list(&s).unwrap();
        assert_eq!(found.len(), 1);

        let thread = db.thread_ids(list[0].id).unwrap();
        assert_eq!(thread.len(), 2);
    }
}
