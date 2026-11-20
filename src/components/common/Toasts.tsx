import { AnimatePresence, motion } from 'motion/react';
import { useNoticeStore } from '@/stores/noticeStore';
import { spring } from '@/design/motion';

export function Toasts() {
  const notices = useNoticeStore((s) => s.notices);
  const dismiss = useNoticeStore((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <motion.button
            key={n.id}
            layout
            type="button"
            className={`toast toast--${n.tone}`}
            onClick={() => dismiss(n.id)}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.16 } }}
            transition={spring.fluid}
          >
            {n.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
