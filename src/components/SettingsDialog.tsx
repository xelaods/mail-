import { useEffect, useState, type ReactNode } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useStore } from "../lib/store";
import { api } from "../lib/api";
import type { Account } from "../lib/types";
import { accountHues, providerLabel } from "../lib/format";
import { Button, Dialog, Field, Kbd, Segmented, Switch, cn, inputClass } from "./ui";

type Tab = "general" | "accounts" | "keys";

export function SettingsDialog() {
  const open = useStore((s) => s.dialog === "settings");
  const setDialog = useStore((s) => s.setDialog);
  const [tab, setTab] = useState<Tab>("general");
  return (
    <Dialog open={open} onClose={() => setDialog(null)} title="設定" width={620}>
      <div className="px-6 pt-4">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: "general", label: "一般" },
            { value: "accounts", label: "アカウント" },
            { value: "keys", label: "ショートカット" },
          ]}
        />
      </div>
      <div className="px-6 pb-6 pt-4">
        {tab === "general" && <General />}
        {tab === "accounts" && <Accounts />}
        {tab === "keys" && <ShortcutList />}
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const open = useStore((s) => s.dialog === "shortcuts");
  const setDialog = useStore((s) => s.setDialog);
  return (
    <Dialog open={open} onClose={() => setDialog(null)} title="キーボードショートカット" description="入力欄の外で使えます。" width={560}>
      <div className="px-6 pb-6 pt-4">
        <ShortcutList />
      </div>
    </Dialog>
  );
}

function SettingRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 border-b border-line-subtle py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium text-fg">{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-fg-3">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function General() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  return (
    <div>
      <SettingRow title="テーマ">
        <Segmented
          size="sm"
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: "system", label: "システム" },
            { value: "light", label: "ライト" },
            { value: "dark", label: "ダーク" },
          ]}
        />
      </SettingRow>
      <SettingRow title="一覧の表示密度" desc="コンパクトにすると1画面に多くのメールが並びます">
        <Segmented
          size="sm"
          value={settings.density}
          onChange={(density) => update({ density })}
          options={[
            { value: "comfortable", label: "標準" },
            { value: "compact", label: "コンパクト" },
          ]}
        />
      </SettingRow>
      <SettingRow title="本文プレビュー">
        <Segmented
          size="sm"
          value={String(settings.previewLines) as "1" | "2"}
          onChange={(v) => update({ previewLines: v === "1" ? 1 : 2 })}
          options={[
            { value: "1", label: "1行" },
            { value: "2", label: "2行" },
          ]}
        />
      </SettingRow>
      <SettingRow title="送信の取り消し" desc="送信ボタンを押してから実際に送るまでの待ち時間です">
        <Segmented
          size="sm"
          value={String(settings.undoSeconds) as "0" | "5" | "10" | "20"}
          onChange={(v) => update({ undoSeconds: Number(v) })}
          options={[
            { value: "0", label: "なし" },
            { value: "5", label: "5秒" },
            { value: "10", label: "10秒" },
            { value: "20", label: "20秒" },
          ]}
        />
      </SettingRow>
      <SettingRow title="開いたメールを既読にする">
        <Switch label="開いたメールを既読にする" checked={settings.markReadOnOpen} onChange={(v) => update({ markReadOnOpen: v })} />
      </SettingRow>
      <SettingRow title="届いた確認コードを自動でコピー" desc="認証コードのメールが届いたら、コードをクリップボードに入れて通知します">
        <Switch label="届いた確認コードを自動でコピー" checked={settings.autoCopyCodes} onChange={(v) => update({ autoCopyCodes: v })} />
      </SettingRow>
      <SettingRow title="新着メールを通知" desc="Windows の通知センターに表示します">
        <Switch label="新着メールを通知" checked={settings.notifications} onChange={(v) => update({ notifications: v })} />
      </SettingRow>
    </div>
  );
}

function Accounts() {
  const accounts = useStore((s) => s.accounts);
  const setDialog = useStore((s) => s.setDialog);
  const [builtin, setBuiltin] = useState<boolean | null>(null);
  useEffect(() => {
    api.googleBuiltin().then(setBuiltin).catch(() => setBuiltin(false));
  }, []);
  return (
    <div className="space-y-3">
      {builtin !== null && (
        <p className="flex items-center gap-2 text-xs text-fg-3">
          <span className={cn("size-1.5 rounded-full", builtin ? "bg-green" : "bg-fg-4")} />
          Google でサインイン：{builtin ? "このアプリに組み込み済み" : "組み込まれていません（ビルド時に Secrets が未設定）"}
        </p>
      )}
      {accounts.map((a) => (
        <AccountCard key={a.id} a={a} />
      ))}
      <Button variant="outline" className="w-full" onClick={() => setDialog("addAccount")}>
        アカウントを追加
      </Button>
    </div>
  );
}

function AccountCard({ a }: { a: Account }) {
  const sync = useStore((s) => s.sync[a.id]);
  const reloadMeta = useStore((s) => s.reloadMeta);
  const pushToast = useStore((s) => s.pushToast);
  const [name, setName] = useState(a.name);
  const [signature, setSignature] = useState(a.signature);
  const [color, setColor] = useState(a.color);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(a.name);
    setSignature(a.signature);
    setColor(a.color);
  }, [a]);
  const dirty = name !== a.name || signature !== a.signature || color !== a.color;

  return (
    <div className="rounded-[14px] border border-line bg-surface-raised p-4">
      <div className="flex items-center gap-3">
        <span className="size-2.5 rounded-full" style={{ background: accountHues[color % accountHues.length] }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-fg">{a.email}</p>
          <p className={cn("text-xs", sync?.state === "error" ? "text-danger" : "text-fg-3")}>
            {providerLabel(a.provider)}
            {sync?.state === "syncing" ? "同期中" : sync?.state === "error" ? sync.message : "接続済み（新着はプッシュで受信）"}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RefreshCw className={cn("size-3.5", busy && "animate-spin")} />}
          onClick={async () => {
            setBusy(true);
            try {
              await api.refreshFolders(a.id);
              await reloadMeta();
            } catch (e) {
              pushToast({ title: "フォルダを更新できませんでした", description: String(e), tone: "error" });
            }
            setBusy(false);
          }}
        >
          フォルダを再読み込み
        </Button>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="表示名">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="署名" hint="新しく書くメールの末尾に自動で入ります">
          <textarea className={cn(inputClass, "h-20 resize-none py-2 leading-relaxed")} value={signature} onChange={(e) => setSignature(e.target.value)} />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-fg-2">識別色</span>
          <div className="flex gap-2">
            {accountHues.map((hue, i) => (
              <button
                key={hue}
                onClick={() => setColor(i)}
                aria-label={`色 ${i + 1}`}
                className={cn("grid size-6 cursor-default place-items-center rounded-full transition-transform hover:scale-110", color === i && "ring-2 ring-fg-3 ring-offset-2 ring-offset-[var(--surface-raised)]")}
                style={{ background: hue }}
              >
                {color === i && <Check className="size-3 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>
      </div>
      {a.provider === "gmail" && (
        <p className="mt-3 text-xs leading-relaxed text-fg-3">
          Google のサインインが切れた時は
          <button
            className="mx-1 cursor-default font-medium text-blue hover:underline"
            onClick={async () => {
              try {
                await api.reauthGoogle(a.id);
                pushToast({ title: "サインインし直しました", tone: "success" });
              } catch (e) {
                pushToast({ title: "サインインできませんでした", description: String(e), tone: "error" });
              }
            }}
          >
            Google でサインインし直す
          </button>
          を押してください。
        </p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <Button
          size="sm"
          variant="danger"
          onClick={async () => {
            if (!window.confirm(`${a.email} をこのアプリから削除しますか？\nサーバー上のメールは消えません。`)) return;
            await api.removeAccount(a.id);
            await reloadMeta();
            useStore.getState().refreshList();
          }}
        >
          アカウントを削除
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty}
          icon={saved ? <Check className="size-3.5" /> : undefined}
          onClick={async () => {
            await api.updateAccount(a.id, name, signature, color);
            await reloadMeta();
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          }}
        >
          {saved ? "保存しました" : "変更を保存"}
        </Button>
      </div>
    </div>
  );
}

const shortcuts: [string, string[]][] = [
  ["次のメール / 前のメール", ["J", "K"]],
  ["アーカイブ", ["E"]],
  ["削除", ["#"]],
  ["迷惑メールにする", ["!"]],
  ["既読 / 未読を切り替え", ["U"]],
  ["スターを付ける / 外す", ["S"]],
  ["複数選択", ["X"]],
  ["返信", ["R"]],
  ["全員に返信", ["A"]],
  ["転送", ["F"]],
  ["メールを作成", ["C"]],
  ["送信", ["Ctrl", "Enter"]],
  ["直前の操作を取り消す", ["Ctrl", "Z"]],
  ["検索", ["/"]],
  ["コマンドパレット", ["Ctrl", "K"]],
  ["すべての受信へ", ["G", "I"]],
  ["スター付きへ", ["G", "S"]],
  ["送信済みへ", ["G", "T"]],
  ["同期", ["F5"]],
  ["閉じる / 選択解除", ["Esc"]],
];

function ShortcutList() {
  return (
    <div className="grid grid-cols-2 gap-x-6">
      {shortcuts.map(([label, keys]) => (
        <div key={label} className="flex items-center justify-between border-b border-line-subtle py-2.5">
          <span className="text-[13px] text-fg-2">{label}</span>
          <span className="flex gap-1">
            {keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}
