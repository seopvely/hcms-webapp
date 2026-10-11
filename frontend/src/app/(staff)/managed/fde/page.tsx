"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, ListChecks, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { fmtDate, meta, selectCls } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Result = ListResult & { status: Record<string, string> };

export default function FdeListPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ status?: string; plan_id?: string; q?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<Result>(["fde", "list"], "/fde/engagements", params);
  useEffect(() => {
    setPageTitle("FDE 계약");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <select className={selectCls("w-auto")} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option>{Object.entries(data?.status ?? {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className={selectCls("w-auto")} value={params.plan_id ?? ""} onChange={(e) => setParams({ ...params, plan_id: e.target.value || undefined, page: 1 })}>
            <option value="">요금제 전체</option><option value="fde-diagnosis">진단</option><option value="fde-pilot">파일럿</option><option value="fde-resident">상주</option>
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="업체명" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/fde/plans"><ListChecks className="mr-1 h-4 w-4" /> 요금제</Link></Button>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/fde/new"><Plus className="mr-1 h-4 w-4" /> 계약 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Briefcase} title="FDE 계약이 없습니다" /> : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(e) => e.id as number}
              rowHref={(e) => `/managed/fde/${e.id}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                {
                  key: "company", header: "업체 · 요금제", cell: (e) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{e.company as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(e.plan_name as string)}</p>
                    </div>
                  ),
                },
                { key: "start_date", header: "시작", sort: "start_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (e) => fmtDate(e.start_date as string) },
                { key: "end_date", header: "종료", sort: "end_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (e) => fmtDate(e.end_date as string) },
                { key: "min_end_date", header: "최소 종료", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (e) => (e.min_end_date ? fmtDate(e.min_end_date as string) : "-") },
                { key: "headcount", header: "인원", sort: "headcount", align: "right", hideOnMobile: true, className: "w-16 whitespace-nowrap", cell: (e) => `${e.headcount as number}명` },
                {
                  key: "price", header: "공급가", align: "right", className: "w-36 whitespace-nowrap", cell: (e) => (e.monthly_price_supply ? `월 ${won(e.monthly_price_supply)}` : won(e.contract_price_supply)),
                },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-20", cell: (e) => <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.status_label as string}</span> },
              ]}
              mobile={(e) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.company as string} · {e.plan_name as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{fmtDate(e.start_date as string)} ~ {fmtDate(e.end_date as string)}{e.min_end_date ? ` · 최소 ${fmtDate(e.min_end_date as string)}` : ""} · {e.headcount as number}명</p>
                    <p className="text-xs">{e.monthly_price_supply ? `월 ${won(e.monthly_price_supply)}` : won(e.contract_price_supply)}<span className="text-muted-foreground"> 공급가</span></p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{e.status_label as string}</span>
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
