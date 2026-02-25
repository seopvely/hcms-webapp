"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { PageSpinner } from "@/components/common/page-spinner";
import { ToastProvider } from "@/components/common/app-toast";
import { NavigationSpinnerProvider } from "@/components/common/navigation-spinner";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  usePushNotifications();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, router]);

  if (isLoading) return <PageSpinner />;

  return (
    <ToastProvider>
      <NavigationSpinnerProvider>
        <div className="min-h-screen bg-background">
          <AppSidebar />
          <div className="lg:pl-64">
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

