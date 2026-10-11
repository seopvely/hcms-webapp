"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, fmtDateTime } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { Pager } from "@/components/managed/pager";
import { BillingShell } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

type Row = Record<string, unknown>;
const STATUS: Record<string, string> = { pending: "대기중", sent: "발송완료", failed: "발송실패", confirmed: "결제확인" };

export default function AlarmHistoryPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ page: number; sort?: string }>({ page: 1 });
  const { data, isLoading } = useStaffGet<ListResult>(["billing", "alarm-history"], "/billing/alarms/history", params);
  useEffect(() => {
    setPageTitle("결제일알람 발송 이력");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/payment-alarm/history/">
        {isLoading || !data ? <TableSkeleton /> : (
          <>
            <DataTable<Row>
              rows={data.items}
              rowKey={(h) => h.seq as number}
              sort={params.sort}
              onSortChange={(sort) => setParams((s) => ({ ...s, sort, page: 1 }))}
              columns={[
                { key: "sent_at", header: "발송일시", sort: "sent_at", className: "w-36 whitespace-nowrap text-xs", cell: (h) => fmtDateTime(h.sent_at as string) },
                {
                  key: "title", header: "알람", cell: (h) => (
                    <Link href={`/managed/billing/alarms/${h.payment_alarm_id}`} className="block max-w-[420px] truncate font-semibold hover:underline">{h.alarm_title as string}</Link>
                  ),
                },
                { key: "payment_date", header: "대상 결제일", sort: "payment_date", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (h) => fmtDate(h.payment_date as string) },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-24 whitespace-nowrap", cell: (h) => <StatusText h={h} /> },
                { key: "recipient_count", header: "수신", sort: "recipient_count", align: "right", hideOnMobile: true, className: "w-16 whitespace-nowrap text-muted-foreground", cell: (h) => `${h.recipient_count as number}명` },
              ]}
              mobile={(h) => (
                <div className="space-y-0.5 text-xs">
                  <Link href={`/managed/billing/alarms/${h.payment_alarm_id}`} className="block truncate text-sm font-semibold hover:underline">{h.alarm_title as string}</Link>
                  <p className="flex flex-wrap gap-x-2 text-muted-foreground">
                    <span>{fmtDateTime(h.sent_at as string)}</span>
                    <span>대상 {fmtDate(h.payment_date as string)}</span>
                    <StatusText h={h} />
                    <span>{h.recipient_count as number}명</span>
                  </p>
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

function StatusText({ h }: { h: Row }) {
  return <span className={h.status === "failed" ? "text-red-600" : h.status === "confirmed" ? "text-emerald-600" : ""}>{STATUS[h.status as string] ?? (h.status as string)}</span>;
}
