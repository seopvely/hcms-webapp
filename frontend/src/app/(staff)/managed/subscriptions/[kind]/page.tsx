"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CreditCard, Inbox, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, selectClass } from "@/components/managed/field";
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

export default function SubscriptionListPage() {
  const { kind } = useParams<{ kind: string }>();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ status?: string; plan?: string; q?: string; page: number }>({ page: 1 });
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
          <select className={`${selectClass} w-auto`} value={params.status ?? ""} onChange={(e) => setParams({ ...params, status: e.target.value || undefined, page: 1 })}>
            <option value="">상태 전체</option><option value="active">활성</option><option value="beta">베타</option><option value="inactive">비활성</option>
          </select>
          <select className={`${selectClass} w-auto`} value={params.plan ?? ""} onChange={(e) => setParams({ ...params, plan: e.target.value || undefined, page: 1 })}>
            <option value="">플랜 전체</option>{PLANS[kind]?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <form className="flex max-w-xs flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
            <Input className="rounded-xl" placeholder="업체명" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
          </form>
          <Button variant="outline" className="rounded-xl" asChild><Link href={`/managed/subscriptions/${kind}/requests`}><Inbox className="mr-1 h-4 w-4" /> 접수 목록</Link></Button>
          {kind === "dev" && data?.write_enabled && <Button className="rounded-xl" asChild><Link href="/managed/subscriptions/dev/new"><Plus className="mr-1 h-4 w-4" /> 구독 등록</Link></Button>}
        </div>
        {kind === "maint" && <p className="text-xs text-muted-foreground">유지보수 구독은 유지보수구독(유형 15) 견적 → 계약서 → 계약전환으로만 만들어집니다.</p>}
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={CreditCard} title="구독이 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((s) => (
                <Link key={s.seq as number} href={`/managed/subscriptions/${kind}/${s.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{s.company as string} · {s.plan_label as string}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      시작 {fmtDate(s.start_date as string)} · 다음 충전 {fmtDate(s.next_charge_date as string)}{s.end_date ? ` · 종료 ${fmtDate(s.end_date as string)}` : ""}
                      {s.hosting_label ? ` · ${s.hosting_label}` : ""}
                    </p>
                  </div>
                  <span className="text-sm">월 {won(s.monthly_price)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[s.status as string] ?? "bg-muted"}`}>{s.status_label as string}</span>
                </Link>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((s) => ({ ...s, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
