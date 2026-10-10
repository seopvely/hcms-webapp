"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, fmtDate, fmtDateTime, selectClass } from "@/components/managed/field";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
type Plan = { label: string; points: number; hosting_price: number; maint_price: number; internal_price: number; external_price: number; services_internal: string[] };

export default function MaintRenewalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useStaffGet<Dict>(["maint-renewal", "detail", id], `/maint-renewal/${id}`);
  useEffect(() => {
    setPageTitle("유지보수 전환");
  }, [setPageTitle]);
  if (isLoading || !data) return <DetailSkeleton />;
  return <PageTransition><Detail key={String(data.status)} id={id} data={data} /></PageTransition>;
}

function Detail({ id, data }: { id: string; data: Dict }) {
  const router = useRouter();
  const { toast } = useToast();
  const write = useStaffWrite(["maint-renewal"]);
  const canWrite = Boolean(data.write_enabled) && Boolean(data.is_open);
  const plans = data.plans as Record<string, Plan>;
  const [v, setV] = useState({
    decision: "accepted", chosen_plan: (data.chosen_plan as string) || "basic", contract_months: String(data.contract_months ?? 12),
    hosting_type: (data.hosting_type as string) || "I", hosting_provider: (data.hosting_provider as string) ?? "",
    external_hosting_end_date: (data.external_hosting_end_date as string) ?? "", memo: "",
  });
  const [endOpen, setEndOpen] = useState(false);
  const [force, setForce] = useState(false);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast("success", ok);
      return true;
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
      return false;
    }
  };
  const body = { ...v, contract_months: Number(v.contract_months), external_hosting_end_date: v.external_hosting_end_date || null };
  const est = data.estimate as Dict | null;
  const p = plans[v.chosen_plan];
  const monthly = p ? (v.hosting_type === "E" ? p.external_price : p.internal_price) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/maint-renewal"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{data.status_label as string}</span>
        <div className="flex-1" />
        {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => act(() => write.mutateAsync({ url: `/maint-renewal/${id}/notify-customer` }), "고객 안내 메일을 보냈습니다.")}><Mail className="mr-1 h-4 w-4" /> 고객 안내 메일</Button>}
        {canWrite && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => { setForce(false); setEndOpen(true); }}>프로젝트 종료</Button>}
      </div>
      {!data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/maint-renewal/${id}/`} />}
      <Card className="rounded-2xl"><CardContent className="grid gap-2 pt-5 pb-5 text-sm sm:grid-cols-2">
        <p><b>{data.company as string}</b> · <Link className="underline" href={`/managed/projects/${data.project_id}`}>{data.project as string}</Link></p>
        <p>기준일 <b className="text-red-600">{fmtDate(data.due_date as string)}</b> (계약종료 {fmtDate(data.contract_termination_date as string)} · 무상 종료 {fmtDate(data.free_maint_end_date as string)})</p>
        <p>담당 {((data.agents as { name: string; role: string }[]) ?? []).map((a) => `${a.name}(${a.role})`).join(", ") || "-"}</p>
        <p>고객 수신자 {((data.recipients as { name: string; email: string }[]) ?? []).map((r) => `${r.name} <${r.email}>`).join(", ") || "없음(로그인 허용 + 이메일 필요)"}</p>
        <p className="text-xs text-muted-foreground">담당자 알림 {fmtDateTime(data.notified_at as string)} · 고객 안내 {fmtDateTime(data.contacted_at as string)} · 의향 {fmtDateTime(data.responded_at as string)}</p>
        {Boolean(data.in_free_maint) && <p className="text-xs text-amber-700">현재 무상 유지보수 기간입니다.</p>}
      </CardContent></Card>
      <div className="grid gap-3 sm:grid-cols-3">
        {Object.entries(plans).map(([code, pl]) => (
          <button key={code} disabled={!canWrite} onClick={() => setV({ ...v, chosen_plan: code })}
            className={`rounded-2xl border p-4 text-left text-sm ${v.chosen_plan === code ? "border-blue-500 bg-blue-50" : ""}`}>
            <p className="font-bold">{pl.label} · 월 {pl.points}P</p>
            <p>한결랩 호스팅 {won(pl.internal_price)} <span className="text-xs text-muted-foreground">(호스팅 {pl.hosting_price.toLocaleString()} + 유지보수 {pl.maint_price.toLocaleString()})</span></p>
            <p>외부 호스팅 {won(pl.external_price)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{pl.services_internal.join(", ")}</p>
          </button>
        ))}
      </div>
      <Card className="rounded-2xl"><CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="의향">
          <select className={selectClass} disabled={!canWrite} value={v.decision} onChange={(e) => setV({ ...v, decision: e.target.value })}>
            <option value="accepted">유지보수 희망</option><option value="declined">유지보수 안 함</option>
          </select>
        </Field>
        <Field label="계약 개월"><Input className="rounded-xl" type="number" disabled={!canWrite} value={v.contract_months} onChange={(e) => setV({ ...v, contract_months: e.target.value })} /></Field>
        <Field label="호스팅">
          <select className={selectClass} disabled={!canWrite} value={v.hosting_type} onChange={(e) => setV({ ...v, hosting_type: e.target.value })}>
            <option value="I">한결랩 호스팅</option><option value="E">외부 호스팅</option>
          </select>
        </Field>
        {v.hosting_type === "E" ? (
          <>
            <Field label="외부 호스팅 업체"><Input className="rounded-xl" disabled={!canWrite} value={v.hosting_provider} onChange={(e) => setV({ ...v, hosting_provider: e.target.value })} /></Field>
            <Field label="외부 호스팅 만료일"><Input className="rounded-xl" type="date" disabled={!canWrite} value={v.external_hosting_end_date} onChange={(e) => setV({ ...v, external_hosting_end_date: e.target.value })} /></Field>
          </>
        ) : <p className="pt-6 text-xs text-muted-foreground">도메인 {(data.domain_label as string) || "미지정"}</p>}
        <Field label="메모" className="sm:col-span-2 lg:col-span-4"><Textarea className="rounded-xl" disabled={!canWrite} value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} /></Field>
        <p className="text-sm sm:col-span-2">예상 월 {won(monthly)} × {v.contract_months}개월 = {won(monthly * Number(v.contract_months || 0))} (VAT 별도)</p>
        {canWrite && (
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <Button variant="outline" className="rounded-xl" onClick={() => act(() => write.mutateAsync({ url: `/maint-renewal/${id}/respond`, body }), "의향을 기록했습니다.")}>의향 기록</Button>
            {v.decision === "accepted" && (
              <Button className="rounded-xl" onClick={async () => {
                const regenerate = Boolean(est) && window.confirm("이미 견적서가 있습니다. 작성중 견적서를 지우고 다시 만들까요?");
                if (est && !regenerate) return;
                try {
                  const r = await write.mutateAsync({ url: `/maint-renewal/${id}/create-estimate`, body: { ...body, regenerate } });
                  toast("success", `유지보수구독 견적서(${r.estimate_number})를 만들었습니다. 내용을 확인한 뒤 발송하세요.`);
                  router.push(`/managed/estimates/${r.estimate_id}`);
                } catch (err) {
                  toast("error", apiErrorDetail(err, "견적 생성에 실패했습니다."));
                }
              }}><FileText className="mr-1 h-4 w-4" /> {est ? "견적 다시 생성" : "견적 생성"}</Button>
            )}
          </div>
        )}
      </CardContent></Card>
      <Card className="rounded-2xl"><CardContent className="space-y-1 pt-5 pb-5 text-sm">
        <p className="font-semibold">진행</p>
        <p>견적서: {est ? <Link className="underline" href={`/managed/estimates/${est.seq}`}>{est.number as string} {est.title as string}</Link> : "미생성"}</p>
        <p>계약서: {((data.contracts as Dict[]) ?? []).map((c) => <Link key={c.seq as number} className="mr-2 underline" href={`/managed/contracts/${c.seq}`}>{(c.number as string) || `#${c.seq}`}</Link>)}{!(data.contracts as Dict[])?.length && "미작성"}</p>
        <p>전환 프로젝트: {data.new_project ? <Link className="underline" href={`/managed/projects/${(data.new_project as Dict).seq}`}>{(data.new_project as Dict).title as string}</Link> : "미전환"}</p>
        {data.memo ? <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-xs">{data.memo as string}</pre> : null}
      </CardContent></Card>
      <AppAlertDialog open={endOpen} onOpenChange={setEndOpen} variant="destructive" confirmText="종료" title={force ? "무상 기간이 남아도 종료" : "프로젝트 종료"}
        description={force ? "무상 유지보수 기간이 남아 있습니다. 그래도 종료 처리합니다." : "원 프로젝트를 완료 처리하고 유지보수 요청을 막습니다."}
        onConfirm={async () => {
          try {
            await write.mutateAsync({ url: "/maint-renewal/end-project", body: { seqs: [Number(id)], memo: v.memo, confirm_free_maint: force } });
            toast("success", "프로젝트 종료 처리했습니다.");
          } catch (err) {
            if ((err as { response?: { status?: number } }).response?.status === 409) {
              setForce(true);
              setEndOpen(true);
            }
            toast("warning", apiErrorDetail(err, "처리에 실패했습니다."));
          }
        }} />
    </div>
  );
}
