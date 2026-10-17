"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Power, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { SearchSelect } from "@/components/managed/search-select";
import { Field, apiErrorDetail, fmtDate, fmtDateTime, selectClass, selectCls } from "@/components/managed/field";
import { BillingShell, useBillingOptions, useBillingWritable } from "@/components/managed/billing-ui";
import { PageActions } from "@/components/managed/page-actions";
import { AiProgress, useAiJob } from "@/components/managed/ai-assist";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
type Rate = { rate: number; date: string; source: string; source_url: string };
const FX_NOTE = "[환율] ";

/** 설명의 환율 기록 줄([환율] …)을 현재 값으로 바꾼다 — 없으면 끝에 붙이고, 금액이 비면 지운다. */
function withoutFxNote(desc: string): string[] {
  const lines = desc.split("\n").filter((l) => !l.startsWith(FX_NOTE));
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

function withFxNote(desc: string, usd: string, krw: string, r: Rate): string {
  const lines = withoutFxNote(desc);
  if (krw) {
    const won = (n: number) => n.toLocaleString("ko-KR");
    const meta = [r.date && `${r.date} 기준`, r.source].filter(Boolean).join(" · ");
    lines.push(`${FX_NOTE}USD ${won(Number(usd.replace(/,/g, "")))} × ${won(r.rate)}원 = ${won(Number(krw))}원${meta ? ` (${meta})` : ""}`);
  }
  return lines.join("\n");
}
const HISTORY_STATUS: Record<string, string> = { pending: "대기중", sent: "발송완료", failed: "발송실패", confirmed: "결제확인" };

export default function AlarmDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useStaffGet<Dict>(["billing", "alarm", id], isNew ? null : `/billing/alarms/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "결제일 알람 등록" : "결제일 알람");
  }, [setPageTitle, isNew]);
  return (
    <PageTransition>
      <BillingShell cmsPath={isNew ? "/managed/payment-alarm/create/" : `/managed/payment-alarm/${id}/`}>
        {!isNew && (isLoading || !data) ? <DetailSkeleton /> : <Editor key={id} id={id} data={isNew ? null : data!} />}
      </BillingShell>
    </PageTransition>
  );
}

function Editor({ id, data }: { id: string; data: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const canWrite = useBillingWritable();
  const { data: o } = useBillingOptions();
  const write = useStaffWrite(["billing"]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const project = data?.project as Dict | null | undefined;
  const [v, setV] = useState<Record<string, string>>(() => {
    const s = (k: string, d = "") => (data?.[k] === null || data?.[k] === undefined ? d : String(data[k]));
    return {
      title: s("title"), description: s("description"), payment_type: s("payment_type", "purchase"), payment_sub_type: s("payment_sub_type"),
      company_id: project ? String(project.company_id ?? "") : "", project_id: s("project_id"), amount: s("amount"), cycle_type: s("cycle_type"),
      cycle_months: s("cycle_months"), payment_day: s("payment_day"), payment_month: s("payment_month"), notify_days_before: s("notify_days_before", "3"),
      alarm_time: s("alarm_time", "09:00"), start_date: s("start_date"), end_date: s("end_date"),
    };
  });
  const [allAgents, setAllAgents] = useState<boolean>(data ? Boolean(data.send_to_all_agents) : true);
  const [recipients, setRecipients] = useState<number[]>((data?.recipient_ids as number[] | undefined) ?? []);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  // 달러 입력 — 조회 당시 환율(claude 웹검색)로 원화 환산해 amount 에 채운다(저장은 원화만)
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [usd, setUsd] = useState("");
  const usdRef = useRef(""); // 조회 중에 고친 달러 금액도 결과에 반영되게
  const [rate, setRate] = useState<Rate | null>(null);
  const fx = useAiJob<Rate>();
  const toKrw = (amount: string, r: Rate | null) => {
    const n = Number(amount.replace(/,/g, ""));
    return r && amount.trim() !== "" && Number.isFinite(n) ? String(Math.round(n * r.rate)) : "";
  };
  const applyRate = (usdVal: string, r: Rate) => {
    const krw = toKrw(usdVal, r);
    setV((s) => ({ ...s, amount: krw, description: withFxNote(s.description, usdVal, krw, r) }));
  };
  const changeUsd = (val: string) => {
    setUsd(val);
    usdRef.current = val;
    if (rate) applyRate(val, rate);
  };
  const lookupRate = () => fx.start("/ai/exchange-rate", { currency: "USD" }, (r) => { setRate(r); applyRate(usdRef.current, r); });
  const changeCurrency = (c: "KRW" | "USD") => {
    setCurrency(c);
    if (c === "KRW") {
      setRate(null);
      fx.reset();
      setV((s) => ({ ...s, description: withoutFxNote(s.description).join("\n") }));
    }
  };
  const sales = v.payment_type === "sales";
  const { data: projects } = useStaffGet<{ seq: number; title: string }[]>(["billing", "projects", v.company_id], sales && v.company_id ? "/billing/options/projects" : null, { company_id: v.company_id });

  const save = async () => {
    if (currency === "USD" && usd.trim() !== "" && !rate) {
      toast("error", "달러 금액은 환율을 조회해 원화로 환산한 뒤 저장하세요.");
      return;
    }
    const n = (k: string) => (v[k].trim() === "" ? null : Number(v[k]));
    const body: Dict = {
      title: v.title, description: v.description, payment_type: v.payment_type, payment_sub_type: v.payment_sub_type || null, project_id: sales ? n("project_id") : null,
      amount: v.amount || null, cycle_type: v.cycle_type, cycle_months: n("cycle_months"), payment_day: n("payment_day"), payment_month: n("payment_month"),
      notify_days_before: n("notify_days_before") ?? 3, alarm_time: v.alarm_time || "09:00", start_date: v.start_date || null, end_date: v.end_date || null,
      send_to_all_agents: allAgents, recipients: allAgents ? [] : recipients,
    };
    try {
      if (!data) {
        const res = await write.mutateAsync({ url: "/billing/alarms", body });
        toast("success", "등록했습니다.");
        router.replace(`/managed/billing/alarms/${res.seq}`);
      } else {
        await write.mutateAsync({ method: "patch", url: `/billing/alarms/${id}`, body });
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const action = async (url: string, ok: string) => {
    try {
      await write.mutateAsync({ url });
      toast("success", ok);
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  const input = (k: string, label: string, type = "text") => (
    <Field label={label}><Input className="rounded-xl" type={type} disabled={!canWrite} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  const select = (k: string, label: string, opts: [string, string][], empty = "선택") => (
    <Field label={label}>
      <select className={selectClass} disabled={!canWrite} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
        <option value="">{empty}</option>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}
      </select>
    </Field>
  );
  const histories = (data?.histories as Dict[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      {data && canWrite && (
        <PageActions>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => action(`/billing/alarms/${id}/toggle`, "상태를 바꿨습니다.")}><Power className="mr-1 h-4 w-4" /> 유효/무효</Button>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => action(`/billing/alarms/${id}/test-send`, "테스트 메일을 보냈습니다.")}><Send className="mr-1 h-4 w-4" /> 테스트 발송</Button>
          <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>
        </PageActions>
      )}
      {data && (
      <div className="flex flex-wrap items-center gap-2">
        {data && <span className={`rounded-full px-2 py-0.5 text-xs ${data.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{data.valid_status === "valid" ? "유효" : "무효"}</span>}
        {data && <span className="text-xs text-muted-foreground">다음 결제일 {fmtDate(data.next_payment_date as string)} · 마지막 발송 {fmtDateTime(data.last_sent_at as string)}</span>}
      </div>
      )}
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="제목 *" className="sm:col-span-2"><Input className="rounded-xl" disabled={!canWrite} value={v.title} onChange={(e) => set("title", e.target.value)} /></Field>
          {select("payment_type", "결제구분 *", Object.entries(o?.alarm_types ?? {}))}
          {sales && select("payment_sub_type", "결제유형(매출)", Object.entries(o?.sub_types ?? {}), "지정 안 함")}
          {sales && (
            <Field label="업체">
              <SearchSelect items={(o?.companies ?? []).map((c) => ({ value: String(c.seq), label: c.name }))} value={v.company_id} emptyOption="선택" disabled={!canWrite} searchPlaceholder="업체명·사업자번호 (초성 가능)"
                onChange={(id) => setV((s) => ({ ...s, company_id: id, project_id: "" }))} />
            </Field>
          )}
          {sales && (
            <Field label="프로젝트">
              <SearchSelect items={(projects ?? []).map((p) => ({ value: String(p.seq), label: p.title }))} value={v.project_id ?? ""} emptyOption="선택" disabled={!canWrite} searchPlaceholder="프로젝트명 (초성 가능)"
                onChange={(id) => set("project_id", id)} />
            </Field>
          )}
          <Field label="금액(부가세 포함)">
            <div className="flex gap-1">
              <select className={selectCls("w-20 shrink-0")} disabled={!canWrite} value={currency} onChange={(e) => changeCurrency(e.target.value as "KRW" | "USD")} aria-label="통화">
                <option value="KRW">원</option><option value="USD">달러</option>
              </select>
              {currency === "KRW"
                ? <Input className="min-w-0 flex-1 rounded-xl" placeholder="원" disabled={!canWrite} value={v.amount} onChange={(e) => set("amount", e.target.value)} />
                : <Input className="min-w-0 flex-1 rounded-xl" disabled={!canWrite} inputMode="decimal" placeholder="USD" value={usd} onChange={(e) => changeUsd(e.target.value)} />}
            </div>
          </Field>
          {select("cycle_type", sales ? "결제주기(비우면 매월)" : "결제주기 *", Object.entries(o?.cycles ?? {}))}
          {v.cycle_type === "custom" && input("cycle_months", "주기(개월)", "number")}
          {v.cycle_type === "yearly" && input("payment_month", "결제월", "number")}
          {input("payment_day", "결제일(일) *", "number")}
          {input("notify_days_before", "며칠 전 알림", "number")}
          {input("alarm_time", "알림 시각", "time")}
          {input("start_date", "시작일 *", "date")}
          {input("end_date", "종료일", "date")}
          {currency === "USD" && (
            <div className="space-y-1 rounded-xl border border-dashed p-3 text-sm sm:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="rounded-xl" disabled={!canWrite || fx.running} onClick={lookupRate}>{rate ? "환율 다시 조회" : "환율 조회·원화 환산"}</Button>
                {rate && (
                  <span>
                    1 USD = <b>{rate.rate.toLocaleString("ko-KR")}원</b>
                    <span className="text-xs text-muted-foreground"> ({[rate.date, rate.source].filter(Boolean).join(" · ")}{rate.source_url && <> · <a className="underline" href={rate.source_url} target="_blank" rel="noreferrer">출처</a></>})</span>
                    {v.amount && <> → 저장 금액 <b>{Number(v.amount).toLocaleString("ko-KR")}원</b></>}
                  </span>
                )}
              </div>
              <AiProgress running={fx.running} elapsed={fx.job?.elapsed ?? 0} model={fx.job?.model} label="AI 가 현재 환율을 조회하는 중…" hint="웹검색 · 보통 15~40초" />
              {fx.error && <p className="text-xs text-red-600">{fx.error}</p>}
              {!rate && !fx.running && <p className="text-xs text-muted-foreground">달러 금액을 넣고 환율을 조회하면 원화로 환산해 저장하고, 적용 환율은 설명에 기록합니다(환산은 단순 환율 × 금액, 부가세 별도 가산 없음).</p>}
            </div>
          )}
          <Field label="설명" className="sm:col-span-2 lg:col-span-4"><Textarea className="rounded-xl" disabled={!canWrite} value={v.description} onChange={(e) => set("description", e.target.value)} /></Field>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canWrite} checked={allAgents} onChange={(e) => setAllAgents(e.target.checked)} /> 모든 에이전트에게 발송</label>
          {!allAgents && (
            <div className="flex flex-wrap gap-3">
              {o?.agents.map((a) => (
                <label key={a.id} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" disabled={!canWrite} checked={recipients.includes(a.id)} onChange={(e) => setRecipients(e.target.checked ? [...recipients, a.id] : recipients.filter((x) => x !== a.id))} />{a.name}
                </label>
              ))}
            </div>
          )}
        </div>
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      {data && (
        <Card className="rounded-2xl"><CardContent className="divide-y p-0">
          <p className="px-4 py-3 text-sm font-semibold">최근 이력</p>
          {histories.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">이력이 없습니다.</p>}
          {histories.map((h) => (
            <div key={h.seq as number} className="flex flex-wrap gap-3 px-4 py-2 text-xs">
              <span className="w-32">{fmtDateTime(h.sent_at as string)}</span>
              <span className="w-16 font-semibold">{HISTORY_STATUS[h.status as string] ?? (h.status as string)}</span>
              <span>대상 {fmtDate(h.payment_date as string)}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{h.recipients as string}{h.error_message ? ` · ${h.error_message}` : ""}</span>
            </div>
          ))}
        </CardContent></Card>
      )}
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="알람 삭제" description="결제대기 상태의 연동 납부 정보도 함께 삭제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { try { await write.mutateAsync({ url: `/billing/alarms/${id}/delete` }); toast("success", "삭제했습니다."); router.replace("/managed/billing/alarms"); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }} />
    </div>
  );
}
