"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDateTime } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet } from "@/lib/staff-ops";

export default function AlarmHistoryPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStaffGet<ListResult>(["alarms", "history"], "/alarms/history", { page });
  useEffect(() => {
    setPageTitle("알람 발송 이력");
  }, [setPageTitle]);
  return (
    <PageTransition>
      {isLoading || !data ? <TableSkeleton /> : (
        <div className="space-y-4">
          <Card className="rounded-2xl"><CardContent className="divide-y p-0">
            {data.items.map((h) => (
              <div key={h.seq as number} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
                <span className="w-32">{fmtDateTime(h.sent_at as string)}</span>
                <Link href={`/managed/alarms/${h.alarm_id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{h.alarm_title as string}</Link>
                <span className={h.status === "failed" ? "text-red-600" : ""}>{h.status_label as string}</span>
                <span className="w-12 text-right text-muted-foreground">{h.recipient_count as number}명</span>
              </div>
            ))}
          </CardContent></Card>
          <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
        </div>
      )}
    </PageTransition>
  );
}
