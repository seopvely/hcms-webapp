"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { LoadFailed } from "@/components/managed/load-failed";
import { BillingShell, num, won, useBillingWritable } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type PL = { sales_actual: number; purchase_actual: number; purchase_actual_by_cat: Record<string, number>; outsourcing_paid: number; cost: number; tithe: number; profit: number };
type Cash = { in: number; out_purchase: number; out_outsourcing: number; net: number; cumulative: number; balance_est: number | null; balance_from: string | null };
type Month = { month: number; is_past: boolean; is_current: boolean; is_future: boolean; purchase_missing: boolean; pl: PL; cash: Cash; expected: { sales: number; purchase: number; profit: number } | null };
type Snapshot = { id: number; as_of_date: string; amount: number; memo: string };
type Data = {
  year: number; months: Month[]; categories: string[]; purchase_data_start: string | null;
  totals: { pl: Record<string, number>; pl_by_cat: Record<string, number>; cash: Record<string, number> };
  latest_balance: { amount: number; from: string } | null; snapshots: Snapshot[];
};

const PL_ROWS: [keyof PL, string][] = [["sales_actual", "매출 실적"], ["purchase_actual", "매입 실적(계산서)"], ["outsourcing_paid", "외주 지급"], ["tithe", "십일조"], ["profit", "이익"]];
const CASH_ROWS: [keyof Cash, string][] = [["in", "유입(입금)"], ["out_purchase", "매입 지출"], ["out_outsourcing", "외주 지급"], ["net", "순흐름"], ["cumulative", "연초 대비 누적"], ["balance_est", "추정 잔액"]];

const signCls = (v: number | null | undefined) => (v === null || v === undefined ? "" : v < 0 ? "text-red-600" : "");

// 월별 손익(공급가) · 자금흐름(부가세 포함). 손익의 매출·매입 실적은 매출·매입계획과 같은 숫자에 외주 지급을 더한다.
export default function PlCashflowPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [year, setYear] = useState(new Date().getFullYear());
  const [openCat, setOpenCat] = useState(false);
  const { data, isLoading, error } = useStaffGet<Data>(["billing", "pl-cashflow"], "/billing/pl-cashflow", { year });
  useEffect(() => {
    setPageTitle("월별 손익·자금흐름");
  }, [setPageTitle]);
  const cats = Object.keys(data?.totals.pl_by_cat ?? {});
  const maxNet = Math.max(...(data?.months.map((r) => Math.abs(r.cash.net)) ?? [1]), 1);
  const head = (label: string) => (
    <thead><tr className="border-b bg-muted/40">
      <th className="sticky left-0 bg-muted/40 px-2 py-2 text-left">{label}</th>
      {data!.months.map((r) => (
        <th key={r.month} className={`px-2 py-2 text-right ${r.is_current ? "text-blue-600" : ""}`}>
          {r.month}월
          {r.purchase_missing && !r.is_future && <span className="block text-[10px] font-normal text-amber-600">매입 데이터 없음</span>}
          {!r.is_past && <span className="block text-[10px] font-normal text-muted-foreground">{r.is_current ? "진행 중" : "예정"}</span>}
        </th>
      ))}
      <th className="px-2 py-2 text-right">합계</th>
    </tr></thead>
  );
  const cellCls = (r: Month) => `px-2 py-1 text-right ${r.purchase_missing && !r.is_future ? "opacity-50" : ""} ${r.is_future ? "text-muted-foreground" : ""}`;
  return (
    <PageTransition>
      <BillingShell>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setYear(year - 1)}>‹</Button>
          <span className="w-16 text-center font-semibold">{year}년</span>
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setYear(year + 1)}>›</Button>
          {data?.purchase_data_start && <span className="text-xs text-muted-foreground">매입 실적은 {data.purchase_data_start.slice(0, 7)}부터 집계됩니다.</span>}
        </div>
        {error ? <LoadFailed error={error} /> : isLoading || !data ? <TableSkeleton /> : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Kpi label="매출 실적" basis="공급가" value={data.totals.pl.sales_actual} />
              <Kpi label="비용(매입+외주+십일조)" basis="공급가" value={data.totals.pl.cost + data.totals.pl.tithe} />
              <Kpi label="이익" basis="공급가" value={data.totals.pl.profit} />
              <Kpi label="순현금흐름" basis="VAT 포함" value={data.totals.cash.net} />
              <Kpi label="추정 잔액" basis={data.latest_balance ? `${fmtDate(data.latest_balance.from)} 기준잔액부터` : "기준잔액 없음"} value={data.latest_balance?.amount ?? null} />
            </div>

            <Card className="overflow-x-auto rounded-2xl"><CardContent className="p-0">
              <p className="px-4 pt-3 text-sm font-semibold">손익 <span className="text-xs font-normal text-muted-foreground">공급가 기준 · 실적만 (진행 중·예정 달의 예상은 아래 줄)</span></p>
              <table className="w-full min-w-[1100px] text-xs">
                {head("항목")}
                <tbody>
                  {PL_ROWS.map(([k, label]) => (
                    <PlRow key={k} k={k} label={label} data={data} cellCls={cellCls} toggle={k === "purchase_actual" && cats.length > 0 ? { open: openCat, set: setOpenCat } : undefined}>
                      {k === "purchase_actual" && openCat && cats.map((c) => (
                        <tr key={c} className="border-b bg-muted/20 text-muted-foreground">
                          <td className="sticky left-0 bg-muted/20 px-2 py-1 pl-6 whitespace-nowrap">{c}</td>
                          {data.months.map((r) => <td key={r.month} className={cellCls(r)}>{num(r.pl.purchase_actual_by_cat[c] || 0)}</td>)}
                          <td className="px-2 py-1 text-right">{num(data.totals.pl_by_cat[c])}</td>
                        </tr>
                      ))}
                    </PlRow>
                  ))}
                  <tr className="border-b text-muted-foreground italic">
                    <td className="sticky left-0 bg-background px-2 py-1 whitespace-nowrap">예상 이익(매출·매입계획)</td>
                    {data.months.map((r) => <td key={r.month} className={`px-2 py-1 text-right ${signCls(r.expected?.profit)}`}>{r.expected ? num(r.expected.profit) : ""}</td>)}
                    <td />
                  </tr>
                </tbody>
              </table>
            </CardContent></Card>

            <Card className="overflow-x-auto rounded-2xl"><CardContent className="p-0">
              <p className="px-4 pt-3 text-sm font-semibold">자금흐름 <span className="text-xs font-normal text-muted-foreground">부가세 포함 · 입금일·계산서 발행일·외주 지급일 기준</span></p>
              <table className="w-full min-w-[1100px] text-xs">
                {head("항목")}
                <tbody>
                  {CASH_ROWS.map(([k, label]) => (
                    <tr key={k} className={`border-b ${k === "net" || k === "balance_est" ? "font-bold" : ""}`}>
                      <td className="sticky left-0 bg-background px-2 py-1 whitespace-nowrap">{label}</td>
                      {data.months.map((r) => <td key={r.month} className={`${cellCls(r)} ${signCls(r.cash[k] as number | null)}`}>{r.is_future && k !== "balance_est" ? "" : num(r.cash[k])}</td>)}
                      <td className={`px-2 py-1 text-right ${signCls(data.totals.cash[k])}`}>{k in data.totals.cash ? num(data.totals.cash[k]) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-1 border-t px-4 py-3">
                {data.months.filter((r) => !r.is_future).map((r) => (
                  <div key={r.month} className="flex items-center gap-2 text-xs">
                    <span className="w-10">{r.month}월</span>
                    <div className="flex h-3 flex-1">
                      <div className="flex flex-1 justify-end">{r.cash.net < 0 && <div className="h-3 rounded-l bg-red-400" style={{ width: `${(-r.cash.net / maxNet) * 100}%` }} />}</div>
                      <div className="w-px bg-border" />
                      <div className="flex-1">{r.cash.net > 0 && <div className="h-3 rounded-r bg-emerald-500" style={{ width: `${(r.cash.net / maxNet) * 100}%` }} />}</div>
                    </div>
                    <span className={`w-28 text-right ${signCls(r.cash.net)}`}>{won(r.cash.net)}</span>
                  </div>
                ))}
              </div>
              <p className="border-t px-4 py-3 text-xs text-muted-foreground">급여·세금 납부 등 시스템에 없는 지출은 빠져 있어 실제 잔고와 다를 수 있습니다. 실제 잔고를 기준잔액으로 입력하면 그 이후가 보정됩니다.</p>
            </CardContent></Card>

            <Snapshots />
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}

function Kpi({ label, basis, value }: { label: string; basis: string; value: number | null }) {
  return (
    <Card className="rounded-2xl"><CardContent className="pt-4 pb-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${signCls(value)}`}>{won(value)}</p>
      <p className="text-[11px] text-muted-foreground">{basis}</p>
    </CardContent></Card>
  );
}

function PlRow({ k, label, data, cellCls, toggle, children }: {
  k: keyof PL; label: string; data: Data; cellCls: (r: Month) => string; toggle?: { open: boolean; set: (v: boolean) => void }; children?: React.ReactNode;
}) {
  const neg = k !== "sales_actual" && k !== "profit";
  return (
    <>
      <tr className={`border-b ${k === "profit" ? "font-bold" : ""}`}>
        <td className="sticky left-0 bg-background px-2 py-1 whitespace-nowrap">
          {toggle ? (
            <button className="inline-flex items-center gap-0.5" onClick={() => toggle.set(!toggle.open)}>
              {toggle.open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{label}
            </button>
          ) : label}
        </td>
        {data.months.map((r) => {
          const v = r.pl[k] as number;
          return <td key={r.month} className={`${cellCls(r)} ${k === "profit" ? signCls(v) : ""}`}>{r.is_future ? "" : neg && v ? `-${num(v)}` : num(v)}</td>;
        })}
        <td className={`px-2 py-1 text-right ${k === "profit" ? signCls(data.totals.pl[k]) : ""}`}>{neg && data.totals.pl[k] ? `-${num(data.totals.pl[k])}` : num(data.totals.pl[k])}</td>
      </tr>
      {children}
    </>
  );
}

function Snapshots() {
  const { toast } = useToast();
  const writable = useBillingWritable();
  const { data } = useStaffGet<{ items: Snapshot[] }>(["billing", "cash-snapshots"], "/billing/cash-snapshots");
  const write = useStaffWrite(["billing"]);
  const [form, setForm] = useState({ as_of_date: `${new Date().getFullYear()}-01-01`, amount: "", memo: "" });
  const save = async () => {
    try {
      await write.mutateAsync({ url: "/billing/cash-snapshots", body: form });
      setForm({ ...form, amount: "", memo: "" });
      toast("success", "기준잔액을 저장했습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "저장에 실패했습니다."));
    }
  };
  const remove = async (s: Snapshot) => {
    if (!window.confirm(`${fmtDate(s.as_of_date)} 기준잔액을 삭제할까요?`)) return;
    try {
      await write.mutateAsync({ url: `/billing/cash-snapshots/${s.id}/delete` });
    } catch (err) {
      toast("error", apiErrorDetail(err, "삭제에 실패했습니다."));
    }
  };
  return (
    <Card className="rounded-2xl"><CardContent className="space-y-3 pt-5 pb-5">
      <div>
        <p className="text-sm font-semibold">기준잔액</p>
        <p className="text-xs text-muted-foreground">그날 영업 시작 시점의 실제 통장 잔액입니다. 연초 기초잔액은 1월 1일로 넣고, 중간에 실제 잔액을 넣으면 그 날짜부터 추정 잔액이 다시 맞춰집니다.</p>
      </div>
      {writable && (
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" className="w-40 rounded-xl" value={form.as_of_date} onChange={(e) => setForm({ ...form, as_of_date: e.target.value })} />
          <Input className="w-40 rounded-xl text-right" placeholder="금액(원)" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input className="min-w-40 flex-1 rounded-xl" placeholder="메모 (예: 국민은행 기업계좌)" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          <Button size="sm" className="rounded-xl" disabled={!form.as_of_date || !form.amount || write.isPending} onClick={save}>저장</Button>
        </div>
      )}
      <div className="divide-y rounded-xl border">
        {(data?.items ?? []).length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">입력한 기준잔액이 없습니다.</p> : data!.items.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-1.5 text-xs">
            <span className="w-24">{fmtDate(s.as_of_date)}</span>
            <span className={`w-32 text-right font-semibold ${signCls(s.amount)}`}>{won(s.amount)}</span>
            <span className="flex-1 truncate text-muted-foreground">{s.memo}</span>
            {writable && <button className="text-muted-foreground hover:text-red-600" onClick={() => remove(s)} aria-label="삭제"><Trash2 className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}
