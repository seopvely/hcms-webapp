"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Newspaper, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { Pager } from "@/components/managed/pager";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffNews } from "@/lib/staff-content";

export default function StaffNewsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useStaffNews(page);
  useEffect(() => {
    setPageTitle("최신소식");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/news/`} />}
        {data?.write_enabled && (
          <Button className="rounded-xl" asChild>
            <Link href="/managed/news/new"><Plus className="mr-1 h-4 w-4" /> 소식 등록</Link>
          </Button>
        )}
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Newspaper} title="소식이 없습니다" />
        ) : (
          <>
            <Card className="rounded-2xl">
              <CardContent className="divide-y p-0">
                {data.items.map((n) => (
                  <Link key={n.seq} href={`/managed/news/${n.seq}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                    <Badge variant="outline">{n.category_label}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{n.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {n.company_names.length ? n.company_names.join(", ") : "전체 공개"} · 조회 {n.views} · {fmtDate(n.created_at)}
                      </p>
                    </div>
                    {!n.is_published && <Badge className="bg-slate-100 text-slate-600">미게시</Badge>}
                  </Link>
                ))}
              </CardContent>
            </Card>
            <Pager page={data.page} totalPages={data.total_pages} total={data.total} onChange={setPage} />
          </>
        )}
      </div>
    </PageTransition>
  );
}
