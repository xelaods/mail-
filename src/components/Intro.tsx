import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const CINEMA = [0.22, 1, 0.36, 1] as const;

/**
 * 起動時のオープニング（EasyUI Intro Loader を下敷きにした一度きりの演出）。
 * 「文」の一字が浮かび、Fumi の名前に移り変わり、読み込みが終わると幕が上がる。
 */
export function Intro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"glyph" | "word" | "out">("glyph");
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    if (reduced) {
      setMinElapsed(true);
      return;
    }
    const a = window.setTimeout(() => setPhase("word"), 900);
    const b = window.setTimeout(() => setMinElapsed(true), 1750);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [reduced]);

  useEffect(() => {
    if (ready && minElapsed && phase !== "out") setPhase("out");
  }, [ready, minElapsed, phase]);

  useEffect(() => {
    const skip = (e: KeyboardEvent) => e.key === "Escape" && setPhase("out");
    window.addEventListener("keydown", skip);
    return () => window.removeEventListener("keydown", skip);
  }, []);

  return (
    <AnimatePresence onExitComplete={onDone}>
      {phase !== "out" && (
        <motion.div
          key="intro"
          className="fixed inset-0 z-[100] flex cursor-default items-center justify-center overflow-hidden bg-[#060607]"
          exit={{ opacity: 0, scale: 1.04, filter: "blur(14px)" }}
          transition={{ duration: 0.8, ease: CINEMA }}
          onClick={() => setPhase("out")}
        >
          {/* 光のにじみ */}
          <motion.div
            className="absolute left-1/2 top-1/2 h-[520px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.07] blur-[120px]"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.6, ease: CINEMA }}
          />
          <div className="relative grid place-items-center">
            <AnimatePresence mode="wait">
              {phase === "glyph" ? (
                <motion.span
                  key="glyph"
                  className="text-[120px] font-medium leading-none text-white/95"
                  initial={{ opacity: 0, filter: "blur(18px)", scale: 0.92 }}
                  animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                  exit={{ opacity: 0, filter: "blur(16px)", scale: 1.06 }}
                  transition={{ duration: 0.7, ease: CINEMA }}
                >
                  文
                </motion.span>
              ) : (
                <motion.div key="word" className="flex flex-col items-center">
                  <div className="flex text-[64px] font-semibold leading-none tracking-[-0.045em] text-white">
                    {"Fumi".split("").map((ch, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ duration: 0.75, ease: CINEMA, delay: i * 0.06 }}
                      >
                        {ch}
                      </motion.span>
                    ))}
                  </div>
                  <motion.p
                    className="mt-5 text-[13px] tracking-[0.2em] text-white/40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.9, delay: 0.35 }}
                  >
                    Gmail と iCloud を、ひとつに
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 読み込みの進み具合を示す細い光の線 */}
          <div className="absolute bottom-[18%] left-1/2 h-px w-40 -translate-x-1/2 overflow-hidden bg-white/10">
            <motion.div
              className="h-full bg-white/70"
              initial={{ width: "0%" }}
              animate={{ width: ready ? "100%" : "62%" }}
              transition={{ duration: ready ? 0.5 : 1.6, ease: CINEMA }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
