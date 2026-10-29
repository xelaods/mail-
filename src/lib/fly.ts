/**
 * 画面の要素を「どこからどこへ行ったか」が分かるように動かすための小さな道具。
 * React の描画とは切り離して、要素の写し（ゴースト）を body に置いて Web Animations で動かす。
 * 本物の要素はすぐに消したり差し替えたりしてよいので、状態管理を複雑にしない。
 */

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
/** ほんの少し行き過ぎて戻る。物が「収まる」感じ */
export const EASE_SETTLE = "cubic-bezier(0.34, 1.32, 0.64, 1)";
export const EASE_IN = "cubic-bezier(0.55, 0, 0.75, 0.2)";

export function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function navEl(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-nav="${CSS.escape(key)}"]`);
}

/** 画面に見えている要素か（狭いウィンドウで隠れたサイドバーなどを除く） */
export function visibleRect(el: Element | null | undefined): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return r;
}

/** 要素の見た目をそのまま写したゴーストを、同じ位置に置く */
export function ghost(el: HTMLElement, rect = el.getBoundingClientRect()): HTMLElement {
  const g = el.cloneNode(true) as HTMLElement;
  const cs = getComputedStyle(el);
  g.removeAttribute("id");
  g.querySelectorAll("iframe, video").forEach((n) => n.remove());
  Object.assign(g.style, {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    translate: "none",
    transform: "none",
    transformOrigin: "50% 50%",
    pointerEvents: "none",
    zIndex: "90",
    background: cs.backgroundColor === "rgba(0, 0, 0, 0)" ? "var(--content)" : cs.backgroundColor,
    borderRadius: cs.borderRadius === "0px" ? "11px" : cs.borderRadius,
    boxShadow: "var(--shadow-float, 0 18px 40px -12px rgba(0,0,0,.35))",
    overflow: "hidden",
    willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(g);
  return g;
}

/** 着地した場所を一度だけ小さく弾ませる */
export function pulse(el: HTMLElement | null | undefined, strength = 1) {
  if (!el || reducedMotion()) return;
  const s = 1 + 0.07 * strength;
  el.animate(
    [{ transform: "scale(1)" }, { transform: `scale(${s})`, offset: 0.35 }, { transform: "scale(1)" }],
    { duration: 420, easing: EASE_OUT },
  );
  const icon = el.querySelector<HTMLElement>("svg");
  icon?.animate(
    [{ transform: "scale(1)" }, { transform: `scale(${1 + 0.28 * strength})`, offset: 0.4 }, { transform: "scale(1)" }],
    { duration: 480, easing: EASE_SETTLE },
  );
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * from の要素を、to の位置まで縮みながら飛ばす。
 * 終わったら onLand（着地先を弾ませるなど）。from 自体は動かさない。
 */
export function flyTo(
  from: HTMLElement,
  to: DOMRect,
  opts: { duration?: number; rotate?: number; endScale?: number; arc?: number; onLand?: () => void; fromRect?: DOMRect } = {},
): Promise<void> {
  if (reducedMotion()) {
    opts.onLand?.();
    return Promise.resolve();
  }
  const rect = opts.fromRect ?? from.getBoundingClientRect();
  const g = ghost(from, rect);
  const a = center(rect);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // 着地先の高さに合わせて縮める（細長い行が、サイドバーの1項目くらいの大きさになる）
  const s = opts.endScale ?? Math.max(0.08, Math.min(to.height / rect.height, to.width / rect.width));
  const arc = opts.arc ?? -24;
  const rot = opts.rotate ?? 0;
  const duration = opts.duration ?? 520;
  const anim = g.animate(
    [
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 + arc}px) scale(${(1 + s) / 2.2}) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(${rot}deg)`, opacity: 0.15 },
    ],
    { duration, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" },
  );
  return anim.finished
    .catch(() => undefined)
    .then(() => {
      g.remove();
      opts.onLand?.();
    });
}

/**
 * 要素を「origin の位置から広がって出てくる」ように動かす（FLIP）。
 * 要素はすでに最終位置に描画されている前提。
 */
export function growFrom(el: HTMLElement, origin: DOMRect, opts: { duration?: number; radius?: string } = {}) {
  if (reducedMotion()) return;
  const to = el.getBoundingClientRect();
  if (to.width < 2) return;
  const a = center(origin);
  const b = center(to);
  const sx = Math.max(0.05, origin.width / to.width);
  const sy = Math.max(0.05, origin.height / to.height);
  el.animate(
    [
      { transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${sx}, ${sy})`, opacity: 0, borderRadius: "999px" },
      { opacity: 1, offset: 0.3 },
      { transform: "none", opacity: 1, borderRadius: opts.radius ?? getComputedStyle(el).borderRadius },
    ],
    { duration: opts.duration ?? 440, easing: EASE_OUT },
  );
  // 中身は少し遅れて見せる（伸びている途中の潰れた文字を見せない）
  const kids = Array.from(el.children) as HTMLElement[];
  for (const k of kids) k.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: (opts.duration ?? 440) + 60, easing: "ease-out" });
}

/** el の写しを、origin の位置へ吸い込ませる（閉じる時） */
export function shrinkInto(el: HTMLElement, origin: DOMRect, duration = 300): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const rect = el.getBoundingClientRect();
  const g = ghost(el, rect);
  const a = center(rect);
  const b = center(origin);
  const sx = Math.max(0.05, origin.width / rect.width);
  const sy = Math.max(0.05, origin.height / rect.height);
  (Array.from(g.children) as HTMLElement[]).forEach((k) => k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.4, fill: "forwards" }));
  return g
    .animate(
      [
        { transform: "none", opacity: 1, borderRadius: getComputedStyle(el).borderRadius },
        { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${sx}, ${sy})`, opacity: 0, borderRadius: "999px" },
      ],
      { duration, easing: EASE_IN, fill: "forwards" },
    )
    .finished.catch(() => undefined)
    .then(() => g.remove());
}

/* ------------------------------------------------------------------ */
/* 一覧 → 本文：開いた行の件名の位置を覚えておき、本文の見出しをそこから動かす */
/* ------------------------------------------------------------------ */

let pendingOpen: { id: number; rect: DOMRect; fontSize: number; at: number } | null = null;

export function rememberOpen(id: number, subjectEl: HTMLElement | null) {
  if (!subjectEl) return;
  pendingOpen = {
    id,
    rect: subjectEl.getBoundingClientRect(),
    fontSize: parseFloat(getComputedStyle(subjectEl).fontSize) || 13,
    at: performance.now(),
  };
}

export function takeOpen(id: number) {
  const p = pendingOpen;
  pendingOpen = null;
  if (!p || p.id !== id || performance.now() - p.at > 1500) return null;
  return p;
}
