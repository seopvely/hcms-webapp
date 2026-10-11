"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CreditCard, Inbox, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, meta, selectCls } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { won } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

const KIND_LABEL: Record<string, string> = { dev: "개발 구독", maint: "유지보수 구독" };
const PLANS: Record<string, [string, string][]> = {
  dev: [["starter", "STARTER"], ["growth", "GROWTH"], ["scale", "SCALE"]],
  maint: [["basic", "BASIC"], ["growth", "GROWTH"], ["business", "BUSINESS"]],
};
const STATUS_COLOR: Record<string, string> = { active: "bg-blue-100 text-blue-700", beta: "bg-violet-100 text-violet-700", inactive: "bg-muted" };

type Row = Record<string, unknown>;
const statusBadge = (s: Row) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[s.status as string] ?? "bg-muted"}`}>{s.status_label as string}</span>;

export default function SubscriptionListPage() {
  const { kind } = useParams<{ kind: string }>();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ status?: string; plan?: string; q?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffGet<ListResult>(["subscriptions", kind], `/subscriptions/${kind}`, params);
  useEffect(() => {
    setPageTitle(KIND_LABEL[kind] ?? "구독");
  }, [setPageTitle, kind]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/${kind}-subscription/`} />}
        <div className="flex flex-wrap gap-2">
          <select className={selectCls("w-auto")} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option><option value="active">활성</option><option value="beta">베타</option><option value="inactive">비활성</option>
          </select>
          <select className={selectCls("w-auto")} value={params.plan ?? ""} onChange={(e) => setParams({ ...params, plan: e.target.value || undefined, page: 1 })}>
            <option value="">플랜 전체</option>{PLANS[kind]?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="업체명" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="hidden rounded-xl sm:inline-flex" asChild><Link href={`/managed/subscriptions/${kind}/requests`}><Inbox className="mr-1 h-4 w-4" /> 접수 목록</Link></Button>
          {kind === "dev" && data?.write_enabled && <Button size="sm" className="rounded-xl" asChild><Link href="/managed/subscriptions/dev/new"><Plus className="mr-1 h-4 w-4" /> 구독 등록</Link></Button>}
        </PageActions>
        {kind === "maint" && <p className="text-xs text-muted-foreground">유지보수 구독은 유지보수구독(유형 15) 견적 → 계약서 → 계약전환으로만 만들어집니다.</p>}
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={CreditCard} title="구독이 없습니다" /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(s) => s.seq as number}
              rowHref={(s) => `/managed/subscriptions/${kind}/${s.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((p) => ({ ...p, sort, page: 1 }))}
              columns={[
                {
                  key: "company", header: "업체 · 플랜", sort: "plan_type", cell: (s) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{s.company as string} · {s.plan_label as string}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(s.end_date ? `종료 ${fmtDate(s.end_date as string)}` : null, s.hosting_label as string)}</p>
                    </div>
                  ),
                },
                { key: "start_date", header: "시작", sort: "start_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (s) => fmtDate(s.start_date as string) },
                { key: "next_charge_date", header: "다음 충전", sort: "next_charge_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (s) => fmtDate(s.next_charge_date as string) },
                { key: "monthly_price", header: "월 금액", sort: "monthly_price", align: "right", className: "w-32 whitespace-nowrap", cell: (s) => won(s.monthly_price) },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-20", cell: (s) => statusBadge(s) },
              ]}
              mobile={(s) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.company as string} · {s.plan_label as string}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      시작 {fmtDate(s.start_date as string)} · 다음 충전 {fmtDate(s.next_charge_date as string)}{s.end_date ? ` · 종료 ${fmtDate(s.end_date as string)}` : ""}
                      {s.hosting_label ? ` · ${s.hosting_label}` : ""}
                    </p>
                    <p className="text-sm">월 {won(s.monthly_price)}</p>
                  </div>
                  {statusBadge(s)}
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
