"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Coins, Plus, Search, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDate, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { PendingPointsDialog } from "@/components/managed/pending-points-dialog";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffMe } from "@/lib/staff-hooks";
import { type MaintListParams, useLookupCompanies, useLookupProjects, useStaffMaintenanceList } from "@/lib/staff-maintenance";

export default function StaffMaintenanceListPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data: me } = useStaffMe();
  const canWrite = !!me?.write_areas.includes("maintenance");
  const [params, setParams] = useState<MaintListParams>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const [pendingOpen, setPendingOpen] = useState(false);
  const { data: companies } = useLookupCompanies();
  const { data: projects } = useLookupProjects(params.company_id);
  const { data, isLoading } = useStaffMaintenanceList(params);

  useEffect(() => {
    setPageTitle("유지보수 요청");
  }, [setPageTitle]);

  const set = (patch: Partial<MaintListParams>) => setParams((p) => ({ ...p, ...patch, page: patch.page ?? 1 }));
  const num = (v: string) => (v ? Number(v) : undefined);

  return (
    <PageTransition>
      <div className="space-y-4">
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/managelist`} />}

        <Card className="rounded-2xl">
          <CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="업체">
              <select className={selectClass} value={params.company_id ?? ""} onChange={(e) => set({ company_id: num(e.target.value), project_id: undefined })}>
                <option value="">전체</option>
                {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="프로젝트">
              <select className={selectClass} value={params.project_id ?? ""} onChange={(e) => set({ project_id: num(e.target.value) })}>
                <option value="">전체</option>
                {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="상태">
              <select className={selectClass} value={params.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })}>
                <option value="">전체</option>
                <option value="pending">미완료(접수·알림·처리중)</option>
                <option value="1">접수</option>
                <option value="2">알림</option>
                <option value="3">처리중</option>
                <option value="4">완료</option>
              </select>
            </Field>
            <Field label="요청 유형">
              <select className={selectClass} value={params.request_type ?? ""} onChange={(e) => set({ request_type: e.target.value || undefined })}>
                <option value="">전체</option>
                <option value="maint">유지보수</option>
                <option value="dev">개발</option>
                <option value="none">미분류</option>
              </select>
            </Field>
            <Field label="요청일 시작">
              <Input type="date" className="rounded-xl" value={params.date_from ?? ""} onChange={(e) => set({ date_from: e.target.value || undefined })} />
            </Field>
            <Field label="요청일 끝">
              <Input type="date" className="rounded-xl" value={params.date_to ?? ""} onChange={(e) => set({ date_to: e.target.value || undefined })} />
            </Field>
            <form
              className="flex items-end gap-2 sm:col-span-2"
              onSubmit={(e) => {
                e.preventDefault();
                set({ q: keyword.trim() || undefined });
              }}
            >
              <Field label="키워드(제목·내용·업체·프로젝트)" className="flex-1">
                <Input className="rounded-xl" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </Field>
              <Button type="submit" className="rounded-xl">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" onClick={() => setPendingOpen(true)}>
            <Coins className="mr-1 h-4 w-4" /> 포인트 미실행 조회
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link href="/managed/maintenance/schedule">
              <CalendarDays className="mr-1 h-4 w-4" /> 일정
            </Link>
          </Button>
          {canWrite && (
            <Button className="rounded-xl" asChild>
              <Link href="/managed/maintenance/new">
                <Plus className="mr-1 h-4 w-4" /> 새 요청 등록
              </Link>
            </Button>
          )}
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Wrench} title="유지보수 요청이 없습니다" description="필터를 바꿔 보세요." />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((m) => (
                  <Link key={m.seq} href={`/managed/maintenance/${m.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="w-12 text-xs text-muted-foreground">#{m.seq}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {m.title}
                        {m.is_free_maint && <Badge className="ml-2 bg-emerald-100 text-emerald-700">무상</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.company_name} · {m.project_title || "프로젝트 없음"} · {m.writer_name || "-"} · 요청 {fmtDate(m.request_date)}
                        {m.completion_date && ` · 완료예정 ${fmtDate(m.completion_date)}`}
                      </p>
                    </div>
                    {m.pending_points > 0 && <Badge className="bg-amber-100 text-amber-700">미실행 {m.pending_points}P</Badge>}
                    {m.points_used > 0 && <span className="text-xs text-muted-foreground">사용 {m.points_used}P</span>}
                    <StatusBadge status={m.status ?? ""} type="maintenance" />
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => set({ page })} />
          </>
        )}
      </div>

      <PendingPointsDialog
        open={pendingOpen}
        onOpenChange={setPendingOpen}
        filters={{ company_id: params.company_id, project_id: params.project_id }}
        canWrite={canWrite}
      />
    </PageTransition>
  );
}
