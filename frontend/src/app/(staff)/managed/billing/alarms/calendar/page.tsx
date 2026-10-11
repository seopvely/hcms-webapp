"use client";
import { useEffect, useState } from "react";
import { PageTransition } from "@/components/layout/page-transition";
import { BillingShell } from "@/components/managed/billing-ui";
import { type CalEvent, MonthCalendar, gridRange } from "@/components/managed/month-calendar";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Ev = { id: number; title: string; date: string; amount: number | null; payment_type: string; valid_status: string; is_paid: boolean };

// 결제일 알람 달력 — 색: 입금완료 진초록 / 무효 회색 / 매출 초록 / 외주비 보라 / 매입 빨강 (cms 와 같음)
const LEGEND = [
  { label: "매출", color: "bg-emerald-500" },
  { label: "외주비", color: "bg-violet-500" },
  { label: "매입", color: "bg-red-500" },
  { label: "입금완료", color: "bg-emerald-700" },
  { label: "무효", color: "bg-slate-400" },
];
const color = (e: Ev) => (e.is_paid ? "bg-emerald-700" : e.valid_status !== "valid" ? "bg-slate-400" : e.payment_type === "sales" ? "bg-emerald-500" : e.payment_type === "outsourcing" ? "bg-violet-500" : "bg-red-500");
const typeLabel = (e: Ev) => (e.payment_type === "sales" ? "매출" : e.payment_type === "outsourcing" ? "외주비" : "매입");

export default function AlarmCalendarPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const { data, isFetching } = useStaffGet<Ev[]>(["billing", "alarm-calendar"], "/billing/alarms/calendar", gridRange(ym.y, ym.m));
  useEffect(() => {
    setPageTitle("결제일알람 달력");
  }, [setPageTitle]);
  const events: CalEvent[] = (data ?? []).map((e, i) => ({
    key: `${e.id}-${e.date}-${i}`, start: e.date.slice(0, 10), title: e.title, href: `/managed/billing/alarms/${e.id}`,
    sub: [typeLabel(e), e.amount ? `${e.amount.toLocaleString()}원` : null, e.is_paid ? "입금완료" : e.valid_status !== "valid" ? "무효" : null].filter(Boolean).join(" · "),
    color: color(e), muted: e.valid_status !== "valid",
  }));
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/payment-alarm/calendar/">
        <MonthCalendar year={ym.y} month={ym.m} onChange={(y, m) => setYm({ y, m })} events={events} loading={isFetching} legend={LEGEND} />
      </BillingShell>
    </PageTransition>
  );
}
