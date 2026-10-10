"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { StatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDate, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { SimpleListFilter } from "@/components/managed/simple-list-filter";
import { TASK_STATUSES, TASK_TYPES } from "@/components/managed/task-options";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffMe } from "@/lib/staff-hooks";
import { type SimpleListParams, useStaffTasks } from "@/lib/staff-support";


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
        {me?.write_areas.includes("tasks") && (
          <Button className="rounded-xl" asChild>
            <Link href="/managed/tasks/new"><Plus className="mr-1 h-4 w-4" /> 건별작업 등록</Link>
          </Button>
        )}
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={ClipboardList} title="건별작업이 없습니다" />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((t) => (
                  <Link key={t.seq} href={`/managed/tasks/${t.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="w-12 text-xs text-muted-foreground">#{t.seq}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{t.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.company_name} · {t.task_type_label} · {t.writer_name || "-"} · 등록 {fmtDate(t.created_at)}
                        {t.deadline && ` · 마감 ${fmtDate(t.deadline)}`}
                        {(t.estimated_hours || t.actual_hours) && ` · ${t.actual_hours ?? 0}/${t.estimated_hours ?? "-"}h`}
                      </p>
                    </div>
                    <StatusBadge status={t.status ?? ""} type="task" />
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
