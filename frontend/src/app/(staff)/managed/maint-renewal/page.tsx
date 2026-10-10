"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
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

type Result = ListResult & { tabs: { key: string; label: string; count: number }[] };

export default function MaintRenewalListPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const [params, setParams] = useState<{ tab: string; q?: string; page: number }>({ tab: "pending", page: 1 });
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<{ open: boolean; force: boolean }>({ open: false, force: false });
  const { data, isLoading } = useStaffGet<Result>(["maint-renewal", "list"], "/maint-renewal", params);
  const write = useStaffWrite(["maint-renewal"]);
  useEffect(() => {
    setPageTitle("유지보수 전환");
  }, [setPageTitle]);
  const endProjects = async (force: boolean) => {
    try {
      const r = await write.mutateAsync({ url: "/maint-renewal/end-project", body: { seqs: selected, confirm_free_maint: force } });
      toast("success", `${r.ended.length}건 프로젝트 종료 처리했습니다.${r.skipped.length ? ` (이미 처리된 ${r.skipped.length}건 제외)` : ""}`);
      setSelected([]);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 409) setConfirm({ open: true, force: true });
      toast(status === 409 ? "warning" : "error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/maint-renewal/`} />}
        <div className="flex flex-wrap gap-2">
          {data?.tabs.map((t) => (
            <button key={t.key} className={`rounded-full px-3 py-1 text-xs ${params.tab === t.key ? "bg-slate-900 text-white" : "bg-muted"}`}
              onClick={() => { setSelected([]); setParams({ ...params, tab: t.key, page: 1 }); }}>{t.label} {t.count}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex max-w-md flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="업체·프로젝트" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          {data?.write_enabled && selected.length > 0 && <Button variant="outline" className="rounded-xl text-red-600" onClick={() => setConfirm({ open: true, force: false })}>선택 {selected.length}건 프로젝트 종료</Button>}
        </div>
        <p className="text-xs text-muted-foreground">전환 건은 계약종료(무상 유지보수 포함) D-30 에 매일 자동 등록됩니다(현재 cms 배치).</p>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={RefreshCw} title="전환 건이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((r) => (
                <div key={r.seq as number} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {data.write_enabled && Boolean(r.is_open) && (
                    <input type="checkbox" checked={selected.includes(r.seq as number)}
                      onChange={(e) => setSelected(e.target.checked ? [...selected, r.seq as number] : selected.filter((x) => x !== r.seq))} />
                  )}
                  <Link href={`/managed/maint-renewal/${r.seq}`} className="min-w-0 flex-1 hover:underline">
                    <p className="truncate text-sm font-semibold">{r.company as string} · {r.project as string}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      기준일 {fmtDate(r.due_date as string)} · 담당 {((r.agents as { name: string; role: string }[]) ?? []).map((a) => `${a.name}(${a.role})`).join(", ") || "-"}
                      {r.plan_label ? ` · ${r.plan_label} ${r.contract_months}개월 ${r.hosting_label}` : ""}{r.free_maint_left ? " · 무상기간 남음" : ""}
                    </p>
                  </Link>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status_label as string}</span>
                </div>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </div>
      <AppAlertDialog open={confirm.open} onOpenChange={(o) => setConfirm({ ...confirm, open: o })} variant="destructive" confirmText="종료"
        title={confirm.force ? "무상 기간이 남아도 종료" : "프로젝트 종료"}
        description={confirm.force ? "무상 유지보수 기간이 남은 건이 있습니다. 그래도 종료(완료·유지보수 요청 불가) 처리합니다." : "유지보수 안 함으로 원 프로젝트를 완료 처리하고 유지보수 요청을 막습니다."}
        onConfirm={() => endProjects(confirm.force)} />
    </PageTransition>
  );
}
