"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { CONTRACT_STATUS_COLORS } from "@/components/managed/contract-status";
import { fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffContracts } from "@/lib/staff-sales";

export default function StaffContractsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffContracts(params);
  useEffect(() => {
    setPageTitle("계약서");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/contract/`} />}
        <div className="flex flex-wrap gap-2">
          <button className={`rounded-full px-3 py-1 text-xs ${!params.status ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, status: undefined })}>전체</button>
          {data?.stats.map((s) => (
            <button key={s.status} className={`rounded-full px-3 py-1 text-xs ${params.status === s.status ? "bg-slate-900 text-white" : "bg-muted"}`} onClick={() => setParams({ ...params, page: 1, status: s.status })}>{s.label} {s.count}</button>
          ))}
        </div>
        <form className="flex max-w-md gap-2" onSubmit={(e) => { e.preventDefault(); setParams({ ...params, page: 1, q: keyword.trim() || undefined }); }}>
          <Input className="rounded-xl" placeholder="번호·제목·갑 상호" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
        </form>
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={FileSignature} title="계약서가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((c) => (
                <Link key={c.seq} href={`/managed/contracts/${c.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.contract_title}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.contract_number} · {c.party_a_name} · 발송 {fmtDate(c.sent_at)} · 고객서명 {fmtDate(c.customer_signed_at)}</p>
                  </div>
                  <span className="text-sm">{(c.contract_amount ?? 0).toLocaleString()}원</span>
                  <Badge className={CONTRACT_STATUS_COLORS[c.status] ?? "bg-muted"}>{c.status_label}</Badge>
                </Link>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
