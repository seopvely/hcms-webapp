"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink, LogOut, Search, X } from "lucide-react";
import { openCommandPalette } from "@/components/managed/command-palette";
import { cn } from "@/lib/utils";
import { useNavigationStore } from "@/store/navigation-store";
import { STAFF_NAV } from "@/components/managed/staff-nav";
import { useStaffMe } from "@/lib/staff-hooks";

interface StaffSidebarProps {
  name: string;
  email: string | null;
  onLogout: () => void;
}

export function StaffSidebar({ name, email, onLogout }: StaffSidebarProps) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useNavigationStore();
  const { data: me } = useStaffMe();
  const nav = STAFF_NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || me?.is_admin) })).filter((g) => g.items.length);
  // 가장 구체적으로 일치하는 메뉴 하나만 활성 표시
  const activeHref = STAFF_NAV.flatMap((g) => g.items)
    .filter((i) => !i.legacy && (pathname === i.href || pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const activeGroup = nav.find((g) => g.items.some((i) => i.href === activeHref))?.title;

  // 접어 둔 그룹(브라우저에 기억). 지금 보고 있는 화면의 그룹은 항상 펼친다.
  // (사이드바는 직원 정보를 받은 뒤 클라이언트에서만 그려지므로 초기값을 바로 읽어도 된다)
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("hcms_staff_nav_collapsed") || "[]");
    } catch {
      return [];
    }
  });
  const toggle = (title: string) =>
    setCollapsed((c) => {
      const next = c.includes(title) ? c.filter((t) => t !== title) : [...c, title];
      try {
        localStorage.setItem("hcms_staff_nav_collapsed", JSON.stringify(next));
      } catch {
        // 저장소를 쓸 수 없는 환경
      }
      return next;
    });

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
          "fixed top-0 left-0 z-50 flex h-full w-64 flex-col bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-transform duration-300 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top))] border-b border-white/10">
          <div>
            <h1 className="text-xl font-bold tracking-tight">HCMS</h1>
            <p className="text-xs text-slate-400">직원 관리</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pt-3">
          <button
            onClick={() => { setSidebarOpen(false); openCommandPalette(); }}
            className="flex w-full items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/15 hover:text-white"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">메뉴 검색</span>
            <kbd className="rounded border border-white/20 px-1.5 text-[10px] text-slate-400">⌘K</kbd>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-2">
          {nav.map((group) => {
            const isOpen = group.items.length === 1 || group.title === activeGroup || !collapsed.includes(group.title);
            return (
            <div key={group.title}>
              {group.items.length > 1 ? (
                <button
                  onClick={() => toggle(group.title)}
                  className="flex w-full items-center px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
                  aria-expanded={isOpen}
                >
                  {group.title}
                  <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")} />
                </button>
              ) : (
                <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</p>
              )}
              <div className={cn("space-y-0.5", !isOpen && "hidden")}>
                {group.items.map((item) =>
                  item.legacy || item.newTab ? (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-2 px-4 py-1.5 rounded-xl text-sm text-slate-300 hover:bg-white/10 hover:text-white"
                      title={item.legacy ? "cms 에서 열기" : "새 탭에서 열기"}
                    >
                      {item.label}
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    </a>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center px-4 py-1.5 rounded-xl text-sm font-medium transition-all",
                        item.href === activeHref
                          ? "bg-white/15 text-white border-l-4 border-blue-400 pl-3"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                )}
              </div>
            </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-sm font-bold">
              {name.charAt(0) || "직"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{name}</p>
              <p className="text-xs text-slate-400 truncate">{email || ""}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
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
