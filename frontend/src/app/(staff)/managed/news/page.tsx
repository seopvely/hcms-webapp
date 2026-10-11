"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Newspaper, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { fmtDate, meta } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffNews } from "@/lib/staff-content";

export default function StaffNewsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string>();
  const { data, isLoading } = useStaffNews(page, sort);
  useEffect(() => {
    setPageTitle("최신소식");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/news/`} />}
        <PageActions>
          {data?.write_enabled && (
            <Button size="sm" className="rounded-xl" asChild>
              <Link href="/managed/news/new"><Plus className="mr-1 h-4 w-4" /> 소식 등록</Link>
            </Button>
          )}
        </PageActions>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Newspaper} title="소식이 없습니다" />
        ) : (
          <>
            <DataTable
              rows={data.items}
              rowKey={(n) => n.seq}
              rowHref={(n) => `/managed/news/${n.seq}`}
              sort={sort}
              onSortChange={(s) => {
                setSort(s);
                setPage(1);
              }}
              columns={[
                { key: "category", header: "분류", sort: "category", className: "w-24 whitespace-nowrap", cell: (n) => <Badge variant="outline">{n.category_label}</Badge> },
                {
                  key: "title", header: "제목", sort: "title", cell: (n) => (
                    <div className="min-w-0 max-w-[480px]">
                      <p className="truncate font-medium">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{n.company_names.length ? n.company_names.join(", ") : "전체 공개"}</p>
                    </div>
                  ),
                },
                { key: "views", header: "조회", sort: "views", align: "right", hideOnMobile: true, className: "w-16 whitespace-nowrap", cell: (n) => n.views },
                { key: "created_at", header: "등록일", sort: "created_at", hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (n) => fmtDate(n.created_at) },
                { key: "is_published", header: "게시", sort: "is_published", align: "center", className: "w-20", cell: (n) => (!n.is_published ? <Badge className="bg-slate-100 text-slate-600">미게시</Badge> : <span className="text-xs text-muted-foreground">게시</span>) },
              ]}
              mobile={(n) => (
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{n.category_label}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{n.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(n.company_names.length ? n.company_names.join(", ") : "전체 공개", `조회 ${n.views}`, fmtDate(n.created_at))}</p>
                  </div>
                  {!n.is_published && <Badge className="bg-slate-100 text-slate-600">미게시</Badge>}
                </div>
              )}
            />
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
