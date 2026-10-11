"use client";
import { LoadFailed } from "@/components/managed/load-failed";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Lock, Mail, Pencil, Plus, Unlock, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DetailSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail, fmtDateTime } from "@/components/managed/field";
import { COMPANY_FIELDS, EditDialog } from "@/components/managed/edit-dialog";
import { PermitBadge } from "@/components/managed/permit-badge";
import { ReadOnlyNotice } from "@/components/managed/read-only-notice";
import { CMS_BASE } from "@/components/managed/staff-nav";
import { PageActions } from "@/components/managed/page-actions";
import { useNavigationStore } from "@/store/navigation-store";
import { type CustomerManager, useAccount, useAccountMutation } from "@/lib/staff-content";
import { impersonate, useStaffMe } from "@/lib/staff-hooks";

const MANAGER_FIELDS: [keyof CustomerManager, string][] = [
  ["login_id", "아이디"], ["name", "이름"], ["email", "이메일"], ["phone_number", "전화"], ["mobile_number", "휴대폰"], ["position", "직급"], ["department", "부서"],
];

export default function StaffAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const seq = Number(id);
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { toast } = useToast();
  const { data: me } = useStaffMe();
  const { data, isLoading, error } = useAccount(seq);
  const mutate = useAccountMutation();
  const [companyEdit, setCompanyEdit] = useState(false);
  const [managerEdit, setManagerEdit] = useState<CustomerManager | "new" | null>(null);

  useEffect(() => {
    setPageTitle(data?.name || "업체·고객 계정");
  }, [data?.name, setPageTitle]);

  if (error) return <LoadFailed error={error} />;

  if (isLoading || !data) return <DetailSkeleton />;
  const canWrite = data.write_enabled;

  const run = async (url: string, body: object, ok: string) => {
    try {
      await mutate.mutateAsync({ method: "post", url, body });
      toast("success", ok);
    } catch (err) {
      toast("error", apiErrorDetail(err, "처리에 실패했습니다."));
    }
  };

  const openAs = async (managerSeq: number) => {
    const tab = window.open("about:blank", "_blank");
    try {
      const { access_token } = await impersonate(managerSeq);
      const url = `/impersonate#token=${encodeURIComponent(access_token)}`;
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (err) {
      tab?.close();
      toast("error", apiErrorDetail(err, "대리 로그인에 실패했습니다."));
    }
  };

  return (
    <PageTransition>
      <div className="space-y-4">
        {canWrite && (
          <PageActions>
            <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setCompanyEdit(true)}>
              <Pencil className="mr-1 h-4 w-4" /> 업체 정보 수정
            </Button>
          </PageActions>
        )}
        {!canWrite && <ReadOnlyNotice cmsUrl={`${CMS_BASE}/managed/suppliermanage/${seq}`} />}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="order-first h-fit space-y-4 lg:sticky lg:top-20 lg:order-last">
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 pt-5 pb-5">
            <h2 className="font-semibold">{data.name}</h2>
            <dl className="space-y-3">
              {COMPANY_FIELDS.slice(1).map(([k, label]) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm break-words">{(data[k] as string) || "-"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        </div>

        <div className="min-w-0 space-y-4">
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 pt-5 pb-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">고객 계정</h2>
              {canWrite && (
                <Button size="sm" className="rounded-xl" onClick={() => setManagerEdit("new")}>
                  <Plus className="mr-1 h-4 w-4" /> 계정 추가(초대)
                </Button>
              )}
            </div>
            {data.managers.map((m) => (
              <div key={m.seq} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{m.name || "-"} <span className="text-xs text-muted-foreground">{m.login_id}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {m.email || "이메일 없음"} · {m.phone_number || "-"} · 최근 로그인 {fmtDateTime(m.last_login)}
                    {m.login_attempt_count > 0 && ` · 실패 ${m.login_attempt_count}회`}
                  </p>
                </div>
                <PermitBadge m={m} />
                {me?.is_admin && (
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openAs(m.seq)}>
                    <UserCog className="mr-1 h-4 w-4" /> 고객 화면
                  </Button>
                )}
                {canWrite && (
                  <>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setManagerEdit(m)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {m.login_permit_tf === "1" ? (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => run(`/managers/${m.seq}/permit`, { allow: false }, "로그인을 차단했습니다.")}>
                        <Lock className="mr-1 h-4 w-4" /> 차단
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => run(`/managers/${m.seq}/permit`, { allow: true }, "로그인을 허용했습니다.")}>
                        <Unlock className="mr-1 h-4 w-4" /> 허용·잠금해제
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="rounded-xl" disabled={!m.email} onClick={() => run(`/managers/${m.seq}/invite`, {}, `${m.email} 로 비밀번호 설정 링크를 보냈습니다.`)}>
                      <Mail className="mr-1 h-4 w-4" /> 설정 링크
                    </Button>
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
        </div>
        </div>
      </div>

      {companyEdit && (
        <EditDialog
          title="업체 정보 수정"
          fields={COMPANY_FIELDS}
          initial={Object.fromEntries(COMPANY_FIELDS.map(([k]) => [k, (data[k] as string) ?? ""]))}
          onClose={() => setCompanyEdit(false)}
          onSave={(values) => mutate.mutateAsync({ method: "patch", url: `/${seq}`, body: values })}
        />
      )}
      {managerEdit && (
        <EditDialog
          title={managerEdit === "new" ? "고객 계정 추가" : "고객 계정 수정"}
          fields={MANAGER_FIELDS.filter(([k]) => managerEdit === "new" ? ["login_id", "name", "email", "phone_number", "position"].includes(k) : true) as [string, string][]}
          initial={managerEdit === "new" ? {} : Object.fromEntries(MANAGER_FIELDS.map(([k]) => [k, (managerEdit[k] as string) ?? ""]))}
          note={managerEdit === "new" ? "비밀번호는 입력하지 않습니다. 저장하면 이메일로 비밀번호 설정 링크(72시간)가 발송됩니다." : undefined}
          onClose={() => setManagerEdit(null)}
          onSave={(values) =>
            managerEdit === "new"
              ? mutate.mutateAsync({ method: "post", url: `/${seq}/managers`, body: { ...values, send_invite: true } })
              : mutate.mutateAsync({ method: "patch", url: `/managers/${managerEdit.seq}`, body: values })
          }
        />
      )}
    </PageTransition>
  );
}
