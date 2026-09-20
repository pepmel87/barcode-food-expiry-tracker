"use client";

import { api } from "@/lib/client/api";
import { getPushState, registerServiceWorker, showLocalNotification, type PushState } from "@/lib/client/push";
import type { NotificationDTO } from "@/lib/types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "success" | "info" | "warning" | "error";
}

interface NotificationsContextValue {
  unread: number;
  items: NotificationDTO[];
  loading: boolean;
  pushState: PushState;
  lastCheckAt: string | null;
  refresh: () => Promise<void>;
  runCheck: () => Promise<void>;
  refreshPushState: () => Promise<void>;
  toast: (t: Omit<Toast, "id">) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const POLL_INTERVAL_MS = 60 * 1000;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<PushState>("prompt");
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const knownIds = useRef<Set<number> | null>(null);
  const pushStateRef = useRef<PushState>("prompt");

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ items: NotificationDTO[]; unread: number }>("/api/notifications?limit=100");
      setUnread(data.unread);
      setItems(data.items);

      // Individua le notifiche nuove rispetto all'ultimo aggiornamento
      if (knownIds.current) {
        const fresh = data.items.filter((n) => !knownIds.current!.has(n.id) && !n.read);
        if (fresh.length) {
          for (const n of fresh.slice(0, 3)) {
            toast({ title: n.title, body: n.body, tone: n.type === "expired" ? "error" : "warning" });
          }
          // Se le push non sono attive, mostra almeno una notifica locale mentre l'app è aperta
          if (pushStateRef.current !== "subscribed") {
            const first = fresh[0];
            void showLocalNotification(
              fresh.length === 1 ? first.title : `${fresh.length} avvisi di scadenza`,
              fresh.length === 1 ? first.body : fresh.map((n) => n.title).slice(0, 3).join(" · "),
              "/notifiche",
            );
          }
        }
      }
      knownIds.current = new Set(data.items.map((n) => n.id));
    } catch {
      /* rete assente: riproveremo al prossimo giro */
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const runCheck = useCallback(async () => {
    try {
      const res = await api<{ ranAt: string }>("/api/check", { method: "POST" });
      setLastCheckAt(res.ranAt);
    } catch {
      /* ignore */
    }
    await refresh();
  }, [refresh]);

  const refreshPushState = useCallback(async () => {
    const state = await getPushState();
    pushStateRef.current = state;
    setPushState(state);
  }, []);

  useEffect(() => {
    void registerServiceWorker().then(() => refreshPushState());
    void runCheck();

    const interval = setInterval(() => void runCheck(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void runCheck();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") void refresh();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [runCheck, refresh, refreshPushState]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ unread, items, loading, pushState, lastCheckAt, refresh, runCheck, refreshPushState, toast }),
    [unread, items, loading, pushState, lastCheckAt, refresh, runCheck, refreshPushState, toast],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto w-full max-w-md rounded-xl border px-4 py-3 shadow-lg backdrop-blur ${
              t.tone === "success"
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-900"
                : t.tone === "error"
                  ? "border-red-200 bg-red-50/95 text-red-900"
                  : t.tone === "warning"
                    ? "border-amber-200 bg-amber-50/95 text-amber-900"
                    : "border-slate-200 bg-white/95 text-slate-900"
            }`}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body ? <p className="mt-0.5 text-xs opacity-80">{t.body}</p> : null}
          </div>
        ))}
      </div>
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications deve essere usato dentro NotificationsProvider");
  return ctx;
}
