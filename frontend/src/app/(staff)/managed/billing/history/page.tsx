"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, meta } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { BillingShell, useBillingWritable, won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Params = { type: string; period?: string; q?: string; sort?: string; page: number };
type Row = Record<string, unknown>;
const totalOf = (h: Row) => ((h.deposit_amount as number) || 0) + ((h.progress_amount as number) || 0) + ((h.balance_amount as number) || 0);

export default function PaymentHistoryPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<Params>({ type: "sales", page: 1 });
  const [keyword, setKeyword] = useState("");
  const writable = useBillingWritable();
  const { data, isLoading } = useStaffGet<ListResult>(["billing", "history"], "/billing/payment-history", params);
  useEffect(() => {
    setPageTitle("납부내역");
  }, [setPageTitle]);
  const purchase = params.type === "purchase";
  const titleOf = (h: Row) => (purchase ? (h.alarm_title as string) || "-" : `${(h.company as string) || "-"} · ${(h.project as string) || "-"}`);
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
        </div>
        <PageActions>
          {writable && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/billing/history/new"><Plus className="mr-1 h-4 w-4" /> 납부내역 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Receipt} title="납부내역이 없습니다" /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(h) => h.seq as number}
              rowHref={(h) => `/managed/billing/history/${h.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                {
                  key: "title", header: purchase ? "알람" : "업체 · 프로젝트", cell: (h) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{titleOf(h)}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta((h.payment_type_label as string) || "-", purchase && h.has_purchase_invoice ? "매입계산서 연결" : null)}</p>
                    </div>
                  ),
                },
                { key: "target_month", header: "대상월", sort: "target_month", hideOnMobile: true, className: "w-20 whitespace-nowrap", cell: (h) => (h.target_month as string) || "-" },
                {
                  key: "dates", header: "계약금 · 중도금 · 잔금", hideOnMobile: true, className: "whitespace-nowrap text-xs text-muted-foreground", cell: (h) => (
                    <>{fmtDate(h.deposit_date as string)} · {fmtDate(h.progress_date as string)} · {fmtDate(h.balance_date as string)}</>
                  ),
                },
                { key: "total", header: "금액", align: "right", className: "w-32 whitespace-nowrap", cell: (h) => won(totalOf(h)) },
                { key: "payment_tf", header: "입금", sort: "payment_tf", align: "center", className: "w-24", cell: (h) => <TfBadge h={h} /> },
                { key: "created_at", header: "등록일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap text-xs text-muted-foreground", cell: (h) => fmtDate(h.created_at as string) },
              ]}
              mobile={(h) => (
                <div className="space-y-1">
                  <p className="truncate text-sm font-semibold">{titleOf(h)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {(h.payment_type_label as string) || "-"}{h.target_month ? ` · 대상월 ${h.target_month}` : ""} · 계약금 {fmtDate(h.deposit_date as string)} · 중도금 {fmtDate(h.progress_date as string)} · 잔금 {fmtDate(h.balance_date as string)}
                    {purchase && (h.has_purchase_invoice ? " · 매입계산서 연결" : "")}
                  </p>
                  <div className="flex items-center gap-2">
                    <TfBadge h={h} />
                    <span className="text-xs text-muted-foreground">{fmtDate(h.created_at as string)}</span>
                    <span className="ml-auto text-sm tabular-nums">{won(totalOf(h))}</span>
                  </div>
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}

function TfBadge({ h }: { h: Row }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${h.payment_tf === "1" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{h.payment_tf === "1" ? "입금확인" : "미확인"}</span>;
}
