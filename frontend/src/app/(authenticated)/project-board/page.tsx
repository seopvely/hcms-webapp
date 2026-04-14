"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  MessageCircle,
  Eye,
  Paperclip,
  Pin,
  Reply,
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
import { EmptyState, LoadingState } from "@/components/common";
import { PageTransition } from "@/components/layout/page-transition";
import {
  useProjectBoards,
  useBoardProjects,
  useBoardCategories,
} from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "1", label: "진행중" },
  { value: "2", label: "완료" },
  { value: "3", label: "보류" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "1":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
          진행중
        </Badge>
      );
    case "2":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
          완료
        </Badge>
      );
    case "3":
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs">
          보류
        </Badge>
      );
    default:
      return null;
  }
}

export default function ProjectBoardListPage() {
  const { setPageTitle } = useNavigationStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  useEffect(() => {
    setPageTitle("프로젝트구축진행");
  }, [setPageTitle]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const projectId = selectedProject !== "all" ? Number(selectedProject) : undefined;
  const categoryId = selectedCategory !== "all" ? Number(selectedCategory) : undefined;

  const { data: projectsData } = useBoardProjects();
  const { data: categoriesData } = useBoardCategories(projectId ?? null);

  const { data, isLoading } = useProjectBoards({
    page: currentPage,
    per_page: 15,
    search: debouncedSearch || undefined,
    project_id: projectId,
    category_id: categoryId,
    status: selectedStatus !== "all" ? selectedStatus : undefined,
  });

  // 프로젝트 변경 시 카테고리 초기화
  useEffect(() => {
    setSelectedCategory("all");
  }, [selectedProject]);

  if (isLoading) {
    return (
      <PageTransition>
        <LoadingState message="게시글을 불러오는 중..." />
      </PageTransition>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const projects = projectsData?.projects ?? [];
  const categories = categoriesData?.categories ?? [];

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* Search + Filters */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="제목, 내용 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-xl"
              />
            </div>
            <Link href="/project-board/create">
              <Button className="h-11 rounded-xl px-4 gap-1 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">글쓰기</span>
              </Button>
            </Link>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select value={selectedProject} onValueChange={(v) => { setSelectedProject(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9 rounded-xl text-xs">
                <SelectValue placeholder="프로젝트" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 프로젝트</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {projectId && categories.length > 0 && (
              <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setCurrentPage(1); }}>
                <SelectTrigger className="w-[140px] h-9 rounded-xl text-xs">
                  <SelectValue placeholder="구성 메뉴" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 메뉴</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[120px] h-9 rounded-xl text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="등록된 게시글이 없습니다."
            description="새로운 요청사항을 등록해주세요."
            actionLabel="글쓰기"
            onAction={() => {
              window.location.href = "/project-board/create";
            }}
          />
        ) : (
          <div className="space-y-2 animate-stagger">
            {items.map((item) => (
              <Link key={item.id} href={`/project-board/${item.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {item.is_notice && (
                            <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0 gap-0.5">
                              <Pin className="h-2.5 w-2.5" />
                              공지
                            </Badge>
                          )}
                          {item.categories?.map((cat, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                              style={{
                                backgroundColor: cat.color ? `${cat.color}15` : undefined,
                                color: cat.color || undefined,
                                borderColor: cat.color ? `${cat.color}40` : undefined,
                              }}
                            >
                              {cat.name}
                            </Badge>
                          ))}
                          <h3 className="text-sm font-medium line-clamp-1 flex-1">
                            {item.title}
                          </h3>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {item.project_name && (
                            <span className="truncate max-w-[120px]">{item.project_name}</span>
                          )}
                          <span className="flex items-center gap-0.5">
                            {item.writer_type === "1" ? (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-blue-600 border-blue-200">관리자</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-600 border-emerald-200">담당자</Badge>
                            )}
                            {item.writer_name}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-0.5">
                            <Eye className="h-3 w-3" />
                            {item.views}
                          </span>
                          {item.reply_count > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Reply className="h-3 w-3" />
                              {item.reply_count}
                            </span>
                          )}
                          {item.comment_count > 0 && (
                            <span className="flex items-center gap-0.5">
                              <MessageCircle className="h-3 w-3" />
                              {item.comment_count}
                            </span>
                          )}
                          {item.has_attachment && (
                            <Paperclip className="h-3 w-3" />
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
              let page: number;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (currentPage <= 3) {
                page = i + 1;
              } else if (currentPage >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = currentPage - 2 + i;
              }
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
