"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, CalendarRange, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { apiErrorDetail, fmtDate, meta } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";

export default function StaffOutsourcingPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const [params, setParams] = useState<{ q?: string; status?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<ListResult>(["outsourcing", "list"], "/outsourcing", params);
  const write = useStaffWrite(["outsourcing"]);
  useEffect(() => {
    setPageTitle("외주관리");
  }, [setPageTitle]);
  const toggle = async (seq: number, paid: boolean) => {
    const paid_date = paid ? window.prompt("지급일(YYYY-MM-DD)", new Date().toISOString().slice(0, 10)) : null;
    if (paid && !paid_date) return;
    try {
      await write.mutateAsync({ url: `/outsourcing/${seq}/toggle-paid`, body: { is_paid: paid, paid_date } });
      toast("success", paid ? "지급 완료로 표시했습니다(결제일알람 자동 연동)." : "지급을 취소했습니다(연결 알람·지급내역 삭제).");
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/outsourcing/`} />}
        <div className="flex flex-wrap gap-2">
          {[["", "전체"], ["active", "진행중"], ["completed", "완료"], ["cancelled", "취소"]].map(([v, l]) => <button key={v} className={`rounded-full px-3 py-1 text-xs ${(params.status ?? "") === v ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, status: v || undefined })}>{l}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="내용·업체" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/outsourcing/vendors"><Users className="mr-1 h-4 w-4" /> 외주업체</Link></Button>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/outsourcing/calendar"><CalendarRange className="mr-1 h-4 w-4" /> 달력</Link></Button>
          {data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/outsourcing/new"><Plus className="mr-1 h-4 w-4" /> 외주 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Briefcase} title="외주가 없습니다" /> : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(o) => o.seq as number}
              rowHref={(o) => `/managed/outsourcing/${o.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                {
                  key: "vendor", header: "외주업체 · 작업", cell: (o) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{o.vendor_name as string} · {o.work_type_label as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{(o.project_title as string) || "프로젝트 없음"}</p>
                    </div>
                  ),
                },
                { key: "manager", header: "담당", hideOnMobile: true, className: "w-24 whitespace-nowrap", cell: (o) => (o.manager_name as string) || "-" },
                { key: "start_date", header: "시작", sort: "start_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (o) => fmtDate(o.start_date as string) },
                { key: "end_date", header: "종료", sort: "end_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (o) => fmtDate(o.end_date as string) },
                {
                  key: "amount", header: "금액", sort: "amount", align: "right", className: "w-36 whitespace-nowrap", cell: (o) => (
                    <>
                      {((o.amount as number) ?? 0).toLocaleString()}원
                      {(o.paid_total as number) > 0 && <span className="block text-xs text-muted-foreground">지급 {(o.paid_total as number).toLocaleString()}</span>}
                    </>
                  ),
                },
                {
                  key: "is_paid", header: "지급", sort: "is_paid", align: "center", className: "w-16", cell: (o) => (
                    <label className="inline-flex items-center gap-1 text-xs"><Checkbox disabled={!data.write_enabled} checked={Boolean(o.is_paid)} onCheckedChange={(v) => toggle(o.seq as number, v === true)} /></label>
                  ),
                },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-20", cell: (o) => <Badge variant="outline">{o.status_label as string}</Badge> },
              ]}
              mobile={(o) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{o.vendor_name as string} · {o.work_type_label as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta((o.project_title as string) || "프로젝트 없음", `${fmtDate(o.start_date as string)} ~ ${fmtDate(o.end_date as string)}`, `담당 ${(o.manager_name as string) || "-"}`)}</p>
                    <p className="text-xs tabular-nums">{((o.amount as number) ?? 0).toLocaleString()}원{(o.paid_total as number) > 0 && <span className="text-muted-foreground"> (지급 {(o.paid_total as number).toLocaleString()})</span>}</p>
                  </div>
                  <label className="flex items-center gap-1 text-xs"><Checkbox disabled={!data.write_enabled} checked={Boolean(o.is_paid)} onCheckedChange={(v) => toggle(o.seq as number, v === true)} /> 지급</label>
                  <Badge variant="outline">{o.status_label as string}</Badge>
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
