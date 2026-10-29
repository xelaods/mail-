//! 発送メールから、配送業者・追跡番号・お届け予定日・状態を読み取る。
//!
//! 追跡番号は「お問い合わせ番号」「追跡番号」などの言葉のすぐ近くにある番号だけを拾う
//! （注文番号や電話番号を取り違えないように）。

use chrono::{Datelike, TimeZone};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Parcel {
    pub carrier: String,
    pub number: String,
    /// お届け予定日（YYYY-MM-DD）。分からなければ空
    pub eta: String,
    /// shipped（発送済み）/ out（配達中・本日お届け）/ delivered（配達完了）/ 空
    pub status: String,
    /// 追跡ページの URL
    pub link: String,
}

const NUMBER_WORDS: &[&str] = &[
    "お問い合わせ番号", "お問合せ番号", "お問合わせ番号", "問い合わせ番号", "追跡番号", "伝票番号", "送り状番号",
    "配送番号", "荷物番号", "追跡id", "tracking number", "tracking no", "tracking #", "tracking id", "伝票no",
];

/// 発送・配達に関係するメールか
const SHIPPING_WORDS: &[&str] = &[
    "発送", "出荷", "配送", "配達", "お届け", "お荷物", "宅配便", "ゆうパック", "ゆうパケット", "宅急便", "飛脚",
    "shipped", "shipment", "delivery", "delivered", "tracking",
];

fn halfwidth(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '０'..='９' => char::from_u32(c as u32 - '０' as u32 + '0' as u32).unwrap_or(c),
            'Ａ'..='Ｚ' => char::from_u32(c as u32 - 'Ａ' as u32 + 'A' as u32).unwrap_or(c),
            'ａ'..='ｚ' => char::from_u32(c as u32 - 'ａ' as u32 + 'a' as u32).unwrap_or(c),
            '－' | '‐' | '−' => '-',
            '：' => ':',
            '　' => ' ',
            '／' => '/',
            _ => c,
        })
        .collect()
}

/// 番号らしい文字列（数字とハイフン、または英字2+数字9+英字2 の国際郵便）を1つ取り出す
fn take_number(s: &str) -> Option<String> {
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_alphanumeric() {
            let mut j = i;
            let mut tok = String::new();
            while j < chars.len() && (chars[j].is_ascii_alphanumeric() || chars[j] == '-' || (chars[j] == ' ' && j + 1 < chars.len() && chars[j + 1].is_ascii_digit() && tok.ends_with(|c: char| c.is_ascii_digit()))) {
                tok.push(chars[j]);
                j += 1;
            }
            let compact: String = tok.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
            let digits = compact.chars().filter(|c| c.is_ascii_digit()).count();
            let upper = compact.to_ascii_uppercase();
            let ok = (digits == compact.len() && (10..=15).contains(&digits))
                || (upper.starts_with("TBA") && digits >= 9)
                || (upper.starts_with("1Z") && compact.len() == 18)
                || (compact.len() == 13 && upper[..2].chars().all(|c| c.is_ascii_alphabetic()) && upper[11..].chars().all(|c| c.is_ascii_alphabetic()) && upper[2..11].chars().all(|c| c.is_ascii_digit()));
            if ok {
                return Some(upper);
            }
            i = j.max(i + 1);
        } else {
            i += 1;
        }
    }
    None
}

fn find_number(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for w in NUMBER_WORDS {
        let mut from = 0;
        while let Some(p) = lower[from..].find(w) {
            let at = from + p + w.len();
            let end = text[at..].char_indices().nth(40).map(|(i, _)| at + i).unwrap_or(text.len());
            if let Some(n) = take_number(&text[at..end]) {
                return Some(n);
            }
            from = at;
        }
    }
    // Amazon の TBA 番号や UPS の 1Z 番号は、言葉がなくても形で分かる
    for tok in text.split(|c: char| !c.is_ascii_alphanumeric()) {
        let u = tok.to_ascii_uppercase();
        if (u.starts_with("TBA") && u.len() >= 12 && u[3..].chars().all(|c| c.is_ascii_digit()))
            || (u.starts_with("1Z") && u.len() == 18)
        {
            return Some(u);
        }
    }
    None
}

fn detect_carrier(text: &str, number: &str) -> &'static str {
    let l = text.to_lowercase();
    if number.starts_with("TBA") || l.contains("amazon") && l.contains("配送") && !l.contains("ヤマト") && !l.contains("佐川") && !l.contains("日本郵便") {
        if number.starts_with("TBA") {
            return "amazon";
        }
    }
    if number.starts_with("1Z") || l.contains("ups") && l.contains("tracking") {
        return "ups";
    }
    if l.contains("ヤマト") || l.contains("クロネコ") || l.contains("宅急便") || l.contains("kuronekoyamato") || l.contains("ネコポス") {
        return "yamato";
    }
    if l.contains("佐川") || l.contains("飛脚") || l.contains("sagawa") {
        return "sagawa";
    }
    if l.contains("日本郵便") || l.contains("ゆうパック") || l.contains("ゆうパケット") || l.contains("ゆうメール") || l.contains("japanpost") || l.contains("郵便") {
        return "japanpost";
    }
    if l.contains("西濃") || l.contains("カンガルー便") {
        return "seino";
    }
    if l.contains("福山通運") {
        return "fukuyama";
    }
    if l.contains("fedex") {
        return "fedex";
    }
    if l.contains("dhl") {
        return "dhl";
    }
    // 国際郵便（EJ123456789JP など）は日本郵便で追跡できる
    if number.len() == 13 && number.ends_with("JP") {
        return "japanpost";
    }
    ""
}

pub fn tracking_url(carrier: &str, number: &str) -> String {
    let n: String = number.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    match carrier {
        "yamato" => format!("https://toi.kuronekoyamato.co.jp/cgi-bin/tneko?number00=1&number01={n}"),
        "sagawa" => format!("https://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do?okurijoNo={n}"),
        "japanpost" => format!("https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1={n}&locale=ja"),
        "seino" => format!("https://track.seino.co.jp/cgi-bin/gnpquery.pgm?GNPNO1={n}"),
        "fukuyama" => format!("https://corp.fukutsu.co.jp/situation/tracking_no_hunt/{n}"),
        "ups" => format!("https://www.ups.com/track?loc=ja_JP&tracknum={n}"),
        "fedex" => format!("https://www.fedex.com/fedextrack/?trknbr={n}"),
        "dhl" => format!("https://www.dhl.com/jp-ja/home/tracking.html?tracking-id={n}"),
        _ => String::new(),
    }
}

fn detect_status(subject: &str, body: &str) -> &'static str {
    let s = format!("{subject}\n{body}").to_lowercase();
    let subj = subject.to_lowercase();
    let delivered = ["配達完了", "配達が完了", "お届けが完了", "お届けしました", "配達しました", "お届け完了", "delivered", "was delivered"];
    let out = ["本日お届け", "本日配達", "配達中", "まもなくお届け", "out for delivery", "arriving today"];
    // 件名を優先（本文には「配達完了後に〜」のような説明も入るため）
    if delivered.iter().any(|w| subj.contains(w)) {
        return "delivered";
    }
    if out.iter().any(|w| subj.contains(w)) {
        return "out";
    }
    if delivered.iter().any(|w| s.contains(w)) && !s.contains("配達完了後") {
        return "delivered";
    }
    if out.iter().any(|w| s.contains(w)) {
        return "out";
    }
    "shipped"
}

/// 「お届け予定日：10月30日（金）」「2026/10/30」などからお届け予定日を読む
fn detect_eta(text: &str, sent_at: i64) -> String {
    let words = ["お届け予定", "配達予定", "到着予定", "お届け日", "お届け希望日", "配達日", "arriving", "estimated delivery", "delivery date"];
    let lower = text.to_lowercase();
    let sent = chrono::Local.timestamp_opt(sent_at.max(0), 0).single().unwrap_or_else(chrono::Local::now);
    for w in words {
        let Some(p) = lower.find(w) else { continue };
        let at = p + w.len();
        let end = text[at..].char_indices().nth(40).map(|(i, _)| at + i).unwrap_or(text.len());
        let win = &text[at..end];
        let nums: Vec<u32> = win
            .split(|c: char| !c.is_ascii_digit())
            .filter(|t| !t.is_empty())
            .take(3)
            .filter_map(|t| t.parse().ok())
            .collect();
        let (y, m, d) = match nums.as_slice() {
            [y, m, d, ..] if *y >= 2000 => (*y as i32, *m, *d),
            [m, d, ..] if (1..=12).contains(m) && (1..=31).contains(d) => {
                // 年が書かれていない時は、送信日から見て近い方の年
                let mut y = sent.year();
                if (*m as i32) < sent.month() as i32 - 6 {
                    y += 1;
                }
                (y, *m, *d)
            }
            _ => continue,
        };
        if chrono::NaiveDate::from_ymd_opt(y, m, d).is_some() {
            return format!("{y:04}-{m:02}-{d:02}");
        }
    }
    String::new()
}

pub fn detect(subject: &str, text: &str, html: &str, sent_at: i64) -> Option<Parcel> {
    let body = if !text.trim().is_empty() {
        text.to_string()
    } else {
        mail_parser::decoders::html::html_to_text(html)
    };
    let body: String = halfwidth(&body.chars().take(8000).collect::<String>());
    let subject = halfwidth(subject);
    let all = format!("{subject}\n{body}");
    let lower = all.to_lowercase();
    if !SHIPPING_WORDS.iter().any(|w| lower.contains(w)) {
        return None;
    }
    let number = find_number(&all)?;
    let carrier = detect_carrier(&all, &number).to_string();
    let mut link = tracking_url(&carrier, &number);
    if link.is_empty() {
        // 業者が分からない時は、メールの中の追跡ページらしいリンクを使う
        link = crate::codes::anchors_public(html)
            .into_iter()
            .find(|(h, l)| {
                let h = h.to_lowercase();
                let l = l.to_lowercase();
                h.starts_with("http") && (h.contains("track") || h.contains("tsuiseki") || l.contains("追跡") || l.contains("配送状況") || l.contains("track"))
            })
            .map(|(h, _)| h)
            .unwrap_or_default();
    }
    Some(Parcel {
        carrier,
        number,
        eta: detect_eta(&all, sent_at),
        status: detect_status(&subject, &body).to_string(),
        link,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SENT: i64 = 1_793_000_000; // 2026年10月下旬

    #[test]
    fn yamato() {
        let p = detect(
            "【オンラインストア】商品発送のお知らせ",
            "ご注文の商品を発送しました。\n注文番号：2026-1028-0412\n配送業者：ヤマト運輸\nお問い合わせ番号：4321-5678-9012\nお届け予定日：10月30日（金）",
            "",
            SENT,
        )
        .unwrap();
        assert_eq!(p.carrier, "yamato");
        assert_eq!(p.number, "432156789012");
        assert_eq!(p.eta, "2026-10-30");
        assert_eq!(p.status, "shipped");
        assert!(p.link.contains("number01=432156789012"));
    }

    #[test]
    fn japan_post_and_delivered() {
        let p = detect("ゆうパックお届け完了のお知らせ", "お問い合わせ番号 １２３４－５６７８－９０１２ のお荷物は配達が完了しました。", "", SENT).unwrap();
        assert_eq!(p.carrier, "japanpost");
        assert_eq!(p.number, "123456789012");
        assert_eq!(p.status, "delivered");
    }

    #[test]
    fn amazon_and_english() {
        let p = detect("Your package is out for delivery", "Tracking ID: TBA312345678901\nArriving today", "", SENT).unwrap();
        assert_eq!(p.carrier, "amazon");
        assert_eq!(p.number, "TBA312345678901");
        assert_eq!(p.status, "out");
    }

    #[test]
    fn ignores_order_only() {
        assert_eq!(detect("ご注文ありがとうございます", "注文番号：250-1234567-8901234\n発送までしばらくお待ちください", "", SENT), None);
        assert_eq!(detect("来週の打ち合わせ", "電話番号 03-1234-5678 までご連絡ください", "", SENT), None);
    }
}
