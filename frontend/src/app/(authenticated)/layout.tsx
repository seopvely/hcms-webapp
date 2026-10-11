"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth-store";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { PageSpinner } from "@/components/common/page-spinner";
import { ToastProvider } from "@/components/common/app-toast";
import { NavigationSpinnerProvider } from "@/components/common/navigation-spinner";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { documentTokenFor, getAccessToken } from "@/lib/auth-token";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  // 메일 링크로 연 견적 1건 화면 — 로그인 없이 문서 토큰으로만 본다(메뉴 없이)
  const [documentOnly, setDocumentOnly] = useState(false);
  usePushNotifications();

  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      setDocumentOnly(false);
      setIsLoading(false);
    } else if (documentTokenFor(pathname)) {
      setDocumentOnly(true);
      setIsLoading(false);
    } else {
      router.replace("/login");
    }
  }, [isAuthenticated, router, pathname]);

  if (isLoading) return <PageSpinner />;

  if (documentOnly) {
    return (
      <ToastProvider>
        <NavigationSpinnerProvider>
          <div className="min-h-screen bg-background">
            <div className="flex items-center justify-between gap-3 bg-indigo-600 px-4 py-2 text-sm text-white">
              <span>메일 링크로 연 문서입니다. 다른 메뉴는 로그인 후 이용할 수 있습니다.</span>
              <Link href="/login" className="shrink-0 rounded-lg bg-white/20 px-3 py-1 font-medium hover:bg-white/30">
                로그인
              </Link>
            </div>
            <main className="mx-auto max-w-5xl p-4">{children}</main>
          </div>
        </NavigationSpinnerProvider>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <NavigationSpinnerProvider>
        <div className="min-h-screen bg-background">
          <AppSidebar />
          <div className="lg:pl-64">
            <ImpersonationBanner />
            <AppHeader />
            <main className="p-4 pb-24 lg:pb-4">
              {children}
            </main>
          </div>
          <BottomNav />
        </div>
      </NavigationSpinnerProvider>
    </ToastProvider>
  );
}

