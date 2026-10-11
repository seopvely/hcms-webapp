"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppAlertDialog } from "@/components/common/app-alert-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { useToast } from "@/components/common/app-toast";
import { PageTransition } from "@/components/layout/page-transition";
import { DataTable } from "@/components/managed/data-table";
import { fmtDateTime } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import {
  type StaffAccount,
  type StaffAccountUpdate,
  useResetStaffTotp,
  useSetStaffPassword,
  useStaffAccounts,
  useStaffMe,
  useUpdateStaffAccount,
} from "@/lib/staff-hooks";

type ApiError = { response?: { data?: { detail?: string } } };
const errorDetail = (err: unknown, fallback: string) => (err as ApiError).response?.data?.detail || fallback;

function twoFactorLabel(s: StaffAccount) {
  if (!s.two_factor_enabled) return { label: "2FA 미사용", className: "bg-slate-100 text-slate-600" };
  if (!s.totp_registered) return { label: "2FA 등록대기", className: "bg-amber-100 text-amber-700" };
  return { label: "2FA 사용", className: "bg-emerald-100 text-emerald-700" };
}

const roleBadge = (s: StaffAccount) => (
  <Badge className={s.is_admin ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}>{s.is_admin ? "관리자" : "사용자"}</Badge>
);
const tfBadge = (s: StaffAccount) => {
  const tf = twoFactorLabel(s);
  return <Badge className={tf.className}>{tf.label}</Badge>;
};
const inactiveBadge = <Badge className="bg-red-100 text-red-700">비활성</Badge>;

export default function ManagedStaffPage() {
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);
  const { data: me } = useStaffMe();
  const { data, isLoading } = useStaffAccounts(!!me?.is_admin);
  const [editing, setEditing] = useState<StaffAccount | null>(null);

  useEffect(() => {
    setPageTitle("직원 계정");
  }, [setPageTitle]);

  const editBtn = (s: StaffAccount) => (
    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditing(s)}>
      <UserCog className="mr-1 h-4 w-4" /> 수정
    </Button>
  );

  if (me && !me.is_admin) {
    return <EmptyState icon={ShieldAlert} title="관리자만 볼 수 있습니다" />;
  }

  return (
    <PageTransition>
      {isLoading || !data ? (
        <TableSkeleton />
      ) : (
        <DataTable
          rows={data.items}
          rowKey={(s) => s.id}
          onRowClick={(s) => setEditing(s)}
          rowClassName={(s) => (s.is_active ? undefined : "opacity-70")}
          columns={[
            {
              key: "name", header: "이름", sort: "name", value: (s) => s.name || s.username, cell: (s) => (
                <p className="whitespace-nowrap font-medium">
                  {s.name || s.username}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{s.username}</span>
                </p>
              ),
            },
            { key: "email", header: "이메일", sort: "email", value: (s) => s.email, hideOnMobile: true, className: "text-muted-foreground", cell: (s) => s.email || "이메일 없음" },
            { key: "last_login", header: "최근 로그인", sort: "last_login", value: (s) => s.last_login, hideOnMobile: true, className: "w-36 whitespace-nowrap text-xs text-muted-foreground", cell: (s) => fmtDateTime(s.last_login) },
            { key: "role", header: "등급", sort: "role", value: (s) => (s.is_admin ? 0 : 1), align: "center", className: "w-20", cell: (s) => roleBadge(s) },
            { key: "tf", header: "2FA", sort: "tf", value: (s) => twoFactorLabel(s).label, align: "center", className: "w-28", cell: (s) => tfBadge(s) },
            { key: "active", header: "상태", sort: "active", value: (s) => (s.is_active ? 0 : 1), align: "center", hideOnMobile: true, className: "w-20", cell: (s) => (s.is_active ? <span className="text-xs text-muted-foreground">활성</span> : inactiveBadge) },
            { key: "edit", header: "", align: "right", className: "w-20", cell: (s) => editBtn(s) },
          ]}
          mobile={(s) => (
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {s.name || s.username}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{s.username}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.email || "이메일 없음"}
                  {s.last_login && ` · 최근 로그인 ${fmtDateTime(s.last_login)}`}
                </p>
              </div>
              {roleBadge(s)}
              {tfBadge(s)}
              {!s.is_active && inactiveBadge}
              {editBtn(s)}
            </div>
          )}
        />
      )}

      {editing && (
        <StaffEditDialog key={editing.id} staff={editing} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />
      )}
    </PageTransition>
  );
}

function StaffEditDialog({ staff, isSelf, onClose }: { staff: StaffAccount; isSelf: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const update = useUpdateStaffAccount();
  const resetTotp = useResetStaffTotp();
  const setPassword = useSetStaffPassword();
  const [form, setForm] = useState<StaffAccountUpdate>({
    name: staff.name,
    email: staff.email,
    phone_number: staff.phone_number,
    department: staff.department,
    position: staff.position,
    previlege: staff.previlege || "2",
    is_active: staff.is_active,
    two_factor_enabled: staff.two_factor_enabled,
  });
  const [password, setPasswordValue] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const save = async () => {
    try {
      await update.mutateAsync({ id: staff.id, data: form });
      toast("success", "저장했습니다.");
      onClose();
    } catch (err) {
      toast("error", errorDetail(err, "저장에 실패했습니다."));
    }
  };

  const savePassword = async () => {
    try {
      await setPassword.mutateAsync({ id: staff.id, password });
      setPasswordValue("");
      toast("success", "비밀번호를 변경했습니다. 해당 직원의 로그인 세션이 종료됩니다.");
    } catch (err) {
      toast("error", errorDetail(err, "비밀번호 변경에 실패했습니다."));
    }
  };

  const doResetTotp = async () => {
    try {
      await resetTotp.mutateAsync(staff.id);
      toast("success", "인증앱 등록을 초기화했습니다. 다음 로그인 때 다시 등록합니다.");
    } catch (err) {
      toast("error", errorDetail(err, "초기화에 실패했습니다."));
    }
  };

  const text = (key: keyof StaffAccountUpdate, label: string) => (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Input
        value={(form[key] as string | null) ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="rounded-xl"
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{staff.name || staff.username} 수정</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {text("name", "이름")}
          {text("email", "이메일(로그인 아이디)")}
          {text("phone_number", "연락처")}
          {text("department", "부서")}
          {text("position", "직급")}
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">등급</span>
            <select
              value={form.previlege ?? "2"}
              disabled={isSelf}
              onChange={(e) => setForm((f) => ({ ...f, previlege: e.target.value }))}
              className="h-9 w-full rounded-xl border bg-background px-3"
            >
              <option value="1">관리자</option>
              <option value="2">사용자</option>
            </select>
          </label>
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={!!form.is_active}
              disabled={isSelf}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v === true }))}
            />
            로그인 허용
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={!!form.two_factor_enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, two_factor_enabled: v === true }))}
            />
            2단계 인증 사용 (cms 와 공유)
          </label>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={update.isPending} className="rounded-xl">
            저장
          </Button>
        </DialogFooter>

        <div className="space-y-3 border-t pt-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-muted-foreground">
              {staff.totp_registered ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4" />}
              인증앱 {staff.totp_registered ? "등록됨" : "미등록"}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl"
              disabled={!staff.totp_registered || resetTotp.isPending}
              onClick={() => setConfirmReset(true)}
            >
              인증앱 등록 초기화
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="새 비밀번호 (10자+, 영문·숫자·특수문자)"
              className="rounded-xl"
            />
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={!password || setPassword.isPending}
              onClick={savePassword}
            >
              변경
            </Button>
          </div>
        </div>

        <AppAlertDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="인증앱 등록 초기화"
          description="휴대폰 분실 등으로 인증앱을 다시 등록해야 할 때 사용합니다. 해당 직원은 로그아웃되고 다음 로그인 때 QR 을 다시 등록합니다."
          confirmText="초기화"
          variant="warning"
          onConfirm={doResetTotp}
        />
      </DialogContent>
    </Dialog>
  );
}
