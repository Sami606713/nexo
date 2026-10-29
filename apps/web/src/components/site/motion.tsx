"use client";

// Motion primitives for the public site. Every animation here honours prefers-reduced-motion.
import { useEffect, useState, type ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion, type Variants } from "motion/react";

export const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * prefers-reduced-motion, but `false` until after hydration so server and client render the same markup.
 * (useReducedMotion reads matchMedia on the first client render, which the server can't know.)
 */
export function useReducedMotionSafe(): boolean {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? !!reduce : false;
}

/** Site-wide: Motion skips transform/layout animations for users who prefer reduced motion. */
export function SiteMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Fade + rise into view once, when the element scrolls in. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotionSafe();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

const group: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

/** Parent for staggered children (use with <StaggerItem>). */
export function Stagger({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotionSafe();
  return (
    <motion.div
      className={className}
      style={style}
      variants={group}
      initial={reduce ? "show" : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  style,
  onPointerMove,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onPointerMove?: React.PointerEventHandler<HTMLDivElement>;
}) {
  return (
    <motion.div className={className} style={style} variants={item} onPointerMove={onPointerMove}>
      {children}
    </motion.div>
  );
}
