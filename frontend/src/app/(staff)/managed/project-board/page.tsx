"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDate, selectClass } from "@/components/managed/field";
import { BOARD_STATUS_COLORS } from "@/components/managed/board-status";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useBoardProjects, useStaffBoard } from "@/lib/staff-content";

export default function StaffBoardPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ project_id?: number; status?: string; page: number }>({ page: 1 });
  const { data, isLoading } = useStaffBoard(params);
  const { data: projects } = useBoardProjects();
  useEffect(() => {
    setPageTitle("프로젝트구축진행");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/project-board/`} />}
        <Card className="rounded-2xl">
          <CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-3">
            <Field label="프로젝트">
              <select className={selectClass} value={params.project_id ?? ""} onChange={(e) => setParams({ ...params, page: 1, project_id: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">전체</option>
                {projects?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="상태">
              <select className={selectClass} value={params.status ?? ""} onChange={(e) => setParams({ ...params, page: 1, status: e.target.value || undefined })}>
                <option value="">전체</option><option value="1">진행중</option><option value="2">완료</option><option value="3">보류</option>
              </select>
            </Field>
            {data?.write_enabled && (
              <div className="flex items-end">
                <Button className="rounded-xl" asChild><Link href="/managed/project-board/new"><Plus className="mr-1 h-4 w-4" /> 글쓰기</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={FolderKanban} title="게시글이 없습니다" />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((b) => (
                  <Link key={b.seq} href={`/managed/project-board/${b.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    {b.is_notice && <Badge className="bg-red-100 text-red-700">공지</Badge>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{b.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.company_name} · {b.project_title} · {b.writer_name}{b.is_staff ? "(직원)" : "(고객)"} · {fmtDate(b.created_at)} · 답글 {b.reply_count} · 댓글 {b.comment_count}
                      </p>
                    </div>
                    <Badge className={BOARD_STATUS_COLORS[b.status ?? ""] ?? "bg-muted"}>{b.status_label}</Badge>
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
