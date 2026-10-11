"use client";
import { FilterCard } from "@/components/managed/filter-card";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Coins, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffMe } from "@/lib/staff-hooks";
import { useAdjustPoints, useLookupCompanies, useLookupProjects, usePointLedger, useProjectBalances } from "@/lib/staff-maintenance";

const TYPE_COLORS: Record<string, string> = {
  "1": "bg-emerald-100 text-emerald-700",
  "2": "bg-slate-100 text-slate-700",
  "3": "bg-amber-100 text-amber-700",
};

// 포인트 장부 — 프로젝트별 현재 주기 잔여(고객 화면과 같은 계산) + 장부(책정 포함) + 수동 조정.
export default function StaffPointsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data: me } = useStaffMe();
  const canAdjust = !!me?.write_areas.includes("points");
  const [params, setParams] = useState<{ company_id?: number; project_id?: number; point_type?: string; page: number }>({ page: 1 });
  const [adjustOpen, setAdjustOpen] = useState(false);
  const { data: balances } = useProjectBalances();
  const { data: companies } = useLookupCompanies();
  const { data: projects } = useLookupProjects(params.company_id);
  const { data, isLoading } = usePointLedger(params);

  useEffect(() => {
    setPageTitle("포인트 장부");
  }, [setPageTitle]);

  const set = (patch: object) => setParams((p) => ({ ...p, page: 1, ...patch }));

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-xl" asChild>
            <Link href="/managed/points/guide"><BookOpen className="mr-1 h-4 w-4" /> 포인트 안내</Link>
          </Button>
          {canAdjust && (
            <Button className="rounded-xl" onClick={() => setAdjustOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> 수동 충전·차감
            </Button>
          )}
        </div>

        <div>
          <h2 className="mb-2 text-sm font-semibold">진행중 프로젝트 잔여 (현재 6개월 주기)</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {balances?.items.map((b) => {
              const pct = b.cycle_total ? Math.round(((b.cycle_total - b.remaining) / b.cycle_total) * 100) : 0;
              return (
                <Card key={b.project_id} className="rounded-2xl">
                  <CardContent className="space-y-2 pt-4 pb-4 text-sm">
                    <p className="truncate font-semibold">{b.project_title}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.company_name} · 월 {b.monthly_point}P · {fmtDate(b.cycle_start)}~{fmtDate(b.cycle_end)}</p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-indigo-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <p className="text-xs">잔여 <span className="font-semibold">{b.remaining}P</span> / {b.cycle_total}P</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <FilterCard className="grid gap-3 sm:grid-cols-3">
            <Field label="업체">
              <select className={selectClass} value={params.company_id ?? ""} onChange={(e) => set({ company_id: e.target.value ? Number(e.target.value) : undefined, project_id: undefined })}>
                <option value="">전체</option>
                {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="프로젝트">
              <select className={selectClass} value={params.project_id ?? ""} onChange={(e) => set({ project_id: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">전체</option>
                {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="유형">
              <select className={selectClass} value={params.point_type ?? ""} onChange={(e) => set({ point_type: e.target.value || undefined })}>
                <option value="">전체</option>
                <option value="1">충전</option>
                <option value="2">사용</option>
                <option value="3">책정</option>
              </select>
            </Field>
          </FilterCard>

        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Coins} title="포인트 내역이 없습니다" />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((r) => (
                  <div key={r.seq} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <Badge className={`min-w-16 justify-center ${TYPE_COLORS[r.point_type ?? ""] ?? "bg-muted"}`}>{r.point_type_label}/{r.status_label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {r.managelist_id ? <Link className="hover:underline" href={`/managed/maintenance/${r.managelist_id}`}>{r.content}</Link> : r.content}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.company_name} · {r.project_title || "프로젝트 없음"} · {r.category} · {r.writer_name || "-"} · {fmtDateTime(r.created_at)}
                      </p>
                    </div>
                    <span className={`font-semibold ${r.point >= 0 ? "text-emerald-600" : ""}`}>{r.point > 0 ? "+" : ""}{r.point}P</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
      {adjustOpen && <AdjustDialog onClose={() => setAdjustOpen(false)} />}
    </PageTransition>
  );
}

function AdjustDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const adjust = useAdjustPoints();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [projectId, setProjectId] = useState("");
  const [type, setType] = useState("1");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const { data: companies } = useLookupCompanies();
  const { data: projects } = useLookupProjects(companyId);

  const save = async () => {
    try {
      await adjust.mutateAsync({ project_id: Number(projectId), point_type: type, points: Number(points), reason, password });
      toast("success", "기록했습니다.");
      onClose();
    } catch (err) {
      toast("error", apiErrorDetail(err, "기록에 실패했습니다."));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>수동 충전·차감</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="업체">
            <select className={selectClass} value={companyId ?? ""} onChange={(e) => { setCompanyId(e.target.value ? Number(e.target.value) : undefined); setProjectId(""); }}>
              <option value="">선택</option>
              {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="프로젝트">
            <select className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!companyId}>
              <option value="">선택</option>
              {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="유형">
              <select className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="1">충전(+)</option>
                <option value="2">차감(−)</option>
              </select>
            </Field>
            <Field label="포인트">
              <Input type="number" min={1} className="rounded-xl" value={points} onChange={(e) => setPoints(e.target.value)} />
            </Field>
          </div>
          <Field label="사유 *">
            <Input className="rounded-xl" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="본인 비밀번호">
            <Input type="password" autoComplete="current-password" className="rounded-xl" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <p className="text-xs text-muted-foreground">기록은 수정할 수 없습니다. 잘못 기록했다면 반대 유형으로 정정 행을 추가하세요.</p>
        </div>
        <DialogFooter>
          <Button className="rounded-xl" onClick={save} disabled={adjust.isPending || !projectId || !points || !reason.trim() || !password}>
            기록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
