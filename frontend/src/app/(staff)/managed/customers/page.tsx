"use client";
import { useEffect, useState } from "react";
import { Search, UserCog, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import { impersonate, useCustomerAccounts, useStaffMe } from "@/lib/staff-hooks";

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
          <Card className="rounded-2xl">
            <CardContent className="divide-y p-0">
              {data.items.map((c) => {
                const permit = PERMIT_LABELS[c.login_permit_tf ?? ""];
                return (
                  <div key={c.seq} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.company_name || "(회사 없음)"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.name || "-"} · {c.login_id}
                        {c.last_login && ` · 최근 로그인 ${c.last_login.slice(0, 10)}`}
                      </p>
                    </div>
                    {permit && <Badge className={permit.className}>{permit.label}</Badge>}
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
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
