"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Bot, ChevronRight, CalendarDays, CreditCard } from "lucide-react";
import { useNavigationStore } from "@/store/navigation-store";
import { PageTransition } from "@/components/layout/page-transition";
import { EmptyState } from "@/components/common";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { useAIDevSubscriptions } from "@/lib/api-hooks";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
  pending: "bg-amber-100 text-amber-700",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "text-slate-700 bg-slate-100",
  business: "text-blue-700 bg-blue-100",
  agency: "text-purple-700 bg-purple-100",
  enterprise: "text-rose-700 bg-rose-100",
};

export default function AIDevSubscriptionPage() {
  const { setPageTitle } = useNavigationStore();
  const { data: subscriptions, isLoading } = useAIDevSubscriptions();

  useEffect(() => {
    setPageTitle("AI 개발팀 구독");
  }, [setPageTitle]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-purple-700 p-5 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">AI 개발팀 구독</h1>
              <p className="text-sm text-white/75">AI 개발팀 구독 현황을 확인합니다</p>
            </div>
          </div>
        </div>

        {/* 목록 */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : !subscriptions?.length ? (
          <EmptyState
            icon={Bot}
            title="AI 개발팀 구독 없음"
            description="등록된 AI 개발팀 구독이 없습니다."
          />
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <Link
                key={sub.seq}
                href={`/ai-dev-subscription/${sub.seq}`}
                className="block rounded-2xl border bg-card p-4 hover:border-violet-300 hover:bg-violet-50/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-lg px-2.5 py-1 text-sm font-bold ${
                        PLAN_COLORS[sub.plan_type] ?? "text-gray-700 bg-gray-100"
                      }`}
                    >
                      {sub.plan_label}
                    </span>
                    {sub.is_beta && (
                      <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 text-xs">
                        BETA
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[sub.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {sub.status_label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 shrink-0" />
                    <span>월 {sub.monthly_price.toLocaleString()}원</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span>다음 청구 {sub.next_charge_date}</span>
                  </div>
                </div>
                {sub.build_fee > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    구축비: {sub.build_fee.toLocaleString()}원
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
