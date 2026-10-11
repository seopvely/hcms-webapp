"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, selectCls } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import { useEstimateDashboard } from "@/lib/staff-sales";

export default function EstimateDashboardPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [months, setMonths] = useState(6);
  const { data } = useEstimateDashboard(months);
  useEffect(() => {
    setPageTitle("견적 대시보드");
  }, [setPageTitle]);
  const maxMonthly = Math.max(1, ...(data?.monthly.map((m) => m.count) ?? [1]));

  return (
    <PageTransition>
      <div className="space-y-4">
        <select className={selectCls("w-40")} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[3, 6, 12, 24].map((m) => <option key={m} value={m}>최근 {m}개월</option>)}
        </select>
        {!data ? <CardSkeleton /> : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="rounded-2xl"><CardContent className="pt-5 pb-5"><p className="text-sm text-muted-foreground">견적 수</p><p className="text-2xl font-bold">{data.total_count}</p></CardContent></Card>
              <Card className="rounded-2xl"><CardContent className="pt-5 pb-5"><p className="text-sm text-muted-foreground">총액</p><p className="text-2xl font-bold">{data.total_amount.toLocaleString()}원</p></CardContent></Card>
              <Card className="rounded-2xl"><CardContent className="pt-5 pb-5"><p className="text-sm text-muted-foreground">승인률(승인·계약전환 ÷ 발송 이후)</p><p className="text-2xl font-bold">{data.approval_rate ?? "-"}%</p></CardContent></Card>
            </div>
            <Card className="rounded-2xl">
              <CardContent className="grid gap-2 pt-5 pb-5 text-sm sm:grid-cols-3">
                {data.by_status.map((b) => <div key={b.status} className="flex justify-between rounded-lg bg-muted/40 px-3 py-2"><span>{b.label}</span><span>{b.count}건 · {b.amount.toLocaleString()}원</span></div>)}
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardContent className="space-y-1 pt-5 pb-5 text-sm">
                <p className="font-semibold">월별 생성</p>
                {data.monthly.map((m) => (
                  <div key={m.month} className="flex items-center gap-2"><span className="w-16 text-xs">{m.month}</span><div className="h-3 rounded bg-indigo-400" style={{ width: `${(m.count / maxMonthly) * 70}%` }} /><span className="text-xs">{m.count}</span></div>
                ))}
              </CardContent>
            </Card>
            <div className="grid gap-3 lg:grid-cols-2">
              <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm"><p className="font-semibold">업체 Top 10</p>
                {data.top_companies.map((c) => <div key={c.name} className="flex justify-between"><span>{c.name}</span><span className="text-muted-foreground">{c.count}건 · {c.amount.toLocaleString()}원</span></div>)}
              </CardContent></Card>
              <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm"><p className="font-semibold">유효기간 7일 이내(발송 상태)</p>
                {data.expiring.length === 0 ? <p className="text-muted-foreground">없음</p> : data.expiring.map((e) => <Link key={e.seq} href={`/managed/estimates/${e.seq}`} className="flex justify-between hover:underline"><span>{e.title}</span><span>{fmtDate(e.validity_period)}</span></Link>)}
              </CardContent></Card>
            </div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
