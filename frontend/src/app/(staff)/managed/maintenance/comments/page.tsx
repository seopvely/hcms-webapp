"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { Field, fmtDateTime, selectClass } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { useNavigationStore } from "@/store/navigation-store";
import { useCommentSearch } from "@/lib/staff-maintenance";

// 처리내역 검색 (cms 댓글히스토리 대체)
export default function StaffCommentSearchPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [params, setParams] = useState<{ q?: string; worker_type?: string; date_from?: string; date_to?: string; page: number }>({ page: 1 });
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
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((c) => (
                  <Link key={c.comment_id} href={`/managed/maintenance/${c.managelist_id}`} className="block px-4 py-3 hover:bg-muted/40">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{c.writer_name}</span>
                      {c.worker_type_label && <Badge variant="outline">{c.worker_type_label}</Badge>}
                      {c.status_label && <span>{c.status_label}</span>}
                      <span>{fmtDateTime(c.created_at)}</span>
                      {c.point > 0 && <span>{c.point}P{c.point_executed ? " 실행" : " 책정"}</span>}
                      <span className="truncate">· {c.company_name} / {c.title}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm">{c.summary}</p>
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
