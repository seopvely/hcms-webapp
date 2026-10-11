"use client";
import { useEffect, useState } from "react";
import { History, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDateTime, meta, selectClass } from "@/components/managed/field";
import { DataTable } from "@/components/managed/data-table";
import { Pager } from "@/components/managed/pager";
import { useNavigationStore } from "@/store/navigation-store";
import { type CommentSearchItem, useCommentSearch } from "@/lib/staff-maintenance";

const pointOf = (c: CommentSearchItem) => (c.point > 0 ? `${c.point}P${c.point_executed ? " 실행" : " 책정"}` : null);

// 처리내역 검색 (cms 댓글히스토리 대체)
export default function StaffCommentSearchPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; worker_type?: string; date_from?: string; date_to?: string; sort?: string; page: number }>({ page: 1 });
  const [keyword, setKeyword] = useState("");
  const { data, isLoading } = useCommentSearch(params);

  useEffect(() => {
    setPageTitle("처리내역 검색");
  }, [setPageTitle]);

  const set = (patch: object) => setParams((p) => ({ ...p, page: 1, ...patch }));

  return (
    <PageTransition>
      <div className="space-y-4">
        <Card className="rounded-2xl">
          <CardContent className="grid gap-3 pt-5 pb-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="작업자 유형">
              <select className={selectClass} value={params.worker_type ?? ""} onChange={(e) => set({ worker_type: e.target.value || undefined })}>
                <option value="">전체</option>
                {[["1", "계약"], ["2", "기획"], ["3", "디자인"], ["4", "프론트엔드"], ["5", "백엔드"], ["6", "유지보수"]].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="작성일 시작">
              <Input type="date" className="rounded-xl" value={params.date_from ?? ""} onChange={(e) => set({ date_from: e.target.value || undefined })} />
            </Field>
            <Field label="작성일 끝">
              <Input type="date" className="rounded-xl" value={params.date_to ?? ""} onChange={(e) => set({ date_to: e.target.value || undefined })} />
            </Field>
            <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); set({ q: keyword.trim() || undefined }); }}>
              <Field label="내용" className="flex-1">
                <Input className="rounded-xl" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
              </Field>
              <Button type="submit" className="rounded-xl"><Search className="h-4 w-4" /></Button>
            </form>
          </CardContent>
        </Card>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={History} title="처리 내역이 없습니다" />
        ) : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(c) => c.comment_id}
              rowHref={(c) => `/managed/maintenance/${c.managelist_id}`}
              sort={params.sort}
              onSortChange={(sort) => set({ sort })}
              columns={[
                { key: "created_at", header: "작성일시", sort: "created_at", className: "w-36 whitespace-nowrap text-xs text-muted-foreground", cell: (c) => fmtDateTime(c.created_at) },
                {
                  key: "summary", header: "요청 · 내용", cell: (c) => (
                    <div className="min-w-0 max-w-[520px]">
                      <p className="truncate text-xs text-muted-foreground">{meta(c.company_name, c.title)}</p>
                      <p className="line-clamp-2">{c.summary}</p>
                    </div>
                  ),
                },
                {
                  key: "writer", header: "작성자", sort: "worker_type", hideOnMobile: true, className: "w-36 whitespace-nowrap", cell: (c) => (
                    <>
                      <span className="font-semibold">{c.writer_name}</span>
                      {c.worker_type_label && <Badge variant="outline" className="ml-1">{c.worker_type_label}</Badge>}
                    </>
                  ),
                },
                { key: "status", header: "상태", sort: "status", align: "center", hideOnMobile: true, className: "w-20 whitespace-nowrap text-xs", cell: (c) => c.status_label || "-" },
                { key: "point", header: "포인트", sort: "point", align: "right", hideOnMobile: true, className: "w-24 whitespace-nowrap text-xs", cell: (c) => pointOf(c) || "-" },
              ]}
              mobile={(c) => (
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{c.writer_name}</span>
                    {c.worker_type_label && <Badge variant="outline">{c.worker_type_label}</Badge>}
                    {c.status_label && <span>{c.status_label}</span>}
                    <span>{fmtDateTime(c.created_at)}</span>
                    {pointOf(c) && <span>{pointOf(c)}</span>}
                    <span className="truncate">· {c.company_name} / {c.title}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{c.summary}</p>
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
