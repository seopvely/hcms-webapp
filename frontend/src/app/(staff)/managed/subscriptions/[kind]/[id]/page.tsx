"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDate, selectClass } from "@/components/managed/field";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { won } from "@/components/managed/billing-ui";
import { SearchSelect, toCompanyItems } from "@/components/managed/search-select";
import { useLookupCompanies } from "@/lib/staff-maintenance";
import { useStaffMe } from "@/lib/staff-hooks";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
type Plans = { dev: Record<string, { label: string; maintenance: number; dev: number; price: number; beta_price: number }>; maint: Record<string, Dict> };

export default function SubscriptionDetailPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["subscriptions", kind, "detail", id], isNew ? null : `/subscriptions/${kind}/${id}`);
  useEffect(() => {
    const generic = kind === "dev" ? "개발 구독" : "유지보수 구독";
    setPageTitle(isNew ? "개발 구독 등록" : data?.company ? `${data.company as string} · ${generic}` : generic);
  }, [setPageTitle, isNew, kind, data?.company]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return <PageTransition>{isNew ? <DevCreate /> : <Detail kind={kind} id={id} data={data!} />}</PageTransition>;
}

function DevCreate() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: plans } = useStaffGet<Plans>(["subscriptions", "plans"], "/subscriptions/plans");
  const { data: companies } = useLookupCompanies();
  const companyItems = useMemo(() => toCompanyItems(companies?.items), [companies]);
  const write = useStaffWrite(["subscriptions"]);
  const [v, setV] = useState({ company_id: "", plan_type: "growth", start_date: new Date().toISOString().slice(0, 10), is_beta: false, notes: "" });
  const p = plans?.dev[v.plan_type];
  const canWrite = !!me?.write_areas.includes("subscriptions");
  const save = async () => {
    try {
      const r = await write.mutateAsync({ url: "/subscriptions/dev", body: { ...v, company_id: Number(v.company_id) } });
      toast("success", "등록했습니다(초기 포인트 충전).");
      router.replace(`/managed/subscriptions/dev/${r.seq}`);
    } catch (err) {
      toast("error", apiErrorDetail(err, "등록에 실패했습니다."));
    }
  };
  return (
    <div className="space-y-4">
      {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/dev-subscription/register/`} />}
      <Card className="rounded-2xl"><CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-2">
        <Field label="업체 *">
          <SearchSelect items={companyItems} value={v.company_id} placeholder="선택" searchPlaceholder="업체명·사업자번호 (초성 가능)"
            onChange={(id) => setV({ ...v, company_id: id })} />
        </Field>
        <Field label="플랜 *">
          <select className={selectClass} value={v.plan_type} onChange={(e) => setV({ ...v, plan_type: e.target.value })}>
            {Object.entries(plans?.dev ?? {}).map(([k, d]) => <option key={k} value={k}>{d.label} · 유지보수 {d.maintenance}P + 개발 {d.dev}P/월</option>)}
          </select>
        </Field>
        <Field label="시작일 *"><Input className="rounded-xl" type="date" value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={v.is_beta} onChange={(e) => setV({ ...v, is_beta: e.target.checked })} /> 베타(30% 할인)</label>
        <Field label="메모(직원 전용)" className="sm:col-span-2"><Textarea className="rounded-xl" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        {p && <p className="text-sm sm:col-span-2">월 구독료 {won(v.is_beta ? p.beta_price : p.price)} · 다음 충전일 = 시작일 + 1개월 · 등록 즉시 1개월분 포인트 충전</p>}
        {canWrite && <div className="flex justify-end sm:col-span-2"><Button className="rounded-xl" disabled={!v.company_id || write.isPending} onClick={save}>등록</Button></div>}
      </CardContent></Card>
    </div>
  );
}

function Detail({ kind, id, data }: { kind: string; id: string; data: Dict }) {
  const { toast } = useToast();
  const write = useStaffWrite(["subscriptions"]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [v, setV] = useState({ plan_type: data.plan_type as string, is_beta: Boolean(data.is_beta), notes: (data.notes as string) ?? "" });
  const canWrite = Boolean(data.write_enabled);
  const points = data.points as Record<string, { charged: number; used: number; remaining: number }>;
  const plans = kind === "dev" ? [["starter", "STARTER"], ["growth", "GROWTH"], ["scale", "SCALE"]] : [["basic", "BASIC"], ["growth", "GROWTH"], ["business", "BUSINESS"]];
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast("success", ok);
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  const services = (data.services as Dict[] | undefined) ?? [];
  const domainOptions = (data.domain_options as { seq: number; label: string }[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      {canWrite && data.status !== "inactive" && (
        <PageActions>
          <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setCancelOpen(true)}>해지</Button>
        </PageActions>
      )}
      {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/${kind}-subscription/${id}/`} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
        <Card className="rounded-2xl"><CardContent className="pt-5 pb-5">
          <dl className="space-y-3">
            <SubInfo label="업체">{data.company as string}</SubInfo>
            <SubInfo label="플랜 · 상태">{data.plan_label as string} · {data.status_label as string}</SubInfo>
            <SubInfo label="월 요금 · 포인트">월 {won(data.monthly_price)} · 월 유지보수 {data.maintenance_points_per_month as number}P{kind === "dev" ? ` + 개발 ${data.dev_points_per_month}P` : ""}</SubInfo>
            <SubInfo label="시작 / 다음 충전">{fmtDate(data.start_date as string)} / {fmtDate(data.next_charge_date as string)}</SubInfo>
            {data.end_date ? <SubInfo label="종료">{fmtDate(data.end_date as string)}</SubInfo> : null}
            {data.hosting_label ? <SubInfo label="호스팅">{`${data.hosting_label}${data.hosting_provider ? `(${data.hosting_provider})` : ""}`}</SubInfo> : null}
            {data.project ? <SubInfo label="프로젝트"><Link className="underline" href={`/managed/projects/${(data.project as Dict).seq}`}>{(data.project as Dict).title as string}</Link></SubInfo> : null}
          </dl>
        </CardContent></Card>
        {Object.entries(points).map(([k, p]) => (
          <Card key={k} className="rounded-2xl"><CardContent className="pt-4 pb-4 text-sm">
            <p className="text-xs text-muted-foreground">{k === "dev" ? "개발" : "유지보수"} 포인트(회사 전체 누적)</p>
            <p className="text-xl font-bold">{p.remaining.toLocaleString()}P</p>
            <p className="text-xs text-muted-foreground">충전 {p.charged.toLocaleString()} · 사용 {p.used.toLocaleString()}</p>
          </CardContent></Card>
        ))}
      </div>
      <div className="min-w-0 space-y-4">
      <Card className="rounded-2xl"><CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-2">
        <Field label="플랜">
          <select className={selectClass} disabled={!canWrite} value={v.plan_type} onChange={(e) => setV({ ...v, plan_type: e.target.value })}>
            {plans.map(([a, b]) => <option key={a} value={a}>{b}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" disabled={!canWrite} checked={v.is_beta} onChange={(e) => setV({ ...v, is_beta: e.target.checked })} /> 베타(30% 할인)</label>
        <Field label="메모(직원 전용)" className="sm:col-span-2"><Textarea className="rounded-xl" disabled={!canWrite} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        {canWrite && <div className="flex justify-end sm:col-span-2"><Button className="rounded-xl" onClick={() => act(() => write.mutateAsync({ method: "patch", url: `/subscriptions/${kind}/${id}`, body: v }), "저장했습니다(가격·포인트는 요금표로 다시 계산).")}>저장</Button></div>}
      </CardContent></Card>
      {kind === "maint" && (
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-semibold">제공 서비스{data.domain_label ? ` · 도메인 ${data.domain_label}` : ""}</p>
            {canWrite && services.length === 0 && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act(() => write.mutateAsync({ url: `/subscriptions/maint/${id}/services/register` }), "요금제 기본 서비스를 등록했습니다.")}>기본 서비스 등록</Button>}
          </div>
          {services.map((s) => <ServiceRow key={s.seq as number} sid={s.seq as number} sub={id} s={s} domains={domainOptions} canWrite={canWrite} onSave={act} write={write} />)}
        </CardContent></Card>
      )}
      <Card className="rounded-2xl"><CardContent className="divide-y p-0">
        <p className="px-4 py-3 text-sm font-semibold">포인트 이력(최근 20건)</p>
        {((data.point_histories as Dict[]) ?? []).map((p) => (
          <div key={p.seq as number} className="flex gap-3 px-4 py-2 text-xs">
            <span className="w-20">{fmtDate(p.created_at as string)}</span>
            <span className="min-w-0 flex-1 truncate">{p.content as string}</span>
            <span className={p.point_type === "1" ? "text-blue-600" : "text-red-600"}>{p.point_type === "1" ? "+" : "-"}{Math.abs(p.point as number)}P</span>
          </div>
        ))}
      </CardContent></Card>
      </div>
      </div>
      <AppAlertDialog open={cancelOpen} onOpenChange={setCancelOpen} title="구독 해지" description="상태를 비활성으로 바꿉니다. 정기 충전이 멈춥니다." confirmText="해지" variant="destructive"
        onConfirm={() => act(() => write.mutateAsync({ url: `/subscriptions/${kind}/${id}/cancel` }), "해지했습니다.")} />
    </div>
  );
}

function SubInfo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function ServiceRow({ sid, sub, s, domains, canWrite, onSave, write }: {
  sid: number; sub: string; s: Dict; domains: { seq: number; label: string }[]; canWrite: boolean;
  onSave: (fn: () => Promise<unknown>, ok: string) => void; write: ReturnType<typeof useStaffWrite>;
}) {
  const [v, setV] = useState({ status: s.status as string, domain_id: s.domain_id ? String(s.domain_id) : "", start_date: (s.start_date as string) ?? "", end_date: (s.end_date as string) ?? "", memo: (s.memo as string) ?? "" });
  return (
    <div className="grid grid-cols-2 items-center gap-2 rounded-xl border p-2 text-xs sm:grid-cols-7 lg:grid-cols-4 2xl:grid-cols-7">
      <span className="font-semibold sm:col-span-1">{s.name as string} {s.spec as string}</span>
      <select className={selectClass} disabled={!canWrite} value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })}>
        <option value="pending">준비중</option><option value="active">제공중</option><option value="inactive">중지</option>
      </select>
      <select className={selectClass} disabled={!canWrite} value={v.domain_id} onChange={(e) => setV({ ...v, domain_id: e.target.value })}>
        <option value="">도메인 없음</option>{domains.map((d) => <option key={d.seq} value={d.seq}>{d.label}</option>)}
      </select>
      <Input className="rounded-xl" type="date" disabled={!canWrite} value={v.start_date} onChange={(e) => setV({ ...v, start_date: e.target.value })} />
      <Input className="rounded-xl" type="date" disabled={!canWrite} value={v.end_date} onChange={(e) => setV({ ...v, end_date: e.target.value })} />
      <Input className="rounded-xl" placeholder="메모" disabled={!canWrite} value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} />
      {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => onSave(() => write.mutateAsync({ method: "patch", url: `/subscriptions/maint/${sub}/services/${sid}`,
        body: { status: v.status, domain_id: v.domain_id ? Number(v.domain_id) : null, start_date: v.start_date || null, end_date: v.end_date || null, memo: v.memo } }), `${s.name} 저장`)}>저장</Button>}
    </div>
  );
}
