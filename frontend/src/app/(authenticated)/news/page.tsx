"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Newspaper, Search, Eye, User, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigationStore } from "@/store/navigation-store";
import { EmptyState, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useNewsList } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function NewsListPage() {
  const { setPageTitle } = useNavigationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setPageTitle("최신소식");
  }, [setPageTitle]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useNewsList({
    page: currentPage,
    per_page: 10,
    search: debouncedSearch || undefined,
  });

  if (isLoading) {
    return (
      <PageTransition>
        <LoadingState message="최신소식을 불러오는 중..." />
      </PageTransition>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="제목, 내용 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-xl"
            />
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={Newspaper}
            title="등록된 최신소식이 없습니다."
            description="새로운 소식이 등록되면 여기에 표시됩니다."
          />
        ) : (
          <div className="space-y-2 animate-stagger">
            {items.map((news) => (
              <Link key={news.id} href={`/news/${news.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium mb-2 line-clamp-2">
                      {news.title}
                    </h3>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {news.writer_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {news.views}
                      </span>
                      <span>{formatDate(news.created_at)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" className="rounded-xl" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1;
              return (
                <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="rounded-xl min-w-[36px]" onClick={() => setCurrentPage(page)}>
                  {page}
                </Button>
              );
            })}
            <Button variant="outline" size="sm" className="rounded-xl" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
