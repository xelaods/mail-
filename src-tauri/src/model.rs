//! フロントエンドとやり取りするデータ型。

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Gmail,
    Icloud,
}

impl Provider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Provider::Gmail => "gmail",
            Provider::Icloud => "icloud",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "gmail" => Some(Provider::Gmail),
            "icloud" => Some(Provider::Icloud),
            _ => None,
        }
    }

    pub fn imap_host(&self) -> (&'static str, u16) {
        match self {
            Provider::Gmail => ("imap.gmail.com", 993),
            Provider::Icloud => ("imap.mail.me.com", 993),
        }
    }

    pub fn smtp_host(&self) -> (&'static str, u16) {
        match self {
            // Gmail は 465 (暗黙TLS)、iCloud は 587 (STARTTLS)
            Provider::Gmail => ("smtp.gmail.com", 465),
            Provider::Icloud => ("smtp.mail.me.com", 587),
        }
    }

    /// 送信済みメールをサーバー側が自動保存するか
    pub fn auto_saves_sent(&self) -> bool {
        matches!(self, Provider::Gmail)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub provider: Provider,
    pub email: String,
    pub name: String,
    pub color: i64,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailboxInfo {
    pub account_id: String,
    pub path: String,
    pub name: String,
    pub role: String,
    pub unread: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressInfo {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentInfo {
    pub index: usize,
    pub name: String,
    pub mime: String,
    pub size: usize,
    pub inline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageSummary {
    pub id: i64,
    pub account_id: String,
    pub mailbox: String,
    pub uid: i64,
    pub subject: String,
    pub from_name: String,
    pub from_addr: String,
    pub to_preview: String,
    pub date: i64,
    pub snippet: String,
    pub seen: bool,
    pub flagged: bool,
    pub answered: bool,
    pub has_attach: bool,
    pub thread_key: String,
    pub thread_count: i64,
    /// 本文から見つけた確認コード・認証コード（なければ空）
    pub otp_code: String,
    /// 本文から見つけた認証リンク（なければ空）
    pub otp_link: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDetail {
    #[serde(flatten)]
    pub summary: MessageSummary,
    pub message_id: String,
    pub to: Vec<AddressInfo>,
    pub cc: Vec<AddressInfo>,
    pub reply_to: Vec<AddressInfo>,
    pub text: String,
    pub html: String,
    pub attachments: Vec<AttachmentInfo>,
    pub references: String,
    pub list_unsubscribe: String,
    pub mailbox_role: String,
}

/// メッセージ一覧の取得条件
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewQuery {
    /// "unified" または "mailbox"
    pub kind: String,
    /// unified のとき: inbox / flagged / unread / sent / archive / trash / junk / drafts
    pub role: Option<String>,
    pub account_id: Option<String>,
    pub path: Option<String>,
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingMail {
    pub account_id: String,
    pub to: Vec<String>,
    pub cc: Vec<String>,
    pub bcc: Vec<String>,
    pub subject: String,
    pub text: String,
    pub html: Option<String>,
    pub attachments: Vec<String>,
    /// 返信・転送元メッセージのローカルID
    pub reply_to_id: Option<i64>,
    pub in_reply_to: Option<String>,
    pub references: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAccount {
    pub provider: Provider,
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncEvent {
    pub account_id: String,
    pub mailbox: String,
    pub new_messages: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub account_id: String,
    pub state: String,
    pub message: Option<String>,
}
