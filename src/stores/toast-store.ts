'use client';

import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  message: string;
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (tone: ToastTone, message: string, detail?: string) => void;
  dismiss: (id: string) => void;
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (tone, message, detail) => {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { id, tone, message, detail }] });
    setTimeout(() => get().dismiss(id), tone === 'error' ? 7000 : 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message: string, detail?: string) => useToasts.getState().push('success', message, detail),
  error: (message: string, detail?: string) => useToasts.getState().push('error', message, detail),
  info: (message: string, detail?: string) => useToasts.getState().push('info', message, detail),
};
