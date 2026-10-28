//! 受信したメール（RFC 5322）の解析。

use base64::Engine;
use mail_parser::{Address, HeaderValue, MessageParser, MimeHeaders};

use crate::model::{AddressInfo, AttachmentInfo};

#[derive(Debug, Clone, Default)]
pub struct ParsedMail {
    pub message_id: String,
    pub subject: String,
    pub from_name: String,
    pub from_addr: String,
    pub to: Vec<AddressInfo>,
    pub cc: Vec<AddressInfo>,
    pub reply_to: Vec<AddressInfo>,
    pub date: i64,
    pub snippet: String,
    pub text: String,
    pub html: String,
    pub attachments: Vec<AttachmentInfo>,
    pub in_reply_to: String,
    pub references: String,
    pub list_unsubscribe: String,
    pub has_body: bool,
}

/// 本文を表示用にキャッシュする時、インライン画像を data: URI として埋め込む上限
const INLINE_IMAGE_BUDGET: usize = 3 * 1024 * 1024;

fn addresses(list: Option<&Address<'_>>) -> Vec<AddressInfo> {
    let Some(list) = list else { return vec![] };
    list.iter()
        .filter_map(|m| {
            let email = m.address()?.trim().to_string();
            Some(AddressInfo {
                name: m.name().unwrap_or("").trim().to_string(),
                email,
            })
        })
        .collect()
}

fn header_texts(v: &HeaderValue<'_>) -> Vec<String> {
    if let Some(list) = v.as_text_list() {
        list.iter().map(|s| s.to_string()).collect()
    } else if let Some(t) = v.as_text() {
        t.split_whitespace().map(|s| s.to_string()).collect()
    } else {
        vec![]
    }
}

fn normalize_id(id: &str) -> String {
    id.trim().trim_start_matches('<').trim_end_matches('>').to_string()
}

fn collapse_ws(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_space = false;
    for ch in s.chars() {
        if ch.is_whitespace() || ch == '\u{200b}' || ch == '\u{a0}' || ch == '\u{34f}' {
            if !last_space && !out.is_empty() {
                out.push(' ');
            }
            last_space = true;
        } else {
            out.push(ch);
            last_space = false;
        }
    }
    out.trim().to_string()
}

fn make_snippet(text: &str) -> String {
    // 引用行（>）と署名区切り以降を除いてプレビューを作る
    let mut lines = Vec::new();
    for line in text.lines() {
        let t = line.trim();
        if t == "--" || t == "-- " {
            break;
        }
        if t.starts_with('>') {
            continue;
        }
        lines.push(t);
    }
    let joined = collapse_ws(&lines.join(" "));
    joined.chars().take(220).collect()
}

/// ヘッダーと本文を解析する。`raw` がヘッダーのみでも動く。
pub fn parse(raw: &[u8], has_body: bool) -> ParsedMail {
    let Some(message) = MessageParser::default().parse(raw) else {
        return ParsedMail {
            subject: "(解析できないメール)".into(),
            has_body,
            ..Default::default()
        };
    };
    let root = &message;

    let from = addresses(root.from());
    let (from_name, from_addr) = from
        .first()
        .map(|a| (a.name.clone(), a.email.clone()))
        .unwrap_or_default();

    let in_reply_to = header_texts(root.in_reply_to())
        .first()
        .map(|s| normalize_id(s))
        .unwrap_or_default();
    let references = header_texts(root.references())
        .iter()
        .map(|r| format!("<{}>", normalize_id(r)))
        .collect::<Vec<_>>()
        .join(" ");

    let list_unsubscribe = root
        .header_raw("List-Unsubscribe")
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    let mut parsed = ParsedMail {
        message_id: root.message_id().map(normalize_id).unwrap_or_default(),
        subject: root.subject().map(collapse_ws).unwrap_or_default(),
        from_name,
        from_addr,
        to: addresses(root.to()),
        cc: addresses(root.cc()),
        reply_to: addresses(root.reply_to()),
        date: root.date().map(|d| d.to_timestamp()).unwrap_or(0),
        in_reply_to,
        references,
        list_unsubscribe,
        has_body,
        ..Default::default()
    };

    if !has_body {
        return parsed;
    }

    // 本文
    let text = root.body_text(0).map(|t| t.to_string()).unwrap_or_default();
    let has_html = root.html_part(0).map(|p| p.is_text_html()).unwrap_or(false);
    let mut html = if has_html {
        root.body_html(0).map(|h| h.to_string()).unwrap_or_default()
    } else {
        String::new()
    };

    parsed.snippet = if !text.trim().is_empty() {
        make_snippet(&text)
    } else {
        make_snippet(&mail_parser::decoders::html::html_to_text(&html))
    };

    // 添付ファイル（インライン画像は cid: を data: に置き換える）
    let mut budget = INLINE_IMAGE_BUDGET;
    for (index, part) in root.attachments().enumerate() {
        let ct = part.content_type();
        let mime = ct
            .as_ref()
            .map(|c| format!("{}/{}", c.ctype(), c.subtype().unwrap_or("octet-stream")))
            .unwrap_or_else(|| "application/octet-stream".into())
            .to_ascii_lowercase();
        let size = part.len();
        let cid = part.content_id().map(normalize_id);
        let is_image = mime.starts_with("image/");
        let referenced = cid
            .as_ref()
            .map(|c| !c.is_empty() && html.contains(&format!("cid:{c}")))
            .unwrap_or(false);

        if is_image && referenced && size <= budget {
            budget -= size;
            let data = base64::engine::general_purpose::STANDARD.encode(part.contents());
            let c = cid.clone().unwrap_or_default();
            html = html.replace(&format!("cid:{c}"), &format!("data:{mime};base64,{data}"));
        }

        let name = part
            .attachment_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                if let Some(nested) = part.message() {
                    format!("{}.eml", nested.subject().unwrap_or("message"))
                } else {
                    let ext = mime_guess::get_mime_extensions_str(&mime)
                        .and_then(|e| e.first().copied())
                        .unwrap_or("bin");
                    format!("attachment-{}.{}", index + 1, ext)
                }
            });

        parsed.attachments.push(AttachmentInfo {
            index,
            name,
            mime,
            size,
            inline: referenced,
        });
    }

    parsed.text = text;
    parsed.html = html;
    parsed
}

/// 添付ファイルの中身を取り出す
pub fn attachment_bytes(raw: &[u8], index: usize) -> Option<(String, Vec<u8>)> {
    let message = MessageParser::default().parse(raw)?;
    let part = message.attachments().nth(index)?;
    let name = part
        .attachment_name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("attachment-{}", index + 1));
    Some((name, part.contents().to_vec()))
}

/// スレッドのキー：References の先頭 → In-Reply-To → 自分の Message-ID
pub fn thread_key(p: &ParsedMail) -> String {
    if let Some(first) = p.references.split_whitespace().next() {
        return normalize_id(first);
    }
    if !p.in_reply_to.is_empty() {
        return p.in_reply_to.clone();
    }
    if !p.message_id.is_empty() {
        return p.message_id.clone();
    }
    format!("subject:{}", p.subject.to_lowercase())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_japanese_iso2022jp() {
        let raw = b"From: =?ISO-2022-JP?B?GyRCOzNFRBsoQg==?= <yamada@example.jp>\r\n\
To: you@example.com\r\n\
Subject: =?ISO-2022-JP?B?GyRCJDMkcyRLJEEkTxsoQg==?=\r\n\
Message-ID: <abc@example.jp>\r\n\
References: <root@example.jp> <abc0@example.jp>\r\n\
Date: Wed, 28 Oct 2026 10:00:00 +0900\r\n\
Content-Type: text/plain; charset=ISO-2022-JP\r\n\
\r\n\
\x1b$B$3$s$K$A$O\x1b(B\r\n";
        let p = parse(raw, true);
        assert_eq!(p.subject, "こんにちは");
        assert_eq!(p.from_name, "山田");
        assert_eq!(p.from_addr, "yamada@example.jp");
        assert_eq!(p.snippet, "こんにちは");
        assert_eq!(thread_key(&p), "root@example.jp");
        assert!(p.date > 0);
    }

    #[test]
    fn inlines_cid_images_and_lists_attachments() {
        let raw = b"From: a@example.com\r\nSubject: pic\r\nContent-Type: multipart/mixed; boundary=X\r\n\r\n\
--X\r\nContent-Type: multipart/related; boundary=Y\r\n\r\n\
--Y\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>hi<img src=\"cid:img1\"></p>\r\n\
--Y\r\nContent-Type: image/png\r\nContent-ID: <img1>\r\nContent-Transfer-Encoding: base64\r\n\r\niVBORw0KGgo=\r\n\
--Y--\r\n\
--X\r\nContent-Type: application/pdf; name=\"doc.pdf\"\r\nContent-Disposition: attachment; filename=\"doc.pdf\"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERi0=\r\n\
--X--\r\n";
        let p = parse(raw, true);
        assert!(p.html.contains("data:image/png;base64,"), "{}", p.html);
        assert!(p.attachments.iter().any(|a| a.name == "doc.pdf" && !a.inline));
        let pdf = p.attachments.iter().find(|a| a.name == "doc.pdf").unwrap();
        let (name, bytes) = attachment_bytes(raw, pdf.index).unwrap();
        assert_eq!(name, "doc.pdf");
        assert_eq!(&bytes, b"%PDF-");
    }
}
