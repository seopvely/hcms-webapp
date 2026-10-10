"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus, Search } from "lucide-react";
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
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

export default function StaffDomainsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; page: number }>({ page: 1 });
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
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/domains/new"><Plus className="mr-1 h-4 w-4" /> 도메인 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Globe} title="도메인이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((d) => (
                <Link key={d.seq as number} href={`/managed/domains/${d.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{(d.urls as string[]).join(", ") || "(주소 없음)"}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.company_name as string} · 도메인 만료 {fmtDate(d.domain_end_date as string)}{d.domain_ssl_end_date ? ` · SSL ${fmtDate(d.domain_ssl_end_date as string)}` : ""}{d.hosting_end_date ? ` · 호스팅 ${fmtDate(d.hosting_end_date as string)}` : ""}</p>
                  </div>
                  {Boolean(d.domain_expired) && <Badge className="bg-red-100 text-red-700">기간 지남</Badge>}
                  <Badge variant="outline">{d.status_label as string}</Badge>
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
