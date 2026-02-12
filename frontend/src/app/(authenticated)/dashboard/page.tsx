"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Wrench,
  ClipboardList,
  Newspaper,
  FileText,
  ArrowRight,
  Calendar,
  TrendingUp,
  Activity,
  ChevronRight,
  FolderOpen,
  Users,
  Bell,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigationStore } from "@/store/navigation-store";
import { useAuthStore } from "@/store/auth-store";
import { StatusBadge, LoadingState } from "@/components/common";
import { AnimatedCounter } from "@/components/common/animated-counter";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { useDashboard } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { setPageTitle } = useNavigationStore();
  const { user } = useAuthStore();
  const { data, isLoading, error } = useDashboard();

  useEffect(() => {
    setPageTitle("대시보드");
  }, [setPageTitle]);

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  function getActivityHref(item: { type: string; id: number }): string | null {
    if (item.type === "maintenance") return `/maintenance/${item.id}`;
    return null;
  }

  function getActivityTypeLabel(type: string): string {
    switch (type) {
      case "maintenance": return "유지보수";
      case "inquiry": return "문의";
      default: return type;
    }
  }

  const statCards = [
    {
      label: "유지보수 요청",
      count: data?.stat_cards.maintenance_count ?? 0,
      icon: Wrench,
      href: "/maintenance",
      gradient: "from-blue-500 to-blue-600",
      shadow: "shadow-blue-500/25",
    },
    {
      label: "건별작업",
      count: data?.stat_cards.task_count ?? 0,
      icon: ClipboardList,
      href: "/tasks",
      gradient: "from-emerald-500 to-emerald-600",
      shadow: "shadow-emerald-500/25",
    },
    {
      label: "최신소식",
      count: data?.stat_cards.news_count ?? 0,
      icon: Newspaper,
      href: "/news",
      gradient: "from-purple-500 to-purple-600",
      shadow: "shadow-purple-500/25",
    },
    {
      label: "견적/계약",
      count: data?.stat_cards.estimate_count ?? 0,
      icon: FileText,
      href: "/estimates",
      gradient: "from-amber-500 to-amber-600",
      shadow: "shadow-amber-500/25",
    },
  ];

  if (isLoading) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div className="h-14 bg-muted/50 rounded-xl animate-pulse" />
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

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold">
            안녕하세요, {data?.user.name || user?.name || "고객"}님
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
            <Calendar className="h-3.5 w-3.5" />
            {today}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-stagger">
          {statCards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card
                className={`overflow-hidden border-0 shadow-lg ${card.shadow} hover:scale-[1.02] transition-transform`}
              >
                <CardContent
                  className={`bg-gradient-to-br ${card.gradient} p-4 text-white`}
                >
                  <card.icon className="h-6 w-6 mb-2 opacity-80" />
                  <p className="text-2xl font-bold">
                    <AnimatedCounter value={card.count} duration={800} />
                  </p>
                  <p className="text-xs opacity-90">{card.label}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Point Summary */}
        {data?.point_summary && data.point_summary.total_points > 0 && (
          <Card className="rounded-2xl overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-5 w-5 opacity-80" />
                <h2 className="text-sm font-semibold opacity-90">포인트 현황</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-white/70">총 포인트</p>
                  <p className="text-lg font-bold">
                    <AnimatedCounter value={data.point_summary.total_points} suffix=" P" />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/70">사용</p>
                  <p className="text-lg font-bold">
                    <AnimatedCounter value={data.point_summary.used_points} suffix=" P" />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-white/70">잔여</p>
                  <p className="text-lg font-bold">
                    <AnimatedCounter value={data.point_summary.remaining_points} suffix=" P" />
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3">
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/80 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.max(data.point_summary.point_percent, 0)}%` }}
                  />
                </div>
                <p className="text-xs text-white/60 mt-1 text-right">
                  {data.point_summary.point_percent}% 잔여
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Maintenance Status */}
        {data?.maintenance_stats && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">유지보수 현황</h2>
              <span className="text-xs text-muted-foreground">이번 달 {data.maintenance_stats.monthly_requests}건</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Card className="rounded-2xl">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-amber-500">
                    <AnimatedCounter value={data.maintenance_stats.pending} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">접수</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-blue-500">
                    <AnimatedCounter value={data.maintenance_stats.in_progress} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">진행중</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl">
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-500">
                    <AnimatedCounter value={data.maintenance_stats.completed} />
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">완료</p>
                </CardContent>
              </Card>
            </div>
            {/* Response rate bar */}
            <Card className="rounded-2xl mt-3">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">응답률</p>
                  <p className="text-sm font-bold text-emerald-600">{data.response_rate}%</p>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${data.response_rate}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Project Progress */}
        {data?.project_progress && data.project_progress.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">프로젝트 진행률</h2>
            </div>
            <div className="space-y-3">
              {data.project_progress.map((proj) => (
                <Card key={proj.id} className="rounded-2xl">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium truncate flex-1">{proj.title}</p>
                      <span className="text-xs font-semibold text-primary ml-2">{proj.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${proj.progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{proj.project_type || "프로젝트"}</span>
                      <span>
                        {proj.completed_tasks}/{proj.total_tasks} 작업 완료
                      </span>
                    </div>
                    {proj.contract_termination_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        만료: {formatDate(proj.contract_termination_date)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">빠른 작업</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/maintenance">
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-blue-100 p-2.5">
                    <Wrench className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">유지보수 요청하기</p>
                    <p className="text-xs text-muted-foreground">
                      새 요청 등록
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/news">
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer hover-lift">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="rounded-xl bg-purple-100 p-2.5">
                    <Newspaper className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">최신소식 확인</p>
                    <p className="text-xs text-muted-foreground">
                      새 소식 보기
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Latest News */}
        {data?.latest_news && data.latest_news.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">최신소식</h2>
              </div>
              <Link href="/news" className="text-xs text-primary font-medium flex items-center gap-1">
                전체보기 <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                {data.latest_news.map((news, idx) => (
                  <Link key={news.id} href={`/news/${news.id}`}>
                    <div
                      className={`flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors ${
                        idx < data.latest_news.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{news.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(news.created_at)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Worker Stats */}
        {data?.worker_stats && data.worker_stats.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">담당자별 작업 현황</h2>
            </div>
            <Card className="rounded-2xl">
              <CardContent className="p-0">
                {data.worker_stats.map((worker, idx) => (
                  <div
                    key={worker.name}
                    className={`flex items-center justify-between p-4 ${
                      idx < data.worker_stats.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <p className="text-sm font-medium">{worker.name}</p>
                    <div className="flex items-center gap-3">
                      {worker.in_progress_count > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          진행 {worker.in_progress_count}
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                        완료 {worker.completed_count}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Activity */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">최근 활동</h2>
          </div>
          <Card className="rounded-2xl">
            <CardContent className="p-0">
              {(!data?.recent_activities || data.recent_activities.length === 0) ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  최근 활동이 없습니다.
                </div>
              ) : (
                <div className="animate-stagger">
                  {data.recent_activities.map((item, idx) => {
                    const href = getActivityHref(item);
                    const content = (
                      <div
                        className={`flex items-center gap-3 p-4 ${
                          idx < data.recent_activities.length - 1 ? "border-b" : ""
                        } ${href ? "hover:bg-accent/50 cursor-pointer transition-colors rounded-xl" : ""}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {getActivityTypeLabel(item.type)} · {formatDate(item.date)}
                          </p>
                        </div>
                        <StatusBadge
                          status={String(item.status)}
                          type={item.type === "maintenance" ? "maintenance" : "task"}
                        />
                        {href && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>
                    );

                    return href ? (
                      <Link key={idx} href={href}>{content}</Link>
                    ) : (
                      <div key={idx}>{content}</div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
