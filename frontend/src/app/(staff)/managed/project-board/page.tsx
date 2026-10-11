"use client";
import { FilterCard } from "@/components/managed/filter-card";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { Field, fmtDate, meta, selectClass } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { BOARD_STATUS_COLORS } from "@/components/managed/board-status";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useBoardProjects, useStaffBoard } from "@/lib/staff-content";
import { BoardCategoryManager } from "@/components/managed/board-category-manager";

export default function StaffBoardPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ project_id?: number; status?: string; sort?: string; page: number }>({ page: 1 });
  const { data, isLoading } = useStaffBoard(params);
  const { data: projects } = useBoardProjects();
  const [managingCats, setManagingCats] = useState(false);
  useEffect(() => {
    setPageTitle("프로젝트구축진행");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/project-board/`} />}
        <FilterCard className="grid gap-3 sm:grid-cols-3">
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
          </FilterCard>
        <PageActions>
          {params.project_id && (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setManagingCats(true)}><Tags className="mr-1 h-4 w-4" /> 카테고리</Button>
          )}
          {data?.write_enabled && (
            <Button size="sm" className="rounded-xl" asChild><Link href="/managed/project-board/new"><Plus className="mr-1 h-4 w-4" /> 글쓰기</Link></Button>
          )}
        </PageActions>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={FolderKanban} title="게시글이 없습니다" />
        ) : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(b) => b.seq}
              rowHref={(b) => `/managed/project-board/${b.seq}`}
              sort={params.sort}
              onSortChange={(sort) => setParams((p) => ({ ...p, sort, page: 1 }))}
              columns={[
                {
                  key: "title", header: "제목", sort: "title", cell: (b) => (
                    <div className="min-w-0 max-w-[480px]">
                      <p className="truncate font-medium">
                        {b.is_notice && <Badge className="mr-2 bg-red-100 text-red-700">공지</Badge>}
                        {b.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{meta(b.company_name, b.project_title)}</p>
                    </div>
                  ),
                },
                { key: "writer", header: "작성자", hideOnMobile: true, className: "w-32 whitespace-nowrap", cell: (b) => `${b.writer_name}${b.is_staff ? "(직원)" : "(고객)"}` },
                { key: "created_at", header: "작성일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (b) => fmtDate(b.created_at) },
                { key: "counts", header: "답글·댓글", align: "right", hideOnMobile: true, className: "w-24 whitespace-nowrap text-xs text-muted-foreground", cell: (b) => `${b.reply_count} · ${b.comment_count}` },
                { key: "status", header: "상태", sort: "status", align: "center", className: "w-24", cell: (b) => <Badge className={`min-w-16 justify-center ${BOARD_STATUS_COLORS[b.status ?? ""] ?? "bg-muted"}`}>{b.status_label}</Badge> },
              ]}
              mobile={(b) => (
                <div className="flex items-center gap-3">
                  {b.is_notice && <Badge className="bg-red-100 text-red-700">공지</Badge>}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.company_name} · {b.project_title} · {b.writer_name}{b.is_staff ? "(직원)" : "(고객)"} · {fmtDate(b.created_at)} · 답글 {b.reply_count} · 댓글 {b.comment_count}
                    </p>
                  </div>
                  <Badge className={`min-w-16 justify-center ${BOARD_STATUS_COLORS[b.status ?? ""] ?? "bg-muted"}`}>{b.status_label}</Badge>
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={(page) => setParams((p) => ({ ...p, page }))} />
          </>
        )}
      </div>
      {managingCats && params.project_id && <BoardCategoryManager projectId={params.project_id} onClose={() => setManagingCats(false)} />}
    </PageTransition>
  );
}
