import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

const MAX_DEG = 6;
const SPRING = { stiffness: 260, damping: 26, mass: 0.6 };

type Props = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
> & {
  children: ReactNode;
};

/**
 * Spatial card (visionOS-style): tilts toward a fine pointer on a spring and
 * moves its specular highlight with it. Touch and pen get the plain press
 * feedback instead — tilting under a finger reads as a glitch, not depth.
 * Only transform/opacity change, so it never triggers layout.
 */
export function TiltCard({ children, className, onPointerMove, onPointerLeave, ...rest }: Props) {
  const ref = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);
  const rotateY = useTransform(sx, [0, 1], [-MAX_DEG, MAX_DEG]);
  const rotateX = useTransform(sy, [0, 1], [MAX_DEG, -MAX_DEG]);

  return (
    <div className="tilt-stage">
      <motion.button
        ref={ref}
        type="button"
        className={`${className ?? ''} tilt reflect`}
        style={reduce ? undefined : { rotateX, rotateY }}
        whileTap={{ scale: 0.985 }}
        onPointerMove={(e) => {
          onPointerMove?.(e);
          if (e.pointerType !== 'mouse' || reduce) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          px.set(x);
          py.set(y);
          e.currentTarget.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
          e.currentTarget.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        }}
        onPointerLeave={(e) => {
          onPointerLeave?.(e);
          px.set(0.5);
          py.set(0.5);
        }}
        {...rest}
      >
        {children}
      </motion.button>
    </div>
  );
}
