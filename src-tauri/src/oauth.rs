//! 「Google でサインイン」（OAuth 2.0 + PKCE、ループバック方式）。
//!
//! 大学や会社の Google アカウント（Google Workspace）は、管理者の設定で
//! アプリ パスワードを作れないことが多い。その場合でも、この方式なら IMAP / SMTP に
//! XOAUTH2 で接続できる（管理者がサードパーティ製アプリを止めていない限り）。

use std::sync::Arc;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use base64::Engine;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::rustls::{pki_types::ServerName, ClientConfig, RootCertStore};
use tokio_rustls::TlsConnector;

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_HOST: &str = "oauth2.googleapis.com";
/// IMAP / SMTP に必要なのは mail.google.com。メールアドレスを知るために openid email も
const SCOPE: &str = "https://mail.google.com/ openid email profile";

/// 資格情報マネージャーに保存する時の印（アプリ パスワードと区別する）
pub const REFRESH_PREFIX: &str = "oauth-refresh:";

#[derive(Clone)]
pub struct GoogleClient {
    pub id: String,
    pub secret: String,
}

pub struct SignIn {
    pub email: String,
    /// Google アカウントの名前（差出人名の初期値に使う）
    pub name: String,
    pub refresh_token: String,
}

/// GitHub Actions のビルド時に埋め込まれる Google のクライアント
/// （デスクトップアプリのクライアント シークレットは秘密として扱われない、と Google が定めている）
pub fn builtin_client() -> Option<GoogleClient> {
    let id = option_env!("FUMI_GOOGLE_CLIENT_ID")?.trim();
    let secret = option_env!("FUMI_GOOGLE_CLIENT_SECRET").unwrap_or("").trim();
    if id.is_empty() {
        return None;
    }
    Some(GoogleClient { id: id.to_string(), secret: secret.to_string() })
}

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn urldecode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 2;
                }
            }
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| urldecode(v))
    })
}

/// 小さな HTTPS POST（トークンの取得専用。依存を増やさないため手書き）
async fn post_form(host: &str, path: &str, body: &str) -> Result<serde_json::Value> {
    let mut roots = RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let config = ClientConfig::builder().with_root_certificates(roots).with_no_client_auth();
    let tcp = tokio::time::timeout(Duration::from_secs(20), TcpStream::connect((host, 443)))
        .await
        .map_err(|_| anyhow!("Google への接続がタイムアウトしました"))??;
    let mut tls = TlsConnector::from(Arc::new(config))
        .connect(ServerName::try_from(host.to_string())?, tcp)
        .await?;
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\nAccept: application/json\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    tls.write_all(req.as_bytes()).await?;
    let mut raw = Vec::new();
    tls.read_to_end(&mut raw).await.ok();
    let text = String::from_utf8_lossy(&raw);
    let (head, rest) = text.split_once("\r\n\r\n").context("Google からの応答を読めませんでした")?;
    let body = if head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        dechunk(rest)
    } else {
        rest.to_string()
    };
    let json: serde_json::Value = serde_json::from_str(body.trim()).context("Google からの応答が JSON ではありません")?;
    if let Some(err) = json.get("error") {
        let desc = json.get("error_description").and_then(|v| v.as_str()).unwrap_or("");
        bail!("Google がサインインを拒否しました（{} {desc}）", err.as_str().unwrap_or("error"));
    }
    Ok(json)
}

fn dechunk(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some((size_line, after)) = rest.split_once("\r\n") {
        let size = usize::from_str_radix(size_line.trim().split(';').next().unwrap_or("0"), 16).unwrap_or(0);
        if size == 0 || after.len() < size {
            break;
        }
        out.push_str(&after[..size]);
        rest = after[size..].trim_start_matches("\r\n");
    }
    out
}

/// id_token（JWT）の中身からメールアドレスを取り出す（署名の検証はしない：Google から直接受け取った値のため）
fn id_token_claims(token: &str) -> Option<serde_json::Value> {
    let payload = token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn email_from_id_token(token: &str) -> Option<String> {
    id_token_claims(token)?.get("email")?.as_str().map(|s| s.to_lowercase())
}

fn name_from_id_token(token: &str) -> Option<String> {
    id_token_claims(token)?.get("name")?.as_str().map(|s| s.trim().to_string())
}

/// ブラウザで Google のサインイン画面を開き、許可されたら更新トークンを返す
pub async fn sign_in(client: &GoogleClient, login_hint: Option<&str>, open: impl Fn(&str) -> Result<()>) -> Result<SignIn> {
    let listener = TcpListener::bind("127.0.0.1:0").await.context("サインイン用のポートを開けません")?;
    let port = listener.local_addr()?.port();
    let redirect = format!("http://127.0.0.1:{port}");

    let verifier = format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple());
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    let state = uuid::Uuid::new_v4().simple().to_string();

    let mut url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={challenge}&code_challenge_method=S256&state={state}&access_type=offline&prompt=consent",
        urlencode(&client.id),
        urlencode(&redirect),
        urlencode(SCOPE),
    );
    if let Some(h) = login_hint.filter(|h| !h.is_empty()) {
        url.push_str(&format!("&login_hint={}", urlencode(h)));
    }
    open(&url)?;

    // ブラウザからの戻りを待つ（5分まで）
    let (mut stream, _) = tokio::time::timeout(Duration::from_secs(300), listener.accept())
        .await
        .map_err(|_| anyhow!("サインインが時間内に完了しませんでした"))??;
    let mut buf = vec![0u8; 8192];
    let n = stream.read(&mut buf).await?;
    let request = String::from_utf8_lossy(&buf[..n]).to_string();
    let target = request.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/");
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or("");

    let ok = query_param(query, "code").is_some() && query_param(query, "state").as_deref() == Some(state.as_str());
    let page = if ok {
        "サインインが完了しました。このタブを閉じて Fumi に戻ってください。"
    } else {
        "サインインできませんでした。Fumi に戻ってもう一度お試しください。"
    };
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>Fumi</title><body style=\"font-family:system-ui,sans-serif;display:grid;place-items:center;height:90vh;color:#333\"><p style=\"font-size:18px\">{page}</p></body>"
    );
    let resp = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{html}",
        html.len()
    );
    let _ = stream.write_all(resp.as_bytes()).await;
    let _ = stream.shutdown().await;

    if let Some(err) = query_param(query, "error") {
        if err == "access_denied" {
            bail!("サインインがキャンセルされたか、許可されませんでした");
        }
        bail!("Google がサインインを拒否しました（{err}）。大学・会社のアカウントでは管理者がこのアプリを許可していない可能性があります");
    }
    if query_param(query, "state").as_deref() != Some(state.as_str()) {
        bail!("サインインの応答が正しくありません。もう一度お試しください");
    }
    let code = query_param(query, "code").context("サインインの応答に認可コードがありません")?;

    let body = format!(
        "code={}&client_id={}&client_secret={}&redirect_uri={}&grant_type=authorization_code&code_verifier={}",
        urlencode(&code),
        urlencode(&client.id),
        urlencode(&client.secret),
        urlencode(&redirect),
        urlencode(&verifier)
    );
    let json = post_form(TOKEN_HOST, "/token", &body).await?;
    let refresh_token = json
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .context("更新トークンを受け取れませんでした。もう一度サインインしてください")?
        .to_string();
    let id_token = json.get("id_token").and_then(|v| v.as_str()).unwrap_or("");
    let email = email_from_id_token(id_token).context("メールアドレスを確認できませんでした")?;
    let name = name_from_id_token(id_token).unwrap_or_default();
    Ok(SignIn { email, name, refresh_token })
}

/// 更新トークンからアクセストークン（約1時間有効）を得る。(token, 有効秒数)
pub async fn access_token(client: &GoogleClient, refresh_token: &str) -> Result<(String, u64)> {
    let body = format!(
        "client_id={}&client_secret={}&refresh_token={}&grant_type=refresh_token",
        urlencode(&client.id),
        urlencode(&client.secret),
        urlencode(refresh_token)
    );
    let json = post_form(TOKEN_HOST, "/token", &body).await.map_err(|e| {
        let msg = format!("{e:#}");
        if msg.contains("invalid_grant") {
            anyhow!("Google のサインインの有効期限が切れました。設定からアカウントを削除して、もう一度追加してください")
        } else {
            e
        }
    })?;
    let token = json.get("access_token").and_then(|v| v.as_str()).context("アクセストークンがありません")?.to_string();
    let expires = json.get("expires_in").and_then(|v| v.as_u64()).unwrap_or(3600);
    Ok((token, expires))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_callback_and_token() {
        assert_eq!(query_param("code=4%2F0Ab&state=xyz", "code").as_deref(), Some("4/0Ab"));
        assert_eq!(urlencode("a b/c"), "a%20b%2Fc");
        let payload = b64url(br#"{"email":"Student@Univ.ac.jp"}"#);
        assert_eq!(email_from_id_token(&format!("h.{payload}.s")).as_deref(), Some("student@univ.ac.jp"));
        assert_eq!(dechunk("5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n"), "hello world");
    }
}
