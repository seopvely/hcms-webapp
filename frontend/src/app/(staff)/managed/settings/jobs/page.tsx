"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { PageTransition } from "@/components/layout/page-transition";
import { fmtDateTime } from "@/components/managed/field";
import { useNavigationStore } from "@/store/navigation-store";
import { useStaffGet } from "@/lib/staff-ops";

type Run = { started_at: string; status: string; dry_run: boolean; summary: string; error: string };
type Data = { items: { job: string; enabled: boolean; schedule: string; runs: Run[] }[]; write_areas: string[]; staff_base_url: string };

// 이관 상태 — 쓰기 영역·배치 job 켜짐 여부와 최근 실행(관리자). 바꾸는 방법은 docs/managed-cutover.md.
export default function JobsPage() {
  const setPageTitle = useNavigationStore((s) => s.setPageTitle);
  const { data, isLoading } = useStaffGet<Data>(["jobs"], "/jobs");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    setPageTitle("이관 상태·배치");
  }, [setPageTitle]);
  if (isLoading || !data) return <TableSkeleton />;
  return (
    <PageTransition>
      <div className="space-y-4">
        <Card className="rounded-2xl"><CardContent className="space-y-1 pt-4 pb-4 text-sm">
          <p>쓰기 영역: {data.write_areas.length ? data.write_areas.join(", ") : <span className="text-muted-foreground">없음(전부 읽기 전용 — cms 에서 처리)</span>}</p>
          <p>직원 링크 기준 주소: {data.staff_base_url}</p>
        </CardContent></Card>
        <Card className="rounded-2xl"><CardContent className="divide-y p-0">
          {data.items.map((j) => (
            <div key={j.job} className="px-4 py-2 text-xs">
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === j.job ? null : j.job)}>
                <span className={`w-10 rounded-full px-2 py-0.5 text-center ${j.enabled ? "bg-blue-100 text-blue-700" : "bg-muted"}`}>{j.enabled ? "ON" : "off"}</span>
                <span className="w-56 font-mono">{j.job}</span>
                <span className="w-28 text-muted-foreground">{j.schedule}</span>
                <span className="flex-1 truncate">{j.runs[0] ? `${fmtDateTime(j.runs[0].started_at)} ${j.runs[0].status}${j.runs[0].dry_run ? " (dry-run)" : ""}` : "실행 기록 없음"}</span>
              </button>
              {open === j.job && j.runs.map((r, i) => (
                <pre key={i} className={`mt-1 whitespace-pre-wrap rounded-lg p-2 ${r.status === "failed" ? "bg-red-50" : "bg-muted/40"}`}>{fmtDateTime(r.started_at)} {r.status}{r.dry_run ? " (dry-run)" : ""}{"\n"}{r.summary}{r.error ? `\n${r.error}` : ""}</pre>
              ))}
            </div>
          ))}
        </CardContent></Card>
      </div>
    </PageTransition>
  );
}
