"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { AppHeader } from "@/components/layout/app-header";
import { StaffSidebar } from "@/components/managed/staff-sidebar";
import { CommandPalette } from "@/components/managed/command-palette";
import { PageSpinner } from "@/components/common/page-spinner";
import { ToastProvider } from "@/components/common/app-toast";
import { NavigationSpinnerProvider } from "@/components/common/navigation-spinner";
import staffApi from "@/lib/staff-api";
import { useStaffMe } from "@/lib/staff-hooks";

// 직원 전용 레이아웃. 고객 (authenticated) 레이아웃(고객 토큰·푸시 등록)과 분리한다.
// 직원 세션이 없으면 staffApi 401 처리로 /login?next=... 로 이동한다.
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isNative = typeof window !== "undefined" && Capacitor.isNativePlatform();
  const { data: me, isError } = useStaffMe();

  if (isNative) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base font-semibold">직원 관리 화면은 웹 브라우저에서 이용해주세요.</p>
        <Link href="/dashboard" className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
          고객 화면으로
        </Link>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base font-semibold">직원 정보를 불러오지 못했습니다.</p>
        <Link href="/login?next=/managed" className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
          다시 로그인
        </Link>
      </div>
    );
  }

  if (!me) return <PageSpinner />;

  const logout = async () => {
    try {
      await staffApi.post("/auth/staff/logout");
    } finally {
      queryClient.removeQueries({ queryKey: ["staff"] });
      router.replace("/login");
    }
  };

  return (
    <ToastProvider>
      <NavigationSpinnerProvider>
        <div className="min-h-screen bg-background">
          <StaffSidebar name={me.name || me.username} email={me.email} onLogout={logout} />
          <CommandPalette isAdmin={!!me.is_admin} onLogout={logout} />
          <div className="lg:pl-64">
            <AppHeader />
            <main className="p-4">{children}</main>
          </div>
        </div>
      </NavigationSpinnerProvider>
    </ToastProvider>
  );
}
