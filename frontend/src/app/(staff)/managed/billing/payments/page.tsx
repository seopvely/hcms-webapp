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
import { fmtDate, meta } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { BillingShell, STATUS_COLOR, useBillingWritable, won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Result = ListResult & { receivable?: { amount_vat: number; count: number; excluded_amount_vat: number; excluded_count: number } };

export default function PaymentsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const writable = useBillingWritable();
  const { data, isLoading } = useStaffGet<Result>(["billing", "payments"], "/billing/payments", params);
  useEffect(() => {
    setPageTitle("납부리스트");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/prepayment">
        {data?.receivable && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="rounded-2xl"><CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">미수금(부가세 포함, {data.receivable.count}건)</p>
              <p className="text-xl font-bold text-red-600">{won(data.receivable.amount_vat)}</p>
            </CardContent></Card>
            <Card className="rounded-2xl"><CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">6개월 넘게 지난 미수금(계획에서 제외, {data.receivable.excluded_count}건)</p>
              <p className="text-xl font-bold text-slate-500">{won(data.receivable.excluded_amount_vat)}</p>
            </CardContent></Card>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="업체·프로젝트" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          {writable && <Button className="rounded-xl" asChild><Link href="/managed/billing/payments/new"><Plus className="mr-1 h-4 w-4" /> 납부 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Receipt} title="납부 정보가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((p) => (
                <Link key={p.seq as number} href={`/managed/billing/payments/${p.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{(p.company as string) || "-"} · {(p.project as string) || "프로젝트 없음"}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(p.payment_type_label as string, p.project_type_label as string, p.payment_date ? `결제일 ${fmtDate(p.payment_date as string)}` : null, p.payment_alarm_title ? `알람 ${p.payment_alarm_title}` : null)}</p>
                  </div>
                  <span className="w-32 shrink-0 text-right text-sm tabular-nums">{won(p.payment_amount ?? p.production_price)}</span>
                  <span className={`max-w-[18rem] truncate rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[p.status_color as string] ?? "bg-muted"}`} title={p.status_text as string}>{p.status_text as string}</span>
                </Link>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}
