"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileStack, Plus, Receipt, Search } from "lucide-react";
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
import { staffFileUrl } from "@/lib/staff-maintenance";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";
import { TaxShell, useTaxOptions } from "../tax-ui";

type Result = ListResult & { totals: { supply: number; tax: number; total: number } };
type Filters = { q?: string; date_from?: string; date_to?: string; category?: string; deduction?: string };

export default function TaxPurchasesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data: o } = useTaxOptions();
  const [f, setF] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<Result>(["tax", "purchases"], "/tax/purchases", { ...f, page });
  const write = useStaffWrite(["tax"]);
  useEffect(() => {
    setPageTitle("매입 세금계산서");
  }, [setPageTitle]);
  const act = async (url: string, body?: Record<string, unknown>) => {
    try {
      return await write.mutateAsync({ url, body });
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  const setFilter = (k: keyof Filters, val: string) => { setF({ ...f, [k]: val || undefined }); setPage(1); };
  return (
    <PageTransition>
      <TaxShell cmsPath="/managed/tax/purchase/">
        <div className="flex flex-wrap gap-2">
          <Input className="w-36 rounded-xl" type="date" value={f.date_from ?? ""} onChange={(e) => setFilter("date_from", e.target.value)} />
          <Input className="w-36 rounded-xl" type="date" value={f.date_to ?? ""} onChange={(e) => setFilter("date_to", e.target.value)} />
          <select className={`${selectClass} w-auto`} value={f.category ?? ""} onChange={(e) => setFilter("category", e.target.value)}>
            <option value="">비용분류 전체</option>{o?.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={`${selectClass} w-auto`} value={f.deduction ?? ""} onChange={(e) => setFilter("deduction", e.target.value)}>
            <option value="">공제 전체</option>{Object.entries(o?.deduction ?? {}).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setFilter("q", keyword.trim()); }}>
            <Input className="rounded-xl" placeholder="공급자·품목·사업자번호" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && <span className="text-sm">합계 공급가 {won(data.totals.supply)} · 세액 {won(data.totals.tax)} · 합계 {won(data.totals.total)}</span>}
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="rounded-xl" asChild><a href={staffFileUrl(`/tax/purchases/attachments.zip${qs ? `?${qs}` : ""}`)}><Download className="mr-1 h-4 w-4" /> 첨부 ZIP</a></Button>
          {data?.write_enabled && (
            <>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={async () => {
                if (!window.confirm("검색된 매입 계산서를 모두 제출완료로 바꿀까요?")) return;
                const r = await act("/tax/purchases/bulk-submit", f);
                if (r) toast("success", `${r.updated}건을 제출완료로 바꿨습니다.`);
              }}>일괄 제출</Button>
              <Button variant="outline" size="sm" className="rounded-xl" asChild><Link href="/managed/tax/purchases/bulk"><FileStack className="mr-1 h-4 w-4" /> 납부내역 일괄등록</Link></Button>
              <Button size="sm" className="rounded-xl" asChild><Link href="/managed/tax/purchases/new"><Plus className="mr-1 h-4 w-4" /> 매입 등록</Link></Button>
            </>
          )}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Receipt} title="매입 세금계산서가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((i) => (
                <div key={i.id as number} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/managed/tax/purchases/${i.id}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate font-semibold">{fmtDate(i.issue_date as string)} · {i.supplier_name as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.item as string} · {i.expense_category as string}{i.payment_method_label ? ` · ${i.payment_method_label}` : ""}{(i.attachments as unknown[]).length ? ` · 첨부 ${(i.attachments as unknown[]).length}` : ""}</p>
                  </Link>
                  <span>{won(i.total_amount)}</span>
                  <button disabled={!data.write_enabled} onClick={() => act(`/tax/purchases/${i.id}/toggle-deduction`)}
                    className={`rounded-full px-2 py-0.5 text-xs ${i.deduction_status === "deductible" ? "bg-blue-100 text-blue-700" : i.deduction_status === "review" ? "bg-amber-100 text-amber-700" : "bg-muted"}`}>{i.deduction_label as string}</button>
                  <button disabled={!data.write_enabled} onClick={() => act(`/tax/purchases/${i.id}/toggle-submitted`)}
                    className={`rounded-full px-2 py-0.5 text-xs ${i.is_submitted ? "bg-emerald-100 text-emerald-700" : "bg-muted"}`}>{i.is_submitted ? "제출" : "미제출"}</button>
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
