"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const TODO_STATUS: Record<string, string> = { pending: "대기", in_progress: "진행중", review: "검토중", done: "완료" };
export const TODO_PRIORITY: Record<string, string> = { high: "높음", normal: "보통", low: "낮음" };
export const STATUS_CLASS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700", in_progress: "bg-blue-100 text-blue-700", review: "bg-amber-100 text-amber-700", done: "bg-emerald-100 text-emerald-700",
};

export function TodoTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1">
      {[["/managed/todos", "목록"], ["/managed/todos/kanban", "칸반"], ["/managed/todos/calendar", "달력"]].map(([href, label]) => (
        <Link key={href} href={href} className={cn("rounded-full px-3 py-1 text-xs", pathname === href ? "bg-slate-900 text-white" : "bg-muted")}>{label}</Link>
      ))}
    </div>
  );
}
