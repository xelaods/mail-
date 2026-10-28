import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DOMPurify from "dompurify";
import { ImageOff, MoreHorizontal } from "lucide-react";
import { openExternal } from "../lib/api";
import { cn } from "./ui";

/** HTML メールを安全に整え、外部画像を CSP で止める */
function buildDocument(html: string, allowRemote: boolean): { doc: string; blocked: number } {
  const clean = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "frame", "frameset", "base", "meta", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
    ADD_ATTR: ["target"],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
  const parsed = new DOMParser().parseFromString(clean, "text/html");

  let blocked = 0;
  parsed.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (/^https?:/i.test(src)) {
      blocked++;
      // 1x1 のトラッキング画像は表示しても意味がないので常に消す
      const w = img.getAttribute("width");
      const h = img.getAttribute("height");
      if ((w === "1" || w === "0") && (h === "1" || h === "0")) img.remove();
    }
  });
  if (/url\(\s*['"]?https?:/i.test(clean)) blocked++;

  const csp = parsed.createElement("meta");
  csp.setAttribute("http-equiv", "Content-Security-Policy");
  csp.setAttribute(
    "content",
    `default-src 'none'; style-src 'unsafe-inline'${allowRemote ? " https: http:" : ""}; img-src data: cid:${allowRemote ? " https: http:" : ""}; font-src data:${allowRemote ? " https:" : ""}; media-src 'none'`,
  );
  const style = parsed.createElement("style");
  style.textContent = `
    html { color-scheme: light; }
    body { margin: 0; padding: 28px 32px; font-family: "Geist Variable", "Yu Gothic UI", "Hiragino Sans", "Noto Sans JP", "Meiryo UI", system-ui, sans-serif;
      font-size: 14px; line-height: 1.7; color: #1d1d1f; background: #ffffff; overflow-wrap: anywhere; word-break: normal; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100% !important; }
    a { color: #2563eb; }
    pre { white-space: pre-wrap; }
    blockquote { margin: 8px 0; padding-left: 12px; border-left: 2px solid #e4e4e7; color: #52525b; }
    ::selection { background: #bfdbfe; }
    ::-webkit-scrollbar { height: 8px; width: 8px; }
    ::-webkit-scrollbar-thumb { background: #d4d4d8; border-radius: 9999px; }
  `;
  parsed.head.prepend(style);
  parsed.head.prepend(csp);
  parsed.querySelectorAll("a").forEach((a) => a.setAttribute("target", "_blank"));
  return { doc: "<!doctype html>" + parsed.documentElement.outerHTML, blocked };
}

export function HtmlFrame({ html, allowRemote, onBlocked }: { html: string; allowRemote: boolean; onBlocked: (n: number) => void }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const { doc, blocked } = useMemo(() => buildDocument(html, allowRemote), [html, allowRemote]);

  useEffect(() => onBlocked(allowRemote ? 0 : blocked), [blocked, allowRemote, onBlocked]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let ro: ResizeObserver | undefined;
    const onLoad = () => {
      const d = frame.contentDocument;
      if (!d) return;
      const measure = () => setHeight(Math.max(60, d.documentElement.scrollHeight));
      measure();
      ro = new ResizeObserver(measure);
      ro.observe(d.documentElement);
      d.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
      d.addEventListener("click", (e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute("href") ?? "";
        if (/^(https?:|mailto:)/i.test(href)) openExternal(href);
      });
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [doc]);

  return (
    <iframe
      ref={ref}
      title="メール本文"
      srcDoc={doc}
      sandbox="allow-same-origin"
      className="block w-full border-0 bg-white"
      style={{ height }}
    />
  );
}

/** テキストメール：URL をリンクにし、引用部分（> で始まる行）は折りたたむ */
export function TextBody({ text }: { text: string }) {
  const [showQuote, setShowQuote] = useState(false);
  const { main, quote } = useMemo(() => splitQuote(text.replace(/\r/g, "")), [text]);
  return (
    <div className="selectable whitespace-pre-wrap break-words text-[14px] leading-[1.8] text-fg">
      {linkify(main.trimEnd())}
      {quote && (
        <>
          <button
            onClick={() => setShowQuote(!showQuote)}
            className="mt-3 flex h-5 cursor-default items-center rounded-full border border-line bg-surface-raised px-2 text-fg-3 transition-colors hover:border-line-hover hover:text-fg"
            aria-label={showQuote ? "引用を隠す" : "引用を表示"}
          >
            <MoreHorizontal className="size-4" />
          </button>
          {showQuote && <div className="mt-3 border-l-2 border-line pl-3 text-fg-3">{linkify(quote)}</div>}
        </>
      )}
    </div>
  );
}

function splitQuote(text: string): { main: string; quote: string } {
  const lines = text.split("\n");
  // 「YYYY年…に…が書きました:」や「On … wrote:」の行から下を引用とみなす
  const headerIdx = lines.findIndex(
    (l, i) =>
      (/wrote:\s*$/i.test(l) || /(書きました|書き込みました)[:：]\s*$/.test(l) || /^\d{4}年.*[:：]\s*$/.test(l) || /^-{5,}\s*(Original|転送|元の)/.test(l)) &&
      lines.slice(i + 1, i + 4).some((x) => x.startsWith(">") || x.trim() === "" || /^-{5,}/.test(x)),
  );
  const firstQuote = lines.findIndex((l, i) => l.startsWith(">") && lines.slice(i).every((x) => x.startsWith(">") || x.trim() === ""));
  const cut = headerIdx >= 0 ? headerIdx : firstQuote;
  if (cut <= 0) return { main: text, quote: "" };
  return { main: lines.slice(0, cut).join("\n"), quote: lines.slice(cut).join("\n") };
}

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(https?:\/\/[^\s<>"'）」]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const url = m[1];
    out.push(
      <a
        key={m.index}
        href={url}
        onClick={(e) => {
          e.preventDefault();
          openExternal(url);
        }}
        className="text-[#60a5fa] underline decoration-[#60a5fa]/30 underline-offset-2 hover:decoration-[#60a5fa]"
      >
        {url}
      </a>,
    );
    last = m.index + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function BlockedBanner({ count, onShow, onTrust }: { count: number; onShow: () => void; onTrust: () => void }) {
  if (count <= 0) return null;
  return (
    <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-line bg-surface-raised px-3 py-2 text-xs text-fg-2">
      <ImageOff className="size-4 shrink-0 text-fg-3" />
      <span className="flex-1">開封を知られないよう、外部の画像を止めています</span>
      <button onClick={onShow} className={cn("cursor-default rounded-md px-2 py-1 font-medium text-fg hover:bg-pill")}>
        画像を表示
      </button>
      <button onClick={onTrust} className="cursor-default rounded-md px-2 py-1 text-fg-2 hover:bg-pill hover:text-fg">
        この差出人は常に表示
      </button>
    </div>
  );
}
