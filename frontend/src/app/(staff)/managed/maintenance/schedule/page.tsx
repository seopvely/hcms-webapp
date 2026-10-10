"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useMaintenanceSchedule } from "@/lib/staff-maintenance";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  "1": "bg-slate-200 text-slate-800",
  "2": "bg-cyan-100 text-cyan-800",
  "3": "bg-amber-100 text-amber-800",
  "4": "bg-emerald-100 text-emerald-800",
};
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 유지보수 일정 — 요청일~완료(예정)일 기간을 월 달력에 표시.
export default function StaffMaintenanceSchedulePage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [statusFilter, setStatusFilter] = useState<string[]>(["1", "2", "3", "4"]);

  useEffect(() => {
    setPageTitle("유지보수 일정");
  }, [setPageTitle]);

  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const { data } = useMaintenanceSchedule(ymd(days[0]), ymd(days[41]));
  const events = useMemo(() => (data?.items ?? []).filter((e) => statusFilter.includes(e.status ?? "")), [data, statusFilter]);

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-28 text-center font-semibold">
            {month.getFullYear()}년 {month.getMonth() + 1}월
          </span>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex-1" />
          {[["1", "접수"], ["2", "알림"], ["3", "처리중"], ["4", "완료"]].map(([code, label]) => (
            <button
              key={code}
              onClick={() => setStatusFilter((s) => (s.includes(code) ? s.filter((x) => x !== code) : [...s, code]))}
              className={cn("rounded-full px-3 py-1 text-xs", statusFilter.includes(code) ? STATUS_COLORS[code] : "bg-muted text-muted-foreground line-through")}
            >
              {label}
            </button>
          ))}
        </div>
        <Card className="overflow-x-auto rounded-2xl">
          <CardContent className="min-w-[720px] p-0">
            <div className="grid grid-cols-7 border-b text-center text-xs text-muted-foreground">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d) => {
                const key = ymd(d);
                const dayEvents = events.filter((e) => e.start <= key && key <= e.end);
                return (
                  <div key={key} className={cn("min-h-24 border-b border-r p-1", d.getMonth() !== month.getMonth() && "bg-muted/30")}>
                    <div className="mb-1 text-right text-xs text-muted-foreground">{d.getDate()}</div>
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 4).map((e) => (
                        <Link
                          key={e.id}
                          href={`/managed/maintenance/${e.id}`}
                          title={`${e.company_name ?? ""} · ${e.title ?? ""} (${e.status_label})`}
                          className={cn("block truncate rounded px-1 text-[11px]", STATUS_COLORS[e.status ?? ""] ?? "bg-muted")}
                        >
                          {e.title}
                        </Link>
                      ))}
                      {dayEvents.length > 4 && <p className="px-1 text-[11px] text-muted-foreground">+{dayEvents.length - 4}건</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
