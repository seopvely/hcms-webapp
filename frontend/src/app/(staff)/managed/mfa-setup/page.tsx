"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSpinner } from "@/components/common/page-spinner";
import { PageTransition } from "@/components/layout/page-transition";
import { apiErrorDetail } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import staffApi, { safeStaffNext } from "@/lib/staff-api";

type Enroll = { enrolled: boolean; username: string; qr_svg?: string; secret?: string };

// 2단계 인증을 쓰지 않는 직원이 로그인한 뒤 인증앱을 등록하는 화면(SPEC D3). "나중에"로 건너뛸 수 있다.
function MfaSetupContent() {
  const router = useRouter();
  const next = safeStaffNext(useSearchParams().get("next"));
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const [data, setData] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPageTitle("2단계 인증 등록");
    staffApi.get<Enroll>("/auth/staff/mfa/enroll").then((r) => {
      if (r.data.enrolled) router.replace(next);
      else setData(r.data);
    });
  }, [setPageTitle, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await staffApi.post("/auth/staff/mfa/enroll", { code });
      router.replace(next);
    } catch (err) {
      setError(apiErrorDetail(err, "인증에 실패했습니다."));
      setCode("");
      setBusy(false);
    }
  };

  if (!data) return <PageSpinner />;

  return (
    <PageTransition>
      <Card className="mx-auto max-w-md rounded-2xl">
        <CardContent className="space-y-4 pt-6 pb-6">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-5 w-5 text-indigo-600" /> 2단계 인증 등록 — {data.username}
          </div>
          <p className="text-sm text-muted-foreground">
            직원 계정은 2단계 인증을 사용합니다. 인증앱(Google Authenticator 등)으로 QR 을 스캔하고 6자리 코드를 입력하세요.
            등록 전에는 SSO(wealthreach)와 직원 계정 관리를 쓸 수 없습니다. 다음 로그인부터는 코드 입력이 필요합니다.
          </p>
          {data.qr_svg && (
            // 서버가 생성한 QR SVG (사용자 입력 없음)
            <div className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: data.qr_svg }} />
          )}
          {data.secret && (
            <p className="text-center text-xs text-muted-foreground">
              직접 입력: <span className="font-mono tracking-wider text-foreground">{data.secret}</span>
            </p>
          )}
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              className="h-12 rounded-xl text-center font-mono text-xl tracking-[0.5em]"
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="h-12 flex-1 rounded-xl" onClick={() => router.replace(next)}>
                나중에
              </Button>
              <Button type="submit" disabled={busy || code.length !== 6} className="h-12 flex-1 rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2]">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "등록"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </PageTransition>
  );
}

export default function MfaSetupPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <MfaSetupContent />
    </Suspense>
  );
}
