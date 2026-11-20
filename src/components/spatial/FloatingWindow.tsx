import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useDragControls, useMotionValue } from 'motion/react';
import { spring } from '@/design/motion';
import { useSpecular } from '@/hooks/useSpecular';
import './spatial.css';

type Corner = 'tl' | 'tr' | 'bl' | 'br' | 'dock';

interface Props {
  title: string;
  meta?: ReactNode;
  icon?: ReactNode;
  /** Persist the chosen corner (per viewer, local only). */
  storageKey: string;
  defaultCorner?: Corner;
  onClose: () => void;
  children: ReactNode;
  /** Width in px for normal / zoomed. Content is 16:9. */
  sizes?: [number, number];
  /**
   * Selector for dock slots the page reserves for this window. The first
   * visible one is used; while docked the window sits exactly on it, so it
   * never covers content. Drag out to float, drag back onto it to re-dock.
   */
  dock?: string;
  testId?: string;
}

const TITLE_H = 38;
const MARGIN = 16;

function readCorner(key: string, fallback: Corner): Corner {
  try {
    const v = localStorage.getItem(key);
    return v === 'tl' || v === 'tr' || v === 'bl' || v === 'br' || v === 'dock' ? v : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Spatial floating window: Liquid Glass chrome, window controls (close,
 * minimise, zoom), drag by the title bar, and a spring snap to the nearest
 * corner. Rendered in a portal so page transforms never affect it. Sizes
 * are derived from state (no layout measurement), so motion stays cheap.
 */
function findDock(selector: string | undefined): DOMRect | null {
  if (!selector) return null;
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > TITLE_H) return r;
  }
  return null;
}

/** Usable vertical band between the top navigation and the bottom bars. */
function band(): { top: number; bottom: number } {
  const nav = document.querySelector('.nav')?.getBoundingClientRect();
  let bottom = window.innerHeight;
  for (const sel of ['.statusbar', '.tabbar']) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r && r.height > 0 && r.top < bottom) bottom = r.top;
  }
  return { top: (nav ? nav.bottom : 60) + 12, bottom: bottom - 12 };
}

/**
 * Spatial floating window: Liquid Glass chrome, window controls (close,
 * minimise, zoom), drag by the title bar, a spring snap to the nearest
 * corner, and an optional dock slot it rests in by default. Rendered in a
 * portal so page transforms never affect it. Geometry is derived from state
 * plus one rect read per settle (no per-frame layout reads).
 */
export function FloatingWindow({
  title,
  meta,
  icon,
  storageKey,
  defaultCorner = 'br',
  onClose,
  children,
  sizes = [340, 600],
  testId,
  dock,
}: Props) {
  const [corner, setCorner] = useState<Corner>(() => readCorner(storageKey, dock ? 'dock' : defaultCorner));
  const [zoomed, setZoomed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dockRect, setDockRect] = useState<DOMRect | null>(() => findDock(dock));
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  useSpecular(ref);

  // 'dock' without a visible slot (e.g. Touch Mode layout) floats instead.
  const docked = corner === 'dock' && dockRect !== null && !zoomed;
  const effective: Exclude<Corner, 'dock'> = corner === 'dock' ? (defaultCorner === 'dock' ? 'tr' : defaultCorner) : corner;

  const w = docked
    ? Math.round(Math.min(dockRect.width, ((dockRect.height - TITLE_H) * 16) / 9))
    : Math.min(zoomed ? sizes[1] : sizes[0], window.innerWidth - MARGIN * 2);
  const h = TITLE_H + (minimized ? 0 : Math.round((w * 9) / 16));

  const targetFor = useCallback(
    (c: Exclude<Corner, 'dock'> | 'dock') => {
      if (c === 'dock' && dockRect) return { x: Math.round(dockRect.right - w), y: Math.round(dockRect.top) };
      const k = c === 'dock' ? effective : c;
      const { top, bottom } = band();
      return {
        x: k[1] === 'l' ? MARGIN : window.innerWidth - w - MARGIN,
        y: k[0] === 't' ? top : Math.max(top, bottom - h),
      };
    },
    [dockRect, effective, w, h],
  );

  const settle = useCallback(
    (instant = false) => {
      const t = targetFor(docked ? 'dock' : effective);
      if (instant) {
        x.jump(t.x);
        y.jump(t.y);
      } else {
        animate(x, t.x, spring.gentle);
        animate(y, t.y, spring.gentle);
      }
    },
    [docked, effective, targetFor, x, y],
  );

  // First placement and slot moves (scroll, layout) are instant so a docked
  // window stays glued to its slot; corner, zoom and minimise changes spring.
  const first = useRef(true);
  const lastRect = useRef(dockRect);
  useEffect(() => {
    const slotMoved = lastRect.current !== dockRect;
    lastRect.current = dockRect;
    settle(first.current || (slotMoved && docked));
    first.current = false;
  }, [settle, dockRect, docked]);

  // Keep the dock rect current: resize, layout changes, and scrolling (the
  // slot lives in page flow; the window is fixed).
  useEffect(() => {
    if (!dock) return;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = findDock(dock);
        setDockRect((prev) =>
          prev && r && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height ? prev : r,
        );
      });
    };
    // Page entrances move the slot with transforms, which ResizeObserver
    // doesn't see: measure again once they have settled.
    const timers = [120, 450, 900].map((t) => window.setTimeout(measure, t));
    const ro = new ResizeObserver(measure);
    document.querySelectorAll(dock).forEach((el) => ro.observe(el));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
    };
  }, [dock]);

  useEffect(() => {
    const onResize = () => settle(true);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [settle]);

  const choose = (c: Corner) => {
    try {
      localStorage.setItem(storageKey, c);
    } catch {
      /* per-viewer convenience only */
    }
    if (c === corner) settle();
    else setCorner(c);
  };

  const onDragEnd = () => {
    const cx = x.get() + w / 2;
    const cy = y.get() + h / 2;
    const slot = findDock(dock);
    if (slot && cx > slot.left - 40 && cx < slot.right + 40 && cy > slot.top - 40 && cy < slot.bottom + 40) {
      setZoomed(false);
      setDockRect(slot);
      choose('dock');
      return;
    }
    choose(`${cy < window.innerHeight / 2 ? 't' : 'b'}${cx < window.innerWidth / 2 ? 'l' : 'r'}` as Corner);
  };

  return createPortal(
    <motion.div
      ref={ref}
      className={`fwin reflect${minimized ? ' fwin--min' : ''}${docked ? ' fwin--docked' : ''}`}
      style={{ x, y }}
      initial={{ opacity: 0, scale: 0.94, width: w, height: h }}
      animate={{ width: w, height: h, opacity: 1, scale: 1 }}
      transition={spring.fluid}
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0.12}
      onDragEnd={onDragEnd}
      role="dialog"
      aria-label={title}
      data-testid={testId}
      data-corner={docked ? 'dock' : effective}
    >
      <div className="fwin__bar" onPointerDown={(e) => controls.start(e)}>
        <div className="fwin__controls" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="wctl wctl--close" onClick={onClose} aria-label={`Close ${title}`} title="Close">
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M3 3l4 4M7 3 3 7" />
            </svg>
          </button>
          <button
            type="button"
            className="wctl wctl--min"
            onClick={() => setMinimized((v) => !v)}
            aria-label={minimized ? `Restore ${title}` : `Minimise ${title}`}
            aria-pressed={minimized}
            title={minimized ? 'Restore' : 'Minimise'}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2.5 5h5" />
            </svg>
          </button>
          <button
            type="button"
            className="wctl wctl--zoom"
            onClick={() => {
              // Enlarging lifts a docked window out of its slot.
              if (!zoomed && corner === 'dock') setCorner(effective);
              setZoomed((v) => !v);
              setMinimized(false);
            }}
            aria-label={zoomed ? `Shrink ${title}` : `Enlarge ${title}`}
            aria-pressed={zoomed}
            title={zoomed ? 'Shrink' : 'Enlarge'}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M3 7V3h4M7 3 3 7" />
            </svg>
          </button>
        </div>
        <span className="fwin__title">
          {icon}
          {title}
        </span>
        {meta && <span className="fwin__meta mono">{meta}</span>}
      </div>
      {!minimized && <div className="fwin__body">{children}</div>}
    </motion.div>,
    document.body,
  );
}
