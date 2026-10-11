"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Menu, Search } from "lucide-react";
import { useNavigationStore } from "@/store/navigation-store";
import { cn } from "@/lib/utils";
import { STAFF_NAV } from "@/components/managed/staff-nav";
import { openCommandPalette } from "@/components/managed/command-palette";

/** 주요 버튼이 들어가는 자리 — 화면에서 <PageActions> 로 채운다 */
export const PAGE_ACTIONS_ID = "staff-page-actions";

type Crumb = { label: string; href?: string };

/** 경로 표시: 그룹 › 메뉴 › (상세·새로 만들기). 메뉴는 STAFF_NAV 에서 가장 길게 일치하는 것. */
function useCrumbs(title: string): Crumb[] {
  const pathname = usePathname();
  let best: { group: string; label: string; href: string } | null = null;
  for (const g of STAFF_NAV) {
    for (const i of g.items) {
      if (i.legacy || i.newTab) continue;
      if ((pathname === i.href || pathname.startsWith(i.href + "/")) && (!best || i.href.length > best.href.length)) {
        best = { group: g.title, label: i.label, href: i.href };
      }
    }
  }
  if (!best || best.href === "/managed") return [];
  const crumbs: Crumb[] = [{ label: best.group }, { label: best.label, href: best.href }];
  if (pathname !== best.href) {
    const rest = pathname.slice(best.href.length + 1).split("/");
    const last = rest[rest.length - 1];
    crumbs.push({ label: last === "new" ? "새로 만들기" : title && title !== best.label ? title : `#${last}` });
  }
  return crumbs;
}

export function StaffHeader() {
  const { setSidebarOpen, pageTitle } = useNavigationStore();
  const crumbs = useCrumbs(pageTitle);
  // 상세·새로 만들기 화면이면 상위 목록으로 돌아가는 링크(모바일은 경로 표시가 숨겨지므로)
  const parent = crumbs.length > 2 ? crumbs[crumbs.length - 2] : null;
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex items-center gap-3 border-b border-border/50 bg-background/85 px-4 py-2.5 backdrop-blur-md lg:px-6",
        "pt-[calc(0.625rem+env(safe-area-inset-top))]",
      )}
    >
      <button onClick={() => setSidebarOpen(true)} className="rounded-xl p-2 hover:bg-accent lg:hidden" aria-label="메뉴 열기">
        <Menu className="h-5 w-5" />
      </button>
      {parent?.href && (
        <Link href={parent.href} className="-ml-1 rounded-xl p-1.5 hover:bg-accent sm:hidden" aria-label={`${parent.label}(으)로`}>
          <ChevronLeft className="h-5 w-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        {crumbs.length > 0 && (
          <nav aria-label="경로" className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                {c.href && i < crumbs.length - 1 ? <Link href={c.href} className="hover:text-foreground hover:underline">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-lg font-semibold leading-tight">{pageTitle}</h1>
      </div>
      {/* 버튼이 많으면 좁은 화면에서는 가로로 스크롤(제목을 밀어내지 않게 최대 폭 제한) */}
      <div id={PAGE_ACTIONS_ID} className="flex max-w-[60vw] shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] sm:max-w-none [&::-webkit-scrollbar]:hidden" />
      <button onClick={openCommandPalette} className="rounded-xl p-2 hover:bg-accent" aria-label="메뉴 검색" title="메뉴 검색 (⌘K)">
        <Search className="h-5 w-5" />
      </button>
    </header>
  );
}
