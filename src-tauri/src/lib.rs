mod codes;
mod db;
mod engine;
mod imap_client;
mod mime;
mod model;
mod oauth;
mod parcels;
mod secrets;
mod smtp;

use std::sync::Arc;

use tauri::{Manager, State};

use engine::Engine;
use model::*;

pub struct AppState {
    engine: Arc<Engine>,
}

type Res<T> = Result<T, String>;

fn err(e: anyhow::Error) -> String {
    format!("{e:#}")
}

const COLORS: i64 = 6;

#[tauri::command]
async fn list_accounts(state: State<'_, AppState>) -> Res<Vec<Account>> {
    state.engine.db.accounts().map_err(err)
}

/// 新しいアカウントを保存して同期を始める
async fn register(engine: &Arc<Engine>, provider: Provider, email: String, name: &str, secret: &str) -> Res<Account> {
    let count = engine.db.accounts().map_err(err)?.len() as i64;
    let account = Account {
        id: uuid::Uuid::new_v4().to_string(),
        provider,
        name: if name.trim().is_empty() {
            email.split('@').next().unwrap_or("").to_string()
        } else {
            name.trim().to_string()
        },
        email,
        color: count % COLORS,
        signature: String::new(),
    };
    secrets::set_password(&account.id, secret).map_err(err)?;
    engine.db.insert_account(&account).map_err(err)?;
    engine.refresh_mailboxes(&account).await.map_err(err)?;
    engine.start_watch(account.clone());
    Ok(account)
}

#[tauri::command]
async fn add_account(state: State<'_, AppState>, input: NewAccount) -> Res<Account> {
    let engine = state.engine.clone();
    let email = input.email.trim().to_lowercase();
    if engine.db.accounts().map_err(err)?.iter().any(|a| a.email == email) {
        return Err("このアカウントは追加済みです".into());
    }
    let credential = imap_client::Credential::Password(input.password.clone());
    Engine::verify(input.provider, &email, &credential).await.map_err(err)?;
    register(&engine, input.provider, email, &input.name, &input.password).await
}

/// 「Google でサインイン」でアカウントを追加する（大学・会社の Google アカウント向け）
#[tauri::command]
async fn add_google_account(state: State<'_, AppState>, name: String, hint: Option<String>) -> Res<Account> {
    let engine = state.engine.clone();
    let client = engine.google_client().map_err(err)?;
    let signed = oauth::sign_in(&client, hint.as_deref(), |url| {
        tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| anyhow::anyhow!("ブラウザを開けませんでした: {e}"))
    })
    .await
    .map_err(err)?;
    if engine.db.accounts().map_err(err)?.iter().any(|a| a.email == signed.email) {
        return Err(format!("{} は追加済みです", signed.email));
    }
    let (token, _) = oauth::access_token(&client, &signed.refresh_token).await.map_err(err)?;
    Engine::verify(Provider::Gmail, &signed.email, &imap_client::Credential::OAuth(token))
        .await
        .map_err(err)?;
    let secret = format!("{}{}", oauth::REFRESH_PREFIX, signed.refresh_token);
    let name = if name.trim().is_empty() { signed.name.clone() } else { name };
    register(&engine, Provider::Gmail, signed.email, &name, &secret).await
}

/// Google のサインインが切れた時（テスト中の設定では7日ごと）にサインインし直す
#[tauri::command]
async fn reauth_google_account(state: State<'_, AppState>, id: String) -> Res<()> {
    let engine = state.engine.clone();
    let account = engine.db.account(&id).map_err(err)?;
    let client = engine.google_client().map_err(err)?;
    let signed = oauth::sign_in(&client, Some(&account.email), |url| {
        tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| anyhow::anyhow!("ブラウザを開けませんでした: {e}"))
    })
    .await
    .map_err(err)?;
    if signed.email != account.email {
        return Err(format!("{} でサインインしてください（{} でサインインされました）", account.email, signed.email));
    }
    let secret = format!("{}{}", oauth::REFRESH_PREFIX, signed.refresh_token);
    secrets::set_password(&account.id, &secret).map_err(err)?;
    engine.forget_credentials(&account.id);
    engine.stop_watch(&account.id);
    engine.start_watch(account);
    Ok(())
}

/// Google でサインインの設定がアプリに組み込まれているか
#[tauri::command]
async fn google_builtin() -> bool {
    oauth::builtin_client().is_some()
}

#[tauri::command]
async fn update_account(state: State<'_, AppState>, id: String, name: String, signature: String, color: i64) -> Res<()> {
    state.engine.db.update_account(&id, &name, &signature, color).map_err(err)
}

#[tauri::command]
async fn remove_account(state: State<'_, AppState>, id: String) -> Res<()> {
    state.engine.stop_watch(&id);
    secrets::delete_password(&id);
    state.engine.db.delete_account(&id).map_err(err)
}

#[tauri::command]
async fn list_parcels(state: State<'_, AppState>) -> Res<Vec<ParcelInfo>> {
    state.engine.db.parcels().map_err(err)
}

#[tauri::command]
async fn list_mailboxes(state: State<'_, AppState>) -> Res<Vec<MailboxInfo>> {
    state.engine.db.mailboxes().map_err(err)
}

#[tauri::command]
async fn list_messages(state: State<'_, AppState>, query: ViewQuery) -> Res<Vec<MessageSummary>> {
    state.engine.db.list(&query).map_err(err)
}

#[tauri::command]
async fn get_thread(state: State<'_, AppState>, id: i64) -> Res<Vec<MessageDetail>> {
    let engine = state.engine.clone();
    let ids = engine.db.thread_ids(id).map_err(err)?;
    let mut out = Vec::new();
    for i in ids {
        // 本文未取得のものだけサーバーへ（失敗しても他は表示する）
        if let Err(e) = engine.ensure_body(i).await {
            if i == id {
                return Err(err(e));
            }
        }
        out.push(engine.db.detail(i).map_err(err)?);
    }
    Ok(out)
}

#[tauri::command]
async fn sync_mailbox(state: State<'_, AppState>, account_id: String, path: String) -> Res<()> {
    let engine = state.engine.clone();
    let account = engine.db.account(&account_id).map_err(err)?;
    engine.sync_mailbox(&account, &path).await.map(|_| ()).map_err(err)
}

#[tauri::command]
async fn sync_all(state: State<'_, AppState>) -> Res<()> {
    let engine = state.engine.clone();
    let accounts = engine.db.accounts().map_err(err)?;
    let mut errors = Vec::new();
    for a in accounts {
        if let Err(e) = engine.sync_account(&a, false, true).await {
            errors.push(format!("{}: {}", a.email, err(e)));
        }
    }
    if errors.is_empty() { Ok(()) } else { Err(errors.join("\n")) }
}

/// Latest verification code already indexed by Fumi, for the iOS widget bridge.
/// Never returns the authentication link or email body.
#[tauri::command]
async fn latest_widget_otp(state: State<'_, AppState>) -> Res<Option<WidgetOtp>> {
    let q = ViewQuery { kind: "unified".into(), role: Some("codes".into()), account_id: None,
        path: None, search: None, limit: Some(30), offset: Some(0) };
    let now = chrono::Utc::now().timestamp();
    let found = state.engine.db.list(&q).map_err(err)?
        .into_iter()
        .filter(|m| !m.otp_code.is_empty() && m.date <= now && now - m.date < 900)
        .max_by_key(|m| m.date);
    Ok(found.map(|m| WidgetOtp { code: m.otp_code, sender: m.from_name,
        received_at: m.date }))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WidgetOtp { code: String, sender: String, received_at: i64 }


#[tauri::command]
async fn refresh_folders(state: State<'_, AppState>, account_id: String) -> Res<()> {
    let engine = state.engine.clone();
    let account = engine.db.account(&account_id).map_err(err)?;
    engine.refresh_mailboxes(&account).await.map_err(err)?;
    engine.refresh_counts(&account).await.map_err(err)
}

#[tauri::command]
async fn load_more(state: State<'_, AppState>, account_id: String, path: String) -> Res<usize> {
    let engine = state.engine.clone();
    let account = engine.db.account(&account_id).map_err(err)?;
    engine.load_more(&account, &path).await.map_err(err)
}

#[tauri::command]
async fn set_flag(state: State<'_, AppState>, ids: Vec<i64>, flag: String, value: bool) -> Res<()> {
    state.engine.clone().set_flag(&ids, &flag, value).await.map_err(err)
}

#[tauri::command]
async fn move_messages(state: State<'_, AppState>, ids: Vec<i64>, role: String) -> Res<()> {
    state.engine.clone().move_to(&ids, &role).await.map_err(err)
}

#[tauri::command]
async fn send_mail(state: State<'_, AppState>, mail: OutgoingMail) -> Res<()> {
    state.engine.clone().send(mail).await.map_err(err)
}

#[tauri::command]
async fn save_attachment(state: State<'_, AppState>, id: i64, index: usize, dest: String) -> Res<()> {
    let raw = state.engine.clone().fetch_raw(id).await.map_err(err)?;
    let (_, bytes) = mime::attachment_bytes(&raw, index).ok_or("添付ファイルが見つかりません")?;
    std::fs::write(&dest, bytes).map_err(|e| format!("保存できませんでした: {e}"))
}

#[tauri::command]
async fn open_attachment(app: tauri::AppHandle, state: State<'_, AppState>, id: i64, index: usize) -> Res<()> {
    let raw = state.engine.clone().fetch_raw(id).await.map_err(err)?;
    let (name, bytes) = mime::attachment_bytes(&raw, index).ok_or("添付ファイルが見つかりません")?;
    let safe: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("attachments").join(id.to_string());
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    tauri_plugin_opener::open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn search_contacts(state: State<'_, AppState>, prefix: String) -> Res<Vec<AddressInfo>> {
    state.engine.db.contacts(&prefix).map_err(err)
}

#[tauri::command]
async fn get_setting(state: State<'_, AppState>, key: String) -> Res<Option<String>> {
    state.engine.db.setting(&key).map_err(err)
}

#[tauri::command]
async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Res<()> {
    state.engine.db.set_setting(&key, &value).map_err(err)
}

#[tauri::command]
async fn is_trusted(state: State<'_, AppState>, addr: String) -> Res<bool> {
    state.engine.db.trusted(&addr).map_err(err)
}

#[tauri::command]
async fn set_trusted(state: State<'_, AppState>, addr: String, value: bool) -> Res<()> {
    state.engine.db.set_trusted(&addr, value).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tokio_rustls::rustls::crypto::ring::default_provider().install_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Arc::new(db::Db::open(&dir.join("fumi.db"))?);
            let engine = Engine::new(db.clone(), app.handle().clone());
            // Mobile platforms suspend background execution. Do not rely on
            // long-running IMAP IDLE tasks to deliver notifications on iOS.
            #[cfg(not(mobile))]
            for account in db.accounts()? {
                engine.start_watch(account);
            }
            app.manage(AppState { engine });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_accounts,
            add_account,
            add_google_account,
            reauth_google_account,
            google_builtin,
            update_account,
            remove_account,
            list_mailboxes,
            list_parcels,
            list_messages,
            latest_widget_otp,
            get_thread,
            sync_mailbox,
            sync_all,
            refresh_folders,
            load_more,
            set_flag,
            move_messages,
            send_mail,
            save_attachment,
            open_attachment,
            search_contacts,
            get_setting,
            set_setting,
            is_trusted,
            set_trusted,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fumi");
}
