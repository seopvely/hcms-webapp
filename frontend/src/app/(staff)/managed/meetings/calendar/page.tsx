"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Ev = { id: number; title: string; date: string; time: string | null; type: string; valid_status: string };
const pad = (n: number) => String(n).padStart(2, "0");
const COLOR: Record<string, string> = { offline: "bg-blue-600", video: "bg-violet-600", phone: "bg-emerald-600" };

export default function MeetingCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const last = new Date(ym.y, ym.m, 0).getDate();
  const { data } = useStaffGet<Ev[]>(["meetings", "calendar"], "/meetings/calendar", { start: `${ym.y}-${pad(ym.m)}-01`, end: `${ym.y}-${pad(ym.m)}-${pad(last)}` });
  useEffect(() => {
    setPageTitle("미팅 달력");
  }, [setPageTitle]);
  const byDay = useMemo(() => {
    const out: Record<number, Ev[]> = {};
    for (const e of data ?? []) (out[Number(e.date.slice(8, 10))] ??= []).push(e);
    return out;
  }, [data]);
  const cells = [...Array(new Date(ym.y, ym.m - 1, 1).getDay()).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  const move = (d: number) => setYm(({ y, m }) => (m + d < 1 ? { y: y - 1, m: 12 } : m + d > 12 ? { y: y + 1, m: 1 } : { y, m: m + d }));
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
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
                  <Link key={e.id} href={`/managed/meetings/${e.id}`} className={`mt-0.5 block truncate rounded px-1 text-white ${e.valid_status !== "valid" ? "bg-slate-400" : COLOR[e.type] ?? "bg-blue-600"}`}>
                    {e.time ?? ""} {e.title}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>
    </PageTransition>
  );
}
