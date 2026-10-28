import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, ExternalLink, Eye, EyeOff, Lock } from "lucide-react";
import { GoogleSignIn } from "./GoogleSignIn";
import { useStore } from "../lib/store";
import { api, openExternal } from "../lib/api";
import type { Provider } from "../lib/types";
import { spring } from "../lib/motion";
import { Button, Dialog, Field, cn, inputClass } from "./ui";

const guide: Record<Provider, { name: string; domain: string; url: string; urlLabel: string; steps: string[] }> = {
  gmail: {
    name: "Gmail",
    domain: "gmail.com",
    url: "https://myaccount.google.com/apppasswords",
    urlLabel: "Google アカウントでアプリ パスワードを作成",
    steps: [
      "Google アカウントの 2 段階認証プロセスをオンにします",
      "「アプリ パスワード」を開き、名前に「Fumi」と入力して作成します",
      "表示された 16 文字のパスワードを下に貼り付けます",
    ],
  },
  icloud: {
    name: "iCloud メール",
    domain: "icloud.com",
    url: "https://account.apple.com/",
    urlLabel: "Apple アカウントのページを開く",
    steps: [
      "Apple アカウントにサインインし「サインインとセキュリティ」を開きます",
      "「App 用パスワード」から新しいパスワードを作成します（名前は「Fumi」）",
      "表示された xxxx-xxxx-xxxx-xxxx の形式のパスワードを下に貼り付けます",
    ],
  },
};

export function AddAccountDialog() {
  const open = useStore((s) => s.dialog === "addAccount");
  const setDialog = useStore((s) => s.setDialog);
  const accounts = useStore((s) => s.accounts);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [workspace, setWorkspace] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [state, setState] = useState<"idle" | "connecting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProvider(null);
      setWorkspace(false);
      setEmail("");
      setName("");
      setPassword("");
      setState("idle");
      setError(null);
    }
  }, [open]);

  const close = () => state !== "connecting" && setDialog(null);
  const g = provider ? guide[provider] : null;
  const canSubmit = !!provider && /.+@.+\..+/.test(email) && password.replace(/\s|-/g, "").length >= 8;

  const submit = async () => {
    if (!provider || !canSubmit) return;
    setState("connecting");
    setError(null);
    try {
      await api.addAccount({ provider, email: email.trim(), name: name.trim(), password: password.trim() });
      setState("done");
      const s = useStore.getState();
      await s.reloadMeta();
      s.refreshList();
      setTimeout(() => setDialog(null), 900);
    } catch (e) {
      setState("idle");
      setError(String(e));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      width={520}
      title={workspace ? "大学・会社の Google アカウント" : provider ? `${g!.name} を追加` : "アカウントを追加"}
      description={
        workspace
          ? "アプリ パスワードが使えないアカウント向けです。ブラウザで Google にサインインして接続します。"
          : provider
            ? "アプリ用パスワードでサーバーに直接接続します。パスワードは Windows の資格情報マネージャーに保存されます。"
            : "追加するメールサービスを選んでください。あとから何個でも追加できます。"
      }
      dismissable={accounts.length > 0 || !!provider || workspace}
    >
      <AnimatePresence mode="wait" initial={false}>
        {workspace ? (
          <motion.div key="google" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={spring.gentle}>
            <GoogleSignIn onBack={() => setWorkspace(false)} onDone={() => setTimeout(() => setDialog(null), 900)} />
          </motion.div>
        ) : !provider ? (
          <motion.div key="pick" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={spring.gentle} className="space-y-3 p-6">
           <div className="grid grid-cols-2 gap-3">
            {(["gmail", "icloud"] as Provider[]).map((p) => (
              <motion.button
                key={p}
                whileTap={{ scale: 0.97 }}
                transition={spring.snappy}
                onClick={() => setProvider(p)}
                className="group flex cursor-default flex-col items-start gap-6 rounded-[14px] border border-line bg-surface-raised p-4 text-left transition-colors hover:border-line-hover hover:bg-surface-hover"
              >
                <ProviderMark p={p} />
                <span>
                  <span className="block text-[14px] font-semibold text-fg">{guide[p].name}</span>
                  <span className="mt-0.5 block text-xs text-fg-3">@{guide[p].domain}</span>
                </span>
              </motion.button>
            ))}
           </div>
            <button
              onClick={() => setWorkspace(true)}
              className="flex w-full cursor-default items-center gap-3 rounded-[14px] border border-line bg-surface-raised p-4 text-left transition-colors hover:border-line-hover hover:bg-surface-hover"
            >
              <ProviderMark p="gmail" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-fg">大学・会社の Google アカウント</span>
                <span className="mt-0.5 block text-xs text-fg-3">アプリ パスワードが作れない場合はこちら（Google でサインイン）</span>
              </span>
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={spring.gentle}
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-4 px-6 pb-6 pt-5"
          >
            <ol className="space-y-2 rounded-[14px] border border-line-subtle bg-surface-raised p-4">
              {g!.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-fg-2">
                  <span className="mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-full border border-line text-[10px] font-medium text-fg-3 tabular">{i + 1}</span>
                  {step}
                </li>
              ))}
              <li>
                <button type="button" onClick={() => openExternal(g!.url)} className="ml-[30px] mt-1 inline-flex cursor-default items-center gap-1.5 text-[13px] font-medium text-fg underline decoration-line-hover underline-offset-4 hover:decoration-fg">
                  {g!.urlLabel}
                  <ExternalLink className="size-3.5" />
                </button>
              </li>
            </ol>

            <Field label="メールアドレス">
              <input className={inputClass} type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`you@${g!.domain}`} spellCheck={false} />
            </Field>
            <Field label="表示名" hint="送信するメールの差出人名として相手に表示されます">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="例：山田 太郎" />
            </Field>
            <Field label="アプリ用パスワード" hint="普段のログインパスワードではありません。スペースやハイフンは入れたままで大丈夫です">
              <div className="relative">
                <input
                  className={cn(inputClass, "pr-10 font-mono tracking-wider")}
                  type={reveal ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={provider === "gmail" ? "xxxx xxxx xxxx xxxx" : "xxxx-xxxx-xxxx-xxxx"}
                  spellCheck={false}
                  autoComplete="off"
                />
                <button type="button" onClick={() => setReveal(!reveal)} className="absolute right-1 top-1 grid size-7 cursor-default place-items-center rounded-md text-fg-3 hover:bg-pill hover:text-fg" aria-label={reveal ? "隠す" : "表示する"}>
                  {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            <AnimatePresence>
              {error && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.gentle} className="selectable overflow-hidden rounded-[10px] border border-danger/40 bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2 text-xs leading-relaxed text-danger">
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2 pt-1">
              <Button type="button" variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => setProvider(null)} disabled={state === "connecting"}>
                戻る
              </Button>
              <span className="flex flex-1 items-center gap-1.5 text-xs text-fg-3">
                <Lock className="size-3.5" /> TLS で暗号化して接続
              </span>
              <Button type="submit" variant="primary" disabled={!canSubmit || state === "done"} loading={state === "connecting"} icon={state === "done" ? <Check className="size-4" /> : undefined}>
                {state === "connecting" ? "接続しています" : state === "done" ? "追加しました" : "接続して追加"}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </Dialog>
  );
}

/** ブランドロゴではなく、サービスを区別するための抽象的なマーク */
function ProviderMark({ p }: { p: Provider }) {
  return (
    <span className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-[15px] font-semibold text-fg shadow-subtle">
      {p === "gmail" ? (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3.5 6.5 12 13l8.5-6.5" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M7 18h10.5a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.4 9.1 4.5 4.5 0 0 0 7 18Z" />
        </svg>
      )}
    </span>
  );
}
