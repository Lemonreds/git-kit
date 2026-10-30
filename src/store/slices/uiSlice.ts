import type { StateCreator } from "zustand";

import type { AppState } from "../appStore";
import type { AlertMessage, Toast, ToastKind } from "../types";

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export interface UiSlice {
  toast: Toast | null;
  alert: AlertMessage | null;
  notify: (kind: ToastKind, message: string) => void;
  dismissToast: () => void;
  showAlert: (title: string, message: string) => void;
  dismissAlert: () => void;
}

/**
 * Toasts and the blocking alert dialog. They change far more often than the
 * repository state, so they own a slice of their own: a toast must not wake the
 * branch / diff selectors.
 */
export const createUiSlice: StateCreator<AppState, [], [], UiSlice> = (set) => ({
  toast: null,
  alert: null,

  notify(kind, message) {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), kind, message } });
    toastTimer = setTimeout(() => {
      set((state) => (state.toast ? { toast: null } : state));
    }, kind === "error" ? 6000 : 2800);
  },

  dismissToast() {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: null });
  },

  showAlert(title, message) {
    set({ alert: { title, message } });
  },

  dismissAlert() {
    set({ alert: null });
  },
});