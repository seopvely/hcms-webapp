"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileSignature, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { CONTRACT_STATUS_COLORS } from "@/components/managed/contract-status";
import { DataTable } from "@/components/managed/data-table";
import { fmtDate, meta } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffContracts } from "@/lib/staff-sales";

export default function StaffContractsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; status?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useStaffContracts(params);
  useEffect(() => {
    setPageTitle("계약서");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/contract/`} />}
        <PageActions>
          {data?.write_enabled && (
            <Button size="sm" className="rounded-xl" asChild title="견적 없이 직접 등록 — 견적 기반은 견적서 상세(승인)에서 작성">
              <Link href="/managed/contracts/new"><Plus className="mr-1 h-4 w-4" /> 계약서 작성</Link>
            </Button>
          )}
        </PageActions>
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
            <DataTable
              rows={data.items}
              rowKey={(c) => c.seq}
              rowHref={(c) => `/managed/contracts/${c.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((p) => ({ ...p, sort, page: 1 }))}
              columns={[
                { key: "number", header: "번호", sort: "number", hideOnMobile: true, className: "w-36 whitespace-nowrap text-xs text-muted-foreground", cell: (c) => c.contract_number },
                {
                  key: "title", header: "계약명", sort: "title", cell: (c) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{c.contract_title}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(c.party_a_name)}</p>
                    </div>
                  ),
                },
                { key: "sent_at", header: "발송", sort: "sent_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (c) => fmtDate(c.sent_at) },
                { key: "customer_signed_at", header: "고객서명", sort: "customer_signed_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (c) => fmtDate(c.customer_signed_at) },
                { key: "amount", header: "금액", sort: "amount", align: "right", className: "w-32 whitespace-nowrap", cell: (c) => `${(c.contract_amount ?? 0).toLocaleString()}원` },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-24", cell: (c) => <Badge className={`min-w-16 justify-center ${CONTRACT_STATUS_COLORS[c.status] ?? "bg-muted"}`}>{c.status_label}</Badge> },
              ]}
              mobile={(c) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{c.contract_title}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.contract_number} · {c.party_a_name} · 발송 {fmtDate(c.sent_at)} · 고객서명 {fmtDate(c.customer_signed_at)}</p>
                    <p className="text-xs tabular-nums">{(c.contract_amount ?? 0).toLocaleString()}원</p>
                  </div>
                  <Badge className={`min-w-16 justify-center ${CONTRACT_STATUS_COLORS[c.status] ?? "bg-muted"}`}>{c.status_label}</Badge>
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
