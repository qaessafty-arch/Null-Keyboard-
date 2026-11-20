import { useNoticeStore } from '@/stores/noticeStore';

export function Toasts() {
  const notices = useNoticeStore((s) => s.notices);
  const dismiss = useNoticeStore((s) => s.dismiss);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {notices.map((n) => (
        <button key={n.id} type="button" className={`toast toast--${n.tone}`} onClick={() => dismiss(n.id)}>
          {n.message}
        </button>
      ))}
    </div>
  );
}
