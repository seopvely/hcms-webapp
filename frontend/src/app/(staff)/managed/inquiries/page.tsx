"use client";
import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, meta } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { Pager } from "@/components/managed/pager";
import { SimpleListFilter } from "@/components/managed/simple-list-filter";
import { useNavigationStore } from "@/store/navigation-store";
import { type InquiryListItem, type SimpleListParams, useStaffInquiries } from "@/lib/staff-support";

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
            <DataTable
              rows={data.items}
              rowKey={(i) => i.seq}
              rowHref={(i) => `/managed/inquiries/${i.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((p) => ({ ...p, sort, page: 1 }))}
              columns={[
                { key: "seq", header: "번호", sort: "seq", className: "w-16 text-xs text-muted-foreground", cell: (i) => `#${i.seq}` },
                {
                  key: "title", header: "제목", sort: "title", cell: (i) => (
                    <div className="min-w-0 max-w-[420px]">
                      <p className="truncate font-medium">{i.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{meta(i.company_name, i.writer_name, i.inquiry_type_label)}</p>
                    </div>
                  ),
                },
                { key: "created_at", header: "문의일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (i) => fmtDate(i.created_at) },
                { key: "answered_at", header: "답변일", sort: "answered_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (i) => (i.answered_at ? fmtDate(i.answered_at) : "-") },
                { key: "answer_count", header: "답글", align: "right", hideOnMobile: true, className: "w-16 whitespace-nowrap", cell: (i) => i.answer_count },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-36 whitespace-nowrap", cell: (i) => <InquiryBadges i={i} /> },
              ]}
              mobile={(i) => (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{i.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {meta(`#${i.seq}`, i.company_name, i.writer_name, i.inquiry_type_label, `문의 ${fmtDate(i.created_at)}`, i.answered_at && `답변 ${fmtDate(i.answered_at)}`, `답글 ${i.answer_count}`)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1"><InquiryBadges i={i} /></div>
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

function InquiryBadges({ i }: { i: InquiryListItem }) {
  return (
    <>
      {i.customer_replied_last && <Badge className="mr-1 bg-red-100 text-red-700">고객 답글</Badge>}
      <Badge className={`min-w-16 justify-center ${STATUS_COLORS[i.status ?? ""] ?? "bg-muted"}`}>{i.status_label}</Badge>
    </>
  );
}
