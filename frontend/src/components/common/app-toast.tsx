"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

const toastConfig = {
  success: { icon: CheckCircle, bg: "bg-emerald-500", border: "border-emerald-600" },
  error: { icon: XCircle, bg: "bg-red-500", border: "border-red-600" },
  warning: { icon: AlertTriangle, bg: "bg-amber-500", border: "border-amber-600" },
  info: { icon: Info, bg: "bg-blue-500", border: "border-blue-600" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed top-0 left-0 right-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-0 pointer-events-none">
        {toasts.map((t) => {
          const config = toastConfig[t.type];
          const Icon = config.icon;
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-3 text-white shadow-lg",
                "animate-in slide-in-from-top-2 fade-in duration-300",
                "min-w-[280px] max-w-[90vw]",
                config.bg,
                config.border
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button
                onClick={() => removeToast(t.id)}
                className="shrink-0 opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
