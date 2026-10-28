import type { Transition } from "framer-motion";

/**
 * EasyUI のモーショントークン（src/lib/motion-tokens.ts）をそのまま使用。
 * Soft + physical + immediate + controlled.
 */
export const spring = {
  gentle: { type: "spring", stiffness: 170, damping: 26, mass: 0.9 } as Transition,
  smooth: { type: "spring", stiffness: 200, damping: 28, mass: 0.85 } as Transition,
  snappy: { type: "spring", stiffness: 380, damping: 30, mass: 0.5 } as Transition,
  morph: { type: "spring", stiffness: 220, damping: 32, mass: 1.0 } as Transition,
  responsive: { type: "spring", stiffness: 320, damping: 24, mass: 0.7 } as Transition,
};

export const ease = {
  soft: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } as Transition,
  fast: { duration: 0.2, ease: [0.2, 0, 0, 1] } as Transition,
};
