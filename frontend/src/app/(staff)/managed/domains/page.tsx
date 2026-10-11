"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { fmtDate, meta } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

export default function StaffDomainsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<ListResult>(["domains", "list"], "/domains", params);
  useEffect(() => {
    setPageTitle("도메인");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/domain`} />}
        <div className="flex flex-wrap gap-2">
          {[["", "전체"], ["A", "활성"], ["E", "만료"], ["I", "비활성"]].map(([v, l]) => <button key={v} className={`rounded-full px-3 py-1 text-xs ${(params.status ?? "") === v ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, status: v || undefined })}>{l}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="도메인·업체" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/domains/new"><Plus className="mr-1 h-4 w-4" /> 도메인 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Globe} title="도메인이 없습니다" /> : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(d) => d.seq as number}
              rowHref={(d) => `/managed/domains/${d.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                {
                  key: "urls", header: "도메인", cell: (d) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{(d.urls as string[]).join(", ") || "(주소 없음)"}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(d.company_name as string)}</p>
                    </div>
                  ),
                },
                {
                  key: "domain_end_date", header: "도메인 만료", sort: "domain_end_date", className: "w-32 whitespace-nowrap", cell: (d) => (
                    <>
                      {fmtDate(d.domain_end_date as string)}
                      {Boolean(d.domain_expired) && <Badge className="ml-1 bg-red-100 text-red-700">기간 지남</Badge>}
                    </>
                  ),
                },
                { key: "domain_ssl_end_date", header: "SSL 만료", sort: "domain_ssl_end_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (d) => fmtDate(d.domain_ssl_end_date as string) },
                { key: "hosting_end_date", header: "호스팅 만료", sort: "hosting_end_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (d) => fmtDate(d.hosting_end_date as string) },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-20", cell: (d) => <Badge variant="outline">{d.status_label as string}</Badge> },
              ]}
              mobile={(d) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{(d.urls as string[]).join(", ") || "(주소 없음)"}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.company_name as string} · 도메인 만료 {fmtDate(d.domain_end_date as string)}{d.domain_ssl_end_date ? ` · SSL ${fmtDate(d.domain_ssl_end_date as string)}` : ""}{d.hosting_end_date ? ` · 호스팅 ${fmtDate(d.hosting_end_date as string)}` : ""}</p>
                  </div>
                  {Boolean(d.domain_expired) && <Badge className="bg-red-100 text-red-700">기간 지남</Badge>}
                  <Badge variant="outline">{d.status_label as string}</Badge>
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
