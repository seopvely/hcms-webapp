"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Newspaper,
  Wrench,
  ClipboardList,
  FileText,
  Coins,
  MessageSquare,
  Briefcase,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import { useNavigationStore } from "@/store/navigation-store";

const navItems = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/news", label: "최신소식", icon: Newspaper },
  { href: "/maintenance", label: "유지보수 요청", icon: Wrench },
  { href: "/tasks", label: "건별작업", icon: ClipboardList },
  { href: "/estimates", label: "견적/계약", icon: FileText },
  { href: "/point-usage", label: "포인트 사용현황", icon: Coins },
  { href: "/inquiries", label: "고객문의", icon: MessageSquare },
  { href: "/services", label: "할 수 있는 일", icon: Briefcase },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useNavigationStore();

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h1 className="text-xl font-bold tracking-tight">HCMS</h1>
            <p className="text-xs text-slate-400">고객 포털</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded-lg hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                  isActive
                    ? "bg-white/15 text-white shadow-sm border-l-4 border-blue-400 pl-3"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-sm font-bold">
              {user?.name?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.name || "사용자"}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-red-500/20 hover:text-red-300 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      </aside>
    </>
  );
}
