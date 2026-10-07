"use client";

import { useEffect, useState } from "react";
import { useNavigationStore } from "@/store/navigation-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Server, CheckCircle, XCircle, AlertCircle, Clock, ChevronDown, ChevronUp, BarChart3 } from "lucide-react";

interface SiteStatus {
  site_id: number;
  site_name: string;
  url: string;
  status: "ok" | "down" | "unknown";
  response_ms: number | null;
  last_checked: string | null;
  error_count_today: number;
  metrics: Record<string, number> | null;
  traffic_available?: boolean;
}

type TrafficPeriod = "24h" | "7d" | "30d";

interface TrafficBucket {
  label: string;
  start: string;
  unique_ips: number;
  bytes: number;
}

interface SiteTraffic {
  site_id: number;
  site_name: string;
  period: TrafficPeriod;
  available: boolean;
  message?: string;
  total?: { unique_ips: number; bytes: number };
  buckets?: TrafficBucket[];
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

async function fetchSiteTraffic(siteId: number, period: TrafficPeriod): Promise<SiteTraffic> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_HUB_API_URL}/api/sites/${siteId}/traffic?period=${period}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error("fetch traffic failed");
  return res.json();
}

function formatBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${n}B`;
}

function TrafficBars({
  buckets, value, format, color,
}: {
  buckets: TrafficBucket[];
  value: (b: TrafficBucket) => number;
  format: (n: number) => string;
  color: string;
}) {
  const max = Math.max(...buckets.map(value), 1);
  // 라벨이 겹치지 않게 일부만 표시 (24시간: 6칸마다, 30일: 5칸마다)
  const step = buckets.length > 12 ? Math.ceil(buckets.length / 6) : 1;
  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {buckets.map((b) => (
          <div
            key={b.start}
            className={`flex-1 rounded-t-sm ${color}`}
            style={{ height: `${Math.max((value(b) / max) * 100, value(b) > 0 ? 3 : 1)}%` }}
            title={`${b.label} · ${format(value(b))}`}
          />
        ))}
      </div>
      <div className="flex gap-[2px] mt-1">
        {buckets.map((b, i) => (
          <span key={b.start} className="flex-1 text-[9px] text-muted-foreground text-center whitespace-nowrap overflow-visible">
            {i % step === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function TrafficDialog({
  site, onClose,
}: {
  site: SiteStatus | null;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<TrafficPeriod>("24h");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["site-traffic", site?.site_id, period],
    queryFn: () => fetchSiteTraffic(site!.site_id, period),
    enabled: !!site,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Dialog open={!!site} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{site?.site_name} 트래픽</DialogTitle>
          <DialogDescription className="text-xs truncate">{site?.url}</DialogDescription>
        </DialogHeader>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as TrafficPeriod)}>
          <TabsList className="w-full">
            <TabsTrigger value="24h" className="flex-1">24시간</TabsTrigger>
            <TabsTrigger value="7d" className="flex-1">7일</TabsTrigger>
            <TabsTrigger value="30d" className="flex-1">30일</TabsTrigger>
          </TabsList>
        </Tabs>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : isError || !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">트래픽 데이터를 불러오지 못했습니다.</p>
        ) : !data.available || !data.total || !data.buckets ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{data.message || "트래픽 데이터가 없습니다."}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold">{data.total.unique_ips.toLocaleString("ko-KR")}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">방문자 (고유 IP)</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-xl font-bold">{formatBytes(data.total.bytes)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">전송량</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-2">방문자 추이</p>
              <TrafficBars
                buckets={data.buckets}
                value={(b) => b.unique_ips}
                format={(n) => `${n.toLocaleString("ko-KR")}명`}
                color="bg-gradient-to-t from-[#667eea] to-[#764ba2]"
              />
            </div>
            <div>
              <p className="text-xs font-medium mb-2">전송량 추이</p>
              <TrafficBars
                buckets={data.buckets}
                value={(b) => b.bytes}
                format={formatBytes}
                color="bg-gradient-to-t from-emerald-500 to-teal-400"
              />
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              방문자는 접속한 고유 IP 수로, 검색엔진 봇 등 자동 접속이 포함됩니다.
              기간 방문자는 기간 전체 기준이라 막대 합계와 다를 수 있습니다.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
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
    return <div className="px-4 pb-4 text-xs text-muted-foreground">최근 24시간 서버 오류(5xx) 없음</div>;

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
  const [trafficSite, setTrafficSite] = useState<SiteStatus | null>(null);

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
                  {site.traffic_available && (
                    <button
                      onClick={() => setTrafficSite(site)}
                      className="flex items-center gap-1 text-[10px] text-primary"
                    >
                      <BarChart3 className="h-3 w-3" />
                      트래픽
                    </button>
                  )}
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

      <TrafficDialog site={trafficSite} onClose={() => setTrafficSite(null)} />
    </div>
  );
}
