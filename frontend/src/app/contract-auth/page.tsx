"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { setDocumentToken } from "@/lib/auth-token";
import api from "@/lib/axios";

function ContractAuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = searchParams.get("token");
    const contractId = searchParams.get("contract_id");

    if (!token || !contractId) {
      setError("잘못된 접근입니다. 이메일의 링크를 다시 확인해 주세요.");
      setLoading(false);
      return;
    }

    api
      .get("/estimates/contracts/auth/verify-token", {
        params: { token, contract_id: contractId },
      })
      .then((response) => {
        const { document_token, estimate_id } = response.data;
        setDocumentToken(Number(estimate_id), document_token);
        // 계약서는 연결된 견적 상세 화면에서 본다
        router.replace(`/estimates/${estimate_id}`);
      })
      .catch((err) => {
        const detail =
          err.response?.data?.detail || "인증에 실패했습니다. 링크가 만료되었거나 유효하지 않습니다.";
        setError(detail);
        setLoading(false);
      });
  }, [searchParams, router]);

  if (loading && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-indigo-600" />
          <p className="mt-4 text-sm text-muted-foreground">계약서를 확인하는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <Card className="w-full max-w-md rounded-2xl border-0 shadow-xl overflow-hidden">
        <div className="bg-gradient-to-r from-red-500 to-rose-600 p-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">접근할 수 없습니다</h1>
        </div>
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <div className="space-y-3">
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => router.push("/login")}
            >
              로그인 페이지로 이동
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ContractAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <ContractAuthContent />
    </Suspense>
  );
}
