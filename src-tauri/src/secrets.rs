//! アプリパスワードは Windows 資格情報マネージャーに保存する（DBには残さない）。

use anyhow::{Context, Result};

const SERVICE: &str = "fumi-mail";

pub fn set_password(account_id: &str, password: &str) -> Result<()> {
    let entry = keyring::Entry::new(SERVICE, account_id).context("資格情報ストアを開けません")?;
    entry
        .set_password(password)
        .context("パスワードを資格情報マネージャーに保存できませんでした")
}

pub fn get_password(account_id: &str) -> Result<String> {
    let entry = keyring::Entry::new(SERVICE, account_id).context("資格情報ストアを開けません")?;
    entry
        .get_password()
        .context("保存されたパスワードが見つかりません。アカウントを再追加してください")
}

pub fn delete_password(account_id: &str) {
    if let Ok(entry) = keyring::Entry::new(SERVICE, account_id) {
        let _ = entry.delete_credential();
    }
}
