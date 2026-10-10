"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate, fmtDateTime } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { BillingShell } from "@/components/managed/billing-ui";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

const STATUS: Record<string, string> = { pending: "대기중", sent: "발송완료", failed: "발송실패", confirmed: "결제확인" };

export default function AlarmHistoryPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStaffGet<ListResult>(["billing", "alarm-history"], "/billing/alarms/history", { page });
  useEffect(() => {
    setPageTitle("결제일알람 발송 이력");
  }, [setPageTitle]);
  return (
    <PageTransition>
      <BillingShell cmsPath="/managed/payment-alarm/history/">
        {isLoading || !data ? <TableSkeleton /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((h) => (
                <div key={h.seq as number} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
                  <span className="w-32">{fmtDateTime(h.sent_at as string)}</span>
                  <Link href={`/managed/billing/alarms/${h.payment_alarm_id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{h.alarm_title as string}</Link>
                  <span>대상 {fmtDate(h.payment_date as string)}</span>
                  <span className={h.status === "failed" ? "text-red-600" : h.status === "confirmed" ? "text-emerald-600" : ""}>{STATUS[h.status as string] ?? (h.status as string)}</span>
                  <span className="w-12 text-right text-muted-foreground">{h.recipient_count as number}명</span>
                </div>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
          </>
        )}
      </BillingShell>
    </PageTransition>
  );
}
