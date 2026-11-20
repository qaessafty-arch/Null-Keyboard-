import { create } from 'zustand';

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface Notice {
  id: number;
  message: string;
  tone: NoticeTone;
}

interface NoticeState {
  notices: Notice[];
  show: (message: string, tone?: NoticeTone, ms?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useNoticeStore = create<NoticeState>((set, get) => ({
  notices: [],
  show: (message, tone = 'info', ms = 2400) => {
    const id = nextId++;
    set({ notices: [...get().notices.slice(-2), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
}));

export const notify = (message: string, tone?: NoticeTone, ms?: number) =>
  useNoticeStore.getState().show(message, tone, ms);
