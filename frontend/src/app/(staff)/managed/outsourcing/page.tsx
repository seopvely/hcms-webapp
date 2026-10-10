"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, CalendarRange, Plus, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";

export default function StaffOutsourcingPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const [params, setParams] = useState<{ q?: string; status?: string; page: number }>({ page: 1 });
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
          <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/outsourcing/vendors"><Users className="mr-1 h-4 w-4" /> 외주업체</Link></Button>
          <Button variant="outline" className="rounded-xl" asChild><Link href="/managed/outsourcing/calendar"><CalendarRange className="mr-1 h-4 w-4" /> 달력</Link></Button>
          {data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/outsourcing/new"><Plus className="mr-1 h-4 w-4" /> 외주 등록</Link></Button>}
        </div>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Briefcase} title="외주가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((o) => (
                <div key={o.seq as number} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/managed/outsourcing/${o.seq}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-sm font-semibold">{o.vendor_name as string} · {o.work_type_label as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{(o.project_title as string) || "프로젝트 없음"} · {fmtDate(o.start_date as string)} ~ {fmtDate(o.end_date as string)} · 담당 {(o.manager_name as string) || "-"}</p>
                  </Link>
                  <span className="text-sm">{((o.amount as number) ?? 0).toLocaleString()}원{(o.paid_total as number) > 0 && <span className="text-xs text-muted-foreground"> (지급 {(o.paid_total as number).toLocaleString()})</span>}</span>
                  <label className="flex items-center gap-1 text-xs"><Checkbox disabled={!data.write_enabled} checked={Boolean(o.is_paid)} onCheckedChange={(v) => toggle(o.seq as number, v === true)} /> 지급</label>
                  <Badge variant="outline">{o.status_label as string}</Badge>
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
