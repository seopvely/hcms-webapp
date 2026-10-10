"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";
import { TodoTabs } from "../todo-ui";

type Ev = { id: number; title: string; start: string; end: string; status: string; assignee: string; overdue: boolean };
const COLOR: Record<string, string> = { pending: "bg-slate-500", in_progress: "bg-blue-600", review: "bg-amber-500", done: "bg-emerald-600" };

// 할일 달력 — 마감일 기준(시작일이 있으면 시작~마감 기간에 표시)
export default function TodoCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const { data } = useStaffGet<Ev[]>(["todos", "calendar"], "/todos/calendar");
  useEffect(() => {
    setPageTitle("할일 달력");
  }, [setPageTitle]);
  const last = new Date(ym.y, ym.m, 0).getDate();
  const byDay = useMemo(() => {
    const out: Record<number, Ev[]> = {};
    for (const e of data ?? []) {
      for (let d = 1; d <= last; d++) {
        const day = `${ym.y}-${String(ym.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (e.start <= day && day < e.end) (out[d] ??= []).push(e);
      }
    }
    return out;
  }, [data, ym, last]);
  const cells = [...Array(new Date(ym.y, ym.m - 1, 1).getDay()).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  const move = (d: number) => setYm(({ y, m }) => (m + d < 1 ? { y: y - 1, m: 12 } : m + d > 12 ? { y: y + 1, m: 1 } : { y, m: m + d }));
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <TodoTabs />
          <div className="flex-1" />
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="w-28 text-center font-semibold">{ym.y}년 {ym.m}월</span>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Card className="overflow-x-auto rounded-2xl"><CardContent className="min-w-[700px] pt-4 pb-4">
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">{["일", "월", "화", "수", "목", "금", "토"].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => (
              <div key={i} className="min-h-24 rounded-lg border p-1 text-xs">
                {d && <p className="font-semibold">{d}</p>}
                {d && byDay[d]?.map((e) => (
                  <Link key={e.id} href={`/managed/todos/${e.id}`} title={`${e.title} · ${e.assignee}`}
                    className={`mt-0.5 block truncate rounded px-1 text-white ${COLOR[e.status] ?? "bg-slate-500"} ${e.overdue ? "ring-2 ring-red-500" : ""}`}>{e.title}</Link>
                ))}
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>
    </PageTransition>
  );
}
