"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, History, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

export default function AlarmsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; when_to_notify?: string; page: number }>({ page: 1 });
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
          <select className={`${selectClass} w-auto`} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option><option value="valid">유효</option><option value="invalid">무효</option>
          </select>
          <select className={`${selectClass} w-auto`} value={params.when_to_notify ?? ""} onChange={(e) => setParams({ ...params, when_to_notify: e.target.value || undefined, page: 1 })}>
            <option value="">시점 전체</option><option value="month">한달전</option><option value="week">일주일전</option><option value="custom">커스텀</option>
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="제목·내용" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/alarms/history"><History className="mr-1 h-4 w-4" /> 발송 이력</Link></Button>
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/alarms/new"><Plus className="mr-1 h-4 w-4" /> 알람 등록</Link></Button>}
        </div>
        <p className="text-xs text-muted-foreground">발송은 5분마다 도는 배치가 처리합니다(현재 cms).</p>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={BellRing} title="알람이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((a) => (
                <Link key={a.seq as number} href={`/managed/alarms/${a.seq}`} className={`flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40 ${a.valid_status !== "valid" ? "opacity-60" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.when_label as string} · {a.cycle_label as string} · 다음 {fmtDateTime(a.next_event as string)} · 마지막 발송 {fmtDateTime(a.last_sent_at as string)}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDate(a.created_at as string)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${a.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{a.valid_status === "valid" ? "유효" : "무효"}</span>
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
