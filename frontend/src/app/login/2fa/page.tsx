"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageSpinner } from "@/components/common/page-spinner";
import { cn } from "@/lib/utils";
import staffApi, { safeStaffNext } from "@/lib/staff-api";

interface MfaStatus {
  setup_required: boolean;
  username: string;
  qr_svg?: string;
  secret?: string;
}

type ApiError = { response?: { status?: number; data?: { detail?: string } } };

function TwoFactorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeStaffNext(searchParams.get("next"));
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    staffApi
      .get<MfaStatus>("/auth/staff/mfa")
      .then((res) => setStatus(res.data))
      .catch((err: ApiError) => {
        const detail = err.response?.data?.detail || "2단계 인증 시간이 지났습니다. 다시 로그인해주세요.";
        router.replace(`/login?next=${encodeURIComponent(next)}&reason=${encodeURIComponent(detail)}`);
      });
  }, [router, next]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await staffApi.post("/auth/staff/mfa/verify", { code });
      router.replace(next);
    } catch (err: unknown) {
      const { response } = err as ApiError;
      if (response?.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(next)}&reason=${encodeURIComponent(response.data?.detail || "")}`);
        return;
      }
      setError(response?.data?.detail || "인증에 실패했습니다.");
      setCode("");
      setSubmitting(false);
    }
  };

  if (!status) return <PageSpinner />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <Card className="relative w-full max-w-md overflow-hidden rounded-3xl border-0 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-500">
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] px-6 py-8 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">2단계 인증</h1>
          <p className="mt-1 text-sm text-white/80">{status.username}</p>
        </div>

        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {status.setup_required ? (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>인증앱(Google Authenticator 등)으로 아래 QR 을 스캔한 뒤, 앱에 표시된 6자리 코드를 입력하세요.</p>
                {status.qr_svg && (
                  // 서버가 생성한 QR SVG (사용자 입력 없음)
                  <div
                    className="mx-auto w-48 [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: status.qr_svg }}
                  />
                )}
                {status.secret && (
                  <p className="text-center text-xs">
                    직접 입력: <span className="font-mono tracking-wider text-foreground">{status.secret}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">인증앱에 표시된 6자리 코드를 입력하세요.</p>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>
            )}

            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              className="h-12 rounded-xl text-center text-xl tracking-[0.5em] font-mono"
            />

            <Button
              type="submit"
              disabled={submitting || code.length !== 6}
              className={cn(
                "w-full h-12 rounded-xl text-base font-semibold",
                "bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:from-[#5a6fd6] hover:to-[#6a4192]"
              )}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "확인"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function TwoFactorPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <TwoFactorContent />
    </Suspense>
  );
}
