"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { meta, fmtDate } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffLeads } from "@/lib/staff-sales";

export default function StaffSalesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; drafts?: boolean; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffLeads(params);
  useEffect(() => {
    setPageTitle("영업접수");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/sales/`} />}
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-full px-3 py-1 text-xs ${!params.status && !params.drafts ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ page: 1, q: params.q })}>전체</button>
          {data?.pipeline.map((p) => (
            <button key={p.status} className={`rounded-full px-3 py-1 text-xs ${params.status === p.status ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, drafts: undefined, status: p.status })}>{p.label} {p.count}</button>
          ))}
          {!!data?.draft_count && <button className={`rounded-full px-3 py-1 text-xs ${params.drafts ? "bg-slate-900 text-white" : "bg-amber-100 text-amber-800"}`} onClick={() => setParams({ page: 1, drafts: true })}>예전 임시저장 {data.draft_count}</button>}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="건명·고객사·담당자·연락처" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/sales/new"><Plus className="mr-1 h-4 w-4" /> 영업접수 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Megaphone} title="영업접수가 없습니다" /> : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(l) => l.seq}
              rowHref={(l) => `/managed/sales/${l.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((p) => ({ ...p, sort, page: 1 }))}
              columns={[
                {
                  key: "title", header: "건명", sort: "title", cell: (l) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">
                        {l.title || "(제목 없음)"}
                        {l.priority === "high" && <Badge className="ml-2 bg-red-100 text-red-700">높음</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{meta(l.client_company, l.client_name)}</p>
                    </div>
                  ),
                },
                { key: "source", header: "유입", hideOnMobile: true, className: "w-24 whitespace-nowrap", cell: (l) => l.source_label || "-" },
                { key: "manager", header: "담당", hideOnMobile: true, className: "w-24 whitespace-nowrap", cell: (l) => l.manager_name || "-" },
                { key: "created_at", header: "접수일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (l) => fmtDate(l.created_at) },
                { key: "expected_amount", header: "예상금액", sort: "expected_amount", align: "right", className: "w-32 whitespace-nowrap", cell: (l) => (l.expected_amount > 0 ? `${l.expected_amount.toLocaleString()}원` : "") },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-24", cell: (l) => <Badge variant="outline">{l.status_label}</Badge> },
              ]}
              mobile={(l) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.title || "(제목 없음)"}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(l.client_company, l.client_name, l.source_label, l.manager_name && `담당 ${l.manager_name}`, fmtDate(l.created_at))}</p>
                    {l.expected_amount > 0 && <p className="text-xs tabular-nums">{l.expected_amount.toLocaleString()}원</p>}
                  </div>
                  {l.priority === "high" && <Badge className="bg-red-100 text-red-700">높음</Badge>}
                  <Badge variant="outline">{l.status_label}</Badge>
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
