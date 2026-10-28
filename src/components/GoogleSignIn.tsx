import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ChevronDown, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import { api, openExternal } from "../lib/api";
import { spring } from "../lib/motion";
import { Button, Field, inputClass } from "./ui";

/** 大学・会社の Google アカウント（アプリ パスワードが作れない場合）を Google でサインインして追加する */
export function GoogleSignIn({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "waiting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getSetting("google_client_id"), api.getSetting("google_client_secret")]).then(([id, secret]) => {
      setClientId(id ?? "");
      setClientSecret(secret ?? "");
      const ok = !!id?.trim();
      setConfigured(ok);
      setShowSetup(!ok);
    });
  }, []);

  const saveClient = async () => {
    await api.setSetting("google_client_id", clientId.trim());
    await api.setSetting("google_client_secret", clientSecret.trim());
    setConfigured(!!clientId.trim());
    setShowSetup(false);
  };

  const signIn = async () => {
    setError(null);
    if (showSetup) await saveClient();
    setState("waiting");
    try {
      await api.addGoogleAccount(name.trim(), email.trim());
      setState("done");
      const s = useStore.getState();
      await s.reloadMeta();
      s.refreshList();
      onDone();
    } catch (e) {
      setState("idle");
      setError(String(e));
    }
  };

  const canSignIn = !!clientId.trim() && !!clientSecret.trim() && state === "idle";

  return (
    <div className="space-y-4 px-6 pb-6 pt-5">
      {/* 初回だけ必要な準備：自分用の Google Cloud のクライアントを作る */}
      <div className="rounded-[14px] border border-line-subtle bg-surface-raised">
        <button
          type="button"
          onClick={() => setShowSetup(!showSetup)}
          className="flex w-full cursor-default items-center gap-3 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-fg">最初に一度だけの準備</span>
            <span className="mt-0.5 block text-xs text-fg-3">
              {configured ? "設定済みです。作り直す時だけ開いてください" : "Google Cloud で、Fumi 用のサインイン設定を作ります（5分ほど）"}
            </span>
          </span>
          {configured && <Check className="size-4 text-green" />}
          <motion.span animate={{ rotate: showSetup ? 180 : 0 }} transition={spring.snappy} className="text-fg-3">
            <ChevronDown className="size-4" />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {showSetup && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring.gentle}
              className="overflow-hidden"
            >
              <div className="space-y-3 border-t border-line-subtle px-4 pb-4 pt-3">
                <ol className="space-y-2.5 text-[13px] leading-relaxed text-fg-2">
                  <Step n={1}>
                    Google Cloud コンソールで新しいプロジェクトを作ります（どの Google アカウントで作っても構いません）。
                    <LinkButton url="https://console.cloud.google.com/projectcreate">プロジェクトを作成</LinkButton>
                  </Step>
                  <Step n={2}>
                    「Google Auth Platform」で、アプリ名を「Fumi」、対象を「外部」にして設定を始めます。
                    <LinkButton url="https://console.cloud.google.com/auth/overview">Google Auth Platform を開く</LinkButton>
                  </Step>
                  <Step n={3}>
                    「対象」で公開ステータスを「本番環境」にします。テストのままだと、7日ごとにサインインし直しになります。
                  </Step>
                  <Step n={4}>
                    「クライアント」→「クライアントを作成」で種類を「デスクトップ アプリ」にし、表示されたクライアント ID とシークレットを下に貼り付けます。
                    <LinkButton url="https://console.cloud.google.com/auth/clients">クライアントを開く</LinkButton>
                  </Step>
                </ol>
                <Field label="クライアント ID">
                  <input className={inputClass} value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" spellCheck={false} />
                </Field>
                <Field label="クライアント シークレット">
                  <input className={inputClass} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="GOCSPX-…" spellCheck={false} autoComplete="off" />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Field label="メールアドレス" hint="入れておくと、サインイン画面でこのアカウントが選ばれた状態になります">
        <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@your-university.ac.jp" spellCheck={false} />
      </Field>
      <Field label="表示名" hint="送信するメールの差出人名として相手に表示されます">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
      </Field>

      <p className="text-xs leading-relaxed text-fg-3">
        ブラウザが開いたら大学のアカウントでサインインし、アクセスを許可してください。「このアプリは確認されていません」と出た場合は、「詳細」から先へ進めます（自分で作った設定のためです）。
      </p>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={spring.gentle}
            className="selectable overflow-hidden rounded-[10px] border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-xs leading-relaxed text-danger"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 pt-1">
        <Button type="button" variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={onBack} disabled={state === "waiting"}>
          戻る
        </Button>
        <span className="flex-1 text-xs text-fg-3">{state === "waiting" ? "ブラウザでサインインしてください…" : ""}</span>
        <Button
          variant="primary"
          disabled={!canSignIn}
          loading={state === "waiting"}
          icon={state === "done" ? <Check className="size-4" /> : undefined}
          onClick={signIn}
        >
          {state === "done" ? "追加しました" : "Google でサインイン"}
        </Button>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full border border-line text-[10px] font-medium text-fg-3 tabular">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function LinkButton({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => openExternal(url)}
      className="mt-0.5 flex cursor-default items-center gap-1 text-[12.5px] font-medium text-blue hover:underline"
    >
      {children}
      <ExternalLink className="size-3" />
    </button>
  );
}
