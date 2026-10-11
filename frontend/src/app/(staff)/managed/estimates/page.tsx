"use client";
import { FilterCard } from "@/components/managed/filter-card";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, FileText, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { ESTIMATE_STATUS_COLORS } from "@/components/managed/estimate-status";
import { DataTable } from "@/components/managed/data-table";
import { Field, fmtDate, meta, selectClass } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffEstimates } from "@/lib/staff-sales";

export default function StaffEstimatesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffEstimates(params);
  useEffect(() => {
    setPageTitle("견적서");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/estimate/`} />}
        <FilterCard className="flex flex-wrap items-end gap-3">
            <Field label="상태" className="w-40">
              <select className={selectClass} value={params.status ?? ""} onChange={(e) => setParams({ ...params, page: 1, status: e.target.value || undefined })}>
                <option value="">전체</option>
                {[["1", "작성중"], ["2", "발송"], ["3", "승인"], ["4", "거절"], ["5", "계약전환"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <form className="flex flex-1 items-end gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
              <Field label="검색(제목·번호·업체)" className="flex-1"><Input className="rounded-xl" value={keyword} onChange={(e) => setKeyword(e.target.value)} /></Field>
              <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
            </form>
          </FilterCard>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/estimates/dashboard"><BarChart3 className="mr-1 h-4 w-4" /> 대시보드</Link></Button>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/estimates/new"><Plus className="mr-1 h-4 w-4" /> 새 견적</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={FileText} title="견적서가 없습니다" /> : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(e) => e.seq}
              rowHref={(e) => `/managed/estimates/${e.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((p) => ({ ...p, sort, page: 1 }))}
              columns={[
                { key: "number", header: "번호", sort: "number", hideOnMobile: true, className: "w-36 whitespace-nowrap text-xs text-muted-foreground", cell: (e) => e.estimate_number },
                {
                  key: "title", header: "제목", sort: "title", cell: (e) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(e.company_name)}</p>
                    </div>
                  ),
                },
                { key: "manager", header: "담당", hideOnMobile: true, className: "w-24 whitespace-nowrap", cell: (e) => e.manager_name || "-" },
                { key: "written_date", header: "작성일", sort: "written_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (e) => fmtDate(e.written_date) },
                { key: "total", header: "금액", align: "right", className: "w-32 whitespace-nowrap font-medium", cell: (e) => `${e.total.toLocaleString()}원` },
                {
                  key: "status", header: "상태", sort: "status", align: "center", className: "w-28 whitespace-nowrap", cell: (e) => (
                    <div className="inline-flex items-center gap-1">
                      {e.withdrawn && <Badge className="bg-orange-100 text-orange-700">계약철회</Badge>}
                      <Badge className={`min-w-16 justify-center ${ESTIMATE_STATUS_COLORS[e.status] ?? "bg-muted"}`}>{e.status_label}</Badge>
                    </div>
                  ),
                },
              ]}
              mobile={(e) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{e.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(e.estimate_number, e.company_name, e.manager_name, `작성 ${fmtDate(e.written_date)}`)}</p>
                    <p className="text-xs font-medium tabular-nums">{e.total.toLocaleString()}원</p>
                  </div>
                  {e.withdrawn && <Badge className="bg-orange-100 text-orange-700">계약철회</Badge>}
                  <Badge className={`min-w-16 justify-center ${ESTIMATE_STATUS_COLORS[e.status] ?? "bg-muted"}`}>{e.status_label}</Badge>
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
