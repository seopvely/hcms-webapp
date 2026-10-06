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
  Server,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Code2,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigationStore } from "@/store/navigation-store";
import { useAuthStore } from "@/store/auth-store";
import { StatusBadge, LoadingState } from "@/components/common";
import { AnimatedCounter } from "@/components/common/animated-counter";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { useDashboard, useSiteStatus } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { setPageTitle } = useNavigationStore();
  const { user } = useAuthStore();
  const { data, isLoading, error } = useDashboard();
  const { data: siteStatusData, isLoading: siteStatusLoading } = useSiteStatus();

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
      count: data?.stat_cards?.maintenance_count ?? 0,
      icon: Wrench,
      href: "/maintenance",
      gradient: "from-blue-500 to-blue-600",
      shadow: "shadow-blue-500/25",
    },
    {
      label: "건별작업",
      count: data?.stat_cards?.task_count ?? 0,
      icon: ClipboardList,
      href: "/tasks",
      gradient: "from-emerald-500 to-emerald-600",
      shadow: "shadow-emerald-500/25",
    },
    {
      label: "최신소식",
      count: data?.stat_cards?.news_count ?? 0,
      icon: Newspaper,
      href: "/news",
      gradient: "from-purple-500 to-purple-600",
      shadow: "shadow-purple-500/25",
    },
    {
      label: "견적/계약",
      count: data?.stat_cards?.estimate_count ?? 0,
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
            안녕하세요, {data?.user?.name || user?.name || "고객"}님
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

        {/* Free Maintenance — 계약만료 후 무상 유지보수 기간 / 종료 후 전환 유도 */}
        {data?.free_maint && (() => {
          const fm = data.free_maint;
          const showCta = (fm.state === "free_ended" || fm.ending_soon) && !data.maint_subscription?.has_maint_subscription;
          const extendHref = `/inquiries/create?service=${encodeURIComponent("계약연장")}&plan=${encodeURIComponent(fm.project_title || "")}`;
          return (
            <Card className="rounded-2xl overflow-hidden border-0 shadow-lg">
              <div className={`p-5 text-white bg-gradient-to-r ${
                fm.state === "free_ended"
                  ? "from-slate-500 to-slate-600"
                  : fm.ending_soon
                    ? "from-amber-500 to-orange-500"
                    : "from-teal-500 to-emerald-500"
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 opacity-80" />
                    <h2 className="text-sm font-semibold opacity-90">
                      {fm.state === "free_ended" ? "무상 유지보수 종료" : "무상 유지보수 중"}
                    </h2>
                  </div>
                  {fm.state === "free_maint" && fm.days_left !== null && (
                    <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">D-{fm.days_left}</span>
                  )}
                </div>
                <p className="text-base font-bold">{fm.project_title}</p>
                <p className="text-xs text-white/80 mt-1">
                  무상 기간: {formatDate(fm.start_date)} ~ {formatDate(fm.end_date)}
                </p>
                {fm.state === "free_maint" ? (
                  <p className="text-xs text-white/90 mt-2">
                    {fm.ending_soon
                      ? "무상 유지보수가 곧 종료됩니다. 종료 후에는 유지보수 플랜 또는 계약 연장이 필요합니다."
                      : "계약은 만료되었지만 이 기간에는 포인트 차감 없이 유지보수를 요청할 수 있습니다."}
                  </p>
                ) : (
                  <p className="text-xs text-white/90 mt-2">
                    유지보수 플랜을 신청하거나 계약을 연장하시면 계속 유지보수를 받으실 수 있습니다.
                  </p>
                )}
                {fm.scope && fm.state === "free_maint" && (
                  <p className="text-xs text-white/80 mt-1 line-clamp-2">무상 범위: {fm.scope}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  {fm.state === "free_maint" && (
                    <Link href="/maintenance/new" className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-white/90">
                      유지보수 요청 <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                  {showCta && (
                    <>
                      <Link href="/services" className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/30">
                        유지보수 플랜 보기
                      </Link>
                      <Link href={extendHref} className="inline-flex items-center gap-1 rounded-xl bg-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/30">
                        계약 연장 문의
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Dev Subscription Credits */}
        {data?.dev_subscription?.has_dev_subscription && (
          <Card className="rounded-2xl overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-r from-[#11998e] to-[#38ef7d] p-5 text-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Code2 className="h-5 w-5 opacity-80" />
                  <h2 className="text-sm font-semibold opacity-90">개발 구독 크레딧</h2>
                </div>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                  {data.dev_subscription.plan_label}
                </span>
              </div>

              {/* 운영 크레딧 */}
              {data.dev_subscription.maint_points_total > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-white/70 mb-1">운영 크레딧 (이번 달)</p>
                  <div className="grid grid-cols-3 gap-4 mb-2">
                    <div>
                      <p className="text-[10px] text-white/60">월 지급</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.dev_subscription.maint_points_total} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/60">사용</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.dev_subscription.maint_points_used} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/60">잔여</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.dev_subscription.maint_points_remaining} suffix=" P" />
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/80 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${data.dev_subscription.maint_points_total > 0
                          ? Math.max(0, Math.round((data.dev_subscription.maint_points_remaining / data.dev_subscription.maint_points_total) * 100))
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 개발 크레딧 */}
              {data.dev_subscription.dev_points_total > 0 && (
                <div className={data.dev_subscription.maint_points_total > 0 ? "pt-3 border-t border-white/20" : ""}>
                  <p className="text-xs text-white/70 mb-1">개발 크레딧 (이번 달)</p>
                  <div className="grid grid-cols-3 gap-4 mb-2">
                    <div>
                      <p className="text-[10px] text-white/60">월 지급</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.dev_subscription.dev_points_total} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/60">사용</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.dev_subscription.dev_points_used} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/60">잔여</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.dev_subscription.dev_points_remaining} suffix=" P" />
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/80 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${data.dev_subscription.dev_points_total > 0
                          ? Math.max(0, Math.round((data.dev_subscription.dev_points_remaining / data.dev_subscription.dev_points_total) * 100))
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              )}

              <Link href="/dev-requests" className="mt-3 flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors pt-3">
                개발 요청 보기 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </Card>
        )}

        {/* Maint Subscription Credits */}
        {data?.maint_subscription?.has_maint_subscription && (
          <Card className="rounded-2xl overflow-hidden border-0 shadow-lg">
            <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 opacity-80" />
                  <h2 className="text-sm font-semibold opacity-90">유지보수 구독 크레딧</h2>
                </div>
                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                  {data.maint_subscription.plan_label}
                </span>
              </div>

              {data.maint_subscription.monthly_points > 0 && (
                <>
                  <p className="text-xs text-white/70 mb-1">운영 크레딧 (이번 달)</p>
                  <div className="grid grid-cols-3 gap-4 mb-2">
                    <div>
                      <p className="text-[10px] text-white/60">월 지급</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.maint_subscription.monthly_points} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/60">사용</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.maint_subscription.points_used} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-white/60">잔여</p>
                      <p className="text-base font-bold">
                        <AnimatedCounter value={data.maint_subscription.points_remaining} suffix=" P" />
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/80 rounded-full transition-all duration-1000 ease-out"
                      style={{
                        width: `${data.maint_subscription.monthly_points > 0
                          ? Math.max(0, Math.round((data.maint_subscription.points_remaining / data.maint_subscription.monthly_points) * 100))
                          : 0}%`
                      }}
                    />
                  </div>
                </>
              )}

              <div className="mt-3 flex items-center gap-4 pt-3">
                <Link href="/maint-subscription" className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors">
                  내 플랜 보기 <ArrowRight className="h-3 w-3" />
                </Link>
                <Link href="/maintenance" className="flex items-center gap-1 text-xs text-white/80 hover:text-white transition-colors">
                  유지보수 요청 보기 <ArrowRight className="h-3 w-3" />
                </Link>
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
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>만료: {formatDate(proj.contract_termination_date)}</span>
                        {(proj.free_maint_state === "free_maint" || proj.free_maint_state === "free_upcoming") && proj.free_maint_end_date && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            proj.free_maint_state === "free_maint" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-600"
                          }`}>
                            무상 ~{formatDate(proj.free_maint_end_date)}
                          </span>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Site Status */}
        {!siteStatusLoading && (() => {
          const sites = siteStatusData ?? [];
          const okCount = sites.filter((s) => s.status === "ok").length;
          const downCount = sites.filter((s) => s.status === "down").length;
          return (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">사이트 현황</h2>
                </div>
                {sites.length > 0 && (
                  <Link href="/site-status" className="text-xs text-primary font-medium flex items-center gap-1">
                    자세히 <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>
              {sites.length === 0 ? (
                <Card className="rounded-2xl">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Server className="h-8 w-8 mb-2 opacity-25" />
                    <p className="text-sm">연결된 사이트가 없습니다.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card className="rounded-2xl overflow-hidden">
                  <div className="flex border-b">
                    <div className="flex-1 flex flex-col items-center justify-center py-3 border-r">
                      <p className="text-xl font-bold text-emerald-500">{okCount}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">정상</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center py-3 border-r">
                      <p className="text-xl font-bold text-red-500">{downCount}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">다운</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center py-3">
                      <p className="text-xl font-bold">{sites.length}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">전체</p>
                    </div>
                  </div>
                  <CardContent className="p-0">
                    {sites.map((site, idx) => (
                      <div
                        key={site.site_id}
                        className={`flex items-center gap-3 px-4 py-3 ${idx < sites.length - 1 ? "border-b" : ""}`}
                      >
                        {site.status === "ok"
                          ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                          : site.status === "down"
                          ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          : <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}
                        <p className="text-sm flex-1 truncate">{site.site_name}</p>
                        {site.response_ms !== null && (
                          <span className="text-[11px] text-muted-foreground shrink-0">{site.response_ms}ms</span>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          );
        })()}

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
