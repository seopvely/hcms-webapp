"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, FileText, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { ESTIMATE_STATUS_COLORS } from "@/components/managed/estimate-status";
import { Field, fmtDate, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffEstimates } from "@/lib/staff-sales";

export default function StaffEstimatesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffEstimates(params);
  useEffect(() => {
    setPageTitle("견적서");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/estimate/`} />}
        <Card className="rounded-2xl">
          <CardContent className="flex flex-wrap items-end gap-3 pt-5 pb-5">
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
            <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/estimates/dashboard"><BarChart3 className="mr-1 h-4 w-4" /> 대시보드</Link></Button>
            {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/estimates/new"><Plus className="mr-1 h-4 w-4" /> 새 견적</Link></Button>}
          </CardContent>
        </Card>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={FileText} title="견적서가 없습니다" /> : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((e) => (
                  <Link key={e.seq} href={`/managed/estimates/${e.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{e.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.estimate_number} · {e.company_name} · {e.manager_name || "-"} · 작성 {fmtDate(e.written_date)}</p>
                    </div>
                    <span className="text-sm font-medium">{e.total.toLocaleString()}원</span>
                    {e.withdrawn && <Badge className="bg-orange-100 text-orange-700">계약철회</Badge>}
                    <Badge className={ESTIMATE_STATUS_COLORS[e.status] ?? "bg-muted"}>{e.status_label}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
