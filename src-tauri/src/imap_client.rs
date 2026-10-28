//! IMAP 接続まわりの薄いラッパー（Gmail / iCloud 共通）。

use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use async_imap::imap_proto::NameAttribute;
use async_imap::types::{Fetch, Flag};
use futures::TryStreamExt;
use tokio::net::TcpStream;
use tokio_rustls::rustls::{pki_types::ServerName, ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

use crate::db::Flags;
use crate::model::Provider;

pub type Stream = tokio_rustls::client::TlsStream<TcpStream>;
pub type Session = async_imap::Session<Stream>;

fn tls() -> TlsConnector {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    TlsConnector::from(Arc::new(config))
}

/// ログインに使う資格情報
#[derive(Clone)]
pub enum Credential {
    /// アプリ用パスワード
    Password(String),
    /// Google でサインインして得たアクセストークン（XOAUTH2）
    OAuth(String),
}

struct XOAuth2 {
    email: String,
    token: String,
}

impl async_imap::Authenticator for XOAuth2 {
    type Response = String;
    fn process(&mut self, _challenge: &[u8]) -> String {
        format!("user={}\x01auth=Bearer {}\x01\x01", self.email, self.token)
    }
}

/// サーバーに接続してログインする
pub async fn connect(provider: Provider, email: &str, credential: &Credential) -> Result<Session> {
    let (host, port) = provider.imap_host();
    let tcp = tokio::time::timeout(std::time::Duration::from_secs(20), TcpStream::connect((host, port)))
        .await
        .map_err(|_| anyhow!("{host} への接続がタイムアウトしました"))?
        .with_context(|| format!("{host} に接続できません"))?;
    tcp.set_nodelay(true).ok();
    let name = ServerName::try_from(host.to_string())?;
    let stream = tls().connect(name, tcp).await.context("TLS接続に失敗しました")?;

    let mut client = async_imap::Client::new(stream);
    client
        .read_response()
        .await?
        .ok_or_else(|| anyhow!("サーバーから応答がありません"))?;

    let password = match credential {
        Credential::OAuth(token) => {
            let auth = XOAuth2 { email: email.trim().to_string(), token: token.clone() };
            return client.authenticate("XOAUTH2", auth).await.map_err(|(e, _)| {
                anyhow!("Google のサインインで接続できませんでした。大学・会社のアカウントでは、管理者が IMAP やこのアプリの利用を止めている可能性があります（{e}）")
            });
        }
        // アプリ用パスワードはスペース区切りで表示されるので取り除く
        Credential::Password(p) => p.chars().filter(|c| !c.is_whitespace()).collect::<String>(),
    };
    let session = client.login(email.trim(), &password).await.map_err(|(e, _)| {
        let msg = e.to_string();
        if msg.contains("AUTHENTICATIONFAILED") || msg.to_lowercase().contains("invalid credentials") || msg.contains("NO") {
            anyhow!("ログインできませんでした。メールアドレスとアプリ用パスワードを確認してください（{msg}）")
        } else {
            anyhow!("ログインエラー: {msg}")
        }
    })?;
    Ok(session)
}

/// IMAP の修正 UTF-7（RFC 3501 5.1.3）を UTF-8 にする。日本語のラベル名などで使われる。
pub fn decode_mutf7(s: &str) -> String {
    use base64::Engine;
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '&' {
            out.push(c);
            continue;
        }
        let mut enc = String::new();
        for d in chars.by_ref() {
            if d == '-' {
                break;
            }
            enc.push(if d == ',' { '/' } else { d });
        }
        if enc.is_empty() {
            out.push('&');
            continue;
        }
        let bytes = base64::engine::general_purpose::STANDARD_NO_PAD
            .decode(enc.trim_end_matches('='))
            .unwrap_or_default();
        let units: Vec<u16> = bytes.chunks(2).filter(|c| c.len() == 2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        out.push_str(&String::from_utf16_lossy(&units));
    }
    out
}

/// メールボックス一覧 (path, 表示名, 役割)
pub async fn list_mailboxes(session: &mut Session, provider: Provider) -> Result<Vec<(String, String, String)>> {
    let names: Vec<_> = session.list(Some(""), Some("*")).await?.try_collect().await?;
    let mut out = Vec::new();
    for n in &names {
        let attrs = n.attributes();
        if attrs.iter().any(|a| matches!(a, NameAttribute::NoSelect)) {
            continue;
        }
        let path = n.name().to_string();
        let mut role = attrs
            .iter()
            .find_map(|a| match a {
                NameAttribute::All => Some("all"),
                NameAttribute::Archive => Some("archive"),
                NameAttribute::Drafts => Some("drafts"),
                NameAttribute::Flagged => Some("flagged"),
                NameAttribute::Junk => Some("junk"),
                NameAttribute::Sent => Some("sent"),
                NameAttribute::Trash => Some("trash"),
                _ => None,
            })
            .unwrap_or("custom")
            .to_string();
        if path.eq_ignore_ascii_case("INBOX") {
            role = "inbox".into();
        }
        if role == "custom" {
            // SPECIAL-USE が無いサーバー向けの名前による推測
            role = match path.to_ascii_lowercase().as_str() {
                "sent" | "sent messages" | "sent items" => "sent",
                "trash" | "deleted messages" | "deleted items" => "trash",
                "junk" | "spam" | "bulk mail" => "junk",
                "archive" => "archive",
                "drafts" => "drafts",
                _ => "custom",
            }
            .into();
        }
        if provider == Provider::Gmail && path.eq_ignore_ascii_case("[Gmail]/Important") {
            role = "important".into();
        }
        let delim = n.delimiter().unwrap_or("/");
        let display = decode_mutf7(path.rsplit(delim).next().unwrap_or(&path));
        out.push((path, display, role));
    }
    Ok(out)
}

pub fn flags_of(f: &Fetch) -> Flags {
    let mut flags = Flags { seen: false, flagged: false, answered: false, draft: false };
    for fl in f.flags() {
        match fl {
            Flag::Seen => flags.seen = true,
            Flag::Flagged => flags.flagged = true,
            Flag::Answered => flags.answered = true,
            Flag::Draft => flags.draft = true,
            _ => {}
        }
    }
    flags
}

/// UID のリストを "1:5,8,10:12" 形式にまとめる
pub fn uid_set(uids: &[u32]) -> String {
    let mut v = uids.to_vec();
    v.sort_unstable();
    v.dedup();
    let mut parts = Vec::new();
    let mut i = 0;
    while i < v.len() {
        let start = v[i];
        let mut end = start;
        while i + 1 < v.len() && v[i + 1] == end + 1 {
            i += 1;
            end = v[i];
        }
        parts.push(if start == end { start.to_string() } else { format!("{start}:{end}") });
        i += 1;
    }
    parts.join(",")
}

pub struct Meta {
    pub uid: u32,
    pub size: u32,
    pub flags: Flags,
}

pub async fn fetch_meta(session: &mut Session, set: &str, by_uid: bool) -> Result<Vec<Meta>> {
    let fetches: Vec<Fetch> = if by_uid {
        session.uid_fetch(set, "(UID FLAGS RFC822.SIZE)").await?.try_collect().await?
    } else {
        session.fetch(set, "(UID FLAGS RFC822.SIZE)").await?.try_collect().await?
    };
    Ok(fetches
        .iter()
        .filter_map(|f| {
            Some(Meta {
                uid: f.uid?,
                size: f.size.unwrap_or(0),
                flags: flags_of(f),
            })
        })
        .collect())
}

/// UID の本文（BODY.PEEK[]）またはヘッダーのみを取得する
pub async fn fetch_raw(session: &mut Session, uids: &[u32], headers_only: bool) -> Result<Vec<(u32, Vec<u8>)>> {
    if uids.is_empty() {
        return Ok(vec![]);
    }
    let query = if headers_only { "(UID BODY.PEEK[HEADER])" } else { "(UID BODY.PEEK[])" };
    let fetches: Vec<Fetch> = session.uid_fetch(uid_set(uids), query).await?.try_collect().await?;
    Ok(fetches
        .iter()
        .filter_map(|f| {
            let bytes = if headers_only { f.header() } else { f.body() }?;
            Some((f.uid?, bytes.to_vec()))
        })
        .collect())
}

pub async fn store(session: &mut Session, uids: &[u32], query: &str) -> Result<()> {
    if uids.is_empty() {
        return Ok(());
    }
    let _: Vec<Fetch> = session.uid_store(uid_set(uids), query).await?.try_collect().await?;
    Ok(())
}

pub async fn move_uids(session: &mut Session, uids: &[u32], to: &str) -> Result<()> {
    if uids.is_empty() {
        return Ok(());
    }
    let set = uid_set(uids);
    if session.uid_mv(&set, to).await.is_ok() {
        return Ok(());
    }
    // MOVE 非対応サーバー向け
    session.uid_copy(&set, to).await.context("メールの移動に失敗しました")?;
    store(session, uids, "+FLAGS.SILENT (\\Deleted)").await?;
    let _: Vec<_> = session.uid_expunge(&set).await?.try_collect().await?;
    Ok(())
}

pub async fn append(session: &mut Session, mailbox: &str, raw: &[u8], flags: &str) -> Result<()> {
    session
        .append(mailbox, Some(flags), None, raw)
        .await
        .map_err(|e| anyhow!("送信済みへの保存に失敗しました: {e}"))
}

pub async fn select(session: &mut Session, path: &str) -> Result<async_imap::types::Mailbox> {
    session.select(path).await.with_context(|| format!("フォルダ「{path}」を開けません"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uid_ranges() {
        assert_eq!(uid_set(&[5, 1, 2, 3, 8, 10, 11]), "1:3,5,8,10:11");
        assert_eq!(uid_set(&[7]), "7");
    }

    #[test]
    fn mutf7() {
        assert_eq!(decode_mutf7("&ZeVnLIqe-"), "日本語");
        assert_eq!(decode_mutf7("Work/&MMEw4zDDMMg-"), "Work/チャット");
        assert_eq!(decode_mutf7("A&-B"), "A&B");
    }
}
