"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, FolderKanban, Plus, Search } from "lucide-react";
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

const PHASES: [string, string][] = [["active", "진행중"], ["free_maint", "무상유지보수"], ["ended", "완료"], ["stopped", "중지"], ["upcoming", "시작 전"], ["unknown", "기간 미설정"]];
const PHASE_COLORS: Record<string, string> = { active: "bg-blue-100 text-blue-700", free_maint: "bg-teal-100 text-teal-700", ended: "bg-slate-100 text-slate-600", stopped: "bg-red-100 text-red-700", upcoming: "bg-amber-100 text-amber-700", unknown: "bg-muted" };

export default function StaffProjectsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; phase?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<ListResult>(["projects", "list"], "/projects", params);
  useEffect(() => {
    setPageTitle("프로젝트");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/projectmanage`} />}
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-full px-3 py-1 text-xs ${!params.phase ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, phase: undefined })}>전체</button>
          {PHASES.map(([v, l]) => <button key={v} className={`rounded-full px-3 py-1 text-xs ${params.phase === v ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, phase: v })}>{l}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="프로젝트명·업체" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/projects/calendar"><CalendarRange className="mr-1 h-4 w-4" /> 계약 달력</Link></Button>
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/projects/new"><Plus className="mr-1 h-4 w-4" /> 프로젝트 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={FolderKanban} title="프로젝트가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((p) => (
                <Link key={p.seq as number} href={`/managed/projects/${p.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="w-12 text-xs text-muted-foreground">#{p.seq as number}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.company_name as string} · {p.project_type_label as string} · {fmtDate(p.contract_date as string)} ~ {fmtDate(p.contract_termination_date as string)}{(p.extension_count as number) > 0 && ` · 연장 ${p.extension_count}회`}{(p.point as number) > 0 && ` · 월 ${p.point}P`}</p>
                  </div>
                  {Boolean(p.is_opened) && <Badge variant="outline">오픈</Badge>}
                  <Badge className={`min-w-16 justify-center ${PHASE_COLORS[p.phase as string] ?? "bg-muted"}`}>{p.phase_label as string}</Badge>
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
