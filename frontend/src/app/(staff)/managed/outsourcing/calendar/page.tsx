"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Row = { seq: number; vendor_name: string; work_type_label: string; project_title: string | null; start_date: string; end_date: string; status: string; is_paid: boolean };
const COLORS: Record<string, string> = { active: "bg-violet-400", completed: "bg-emerald-400", cancelled: "bg-slate-300" };

// 외주 달력 — 연도별 기간 막대(진행중 보라 / 완료 초록 / 취소 회색)
export default function OutsourcingCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useStaffGet<{ items: Row[] }>(["outsourcing", "calendar"], "/outsourcing/calendar", { start: `${year}-01-01`, end: `${year}-12-31` });
  useEffect(() => {
    setPageTitle("외주 달력");
  }, [setPageTitle]);
  const ys = new Date(year, 0, 1).getTime();
  const ye = new Date(year, 11, 31).getTime();
  const pos = (s: string, e: string) => {
    const a = Math.max(new Date(s).getTime(), ys);
    const b = Math.min(new Date(e).getTime(), ye);
    return { left: `${((a - ys) / (ye - ys)) * 100}%`, width: `${Math.max(((b - a) / (ye - ys)) * 100, 0.6)}%` };
  };
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="w-20 text-center font-semibold">{year}년</span>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Card className="overflow-x-auto rounded-2xl"><CardContent className="min-w-[760px] space-y-1 pt-4 pb-4">
          <div className="grid grid-cols-12 text-center text-xs text-muted-foreground" style={{ marginLeft: "14rem" }}>{Array.from({ length: 12 }, (_, i) => <span key={i}>{i + 1}월</span>)}</div>
          {data?.items.map((r) => (
            <div key={r.seq} className="flex items-center gap-2 text-xs">
              <Link href={`/managed/outsourcing/${r.seq}`} className="shrink-0 truncate hover:underline" style={{ width: "13.5rem" }}>{r.vendor_name} · {r.work_type_label}{r.project_title ? ` · ${r.project_title}` : ""}</Link>
              <div className="relative h-4 flex-1 rounded bg-muted/50"><div className={`absolute h-4 rounded ${COLORS[r.status] ?? "bg-slate-400"}`} style={pos(r.start_date, r.end_date)} title={`${r.start_date} ~ ${r.end_date}${r.is_paid ? " · 지급" : ""}`} /></div>
            </div>
          ))}
        </CardContent></Card>
      </div>
    </PageTransition>
  );
}
