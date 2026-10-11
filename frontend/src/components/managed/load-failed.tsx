"use client";
import { AlertTriangle, ArrowLeft, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** 상세 화면 조회 실패(없는 번호·권한·서버 오류) — 끝없는 로딩 대신 보여 준다. */
export function LoadFailed({ error }: { error: unknown }) {
  const router = useRouter();
  const res = (error as { response?: { status?: number; data?: { detail?: string } } })?.response;
  const status = res?.status;
  const title = status === 404 ? "찾을 수 없는 항목입니다" : status === 403 ? "볼 수 있는 권한이 없습니다" : "불러오지 못했습니다";
  const detail = status === 404 ? "삭제되었거나 번호가 잘못되었을 수 있습니다." : res?.data?.detail || "잠시 후 다시 시도해 주세요.";
  return (
    <Card className="mx-auto mt-8 max-w-md rounded-2xl">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-base font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="rounded-xl" onClick={() => router.back()}><ArrowLeft className="mr-1 h-4 w-4" /> 뒤로</Button>
          {status !== 404 && status !== 403 && (
            <Button variant="outline" className="rounded-xl" onClick={() => window.location.reload()}><RotateCw className="mr-1 h-4 w-4" /> 다시 시도</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
