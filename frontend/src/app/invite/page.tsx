"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageSpinner } from "@/components/common/page-spinner";
import api from "@/lib/axios";

type ApiError = { response?: { data?: { detail?: string } } };

// 고객 계정 초대 — 메일의 /invite#token=... 링크로 비밀번호를 직접 설정한다(72시간, 1회용).
export default function InvitePage() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ login_id: string; name: string | null; company_name: string | null } | null>(null);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(null, "", "/invite");
    if (!t) {
      setError("링크가 올바르지 않습니다.");
      return;
    }
    setToken(t);
    api
      .post("/auth/invite/verify", { token: t })
      .then((res) => setInfo(res.data))
      .catch((err: ApiError) => setError(err.response?.data?.detail || "링크를 확인할 수 없습니다."));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await api.post("/auth/invite/accept", { token, password, confirm_password: confirm });
      setDone(true);
    } catch (err) {
      setError((err as ApiError).response?.data?.detail || "설정에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!info && !error) return <PageSpinner />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md overflow-hidden rounded-3xl border-0 shadow-2xl">
        <div className="bg-gradient-to-r from-[#667eea] to-[#764ba2] px-6 py-8 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">비밀번호 설정</h1>
          {info && <p className="mt-1 text-sm text-white/80">{info.company_name} · {info.login_id}</p>}
        </div>
        <CardContent className="p-6">
          {done ? (
            <div className="space-y-4 text-center text-sm">
              <p>비밀번호가 설정되었습니다. 아이디 <b>{info?.login_id}</b> 로 로그인하세요.</p>
              <Button asChild className="w-full rounded-xl">
                <Link href="/login">로그인</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
              {info && (
                <>
                  <Input type="password" autoComplete="new-password" placeholder="새 비밀번호 (8자 이상, 영문·숫자·특수문자)" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl" />
                  <Input type="password" autoComplete="new-password" placeholder="비밀번호 확인" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 rounded-xl" />
                  <Button type="submit" disabled={submitting || !password || !confirm} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#667eea] to-[#764ba2]">
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "설정"}
                  </Button>
                </>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
