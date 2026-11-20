import type { Transition, Variants } from 'motion/react';

/**
 * NULL-TECH spring vocabulary. Every animated element uses one of these, so
 * motion feels like one physical system. All are critically-damped-ish:
 * natural settle, no cartoon bounce.
 */
export const spring = {
  /** Controls, thumbs, indicators — quick and precise. */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } satisfies Transition,
  /** Panels, island morphs — fluid with a soft settle. */
  fluid: { type: 'spring', stiffness: 360, damping: 34, mass: 0.9 } satisfies Transition,
  /** Large surfaces, windows snapping to corners. */
  gentle: { type: 'spring', stiffness: 220, damping: 30, mass: 1 } satisfies Transition,
};

/** Page enter / exit: opacity + a few pixels of travel (GPU-composited only). */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.995 },
  enter: { opacity: 1, y: 0, scale: 1, transition: { ...spring.fluid, opacity: { duration: 0.22 } } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } },
};
