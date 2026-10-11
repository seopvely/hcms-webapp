"use client";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { type TimelineRow, YearTimeline } from "@/components/managed/year-timeline";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Row = { seq: number; title: string; company_name: string | null; start: string; end: string; stopped: boolean; free_start: string | null; free_end: string | null };

// 계약 달력 — 연도별 기간 막대(계약 기간 남색, 중지 빨강, 무상 유지보수 청록)
export default function ProjectCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isFetching } = useStaffGet<{ items: Row[] }>(["projects", "calendar"], "/projects/calendar", { year });
  useEffect(() => {
    setPageTitle("계약 달력");
  }, [setPageTitle]);
  const rows: TimelineRow[] = (data?.items ?? []).map((r) => ({
    key: r.seq, label: r.title, sub: r.company_name ?? undefined, href: `/managed/projects/${r.seq}`,
    bars: [
      { start: r.start.slice(0, 10), end: r.end.slice(0, 10), color: r.stopped ? "bg-red-400" : "bg-indigo-500", label: r.stopped ? "중지" : "계약" },
      ...(r.free_start && r.free_end ? [{ start: r.free_start.slice(0, 10), end: r.free_end.slice(0, 10), color: "bg-teal-500", label: "무상" }] : []),
    ],
  }));
  return (
    <PageTransition>
      <YearTimeline year={year} onYearChange={setYear} rows={rows} loading={isFetching}
        legend={[{ label: "계약", color: "bg-indigo-500" }, { label: "중지", color: "bg-red-400" }, { label: "무상 유지보수", color: "bg-teal-500" }]} />
    </PageTransition>
  );
}
