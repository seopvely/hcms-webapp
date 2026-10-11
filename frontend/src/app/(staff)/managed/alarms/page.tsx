"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, History, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, fmtDateTime, meta, selectCls } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Row = Record<string, unknown>;

export default function AlarmsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; when_to_notify?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<ListResult>(["alarms", "list"], "/alarms", params);
  useEffect(() => {
    setPageTitle("알람");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/alarm/`} />}
        <div className="flex flex-wrap gap-2">
          <select className={selectCls("w-auto")} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option><option value="valid">유효</option><option value="invalid">무효</option>
          </select>
          <select className={selectCls("w-auto")} value={params.when_to_notify ?? ""} onChange={(e) => setParams({ ...params, when_to_notify: e.target.value || undefined, page: 1 })}>
            <option value="">시점 전체</option><option value="month">한달전</option><option value="week">일주일전</option><option value="custom">커스텀</option>
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="제목·내용" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/alarms/history"><History className="mr-1 h-4 w-4" /> 발송 이력</Link></Button>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/alarms/new"><Plus className="mr-1 h-4 w-4" /> 알람 등록</Link></Button>}
        </PageActions>
        <p className="text-xs text-muted-foreground">발송은 5분마다 도는 배치가 처리합니다(현재 cms).</p>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={BellRing} title="알람이 없습니다" /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(a) => a.seq as number}
              rowHref={(a) => `/managed/alarms/${a.seq}`}
              rowClassName={(a) => (a.valid_status !== "valid" ? "opacity-60" : undefined)}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                {
                  key: "title", header: "제목", sort: "title", cell: (a) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{a.title as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(a.when_label as string, a.cycle_label as string)}</p>
                    </div>
                  ),
                },
                { key: "next_event", header: "다음", hideOnMobile: true, className: "w-36 whitespace-nowrap", cell: (a) => fmtDateTime(a.next_event as string) },
                { key: "last_sent_at", header: "마지막 발송", sort: "last_sent_at", hideOnMobile: true, className: "w-36 whitespace-nowrap text-muted-foreground", cell: (a) => fmtDateTime(a.last_sent_at as string) },
                { key: "created_at", header: "등록일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap text-xs text-muted-foreground", cell: (a) => fmtDate(a.created_at as string) },
                { key: "valid_status", header: "상태", sort: "valid_status", align: "center", className: "w-20", cell: (a) => <ValidBadge a={a} /> },
              ]}
              mobile={(a) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.when_label as string} · {a.cycle_label as string} · 다음 {fmtDateTime(a.next_event as string)} · 마지막 발송 {fmtDateTime(a.last_sent_at as string)} · 등록 {fmtDate(a.created_at as string)}</p>
                  </div>
                  <ValidBadge a={a} />
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

function ValidBadge({ a }: { a: Row }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${a.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{a.valid_status === "valid" ? "유효" : "무효"}</span>;
}
