//! 確認コード・認証コード・認証リンクの検出。
//!
//! 誤検出（注文番号や電話番号をコードと思い込む）を避けるため、
//! 「コード」を示す言葉のすぐ近くにある数字・英数字だけを拾う。

/// 件名・本文のどこかに含まれていれば「認証系のメール」とみなす言葉
const CONTEXT_WORDS: &[&str] = &[
    "確認コード", "認証コード", "認証番号", "確認番号", "ワンタイム", "セキュリティコード", "セキュリティ コード",
    "ログインコード", "サインインコード", "検証コード", "承認コード", "パスコード", "暗証番号", "コード",
    "verification code", "verify", "one-time", "one time", "otp", "passcode", "security code", "login code",
    "sign-in code", "sign in code", "authentication code", "confirmation code", "your code", "code is", "pin",
    "enter this code", "enter the code", "enter the following code", "use this code", "use the code", "コードを入力",
];

/// コードのすぐ前に来る言葉（この直後〜数十文字以内のトークンを最優先で拾う）
const LEAD_WORDS: &[&str] = &[
    "確認コード", "認証コード", "認証番号", "確認番号", "ワンタイムパスワード", "ワンタイム", "セキュリティコード",
    "セキュリティ コード", "ログインコード", "サインインコード", "検証コード", "承認コード", "パスコード", "コード",
    "verification code", "one-time code", "one time code", "one-time password", "otp", "passcode", "security code",
    "login code", "sign-in code", "authentication code", "confirmation code", "your code", "code is", "code:",
    "pin", "enter this code", "enter the code", "enter the following code", "use this code", "use the code",
];

/// 認証リンクのテキスト・URL に含まれる言葉
const LINK_WORDS: &[&str] = &[
    "verify", "verification", "confirm", "activate", "activation", "magic", "login", "log in", "sign in", "signin",
    "sign-in", "auth", "validate", "reset", "認証", "確認", "有効化", "ログイン", "サインイン", "本登録", "登録を完了",
    "パスワードの再設定", "パスワードを再設定",
];

/// リンクから外すもの（配信停止・ヘルプなど）
const LINK_EXCLUDE: &[&str] = &[
    "unsubscribe", "配信停止", "配信解除", "privacy", "terms", "help", "support", "faq", "preferences", "settings",
    "mailto:", "tel:", "facebook.com", "twitter.com", "x.com/", "instagram.com", "youtube.com", "linkedin.com",
];

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Found {
    pub code: String,
    pub link: String,
}

fn has_context(lower: &str) -> bool {
    CONTEXT_WORDS.iter().any(|w| lower.contains(w))
}

/// 全角数字・全角英字を半角に
fn to_halfwidth(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            '０'..='９' => char::from_u32(c as u32 - '０' as u32 + '0' as u32).unwrap_or(c),
            'Ａ'..='Ｚ' => char::from_u32(c as u32 - 'Ａ' as u32 + 'A' as u32).unwrap_or(c),
            'ａ'..='ｚ' => char::from_u32(c as u32 - 'ａ' as u32 + 'a' as u32).unwrap_or(c),
            '　' => ' ',
            '：' => ':',
            '－' => '-',
            _ => c,
        })
        .collect()
}

/// コードらしいトークンか：4〜8桁の数字、または数字を含む 6〜10 文字の英数字（ハイフン区切りも可）
fn looks_like_code(tok: &str) -> bool {
    let compact: String = tok.chars().filter(|c| *c != '-' && *c != ' ').collect();
    let len = compact.chars().count();
    if !(4..=10).contains(&len) {
        return false;
    }
    if !compact.chars().all(|c| c.is_ascii_alphanumeric()) {
        return false;
    }
    let digits = compact.chars().filter(|c| c.is_ascii_digit()).count();
    if digits == len {
        // 年号（2026 など）はコードとみなさない
        if len == 4 && (compact.starts_with("19") || compact.starts_with("20")) {
            return false;
        }
        return len <= 8;
    }
    // 英数字混在：数字が入っていて、大文字中心（G-123456 や AB12CD など）
    digits >= 2 && len >= 6 && compact.chars().filter(|c| c.is_ascii_lowercase()).count() <= 1
}

/// 文字列を「コード候補」のトークンに分ける（"123 456" や "123-456" は1つにまとめる）
fn tokens(s: &str) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    let mut i = 0;
    while i < chars.len() {
        let (start, c) = chars[i];
        if c.is_ascii_alphanumeric() {
            let mut j = i;
            let mut tok = String::new();
            while j < chars.len() {
                let ch = chars[j].1;
                if ch.is_ascii_alphanumeric() {
                    tok.push(ch);
                    j += 1;
                } else if (ch == '-' || ch == ' ')
                    && j + 1 < chars.len()
                    && chars[j + 1].1.is_ascii_digit()
                    && tok.chars().last().is_some_and(|l| l.is_ascii_digit())
                    && tok.len() <= 4
                {
                    // 「123 456」「123-456」形式
                    tok.push(ch);
                    j += 1;
                } else {
                    break;
                }
            }
            out.push((start, tok));
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

pub fn find_code(subject: &str, body: &str) -> Option<String> {
    let text = to_halfwidth(&format!("{subject}\n{body}"));
    let lower = text.to_lowercase();
    if !has_context(&lower) {
        return None;
    }
    // 1) 「◯◯コード」の直後 60 文字以内にあるもの
    let mut best: Option<(usize, String)> = None;
    for w in LEAD_WORDS {
        let mut from = 0;
        while let Some(pos) = lower[from..].find(w) {
            let at = from + pos + w.len();
            let window_end = lower
                .char_indices()
                .map(|(i, _)| i)
                .find(|i| *i >= at && text[at..*i].chars().count() >= 60)
                .unwrap_or(text.len());
            let window = &text[at..window_end];
            if let Some((off, tok)) = tokens(window).into_iter().find(|(_, t)| looks_like_code(t)) {
                let dist = off;
                if best.as_ref().is_none_or(|(d, _)| dist < *d) {
                    best = Some((dist, tok));
                }
            }
            from = at;
        }
    }
    if let Some((_, tok)) = best {
        return Some(tok.replace(' ', ""));
    }
    // 2) 件名だけで判断できる場合（「123456 is your code」など）
    let subj = to_halfwidth(subject);
    let mut subj_codes = tokens(&subj).into_iter().map(|(_, t)| t).filter(|t| looks_like_code(t));
    if let (Some(c), None) = (subj_codes.next(), subj_codes.next()) {
        return Some(c.replace(' ', ""));
    }
    // 3) 本文の中で、行全体がコードだけ（大きく表示されているもの）
    for line in body.lines() {
        let t = to_halfwidth(line.trim());
        if !t.is_empty() && looks_like_code(&t) && t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == ' ') {
            return Some(t.replace(' ', ""));
        }
    }
    None
}

/// 他のモジュールから使う版
pub fn anchors_public(html: &str) -> Vec<(String, String)> {
    anchors(html)
}

/// HTML の a 要素（href と表示文字）を拾う簡易パーサ
fn anchors(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let lower = html.to_lowercase();
    let mut from = 0;
    while let Some(p) = lower[from..].find("<a ") {
        let start = from + p;
        let Some(gt) = lower[start..].find('>') else { break };
        let tag = &html[start..start + gt];
        let end = lower[start..].find("</a>").map(|e| start + e).unwrap_or(start + gt + 1);
        let inner_raw = &html[(start + gt + 1).min(end)..end];
        let inner = mail_parser::decoders::html::html_to_text(inner_raw);
        if let Some(h) = tag.to_lowercase().find("href=") {
            let rest = &tag[h + 5..];
            let quote = rest.chars().next().unwrap_or('"');
            let href = if quote == '"' || quote == '\'' {
                rest[1..].split(quote).next().unwrap_or("")
            } else {
                rest.split(|c: char| c.is_whitespace()).next().unwrap_or("")
            };
            out.push((href.replace("&amp;", "&"), inner.trim().to_string()));
        }
        from = end.max(start + 3);
    }
    out
}

pub fn find_link(subject: &str, text: &str, html: &str) -> Option<String> {
    let ctx = format!("{subject}\n{text}").to_lowercase();
    let auth_mail = LINK_WORDS.iter().any(|w| ctx.contains(w));
    if !auth_mail {
        return None;
    }
    let score = |href: &str, label: &str| -> i32 {
        let h = href.to_lowercase();
        let l = label.to_lowercase();
        if !(h.starts_with("https://") || h.starts_with("http://")) {
            return -1;
        }
        if LINK_EXCLUDE.iter().any(|x| h.contains(x) || l.contains(x)) {
            return -1;
        }
        let mut s = 0;
        for w in LINK_WORDS {
            if l.contains(w) {
                s += 3;
            }
            if h.contains(w) {
                s += 2;
            }
        }
        if h.contains("token=") || h.contains("code=") || h.contains("key=") {
            s += 2;
        }
        s
    };
    let mut best: Option<(i32, String)> = None;
    for (href, label) in anchors(html) {
        let s = score(&href, &label);
        if s >= 3 && best.as_ref().is_none_or(|(b, _)| s > *b) {
            best = Some((s, href));
        }
    }
    if best.is_none() {
        for word in text.split_whitespace() {
            let w = word.trim_matches(|c: char| "<>()「」\"'".contains(c));
            if w.starts_with("http") {
                let s = score(w, "");
                if s >= 2 && best.as_ref().is_none_or(|(b, _)| s > *b) {
                    best = Some((s, w.to_string()));
                }
            }
        }
    }
    best.map(|(_, h)| h)
}

pub fn detect(subject: &str, text: &str, html: &str) -> Found {
    let body = if !text.trim().is_empty() {
        text.to_string()
    } else {
        mail_parser::decoders::html::html_to_text(html)
    };
    let body: String = body.chars().take(6000).collect();
    Found {
        code: find_code(subject, &body).unwrap_or_default(),
        link: find_link(subject, &body, html).unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn japanese_codes() {
        assert_eq!(find_code("【〇〇】認証コードのお知らせ", "あなたの認証コードは 482913 です。10分間有効です。").as_deref(), Some("482913"));
        assert_eq!(find_code("ログイン確認", "確認コード：０４７７２１\nこのコードは誰にも教えないでください").as_deref(), Some("047721"));
        assert_eq!(find_code("ワンタイムパスワード", "ワンタイムパスワード\n\n  731 904  \n\n有効期限：5分").as_deref(), Some("731904"));
    }

    #[test]
    fn english_codes() {
        assert_eq!(find_code("Your verification code", "Your verification code is: 918273").as_deref(), Some("918273"));
        // 「G-」は入力欄に打たないので数字だけを拾う
        assert_eq!(find_code("G-554210 is your Google verification code", "").as_deref(), Some("554210"));
        assert_eq!(find_code("Sign in to Example", "Enter this code to sign in:\n\nK7P2QX9\n\nIt expires in 10 minutes.").as_deref(), Some("K7P2QX9"));
    }

    #[test]
    fn ignores_non_codes() {
        // 注文番号や金額はコードとして拾わない
        assert_eq!(find_code("ご注文ありがとうございます", "注文番号 2026-1028-0412\n合計 ¥6,260"), None);
        assert_eq!(find_code("来週の打ち合わせ", "2026年11月4日 15:00 から会議室 301 で"), None);
    }

    #[test]
    fn verification_links() {
        let html = r#"<p>メールアドレスを確認してください</p>
            <a href="https://example.com/help">ヘルプ</a>
            <a href="https://example.com/verify?token=abc&amp;u=1">メールアドレスを確認する</a>
            <a href="https://example.com/unsubscribe">配信停止</a>"#;
        assert_eq!(
            find_link("メールアドレスの確認", "メールアドレスを確認してください", html).as_deref(),
            Some("https://example.com/verify?token=abc&u=1")
        );
        assert_eq!(find_link("今週のお知らせ", "新しい記事", r#"<a href="https://example.com/post">記事を読む</a>"#), None);
    }
}
