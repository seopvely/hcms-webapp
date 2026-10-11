"use client";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { type CalEvent, MonthCalendar, gridRange } from "@/components/managed/month-calendar";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Ev = { id: number; title: string; date: string; time: string | null; type: string; valid_status: string };
const TYPES: Record<string, { label: string; color: string }> = {
  offline: { label: "대면", color: "bg-blue-600" },
  video: { label: "화상", color: "bg-violet-600" },
  phone: { label: "전화", color: "bg-emerald-600" },
};

export default function MeetingCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const { data, isFetching } = useStaffGet<Ev[]>(["meetings", "calendar"], "/meetings/calendar", gridRange(ym.y, ym.m));
  useEffect(() => {
    setPageTitle("미팅 달력");
  }, [setPageTitle]);
  const events: CalEvent[] = (data ?? []).map((e) => ({
    key: e.id, start: e.date.slice(0, 10), time: e.time, title: e.title, href: `/managed/meetings/${e.id}`,
    sub: [TYPES[e.type]?.label, e.valid_status !== "valid" ? "무효" : null].filter(Boolean).join(" · "),
    color: e.valid_status !== "valid" ? "bg-slate-400" : TYPES[e.type]?.color ?? "bg-blue-600", muted: e.valid_status !== "valid",
  }));
  return (
    <PageTransition>
      <MonthCalendar year={ym.y} month={ym.m} onChange={(y, m) => setYm({ y, m })} events={events} loading={isFetching}
        legend={[...Object.values(TYPES), { label: "무효", color: "bg-slate-400" }]} />
    </PageTransition>
  );
}
