"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { fmtDate, meta } from "@/components/managed/field";
import { PageActions } from "@/components/managed/page-actions";
import { PermitBadge } from "@/components/managed/permit-badge";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { useNavigationStore } from "@/store/navigation-store";
import { type AccountCompany, useAccountMutation, useAccounts } from "@/lib/staff-content";
import { COMPANY_FIELDS, EditDialog } from "@/components/managed/edit-dialog";

// 업체·고객 계정 (cms 고객리스트 + 업체관리 통합)
export default function StaffAccountsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const { data, isLoading } = useAccounts(q);
  const mutate = useAccountMutation();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="업체명·담당자·아이디·이메일" className="h-11 rounded-xl pl-10" />
          </div>
        </div>
        <PageActions>
          {data?.write_enabled && (
            <Button size="sm" className="rounded-xl" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> 업체 등록</Button>
          )}
        </PageActions>
        {isLoading ? (
          <TableSkeleton />
        ) : !data?.items.length ? (
          <EmptyState icon={Building2} title="업체가 없습니다" />
        ) : (
          <DataTable
            rows={data.items}
            rowKey={(c) => c.seq}
            rowHref={(c) => `/managed/accounts/${c.seq}`}
            columns={[
              {
                key: "name", header: "업체", sort: "name", value: (c) => c.name, className: "w-64", cell: (c) => (
                  <div className="min-w-0 max-w-[260px]">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{meta(c.ceoname, c.phone_number)}</p>
                  </div>
                ),
              },
              { key: "managers", header: "담당자 계정", sort: "managers", value: (c) => c.managers.length, cell: (c) => <Managers c={c} /> },
            ]}
            mobile={(c) => (
              <>
                <p className="text-sm font-semibold">{c.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{c.ceoname} {c.phone_number}</span></p>
                <div className="mt-1"><Managers c={c} /></div>
              </>
            )}
          />
        )}
      </div>
      {creating && (
        <EditDialog
          title="업체 등록"
          fields={COMPANY_FIELDS}
          initial={{}}
          note="고객 계정은 등록 후 업체 화면에서 추가하면 비밀번호 설정 메일이 발송됩니다."
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const r = await mutate.mutateAsync({ method: "post", url: "", body: values });
            router.push(`/managed/accounts/${r.seq}`);
          }}
        />
      )}
    </PageTransition>
  );
}

function Managers({ c }: { c: AccountCompany }) {
  return (
    <div className="space-y-1">
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
  );
}
