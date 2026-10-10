"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Server,
  CalendarDays,
  Check,
  Coins,
  Wrench,
  ArrowRight,
  Activity,
  MessageSquare,
} from "lucide-react";
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { EmptyState } from "@/components/common";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { AnimatedCounter } from "@/components/common/animated-counter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMaintSubscription } from "@/lib/api-hooks";
import { formatDate } from "@/lib/utils";

export default function MaintSubscriptionPage() {
  const { setPageTitle } = useNavigationStore();
  const { data, isLoading } = useMaintSubscription();

  useEffect(() => {
    setPageTitle("내 통합 플랜");
  }, [setPageTitle]);

  const sub = data?.subscription;
  const remainingPercent =
    sub && sub.monthly_points > 0
      ? Math.max(0, Math.round((sub.points_remaining / sub.monthly_points) * 100))
      : 0;

  return (
    <PageTransition>
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : !data?.has_subscription || !sub ? (
          <div className="space-y-4">
            <EmptyState
              icon={Server}
              title="이용 중인 통합 플랜 없음"
              description="호스팅과 유지보수를 한 번에 받는 통합 플랜을 확인해 보세요."
            />
            <Link
              href="/services"
              className="flex items-center justify-center gap-1 text-sm text-blue-600 hover:underline"
            >
              통합 플랜 알아보기 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <>
            {/* 플랜 헤더 */}
            <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-5 text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                    <Server className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs text-white/75">통합 플랜 (호스팅 + 유지보수)</p>
                    <h1 className="text-2xl font-bold tracking-tight">{sub.plan_label}</h1>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {sub.is_beta && (
                    <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs">BETA</Badge>
                  )}
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium">
                    {sub.status_label}
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-white/85">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span>시작일 {sub.start_date ? formatDate(sub.start_date) : "-"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-white/85">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span>다음 갱신 {sub.next_charge_date ? formatDate(sub.next_charge_date) : "-"}</span>
                </div>
              </div>
              {sub.hosting_label && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-white/85">
                  <Server className="h-4 w-4 shrink-0" />
                  <span>{sub.hosting_label}</span>
                </div>
              )}
            </div>

            {/* 이번 달 크레딧 */}
            {sub.monthly_points > 0 && (
              <Card className="rounded-2xl">
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Coins className="h-5 w-5 text-blue-600" />
                    <h2 className="font-bold">이번 달 운영 크레딧</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">월 지급</p>
                      <p className="text-lg font-bold">
                        <AnimatedCounter value={sub.monthly_points} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">사용</p>
                      <p className="text-lg font-bold">
                        <AnimatedCounter value={sub.points_used} suffix=" P" />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">잔여</p>
                      <p className="text-lg font-bold text-blue-600">
                        <AnimatedCounter value={sub.points_remaining} suffix=" P" />
                      </p>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${remainingPercent}%` }}
                    />
                  </div>
                  <Link
                    href="/point-usage"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    포인트 사용현황 전체 보기 <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* 이용 서비스 — PACMS 에 등록된 실제 서비스 */}
            {data.services.length > 0 && (
              <Card className="rounded-2xl">
                <CardContent className="pt-5 space-y-3">
                  <h2 className="font-bold">이용 서비스</h2>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {data.services.map((svc, i) => (
                      <li key={`${svc.code}-${i}`} className="flex items-start gap-2 text-sm">
                        <Check className={`h-4 w-4 mt-0.5 shrink-0 ${svc.status === "inactive" ? "text-gray-300" : "text-green-600"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={svc.status === "inactive" ? "text-muted-foreground line-through" : ""}>
                              {svc.name}
                              {svc.spec && <span className="text-muted-foreground"> · {svc.spec}</span>}
                            </span>
                            <Badge
                              className={`text-[10px] px-1.5 py-0 ${
                                svc.status === "active"
                                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                                  : svc.status === "inactive"
                                    ? "bg-gray-100 text-gray-500 hover:bg-gray-100"
                                    : "bg-amber-100 text-amber-700 hover:bg-amber-100"
                              }`}
                            >
                              {svc.status_label}
                            </Badge>
                          </div>
                          {svc.code === "external_hosting" && svc.memo && (
                            <p className="text-xs text-muted-foreground mt-0.5">{svc.memo}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* 포함 서비스 — 서비스 미등록 구독은 요금제 기본 문구로 표시 */}
            {data.services.length === 0 && data.benefits.length > 0 && (
              <Card className="rounded-2xl">
                <CardContent className="pt-5 space-y-3">
                  <h2 className="font-bold">포함 서비스</h2>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {data.benefits.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 shrink-0 text-green-600" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* 바로가기 */}
            <div className="grid gap-3 sm:grid-cols-3">
              <Link
                href="/maintenance"
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <Wrench className="h-5 w-5 text-blue-600" />
                <div className="text-sm">
                  <p className="font-semibold">유지보수 요청</p>
                  <p className="text-xs text-muted-foreground">수정·개선 작업 요청</p>
                </div>
              </Link>
              <Link
                href="/site-status"
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <Activity className="h-5 w-5 text-emerald-600" />
                <div className="text-sm">
                  <p className="font-semibold">사이트 현황</p>
                  <p className="text-xs text-muted-foreground">모니터링·장애 상태</p>
                </div>
              </Link>
              <Link
                href="/inquiries"
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
              >
                <MessageSquare className="h-5 w-5 text-violet-600" />
                <div className="text-sm">
                  <p className="font-semibold">담당 엔지니어 문의</p>
                  <p className="text-xs text-muted-foreground">호스팅·장애 문의</p>
                </div>
              </Link>
            </div>

            {/* 최근 크레딧 사용 */}
            <Card className="rounded-2xl">
              <CardContent className="pt-5 space-y-3">
                <h2 className="font-bold">최근 크레딧 사용 내역</h2>
                {data.recent_usage.length === 0 ? (
                  <p className="text-sm text-muted-foreground">아직 사용 내역이 없습니다.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recent_usage.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate">{u.content || "유지보수 작업"}</p>
                          <p className="text-xs text-muted-foreground">
                            {u.created_at ? formatDate(u.created_at) : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-blue-600">-{u.point} P</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PageTransition>
  );
}
