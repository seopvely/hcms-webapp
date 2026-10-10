"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageSpinner } from "@/components/common/page-spinner";
import { IMPERSONATION_TOKEN_KEY } from "@/lib/auth-token";

// 직원 대리 로그인 진입점. /impersonate#token=... 으로 열리면 토큰을 이 탭의 sessionStorage 에만 두고
// 주소창에서 토큰을 지운 뒤 고객 대시보드로 이동한다.
export default function ImpersonatePage() {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    window.history.replaceState(null, "", "/impersonate");
    if (!token) {
      router.replace("/managed/customers");
      return;
    }
    sessionStorage.setItem(IMPERSONATION_TOKEN_KEY, token);
    router.replace("/dashboard");
  }, [router]);

  return <PageSpinner />;
}
