"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ListTodo, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, meta, selectCls } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useStaffList } from "@/lib/staff-sales";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";
import { STATUS_CLASS, TODO_PRIORITY, TODO_STATUS, TodoTabs } from "./todo-ui";

type Result = ListResult & { counts: Record<string, number> };
type Params = { q?: string; status?: string; priority?: string; assignee_id?: string; sort?: string; page: number };
type Row = Record<string, unknown>;

export default function TodosPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<Params>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<Result>(["todos", "list"], "/todos", params);
  const { data: staff } = useStaffList();
  useEffect(() => {
    setPageTitle("할일");
  }, [setPageTitle]);
  const c = data?.counts;
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/todo/`} />}
        <TodoTabs />
        <PageActions>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/todos/new"><Plus className="mr-1 h-4 w-4" /> 할일 등록</Link></Button>}
        </PageActions>
        {c && (
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            {[["pending", "대기"], ["in_progress", "진행중"], ["done", "완료"], ["overdue", "지연"]].map(([k, l]) => (
              <button key={k} onClick={() => setParams({ ...params, status: params.status === k ? undefined : k, page: 1 })}
                className={`rounded-xl border p-2 ${params.status === k ? "border-blue-500" : ""}`}><p className="text-muted-foreground">{l}</p><p className={`text-lg font-bold ${k === "overdue" ? "text-red-600" : ""}`}>{c[k]}</p></button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <select className={selectCls("w-auto")} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option>{Object.entries(TODO_STATUS).map(([a, b]) => <option key={a} value={a}>{b}</option>)}<option value="overdue">지연</option>
          </select>
          <select className={selectCls("w-auto")} value={params.priority ?? ""} onChange={(e) => setParams({ ...params, priority: e.target.value || undefined, page: 1 })}>
            <option value="">우선순위 전체</option>{Object.entries(TODO_PRIORITY).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
          </select>
          <select className={selectCls("w-auto")} value={params.assignee_id ?? ""} onChange={(e) => setParams({ ...params, assignee_id: e.target.value || undefined, page: 1 })}>
            <option value="">담당자 전체</option>{staff?.items.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="제목·내용·태그·담당자" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={ListTodo} title="할일이 없습니다" /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(t) => t.seq as number}
              rowHref={(t) => `/managed/todos/${t.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                {
                  key: "title", header: "제목", sort: "title", cell: (t) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{t.priority === "high" && <span className="mr-1 text-red-600">●</span>}{t.title as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta((t.assignee as string) || "담당 없음", t.company as string, t.project as string)}</p>
                    </div>
                  ),
                },
                { key: "priority", header: "우선순위", sort: "priority", align: "center", hideOnMobile: true, className: "w-20 whitespace-nowrap text-xs", cell: (t) => TODO_PRIORITY[t.priority as string] ?? (t.priority as string) },
                { key: "due_date", header: "마감", sort: "due_date", className: "w-32 whitespace-nowrap", cell: (t) => <Due t={t} /> },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-20", cell: (t) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[t.status as string] ?? "bg-muted"}`}>{t.status_label as string}</span> },
              ]}
              mobile={(t) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{t.priority === "high" && <span className="mr-1 text-red-600">●</span>}{t.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta((t.assignee as string) || "담당 없음", t.company as string, t.project as string)} · 마감 <Due t={t} /></p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[t.status as string] ?? "bg-muted"}`}>{t.status_label as string}</span>
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

function Due({ t }: { t: Row }) {
  return (
    <>
      {fmtDate(t.due_date as string)}
      {(t.overdue_days as number) > 0 && <span className="text-red-600"> · {t.overdue_days as number}일 지연</span>}
    </>
  );
}
