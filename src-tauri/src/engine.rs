//! 同期エンジン：IMAP とローカルキャッシュをつなぎ、新着をプッシュ（IDLE）で受け取る。

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use futures::future::BoxFuture;
use futures::TryStreamExt;
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::{watch, Mutex as AsyncMutex};

use crate::db::Db;
use crate::imap_client::{self as imap, Session};
use crate::mime;
use crate::model::*;
use crate::secrets;

/// 初回同期で取り込む件数
const WINDOW_INBOX: u32 = 250;
const WINDOW_OTHER: u32 = 60;
const MORE_BATCH: usize = 150;
/// これより大きいメールは開いた時に本文を取りに行く
const EAGER_BODY_LIMIT: u32 = 600 * 1024;
const FETCH_BATCH: usize = 40;
/// 最初のひと塊は小さくして、一覧がすぐに埋まるようにする
const FIRST_BATCH: usize = 12;

type Slot = Arc<AsyncMutex<Option<Session>>>;

pub struct Engine {
    pub db: Arc<Db>,
    app: AppHandle,
    sessions: parking_lot::Mutex<HashMap<String, Slot>>,
    watchers: parking_lot::Mutex<HashMap<String, watch::Sender<bool>>>,
    /// Google のアクセストークン（期限付き）をアカウントごとに覚えておく
    tokens: parking_lot::Mutex<HashMap<String, (String, std::time::Instant)>>,
}

pub struct NewMail {
    pub from: String,
    pub subject: String,
}

impl Engine {
    pub fn new(db: Arc<Db>, app: AppHandle) -> Arc<Self> {
        Arc::new(Self {
            db,
            app,
            sessions: Default::default(),
            watchers: Default::default(),
            tokens: Default::default(),
        })
    }

    /// Google OAuth のクライアント（ユーザーが設定で登録したもの）
    pub fn google_client(&self) -> Result<crate::oauth::GoogleClient> {
        let id = self.db.setting("google_client_id")?.filter(|s| !s.trim().is_empty());
        let secret = self.db.setting("google_client_secret")?.unwrap_or_default();
        let id = id.context("Google でサインインするための設定（クライアント ID）がありません")?;
        Ok(crate::oauth::GoogleClient { id: id.trim().to_string(), secret: secret.trim().to_string() })
    }

    /// 接続に使う資格情報。Google でサインインしたアカウントは、必要ならトークンを更新する
    pub async fn credential(&self, account: &Account) -> Result<imap::Credential> {
        let secret = secrets::get_password(&account.id)?;
        let Some(refresh) = secret.strip_prefix(crate::oauth::REFRESH_PREFIX) else {
            return Ok(imap::Credential::Password(secret));
        };
        if let Some((token, until)) = self.tokens.lock().get(&account.id).cloned() {
            if until > std::time::Instant::now() + Duration::from_secs(120) {
                return Ok(imap::Credential::OAuth(token));
            }
        }
        let client = self.google_client()?;
        let (token, expires) = crate::oauth::access_token(&client, refresh).await?;
        self.tokens.lock().insert(
            account.id.clone(),
            (token.clone(), std::time::Instant::now() + Duration::from_secs(expires)),
        );
        Ok(imap::Credential::OAuth(token))
    }

    fn slot(&self, account_id: &str) -> Slot {
        self.sessions
            .lock()
            .entry(account_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(None)))
            .clone()
    }

    fn status(&self, account_id: &str, state: &str, message: Option<String>) {
        let _ = self.app.emit(
            "sync-status",
            SyncStatus { account_id: account_id.into(), state: state.into(), message },
        );
    }

    fn changed(&self, account_id: &str, mailbox: &str, new_messages: usize) {
        let _ = self.app.emit(
            "mail-changed",
            SyncEvent { account_id: account_id.into(), mailbox: mailbox.into(), new_messages },
        );
    }

    /// アカウントのIMAPセッションを使って処理を実行する。接続が切れていたら1回だけ張り直して再試行。
    pub async fn with_session<T, F>(&self, account: &Account, mut f: F) -> Result<T>
    where
        F: for<'a> FnMut(&'a mut Session) -> BoxFuture<'a, Result<T>>,
    {
        let slot = self.slot(&account.id);
        let mut guard = slot.lock().await;
        for attempt in 0..2 {
            if guard.is_none() {
                let credential = self.credential(account).await?;
                *guard = Some(imap::connect(account.provider, &account.email, &credential).await?);
            }
            let session = guard.as_mut().expect("session");
            match f(session).await {
                Ok(v) => return Ok(v),
                Err(e) => {
                    // 接続エラーっぽいものは張り直してもう一度
                    let msg = format!("{e:#}").to_lowercase();
                    let io_like = msg.contains("connection")
                        || msg.contains("broken pipe")
                        || msg.contains("eof")
                        || msg.contains("io error")
                        || msg.contains("timed out")
                        || msg.contains("bye");
                    *guard = None;
                    if attempt == 0 && io_like {
                        continue;
                    }
                    return Err(e);
                }
            }
        }
        Err(anyhow!("サーバーに接続できません"))
    }

    // ------------------------------------------------------------------
    // 同期
    // ------------------------------------------------------------------

    pub async fn refresh_mailboxes(&self, account: &Account) -> Result<()> {
        let provider = account.provider;
        let list = self
            .with_session(account, |s| Box::pin(async move { imap::list_mailboxes(s, provider).await }))
            .await?;
        self.db.replace_mailboxes(&account.id, &list)?;
        Ok(())
    }

    /// 全フォルダの件数（未読/合計）を更新
    pub async fn refresh_counts(&self, account: &Account) -> Result<()> {
        let paths: Vec<String> = self
            .db
            .mailboxes()?
            .into_iter()
            .filter(|m| m.account_id == account.id)
            .map(|m| m.path)
            .collect();
        let counts = self
            .with_session(account, |s| {
                let paths = paths.clone();
                Box::pin(async move {
                    let mut out = Vec::new();
                    for p in paths {
                        if let Ok(mb) = s.status(&p, "(MESSAGES UNSEEN)").await {
                            out.push((p, mb.unseen.unwrap_or(0), mb.exists));
                        }
                    }
                    Ok(out)
                })
            })
            .await?;
        for (p, unread, total) in counts {
            self.db.set_counts(&account.id, &p, unread, total)?;
        }
        Ok(())
    }

    /// 1つのフォルダを同期する。戻り値は新着（未読）のリスト
    ///
    /// 接続を握りっぱなしにしないよう、段階ごとに区切る：
    /// 1) 一覧とフラグの差分 → 2) 本文を小分けに取得（取るたびに画面へ反映） → 3) 件数
    /// 区切りの間に、メールを開く・既読にするなどの操作が割り込める。
    pub async fn sync_mailbox(&self, account: &Account, path: &str) -> Result<Vec<NewMail>> {
        let db = self.db.clone();
        let account_id = account.id.clone();
        let path_s = path.to_string();
        let role = db.mailbox_role(&account_id, path)?;
        let window = if role == "inbox" { WINDOW_INBOX } else { WINDOW_OTHER };

        // 1) 差分を調べる
        let (fresh, first_sync, validity, uid_next, exists, mut changed) = self
            .with_session(account, |s| {
                let db = db.clone();
                let account_id = account_id.clone();
                let path = path_s.clone();
                Box::pin(async move {
                    let mb = imap::select(s, &path).await?;
                    let validity = mb.uid_validity.unwrap_or(0);
                    let (stored_validity, _) = db.mailbox_state(&account_id, &path)?;
                    if stored_validity != 0 && stored_validity != validity {
                        db.clear_mailbox(&account_id, &path)?;
                    }
                    let cached = db.cached_uids(&account_id, &path)?;
                    let first_sync = cached.is_empty();
                    let mut changed = false;

                    let metas = if first_sync {
                        if mb.exists == 0 {
                            vec![]
                        } else {
                            let start = mb.exists.saturating_sub(window - 1).max(1);
                            imap::fetch_meta(s, &format!("{start}:{}", mb.exists), false).await?
                        }
                    } else {
                        imap::fetch_meta(s, &format!("{}:*", cached[0]), true).await?
                    };

                    let max_cached = cached.last().copied().unwrap_or(0);
                    let server: HashSet<u32> = metas.iter().map(|m| m.uid).collect();
                    if !first_sync {
                        for m in metas.iter().filter(|m| m.uid <= max_cached) {
                            changed |= db.sync_flags(&account_id, &path, m.uid, &m.flags)?;
                        }
                        let vanished: Vec<u32> = cached.iter().copied().filter(|u| !server.contains(u)).collect();
                        if !vanished.is_empty() {
                            db.delete_uids(&account_id, &path, &vanished)?;
                            changed = true;
                        }
                    }
                    let mut fresh: Vec<imap::Meta> = metas.into_iter().filter(|m| m.uid > max_cached).collect();
                    fresh.sort_by(|a, b| b.uid.cmp(&a.uid));
                    Ok((fresh, first_sync, validity, mb.uid_next.unwrap_or(0), mb.exists, changed))
                })
            })
            .await?;

        if changed {
            self.changed(&account.id, path, 0);
        }

        // 2) 新しい順に、小分けで本文を取得
        let mut new_mail = Vec::new();
        let mut offset = 0;
        while offset < fresh.len() {
            let size = if offset == 0 { FIRST_BATCH } else { FETCH_BATCH };
            let chunk = &fresh[offset..(offset + size).min(fresh.len())];
            offset += chunk.len();
            let full: Vec<u32> = chunk.iter().filter(|m| m.size <= EAGER_BODY_LIMIT).map(|m| m.uid).collect();
            let heads: Vec<u32> = chunk.iter().filter(|m| m.size > EAGER_BODY_LIMIT).map(|m| m.uid).collect();
            let raws = self
                .with_session(account, |s| {
                    let path = path_s.clone();
                    let full = full.clone();
                    let heads = heads.clone();
                    Box::pin(async move {
                        imap::select(s, &path).await?;
                        let mut raws: HashMap<u32, (Vec<u8>, bool)> = HashMap::new();
                        for (uid, raw) in imap::fetch_raw(s, &full, false).await? {
                            raws.insert(uid, (raw, true));
                        }
                        for (uid, raw) in imap::fetch_raw(s, &heads, true).await? {
                            raws.insert(uid, (raw, false));
                        }
                        Ok(raws)
                    })
                })
                .await?;
            // 解析は接続の外で行う
            let mut raws = raws;
            for m in chunk {
                let Some((raw, has_body)) = raws.remove(&m.uid) else { continue };
                let parsed = mime::parse(&raw, has_body);
                db.insert_message(&account_id, path, m.uid, &m.flags, m.size, &parsed)?;
                if !first_sync && !m.flags.seen {
                    new_mail.push(NewMail {
                        from: if parsed.from_name.is_empty() { parsed.from_addr.clone() } else { parsed.from_name.clone() },
                        subject: parsed.subject.clone(),
                    });
                }
            }
            changed = true;
            self.changed(&account.id, path, 0);
            tokio::task::yield_now().await;
        }

        // 3) 状態と件数
        let unseen = self
            .with_session(account, |s| {
                let path = path_s.clone();
                Box::pin(async move {
                    imap::select(s, &path).await?;
                    Ok(s.uid_search("UNSEEN").await.map(|v| v.len() as u32).unwrap_or(0))
                })
            })
            .await
            .unwrap_or(0);
        db.set_mailbox_state(&account_id, path, validity, uid_next)?;
        db.set_counts(&account_id, path, unseen, exists)?;

        self.changed(&account.id, path, if changed { new_mail.len() } else { 0 });
        Ok(new_mail)
    }

    /// 古いメールをさらに読み込む
    pub async fn load_more(&self, account: &Account, path: &str) -> Result<usize> {
        let db = self.db.clone();
        let account_id = account.id.clone();
        let path_s = path.to_string();
        let added = self
            .with_session(account, |s| {
                let db = db.clone();
                let account_id = account_id.clone();
                let path = path_s.clone();
                Box::pin(async move {
                    imap::select(s, &path).await?;
                    let cached = db.cached_uids(&account_id, &path)?;
                    let min = cached.first().copied().unwrap_or(u32::MAX);
                    if min <= 1 {
                        db.set_exhausted(&account_id, &path, true)?;
                        return Ok(0);
                    }
                    let older = s.uid_search(format!("UID 1:{}", min - 1)).await?;
                    let mut older: Vec<u32> = older.into_iter().filter(|u| *u < min).collect();
                    older.sort_unstable_by(|a, b| b.cmp(a));
                    older.truncate(MORE_BATCH);
                    if older.is_empty() {
                        db.set_exhausted(&account_id, &path, true)?;
                        return Ok(0);
                    }
                    let metas = imap::fetch_meta(s, &imap::uid_set(&older), true).await?;
                    let mut added = 0;
                    for chunk in metas.chunks(FETCH_BATCH) {
                        let full: Vec<u32> = chunk.iter().filter(|m| m.size <= EAGER_BODY_LIMIT).map(|m| m.uid).collect();
                        let heads: Vec<u32> = chunk.iter().filter(|m| m.size > EAGER_BODY_LIMIT).map(|m| m.uid).collect();
                        let mut raws: HashMap<u32, (Vec<u8>, bool)> = HashMap::new();
                        for (uid, raw) in imap::fetch_raw(s, &full, false).await? {
                            raws.insert(uid, (raw, true));
                        }
                        for (uid, raw) in imap::fetch_raw(s, &heads, true).await? {
                            raws.insert(uid, (raw, false));
                        }
                        for m in chunk {
                            if let Some((raw, has_body)) = raws.remove(&m.uid) {
                                let parsed = mime::parse(&raw, has_body);
                                db.insert_message(&account_id, &path, m.uid, &m.flags, m.size, &parsed)?;
                                added += 1;
                            }
                        }
                    }
                    Ok(added)
                })
            })
            .await?;
        self.changed(&account.id, path, 0);
        Ok(added)
    }

    /// `full` が false なら受信トレイだけ（新着プッシュ時）。true なら送信済み・アーカイブと件数も
    pub async fn sync_account(&self, account: &Account, notify: bool, full: bool) -> Result<()> {
        self.status(&account.id, "syncing", None);
        let result: Result<()> = async {
            if self.db.mailbox_by_role(&account.id, "inbox")?.is_none() {
                self.refresh_mailboxes(account).await?;
            }
            let inbox = self
                .db
                .mailbox_by_role(&account.id, "inbox")?
                .unwrap_or_else(|| "INBOX".into());
            let fresh = self.sync_mailbox(account, &inbox).await?;
            if notify {
                self.notify(account, &fresh);
            }
            if full {
                // 送信済み・アーカイブは返信スレッドの表示に使うので軽く同期
                for role in ["sent", "archive"] {
                    if let Some(p) = self.db.mailbox_by_role(&account.id, role)? {
                        let _ = self.sync_mailbox(account, &p).await;
                    }
                }
                let _ = self.refresh_counts(account).await;
            }
            Ok(())
        }
        .await;
        match &result {
            Ok(_) => self.status(&account.id, "idle", None),
            Err(e) => self.status(&account.id, "error", Some(format!("{e:#}"))),
        }
        result
    }

    fn notify(&self, account: &Account, fresh: &[NewMail]) {
        if fresh.is_empty() {
            return;
        }
        if self.db.setting("notifications").ok().flatten().as_deref() == Some("off") {
            return;
        }
        let (title, body) = if fresh.len() == 1 {
            (fresh[0].from.clone(), fresh[0].subject.clone())
        } else {
            (
                format!("{} 件の新着メール", fresh.len()),
                fresh.iter().take(3).map(|m| format!("{}：{}", m.from, m.subject)).collect::<Vec<_>>().join("\n"),
            )
        };
        let _ = self
            .app
            .notification()
            .builder()
            .title(title)
            .body(format!("{body}\n{}", account.email))
            .show();
    }

    // ------------------------------------------------------------------
    // バックグラウンド：IDLE によるプッシュ + 定期ポーリング
    // ------------------------------------------------------------------

    pub fn start_watch(self: &Arc<Self>, account: Account) {
        let (tx, rx) = watch::channel(false);
        if let Some(old) = self.watchers.lock().insert(account.id.clone(), tx) {
            let _ = old.send(true);
        }
        let engine = self.clone();
        let acc = account.clone();
        let mut stop = rx.clone();
        tauri::async_runtime::spawn(async move {
            // 起動直後：まず受信トレイだけを急いで、残りはその後
            let _ = engine.sync_account(&acc, false, false).await;
            let _ = engine.sync_account(&acc, false, true).await;
            loop {
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(5 * 60)) => {
                        let _ = engine.sync_account(&acc, true, true).await;
                    }
                    _ = stop.changed() => break,
                }
            }
        });

        let engine = self.clone();
        let mut stop = rx;
        tauri::async_runtime::spawn(async move {
            loop {
                if *stop.borrow() {
                    break;
                }
                match engine.idle_once(&account, &mut stop).await {
                    Ok(true) => {
                        let _ = engine.sync_account(&account, true, false).await;
                    }
                    Ok(false) => {}
                    Err(_) => {
                        tokio::select! {
                            _ = tokio::time::sleep(Duration::from_secs(60)) => {}
                            _ = stop.changed() => break,
                        }
                    }
                }
            }
        });
    }

    pub fn stop_watch(&self, account_id: &str) {
        if let Some(tx) = self.watchers.lock().remove(account_id) {
            let _ = tx.send(true);
        }
        self.sessions.lock().remove(account_id);
    }

    /// 受信トレイで IDLE し、何か変化があれば true
    async fn idle_once(&self, account: &Account, stop: &mut watch::Receiver<bool>) -> Result<bool> {
        let credential = self.credential(account).await?;
        let mut session = imap::connect(account.provider, &account.email, &credential).await?;
        let inbox = self
            .db
            .mailbox_by_role(&account.id, "inbox")?
            .unwrap_or_else(|| "INBOX".into());
        imap::select(&mut session, &inbox).await?;
        loop {
            let mut idle = session.idle();
            idle.init().await.context("IDLE を開始できません")?;
            let outcome = {
                let (fut, _stop_source) = idle.wait_with_timeout(Duration::from_secs(9 * 60));
                tokio::select! {
                    r = fut => Some(r),
                    _ = stop.changed() => None,
                }
            };
            session = idle.done().await?;
            match outcome {
                None => {
                    let _ = session.logout().await;
                    return Ok(false);
                }
                Some(Ok(async_imap::extensions::idle::IdleResponse::NewData(_))) => {
                    let _ = session.logout().await;
                    return Ok(true);
                }
                Some(Ok(_)) => continue, // タイムアウト：IDLE をかけ直す
                Some(Err(e)) => return Err(e.into()),
            }
        }
    }

    // ------------------------------------------------------------------
    // 操作
    // ------------------------------------------------------------------

    pub async fn ensure_body(&self, id: i64) -> Result<()> {
        if self.db.has_body(id)? {
            return Ok(());
        }
        let (account_id, path, uid, _, _) = self.db.locate(id)?;
        let account = self.db.account(&account_id)?;
        let raw = self
            .with_session(&account, |s| {
                let path = path.clone();
                Box::pin(async move {
                    imap::select(s, &path).await?;
                    let mut v = imap::fetch_raw(s, &[uid], false).await?;
                    v.pop().map(|(_, r)| r).ok_or_else(|| anyhow!("本文を取得できませんでした"))
                })
            })
            .await?;
        let parsed = mime::parse(&raw, true);
        self.db.update_body(id, &parsed)?;
        Ok(())
    }

    pub async fn fetch_raw(&self, id: i64) -> Result<Vec<u8>> {
        let (account_id, path, uid, _, _) = self.db.locate(id)?;
        let account = self.db.account(&account_id)?;
        self.with_session(&account, |s| {
            let path = path.clone();
            Box::pin(async move {
                imap::select(s, &path).await?;
                let mut v = imap::fetch_raw(s, &[uid], false).await?;
                v.pop().map(|(_, r)| r).ok_or_else(|| anyhow!("メールを取得できませんでした"))
            })
        })
        .await
    }

    /// (account_id, mailbox) ごとにまとめる
    fn group(&self, ids: &[i64]) -> Result<HashMap<(String, String), Vec<(i64, u32, bool)>>> {
        let mut map: HashMap<(String, String), Vec<(i64, u32, bool)>> = HashMap::new();
        for id in ids {
            let (acc, mb, uid, seen, _) = self.db.locate(*id)?;
            map.entry((acc, mb)).or_default().push((*id, uid, seen));
        }
        Ok(map)
    }

    pub async fn set_flag(&self, ids: &[i64], flag: &str, value: bool) -> Result<()> {
        let imap_flag = match flag {
            "seen" => "\\Seen",
            "flagged" => "\\Flagged",
            "answered" => "\\Answered",
            _ => return Err(anyhow!("unknown flag")),
        };
        let groups = self.group(ids)?;
        // 先にローカルを更新（UI を即座に反映）
        self.db.set_local_flag(ids, flag, value)?;
        if flag == "seen" {
            for ((acc, mb), items) in &groups {
                let delta = items.iter().filter(|(_, _, s)| *s != value).count() as i64;
                self.db.adjust_unread(acc, mb, if value { -delta } else { delta })?;
            }
        }
        for ((acc, mb), items) in groups {
            let account = self.db.account(&acc)?;
            let uids: Vec<u32> = items.iter().map(|(_, u, _)| *u).collect();
            let q = format!("{}FLAGS.SILENT ({imap_flag})", if value { "+" } else { "-" });
            self.with_session(&account, |s| {
                let mb = mb.clone();
                let uids = uids.clone();
                let q = q.clone();
                Box::pin(async move {
                    imap::select(s, &mb).await?;
                    imap::store(s, &uids, &q).await
                })
            })
            .await?;
            self.changed(&acc, &mb, 0);
        }
        Ok(())
    }

    fn target_path(&self, account: &Account, role: &str) -> Result<String> {
        let lookup = match (role, account.provider) {
            ("archive", Provider::Gmail) => "all",
            (r, _) => r,
        };
        if let Some(p) = self.db.mailbox_by_role(&account.id, lookup)? {
            return Ok(p);
        }
        Ok(match (role, account.provider) {
            ("archive", Provider::Gmail) => "[Gmail]/All Mail",
            ("archive", Provider::Icloud) => "Archive",
            ("trash", Provider::Gmail) => "[Gmail]/Trash",
            ("trash", Provider::Icloud) => "Deleted Messages",
            ("junk", Provider::Gmail) => "[Gmail]/Spam",
            ("junk", Provider::Icloud) => "Junk",
            ("inbox", _) => "INBOX",
            (r, _) => return Err(anyhow!("移動先が見つかりません: {r}")),
        }
        .to_string())
    }

    /// アーカイブ・ゴミ箱・迷惑メール・受信トレイへ移動
    pub async fn move_to(&self, ids: &[i64], role: &str) -> Result<()> {
        let groups = self.group(ids)?;
        for ((acc, mb), items) in groups {
            let account = self.db.account(&acc)?;
            let target = self.target_path(&account, role)?;
            let src_role = self.db.mailbox_role(&acc, &mb)?;
            let uids: Vec<u32> = items.iter().map(|(_, u, _)| *u).collect();
            let local_ids: Vec<i64> = items.iter().map(|(i, _, _)| *i).collect();
            if target == mb {
                continue;
            }
            // Gmail の「すべてのメール」からアーカイブ → 何もしない
            if role == "archive" && src_role == "all" {
                continue;
            }
            let permanent = role == "trash" && src_role == "trash";
            // Gmail の「すべてのメール」から MOVE するとゴミ箱扱いになるので COPY（ラベル付与）にする
            let copy_only = account.provider == Provider::Gmail && src_role == "all" && role != "trash" && role != "junk";
            if !copy_only {
                self.db.delete_ids(&local_ids)?;
            }
            let unread = items.iter().filter(|(_, _, s)| !*s).count() as i64;
            self.db.adjust_unread(&acc, &mb, -unread)?;
            self.with_session(&account, |s| {
                let mb = mb.clone();
                let uids = uids.clone();
                let target = target.clone();
                Box::pin(async move {
                    imap::select(s, &mb).await?;
                    if copy_only {
                        s.uid_copy(imap::uid_set(&uids), &target).await?;
                        Ok(())
                    } else if permanent {
                        imap::store(s, &uids, "+FLAGS.SILENT (\\Deleted)").await?;
                        let _: Vec<_> = s.uid_expunge(imap::uid_set(&uids)).await?.try_collect().await?;
                        Ok(())
                    } else {
                        imap::move_uids(s, &uids, &target).await
                    }
                })
            })
            .await?;
            self.changed(&acc, &mb, 0);
            // 移動先を後から同期（Undo で戻す時に必要）
            let engine_target = target.clone();
            let _ = self.sync_mailbox(&account, &engine_target).await;
        }
        Ok(())
    }

    pub async fn send(&self, mail: OutgoingMail) -> Result<()> {
        let account = self.db.account(&mail.account_id)?;
        let credential = self.credential(&account).await?;
        let message = crate::smtp::build(&account, &mail)?;
        crate::smtp::send(&account, &credential, &message).await?;

        if !account.provider.auto_saves_sent() {
            let raw = message.formatted();
            let sent = self.target_path_or(&account, "sent", "Sent Messages")?;
            let _ = self
                .with_session(&account, |s| {
                    let raw = raw.clone();
                    let sent = sent.clone();
                    Box::pin(async move { imap::append(s, &sent, &raw, "(\\Seen)").await })
                })
                .await;
        }
        if let Some(id) = mail.reply_to_id {
            let _ = self.set_flag(&[id], "answered", true).await;
        }
        if let Some(sent) = self.db.mailbox_by_role(&account.id, "sent")? {
            let _ = self.sync_mailbox(&account, &sent).await;
        }
        Ok(())
    }

    fn target_path_or(&self, account: &Account, role: &str, fallback: &str) -> Result<String> {
        Ok(self.db.mailbox_by_role(&account.id, role)?.unwrap_or_else(|| fallback.to_string()))
    }

    /// 接続テスト（アカウント追加時）
    pub async fn verify(provider: Provider, email: &str, credential: &imap::Credential) -> Result<()> {
        let mut s = imap::connect(provider, email, credential).await?;
        let _ = s.logout().await;
        Ok(())
    }
}
