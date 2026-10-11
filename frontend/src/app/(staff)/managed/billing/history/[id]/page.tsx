"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { BillingShell, useBillingOptions, useBillingWritable, won } from "@/components/managed/billing-ui";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
const KEYS = ["company_id", "project_id", "payment_id", "payment_alarm_seq", "payment_amount", "payment_date", "deposit_amount", "deposit_date", "progress_amount",
  "progress_date", "balance_amount", "balance_date", "tax_invoice_date", "progress_tax_invoice_date", "balance_tax_invoice_date", "payment_tf"] as const;
const DATE_KEYS = new Set(["payment_date", "deposit_date", "progress_date", "balance_date", "tax_invoice_date", "progress_tax_invoice_date", "balance_tax_invoice_date"]);

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useStaffGet<Dict>(["billing", "history", id], isNew ? null : `/billing/payment-history/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "납부내역 등록" : "납부내역");
  }, [setPageTitle, isNew]);
  return (
    <PageTransition>
      <BillingShell cmsPath={isNew ? "/managed/paymenthistory/register" : `/managed/paymenthistory/update/${id}`}>
        {!isNew && (isLoading || !data) ? <DetailSkeleton /> : <Editor key={id} id={id} data={isNew ? null : data!} />}
      </BillingShell>
    </PageTransition>
  );
}

function Editor({ id, data }: { id: string; data: Dict | null }) {
  const router = useRouter();
  const search = useSearchParams();
  const { toast } = useToast();
  const canWrite = useBillingWritable();
  const { data: o } = useBillingOptions();
  const write = useStaffWrite(["billing"]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of KEYS) {
      const val = data?.[k] ?? (data ? null : search.get(k));
      out[k] = val === null || val === undefined ? "" : DATE_KEYS.has(k) ? String(val).slice(0, 10) : String(val);
    }
    if (!data) out.payment_tf = "1";
    return out;
  });
  const [targetYear, setTargetYear] = useState(String(new Date().getFullYear()));
  const [months, setMonths] = useState<string[]>([]);
  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));
  const { data: projects } = useStaffGet<{ seq: number; title: string }[]>(["billing", "projects", v.company_id], v.company_id ? "/billing/options/projects" : null, { company_id: v.company_id });
  const { data: payments } = useStaffGet<Dict[]>(["billing", "payments-of", v.project_id], v.project_id ? "/billing/options/payments" : null, { project_id: v.project_id });
  const { data: alarms } = useStaffGet<Dict[]>(["billing", "alarms-of", v.project_id], !data && v.project_id ? "/billing/options/sales-alarms" : null, { project_id: v.project_id });
  const { data: remaining } = useStaffGet<{ remaining: number; payment_type: string }>(["billing", "remaining", v.payment_id], v.payment_id ? "/billing/options/remaining" : null, { payment_id: v.payment_id });
  const selectedPayment = payments?.find((p) => String(p.seq) === v.payment_id);
  const monthly = !data && selectedPayment?.payment_type === "3";

  const save = async () => {
    const body: Dict = {};
    for (const k of KEYS) {
      const val = v[k]?.trim() ?? "";
      body[k] = val === "" ? null : k.endsWith("_id") || k === "payment_alarm_seq" ? Number(val) : DATE_KEYS.has(k) && k !== "payment_date" ? `${val}T00:00:00` : val;
    }
    if (monthly) Object.assign(body, { target_year: targetYear, target_months: months });
    try {
      if (!data) {
        await write.mutateAsync({ url: "/billing/payment-history", body });
        toast("success", "등록했습니다.");
        router.replace("/managed/billing/history");
      } else {
        await write.mutateAsync({ method: "patch", url: `/billing/payment-history/${id}`, body });
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const input = (k: string, label: string, type = "text") => (
    <Field label={label}><Input className="rounded-xl" type={type} disabled={!canWrite} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  return (
    <div className="space-y-4">
      {data && (
        <PageActions>
          {data.payment_id ? <Button variant="outline" size="sm" className="rounded-xl" asChild><Link href={`/managed/billing/payments/${data.payment_id}`}>결제정보 #{data.payment_id as number}</Link></Button> : null}
          {canWrite && <Button size="sm" variant="outline" className="rounded-xl text-red-600" onClick={() => setDeleteOpen(true)} aria-label="삭제"><Trash2 className="h-4 w-4" /></Button>}
        </PageActions>
      )}
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="업체">
            <select className={selectClass} disabled={!canWrite} value={v.company_id} onChange={(e) => setV((s) => ({ ...s, company_id: e.target.value, project_id: "", payment_id: "", payment_alarm_seq: "" }))}>
              <option value="">선택</option>{o?.companies.map((c) => <option key={c.seq} value={c.seq}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="프로젝트">
            <select className={selectClass} disabled={!canWrite} value={v.project_id} onChange={(e) => setV((s) => ({ ...s, project_id: e.target.value, payment_id: "", payment_alarm_seq: "" }))}>
              <option value="">선택</option>{projects?.map((p) => <option key={p.seq} value={p.seq}>{p.title}</option>)}
            </select>
          </Field>
          <Field label="결제정보">
            <select className={selectClass} disabled={!canWrite || !!v.payment_alarm_seq} value={v.payment_id} onChange={(e) => set("payment_id", e.target.value)}>
              <option value="">선택</option>{payments?.map((p) => <option key={p.seq as number} value={p.seq as number}>#{p.seq as number} {p.type_label as string} {won(p.payment_amount)}</option>)}
            </select>
          </Field>
          {!data && (
            <Field label="매출 결제알람 연동(선택)">
              <select className={selectClass} disabled={!canWrite} value={v.payment_alarm_seq} onChange={(e) => setV((s) => ({ ...s, payment_alarm_seq: e.target.value, payment_id: e.target.value ? "" : s.payment_id }))}>
                <option value="">연동 안 함</option>{alarms?.map((a) => <option key={a.seq as number} value={a.seq as number}>{a.title as string} · {a.sub_type_label as string} · {won(a.amount)}</option>)}
              </select>
            </Field>
          )}
        </div>
        {remaining && <p className="text-xs text-muted-foreground">남은 금액: {won(remaining.remaining)}{remaining.payment_type === "3" ? " (월납 — 미납이면 월 납부액)" : ""}</p>}
        {monthly && (
          <div className="space-y-2 rounded-xl bg-muted/40 p-3">
            <p className="text-sm font-semibold">월납 대상월(선택한 달마다 납부내역을 따로 만듭니다)</p>
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-24 rounded-xl" value={targetYear} onChange={(e) => setTargetYear(e.target.value)} />
              {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => (
                <label key={m} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={months.includes(m)} onChange={(e) => setMonths(e.target.checked ? [...months, m] : months.filter((x) => x !== m))} />{Number(m)}월
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {input("deposit_amount", "계약금")}{input("deposit_date", "계약금 납부일", "date")}{input("tax_invoice_date", "계약금 계산서일", "date")}
          {input("progress_amount", "중도금")}{input("progress_date", "중도금 납부일", "date")}{input("progress_tax_invoice_date", "중도금 계산서일", "date")}
          {input("balance_amount", "잔금")}{input("balance_date", "잔금 납부일", "date")}{input("balance_tax_invoice_date", "잔금 계산서일", "date")}
          {input("payment_amount", "결제금액(기록용)")}
          {data && input("payment_date", "결제정보 결제일(입력 시 변경)", "date")}
          <Field label="입금여부">
            <select className={selectClass} disabled={!canWrite} value={v.payment_tf} onChange={(e) => set("payment_tf", e.target.value)}>
              <option value="">선택 안 함</option><option value="1">예(입금확인)</option><option value="2">아니오</option>
            </select>
          </Field>
        </div>
        {data?.target_month ? <p className="text-xs text-muted-foreground">대상월 {data.target_month as string}</p> : null}
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      <AppAlertDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="납부내역 삭제" description="연결된 세금계산서의 납부내역 연결도 해제됩니다." confirmText="삭제" variant="destructive"
        onConfirm={async () => { try { await write.mutateAsync({ url: `/billing/payment-history/${id}/delete` }); toast("success", "삭제했습니다."); router.replace("/managed/billing/history"); } catch (err) { toast("error", apiErrorDetail(err, "삭제에 실패했습니다.")); } }} />
    </div>
  );
}
