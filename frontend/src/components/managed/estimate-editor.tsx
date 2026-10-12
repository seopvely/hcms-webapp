"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/common/app-toast";
import { type AiItem, EstimateAiDialog } from "@/components/managed/ai-assist";
import { Field, apiErrorDetail, selectClass } from "@/components/managed/field";
import { type FieldSpec, toPayload, toValues } from "@/components/managed/form-grid";
import { FormSection, MoneyInput, SummaryRow, useUnsavedGuard } from "@/components/managed/form-kit";
import { PageActions } from "@/components/managed/page-actions";
import { cn } from "@/lib/utils";
import staffApi from "@/lib/staff-api";
import { useLookupCompanies } from "@/lib/staff-maintenance";
import { type EstimateDetail, useSalesMutation } from "@/lib/staff-sales";

export const PROJECT_TYPES: [string, string][] = [
  ["1", "웹사이트"], ["2", "모바일앱"], ["3", "웹앱"], ["4", "웹+앱"], ["5", "도메인"], ["6", "보안서버"], ["7", "쇼핑몰"], ["8", "운영"],
  ["9", "유지보수"], ["10", "서버관리"], ["11", "서버마이그레이션"], ["12", "호스팅"], ["13", "개발구독"], ["15", "유지보수구독"], ["16", "FDE"],
];
const UNITS = ["식", "페이지", "개월", "시간", "일", "개", "건", "회", "년", "명"];

// 저장 시 형 변환에 쓰는 필드 목록(화면 배치는 아래 JSX 가 정한다)
const FIELDS: FieldSpec[] = [
  { key: "company_id", label: "업체", type: "number" },
  { key: "estimate_title", label: "제목" },
  { key: "estimate_number", label: "견적번호" },
  { key: "estimate_type", label: "견적유형" },
  { key: "written_date", label: "작성일", type: "date" },
  { key: "validity_period", label: "유효기간", type: "datetime-local" },
  { key: "tax_rate", label: "세율", type: "number" },
  { key: "deposit_pct", label: "착수금 %", type: "number" },
  { key: "deposit_due_date", label: "착수금 납부예정일", type: "date" },
  { key: "progress_pct", label: "중도금 %", type: "number" },
  { key: "progress_due_date", label: "중도금 납부예정일", type: "date" },
  { key: "balance_pct", label: "잔금 %", type: "number" },
  { key: "balance_due_date", label: "잔금 납부예정일", type: "date" },
  { key: "discount_type", label: "할인" },
  { key: "discount_rate", label: "할인율", type: "number" },
  { key: "discount_amount", label: "할인액", type: "number" },
  { key: "discount_description", label: "할인 사유" },
  { key: "project_type", label: "프로젝트 유형" },
  { key: "contract_date", label: "계약일", type: "date" },
  { key: "contract_termination_date", label: "계약종료일", type: "date" },
  { key: "contract_period_range", label: "계약기간" },
  { key: "contract_deposit", label: "계약금", type: "number" },
  { key: "point", label: "월 유지보수 포인트", type: "number" },
  { key: "dev_subscription_plan", label: "개발구독 플랜" },
  { key: "maint_subscription_plan", label: "유지보수구독 요금제" },
  { key: "maint_hosting_type", label: "호스팅 구분" },
  { key: "maint_hosting_provider", label: "외부 호스팅 업체" },
  { key: "maint_hosting_start_date", label: "호스팅 시작일", type: "date" },
  { key: "maint_hosting_end_date", label: "호스팅 종료일", type: "date" },
  { key: "free_maint_months", label: "무상 유지보수 개월", type: "number" },
  { key: "free_maint_scope", label: "무상 유지보수 범위" },
  { key: "payment_terms", label: "지불조건", type: "textarea" },
  { key: "delivery_terms", label: "납품조건", type: "textarea" },
  { key: "estimate_content", label: "내용(비고)", type: "textarea" },
  { key: "requirements", label: "요구사항", type: "textarea" },
];

type Row = {
  key: string;
  seq?: number;
  category: string;
  item_name: string;
  specification: string;
  quantity: string;
  unit: string;
  unit_price: string;
  is_separate: boolean;
  remarks: string;
};

let rowSeq = 0;
const newRow = (p: Partial<Row> = {}): Row => ({
  key: `n${++rowSeq}`, category: "", item_name: "", specification: "", quantity: "1", unit: "식", unit_price: "", is_separate: false, remarks: "", ...p,
});
const n = (v: string) => Number(String(v).replace(/,/g, "")) || 0;
const won = (v: number) => `${v.toLocaleString("ko-KR")}원`;

/** 금액 계산 — 서버 services/estimate_calc.amounts 와 같다(별도 항목 0, 세율 비면 0). */
function calc(rows: Row[], v: Record<string, string>) {
  const subtotal = rows.reduce((s, r) => s + (r.is_separate ? 0 : n(r.quantity) * n(r.unit_price)), 0);
  let discount = 0;
  if (v.discount_type === "1" && v.discount_rate) discount = Math.trunc(subtotal * (n(v.discount_rate) / 100));
  else if (v.discount_type === "2" && v.discount_amount) discount = n(v.discount_amount);
  const discounted = subtotal - discount;
  const tax = v.tax_rate ? Math.trunc(discounted * (n(v.tax_rate) / 100)) : 0;
  return { subtotal, discount, discounted, tax, total: discounted + tax };
}

/**
 * 견적서 작성·수정 화면. 기본 정보 → 항목(표에서 바로 입력) → 할인·세율 → 지불 일정 → 계약 전환 정보 → 조건·내용.
 * 오른쪽(모바일은 아래) 요약에서 금액이 바로 계산되고, 저장하면 견적과 항목을 함께 저장한다.
 */
export function EstimateEditor({ detail, onDone }: { detail: EstimateDetail | null; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const mutate = useSalesMutation();
  const { data: companies } = useLookupCompanies();
  const initialValues = useMemo(() => (detail ? toValues(FIELDS, detail) : { tax_rate: "10", written_date: new Date().toISOString().slice(0, 10) }), [detail]);
  const [v, setV] = useState<Record<string, string>>(initialValues);
  const [rows, setRows] = useState<Row[]>(() =>
    detail?.items.length
      ? detail.items.map((i) => newRow({ seq: i.seq, category: i.category ?? "", item_name: i.item_name, specification: i.specification ?? "", quantity: String(i.quantity), unit: i.unit || "식", unit_price: String(i.unit_price), is_separate: i.is_separate, remarks: i.remarks ?? "" }))
      : [newRow()],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const lastInput = useRef<HTMLInputElement | null>(null);
  useUnsavedGuard(dirty);

  useEffect(() => {
    if (!detail) staffApi.get("/managed/estimates/next-number").then((r) => setV((s) => ({ ...s, estimate_number: s.estimate_number || r.data.estimate_number })));
  }, [detail]);

  const set = (k: string, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    setDirty(true);
  };
  const setRow = (key: string, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addRow = (after?: number, copy?: Row) => {
    setRows((rs) => {
      const row = copy ? newRow({ ...copy, seq: undefined, key: undefined as unknown as string }) : newRow({ category: rs[rs.length - 1]?.category ?? "" });
      const at = after === undefined ? rs.length : after + 1;
      return [...rs.slice(0, at), { ...row, key: `n${++rowSeq}` }, ...rs.slice(at)];
    });
    setDirty(true);
    setTimeout(() => lastInput.current?.focus(), 0);
  };
  const move = (i: number, d: -1 | 1) => {
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const out = [...rs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
    setDirty(true);
  };

  // AI 제안 반영 — 빈 행만 있으면 대체와 같다. 요구사항 메모도 같이 남긴다.
  const applyAi = (items: AiItem[], mode: "append" | "replace", requirements: string) => {
    const added = items.map((i) => newRow({ category: i.category, item_name: i.item_name, specification: i.specification, quantity: String(i.quantity), unit: i.unit || "식", unit_price: String(i.unit_price) }));
    setRows((rs) => {
      const kept = mode === "replace" ? [] : rs.filter((r) => r.item_name.trim() || n(r.unit_price));
      return [...kept, ...added];
    });
    if (requirements.trim() && requirements !== (v.requirements ?? "")) setV((s) => ({ ...s, requirements }));
    setDirty(true);
    toast("success", `AI 항목 ${added.length}개를 넣었습니다. 확인 후 저장하세요.`);
  };

  const sums = calc(rows, v);
  const usedRows = rows.filter((r) => r.item_name.trim() || n(r.unit_price));
  const pctTotal = ["deposit_pct", "progress_pct", "balance_pct"].reduce((s, k) => s + n(v[k] ?? ""), 0);
  const anyPct = ["deposit_pct", "progress_pct", "balance_pct"].some((k) => (v[k] ?? "") !== "");
  const errors = {
    company: !v.company_id,
    title: !(v.estimate_title ?? "").trim(),
    items: usedRows.some((r) => !r.item_name.trim()),
    pct: anyPct && pctTotal !== 100,
  };
  const blocking = errors.company || errors.title || errors.items;

  const save = async () => {
    setShowErrors(true);
    if (blocking) {
      toast("warning", errors.items ? "항목명이 빈 행이 있습니다." : "업체와 제목을 입력하세요.");
      return;
    }
    const items = usedRows.map((r) => ({
      seq: r.seq ?? null, category: r.category || null, item_name: r.item_name.trim(), specification: r.specification || null,
      quantity: n(r.quantity), unit: r.unit || "식", unit_price: n(r.unit_price), is_separate: r.is_separate, remarks: r.remarks || null,
    }));
    setSaving(true);
    try {
      const body = toPayload(FIELDS, v);
      let seq = detail?.seq;
      if (seq) await mutate.mutateAsync({ method: "patch", url: `/estimates/${seq}`, body });
      else seq = (await mutate.mutateAsync({ url: "/estimates", body })).seq as number;
      try {
        await mutate.mutateAsync({ method: "put", url: `/estimates/${seq}/items`, body: { items } });
      } catch (err) {
        toast("error", `견적서는 저장했지만 항목 저장에 실패했습니다: ${apiErrorDetail(err, "")}`);
        setDirty(false);
        if (!detail) router.replace(`/managed/estimates/${seq}`);
        return;
      }
      setDirty(false);
      toast("success", detail ? "저장했습니다." : "견적서를 만들었습니다.");
      if (detail) onDone();
      else router.replace(`/managed/estimates/${seq}`);
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    if (dirty && !confirm("저장하지 않은 변경이 있습니다. 나갈까요?")) return;
    if (detail) onDone();
    else router.push("/managed/estimates");
  };

  const err = (on: boolean) => showErrors && on;
  const pt = v.project_type ?? "";

  return (
    <>
      <PageActions>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={cancel}>취소</Button>
        <Button size="sm" className="rounded-xl" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}저장
        </Button>
      </PageActions>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <FormSection title="기본 정보">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="업체 *" className="lg:col-span-1">
                <select className={cn(selectClass, err(errors.company) && "border-red-400")} value={v.company_id ?? ""} onChange={(e) => set("company_id", e.target.value)}>
                  <option value="">업체 선택</option>
                  {companies?.items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="제목 *" className="sm:col-span-2">
                <Input className={cn("rounded-xl", err(errors.title) && "border-red-400")} value={v.estimate_title ?? ""} onChange={(e) => set("estimate_title", e.target.value)} placeholder="예: 2026 OO 홈페이지 리뉴얼" />
              </Field>
              <Field label="견적번호"><Input className="rounded-xl" value={v.estimate_number ?? ""} onChange={(e) => set("estimate_number", e.target.value)} /></Field>
              <Field label="견적유형"><Input className="rounded-xl" value={v.estimate_type ?? ""} onChange={(e) => set("estimate_type", e.target.value)} placeholder="예: 웹사이트 구축" /></Field>
              <Field label="작성일"><Input type="date" className="rounded-xl" value={v.written_date ?? ""} onChange={(e) => set("written_date", e.target.value)} /></Field>
              <Field label="유효기간">
                <div className="flex gap-1">
                  <Input type="date" className="rounded-xl" value={(v.validity_period ?? "").slice(0, 10)} onChange={(e) => set("validity_period", e.target.value ? `${e.target.value}T23:59` : "")} />
                  {[14, 30].map((d) => (
                    <Button key={d} type="button" size="sm" variant="outline" className="h-10 shrink-0 rounded-xl px-2 text-xs"
                      onClick={() => { const x = new Date(v.written_date || Date.now()); x.setDate(x.getDate() + d); set("validity_period", `${x.toISOString().slice(0, 10)}T23:59`); }}>
                      +{d}일
                    </Button>
                  ))}
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection
            title={`견적 항목 (${usedRows.length})`}
            description="표에서 바로 입력합니다. Enter 로 다음 칸, 마지막 칸에서 Enter 면 새 행. '별도'는 합계에서 빠집니다."
            aside={
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" className="rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50" onClick={() => setAiOpen(true)}><Sparkles className="mr-1 h-4 w-4" /> AI 제안</Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => addRow()}><Plus className="mr-1 h-4 w-4" /> 행 추가</Button>
              </div>
            }
          >
            {err(errors.items) && <p className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3.5 w-3.5" /> 항목명이 빈 행이 있습니다(금액만 있고 이름이 없음).</p>}
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <colgroup>
                  <col className="w-24" /><col /><col className="w-16" /><col className="w-[88px]" /><col className="w-28" /><col className="w-24" /><col className="w-10" /><col className="w-[104px]" />
                </colgroup>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-2 text-left font-medium">분류</th>
                    <th className="py-2 pr-2 text-left font-medium">항목명 * / 규격</th>
                    <th className="py-2 pr-2 text-right font-medium">수량</th>
                    <th className="py-2 pr-2 text-left font-medium">단위</th>
                    <th className="py-2 pr-2 text-right font-medium">단가</th>
                    <th className="py-2 pr-2 text-right font-medium">금액</th>
                    <th className="py-2 text-center font-medium">별도</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y" onKeyDown={(e) => {
                  // Enter = 다음 입력칸, 행의 마지막 입력칸이면 새 행
                  const t = e.target as HTMLElement;
                  if (e.key !== "Enter" || t.tagName !== "INPUT" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  const inputs = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>("input[data-cell]"));
                  const i = inputs.indexOf(t as HTMLInputElement);
                  if (i === inputs.length - 1) addRow();
                  else inputs[i + 1]?.focus();
                }}>
                  {rows.map((r, i) => {
                    const amount = n(r.quantity) * n(r.unit_price);
                    const bad = err(!r.item_name.trim() && !!n(r.unit_price));
                    return (
                      <tr key={r.key} className={cn("align-top", r.is_separate && "bg-muted/30")}>
                        <td className="py-1.5 pr-2"><Input data-cell className="h-9 rounded-lg" value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value })} placeholder="개발" /></td>
                        <td className="space-y-1 py-1.5 pr-2">
                          <Input data-cell ref={i === rows.length - 1 ? lastInput : undefined} className={cn("h-9 rounded-lg", bad && "border-red-400")} value={r.item_name} onChange={(e) => setRow(r.key, { item_name: e.target.value })} placeholder="항목명" />
                          <Input data-cell className="h-8 rounded-lg text-xs text-muted-foreground" value={r.specification} onChange={(e) => setRow(r.key, { specification: e.target.value })} placeholder="규격·설명(선택)" />
                        </td>
                        <td className="py-1.5 pr-2"><Input data-cell inputMode="numeric" className="h-9 rounded-lg text-right tabular-nums" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value.replace(/[^\d]/g, "") })} /></td>
                        <td className="py-1.5 pr-2">
                          <Input data-cell list="estimate-units" className="h-9 rounded-lg" value={r.unit} onChange={(e) => setRow(r.key, { unit: e.target.value })} />
                        </td>
                        <td className="py-1.5 pr-2"><MoneyInput data-cell className="h-9 rounded-lg" suffix="" value={r.unit_price} onChange={(d) => setRow(r.key, { unit_price: d })} /></td>
                        <td className={cn("py-1.5 pr-2 pt-3.5 text-right tabular-nums", r.is_separate && "text-muted-foreground line-through")}>{amount.toLocaleString("ko-KR")}</td>
                        <td className="py-1.5 pt-3 text-center"><Checkbox checked={r.is_separate} onCheckedChange={(c) => setRow(r.key, { is_separate: c === true })} aria-label="금액 별도" /></td>
                        <td className="py-1.5">
                          <div className="flex justify-end">
                            <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="위로"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="아래로"><ArrowDown className="h-3.5 w-3.5" /></button>
                            <button type="button" className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => addRow(i, r)} aria-label="복제" title="복제"><Copy className="h-3.5 w-3.5" /></button>
                            <button type="button" className="rounded p-1.5 text-red-500 hover:bg-red-50" onClick={() => { setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [newRow()])); setDirty(true); }} aria-label="삭제"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <datalist id="estimate-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            </div>
            <button type="button" onClick={() => addRow()} className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed py-2 text-sm text-muted-foreground hover:bg-muted/40">
              <Plus className="h-4 w-4" /> 행 추가
            </button>
            {aiOpen && (
              <EstimateAiDialog
                open
                onClose={() => setAiOpen(false)}
                context={{
                  requirements: v.requirements ?? "", estimate_title: v.estimate_title ?? "", estimate_type: v.estimate_type ?? "", project_type: v.project_type ?? "",
                  company_name: companies?.items.find((c) => String(c.id) === v.company_id)?.name ?? "",
                }}
                onApply={applyAi}
              />
            )}
          </FormSection>

          <FormSection title="할인·세율">
            <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
              <Field label="할인">
                <div className="flex rounded-xl border p-0.5">
                  {([["", "없음"], ["1", "정률(%)"], ["2", "정액(원)"]] as const).map(([val, label]) => (
                    <button key={val} type="button" onClick={() => set("discount_type", val)}
                      className={cn("rounded-lg px-3 py-1.5 text-sm", (v.discount_type ?? "") === val ? "bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted")}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              {v.discount_type === "1" && (
                <Field label="할인율(%)"><Input inputMode="decimal" className="rounded-xl text-right" value={v.discount_rate ?? ""} onChange={(e) => set("discount_rate", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
              )}
              {v.discount_type === "2" && (
                <Field label="할인액"><MoneyInput value={v.discount_amount ?? ""} onChange={(d) => set("discount_amount", d)} /></Field>
              )}
              {v.discount_type ? (
                <Field label="할인 사유"><Input className="rounded-xl" value={v.discount_description ?? ""} onChange={(e) => set("discount_description", e.target.value)} /></Field>
              ) : <div className="hidden sm:block" />}
              <Field label="부가세율(%)">
                <div className="flex gap-1">
                  <Input inputMode="decimal" className="w-24 rounded-xl text-right" value={v.tax_rate ?? ""} onChange={(e) => set("tax_rate", e.target.value.replace(/[^\d.]/g, ""))} />
                  <Button type="button" size="sm" variant="outline" className="h-10 rounded-xl text-xs" onClick={() => set("tax_rate", "10")}>10%</Button>
                  <Button type="button" size="sm" variant="outline" className="h-10 rounded-xl text-xs" onClick={() => set("tax_rate", "0")}>면세</Button>
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection title="지불 일정" description="비율 합계는 100% 여야 합니다. 계약전환 때 이 비율로 납부 일정이 만들어집니다.">
            <div className="space-y-2">
              {([["deposit", "착수금"], ["progress", "중도금"], ["balance", "잔금"]] as const).map(([k, label]) => (
                <div key={k} className="grid grid-cols-[3.5rem_5.5rem_minmax(0,1fr)] items-center gap-2 text-sm sm:grid-cols-[4rem_6rem_1fr_auto]">
                  <span className="text-muted-foreground">{label}</span>
                  <div className="relative">
                    <Input inputMode="numeric" className="rounded-xl pr-7 text-right" value={v[`${k}_pct`] ?? ""} onChange={(e) => set(`${k}_pct`, e.target.value.replace(/[^\d]/g, ""))} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </div>
                  <Input type="date" className="rounded-xl" value={v[`${k}_due_date`] ?? ""} onChange={(e) => set(`${k}_due_date`, e.target.value)} />
                  <span className="hidden w-28 text-right tabular-nums text-muted-foreground sm:block">{v[`${k}_pct`] ? won(Math.round((sums.total * n(v[`${k}_pct`])) / 100)) : "-"}</span>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                <span className={cn(anyPct && pctTotal !== 100 ? "text-red-600" : "text-muted-foreground")}>합계 {pctTotal}%{anyPct && pctTotal !== 100 && " — 100% 가 아닙니다"}</span>
                <div className="flex-1" />
                {([["선금 100%", [0, 0, 100]], ["50:50", [50, 0, 50]], ["30:40:30", [30, 40, 30]]] as const).map(([label, [a, b, c]]) => (
                  <Button key={label} type="button" size="sm" variant="outline" className="h-7 rounded-lg text-xs"
                    onClick={() => { setV((s) => ({ ...s, deposit_pct: a ? String(a) : "", progress_pct: b ? String(b) : "", balance_pct: c ? String(c) : "" })); setDirty(true); }}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </FormSection>

          <FormSection title="조건·내용" description="견적서 PDF 와 고객 화면에 나갑니다.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="지불조건"><Textarea className="min-h-20 rounded-xl" value={v.payment_terms ?? ""} onChange={(e) => set("payment_terms", e.target.value)} placeholder="예: 착수금 50%, 잔금 50%" /></Field>
              <Field label="납품조건"><Textarea className="min-h-20 rounded-xl" value={v.delivery_terms ?? ""} onChange={(e) => set("delivery_terms", e.target.value)} placeholder="예: 계약 후 8주" /></Field>
              <Field label="내용(비고)" className="sm:col-span-2"><Textarea className="min-h-24 rounded-xl" value={v.estimate_content ?? ""} onChange={(e) => set("estimate_content", e.target.value)} /></Field>
              <Field label="요구사항(내부 메모)" className="sm:col-span-2"><Textarea className="min-h-24 rounded-xl" value={v.requirements ?? ""} onChange={(e) => set("requirements", e.target.value)} /></Field>
            </div>
          </FormSection>

          <FormSection title="계약 전환 정보" description="계약전환 때 프로젝트·포인트·구독을 만들 때 씁니다. 견적서 PDF 에는 나가지 않습니다." collapsible defaultOpen={!!pt}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="프로젝트 유형">
                <select className={selectClass} value={pt} onChange={(e) => set("project_type", e.target.value)}>
                  <option value="">선택 안 함</option>
                  {PROJECT_TYPES.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                </select>
              </Field>
              <Field label="계약일"><Input type="date" className="rounded-xl" value={v.contract_date ?? ""} onChange={(e) => set("contract_date", e.target.value)} /></Field>
              <Field label="계약종료일"><Input type="date" className="rounded-xl" value={v.contract_termination_date ?? ""} onChange={(e) => set("contract_termination_date", e.target.value)} /></Field>
              <Field label="계약기간"><Input className="rounded-xl" value={v.contract_period_range ?? ""} onChange={(e) => set("contract_period_range", e.target.value)} placeholder="예: 12개월" /></Field>
              <Field label="계약금"><MoneyInput value={v.contract_deposit ?? ""} onChange={(d) => set("contract_deposit", d)} /></Field>
              {(pt === "9" || pt === "10" || pt === "15") && (
                <Field label="월 유지보수 포인트"><Input inputMode="numeric" className="rounded-xl text-right" value={v.point ?? ""} onChange={(e) => set("point", e.target.value.replace(/[^\d]/g, ""))} /></Field>
              )}
              {pt === "13" && (
                <Field label="개발구독 플랜">
                  <select className={selectClass} value={v.dev_subscription_plan ?? ""} onChange={(e) => set("dev_subscription_plan", e.target.value)}>
                    <option value="">선택</option><option value="starter">STARTER</option><option value="growth">GROWTH</option><option value="scale">SCALE</option>
                  </select>
                </Field>
              )}
              {pt === "15" && (
                <>
                  <Field label="유지보수구독 요금제 *">
                    <select className={selectClass} value={v.maint_subscription_plan ?? ""} onChange={(e) => set("maint_subscription_plan", e.target.value)}>
                      <option value="">선택</option><option value="basic">BASIC</option><option value="growth">GROWTH</option><option value="business">BUSINESS</option>
                    </select>
                  </Field>
                  <Field label="호스팅 구분">
                    <select className={selectClass} value={v.maint_hosting_type ?? ""} onChange={(e) => set("maint_hosting_type", e.target.value)}>
                      <option value="">선택</option><option value="I">한결랩 호스팅</option><option value="E">외부 호스팅</option>
                    </select>
                  </Field>
                  {v.maint_hosting_type === "E" && (
                    <Field label="외부 호스팅 업체"><Input className="rounded-xl" value={v.maint_hosting_provider ?? ""} onChange={(e) => set("maint_hosting_provider", e.target.value)} /></Field>
                  )}
                  <Field label="호스팅 시작일"><Input type="date" className="rounded-xl" value={v.maint_hosting_start_date ?? ""} onChange={(e) => set("maint_hosting_start_date", e.target.value)} /></Field>
                  <Field label="호스팅 종료일"><Input type="date" className="rounded-xl" value={v.maint_hosting_end_date ?? ""} onChange={(e) => set("maint_hosting_end_date", e.target.value)} /></Field>
                </>
              )}
              <Field label="무상 유지보수(개월)"><Input inputMode="numeric" className="rounded-xl text-right" value={v.free_maint_months ?? ""} onChange={(e) => set("free_maint_months", e.target.value.replace(/[^\d]/g, ""))} /></Field>
              {(v.free_maint_months ?? "") !== "" && (
                <Field label="무상 유지보수 범위" className="sm:col-span-2"><Input className="rounded-xl" value={v.free_maint_scope ?? ""} onChange={(e) => set("free_maint_scope", e.target.value)} /></Field>
              )}
            </div>
          </FormSection>
        </div>

        {/* 요약 — 큰 화면은 오른쪽 고정 */}
        <div className="h-fit space-y-3 lg:sticky lg:top-20">
          <Card className="rounded-2xl">
            <CardContent className="space-y-2 p-5">
              <h2 className="pb-1 text-sm font-semibold">금액 요약</h2>
              <SummaryRow label={`소계 (${usedRows.filter((r) => !r.is_separate).length}개 항목)`} value={won(sums.subtotal)} />
              {sums.discount > 0 && <SummaryRow label="할인" value={`-${won(sums.discount)}`} tone="text-red-600" />}
              {sums.discount > 0 && <SummaryRow label="공급가" value={won(sums.discounted)} />}
              <SummaryRow label={`부가세 ${v.tax_rate ? `${v.tax_rate}%` : "없음"}`} value={won(sums.tax)} />
              <SummaryRow label="총액" value={won(sums.total)} strong tone="text-indigo-700" />
              {usedRows.some((r) => r.is_separate) && <p className="text-[11px] text-muted-foreground">별도 항목 {usedRows.filter((r) => r.is_separate).length}개는 합계에서 빠집니다.</p>}
            </CardContent>
          </Card>
          <Card className="rounded-2xl">
            <CardContent className="space-y-2 p-5 text-xs">
              {[
                [errors.company, "업체 선택"],
                [errors.title, "제목 입력"],
                [usedRows.length === 0, "항목 1개 이상(없어도 저장 가능)"],
                [errors.pct, "지불 비율 합계 100%"],
              ].map(([bad, label]) => (
                <p key={label as string} className={cn("flex items-center gap-2", bad ? "text-amber-700" : "text-emerald-700")}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", bad ? "bg-amber-500" : "bg-emerald-500")} /> {label as string}
                </p>
              ))}
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={cancel}>취소</Button>
            <Button className="flex-1 rounded-xl" onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{detail ? "저장" : "견적서 만들기"}
            </Button>
          </div>
          {dirty && <p className="text-center text-[11px] text-amber-700">저장하지 않은 변경이 있습니다</p>}
        </div>
      </div>
    </>
  );
}
