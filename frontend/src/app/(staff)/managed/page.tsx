"use client";
import { useEffect } from "react";
import {
  CheckCircle2,
  ExternalLink,
  FolderKanban,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffDashboard, useStaffMe } from "@/lib/staff-hooks";
import { CMS_BASE } from "@/components/managed/staff-nav";

interface StatCard {
  label: string;
  value: number;
  sub?: string;
  icon: LucideIcon;
  href: string; // 아직 cms 화면 — 이관되면 /managed 경로로
}

export default function ManagedDashboardPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);
  const { data: me } = useStaffMe();
  const { data: stats } = useStaffDashboard();

  useEffect(() => {
    setPageTitle("직원 대시보드");
  }, [setPageTitle]);

  if (!me) return null;

  const cards: StatCard[] = stats
    ? [
        { label: "진행중 프로젝트", value: stats.projects_in_progress, sub: `전체 ${stats.projects_total}개`, icon: FolderKanban, href: `${CMS_BASE}/managed/processlist` },
        { label: "활성 고객", value: stats.active_customers, sub: "프로젝트 1개 이상", icon: Users, href: `${CMS_BASE}/managed/custom` },
        { label: "처리중인 요청", value: stats.maintenance_in_progress, sub: `신규 ${stats.maintenance_new}건`, icon: Wrench, href: `${CMS_BASE}/managed/managelist` },
        { label: "대기중 문의", value: stats.inquiries_waiting, sub: "대기·답변중", icon: MessageSquare, href: `${CMS_BASE}/managed/oneperone` },
        { label: "완료된 작업", value: stats.completed_30d, sub: "최근 30일", icon: CheckCircle2, href: `${CMS_BASE}/managed/managelist` },
        { label: "유지보수 전환 대기", value: stats.maint_renewal_pending, sub: "고객 응답 대기", icon: RefreshCw, href: `${CMS_BASE}/managed/maint-renewal/?tab=pending` },
      ]
    : [];

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-6 text-white">
          <p className="text-sm text-white/80">직원 관리</p>
          <h1 className="mt-1 text-xl font-bold">{me.name || me.username}님, 안녕하세요</h1>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {!stats
            ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
            : cards.map((c) => (
                <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer">
                  <Card className="h-full rounded-2xl transition-shadow hover:shadow-md">
                    <CardContent className="space-y-1 pt-5 pb-5">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        {c.label}
                        <c.icon className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-bold">{c.value.toLocaleString()}</p>
                      {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
                    </CardContent>
                  </Card>
                </a>
              ))}
        </div>

        <Card className="rounded-2xl">
          <CardContent className="flex items-center gap-3 pt-5 pb-5">
            {me.two_factor_enabled ? (
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            )}
            <p className="text-sm">
              2단계 인증 {me.two_factor_enabled ? "사용 중" : "꺼져 있음 — 관리자에게 설정을 요청하세요"}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="space-y-2 pt-5 pb-5 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">관리 화면 이관 중</p>
            <p>
              메뉴는 단계적으로 hcms 로 옮겨집니다. 아직 옮겨지지 않은 메뉴(사이드바의
              <ExternalLink className="mx-1 inline h-3.5 w-3.5" />
              표시)는 cms 화면이 새 탭으로 열립니다. 수익·미수금 카드는 정의(D11) 확정 후 추가됩니다.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
