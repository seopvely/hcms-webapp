"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaffMe } from "@/lib/staff-hooks";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useStaffGet } from "@/lib/staff-ops";

export type TaxOptions = {
  categories: string[]; deduction: Record<string, string>; payment_methods: Record<string, string>; issue_status: Record<string, string>;
  payment_status: Record<string, string>; suppliers: { id: number; name: string; business_number: string; use_count: number }[];
  vendors: { name: string; business_number: string }[];
  clients: { seq: number; name: string; business_number: string }[];
};
export const useTaxOptions = () => useStaffGet<TaxOptions>(["tax", "options"], "/tax/options");

const TABS = [["/managed/tax", "대시보드"], ["/managed/tax/purchases", "매입"], ["/managed/tax/sales", "매출"]] as const;

// 세금계산서 공통 틀: 관리자 확인(재무, D12) + 탭 + 읽기 전용 안내
export function TaxShell({ cmsPath, children }: { cmsPath: string; children: React.ReactNode }) {
  const { data: me, isLoading } = useStaffMe();
  const pathname = usePathname();
  if (isLoading) return null;
  if (!me?.is_admin) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10" /><p className="font-semibold text-foreground">관리자 전용 메뉴입니다</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={cn("rounded-full px-3 py-1 text-xs", (href === "/managed/tax" ? pathname === href : pathname.startsWith(href)) ? "bg-slate-900 text-white" : "bg-muted")}>{label}</Link>
        ))}
      </div>
      {!me.write_areas.includes("tax") && <ReadOnlyNotice cmsUrl={`${CMS_BASE}${cmsPath}`} />}
      {children}
    </div>
  );
}
