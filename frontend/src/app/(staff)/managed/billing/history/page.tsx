"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { BillingShell, useBillingWritable, won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Params = { type: string; period?: string; q?: string; page: number };

export default function PaymentHistoryPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<Params>({ type: "sales", page: 1 });
  const [keyword, setKeyword] = useState("");
  const writable = useBillingWritable();
  const { data, isLoading } = useStaffGet<ListResult>(["billing", "history"], "/billing/payment-history", params);
  useEffect(() => {
    setPageTitle("납부내역");
  }, [setPageTitle]);
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-xs ${active ? "bg-slate-900 text-white" : "bg-muted"}`;
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/paymenthistory">
        <div className="flex flex-wrap gap-2">
          {[["sales", "매출(고객 납부)"], ["purchase", "매입·외주비"]].map(([v, l]) => <button key={v} className={chip(params.type === v)} onClick={() => setParams({ ...params, type: v, page: 1 })}>{l}</button>)}
          <span className="w-2" />
          {[["", "전체"], ["month", "이번달"], ["week", "최근 7일"]].map(([v, l]) => <button key={v} className={chip((params.period ?? "") === v)} onClick={() => setParams({ ...params, period: v || undefined, page: 1 })}>{l}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder={params.type === "purchase" ? "업체·프로젝트·알람 제목" : "업체·프로젝트"} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          {writable && <Button className="rounded-xl" asChild><Link href="/managed/billing/history/new"><Plus className="mr-1 h-4 w-4" /> 납부내역 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Receipt} title="납부내역이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((h) => {
                const total = ((h.deposit_amount as number) || 0) + ((h.progress_amount as number) || 0) + ((h.balance_amount as number) || 0);
                return (
                  <Link key={h.seq as number} href={`/managed/billing/history/${h.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{params.type === "purchase" ? (h.alarm_title as string) || "-" : `${(h.company as string) || "-"} · ${(h.project as string) || "-"}`}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(h.payment_type_label as string) || "-"}{h.target_month ? ` · 대상월 ${h.target_month}` : ""} · 계약금 {fmtDate(h.deposit_date as string)} · 중도금 {fmtDate(h.progress_date as string)} · 잔금 {fmtDate(h.balance_date as string)}
                        {params.type === "purchase" && (h.has_purchase_invoice ? " · 매입계산서 연결" : "")}
                      </p>
                    </div>
                    <span className="w-32 shrink-0 text-right text-sm tabular-nums">{won(total)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${h.payment_tf === "1" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{h.payment_tf === "1" ? "입금확인" : "미확인"}</span>
                    <span className="w-20 text-right text-xs text-muted-foreground">{fmtDate(h.created_at as string)}</span>
                  </Link>
                );
              })}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}
