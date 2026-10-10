"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { TaxShell, useTaxOptions } from "../tax-ui";

type Result = ListResult & { totals: { supply: number; tax: number; total: number } };

export default function TaxSalesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data: o } = useTaxOptions();
  const [f, setF] = useState<Record<string, string | undefined>>({});
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<Result>(["tax", "sales"], "/tax/sales", { ...f, page });
  const write = useStaffWrite(["tax"]);
  useEffect(() => {
    setPageTitle("매출 세금계산서");
  }, [setPageTitle]);
  const setFilter = (k: string, val: string) => { setF({ ...f, [k]: val || undefined }); setPage(1); };
  return (
    <PageTransition>
      <TaxShell cmsPath="/managed/tax/sales/">
        <div className="flex flex-wrap gap-2">
          <Input className="w-36 rounded-xl" type="date" value={f.date_from ?? ""} onChange={(e) => setFilter("date_from", e.target.value)} />
          <Input className="w-36 rounded-xl" type="date" value={f.date_to ?? ""} onChange={(e) => setFilter("date_to", e.target.value)} />
          <select className={`${selectClass} w-auto`} value={f.issue_status ?? ""} onChange={(e) => setFilter("issue_status", e.target.value)}>
            <option value="">발행 전체</option>{Object.entries(o?.issue_status ?? {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
          </select>
          <select className={`${selectClass} w-auto`} value={f.payment_status ?? ""} onChange={(e) => setFilter("payment_status", e.target.value)}>
            <option value="">입금 전체</option>{Object.entries(o?.payment_status ?? {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setFilter("q", keyword.trim()); }}>
            <Input className="rounded-xl" placeholder="상호·품목·사업자번호" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && <span className="text-sm">합계 공급가 {won(data.totals.supply)} · 세액 {won(data.totals.tax)} · 합계 {won(data.totals.total)}</span>}
          <div className="flex-1" />
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/tax/sales/new"><Plus className="mr-1 h-4 w-4" /> 매출 등록</Link></Button>}
        </div>
        <p className="text-xs text-muted-foreground">납부내역 → 매출 계산서 자동 동기화(매일 02:00)는 현재 cms 에서 돕니다.</p>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Receipt} title="매출 세금계산서가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((i) => (
                <div key={i.id as number} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/managed/tax/sales/${i.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate font-semibold">{fmtDate(i.issue_date as string)} · {i.buyer_name as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.item as string}{i.source_payment_history_id ? ` · 납부내역 #${i.source_payment_history_id}` : ""}</p>
                  </Link>
                  <span>{won(i.total_amount)}</span>
                  <button disabled={!data.write_enabled || !["pending", "issued"].includes(i.issue_status as string)} onClick={async () => {
                    try { await write.mutateAsync({ url: `/tax/sales/${i.id}/toggle-issue` }); } catch (err) { toast("error", apiErrorDetail(err, "처리에 실패했습니다.")); }
                  }} className={`rounded-full px-2 py-0.5 text-xs ${i.issue_status === "issued" ? "bg-blue-100 text-blue-700" : i.issue_status === "pending" ? "bg-amber-100 text-amber-700" : "bg-muted"}`}>{i.issue_label as string}</button>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${i.payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-muted"}`}>{i.payment_label as string}</span>
                </div>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
          </>
        )}
      </TaxShell>
    </PageTransition>
  );
}
