"use client";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { type TimelineRow, YearTimeline } from "@/components/managed/year-timeline";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Row = { seq: number; vendor_name: string; work_type_label: string; project_title: string | null; start_date: string; end_date: string; status: string; is_paid: boolean };
const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "진행중", color: "bg-violet-500" },
  completed: { label: "완료", color: "bg-emerald-500" },
  cancelled: { label: "취소", color: "bg-slate-400" },
};

// 외주 달력 — 연도별 기간 막대(진행중 보라 / 완료 초록 / 취소 회색)
export default function OutsourcingCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data, isFetching } = useStaffGet<{ items: Row[] }>(["outsourcing", "calendar"], "/outsourcing/calendar", { start: `${year}-01-01`, end: `${year}-12-31` });
  useEffect(() => {
    setPageTitle("외주 달력");
  }, [setPageTitle]);
  const rows: TimelineRow[] = (data?.items ?? []).map((r) => ({
    key: r.seq, label: `${r.vendor_name} · ${r.work_type_label}`, sub: [r.project_title, r.is_paid ? "지급완료" : null].filter(Boolean).join(" · ") || undefined,
    href: `/managed/outsourcing/${r.seq}`,
    bars: [{ start: r.start_date.slice(0, 10), end: r.end_date.slice(0, 10), color: STATUS[r.status]?.color ?? "bg-slate-400", label: STATUS[r.status]?.label ?? r.status }],
  }));
  return (
    <PageTransition>
      <YearTimeline year={year} onYearChange={setYear} rows={rows} loading={isFetching} legend={Object.values(STATUS)} />
    </PageTransition>
  );
}
