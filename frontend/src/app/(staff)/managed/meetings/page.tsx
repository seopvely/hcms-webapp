"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarRange, MapPin, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDateTime, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

export default function MeetingsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; meeting_type?: string; page: number }>({ page: 1 });
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
          <select className={`${selectClass} w-auto`} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option><option value="valid">유효</option><option value="invalid">무효</option>
          </select>
          <select className={`${selectClass} w-auto`} value={params.meeting_type ?? ""} onChange={(e) => setParams({ ...params, meeting_type: e.target.value || undefined, page: 1 })}>
            <option value="">유형 전체</option><option value="offline">오프라인</option><option value="video">화상</option><option value="phone">전화</option>
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="제목·장소·메모" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/meetings/calendar"><CalendarRange className="mr-1 h-4 w-4" /> 달력</Link></Button>
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/meetings/new"><Plus className="mr-1 h-4 w-4" /> 미팅 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Users} title="미팅약속이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((m) => (
                <div key={m.seq as number} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${m.valid_status !== "valid" ? "opacity-60" : ""}`}>
                  <Link href={`/managed/meetings/${m.seq}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-sm font-semibold">{m.meeting_date as string} {(m.meeting_time as string) ?? ""} · {m.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.type_label as string}{m.end_place ? ` · ${m.start_place ? `${m.start_place} → ` : ""}${m.end_place}` : ""}{m.sales_lead ? ` · 영업 ${m.sales_lead}` : ""} · 다음 알람 {fmtDateTime(m.next_alarm as string)}</p>
                  </Link>
                  {Boolean(m.map_url) && <a href={m.map_url as string} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-700"><MapPin className="inline h-3 w-3" /> 지도</a>}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${m.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{m.valid_status === "valid" ? "유효" : "무효"}</span>
                </div>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
