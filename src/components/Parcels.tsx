import { useEffect, useState } from "react";
import { Check, ExternalLink, Package, PackageCheck, Truck } from "lucide-react";
import { useStore } from "../lib/store";
import { api, onEvent, openExternal } from "../lib/api";
import type { Carrier, ParcelInfo } from "../lib/types";
import { displayName, listDate } from "../lib/format";
import { CodeButton } from "./Codes";
import { cn } from "./ui";

export const carrierName: Record<Carrier, string> = {
  yamato: "ヤマト運輸",
  sagawa: "佐川急便",
  japanpost: "日本郵便",
  amazon: "Amazon",
  seino: "西濃運輸",
  fukuyama: "福山通運",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  "": "配送業者不明",
};

const WEEK = "日月火水木金土";

/** 追跡番号は 4 桁ごとに区切ると伝票と見比べやすい */
export function groupNumber(n: string): string {
  return /^\d{10,}$/.test(n) ? n.replace(/(\d{4})(?=\d)/g, "$1-") : n;
}

/** お届け予定日を「今日」「明日」「10月30日(金)」で */
export function etaLabel(eta: string): string {
  if (!eta) return "";
  const [y, m, d] = eta.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === 2) return "あさって";
  return `${m}月${d}日(${WEEK[date.getDay()]})`;
}

function statusOf(p: ParcelInfo): { label: string; tone: "done" | "today" | "moving"; step: number } {
  if (p.status === "delivered") return { label: "配達済み", tone: "done", step: 3 };
  if (p.status === "out" || etaLabel(p.eta) === "今日") return { label: "本日お届け", tone: "today", step: 2 };
  return { label: "配送中", tone: "moving", step: 1 };
}

/** 発送 → 配達中 → 配達完了 の3段階の進み具合 */
function Progress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn("h-1 flex-1 rounded-full", i <= step ? (step === 3 ? "bg-green" : "bg-blue") : "bg-pill-active")}
        />
      ))}
    </div>
  );
}

function ParcelCard({ p, selected, onSelect }: { p: ParcelInfo; selected: boolean; onSelect: () => void }) {
  const st = statusOf(p);
  const eta = etaLabel(p.eta);
  return (
    <div
      onClick={onSelect}
      className={cn("cursor-default rounded-[14px] p-3.5 transition-colors", selected ? "bg-select" : "hover:bg-pill", st.tone === "done" && "opacity-70")}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px]",
            st.tone === "done" ? "bg-[color-mix(in_srgb,var(--green)_15%,transparent)] text-green" : "bg-[color-mix(in_srgb,var(--blue)_14%,transparent)] text-blue",
          )}
        >
          {st.tone === "done" ? <PackageCheck className="size-[18px]" /> : st.tone === "today" ? <Truck className="size-[18px]" /> : <Package className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold text-fg">{displayName(p.fromName, p.fromAddr)}</span>
            <span className={cn("shrink-0 text-[12px] font-semibold", st.tone === "done" ? "text-green" : st.tone === "today" ? "text-blue" : "text-fg-2")}>
              {st.tone === "done" ? st.label : eta ? `${eta}お届け予定` : st.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-fg-3">{p.subject}</p>
          <div className="mt-2.5">
            <Progress step={st.step} />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-fg-3">{carrierName[p.carrier] ?? p.carrier}</span>
            <CodeButton code={p.number} display={groupNumber(p.number)} size="sm" />
            {p.link && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openExternal(p.link);
                }}
                className="ml-auto inline-flex h-7 cursor-default items-center gap-1 rounded-full px-2.5 text-[12.5px] font-semibold text-blue transition-colors hover:bg-[color-mix(in_srgb,var(--blue)_12%,transparent)]"
              >
                追跡する
                <ExternalLink className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 「荷物」タブ */
export function ParcelsList() {
  const [items, setItems] = useState<ParcelInfo[] | null>(null);
  const select = useStore((s) => s.select);
  const selectedId = useStore((s) => s.selectedId);

  useEffect(() => {
    const load = () => api.listParcels().then(setItems).catch(() => setItems([]));
    load();
    let off: (() => void) | undefined;
    onEvent("mail-changed", load).then((f) => (off = f));
    return () => off?.();
  }, []);

  if (items === null) return null;
  const active = items.filter((p) => p.status !== "delivered");
  const done = items.filter((p) => p.status === "delivered");

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 pb-20 text-center">
        <div className="grid size-14 place-items-center rounded-full bg-pill text-fg-3">
          <Package className="size-6" />
        </div>
        <p className="mt-4 text-[15px] font-medium text-fg-3">追跡中の荷物はありません</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-4">発送のお知らせメールが届くと、ここに並びます</p>
      </div>
    );
  }

  return (
    <div className="px-3 pb-4 pt-1">
      {active.length > 0 && (
        <div className="space-y-1">
          {active.map((p) => (
            <ParcelCard key={p.number} p={p} selected={p.id === selectedId} onSelect={() => select(p.id)} />
          ))}
        </div>
      )}
      {done.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 px-3.5 pb-1 pt-5 text-[12px] font-semibold text-fg-3">
            <Check className="size-3.5" /> 配達済み
          </p>
          <div className="space-y-1">
            {done.map((p) => (
              <ParcelCard key={p.number} p={p} selected={p.id === selectedId} onSelect={() => select(p.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** 本文の上に出す荷物の帯 */
export function ParcelBanner({ p }: { p: ParcelInfo | null }) {
  if (!p) return null;
  const st = statusOf(p);
  const eta = etaLabel(p.eta);
  return (
    <div className="mb-6 rounded-[14px] bg-pill p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("grid size-9 place-items-center rounded-[10px] bg-content", st.tone === "done" ? "text-green" : "text-blue")}>
          {st.tone === "done" ? <PackageCheck className="size-[18px]" /> : <Truck className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold text-fg">
            {st.tone === "done" ? "配達済み" : eta ? `${eta}お届け予定` : st.label}
          </p>
          <p className="text-[12.5px] text-fg-3">{carrierName[p.carrier] ?? p.carrier}</p>
        </div>
        <CodeButton code={p.number} display={groupNumber(p.number)} size="md" />
        {p.link && (
          <button
            onClick={() => openExternal(p.link)}
            className="inline-flex h-9 cursor-default items-center gap-1.5 rounded-[10px] bg-blue px-3.5 text-[13px] font-semibold text-white transition-[filter] hover:brightness-110"
          >
            追跡する
            <ExternalLink className="size-3.5" />
          </button>
        )}
      </div>
      <div className="mt-3.5">
        <Progress step={st.step} />
        <div className="mt-1.5 flex justify-between text-[11px] text-fg-3">
          <span>発送 {listDate(p.firstDate)}</span>
          <span>配達中</span>
          <span>お届け</span>
        </div>
      </div>
    </div>
  );
}
