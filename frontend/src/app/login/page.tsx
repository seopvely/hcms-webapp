"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, User, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth-store";
import api from "@/lib/axios";
import { requestAndRegisterPushToken } from "@/hooks/use-push-notifications";

const loginSchema = z.object({
  login_id: z.string().min(2, "아이디를 2자 이상 입력해주세요"),
  password: z.string().min(4, "비밀번호를 4자 이상 입력해주세요"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [autoLoginLoading, setAutoLoginLoading] = useState(false);
  const defaultSiteKey = process.env.NEXT_PUBLIC_SITE_KEY;

  useEffect(() => {
    const key = searchParams.get("key");
    const loginId = searchParams.get("login_id");

    if (key && loginId) {
      setAutoLoginLoading(true);
      api.post("/auth/site-key-login", { site_key: key, login_id: loginId })
        .then((response) => {
          const { access_token, refresh_token, user } = response.data;
          localStorage.setItem("access_token", access_token);
          localStorage.setItem("refresh_token", refresh_token);
          setUser(user);
          requestAndRegisterPushToken();
          router.push("/dashboard");
        })
        .catch(() => {
          setError("자동 로그인에 실패했습니다. 직접 로그인해주세요.");
          setAutoLoginLoading(false);
        });
    }
  }, [searchParams, router, setUser]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setError("");
      const keyFromQuery = searchParams.get("key");
      const siteKey = keyFromQuery || defaultSiteKey;
      const payload = siteKey ? { ...data, site_key: siteKey } : data;
      const response = await api.post("/auth/login", payload);
      const { access_token, refresh_token, user, is_first_login } = response.data;

      if (is_first_login) {
        // 최초 로그인: 토큰을 임시 저장하고 비밀번호 변경 페이지로 이동
        localStorage.setItem("access_token", access_token);
        localStorage.setItem("refresh_token", refresh_token);
        router.push("/change-password");
        return;
      }

      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      setUser(user);
      requestAndRegisterPushToken();
      router.push("/dashboard");
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setError(
        error.response?.data?.detail ||
          "로그인에 실패했습니다. 다시 시도해주세요."
      );
    }
  };

  if (autoLoginLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-600" />
          <p className="mt-3 text-sm text-muted-foreground">자동 로그인 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md overflow-hidden rounded-3xl border-0 shadow-2xl animate-in fade-in slide-in-from-bottom-6 duration-500">
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] px-6 py-10 text-center text-white">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Building2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">HCMS</h1>
          <p className="mt-1 text-sm text-white/80">고객 포털</p>
        </div>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 animate-in fade-in duration-200">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                아이디
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  {...register("login_id")}
                  placeholder="아이디를 입력하세요"
                  className="pl-10 h-12 rounded-xl"
                />
              </div>
              {errors.login_id && (
                <p className="text-xs text-red-500">
                  {errors.login_id.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                비밀번호
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="비밀번호를 입력하세요"
                  className="pl-10 pr-10 h-12 rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                "w-full h-12 rounded-xl text-base font-semibold",
                "bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:from-[#5a6fd6] hover:to-[#6a4192]",
                "shadow-lg shadow-indigo-500/25 transition-all hover:shadow-xl hover:shadow-indigo-500/30"
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                "로그인"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <div className="flex items-center justify-center gap-2 text-xs">
              <Link href="/terms" className="text-muted-foreground hover:text-foreground hover:underline transition-colors">
                이용약관
              </Link>
              <span className="text-muted-foreground">|</span>
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground hover:underline transition-colors">
                개인정보처리방침
              </Link>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              문의사항이 있으시면 관리자에게 연락해주세요.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

