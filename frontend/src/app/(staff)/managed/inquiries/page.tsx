"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { SimpleListFilter } from "@/components/managed/simple-list-filter";
import { useNavigationStore } from "@/store/navigation-store";
import { type SimpleListParams, useStaffInquiries } from "@/lib/staff-support";

const STATUS_COLORS: Record<string, string> = { "1": "bg-blue-100 text-blue-700", "2": "bg-amber-100 text-amber-700", "3": "bg-emerald-100 text-emerald-700" };

export default function StaffInquiriesPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<SimpleListParams>({ page: 1 });
  const { data, isLoading } = useStaffInquiries(params);
  useEffect(() => {
    setPageTitle("고객문의");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        <SimpleListFilter
          statusOptions={[["open", "미완료(대기·진행중)"], ["1", "대기중"], ["2", "진행중"], ["3", "답변완료"]]}
          value={params}
          onChange={(patch) => setParams((p) => ({ ...p, ...patch, page: 1 }))}
        />
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={MessageSquare} title="문의가 없습니다" />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((i) => (
                  <Link key={i.seq} href={`/managed/inquiries/${i.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <span className="w-12 text-xs text-muted-foreground">#{i.seq}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{i.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {i.company_name} · {i.writer_name || "-"} · {i.inquiry_type_label} · 문의 {fmtDate(i.created_at)}
                        {i.answered_at && ` · 답변 ${fmtDate(i.answered_at)}`} · 답글 {i.answer_count}
                      </p>
                    </div>
                    {i.customer_replied_last && <Badge className="bg-red-100 text-red-700">고객 답글</Badge>}
                    <Badge className={`min-w-16 justify-center ${STATUS_COLORS[i.status ?? ""] ?? "bg-muted"}`}>{i.status_label}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
