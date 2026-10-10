"use client";
import { useState } from "react";
import { UserCog } from "lucide-react";
import { clearImpersonation, getImpersonationInfo } from "@/lib/auth-token";

// 직원이 고객 화면을 대리 로그인으로 보고 있을 때 상단에 항상 표시한다.
export function ImpersonationBanner() {
  const [info] = useState(getImpersonationInfo);
  if (!info) return null;

  const end = () => {
    clearImpersonation();
    window.close();
    // 스크립트로 연 탭이 아니면 닫히지 않으므로 직원 화면으로 돌아간다
    window.location.href = "/managed/customers";
  };

  const until = new Date(info.expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm text-white">
      <span className="flex items-center gap-2">
        <UserCog className="h-4 w-4 shrink-0" />
        대리 로그인 중 — {info.staffName} (~{until})
      </span>
      <button onClick={end} className="rounded-lg bg-white/20 px-3 py-1 font-medium hover:bg-white/30">
        종료
      </button>
    </div>
  );
}
