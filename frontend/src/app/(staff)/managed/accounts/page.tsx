"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDate } from "@/components/managed/field";
import { PermitBadge } from "@/components/managed/permit-badge";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { useAccounts } from "@/lib/staff-content";

// 업체·고객 계정 (cms 고객리스트 + 업체관리 통합)
export default function StaffAccountsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useAccounts(q);

  useEffect(() => {
    setPageTitle("업체·고객 계정");
  }, [setPageTitle]);
  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  return (
    <PageTransition>
      <div className="space-y-4">
        {data && !data.write_enabled && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/suppliermanage`} />}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="업체명·담당자·아이디·이메일" className="h-11 rounded-xl pl-10" />
        </div>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Building2} title="업체가 없습니다" />
        ) : (
          <Card className="rounded-2xl">
            <CardContent className="divide-y p-0">
              {data.items.map((c) => (
                <Link key={c.seq} href={`/managed/accounts/${c.seq}`} className="block px-4 py-3 hover:bg-muted/40">
                  <p className="text-sm font-semibold">{c.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{c.ceoname} {c.phone_number}</span></p>
                  <div className="mt-1 space-y-1">
                    {c.managers.length === 0 && <p className="text-xs text-muted-foreground">담당자 계정 없음</p>}
                    {c.managers.map((m) => (
                      <div key={m.seq} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="text-foreground">{m.name || "-"}</span>
                        <span>{m.login_id}</span>
                        <span>{m.email}</span>
                        <PermitBadge m={m} />
                        {m.login_attempt_count > 0 && <span className="text-red-600">실패 {m.login_attempt_count}회</span>}
                        {m.last_login && <span>최근 로그인 {fmtDate(m.last_login)}</span>}
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageTransition>
  );
}
