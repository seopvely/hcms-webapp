"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaffMe } from "@/lib/staff-hooks";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useStaffGet } from "@/lib/staff-ops";

export const won = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : `${Number(v).toLocaleString()}원`);
export const num = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : Number(v).toLocaleString());

// 납부 상태 색 — cms my_payment_status3 (1 파랑 완납 / 2 빨강 실패 / 3 초록 대기 / 4 보라 부분)
export const STATUS_COLOR: Record<string, string> = {
  "1": "bg-blue-100 text-blue-700", "2": "bg-red-100 text-red-700", "3": "bg-emerald-100 text-emerald-700", "4": "bg-violet-100 text-violet-700",
};

export type BillingOptions = {
  companies: { seq: number; name: string }[];
  agents: { id: number; name: string; email: string | null }[];
  project_types: Record<string, string>;
  payment_types: Record<string, string>;
  payment_methods: Record<string, string>;
  payment_status: Record<string, string>;
  alarm_types: Record<string, string>;
  sub_types: Record<string, string>;
  cycles: Record<string, string>;
  extra_presets: string[];
  categories: string[];
};

export function useBillingOptions() {
  return useStaffGet<BillingOptions>(["billing", "options"], "/billing/options");
}

export function useBillingWritable() {
  const { data: me } = useStaffMe();
  return !!me?.write_areas.includes("billing");
}

const TABS = [
  ["/managed/billing/payments", "납부리스트"], ["/managed/billing/history", "납부내역"], ["/managed/billing/alarms", "결제일알람"],
  ["/managed/billing/revenue", "월별수익"], ["/managed/billing/sales-plan", "매출·매입계획"], ["/managed/billing/pl-cashflow", "손익·자금흐름"],
] as const;

// 재무 화면 공통 틀: 관리자 확인(D12) + 탭 + 읽기 전용 안내(cms 에 같은 화면이 없으면 cmsPath 생략)
export function BillingShell({ cmsPath, children }: { cmsPath?: string; children: React.ReactNode }) {
  const { data: me, isLoading } = useStaffMe();
  const pathname = usePathname();
  if (isLoading) return null;
  if (!me?.is_admin) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground">
        <ShieldAlert className="h-10 w-10" />
        <p className="font-semibold text-foreground">관리자 전용 메뉴입니다</p>
        <p className="text-sm">재무 화면은 관리자 권한이 있는 직원만 볼 수 있습니다.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} className={cn("shrink-0 rounded-full px-3 py-1 text-xs", pathname.startsWith(href) ? "bg-slate-900 text-white" : "bg-muted")}>{label}</Link>
        ))}
      </div>
      {cmsPath && !me.write_areas.includes("billing") && <ReadOnlyNotice cmsUrl={`${CMS_BASE}${cmsPath}`} />}
      {children}
    </div>
  );
}
