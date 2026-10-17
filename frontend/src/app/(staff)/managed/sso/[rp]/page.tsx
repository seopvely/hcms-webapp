"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageTransition } from "@/components/layout/page-transition";
import { useNavigationStore } from "@/store/navigation-store";
import staffApi from "@/lib/staff-api";
import { CMS_BASE } from "@/components/managed/staff-nav";

const RP_LABELS: Record<string, string> = {
  createsite: "CreateSite 콘솔",
  wealthreach: "WealthReach 관리자",
  searching: "Searching",
};

type ApiError = { response?: { status?: number; data?: { detail?: string } } };

// SSO 티켓을 받아 수신측 콜백(#ticket=...)으로 이동한다. 티켓은 120초짜리 1회용.
export default function StaffSsoPage() {
  const { rp } = useParams<{ rp: string }>();
  const setPageTitle = useNavigationStore((state) => state.setPageTitle);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    setPageTitle(RP_LABELS[rp] || "SSO");
    if (started.current) return;
    started.current = true;
    staffApi
      .post<{ redirect_url: string }>(`/managed/sso/${rp}`)
      .then((res) => window.location.replace(res.data.redirect_url))
      .catch((err: ApiError) => setError(err.response?.data?.detail || "SSO 이동에 실패했습니다."));
  }, [rp, setPageTitle]);

  return (
    <PageTransition>
      <Card className="mx-auto max-w-lg rounded-2xl">
        <CardContent className="space-y-3 pt-6 pb-6 text-center text-sm">
          {error ? (
            <>
              <p className="font-semibold text-red-600">{error}</p>
              <a
                href={`${CMS_BASE}/api/sso/${rp}`}
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                cms 에서 열기 <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {RP_LABELS[rp] || rp} 로 이동 중...
            </p>
          )}
        </CardContent>
      </Card>
    </PageTransition>
  );
}
