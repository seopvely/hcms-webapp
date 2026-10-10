"use client";
import { useEffect } from "react";
import { ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffMe } from "@/lib/staff-hooks";
import { CMS_BASE } from "@/components/managed/staff-nav";

export default function ManagedDashboardPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);
  const { data: me } = useStaffMe();

  useEffect(() => {
    setPageTitle("직원 대시보드");
  }, [setPageTitle]);

  if (!me) return null;

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-r from-[#667eea] to-[#764ba2] p-6 text-white">
          <p className="text-sm text-white/80">직원 관리</p>
          <h1 className="mt-1 text-xl font-bold">{me.name || me.username}님, 안녕하세요</h1>
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
              표시)는 cms 화면이 새 탭으로 열립니다.
            </p>
            <a href={`${CMS_BASE}/managed/main`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
              cms 관리 화면 열기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </CardContent>
        </Card>
      </div>
    </PageTransition>
  );
}
