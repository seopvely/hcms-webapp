"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { BillingShell, STATUS_COLOR, useBillingOptions, useBillingWritable, won } from "@/components/managed/billing-ui";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
type Extra = { name: string; amount: string; month: string };
const opts = (m?: Record<string, string>) => Object.entries(m ?? {}) as [string, string][];
const BASE: FieldSpec[] = [
  { key: "company_id", label: "업체", type: "select" }, { key: "project_id", label: "프로젝트", type: "select" },
  { key: "project_type", label: "프로젝트 구분", type: "select" }, { key: "payment_type", label: "결제구분", type: "select" },
  { key: "payment_method", label: "결제수단", type: "select" }, { key: "payment_status", label: "결제상태", type: "select" },
  { key: "payment_date", label: "결제일", type: "date" }, { key: "invoice_tf", label: "계산서 발행", type: "select" },
  { key: "base_amount", label: "기본 금액(부가세 포함)", type: "number" }, { key: "production_price", label: "제작비", type: "number" },
  { key: "history_remarks", label: "비고", type: "textarea" },
];

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useStaffGet<Dict>(["billing", "payment", id], isNew ? null : `/billing/payments/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "납부 등록" : "납부 정보");
  }, [setPageTitle, isNew]);
  return (
    <PageTransition>
      <BillingShell cmsPath={isNew ? "/managed/prepayment/register" : `/managed/prepayment/update/${id}`}>
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
  const [v, setV] = useState<Record<string, string>>(() => (data ? toValues(BASE, data) : { payment_status: "3" }));
  const { data: projects } = useStaffGet<{ seq: number; title: string }[]>(["billing", "projects", v.company_id], v.company_id ? "/billing/options/projects" : null, { company_id: v.company_id });
  const fields: FieldSpec[] = useMemo(() => {
    const options: Record<string, [string, string][]> = {
      company_id: (o?.companies ?? []).map((c) => [String(c.seq), c.name]),
      project_id: (projects ?? []).map((p) => [String(p.seq), p.title]),
      project_type: opts(o?.project_types), payment_type: opts(o?.payment_types), payment_method: opts(o?.payment_methods),
      payment_status: opts(o?.payment_status), invoice_tf: [["1", "예"], ["2", "아니오"]],
    };
    return BASE.map((f) => (options[f.key] ? { ...f, options: options[f.key] } : f));
  }, [o, projects]);
  const [extras, setExtras] = useState<Extra[]>(() => ((data?.extra_items as Dict[] | undefined) ?? []).map((e) => ({ name: e.name as string, amount: String(e.amount ?? ""), month: (e.month as string) ?? "" })));
  const extraTotal = extras.reduce((a, e) => a + (Number(e.amount.replace(/,/g, "")) || 0), 0);
  const base = Number((v.base_amount ?? "").replace(/,/g, "")) || 0;

  const save = async () => {
    const body = { ...toPayload(fields, v), extra_items: extras.filter((e) => e.name.trim()).map((e) => ({ name: e.name, amount: e.amount, month: e.month || null })) } as Dict;
    try {
      if (!data) {
        const res = await write.mutateAsync({ url: "/billing/payments", body });
        toast("success", "등록했습니다.");
        router.replace(`/managed/billing/payments/${res.seq}`);
      } else {
        await write.mutateAsync({ method: "patch", url: `/billing/payments/${id}`, body });
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const monthly = data?.monthly_info as Dict | undefined;
  const histories = (data?.histories as Dict[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      {data && canWrite && (
        <PageActions>
          <Button size="sm" variant="outline" className="rounded-xl" asChild><Link href={`/managed/billing/history/new?payment_id=${id}&company_id=${data.company_id ?? ""}&project_id=${data.project_id ?? ""}`}>납부내역 등록</Link></Button>
          <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>
        </PageActions>
      )}
      {data && (
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[data.status_color as string] ?? "bg-muted"}`}>{data.status_text as string}</span>
        </div>
      )}
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <FormGrid fields={fields} values={v} disabled={!canWrite} onChange={(k, val) => setV((s) => ({ ...s, [k]: val, ...(k === "company_id" ? { project_id: "" } : {}) }))} />
        <div className="space-y-2">
          <p className="text-sm font-semibold">추가 비용(1회성 — 발생월에 청구, 비우면 계약 시작월)</p>
          {extras.map((e, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input className="rounded-xl" list="extra-presets" placeholder="항목" disabled={!canWrite} value={e.name} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x)))} />
              <Input className="rounded-xl" placeholder="금액" disabled={!canWrite} value={e.amount} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} />
              <Input className="rounded-xl" type="month" disabled={!canWrite} value={e.month} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, month: ev.target.value } : x)))} />
              {canWrite && <Button variant="ghost" className="rounded-xl text-red-600" onClick={() => setExtras(extras.filter((_, j) => j !== i))}>삭제</Button>}
            </div>
          ))}
          <datalist id="extra-presets">{o?.extra_presets.map((p) => <option key={p} value={p} />)}</datalist>
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setExtras([...extras, { name: "", amount: "", month: "" }])}><Plus className="mr-1 h-4 w-4" /> 추가 비용</Button>}
          <p className="text-sm">결제 금액 = 기본 {won(base)} + 추가 {won(extraTotal)} = <b>{won(base + extraTotal)}</b></p>
        </div>
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      {monthly && (
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5">
          <p className="text-sm font-semibold">월납 일정 · {fmtDate(monthly.contract_date as string)} ~ {fmtDate(monthly.end_date as string)} · {monthly.months as number}개월 · 월 {won(monthly.monthly_amount)}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {(monthly.schedule as Dict[]).map((m) => (
              <div key={m.label as string} className={`rounded-xl px-3 py-2 text-xs ${m.state === "paid" ? "bg-blue-50" : m.state === "partial" ? "bg-violet-50" : "bg-red-50"}`}>
                <p className="font-semibold">{m.label as string}</p>
                <p>{(m.paid as number).toLocaleString()} / {(m.due as number).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
      {data && (
        <Card className="rounded-2xl"><CardContent className="divide-y p-0">
          <p className="px-4 py-3 text-sm font-semibold">납부내역 {histories.length}건</p>
          {histories.map((h) => (
            <Link key={h.seq as number} href={`/managed/billing/history/${h.seq}`} className="flex flex-wrap gap-3 px-4 py-2 text-xs hover:bg-muted/40">
              <span className="w-20">{fmtDate(h.created_at as string)}</span>
              {h.target_month ? <span>대상월 {h.target_month as string}</span> : null}
              <span>계약금 {won(h.deposit_amount)} ({fmtDate(h.deposit_date as string)})</span>
              <span>중도금 {won(h.progress_amount)} ({fmtDate(h.progress_date as string)})</span>
              <span>잔금 {won(h.balance_amount)} ({fmtDate(h.balance_date as string)})</span>
              <span className={h.payment_tf === "1" ? "text-blue-600" : "text-muted-foreground"}>{h.payment_tf === "1" ? "입금확인" : "미확인"}</span>
            </Link>
          ))}
        </CardContent></Card>
      )}
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="납부 정보 삭제" description="연결된 납부내역도 함께 삭제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { try { await write.mutateAsync({ url: `/billing/payments/${id}/delete` }); toast("success", "삭제했습니다."); router.replace("/managed/billing/payments"); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }} />
    </div>
  );
}
