"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffLeads } from "@/lib/staff-sales";

export default function StaffSalesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; drafts?: boolean; page: number }>({ page: 1 });
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
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/sales/new"><Plus className="mr-1 h-4 w-4" /> 영업접수 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Megaphone} title="영업접수가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((l) => (
                <Link key={l.seq} href={`/managed/sales/${l.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.title || "(제목 없음)"}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.client_company} · {l.client_name} · {l.source_label} · 담당 {l.manager_name || "-"} · {fmtDate(l.created_at)}</p>
                  </div>
                  {l.expected_amount > 0 && <span className="text-sm">{l.expected_amount.toLocaleString()}원</span>}
                  {l.priority === "high" && <Badge className="bg-red-100 text-red-700">높음</Badge>}
                  <Badge variant="outline">{l.status_label}</Badge>
                </Link>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
