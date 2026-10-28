//! 送信（SMTP）。

use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use lettre::message::header::ContentType;
use lettre::message::{Attachment, Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::model::{Account, OutgoingMail, Provider};

fn parse_mailbox(s: &str) -> Result<Mailbox> {
    s.trim()
        .parse::<Mailbox>()
        .map_err(|_| anyhow!("メールアドレスの形式が正しくありません: {s}"))
}

/// 送信用メッセージを組み立てる。戻り値はサーバーに保存する生データにも使う。
pub fn build(account: &Account, mail: &OutgoingMail) -> Result<Message> {
    let from = Mailbox::new(
        if account.name.trim().is_empty() { None } else { Some(account.name.clone()) },
        account.email.parse().map_err(|_| anyhow!("送信元アドレスが不正です"))?,
    );
    let mut b = Message::builder().from(from).subject(mail.subject.clone());
    let mut has_recipient = false;
    for t in mail.to.iter().filter(|s| !s.trim().is_empty()) {
        b = b.to(parse_mailbox(t)?);
        has_recipient = true;
    }
    for t in mail.cc.iter().filter(|s| !s.trim().is_empty()) {
        b = b.cc(parse_mailbox(t)?);
        has_recipient = true;
    }
    for t in mail.bcc.iter().filter(|s| !s.trim().is_empty()) {
        b = b.bcc(parse_mailbox(t)?);
        has_recipient = true;
    }
    if !has_recipient {
        return Err(anyhow!("宛先を入力してください"));
    }
    if let Some(irt) = mail.in_reply_to.as_ref().filter(|s| !s.is_empty()) {
        b = b.in_reply_to(format!("<{}>", irt.trim_matches(|c| c == '<' || c == '>')));
    }
    if let Some(refs) = mail.references.as_ref().filter(|s| !s.is_empty()) {
        b = b.references(refs.clone());
    }
    let domain = account.email.split('@').nth(1).unwrap_or("localhost");
    b = b.message_id(Some(format!("<{}@{}>", uuid::Uuid::new_v4(), domain)));
    b = b.user_agent("Fumi".into());

    let text_part = SinglePart::builder()
        .header(ContentType::TEXT_PLAIN)
        .body(mail.text.clone());
    let body = match &mail.html {
        Some(html) if !html.trim().is_empty() => MultiPart::alternative()
            .singlepart(text_part)
            .singlepart(SinglePart::builder().header(ContentType::TEXT_HTML).body(html.clone())),
        _ => MultiPart::mixed().singlepart(text_part),
    };

    let message = if mail.attachments.is_empty() {
        match &mail.html {
            Some(html) if !html.trim().is_empty() => b.multipart(body)?,
            _ => b.singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(mail.text.clone()),
            )?,
        }
    } else {
        let mut mixed = MultiPart::mixed().multipart(body);
        for path in &mail.attachments {
            let bytes = std::fs::read(path).with_context(|| format!("添付ファイルを読めません: {path}"))?;
            let name = std::path::Path::new(path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "attachment".into());
            let mime = mime_guess::from_path(path).first_or_octet_stream().to_string();
            let ct = ContentType::parse(&mime).unwrap_or(ContentType::parse("application/octet-stream").unwrap());
            mixed = mixed.singlepart(Attachment::new(name).body(bytes, ct));
        }
        b.multipart(mixed)?
    };
    Ok(message)
}

pub async fn send(account: &Account, password: &str, message: &Message) -> Result<()> {
    let (host, port) = account.provider.smtp_host();
    let password: String = password.chars().filter(|c| !c.is_whitespace()).collect();
    let creds = Credentials::new(account.email.clone(), password);
    let builder = match account.provider {
        Provider::Gmail => AsyncSmtpTransport::<Tokio1Executor>::relay(host)?,
        Provider::Icloud => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)?,
    };
    let transport = builder
        .port(port)
        .credentials(creds)
        .timeout(Some(Duration::from_secs(60)))
        .build();
    transport
        .send(message.clone())
        .await
        .map_err(|e| anyhow!("送信に失敗しました: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_reply_with_japanese_subject() {
        let acc = Account {
            id: "a".into(),
            provider: Provider::Icloud,
            email: "me@icloud.com".into(),
            name: "山田".into(),
            color: 0,
            signature: String::new(),
        };
        let m = OutgoingMail {
            account_id: "a".into(),
            to: vec!["山田 <yamada@example.jp>".into()],
            cc: vec![],
            bcc: vec![],
            subject: "Re: 打ち合わせ".into(),
            text: "了解です".into(),
            html: Some("<p>了解です</p>".into()),
            attachments: vec![],
            reply_to_id: None,
            in_reply_to: Some("abc@example.jp".into()),
            references: Some("<root@example.jp> <abc@example.jp>".into()),
        };
        let msg = build(&acc, &m).unwrap();
        let raw = String::from_utf8(msg.formatted()).unwrap();
        assert!(raw.contains("In-Reply-To: <abc@example.jp>"));
        let parsed = crate::mime::parse(raw.as_bytes(), true);
        assert_eq!(parsed.subject, "Re: 打ち合わせ");
        assert_eq!(parsed.to[0].email, "yamada@example.jp");
        assert!(parsed.text.contains("了解です"));
    }
}
