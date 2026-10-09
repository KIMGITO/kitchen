'use client';
import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastItem { id: number; tone: ToastTone; message: string }

interface ToastState { toasts: ToastItem[]; push: (tone: ToastTone, message: string) => void; dismiss: (id: number) => void }
let next = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (tone, message) => {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 6500 : 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Call from any client code: toast.success('Saved'). */
export const toast = {
  success: (m: string) => useToastStore.getState().push('success', m),
  error: (m: string) => useToastStore.getState().push('error', m),
  info: (m: string) => useToastStore.getState().push('info', m),
};
