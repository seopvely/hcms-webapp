"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, ListChecks, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Result = ListResult & { status: Record<string, string> };

export default function FdeListPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ status?: string; plan_id?: string; q?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<Result>(["fde", "list"], "/fde/engagements", params);
  useEffect(() => {
    setPageTitle("FDE 계약");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select className={`${selectClass} w-auto`} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option>{Object.entries(data?.status ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={`${selectClass} w-auto`} value={params.plan_id ?? ""} onChange={(e) => setParams({ ...params, plan_id: e.target.value || undefined, page: 1 })}>
            <option value="">요금제 전체</option><option value="fde-diagnosis">진단</option><option value="fde-pilot">파일럿</option><option value="fde-resident">상주</option>
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="업체명" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/fde/plans"><ListChecks className="mr-1 h-4 w-4" /> 요금제</Link></Button>
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/fde/new"><Plus className="mr-1 h-4 w-4" /> 계약 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Briefcase} title="FDE 계약이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((e) => (
                <Link key={e.id as number} href={`/managed/fde/${e.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.company as string} · {e.plan_name as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{fmtDate(e.start_date as string)} ~ {fmtDate(e.end_date as string)}{e.min_end_date ? ` · 최소 ${fmtDate(e.min_end_date as string)}` : ""} · {e.headcount as number}명</p>
                  </div>
                  <span className="text-sm">{e.monthly_price_supply ? `월 ${won(e.monthly_price_supply)}` : won(e.contract_price_supply)}<span className="text-xs text-muted-foreground"> 공급가</span></span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.status_label as string}</span>
                </Link>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
