"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { StepUpDialog } from "@/components/managed/step-up-dialog";
import { useNavigationStore } from "@/store/navigation-store";
import { type ListResult, useStaffGet, useStaffWrite } from "@/lib/staff-ops";

type Result = ListResult & { pending: { count: number; points: number } };
const LABEL: Record<string, string> = { dev: "개발 구독 접수", maint: "유지보수 구독 접수" };

export default function SubscriptionRequestsPage() {
  const { kind } = useParams<{ kind: string }>();
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useStaffGet<Result>(["subscriptions", kind, "requests"], `/subscriptions/${kind}/requests`, { page });
  const write = useStaffWrite(["subscriptions"]);
  useEffect(() => {
    setPageTitle(LABEL[kind] ?? "구독 접수");
  }, [setPageTitle, kind]);
  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="rounded-xl" asChild><Link href={`/managed/subscriptions/${kind}`}><ArrowLeft className="mr-1 h-4 w-4" /> 구독 목록</Link></Button>
          <div className="flex-1" />
          {data && <span className="text-sm">미실행 포인트 {data.pending.count}건 · {data.pending.points}P</span>}
          {data?.write_enabled && data.pending.count > 0 && <Button size="sm" className="rounded-xl" onClick={() => setOpen(true)}>일괄 차감</Button>}
        </div>
        {kind === "maint" && <p className="text-xs text-muted-foreground">유지보수 구독 접수를 연결하는 경로가 아직 없어 목록이 비어 있을 수 있습니다(SPEC 05 §9).</p>}
        {isLoading ? <TableSkeleton /> : !data?.items.length ? <EmptyState icon={Inbox} title="접수가 없습니다" /> : (
          <>
            <Card className="rounded-2xl"><CardContent className="divide-y p-0">
              {data.items.map((r) => (
                <Link key={r.seq as number} href={`/managed/maintenance/${r.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.company as string} · {r.title as string}</span>
                  <span className="text-xs">{r.status_label as string}</span>
                  <span className="text-xs text-muted-foreground">{r.points_used as number}P · {fmtDate(r.created_at as string)}</span>
                </Link>
              ))}
            </CardContent></Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
      <StepUpDialog open={open} onOpenChange={setOpen} title="미실행 포인트 일괄 차감" description="접수 댓글의 책정 포인트를 모두 사용 처리합니다. 본인 비밀번호를 입력하세요."
        onConfirm={async (password: string) => {
          try {
            const r = await write.mutateAsync({ url: `/subscriptions/${kind}/requests/bulk-deduct`, body: { password } });
            toast("success", `${r.count}건, 총 ${r.points}P 차감했습니다.`);
            setOpen(false);
          } catch (err) {
            toast("error", apiErrorDetail(err, "차감에 실패했습니다."));
          }
        }} />
    </PageTransition>
  );
}
