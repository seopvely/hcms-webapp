"use client";
import { FilterCard } from "@/components/managed/filter-card";
import { useEffect, useMemo, useState } from "react";
import { SearchSelect, toCompanyItems } from "@/components/managed/search-select";
import Link from "next/link";
import { CalendarDays, Coins, Plus, Search, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDate, meta, selectClass } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
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
  const companyItems = useMemo(() => toCompanyItems(companies?.items), [companies]);
  const { data: projects } = useLookupProjects(params.company_id);
  const projectItems = useMemo(() => toCompanyItems(projects?.items), [projects]);
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

        <FilterCard className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="업체">
              <SearchSelect items={companyItems} value={params.company_id ? String(params.company_id) : ""} emptyOption="전체" searchPlaceholder="업체명·사업자번호 (초성 가능)"
                onChange={(id) => set({ company_id: num(id), project_id: undefined })} />
            </Field>
            <Field label="프로젝트">
              <SearchSelect items={projectItems} value={params.project_id ? String(params.project_id) : ""} emptyOption="전체" searchPlaceholder="프로젝트명 (초성 가능)"
                onChange={(id) => set({ project_id: num(id) })} />
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
          </FilterCard>

        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" onClick={() => setPendingOpen(true)}>
            <Coins className="mr-1 h-4 w-4" /> 포인트 미실행
          </Button>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild>
            <Link href="/managed/maintenance/schedule">
              <CalendarDays className="mr-1 h-4 w-4" /> 일정
            </Link>
          </Button>
          {canWrite && (
            <Button size="sm" className="rounded-xl" asChild>
              <Link href="/managed/maintenance/new">
                <Plus className="mr-1 h-4 w-4" /> 새 요청
              </Link>
            </Button>
          )}
        </PageActions>

        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Wrench} title="유지보수 요청이 없습니다" description="필터를 바꿔 보세요." />
        ) : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(m) => m.seq}
              rowHref={(m) => `/managed/maintenance/${m.seq}`}
              sort={params.sort}
              onSortChange={(sort) => set({ sort })}
              columns={[
                { key: "seq", header: "번호", sort: "seq", className: "w-16 text-xs text-muted-foreground", cell: (m) => `#${m.seq}` },
                {
                  key: "title", header: "제목", sort: "title", cell: (m) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">
                        {m.title}
                        {m.is_free_maint && <Badge className="ml-2 bg-emerald-100 text-emerald-700">무상</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{meta(m.company_name, m.project_title || "프로젝트 없음")}</p>
                    </div>
                  ),
                },
                { key: "writer", header: "요청자", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (m) => m.writer_name || "-" },
                { key: "request_date", header: "요청일", sort: "request_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (m) => fmtDate(m.request_date) },
                { key: "completion_date", header: "완료예정", sort: "completion_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (m) => (m.completion_date ? fmtDate(m.completion_date) : "-") },
                {
                  key: "points", header: "포인트", align: "right", className: "w-28 whitespace-nowrap", cell: (m) => (
                    <>
                      {m.pending_points > 0 && <Badge className="bg-amber-100 text-amber-700">미실행 {m.pending_points}P</Badge>}
                      {m.points_used > 0 && <span className="text-muted-foreground">{m.points_used}P</span>}
                      {!m.pending_points && !m.points_used && <span className="text-muted-foreground">-</span>}
                    </>
                  ),
                },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-20", cell: (m) => <StatusBadge status={m.status ?? ""} type="maintenance" /> },
              ]}
              mobile={(m) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.title}
                      {m.is_free_maint && <Badge className="ml-2 bg-emerald-100 text-emerald-700">무상</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{meta(`#${m.seq}`, m.company_name, fmtDate(m.request_date), m.points_used > 0 && `${m.points_used}P`)}</p>
                  </div>
                  <StatusBadge status={m.status ?? ""} type="maintenance" />
                </div>
              )}
            />
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
