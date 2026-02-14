"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  MessageCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigationStore } from "@/store/navigation-store";
import { EmptyState, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useInquiryList } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function InquiryListPage() {
  const { setPageTitle } = useNavigationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setPageTitle("고객문의");
  }, [setPageTitle]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useInquiryList({
    page: currentPage,
    per_page: 10,
    search: debouncedSearch || undefined,
  });

  if (isLoading) {
    return (
      <PageTransition>
        <LoadingState message="문의사항을 불러오는 중..." />
      </PageTransition>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  // Status badge helper
  const getStatusBadge = (status: number) => {
    switch (status) {
      case 1:
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
            대기중
          </Badge>
        );
      case 2:
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            진행중
          </Badge>
        );
      case 3:
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            답변완료
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* Search + New Inquiry */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="문의사항 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-xl"
            />
          </div>
          <Link href="/inquiries/create">
            <Button className="h-11 rounded-xl px-4 gap-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">문의하기</span>
            </Button>
          </Link>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            title="등록된 문의사항이 없습니다."
            description="새로운 문의사항을 등록해주세요."
            actionLabel="문의하기"
            onAction={() => {
              window.location.href = "/inquiries/create";
            }}
          />
        ) : (
          <div className="space-y-2 animate-stagger">
            {items.map((item) => (
              <Link key={item.id} href={`/inquiries/${item.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-sm font-medium line-clamp-2">
                            {item.title}
                          </h3>
                          {item.inquiry_type_label && (
                            <Badge
                              variant="outline"
                              className="shrink-0 text-xs bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border-blue-200"
                            >
                              {item.inquiry_type_label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.created_at)}
                          </span>
                          {item.answer_count > 0 && (
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3" />
                              {item.answer_count}
                            </span>
                          )}
                        </div>
                      </div>
                      {getStatusBadge(item.status)}
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
