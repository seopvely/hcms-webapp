"use client";

import { useEffect, useState } from "react";
import {
  Coins,
  Search,
  TrendingUp,
  PiggyBank,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  History,
  Users,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useNavigationStore } from "@/store/navigation-store";
import { EmptyState, LoadingState } from "@/components/common";
import { AnimatedCounter } from "@/components/common/animated-counter";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { usePointUsage } from "@/lib/api-hooks";
import { formatDateTime } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

const WORKER_TYPE_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "계약", color: "bg-blue-100 text-blue-700" },
  2: { label: "기획", color: "bg-emerald-100 text-emerald-700" },
  3: { label: "디자인", color: "bg-cyan-100 text-cyan-700" },
  4: { label: "프론트엔드", color: "bg-amber-100 text-amber-700" },
  5: { label: "백엔드", color: "bg-red-100 text-red-700" },
  6: { label: "유지보수", color: "bg-slate-100 text-slate-700" },
};

const POINT_TYPE_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "충전", color: "bg-emerald-100 text-emerald-700" },
  2: { label: "사용", color: "bg-red-100 text-red-700" },
  3: { label: "책정", color: "bg-cyan-100 text-cyan-700" },
};

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  1: { label: "입력", color: "bg-amber-100 text-amber-700" },
  2: { label: "실행", color: "bg-emerald-100 text-emerald-700" },
};

function formatNumber(n: number): string {
  return n.toLocaleString("ko-KR");
}

export default function PointUsagePage() {
  const { setPageTitle } = useNavigationStore();

  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pointTypeFilter, setPointTypeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [excelLoading, setExcelLoading] = useState(false);

  useEffect(() => {
    setPageTitle("포인트 사용현황");
  }, [setPageTitle]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, isLoading } = usePointUsage({
    project_id: selectedProjectId,
    search_text: debouncedSearch || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    point_type: pointTypeFilter || undefined,
    page: currentPage,
    per_page: 20,
  });

  function handleProjectChange(val: string) {
    setSelectedProjectId(Number(val));
    setCurrentPage(1);
  }

  function handleSearch() {
    setDebouncedSearch(searchText);
    setCurrentPage(1);
  }

  function handleReset() {
    setSearchText("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
    setPointTypeFilter("");
    setCurrentPage(1);
  }

  async function handleExcelDownload() {
    setExcelLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const params = new URLSearchParams();
      if (selectedProjectId) params.append("project_id", String(selectedProjectId));
      if (debouncedSearch) params.append("search_text", debouncedSearch);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (pointTypeFilter) params.append("point_type", pointTypeFilter);
      const response = await fetch(`/api/point-usage/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("엑셀 생성 실패");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "포인트사용내역.xlsx";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } catch (e) {
      console.error("엑셀 다운로드 오류:", e);
    } finally {
      setExcelLoading(false);
    }
  }

  if (isLoading) {
    return (
      <PageTransition>
        <div className="space-y-4">
          <div className="h-10 bg-muted/50 rounded-xl animate-pulse" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </PageTransition>
    );
  }

  if (!data?.maintenance_customer || !data?.current_project) {
    return (
      <PageTransition>
        <div className="space-y-4">
          <Card className="rounded-2xl border-amber-200 bg-amber-50">
            <CardContent className="p-6 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-800">
                현재 진행 중인 유지보수 계약이 없습니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </PageTransition>
    );
  }

  const project = data.current_project;
  const histories = data.point_histories;
  const totalPages = histories.total_pages;
  const usagePercent = data.total_points > 0
    ? Math.round((data.used_points / data.total_points) * 100)
    : 0;
  const remainPercent = data.total_points > 0
    ? Math.round((data.remaining_points / data.total_points) * 100)
    : 0;

  return (
    <PageTransition>
      <div className="space-y-5">
        {/* Project Selector */}
        {data.projects_with_balance.length > 1 && (
          <Card className="rounded-2xl">
            <CardContent className="p-4">
              <label className="text-xs text-muted-foreground mb-1.5 block">
                유지보수 프로젝트 선택
              </label>
              <Select
                value={String(project.id)}
                onValueChange={handleProjectChange}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {data.projects_with_balance.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.title} (월 {formatNumber(p.monthly_point)}P / 잔여: {formatNumber(p.remaining_points)}P)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Contract Info */}
        <Card className="rounded-2xl overflow-hidden border-0 shadow-lg">
          <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
            <h2 className="text-sm font-semibold opacity-90 mb-1">
              {project.title}
            </h2>
            <p className="text-xs text-white/70 mb-4">
              계약기간: {data.period_start} ~ {data.period_end}
            </p>

            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <Coins className="h-4 w-4 mx-auto mb-1 opacity-80" />
                <p className="text-xs text-white/70">총 포인트</p>
                <p className="text-lg font-bold">
                  <AnimatedCounter value={data.total_points} />
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <TrendingUp className="h-4 w-4 mx-auto mb-1 opacity-80" />
                <p className="text-xs text-white/70">사용</p>
                <p className="text-lg font-bold">
                  <AnimatedCounter value={data.used_points} />
                </p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-center">
                <PiggyBank className="h-4 w-4 mx-auto mb-1 opacity-80" />
                <p className="text-xs text-white/70">잔여</p>
                <p className="text-lg font-bold">
                  <AnimatedCounter value={data.remaining_points} />
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>사용 {usagePercent}%</span>
                <span>잔여 {remainPercent}%</span>
              </div>
              <div className="h-2.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white/80 rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Monthly Chart */}
        {data.chart_data.length > 0 && data.chart_data.some((d) => d.usage > 0) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">월별 사용 추이</h2>
            </div>
            <Card className="rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-end gap-2 h-32">
                  {(() => {
                    const maxUsage = Math.max(...data.chart_data.map((d) => d.usage), 1);
                    return data.chart_data.map((d) => {
                      const height = (d.usage / maxUsage) * 100;
                      return (
                        <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {d.usage > 0 ? formatNumber(d.usage) : ""}
                          </span>
                          <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                            <div
                              className="w-full max-w-[40px] bg-gradient-to-t from-[#667eea] to-[#764ba2] rounded-t-md transition-all duration-700"
                              style={{ height: `${Math.max(height, 2)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {d.month.slice(5)}월
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Worker Stats */}
        {data.worker_stats.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">담당자별 사용 현황</h2>
            </div>
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                {data.worker_stats.map((stat, idx) => {
                  const wt = WORKER_TYPE_MAP[stat.worker_type] || { label: "미지정", color: "bg-slate-100 text-slate-700" };
                  const pct = data.total_points > 0
                    ? Math.round((stat.total_used / data.total_points) * 100)
                    : 0;
                  return (
                    <div
                      key={idx}
                      className={`p-4 ${idx < data.worker_stats.length - 1 ? "border-b" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{stat.writer_name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${wt.color}`}>
                            {wt.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{formatNumber(stat.total_used)}P</span>
                          <span>{stat.usage_count}건</span>
                        </div>
                      </div>
                      {data.total_points > 0 && (
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Point History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">포인트 사용 내역</h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl text-xs gap-1.5"
              onClick={handleExcelDownload}
              disabled={excelLoading}
            >
              <Download className="h-3.5 w-3.5" />
              {excelLoading ? "다운로드 중..." : "엑셀 다운로드"}
            </Button>
          </div>

          {/* Filters */}
          <Card className="rounded-2xl mb-3">
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="내용 검색"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-10 h-10 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-1 sm:hidden">시작일</span>
                  <DatePicker
                    value={dateFrom}
                    onChange={(val) => { setDateFrom(val); setCurrentPage(1); }}
                    placeholder="시작일"
                    className="text-sm sm:text-xs"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-muted-foreground block mb-1 sm:hidden">종료일</span>
                  <DatePicker
                    value={dateTo}
                    onChange={(val) => { setDateTo(val); setCurrentPage(1); }}
                    placeholder="종료일"
                    className="text-sm sm:text-xs"
                  />
                </div>
                <Select
                  value={pointTypeFilter}
                  onValueChange={(val) => { setPointTypeFilter(val === "all" ? "" : val); setCurrentPage(1); }}
                >
                  <SelectTrigger className="rounded-xl h-10 text-sm sm:text-xs">
                    <SelectValue placeholder="포인트 유형" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="1">충전</SelectItem>
                    <SelectItem value="2">사용</SelectItem>
                    <SelectItem value="3">책정</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-10 rounded-xl text-sm sm:text-xs"
                  onClick={handleReset}
                >
                  초기화
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History List */}
          {histories.items.length === 0 ? (
            <EmptyState
              icon={Coins}
              title="포인트 사용 내역이 없습니다."
              description="해당 기간에 포인트 내역이 없습니다."
            />
          ) : (
            <div className="space-y-2 animate-stagger">
              {histories.items.map((item) => {
                const pt = POINT_TYPE_MAP[item.point_type] || { label: "-", color: "bg-slate-100 text-slate-700" };
                const st = STATUS_MAP[item.status] || { label: "-", color: "bg-slate-100 text-slate-700" };
                const wt = item.worker_type ? WORKER_TYPE_MAP[item.worker_type] : null;
                const isCharge = Number(item.point_type) === 1;
                const isAlloc = Number(item.point_type) === 3;

                return (
                  <Card
                    key={item.id}
                    className={`rounded-2xl overflow-hidden border-l-4 ${
                      isCharge ? "border-l-emerald-500" : isAlloc ? "border-l-cyan-500" : "border-l-red-400"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${pt.color}`}>
                            {pt.label}
                          </Badge>
                          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${st.color}`}>
                            {st.label}
                          </Badge>
                          {wt && (
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${wt.color}`}>
                              {wt.label}
                            </Badge>
                          )}
                        </div>
                        <span className={`text-base font-bold whitespace-nowrap ${
                          isCharge ? "text-emerald-600" : isAlloc ? "text-cyan-600" : "text-red-500"
                        }`}>
                          {isCharge ? "+" : isAlloc ? "" : "-"}{formatNumber(item.point)}P
                        </span>
                      </div>
                      <p className="text-sm text-foreground line-clamp-2">
                        {item.content || "-"}
                      </p>
                      {item.managelist_title && (
                        <p className="text-xs text-muted-foreground mt-1">
                          요청: {item.managelist_title}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateTime(item.created_at)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
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
      </div>
    </PageTransition>
  );
}
