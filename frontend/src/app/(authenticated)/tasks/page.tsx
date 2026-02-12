"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, Search, ChevronLeft, ChevronRight, Calendar, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavigationStore } from "@/store/navigation-store";
import { EmptyState, StatusBadge, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import { useTaskList } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

const taskTypeColors: Record<string, string> = {
  "계약": "bg-gray-100 text-gray-700",
  "기획": "bg-blue-100 text-blue-700",
  "디자인": "bg-pink-100 text-pink-700",
  "프론트엔드": "bg-cyan-100 text-cyan-700",
  "백엔드": "bg-orange-100 text-orange-700",
  "유지보수": "bg-green-100 text-green-700",
  "기타": "bg-slate-100 text-slate-700",
};

export default function TaskListPage() {
  const { setPageTitle } = useNavigationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => { setPageTitle("건별작업"); }, [setPageTitle]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(searchQuery); setCurrentPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading } = useTaskList({
    page: currentPage,
    per_page: 10,
    search: debouncedSearch || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    task_type: typeFilter !== "all" ? typeFilter : undefined,
  });

  if (isLoading) {
    return <PageTransition><LoadingState message="건별작업을 불러오는 중..." /></PageTransition>;
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="작업명 검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 h-11 rounded-xl" />
          </div>
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-9 rounded-xl w-[120px] text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="1">대기</SelectItem>
              <SelectItem value="2">진행중</SelectItem>
              <SelectItem value="3">완료</SelectItem>
              <SelectItem value="4">보류</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="h-9 rounded-xl w-[120px] text-xs"><Filter className="h-3 w-3 mr-1" /><SelectValue placeholder="유형" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 유형</SelectItem>
              <SelectItem value="1">계약</SelectItem>
              <SelectItem value="2">기획</SelectItem>
              <SelectItem value="3">디자인</SelectItem>
              <SelectItem value="4">프론트엔드</SelectItem>
              <SelectItem value="5">백엔드</SelectItem>
              <SelectItem value="6">유지보수</SelectItem>
              <SelectItem value="7">기타</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="건별작업이 없습니다." description="조건에 맞는 작업이 없습니다." />
        ) : (
          <div className="space-y-2 animate-stagger">
            {items.map((item) => (
              <Link key={item.id} href={`/tasks/${item.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 rounded-md ${taskTypeColors[item.task_type_label] || ""}`}>
                            {item.task_type_label}
                          </Badge>
                        </div>
                        <h3 className="text-sm font-medium mb-2 line-clamp-2">{item.title}</h3>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(item.created_at)}</span>
                          {item.deadline && <span className="text-amber-600">마감: {item.deadline}</span>}
                        </div>
                      </div>
                      <StatusBadge status={item.status} type="task" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" className="rounded-xl" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1;
              return <Button key={page} variant={page === currentPage ? "default" : "outline"} size="sm" className="rounded-xl min-w-[36px]" onClick={() => setCurrentPage(page)}>{page}</Button>;
            })}
            <Button variant="outline" size="sm" className="rounded-xl" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
