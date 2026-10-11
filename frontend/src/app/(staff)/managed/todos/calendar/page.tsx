"use client";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { type CalEvent, MonthCalendar, dayBefore } from "@/components/managed/month-calendar";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";
import { TodoTabs } from "../todo-ui";

type Ev = { id: number; title: string; start: string; end: string; status: string; assignee: string; overdue: boolean };
const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "대기", color: "bg-slate-500" },
  in_progress: { label: "진행", color: "bg-blue-600" },
  review: { label: "검토", color: "bg-amber-500" },
  done: { label: "완료", color: "bg-emerald-600" },
};

// 할일 달력 — 마감일 기준(시작일이 있으면 시작~마감 기간에 표시). 빨간 테두리 = 기한 초과
export default function TodoCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const { data, isFetching } = useStaffGet<Ev[]>(["todos", "calendar"], "/todos/calendar");
  useEffect(() => {
    setPageTitle("할일 달력");
  }, [setPageTitle]);
  const events: CalEvent[] = (data ?? []).map((e) => ({
    key: e.id, start: e.start.slice(0, 10), end: dayBefore(e.end), title: e.title, href: `/managed/todos/${e.id}`,
    sub: [STATUS[e.status]?.label, e.assignee, e.overdue ? "기한 초과" : null].filter(Boolean).join(" · "),
    color: STATUS[e.status]?.color ?? "bg-slate-500", muted: e.status === "done", alert: e.overdue,
  }));
  return (
    <PageTransition>
      <MonthCalendar year={ym.y} month={ym.m} onChange={(y, m) => setYm({ y, m })} events={events} loading={isFetching}
        toolbar={<TodoTabs />} legend={[...Object.values(STATUS), { label: "기한 초과(빨간 테두리)", color: "bg-red-500" }]} />
    </PageTransition>
  );
}
