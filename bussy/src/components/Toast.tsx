"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";

interface ToastData {
  id: number;
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: "default" | "error";
}

const Ctx = createContext<(t: Omit<ToastData, "id"> & { duration?: number }) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const seq = useRef(0);

  const push = useCallback((t: Omit<ToastData, "id"> & { duration?: number }) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts, { ...t, id }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.duration ?? 6000);
  }, []);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex max-w-lg items-center gap-4 rounded-md px-4 py-3 text-sm shadow-lg ${
              t.tone === "error" ? "bg-chip-rejectedFg text-white" : "bg-ink text-white"
            }`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="min-h-touch font-semibold text-[#F0B27A] underline-offset-4 hover:underline"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((ts) => ts.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
