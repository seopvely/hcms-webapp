"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { fmtDateTime } from "@/components/managed/field";
import { cn } from "@/lib/utils";
import { useStaffGet } from "@/lib/staff-ops";

export type SalesActivityItem = {
  lead: { seq: number; title: string | null; status_label: string | null };
  projects: { seq: number; title: string | null }[];
  activities: { id: number; type: string; type_label: string; content: string | null; created_by: string | null; created_at: string | null }[];
};

const PAGE = 10;

export function useCompanySalesActivities(companyId: number | null | undefined) {
  return useStaffGet<{ items: SalesActivityItem[] }>(["sales", "company-activities", companyId], companyId ? `/sales/company/${companyId}/activities` : null);
}

// 업체 프로젝트에 연결된 영업접수 활동 이력(읽기 전용) — 요청 상세 하단 탭(SPEC 02 §2.5). 유형 칩으로 거른다.
// bare: 탭 안에 넣을 때 — 카드·제목 없이, 비어 있어도 안내를 보여 준다.
export function SalesActivityPanel({ companyId, bare = false }: { companyId: number | null | undefined; bare?: boolean }) {
  const { data } = useCompanySalesActivities(companyId);
  const [type, setType] = useState("");
  const [shown, setShown] = useState<Record<number, number>>({});
  if (!data?.items.length) return bare ? <p className="py-2 text-xs text-muted-foreground">{data ? "이 업체 프로젝트에 연결된 영업접수가 없습니다." : companyId ? "불러오는 중…" : "업체 정보가 없습니다."}</p> : null;
  // 유형별 개수(모든 영업접수 합산, 많은 순)
  const counts = new Map<string, { label: string; n: number }>();
  data.items.forEach((it) => it.activities.forEach((a) => {
    const c = counts.get(a.type) ?? { label: a.type_label, n: 0 };
    c.n += 1;
    counts.set(a.type, c);
  }));
  const types = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const total = types.reduce((s, [, c]) => s + c.n, 0);
  const chip = (val: string, label: string, n: number) => (
    <button key={val || "all"} type="button" onClick={() => setType(val)}
      className={cn("rounded-full border px-2.5 py-1 text-xs", type === val ? "border-slate-900 bg-slate-900 text-white" : "text-muted-foreground hover:bg-muted")}>
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );
  const body = (
      <>
        {types.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {chip("", "전체", total)}
            {types.map(([val, c]) => chip(val, c.label, c.n))}
          </div>
        )}
        {data.items.map((it) => {
          const acts = type ? it.activities.filter((a) => a.type === type) : it.activities;
          const limit = shown[it.lead.seq] ?? PAGE;
          return (
          <div key={it.lead.seq} className="space-y-1">
            <p className="text-xs text-muted-foreground">
              <Link href={`/managed/sales/${it.lead.seq}`} className="font-medium text-foreground hover:underline">{it.lead.title || `영업접수 #${it.lead.seq}`}</Link>
              {it.lead.status_label && ` · ${it.lead.status_label}`} · {it.projects.map((p) => p.title).join(", ")}
            </p>
            {acts.length === 0 ? (
              <p className="text-xs text-muted-foreground">{type ? "이 유형의 활동 없음" : "활동 이력 없음"}</p>
            ) : (
              <ul className="space-y-1">
                {acts.slice(0, limit).map((a) => (
                  <li key={a.id} className="min-w-0 rounded-lg bg-muted/40 px-3 py-1.5 text-xs">
                    <span className="font-medium">{a.type_label}</span>
                    <span className="ml-2 text-muted-foreground">{fmtDateTime(a.created_at)}{a.created_by ? ` · ${a.created_by}` : ""}</span>
                    {a.content && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">{a.content}</p>}
                  </li>
                ))}
                {acts.length > limit && (
                  <li>
                    <button type="button" className="w-full rounded-lg py-1 text-xs text-muted-foreground hover:bg-muted"
                      onClick={() => setShown((s) => ({ ...s, [it.lead.seq]: limit + PAGE * 2 }))}>
                      더 보기 ({acts.length - limit}건 남음)
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
          );
        })}
      </>
  );
  if (bare) return <div className="min-w-0 space-y-3 text-sm">{body}</div>;
  return (
    <Card className="min-w-0 rounded-2xl">
      <CardContent className="min-w-0 space-y-3 pt-5 pb-5 text-sm">
        <h2 className="font-semibold">영업 활동</h2>
        {body}
      </CardContent>
    </Card>
  );
}
