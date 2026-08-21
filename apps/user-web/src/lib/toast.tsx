"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; message: string; tone?: "ok" | "err" | "info" };

type ToastCtx = {
  push: (message: string, tone?: Toast["tone"]) => void;
};

const ToastContext = createContext<ToastCtx | null>(null);

const STACK_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(16px, env(safe-area-inset-top, 0px))",
  bottom: "auto",
  left: "50%",
  right: "auto",
  transform: "translateX(-50%)",
  zIndex: 10000,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  width: "min(420px, calc(100vw - 24px))",
  pointerEvents: "none",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const push = useCallback((message: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    // Replace same message instead of stacking duplicates.
    setItems((prev) => [
      ...prev.filter((t) => t.message !== message),
      { id, message, tone },
    ]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  const stack =
    mounted && items.length > 0
      ? createPortal(
          <div className="toast-stack" style={STACK_STYLE} aria-live="polite">
            {items.map((t) => (
              <div key={t.id} className={`toast toast-${t.tone ?? "info"}`}>
                {t.message}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {stack}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx;
}
