"use client";
import { useEffect, useState } from "react";
import { Search, UserCog, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/managed/data-table";
import { fmtDate, meta } from "@/components/managed/field";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { type CustomerAccount, impersonate, useCustomerAccounts, useStaffMe } from "@/lib/staff-hooks";

const PERMIT_LABELS: Record<string, { label: string; className: string }> = {
  "2": { label: "잠김", className: "bg-red-100 text-red-700" },
  "0": { label: "미허용", className: "bg-slate-100 text-slate-600" },
};

export default function ManagedCustomersPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const { data, isLoading } = useCustomerAccounts(q);

  useEffect(() => {
    setPageTitle("고객사 이동");
  }, [setPageTitle]);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  const openAs = async (seq: number) => {
    // 팝업 차단을 피하려고 클릭 시점에 탭을 먼저 연다
    const tab = window.open("about:blank", "_blank");
    setBusy(seq);
    try {
      const { access_token } = await impersonate(seq);
      const url = `/impersonate#token=${encodeURIComponent(access_token)}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err: unknown) {
      tab?.close();
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast("error", detail || "대리 로그인에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const permitLabel = (c: CustomerAccount) => {
    const permit = PERMIT_LABELS[c.login_permit_tf ?? ""];
    return permit ? <Badge className={permit.className}>{permit.label}</Badge> : null;
  };
  const openButton = (c: CustomerAccount) => (
    <Button
      size="sm"
      variant="outline"
      className="rounded-xl"
      disabled={!me?.is_admin || busy !== null}
      onClick={() => openAs(c.seq)}
    >
      <UserCog className="mr-1 h-4 w-4" />
      {busy === c.seq ? "여는 중..." : "고객 화면 열기"}
    </Button>
  );

  return (
    <PageTransition>
      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="회사명·담당자·아이디 검색"
            className="h-11 rounded-xl pl-10"
          />
        </div>

        {!me?.is_admin && (
          <p className="text-sm text-amber-700">대리 로그인은 관리자만 사용할 수 있습니다.</p>
        )}

        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Users} title="고객 계정이 없습니다" description="검색어를 바꿔 보세요." />
        ) : (
          <DataTable
            rows={data.items}
            rowKey={(c) => c.seq}
            columns={[
              {
                key: "company", header: "회사", sort: "company", value: (c) => c.company_name, cell: (c) => (
                  <div className="min-w-0 max-w-[420px]">
                    <p className="truncate font-medium">{c.company_name || "(회사 없음)"}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(c.name || "-", c.login_id)}</p>
                  </div>
                ),
              },
              { key: "last_login", header: "최근 로그인", sort: "last_login", value: (c) => c.last_login, hideOnMobile: true, className: "w-28 whitespace-nowrap", cell: (c) => fmtDate(c.last_login) },
              { key: "permit", header: "상태", sort: "permit", value: (c) => PERMIT_LABELS[c.login_permit_tf ?? ""]?.label, align: "center", className: "w-20", cell: (c) => permitLabel(c) },
              { key: "action", header: "", align: "right", className: "w-36", cell: (c) => openButton(c) },
            ]}
            mobile={(c) => (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.company_name || "(회사 없음)"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.name || "-"} · {c.login_id}
                    {c.last_login && ` · 최근 로그인 ${c.last_login.slice(0, 10)}`}
                  </p>
                </div>
                {permitLabel(c)}
                {openButton(c)}
              </div>
            )}
          />
        )}
      </div>
    </PageTransition>
  );
}
