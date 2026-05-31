"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Code2,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  MessageSquare,
  Coins,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigationStore } from "@/store/navigation-store";
import { EmptyState, StatusBadge, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useDevRequestList } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function DevRequestListPage() {
  const { setPageTitle } = useNavigationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setPageTitle("개발 요청");
  }, [setPageTitle]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useDevRequestList({
    page: currentPage,
    per_page: 10,
    search: debouncedSearch || undefined,
    status: statusFilter || undefined,
  });

  if (isLoading) {
    return (
      <PageTransition>
        <LoadingState message="개발 요청을 불러오는 중..." />
      </PageTransition>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* Search + Status Filter + New Request */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="제목 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-xl"
            />
          </div>
          <Select
            value={statusFilter || "all"}
            onValueChange={(val) => {
              setStatusFilter(val === "all" ? "" : val);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[110px] h-11 rounded-xl">
              <SelectValue placeholder="상태" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="1">접수</SelectItem>
              <SelectItem value="3">처리중</SelectItem>
              <SelectItem value="4">완료</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/dev-requests/new">
            <Button className="h-11 rounded-xl px-4 gap-1">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">새 개발 요청</span>
            </Button>
          </Link>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <EmptyState
            icon={Code2}
            title="개발 요청이 없습니다."
            description="새로운 개발 요청을 등록해보세요."
          />
        ) : (
          <div className="space-y-2 animate-stagger">
            {items.map((item) => (
              <Link key={item.id} href={`/dev-requests/${item.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium mb-2 line-clamp-2">
                          {item.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.request_date)}
                          </span>
                          {item.comments_count > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {item.comments_count}
                            </span>
                          )}
                          {item.dev_plan_type && (
                            <span className="truncate max-w-[120px]">{item.dev_plan_type}</span>
                          )}
                          {item.points_used > 0 && (
                            <Badge className="rounded-lg text-[11px] px-1.5 py-0 gap-0.5 bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-100">
                              <Coins className="h-3 w-3" />
                              개발 {item.points_used}P
                            </Badge>
                          )}
                        </div>
                      </div>
                      <StatusBadge status={item.status} type="dev-request" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1;
              return (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl min-w-[36px]"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
