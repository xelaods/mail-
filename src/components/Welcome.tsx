import { AnimatePresence, motion } from "framer-motion";
import { Inbox, Search, Zap } from "lucide-react";
import { useStore } from "../lib/store";
import { windowAction } from "../lib/api";
import { Minus, X } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

const features = [
  {
    icon: <Inbox />,
    title: "ひとつの受信箱",
    body: "Gmail と iCloud メールを並べて読めます。アカウントは色で見分けられます。",
  },
  {
    icon: <Zap />,
    title: "届いたらすぐ",
    body: "新しいメールはサーバーから直接押し出され、数秒で一覧に入ります。",
  },
  {
    icon: <Search />,
    title: "手元で検索",
    body: "読み込んだメールはこのパソコンに保存され、本文まで日本語で探せます。",
  },
];

/** 初めて起動した時だけ出る「ようこそ」画面 */
export function Welcome() {
  const firstRun = useStore((s) => s.firstRun);
  const finish = useStore((s) => s.finishWelcome);

  return (
    <AnimatePresence>
      {firstRun && (
        <motion.div
          key="welcome"
          data-tauri-drag-region
          className="fixed inset-0 z-[90] flex items-center justify-center bg-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35, ease: EASE } }}
        >
          {/* ウィンドウを動かしたり閉じたりできるように */}
          <div className="absolute right-0 top-0 flex h-[48px]">
            <button aria-label="最小化" onClick={() => windowAction("minimize")} className="grid w-[46px] cursor-default place-items-center text-fg-3 hover:bg-pill-active hover:text-fg">
              <Minus className="size-4" strokeWidth={1.5} />
            </button>
            <button aria-label="閉じる" onClick={() => windowAction("close")} className="grid w-[46px] cursor-default place-items-center text-fg-3 hover:bg-[#c42b1c] hover:text-white">
              <X className="size-4" strokeWidth={1.5} />
            </button>
          </div>
          <motion.div
            className="flex w-[440px] max-w-[calc(100vw-48px)] flex-col items-center text-center"
            exit={{ scale: 0.97, transition: { duration: 0.35, ease: EASE } }}
          >
            {/* アイコンが少し大きめから落ち着く */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 210, damping: 18, mass: 0.9, delay: 0.15 }}
            >
              <AppIcon />
            </motion.div>

            <motion.h1
              className="mt-7 text-[30px] font-bold text-fg"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.45 }}
            >
              Fumi へようこそ
            </motion.h1>

            <ul className="mt-9 w-full space-y-6 text-left">
              {features.map((f, i) => (
                <motion.li
                  key={f.title}
                  className="flex gap-4"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.55, ease: EASE, delay: 0.75 + i * 0.12 }}
                >
                  <span className="mt-0.5 shrink-0 text-blue [&>svg]:size-7 [&>svg]:stroke-[1.6]">{f.icon}</span>
                  <span>
                    <span className="block text-[15px] font-bold text-fg">{f.title}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-relaxed text-fg-3">{f.body}</span>
                  </span>
                </motion.li>
              ))}
            </ul>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 1.25 }}
              whileTap={{ scale: 0.97 }}
              onClick={finish}
              className="mt-11 h-11 w-[260px] cursor-default rounded-full bg-blue text-[15px] font-semibold text-white transition-[filter] hover:brightness-110"
            >
              続ける
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AppIcon() {
  return (
    <svg viewBox="0 0 1024 1024" className="size-[104px] drop-shadow-[0_18px_30px_rgba(0,0,0,0.35)]" aria-hidden>
      <defs>
        <linearGradient id="w-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a2a2e" />
          <stop offset="1" stopColor="#111113" />
        </linearGradient>
        <linearGradient id="w-paper" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d9de" />
        </linearGradient>
      </defs>
      <rect x="64" y="64" width="896" height="896" rx="208" fill="url(#w-bg)" />
      <rect x="64.5" y="64.5" width="895" height="895" rx="207.5" fill="none" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="3" />
      <rect x="236" y="318" width="552" height="388" rx="56" fill="url(#w-paper)" />
      <path d="M262 352 L512 540 L762 352" fill="none" stroke="#111113" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="742" cy="314" r="58" fill="#0a84ff" stroke="#1c1c1f" strokeWidth="20" />
    </svg>
  );
}
