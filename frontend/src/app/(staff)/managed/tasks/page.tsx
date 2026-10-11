"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDate, meta, selectClass } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { SimpleListFilter } from "@/components/managed/simple-list-filter";
import { TASK_STATUSES, TASK_TYPES } from "@/components/managed/task-options";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffMe } from "@/lib/staff-hooks";
import { type SimpleListParams, type TaskListItem, useStaffTasks } from "@/lib/staff-support";

const hoursOf = (t: TaskListItem) => (t.estimated_hours || t.actual_hours ? `${t.actual_hours ?? 0}/${t.estimated_hours ?? "-"}h` : null);

export default function StaffTasksPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data: me } = useStaffMe();
  const [params, setParams] = useState<SimpleListParams>({ page: 1 });
  const { data, isLoading } = useStaffTasks(params);
  useEffect(() => {
    setPageTitle("건별작업");
  }, [setPageTitle]);
  const set = (patch: Partial<SimpleListParams>) => setParams((p) => ({ ...p, ...patch, page: 1 }));

  return (
    <PageTransition>
      <div className="space-y-4">
        <SimpleListFilter
          statusOptions={TASK_STATUSES}
          value={params}
          onChange={set}
          extra={
            <Field label="작업 유형">
              <select className={selectClass} value={params.task_type ?? ""} onChange={(e) => set({ task_type: e.target.value || undefined })}>
                <option value="">전체</option>
                {TASK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          }
        />
        <PageActions>
          {me?.write_areas.includes("tasks") && (
            <Button size="sm" className="rounded-xl" asChild>
              <Link href="/managed/tasks/new"><Plus className="mr-1 h-4 w-4" /> 건별작업 등록</Link>
            </Button>
          )}
        </PageActions>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={ClipboardList} title="건별작업이 없습니다" />
        ) : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(t) => t.seq}
              rowHref={(t) => `/managed/tasks/${t.seq}`}
              sort={params.sort}
              onSortChange={(sort) => set({ sort })}
              columns={[
                { key: "seq", header: "번호", sort: "seq", className: "w-16 text-xs text-muted-foreground", cell: (t) => `#${t.seq}` },
                {
                  key: "title", header: "제목", sort: "title", cell: (t) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(t.company_name, t.task_type_label, t.writer_name)}</p>
                    </div>
                  ),
                },
                { key: "created_at", header: "등록일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (t) => fmtDate(t.created_at) },
                { key: "deadline", header: "마감", sort: "deadline", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (t) => (t.deadline ? fmtDate(t.deadline) : "-") },
                { key: "hours", header: "시간(실제/예상)", align: "right", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (t) => hoursOf(t) || "-" },
                { key: "status", header: "상태", sort: "task_status", align: "center", className: "w-20", cell: (t) => <StatusBadge status={t.status ?? ""} type="task" /> },
              ]}
              mobile={(t) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {meta(`#${t.seq}`, t.company_name, t.task_type_label, t.writer_name, `등록 ${fmtDate(t.created_at)}`, t.deadline && `마감 ${fmtDate(t.deadline)}`, hoursOf(t))}
                    </p>
                  </div>
                  <StatusBadge status={t.status ?? ""} type="task" />
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
