"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, selectClass } from "@/components/managed/field";
import { BillingShell, won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Row = { month: number; deposit: number; progress: number; balance: number; total: number; is_current: boolean; is_future: boolean };
type Data = { year: number; month: number; monthly: Row[]; total: Record<string, number>; items: Record<string, unknown>[]; year_options: number[] };

// 월별수익(부가세 포함, 입금확인 기준 · 매입/외주 알람 연동분 제외)
export default function RevenuePage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(0);
  const { data, isLoading } = useStaffGet<Data>(["billing", "revenue"], "/billing/revenue", { year, month });
  useEffect(() => {
    setPageTitle("월별수익");
  }, [setPageTitle]);
  const max = Math.max(...(data?.monthly.map((r) => r.total) ?? [1]), 1);
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/monthly-revenue/">
        <div className="flex items-center gap-2">
          <select className={`${selectClass} w-auto`} value={year} onChange={(e) => { setYear(Number(e.target.value)); setMonth(0); }}>
            {(data?.year_options ?? [year]).map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          {month > 0 && <button className="text-xs underline" onClick={() => setMonth(0)}>월 선택 해제</button>}
          <span className="ml-auto text-sm">연간 합계 <b>{won(data?.total.total)}</b></span>
        </div>
        {isLoading || !data ? <TableSkeleton /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="space-y-1 pt-4 pb-4">
              {data.monthly.map((r) => (
                <button key={r.month} onClick={() => setMonth(r.month === month ? 0 : r.month)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs hover:bg-muted/50 ${r.month === month ? "bg-muted" : ""} ${r.is_future ? "opacity-50" : ""}`}>
                  <span className={`w-10 ${r.is_current ? "font-bold" : ""}`}>{r.month}월</span>
                  <div className="h-3 flex-1 rounded bg-muted/50"><div className="h-3 rounded bg-blue-500" style={{ width: `${(r.total / max) * 100}%` }} /></div>
                  <span className="w-28 text-right">{won(r.total)}</span>
                  <span className="hidden w-64 text-right text-muted-foreground sm:block">계약 {r.deposit.toLocaleString()} · 중도 {r.progress.toLocaleString()} · 잔금 {r.balance.toLocaleString()}</span>
                </button>
              ))}
            </CardContent></Card>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              <p className="px-4 py-3 text-sm font-semibold">{month ? `${month}월 입금 내역` : "최근 입금 내역 20건"}</p>
              {data.items.map((h) => (
                <Link key={h.seq as number} href={`/managed/billing/history/${h.seq}`} className="flex flex-wrap gap-3 px-4 py-2 text-xs hover:bg-muted/40">
                  <span className="min-w-0 flex-1 truncate font-semibold">{(h.company as string) || "-"} · {(h.project as string) || "-"}</span>
                  {h.deposit_amount ? <span>계약금 {won(h.deposit_amount)} ({fmtDate(h.deposit_date as string)})</span> : null}
                  {h.progress_amount ? <span>중도금 {won(h.progress_amount)} ({fmtDate(h.progress_date as string)})</span> : null}
                  {h.balance_amount ? <span>잔금 {won(h.balance_amount)} ({fmtDate(h.balance_date as string)})</span> : null}
                </Link>
              ))}
            </CardContent></Card>
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}
