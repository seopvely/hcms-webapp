"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Row = { seq: number; title: string; company_name: string | null; start: string; end: string; stopped: boolean; free_start: string | null; free_end: string | null };

// 계약 달력 — 연도별 12칸 간트(계약 기간 파랑, 무상 유지보수 청록)
export default function ProjectCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useStaffGet<{ items: Row[] }>(["projects", "calendar"], "/projects/calendar", { year });
  useEffect(() => {
    setPageTitle("계약 달력");
  }, [setPageTitle]);
  const yStart = new Date(year, 0, 1).getTime();
  const yEnd = new Date(year, 11, 31).getTime();
  const pos = (s: string, e: string) => {
    const a = Math.max(new Date(s).getTime(), yStart);
    const b = Math.min(new Date(e).getTime(), yEnd);
    return { left: `${((a - yStart) / (yEnd - yStart)) * 100}%`, width: `${Math.max(((b - a) / (yEnd - yStart)) * 100, 0.6)}%` };
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
          <div className="ml-56 grid grid-cols-12 text-center text-xs text-muted-foreground">{Array.from({ length: 12 }, (_, i) => <span key={i}>{i + 1}월</span>)}</div>
          {data?.items.map((r) => (
            <div key={r.seq} className="flex items-center gap-2 text-xs">
              <Link href={`/managed/projects/${r.seq}`} className="w-54 shrink-0 truncate hover:underline" title={`${r.company_name} · ${r.title}`} style={{ width: "13.5rem" }}>{r.company_name} · {r.title}</Link>
              <div className="relative h-4 flex-1 rounded bg-muted/50">
                {new Date(r.start).getTime() <= yEnd && new Date(r.end).getTime() >= yStart && <div className={`absolute h-4 rounded ${r.stopped ? "bg-red-300" : "bg-indigo-400"}`} style={pos(r.start, r.end)} title={`${r.start} ~ ${r.end}`} />}
                {r.free_start && r.free_end && new Date(r.free_start).getTime() <= yEnd && new Date(r.free_end).getTime() >= yStart && <div className="absolute h-4 rounded bg-teal-400/80" style={pos(r.free_start, r.free_end)} title={`무상 ${r.free_start} ~ ${r.free_end}`} />}
              </div>
            </div>
          ))}
        </CardContent></Card>
      </div>
    </PageTransition>
  );
}
