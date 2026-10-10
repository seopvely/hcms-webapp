"use client";
import { useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { BillingShell, num, useBillingWritable } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Dict = Record<string, unknown>;
type Month = Dict & { month: number; is_past: boolean; is_current: boolean; is_future: boolean; purchase_target_by_cat: Record<string, number>; purchase_actual_by_cat: Record<string, number> };
type Plan = { year: number; months: Month[]; totals: Dict; categories: string[]; receivable_excluded: { count: number; amount: number; amount_vat: number; months: number } };

const ROWS: [string, string, string?][] = [
  ["sales_target", "매출 목표", "edit"], ["sales_plan", "매출 계획(알람·구독)"], ["receivable", "미수금 회수 예정"], ["sales_actual", "매출 실적"],
  ["sales_expected", "매출 예상"], ["sales_achievement", "달성률(%)", "rate"], ["pipeline", "영업 파이프라인(가중)"],
  ["purchase_target_base", "매입 목표(분류 외)", "edit"], ["purchase_target", "매입 목표 합계"], ["purchase_plan", "매입 계획(알람)"], ["outsourcing_plan", "외주 잔액"],
  ["purchase_actual", "매입 실적(계산서)"], ["purchase_expected", "매입 예상"], ["purchase_rate", "집행률(%)", "rate"],
  ["profit_before_tithe", "이익(십일조 전)"], ["tithe", "십일조"], ["profit", "이익"],
];

// 매출·매입계획 (공급가 기준) — cms plan_utils.build_sales_plan 과 같은 숫자
export default function SalesPlanPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const [year, setYear] = useState(new Date().getFullYear());
  const [sel, setSel] = useState<number | null>(null);
  const writable = useBillingWritable();
  const { data, isLoading } = useStaffGet<Plan>(["billing", "sales-plan"], "/billing/sales-plan", { year });
  const write = useStaffWrite(["billing"]);
  useEffect(() => {
    setPageTitle("매출·매입계획");
  }, [setPageTitle]);
  const saveBudget = async (month: number, kind: string, category: string, amount: string) => {
    try {
      await write.mutateAsync({ url: "/billing/sales-plan/budget", body: { year, month, kind, category, amount } });
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const prefill = async (kind: string) => {
    if (!window.confirm(`${kind === "sales" ? "매출" : "매입(분류별)"} 목표를 최근 3개월 평균으로 미래 달에 채웁니다. 기존 값은 유지합니다.`)) return;
    try {
      const r = await write.mutateAsync({ url: "/billing/sales-plan/prefill", body: { year, kind } });
      toast("success", `생성 ${r.created} · 유지 ${r.skipped} (${r.period})`);
    } catch (err) {
      toast("error", apiErrorDetail(err, "채우기에 실패했습니다."));
    }
  };
  const m = sel ? data?.months[sel - 1] : null;
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/sales-plan/">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setYear(year - 1)}>‹</Button>
          <span className="w-16 text-center font-semibold">{year}년</span>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setYear(year + 1)}>›</Button>
          <span className="text-xs text-muted-foreground">공급가 기준 · 셀을 눌러 월 상세</span>
          <div className="flex-1" />
          {writable && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => prefill("sales")}><Wand2 className="mr-1 h-4 w-4" /> 매출 목표 채우기</Button>}
          {writable && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => prefill("purchase")}><Wand2 className="mr-1 h-4 w-4" /> 매입 목표 채우기</Button>}
        </div>
        {data && data.receivable_excluded.count > 0 && (
          <p className="text-xs text-muted-foreground">예정일이 {data.receivable_excluded.months}개월 넘게 지난 미수금 {data.receivable_excluded.count}건 · {num(data.receivable_excluded.amount_vat)}원(부가세 포함)은 계획에서 뺐습니다.</p>
        )}
        {isLoading || !data ? <TableSkeleton /> : (
          <Card className="overflow-x-auto rounded-2xl"><CardContent className="p-0">
            <table className="w-full min-w-[1100px] text-xs">
              <thead><tr className="border-b bg-muted/40">
                <th className="sticky left-0 bg-muted/40 px-2 py-2 text-left">항목</th>
                {data.months.map((r) => <th key={r.month} className={`px-2 py-2 text-right ${r.is_current ? "text-blue-600" : ""}`}><button onClick={() => setSel(sel === r.month ? null : r.month)} className="underline-offset-2 hover:underline">{r.month}월</button></th>)}
                <th className="px-2 py-2 text-right">합계</th>
              </tr></thead>
              <tbody>
                {ROWS.map(([k, label, kind]) => (
                  <tr key={k} className={`border-b ${k === "profit" ? "font-bold" : ""}`}>
                    <td className="sticky left-0 bg-background px-2 py-1 whitespace-nowrap">{label}</td>
                    {data.months.map((r) => (
                      <td key={r.month} className={`px-1 py-1 text-right ${r.is_past ? "text-muted-foreground" : ""} ${sel === r.month ? "bg-blue-50" : ""}`}>
                        {kind === "edit" && writable ? (
                          <Input className="h-7 w-24 rounded-md px-1 text-right text-xs" defaultValue={(r[k] as number) || ""} key={`${k}-${r.month}-${r[k]}`}
                            onBlur={(e) => { if (String((r[k] as number) || "") !== e.target.value.replace(/,/g, "")) saveBudget(r.month, k === "sales_target" ? "sales" : "purchase", "", e.target.value); }} />
                        ) : kind === "rate" ? (r[k] === null ? "-" : `${r[k]}`) : num(r[k])}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right">{kind === "rate" ? (data.totals[k] ?? "-") as string : kind === "edit" ? num(data.totals[k === "sales_target" ? "sales_target" : "purchase_target_base"]) : num(data.totals[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
        )}
        {m && data && <MonthDetail m={m} categories={data.categories} writable={writable} onBudget={(cat, amount) => saveBudget(m.month, "purchase", cat, amount)} />}
      </BillingShell>
    </PageTransition>
  );
}

function MonthDetail({ m, categories, writable, onBudget }: { m: Month; categories: string[]; writable: boolean; onBudget: (cat: string, amount: string) => void }) {
  const list = (title: string, rows: Dict[], render: (r: Dict) => React.ReactNode) => (
    <div>
      <p className="mb-1 text-sm font-semibold">{title} <span className="text-muted-foreground">{rows.length}건</span></p>
      <div className="divide-y rounded-xl border">{rows.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">없음</p> : rows.map((r, i) => <div key={i} className="flex flex-wrap gap-2 px-3 py-1.5 text-xs">{render(r)}</div>)}</div>
    </div>
  );
  return (
    <Card className="rounded-2xl"><CardContent className="grid gap-4 pt-5 pb-5 lg:grid-cols-2">
      {list("매출 계획", m.sales_items as Dict[], (r) => <><span className="w-20">{fmtDate(r.date as string)}</span><span className="w-20 text-muted-foreground">{r.source_label as string}</span><span className="flex-1 truncate">{r.company as string} {r.title as string}</span><span>{num(r.amount)}</span>{r.paid ? <span className="text-emerald-600">입금</span> : null}</>)}
      {list("매출 실적", m.sales_actual_items as Dict[], (r) => <><span className="w-20">{fmtDate(r.date as string)}</span><span className="w-12 text-muted-foreground">{r.field as string}</span><span className="flex-1 truncate">{r.company as string} {r.project as string}</span><span>{num(r.amount)}</span></>)}
      {list("미수금 회수 예정", m.receivable_items as Dict[], (r) => <><span className="w-20">{fmtDate(r.expected_date as string)}</span><span className="flex-1 truncate">{r.company as string} {r.project as string} · {r.label as string}{r.carried ? " (이월)" : ""}</span><span>{num(r.amount)}</span></>)}
      {list("영업 파이프라인", m.pipeline_items as Dict[], (r) => <><span className="w-20">{fmtDate(r.date as string)}</span><span className="flex-1 truncate">{r.company as string} {r.title as string} · {r.weight as number}%</span><span>{num(r.weighted)} / {num(r.amount)}</span></>)}
      {list("매입 계획(알람)", m.purchase_items as Dict[], (r) => <><span className="w-20">{fmtDate(r.date as string)}</span><span className="flex-1 truncate">{r.title as string} · {r.cycle as string}{r.tithe_checked ? " · 십일조 매입" : ""}</span><span>{num(r.amount)}</span>{r.realized ? <span className="text-emerald-600">계산서 {num(r.realized_amount)}</span> : null}</>)}
      {list("매입 계산서", m.purchase_invoices as Dict[], (r) => <><span className="w-20">{fmtDate(r.date as string)}</span><span className="w-24 text-muted-foreground">{r.category as string}</span><span className="flex-1 truncate">{r.supplier as string} {r.item as string}</span><span>{num(r.amount)}</span></>)}
      {list("외주 잔액", m.outsourcing_items as Dict[], (r) => <><span className="w-20">{fmtDate(r.date as string)}</span><span className="flex-1 truncate">{r.vendor as string} {r.project as string}{r.overdue ? " (지연)" : ""}</span><span>{num(r.remaining)}</span></>)}
      <div>
        <p className="mb-1 text-sm font-semibold">분류별 매입 목표 / 실적</p>
        <div className="divide-y rounded-xl border">
          {categories.map((c) => (
            <div key={c} className="flex items-center gap-2 px-3 py-1 text-xs">
              <span className="flex-1">{c}</span>
              {writable ? (
                <Input className="h-7 w-28 rounded-md px-1 text-right text-xs" defaultValue={m.purchase_target_by_cat[c] || ""} key={`${m.month}-${c}-${m.purchase_target_by_cat[c]}`}
                  onBlur={(e) => { if (String(m.purchase_target_by_cat[c] || "") !== e.target.value.replace(/,/g, "")) onBudget(c, e.target.value); }} />
              ) : <span className="w-28 text-right">{num(m.purchase_target_by_cat[c] || 0)}</span>}
              <span className={`w-28 text-right ${m.purchase_target_by_cat[c] && (m.purchase_actual_by_cat[c] || 0) >= m.purchase_target_by_cat[c] ? "text-red-600" : ""}`}>{num(m.purchase_actual_by_cat[c] || 0)}</span>
            </div>
          ))}
        </div>
      </div>
    </CardContent></Card>
  );
}
