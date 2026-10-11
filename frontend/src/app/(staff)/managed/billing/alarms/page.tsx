"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CalendarRange, History, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate, meta, selectCls } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { BillingShell, useBillingWritable, won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Result = ListResult & { this_month: Record<string, number> };
type Params = { q?: string; status?: string; cycle_type?: string; payment_type?: string; sort?: string; page: number };
type Row = Record<string, unknown>;
const TYPE_COLOR: Record<string, string> = { sales: "text-emerald-600", purchase: "text-red-600", outsourcing: "text-violet-600" };

export default function AlarmsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const [params, setParams] = useState<Params>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const writable = useBillingWritable();
  const { data, isLoading } = useStaffGet<Result>(["billing", "alarms"], "/billing/alarms", params);
  const write = useStaffWrite(["billing"]);
  useEffect(() => {
    setPageTitle("결제일알람");
  }, [setPageTitle]);
  const sync = async () => {
    try {
      const r = await write.mutateAsync({ url: "/billing/alarms/sync-sales" });
      toast(r.errors ? "warning" : "success", r.count ? `매출동기화: ${r.alarms}개 알람 / ${r.count}건 입금확인 반영${r.errors ? ` (오류 ${r.errors}건)` : ""}` : "새로 반영할 입금확인 내역이 없습니다.");
    } catch (err) {
      toast("error", apiErrorDetail(err, "동기화에 실패했습니다."));
    }
  };
  const m = data?.this_month;
  const sel = (k: keyof Params, opts: [string, string][], label: string) => (
    <select className={selectCls("w-auto")} value={(params[k] as string) ?? ""} onChange={(e) => setParams({ ...params, [k]: e.target.value || undefined, page: 1 })}>
      <option value="">{label}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/payment-alarm/">
        {m && (
          <div className="grid gap-3 sm:grid-cols-3">
            {[["sales", "이번 달 매출(입금확인)", "text-emerald-600"], ["purchase", "이번 달 매입", "text-red-600"], ["outsourcing", "이번 달 외주비", "text-violet-600"]].map(([k, l, c]) => (
              <Card key={k} className="rounded-2xl"><CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{l} · {m[`${k}_count`]}건</p>
                <p className={`text-xl font-bold ${c}`}>{won(m[`${k}_total`])}</p>
              </CardContent></Card>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {sel("payment_type", [["sales", "매출"], ["purchase", "매입"], ["outsourcing", "외주비"]], "구분 전체")}
          {sel("status", [["valid", "유효"], ["invalid", "무효"]], "상태 전체")}
          {sel("cycle_type", [["monthly", "매월"], ["yearly", "매년"], ["custom", "사용자지정"], ["once", "당월만"]], "주기 전체")}
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="제목·설명" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/billing/alarms/calendar"><CalendarRange className="mr-1 h-4 w-4" /> 달력</Link></Button>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href="/managed/billing/alarms/history"><History className="mr-1 h-4 w-4" /> 발송 이력</Link></Button>
          {writable && <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" onClick={sync} disabled={write.isPending}><RefreshCw className="mr-1 h-4 w-4" /> 매출동기화</Button>}
          {writable && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/billing/alarms/new"><Plus className="mr-1 h-4 w-4" /> 알람 등록</Link></Button>}
        </PageActions>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={BellRing} title="결제일 알람이 없습니다" /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(a) => a.seq as number}
              rowHref={(a) => `/managed/billing/alarms/${a.seq}`}
              rowClassName={(a) => (a.valid_status !== "valid" ? "opacity-60" : undefined)}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                { key: "payment_type", header: "구분", sort: "payment_type", className: "w-16 whitespace-nowrap", cell: (a) => <span className={`text-xs font-semibold ${TYPE_COLOR[a.payment_type as string] ?? ""}`}>{a.payment_type_label as string}</span> },
                {
                  key: "title", header: "제목", sort: "title", cell: (a) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{a.title as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(`${(a.cycle_label as string) || "주기없음"} ${a.payment_day as number}일`, `${a.notify_days_before as number}일 전 알림`)}</p>
                    </div>
                  ),
                },
                { key: "next_payment_date", header: "다음 결제일", sort: "next_payment_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (a) => fmtDate(a.next_payment_date as string) },
                { key: "amount", header: "금액", sort: "amount", align: "right", className: "w-32 whitespace-nowrap", cell: (a) => won(a.amount) },
                { key: "valid_status", header: "상태", sort: "valid_status", align: "center", className: "w-36 whitespace-nowrap", cell: (a) => <AlarmBadges a={a} /> },
              ]}
              mobile={(a) => (
                <div className="flex items-center gap-3">
                  <span className={`w-12 shrink-0 text-xs font-semibold ${TYPE_COLOR[a.payment_type as string] ?? ""}`}>{a.payment_type_label as string}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{a.title as string}</p>
                    <p className="truncate text-xs text-muted-foreground">{(a.cycle_label as string) || "주기없음"} {a.payment_day as number}일 · 다음 결제일 {fmtDate(a.next_payment_date as string)} · {a.notify_days_before as number}일 전 알림</p>
                    <p className="text-sm tabular-nums">{won(a.amount)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><AlarmBadges a={a} /></div>
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}

function AlarmBadges({ a }: { a: Row }) {
  return (
    <>
      {Boolean(a.is_paid) && <span className="mr-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">입금완료</span>}
      <span className={`rounded-full px-2 py-0.5 text-xs ${a.valid_status === "valid" ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{a.valid_status === "valid" ? "유효" : "무효"}</span>
    </>
  );
}
