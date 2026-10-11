"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate, selectClass } from "@/components/managed/field";
import { type FieldSpec, FormGrid, toPayload, toValues } from "@/components/managed/form-grid";
import { STATUS_COLOR, won } from "@/components/managed/billing-ui";
import { useLookupCompanies } from "@/lib/staff-maintenance";
import { useStaffMe } from "@/lib/staff-hooks";
import { useStaffList } from "@/lib/staff-sales";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
type Plan = { plan_id: string; name_ko: string; kind: string; list_price_supply: number | null; applies_to: string[] };
const BASE: FieldSpec[] = [
  { key: "company_id", label: "업체 *", type: "select" }, { key: "plan_id", label: "요금제 *", type: "select" },
  { key: "status", label: "상태", type: "select", options: [["consulting", "상담"], ["quoted", "견적"], ["active", "진행"], ["completed", "완료"], ["terminated", "해지"]] },
  { key: "headcount", label: "투입 인원", type: "number" },
  { key: "start_date", label: "시작일", type: "date" }, { key: "end_date", label: "종료일", type: "date" },
  { key: "contract_price_supply", label: "계약 금액(1회, 공급가)", type: "number" }, { key: "monthly_price_supply", label: "월 금액(상주, 공급가)", type: "number" },
  { key: "predecessor_id", label: "선행 계약(진단) #", type: "number" }, { key: "diagnosis_credit_supply", label: "진단비 차감(공급가)", type: "number" },
  { key: "billing_day", label: "상주 월 청구일(1~31)", type: "number" }, { key: "notice_received_at", label: "종료 통보일", type: "date" },
  { key: "nda_signed_at", label: "NDA 체결일", type: "date" }, { key: "travel_expense_policy", label: "출장비 기준" },
  { key: "source_estimate_id", label: "연결 견적 #", type: "number" }, { key: "source_lead_id", label: "연결 영업접수 #", type: "number" },
  { key: "project_id", label: "연결 프로젝트 #", type: "number" },
  { key: "notes", label: "메모(직원 전용)", type: "textarea" },
];

export default function FdeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading, error } = useStaffGet<Dict>(["fde", "detail", id], isNew ? null : `/fde/engagements/${id}`);
  useEffect(() => {
    setPageTitle(isNew ? "FDE 계약 등록" : "FDE 계약");
  }, [setPageTitle, isNew]);
  if (!isNew && error) return <LoadFailed error={error} />;
  if (!isNew && (isLoading || !data)) return <DetailSkeleton />;
  return <PageTransition><Editor key={id} id={id} data={isNew ? null : data!} /></PageTransition>;
}

function Editor({ id, data }: { id: string; data: Dict | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data: companies } = useLookupCompanies();
  const { data: plans } = useStaffGet<{ items: Plan[] }>(["fde", "plans"], "/fde/plans");
  const { data: staff } = useStaffList();
  const write = useStaffWrite(["fde"]);
  const canWrite = data ? Boolean(data.write_enabled) : !!me?.write_areas.includes("fde");
  const canBill = canWrite && !!me?.write_areas.includes("billing");
  const fields = useMemo(() => {
    const options: Record<string, [string, string][]> = {
      company_id: (companies?.items ?? []).map((c) => [String(c.id), c.name]),
      plan_id: (plans?.items ?? []).filter((p) => p.kind === "plan").map((p) => [p.plan_id, p.name_ko]),
    };
    return BASE.map((f) => (options[f.key] ? { ...f, options: options[f.key] } : f));
  }, [companies, plans]);
  const [v, setV] = useState<Record<string, string>>(() => (data ? toValues(BASE, data) : { status: "consulting", headcount: "1" }));
  const [engineers, setEngineers] = useState<number[]>((data?.engineer_id_list as number[] | undefined) ?? []);
  const [addon, setAddon] = useState({ plan_id: "", qty: "1", unit_price_supply: "", start_date: "", end_date: "" });
  const save = async () => {
    const body = { ...toPayload(BASE, v), engineer_ids: engineers, ip_transfer_on_full_payment: data ? data.ip_transfer_on_full_payment !== false : true } as Dict;
    if (!body.headcount) body.headcount = 1;
    try {
      if (!data) {
        const r = await write.mutateAsync({ url: "/fde/engagements", body });
        toast("success", "등록했습니다.");
        router.replace(`/managed/fde/${r.id}`);
      } else {
        await write.mutateAsync({ method: "patch", url: `/fde/engagements/${id}`, body });
        toast("success", "저장했습니다.");
      }
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const call = async (url: string, body: Dict | undefined, ok: string) => {
    try {
      await write.mutateAsync({ url, body });
      toast("success", ok);
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };
  const addonPlans = (plans?.items ?? []).filter((p) => p.kind === "addon" && (!p.applies_to.length || p.applies_to.includes(v.plan_id)));
  const hint = data?.credit_hint as { predecessor_id: number; suggested: number; within_two_weeks: boolean } | null | undefined;
  const pays = (data?.payments as Dict[] | undefined) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href="/managed/fde"><ArrowLeft className="mr-1 h-4 w-4" /> 목록</Link></Button>
        {data && <span className="text-sm font-semibold">{data.company as string} · {data.plan_name as string} · {data.status_label as string}</span>}
      </div>
      <Card className="rounded-2xl"><CardContent className="space-y-4 pt-5 pb-5">
        <FormGrid fields={fields} values={v} disabled={!canWrite} onChange={(k, val) => setV((s) => ({ ...s, [k]: val }))} />
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-muted-foreground">투입 엔지니어:</span>
          {staff?.items.map((u) => (
            <label key={u.id} className="flex items-center gap-1"><input type="checkbox" disabled={!canWrite} checked={engineers.includes(u.id)}
              onChange={(e) => setEngineers(e.target.checked ? [...engineers, u.id] : engineers.filter((x) => x !== u.id))} />{u.name || u.username}</label>
          ))}
        </div>
        {hint && <p className="text-xs text-amber-700">선행 진단 #{hint.predecessor_id}: 진단비 50% 차감 제안 {won(hint.suggested)}{hint.within_two_weeks ? " (진단 종료 후 2주 이내)" : " — 2주가 지나 차감 대상이 아닐 수 있습니다"}</p>}
        {data?.notice_ok === false && <p className="text-xs text-red-600">종료 통보가 계약 조건(종료 30일 전)보다 늦습니다.</p>}
        {data?.min_end_date ? <p className="text-xs text-muted-foreground">최소 계약 종료일 {fmtDate(data.min_end_date as string)}</p> : null}
        {canWrite && <div className="flex justify-end"><Button className="rounded-xl" onClick={save} disabled={write.isPending}>저장</Button></div>}
      </CardContent></Card>
      {data && (
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5">
          <p className="text-sm font-semibold">옵션</p>
          {((data.addons as Dict[]) ?? []).map((a) => (
            <div key={a.id as number} className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-xs">
              <span className="flex-1 font-semibold">{a.plan_name as string}</span>
              <span>{a.qty as number} × {won(a.unit_price_supply)}</span>
              <span>{fmtDate(a.start_date as string)} ~ {fmtDate(a.end_date as string)}</span>
              {canWrite && <button className="text-red-600" onClick={() => call(`/fde/engagements/${id}/addons/${a.id}/delete`, undefined, "옵션을 삭제했습니다.")}><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {canWrite && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <select className={`${selectClass} sm:col-span-2`} value={addon.plan_id} onChange={(e) => setAddon({ ...addon, plan_id: e.target.value })}>
                <option value="">옵션 선택</option>{addonPlans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.name_ko}{p.list_price_supply ? ` (${p.list_price_supply.toLocaleString()})` : ""}</option>)}
              </select>
              <Input className="rounded-xl" placeholder="수량" value={addon.qty} onChange={(e) => setAddon({ ...addon, qty: e.target.value })} />
              <Input className="rounded-xl" placeholder="단가(비우면 정가)" value={addon.unit_price_supply} onChange={(e) => setAddon({ ...addon, unit_price_supply: e.target.value })} />
              <Input className="rounded-xl" type="date" value={addon.start_date} onChange={(e) => setAddon({ ...addon, start_date: e.target.value })} />
              <Button variant="outline" className="rounded-xl" disabled={!addon.plan_id} onClick={() => call(`/fde/engagements/${id}/addons`, {
                plan_id: addon.plan_id, qty: Number(addon.qty) || 1, unit_price_supply: addon.unit_price_supply ? Number(addon.unit_price_supply.replace(/,/g, "")) : null,
                start_date: addon.start_date || null, end_date: addon.end_date || null }, "옵션을 추가했습니다.")}><Plus className="mr-1 h-4 w-4" /> 추가</Button>
            </div>
          )}
        </CardContent></Card>
      )}
      {data && (
        <Card className="rounded-2xl"><CardContent className="space-y-2 pt-5 pb-5">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm font-semibold">청구 일정(납부리스트 연동, 부가세 포함)</p>
            {canBill && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => call(`/fde/engagements/${id}/billing`, {}, "청구를 만들었습니다.")}>
              <Receipt className="mr-1 h-4 w-4" /> {data.billing_kind === "monthly_prepaid" ? (pays.length ? "1개월 연장 청구" : "최소 기간 청구 생성") : "착수·잔금 청구 생성"}</Button>}
          </div>
          {canWrite && !canBill && <p className="text-xs text-muted-foreground">청구 생성은 재무(billing) 쓰기가 켜진 뒤 가능합니다.</p>}
          {pays.length === 0 && <p className="text-xs text-muted-foreground">아직 청구가 없습니다.</p>}
          {pays.map((p) => (
            <Link key={p.seq as number} href={`/managed/billing/payments/${p.seq}`} className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 text-xs hover:bg-muted/40">
              <span className="w-20">{fmtDate(p.payment_date as string)}</span>
              <span className="min-w-0 flex-1 truncate">{p.remarks as string}</span>
              <span>{won(p.payment_amount)}</span>
              <span className={`rounded-full px-2 py-0.5 ${STATUS_COLOR[p.status_color as string] ?? "bg-muted"}`}>{p.status_text as string}</span>
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  );
}
