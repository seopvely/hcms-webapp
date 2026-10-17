"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, Copy, MapPin, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDateTime, meta, selectCls } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Row = Record<string, unknown>;
const subOf = (m: Row) => meta(m.type_label as string, m.end_place ? `${m.start_place ? `${m.start_place} → ` : ""}${m.end_place}` : null, m.sales_lead ? `영업 ${m.sales_lead}` : null);

export default function MeetingsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; meeting_type?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<ListResult>(["meetings", "list"], "/meetings", params);
  useEffect(() => {
    setPageTitle("미팅약속");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/meeting/`} />}
        <div className="flex flex-wrap gap-2">
          <select className={selectCls("w-auto")} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option><option value="valid">유효</option><option value="invalid">무효</option>
          </select>
          <select className={selectCls("w-auto")} value={params.meeting_type ?? ""} onChange={(e) => setParams({ ...params, meeting_type: e.target.value || undefined, page: 1 })}>
            <option value="">유형 전체</option><option value="offline">오프라인</option><option value="video">화상</option><option value="phone">전화</option>
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="제목·장소·메모" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/meetings/calendar"><CalendarRange className="mr-1 h-4 w-4" /> 달력</Link></Button>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/meetings/new"><Plus className="mr-1 h-4 w-4" /> 미팅 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Users} title="미팅약속이 없습니다" /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(m) => m.seq as number}
              rowHref={(m) => `/managed/meetings/${m.seq}`}
              rowClassName={(m) => (m.valid_status !== "valid" ? "opacity-60" : undefined)}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                { key: "meeting_date", header: "일시", sort: "meeting_date", className: "w-36 whitespace-nowrap", cell: (m) => `${m.meeting_date as string} ${(m.meeting_time as string) ?? ""}` },
                {
                  key: "title", header: "제목", sort: "title", cell: (m) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{m.title as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{subOf(m)}</p>
                    </div>
                  ),
                },
                { key: "next_alarm", header: "다음 알람", hideOnMobile: true, className: "w-36 whitespace-nowrap text-xs text-muted-foreground", cell: (m) => fmtDateTime(m.next_alarm as string) },
                { key: "map", header: "지도", align: "center", hideOnMobile: true, className: "w-16", cell: (m) => <MapLink m={m} /> },
                { key: "valid_status", header: "상태", sort: "valid_status", align: "center", className: "w-20", cell: (m) => <ValidBadge m={m} /> },
                ...(data.write_enabled ? [{ key: "copy", header: "복사", align: "center" as const, className: "w-16", cell: (m: Row) => <CopyLink m={m} /> }] : []),
              ]}
              mobile={(m) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.meeting_date as string} {(m.meeting_time as string) ?? ""} · {m.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(subOf(m), `다음 알람 ${fmtDateTime(m.next_alarm as string)}`)}</p>
                  </div>
                  <MapLink m={m} />
                  <ValidBadge m={m} />
                  {data.write_enabled && <CopyLink m={m} />}
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

function MapLink({ m }: { m: Row }) {
  if (!m.map_url) return null;
  return <a href={m.map_url as string} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-xs text-emerald-700"><MapPin className="inline h-3 w-3" /> 지도</a>;
}

/** 이 약속을 복사해 새 일정으로 등록 */
function CopyLink({ m }: { m: Row }) {
  return (
    <Link href={`/managed/meetings/new?copy=${m.seq}`} title="복사해서 새 일정 등록" aria-label="복사해서 새 일정 등록"
      className="inline-flex rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Copy className="h-4 w-4" /></Link>
  );
}

function ValidBadge({ m }: { m: Row }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${m.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{m.valid_status === "valid" ? "유효" : "무효"}</span>;
}
