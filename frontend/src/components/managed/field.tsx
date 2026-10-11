import { cn } from "@/lib/utils";

export const selectClass = "h-10 w-full rounded-xl border bg-background px-3 text-sm";

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("space-y-1 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function apiErrorDetail(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback;
}

export const fmtDate = (v: string | null | undefined) => (v ? v.slice(0, 10) : "-");
export const fmtDateTime = (v: string | null | undefined) => (v ? v.slice(0, 16).replace("T", " ") : "-");

/** 목록 보조줄: 빈 값은 빼고 " · " 로 잇는다("담당 -" 같은 잡음 제거). */
export const meta = (...parts: (string | number | null | undefined | false)[]) =>
  parts.filter((p) => p !== null && p !== undefined && p !== false && p !== "" && p !== "-").join(" · ");
