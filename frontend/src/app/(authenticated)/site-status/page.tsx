"use client";

import { useEffect, useState } from "react";
import { useNavigationStore } from "@/store/navigation-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Server, CheckCircle, XCircle, AlertCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";

interface SiteStatus {
  site_id: number;
  site_name: string;
  url: string;
  status: "ok" | "down" | "unknown";
  response_ms: number | null;
  last_checked: string | null;
  error_count_today: number;
  metrics: Record<string, number> | null;
}

interface ErrorLog {
  time: string;
  message: string;
}

interface SiteErrors {
  site_id: number;
  site_name: string;
  url: string;
  errors: ErrorLog[];
  count: number;
}

function getToken() {
  if (typeof localStorage !== "undefined") return localStorage.getItem("access_token") || "";
  return "";
}

async function fetchSiteStatus(): Promise<SiteStatus[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_HUB_API_URL}/api/sites/status`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("fetch failed");
  return res.json();
}

async function fetchSiteErrors(siteId: number): Promise<SiteErrors> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_HUB_API_URL}/api/sites/${siteId}/errors?limit=10`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("fetch errors failed");
  return res.json();
}

function StatusIcon({ status }: { status: SiteStatus["status"] }) {
  if (status === "ok") return <CheckCircle className="h-5 w-5 text-emerald-500" />;
  if (status === "down") return <XCircle className="h-5 w-5 text-red-500" />;
  return <AlertCircle className="h-5 w-5 text-amber-500" />;
}

function ErrorPanel({ siteId, siteName }: { siteId: number; siteName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["site-errors", siteId],
    queryFn: () => fetchSiteErrors(siteId),
    staleTime: 30000,
  });

  if (isLoading) return <div className="px-4 pb-4 text-xs text-muted-foreground">로딩 중...</div>;
  if (!data || data.errors.length === 0)
    return <div className="px-4 pb-4 text-xs text-muted-foreground">최근 24시간 에러 없음</div>;

  return (
    <div className="px-4 pb-4 space-y-2">
      {data.errors.map((err, i) => (
        <div key={i} className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground mb-1">
            {new Date(err.time + "Z").toLocaleTimeString("ko-KR")}
          </p>
          <p className="text-xs font-mono break-all leading-relaxed">{err.message}</p>
        </div>
      ))}
    </div>
  );
}

export default function SiteStatusPage() {
  const { setPageTitle } = useNavigationStore();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => { setPageTitle("사이트 현황"); }, [setPageTitle]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["site-status"],
    queryFn: fetchSiteStatus,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Server className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">사이트 현황을 불러올 수 없습니다.</p>
        <p className="text-xs mt-1">Hub API 서비스 준비 중입니다.</p>
      </div>
    );
  }

  const okCount = data.filter((s) => s.status === "ok").length;
  const downCount = data.filter((s) => s.status === "down").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center p-4">
            <p className="text-2xl font-bold text-emerald-500">{okCount}</p>
            <p className="text-xs text-muted-foreground mt-1">정상</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center p-4">
            <p className="text-2xl font-bold text-red-500">{downCount}</p>
            <p className="text-xs text-muted-foreground mt-1">다운</p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center p-4">
            <p className="text-2xl font-bold">{data.length}</p>
            <p className="text-xs text-muted-foreground mt-1">전체</p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-0">
          {data.map((site, idx) => (
            <div key={site.site_id} className={idx < data.length - 1 ? "border-b" : ""}>
              <div className="flex items-center gap-3 p-4">
                <StatusIcon status={site.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{site.site_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{site.url}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {site.response_ms !== null && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {site.response_ms}ms
                    </span>
                  )}
                  {site.error_count_today > 0 ? (
                    <button
                      onClick={() => setExpandedId(expandedId === site.site_id ? null : site.site_id)}
                      className="flex items-center gap-1"
                    >
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        오류 {site.error_count_today}건
                      </Badge>
                      {expandedId === site.site_id
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
                    </button>
                  ) : (
                    <span className="text-[10px] text-emerald-500">정상</span>
                  )}
                </div>
              </div>
              {expandedId === site.site_id && (
                <ErrorPanel siteId={site.site_id} siteName={site.site_name} />
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
